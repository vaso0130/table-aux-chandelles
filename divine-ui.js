/* ═══════════════════════════════════════════════════════════════
   燭光牌桌 · 別館 UI 帮手 divine-ui.js(自 divine-core.js 抽出)
   城市選單/語氣/歷史/教學分頁/文庫瀏覽器/卡片帮手 + ?selftest 掛勾。
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

