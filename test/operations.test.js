import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  mkdirSync,
  copyFileSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { createApp } from "../server/app.js";
import { verifyPassword } from "../server/auth.js";

test("administrator initialization, online backup, restoration and password rotation", () => {
  const root = mkdtempSync(join(tmpdir(), "safety-operations-"));
  const dataDir = join(root, "data"),
    backupDir = join(root, "backups");
  const password = randomBytes(24).toString("hex");
  function command(script, input, args = []) {
    const p = spawnSync(process.execPath, [resolve(script), ...args], {
      env: { ...process.env, DATA_DIR: dataDir, BACKUP_DIR: backupDir },
      input,
      encoding: "utf8",
    });
    assert.equal(p.status, 0, p.stderr);
    return p;
  }
  try {
    command("scripts/create-admin.js", password + "\n");
    const credential = JSON.parse(
      readFileSync(join(dataDir, "admin.json"), "utf8"),
    );
    assert.ok(verifyPassword(password, credential));
    assert.ok(
      !readFileSync(join(dataDir, "admin.json"), "utf8").includes(password),
    );
    assert.equal(statSync(join(dataDir, "admin.json")).mode & 0o777, 0o600);
    const app = createApp({ dataDir, secureCookie: false });
    const db = new DatabaseSync(join(dataDir, "safety.sqlite"));
    db.prepare("INSERT INTO places VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(
      "restore-test",
      "復元確認地点",
      "交通",
      "中",
      "未対応",
      "backup test",
      35,
      139,
      new Date().toISOString(),
      new Date().toISOString(),
      1,
    );
    db.prepare("INSERT INTO sessions VALUES (?,?)").run(
      "do-not-restore",
      Date.now() + 60000,
    );
    command("scripts/backup.js");
    const backup = join(backupDir, readdirSync(backupDir)[0]);
    const snapshot = new DatabaseSync(join(backup, "safety.sqlite"));
    assert.equal(
      snapshot.prepare("PRAGMA integrity_check").get().integrity_check,
      "ok",
    );
    assert.equal(
      snapshot.prepare("SELECT COUNT(*) AS n FROM places").get().n,
      1,
    );
    assert.equal(
      snapshot.prepare("SELECT COUNT(*) AS n FROM sessions").get().n,
      0,
    );
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessions").get().n, 1);
    snapshot.close();
    db.close();
    app.close();
    const restored = join(root, "restored");
    mkdirSync(restored);
    for (const name of ["safety.sqlite", "admin.json"])
      copyFileSync(join(backup, name), join(restored, name));
    const restoredApp = createApp({
      dataDir: restored,
      secureCookie: true,
      publicOrigin: "https://safety.example.org",
    });
    restoredApp.close();
    const rotated = randomBytes(24).toString("hex");
    command("scripts/create-admin.js", rotated + "\n", ["--reset"]);
    const newCredential = JSON.parse(
      readFileSync(join(dataDir, "admin.json"), "utf8"),
    );
    assert.ok(!verifyPassword(password, newCredential));
    assert.ok(verifyPassword(rotated, newCredential));
    const rotatedDB = new DatabaseSync(join(dataDir, "safety.sqlite"));
    assert.equal(
      rotatedDB.prepare("SELECT COUNT(*) AS n FROM sessions").get().n,
      0,
    );
    rotatedDB.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
