import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import { groups, routes, routeByPath } from "./routes.js";
import { icon } from "./icons.js";

const $ = (s) => document.querySelector(s);
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let storageAvailable = true;
const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem("machi:" + key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem("machi:" + key, JSON.stringify(value));
    return true;
  } catch {
    storageAvailable = false;
    toast("端末に保存できません。ブラウザーの保存設定を確認してください。");
    return false;
  }
};
const state = {
  records: [],
  loaded: false,
  error: "",
  admin: false,
  favoriteIds: read("favorites", []),
  query: "",
  filters: { category: "", severity: "", status: "" },
  receipt: null,
  draft: read("draft", {
    name: "",
    category: "交通",
    severity: "中",
    note: "",
    lat: null,
    lng: null,
  }),
  preferences: read("preferences", { large: false, reduceMotion: false }),
  selectedCollection: read("selectedCollection", ""),
  sending: false,
};
let map,
  markers,
  tiles,
  selectedMarker,
  tileReady = false,
  toastTimer;
const link = (path, label, cls = "", extra = "") =>
  `<a href="#/${path}" class="${cls}" ${extra}>${label}</a>`;
const btn = (action, label, cls = "button", extra = "") =>
  `<button type="button" class="${cls}" data-action="${action}" ${extra}>${label}</button>`;
const empty = (
  title,
  desc,
  action = "map",
  label = "地図をみる",
  symbol = "pin",
) =>
  `<div class="empty-state"><div class="empty-symbol">${icon(symbol)}</div><h3>${title}</h3><p>${desc}</p>${link(action, label + " " + icon("arrow"), "text-link")}</div>`;
const note = (text) =>
  `<div class="info-note">${icon("info")}<span>${text}</span></div>`;
const next = (path, label = "次へ") =>
  link(path, label + icon("arrow"), "button primary full");
const official = (url, label, description = "") =>
  `<a class="resource" href="${url}" target="_blank" rel="noopener noreferrer"><span><strong>${label}</strong>${description ? `<small>${description}</small>` : ""}</span>${icon("external")}</a>`;
const row = (path, title, sub = "", symbol = "chevron") =>
  link(
    path,
    `<span><strong>${title}</strong>${sub ? `<small>${sub}</small>` : ""}</span>${icon(symbol)}`,
    "nav-row",
  );
function current() {
  const [path, query = ""] = location.hash.replace(/^#\/?/, "").split("?");
  return { path: path || "map", params: new URLSearchParams(query) };
}
function route() {
  const { path } = current();
  return routeByPath.get(path);
}
function place() {
  return state.records.find((r) => r.id === current().params.get("id"));
}
const placeLink = (path, r) => `${path}?id=${encodeURIComponent(r.id)}`;
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 5000);
}
async function api(path, options = {}) {
  const response = await fetch("/api" + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Safety-Request": "1",
      ...options.headers,
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "通信に失敗しました。");
  return data;
}

$("#app").innerHTML = `<a href="#panel-title" class="skip-link">内容へ移動</a>
<header class="topbar"><a class="brand" href="#/map" aria-label="まちの安全マップ ホーム"><span class="brand-mark">${icon("pin")}</span><span>まちの安全マップ<small>small discoveries. safer neighborhoods.</small></span></a><div class="header-center"><span class="live-dot"></span>みんなでつくる、まちの安心</div><div class="top-actions">${link("help", icon("help") + "<span>使い方</span>", "quiet-link")}<a class="admin-link" href="/admin.html">管理者ページ ${icon("external")}</a><button class="avatar" data-action="account" aria-label="利用者の設定">G</button></div></header>
<div class="app-layout"><nav class="rail" aria-label="メインナビゲーション"><div class="rail-main">${[
  ["map", "map", "地図"],
  ["search", "search", "検索"],
  ["report", "flag", "通報"],
  ["evacuation", "shield", "避難情報"],
  ["favorites", "heart", "保存"],
]
  .map(([path, symbol, label]) =>
    link(
      path,
      icon(symbol) + `<span>${label}</span>`,
      "rail-link",
      `data-nav="${path}" aria-label="${label}"`,
    ),
  )
  .join(
    "",
  )}</div><div class="rail-bottom">${link("sitemap", icon("grid") + "<span>すべて</span>", "rail-link", 'data-nav="sitemap" aria-label="全60画面"')}${link("settings", icon("settings") + "<span>設定</span>", "rail-link", 'data-nav="settings"')}</div></nav>
<main class="map-workspace"><div id="map" aria-label="まちの安全情報の地図"></div><div class="map-top"><div class="area-tag">${icon("pin")}<span id="area-name">東京都・千代田区周辺</span></div><button class="share-map" data-action="share-map">${icon("share")}<span>この地図を共有</span></button></div>
<section class="side-panel" aria-label="情報パネル"><div id="panel-content"></div></section>
<div class="map-filters" aria-label="地図上の分類">${[
  ["map", "layers", "すべて"],
  ["map/traffic", "car", "交通"],
  ["map/crime", "shield", "防犯"],
  ["map/disaster", "cloud", "災害"],
  ["map/facilities", "sun", "設備"],
]
  .map(([p, i, t]) => link(p, icon(i) + t, "map-chip", `data-chip="${p}"`))
  .join("")}</div>
<div class="map-tools">${btn("locate", icon("locate"), "tool", 'aria-label="現在地を表示" title="現在地を表示"')}<div class="zoom-tools">${btn("zoom-in", icon("plus"), "tool", 'aria-label="拡大"')}${btn("zoom-out", icon("minus"), "tool", 'aria-label="縮小"')}</div>${btn("north", "N", "tool compass", 'aria-label="北向きの地図に戻す"')}${link("map/layers", icon("layers"), "tool", 'aria-label="地図の表示設定"')}</div>
<div class="map-bottom"><div class="map-status"><span class="live-dot"></span><span id="sync-state">地域の情報を確認中</span>${btn("refresh", icon("clock"), "mini-icon", 'aria-label="最新情報に更新"')}</div><div class="map-legend"><span class="legend-title">危険度</span><span><i class="dot high"></i>高</span><span><i class="dot medium"></i>中</span><span><i class="dot low"></i>低</span><i class="legend-divider"></i><span><i class="dot resolved"></i>対応済</span></div></div>
<div id="basemap-notice" class="basemap-notice" role="status">参考地図 · 詳細な地図を読み込み中</div>
</main></div><div id="toast" class="toast" role="status" aria-live="polite"></div>
<dialog id="confirm-dialog"><form method="dialog"><h2>端末内のデータを削除しますか？</h2><p>お気に入り、通報の受付番号、防災メモ、設定をこの端末から削除します。サーバーの公開情報と通報は削除されません。</p><div class="button-row"><button value="cancel" class="button">キャンセル</button><button value="delete" class="button danger">削除する</button></div></form></dialog>`;

map = L.map("map", { zoomControl: false, minZoom: 3, maxZoom: 19 }).setView(
  [35.686, 139.77],
  14,
);
const reference = L.imageOverlay(
  "/tokyo-reference.svg",
  [
    [35.653, 139.721],
    [35.719, 139.824],
  ],
  { interactive: false, attribution: "参考図：まちの安全マップ" },
).addTo(map);
tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
});
tiles.on("tileload", () => {
  tileReady = true;
  $("#basemap-notice").hidden = true;
});
tiles.on("tileerror", () => {
  if (!tileReady)
    $("#basemap-notice").textContent =
      "参考地図 · オンライン地図は接続待ちです";
});
if (read("basemap", "standard") === "reference")
  $("#basemap-notice").textContent =
    "参考地図 · 道路・避難経路の案内には使えません";
