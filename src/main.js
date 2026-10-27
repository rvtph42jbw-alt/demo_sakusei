import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
let records = [];
let selected = null;
let admin = false;
let editing = null;
let busy = false;
let centered = false;
document.querySelector("#app").innerHTML =
  `<header><a class="brand" href="/">◈ <span>まちの安全マップ<small>COMMUNITY SAFETY</small></span></a><div class="account"><span id="account-state">閲覧モード</span><button id="account" class="secondary">管理者ログイン</button></div></header><main><section class="intro"><div><p class="eyebrow">OUR NEIGHBORHOOD, SAFER TOGETHER</p><h1>いつもの街に、<br class="mobile">安心をふやそう。</h1><p>気になる場所を記録して、地域の安全につなげましょう。</p></div><button id="new">＋ 危険箇所を登録</button></section><div id="stats" class="stats"></div><p class="notice">地域で共有する安全情報です。登録・更新には管理者ログインが必要です。個人情報は入力しないでください。緊急時は110・119へ通報し、最新の公的情報も確認してください。</p><div class="workspace"><aside><div class="panel-title"><h2>危険箇所一覧</h2><span id="count"></span></div><input id="search" type="search" placeholder="名称・メモを検索" aria-label="名称・メモを検索"><div class="filters"><select id="severity" aria-label="危険度"><option value="">すべての危険度</option><option>高</option><option>中</option><option>低</option></select><select id="status" aria-label="対応状況"><option value="">すべての対応状況</option><option>未対応</option><option>確認中</option><option>対応済</option></select></div><button id="history" class="secondary" hidden>操作履歴を見る</button><div class="list-tools"><button id="refresh" class="secondary">最新情報に更新</button><button id="locate" class="secondary">現在地へ</button></div><p id="load-state" role="status">情報を読み込んでいます…</p><div id="list"></div><button class="secondary" id="export">データを書き出す（JSON）</button></aside><section class="map-wrap" aria-label="危険箇所の地図"><div id="map"></div><div class="map-hint">地点を選択すると詳細を確認できます</div><div id="map-error" role="status"></div></section></div><footer>まちの安全は、小さな気づきから。<span>地図データ © OpenStreetMap contributors</span></footer><p id="message" role="status"></p></main><dialog id="dialog"><form id="form"><div class="panel-title"><h2 id="form-title">危険箇所を登録</h2><button type="button" id="close" class="icon" aria-label="閉じる">×</button></div><p>地図の位置を確認して、気づいたことを記録してください。</p><label>場所の名称<input name="name" maxlength="80" required placeholder="例：公園の北側の交差点"></label><div class="filters"><label>分類<select name="category"><option>交通</option><option>防犯</option><option>災害</option><option>設備</option><option>その他</option></select></label><label>危険度<select name="severity"><option>高</option><option selected>中</option><option>低</option></select></label></div><div class="filters"><label>緯度<input name="lat" type="number" step="any" min="-90" max="90" required></label><label>経度<input name="lng" type="number" step="any" min="-180" max="180" required></label></div><label>対応状況<select name="status"><option>未対応</option><option>確認中</option><option>対応済</option></select></label><label>状況・メモ<textarea name="note" maxlength="1000" rows="3" placeholder="危険の内容や、気をつけること"></textarea></label><button type="submit">保存する</button></form></dialog><dialog id="login-dialog"><form id="login-form"><div class="panel-title"><h2>管理者ログイン</h2><button type="button" id="login-close" class="icon" aria-label="ログインを閉じる">×</button></div><p>地域の管理者から案内されたパスワードを入力してください。</p><label>管理者パスワード<input name="password" type="password" autocomplete="current-password" required maxlength="256"></label><p id="login-error" role="alert"></p><button type="submit">ログイン</button></form></dialog><dialog id="history-dialog"><div class="panel-title"><h2>操作履歴（最新200件）</h2><button id="history-close" class="icon" aria-label="履歴を閉じる">×</button></div><div id="history-list"></div></dialog>`;
const map = L.map("map").setView([35.683, 139.763], 15);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
})
  .on("tileerror", () => {
    document.querySelector("#map-error").textContent =
      "地図を読み込めません。ネットワーク接続をご確認ください。一覧・登録は引き続き利用できます。";
  })
  .addTo(map);
