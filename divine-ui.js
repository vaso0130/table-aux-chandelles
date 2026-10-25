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

DC.TONES = ["溫暖但誠實", "直白犀利，不留情面", "溫柔療癒，多些鼓勵", "冷靜理性，條理分析", "詩意神秘，如占卜師低語"]; //   index.html 牌桌館的語氣選單須與此逐字相同（兩邊共用 dc-tone 鍵）
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
DC.toneHead = function () { return "用繁體中文解讀，語氣：「" + DC.toneValue() + "」。"; };

/* 紙面對話框：取代 alert（樣式在 hall.css 的 dialog.note） */
/* ── 解讀流派（清單在 divine-lore.js DC.SCHOOLS）：選擇各館共用同一份記憶，八字館選過的，MIX 也沿用 ── */
DC.schoolGet = function (key) {
  var v = ""; try { v = localStorage.getItem("dc-bazi-school-" + key) || ""; } catch (e) {}
  return (DC.SCHOOLS[key] || []).some(function (x) { return x[0] === v; }) ? v : "";
};
DC.schoolPrompt = function (key) {   /* 提示詞裡的一行；未選（不指定）回傳空字串 */
  var v = DC.schoolGet(key), x = (DC.SCHOOLS[key] || []).filter(function (s) { return s[0] && s[0] === v; })[0];
  return x ? x[3] + "下列要點若與此派方法不合，請依此派的取捨調整；與他派結論不同處可簡述差異。" : "";
};
DC.schoolSelect = function (sel, note, key) {   /* 把 <select> 填成該術的流派選單，改了就記住並更新說明 */
  var list = DC.SCHOOLS[key];
  sel.innerHTML = list.map(function (x) { return '<option value="' + x[0] + '">' + x[1] + (x[0] ? "" : "（綜合常見讀法）") + "</option>"; }).join("");
  sel.value = DC.schoolGet(key);
  var desc = function () { if (note) note.textContent = list.filter(function (x) { return x[0] === sel.value; })[0][2]; };
  desc();
  sel.onchange = function () { try { localStorage.setItem("dc-bazi-school-" + key, sel.value); } catch (e) {} desc(); };
};

/* ── 各館共用小幫手（原本各館各抄一份） ── */
DC.card = function (t, en, body) { return '<div class="result-card"><h3>' + t + (en ? '<span class="en">' + en + "</span>" : "") + "</h3>" + body + "</div>"; };
DC.fail = function (msg) { document.getElementById("go-hint").textContent = msg; return new Error(msg); };
DC.setNow = function (dateId, timeId) { // 日期、時間欄填入此刻
  var n = new Date();
  document.getElementById(dateId).value = n.getFullYear() + "-" + DC.pad2(n.getMonth() + 1) + "-" + DC.pad2(n.getDate());
  document.getElementById(timeId).value = DC.pad2(n.getHours()) + ":" + DC.pad2(n.getMinutes());
};
DC.readT = function (dateId, timeId) { // 讀日期、時間欄（當地鐘點）；未填則取此刻
  var dv = document.getElementById(dateId).value, tv = document.getElementById(timeId).value;
  if (dv && tv) {
    var d = dv.split("-").map(Number), t = tv.split(":").map(Number);
    return { y: d[0], m: d[1], d: d[2], h: t[0], mi: t[1] };
  }
  var n = new Date();
  return { y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate(), h: n.getHours(), mi: n.getMinutes() };
};
DC.renderModes = function (modes, activeId, onPick) { // 盤式／題目按鈕列（#modes）
  var box = document.getElementById("modes");
  box.innerHTML = "";
  (modes || []).forEach(function (md, i) {
    var b = document.createElement("button");
    b.className = "mode-btn" + (md[0] === activeId ? " active" : "");
    b.innerHTML = '<span class="s-row"><span class="s-idx">' + "壹貳參肆伍陸柒捌"[i] + '</span><span class="s-name">' + md[1] +
      '</span><span class="s-leader"></span></span><span class="s-desc">' + md[2] + '</span>';
    b.onclick = function () { onPick(md[0]); };
    box.appendChild(b);
  });
};

