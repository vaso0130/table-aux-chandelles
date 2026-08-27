/* ═══════════════════════════════════════════════════════════════
   燭光牌桌 · 別館 UI 幫手 divine-ui.js(自 divine-core.js 抽出)
   城市選單/語氣/歷史/教學分頁/文庫瀏覽器/卡片幫手 + ?selftest 掛勾。
   載入順序:divine-core.js → divine-ui.js → divine-lore.js。
   ═══════════════════════════════════════════════════════════════ */
"use strict";

DC.CITIES = [
  ["台北", 25.04, 121.51, 8], ["新北", 25.01, 121.46, 8], ["桃園", 24.99, 121.30, 8], ["台中", 24.15, 120.67, 8],
  ["台南", 22.99, 120.21, 8], ["高雄", 22.63, 120.30, 8], ["香港", 22.32, 114.17, 8], ["北京", 39.90, 116.41, 8],
  ["上海", 31.23, 121.47, 8], ["東京", 35.68, 139.69, 9], ["首爾", 37.57, 126.98, 9], ["新加坡", 1.35, 103.82, 8],
  ["倫敦", 51.51, -0.13, 0], ["巴黎", 48.86, 2.35, 1], ["紐約", 40.71, -74.01, -5], ["洛杉磯", 34.05, -118.24, -8],
  ["自訂", null, null, null]
];
DC.fillCitySelect = function (sel, latEl, lonEl, tzEl) {
  DC.CITIES.forEach(function (c, i) { var o = document.createElement("option"); o.value = i; o.textContent = c[0]; sel.appendChild(o); });
  sel.addEventListener("change", function () {
    var c = DC.CITIES[+sel.value];
    if (c[1] != null) { latEl.value = c[1]; lonEl.value = c[2]; tzEl.value = c[3]; }
  });
  sel.value = 0; latEl.value = DC.CITIES[0][1]; lonEl.value = DC.CITIES[0][2]; tzEl.value = DC.CITIES[0][3];
};

DC.TONES = ["溫暖但誠實", "直白犀利，不留情面", "溫柔療癒，多些鼓勵", "冷靜理性，條理分析", "詩意神秘，如占卜師低語"]; // ⇄ index.html 牌桌館的語氣選單須與此逐字相同(兩邊共用 dc-tone 鍵)
DC.toneInit = function (onChange) { // 需要頁面有 #tone-select 與 #tone-custom
  var sel = document.getElementById("tone-select"), cus = document.getElementById("tone-custom");
  if (!sel) return;
  DC.TONES.forEach(function (t) { var o = document.createElement("option"); o.value = t; o.textContent = t; sel.appendChild(o); });
  var oc = document.createElement("option"); oc.value = "__custom__"; oc.textContent = "自訂…"; sel.appendChild(oc);
  try {
    var s = localStorage.getItem("dc-tone") || DC.TONES[0];
    if (s !== "__custom__" && DC.TONES.indexOf(s) < 0) { var s2 = s.replace(/,/g, "，"); if (DC.TONES.indexOf(s2) >= 0) s = s2; } // 舊半形值遷移
    cus.value = localStorage.getItem("dc-tone-custom") || "";
    sel.value = DC.TONES.indexOf(s) >= 0 ? s : "__custom__";
  } catch (e) { sel.value = DC.TONES[0]; }
  cus.hidden = sel.value !== "__custom__";
  var ch = function () {
    cus.hidden = sel.value !== "__custom__";
    try {
      localStorage.setItem("dc-tone", sel.value === "__custom__" ? "__custom__" : sel.value);
      localStorage.setItem("dc-tone-custom", cus.value);
    } catch (e) {}
    if (onChange) onChange(DC.toneValue());
  };
  sel.addEventListener("change", ch); cus.addEventListener("input", ch);
};
DC.toneValue = function () {
  var sel = document.getElementById("tone-select"), cus = document.getElementById("tone-custom");
  if (!sel) return "溫暖但誠實";
  return sel.value === "__custom__" ? (cus.value.trim() || "溫暖但誠實") : sel.value;
};
DC.toneHead = function () { return "請以繁體中文解讀,語氣:「" + DC.toneValue() + "」。"; };

