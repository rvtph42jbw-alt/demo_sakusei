import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { once } from "node:events";
import { chromium } from "playwright";
import { createApp } from "../server/app.js";
import { routes } from "../src/routes.js";

// Reproduce the downloaded ZIP's first launch: no administrator and no places.
const dataDir = mkdtempSync(join(tmpdir(), "machi-empty-navigation-"));
const artifacts = resolve(
  process.env.ARTIFACT_DIR || "/tmp/machi-browser-artifacts",
);
mkdirSync(artifacts, { recursive: true });
const instance = createApp({ dataDir, secureCookie: false });
const server = instance.app.listen(0, "127.0.0.1");
await once(server, "listening");
const base = "http://127.0.0.1:" + server.address().port;
let browser;
const failures = [];
const evidence = [];
try {
  browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {}),
    headless: true,
    args: ["--no-sandbox"],
  });
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({
      viewport,
      reducedMotion: "reduce",
    });
    await context.route("https://tile.openstreetmap.org/**", (r) => r.abort());
    const page = await context.newPage();
    page.on("pageerror", (e) => failures.push(e.message));
    await page.goto(base, { waitUntil: "networkidle" });
    await page
      .getByRole("link", { name: "60画面の一覧を開く", exact: true })
      .click();
    await page.locator(".directory-grid").waitFor();
    assert.equal(await page.locator(".sitemap-group a").count(), 60);
    await page.screenshot({
      path: join(
        artifacts,
        viewport.width === 390
          ? "directory-mobile.png"
          : "directory-desktop.png",
      ),
    });
    await page.getByRole("button", { name: "使い方・ご案内" }).click();
    assert.equal(
      await page.locator('[data-directory-group="7"]').getAttribute("open"),
      "",
    );
    const contentBodies = new Set();
    for (const r of routes) {
      await page.goto(base + "/#/sitemap");
      await page.locator(`.sitemap-group a[href="#/${r.path}"]`).click();
      await page.waitForFunction(
        (path) =>
          document.querySelector("#panel-content")?.dataset.screen === path,
        r.path,
      );
      if (r.path === "report/status")
        await page.locator("#report-status .empty-state").waitFor();
      const body = await page
        .locator(r.path === "map" ? ".home-content" : ".panel-body")
        .innerText();
      assert.ok(body.trim().length > 20, "empty screen: " + r.path);
      contentBodies.add(body);
      const next = await page.locator(".screen-next").getAttribute("href");
      const expected = routes[(routes.indexOf(r) + 1) % routes.length].path;
      assert.equal(next, "#/" + expected);
      assert.equal(
        await page
          .locator("body")
          .evaluate((el) => el.scrollWidth > innerWidth),
        false,
        "viewport overflow: " + r.path,
      );
      evidence.push({ width: viewport.width, path: r.path, result: "passed" });
    }
    assert.equal(
      contentBodies.size,
      60,
      "Every empty-data screen must have distinct purpose-specific content",
    );
    // Demonstrate an actual 60-screen journey without returning to the directory.
    await page.goto(base + "/#/map");
    for (let i = 0; i < 60; i++) {
      await page.waitForFunction(
        (path) =>
          document.querySelector("#panel-content")?.dataset.screen === path,
        routes[i].path,
      );
      await page.locator(".screen-next").click();
    }
    await page.waitForFunction(
      () => document.querySelector("#panel-content")?.dataset.screen === "map",
    );
    await page.reload();
    assert.equal(
      await page.locator("#panel-content").getAttribute("data-screen"),
      "map",
    );
    console.log(
      `PASS: ${viewport.width}px, first-launch empty data, visible directory → 60 distinct screens, next-page journey through all 60`,
    );
    await context.close();
  }
  assert.deepEqual(failures, []);
  assert.deepEqual(
    await (await fetch(base + "/api/places")).json(),
    [],
    "Navigation must not create fake hazard data",
  );
  writeFileSync(
    join(artifacts, "navigation-results.json"),
    JSON.stringify(
      {
        screens: evidence,
        uncaughtErrors: failures,
        completedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
} finally {
  if (browser) await browser.close();
  await new Promise((r) => server.close(r));
  instance.close();
  rmSync(dataDir, { recursive: true, force: true });
}
