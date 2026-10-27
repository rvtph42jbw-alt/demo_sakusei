import express from "express";
import helmet from "helmet";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdirSync, readFileSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import { verifyPassword } from "./auth.js";

const categories = ["交通", "防犯", "災害", "設備", "その他"];
const severities = ["高", "中", "低"];
const statuses = ["未対応", "確認中", "対応済"];
export function createApp({
  dataDir = process.env.DATA_DIR || "./data",
  secureCookie = process.env.NODE_ENV === "production",
  publicOrigin = process.env.PUBLIC_ORIGIN,
  distDir = resolve("dist"),
} = {}) {
  if (secureCookie && !publicOrigin)
    throw new Error(
      "本番環境には PUBLIC_ORIGIN=https://公開ドメイン を設定してください",
    );
  if (secureCookie && publicOrigin && !publicOrigin.startsWith("https://"))
    throw new Error("本番環境の PUBLIC_ORIGIN には HTTPS が必要です");
  if (publicOrigin && new URL(publicOrigin).origin !== publicOrigin)
    throw new Error("PUBLIC_ORIGIN は末尾の / やパスを含めないでください");
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  let credential = null;
  try {
    credential = JSON.parse(
      readFileSync(resolve(dataDir, "admin.json"), "utf8"),
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (
    credential &&
    (!/^[a-f0-9]{32}$/.test(credential.salt || "") ||
      !/^[a-f0-9]{128}$/.test(credential.hash || ""))
  )
    throw new Error("管理者設定ファイルが正しくありません");
  if (secureCookie && !credential)
    throw new Error(
      "先に npm run admin:create で管理者パスワードを設定してください",
    );
  const db = new DatabaseSync(resolve(dataDir, "safety.sqlite"));
  chmodSync(resolve(dataDir, "safety.sqlite"), 0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS places (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, severity TEXT NOT NULL, status TEXT NOT NULL, note TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, action TEXT NOT NULL, placeId TEXT, occurredAt TEXT NOT NULL);
  `);
  const app = express();
  app.disable("x-powered-by");
  app.use(
    helmet({
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https://tile.openstreetmap.org"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: secureCookie ? [] : null,
        },
      },
      strictTransportSecurity: secureCookie ? undefined : false,
    }),
  );
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use("/api", express.json({ limit: "16kb", type: "application/json" }));
  app.use("/api", (req, res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (req.get("X-Safety-Request") !== "1")
        return res
          .status(403)
          .json({
            error: "操作を確認できません。ページを再読み込みしてください。",
          });
      const origin = req.get("Origin");
      const expected = publicOrigin || `${req.protocol}://${req.get("host")}`;
      if (origin && origin !== expected)
        return res.status(403).json({ error: "許可されていない送信元です。" });
    }
    next();
  });
  const digest = (token) => createHash("sha256").update(token).digest("hex");
  function sessionToken(req) {
    return /(?:^|;\s*)safety_session=([a-f0-9]{64})(?:;|$)/.exec(
      req.get("cookie") || "",
    )?.[1];
  }
  function authenticated(req) {
    const token = sessionToken(req);
    return Boolean(
      token &&
      db
        .prepare("SELECT token FROM sessions WHERE token=? AND expires>?")
        .get(digest(token), Date.now()),
    );
  }
  function requireAdmin(req, res, next) {
    if (!authenticated(req))
      return res.status(401).json({ error: "管理者ログインが必要です。" });
    next();
  }
  const attempts = new Map();
  app.get("/api/health", (_req, res) => {
    db.prepare("SELECT 1").get();
    res.json({ ok: true, adminConfigured: Boolean(credential) });
  });
  app.get("/api/session", (req, res) =>
    res.json({
      admin: authenticated(req),
      adminConfigured: Boolean(credential),
    }),
  );
  app.post("/api/login", (req, res) => {
    if (!credential)
      return res
        .status(503)
        .json({
          error: "管理者が未設定です。サーバー管理者に連絡してください。",
        });
    const now = Date.now();
    for (const [ip, value] of attempts)
      if (value.until < now) attempts.delete(ip);
    const ip = req.socket.remoteAddress;
    const attempt = attempts.get(ip) || {
      count: 0,
      until: now + 15 * 60 * 1000,
    };
    if (attempt.count >= 10) {
      res.set("Retry-After", String(Math.ceil((attempt.until - now) / 1000)));
      return res
        .status(429)
        .json({
          error: "試行回数が上限に達しました。15分後にお試しください。",
        });
    }
    attempt.count++;
    attempts.set(ip, attempt);
    const password = req.body?.password;
    if (
      typeof password !== "string" ||
      password.length > 256 ||
      !verifyPassword(password, credential)
    )
      return res.status(401).json({ error: "パスワードが正しくありません。" });
    attempts.delete(ip);
    db.prepare("DELETE FROM sessions WHERE expires<=?").run(now);
    const token = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO sessions VALUES (?,?)").run(
      digest(token),
      now + 12 * 60 * 60 * 1000,
    );
    res.cookie("safety_session", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: secureCookie,
      maxAge: 12 * 60 * 60 * 1000,
      path: "/",
    });
    res.json({ admin: true });
  });
  app.post("/api/logout", (req, res) => {
    const token = sessionToken(req);
    if (token)
      db.prepare("DELETE FROM sessions WHERE token=?").run(digest(token));
    res.clearCookie("safety_session", {
      httpOnly: true,
      sameSite: "strict",
      secure: secureCookie,
      path: "/",
    });
    res.json({ ok: true });
  });
  app.get("/api/places", (_req, res) =>
    res.json(
      db.prepare("SELECT * FROM places ORDER BY createdAt DESC,id").all(),
    ),
  );
  function validate(body) {
    return (
      body &&
      typeof body.name === "string" &&
      body.name.trim().length > 0 &&
      body.name.trim().length <= 80 &&
      typeof body.note === "string" &&
      body.note.length <= 1000 &&
      categories.includes(body.category) &&
      severities.includes(body.severity) &&
      statuses.includes(body.status) &&
      typeof body.lat === "number" &&
      Number.isFinite(body.lat) &&
      body.lat >= -90 &&
      body.lat <= 90 &&
      typeof body.lng === "number" &&
      Number.isFinite(body.lng) &&
      body.lng >= -180 &&
      body.lng <= 180
    );
  }
  function audit(action, id) {
    db.prepare(
      "INSERT INTO audit(action,placeId,occurredAt) VALUES (?,?,?)",
    ).run(action, id, new Date().toISOString());
  }
  app.post("/api/places", requireAdmin, (req, res) => {
    if (!validate(req.body))
      return res
        .status(400)
        .json({ error: "名称・分類・危険度・状況・座標を確認してください。" });
    const r = req.body,
      id = randomUUID(),
      now = new Date().toISOString();
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("INSERT INTO places VALUES (?,?,?,?,?,?,?,?,?,?,1)").run(
        id,
        r.name.trim(),
        r.category,
        r.severity,
        r.status,
        r.note.trim(),
        r.lat,
        r.lng,
        now,
        now,
      );
      audit("create", id);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    res.status(201).json(db.prepare("SELECT * FROM places WHERE id=?").get(id));
  });
  app.put("/api/places/:id", requireAdmin, (req, res) => {
    if (!validate(req.body) || !Number.isInteger(req.body.version))
      return res.status(400).json({ error: "入力内容を確認してください。" });
    const r = req.body;
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = db
        .prepare(
          "UPDATE places SET name=?,category=?,severity=?,status=?,note=?,lat=?,lng=?,updatedAt=?,version=version+1 WHERE id=? AND version=?",
        )
        .run(
          r.name.trim(),
          r.category,
          r.severity,
          r.status,
          r.note.trim(),
          r.lat,
          r.lng,
          new Date().toISOString(),
          req.params.id,
          r.version,
        );
      if (!result.changes) {
        db.exec("ROLLBACK");
        return res
          .status(409)
          .json({
            error:
              "別の操作で変更または削除されました。再読み込みしてやり直してください。",
          });
      }
      audit("update", req.params.id);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    res.json(db.prepare("SELECT * FROM places WHERE id=?").get(req.params.id));
  });
  app.delete("/api/places/:id", requireAdmin, (req, res) => {
    if (!Number.isInteger(req.body?.version))
      return res.status(400).json({ error: "バージョンが必要です。" });
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = db
        .prepare("DELETE FROM places WHERE id=? AND version=?")
        .run(req.params.id, req.body.version);
      if (!result.changes) {
        db.exec("ROLLBACK");
        return res
          .status(409)
          .json({
            error:
              "別の操作で変更または削除されました。再読み込みしてください。",
          });
      }
      audit("delete", req.params.id);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    res.json({ ok: true });
  });
  app.get("/api/audit", requireAdmin, (_req, res) =>
    res.json(
      db.prepare("SELECT * FROM audit ORDER BY id DESC LIMIT 200").all(),
    ),
  );
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "APIが見つかりません。" }),
  );
  app.use(express.static(distDir, { index: "index.html" }));
  app.use((err, _req, res, _next) => {
    const status =
      err.status === 413 ? 413 : err.type === "entity.parse.failed" ? 400 : 500;
    if (status === 500) console.error("Request failed:", err.message);
    res
      .status(status)
      .json({
        error:
          status === 413
            ? "送信データが大きすぎます。"
            : status === 400
              ? "JSON形式が正しくありません。"
              : "サーバーでエラーが発生しました。時間をおいてお試しください。",
      });
  });
  return { app, close: () => db.close() };
}
