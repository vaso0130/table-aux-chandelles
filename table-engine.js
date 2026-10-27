"use strict";

/* 牌卡資料外置於 cards-data.js——缺檔即明示（整包複製時勿漏檔） */
if (typeof LEN_CARDS === "undefined" || typeof DECKS === "undefined") {
  document.body.innerHTML = "<p style='padding:40px;font-size:18px;color:#E8DCC2'>缺少 cards-data.js——請確認它與 index.html 在同一資料夾。</p>";
  throw new Error("cards-data.js missing");
}


/* 紙面對話框：取代 alert/confirm。回傳 Promise<boolean>（按「ok」為 true，Esc 或取消為 false） */
function say(msg, opts = {}) {
  const dlg = document.getElementById("note");
  if (!dlg || typeof dlg.showModal !== "function") return Promise.resolve(opts.cancel ? confirm(msg) : (alert(msg), true));
  return new Promise((res) => {
    document.getElementById("note-text").textContent = msg;
    const ok = document.getElementById("note-ok"), cancel = document.getElementById("note-cancel");
    ok.textContent = opts.ok || "知道了";
    cancel.hidden = !opts.cancel; cancel.textContent = opts.cancel || "";
    const done = () => { dlg.removeEventListener("close", done); res(dlg.returnValue === "ok"); };
    dlg.addEventListener("close", done);
    dlg.returnValue = "";
    dlg.showModal();
    (opts.cancel ? cancel : ok).focus();
  });
}

/* 館別設定（各館頁面在載入本檔前設 window.TABLE_HALL）：
   decks＝只收這些牌組／exclude＝排除這些牌組；lastKey＝記住上次牌組盤面的鍵；titlePrefix＝分頁標題與分享文字的館名 */
const HALL = Object.assign({ lastKey: "lenormand-last", titlePrefix: "燭光牌桌" }, window.TABLE_HALL || {});
const HALL_DECKS = DECKS.filter((d) => (HALL.decks ? HALL.decks.includes(d.id) : !(HALL.exclude || []).includes(d.id)));
const inHall = (id) => HALL_DECKS.some((d) => d.id === id);
const HALLS = [["west","西方館"], ["east","東方館"]];
let deckDef = HALL_DECKS[0];
document.body.dataset.deck = deckDef.id;
let CARDS = deckDef.cards;      /* 目前牌組的牌（其餘程式一律讀這兩個） */
let SPREADS = deckDef.spreads;

/* ── 狀態 ─────────────────────────────────── */
let spread = null;     // 當前盤面
let deck = [];         // 目前牌序（索引指向 CARDS；由使用者親手洗切）
let drawn = [];        // 已抽出的牌（依槽位順序）
let drawnRev = [];     // 與 drawn 對應的正逆位（true＝逆位；僅正逆位牌組使用）
let target = 0;        // 本輪需抽的張數（補牌後會增加）
let phase = "ritual";  // ritual（洗切牌）→ draw（抽牌）
let shuffleCount = 0, cutCount = 0, ritualBusy = false;
let autoTimer = null;

const $ = (s) => document.querySelector(s);
const elSpreads = $("#spreads"), elTable = $("#table"), elSlots = $("#slots");
const elFan = $("#fan"), elCaption = $("#deck-caption"), elAuto = $("#btn-auto");
const elReading = $("#reading"), elEntries = $("#entries"), elCombos = $("#combos");
const elClosing = $("#closing"), elExtend = $("#btn-extend");
const elAiBlock = $("#ai-block"), elAiPrompt = $("#ai-prompt");
const elRitual = $("#ritual"), elRitualCaption = $("#ritual-caption");
const elStack = $("#stack"), elStackWrap = $("#stack-wrap");
const elCutPiles = $("#cut-piles");
const btnShuffle = $("#btn-shuffle"), btnCut = $("#btn-cut"), btnBegin = $("#btn-begin"), btnQuick = $("#btn-quick");
const elFanScroll = $("#fan-scroll");
const elDrawStage = $("#draw-stage"), elDrawPile = $("#draw-pile"), elPileWrap = $("#draw-pile-wrap");
const elPileCount = $("#pile-count"), btnMode = $("#btn-mode"), elScrollHint = $("#scroll-hint");
const elSlotsScroll = $("#slots-scroll");
let drawMode = "pile";   /* pile=命運牌堆（預設） / fan=攤牌親挑 */

/* 橫捲 affordance:內容比容器寬才加漸層遮罩與提示；滾輪可橫捲 */
function refreshScrollables() {
  [elSlotsScroll, elFanScroll].forEach((el) => {
    el.classList.toggle("can-scroll", el.scrollWidth > el.clientWidth + 4);
  });
  elScrollHint.hidden = !(elSlotsScroll.scrollWidth > elSlotsScroll.clientWidth + 4);
}
[elSlotsScroll, elFanScroll].forEach((el) => {
  el.addEventListener("wheel", (e) => {
    if (e.deltaY && !e.deltaX && el.scrollWidth > el.clientWidth) { el.scrollLeft += e.deltaY; e.preventDefault(); }
  }, { passive: false });
});
window.addEventListener("resize", () => refreshScrollables());

/* 儀式步驟指示器 */
function ritualSteps() {
  const st = { shuffle: shuffleCount > 0 ? "done" : "on", cut: "", draw: "" };
  if (shuffleCount > 0) st.cut = cutCount > 0 ? "done" : "on";
  if (shuffleCount > 0) st.draw = phase === "draw" ? "done" : (cutCount > 0 ? "on" : "");
  if (shuffleCount > 0 && cutCount === 0) st.draw = "on";   /* 切牌可略：洗過即可抽 */
  document.querySelectorAll(".rstep").forEach((el) => {
    el.classList.toggle("on", st[el.dataset.step] === "on");
    el.classList.toggle("done", st[el.dataset.step] === "done");
  });
}

/* 專屬卡背：每副牌一款，載入成功才啟用圖片卡背 */
function applyDeckBack() {
  const src = deckDef.back;
  const probe = new Image();
  probe.onload = () => {
    document.body.classList.add("has-back");
    document.body.style.setProperty("--back-url", `url("${src}")`);
  };
  probe.onerror = () => document.body.classList.remove("has-back");
  probe.src = src;
}
applyDeckBack();

/* 加密級 0–1 隨機數 */

/* 真實鴿尾式洗牌（GSR 模型）：
   以二項分布把牌切成兩疊，再依兩疊剩餘張數的比例交錯落牌。
   每按一次「洗牌」執行一次；約七次後牌序即接近完全隨機。 */
function riffle(arr) {
  let cutN = 0;
  for (let i = 0; i < arr.length; i++) if (DC.rand01() < 0.5) cutN++;
  const left = arr.slice(0, cutN), right = arr.slice(cutN);
  const out = [];
  let li = 0, ri = 0;
  while (li < left.length || ri < right.length) {
    const lRemain = left.length - li, rRemain = right.length - ri;
    if (DC.rand01() < lRemain / (lRemain + rRemain)) out.push(left[li++]);
    else out.push(right[ri++]);
  }
  return out;
}

/* 真實切牌：把第 pos 張（0 起算）切成新牌頂 */
function cutDeck(arr, pos) {
  return arr.slice(pos).concat(arr.slice(0, pos));
}

/* ── 牌組選單（依館分組） ─────────────────── */
const elDecks = $("#decks");
HALLS.forEach(([hid, hname]) => {
  const list = HALL_DECKS.filter((d) => d.hall === hid);
  if (!list.length) return;
  const wrap = document.createElement("div");
  wrap.className = "hall";
  const label = document.createElement("div");
  label.className = "hall-label";
  label.textContent = hname;
  wrap.appendChild(label);
  const row = document.createElement("div");
  row.className = "hall-decks";
  list.forEach((d) => {
    const b = document.createElement("button");
    b.className = "deck-btn" + (d === deckDef ? " active" : "");
    b.dataset.deck = d.id;
    b.innerHTML = `<span class="d-name">${d.name}</span><span class="d-sub">${d.short}</span>`;
    b.addEventListener("click", () => selectDeck(d));
    row.appendChild(b);
  });
  wrap.appendChild(row);
  elDecks.appendChild(wrap);
});

function selectDeck(d) {
  if (deckDef === d) return;
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  deckDef = d;
  document.body.dataset.deck = d.id;
  CARDS = d.cards;
  SPREADS = d.spreads;
  $("#q-input").value = "";
  try { localStorage.setItem(HALL.lastKey, JSON.stringify({ deck: d.id })); } catch (e) {}
  document.querySelectorAll(".deck-btn").forEach((b) => b.classList.toggle("active", b.dataset.deck === d.id));
  document.title = `${HALL.titlePrefix} ─ ${d.title}`;
  $(".subtitle").textContent = d.sub;
  buildSpreadMenu();
  applyDeckBack();
  spread = null;
  elTable.classList.remove("on");
  elReading.classList.remove("on");
  hideTip();
  if (typeof renderDict === "function") renderDict();
  if (typeof renderGuide === "function") renderGuide();
}

/* ── 盤面選單 ─────────────────────────────── */
const NUMERALS = ["壹","貳","參","肆","伍","陸","柒","捌","玖","拾","拾壹","拾貳","拾參","拾肆","拾伍","拾陸"];
function buildSpreadMenu() {
  elSpreads.innerHTML = "";
  let last = null;
  try { last = JSON.parse(localStorage.getItem(HALL.lastKey) || "null"); } catch (e) {}
  const groups = deckDef.id === "yi" ? [   /* 易經：筮法起卦與以牌取象分開，免得「2 張」讓人以為擲卦是抽牌 */
    ["起卦・筮法", (s) => s.cast],
    ["以牌取象", (s) => !s.cast],
  ] : [
    ["日常快抽", (s) => s.count <= 3],
    ["主題牌陣", (s) => s.count > 3 && s.count < 12],
    ["全盤大陣", (s) => s.count >= 12],
  ];
  let idx = 0;
  groups.forEach(([gname, test]) => {
    const list = SPREADS.filter(test);
    if (!list.length) return;
    if (SPREADS.length > 6) {   /* 盤面多才分組，免得小牌組被切碎 */
      const lab = document.createElement("div");
      lab.className = "hall-label spread-group";
      lab.textContent = gname;
      elSpreads.appendChild(lab);
    }
    list.forEach((s) => {
      const b = document.createElement("button");
      b.className = "spread-btn";
      b.dataset.sid = s.id;
      const lastMark = last && last.deck === deckDef.id && last.spread === s.id ? '<span class="s-last">上次</span>' : "";
      b.innerHTML = `<div class="s-row">
          <span class="s-idx">${NUMERALS[idx] || idx + 1}</span>
          <span class="s-name">${s.name}</span>${lastMark}
          <span class="s-leader"></span>
          <span class="s-count">${s.cast ? "六爻" : `${s.count} 張`}</span>
        </div>
        <div class="s-desc">${s.desc}</div>`;
      b.addEventListener("click", () => selectSpread(s, b));
      elSpreads.appendChild(b);
      idx++;
    });
  });
}
buildSpreadMenu();
/* 記住上次牌組：回訪自動切到上次使用的牌組 */
try {
  const last = JSON.parse(localStorage.getItem(HALL.lastKey) || "null");
  if (last && last.deck && last.deck !== deckDef.id) {
    const d0 = HALL_DECKS.find((x) => x.id === last.deck);
    if (d0) selectDeck(d0);
  }
} catch (e) {}

function preloadCards() {
  if (!deckDef.preload || deckDef.preloaded) return;
  deckDef.preloaded = true;
  /* 洗切牌的空檔預載全部牌面，翻牌時圖已在快取 */
  CARDS.forEach((c) => { if (c.img) { const i = new Image(); i.src = c.img; } });
}

function selectSpread(s, btn) {
  document.querySelectorAll(".spread-btn").forEach((x) => x.classList.remove("active"));
  btn.classList.add("active");
  spread = s;
  /* 問題保留——換盤面不清空（換牌組才清） */
  resetTable();
  preloadCards();
  elTable.classList.add("on");
  elTable.scrollIntoView({ behavior: "smooth", block: "start" });
  try { localStorage.setItem(HALL.lastKey, JSON.stringify({ deck: deckDef.id, spread: s.id })); } catch (e) {}
}

$("#btn-reset").addEventListener("click", resetTable);

function resetTable() {
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  deck = CARDS.map((_, i) => i);   /* 出廠順序——牌序全由你的手決定 */
  drawn = [];
  drawnRev = [];
  target = spread.count;
  phase = "ritual";
  shuffleCount = 0; cutCount = 0; ritualBusy = false;
  $("#spread-title").textContent = spread.name;
  $("#spread-hint").textContent = spread.cast
    ? (spread.method === "yarrow" ? "分二、掛一、揲四、歸奇，三變成一爻。十八變之後，動爻與之卦自現。"
      : spread.najia ? "三枚銅錢擲六次起卦。成卦當刻記為月建、日辰，裝卦排盤。" : spread.yilin ? "三枚銅錢擲六次起卦，本卦配之卦，查《焦氏易林》一條林辭。" : "三枚銅錢擲六次起卦。擲出動爻，之卦自現。")
    : spread.sig
    ? `可先指定一張指示牌置中，或不指定——${spread.count === 9 ? "九" : "五"}張全憑抽。`
    : spread.gt
    ? "洗牌切牌之後抽牌入盤——或交給命運一次抽完。"
    : "先洗牌、切牌，再點選你被吸引的那幾張。";
  $("#btn-reset").textContent = spread.cast ? "重新起卦" : "重新洗牌";
  buildSlots();
  buildStack();
  /* 擲卦盤面：以銅錢起卦，不走洗切抽流程 */
  const isCast = !!spread.cast;
  elCast.hidden = !isCast;
  if (isCast) {
    phase = "cast";
    castLines = [];
    castInfo = null;
    castBusy = false;   /* 拋擲中重設不卡死 */
    btnThrow.disabled = false;
    const yarrow = spread.method === "yarrow";
    $("#cast-caption").textContent = yarrow
      ? "五十策去其一，四十九策在手。每爻三變：分二、掛一、揲四、歸奇。由下而上，六爻成卦。"
      : "三枚銅錢，擲六次。由下而上，六爻成卦。";
    btnThrow.textContent = yarrow ? "揲 蓍" : "擲 錢";
    $("#coin-stage").hidden = yarrow;
    $("#stalk-stage").hidden = !yarrow;
    if (yarrow) buildStalks();
    renderCastLines();
  }
  /* 十字陣：可先擇指示牌置中，或不指定全憑抽 */
  sigPicked = null;
  const isSig = !!spread.sig;
  elSigPick.hidden = !isSig;
  if (isSig) { phase = "sig"; renderSigPick(); }
  elRitual.hidden = isCast || isSig;
  elStackWrap.hidden = false;
  elCutPiles.hidden = true;
  elCutPiles.innerHTML = "";
  $("#cut-fan-scroll").hidden = true;
  $("#cut-fan").innerHTML = "";
  $("#cut-tools").hidden = true;
  btnBegin.disabled = true;
  btnCut.textContent = "切 牌";
  elRitualCaption.textContent = "先洗牌，把牌序交給你的手。切不切牌隨你，然後抽牌。"
    + (spread.count >= 12 ? "（大陣可用「讓命運抽完」一次補齊）" : "");
  ritualSteps();
  elCaption.hidden = true;
  elDrawStage.hidden = true;
  elFanScroll.hidden = true;
  drawMode = "pile";
  elFan.innerHTML = "";
  refreshScrollables();
  elEntries.innerHTML = "";
  elCombos.innerHTML = "";
  elClosing.hidden = true;
  elReading.classList.remove("on");
  elAuto.hidden = true;
  elExtend.hidden = true;
  elAiBlock.hidden = true;
  elAiPrompt.hidden = true;
  elAiPrompt.value = "";
  $("#btn-copy").hidden = true;
  $("#ai-links").hidden = true;
  updateInvocation();
}

/* ── 起卜默唸：占卜前的儀式提醒 ──────────────
   易經誦朱子《筮儀》命筮辭；其餘牌組各有默唸引。問題即時代入。 */
const INVOCATIONS = {
  yi:  (q) => `假爾泰筮有常，假爾泰筮有常。<br>弟子〔默唸姓名〕，今以 ${q} 未知可否，爰質所疑于神于靈。<br>吉凶得失，悔吝憂虞，惟爾有神，尚明告之。`,
  len: (q) => `燭已點好，先靜三息。我為此事而來：${q}——願三十六張小圖，直言不諱。`,
  sib: (q) => `西碧拉夫人，市井之聲皆是預言。今問：${q}——請以人情世故，說我聽得懂的話。`,
  bel: (q) => `諸星在上，靈使引路。今以 ${q} 相叩——願星辰之語，落於牌面。`,
  kip: (q) => `人物登場，各就其位。我所問者：${q}——請眾人物演給我看，來者是誰、去向何方。`,
  gra: (q) => `神話的長河，眾英雄靜聽。今有一問：${q}——請以古老的故事，映照眼前的路。`,
  run: (q) => `眾神之文，奧丁所懸。我以誠心問盧恩：${q}——願刻痕顯義，風霜作證。`,
  esp: (q) => `四十張古牌，金杯劍棒。今問：${q}——請以古伊比利的直白，賜我一句準話。`,
  zw:  (q) => `斗數眾星，各安其垣。今以 ${q} 叩問——願星曜借牌現身，明示吉凶。`,
  dt:  (q) => `四象環列，青龍白虎朱雀玄武。今問：${q}——願陰陽有應，卦象有靈。`,
};
const elInv = $("#invocation"), elInvText = $("#inv-text"), elInvHead = $("#inv-head");
function updateInvocation() {
  if (!spread || !deckDef) { elInv.hidden = true; return; }
  const raw = $("#q-input").value.trim();
  const q = raw
    ? "「<b>" + raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</b>」"
    : "「<b>心中默想之事</b>」";
  elInvText.innerHTML = (INVOCATIONS[deckDef.id] || INVOCATIONS.len)(q);
  elInv.hidden = false;
}
$("#q-input").addEventListener("input", () => { if (!elInv.hidden) updateInvocation(); });
try { if (localStorage.getItem("lenormand-inv-fold") === "1") { elInv.classList.add("folded"); elInvHead.setAttribute("aria-expanded", "false"); } } catch (e) {}
elInvHead.addEventListener("click", () => {
  const folded = elInv.classList.toggle("folded");
  elInvHead.setAttribute("aria-expanded", String(!folded));
  try { localStorage.setItem("lenormand-inv-fold", folded ? "1" : "0"); } catch (e) {}
});

/* ── 洗牌與切牌儀式 ───────────────────────── */
function buildStack() {
  elStack.innerHTML = "";
  for (let i = 0; i < 12; i++) {
    const c = document.createElement("div");
    c.className = "stack-card";
    c.style.transform = `translate(${(i % 3) - 1}px, ${-i * 1.2}px) rotate(${(i % 5) - 2}deg)`;
    elStack.appendChild(c);
  }
}

