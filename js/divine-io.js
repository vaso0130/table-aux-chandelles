/* 紀錄匯出／匯入（全站共用，不依賴 divine-core／divine-ui；牌桌館也載入）
 * 匯出：本機所有 dc-*／lenormand-* 紀錄與設定 → 燭光專用檔 .chandelle
 *   檔頭 "CHDL" + 版本 1 + 旗標（bit0 有密碼、bit1 gzip）+ salt 16 + iv 12 + AES-GCM 密文
 *   金鑰＝PBKDF2(站內金鑰＋使用者密碼, salt)。不設密碼時金鑰寫在本檔，只防一般人打開、竄改（GCM 會驗出來）；
 *   設了密碼才是真正只有本人解得開。
 * 匯入：檔案合併進本機（歷史依時間去重合併、設定只補本機沒有的），或交給各館的手動輸入（DIO.manual）。
 * 單筆：DIO.exportOne(儲存鍵, 那一筆)——各館歷史每筆的「匯出」鈕呼叫，檔案格式相同，用同一個「匯入」讀回。
 * 各館：在 #hist-clear／#btn-hist-clear 旁自動加「匯出全部」「匯入」兩顆鈕；
 *   有手動輸入的館設 DIO.manual = { label: "…", run: function () {…} }。 */
(function () {
  var DIO = window.DIO = window.DIO || {};
  var MAGIC = [0x43, 0x48, 0x44, 0x4C], VER = 1, EXT = ".chandelle";
  var SITE_KEY = "La Lumière des Chandelles ✦ 燭光 ✦ 7f3c9a1e-b52d-4e08-a6d4-cc19e05b8d72";
  var HALL_HIST = "dc-hall-history", TABLE_HIST = "lenormand-history";
  var enc = new TextEncoder(), dec = new TextDecoder();
  var mine = function (k) { return /^(dc-|lenormand-)/.test(k); };

  function key(pass, salt) {
    return crypto.subtle.importKey("raw", enc.encode(SITE_KEY + "\u0000" + (pass || "")), "PBKDF2", false, ["deriveKey"])
      .then(function (base) {
        return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt, iterations: 150000, hash: "SHA-256" }, base,
          { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      });
  }
  function pipe(bytes, stream) { return new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer().then(function (b) { return new Uint8Array(b); }); }
  var canZip = typeof CompressionStream === "function" && typeof DecompressionStream === "function";

  function pack(obj, pass) {
    var raw = enc.encode(JSON.stringify(obj));
    var salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    var flags = (pass ? 1 : 0) | (canZip ? 2 : 0);
    return (canZip ? pipe(raw, new CompressionStream("gzip")) : Promise.resolve(raw)).then(function (body) {
      return key(pass, salt).then(function (k) { return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv, additionalData: new Uint8Array(MAGIC.concat([VER, flags])) }, k, body); });
    }).then(function (ct) {
      var out = new Uint8Array(6 + 16 + 12 + ct.byteLength);
      out.set(MAGIC, 0); out[4] = VER; out[5] = flags; out.set(salt, 6); out.set(iv, 22); out.set(new Uint8Array(ct), 34);
      return out;
    });
  }
  function head(bytes) {
    if (bytes.length < 50 || MAGIC.some(function (b, i) { return bytes[i] !== b; })) throw new Error("這不是燭光的紀錄檔。");
    if (bytes[4] !== VER) throw new Error("這個紀錄檔的版本比網站新，請重新整理網頁後再試。");
    return { flags: bytes[5], needPass: !!(bytes[5] & 1) };
  }
  function unpack(bytes, pass) {
    var h = head(bytes), salt = bytes.slice(6, 22), iv = bytes.slice(22, 34), ct = bytes.slice(34);
    return key(pass, salt).then(function (k) {
      return crypto.subtle.decrypt({ name: "AES-GCM", iv: iv, additionalData: bytes.slice(0, 6) }, k, ct);
    }).catch(function () {
      throw new Error(h.needPass ? "密碼不對，或檔案已經損壞。" : "檔案已經損壞，或被改動過。");
    }).then(function (body) {
      body = new Uint8Array(body);
      if (!(h.flags & 2)) return body;
      if (!canZip) throw new Error("這個瀏覽器太舊，解不開壓縮過的紀錄檔。");
      return pipe(body, new DecompressionStream("gzip"));
    }).then(function (raw) {
      var o = JSON.parse(dec.decode(raw));
      if (!o || o.app !== "chandelles" || typeof o.data !== "object") throw new Error("紀錄檔內容不完整。");
      return o;
    });
  }

  /* ── 收集／合併 ── */
  function collect() {
    var data = {};
    for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (mine(k)) data[k] = localStorage.getItem(k); }
    return { app: "chandelles", v: VER, at: Date.now(), data: data };
  }
  function arr(s) { try { var a = JSON.parse(s || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function mergeList(k, incoming, idOf, timeOf, cap) {
    var cur = arr(localStorage.getItem(k)), seen = {}, added = 0;
    cur.forEach(function (r) { seen[idOf(r)] = 1; });
    arr(incoming).forEach(function (r) { if (r && !seen[idOf(r)]) { seen[idOf(r)] = 1; cur.push(r); added++; } });
    cur.sort(function (a, b) { return timeOf(b) - timeOf(a); });
    if (cap) cur = cur.slice(0, cap);
    for (;;) {   /* 存不下就從最舊的讓位 */
      try { localStorage.setItem(k, JSON.stringify(cur)); break; } catch (e) { if (cur.length <= 1) break; cur.pop(); }
    }
    return added;
  }
  function merge(o) {
    var d = o.data, n = 0, prefs = 0;
    if (d[HALL_HIST]) n += mergeList(HALL_HIST, d[HALL_HIST], function (r) { return r.t + "|" + r.page; }, function (r) { return r.t; });
    if (d[TABLE_HIST]) n += mergeList(TABLE_HIST, d[TABLE_HIST], function (r) { return r.id; }, function (r) { return r.id; }, 50);
    Object.keys(d).forEach(function (k) {
      if (!mine(k) || k === HALL_HIST || k === TABLE_HIST) return;
      if (localStorage.getItem(k) === null) { try { localStorage.setItem(k, d[k]); prefs++; } catch (e) {} }
    });
    return { n: n, prefs: prefs };
  }

  /* ── 對話框（與各館的紙面 dialog.note 同樣式） ── */
  function dialog(html, wire) {
    var dlg = document.createElement("dialog");
    dlg.className = "note dio";
    dlg.innerHTML = '<form method="dialog">' + html + "</form>";
    document.body.appendChild(dlg);
    dlg.addEventListener("close", function () { dlg.remove(); });
    if (wire) wire(dlg);
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
    return dlg;
  }
  function tell(msg) {
    var p = document.createElement("p"); p.textContent = msg;
    dialog(p.outerHTML + '<div class="note-actions"><button class="ghost-btn dark" value="ok">知道了</button></div>');
  }
  function askPass(title, note, confirm) {
    return new Promise(function (res) {
      dialog('<p>' + title + '</p><p style="font-size:13px;opacity:.8;margin-top:-10px">' + note + '</p>' +
        '<input type="password" class="dio-pass" autocomplete="new-password" placeholder="密碼" style="' + INPUT + '">' +
        (confirm ? '<input type="password" class="dio-pass2" autocomplete="new-password" placeholder="再輸入一次" style="' + INPUT + 'margin-top:8px">' : "") +
        '<p class="dio-err" style="color:#A8302A;font-size:13px;margin:8px 0 0" hidden></p>' +
        '<div class="note-actions" style="margin-top:16px"><button class="ghost-btn dark" value="cancel" formnovalidate>取消</button><button class="ghost-btn dark dio-ok" value="ok">確定</button></div>',
        function (dlg) {
          var p1 = dlg.querySelector(".dio-pass"), p2 = dlg.querySelector(".dio-pass2"), err = dlg.querySelector(".dio-err"), done = false;
          dlg.querySelector(".dio-ok").addEventListener("click", function (e) {
            if (p2 && p1.value !== p2.value) { e.preventDefault(); err.textContent = "兩次輸入的密碼不一樣。"; err.hidden = false; return; }
            done = true; res(p1.value);
          });
          dlg.addEventListener("close", function () { if (!done) res(null); });
          setTimeout(function () { p1.focus(); }, 30);
        });
    });
  }
  var INPUT = "display:block;width:100%;box-sizing:border-box;padding:9px 10px;font:inherit;font-size:15px;border:1px solid rgba(138,114,69,.6);border-radius:3px;background:rgba(255,255,255,.55);color:inherit;";

  /* ── 匯出 ── */
  function stamp(t) { var d = new Date(t), pad = function (x) { return (x < 10 ? "0" : "") + x; }; return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "-" + pad(d.getHours()) + pad(d.getMinutes()); }
  DIO.exportAll = function () {
    var o = collect(), nh = arr(o.data[HALL_HIST]).length + arr(o.data[TABLE_HIST]).length;
    exportDialog(o, "匯出全部紀錄", "會把這台裝置上各館的占卜歷史（" + nh + " 筆）與偏好設定", "chandelles-" + stamp(Date.now()));
  };
  /* 單筆：key 是紀錄所在的儲存鍵（dc-hall-history／lenormand-history），rec 是那一筆；匯入時照常合併、不帶設定 */
  DIO.exportOne = function (key, rec) {
    var data = {}; data[key] = JSON.stringify([rec]);
    exportDialog({ app: "chandelles", v: VER, at: Date.now(), data: data }, "匯出這一筆紀錄", "會把這一筆占卜（含問題、結果與提示詞）",
      "chandelles-1筆-" + stamp(rec.t || rec.id || Date.now()));
  };
  function exportDialog(o, title, what, base) {
    dialog('<p>' + title + '</p><p style="font-size:13.5px;margin-top:-8px">' + what + '，存成一個「' + EXT + '」燭光專用檔，只有這個網站讀得開；在別台裝置按「匯入」就能讀回。<br>' +
      '想更保險，可以再加一組密碼；之後匯入時要輸入同一組密碼，忘了就打不開。</p>' +
      '<div class="note-actions"><button class="ghost-btn dark" value="cancel">取消</button><button class="ghost-btn dark dio-pw" value="pw">加密碼匯出</button><button class="ghost-btn dark dio-go" value="go">直接匯出</button></div>',
      function (dlg) {
        dlg.querySelector(".dio-go").addEventListener("click", function () { run(""); });
        dlg.querySelector(".dio-pw").addEventListener("click", function () {
          setTimeout(function () {
            askPass("設定這個檔案的密碼", "匯入時要輸入同一組密碼。", true).then(function (p) { if (p) run(p); else if (p === "") tell("沒有輸入密碼，這次沒有匯出。"); });
          }, 0);
        });
      });
    function run(pass) {
      pack(o, pass).then(function (bytes) {
        var name = base + EXT;
        var a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
        a.download = name; document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
        DIO.lastExport = bytes; DIO.lastExportName = name;   /* 測試用 */
      }).catch(function (e) { tell("匯出失敗：" + (e && e.message || e)); });
    }
  }

  /* ── 匯入 ── */
  DIO.importBytes = function (bytes, pass) {   /* 回傳 Promise<{n, prefs}>；需要密碼而未給時丟 {needPass:true} */
    var h = head(bytes);
    if (h.needPass && pass == null) return Promise.reject({ needPass: true });
    return unpack(bytes, pass).then(merge);
  };
  function importFile(file) {
    file.arrayBuffer().then(function (buf) {
      var bytes = new Uint8Array(buf), h;
      try { h = head(bytes); } catch (e) { tell(e.message); return; }
      (h.needPass ? askPass("這個紀錄檔有密碼", "請輸入匯出時設定的密碼。") : Promise.resolve(""))
        .then(function (p) {
          if (p === null) return;
          return DIO.importBytes(bytes, p).then(function (r) {
            var msg = r.n ? "已匯入 " + r.n + " 筆新紀錄。" : "檔案裡的紀錄這台裝置都已經有了，沒有新增。";
            if (r.prefs) msg += "\n另外補上了 " + r.prefs + " 項本機原本沒有的設定。";
            msg += "\n\n每一館的歷史最多保留最近 30 筆（牌桌館 50 筆），之後再占卜時，更早的紀錄會讓位。";
            dialog('<p style="white-space:pre-line"></p><div class="note-actions"><button class="ghost-btn dark" value="ok">好，重新整理</button></div>', function (dlg) {
              dlg.querySelector("p").textContent = msg;
              dlg.addEventListener("close", function () { location.reload(); });
            });
          });
        })
        .catch(function (e) { tell(e && e.message ? e.message : "匯入失敗。"); });
    });
  }
  DIO.importAll = function () {
    var m = DIO.manual;
    dialog('<p>匯入</p><p style="font-size:13.5px;margin-top:-8px">從之前匯出的「' + EXT + '」燭光紀錄檔讀回歷史' +
      (m ? '，或把你在實體牌桌上已經抽好的' + m.what + '手動輸入，直接產生解讀與提示詞。' : "。") + '</p>' +
      '<div class="note-actions"><button class="ghost-btn dark" value="cancel">取消</button>' +
      (m ? '<button class="ghost-btn dark dio-man" value="man">' + m.label + "</button>" : "") +
      '<button class="ghost-btn dark dio-file" value="file">選擇紀錄檔</button></div>',
      function (dlg) {
        dlg.querySelector(".dio-file").addEventListener("click", function () {
          var inp = document.createElement("input");
          inp.type = "file"; inp.accept = EXT + ",application/octet-stream";
          inp.onchange = function () { if (inp.files[0]) importFile(inp.files[0]); };
          inp.click();
        });
        if (m) dlg.querySelector(".dio-man").addEventListener("click", function () { setTimeout(m.run, 0); });
      });
  };

  /* ── 在各館歷史區加按鈕 ── */
  function mount() {
    var anchor = document.getElementById("hist-clear") || document.getElementById("btn-hist-clear");
    if (!anchor || document.getElementById("dio-export")) return;
    var row = anchor.parentNode;
    var be = document.createElement("button"); be.className = "ghost-btn"; be.id = "dio-export"; be.textContent = "匯出全部"; be.type = "button";
    var bi = document.createElement("button"); bi.className = "ghost-btn"; bi.id = "dio-import"; bi.textContent = "匯入"; bi.type = "button";
    be.onclick = DIO.exportAll; bi.onclick = DIO.importAll;
    row.insertBefore(bi, anchor); row.insertBefore(be, bi);
    if (!row.style.gap) { row.style.display = "flex"; row.style.flexWrap = "wrap"; row.style.gap = "10px"; row.style.justifyContent = "center"; }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
