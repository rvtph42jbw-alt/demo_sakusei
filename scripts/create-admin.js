import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { mkdirSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { hashPassword } from "../server/auth.js";
const dataDir = resolve(process.env.DATA_DIR || "./data");
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const file = resolve(dataDir, "admin.json");
if (existsSync(file) && !process.argv.includes("--reset")) {
  console.error(
    "管理者は設定済みです。変更は --reset を指定してください（既存セッションは次の起動時に無効になります）。",
  );
  process.exit(1);
}
let password;
if (process.stdin.isTTY) {
  const output = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  process.stdout.write("管理者パスワード（12〜128文字、非表示）: ");
  password = await rl.question("");
  process.stdout.write("\n確認のため再入力: ");
  const confirm = await rl.question("");
  process.stdout.write("\n");
  rl.close();
  if (password !== confirm) {
    console.error("入力が一致しません。");
    process.exit(1);
  }
} else {
  // Automation: read one password from stdin, never command arguments or logs.
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  password = input.replace(/\r?\n$/, "");
}
if (!password || password.length < 12 || password.length > 128) {
  console.error("12〜128文字のパスワードが必要です。");
  process.exit(1);
}
const tmp = file + ".tmp";
writeFileSync(tmp, JSON.stringify(hashPassword(password)), { mode: 0o600 });
renameSync(tmp, file);
// Remove sessions on password rotation without printing or retaining the password.
const { DatabaseSync } = await import("node:sqlite");
if (existsSync(resolve(dataDir, "safety.sqlite"))) {
  const db = new DatabaseSync(resolve(dataDir, "safety.sqlite"));
  db.exec("DELETE FROM sessions");
  db.close();
}
console.log(
  "管理者を設定しました。サーバーを起動（変更時は再起動）してください。",
);
