import { DatabaseSync, backup } from "node:sqlite";
import { mkdirSync, copyFileSync, existsSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
const dataDir = resolve(process.env.DATA_DIR || "./data");
const target = resolve(
  process.env.BACKUP_DIR || "./backups",
  new Date().toISOString().replace(/[:.]/g, "-"),
);
if (!existsSync(resolve(dataDir, "safety.sqlite")))
  throw new Error("データベースがありません");
mkdirSync(target, { recursive: true, mode: 0o700 });
const db = new DatabaseSync(resolve(dataDir, "safety.sqlite"), {
  readOnly: true,
});
await backup(db, resolve(target, "safety.sqlite"));
db.close();
const snapshot = new DatabaseSync(resolve(target, "safety.sqlite"));
snapshot.exec("DELETE FROM sessions");
snapshot.close();
chmodSync(resolve(target, "safety.sqlite"), 0o600);
if (existsSync(resolve(dataDir, "admin.json")))
  copyFileSync(resolve(dataDir, "admin.json"), resolve(target, "admin.json"));
console.log("バックアップを作成しました:", target);