const markers = L.layerGroup().addTo(map);
const $ = (s) => document.querySelector(s);
function notify(t) {
  $("#message").textContent = t;
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
  if (!response.ok) {
    if (response.status === 401) {
      admin = false;
      updateAccount();
      render();
    }
    throw new Error(data.error || "通信に失敗しました。");
  }
  return data;
}
function updateAccount() {
  $("#account-state").textContent = admin ? "管理者モード" : "閲覧モード";
  $("#account").textContent = admin ? "ログアウト" : "管理者ログイン";
  $("#new").hidden = !admin;
  $("#history").hidden = !admin;
  $(".map-hint").textContent = admin
    ? "地図をクリックして、新しい危険箇所を登録"
    : "地点を選択すると詳細を確認できます";
}
async function load() {
  $("#refresh").disabled = true;
  try {
    const [data, session] = await Promise.all([
      api("/places"),
      api("/session"),
    ]);
    records = data;
    admin = session.admin;
    if (!centered && records.length) {
      map.fitBounds(
        records.map((r) => [r.lat, r.lng]),
        { padding: [40, 40], maxZoom: 16 },
      );
      centered = true;
    }
    updateAccount();
    render();
    $("#load-state").textContent =
      "最終取得 " + new Date().toLocaleTimeString("ja-JP");
  } catch (e) {
    $("#load-state").textContent =
      "読み込みに失敗しました。更新ボタンで再試行してください。";
    notify(e.message);
  } finally {
    $("#refresh").disabled = false;
  }
}
function open(lat, lng, record = null) {
  if (!admin) return;
  editing = record;
  $("#form").reset();
  $("#form-title").textContent = record ? "危険箇所を編集" : "危険箇所を登録";
  if (record)
    for (const field of ["name", "category", "severity", "status", "note"])
      $("#form").elements[field].value = record[field];
  $("#form").elements.lat.value = lat.toFixed(6);
  $("#form").elements.lng.value = lng.toFixed(6);
  $("#dialog").showModal();
}
map.on("click", (e) => open(e.latlng.lat, e.latlng.lng));
$("#new").onclick = () => {
  const c = map.getCenter();
  open(c.lat, c.lng);
};
$("#close").onclick = () => $("#dialog").close();
$("#form").onsubmit = async (e) => {
  e.preventDefault();
  if (busy) return;
  const data = new FormData(e.target);
  const name = data.get("name").trim();
  if (!name) {
    e.target.elements.name.setCustomValidity("名称を入力してください");
    e.target.elements.name.reportValidity();
    return;
  }
  const r = {
    name,
    category: data.get("category"),
    severity: data.get("severity"),
    status: data.get("status"),
    note: data.get("note").trim(),
    lat: Number(data.get("lat")),
    lng: Number(data.get("lng")),
  };
  if (editing) r.version = editing.version;
  busy = true;
  const button = e.target.querySelector("[type=submit]");
  button.disabled = true;
  try {
    const saved = await api(editing ? "/places/" + editing.id : "/places", {
      method: editing ? "PUT" : "POST",
      body: JSON.stringify(r),
    });
    selected = saved.id;
    $("#dialog").close();
    await load();
    map.setView([saved.lat, saved.lng], 16);
    notify("保存しました。");
  } catch (error) {
    notify(error.message);
    alert(error.message);
  } finally {
    busy = false;
    button.disabled = false;
  }
};
$("#form").elements.name.oninput = (e) => e.target.setCustomValidity("");
$("#history-close").onclick = () => $("#history-dialog").close();
$("#history").onclick = async () => {
  try {
    const history = await api("/audit");
    $("#history-list").replaceChildren();
    for (const entry of history) {
      const p = document.createElement("p");
      p.textContent =
        new Date(entry.occurredAt).toLocaleString("ja-JP") +
        " · " +
        ({ create: "登録", update: "更新", delete: "削除" }[entry.action] ||
          entry.action) +
        " · 地点ID: " +
        entry.placeId;
      $("#history-list").append(p);
    }
    if (!history.length)
      $("#history-list").textContent = "操作履歴はありません。";
    $("#history-dialog").showModal();
  } catch (e) {
    notify(e.message);
  }
};
$("#refresh").onclick = load;
$("#locate").onclick = () => {
  if (!navigator.geolocation)
    return notify("このブラウザーでは現在地を取得できません。");
  navigator.geolocation.getCurrentPosition(
    (p) => {
      map.setView([p.coords.latitude, p.coords.longitude], 16);
      notify("現在地を表示しました。位置情報はサーバーへ保存していません。");
    },
    () => notify("現在地を取得できません。位置情報の許可をご確認ください。"),
    { timeout: 10000 },
  );
};
$("#account").onclick = async () => {
  if (!admin) {
    $("#login-error").textContent = "";
    $("#login-dialog").showModal();
    return;
  }
  try {
    await api("/logout", { method: "POST", body: "{}" });
    admin = false;
    updateAccount();
    render();
    notify("ログアウトしました。");
  } catch (e) {
    notify(e.message);
  }
};
$("#login-close").onclick = () => $("#login-dialog").close();
$("#login-form").onsubmit = async (e) => {
  e.preventDefault();
  const button = e.target.querySelector("[type=submit]");
  button.disabled = true;
  try {
    await api("/login", {
      method: "POST",
      body: JSON.stringify({ password: e.target.elements.password.value }),
    });
    e.target.reset();
    $("#login-dialog").close();
    await load();
    notify("ログインしました。");
  } catch (error) {
    $("#login-error").textContent = error.message;
  } finally {
    button.disabled = false;
  }
};
for (const s of ["#search", "#severity", "#status"])
  $(s).addEventListener("input", render);