DC.say = function (msg, okLabel) {
  if (typeof document === "undefined") return;
  var dlg = document.getElementById("note");
  if (!dlg) {
    dlg = document.createElement("dialog"); dlg.id = "note"; dlg.className = "note";
    dlg.setAttribute("aria-labelledby", "note-text");
    dlg.innerHTML = '<form method="dialog"><p id="note-text"></p><div class="note-actions"><button class="ghost-btn" id="note-ok" value="ok">知道了</button></div></form>';
    document.body.appendChild(dlg);
  }
  if (typeof dlg.showModal !== "function") { alert(msg); return; }
  document.getElementById("note-text").textContent = msg;
  document.getElementById("note-ok").textContent = okLabel || "知道了";
  dlg.showModal();
};

/* ── 重複占問勸誡：同日同系統同題（模糊比對）第三次起提醒 ──
   模糊同題：正規化（去標點空白語尾詞）後以字元 bigram Dice 係數比對，防改幾個字繞過。 */
/* DC.simQ／DC.SIMQ_TH（同題比對）在 divine-core.js——牌桌館也要用，但不載入本檔 */
DC.REPEAT_MSG = "同一件事，你今天已用同一套占卜系統問過 {n} 次。\n再問，就只是在抽心安，不是在占卜。\n\n盤不會因為多問一次而換答案。答案不合意時，該換的是問題，或行動。\n（合參心法：機緣說的話，聽三遍就夠了。）";

/* 已併館的舊紀錄歸屬：數字館拆館時，生命靈數歸八字館、梅花河洛歸式占館 */
DC.histPageOf = function (r) {
  if (r.page === "數字館") return /靈數/.test(r.title) ? "八字館" : "式占館";
  return r.page;
};
DC.histBind = function (page) { // 各館歷史各自獨立（同一儲存鍵，依館名分開；需 #hist-list/#hist-clear/#out/#prompt-box/#prompt-sec）
  var $id = function (x) { return document.getElementById(x); };
  var list = $id("hist-list");
  if (!list) { DC.histSave = function () {}; return; }
  var KEY = "dc-hall-history", PER_PAGE = 30;
  var all = function () { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; } };
  var mine = function (r) { return DC.histPageOf(r) === page; };
  var save = function (a) {   /* 各館合計可能逼近儲存上限：存不下就從最舊的一筆開始讓位 */
    for (;;) {
      try { localStorage.setItem(KEY, JSON.stringify(a)); return; } catch (e) {}
      if (a.length <= 1) return;
      var oldest = 0;
      a.forEach(function (r, i) { if (r.t < a[oldest].t) oldest = i; });
      a.splice(oldest, 1);
    }
  };
  var render = function () {
    var arr = all().filter(mine);
    var clr = $id("hist-clear");
    if (clr) clr.hidden = !arr.length;
    if (!arr.length) { list.innerHTML = '<p class="hist-empty">還沒有紀錄。在這一館問過一次，就會留在這裡。</p>'; return; }
    list.innerHTML = "";
    arr.forEach(function (r) {
      var d = new Date(r.t);
      var div = document.createElement("div");
      div.className = "hist-item";
      var info = document.createElement("div"); info.className = "h-info";
      var when = document.createElement("span"); when.className = "h-when";
      when.textContent = d.getFullYear() + "/" + (d.getMonth() + 1) + "/" + d.getDate() + " " + DC.pad2(d.getHours()) + ":" + DC.pad2(d.getMinutes());
      var what = document.createElement("span"); what.className = "h-what";
      what.textContent = r.title;
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
      bd.onclick = function () { save(all().filter(function (x) { return x.t !== r.t; })); render(); };
      act.appendChild(bv);
      var ex = DC.histHook && DC.histHook(r);   /* 各館可替舊紀錄加一顆按鈕（鐘樓館：補抽流年） */
      if (ex) { var be = document.createElement("button"); be.className = "gold-btn"; be.textContent = ex.label; be.onclick = function () { ex.run(r); }; act.appendChild(be); }
      act.appendChild(bd);
      div.appendChild(info); div.appendChild(act);
      list.appendChild(div);
    });
  };
  var clr = $id("hist-clear");
  if (clr) {
    clr.textContent = "清空本館歷史";
    clr.onclick = function () { save(all().filter(function (r) { return !mine(r); })); render(); };
  }
  DC.histSave = function (pg, title, q, html, prompt) {
    var a = all();
    /* 重複占問勸誡：系統=館+術名(title 第一段);今日同系統同題（模糊）第三次起提醒 */
    var sysKey = pg + "|" + String(title).split("・")[0];
    var today = new Date().toDateString();
    var n = 0;
    a.forEach(function (r) {
      if (new Date(r.t).toDateString() !== today) return;
      if (DC.histPageOf(r) + "|" + String(r.title).split("・")[0] !== sysKey) return;
      if (DC.simQ(r.q, q) >= DC.SIMQ_TH) n++;
    });
    if (n >= 2) setTimeout(function () { DC.say(DC.REPEAT_MSG.replace("{n}", n + 1)); }, 400);
    a.unshift({ t: Date.now(), page: pg, title: title, q: q || "", html: html, prompt: prompt });
    var kept = 0;   /* 每館各留最近 30 筆，不再互相擠掉 */
    a = a.filter(function (r) { return DC.histPageOf(r) !== pg || ++kept <= PER_PAGE; });
    save(a); render();
  };
  DC.histUpdate = function (t, patch) {   /* 依建立時間 t 改寫一筆紀錄（不動時間與排序） */
    var a = all();
    a.forEach(function (r) { if (r.t === t) for (var k in patch) r[k] = patch[k]; });
    save(a); render();
  };
  DC.histRender = render;
  render();
};
DC.histSave = function () {}; // histBind 前的安全預設