else tiles.addTo(map);
markers = L.layerGroup().addTo(map);
L.control.scale({ position: "bottomright", imperial: false }).addTo(map);
map.on("click", (e) => {
  if (current().path === "report/location") {
    state.draft.lat = Number(e.latlng.lat.toFixed(6));
    state.draft.lng = Number(e.latlng.lng.toFixed(6));
    write("draft", state.draft);
    drawDraft();
    renderPanel(false);
  }
});
map.on("moveend", () => {
  const center = map.getCenter();
  $("#area-name").textContent =
    center.lat > 35.65 &&
    center.lat < 35.73 &&
    center.lng > 139.72 &&
    center.lng < 139.83
      ? "東京都・千代田区周辺"
      : "地図の表示エリア";
  if (current().path === "search/area") renderPanel(false);
});
function drawDraft() {
  if (selectedMarker) map.removeLayer(selectedMarker);
  selectedMarker = null;
  if (
    current().path === "report/location" &&
    Number.isFinite(state.draft.lat) &&
    Number.isFinite(state.draft.lng)
  )
    selectedMarker = L.marker([state.draft.lat, state.draft.lng], {
      icon: L.divIcon({
        className: "draft-marker",
        html: icon("flag"),
        iconSize: [38, 44],
        iconAnchor: [19, 44],
      }),
    }).addTo(map);
}
const categoryForPath = {
  "map/traffic": "交通",
  "map/crime": "防犯",
  "map/disaster": "災害",
  "map/facilities": "設備",
};
function filtered() {
  const { path } = current();
  const q = state.query.trim().toLocaleLowerCase("ja");
  return state.records.filter(
    (r) =>
      (!q || (r.name + " " + r.note).toLocaleLowerCase("ja").includes(q)) &&
      (!(categoryForPath[path] || state.filters.category) ||
        r.category === (categoryForPath[path] || state.filters.category)) &&
      (!state.filters.severity || r.severity === state.filters.severity) &&
      (!(path === "map/resolved" ? "対応済" : state.filters.status) ||
        r.status ===
          (path === "map/resolved" ? "対応済" : state.filters.status)),
  );
}
function drawMarkers() {
  markers.clearLayers();
  const { path } = current();
  let visible = filtered();
  if (path.startsWith("favorites"))
    visible = state.records.filter((r) => state.favoriteIds.includes(r.id));
  if (path === "search/area")
    visible = visible.filter((r) => map.getBounds().contains([r.lat, r.lng]));
  $("#marker-count")?.replaceChildren(document.createTextNode(visible.length));
  for (const r of visible) {
    const color =
      r.status === "対応済"
        ? "#6e9c88"
        : { 高: "#db745f", 中: "#dfb150", 低: "#7da99b" }[r.severity];
    const marker = L.marker([r.lat, r.lng], {
      icon: L.divIcon({
        className: "place-marker",
        html: `<span style="--pin-color:${color}">${icon(r.category === "交通" ? "car" : r.category === "災害" ? "cloud" : "pin")}</span>`,
        iconSize: [36, 43],
        iconAnchor: [18, 43],
      }),
    });
    const name = document.createElement("span");
    name.textContent = r.name;
    marker.bindTooltip(name);
    marker.on("click", () => {
      location.hash = "/" + placeLink("places/detail", r);
    });
    marker.addTo(markers);
  }
  drawDraft();
}
function card(r) {
  return `<article class="place-card"><div class="card-top"><span class="risk risk-${r.severity}"><i class="dot ${r.severity === "高" ? "high" : r.severity === "中" ? "medium" : "low"}"></i>危険度 ${r.severity}</span><span class="subtle">${esc(r.category)}</span>${btn("favorite", icon("heart"), "favorite-button " + (state.favoriteIds.includes(r.id) ? "saved" : ""), `data-id="${esc(r.id)}" aria-label="${state.favoriteIds.includes(r.id) ? "お気に入りから削除" : "お気に入りに保存"}" aria-pressed="${state.favoriteIds.includes(r.id)}"`)}</div>${link(placeLink("places/detail", r), `<h3>${esc(r.name)}</h3><p>${esc(r.note || "詳細メモはありません。")}</p><div class="card-foot"><span>${icon("pin")}${esc(r.status)}</span><span>詳しくみる ${icon("arrow")}</span></div>`, "place-card-link")}</article>`;
}
function recordList(items = filtered()) {
  if (!state.loaded)
    return '<div class="loading-state" role="status">地域の情報を読み込んでいます…</div>';
  if (state.error)
    return `${note("情報の取得に失敗しました。" + esc(state.error))}${btn("refresh", "もう一度読み込む", "button full")}`;
  return items.length
    ? items.map(card).join("")
    : empty(
        "登録情報はまだありません",
        "この条件の危険箇所は登録されていません。情報がないことは、安全を保証するものではありません。",
        "report",
        "気づいたことを通報する",
      );
}
function sectionHeading(title, detail = "") {
  return `<div class="section-heading"><h2>${title}</h2>${detail ? `<span>${detail}</span>` : ""}</div>`;
}
function header(r) {
  return `<div class="panel-header"><div class="breadcrumb">${link("map", "ホーム")}${icon("chevron")}<span>${r.group}</span></div><div class="panel-eyebrow">NEIGHBORHOOD SAFETY</div><h1 id="panel-title" tabindex="-1">${r.title}</h1><p class="panel-description">${r.description}</p></div>`;
}
function searchForm() {
  return `<form id="search-form" class="search-box">${icon("search")}<input name="query" value="${esc(state.query)}" type="search" aria-label="場所やキーワードを検索" placeholder="場所やキーワードを検索"><button type="submit" aria-label="検索する">${icon("arrow")}</button></form>`;
}
function select(name, label, options, value) {
  return `<label class="field">${label}<select name="${name}">${options.map(([v, t]) => `<option value="${esc(v)}" ${value === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>`;
}
function selectedPlaceBody(path) {
  const r = place();
  if (!r)
    return empty(
      "場所を選んでください",
      "登録された場所の一覧から、詳しく知りたい場所を選びましょう。",
      "places",
      "場所の一覧へ",
    );
  const tabs = [
    ["places/detail", "詳細"],
    ["places/location", "位置"],
    ["places/updates", "更新"],
    ["places/share", "共有"],
    ["places/caution", "注意点"],
  ];
  let body = `<div class="selected-place"><span class="risk risk-${r.severity}">危険度 ${r.severity}</span><h2>${esc(r.name)}</h2><span class="subtle">${esc(r.category)} · ${esc(r.status)}</span></div><nav class="detail-tabs" aria-label="地点の情報">${tabs.map(([p, t]) => link(placeLink(p, r), t, p === path ? "active" : "")).join("")}</nav>`;
  if (path === "places/detail")
    body += `<div class="detail-section"><h3>この場所について</h3><p class="preserve-lines">${esc(r.note || "詳細メモは登録されていません。")}</p></div><div class="detail-facts"><div><span>対応状況</span><strong>${esc(r.status)}</strong></div><div><span>最終更新</span><strong>${formatDate(r.updatedAt)}</strong></div></div>${btn("favorite", icon("heart") + (state.favoriteIds.includes(r.id) ? "お気に入りから外す" : "お気に入りに保存"), "button full", `data-id="${esc(r.id)}"`)}${next(placeLink("places/location", r), "地図で位置をみる")}`;
  if (path === "places/location")
    body += `<div class="coordinate-card">${icon("pin")}<span>${r.lat.toFixed(6)}<br>${r.lng.toFixed(6)}</span></div>${btn("focus-place", icon("locate") + "この場所を地図の中心に", "button primary full")}${official(`https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lng}#map=17/${r.lat}/${r.lng}`, "OpenStreetMapで確認", "外部の地図が開きます")}`;
  if (path === "places/updates")
    body += `<ol class="timeline"><li><span>現在の対応状況</span><h3>${esc(r.status)}</h3><p>最終更新 ${formatDate(r.updatedAt, true)}</p></li><li><span>この場所の登録</span><h3>${formatDate(r.createdAt)}</h3><p>現在のデータバージョン：${r.version}</p></li></ol>${note("公開画面では現在の情報を表示しています。過去の操作履歴は管理者ページで確認できます。")}`;
  if (path === "places/share")
    body += `<label class="field">この場所のリンク<input readonly value="${esc(location.origin + "/#/" + placeLink("places/detail", r))}" aria-label="場所の共有リンク"></label>${btn("copy-link", icon("share") + "リンクをコピー", "button primary full", `data-link="${esc(location.origin + "/#/" + placeLink("places/detail", r))}"`)}${note("リンクを受け取った人も登録内容を閲覧できます。サーバーが外部公開されている必要があります。")}`;
  if (path === "places/caution")
    body += `${note("地域の登録情報です。現地の安全や、通行できることを保証するものではありません。")}<div class="detail-section"><h3>${esc(r.category)}の場所での確認</h3><p>${esc({ 交通: "車や自転車の動きを確認し、見通しの悪い場所では立ち止まって左右を確認しましょう。", 防犯: "不安を感じたら、人通りのある道や明るい場所を選びましょう。", 災害: "気象庁や自治体の最新の情報と、現地の状況を確認しましょう。", 設備: "破損した設備には近づかず、管理者へ知らせましょう。", その他: "現地の状況を確かめ、無理に近づかないようにしましょう。" }[r.category])}</p></div>${row("evacuation/contacts", "緊急時の連絡先")}${row("report", "追加の気づきを通報")}`;
  return body;
}
function formatDate(value, time = false) {
  return new Date(value).toLocaleString(
    "ja-JP",
    time
      ? {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }
      : { year: "numeric", month: "short", day: "numeric" },
  );
}
function reportSteps(path) {
  const order = [
    "report/location",
    "report/category",
    "report/details",
    "report/review",
  ];
  return `<div class="steps" aria-label="通報の手順">${order.map((p, i) => link(p, `<span>${i + 1}</span><small>${["場所", "種類", "詳細", "確認"][i]}</small>`, order.indexOf(path) >= i ? "active" : "")).join("")}</div>`;
}
function reportBody(path) {
  let d = state.draft;
  const formStart = '<form id="report-form">';
  if (path === "report")
    return `<div class="report-illustration">${icon("flag")}<span class="orbit one"></span><span class="orbit two"></span></div><h2 class="content-title">その「気になる」を、<br>まちの安心に。</h2><p class="body-copy">見通しの悪い交差点、壊れた街灯。<br>いつもの道で気づいたことを教えてください。</p><div class="flow-row"><span>1 場所を選ぶ</span>${icon("chevron")}<span>2 内容を入力</span>${icon("chevron")}<span>3 送信</span></div>${next("report/location", "通報をはじめる")}${note("送信内容は管理者が確認してから公開します。緊急時は110・119へ。個人情報は入力しないでください。")}${row("report/history", "この端末からの通報履歴", `${read("receipts", []).length}件の受付記録`)}`;
  let body = reportSteps(path);
  if (path === "report/location")
    body += `${note("地図上をクリックすると、通報する位置にピンを置けます。")}${formStart}<div class="coordinate-preview">${icon("pin")}<span>${Number.isFinite(d.lat) ? "選択した位置" : "地図で場所を選択してください"}<small>${Number.isFinite(d.lat) ? `${d.lat.toFixed(6)}, ${d.lng.toFixed(6)}` : "座標を直接入力することもできます"}</small></span></div><div class="field-grid"><label class="field">緯度<input name="lat" type="number" min="-90" max="90" step="any" value="${d.lat ?? ""}" required></label><label class="field">経度<input name="lng" type="number" min="-180" max="180" step="any" value="${d.lng ?? ""}" required></label></div>${btn("draft-center", "地図の中心を選ぶ", "button full")}<button class="button primary full" type="submit">種類の選択へ ${icon("arrow")}</button></form>`;
  if (path === "report/category")
    body += `${formStart}<fieldset class="category-options"><legend>気づいたことの種類</legend>${[
      ["交通", "car", "交差点・通学路・見通し"],
      ["防犯", "shield", "夜道・街灯・周囲の様子"],
      ["災害", "cloud", "浸水・崖・倒れそうなもの"],
      ["設備", "sun", "道路や公共設備の破損"],
      ["その他", "flag", "上記に当てはまらない気づき"],
    ]
      .map(
        ([v, i, t]) =>
          `<label class="category-option">${icon(i)}<span><strong>${v}</strong><small>${t}</small></span><input type="radio" name="category" value="${v}" ${d.category === v ? "checked" : ""}></label>`,
      )
      .join("")}</fieldset>${select(
      "severity",
      "気になる度合い",
      [
        ["高", "高 — 早めの確認が必要"],
        ["中", "中 — 注意したい"],
        ["低", "低 — 気づきの共有"],
      ],
      d.severity,
    )}<button class="button primary full" type="submit">詳細の入力へ ${icon("arrow")}</button></form>`;
  if (path === "report/details")
    body += `${formStart}<label class="field">場所の名称 <span class="required">必須</span><input name="name" maxlength="80" required value="${esc(d.name)}" placeholder="例：公園の北側の交差点"></label><label class="field">気づいた状況 <span class="required">必須</span><textarea name="note" maxlength="1000" rows="6" required placeholder="何が、どのように気になりましたか？">${esc(d.note)}</textarea><small>個人名・住所・連絡先は入力しないでください。</small></label><button class="button primary full" type="submit">内容の確認へ ${icon("arrow")}</button></form>`;
  if (path === "report/review")
    body += `<div class="review-card"><span class="pill">${esc(d.category)} · 気になる度合い ${esc(d.severity)}</span><h2>${esc(d.name || "名称が未入力です")}</h2><p class="preserve-lines">${esc(d.note || "状況が未入力です")}</p><small>${d.lat ?? "未選択"}, ${d.lng ?? "未選択"}</small></div>${note("個人情報を含まないことを確認して送信してください。管理者が確認するまで地図には公開されません。")}${btn("submit-report", state.sending ? "送信しています…" : "この内容で通報する " + icon("arrow"), "button primary full", state.sending ? "disabled" : "")}${row("report/details", "入力内容を修正")}`;
  if (path === "report/complete") {
    const receipt = state.receipt;
    return receipt
      ? `<div class="success-symbol">${icon("check")}</div><h2 class="content-title">気づきを、ありがとう。</h2><p class="body-copy">通報を受け付けました。管理者が確認します。<br>受付番号はこの端末の履歴に保存されます。</p><div class="receipt-number"><small>受付番号</small><strong>${esc(receipt.id)}</strong></div>${next("report/status?id=" + encodeURIComponent(receipt.id), "確認状況をみる")}${row("report/history", "通報履歴へ")}`
      : empty(
          "受付結果は履歴から確認できます",
          "まだこの画面で新しい通報を送信していません。",
          "report/history",
          "通報履歴をみる",
          "flag",
        );
  }
  if (path === "report/history") {
    const receipts = read("receipts", []);
    return `${note("この端末に受付番号が残っている通報だけを表示します。別の端末には同期されません。")}${receipts.length ? receipts.map((r) => row("report/status?id=" + encodeURIComponent(r.id), esc(r.name), formatDate(r.createdAt), "flag")).join("") : empty("通報履歴はありません", "まちで気づいたことがあれば、こちらから届けられます。", "report", "通報をはじめる", "flag")}`;
  }
  if (path === "report/status")
    return (
      '<div id="report-status" role="status">受付記録を確認しています…</div>' +
      row("report/history", "通報履歴に戻る")
    );
  return body;
}
const guides = {
  earthquake: {
    title: "揺れたら、身を守る。",
    steps: [
      [
        "まず姿勢を低く",
        "頭を守り、丈夫な机の下など安全な場所へ。揺れている間は無理に移動しない。",
      ],
      [
        "揺れがおさまってから",
        "周囲と避難経路を確認。割れたガラスや倒れた家具に注意する。",
      ],
      [
        "正確な情報を確認",
        "自治体の案内を確認し、沿岸部では津波情報にも注意する。",
      ],
    ],
  },
  flood: {
    title: "水が来る前に、行動を。",
    steps: [
      [
        "ハザードマップを確認",
        "自宅や避難先周辺の浸水・土砂災害のリスクを確認する。",
      ],
      [
        "早めに避難を判断",
        "高齢者等避難・避難指示など、自治体の最新情報に従う。",
      ],
      [
        "増水した場所に近づかない",
        "川・用水路・地下道の様子を見に行かない。夜間や冠水時の移動は危険。",
      ],
    ],
  },
  typhoon: {
    title: "接近する前に、備える。",
    steps: [
      [
        "進路と予報を確認",
        "気象庁と自治体の発表を確認し、外出の予定を見直す。",
      ],
      [
        "家の周囲を点検",
        "飛ばされやすい物を屋内に入れ、充電や備蓄を確認する。",
      ],
      [
        "明るいうちに避難",
        "避難が必要な場合は、雨風が強まる前に安全な避難先へ。",
      ],
    ],
  },
  fire: {
    title: "煙から離れて、避難を。",
    steps: [
      [
        "周囲に知らせ119へ",
        "大きな声で周囲に知らせ、安全な場所から119番へ通報する。",
      ],
      [
        "無理に消火しない",
        "火が天井に届くなど危険な場合は、消火せず避難を優先する。",
      ],
      [
        "低い姿勢で外へ",
        "煙を吸わないよう口・鼻を覆い、姿勢を低くして避難。戻らない。",
      ],
    ],
  },
};
const checklist = [
  "飲料水・非常食",
  "常備薬・お薬手帳",
  "モバイルバッテリー",
  "懐中電灯・予備電池",
  "現金・身分証の写し",
  "衛生用品・携帯トイレ",
  "歩きやすい靴・雨具",
  "家族に必要な用品",
];
function evacuationBody(path) {
  const key = path.split("/")[1];
  let body = note(
    "防災の一般的な備えです。リアルタイムの警報・避難所開設情報は配信していません。",
  );
  if (!key)
    body += `<div class="preparedness-banner">${icon("shield")}<h2>備えておくことが、<br>安心につながる。</h2><p>家族や大切な人と、いま確認。</p></div><div class="guide-grid">${[
      ["earthquake", "home", "地震"],
      ["flood", "cloud", "大雨・洪水"],
      ["typhoon", "leaf", "台風"],
      ["fire", "sun", "火災"],
    ]
      .map(([p, i, t]) =>
        link(
          "evacuation/" + p,
          icon(i) + `<span>${t}</span>${icon("arrow")}`,
          "guide-tile",
        ),
      )
      .join(
        "",
      )}</div>${row("evacuation/shelters", "避難先を調べる", "自治体の最新情報へ")}${row("evacuation/checklist", "持ち出しチェックリスト", "この端末にチェックを保存")}${row("evacuation/contacts", "緊急時の連絡先")}`;
  else if (guides[key]) {
    const g = guides[key];
    body += `<h2 class="content-title">${g.title}</h2><ol class="guide-steps">${g.steps.map(([t, d]) => `<li><h3>${t}</h3><p>${d}</p></li>`).join("")}</ol>${official("https://www.jma.go.jp/bosai/", "気象庁 防災情報", "最新の警報・地震・台風情報")}${next("evacuation/checklist", "備えをチェック")}`;
  } else if (key === "shelters")
    body += `<div class="detail-section"><h2>避難場所と避難所は、役割が違います。</h2><p>危険から逃れる「指定緊急避難場所」と、滞在する「指定避難所」。災害の種類によって利用できる場所も異なります。</p></div>${official("https://www.city.chiyoda.lg.jp/", "千代田区 公式サイト", "防災・避難所の最新情報を確認")}${official("https://disaportal.gsi.go.jp/", "国土交通省 ハザードマップポータル", "全国の災害リスクを確認")}${next("evacuation/shelter-detail", "避難先のメモを作る")}`;
  else if (key === "shelter-detail") {
    const m = read("shelter", {});
    body += `<form id="shelter-form"><label class="field">家族で決めた避難先<input name="name" maxlength="120" value="${esc(m.name)}" placeholder="確認した避難先の名称"></label><label class="field">確認した情報・メモ<textarea name="note" maxlength="2000" rows="5" placeholder="確認した自治体の情報や集合方法など">${esc(m.note)}</textarea></label><button type="submit" class="button primary full">${icon("check")}端末にメモを保存</button></form>${note("このメモは公式な避難先情報ではありません。開設状況や受け入れ条件は自治体に確認してください。")}${row("evacuation/route", "避難するときの確認へ")}`;
  } else if (key === "route")
    body += `<div class="route-warning">${icon("map")}<h2>道順よりも、いまの安全を。</h2><p>このサイトは安全な避難経路を計算しません。浸水・崖・落下物など、災害ごとの危険を公的情報で確認してください。</p></div>${row("map/disaster", "登録された災害の注意箇所を見る")}${official("https://disaportal.gsi.go.jp/", "ハザードマップで危険を確認")}${row("evacuation/shelter-detail", "避難先のメモを確認")}`;
  else if (key === "checklist") {
    const checked = read("checklist", []);
    body += `<div class="checklist-progress"><strong>${checked.length}<small> / ${checklist.length}</small></strong><span>準備できたもの</span></div><div class="checklist">${checklist.map((t, i) => `<label><input type="checkbox" data-check="${i}" ${checked.includes(i) ? "checked" : ""}><span>${t}</span></label>`).join("")}</div>${note("家庭の人数や健康状態、乳幼児・ペットの有無に合わせて必要な用品を追加してください。")}${btn("reset-checklist", "チェックをリセット", "button full")}`;
  } else if (key === "contacts")
    body += `<div class="emergency-cards"><a href="tel:119"><span>火事・救急・救助</span><strong>119</strong>${icon("arrow")}</a><a href="tel:110"><span>事件・事故</span><strong>110</strong>${icon("arrow")}</a><a href="tel:171"><span>災害用伝言ダイヤル</span><strong>171</strong>${icon("arrow")}</a></div>${note("171は災害発生時等に提供されるサービスです。電話は端末の通話機能を使用します。")}${official("https://www.jma.go.jp/bosai/", "気象庁の防災情報")}${official("https://www.city.chiyoda.lg.jp/", "自治体の案内を確認")}`;
  return body;
}
function favoritesBody(path) {
  const ids = state.favoriteIds;
  const items = state.records.filter((r) => ids.includes(r.id));
  const areas = read("areas", []),
    collections = read("collections", []);
  if (path === "favorites")
    return `<div class="saved-banner">${icon("heart")}<div><strong>${items.length}<small> か所</small></strong><p>あなたが見つけた、大切な場所。</p></div></div>${row("favorites/places", "保存した場所", `${items.length}か所`)}${row("favorites/areas", "保存したエリア", `${areas.length}件`)}${row("favorites/collections", "コレクション", `${collections.length}件`)}${row("favorites/manage", "保存内容を整理")}${note("お気に入りはこのブラウザーに保存します。別の端末には同期されません。")}`;
  if (path === "favorites/places")
    return items.length
      ? items.map(card).join("")
      : empty(
          "いつもの場所を、ここに。",
          "場所の詳細にあるハートを押すと、あとからすぐに確認できます。",
          "places",
          "場所を探す",
          "heart",
        );
  if (path === "favorites/areas")
    return `<form id="area-form"><label class="field">いまの地図に名前をつける<input name="name" maxlength="60" required placeholder="例：いつもの散歩エリア"></label><button class="button primary full" type="submit">${icon("plus")}表示中のエリアを保存</button></form><div class="saved-items">${areas.map((a, i) => `<div class="saved-row">${btn("open-area", icon("map") + esc(a.name), "saved-open", `data-index="${i}"`)}${btn("delete-area", icon("close"), "mini-icon", `data-index="${i}" aria-label="${esc(a.name)}を削除"`)}</div>`).join("") || '<p class="muted">保存したエリアはまだありません。</p>'}</div>`;
  if (path === "favorites/collections")
    return `<form id="collection-form"><label class="field">新しいコレクション<input name="name" maxlength="60" required placeholder="例：通学路で確認する場所"></label><button class="button primary full" type="submit">${icon("plus")}コレクションを作る</button></form>${collections.map((c) => row("favorites/collection?collection=" + encodeURIComponent(c.id), esc(c.name), `${c.ids.length}か所`, "heart")).join("")}`;
  if (path === "favorites/collection") {
    const c = collections.find(
      (c) => c.id === current().params.get("collection"),
    );
    return c
      ? `<h2 class="content-title">${esc(c.name)}</h2>${items.length ? `<p class="muted">このコレクションに含める場所を選択します。</p><div class="checklist">${items.map((r) => `<label><input type="checkbox" data-collection-id="${esc(c.id)}" data-place-id="${esc(r.id)}" ${c.ids.includes(r.id) ? "checked" : ""}><span>${esc(r.name)}</span></label>`).join("")}</div>` : empty("まず場所を保存しましょう", "お気に入りに保存した場所を、コレクションにまとめられます。", "places", "場所を探す", "heart")}${row("favorites/collections", "コレクション一覧へ")}`
      : empty(
          "コレクションを選択",
          "用途別のコレクションを作って場所を整理できます。",
          "favorites/collections",
          "コレクション一覧へ",
          "heart",
        );
  }
  if (path === "favorites/manage")
    return `${sectionHeading("保存した場所", `${items.length}か所`)}${items.map((r) => `<div class="saved-row"><span>${esc(r.name)}</span>${btn("favorite", "解除", "text-button", `data-id="${esc(r.id)}"`)}</div>`).join("") || '<p class="muted">保存した場所はありません。</p>'}${sectionHeading("コレクション", `${collections.length}件`)}${collections.map((c) => `<div class="saved-row"><span>${esc(c.name)}</span>${btn("delete-collection", "削除", "text-button", `data-id="${esc(c.id)}"`)}</div>`).join("") || '<p class="muted">コレクションはありません。</p>'}${row("settings/data", "すべての端末内データを管理")}`;
}
const helpContent = {
  start: [
    "まずは、いつものまちから。",
    [
      [
        "地図をみる",
        "登録された危険箇所を地図と一覧で確認。危険度と対応状況を確かめられます。",
        "map",
      ],
      [
        "気づきを届ける",
        "場所と状況を入力して送信。管理者が確認してから地図へ公開します。",
        "report",
      ],
      [
        "大切な場所を保存",
        "ハートを押してお気に入りに。保存はこの端末内だけです。",
        "favorites",
      ],
    ],
  ],
  map: [
    "地図から、まちを知る。",
    [
      [
        "ドラッグして移動",
        "＋・−ボタンで拡大縮小。現在地ボタンは位置情報を許可すると使えます。",
        "map/nearby",
      ],
      [
        "分類ごとに確認",
        "交通・防犯・災害・設備で表示を絞れます。ピンを押すと詳細が開きます。",
        "map/layers",
      ],
      [
        "表示されないとき",
        "オンライン地図には通信が必要です。参考図は道路や避難経路の案内には使用できません。",
        "settings/location",
      ],
    ],
  ],
  search: [
    "ほしい情報に、近づこう。",
    [
      [
        "名称・メモを検索",
        "検索欄に言葉を入れて検索。登録された情報が対象です。住所検索や住所からの位置特定には対応していません。",
        "search",
      ],
      [
        "条件で絞り込む",
        "危険度や対応状況を組み合わせると、必要な情報を探せます。",
        "search/filters",
      ],
      [
        "検索条件を保存",
        "結果画面から保存すると、よく使う条件で検索し直せます。",
        "search/saved",
      ],
    ],
  ],
  report: [
    "気づきが届くまで。",
    [
      [
        "場所・種類・詳細を入力",
        "地図で場所を指定して、具体的な状況を記入します。個人情報は含めないでください。",
        "report/location",
      ],
      [
        "内容を確認して送信",
        "通報はサーバーに保存されます。管理者による確認前に公開されることはありません。",
        "report",
      ],
      [
        "履歴で確認",
        "この端末の受付記録から、管理者の確認状況を調べられます。緊急時は電話で110・119へ。",
        "report/history",
      ],
    ],
  ],
  favorites: [
    "いつもの安心を、手元に。",
    [
      [
        "ハートで保存",
        "登録地点のハートを押して、この端末に保存します。もう一度押すと解除できます。",
        "favorites/places",
      ],
      [
        "エリアを保存",
        "地図の中心と拡大率を保存して、いつもの表示範囲に戻れます。",
        "favorites/areas",
      ],
      [
        "コレクションを作る",
        "用途ごとに名前をつけて、保存した場所をまとめられます。",
        "favorites/collections",
      ],
    ],
  ],
  emergency: [
    "緊急の連絡は、電話で。",
    [
      [
        "火事・救急・救助は119",
        "身の安全を確保し、消防・救急へ電話してください。このサイトから緊急出動は要請できません。",
        "evacuation/contacts",
      ],
      [
        "事件・事故は110",
        "危険から離れて警察へ連絡。このサイトの通報には即時対応の保証はありません。",
        "evacuation/contacts",
      ],
      [
        "災害時は公的情報を確認",
        "自治体の避難指示や気象庁の発表を優先してください。",
        "evacuation",
      ],
    ],
  ],
  sources: [
    "情報を知って、使い分ける。",
    [
      [
        "地域の危険箇所",
        "管理者が登録・更新、または通報を確認して公開した情報。1分ごとと更新操作で再取得します。",
        "places",
      ],
      [
        "地図の出典",
        "オンライン地図はOpenStreetMap。参考図は位置関係を示す概略図です。避難経路や道路の正確さは保証しません。",
        "map/layers",
      ],
      [
        "防災情報",
        "一般的な防災の備えを掲載。最新の警報と避難所開設は公的サイトで確認してください。",
        "evacuation/shelters",
      ],
    ],
  ],
  accessibility: [
    "使いやすさを、選べます。",
    [
      [
        "キーボードで操作",
        "Tabでリンクやボタンへ移動、Enterで決定。ページ先頭には本文へ移動するリンクがあります。",
        "map",
      ],
      [
        "文字を大きく",
        "設定から文字サイズを拡大できます。狭い画面では情報パネルと地図を切り替えられます。",
        "settings/display",
      ],
      [
        "地図を使わずに確認",
        "地点の一覧・詳細・座標からも情報を確認できます。通報位置は座標を直接入力できます。",
        "places",
      ],
    ],
  ],
};
function settingsBody(path) {
  if (path === "settings")
    return ["display", "privacy", "data", "location", "about"]
      .map((p) => {
        const r = routeByPath.get("settings/" + p);
        return row(r.path, r.title, r.description);
      })
      .join("");
  if (path === "settings/display")
    return `<div class="settings-controls"><label class="toggle-row"><span><strong>文字を大きく</strong><small>情報パネルの文字を拡大</small></span><input type="checkbox" data-pref="large" ${state.preferences.large ? "checked" : ""}></label><label class="toggle-row"><span><strong>動きを控えめに</strong><small>地図や画面のアニメーションを抑える</small></span><input type="checkbox" data-pref="reduceMotion" ${state.preferences.reduceMotion ? "checked" : ""}></label></div>${row("map/layers", "地図の背景を切り替える")}`;
  if (path === "settings/privacy")
    return `<div class="prose"><h2>公開される情報</h2><p>管理者が公開した地点の名称・状況・座標・分類は、どなたでも閲覧できます。</p><h2>端末に保存する情報</h2><p>お気に入り・検索履歴・通報の受付記録・防災メモ・表示設定はブラウザー内に保存されます。端末を共有する場合はご注意ください。</p><h2>通報と現在地</h2><p>通報内容はサーバーに保存され、管理者が確認します。現在地ボタンだけでは位置を送信・保存しません。通報で位置を選んだ場合、その座標は送信されます。</p></div>${row("settings/data", "保存内容を管理")}`;
  if (path === "settings/data")
    return `${sectionHeading("公開されている登録情報")}${btn("export", icon("download") + "公開データをJSONで書き出す", "button full")}${sectionHeading("この端末の保存内容")}<p class="body-copy">お気に入り ${state.favoriteIds.length}件 · 検索履歴 ${read("searchHistory", []).length}件 · 通報受付 ${read("receipts", []).length}件</p>${btn("clear-local", "端末内の保存データを削除", "button danger full")}${note("通報受付を削除すると、この端末から確認状況を照会できなくなります。サーバーの通報や公開地点には影響しません。")}`;
  if (path === "settings/location")
    return `<div class="detail-section"><h2>現在地を使う</h2><p>ボタンを押したときだけ、ブラウザーに位置情報の利用を求めます。許可の変更はブラウザーのサイト設定で行えます。</p></div>${btn("locate", icon("locate") + "現在地を取得する", "button primary full")}${note("HTTPSなどの安全な接続が必要です。許可しなくても、地図の移動・検索・座標を指定した通報を利用できます。")}`;
  if (path === "settings/about")
    return `<div class="about-brand"><span class="brand-mark">${icon("pin")}</span><h2>まちの安全マップ</h2><p>small discoveries.<br>safer neighborhoods.</p></div><p class="body-copy">地域の小さな気づきを共有して、いつものまちに安心をふやすためのサービスです。</p>${row("help/sources", "情報の出典と更新")}${row("help/accessibility", "アクセシビリティ")}<a href="/admin.html" class="nav-row"><span><strong>管理者ページ</strong><small>地点の管理・通報確認・操作履歴</small></span>${icon("external")}</a>`;
}
function home() {
  return `<div class="home-intro"><div class="home-eyebrow"><span class="tiny-spark">✳</span> A LITTLE SAFER, TOGETHER</div><h1 id="panel-title" tabindex="-1">まちを知る。<br>安心が、見えてくる。</h1><p>いつもの道も、はじめての場所も。<br>地域の気づきで、もっと安心に。</p>${searchForm()}</div><div class="home-content"><div class="community-stats"><div><strong>${state.records.length}<small>か所</small></strong><span>まちの気づき</span></div><div><strong>${state.records.filter((r) => r.status === "対応済").length}<small>か所</small></strong><span>安心につながった場所</span></div></div>${sectionHeading("気になる情報を探す")}<div class="category-grid">${[
    ["map/traffic", "car", "交通の安全", "peach"],
    ["map/crime", "shield", "防犯情報", "lavender"],
    ["map/disaster", "cloud", "災害の備え", "blue"],
    ["map/facilities", "sun", "設備・道路", "yellow"],
  ]
    .map(([p, i, t, c]) =>
      link(
        p,
        `<span class="category-icon ${c}">${icon(i)}</span><span>${t}</span>${icon("chevron")}`,
        "category-tile",
      ),
    )
    .join(
      "",
    )}</div><div class="section-heading"><h2>まちの最新情報</h2>${link("places", "すべてみる " + icon("arrow"), "text-link")}</div>${state.error ? note("情報を取得できません。更新ボタンで再試行してください。") : state.records.length ? state.records.slice(0, 2).map(card).join("") : `<div class="welcome-card"><span class="welcome-art">${icon("leaf")}<i></i><b></b></span><div><strong>このまちの安心を、一緒に。</strong><p>まだ気づきは登録されていません。<br>あなたのひとことが、最初の一歩に。</p></div></div>`}${link("report", `<span class="report-cta-icon">${icon("flag")}</span><span><strong>まちの気づきを届ける</strong><small>気になる場所を見つけたら</small></span>${icon("arrow")}`, "report-cta")}<div class="panel-bottom-links">${link("evacuation", icon("shield") + "避難・防災ガイド")}${link("help/emergency", "緊急時は110・119へ")}</div><p class="small-disclaimer">地域の共有情報です。安全を保証するものではありません。</p></div>`;
}
function body(r) {
  const { path } = r;
  if (path.startsWith("places/")) return selectedPlaceBody(path);
  if (path === "places")
    return `${sectionHeading("登録されている地点", state.records.length + "か所")}${recordList(state.records)}`;
  if (path.startsWith("report")) return reportBody(path);
  if (path.startsWith("evacuation")) return evacuationBody(path);
  if (path.startsWith("favorites")) return favoritesBody(path);
  if (path.startsWith("settings")) return settingsBody(path);
  if (path === "sitemap")
    return `<p class="body-copy">目的の異なる全60画面に、ここから移動できます。</p>${groups.map(([title, symbol, items]) => `<details class="sitemap-group" open><summary>${icon(symbol)}${title}<span>${items.length}</span></summary><div>${items.map(([p, t], i) => link(p, `<span>${String(routes.findIndex((r) => r.path === p) + 1).padStart(2, "0")}</span>${t}${icon("chevron")}`)).join("")}</div></details>`).join("")}`;
  if (path === "help")
    return (
      Object.keys(helpContent)
        .map((p) => {
          const r = routeByPath.get("help/" + p);
          return row(r.path, r.title, r.description);
        })
        .join("") + row("sitemap", "すべての画面", "60画面の一覧")
    );
  if (path.startsWith("help/")) {
    const [title, items] = helpContent[path.split("/")[1]];
    return `<h2 class="content-title">${title}</h2>${items.map(([t, d, p]) => `<div class="help-block"><h3>${t}</h3><p>${d}</p>${link(p, "この機能を使う " + icon("arrow"), "text-link")}</div>`).join("")}`;
  }
  if (path === "map/layers")
    return `<fieldset class="layer-options"><legend>背景の地図</legend>${[
      ["standard", "オンライン地図", "OpenStreetMap · 通信が必要です"],
      [
        "reference",
        "参考地図",
        "千代田区周辺の概略図 · 経路案内には使えません",
      ],
    ]
      .map(
        ([v, t, d]) =>
          `<label class="layer-option"><input type="radio" name="basemap" value="${v}" ${read("basemap", "standard") === v ? "checked" : ""}><span><strong>${t}</strong><small>${d}</small></span></label>`,
      )
      .join(
        "",
      )}</fieldset>${sectionHeading("危険箇所の表示")}${row("map", "すべて表示")}${row("map/traffic", "交通のみ")}${row("map/crime", "防犯のみ")}${row("map/disaster", "災害のみ")}${row("map/resolved", "対応済みの場所")}`;
  if (path === "map/nearby")
    return `${btn("locate", icon("locate") + "現在地を中心に表示", "button primary full")}${note("位置情報の利用にはブラウザーの許可が必要です。周辺情報は下の「この範囲を探す」で確認できます。")}${row("search/area", "この範囲を探す")}${recordList()}`;
  if (path.startsWith("map/"))
    return `${sectionHeading("登録情報", filtered().length + "か所")}${recordList()}`;
  if (path === "search")
    return `${searchForm()}<div class="search-shortcuts">${row("search/filters", "条件を指定する", "危険度・分類・対応状況")}${row("search/area", "地図の範囲から探す")}${row("search/history", "最近の検索")}${row("search/saved", "保存した検索")}</div>${note("登録地点の名称・メモが検索対象です。住所検索には対応していません。")}`;
  if (path === "search/results")
    return `${searchForm()}<div class="search-result-tools"><span>${esc(state.query || "すべての登録情報")} <strong>${filtered().length}</strong>件</span>${link("search/filters", icon("settings") + "絞り込み", "text-link")}</div>${btn("save-search", icon("heart") + "この検索を保存", "button full")}${recordList()}`;
  if (path === "search/filters")
    return `<form id="filter-form">${select("category", "情報の分類", [["", "すべて"], ...["交通", "防犯", "災害", "設備", "その他"].map((v) => [v, v])], state.filters.category)}${select("severity", "危険度", [["", "すべて"], ...["高", "中", "低"].map((v) => [v, v])], state.filters.severity)}${select("status", "対応状況", [["", "すべて"], ...["未対応", "確認中", "対応済"].map((v) => [v, v])], state.filters.status)}<button type="submit" class="button primary full">条件を適用 ${icon("arrow")}</button>${btn("clear-filters", "条件をリセット", "button full")}</form>`;
  if (path === "search/history") {
    const h = read("searchHistory", []);
    return h.length
      ? h
          .map(
            (q, i) =>
              `<div class="saved-row">${btn("history-search", icon("clock") + esc(q), "saved-open", `data-index="${i}"`)}${btn("delete-history", icon("close"), "mini-icon", `data-index="${i}" aria-label="${esc(q)}を履歴から削除"`)}</div>`,
          )
          .join("")
      : empty(
          "最近の検索はありません",
          "場所やキーワードを調べると、この端末の履歴に残ります。",
          "search",
          "検索してみる",
          "search",
        );
  }
  if (path === "search/saved") {
    const h = read("savedSearches", []);
    return h.length
      ? h
          .map(
            (s, i) =>
              `<div class="saved-row">${btn("saved-search", icon("search") + `<span>${esc(s.query || "すべて")}<small>${esc(Object.values(s.filters).filter(Boolean).join(" · ") || "条件指定なし")}</small></span>`, "saved-open", `data-index="${i}"`)}${btn("delete-search", icon("close"), "mini-icon", `data-index="${i}" aria-label="保存した検索を削除"`)}</div>`,
          )
          .join("")
      : empty(
          "いつもの条件を、保存しよう。",
          "検索結果画面で「この検索を保存」を押すと、ここから呼び出せます。",
          "search",
          "検索してみる",
          "search",
        );
  }
  if (path === "search/area") {
    const items = filtered().filter((r) =>
      map.getBounds().contains([r.lat, r.lng]),
    );
    return `${note("地図を動かすと、現在の表示範囲にある登録情報を更新します。")}${sectionHeading("いま見ている範囲", items.length + "か所")}${recordList(items)}`;
  }
  return "";
}
function renderPanel(focus = true) {
  const { path } = current();
  const r = routeByPath.get(path);
  document.title = (r?.title || "画面が見つかりません") + "｜まちの安全マップ";
  $("#panel-content").innerHTML = !r
    ? header({
        title: "画面が見つかりません",
        group: "ご案内",
        description: "リンク先を確認してください。",
      }) +
      `<div class="panel-body">${empty("こちらからお探しください", "すべての機能は画面一覧から選べます。", "sitemap", "画面一覧へ", "search")}</div>`
    : path === "map"
      ? home()
      : header(r) +
        `<div class="panel-body">${body(r)}</div><div class="screen-footer">${link("sitemap", icon("grid") + "すべての画面")}<span>${String(routes.indexOf(r) + 1).padStart(2, "0")} / 60</span></div>`;
  for (const el of document.querySelectorAll("[data-nav]")) {
    const p = el.dataset.nav;
    const active =
      p === "map"
        ? path.startsWith("map") || path.startsWith("places")
        : path === p || path.startsWith(p + "/");
    el.classList.toggle("active", active);
    if (active) el.setAttribute("aria-current", "page");
    else el.removeAttribute("aria-current");
  }
  for (const el of document.querySelectorAll("[data-chip]"))
    el.classList.toggle("active", el.dataset.chip === path);
  drawMarkers();
  applyPreferences();
  bindForms();
  if (path === "report/status") loadReportStatus();
  if (focus) {
    $(".side-panel").scrollTop = 0;
    if (path !== "map") $("#panel-title")?.focus({ preventScroll: true });
  }
}
function applyPreferences() {
  document.documentElement.classList.toggle(
    "large-text",
    state.preferences.large,
  );
  document.documentElement.classList.toggle(
    "reduce-motion",
    state.preferences.reduceMotion,
  );
}
async function load() {
  try {
    const [records, session] = await Promise.all([
      api("/places"),
      api("/session"),
    ]);
    state.records = records;
    state.admin = session.admin;
    state.loaded = true;
    state.error = "";
    $("#sync-state").textContent =
      "最新の情報 · " +
      new Date().toLocaleTimeString("ja-JP", {
        hour: "2-digit",
        minute: "2-digit",
      });
    if (
      !document.querySelector(
        "form input:focus, form textarea:focus, form select:focus",
      )
    )
      renderPanel(false);
  } catch (e) {
    state.loaded = true;
    state.error = e.message;
    $("#sync-state").textContent = "接続できません · 更新で再試行";
    renderPanel(false);
  }
}
async function loadReportStatus() {
  const target = $("#report-status");
  const id = current().params.get("id");
  const receipt = read("receipts", []).find((r) => r.id === id);
  if (!receipt) {
    target.innerHTML = empty(
      "受付記録を選んでください",
      "この端末に保存された受付記録から確認できます。",
      "report/history",
      "通報履歴へ",
      "flag",
    );
    return;
  }
  try {
    const r = await api("/reports/" + encodeURIComponent(id), {
      headers: { "X-Report-Token": receipt.token },
    });
    if (!target.isConnected) return;
    target.innerHTML = `<div class="status-result"><span class="pill">${{ pending: "確認待ち", published: "公開済み", dismissed: "確認完了・公開見送り" }[r.status]}</span><h2>${esc(r.name)}</h2><p>${r.status === "pending" ? "管理者に届いています。確認をお待ちください。" : r.status === "published" ? "管理者が内容を確認し、地図に公開しました。" : "管理者が確認しました。この通報は地図へ公開されていません。"}</p><small>受付 ${formatDate(r.createdAt, true)}</small>${r.placeId ? next("places/detail?id=" + encodeURIComponent(r.placeId), "公開された場所へ") : ""}</div>`;
  } catch (e) {
    if (target.isConnected) target.innerHTML = note(esc(e.message));
  }
}
function navigate(path) {
  location.hash = "/" + path;
}
function bindForms() {
  $("#search-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    state.query = new FormData(e.target).get("query").trim();
    if (state.query)
      write(
        "searchHistory",
        [
          state.query,
          ...read("searchHistory", []).filter((q) => q !== state.query),
        ].slice(0, 20),
      );
    const p = "search/results?q=" + encodeURIComponent(state.query);
    if (location.hash === "#/" + p) renderPanel(false);
    else navigate(p);
  });
  $("#filter-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    state.filters = Object.fromEntries(new FormData(e.target));
    navigate("search/results?q=" + encodeURIComponent(state.query));
  });
  $("#report-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const p = current().path;
    if (p === "report/location") {
      d.lat = Number(d.lat);
      d.lng = Number(d.lng);
    }
    Object.assign(state.draft, d);
    if (!write("draft", state.draft)) return;
    navigate(
      {
        "report/location": "report/category",
        "report/category": "report/details",
        "report/details": "report/review",
      }[p],
    );
  });
  for (const input of document.querySelectorAll(
    "#report-form input,#report-form textarea,#report-form select",
  ))
    input.addEventListener("input", () => {
      const data = Object.fromEntries(new FormData($("#report-form")));
      if ("lat" in data) {
        data.lat = data.lat === "" ? null : Number(data.lat);
        data.lng = data.lng === "" ? null : Number(data.lng);
      }
      Object.assign(state.draft, data);
      write("draft", state.draft);
    });
  $("#shelter-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    if (write("shelter", Object.fromEntries(new FormData(e.target))))
      toast("避難先のメモをこの端末に保存しました。");
  });
  $("#area-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const c = map.getCenter();
    const areas = read("areas", []);
    areas.push({
      name: new FormData(e.target).get("name").trim(),
      lat: c.lat,
      lng: c.lng,
      zoom: map.getZoom(),
    });
    if (write("areas", areas)) {
      renderPanel(false);
      toast("表示中のエリアを保存しました。");
    }
  });
  $("#collection-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const c = {
      id: crypto.randomUUID(),
      name: new FormData(e.target).get("name").trim(),
      ids: [],
    };
    if (write("collections", [...read("collections", []), c]))
      navigate("favorites/collection?collection=" + encodeURIComponent(c.id));
  });
}
async function locate() {
  if (!navigator.geolocation) {
    toast("このブラウザーでは位置情報を取得できません。");
    return;
  }
  toast("現在地を確認しています…");
  navigator.geolocation.getCurrentPosition(
    (p) => {
      map.setView([p.coords.latitude, p.coords.longitude], 16, {
        animate: !state.preferences.reduceMotion,
      });
      toast("現在地を表示しました。位置情報はサーバーに保存していません。");
    },
    () =>
      toast(
        "現在地を取得できません。ブラウザーの位置情報の許可を確認してください。",
      ),
    { timeout: 10000 },
  );
}
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("リンクをコピーしました。");
  } catch {
    toast(
      "コピーできませんでした。アドレス欄または表示されたリンクをコピーしてください。",
    );
  }
}
async function submitReport() {
  const d = state.draft;
  if (state.sending) return;
  if (!Number.isFinite(d.lat) || !Number.isFinite(d.lng)) {
    toast("先に通報する場所を選んでください。");
    navigate("report/location");
    return;
  }
  if (!d.name.trim() || !d.note.trim()) {
    toast("場所の名称と状況を入力してください。");
    navigate("report/details");
    return;
  }
  if (!storageAvailable) {
    toast(
      "通報の受付記録を保存できるよう、ブラウザーの保存設定を確認してください。",
    );
    return;
  }
  state.sending = true;
  renderPanel(false);
  try {
    const r = await api("/reports", {
      method: "POST",
      body: JSON.stringify(d),
    });
    state.receipt = { ...r, name: d.name };
    write("receipts", [state.receipt, ...read("receipts", [])]);
    state.draft = {
      name: "",
      category: "交通",
      severity: "中",
      note: "",
      lat: null,
      lng: null,
    };
    write("draft", state.draft);
    navigate("report/complete");
  } catch (e) {
    toast(e.message);
  } finally {
    state.sending = false;
    if (current().path === "report/review") renderPanel(false);
  }
}
document.addEventListener("click", async (e) => {
  if (e.target.closest(".skip-link")) {
    e.preventDefault();
    $("#panel-title")?.focus();
    return;
  }
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const a = el.dataset.action;
  const index = Number(el.dataset.index),
    id = el.dataset.id;
  if (a === "zoom-in") map.zoomIn();
  if (a === "zoom-out") map.zoomOut();
  if (a === "north") {
    map.setView([35.686, 139.77], 14);
    toast("千代田区周辺の地図に戻りました。");
  }
  if (a === "locate") locate();
  if (a === "refresh") {
    await load();
    if (!state.error) toast("最新の情報に更新しました。");
  }
  if (a === "account") navigate("settings");
  if (a === "share-map")
    copy(
      location.origin +
        "/#/map?lat=" +
        map.getCenter().lat.toFixed(6) +
        "&lng=" +
        map.getCenter().lng.toFixed(6) +
        "&zoom=" +
        map.getZoom(),
    );
  if (a === "copy-link") copy(el.dataset.link || location.href);
  if (a === "favorite") {
    const ids = state.favoriteIds.includes(id)
      ? state.favoriteIds.filter((v) => v !== id)
      : [...state.favoriteIds, id];
    if (write("favorites", ids)) {
      state.favoriteIds = ids;
      renderPanel(false);
      toast(
        ids.includes(id)
          ? "お気に入りに保存しました。"
          : "お気に入りから外しました。",
      );
    }
  }
  if (a === "focus-place") {
    const r = place();
    if (r)
      map.setView([r.lat, r.lng], 17, {
        animate: !state.preferences.reduceMotion,
      });
  }
  if (a === "draft-center") {
    const c = map.getCenter();
    state.draft.lat = Number(c.lat.toFixed(6));
    state.draft.lng = Number(c.lng.toFixed(6));
    write("draft", state.draft);
    renderPanel(false);
  }
  if (a === "submit-report") await submitReport();
  if (a === "clear-filters") {
    state.filters = { category: "", severity: "", status: "" };
    state.query = "";
    renderPanel(false);
  }
  if (a === "save-search") {
    const item = { query: state.query, filters: { ...state.filters } };
    const saved = read("savedSearches", []);
    if (!saved.some((s) => JSON.stringify(s) === JSON.stringify(item)))
      saved.push(item);
    if (write("savedSearches", saved)) toast("検索条件を保存しました。");
  }
  if (a === "history-search") {
    state.query = read("searchHistory", [])[index];
    navigate("search/results?q=" + encodeURIComponent(state.query));
  }
  if (a === "saved-search") {
    const s = read("savedSearches", [])[index];
    state.query = s.query;
    state.filters = s.filters;
    navigate("search/results?q=" + encodeURIComponent(state.query));
  }
  for (const [action, key] of [
    ["delete-history", "searchHistory"],
    ["delete-search", "savedSearches"],
    ["delete-area", "areas"],
  ])
    if (a === action) {
      const list = read(key, []);
      list.splice(index, 1);
      if (write(key, list)) renderPanel(false);
    }
  if (a === "open-area") {
    const area = read("areas", [])[index];
    map.setView([area.lat, area.lng], area.zoom);
    toast(esc(area.name) + "を表示しました。");
  }
  if (a === "delete-collection") {
    if (
      write(
        "collections",
        read("collections", []).filter((c) => c.id !== id),
      )
    )
      renderPanel(false);
  }
  if (a === "reset-checklist") {
    write("checklist", []);
    renderPanel(false);
  }
  if (a === "export") {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(state.records, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "community-safety.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("公開データを書き出しました。");
  }
  if (a === "clear-local") $("#confirm-dialog").showModal();
});
document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.matches("[data-check]")) {
    const n = Number(el.dataset.check);
    const values = read("checklist", []).filter((i) => i !== n);
    if (el.checked) values.push(n);
    write("checklist", values);
    renderPanel(false);
  }
  if (el.matches("[data-pref]")) {
    state.preferences[el.dataset.pref] = el.checked;
    write("preferences", state.preferences);
    applyPreferences();
  }
  if (el.name === "basemap") {
    write("basemap", el.value);
    if (el.value === "reference") {
      map.removeLayer(tiles);
      $("#basemap-notice").hidden = false;
      $("#basemap-notice").textContent =
        "参考地図 · 道路・避難経路の案内には使えません";
    } else {
      tileReady = false;
      tiles.addTo(map);
      $("#basemap-notice").hidden = false;
      $("#basemap-notice").textContent = "オンライン地図を読み込み中…";
    }
  }
  if (el.matches("[data-collection-id]")) {
    const cs = read("collections", []);
    const c = cs.find((c) => c.id === el.dataset.collectionId);
    c.ids = c.ids.filter((id) => id !== el.dataset.placeId);
    if (el.checked) c.ids.push(el.dataset.placeId);
    write("collections", cs);
    toast("コレクションを更新しました。");
  }
});
$("#confirm-dialog").addEventListener("close", () => {
  if ($("#confirm-dialog").returnValue !== "delete") return;
  try {
    for (const k of Object.keys(localStorage))
      if (k.startsWith("machi:")) localStorage.removeItem(k);
  } catch {
    toast("端末内のデータを削除できませんでした。");
    return;
  }
  state.favoriteIds = [];
  state.preferences = { large: false, reduceMotion: false };
  state.draft = {
    name: "",
    category: "交通",
    severity: "中",
    note: "",
    lat: null,
    lng: null,
  };
  state.receipt = null;
  state.query = "";
  state.filters = { category: "", severity: "", status: "" };
  renderPanel(false);
  toast("この端末の保存データを削除しました。");
});
function onRoute() {
  const { path, params } = current();
  if (path === "search/results") state.query = params.get("q") || "";
  if (path.startsWith("map")) {
    state.query = "";
    state.filters = { category: "", severity: "", status: "" };
  }
  if (path === "map") {
    const lat = Number(params.get("lat")),
      lng = Number(params.get("lng")),
      zoom = Number(params.get("zoom"));
    if (
      params.has("lat") &&
      params.has("lng") &&
      Number.isFinite(lat) &&
      Math.abs(lat) <= 90 &&
      Number.isFinite(lng) &&
      Math.abs(lng) <= 180
    )
      map.setView([lat, lng], Math.max(3, Math.min(19, zoom || 14)));
  }
  renderPanel();
  const r = place();
  if (r && path.startsWith("places/"))
    map.setView([r.lat, r.lng], 16, {
      animate: !state.preferences.reduceMotion,
    });
}
window.addEventListener("hashchange", onRoute);
onRoute();
load();
setInterval(() => {
  if (
    !document.hidden &&
    !document.querySelector(
      "form input:focus,form textarea:focus,form select:focus",
    ) &&
    !current().path.startsWith("report/")
  )
    load();
}, 60000);