function ritualStatus() {
  let s;
  if (shuffleCount === 0) {
    s = cutCount > 0 ? `切了 ${cutCount} 次，但還沒洗牌。` : "還沒洗牌。";
  } else {
    s = shuffleCount < 7 ? `洗了 ${shuffleCount} 次，再洗幾次會更勻` : `洗了 ${shuffleCount} 次，牌序已經夠亂了`;
    if (cutCount > 0) s += `，切了 ${cutCount} 次`;
    s += "。隨時可以抽。";
  }
  elRitualCaption.textContent = s;
  ritualSteps();
}

function shuffleOnce(animate) {
  deck = riffle(deck);
  shuffleCount++;
  if (!animate) return;
  const cards = [...elStack.children];
  elStack.classList.remove("shimmer"); void elStack.offsetWidth; elStack.classList.add("shimmer");
  /* 第一段：鴿尾式分半——偶數張出左、奇數張出右，外旋微沉 */
  cards.forEach((c, i) => {
    const left = i % 2 === 0;
    c.style.transitionDelay = i * 9 + "ms";
    c.style.transform = `translate(${left ? -76 : 76}px, ${8 + (i % 4) * 3}px) rotate(${left ? -13 : 13}deg)`;
  });
  /* 第二段：左右輪流交錯回插（逐張 stagger,overshoot 曲線自帶回彈） */
  setTimeout(() => {
    cards.forEach((c, i) => {
      c.style.transitionDelay = i * 18 + "ms";
      c.style.transform = `translate(${(i % 3) - 1}px, ${-i * 1.2}px) rotate(${(i % 5) - 2}deg)`;
    });
  }, 210);
  setTimeout(() => {
    cards.forEach((c) => { c.style.transitionDelay = ""; });
    ritualBusy = false;
  }, 210 + cards.length * 18 + 400);
}

btnShuffle.addEventListener("click", () => {
  if (ritualBusy || phase !== "ritual") return;
  ritualBusy = true;
  if (!elCutPiles.hidden || !elCutFanScroll.hidden) exitCutView();
  shuffleOnce(true);   /* 牌序真的改變：一次鴿尾式交錯洗牌 */
  ritualStatus();
  btnBegin.disabled = false;
  btnBegin.title = "";
});

/* 切牌雙模式：三疊（淺/中/深切口）或攤牌親切（點哪張就從那張切開） */
const elCutFanScroll = $("#cut-fan-scroll"), elCutFan = $("#cut-fan"), elCutTools = $("#cut-tools"), btnCutMode = $("#btn-cutmode");
let cutMode = "piles";   // "piles" | "fan"

function buildCutPiles() {
  elCutPiles.innerHTML = "";
  const N = deck.length;
  const cuts = [
    [Math.max(1, Math.round(N * (0.20 + DC.rand01() * 0.10))), "淺 切"],
    [Math.round(N * (0.45 + DC.rand01() * 0.10)), "中 切"],
    [Math.min(N - 1, Math.round(N * (0.70 + DC.rand01() * 0.10))), "深 切"],
  ];
  cuts.forEach(([pos, label]) => {
    const b = document.createElement("button");
    b.className = "cut-pile";
    b.title = `提起 ${pos} 張——自第 ${pos + 1} 張切起`;
    b.setAttribute("aria-label", `${label}:提起 ${pos} 張，下段翻上成為新牌頂`);
    const layers = Math.max(2, Math.min(10, Math.round(pos / N * 12)));
    for (let i = 0; i < layers; i++) {
      const c = document.createElement("div");
      c.className = "stack-card";
      c.style.transform = `translate(${(i % 3) - 1}px, ${-i * 1.6}px) rotate(${(i % 5) - 2}deg)`;
      b.appendChild(c);
    }
    const lab = document.createElement("span");
    lab.className = "pile-label";
    lab.textContent = `${label}・提 ${pos} 張`;
    b.appendChild(lab);
    b.addEventListener("click", () => doCut(pos, b));
    elCutPiles.appendChild(b);
  });
}

function buildCutFan() {
  elCutFan.innerHTML = "";
  deck.forEach((_, pos) => {
    const c = document.createElement("button");
    c.className = "fan-card";
    c.type = "button";
    c.style.transform = `rotate(${(pos - deck.length / 2) * 0.4}deg)`;
    if (pos === 0) {
      c.disabled = true;
      c.classList.add("top-now");
      c.title = "現任牌頂";
      c.setAttribute("aria-label", "現任牌頂（不可選）");
    } else {
      c.title = `自第 ${pos + 1} 張切開`;
      c.setAttribute("aria-label", `自第 ${pos + 1} 張切開，它成為新牌頂`);
      c.addEventListener("click", () => doCutFan(pos, c));
    }
    elCutFan.appendChild(c);
  });
}

function enterCutView() {
  const fan = cutMode === "fan";
  if (fan) buildCutFan(); else buildCutPiles();
  elCutPiles.hidden = fan;
  elCutFanScroll.hidden = !fan;
  elCutTools.hidden = false;
  btnCutMode.textContent = fan ? "三 疊 切 牌" : "攤 牌 親 切";
  elStackWrap.hidden = true;
  btnCut.textContent = "收回牌堆";
  elRitualCaption.textContent = fan
    ? "牌背攤開——點哪一張，牌就從那一張切開，它成為新的牌頂。"
    : "三種切口——點選一疊，牌就從那個深度切開，下段翻上成為新牌頂；不想切就按「收回牌堆」。";
}

btnCutMode.addEventListener("click", () => {
  if (ritualBusy || phase !== "ritual") return;
  cutMode = cutMode === "piles" ? "fan" : "piles";
  enterCutView();
});

function exitCutView() {
  elStackWrap.hidden = false;
  elCutPiles.hidden = true;
  elCutFanScroll.hidden = true;
  elCutTools.hidden = true;
  btnCut.textContent = "切 牌";
}

btnCut.addEventListener("click", () => {
  if (ritualBusy || phase !== "ritual") return;
  if (elCutPiles.hidden && elCutFanScroll.hidden) enterCutView();
  else { exitCutView(); ritualStatus(); }
});

/* 一鍵完成儀式：洗七次+隨機一切——給趕時間的人，牌序仍是真隨機 */
btnQuick.addEventListener("click", () => {
  if (ritualBusy || phase !== "ritual") return;
  ritualBusy = true;
  if (!elCutPiles.hidden || !elCutFanScroll.hidden) exitCutView();
  for (let k = 0; k < 7; k++) { deck = riffle(deck); }
  shuffleCount += 7;
  deck = cutDeck(deck, 1 + Math.floor(DC.rand01() * (deck.length - 1)));
  cutCount++;
  const cards = [...elStack.children];
  cards.forEach((c) => {
    c.style.transform = `translate(${(DC.rand01() * 2 - 1) * 90}px, ${(DC.rand01() * 2 - 1) * 40}px) rotate(${(DC.rand01() * 2 - 1) * 40}deg)`;
  });
  setTimeout(() => {
    cards.forEach((c, i) => {
      c.style.transform = `translate(${(i % 3) - 1}px, ${-i * 1.2}px) rotate(${(i % 5) - 2}deg)`;
    });
    ritualBusy = false;
  }, 450);
  elRitualCaption.textContent = "替你洗了七次、切了一刀。牌序已定，可以抽了。";
  ritualSteps();
  btnBegin.disabled = false;
  btnBegin.title = "";
});

/* ── 指示牌選擇（十字陣可選：指定置中或全憑抽） ── */
const elSigPick = $("#sigpick"), elSigBtns = $("#sigpick-btns");
let sigPicked = null;   /* 本局指定的指示牌 n；null＝未指定 */

function renderSigPick() {
  elSigBtns.innerHTML = "";
  spread.sigs.forEach(([n, zh, hint]) => {
    const b = document.createElement("button");
    b.className = "sig-btn";
    b.innerHTML = `${zh}<span>${hint}</span>`;
    b.addEventListener("click", () => pickSig(n));
    elSigBtns.appendChild(b);
  });
  /* 其他牌：整副攤開任選（主題指示牌不限於預設幾張） */
  const listed = new Set(spread.sigs.map(([n]) => n));
  const rest = CARDS.filter((c) => !listed.has(c.n));
  if (rest.length) {
    const more = document.createElement("button");
    more.className = "sig-btn";
    more.innerHTML = `其他牌…<span>整副攤開，任指一張為主題</span>`;
    more.setAttribute("aria-expanded", "false");
    const grid = document.createElement("div");
    grid.className = "sig-grid"; grid.hidden = true;
    grid.setAttribute("role", "group"); grid.setAttribute("aria-label", "其他指示牌");
    rest.forEach((c) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "sig-mini";
      b.innerHTML = `<i>${c.n}</i>${c.zh}`;
      b.addEventListener("click", () => pickSig(c.n));
      grid.appendChild(b);
    });
    more.addEventListener("click", () => {
      grid.hidden = !grid.hidden;
      more.setAttribute("aria-expanded", String(!grid.hidden));
    });
    elSigBtns.appendChild(more);
    elSigBtns.appendChild(grid);
  }
  const none = document.createElement("button");
  none.className = "sig-btn";
  none.innerHTML = `不指定<span>${spread.count} 張全憑抽，中央讀作核心現況</span>`;
  none.addEventListener("click", () => pickSig(null));
  elSigBtns.appendChild(none);
}

function pickSig(n) {
  if (phase !== "sig") return;
  elSigPick.hidden = true;
  elRitual.hidden = false;
  phase = "ritual";
  if (n === null) return;                 /* 不指定：照常洗切抽五張 */
  sigPicked = n;
  const idx = CARDS.findIndex((c) => c.n === n);
  deck = deck.filter((i) => i !== idx);   /* 指示牌自牌堆取出，不再被抽到 */
  const label = elSlots.querySelector('.slot[data-idx="0"] .pos-label');
  if (label) { label.textContent = "指示牌・中心"; label.title = "指示牌・中心（事先指定）"; }
  placeCard(idx, false);                  /* 指示牌面朝上置中，恆為正位 */
  elRitualCaption.textContent = `指示牌「${CARDS[idx].zh}」已置於陣中央——現在洗牌、切牌，抽出它的${spread.count >= 9 ? "八方" : "四方"}。`;
}

function performCut(pos) {
  deck = cutDeck(deck, pos);   /* 牌序真的從這裡切開 */
  cutCount++;
  exitCutView();
  ritualStatus();
  elRitualCaption.textContent = `已切牌——提起 ${pos} 張，下段翻上成為新牌頂。` + (shuffleCount ? "可再切、再洗，或開始抽牌。" : "（記得也要洗牌）");
  ritualBusy = false;
}
function doCut(pos, btn) {
  if (ritualBusy) return;
  ritualBusy = true;
  /* 儀式感：選中疊上抬亮起，其餘沉暗——300ms 後牌序才真的切開 */
  [...elCutPiles.children].forEach((b) => b.classList.add(b === btn ? "picked" : "dimmed"));
  setTimeout(() => performCut(pos), 300);
}
function doCutFan(pos, el) {
  if (ritualBusy) return;
  ritualBusy = true;
  el.classList.add("picked");
  elCutFan.classList.add("picking");   /* 單一類名讓其餘牌背沉暗，不逐張改樣式 */
  setTimeout(() => { elCutFan.classList.remove("picking"); performCut(pos); }, 300);
}

/* ── 擲卦（易經：三枚銅錢六擲起卦） ────────── */
const elCast = $("#cast"), elCastLines = $("#cast-lines"), btnThrow = $("#btn-throw");
let castLines = [];   // 由下而上的六爻:{v: 6|7|8|9, coins:[2|3,…]}
let castInfo = null;  // {lines, moving, ben, zhi}

/* 六爻（由下而上）→ 文王卦序：用 divine-core.js DC.hexNum */
const YAO_NAMES = ["初爻","二爻","三爻","四爻","五爻","上爻"];
/* 卦的簡稱：乾為天→乾、天雷無妄→無妄 */
function yiShort(n) {
  const zh = YI_CARDS[n - 1].zh;
  return zh.includes("為") ? zh[0] : zh.slice(2);
}
/* 卦之三變與之卦之互：互取二至五爻，錯為六爻皆反，綜為上下顛倒；有動爻時另取之卦之互 */
function yiDerived(info) {
  const bits = info.lines.map((v) => (v === 7 || v === 9 ? 1 : 0));
  const huOf = (x) => DC.hexNum([x[1], x[2], x[3], x[2], x[3], x[4]]);
  return {
    hu: huOf(bits),
    cuo: DC.hexNum(bits.map((b) => 1 - b)),
    zong: DC.hexNum(bits.slice().reverse()),
    zhiHu: info.zhi ? huOf(bits.map((b, i) => (info.moving.includes(i) ? 1 - b : b))) : null,
  };
}
/* 焦氏易林：林辭在 yilin-data.js（window.YILIN，鍵為「本卦序-之卦序」；六爻皆靜查本卦之本卦） */
const yilinKey = (info) => `${yiShort(info.ben)}之${yiShort(info.zhi || info.ben)}`;
const yilinOf = (info) => (window.YILIN && window.YILIN[`${info.ben}-${info.zhi || info.ben}`]) || null;
/* 朱子變占表：DC.zhuRank（divine-core.js） */
/* ── 六爻納甲：排盤在 divine-core.js DC.najia，此處只管起卦時刻與顯示格式 ── */
function najiaChart(info) {
  const at = info.at;
  return DC.najia(info.lines, at.y, at.m, at.d, at.h, at.mi, at.tz ?? -new Date(at.ms).getTimezoneOffset() / 60);
}
function najiaHead(c, info) {
  const at = info.at, p2 = (x) => String(x).padStart(2, "0");
  return {
    time: `${at.y}-${p2(at.m)}-${p2(at.d)} ${p2(at.h)}:${p2(at.mi)}`,
    month: `${c.month}月`, day: `${c.dayGZ}日`, kong: c.kong,
    gua: `${YI_CARDS[info.ben - 1].zh}（${c.gongName}宮${c.kind === "本宮" ? "本宮" : c.kind}卦，屬${c.gwx}）`,
  };
}

function renderCastLines() {
  elCastLines.innerHTML = "";
  for (let i = 0; i < 6; i++) {
    const row = document.createElement("div");
    const l = castLines[i];
    if (!l) {
      row.className = "cast-row placeholder";
      row.innerHTML = `<span class="yao-idx">${YAO_NAMES[i]}</span>
        <span class="yao-coins">・・・</span>
        <span class="yao-line">─</span>
        <span class="yao-note">未擲</span>`;
    } else {
      const yang = l.v === 7 || l.v === 9;
      const moving = l.v === 6 || l.v === 9;
      row.className = "cast-row";
      row.innerHTML = `<span class="yao-idx">${YAO_NAMES[i]}</span>
        <span class="yao-coins">${l.coins ? l.coins.map((c) => (c === 3 ? "背" : "字")).join("・") : l.lu.map((n) => ({ 4: "四", 5: "五", 8: "八", 9: "九" })[n]).join("・")}</span>
        <span class="yao-line">${yang ? "━━━" : "━&nbsp;━"}</span>
        <span class="yao-note${moving ? " moving" : ""}">${l.v === 9 ? "老陽・動 ○" : l.v === 6 ? "老陰・動 ✕" : l.v === 7 ? "少陽" : "少陰"}</span>`;
    }
    elCastLines.appendChild(row);
  }
}

/* 擲錢動畫：三枚銅錢拋起 3D 旋轉，落定時字背朝上即為結果（累計轉角，每擲至少兩圈半） */
const elCoinInners = [...document.querySelectorAll("#coin-stage .coin-inner")];
const coinRot = [0, 0, 0];
let castBusy = false;
function animateCoins(coins) {
  elCoinInners.forEach((inner, i) => {
    const coin = inner.parentElement;
    coin.classList.remove("tossing"); void coin.offsetWidth; coin.classList.add("tossing");
    coin.style.animationDelay = i * 90 + "ms";
    inner.style.transitionDelay = i * 90 + "ms";
    let t = coinRot[i] + 900;                       /* +兩圈半 */
    const wantBei = coins[i] === 3;                 /* 背=3 → 落定背面朝上 */
    if ((((t % 360) + 360) % 360 === 180) !== wantBei) t += 180;
    coinRot[i] = t;
    inner.style.transform = `rotateX(${t}deg)`;
  });
}
function commitThrow(line) {
  castLines.push(line);
  renderCastLines();
  if (castLines.length === 6) finishCast();
}
/* 單爻起法：DC.coinLine（三錢）、DC.yarrowLine（大衍・朱子掛扐法），在 divine-core.js */
const elStalks = $("#stalks"), elStalkNote = $("#stalk-note");
function buildStalks() {
  if (elStalks.children.length) { [...elStalks.children].forEach((s) => { s.className = "stalk"; }); elStalkNote.textContent = "　"; return; }
  for (let i = 0; i < 49; i++) { const s = document.createElement("i"); s.className = "stalk"; elStalks.appendChild(s); }
}
/* 揲蓍動畫：三變各演「分二、掛一、揲四、歸奇」。每變只揲手中餘策（49 → 44/40 → …），
   左右分法依本變扐數反推（左策、右策去掛一後各四揲之餘，餘零作四），掛一併入扐數（朱子：五、九、四、八皆含掛一）；
   三變扐出之策留在一旁，最後餘策（36/32/28/24）÷4 即爻數 */
function animateStalks(lu) {
  const stalks = [...elStalks.children];
  const CN = { 4: "四", 5: "五", 8: "八", 9: "九" };
  const NUM = { 24: "二十四", 28: "二十八", 32: "三十二", 36: "三十六" };
  const names = ["初變", "再變", "三變"];
  const rem = (n) => n % 4 || 4;
  let live = stalks.slice();
  stalks.forEach((s) => { s.className = "stalk"; });
  const step = (k) => {
    const n = live.length;
    const ok = [];
    for (let L = Math.floor(n * 0.35); L <= Math.ceil(n * 0.65); L++) if (rem(L) + rem(n - L - 1) + 1 === lu[k]) ok.push(L);
    const L = ok[Math.floor(DC.rand01() * ok.length)];   /* 分二 */
    stalks.forEach((s) => { if (!live.includes(s)) s.className = "stalk aside"; });
    live.forEach((s, i) => { s.className = "stalk " + (i < L ? "left" : "right"); });
    const hang = live[L];
    setTimeout(() => hang.classList.add("hang"), 180);   /* 掛一：取自右策 */
    const taken = [hang, ...live.slice(L - rem(L), L), ...live.slice(n - rem(n - L - 1))];   /* 歸奇於扐 */
    live = live.filter((s) => !taken.includes(s));
    setTimeout(() => {
      elStalkNote.innerHTML = names.slice(0, k + 1).map((nm, j) => `${nm}<b>${CN[lu[j]]}</b>`).join("　");
      taken.forEach((s) => { if (s !== hang) s.className = "stalk aside"; });
    }, 420);
  };
  elStalkNote.textContent = "　";
  step(0); setTimeout(() => step(1), 480); setTimeout(() => step(2), 960);
  setTimeout(() => {   /* 餘策歸攏，四揲得爻 */
    stalks.forEach((s) => { s.className = live.includes(s) ? "stalk" : "stalk aside"; });
    elStalkNote.innerHTML += `　餘${NUM[live.length]}策得<b>${{ 6: "六", 7: "七", 8: "八", 9: "九" }[live.length / 4]}</b>`;
  }, 1400);
}
function throwOnce() {
  const yarrow = spread.method === "yarrow";
  const line = yarrow ? DC.yarrowLine() : DC.coinLine();
  if (location.search.includes("rwdtest")) { commitThrow(line); return; }   /* 測試直通：六連擲不等動畫 */
  castBusy = true;
  btnThrow.disabled = true;
  if (yarrow) animateStalks(line.lu); else animateCoins(line.coins);
  setTimeout(() => {
    castBusy = false;
    commitThrow(line);
    btnThrow.disabled = phase !== "cast";   /* 第六擲 finishCast 轉入 draw,按鈕保持停用 */
  }, yarrow ? 1500 : 1000);
}
btnThrow.addEventListener("click", () => {
  if (phase !== "cast" || castLines.length >= 6 || castBusy) return;
  if (castLines.length === 0) {   /* 起卦前勸誡：同日同題三問（無需勸誡時同步直通，測試鉤子才能連擲） */
    const ok = repeatGuard();
    if (ok !== true) { ok.then((yes) => { if (yes && phase === "cast" && castLines.length === 0) throwOnce(); }); return; }
  }
  throwOnce();
});