DC.histBind = function () { // 跨館共用歷史(需 #hist-list/#hist-clear/#out/#prompt-box/#prompt-sec)
  var $id = function (x) { return document.getElementById(x); };
  var list = $id("hist-list");
  if (!list) { DC.histSave = function () {}; return; }
  var KEY = "dc-hall-history";
  var all = function () { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; } };
  var save = function (a) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) {} };
  var render = function () {
    var arr = all();
    if (!arr.length) { list.innerHTML = '<p class="hist-empty">尚無紀錄——起一盤吧。</p>'; return; }
    list.innerHTML = "";
    arr.forEach(function (r, i) {
      var d = new Date(r.t);
      var div = document.createElement("div");
      div.className = "hist-item";
      var info = document.createElement("div"); info.className = "h-info";
      var when = document.createElement("span"); when.className = "h-when";
      when.textContent = d.getFullYear() + "/" + (d.getMonth() + 1) + "/" + d.getDate() + " " + DC.pad2(d.getHours()) + ":" + DC.pad2(d.getMinutes());
      var what = document.createElement("span"); what.className = "h-what";
      what.textContent = "【" + r.page + "】" + r.title;
      info.appendChild(when); info.appendChild(what);
      if (r.q) { var qq = document.createElement("span"); qq.className = "h-q"; qq.textContent = r.q; info.appendChild(qq); }
      var act = document.createElement("div"); act.className = "h-actions";
      var bv = document.createElement("button"); bv.className = "ghost-btn"; bv.textContent = "重看";
      bv.onclick = function () {
        $id("out").innerHTML = r.html;
        $id("prompt-box").value = r.prompt;
        $id("prompt-sec").hidden = false;
        $id("out").scrollIntoView({ behavior: "smooth" });
      };
      var bd = document.createElement("button"); bd.className = "ghost-btn"; bd.textContent = "刪除";
      bd.onclick = function () { var a = all(); a.splice(i, 1); save(a); render(); };
      act.appendChild(bv); act.appendChild(bd);
      div.appendChild(info); div.appendChild(act);
      list.appendChild(div);
    });
  };
  var clr = $id("hist-clear");
  if (clr) clr.onclick = function () { save([]); render(); };
  DC.histSave = function (page, title, q, html, prompt) {
    var a = all();
    a.unshift({ t: Date.now(), page: page, title: title, q: q || "", html: html, prompt: prompt });
    while (a.length > 30) a.pop();
    save(a); render();
  };
  render();
};
DC.histSave = function () {}; // histBind 前的安全預設

/* ── 入門教學分頁(需 #views 兩顆 .view-btn 與 #view-learn 容器)── */
DC.learnInit = function (build, after) {
  var views = document.getElementById("views"), learn = document.getElementById("view-learn");
  if (!views || !learn) return;
  var show = function (isLearn) {
    views.querySelectorAll(".view-btn").forEach(function (x) { x.classList.toggle("active", (x.dataset.view === "learn") === isLearn); });
    document.body.classList.toggle("learning", isLearn);
    if (isLearn && !learn.dataset.built) { learn.innerHTML = build(); learn.dataset.built = "1"; if (after) after(learn); }
  };
  views.querySelectorAll(".view-btn").forEach(function (b) {
    b.addEventListener("click", function () { show(b.dataset.view === "learn"); });
  });
  if (/[?&]learn=1/.test(location.search)) show(true);
};