/* ── 入門教學分頁（需 #views 兩顆 .view-btn 與 #view-learn 容器）── */
DC.learnInit = function (build, after) {
  var views = document.getElementById("views"), learn = document.getElementById("view-learn");
  if (!views || !learn) return;
  var tabs = Array.prototype.slice.call(views.querySelectorAll(".view-btn"));
  /* 分頁語意：tablist/tab + aria-selected，左右鍵可在分頁間移動（讀屏與鍵盤使用者才知道這是分頁） */
  views.setAttribute("role", "tablist");
  learn.setAttribute("role", "tabpanel");
  var show = function (isLearn) {
    tabs.forEach(function (x) {
      var on = (x.dataset.view === "learn") === isLearn;
      x.classList.toggle("active", on);
      x.setAttribute("aria-selected", on ? "true" : "false");
      x.tabIndex = on ? 0 : -1;
    });
    document.body.classList.toggle("learning", isLearn);
    if (isLearn && !learn.dataset.built) {
      learn.innerHTML = build(); learn.dataset.built = "1";
      /* 目次：一頁十來張教學卡不好讀，先給一列標題可跳可展；只展開第一張，其餘收著 */
      var cards = Array.prototype.slice.call(learn.querySelectorAll("details.lcard"));
      if (cards.length > 2) {
        var toc = document.createElement("nav"); toc.className = "learn-toc"; toc.setAttribute("aria-label", "教學目次");
        cards.forEach(function (c, i) {
          c.id = c.id || "learn-" + (i + 1);
          if (i === 0) c.open = true;
          var a = document.createElement("a"); a.href = "#" + c.id; a.textContent = c.querySelector("h3").textContent;
          a.addEventListener("click", function (e) { e.preventDefault(); c.open = true; c.scrollIntoView({ behavior: "smooth", block: "start" }); });
          toc.appendChild(a);
        });
        learn.insertBefore(toc, learn.firstChild);
        var all = document.createElement("button"); all.type = "button"; all.className = "ghost-btn learn-all"; all.textContent = "全部展開";
        all.addEventListener("click", function () {
          var open = cards.some(function (c) { return !c.open; });
          cards.forEach(function (c) { c.open = open; });
          all.textContent = open ? "全部收起" : "全部展開";
        });
        toc.appendChild(all);
      } else cards.forEach(function (c) { c.open = true; });
      if (after) after(learn);
    }
  };
  tabs.forEach(function (b, i) {
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", b.classList.contains("active") ? "true" : "false");
    b.tabIndex = b.classList.contains("active") ? 0 : -1;
    b.addEventListener("click", function () { show(b.dataset.view === "learn"); });
    b.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      var next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      next.focus(); next.click(); e.preventDefault();
    });
  });
  if (/[?&]learn=1/.test(location.search)) show(true);
};

