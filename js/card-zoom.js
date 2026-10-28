/* 牌面大圖預覽（全站共用，自帶樣式）
 * 點任何牌面圖（src 在 assets/cards/ 底下、不是牌背、不在按鈕或連結裡）→ 全螢幕看大圖，附牌名與說明；Esc、點背景或「關閉」離開。
 * 牌桌館／易經館的牌陣由 table-engine.js 直接呼叫 CardZoom.open（帶正逆位與牌義）。 */
(function () {
  "use strict";
  if (window.CardZoom) return;
  var css = "" +
    ".cz-ov{position:fixed;inset:0;z-index:1000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;" +
    "padding:18px 16px;background:rgba(6,10,8,.9);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);opacity:0;transition:opacity .2s}" +
    ".cz-ov.on{opacity:1}" +
    ".cz-ov img{max-width:min(92vw,620px);max-height:calc(100vh - 170px);object-fit:contain;border-radius:10px;" +
    "box-shadow:0 18px 50px rgba(0,0,0,.7),0 0 0 1px rgba(201,164,92,.45);transform:scale(.96);transition:transform .25s}" +
    ".cz-ov.on img{transform:scale(1)}.cz-ov.rev img{transform:rotate(180deg) scale(.96)}.cz-ov.rev.on img{transform:rotate(180deg)}" +
    ".cz-cap{max-width:min(92vw,620px);text-align:center;color:#F2E8D5;font-family:inherit;line-height:1.6}" +
    ".cz-cap b{display:block;font-size:19px;color:#E5CC8F;letter-spacing:.1em}.cz-cap small{display:block;color:#A9B8AE;font-size:13px}" +
    ".cz-close{font:inherit;font-size:13.5px;letter-spacing:.3em;text-indent:.3em;color:#E5CC8F;background:rgba(10,17,13,.6);" +
    "border:1px solid #9A8155;border-radius:2px;padding:7px 18px 6px;cursor:pointer}.cz-close:hover,.cz-close:focus-visible{border-color:#E5CC8F;outline:none}" +
    "img.cz-able{cursor:zoom-in}" +
    "@media (prefers-reduced-motion:reduce){.cz-ov,.cz-ov img{transition:none}}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  var ov = null, back = null;
  function close() {
    if (!ov) return;
    var o = ov; ov = null;
    o.classList.remove("on");
    setTimeout(function () { o.remove(); }, 200);
    document.removeEventListener("keydown", onKey, true);
    if (back && back.focus) try { back.focus({ preventScroll: true }); } catch (e) {}
  }
  function onKey(e) { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); } }
  function open(o) {   /* o: { src, title, sub, text, rev } */
    if (!o || !o.src) return;
    close();
    back = document.activeElement;
    ov = document.createElement("div");
    ov.className = "cz-ov" + (o.rev ? " rev" : "");
    ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true");
    ov.setAttribute("aria-label", (o.title || "牌面") + "・大圖");
    var img = document.createElement("img"); img.src = o.src; img.alt = o.title || "";
    var cap = document.createElement("div"); cap.className = "cz-cap";
    if (o.title) { var b = document.createElement("b"); b.textContent = o.title + (o.rev ? "（逆位）" : ""); cap.appendChild(b); }
    if (o.sub) { var s = document.createElement("small"); s.textContent = o.sub; cap.appendChild(s); }
    if (o.text) { var t = document.createElement("div"); t.style.fontSize = "14px"; t.style.marginTop = "4px"; t.textContent = o.text; cap.appendChild(t); }
    var btn = document.createElement("button"); btn.type = "button"; btn.className = "cz-close"; btn.textContent = "關閉";
    ov.appendChild(img); ov.appendChild(cap); ov.appendChild(btn);
    ov.addEventListener("click", function (e) { if (e.target !== img) close(); });
    document.body.appendChild(ov);
    document.addEventListener("keydown", onKey, true);
    void ov.offsetWidth;   /* 先排版再加 on，淡入照樣有過場；不靠 requestAnimationFrame（背景分頁會被節流） */
    ov.classList.add("on");
    btn.focus({ preventScroll: true });
  }
  window.CardZoom = { open: open, close: close };

  /* 一般牌面圖：自動可點 */
  function able(img) {
    var src = img.getAttribute("src") || "";
    return /(^|\/)assets\/cards\//.test(src) && !/back\.(jpg|png|webp)$/.test(src) && !img.closest("button, a, .card3d, .cz-ov, .no-zoom");
  }
  document.addEventListener("click", function (e) {
    var img = e.target.closest && e.target.closest("img");
    if (!img || !able(img)) return;
    var fig = img.closest("figure"), cap = fig && fig.querySelector("figcaption");
    var rev = !!img.closest(".rv, .rev");
    open({ src: img.currentSrc || img.src, title: img.alt || (cap ? cap.textContent.trim() : ""), sub: cap && img.alt ? cap.textContent.trim() : "", rev: rev });
  });
  function mark(root) {
    (root.querySelectorAll ? root.querySelectorAll("img") : []).forEach(function (img) { if (able(img)) img.classList.add("cz-able"); });
  }
  function start() {
    mark(document);
    new MutationObserver(function (ms) {
      ms.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) { if (n.tagName === "IMG") { if (able(n)) n.classList.add("cz-able"); } else mark(n); } }); });
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();

  /* 開發測試：?zoomtest=1 → 3 秒後點第一張已翻開的牌陣牌（沒有就點第一張可放大的圖），開成功時標題為 ZOOM-OK */
  if (/[?&]zoomtest=1/.test(location.search)) setTimeout(function () {
    var t = document.querySelector(".card3d.revealed") || document.querySelector("img.cz-able");
    if (t) t.click();
    setTimeout(function () {
      var o = document.querySelector(".cz-ov"), r = o && o.getBoundingClientRect();
      document.title = o ? "ZOOM-OK " + Math.round(r.top) + "," + Math.round(r.height) + "/" + innerHeight + " op=" + getComputedStyle(o).opacity : "ZOOM-FAIL";
    }, 1000);
  }, 3000);
})();
