import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { createApp } from "../server/app.js";
import { hashPassword } from "../server/auth.js";

test("shared records, authentication, validation, conflict protection, audit, restart and logout", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "safety-api-"));
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
    base = `http://127.0.0.1:${server.address().port}`;
  }
  async function stop() {
    await new Promise((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
    instance.close();
  }
  async function request(path, method = "GET", body, cookie, extra = {}) {
    return fetch(base + "/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Safety-Request": "1",
        ...(cookie ? { Cookie: cookie } : {}),
        ...extra,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }
  try {
    await start();
    assert.deepEqual(await (await request("/places")).json(), []);
    const payload = {
      name: "地域の交差点",
      category: "交通",
      severity: "高",
      status: "未対応",
      note: "見通しが悪い",
      lat: 35.68,
      lng: 139.76,
    };
    assert.equal((await request("/places", "POST", payload)).status, 401);
    assert.equal(
      (await request("/login", "POST", { password: "incorrect" })).status,
      401,
    );
    assert.equal(
      (
        await request("/login", "POST", { password }, undefined, {
          Origin: "https://evil.example",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(base + "/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        })
      ).status,
      403,
    );
    const login = await request("/login", "POST", { password });
    assert.equal(login.status, 200);
    assert.match(login.headers.get("set-cookie"), /HttpOnly/);
    assert.match(login.headers.get("set-cookie"), /SameSite=Strict/);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    assert.equal(
      (await request("/places", "POST", { ...payload, lat: 91 }, cookie))
        .status,
      400,
    );
    assert.equal(
      (await request("/places", "POST", { ...payload, name: " " }, cookie))
        .status,
      400,
    );
    const created = await request("/places", "POST", payload, cookie);
    assert.equal(created.status, 201);
    let record = await created.json();
    assert.equal(record.version, 1);
    assert.equal(
      (await (await request("/places")).json())[0].name,
      payload.name,
    );
    const update = await request(
      "/places/" + record.id,
      "PUT",
      { ...record, status: "確認中" },
      cookie,
    );
    assert.equal(update.status, 200);
    const latest = await update.json();
    assert.equal(latest.version, 2);
    assert.equal(
      (
        await request(
          "/places/" + record.id,
          "PUT",
          { ...record, name: "stale" },
          cookie,
        )
      ).status,
      409,
    );
    assert.equal(
      (await request("/places/" + record.id, "DELETE", { version: 1 }, cookie))
        .status,
      409,
    );
    assert.equal((await request("/audit")).status, 401);
    assert.equal(
      (await (await request("/audit", "GET", undefined, cookie)).json()).length,
      2,
    );
    await stop();
    await start();
    assert.equal((await (await request("/places")).json())[0].status, "確認中");
    assert.equal(
      (await request("/places/" + record.id, "DELETE", { version: 2 }, cookie))
        .status,
      200,
    );
    assert.equal((await (await request("/places")).json()).length, 0);
    assert.equal((await request("/logout", "POST", {}, cookie)).status, 200);
    assert.equal(
      (await request("/places", "POST", payload, cookie)).status,
      401,
    );
    for (let i = 0; i < 10; i++)
      assert.equal(
        (await request("/login", "POST", { password: "incorrect" })).status,
        401,
      );
    assert.equal((await request("/login", "POST", { password })).status, 429);
  } finally {
    if (server?.listening) await stop();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("production requires configured HTTPS origin and administrator", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "safety-config-"));
  try {
    assert.throws(
      () => createApp({ dataDir, secureCookie: true }),
      /PUBLIC_ORIGIN/,
    );
    assert.throws(
      () =>
        createApp({
          dataDir,
          secureCookie: true,
          publicOrigin: "http://example.org",
        }),
      /HTTPS/,
    );
    assert.throws(
      () =>
        createApp({
          dataDir,
          secureCookie: true,
          publicOrigin: "https://example.org/",
        }),
      /PUBLIC_ORIGIN/,
    );
    assert.throws(
      () =>
        createApp({
          dataDir,
          secureCookie: true,
          publicOrigin: "https://example.org",
        }),
      /管理者/,
    );
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});