function render() {
  $("#stats").replaceChildren(
    ...[
      ["登録された場所", records.length],
      ["未対応", records.filter((r) => r.status === "未対応").length],
      [
        "危険度が高い場所",
        records.filter((r) => r.severity === "高" && r.status !== "対応済")
          .length,
      ],
      ["対応済", records.filter((r) => r.status === "対応済").length],
    ].map(([label, count]) => {
      const el = document.createElement("div");
      el.className = "stat";
      const n = document.createElement("strong");
      n.textContent = count;
      const t = document.createElement("span");
      t.textContent = label;
      el.append(n, t);
      return el;
    }),
  );
  const q = $("#search").value.trim().toLowerCase();
  const visible = records.filter(
    (r) =>
      (!$("#severity").value || r.severity === $("#severity").value) &&
      (!$("#status").value || r.status === $("#status").value) &&
      (r.name + " " + (r.note || "")).toLowerCase().includes(q),
  );
  $("#count").textContent = visible.length + "件";
  $("#list").replaceChildren();
  markers.clearLayers();
  if (!visible.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = records.length
      ? "該当する場所はありません。"
      : "まだ危険箇所は登録されていません。管理者が登録すると、この地図に表示されます。";
    $("#list").append(p);
  }
  visible.forEach((r) => {
    const card = document.createElement("article");
    card.className = "card" + (selected === r.id ? " selected" : "");
    const top = document.createElement("div");
    top.className = "card-meta";
    const risk = document.createElement("span");
    risk.className = "risk risk-" + r.severity;
    risk.textContent = "危険度 " + r.severity;
    const cat = document.createElement("span");
    cat.textContent = r.category || "その他";
    top.append(risk, cat);
    const title = document.createElement("button");
    title.className = "place";
    title.textContent = r.name;
    title.onclick = () => {
      selected = r.id;
      map.setView([r.lat, r.lng], 17);
      render();
    };
    const note = document.createElement("p");
    note.textContent = r.note || "メモはありません";
    const bottom = document.createElement("div");
    bottom.className = "card-bottom";
    const status = document.createElement("select");
    status.setAttribute("aria-label", r.name + "の対応状況");
    for (const s of ["未対応", "確認中", "対応済"]) {
      const o = new Option(s, s);
      o.selected = r.status === s;
      status.add(o);
    }
    status.disabled = !admin;
    status.onchange = async () => {
      status.disabled = true;
      try {
        await api("/places/" + r.id, {
          method: "PUT",
          body: JSON.stringify({ ...r, status: status.value }),
        });
        await load();
        notify("対応状況を更新しました。");
      } catch (error) {
        notify(error.message);
        await load();
      }
    };
    const edit = document.createElement("button");
    edit.className = "delete";
    edit.textContent = "編集";
    edit.onclick = () => open(r.lat, r.lng, r);
    const del = document.createElement("button");
    del.className = "delete";
    del.textContent = "削除";
    del.onclick = async () => {
      if (!confirm("「" + r.name + "」を削除しますか？")) return;
      del.disabled = true;
      try {
        await api("/places/" + r.id, {
          method: "DELETE",
          body: JSON.stringify({ version: r.version }),
        });
        await load();
        notify("削除しました。");
      } catch (error) {
        notify(error.message);
        await load();
      }
    };
    bottom.append(status);
    if (admin) bottom.append(edit, del);
    card.append(top, title, note, bottom);
    $("#list").append(card);
    const marker = L.circleMarker([r.lat, r.lng], {
      bubblingMouseEvents: false,
      radius: selected === r.id ? 12 : 9,
      color: "#fff",
      weight: 3,
      fillColor: { 高: "#d6654e", 中: "#dda43f", 低: "#368a78" }[r.severity],
      fillOpacity: 1,
    }).addTo(markers);
    const tooltip = document.createElement("span");
    tooltip.textContent = r.name;
    marker.bindTooltip(tooltip);
    marker.on("click", () => {
      selected = r.id;
      render();
      const match = [...$("#list").children][visible.indexOf(r)];
      match?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  });
}
$("#export").onclick = () => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(records, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "community-safety.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
updateAccount();
load();
// Refresh shared data without interrupting an in-progress form.
setInterval(() => {
  if (
    !document.hidden &&
    !$("#dialog").open &&
    !$("#login-dialog").open &&
    !busy
  )
    load();
}, 60000);