function finishCast() {
  phase = "draw";
  const bits = castLines.map((l) => (l.v === 7 || l.v === 9 ? 1 : 0));
  const moving = castLines.map((l, i) => (l.v === 6 || l.v === 9 ? i : -1)).filter((i) => i >= 0);
  const ben = DC.hexNum(bits);
  let zhi = null;
  if (moving.length) {
    zhi = DC.hexNum(bits.map((b, i) => (moving.includes(i) ? 1 - b : b)));
  }
  castInfo = { lines: castLines.map((l) => l.v), moving, ben, zhi, method: spread.method || "coins" };
  if (spread.najia) {   /* 納甲以成卦當刻（裝置當地時間）定月建日辰，存入紀錄供重看 */
    const d = new Date();
    castInfo.at = { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), mi: d.getMinutes(), ms: d.getTime(), tz: -d.getTimezoneOffset() / 60 };
  }
  const nj = spread.najia ? najiaChart(castInfo) : null, njh = nj && najiaHead(nj, castInfo);
  target = zhi ? 2 : 1;
  $("#cast-caption").textContent = spread.yilin
    ? `得「${yilinKey(castInfo)}」。${yilinOf(castInfo) ? "林辭：" + yilinOf(castInfo) : ""}`
    : nj
    ?`得${njh.gua}${zhi ? `之「${yiShort(zhi)}」` : "，六爻安靜"}。世在${YAO_NAMES[nj.shi - 1]}、應在${YAO_NAMES[nj.ying - 1]}${moving.length ? `；動爻：${moving.map((i) => YAO_NAMES[i]).join("、")}` : ""}。${njh.month}、${njh.day}，旬空${njh.kong}。`
    : zhi
    ? `得「${yiShort(ben)}之${yiShort(zhi)}」。動爻：${moving.map((i) => YAO_NAMES[i]).join("、")}。本卦為貞，之卦為悔。${moving.length === 3
      ? `三爻變，依朱子變占表居第 ${DC.zhuRank(moving).rank} 卦，${DC.zhuRank(moving).zhen ? "前十卦主貞" : "後十卦主悔"}。` : ""}`
    : `得「${yiShort(ben)}」，六爻皆靜，以本卦卦辭為斷。`;
  if (!zhi) {
    /* 六爻皆靜：之卦格明確標示，不留懸念 */
    const zhiLabel = elSlots.querySelector('.slot[data-idx="1"] .pos-label');
    if (zhiLabel) zhiLabel.textContent = spread.najia ? "變卦・無（六爻安靜）" : "之卦・無（六爻皆靜）";
  }
  btnThrow.disabled = true;
  setTimeout(() => placeCard(ben - 1), 450);
  if (zhi) setTimeout(() => placeCard(zhi - 1), 1150);
}

/* ── 重複占問勸誡（同題比對用 divine-core.js DC.simQ） ── */
/* 回傳 true（免勸誡，同步直通）或 Promise<boolean>（紙面對話框問過再說） */
function repeatGuard() {
  if (location.search.includes("rwdtest")) return true;   /* 測試鉤子直通（無頭瀏覽器會卡在對話框） */
  let arr = [];
  try { arr = JSON.parse(localStorage.getItem("lenormand-history") || "[]"); } catch (e) {}
  const today = new Date().toDateString();
  const q = $("#q-input").value.trim();
  const n = arr.filter((r) => new Date(r.id).toDateString() === today && r.deck === deckDef.id && DC.simQ(r.q, q) >= DC.SIMQ_TH).length;
  if (n < 2) return true;
  return say(`同一件事，你今天已用「${deckDef.name}」問過 ${n} 次。\n再抽，就只是在抽心安，不是在占卜。\n\n牌不會因為多問一次而換答案。答案不合意時，該換的是問題，或行動。`, { ok: "仍要抽", cancel: "先不抽" });
}

function beginDraw() {
  phase = "draw";
  elRitual.hidden = true;
  elCaption.hidden = false;
  elDrawStage.hidden = false;
  buildFan();               /* 扇形恆為抽牌之源；牌堆模式時隱藏，親挑時展開 */
  setDrawMode("pile");
  elAuto.hidden = spread.count < 9;
  updateCaption();
  ritualSteps();
}
btnBegin.addEventListener("click", () => {
  if (btnBegin.disabled || phase !== "ritual") return;
  const ok = repeatGuard();
  if (ok === true) { beginDraw(); return; }
  ok.then((yes) => { if (yes && phase === "ritual") beginDraw(); });
});

/* 抽牌雙模式：命運牌堆（單鍵抽頂，預設）⇄ 攤牌親挑（扇形逐張點） */
function setDrawMode(mode) {
  drawMode = mode;
  const pile = mode === "pile";
  elPileWrap.hidden = !pile;
  elFanScroll.hidden = pile;
  btnMode.textContent = pile ? "攤 牌 親 挑" : "收 回 牌 堆";
  btnMode.title = pile ? "把牌攤開，親手挑你被召喚的那幾張" : "收回成牌堆，單鍵從牌頂抽";
  if (!pile) refreshScrollables();
}
btnMode.addEventListener("click", () => {
  if (phase !== "draw") return;
  setDrawMode(drawMode === "pile" ? "fan" : "pile");
});

/* 手動抽牌的飛行(FLIP):卡背自起點飛至槽位，落地才現牌翻面；自動連抽不飛（求快省效能） */
function placeCardFlying(fromEl, cardIdx) {
  const fromRect = fromEl.getBoundingClientRect();
  const slotIdx = drawn.length;
  placeCard(cardIdx);
  const well = elSlots.querySelector(`.slot[data-idx="${slotIdx}"] .card-well`);
  const c3 = well && well.lastElementChild;
  if (!c3) return;
  const toRect = well.getBoundingClientRect();
  /* 目標槽在視窗外（大盤橫捲）就不飛，直接落牌 */
  if (toRect.bottom < 0 || toRect.top > innerHeight || toRect.right < 0 || toRect.left > innerWidth) return;
  c3.classList.add("glow");
  c3.style.visibility = "hidden";
  const ghost = document.createElement("div");
  ghost.className = "fly-card";
  ghost.style.cssText = `left:${fromRect.left}px;top:${fromRect.top}px;width:${fromRect.width}px;height:${fromRect.height}px;`;
  document.body.appendChild(ghost);
  ghost.getBoundingClientRect();   /* 強制排版，讓下一行 transform 走 transition */
  ghost.style.transform = `translate(${toRect.left + toRect.width / 2 - (fromRect.left + fromRect.width / 2)}px,${toRect.top + toRect.height / 2 - (fromRect.top + fromRect.height / 2)}px) rotate(${(DC.rand01() * 2 - 1) * 9}deg) scale(${toRect.width / fromRect.width})`;
  let landed = false;
  const land = () => { if (landed) return; landed = true; ghost.remove(); c3.style.visibility = ""; };
  ghost.addEventListener("transitionend", land);
  setTimeout(land, 460);   /* 兜底:reduced-motion 或 transition 被中斷時仍落牌 */
}

/* 從牌頂抽一張（牌堆模式） */
function drawTop() {
  if (phase !== "draw" || drawn.length >= target) return;
  const el = elFan.querySelector(".fan-card:not(.gone)");
  if (!el) return;
  el.classList.add("gone");
  placeCardFlying(elDrawPile, deck[el.dataset.deckPos]);
}
elDrawPile.addEventListener("click", drawTop);

/* 位置名稱（含大盤宮位與補牌） */
function posName(i) {
  if (i >= spread.count) return spread.extend.labels[i - spread.count];
  if (spread.sig && sigPicked !== null && i === 0) return "指示牌・中心（事先指定）";
  if (spread.gt)
    return `第 ${i + 1} 宮 ・ ${CARDS[i].zh}宮（${CARDS[i].keys.split("・")[0]}之所）`;
  if (spread.id === "houses")
    return `${HOUSES[i].label}（${HOUSES[i].sign}・${HOUSES[i].title}）`;
  return spread.positions[i];
}

/* ── 槽位 ─────────────────────────────────── */
function buildSlots() {
  elSlots.innerHTML = "";
  elSlots.classList.toggle("tableau", !!spread.gt);
  /* span2：以半格欄位排出金字塔的交錯置中（欄寬 = 半張牌扣掉半個間距） */
  elSlots.style.gridTemplateColumns = spread.span2
    ? `repeat(${spread.cols}, calc(var(--cw) / 2 - 7px))`
    : `repeat(${spread.cols}, var(--cw))`;

  for (let i = 0; i < spread.count; i++) {
    const slot = document.createElement("div");
    slot.className = "slot";
    slot.dataset.idx = i;

    const label = document.createElement("div");
    label.className = "pos-label";
    if (spread.gt) {
      label.classList.add("house");
      label.textContent = `${CARDS[i].zh}宮`;
      label.title = `第 ${i + 1} 宮（${CARDS[i].zh}）：${CARDS[i].keys}`;
    } else {
      label.textContent = spread.positions[i];
      label.title = spread.positions[i];
    }

    const well = document.createElement("div");
    well.className = "card-well";

    slot.appendChild(label);
    slot.appendChild(well);

    /* 大盤最後四張置中（8 欄下的 3~6 欄） */
    if (spread.id === "gt" && i >= 32) {
      slot.style.gridColumn = String(3 + (i - 32));
    }
    /* 十字陣、金字塔等自訂座標 */
    if (spread.place) {
      const col = spread.place[i][0];
      slot.style.gridColumn = spread.span2 ? `${col} / span 2` : String(col);
      slot.style.gridRow = String(spread.place[i][1]);
    }
    elSlots.appendChild(slot);
  }
}

/* 補牌：在既有牌陣尾端加掛澄清牌槽位 */
function addExtensionSlots() {
  const ext = spread.extend;
  for (let k = 0; k < ext.count; k++) {
    const i = spread.count + k;
    const slot = document.createElement("div");
    slot.className = "slot";
    slot.dataset.idx = i;
    slot.style.gridRow = "2";
    slot.style.gridColumn = String(2 + k * 2);   /* 第二列 2、4 欄置中 */
    const label = document.createElement("div");
    label.className = "pos-label";
    label.textContent = ext.labels[k];
    label.title = ext.labels[k];
    const well = document.createElement("div");
    well.className = "card-well";
    slot.appendChild(label);
    slot.appendChild(well);
    elSlots.appendChild(slot);
  }
}

/* ── 牌堆扇形 ─────────────────────────────── */
function buildFan() {
  elFan.innerHTML = "";
  deck.forEach((cardIdx, pos) => {
    const c = document.createElement("button");
    c.className = "fan-card";
    c.dataset.deckPos = pos;
    c.setAttribute("aria-label", `蓋著的牌 第 ${pos + 1} 張`);
    c.style.transform = `rotate(${(pos - deck.length / 2) * 0.4}deg)`;
    c.addEventListener("click", () => drawFromFan(c, pos));
    elFan.appendChild(c);
  });
}

function drawFromFan(el, deckPos) {
  if (phase !== "draw" || drawn.length >= target || el.classList.contains("gone")) return;
  el.classList.add("gone");
  placeCardFlying(el, deck[deckPos]);
}

elAuto.addEventListener("click", () => {
  if (phase !== "draw") return;
  if (autoTimer) {   /* 進行中再按=停止 */
    clearInterval(autoTimer); autoTimer = null;
    elAuto.textContent = "讓命運抽完剩下的牌";
    return;
  }
  elAuto.textContent = "停 止";
  autoTimer = setInterval(() => {
    if (drawn.length >= target) {
      clearInterval(autoTimer); autoTimer = null;
      elAuto.textContent = "讓命運抽完剩下的牌";
      return;
    }
    const el = elFan.querySelector(".fan-card:not(.gone)");
    if (!el) { clearInterval(autoTimer); autoTimer = null; elAuto.textContent = "讓命運抽完剩下的牌"; return; }
    el.classList.add("gone");
    placeCard(deck[el.dataset.deckPos]);
  }, 110);
});

elExtend.addEventListener("click", () => {
  elExtend.hidden = true;
  target = spread.count + spread.extend.count;
  addExtensionSlots();
  updateCaption();
});

/* ── 發牌與翻面 ───────────────────────────── */
function placeCard(cardIdx, forcedRev) {
  const slotIdx = drawn.length;
  const card = CARDS[cardIdx];
  /* 正逆位：重看紀錄時沿用當時的牌位，否則由命運決定；norev 的牌（如貝林藍卡）恆為正位 */
  const rev = deckDef.reversible && !card.norev
    ? (forcedRev !== undefined ? !!forcedRev : DC.rand01() < 0.5)
    : false;
  drawn.push(card);
  drawnRev.push(rev);

  const well = elSlots.querySelector(`.slot[data-idx="${slotIdx}"] .card-well`);
  well.classList.add("filled");

  const corner = card.pks || `№ ${card.n}`;
  const mark = rev
    ? `<span class="pol bad">⟲</span>`
    : `<span class="pol ${card.pol}">${POL_MARK[card.pol].slice(0, 1)}</span>`;
  const c3 = document.createElement("div");
  c3.className = "card3d dealing" + (rev ? " rev" : "");
  c3.innerHTML = `
    <div class="cface front">
      <div class="c-num"><span>${corner}</span>${mark}</div>
      <div class="c-art">${card.glyph}</div>
      <div class="c-zh">${card.zh}</div>
      <div class="c-latin">${card.latin}</div>
    </div>
    <div class="cface back"></div>`;
  well.appendChild(c3);

  /* 生成的牌面圖：圖就緒才翻面，避免先閃出符號備援版 */
  const front = c3.querySelector(".cface.front");
  const img = document.createElement("img");
  img.className = "c-img";
  img.alt = "";
  const placedAt = performance.now();
  let revealed = false;
  const reveal = () => {
    if (revealed) return;
    revealed = true;
    /* 保留最短發牌節奏（320ms），圖已快取時也不顯得倉促 */
    const wait = Math.max(0, 320 - (performance.now() - placedAt));
    setTimeout(() => { c3.classList.remove("dealing"); c3.classList.add("revealed"); }, wait);
  };
  const failsafe = setTimeout(reveal, 4000);   /* 圖載太久就先翻（符號版），載到再無縫換圖 */
  img.addEventListener("load", () => {
    front.classList.add("has-img");
    clearTimeout(failsafe);
    reveal();
  });
  img.addEventListener("error", () => {
    img.remove();
    clearTimeout(failsafe);
    reveal();
  });
  if (card.img) { img.src = card.img; front.appendChild(img); }
  else { clearTimeout(failsafe); reveal(); }

  /* 牌義跟著牌走：滑過顯示、點按切換（觸控）、聚焦亦可（鍵盤/讀屏） */
  c3.classList.add("clickable");
  c3.tabIndex = 0;
  c3.setAttribute("aria-label", `${posName(slotIdx)}:${card.zh}${rev ? "(逆位)" : ""}`);
  c3.addEventListener("mouseenter", () => showTip(slotIdx, c3));
  c3.addEventListener("mouseleave", hideTip);
  c3.addEventListener("focus", () => showTip(slotIdx, c3));
  c3.addEventListener("blur", hideTip);
  /* 點牌看大圖（card-zoom.js）；沒有牌面圖的牌組維持點按切換牌義浮框 */
  c3.addEventListener("click", () => {
    if (window.CardZoom && front.classList.contains("has-img")) {
      hideTip();
      CardZoom.open({ src: card.img, title: card.zh, sub: `${posName(slotIdx)}・${corner}`, text: `${card.keys}${rev && card.rtext ? "——" + card.rtext : "——" + card.text}`, rev });
      return;
    }
    if (tipSlot === slotIdx && elTip.classList.contains("on")) hideTip();
    else showTip(slotIdx, c3);
  });
  c3.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); c3.click(); } });

  addEntry(card, slotIdx);
  updateCaption();

  if (drawn.length === target) finishReading();
}

function updateCaption() {
  const left = target - drawn.length;
  if (left > 0) {
    const next = posName(drawn.length);
    elCaption.innerHTML = `下一張・落【<b>${next}</b>】（第 ${drawn.length + 1}／${target} 張）`
      + (drawMode === "pile" ? " ── 點牌堆抽出" : " ── 憑直覺，選你被召喚的那一張");
    elPileCount.textContent = `剩 ${left} 張`;
    elDrawPile.disabled = false;
  } else {
    elCaption.innerHTML = `牌已抽齊 ── <a href="#reading" id="goto-reading" style="color:var(--gold-bright)">看解讀 ▼</a>`;
    elPileCount.textContent = "已抽齊";
    elDrawPile.disabled = true;
    const link = $("#goto-reading");
    if (link) link.addEventListener("click", (e) => { e.preventDefault(); elReading.scrollIntoView({ behavior: "smooth", block: "start" }); });
  }
  refreshScrollables();
}

/* ── 解讀帳冊 ─────────────────────────────── */
function addEntry(card, slotIdx) {
  elReading.classList.add("on");
  $("#reading-sub").textContent = spread.name;

  const rev = drawnRev[slotIdx];
  const oTag = deckDef.reversible
    ? `<span class="o-tag${rev ? " rev" : ""}">${card.norev ? "不分正逆" : rev ? "逆位" : "正位"}</span>`
    : "";
  const e = document.createElement("div");
  e.className = "entry";
  e.dataset.idx = slotIdx;
  e.innerHTML = `
    <div class="e-pos">${posName(slotIdx)}</div>
    <div class="e-head">
      <span class="e-glyph">${card.glyph}</span>
      <span class="e-name">${card.zh}<small style="color:var(--ink-soft)"> · ${card.latin}</small></span>
      ${oTag}
      <span class="pol ${card.pol}">${POL_MARK[card.pol]}</span>
    </div>
    <div class="e-keys">${card.keys}</div>
    <p class="e-text">${rev && card.rtext ? card.rtext : card.text}${gtHouseNote(card, slotIdx)}${deckNote(card, slotIdx)}</p>`;
  elEntries.appendChild(e);
}

