import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { createApp } from "../server/app.js";
import { hashPassword } from "../server/auth.js";

test("private reports persist, require receipt tokens, and only administrators can publish or dismiss once", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "machi-reports-"));
  const password = randomBytes(24).toString("hex");
  writeFileSync(
    join(dataDir, "admin.json"),
    JSON.stringify(hashPassword(password)),
    { mode: 0o600 },
  );
  let instance, server, base;
  async function start() {
    instance = createApp({ dataDir, secureCookie: false });
    server = instance.app.listen(0, "127.0.0.1");
    await once(server, "listening");
    base = "http://127.0.0.1:" + server.address().port;
  }
  async function stop() {
    await new Promise((r) => server.close(r));
    instance.close();
  }
  const request = (path, method = "GET", body, headers = {}) =>
    fetch(base + "/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Safety-Request": "1",
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const payload = {
    name: "テスト専用の交差点",
    category: "交通",
    severity: "中",
    note: "テスト用通報。公開データには残りません。",
    lat: 35.68,
    lng: 139.76,
  };
  try {
    await start();
    assert.equal(
      (await request("/reports", "POST", { ...payload, lat: 91 })).status,
      400,
    );
    assert.equal(
      (await request("/reports", "POST", { ...payload, note: " " })).status,
      400,
    );
    assert.equal(
      (await request("/reports", "POST", payload, { "X-Safety-Request": "" }))
        .status,
      403,
    );
    assert.equal(
      (
        await request("/reports", "POST", payload, {
          Origin: "https://evil.example",
        })
      ).status,
      403,
    );
    const response = await request("/reports", "POST", payload);
    assert.equal(response.status, 201);
    const receipt = await response.json();
    assert.equal(receipt.status, "pending");
    assert.match(receipt.token, /^[a-f0-9]{64}$/);
    assert.equal((await request("/reports")).status, 401);
    assert.equal((await request("/reports/" + receipt.id)).status, 404);
    assert.equal(
      (
        await request("/reports/" + receipt.id, "GET", null, {
          "X-Report-Token": "a".repeat(64),
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await request("/reports/" + receipt.id, "PATCH", {
          status: "published",
        })
      ).status,
      401,
    );
    assert.deepEqual(await (await request("/places")).json(), []);
    const db = new DatabaseSync(join(dataDir, "safety.sqlite"));
    const stored = db
      .prepare("SELECT tokenHash FROM reports WHERE id=?")
      .get(receipt.id);
    assert.notEqual(stored.tokenHash, receipt.token);
    db.close();
    await stop();
    await start();
    let report = await (
      await request("/reports/" + receipt.id, "GET", null, {
        "X-Report-Token": receipt.token,
      })
    ).json();
    assert.equal(report.name, payload.name);
    assert.equal(report.status, "pending");
    assert.ok(!("tokenHash" in report));
    const login = await request("/login", "POST", { password });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const admin = { Cookie: cookie };
    const list = await (await request("/reports", "GET", null, admin)).json();
    assert.equal(list.length, 1);
    assert.ok(!("tokenHash" in list[0]));
    assert.equal(
      (
        await request(
          "/reports/" + receipt.id,
          "PATCH",
          { status: "pending" },
          admin,
        )
      ).status,
      400,
    );
    const publish = await request(
      "/reports/" + receipt.id,
      "PATCH",
      { status: "published" },
      admin,
    );
    assert.equal(publish.status, 200);
    report = await publish.json();
    assert.equal(report.status, "published");
    assert.ok(report.placeId);
    const places = await (await request("/places")).json();
    assert.equal(places.length, 1);
    assert.equal(places[0].name, payload.name);
    assert.equal(places[0].status, "未対応");
    assert.equal(
      (
        await request(
          "/reports/" + receipt.id,
          "PATCH",
          { status: "published" },
          admin,
        )
      ).status,
      409,
    );
    const second = await (await request("/reports", "POST", payload)).json();
    const dismiss = await request(
      "/reports/" + second.id,
      "PATCH",
      { status: "dismissed" },
      admin,
    );
    assert.equal(dismiss.status, 200);
    assert.equal((await dismiss.json()).placeId, null);
    assert.equal((await (await request("/places")).json()).length, 1);
    const audit = await (await request("/audit", "GET", null, admin)).json();
    assert.ok(audit.some((a) => a.action === "report_publish"));
    assert.ok(audit.some((a) => a.action === "report_dismiss"));
    for (let i = 0; i < 4; i++)
      assert.equal((await request("/reports", "POST", payload)).status, 201);
    const limit = await request("/reports", "POST", payload);
    assert.equal(limit.status, 429);
    assert.ok(Number(limit.headers.get("retry-after")) > 0);
    await stop();
    await start();
    const restored = await (
      await request("/reports/" + receipt.id, "GET", null, {
        "X-Report-Token": receipt.token,
      })
    ).json();
    assert.equal(restored.status, "published");
    assert.equal((await (await request("/places")).json()).length, 1);
    const backupDir = join(dataDir, "backups");
    const backup = spawnSync(process.execPath, [resolve("scripts/backup.js")], {
      env: { ...process.env, DATA_DIR: dataDir, BACKUP_DIR: backupDir },
      encoding: "utf8",
    });
    assert.equal(backup.status, 0, backup.stderr);
    const snapshot = new DatabaseSync(
      join(backupDir, readdirSync(backupDir)[0], "safety.sqlite"),
    );
    assert.equal(
      snapshot.prepare("SELECT status FROM reports WHERE id=?").get(receipt.id)
        .status,
      "published",
    );
    assert.equal(
      snapshot.prepare("SELECT COUNT(*) AS n FROM sessions").get().n,
      0,
    );
    assert.equal(
      snapshot.prepare("PRAGMA integrity_check").get().integrity_check,
      "ok",
    );
    snapshot.close();
  } finally {
    if (server?.listening) await stop();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