/* 一覽/逐張瀏覽元件(仿牌桌館字典 UX):磚牆一覽 → 點一張看一張,可前後翻頁 */
DC.browser = function (mount, items, renderDetail) {
  var view = -1;
  var draw = function (scroll) {
    if (view < 0) {
      mount.innerHTML = '<div class="dict-grid">' + items.map(function (it, i) {
        return '<button class="dict-tile" type="button"><span class="dt-no">' + (it.no != null ? it.no : (i + 1)) + "</span>" +
          '<span class="dt-t">' + it.t + "</span>" + (it.s ? '<span class="dt-s">' + it.s + "</span>" : "") + "</button>";
      }).join("") + "</div>";
      mount.querySelectorAll(".dict-tile").forEach(function (b, i) {
        b.onclick = function () { view = i; draw(true); };
      });
    } else {
      mount.innerHTML = '<div class="dict-nav">' +
        '<button class="ghost-btn dn-back" type="button">返回一覽</button>' +
        '<button class="ghost-btn dn-prev" type="button">← 上一</button>' +
        '<span class="dn-pos">' + (view + 1) + " / " + items.length + "</span>" +
        '<button class="ghost-btn dn-next" type="button">下一 →</button></div>' +
        '<div class="dict-detail-body">' + renderDetail(view) + "</div>";
      mount.querySelector(".dn-back").onclick = function () { view = -1; draw(true); };
      mount.querySelector(".dn-prev").onclick = function () { view = (view + items.length - 1) % items.length; draw(false); };
      mount.querySelector(".dn-next").onclick = function () { view = (view + 1) % items.length; draw(false); };
      var sc = mount.querySelector(".dict-detail-scroll");
      if (sc) sc.scrollLeft = sc.scrollWidth;
    }
    if (scroll) mount.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  draw(false);
  return { open: function (i) { view = i; draw(false); } };
};
DC.lcard = function (t, body) { return '<div class="result-card"><h3>' + t + "</h3>" + body + "</div>"; };
DC.ltable = function (headers, rows) {
  return '<div class="tbl-scroll"><table class="data wrap"><tr>' + headers.map(function (h) { return "<th>" + h + "</th>"; }).join("") + "</tr>" +
    rows.map(function (r) { return "<tr>" + r.map(function (c, i) { return "<td" + (i === 0 ? ' class="hl"' : "") + ">" + c + "</td>"; }).join("") + "</tr>"; }).join("") + "</table></div>";
};

/* ── ?selftest=1:自檢結果進標題(無頭驗收用;node 環境自動跳過) ── */
if (typeof location !== "undefined" && typeof document !== "undefined" && location.search.indexOf("selftest") >= 0) {
  setTimeout(function () {
    try {
      var r = String(DC.selfTest());
      var bad = r.split("\n").filter(function (s) { return s.indexOf("✗") === 0; });
      document.title = bad.length ? "SELFTEST-FAIL-" + bad.length : "SELFTEST-OK";
      var d = document.createElement("div"); d.id = "selftest-dump"; d.hidden = true; d.textContent = r;
      document.body.appendChild(d);
    } catch (e) { document.title = "SELFTEST-ERR " + e.message; }
  }, 50);
}


/* ── 別館通用強化(零館別改動,divine-ui 統一注入) ──
   1) 起盤成功(prompt-sec 現身)自動捲到結果——修「按了沒反應」錯覺
   2) 複製鍵旁補「開啟 ChatGPT / Claude」出口
   3) 複製成功訊息 3 秒自動收;#go-hint 加 role=status(讀屏可聞) */
(function () {
  if (typeof document === "undefined") return;
  var ps = document.getElementById("prompt-sec"), out = document.getElementById("out");
  if (ps && out) new MutationObserver(function () {
    if (!ps.hidden) out.scrollIntoView({ behavior: "smooth", block: "start" });
  }).observe(ps, { attributes: true, attributeFilter: ["hidden"] });
  var copyBtn = document.getElementById("btn-copy");
  if (copyBtn && !document.getElementById("ai-links")) {
    var wrap = document.createElement("span");
    wrap.id = "ai-links";
    wrap.style.cssText = "display:inline-flex;gap:10px";
    [["開啟 ChatGPT", "https://chatgpt.com/"], ["開啟 Claude", "https://claude.ai/new"]].forEach(function (l) {
      var a = document.createElement("a");
      a.className = "ghost-btn"; a.target = "_blank"; a.rel = "noopener";
      a.href = l[1]; a.textContent = l[0];
      wrap.appendChild(a);
    });
    copyBtn.parentElement.appendChild(wrap);
  }
  var ok = document.getElementById("copy-ok");
  if (ok) new MutationObserver(function () {
    if (!ok.hidden) setTimeout(function () { ok.hidden = true; }, 3000);
  }).observe(ok, { attributes: true, attributeFilter: ["hidden"] });
  var hint = document.getElementById("go-hint");
  if (hint) hint.setAttribute("role", "status");
})();

/* ── 全館通用「下載盤面圖」──
   把 #out(起盤結果)連同標題落款繪成 PNG:複製 DOM+扁平化 computed style,
   包進 SVG foreignObject 轉點陣——純本地,file:// 可用,無外部依賴。 */
DC.renderPanImage = function (cb) {
  var out = document.getElementById("out");
  if (!out || !out.innerHTML.trim()) out = document.getElementById("slip-scroll"); /* 開卷館籤紙容器 */
  if (!out || !out.innerHTML.trim()) { cb(null, "empty"); return; }
  var PROPS = ["display", "flex-direction", "flex-wrap", "justify-content", "align-items", "gap",
    "grid-template-columns", "grid-template-rows", "grid-column", "grid-row",
    "width", "min-width", "max-width", "min-height",
    "margin", "padding", "border", "border-radius", "box-shadow",
    "background", "background-color", "color", "opacity",
    "font-family", "font-size", "font-weight", "font-style", "line-height",
    "letter-spacing", "text-indent", "text-align", "white-space", "writing-mode",
    "text-shadow", "vertical-align", "overflow", "position"];
  function inlineStyles(src, dst) {
    if (src.nodeType !== 1) return;
    var cs = getComputedStyle(src);
    for (var i = 0; i < PROPS.length; i++) dst.style.setProperty(PROPS[i], cs.getPropertyValue(PROPS[i]));
    for (var k = 0; k < src.children.length; k++) inlineStyles(src.children[k], dst.children[k]);
  }
  var W = Math.max(560, Math.min(out.scrollWidth || 760, 1200));
  var clone = out.cloneNode(true);
  inlineStyles(out, clone);
  var titleEl = document.querySelector("h1");
  var d = new Date();
  var when = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  var holder = document.createElement("div");
  holder.style.cssText = "position:fixed;left:-99999px;top:0;width:" + W + "px;background:#0D140F;color:#E8DCC2;padding:28px 24px 20px;box-sizing:border-box;border:1.5px solid #C9A45C;font-family:serif";
  var head = document.createElement("div");
  head.style.cssText = "text-align:center;color:#E4C989;font-size:22px;letter-spacing:.2em;margin-bottom:4px";
  head.textContent = (titleEl ? titleEl.textContent : "燭光牌桌");
  var sub = document.createElement("div");
  sub.style.cssText = "text-align:center;color:#9A8C70;font-size:12px;margin-bottom:16px";
  sub.textContent = when;
  var foot = document.createElement("div");
  foot.style.cssText = "text-align:center;color:rgba(201,164,92,.7);font-size:12px;letter-spacing:.15em;margin-top:18px";
  foot.textContent = "── 燭 光 牌 桌 ・ La Table aux Chandelles ──";
  holder.appendChild(head); holder.appendChild(sub); holder.appendChild(clone); holder.appendChild(foot);
  document.body.appendChild(holder);
  var H = holder.scrollHeight;
  /* 量完高度後改回常規定位——否則序列化進 SVG 後內容被畫到 -99999px 外 */
  holder.style.position = "static"; holder.style.left = "auto"; holder.style.top = "auto";
  var xml;
  try { xml = new XMLSerializer().serializeToString(holder); }
  catch (e) { document.body.removeChild(holder); cb(null, e.message); return; }
  document.body.removeChild(holder);
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '">' +
    '<foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml">' + xml + "</div></foreignObject></svg>";
  var img = new Image();
  img.onload = function () {
    var cv = document.createElement("canvas");
    var scale = 2;
    cv.width = W * scale; cv.height = H * scale;
    var g = cv.getContext("2d");
    g.fillStyle = "#0D140F"; g.fillRect(0, 0, cv.width, cv.height);
    g.scale(scale, scale);
    g.drawImage(img, 0, 0);
    cb(cv, null);
  };
  img.onerror = function () { cb(null, "svg-render"); };
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
};
DC.downloadPan = function () {
  DC.renderPanImage(function (cv, err) {
    if (!cv) { alert(err === "empty" ? "先起盤,再下載。" : "此瀏覽器不支援盤面匯出(" + err + ")——可改用列印存 PDF。"); return; }
    cv.toBlob(function (blob) {
      if (!blob) { alert("匯出失敗——可改用列印存 PDF。"); return; }
      var d = new Date();
      var a = document.createElement("a");
      a.download = "燭光牌桌盤面-" + d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0") + ".png";
      a.href = URL.createObjectURL(blob);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    }, "image/png");
  });
};
/* 注入「下載盤面圖」鈕(接在複製鍵旁);?pandump=1 無頭驗證掛勾 */
(function () {
  if (typeof document === "undefined") return;
  var copyBtn = document.getElementById("btn-copy");
  if (copyBtn && !document.getElementById("btn-panshot")) {
    var b = document.createElement("button");
    b.className = "ghost-btn"; b.id = "btn-panshot"; b.textContent = "下載盤面圖";
    b.addEventListener("click", DC.downloadPan);
    copyBtn.parentElement.insertBefore(b, copyBtn.nextSibling);
  }
  if (location.search.indexOf("pandump") >= 0) {
    setTimeout(function () {
      DC.renderPanImage(function (cv, err) {
        var t = document.createElement("div");
        t.id = "pan-dump"; t.hidden = true;
        t.textContent = cv ? "PAN " + cv.width + "x" + cv.height : "PAN-ERR " + err;
        document.body.appendChild(t);
        if (cv && location.search.indexOf("pandump=2") >= 0) { /* 視覺驗證 */
          document.body.innerHTML = ""; document.body.style.background = "#000";
          cv.style.maxWidth = "100%"; cv.style.height = "auto";
          document.body.appendChild(cv); document.body.appendChild(t);
        }
      });
    }, 1800);
  }
})();
/* ── 生辰檔案工廠:各館一行宣告,並自動同步跨館共用檔 dc-profile ──
   fields 為欄位 id 陣列;讀取順序:本館新制 → 本館舊制短鍵 → 跨館共用檔。 */
DC.profileBind = function (key, fields) {
  var LEGACY = { "b-date": "bd", "b-time": "bt", "b-gender": "g", "b-tz": "tz", "b-lat": "lat", "b-lon": "lon", "b-city": "city", "b-zwyear": "zw" };
  var SHARED = { "b-date": "bd", "b-time": "bt", "b-gender": "g", "b-tz": "tz", "b-lat": "lat", "b-lon": "lon", "b-city": "city" };
  function load() {
    var p = {}, s = {};
    try { p = JSON.parse(localStorage.getItem(key) || "{}"); } catch (e) {}
    try { s = JSON.parse(localStorage.getItem("dc-profile") || "{}"); } catch (e) {}
    fields.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var v = p[id];
      if (v == null && LEGACY[id] != null) v = p[LEGACY[id]];
      if (v == null && SHARED[id] != null) v = s[SHARED[id]];
      if (v != null && v !== "") el.value = v;
    });
  }
  function save() {
    var p = {}, s = {};
    try { s = JSON.parse(localStorage.getItem("dc-profile") || "{}"); } catch (e) {}
    fields.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      p[id] = el.value;
      if (SHARED[id] != null && el.value) s[SHARED[id]] = el.value;
    });
    try { localStorage.setItem(key, JSON.stringify(p)); localStorage.setItem("dc-profile", JSON.stringify(s)); } catch (e) {}
  }
  load();
  return { save: save, load: load };
};