function gtHouseNote(card, slotIdx) {
  if (spread.id === "houses" && slotIdx < 12) {
    const h = HOUSES[slotIdx];
    return `<br><em>${h.label}（${h.sign}）掌管${h.title}：${h.hint}——${card.noun}正在這個領域發酵。</em>`;
  }
  if (!spread.gt) return "";
  const house = CARDS[slotIdx];
  const mythTag = deckDef.id === "gra" && house.myth ? `（${house.myth[0]}系列之宮）` : "";
  if (house.n === card.n) return `<br><em>此牌落在自己的宮位——「${card.zh}」的主題在此刻格外強烈。</em>`;
  if (card.pk === "指示牌") return `<br><em>這是你的指示牌——你正落腳於${house.zh}宮${mythTag}，「${house.keys.split("・")[0]}」是你眼下的舞台。</em>`;
  if (card.noun && house.mod) return `<br><em>落於${house.zh}宮${mythTag}：${card.noun}${house.mod}。</em>`;
  return `<br><em>落於${house.zh}宮（${house.keys.split("・")[0]}之所）——這張牌的訊息，正發生在「${house.zh}」掌管的領域。</em>`;
}

/* ── 各牌組專屬落位註記（大盤已有宮位註記，不重複） ── */
const SIB_PERSONS = {
  7:"有才華的年輕男子", 11:"戀人或熱烈追求的男子", 12:"愛人或溫暖慷慨的女子",
  13:"有力的年長男性", 17:"可信賴的女性朋友", 24:"效力於你的年輕人",
  25:"真誠的年輕女子", 26:"專業的顧問", 29:"伸出援手的女性",
  37:"居中傳話的人", 38:"務實支持你的成熟女性", 41:"年長的女性或故人",
  42:"孤獨的男子", 49:"強硬的對峙者", 50:"懷敵意的男子",
  51:"懷敵意的女子", 52:"可信靠的長者",
};
function sibPersonNote(card, slotIdx) {
  const who = SIB_PERSONS[card.n];
  if (!who) return "";
  const pos = posName(slotIdx), rev = drawnRev[slotIdx];
  let s;
  if (/阻礙|障礙|考驗|暗流/.test(pos))          s = `阻礙不是一件事，而是一個人——${who}正站在路中央`;
  else if (/助力|貴人|支持|所給/.test(pos))      s = `助力有名有姓——${who}就是此局的貴人`;
  else if (/未來|去向|走向|結局|結果/.test(pos)) s = `${who}將在後續登場，留意新面孔`;
  else if (/過去|來路|根源|起因|遠因/.test(pos)) s = `這件事的來處繫於一個人——${who}的影響仍在`;
  else if (/潛|根基|裡/.test(pos))               s = `檯面下另有其人——${who}在幕後牽動局面`;
  else                                           s = `此位落的是「人」——${who}正是這一環的主角`;
  return `<br><em>人物指認：${s}${rev ? "；逆位——此人心思不明或立場已轉，先觀其行" : ""}。</em>`;
}
const BEL_PLANETS = ["太陽","月亮","水星","金星","火星","木星","土星"];
function belFamilyNote(card, slotIdx) {
  const fam = card.pk, pos = posName(slotIdx);
  if (fam === "守護牌") return `<br><em>藍卡臨位——這一環受到守護，周圍凶象在此被鈍化。</em>`;
  if (fam === "主牌")   return `<br><em>主牌臨位——這一環是全局樞紐，請當作指示牌來讀：它站在哪裡，問題就繞著哪裡轉。</em>`;
  const p = BEL_PLANETS.find((x) => pos.includes(x));
  if (p) return p === fam
    ? `<br><em>${fam}家族回到本垣——得令，本義加倍作數。</em>`
    : `<br><em>${fam}家族客居${p}之位——以「${card.keys.split("・")[0]}」回應${p}的領域，客隨主便。</em>`;
  const hard = fam === "火星" || fam === "土星";
  if (/阻礙|課題|考驗|潛流|障礙/.test(pos)) return hard
    ? `<br><em>${fam}家族落在陰影之位——${fam === "火星" ? "阻力是正面的衝突：可以迎戰，別背對它" : "阻力是時間與消磨：急攻無益，以耐力取勝"}。</em>`
    : `<br><em>${fam}家族客居陰影之位——阻礙裡藏著「${card.keys.split("・")[0]}」的線索，未必是敵。</em>`;
  if (/助力|支持|貴人|解答/.test(pos)) return hard
    ? `<br><em>${fam}家族坐助力之位——幫你的力量帶著鋒芒與紀律：嚴師、諍友，或一場不得不的磨練。</em>`
    : `<br><em>${fam}家族坐助力之位——順風；讓「${card.keys.split("・")[0]}」為你使力。</em>`;
  return "";
}
/* 紫微：星曜×宮位——先查特例表，查無走廟陷通則 */
const ZW_GONG_SPECIAL = {
  "擎羊|財帛":"刀口上的財——入廟是競爭搶下的業績，落陷是破財傷本，防紛爭損耗。",
  "化忌|夫妻":"情之所執——這段關係正是你放不下的課題；先認清虧欠，再談進退。",
  "貪狼|夫妻":"桃花入夫妻——入廟是情趣與魅力，落陷防多角糾纏。",
  "祿存|田宅":"祿入田宅——置產積蓄皆宜；落陷防守財傷了家中和氣。",
  "天馬|遷移":"馬入遷移，動得其所——出行外派皆利；落陷防奔波無功。",
  "化祿|祿":"四化歸位，祿上加祿——財緣全開，大膽擴張。",
  "化忌|忌":"忌落忌位，課題現形——這一問的死結已被點名，直面它。",
  "紅鸞|命":"鸞星坐命——情動之時，感情之事宜主動。",
};
function zwGongNote(card, slotIdx) {
  if (deckDef.id !== "zw" || !spread.gong || !spread.gong[slotIdx]) return "";
  const g = spread.gong[slotIdx], rev = drawnRev[slotIdx];
  const sp = ZW_GONG_SPECIAL[`${card.zh}|${g}`];
  if (sp) return `<br><em>${card.zh}臨${g}位：${sp}</em>`;
  const k = card.keys.split("・")[0];
  if (!rev) return `<br><em>${card.zh}入廟於${g}位——「${k}」在此得力${card.pol === "bad" ? "，煞為我用：銳氣用在刀口，反成利器" : "，可順勢而為"}。</em>`;
  return `<br><em>${card.zh}落陷於${g}位——此處首防「${k}」走樣${card.pol === "good" ? "：吉星失輝，助力打折，關鍵事親自確認" : "：煞氣直落，避其鋒、預作止損"}。</em>`;
}
/* 東方塔羅：四象×位置五行 */
const DT_WX = { "青龍":"木", "朱雀":"火", "白虎":"金", "玄武":"水" };
const WX_SHENG = { "木":"火", "火":"土", "土":"金", "金":"水", "水":"木" };
const WX_KE = { "木":"土", "土":"水", "水":"火", "火":"金", "金":"木" };
function dtWxNote(card, slotIdx) {
  if (deckDef.id !== "dt" || !spread.wx || !spread.wx[slotIdx]) return "";
  const posWx = spread.wx[slotIdx], cardWx = DT_WX[card.zh.split("・")[0]];
  if (!cardWx) return `<br><em>大牌臨${posWx}位——天垂之象不拘五行，此位以「${card.keys.split("・")[0]}」為總綱，權重最重。</em>`;
  if (cardWx === posWx) return `<br><em>得位而旺——${card.zh.split("・")[0]}歸本位，氣純力專：正位加倍應驗；逆位亦是此領域自身的課題，無可推諉。</em>`;
  if (WX_SHENG[posWx] === cardWx) return `<br><em>位生牌（${posWx}生${cardWx}）——此處有環境托底，順勢即可。</em>`;
  if (WX_SHENG[cardWx] === posWx) return `<br><em>牌生位（${cardWx}生${posWx}）——洩秀之局：你在此處付出滋養，有功但耗力，記得回補。</em>`;
  if (WX_KE[posWx] === cardWx) return `<br><em>位剋牌（${posWx}剋${cardWx}）——受制之局：此領域壓著這股能量，宜低調緩行。</em>`;
  return `<br><em>牌剋位（${cardWx}剋${posWx}）——犯衝之局：這股能量正衝撞此領域，是破局也是變局，用之慎之。</em>`;
}
function deckNote(card, slotIdx) {
  if (spread.gt) return "";
  if (deckDef.id === "sib") return sibPersonNote(card, slotIdx);
  if (deckDef.id === "bel") return belFamilyNote(card, slotIdx);
  if (deckDef.id === "zw") return zwGongNote(card, slotIdx);
  if (deckDef.id === "dt") return dtWxNote(card, slotIdx);
  return "";
}
/* 奇卜小陣近遠法：人物牌讀四鄰（整齊網格陣適用） */
const KIP_PERSONS = new Set([1, 2, 5, 6, 8, 12, 13, 18, 22, 30]);
function kipProximity() {
  if (deckDef.id !== "kip" || spread.gt || spread.place) return [];
  const cols = spread.cols, k1 = (c) => c.keys.split("・")[0], out = [];
  drawn.forEach((c, i) => {
    if (i >= spread.count || !KIP_PERSONS.has(c.n)) return;
    const col = i % cols;
    const L = col > 0 ? drawn[i - 1] : null;
    const R = col < cols - 1 && i + 1 < spread.count && i + 1 < drawn.length ? drawn[i + 1] : null;
    const U = i - cols >= 0 ? drawn[i - cols] : null;
    const D = i + cols < spread.count && i + cols < drawn.length ? drawn[i + cols] : null;
    let s = `<p class="combo"><b>${c.zh}</b>入陣・近遠法——`;
    s += R ? `右側緊鄰「${R.zh}」：「${k1(R)}」正迎面而來；` : `右側無牌：前路開闊，由其自行落子；`;
    s += L ? `左側「${L.zh}」：「${k1(L)}」已在身後。` : `左側無牌：來路已清。`;
    if (U) s += `上方「${U.zh}」壓在心頭——「${k1(U)}」是放不下的念。`;
    if (D) s += `下方「${D.zh}」踩在腳下——「${k1(D)}」是立足之基。`;
    out.push(s + `</p>`);
  });
  return out;
}

/* 轉宮環鏈：牌落誰家，便追到那家主人的牌——落自宮定錨、回訪成環而止 */
function gtChainText(startN) {
  const seen = new Set([startN]);
  const steps = [];
  let curN = startN;
  for (let guard = 0; guard <= drawn.length; guard++) {
    const at = drawn.findIndex((c) => c.n === curN);
    if (at < 0) break;
    const houseN = at + 1;
    steps.push(`${drawn[at].zh}(№${curN})落〔${CARDS[at].zh}〕宮`);
    if (houseN === curN) { steps[steps.length - 1] += "——落於自宮，環鏈定錨於此"; break; }
    if (seen.has(houseN)) { steps.push(`回到已訪的「${CARDS[houseN - 1].zh}」——環鏈閉合`); break; }
    seen.add(houseN);
    curN = houseN;
  }
  return steps.join(" → ");
}

/* 指示牌八方鄰宮（組合用） */
function gtNeighbors(at) {
  const cols = spread.cols;
  /* 以視覺座標算鄰——雷諾曼大盤 33–36 席置於第 5 列的第 3–6 欄（buildSlots 同一規則），不能拿 at/8 硬算 */
  const vis = (i) => (spread.id === "gt" && i >= 32) ? [4, (i - 32) + 2] : [Math.floor(i / cols), i % cols];
  const [r, c] = vis(at);
  const DIRS = [[-1, -1, "左上"], [-1, 0, "上"], [-1, 1, "右上"], [0, -1, "左"], [0, 1, "右"], [1, -1, "左下"], [1, 0, "下"], [1, 1, "右下"]];
  const out = [];
  for (const [dr, dc, name] of DIRS) {
    const rr = r + dr, cc = c + dc;
    const j = drawn.findIndex((_, i) => i < spread.count && vis(i)[0] === rr && vis(i)[1] === cc);
    if (j < 0) continue;
    out.push(`${name}＝${drawn[j].zh}〔${CARDS[j].zh}宮${spread.id === "gt" && j >= 32 ? "・命運四牌" : ""}〕`);
  }
  return out.join("、");
}

function finishReading() {
  /* 補牌完成時不重複產生組合解讀 */
  if (drawn.length > spread.count) {
    elAiBlock.hidden = false;
    elClosing.hidden = false;
    updateHistoryRecord();
    return;
  }

  if (spread.extend) elExtend.hidden = false;
  elAiBlock.hidden = false;
  saveHistoryRecord();

  const combos = spread.combos(drawn);
  if (combos.length) {
    const block = document.createElement("div");
    block.className = "combo-block";
    block.innerHTML = `<div class="cb-title">牌 與 牌 之 間</div>` + combos.map((c) => `
      <p class="combo">${c.a ? `<b>${c.a.zh}</b><span class="arrow">✦</span><b>${c.b.zh}</b>　` : ""}<small style="color:var(--ink-soft)">${c.label}</small><br>${c.text}</p>`).join("");
    elCombos.appendChild(block);
  }

  const prox = kipProximity();
  if (prox.length) {
    const block = document.createElement("div");
    block.className = "combo-block";
    block.innerHTML = `<div class="cb-title">近 遠 法 ・ 人 物 與 鄰 牌</div>` + prox.join("");
    elCombos.appendChild(block);
  }

  if (spread.yilin && castInfo) {
    /* 焦氏易林：本卦配之卦查一條林辭，為主斷 */
    const v = yilinOf(castInfo);
    const block = document.createElement("div");
    block.className = "combo-block";
    block.innerHTML = `<div class="cb-title">焦 氏 易 林 ・ 林 辭</div>
      <p class="combo yilin-key"><b>${yilinKey(castInfo)}</b>${castInfo.moving.length ? "" : "　<small style=\"color:var(--ink-soft)\">六爻皆靜，查本卦之本卦</small>"}</p>
      <p class="yilin-verse">${v ? v.replace(/([。！？])(?=.)/g, "$1<br>") : "本館底本缺此條林辭。"}</p>
      <p class="combo" style="color:var(--ink-soft)">易林占法一占只查一條：本卦配之卦，以這首四言林辭為主斷，卦名只作背景。林辭多用《詩經》、春秋故事取象，看不懂的典故可以交給 AI 解。</p>`;
    elCombos.appendChild(block);
  } else if (spread.najia && castInfo && castInfo.at) {
    /* 六爻排盤：由上而下，與提示詞同源 */
    const c = najiaChart(castInfo), h = najiaHead(c, castInfo);
    const rows = [5, 4, 3, 2, 1, 0].map((i) => {
      const l = DC.najiaLineFmt(c, i);
      return `<tr${l.bian ? ' class="moving"' : ""}><td class="nj-yao">${"初二三四五上"[i]}</td><td>${l.shen}</td>
        <td><b>${l.main}</b>${l.fu ? `<small class="nj-fu">伏 ${l.fu}</small>` : ""}</td><td class="nj-mark"><i class="nj-bar${c.bits[i] ? "" : " yin"}"></i>${l.bian ? (c.bits[i] ? "○" : "×") : ""}</td><td class="nj-sy">${l.sy}</td><td>${l.bian ? `→ ${l.bian}` : ""}</td></tr>`;
    }).join("");
    const block = document.createElement("div");
    block.className = "combo-block";
    block.innerHTML = `<div class="cb-title">六 爻 排 盤 ・ 納 甲</div>
      <p class="combo"><b>${h.gua}</b>${castInfo.zhi ? `　之　<b>${YI_CARDS[castInfo.zhi - 1].zh}</b>` : "　六爻安靜"}<br>
      <small style="color:var(--ink-soft)">${h.time}　${h.month}・${h.day}・旬空${h.kong}・卦身${c.guaShen}</small></p>
      <div class="nj-scroll"><table class="nj-table"><tr><th></th><th>六神</th><th>本卦（伏神）</th><th></th><th>世應</th><th>變爻</th></tr>${rows}</table></div>
      <p class="combo" style="color:var(--ink-soft)">先依所問取用神，再以月建、日辰看旺衰，世為我、應為人；動爻與所化之爻定成敗。○ 老陽動、× 老陰動。</p>`;
    elCombos.appendChild(block);
  } else if (spread.cast && castInfo) {
    /* 卦之三變與之卦之互：與提示詞同源，輔參，以本卦動爻為主 */
    const d = yiDerived(castInfo);
    const rows = [
      [d.hu, "互卦", "本卦二至五爻交互而成，事中隱伏之情"],
      [d.cuo, "錯卦（旁通）", "六爻陰陽皆反，立場全反之鑑"],
      [d.zong, "綜卦（反對）", "本卦上下顛倒，對方眼中之局"],
    ];
    if (d.zhiHu) rows.push([d.zhiHu, "之卦之互", `之卦「${yiShort(castInfo.zhi)}」二至五爻交互而成，趨向中暗藏之機`]);
    const block = document.createElement("div");
    block.className = "combo-block";
    block.innerHTML = `<div class="cb-title">卦 之 三 變 ・ 輔 參</div>` + rows.map(([n, label, note]) => {
      const c = YI_CARDS[n - 1];
      return `<p class="combo"><span class="yi-glyph">${c.glyph}</span><b>${label}・${c.zh}</b>　<small style="color:var(--ink-soft)">${note}</small><br>${c.keys}——${c.text}</p>`;
    }).join("") + `<p class="combo" style="color:var(--ink-soft)">以上點到即可，仍以本卦、之卦與動爻為主。</p>`;
    elCombos.appendChild(block);
  }

  if (spread.gt) {
    /* 指示牌：雷諾曼男人28／女人29，西碧拉情郎11／佳人12，大雷諾曼問卜者1／2，奇卜主要人物1／2 */
    const sigs = deckDef.id === "len" ? [[28, "他"], [29, "她"]]
      : deckDef.id === "sib" ? [[11, "他"], [12, "她"]]
      : [[1, "他"], [2, "她"]];
    const rows = sigs.map(([n, pron]) => {
      const at = drawn.findIndex((c) => c.n === n);
      const sig = CARDS.find((c) => c.n === n);
      let s = `<p class="combo">「${sig.zh}」落在第 ${at + 1} 宮（${CARDS[at].zh}宮）——${pron}的處境圍繞著「${CARDS[at].keys.split("・")[0]}」。`;
      /* 空間慣例（與牌面畫像的視線無關）：同列右側＝尚未走到的未來，左側＝已經走過的過去 */
      if (spread.id === "gt" && at >= 32) {
        s += `<br>${pron}落在底部的命運四牌之中——此席仍是${CARDS[at].zh}宮，但這四張兼為全局結語：${pron}的處境正被「命運」總結著，是${pron}無法左右、必須接受的走向。`;
      } else if (deckDef.id === "gra" || deckDef.id === "kip" || deckDef.id === "sib" || deckDef.id === "len") {
        const row = Math.floor(at / spread.cols), col = at % spread.cols;
        const rowMax = spread.id === "gt" ? 32 : spread.count; /* 8×4 式底列命運四牌不入同列敘事 */
        const past = [], ahead = [];
        for (let k = 0; k < spread.cols; k++) {
          const j = row * spread.cols + k;
          if (j === at || j >= drawn.length || j >= rowMax) continue;
          (k < col ? past : ahead).push(drawn[j].zh);
        }
        past.reverse();   /* 由近而遠 */
        s += ahead.length
          ? `<br>${pron}的前路（右側，由近而遠）：${ahead.join("、")}——尚未走到的未來。`
          : `<br>${pron}已站在這一列的盡頭——這一段路已經走完，往後翻開新的一列。`;
        if (past.length) s += `來時路（左側，由近而遠）：${past.join("、")}——已經走過、可以放下的事。`;
      }
      return s + `</p>`;
    }).join("");
    const block = document.createElement("div");
    block.className = "combo-block";
    block.innerHTML = `<div class="cb-title">指 示 牌 落 點</div>${rows}
      <p class="combo" style="color:var(--ink-soft)">讀${deckDef.id === "gra" ? "大版圖" : "大盤"}時，以你的指示牌為中心：周圍八張牌是眼下的處境；依大盤慣例（與畫像視線無關），其右側是尚未走到的未來，左側是已經走過的過去。</p>`;
    elCombos.appendChild(block);
  }


  elClosing.hidden = false;
}

