/* 離線版：註冊 sw.js，並提供首頁「把牌面圖全部存起來」用的 Offline 介面。
 * 直接開檔案（file://）時瀏覽器不支援，自動略過。 */
(function () {
  "use strict";
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  });
  /* 開發測試：?swtest=1 → 等離線服務就緒，標題回報各存檔的檔數 */
  if (/[?&]swtest=1/.test(location.search)) setTimeout(function () {
    if (!/^SW-OK/.test(document.title)) navigator.serviceWorker.getRegistration().then(function (r) {
      document.title = "SW-WAIT " + (r ? [r.installing && "installing", r.waiting && "waiting", r.active && "active"].filter(Boolean).join(",") : "no-reg");
    });
  }, 12000);
  if (/[?&]swtest=1/.test(location.search)) navigator.serviceWorker.ready.then(function () {
    return new Promise(function (r) { setTimeout(r, 4000); });
  }).then(function () { return caches.keys(); }).then(function (ks) {
    return Promise.all(ks.map(function (k) { return caches.open(k).then(function (c) { return c.keys(); }).then(function (x) { return k + "=" + x.length; }); }));
  }).then(function (a) { document.title = "SW-OK " + (navigator.serviceWorker.controller ? "ctl " : "noctl ") + a.join(" "); });
  var IMG = "chandelles-img-v1";
  function list() { return fetch("offline-files.json", { cache: "no-cache" }).then(function (r) { return r.json(); }); }
  window.Offline = {
    /* 回傳 { total, saved, bytes }：清單上的牌面圖已存幾張 */
    status: function () {
      return list().then(function (L) {
        return caches.open(IMG).then(function (c) { return c.keys(); }).then(function (keys) {
          var have = new Set(keys.map(function (k) { return decodeURI(new URL(k.url).pathname).replace(/^.*?\/(cards[^/]*\/)/, "$1"); }));
          return { total: L.files.length, saved: L.files.filter(function (f) { return have.has(f); }).length, bytes: L.bytes };
        });
      });
    },
    /* 把清單上還沒存的圖逐一抓下來；onStep(done, total) */
    saveAll: function (onStep) {
      return Promise.all([list(), caches.open(IMG)]).then(function (a) {
        var files = a[0].files, c = a[1], i = 0, done = 0, fail = 0;
        function next() {
          if (i >= files.length) return Promise.resolve();
          var f = files[i++];
          return c.match(f).then(function (hit) {
            return hit || fetch(f).then(function (r) { if (!r.ok) throw 0; return c.put(f, r); });
          }).catch(function () { fail++; }).then(function () { done++; if (onStep) onStep(done, files.length); return next(); });
        }
        return Promise.all([next(), next(), next(), next(), next(), next()]).then(function () { return { total: files.length, fail: fail }; });
      });
    }
  };
})();
