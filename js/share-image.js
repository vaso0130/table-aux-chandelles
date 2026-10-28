/* 解讀分享圖（全站共用，自帶樣式）
 * 把起盤結果排進一張直式「分享卡」：館名、時間、所問，加上牌面與解讀；用 html2canvas 在本機繪成高解析 PNG
 * （寬約 2000px，自動壓在手機畫布上限內）。畫好先開預覽：可直接分享（手機分享面板）、下載，或長按圖片存進相簿。
 * 舊做法（SVG foreignObject 轉點陣）在 iPhone Safari 會被當成污染畫布而做不出圖，故全面改用此模組。
 * 用法：ShareImage.run({ title, lines:[小字…], cards: Element?, body: [Element…], file: "檔名" }) */
(function () {
  "use strict";
  if (window.ShareImage) return;
  var here = (document.currentScript && document.currentScript.src) || "js/share-image.js";
  var LIB = new URL("vendor/html2canvas.min.js", here).href;
  var W = 720;          /* 分享卡的版面寬（CSS px） */
  var MAX_SCALE = 3;    /* 720 × 3 = 2160px 寬 */
  var MAX_AREA = 16e6;  /* iOS Safari 單一畫布約 16.7M 像素上限 */
  var MAX_SIDE = 32000;

  var css = "" +
    ".si-sheet{position:absolute;left:0;top:0;width:" + W + "px;opacity:0;pointer-events:none;z-index:-1;box-sizing:border-box;" +
    "background:#0D140F;color:#E8DCC2;padding:30px 26px 22px;border:1.5px solid #C9A45C;font-family:\"Noto Serif TC\",\"PMingLiU\",serif}" +
    ".si-sheet .si-head{text-align:center;color:#E4C989;font-size:26px;letter-spacing:.24em;text-indent:.24em;line-height:1.4}" +
    ".si-sheet .si-sub{text-align:center;color:#A9997A;font-size:13.5px;line-height:1.7;margin-top:4px;letter-spacing:.04em}" +
    ".si-sheet .si-q{text-align:center;color:#E8DCC2;font-size:16px;line-height:1.6;margin:10px auto 0;max-width:600px}" +
    ".si-sheet .si-rule{height:0;border-top:3px double rgba(201,164,92,.55);margin:16px 40px 18px}" +
    ".si-sheet .si-foot{text-align:center;color:rgba(201,164,92,.75);font-size:12.5px;letter-spacing:.18em;margin-top:20px}" +
    ".si-sheet .si-cards{display:flex;flex-wrap:wrap;justify-content:center;gap:14px 12px;margin:0 0 18px}" +
    ".si-sheet .si-card{width:120px;text-align:center}" +
    ".si-sheet .si-card.sm{width:92px}.si-sheet .si-card.xs{width:70px}" +
    ".si-sheet .si-card .si-face{width:100%;aspect-ratio:auto;height:auto;display:block;border-radius:7px;box-shadow:0 0 0 1px #C9A45C}" +
    ".si-sheet .si-card .si-glyph{height:150px;display:flex;align-items:center;justify-content:center;font-size:40px;border-radius:7px;" +
    "background:#131E16;box-shadow:0 0 0 1px #C9A45C;color:#E8DCC2}" +
    ".si-sheet .si-card.rv .si-face,.si-sheet .si-card.rv .si-glyph{transform:rotate(180deg)}" +
    ".si-sheet .si-card b{display:block;color:#E4C989;font-size:14.5px;line-height:1.35;margin-top:6px}" +
    ".si-sheet .si-card small{display:block;color:#A9997A;font-size:11.5px;line-height:1.35}" +
    /* html2canvas 畫斜角漸層會在長紙上出現接縫，分享卡裡改成直向漸層 */
    ".si-sheet .paper{background:linear-gradient(180deg,#F2E8D5,#E2D2B4)!important}" +
    ".si-sheet button,.si-sheet textarea,.si-sheet input,.si-sheet select,.si-sheet [hidden],.si-sheet .no-share{display:none!important}" +
    ".si-ov{position:fixed;inset:0;z-index:1100;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;" +
    "padding:16px;background:rgba(6,10,8,.92);color:#F2E8D5;font-family:inherit}" +
    ".si-ov .si-msg{font-size:15px;letter-spacing:.12em;color:#E5CC8F;text-align:center;line-height:1.7}" +
    ".si-ov .si-pic{flex:1 1 auto;min-height:0;max-width:min(94vw,640px);overflow:auto;border-radius:6px;box-shadow:0 0 0 1px rgba(201,164,92,.5)}" +
    ".si-ov .si-pic img{display:block;width:100%;height:auto;-webkit-touch-callout:default}" +
    ".si-ov .si-bar{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}" +
    ".si-ov .si-bar button,.si-ov .si-bar a{font:inherit;font-size:14px;letter-spacing:.2em;text-indent:.2em;text-decoration:none;cursor:pointer;" +
    "color:#E5CC8F;background:rgba(10,17,13,.7);border:1px solid #9A8155;border-radius:2px;padding:8px 16px 7px}" +
    ".si-ov .si-bar .pri{color:#0D140F;background:linear-gradient(#E5CC8F,#C9A45C);border-color:#E5CC8F}" +
    ".si-ov .si-bar :focus-visible{outline:2px solid #E5CC8F;outline-offset:2px}" +
    ".si-ov .si-hint{font-size:12.5px;color:#A9B8AE;text-align:center;line-height:1.6}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  var libP = null;
  function loadLib() {
    if (window.html2canvas) return Promise.resolve();
    if (!libP) libP = new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = LIB;
      s.onload = function () { res(); };
      s.onerror = function () { libP = null; rej(new Error("lib")); };
      document.head.appendChild(s);
    });
    return libP;
  }
  function stamp() {
    var d = new Date(), p = function (n) { return String(n).padStart(2, "0"); };
    return { day: d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()), time: p(d.getHours()) + ":" + p(d.getMinutes()),
      file: "" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) };
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function waitImgs(root) {
    return Promise.all([].map.call(root.querySelectorAll("img"), function (im) {
      if (im.complete) return null;
      return new Promise(function (r) { im.onload = im.onerror = function () { r(); }; });
    }));
  }

  /* 牌面列：cards = [{ img, glyph, name, pos, rev }] */
  function cardRow(cards) {
    var row = el("div", "si-cards"), n = cards.length;
    var size = n > 12 ? " xs" : n > 5 ? " sm" : "";
    cards.forEach(function (c) {
      var box = el("div", "si-card" + size + (c.rev ? " rv" : ""));
      if (c.img) {
        var im = el("img", "si-face"); im.alt = "";
        im.onerror = function () { this.replaceWith(el("div", "si-glyph", c.glyph || "✦")); };   /* 離線又沒存過這張圖 */
        im.src = c.img; box.appendChild(im);
      }
      else box.appendChild(el("div", "si-glyph", c.glyph || "✦"));
      box.appendChild(el("b", null, (c.name || "") + (c.rev ? "（逆）" : "")));
      if (c.pos) box.appendChild(el("small", null, c.pos));
      row.appendChild(box);
    });
    return row;
  }

  /* 組出分享卡（暫時放進頁面，套用頁面原本的樣式），回傳 canvas */
  function render(o) {
    var t = stamp();
    var sheet = el("div", "si-sheet");
    sheet.appendChild(el("div", "si-head", o.title || document.title));
    sheet.appendChild(el("div", "si-sub", [t.day + " " + t.time].concat(o.lines || []).join("　・　")));
    if (o.q) sheet.appendChild(el("div", "si-q", "問：" + o.q));
    sheet.appendChild(el("div", "si-rule"));
    if (o.cards && o.cards.length) sheet.appendChild(cardRow(o.cards));
    (o.body || []).forEach(function (node) {
      if (!node) return;
      var c = node.cloneNode(true);
      /* 畫布不會跟著複製，手動抄過去 */
      var sc = node.querySelectorAll ? node.querySelectorAll("canvas") : [], dc = c.querySelectorAll ? c.querySelectorAll("canvas") : [];
      for (var i = 0; i < sc.length; i++) try { dc[i].getContext("2d").drawImage(sc[i], 0, 0); } catch (e) {}
      [].forEach.call(c.querySelectorAll("details"), function (d) { if (!d.open) d.classList.add("no-share"); });
      [].forEach.call(c.querySelectorAll(".ai-block, .ai-tools, #ai-links, .prompt-sec"), function (x) { x.remove(); });
      sheet.appendChild(c);
    });
    sheet.appendChild(el("div", "si-foot", "── 燭 光 ・ La Lumière des Chandelles ──"));
    document.body.appendChild(sheet);
    var ready = (document.fonts && document.fonts.ready) || Promise.resolve();
    return Promise.all([loadLib(), ready, waitImgs(sheet)]).then(function () {
      var w = sheet.offsetWidth, h = sheet.offsetHeight;
      var scale = Math.max(1, Math.min(MAX_SCALE, Math.sqrt(MAX_AREA / (w * h)), MAX_SIDE / h));
      return window.html2canvas(sheet, {
        scale: scale, backgroundColor: "#0D140F", logging: false, useCORS: true,
        scrollX: 0, scrollY: -window.scrollY,
        onclone: function (doc) { var s = doc.querySelector(".si-sheet"); if (s) s.style.opacity = "1"; }
      });
    }).then(function (cv) { sheet.remove(); return cv; }, function (e) { sheet.remove(); throw e; });
  }

  /* 預覽層 */
  var ov = null, url = null, back = null;
  function close() {
    if (!ov) return;
    ov.remove(); ov = null;
    if (url) { URL.revokeObjectURL(url); url = null; }
    document.removeEventListener("keydown", onKey, true);
    if (back && back.focus) try { back.focus({ preventScroll: true }); } catch (e) {}
  }
  function onKey(e) { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); } }
  function overlay(msg) {
    close();
    back = document.activeElement;
    ov = el("div", "si-ov");
    ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", "解讀分享圖");
    var m = el("div", "si-msg", msg); m.setAttribute("role", "status");
    ov.appendChild(m);
    var bar = el("div", "si-bar"), x = el("button", null, "關閉"); x.type = "button"; x.addEventListener("click", close);
    bar.appendChild(x); ov.appendChild(bar);
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    document.body.appendChild(ov);
    document.addEventListener("keydown", onKey, true);
    x.focus({ preventScroll: true });
    return { msg: m, bar: bar, close: x };
  }
  function show(blob, name, parts) {
    url = URL.createObjectURL(blob);
    parts.msg.textContent = "解讀分享圖畫好了";
    var pic = el("div", "si-pic"), img = el("img"); img.src = url; img.alt = "解讀分享圖";
    pic.appendChild(img); ov.insertBefore(pic, parts.bar);
    var file = null;
    try { file = new File([blob], name, { type: "image/png" }); } catch (e) {}
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      var sh = el("button", "pri", "分享"); sh.type = "button";
      sh.addEventListener("click", function () { navigator.share({ files: [file] }).catch(function () {}); });
      parts.bar.insertBefore(sh, parts.close);
    }
    var a = el("a", (file && navigator.canShare && navigator.canShare({ files: [file] })) ? "" : "pri", "下載圖片");
    a.href = url; a.download = name;
    parts.bar.insertBefore(a, parts.close);
    ov.appendChild(el("div", "si-hint", "手機也可以長按圖片，直接存進相簿。"));
    (parts.bar.querySelector(".pri") || a).focus({ preventScroll: true });
  }
  function run(o) {
    var parts = overlay("正在把這一盤畫成圖……");
    var name = (o.file || "燭光") + "-" + stamp().file + ".png";
    return render(o).then(function (cv) {
      return new Promise(function (res, rej) {
        try { cv.toBlob(function (b) { b ? res(b) : rej(new Error("blob")); }, "image/png"); } catch (e) { rej(e); }
      });
    }).then(function (blob) {
      if (!ov) return;
      show(blob, name, parts);
      if (/[?&]sharetest=/.test(location.search)) {
        var im = new Image(); im.src = url;
        im.onload = function () {
          document.title = "SHARE-OK " + im.naturalWidth + "x" + im.naturalHeight + " " + blob.size;
          if (/[?&]sharetest=2/.test(location.search)) {   /* 視覺驗證：整頁只留這張圖 */
            document.body.innerHTML = ""; document.body.style.background = "#000";
            im.style.cssText = "width:100%;height:auto;display:block"; document.body.appendChild(im);
          }
        };
      }
    }).catch(function (e) {
      if (!ov) return;
      parts.msg.textContent = location.protocol === "file:"
        ? "直接開檔案時，瀏覽器不准把牌面圖畫進圖片。請改用網址（例如 GitHub Pages）開啟。"
        : "這次沒畫成（" + (e && e.message || "未知錯誤") + "）。可以先用截圖代替。";
      if (/[?&]sharetest=/.test(location.search)) document.title = "SHARE-FAIL " + (e && e.message);
    });
  }
  /* 開發測試：?…&sharetest=1（標題回報尺寸）或 =2（整頁換成成品圖）——起盤測試鉤子跑完後自動按分享圖鈕 */
  if (/[?&]sharetest=/.test(location.search)) setTimeout(function () {
    var b = document.getElementById("btn-download") || document.getElementById("btn-panshot");
    if (b) b.click(); else document.title = "SHARE-NOBTN";
  }, 5000);
  window.ShareImage = { run: run, render: render, close: close };
})();