/* 一覽/逐張瀏覽元件(仿牌桌館字典 UX):磚牆一覽 → 點一張看一張，可前後翻頁 */
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
/* 教學卡：可摺疊的 details，第一張預設展開；learnInit 會在頂端補一列目次 */
/* ── 教學書（仿牌桌館：符號字典一覽＋逐項細讀、盤面讀法逐項可摺疊）──
   spec[sysId] = { name, intro, dict: [{ cat, items: [{ no, t, s, html, key? }] }], guide: [{ name, sub, html }] }
   key 是結果頁連過來時用的名字（省略則用 t）；結果頁以 DC.bookLink(sysId, key) 產生可點的詞
   最上面一列命術（仿牌桌館先選牌組）；onPick(sysId) 讓頁面同步起盤那邊的選擇。
   回傳 { show(sysId) }：起盤那邊切換命術時呼叫，教學內容跟著換 */
DC.learnBook = function (mount, spec, onPick) {
  var cur = null, curId = null, tab = "dict", cat = 0, br = null, ids = Object.keys(spec);
  mount.innerHTML = (ids.length > 1 ? '<div class="book-sys" role="group" aria-label="命術">' +
      ids.map(function (id) { return '<button type="button" data-id="' + id + '">' + spec[id].name + "</button>"; }).join("") + "</div>" : "") +
    '<p class="book-intro lead-para"></p>' +
    '<div class="book-tabs" role="tablist"><button class="book-tab" data-tab="dict" role="tab">符號字典</button><button class="book-tab" data-tab="guide" role="tab">盤面讀法</button></div>' +
    '<div class="book-dict"><div class="book-cats"></div><div class="book-browser"></div></div>' +
    '<div class="book-guide"></div>';
  var $q = function (sel) { return mount.querySelector(sel); };
  var drawDict = function () {
    var d = cur.dict;
    $q(".book-cats").innerHTML = d.length > 1 ? d.map(function (c, i) {
      return '<button class="book-cat' + (i === cat ? " on" : "") + '" type="button">' + c.cat + '<small>' + c.items.length + "</small></button>";
    }).join("") : "";
    $q(".book-cats").querySelectorAll(".book-cat").forEach(function (b, i) { b.onclick = function () { cat = i; drawDict(); }; });
    var items = d[cat].items;
    br = DC.browser($q(".book-browser"), items, function (i) { return items[i].html; });
  };
  var drawGuide = function () {
    $q(".book-guide").innerHTML = cur.guide.map(function (g, i) {
      return '<details class="guide-item"' + (i === 0 ? " open" : "") + '><summary><span class="g-name">' + g.name + "</span>" +
        (g.sub ? '<span class="g-count">' + g.sub + "</span>" : "") + '<span class="g-mark" aria-hidden="true"></span></summary><div class="guide-body">' + g.html + "</div></details>";
    }).join("");
  };
  var drawTab = function () {
    mount.querySelectorAll(".book-tab").forEach(function (b) {
      var on = b.dataset.tab === tab;
      b.classList.toggle("on", on); b.setAttribute("aria-selected", on ? "true" : "false");
    });
    $q(".book-dict").hidden = tab !== "dict"; $q(".book-guide").hidden = tab !== "guide";
  };
  var show = function (id) {
    if (!spec[id] || id === curId) return;
    curId = id; cur = spec[id]; cat = 0;
    mount.querySelectorAll(".book-sys button").forEach(function (b) {
      b.classList.toggle("on", b.dataset.id === id); b.setAttribute("aria-pressed", b.dataset.id === id ? "true" : "false");
    });
    $q(".book-intro").innerHTML = cur.intro;
    drawDict(); drawGuide();
  };
  mount.querySelectorAll(".book-sys button").forEach(function (b) {
    b.onclick = function () { show(b.dataset.id); if (onPick) onPick(b.dataset.id); };
  });
  mount.querySelectorAll(".book-tab").forEach(function (b) { b.onclick = function () { tab = b.dataset.tab; drawTab(); }; });
  drawTab();
  /* 從結果頁點詞進來：切到該術、該類別，直接打開那一條 */
  var open = function (id, key) {
    show(id);
    if (!cur) return false;
    for (var c = 0; c < cur.dict.length; c++) {
      var items = cur.dict[c].items;
      for (var i = 0; i < items.length; i++) {
        if ((items[i].key || items[i].t) === key) {
          tab = "dict"; drawTab(); cat = c; drawDict(); br.open(i);
          mount.querySelector(".book-dict").scrollIntoView({ behavior: "smooth", block: "start" });
          return true;
        }
      }
    }
    return false;
  };
  var api = { show: show, open: open };
  DC._book = api;
  setTimeout(function () {   /* 頁面的 after 回呼先跑完（它會 show 目前命術），再處理點詞帶來的待開項 */
    if (DC._bookPending) { open(DC._bookPending[0], DC._bookPending[1]); DC._bookPending = null; }
  }, 0);
  return api;
};
/* 結果頁的可點詞：點了切到入門教學並打開字典那一條（label 省略則顯示 key） */
DC.bookLink = function (sysId, key, label) {
  return '<a class="book-link" href="#" data-book="' + sysId + ":" + key + '" title="在符號字典查「' + key + '」">' + (label == null ? key : label) + "</a>";
};
if (typeof document !== "undefined") document.addEventListener("click", function (e) {
  var a = e.target.closest && e.target.closest(".book-link");
  if (!a) return;
  e.preventDefault();
  var k = a.dataset.book, cut = k.indexOf(":");
  var sys = k.slice(0, cut), key = k.slice(cut + 1);
  if (DC._book) { var tab = document.querySelector('.view-btn[data-view="learn"]'); if (tab) tab.click(); DC._book.open(sys, key); return; }
  DC._bookPending = [sys, key];
  var t = document.querySelector('.view-btn[data-view="learn"]'); if (t) t.click();   /* 首次開教學頁會建書，建好後處理待開項 */
});
/* 字典細讀頁：標題、別名、關鍵詞，接幾段以細線分隔的小節（仿牌桌館牌義頁） */
DC.bookEntry = function (o) {
  return '<div class="book-entry"><div class="be-head">' + (o.glyph ? '<span class="be-glyph">' + o.glyph + "</span>" : "") +
    '<div><p class="be-sub">' + (o.sub || "") + '</p><h3 class="be-title">' + o.title + "</h3>" +
    (o.keys ? '<p class="be-keys">' + o.keys + "</p>" : "") + "</div></div>" +
    (o.sections || []).filter(function (s) { return s && s[1]; }).map(function (s) {
      return '<div class="be-sec"><p class="be-h">' + s[0] + "</p>" + (/^\s*</.test(s[1]) ? s[1] : "<p>" + s[1] + "</p>") + "</div>";
    }).join("") + "</div>";
};
DC.lcard = function (t, body) { return '<details class="result-card lcard"><summary><h3>' + t + "</h3></summary>" + body + "</details>"; };
DC.ltable = function (headers, rows) {
  return '<div class="tbl-scroll"><table class="data wrap"><tr>' + headers.map(function (h) { return "<th>" + h + "</th>"; }).join("") + "</tr>" +
    rows.map(function (r) { return "<tr>" + r.map(function (c, i) { return "<td" + (i === 0 ? ' class="hl"' : "") + ">" + c + "</td>"; }).join("") + "</tr>"; }).join("") + "</table></div>";
};