/* ── AI 解讀提示詞 ────────────────────────── */
function buildAiPrompt() {
  const L = [];
  L.push({
    len:"你是一位經驗豐富的雷諾曼（Petit Lenormand）占卜解讀師，熟悉牌義、位置意義與牌與牌之間的組合技法。請以繁體中文為我解讀以下牌陣。",
    sib:"你是一位經驗豐富的義大利西碧拉（Vera Sibilla Italiana）占卜解讀師，熟悉五十二張牌的牌義、正逆位差異、位置意義與牌與牌之間的組合技法。請以繁體中文為我解讀以下牌陣。",
    bel:"你是一位經驗豐富的貝林神諭卡（L'Oracle Belline）占卜解讀師，熟悉五十三張牌、七星體家族的象徵、正逆位差異與位置意義。請以繁體中文為我解讀以下牌陣。",
    kip:"你是一位經驗豐富的奇卜牌（Kipperkarten）占卜解讀師，熟悉三十六張牌的人物與情境語彙、方向與距離的讀法。請以繁體中文為我解讀以下牌陣。",
    gra:"你是一位經驗豐富的大雷諾曼（Grand Jeu de Mlle Lenormand）占卜解讀師，熟悉五十四張牌的撲克對應、神話系列象徵與位置意義。請以繁體中文為我解讀以下牌陣。",
    run:"你是一位經驗豐富的盧恩符文（Elder Futhark）占卜師，熟悉二十四符文的正逆位（merkstave）意涵與符文間的呼應。請以繁體中文為我解讀以下符陣。",
    yi: spread.yilin
      ? "你是一位熟讀《焦氏易林》的解讀者，熟悉林辭的四言韻語、典故（《詩經》《左傳》與先秦兩漢故事）與以象取義的讀法，能把林辭落實到現代處境。請以繁體中文為我解讀以下這一占。"
      : spread.najia
      ? "你是一位精通六爻納甲（京房八宮、《火珠林》、《增刪卜易》《卜筮正宗》一系）的斷卦師，擅長取用神、論旺衰、看動變與應期，能將斷語落實到現代處境。請以繁體中文為我斷以下這一卦。"
      : "你是一位精通周易的占卜解讀者，熟悉六十四卦的卦辭、象傳與義理，能將卦義落實到現代處境。請以繁體中文為我解讀以下卦陣。",
    zw:"你是一位經驗豐富的紫微斗數老師，熟悉十四主星、六吉六煞、四化與諸雜曜的星情，以及廟旺落陷的差異。請以繁體中文為我解讀以下星陣（正位視為入廟得力，逆位視為落陷失輝）。",
    dt:"你是一位經驗豐富的塔羅解讀師，眼前是一副以華夏意象重詮的東方塔羅（四象為花色：青龍財帛、朱雀行動、白虎思辨、玄武情感），結構對應標準塔羅。請以繁體中文為我解讀以下牌陣。",
    esp:"你是一位承襲西班牙與拉丁美洲民間紙牌占卜（cartomancia con baraja española）的解讀師，熟悉四十張牌的花色語彙、人頭牌的人物指認與同數成對的傳統斷法。請以繁體中文為我解讀以下牌陣。",
  }[deckDef.id]);
  if (deckDef.reversible) {
    const norevs = CARDS.filter((c) => c.norev).map((c) => `「${c.zh}」`).join("、");
    L.push(`本牌陣使用正逆位：逆位請解讀為該牌能量的受阻、延遲、內化或反面。${norevs ? `唯${norevs}不分正逆位，請恆以其本義解讀，勿作逆位發揮。` : ""}`);
  }
  /* 各牌組體系讀法總綱 */
  const DECK_TIPS = {
    yi: null,   /* 易經只留筮法起卦，讀法寫在 yiRequests 與起卦段落 */
    len: "讀法補充（時間牌）：騎士＝很快、數日內；幸運草＝短暫、把握當下；船＝數月、遠；樹＝緩慢、一年以上；山＝延遲停滯；棺材＝停止；鐮刀＝突然；鸛鳥＝季節轉換（春）；花束＝春；太陽＝夏或白日；百合＝冬或年長；月亮＝約一個月或夜；戒指＝一年一循環；錨＝長久。問時機時以此類牌為準，牌序數字亦可作日／週之參。",
    kip: spread.gt ? null : "讀法補充（近遠法）：凡人物牌落陣請讀其四鄰——右＝迎面而來、左＝已成過去、上＝壓在心頭之念、下＝立足之基；鄰牌越近影響越迫。",
    bel: "讀法補充（星體歸屬）：留意各牌星體家族與位置的互動——與位置同星體者「回垣得令」本義加倍；同家族多張＝該領域主導；火星/土星家族落阻礙課題之位凶而有明確解法；藍卡所落之位受守護、凶象鈍化；三主牌落於何位，何位即全局樞紐。",
    sib: "讀法補充（人物指認）：人物牌請優先讀作具體的人——落阻礙位＝阻你的人、助力位＝貴人、潛藏位＝幕後之人、未來位＝將登場者；逆位人物＝心思不明或立場已轉。",
    run: "讀法補充（三族）：符文分三族——弗雷族(1-8)司生計豐饒、海姆達爾族(9-16)司變局考驗、提爾族(17-24)司人事天命；某族過半即為本問重心。正逆同形之符所言為常數，非一時之運。",
    dt: "讀法補充（四象生剋）：小牌兼讀四象五行——木生火、火生土、土生金、金生水、水生木；同象得位氣旺、相生得助、相剋受制；大牌不拘五行、權重最重。",
    esp: "讀法補充（花色與人物）：人頭牌請逐一指認為問卜者身邊的真實人物（sota＝晚輩或消息、caballo＝在路上的人事、rey＝拍板者；花色定領域）；同數成對依傳統斷法；並統計四花色多寡定全局基調（金幣論財、聖杯論情、寶劍論非、棍杖論勞）。",
    gra: "讀法補充（神話五系列）：每張牌屬一系列——同系列多張相鄰或成列，請串成該神話的一段情節（金羊毛＝求取、特洛伊＝攻守、煉金＝轉化、時序＝時機、意外＝變數）。",
  };
  if (DECK_TIPS[deckDef.id]) L.push(DECK_TIPS[deckDef.id]);
  if (deckDef.id === "run" && drawn.length >= 3) {
    const cnt = [0, 0, 0]; drawn.forEach((c) => cnt[c.aett]++);
    const mx = Math.max(cnt[0], cnt[1], cnt[2]);
    if (mx >= Math.ceil(drawn.length / 2)) L.push(`三族盤點：本陣${AETTS[cnt.indexOf(mx)][0]}佔 ${mx}/${drawn.length}——${AETTS[cnt.indexOf(mx)][2]}。`);
  }
  if (deckDef.id === "esp" && drawn.length >= 5) {
    const sc = [0, 0, 0, 0]; drawn.forEach((c) => sc[Math.floor((c.n - 1) / 10)]++);
    const mx = Math.max(sc[0], sc[1], sc[2], sc[3]);
    if (mx >= Math.ceil(drawn.length / 3)) {
      const verdicts = ["金幣過秤：此問終究是錢的事。", "聖杯滿桌：感情與人情是底色。", "寶劍林立：是非當道，先避其鋒。", "棍杖成林：一切要靠做，空想無益。"];
      L.push(`花色盤點：${["金幣", "聖杯", "寶劍", "棍杖"].map((s, i) => s + sc[i]).join("、")}——${verdicts[sc.indexOf(mx)]}`);
    }
  }
  if (spread.gong) L.push("宮位讀法：入廟之星在該宮得力（煞星則煞為我用）；落陷之星示該宮的破口（吉星則助力打折）。");
  if (spread.wx) L.push("四象生剋讀法：同象得位氣旺；位生牌得助；牌生位洩秀；位剋牌受制；牌剋位犯衝；大牌不拘五行、權重最重。");
  L.push("");
  L.push(`【盤面】${spread.name}（共 ${drawn.length} 張）`);
  if (!spread.gt && spread.desc) L.push(`陣形說明：${spread.desc.split("。")[0]}。`);
  if (spread.hints) {
    L.push("【位置意涵】");
    spread.positions.forEach((p, i) => spread.hints[i] && L.push(`- ${p}：${spread.hints[i]}`));
  }
  if (spread.gt) {
    L.push({
      len: `排列方式：Grand Tableau 大盤，${spread.id === "gt9" ? "9×4 平鋪三十六席、無命運四牌（法式／現代排法）" : "8×4 加底部置中 4 張（第 33–36 張）"}。第 n 張牌落在第 n 宮，宮位以傳統 36 張牌的順序命名。方向依大盤慣例（ 牌面畫像的視線無關）：指示牌同列右側的牌是尚未走到的未來，左側是已經走過的過去；同欄上方諸牌是懸在心頭、尚未掌控之念，下方諸牌是踩在腳下、已然掌握之基。`,
      kip: "排列方式：奇卜大盤 6×6 共三十六席。第 n 張牌落在第 n 宮，宮位以奇卜 36 張牌的順序命名。方向依大盤慣例（與牌面畫像的視線無關）：主要人物同列右側的牌是尚未走到的未來，左側是已經走過的過去；同欄上方是心頭之念、下方是立足之基。",
      gra: "排列方式：Grand Tableau 大版圖，9×6 共五十四席。第 n 張牌落在第 n 宮，宮位以大雷諾曼五十四張牌的順序命名（宮位法沿用小雷諾曼慣例）。方向依大盤慣例（與牌面畫像的視線無關）：指示牌同列右側的牌是尚未走到的未來，左側的牌是已經走過的過去；同欄上方是所思、下方是所踏。",
      sib: "排列方式：西碧拉全盤 La Tavolata，13×4 共五十二席，四列如四花色。第 n 張牌落在第 n 宮，宮位以西碧拉五十二張牌的順序命名。方向依大盤慣例（與牌面畫像的視線無關）：情郎／佳人同列右側是尚未走到的未來，左側是已經走過的過去。",
    }[deckDef.id] || "排列方式：Grand Tableau 大盤。第 n 張牌落在第 n 宮，宮位以本牌組牌序命名。");
    if (spread.id === "gt") L.push("第 33–36 席仍分別是鑰匙、魚、錨、十字四宮（宮位照讀），但此四張另兼「命運四牌」：由左至右連讀成一句，作全局結語——這是問卜者無法左右、必須接受的走向；請在最後以此四張收束全局。");
    /* 指示牌八鄰組合與轉宮環鏈 */
    const sigDefs = deckDef.id === "len" ? [[28, "男人"], [29, "女人"]]
      : deckDef.id === "kip" ? [[1, "主要人物(男)"], [2, "主要人物(女)"]]
      : deckDef.id === "sib" ? [[11, "情郎"], [12, "佳人"]]
      : [[1, "問卜者"], [2, "問卜者(女)"]];
    L.push("");
    L.push("【指示牌八方鄰宮】（組合互讀用）");
    sigDefs.forEach(([n, label]) => {
      const at = drawn.findIndex((c) => c.n === n);
      if (at >= 0) L.push(`${label}居第 ${at + 1} 宮〔${CARDS[at].zh}〕，八鄰：${gtNeighbors(at)}`);
    });
    /* 同欄上思下踏 + 主題牌近遠法 */
    sigDefs.forEach(([n, label]) => {
      const at = drawn.findIndex((c) => c.n === n);
      if (at < 0 || (spread.id === "gt" && at >= 32)) return;
      const col = at % spread.cols, up = [], dn = [];
      const rowMax = spread.id === "gt" ? 32 : spread.count;
      for (let j = col; j < rowMax && j < drawn.length; j += spread.cols) {
        if (j === at) continue;
        (j < at ? up : dn).push(drawn[j].zh);
      }
      if (up.length || dn.length)
        L.push(`${label}同欄——上方（心頭之念）：${up.length ? up.join("、") : "無"}；下方（立足之基）：${dn.length ? dn.join("、") : "無"}。`);
    });
    const themeDefs = deckDef.id === "len" ? [[24, "心"], [34, "魚"], [35, "錨"], [36, "十字"], [8, "棺材"]]
      : deckDef.id === "gra" ? [[11, "情場大捷"], [16, "財富之鑰"], [50, "至暗"], [42, "判決"]] : [];
    if (themeDefs.length) {
      /* 男女指示牌各算一行，請解讀者依問卜者身分擇一 */
      const near = [];
      sigDefs.forEach(([sn, slabel]) => {
        const sigAt = drawn.findIndex((c) => c.n === sn);
        if (sigAt < 0 || (spread.id === "gt" && sigAt >= 32)) return;
        const lines = [];
        themeDefs.forEach(([n, label]) => {
          const at = drawn.findIndex((c) => c.n === n);
          if (at < 0) return;
          if (spread.id === "gt" && at >= 32) return;
          const d = Math.max(Math.abs(Math.floor(at / spread.cols) - Math.floor(sigAt / spread.cols)), Math.abs(at % spread.cols - sigAt % spread.cols));
          lines.push(`「${label}」距${slabel} ${d} 步（${d <= 1 ? "貼身——正在發生" : d === 2 ? "近旁——正在逼近" : "遠方——影響淡、時間遠"}）`);
        });
        if (lines.length) near.push(`以${slabel}為中心：${lines.join("；")}`);
      });
      if (near.length) L.push(`近遠法（凶牌越遠越鈍、吉牌越近越甜；請依我的身分擇一為中心）：${near.join("。")}。`);
    }
    if (deckDef.id === "len") {
      L.push(`鏡射與騎士步：以縱軸對稱，${spread.id === "gt9" ? "第 1↔9、2↔8、3↔7、4↔6 欄互為鏡影（第 5 欄為軸）" : "第 1↔8、2↔7、3↔6、4↔5 欄互為鏡影"}；以橫軸對稱，第 1↔4、2↔3 列互為鏡影——鏡影之牌互相補述。四角（${spread.id === "gt9" ? "第 1、9、28、36 席" : "第 1、8、25、32 席"}）合讀為全盤框架。騎士步：自指示牌走西洋棋馬步（隔一格的 L 型，如右 2 上 1），所落之牌為暗中牽動的因素。`);
    }
    L.push("");
    L.push("【轉宮環鏈】（轉宮法：牌落誰家，便追到那家主人的牌——直到落自宮定錨，或回訪成環而止）");
    sigDefs.forEach(([n, label]) => {
      const t = gtChainText(n);
      if (t) L.push(`${label}之鏈：${t}`);
    });
  } else if (spread.id === "houses") {
    L.push("排列方式：占星十二宮位，每宮一張牌。宮位對應如下：");
    HOUSES.forEach((h) => L.push(`- ${h.label}（${h.sign}）｜${h.title}：${h.hint}`));
  } else if (spread.sig && sigPicked !== null) {
    L.push(`排列方式：${spread.name}。第一張「${drawn[0].zh}」為事先指定的指示牌（先取指示牌置中之法——德式九宮變體，非隨機抽出；故此牌不會出現在其他位置），代表這一問的主體；其餘各張自洗切後的牌堆抽出。`);
    L.push(`位置依序為：${spread.positions.join("、")}${drawn.length > spread.count ? "，另有補牌" : ""}。`);
  }
  if (spread.cast && castInfo) {
    const vName = (v) => (v === 9 ? "老陽・動" : v === 6 ? "老陰・動" : v === 7 ? "少陽" : "少陰");
    L.push(`起卦方式：${castInfo.method === "yarrow"
      ? "大衍筮法（朱子掛扐法：五十策去一，分二掛一揲四歸奇，三變成一爻；老陰 1/16、少陽 5/16、少陰 7/16、老陽 3/16，陽爻易動、陰爻難動）"
      : "三枚銅錢六擲（《火珠林》系俗法：老陰、老陽各 1/8，少陽、少陰各 3/8）"}。六爻由下而上：${castInfo.lines.map((v, i) => `${YAO_NAMES[i]} ${v}（${vName(v)}）`).join("、")}。`);
    if (spread.yilin) {
      const v = yilinOf(castInfo), k = yilinKey(castInfo);
      L.push(`此占得「${k}」${castInfo.moving.length ? `（動爻：${castInfo.moving.map((i) => YAO_NAMES[i]).join("、")}）` : "（六爻皆靜，本卦之本卦）"}。`);
      L.push(v ? `《焦氏易林》「${k}」林辭：${v}` : `《焦氏易林》「${k}」：本館底本缺此條，請依你所知的通行本林辭解讀，並註明出處版本。`);
      L.push("斷法指引（易林占法）：本卦配之卦，六十四卦各變六十四，共四千零九十六條林辭；一占只查一條，即以此條林辭為主斷，不另依動爻多寡取卦爻辭。本卦、之卦卦名只作背景，不喧賓奪主。");
    } else if (spread.najia && castInfo.at) {
      L.push(...DC.najiaPrompt(najiaChart(castInfo), najiaHead(najiaChart(castInfo), castInfo).time + "（裝置當地時間，23:00 換日）"));
    } else {
      L.push(castInfo.moving.length
        ? `此占得「${yiShort(castInfo.ben)}之${yiShort(castInfo.zhi)}」。動爻（變爻）：${castInfo.moving.map((i) => YAO_NAMES[i]).join("、")}。本卦為貞（現況）、之卦為悔（趨向）。${castInfo.moving.length <= 2
          ? "請務必逐一解讀動爻的爻辭，並說明本卦如何變往之卦。"
          : "動爻爻辭可略述以見變化之由，主斷依下列朱子斷法；並說明本卦如何變往之卦。"}`
        : `此占得「${yiShort(castInfo.ben)}」，六爻皆靜，以本卦卦辭為斷；內卦為貞，外卦為悔。`);
      /* 朱子《易學啟蒙・考變占》動爻取斷 */
      const ZHU = [
        "六爻皆靜：以本卦卦辭為斷，參其大象；內卦為貞、外卦為悔。",
        "一爻動：專以本卦動爻之爻辭為斷。",
        "二爻動：以本卦二動爻之爻辭為斷，而以居上之爻為主。",
        (() => {
          if (castInfo.moving.length !== 3) return "";
          const z = DC.zhuRank(castInfo.moving);
          return `三爻動：占本卦及之卦之彖辭，本卦為貞、之卦為悔。依朱子變占表，三爻變之二十卦中，變爻含初爻者為前十卦主貞、餘為後十卦主悔；此占之卦居第 ${z.rank} 卦，屬${z.zhen
            ? `前十卦，主貞：以本卦「${yiShort(castInfo.ben)}」彖辭為主、之卦「${yiShort(castInfo.zhi)}」彖辭為輔`
            : `後十卦，主悔：以之卦「${yiShort(castInfo.zhi)}」彖辭為主、本卦「${yiShort(castInfo.ben)}」彖辭為輔`}。請兼論兩卦，以貞悔次序敘之。`;
        })(),
        "四爻動：以之卦中二不變爻之爻辭為斷，而以居下之爻為主。",
        "五爻動：以之卦中唯一不變爻之爻辭為斷。",
        "六爻皆動：乾坤二卦以用九、用六之辭為斷，餘卦以之卦卦辭為斷。",
      ];
      L.push(`斷法指引（朱子古法）：${ZHU[castInfo.moving.length]}請依此規則定主從，不必逐爻平均著墨。`);
      /* 互錯綜：本卦之推導（有動爻時另附之卦之互），輔參不另起陣 */
      const { hu, cuo, zong, zhiHu } = yiDerived(castInfo);
      L.push(`卦之三變（輔參）：互卦「${yiShort(hu)}」，事中隱伏之情；錯卦（旁通）「${yiShort(cuo)}」，立場全反之鑑；綜卦（反對）「${yiShort(zong)}」，對方眼中之局。${castInfo.zhi
        ? `之卦之互「${yiShort(zhiHu)}」，趨向中暗藏之機。`
        : ""}點到即可，以本卦動爻為主。`);
    }
  }
  L.push("");
  L.push("【抽牌結果】（依抽出順序；✦吉／✧挑戰／◦中性）");
  const polMark = (c) => ({ good: "✦吉", bad: "✧挑戰", mid: "◦中性" }[c.pol]);
  drawn.forEach((c, i) => {
    const myth = deckDef.id === "gra" && c.myth ? `・${c.myth[0]}系列` : "";
    L.push(deckDef.reversible
      ? `${i + 1}. ${posName(i)}：${c.zh} ${c.latin}（${c.pk}，${c.norev ? "不分正逆位" : drawnRev[i] ? "逆位" : "正位"}）〔${polMark(c)}〕— 關鍵詞：${c.keys}`
      /* № 只留給以牌號為傳統名的雷諾曼；易經卦序、奇卜牌號已在 pk 中，西班牙牌的 № 是站內排序 */
      : `${i + 1}. ${posName(i)}：${c.zh} ${c.latin}（${deckDef.id === "len" || deckDef.id === "gra" ? `№${c.n}，` : ""}${{ len: "撲克對應 ", gra: "撲克對應 ", yi: "卦序 ", kip: "牌號 ", esp: "花色點數 "}[deckDef.id] || ""}${c.pk}${myth}）〔${polMark(c)}〕— 關鍵詞：${c.keys}`);
    if ((deckDef.id === "gra" || deckDef.id === "zw" || deckDef.id === "dt") && !spread.gt)
      L.push(`   牌義：${drawnRev[i] && c.rtext ? c.rtext : c.text}`);
  });
  const cb = spread.combos(drawn.slice(0, spread.count));
  if (cb.length) {
    L.push("");
    L.push("【牌與牌之間】（已依組合語法成句，請以此為底深化）");
    cb.forEach((c) => L.push(c.a ? `- ${c.a.zh} ✦ ${c.b.zh}（${c.label}）：${c.text}` : `- ${c.label}：${c.text}`));
    if (deckDef.id === "len" || deckDef.id === "gra") L.push("組合文法：前牌為名詞、後牌為修飾——可依此自行擴讀其他相鄰牌。");
  }
  L.push("");
  L.push("【請提供】");
  if (deckDef.id === "yi") {
    yiRequests().forEach((t, i) => L.push(`${i + 1}. ${t}`));
  } else {
    L.push("1. 整體牌陣的基調與核心訊息");
    L.push("2. 逐一位置的解讀（牌義結合位置意義）");
    L.push("3. 相鄰或相關牌之間的組合意義");
    if (spread.gt) {
      const who = deckDef.id === "gra" ? "指示牌（問卜者／問卜者(女)，視我的身分）"
        : deckDef.id === "kip" ? "主要人物（男／女，視我的身分）"
        : "指示牌（男人／女人，視我的身分）";
      L.push(`4. 以${who}為中心，解讀上列八方鄰宮的兩兩組合（鄰牌互讀、宮位為場景），並依大盤慣例讀方向（右側＝尚未走到的未來、左側＝已經走過的過去）`);
      L.push("5. 解讀上列【轉宮環鏈】：鏈上每一步「某牌落某家」都是一段劇情，請把整條鏈串成一個連貫的故事；若我的問題另有關鍵主題牌，請依同一轉宮法自行追鏈");
      L.push(`6. 給問卜者的具體建議（${currentTone()}）`);
    } else {
      L.push(`4. 給問卜者的具體建議（${currentTone()}）`);
    }
  }
  L.push("");
  const q = $("#q-input").value.trim();
  L.push(q ? `我的問題是：${q}` : "我的問題是：〔請把你想問的事寫在這裡〕");
  return L.join("\n");
}


