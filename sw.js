/* 燭光・離線服務（Service Worker）
 * 安裝時：把十三個頁面，連同各頁引用的程式、樣式、圖示（照頁面上帶版本號的網址）一起存好——沒網路也能起卦、查字典。
 * 頁面：先上網拿最新版，斷線才用存檔。帶 ?v= 的程式／樣式：版本號一換就是新檔，存檔優先。
 * 牌面圖：看過就存（約百 MB，不在安裝時全抓）；首頁「離線版」可一次存齊（offline-files.json）。
 * AI 提示詞只是文字，複製出去要連網的是 AI 網站本身，不經過這裡。 */
"use strict";
const CORE = "chandelles-core-v1", IMG = "chandelles-img-v1", FONT = "chandelles-font-v1";
const PAGES = ["./", "index.html", "table.html", "yijing.html", "xiangqi.html", "astro.html", "bazi.html", "shi.html",
  "nanyang.html", "kaijuan.html", "shilun.html", "mbti.html", "mix.html", "numbers.html",
  "manifest.webmanifest", "vendor/html2canvas.min.js", "icons/app-192.png", "icons/app-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CORE);
    const assets = new Set();
    for (const p of PAGES) {
      try {
        const r = await fetch(p, { cache: "no-cache" });
        if (!r.ok) continue;
        if (/\.html$|\/$/.test(p) || p === "./") {
          const html = await r.clone().text();
          for (const m of html.matchAll(/(?:src|href)="([^"#:]+?\.(?:js|css|svg|png|webmanifest)(?:\?[^"]*)?)"/g)) assets.add(m[1]);
        }
        await c.put(p, r);
      } catch (err) { /* 單頁失敗不擋安裝 */ }
    }
    await Promise.all([...assets].map((a) => c.add(a).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keep = [CORE, IMG, FONT];
    for (const k of await caches.keys()) if (!keep.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function networkFirst(req) {
  const c = await caches.open(CORE);
  try {
    const r = await fetch(req);
    if (r.ok) c.put(req, r.clone());
    return r;
  } catch (err) {
    return (await c.match(req)) || (await c.match(req, { ignoreSearch: true })) || (await c.match("index.html"));
  }
}
async function cacheFirst(req, name, loose) {
  const hit = await caches.match(req);   /* 各存檔都找（圖示在安裝時存進 CORE） */
  if (hit) return hit;
  try {
    const r = await fetch(req);
    if (r.ok || r.type === "opaque") (await caches.open(name)).put(req, r.clone());
    return r;
  } catch (err) {
    const old = loose && await caches.match(req, { ignoreSearch: true });   /* 斷線又沒有這一版：先用舊版頂著 */
    if (old) return old;
    throw err;
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (req.mode === "navigate" || /\.html$/.test(url.pathname)) { e.respondWith(networkFirst(req)); return; }
    if (/\.(jpg|jpeg|png|webp|gif|svg)$/i.test(url.pathname)) { e.respondWith(cacheFirst(req, IMG, true)); return; }
    if (/\.(js|css|json|webmanifest)$/i.test(url.pathname)) {
      e.respondWith(url.search ? cacheFirst(req, CORE, true) : networkFirst(req));
      return;
    }
    return;
  }
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) e.respondWith(cacheFirst(req, FONT, false));
});
