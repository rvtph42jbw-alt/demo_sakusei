import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { chromium } from "playwright";
import { createApp } from "../server/app.js";
import { hashPassword } from "../server/auth.js";
import { routes } from "../src/routes.js";

const dataDir = mkdtempSync(join(tmpdir(), "machi-browser-"));
const artifacts = resolve(
  process.env.ARTIFACT_DIR || "/tmp/machi-browser-artifacts",
);
mkdirSync(artifacts, { recursive: true });
const password = randomBytes(24).toString("hex");
writeFileSync(
  join(dataDir, "admin.json"),
  JSON.stringify(hashPassword(password)),
  { mode: 0o600 },
);
const instance = createApp({ dataDir, secureCookie: false });
const server = instance.app.listen(0, "127.0.0.1");
await once(server, "listening");
const base = "http://127.0.0.1:" + server.address().port;
let browser;
const results = [];
const errors = [];
try {
  browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {}),
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  // Exercise the documented offline basemap fallback, without fetching bulk map tiles.
  await context.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  const call = async (path, method = "GET", body, cookie) => {
    const res = await fetch(base + "/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Safety-Request": "1",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return res;
  };
  const login = await call("/login", "POST", { password });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const testRecord = {
    name: "検証専用の交差点",
    category: "交通",
    severity: "高",
    status: "未対応",
    note: "一時データで画面と保存を検証します。",
    lat: 35.686,
    lng: 139.765,
  };
  const created = await call("/places", "POST", testRecord, cookie);
  assert.equal(created.status, 201);
  const record = await created.json();
  await page.goto(base, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "まちを知る。" }).count();
  await page.screenshot({ path: join(artifacts, "home-desktop.png") });
  assert.equal(routes.length, 60);
  assert.equal(new Set(routes.map((r) => r.path)).size, 60);
  // Every route is reached by clicking its actual link from the screen directory.
  for (const r of routes) {
    await page.goto(base + "/#/sitemap");
    await page.locator(`.sitemap-group a[href="#/${r.path}"]`).click();
    await page.waitForFunction(
      (path) => (location.hash.replace(/^#\/?/, "") || "map") === path,
      r.path,
    );
    if (r.path === "map")
      await page
        .locator("#panel-title")
        .filter({ hasText: "まちを知る。" })
        .waitFor();
    else
      await page.locator("#panel-title").filter({ hasText: r.title }).waitFor();
    assert.equal(
      await page.locator(".panel-body").count(),
      r.path === "map" ? 0 : 1,
    );
    assert.equal(
      await page.locator("body").evaluate((el) => el.scrollWidth > innerWidth),
      false,
      "horizontal overflow: " + r.path,
    );
    assert.ok(
      (await page.locator("#panel-content").innerText()).length > 30,
      r.path,
    );
    results.push({ screen: r.path, result: "passed" });
  }
  console.log("PASS: all 60 screens reached through real sitemap links");
  // Search, filtering, browser back/forward and saved searches.
  await page.goto(base + "/#/search");
  await page.getByRole("searchbox").fill("交差点");
  await page.locator("#search-form").getByRole("button").click();
  await page
    .locator(".place-card h3")
    .filter({ hasText: testRecord.name })
    .waitFor();
  await page.getByRole("button", { name: "この検索を保存" }).click();
  await page.goto(base + "/#/search/filters");
  await page.locator('[name="severity"]').selectOption("低");
  await page.getByRole("button", { name: "条件を適用" }).click();
  await page
    .getByRole("heading", { name: "登録情報はまだありません" })
    .waitFor();
  await page.goBack();
  await page
    .locator("#panel-title")
    .filter({ hasText: "条件を絞り込む" })
    .waitFor();
  await page.goForward();
  await page.locator("#panel-title").filter({ hasText: "検索結果" }).waitFor();
  await page.goto(base + "/#/search/saved");
  await page.locator('[data-action="saved-search"]').click();
  await page
    .locator(".place-card h3")
    .filter({ hasText: testRecord.name })
    .waitFor();
  console.log(
    "PASS: keyword search, filters, saved search and browser history",
  );
  // Distinct place detail screens carry their record context in the URL.
  await page.locator(".place-card-link").first().click();
  for (const path of [
    "places/detail",
    "places/location",
    "places/updates",
    "places/share",
    "places/caution",
  ]) {
    await page
      .locator(`.detail-tabs a[href="#/${path}?id=${record.id}"]`)
      .click();
    await page
      .locator(".selected-place h2")
      .filter({ hasText: testRecord.name })
      .waitFor();
  }
  await page.locator(".detail-tabs a").first().click();
  await page
    .getByRole("button", { name: "お気に入りに保存", exact: true })
    .click();
  await page.goto(base + "/#/favorites/places");
  await page
    .locator(".place-card h3")
    .filter({ hasText: testRecord.name })
    .waitFor();
  await page.reload();
  await page
    .locator(".place-card h3")
    .filter({ hasText: testRecord.name })
    .waitFor();
  await page.goto(base + "/#/favorites/collections");
  await page.locator("#collection-form input").fill("検証用の通学路");
  await page.getByRole("button", { name: "コレクションを作る" }).click();
  await page.getByRole("checkbox", { name: testRecord.name }).check();
  await page.reload();
  await page.getByRole("checkbox", { name: testRecord.name }).waitFor();
  assert.equal(
    await page.getByRole("checkbox", { name: testRecord.name }).isChecked(),
    true,
  );
  await page.goto(base + "/#/favorites/areas");
  await page.locator("#area-form input").fill("検証用エリア");
  await page.getByRole("button", { name: "表示中のエリアを保存" }).click();
  await page.locator('[data-action="open-area"]').click();
  console.log(
    "PASS: 5 contextual details, favorite persistence, collections and saved map areas",
  );
  await page.goto(base + "/#/evacuation/checklist");
  await page.getByRole("checkbox", { name: "飲料水・非常食" }).check();
  await page.reload();
  assert.equal(
    await page.getByRole("checkbox", { name: "飲料水・非常食" }).isChecked(),
    true,
  );
  await page.goto(base + "/#/evacuation/shelter-detail");
  await page.locator('[name="name"]').fill("家族の集合場所（検証用）");
  await page.locator('[name="note"]').fill("一時的な端末保存のテスト");
  await page.getByRole("button", { name: "端末にメモを保存" }).click();
  await page.reload();
  assert.equal(
    await page.locator('[name="name"]').inputValue(),
    "家族の集合場所（検証用）",
  );
  await page.goto(base + "/#/settings/display");
  await page.getByRole("checkbox", { name: "文字を大きく" }).check();
  await page.reload();
  assert.equal(
    await page
      .locator("html")
      .evaluate((el) => el.classList.contains("large-text")),
    true,
  );
  await page.getByRole("checkbox", { name: "文字を大きく" }).uncheck();
  console.log(
    "PASS: disaster checklist, personal evacuation memo and display preferences persist",
  );
  // Public reporting wizard: real submission to the temporary SQLite database.
  await page.goto(base + "/#/report");
  await page.getByRole("link", { name: "通報をはじめる" }).click();
  await page.locator("#map").click({ position: { x: 950, y: 350 } });
  assert.notEqual(
    await page.locator('[name="lat"]').inputValue(),
    "",
    "map click must choose report coordinates",
  );
  await page.locator('[name="lat"]').fill("35.685");
  await page.locator('[name="lng"]').fill("139.769");
  await page.getByRole("button", { name: "種類の選択へ" }).click();
  await page.locator('input[name="category"][value="設備"]').check();
  await page.getByRole("button", { name: "詳細の入力へ" }).click();
  await page.locator('[name="name"]').fill("検証専用の街灯");
  await page
    .locator('[name="note"]')
    .fill("一時データを使い通報から公開まで検証します。");
  await page.getByRole("button", { name: "内容の確認へ" }).click();
  await page.getByRole("button", { name: "この内容で通報する" }).click();
  await page
    .locator("#panel-title")
    .filter({ hasText: "通報の受付結果" })
    .waitFor();
  await page.getByRole("link", { name: "確認状況をみる" }).click();
  await page
    .locator(".status-result .pill")
    .filter({ hasText: "確認待ち" })
    .waitFor();
  assert.equal(
    (await (await call("/places")).json()).length,
    1,
    "pending report must not be publicly visible",
  );
  const reportPageUrl = page.url();
  // Existing administrator UI and new moderation, using a separate browser context.
  const adminContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  await adminContext.route("https://tile.openstreetmap.org/**", (r) =>
    r.abort(),
  );
  const adminPage = await adminContext.newPage();
  adminPage.on("pageerror", (e) => errors.push(e.message));
  adminPage.on("dialog", (dialog) => dialog.accept());
  await adminPage.goto(base + "/admin.html");
  await adminPage.locator("#account").click();
  await adminPage.locator('#login-form [name="password"]').fill(password);
  await adminPage.locator('#login-form button[type="submit"]').click();
  await adminPage
    .locator("#account-state")
    .filter({ hasText: "管理者モード" })
    .waitFor();
  await adminPage.locator("#reports").click();
  await adminPage
    .locator("#reports-list .card")
    .filter({ hasText: "検証専用の街灯" })
    .getByRole("button", { name: "確認して地図に公開" })
    .click();
  await adminPage
    .locator("#reports-list .card")
    .filter({ hasText: "検証専用の街灯" })
    .getByText("公開済み", { exact: false })
    .waitFor();
  await adminPage.locator("#reports-close").click();
  await adminPage
    .locator("#list .card")
    .filter({ hasText: "検証専用の街灯" })
    .waitFor();
  await page.goto(reportPageUrl);
  await page.reload();
  await page
    .locator(".status-result .pill")
    .filter({ hasText: "公開済み" })
    .waitFor();
  await page.getByRole("link", { name: "公開された場所へ" }).click();
  await page
    .locator(".selected-place h2")
    .filter({ hasText: "検証専用の街灯" })
    .waitFor();
  console.log(
    "PASS: report wizard → private receipt → administrator moderation → published place",
  );
  // Verify original administrator editing, status updates, audit, export, deletion, logout.
  const original = adminPage
    .locator("#list .card")
    .filter({ hasText: testRecord.name });
  await original.getByRole("button", { name: "編集", exact: true }).click();
  await adminPage.locator('#form [name="note"]').fill("管理者の編集を確認");
  await adminPage.locator('#form button[type="submit"]').click();
  await adminPage
    .locator("#list .card")
    .filter({ hasText: "管理者の編集を確認" })
    .waitFor();
  await adminPage
    .locator("#list .card")
    .filter({ hasText: testRecord.name })
    .getByRole("combobox")
    .selectOption("対応済");
  await adminPage.waitForFunction(
    (name) =>
      [...document.querySelectorAll("#list .card")].some(
        (c) =>
          c.textContent.includes(name) &&
          c.querySelector("select")?.value === "対応済",
      ),
    testRecord.name,
  );
  await adminPage.locator("#history").click();
  await adminPage
    .locator("#history-list")
    .getByText("更新", { exact: false })
    .first()
    .waitFor();
  await adminPage.locator("#history-close").click();
  const downloadPromise = adminPage.waitForEvent("download");
  await adminPage.locator("#export").click();
  assert.equal(
    (await downloadPromise).suggestedFilename(),
    "community-safety.json",
  );
  await adminPage
    .locator("#list .card")
    .filter({ hasText: testRecord.name })
    .getByRole("button", { name: "削除", exact: true })
    .click();
  await adminPage.waitForFunction(
    (name) =>
      ![...document.querySelectorAll("#list .card")].some((c) =>
        c.textContent.includes(name),
      ),
    testRecord.name,
  );
  await adminPage.locator("#account").click();
  await adminPage
    .locator("#account-state")
    .filter({ hasText: "閲覧モード" })
    .waitFor();
  await adminContext.close();
  console.log(
    "PASS: existing administrator login, edit, status, audit, JSON export, delete and logout",
  );
  // Mobile navigation, overflow and all 60 targets use the same actual links.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/#/map");
  await page.screenshot({ path: join(artifacts, "home-mobile.png") });
  for (const r of routes) {
    await page.goto(base + "/#/sitemap");
    await page.locator(`.sitemap-group a[href="#/${r.path}"]`).click();
    await page.waitForFunction(
      (path) => (location.hash.replace(/^#\/?/, "") || "map") === path,
      r.path,
    );
    assert.equal(
      await page.locator("body").evaluate((el) => el.scrollWidth > innerWidth),
      false,
      "mobile overflow " + r.path,
    );
  }
  await page.goto(base + "/#/map");
  await page
    .getByRole("navigation", { name: "メインナビゲーション" })
    .getByRole("link", { name: "検索", exact: true })
    .click();
  await page
    .locator("#panel-title")
    .filter({ hasText: "場所を探す" })
    .waitFor();
  assert.deepEqual(errors, [], "uncaught browser errors");
  console.log(
    "PASS: mobile 60-screen navigation, main navigation, no horizontal overflow or JavaScript exceptions",
  );
  writeFileSync(
    join(artifacts, "results.json"),
    JSON.stringify(
      {
        screens: results,
        uncaughtErrors: errors,
        completedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log("Artifacts: " + artifacts);
} catch (error) {
  if (browser) {
    const pages = browser.contexts().flatMap((c) => c.pages());
    for (let i = 0; i < pages.length; i++)
      await pages[i]
        .screenshot({ path: join(artifacts, `failure-${i}.png`) })
        .catch(() => {});
  }
  throw error;
} finally {
  if (browser) await browser.close();
  await new Promise((r) => server.close(r));
  instance.close();
  rmSync(dataDir, { recursive: true, force: true });
}