/* ── ?selftest=1:自檢結果進標題（無頭驗收用;node 環境自動跳過） ── */
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


/* ── 別館通用強化（零館別改動,divine-ui 統一注入） ──
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
  if (ok) ok.setAttribute("role", "status");   /* 讀屏也聽得到「已複製」 */
  if (ok) new MutationObserver(function () {
    if (!ok.hidden) setTimeout(function () { ok.hidden = true; }, 3000);
  }).observe(ok, { attributes: true, attributeFilter: ["hidden"] });
  var hint = document.getElementById("go-hint");
  if (hint) hint.setAttribute("role", "status");
})();

/* ── 全館通用「下載盤面圖」──
   把 #out(起盤結果)連同標題落款繪成 PNG:複製 DOM+扁平化 computed style,
   包進 SVG foreignObject 轉點陣——純本地,file:// 可用，無外部依賴。 */
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
    "text-shadow", "vertical-align", "overflow", "position", "transform", "object-fit"];
  function inlineStyles(src, dst) {
    if (src.nodeType !== 1) return;
    var cs = getComputedStyle(src);
    for (var i = 0; i < PROPS.length; i++) dst.style.setProperty(PROPS[i], cs.getPropertyValue(PROPS[i]));
    for (var k = 0; k < src.children.length; k++) inlineStyles(src.children[k], dst.children[k]);
  }
  var W = Math.max(560, Math.min((out.scrollWidth || 760) + 48, 1248));   /* +48＝外框左右內距，否則內容溢出邊框 */
  var clone = out.cloneNode(true);
  inlineStyles(out, clone);
  /* 牌面圖：foreignObject 裡不會去抓外部圖檔，先轉成內嵌 data URL
     （以檔案直接開啟時瀏覽器不准讀圖，該張略過、仍保留其餘內容） */
  var srcImgs = out.querySelectorAll("img"), dstImgs = clone.querySelectorAll("img");
  for (var m = 0; m < srcImgs.length; m++) {
    var si = srcImgs[m];
    if (!si.complete || !si.naturalWidth) { dstImgs[m].removeAttribute("src"); continue; }
    try {
      var ic = document.createElement("canvas");
      ic.width = Math.min(si.naturalWidth, 400); ic.height = Math.round(si.naturalHeight * ic.width / si.naturalWidth);
      ic.getContext("2d").drawImage(si, 0, 0, ic.width, ic.height);
      dstImgs[m].setAttribute("src", ic.toDataURL("image/jpeg", .88));
      dstImgs[m].style.height = getComputedStyle(si).height;   /* 只固定圖片高度；區塊高度留給內容撐開 */
    } catch (e) { dstImgs[m].removeAttribute("src"); }
  }
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
  var H = Math.ceil(holder.scrollHeight * 1.06) + 30;   /* 圖內改用後備字型、字高略大，預留餘裕免落款疊字 */
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
    if (!cv) { DC.say(err === "empty" ? "先起盤，再下載。" : "這個瀏覽器做不出盤面圖。可改用列印存成 PDF，或直接截圖。"); return; }
    cv.toBlob(function (blob) {
      if (!blob) { DC.say("這個瀏覽器做不出盤面圖。可改用列印存成 PDF，或直接截圖。"); return; }
      var d = new Date();
      var a = document.createElement("a");
      a.download = "燭光牌桌盤面-" + d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0") + ".png";
      a.href = URL.createObjectURL(blob);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    }, "image/png");
  });
};
/* 注入「下載盤面圖」鈕（接在複製鍵旁）;?pandump=1 無頭驗證掛勾 */
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
/* ── 生辰檔案工廠：各館一行宣告，並自動同步跨館共用檔 dc-profile ──
   fields 為欄位 id 陣列；讀取順序：本館新制 → 本館舊制短鍵 → 跨館共用檔。 */
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