/* 易經的【請提供】：筮法依朱子動爻斷法定主從、納甲依用神旺衰（不套牌陣的位置／組合模板） */
function yiRequests() {
  const advice = `給問卜者的具體建議（${currentTone()}）`;
  if (spread.yilin && castInfo) return [
    `逐句解釋「${yilinKey(castInfo)}」這條林辭：字義、意象，若有典故請說明出處與故事`,
    "這條林辭整體的吉凶基調（吉、凶、先凶後吉等），並說明判斷理由",
    "把林辭的意象對應到我所問之事：現在的處境、阻礙或助力、可能的走向",
    "就我所問之事的斷語與時機提示（不迴避不利之象）",
    advice,
  ];
  if (spread.najia && castInfo && castInfo.at) return [
    "依我所問之事定用神（說明取此六親的理由），並指出原神、忌神、仇神所在",
    "用神旺衰：月建、日辰的生扶剋制，以及旬空、月破、入墓與否",
    "世應關係與動變：世應生剋，動爻、變爻對用神與世爻的作用（回頭生剋、化進化退）",
    "若用神不上卦，論伏神與飛神的生剋；六神可作人事象意輔參",
    "斷語：成敗吉凶與應期（依用神旺衰、空破、動靜推算）",
    advice,
  ];
  if (spread.cast && castInfo) {
    const m = castInfo.moving.length;
    const bz = `本卦「${yiShort(castInfo.ben)}」`, zz = castInfo.zhi ? `之卦「${yiShort(castInfo.zhi)}」` : "";
    const main = [
      `主斷——六爻皆靜：以${bz}卦辭為斷，參彖傳與大象；內卦為貞（我方、現況），外卦為悔（對方、後勢）`,
      `主斷——一爻動：以${bz}${YAO_NAMES[castInfo.moving[0]]}之爻辭為斷，兼看此爻的時位（當位與否、與應爻比爻的關係）`,
      `主斷——二爻動：兩動爻之爻辭皆解，以居上的${YAO_NAMES[castInfo.moving[1]]}為主`,
      m === 3 && `主斷——三爻動：兼論${bz}與${zz}的卦辭（彖辭），依朱子變占表此占${DC.zhuRank(castInfo.moving).zhen ? `主貞，以${bz}為主` : `主悔，以${zz}為主`}，以貞悔次序敘之`,
      `主斷——四爻動：以${zz}中二不變爻之爻辭為斷，以居下之爻為主`,
      `主斷——五爻動：以${zz}中唯一不變爻之爻辭為斷`,
      castInfo.ben === 1 ? "主斷——六爻皆動：以乾卦「用九：見群龍无首，吉」為斷"
        : castInfo.ben === 2 ? "主斷——六爻皆動：以坤卦「用六：利永貞」為斷"
        : `主斷——六爻皆動：以${zz}卦辭為斷`,
    ][m];
    return [
      `${bz}（貞）的卦義：卦辭、彖傳、大象如何映照我的現況`,
      main,
      ...(castInfo.zhi ? [`本卦如何變往之卦：變爻落在內卦或外卦、陰陽如何轉換，${zz}（悔）所示的趨向`] : []),
      "輔參：互卦、錯卦、綜卦" + (castInfo.zhi ? "與之卦之互" : "") + "，點到即可，不可喧賓奪主",
      "就我所問之事的斷語：吉凶悔吝、宜進宜退，並據卦時與爻位推估時機（不迴避不利之象）",
      advice,
    ];
  }
  return [   /* 起卦資料缺失的舊紀錄：只剩卦名可讀 */
    "本卦卦辭與大象如何映照我的現況（起卦資料缺失，無法定動爻，不擬爻辭）",
    "就我所問之事的斷語",
    advice,
  ];
}

/* ── 建議語氣（可調整並記住） ─────────────── */
const TONE_KEY = "dc-tone", TONE_CUSTOM_KEY = "dc-tone-custom"; // 與別館共用同一組鍵(divine-core toneInit)
try { /* 一次性遷移舊鍵 */
  if (!localStorage.getItem("dc-tone") && localStorage.getItem("lenormand-tone")) {
    localStorage.setItem("dc-tone", localStorage.getItem("lenormand-tone"));
    localStorage.setItem("dc-tone-custom", localStorage.getItem("lenormand-tone-custom") || "");
  }
} catch (e) {}
const elTone = $("#tone-select"), elToneCustom = $("#tone-custom");

function currentTone() {
  if (elTone.value === "__custom__") {
    return elToneCustom.value.trim() || "溫暖但誠實";
  }
  return elTone.value;
}

function toneChanged() {
  elToneCustom.hidden = elTone.value !== "__custom__";
  try {
    localStorage.setItem(TONE_KEY, elTone.value);
    localStorage.setItem(TONE_CUSTOM_KEY, elToneCustom.value);
  } catch (e) {}
  /* 提示詞已產生時，語氣改了就即時更新 */
  if (!elAiPrompt.hidden) elAiPrompt.value = buildAiPrompt();
}

elTone.addEventListener("change", toneChanged);
elToneCustom.addEventListener("input", toneChanged);

(function restoreTone() {
  try {
    let saved = localStorage.getItem(TONE_KEY);
    if (saved && saved !== "__custom__") { const s2 = saved.replace(/,/g, "，"); if ([...elTone.options].some((o) => o.value === s2)) saved = s2; } // 舊半形值遷移
    if (saved && [...elTone.options].some((o) => o.value === saved)) elTone.value = saved;
    elToneCustom.value = localStorage.getItem(TONE_CUSTOM_KEY) || "";
  } catch (e) {}
  elToneCustom.hidden = elTone.value !== "__custom__";
})();

$("#btn-ai").addEventListener("click", async () => {
  elAiPrompt.value = buildAiPrompt();
  elAiPrompt.hidden = false;
  $("#btn-copy").hidden = false;
  $("#ai-links").hidden = false;
  elAiPrompt.style.height = "auto";
  elAiPrompt.style.height = Math.min(elAiPrompt.scrollHeight + 8, 560) + "px";
  /* 產生即複製——省一步；失敗再由複製鍵兜底 */
  try {
    await navigator.clipboard.writeText(elAiPrompt.value);
    $("#btn-copy").textContent = "已複製 ✓";
    setTimeout(() => { $("#btn-copy").textContent = "複製全文"; }, 3000);
  } catch (e) { elAiPrompt.focus(); elAiPrompt.select(); }
});

document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideTip(); });

/* ── 分享與下載 ─────────────────────────────
   下載盤面圖：純 canvas 手繪符號版(file:// 下引入牌圖會污染畫布，故以
   金框+圖徽+牌名重繪，可離線匯出);分享文字:navigator.share/剪貼簿。 */
function buildShareText() {
  const d = new Date();
  const when = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const q = $("#q-input").value.trim();
  const L = [`🕯️ ${HALL.titlePrefix} · ${deckDef.name}——${spread.name}`, when];
  if (q) L.push(`問:${q}`);
  drawn.forEach((c, i) => L.push(`${i + 1}. ${posName(i)}:${c.zh}${drawnRev[i] ? "(逆位)" : ""}`));
  return L.join("\n");
}
$("#btn-share").addEventListener("click", async () => {
  if (!drawn.length) { say("先抽完牌，再分享。"); return; }
  const text = buildShareText();
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch (e) { /* 使用者取消或不支援→退回複製 */ }
  }
  try { await navigator.clipboard.writeText(text); say("盤面文字已複製，貼到哪裡都行。"); }
  catch (e) {
    elAiPrompt.value = text; elAiPrompt.hidden = false; elAiPrompt.focus(); elAiPrompt.select();
    say("這個瀏覽器不讓網頁寫入剪貼簿。盤面文字已放進下方文字框，請自行全選複製。");
  }
});

function drawSpreadImage(imgs) {   /* imgs：{牌序 n → 已載入的 Image}；有圖就畫牌面圖，否則畫符號版 */
  if (!CanvasRenderingContext2D.prototype.roundRect)
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); return this; };
  const GOLD = "#C9A45C", GOLDB = "#E4C989", IVORY = "#E8DCC2", MUTED = "#9A8C70", FELT = "#0D140F", CARDBG = "#131E16";
  const withImg = !!(imgs && Object.keys(imgs).length);
  const CW = withImg ? 150 : 128, CH = withImg ? 224 : 192, GAP = 18, PAD = 44, LABEL_H = withImg ? 52 : 34;
  /* 槽位幾何：沿用盤面定義(place/gt 底四/預設網格;span2 以半格計) */
  const cells = [];
  for (let i = 0; i < drawn.length; i++) {
    let col, row;
    if (i >= spread.count) { col = (i - spread.count) * 2 + 2; row = 90; }          /* 補牌：另起一列 */
    else if (spread.place) { col = spread.place[i][0]; row = spread.place[i][1]; }
    else if (spread.id === "gt" && i >= 32) { col = 3 + (i - 32); row = Math.floor(32 / spread.cols) + 1; }
    else { col = (i % spread.cols) + 1; row = Math.floor(i / spread.cols) + 1; }
    cells.push({ i, col, row });
  }
  const rows = [...new Set(cells.map((c) => c.row))].sort((a, b) => a - b);
  const rowIdx = new Map(rows.map((r, k) => [r, k]));
  const unitW = spread.span2 ? (CW + GAP) / 2 : CW + GAP;
  const maxCol = Math.max(...cells.map((c) => c.col + (spread.span2 ? 2 : 1) - 1));
  const gridW = spread.span2 ? maxCol * unitW + CW / 2 : maxCol * (CW + GAP) - GAP;
  const W = Math.max(560, gridW + PAD * 2);
  const HEAD = 96, FOOT = 52;
  const H = HEAD + rows.length * (CH + LABEL_H + GAP) + FOOT + PAD;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  g.fillStyle = FELT; g.fillRect(0, 0, W, H);
  g.strokeStyle = GOLD; g.lineWidth = 1.5; g.strokeRect(10, 10, W - 20, H - 20);
  g.strokeStyle = "rgba(201,164,92,.35)"; g.lineWidth = .8; g.strokeRect(16, 16, W - 32, H - 32);
  const serif = '"Noto Serif TC","PMingLiU",serif';
  g.textAlign = "center";
  g.fillStyle = GOLDB; g.font = `700 26px ${serif}`;
  g.fillText(`${deckDef.name} ・ ${spread.name}`, W / 2, 52);
  const d = new Date();
  const q = $("#q-input").value.trim();
  g.fillStyle = MUTED; g.font = `13px ${serif}`;
  g.fillText(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` + (q ? ` ・ 問:${q.slice(0, 34)}${q.length > 34 ? "…" : ""}` : ""), W / 2, 78);
  cells.forEach(({ i, col, row }) => {
    const c = drawn[i], rev = drawnRev[i];
    const x = PAD + (col - 1) * unitW + (gridW < W - PAD * 2 ? (W - PAD * 2 - gridW) / 2 : 0);
    const y = HEAD + rowIdx.get(row) * (CH + LABEL_H + GAP);
    g.save();
    if (rev) { g.translate(x + CW / 2, y + CH / 2); g.rotate(Math.PI); g.translate(-(x + CW / 2), -(y + CH / 2)); }
    g.fillStyle = CARDBG;
    g.strokeStyle = GOLD; g.lineWidth = 1.4;
    g.beginPath(); g.roundRect(x, y, CW, CH, 9); g.fill(); g.stroke();
    g.strokeStyle = "rgba(201,164,92,.4)"; g.lineWidth = .8;
    g.beginPath(); g.roundRect(x + 6, y + 6, CW - 12, CH - 12, 6); g.stroke();
    const im = imgs && imgs[c.n];
    if (im) {   /* 牌面圖：圓角裁切，逆位隨外層旋轉一併倒置 */
      g.save(); g.beginPath(); g.roundRect(x, y, CW, CH, 9); g.clip();
      g.drawImage(im, x, y, CW, CH); g.restore();
      g.strokeStyle = GOLD; g.lineWidth = 1.4; g.beginPath(); g.roundRect(x, y, CW, CH, 9); g.stroke();
    } else {
      g.fillStyle = IVORY; g.font = `44px ${serif}`;
      g.fillText(c.glyph, x + CW / 2, y + CH / 2 - 8);
    }
    if (!im) {
      g.fillStyle = GOLDB; g.font = `700 17px ${serif}`;
      g.fillText(c.zh.length > 6 ? c.zh.slice(0, 6) : c.zh, x + CW / 2, y + CH - 40);
      g.fillStyle = MUTED; g.font = `10px ${serif}`;
      g.textAlign = "left"; g.fillText(c.pks || `№${c.n}`, x + 10, y + 20); g.textAlign = "center";
    }
    g.restore();
    if (im) {   /* 有圖時牌名寫在牌下 */
      g.fillStyle = GOLDB; g.font = `700 15px ${serif}`;
      g.fillText((c.zh.length > 8 ? c.zh.slice(0, 8) : c.zh) + (rev ? "（逆）" : ""), x + CW / 2, y + CH + 20, CW + GAP);
    } else if (rev) { g.fillStyle = "#C97B6B"; g.font = `11px ${serif}`; g.fillText("⟲ 逆位", x + CW / 2, y + CH - 18); }
    g.fillStyle = MUTED; g.font = `11.5px ${serif}`;
    const pn = posName(i).replace(/（.*?）/g, "");
    g.fillText(pn.length > 12 ? pn.slice(0, 12) + "…" : pn, x + CW / 2, y + CH + (im ? 38 : 20), CW + GAP);
  });
  g.fillStyle = "rgba(201,164,92,.7)"; g.font = `12px ${serif}`;
  g.fillText("── 燭 光 牌 桌 ・ La Table aux Chandelles ──", W / 2, H - 26);
  return cv;
}
/* 載入抽到的牌面圖（失敗的略過，該張退回符號版） */
function loadDrawnImages() {
  const imgs = {};
  return Promise.all(drawn.filter((c) => c.img).map((c) => new Promise((res) => {
    const im = new Image();
    im.onload = () => { imgs[c.n] = im; res(); };
    im.onerror = () => res();
    im.src = c.img;
  }))).then(() => imgs);
}
$("#btn-download").addEventListener("click", async () => {
  if (!drawn.length) { say("先抽完牌，再下載盤面。"); return; }
  let cv = drawSpreadImage(await loadDrawnImages()), note = "";
  try { cv.toDataURL("image/png").slice(0, 1); }
  catch (e) {   /* 直接以檔案開啟網頁時，瀏覽器不准把圖片寫進畫布——退回符號版 */
    cv = drawSpreadImage(); note = "這個瀏覽器在「直接開檔案」時不准把牌面圖畫進下載圖，這次先給你文字版；用網址（例如 GitHub Pages）開啟就會有完整牌面。";
  }
  if (note) say(note);
  cv.toBlob((blob) => {
    if (!blob) { say("這個瀏覽器做不出盤面圖。可改用「分享文字」，或直接截圖。"); return; }
    const a = document.createElement("a");
    const d = new Date();
    a.download = `${HALL.titlePrefix}-${spread.id}-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}.png`;
    a.href = URL.createObjectURL(blob);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, "image/png");
});

$("#btn-copy").addEventListener("click", async () => {
  const btn = $("#btn-copy");
  elAiPrompt.focus();
  elAiPrompt.select();
  let ok = false;
  try {
    await navigator.clipboard.writeText(elAiPrompt.value);
    ok = true;
  } catch (e) {
    try { ok = document.execCommand("copy"); } catch (e2) { ok = false; }
  }
  btn.textContent = ok ? "已複製 ✓" : "請手動全選複製";
  setTimeout(() => { btn.textContent = "複製全文"; }, 2200);
});

/* ── 牌義浮框（跟著牌走） ─────────────────── */
const elTip = document.createElement("div");
elTip.id = "tip";
document.body.appendChild(elTip);
let tipSlot = -1;

function tipHtml(slotIdx) {
  const card = drawn[slotIdx];
  const rev = drawnRev[slotIdx];
  const ori = deckDef.reversible ? ` ・ ${card.norev ? "不分正逆" : rev ? "逆位" : "正位"}` : "";
  return `
    <div class="tip-pos">${posName(slotIdx)}${ori}</div>
    <div class="tip-name"><span class="tip-glyph">${card.glyph}</span> ${card.zh}
      <small>${card.latin} · ${card.pk}</small></div>
    <div class="tip-keys">${card.keys}</div>
    <p class="tip-text">${rev && card.rtext ? card.rtext : card.text}${gtHouseNote(card, slotIdx)}</p>`;
}

function showTip(slotIdx, cardEl) {
  tipSlot = slotIdx;
  elTip.innerHTML = tipHtml(slotIdx);
  elTip.classList.add("on");
  const r = cardEl.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const tw = elTip.offsetWidth, th = elTip.offsetHeight;
  let x, y;
  if (r.right + 14 + tw <= vw - 6) {          /* 右側 */
    x = r.right + 14; y = r.top + (r.height - th) / 2;
  } else if (r.left - 14 - tw >= 6) {          /* 左側 */
    x = r.left - 14 - tw; y = r.top + (r.height - th) / 2;
  } else {                                     /* 下方置中（窄螢幕） */
    x = Math.min(Math.max(r.left + (r.width - tw) / 2, 6), vw - tw - 6);
    y = r.bottom + 12;
  }
  y = Math.max(y, 6);
  elTip.style.left = (x + window.scrollX) + "px";
  elTip.style.top = (y + window.scrollY) + "px";
}

function hideTip() {
  tipSlot = -1;
  elTip.classList.remove("on");
}

/* 點牌以外的地方 → 收起浮框（行動裝置） */
document.addEventListener("click", (e) => {
  if (!e.target.closest(".card3d")) hideTip();
});

/* ── 占卜歷史（localStorage） ─────────────── */
const HIST_KEY = "lenormand-history";
let suppressSave = false;   // 重看舊紀錄時不重複保存
let currentRecId = null;

function loadHist() {
  try { return JSON.parse(localStorage.getItem(HIST_KEY)) || []; }
  catch (e) { return []; }
}
/* 牌桌館與易經館共用同一份歷史（匯出匯入不必分家），各館只列、只清自己的紀錄，各留最近 50 筆 */
const ownRec = (r) => (HALL.decks ? HALL.decks.includes(r.deck || "len") : !(HALL.exclude || []).includes(r.deck || "len"));
function storeHist(list) {
  let mine = 0, other = 0;
  list = list.filter((r) => (ownRec(r) ? ++mine : ++other) <= 50);
  try { localStorage.setItem(HIST_KEY, JSON.stringify(list)); }
  catch (e) { /* 隱私模式等情況下靜默略過 */ }
}

function saveHistoryRecord() {
  if (suppressSave) return;
  const rec = {
    id: Date.now(),
    when: new Date().toLocaleString("zh-TW", { hour12: false }),
    deck: deckDef.id,
    deckName: deckDef.name,
    spread: spread.id,
    spreadName: spread.name,
    q: $("#q-input").value.trim(),
    cards: drawn.map((c) => c.n),
    revs: deckDef.reversible ? drawnRev.map((r) => (r ? 1 : 0)) : undefined,
    cast: spread.cast && castInfo ? castInfo : undefined,
    sigd: spread.sig && sigPicked !== null ? 1 : undefined,
  };
  currentRecId = rec.id;
  const list = loadHist();
  list.unshift(rec);
  storeHist(list);
  renderHistory();
}

function updateHistoryRecord() {
  if (suppressSave || currentRecId === null) return;
  const list = loadHist();
  const rec = list.find((r) => r.id === currentRecId);
  if (rec) {
    rec.cards = drawn.map((c) => c.n);
    if (deckDef.reversible) rec.revs = drawnRev.map((r) => (r ? 1 : 0));
    rec.q = $("#q-input").value.trim();
    storeHist(list);
    renderHistory();
  }
}

function renderHistory() {
  const all = loadHist(), list = all.filter(ownRec);
  const box = $("#hist-list");
  box.innerHTML = "";
  $("#btn-hist-clear").hidden = list.length === 0;
  const moved = HALL.movedNote && all.some((r) => !ownRec(r)) ? `<p class="hist-empty">${HALL.movedNote}</p>` : "";
  if (!list.length) {
    box.innerHTML = `<p class="hist-empty">尚無紀錄——完成一次占卜後會自動保存在這裡。</p>` + moved;
    return;
  }
  if (moved) box.insertAdjacentHTML("beforeend", moved);
  list.forEach((rec) => {
    const dk = DECKS.find((x) => x.id === (rec.deck || "len")) || DECKS[0];
    const glyphs = rec.cards.slice(0, 10)
      .map((n, i) => {
        const c = dk.cards[n - 1];
        if (!c) return "？";
        return c.zh + (rec.revs && rec.revs[i] ? "⟲" : "");
      }).join("・")
      + (rec.cards.length > 10 ? `・⋯（共 ${rec.cards.length} 張）` : "");
    const item = document.createElement("div");
    item.className = "hist-item";
    item.innerHTML = `
      <span class="h-when">${rec.when}</span>
      <span class="h-spread">${dk.name} · ${rec.spreadName}</span>
      ${rec.q ? `<div class="h-q">「${rec.q}」</div>` : ""}
      <div class="h-cards">${glyphs}</div>
      <div class="h-actions">
        <button class="ghost-btn h-view">重看</button>
        <button class="ghost-btn h-del">刪除</button>
      </div>`;
    item.querySelector(".h-view").addEventListener("click", () => replayReading(rec));
    item.querySelector(".h-del").addEventListener("click", () => {
      storeHist(loadHist().filter((r) => r.id !== rec.id));
      if (currentRecId === rec.id) currentRecId = null;
      renderHistory();
    });
    box.appendChild(item);
  });
}

$("#btn-hist-clear").addEventListener("click", () => {
  storeHist(loadHist().filter((r) => !ownRec(r)));
  currentRecId = null;
  renderHistory();
});

/* 重看：把紀錄還原到牌桌與解讀帳冊（不重新保存） */
function replayReading(rec, manual) {   /* manual：手動輸入的牌面——照常保存為新紀錄 */
  if (rec.deck === "qs") { say("靈籤已經搬到開卷館。這筆舊紀錄在這裡重看不了，請到開卷館重新求籤。"); return; }
  const dk = HALL_DECKS.find((x) => x.id === (rec.deck || "len"));
  if (!dk) { if (rec.deck === "yi") say("易經已經搬到易經館。這筆紀錄請到易經館重看。"); return; }
  if (deckDef !== dk) selectDeck(dk);
  const s = SPREADS.find((x) => x.id === rec.spread);
  if (!s) { say(dk.id === "yi" ? "抽卦牌的玩法已經停用（抽牌沒有動爻，不是易經的筮法）。這筆紀錄的卦名還留在列表上，要問同一件事請改用揲蓍或擲錢起卦。" : "這個盤面已經停用，紀錄無法重看。"); return; }
  document.querySelectorAll(".spread-btn").forEach((b) => b.classList.toggle("active", b.dataset.sid === s.id));
  spread = s;
  resetTable();
  $("#q-input").value = rec.q || "";
  phase = "draw";
  elRitual.hidden = true;
  elCast.hidden = true;        /* 重看不需要重擲 */
  elSigPick.hidden = true;     /* 重看不需要重選指示牌 */
  sigPicked = rec.sigd ? rec.cards[0] : null;   /* 還原當時是否指定指示牌 */
  if (sigPicked !== null) {
    const sl = elSlots.querySelector('.slot[data-idx="0"] .pos-label');
    if (sl) { sl.textContent = "指示牌・中心"; sl.title = "指示牌・中心（事先指定）"; }
  }
  castInfo = rec.cast || null;
  if (spread.cast && castInfo) {
    $("#spread-hint").textContent = castInfo.moving && castInfo.moving.length
      ? `當時動爻:${castInfo.moving.map((i) => YAO_NAMES[i]).join("、")}`
      : "當時六爻皆靜";
  }
  if (spread.cast) {
    /* 與 finishCast 同：六爻皆靜只有本卦一張，否則重看會一直等之卦而解讀不完成
       （紀錄缺起卦資料時，以實存張數為準） */
    const still = castInfo ? !castInfo.zhi : rec.cards.length < 2;
    target = still ? 1 : 2;
    if (still) {
      const zhiLabel = elSlots.querySelector('.slot[data-idx="1"] .pos-label');
      if (zhiLabel) zhiLabel.textContent = spread.najia ? "變卦・無（六爻安靜）" : "之卦・無（六爻皆靜）";
    }
  }
  elCaption.hidden = false;
  elFanScroll.hidden = true;   /* 重看不需要牌堆 */

  suppressSave = !manual;
  const revAt = (i) => (rec.revs ? !!rec.revs[i] : false);
  const base = Math.min(rec.cards.length, s.count);
  for (let i = 0; i < base; i++) placeCard(rec.cards[i] - 1, revAt(i));
  if (rec.cards.length > s.count && s.extend) {
    target = s.count + s.extend.count;
    addExtensionSlots();
    for (let i = s.count; i < rec.cards.length; i++) placeCard(rec.cards[i] - 1, revAt(i));
  }
  suppressSave = false;

  if (!manual) currentRecId = null;   /* 重看狀態下不再更新舊紀錄 */
  elExtend.hidden = true;      /* 重看模式沒有牌堆，不提供補牌 */
  elAuto.hidden = true;
  elCaption.textContent = manual ? "手動輸入的牌面" : `重看紀錄 ── ${rec.when}`;
  elTable.classList.add("on");
  elTable.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ── 手動輸入：實體牌桌上已抽好的牌，照盤面逐位填入，產生解讀與提示詞（由 divine-io.js 的「匯入」叫出） ── */
const YAO_OPTS = [[7, "少陽 ⚊"], [8, "少陰 ⚋"], [9, "老陽 ○（動）"], [6, "老陰 ×（動）"]];
function manualEntry() {
  if (!spread) { say("先在上方選好牌組與盤面，再手動輸入抽到的牌。"); return; }
  const sel = "display:block;width:100%;box-sizing:border-box;padding:7px 8px;font:inherit;font-size:14px;border:1px solid rgba(138,114,69,.6);border-radius:3px;background:rgba(255,255,255,.55);color:inherit";
  const lab = "display:block;font-size:12.5px;letter-spacing:.06em;margin:10px 0 3px;opacity:.85";
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  let rows = "";
  if (spread.cast) {
    rows = [5, 4, 3, 2, 1, 0].map((i) => `<label style="${lab}">${YAO_NAMES[i]}</label><select data-yao="${i}" style="${sel}">${YAO_OPTS.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select>`).join("");
    if (spread.najia) {
      const d = new Date(), p2 = (x) => String(x).padStart(2, "0");
      rows = `<label style="${lab}">起卦時刻（定月建、日辰）</label><input type="datetime-local" data-at style="${sel}" value="${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}">` + rows;
    }
  } else {
    const opts = `<option value="">— 選牌 —</option>` + CARDS.map((c, i) => `<option value="${i}">${esc(c.pks || "№ " + c.n)}　${esc(c.zh)}</option>`).join("");
    const savedSig = sigPicked; sigPicked = null;
    for (let i = 0; i < spread.count; i++) {
      rows += `<label style="${lab}">${i + 1}. ${esc(posName(i))}</label><div style="display:flex;gap:8px;align-items:center"><select data-pos="${i}" style="${sel};flex:1">${opts}</select>` +
        (deckDef.reversible ? `<label style="white-space:nowrap;font-size:13px"><input type="checkbox" data-rev="${i}"> 逆位</label>` : "") + "</div>";
    }
    sigPicked = savedSig;
  }
  const dlg = document.createElement("dialog");
  dlg.className = "note";
  dlg.innerHTML = `<form method="dialog" style="max-height:78vh;overflow:auto">
    <p style="margin-bottom:6px">手動輸入・${esc(deckDef.name)}・${esc(spread.name)}</p>
    <p style="font-size:13px;opacity:.8;margin:0 0 4px">${spread.cast ? "依實際擲出的結果，由初爻往上填（表上由上爻排到初爻）。" : "依抽牌順序，把每個位置的牌填上。"}</p>
    <label style="${lab}">問題（可留空）</label><input data-q style="${sel}" value="${esc($("#q-input").value)}">
    ${rows}
    <p class="m-err" style="color:#A8302A;font-size:13px;margin:10px 0 0" hidden></p>
    <div class="note-actions" style="margin-top:16px"><button class="ghost-btn dark" value="cancel">取消</button><button class="ghost-btn dark m-ok" value="ok">排上桌</button></div>
  </form>`;
  document.body.appendChild(dlg);
  dlg.addEventListener("close", () => dlg.remove());
  dlg.querySelector(".m-ok").addEventListener("click", (e) => {
    const err = (m) => { e.preventDefault(); const p = dlg.querySelector(".m-err"); p.textContent = m; p.hidden = false; };
    const rec = { id: Date.now(), deck: deckDef.id, spread: spread.id, q: dlg.querySelector("[data-q]").value.trim() };
    if (spread.cast) {
      const lines = [0, 1, 2, 3, 4, 5].map((i) => +dlg.querySelector(`[data-yao="${i}"]`).value);
      const bits = lines.map((v) => (v === 7 || v === 9 ? 1 : 0));
      const moving = lines.map((v, i) => (v === 6 || v === 9 ? i : -1)).filter((i) => i >= 0);
      const ben = DC.hexNum(bits), zhi = moving.length ? DC.hexNum(bits.map((b, i) => (moving.includes(i) ? 1 - b : b))) : null;
      rec.cast = { lines, moving, ben, zhi, method: spread.method || "coins" };
      if (spread.najia) {
        const v = dlg.querySelector("[data-at]").value, m = v.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/);
        if (!m) return err("請填起卦時刻。");
        const d = new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5]);
        rec.cast.at = { y: +m[1], m: +m[2], d: +m[3], h: +m[4], mi: +m[5], ms: d.getTime(), tz: -d.getTimezoneOffset() / 60 };
      }
      rec.cards = zhi ? [ben, zhi] : [ben];
    } else {
      const idx = [...dlg.querySelectorAll("[data-pos]")].map((x) => x.value);
      const miss = idx.findIndex((v) => v === "");
      if (miss >= 0) return err(`第 ${miss + 1} 個位置還沒選牌。`);
      if (new Set(idx).size !== idx.length) return err("同一張牌出現了兩次，請再檢查一下。");
      rec.cards = idx.map((v) => +v + 1);
      if (deckDef.reversible) rec.revs = idx.map((_, i) => (dlg.querySelector(`[data-rev="${i}"]`).checked ? 1 : 0));
    }
    setTimeout(() => replayReading(rec, true), 0);
  });
  if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
}
window.DIO = window.DIO || {};
DIO.manual = inHall("yi") && HALL_DECKS.length === 1
  ? { label: "手動輸入擲出的卦", what: "卦（可逐爻輸入）或抽到的卦牌", run: manualEntry }
  : { label: "手動輸入抽到的牌", what: "牌", run: manualEntry };

renderHistory();

/* ── 牌義字典 ─────────────────────────────── */
const elDictGrid = $("#dict-grid"), elDictDetail = $("#dict-detail");

/* 八種常見位置的讀法：依牌的關鍵詞與吉凶組句 */
function dictPosLines(c) {
  const K = c.keys.split("・");
  const last = deckDef.id === "yi" ? (K[1] || K[0]) : K[K.length - 1]; /* 易經末詞常為卦辭截語，改取次詞 */
  const isLen = deckDef.id === "len";
  const unit = { yi: "這一卦", run: "這枚符文", zw: "這顆星" }[deckDef.id] || "這張牌";
  const isPerson = /當事人|指示牌/.test(c.keys) || (deckDef.id === "sib" && SIB_PERSONS[c.n]);
  const rows = [
    ["過去・根源", isLen
      ? `${c.noun}是這件事的來處，它的影響仍未散去。`
      : `事情的來處帶著「${K[0]}」的痕跡——${c.zh}的能量塑造了現在的局面。`],
    ["現在・處境", `此刻的主旋律是「${K[0]}」：${c.zh}正當令，先讀懂它，再決定動作。`],
    ["未來・去向", isLen
      ? `前方的路上，${c.noun}正在等你。`
      : c.pol === "bad"
      ? `事情正往「${K[0]}」的方向移動——及早避讓、預作準備，別迎著走。`
      : `事情正往「${K[0]}」的方向移動——提前把自己安排到對的位置。`],
    ["核心・課題", `此局的軸心是「${c.zh}」——一切繞著「${K[0]}」打轉，避開它就讀不懂這個局。`],
    ["意識・目標", `檯面上，你追求的是「${K[0]}」。確認這真的是你要的，而不只是習慣。`],
    ["潛藏・根基", `檯面下真正作用的，是「${last}」與「${K[0]}」的暗流——它不說話，但它做決定。`],
    ["建議・指引", isPerson
      ? `這個位置由一個「人」佔據——事情的關鍵不在事，在他／她；先確認這個人的意向。`
      : c.pol === "good"
      ? `讓「${K[0]}」發生：大方迎接、順勢而為，別擋自己的路。`
      : c.pol === "bad"
      ? `把「${K[0]}」當作警訊：預作準備、及早止損，別跟它硬碰。`
      : `「${K[0]}」本身無吉凶——分寸的拿捏，就是${unit}給你的功課。`],
    ["結果・落點", isPerson
      ? `結局繫於此人的動向——與其算事，不如懂人。`
      : c.pol === "good"
      ? `結局傾向順遂，以「${K[0]}」圓滿收尾。`
      : c.pol === "bad"
      ? `若路線不變，落點就是「${K[0]}」——現在轉舵還來得及。`
      : `落點是「${K[0]}」，成色由你此刻的選擇決定。`],
  ];
  /* 牌組體系加註 */
  if (deckDef.id === "bel" && c.pk !== "主牌" && c.pk !== "守護牌")
    rows.push(["星體家族", `${c.pk}家族之牌——同家族多張並出時，該領域即為主導；落於${c.pk}對應之位則回垣得令，本義加倍。`]);
  if (deckDef.id === "run")
    rows.push(["三族歸屬", `${AETTS[c.aett][0]}之符——${AETTS[c.aett][2]}。${c.norev ? "此符正逆同形，所言為常數：落阻礙位是一道不轉向的牆，落助力位是可長倚的底牌。" : ""}`]);
  if (deckDef.id === "sib" && SIB_PERSONS[c.n])
    rows.push(["人物指認", `此牌可讀作具體的人——${SIB_PERSONS[c.n]}：落阻礙位＝阻你的人、助力位＝貴人、潛藏位＝幕後之人、未來位＝將登場者。`]);
  if (deckDef.id === "gra" && c.myth)
    rows.push(["神話系列", `${c.myth[0]}系列——${c.myth[1]}。同系列之牌相鄰時，串成同一則神話的分鏡。`]);
  if (deckDef.id === "esp") {
    const r = c.n % 10;
    if (r === 8 || r === 9 || r === 0)
      rows.push(["人物指認", `${r === 8 ? "侍從（sota）＝晚輩、學徒，或一則消息本身" : r === 9 ? "騎士（caballo）＝移動中的人、追求者、外地來客，或懸而未到之事" : "國王（rey）＝掌權者、父執、拍板的人"}——花色定其領域：${c.pk.slice(0, 2)}中人。`]);
  }
  return rows;
}

function renderDict() {
  elDictDetail.hidden = true;
  elDictGrid.innerHTML = "";
  CARDS.forEach((c, i) => {
    const b = document.createElement("button");
    b.className = "dict-card";
    b.innerHTML = `
      <img class="dc-img" loading="lazy" alt="" src="${c.img || ""}">
      <div class="dc-name">${c.zh}</div>
      <div class="dc-sub">${c.pks || "№ " + c.n}</div>`;
    const img = b.querySelector("img");
    img.addEventListener("error", () => {
      const g = document.createElement("div");
      g.className = "dc-glyph";
      g.innerHTML = c.glyph;   /* 牌組靜態資料 */
      img.replaceWith(g);
    });
    b.addEventListener("click", () => showDictCard(i));
    elDictGrid.appendChild(b);
  });
}

function showDictCard(i) {
  const c = CARDS[i];
  let extra = "";
  if (deckDef.id === "len") {
    extra = `
      <div class="dict-sec"><div class="cb-title">組 合 語 法</div>
        <p class="combo">作為句子的開頭（主詞）：<b>${c.noun}</b></p>
        <p class="combo">接在別張牌之後（謂語）：⋯⋯<b>${c.mod}</b></p>
        <p class="combo">大盤宮位：第 ${c.n} 宮・${c.zh}宮——落入此宮的牌，都${c.mod}。</p>
      </div>`;
  } else if (deckDef.id === "gra") {
    extra = `
      <div class="dict-sec"><div class="cb-title">神 話 系 列</div>
        <p class="combo"><b>${c.myth[0]}</b>——${c.myth[1]}。</p>
      </div>
      <div class="dict-sec"><div class="cb-title">大 版 圖 宮 位</div>
        <p class="combo">第 ${c.n} 宮・${c.zh}宮（${c.keys.split("・")[0]}之所）——大版圖中落入此宮的牌，都${c.mod}。</p>
      </div>`;
  }
  if (deckDef.id === "yi" && window.YILIN) {   /* 焦氏易林：此卦為本卦的六十四條林辭 */
    const me = yiShort(c.n);
    extra = `
      <div class="dict-sec"><div class="cb-title">焦 氏 易 林 ・ ${me} 之 六 十 四</div>
        <p class="ai-note" style="margin:0 0 6px">以「${me}」為本卦，變往六十四卦的林辭（${me}之${me}＝六爻皆靜）。起卦時查的就是其中一條。</p>
        <details class="yilin-list"><summary>展開六十四條</summary>
        ${YI_CARDS.map((z) => `<p class="combo"><b>${me}之${yiShort(z.n)}</b>　${window.YILIN[`${c.n}-${z.n}`] || "（底本缺）"}</p>`).join("")}
        </details>
      </div>`;
  }
  const revBlock = deckDef.reversible && c.rtext
    ? `<div class="dict-sec"><div class="cb-title">${c.norev ? "正 逆 之 辨" : "逆 位 牌 義"}</div><p class="e-text">${c.rtext}</p></div>`
    : "";
  const posRows = dictPosLines(c)
    .map(([p, t]) => `<p class="combo"><b>${p}</b><br>${t}</p>`).join("");
  const corr = deckDef.id === "len"
    ? `№ ${c.n} ・ 撲克對應 ${c.pk}`
    : [c.pks, c.pk].filter(Boolean).join(" ・ ") || `№ ${c.n}`;
  elDictDetail.innerHTML = `
    <div class="dict-head">
      <img class="dd-img" alt="" src="${c.img || ""}">
      <div class="dd-meta">
        <div class="e-pos">${deckDef.name} ・ ${corr}</div>
        <div class="e-name" style="font-size:24px">${c.zh} <small style="color:var(--ink-soft);font-weight:400">${c.latin}</small></div>
        <div class="e-keys" style="margin-top:8px">${c.keys}</div>
        <div style="margin-top:8px"><span class="pol ${c.pol}">${POL_MARK[c.pol]}</span></div>
      </div>
    </div>
    <div class="dict-sec"><div class="cb-title">${deckDef.reversible && !c.norev ? "正 位 牌 義" : "牌 義"}</div><p class="e-text">${c.text}</p></div>
    ${revBlock}
    ${extra}
    <div class="dict-sec"><div class="cb-title">位 置 解 讀</div>
      <p class="ai-note" style="margin:0 0 4px">同一張牌落在不同位置，說的是不同層面的話。八種常見位置，各示範一種讀法。</p>
      ${posRows}
    </div>`;
  const img = elDictDetail.querySelector(".dd-img");
  img.addEventListener("error", () => {
    const g = document.createElement("div");
    g.className = "dd-glyph";
    g.innerHTML = c.glyph;
    img.replaceWith(g);
  });
  elDictDetail.hidden = false;
  elDictDetail.scrollIntoView({ behavior: "smooth", block: "start" });
}

renderDict();

/* ── 盤面讀法：目前牌組的每個盤面，位置＋讀法要領（教學，與字典並列） ── */
const elGuideList = $("#guide-list");
function guideTip(s) {
  const rev = deckDef.reversible ? "此牌組有正逆位：逆位讀作該義受阻、遲滯或走向反面，不必一律當凶。" : "";
  if (s.gt) return `<b>先讀指示牌落點</b>，看它四周八張牌（右側是尚未走到的未來、左側是已經走過的過去），再依「轉宮環鏈」追你在意的主題牌：某牌落在某家，就跳去讀那一家的牌，串成一條故事線。左右對稱的欄互為鏡影，自指示牌走馬步（隔一格的 L 型）所落之牌是暗中牽動的因素。${s.id === "gt9" ? "九四式平鋪無命運四牌，第 5 欄為鏡軸。" : "底部四張各有其宮，另兼命運四牌，連讀作全局結語。"}${rev}`;
  if (s.najia) return `<b>先依所問取用神</b>：文書長輩看父母、工作官司看官鬼、錢財看妻財、子女平安看子孫、同輩競爭看兄弟。世爻是你、應爻是對方。用神得月建、日辰生扶為旺，受剋為衰；旬空、月破待填實出空才應。動爻生剋他爻，所化之爻回頭生剋本爻。用神不上卦，看伏神。`;
  if (s.yilin) return `<b>一占只查一條林辭</b>：本卦配之卦（六爻皆靜就是本卦之本卦），在《焦氏易林》四千零九十六條中找到那一首四言韻語，以它為主斷。不依動爻多寡挑卦爻辭，卦名只作背景；林辭的典故多出自《詩經》與春秋故事，讀懂典故就讀懂了吉凶。`;
  if (s.cast) return `<b>先看有無動爻</b>。六爻皆靜以本卦卦辭為斷；有動爻依朱子斷法定主從：一爻動讀該爻爻辭，二爻動以上爻為主，三爻動本卦為貞、之卦為悔兼論，四五爻動改讀之卦不變之爻，六爻皆動讀之卦卦辭（乾坤用九用六）。`;
  if (s.id === "houses") return `<b>每宮一張</b>，以牌義對應該宮的人生領域；先看命宮（自我）、財帛、夫妻、官祿四宮，再看其餘。同一張牌落不同宮，說的是不同層面。${rev}`;
  if (s.sig) return `<b>指示牌代表這一問的主體</b>，置於中央。先讀 它相鄰的牌：左為來路、右為去向、上為所思（懸於心頭）、下為所踏（已在掌握）；再看左右鏡影與對角。不指定而全洗入抽，指示牌自然落陣的位置本身就是訊息。${rev}`;
  if (s.count === 1) return `<b>一張牌一句話</b>。先讀關鍵詞，再把牌義放進你的問題裡。今日指引不必求全，記一句就夠。${rev}`;
  if (s.count <= 3) return `<b>先各讀一張</b>，再把相鄰兩張連成一句：前牌為主詞，後牌為修飾。三張讀出一條線，中央那張是重心。${rev}`;
  if (s.count >= 9) return `<b>先掃全局</b>：吉牌多還是挑戰牌多，人物牌落在哪。再依位置逐張讀，最後讀相鄰組合；同欄上下可讀「所思／所踏」。${rev}`;
  return `<b>逐位置讀牌義</b>，再讀相鄰兩張的組合語句：前牌為名詞、後牌為修飾。核心位置定基調，結果位置定收束。問題寫得越具體，牌說得越清楚。${rev}`;
}
function renderGuide() {
  if (!elGuideList) return;
  elGuideList.innerHTML = "";
  SPREADS.forEach((s, i) => {
    const d = document.createElement("details");
    d.className = "guide-item";
    if (i === 0) d.open = true;
    const pos = s.positions
      ? `<ol>${s.positions.map((p) => `<li>${p}</li>`).join("")}</ol>`
      : s.gt ? (s.id === "gt9" ? "<p>三十六席依 9 × 4 平鋪，各席即雷諾曼宮位；無命運四牌。</p>" : "<p>三十六席依 8 × 4 排列，各席即雷諾曼宮位；底部另有命運四牌。</p>") : "";
    d.innerHTML = `<summary><span class="g-name">${s.name}</span><span class="g-count">${s.count} 張</span><span class="g-mark" aria-hidden="true"></span></summary>
      <div class="guide-body"><p>${s.desc}</p>${pos}<p class="g-tip">${guideTip(s)}</p></div>`;
    elGuideList.appendChild(d);
  });
}
renderGuide();

/* ── 頁面切換：占卜牌桌 ⇄ 牌義字典 ⇄ 盤面讀法（⇄ 易經館的入門教學）─── */
/* 分頁由頁面上的 .view-btn 決定；divine 對應 #view-divine，其餘對應同名 id 的區塊 */
const VIEWS = [...document.querySelectorAll(".view-btn")].map((b) => b.dataset.view);
const viewEl = (v) => $(v === "divine" ? "#view-divine" : "#" + v);
function setView(v) {
  if (!VIEWS.includes(v)) v = "divine";
  VIEWS.forEach((x) => { const el = viewEl(x); if (el) el.hidden = x !== v; });
  if (v !== "divine") document.dispatchEvent(new CustomEvent("table-view", { detail: v }));
  document.querySelectorAll(".view-btn").forEach((b) => {
    const on = b.dataset.view === v;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
    b.tabIndex = on ? 0 : -1;
  });
  hideTip();
  const hash = v === "divine" ? "" : "#" + v;
  if (location.hash !== hash) {
    history.replaceState(null, "", location.pathname + location.search + hash);
  }
}
const viewFromHash = () => (VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "divine");

const viewBtns = [...document.querySelectorAll(".view-btn")];
viewBtns.forEach((b, i) => {
  b.addEventListener("click", () => {
    setView(b.dataset.view);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  b.addEventListener("keydown", (e) => {   /* 分頁：左右鍵移動 */
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const next = viewBtns[(i + (e.key === "ArrowRight" ? 1 : viewBtns.length - 1)) % viewBtns.length];
    next.focus(); next.click(); e.preventDefault();
  });
});
window.addEventListener("hashchange", () => setView(viewFromHash()));
setView(viewFromHash());

/* 開發測試鉤子：?dicttest=牌序 直接打開字典詳細頁 */
if (location.search.includes("dicttest")) {
  const di = parseInt(new URLSearchParams(location.search).get("dicttest"), 10) || 0;
  const dd = new URLSearchParams(location.search).get("deck");
  const dk = HALL_DECKS.find((d) => d.id === dd);
  if (dk && deckDef !== dk) selectDeck(dk);
  setView("dict");
  showDictCard(Math.min(di, CARDS.length - 1));
}

/* 開發測試鉤子：?rwdtest=盤面id 自動抽完整個盤面（跨牌組） */
if (location.search.includes("rwdtest")) {
  const id = new URLSearchParams(location.search).get("rwdtest") || "gt";
  const dk = HALL_DECKS.find((d) => d.spreads.some((s) => s.id === id));
  if (dk && deckDef !== dk) selectDeck(dk);
  const idx = SPREADS.findIndex((s) => s.id === id);
  if (idx >= 0) {
    document.querySelector(`.spread-btn[data-sid="${id}"]`).click();
    if (spread.cast) {
      for (let i = 0; i < 6; i++) btnThrow.click();   /* 擲卦盤面：擲滿六爻 */
    } else {
      if (spread.sig) $("#sigpick-btns .sig-btn").click();   /* 十字陣：選第一個指示牌選項 */
      deck = riffle(deck); shuffleCount++;
      btnBegin.disabled = false;
      btnBegin.click();
      [...elFan.querySelectorAll(".fan-card")].slice(0, target - drawn.length).forEach((el, i) => {
        el.classList.add("gone");
        placeCard(deck[i]);
      });
    }
    if (location.search.includes("promptdump")) {   /* 無頭驗證:textarea value 不入 DOM 傾印 */
      setTimeout(() => {
        const d = document.createElement("div");
        d.id = "pr-dump"; d.hidden = true;
        try { d.textContent = buildAiPrompt(); } catch (e) { d.textContent = "PR-ERR " + e.message; }
        try {
          const cv = drawSpreadImage();
          d.textContent += "\n[IMG " + cv.width + "x" + cv.height + "]";
          if (location.search.includes("imgdump")) /* 視覺驗證用：與下載按鈕同法，先載牌面圖再畫 */
            loadDrawnImages().then((imgs) => { const c2 = drawSpreadImage(imgs); document.body.innerHTML = ""; document.body.style.background = "#000"; document.body.appendChild(c2); });
        } catch (e) { d.textContent += "\n[IMG-ERR " + e.message + "]"; }
        document.body.appendChild(d);
      }, 2500);
    }
  }
}

/* ?selftest=1:牌組資料自檢——張數/schema/盤面長度/combos 煙霧測試，結果進標題 */
if (location.search.includes("selftest")) {
  const out = [];
  const t = (name, cond, detail) => out.push((cond ? "✓ " : "✗ ") + name + (detail ? " → " + detail : ""));
  const MC = { len: 36, sib: 52, bel: 53, kip: 36, gra: 54, run: 24, esp: 40, yi: 64, zw: 36, dt: 78 };
  DECKS.forEach((d) => {
    t(`${d.id} 張數`, d.cards.length === MC[d.id], `${d.cards.length}≠${MC[d.id]}`);
    const badC = d.cards.filter((c, i) => !(c.n === i + 1 && c.zh && c.keys && c.text && ["good", "bad", "mid"].includes(c.pol) && (!d.reversible || c.rtext || c.norev)));
    t(`${d.id} 牌 schema`, badC.length === 0, badC.slice(0, 3).map((c) => c.n).join(","));
    if (d.id === "gra") t("gra 五系列齊備", d.cards.every((c) => c.myth));
    if (d.id === "run") t("run 三族齊備", d.cards.every((c) => c.aett != null));
    d.spreads.forEach((s) => {
      if (!s.gt && s.positions) {
        t(`${d.id}/${s.id} positions=${s.count}`, s.positions.length === s.count, s.positions.length);
        if (s.hints) t(`${d.id}/${s.id} hints`, s.hints.length === s.positions.length);
        if (s.wx) t(`${d.id}/${s.id} wx`, s.wx.length === s.count);
        if (s.gong) t(`${d.id}/${s.id} gong`, s.gong.length === s.count);
        if (s.place) t(`${d.id}/${s.id} place`, s.place.length === s.count);
      }
      try { s.combos(d.cards.slice(0, s.count)); } catch (e) { t(`${d.id}/${s.id} combos 煙霧`, false, e.message); }
    });
  });
  /* 版面：頁面不得橫向溢出（手機可讀性）;失敗時列出過寬元素 */
  const dw = document.documentElement.scrollWidth, vw = window.innerWidth;
  if (dw > vw + 2) {
    const wide = [...document.querySelectorAll("body *")]
      .filter((el) => el.offsetParent !== null && el.getBoundingClientRect().right > vw + 2 && !el.closest("#slots-scroll,#fan-scroll,.tbl-scroll"))
      .slice(0, 5)
      .map((el) => (el.id ? "#" + el.id : el.className ? "." + String(el.className).split(" ")[0] : el.tagName) + "→" + Math.round(el.getBoundingClientRect().right));
    t("頁面無橫向溢出", false, `${dw}>${vw}:${wide.join("、")}`);
  } else t("頁面無橫向溢出", true);
  const bad = out.filter((s) => s.startsWith("✗"));
  document.title = bad.length ? "SELFTEST-FAIL-" + bad.length : "SELFTEST-OK";
  const dv = document.createElement("div"); dv.id = "selftest-dump"; dv.hidden = true; dv.textContent = out.join("\n");
  document.body.appendChild(dv);
}

/* 開發掛勾:?minidump=1 → 傾印 DECKS_MINI 精簡資料（名/首關鍵詞/吉凶）供 divine-core 重生，改牌名後重抽用 */
if (location.search.includes("minidump")) {
  const obj = {};
  DECKS.forEach((d) => {
    obj[d.id] = { name: d.name, rev: !!d.reversible,
      cards: d.cards.map((c) => [c.zh, (c.keys || "").split("・")[0], c.pol === "good" ? "+" : c.pol === "bad" ? "-" : "0"]) };
  });
  const el = document.createElement("div");
  el.id = "mini-dump"; el.hidden = true;
  el.textContent = JSON.stringify(obj);
  document.body.appendChild(el);
}
