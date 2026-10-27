/* 易經館・入門教學（互動）
   壹 陰陽與四象　貳 揲蓍（大衍筮法，親手分二掛一揲四歸奇）　參 三枚銅錢（點錢翻面、擲錢、小測驗）
   肆 從爻到卦（點爻改陰陽動靜，看本卦、之卦與朱子讀法）　伍 兩種起法的機率　陸 六爻納甲入門
   依賴：divine-core.js（DC.hexNum／trigIdx／TRIG／zhuRank／rand01／coinLine／yarrowLine）、cards-data.js（YI_CARDS）、
   table-engine.js（setView、.spread-btn）。畫面在 yijing.html 的 #learn。 */
(function () {
  "use strict";
  const root = document.getElementById("learn");
  if (!root || typeof DC === "undefined" || typeof YI_CARDS === "undefined") return;

  /* ── 共用小幫手 ── */
  const NAME = { 6: "老陰", 7: "少陽", 8: "少陰", 9: "老陽" };
  const COIN_NAME = { 6: "交", 7: "單", 8: "拆", 9: "重" };
  const POS = ["初", "二", "三", "四", "五", "上"];
  const NAT = { 乾: "天", 兌: "澤", 離: "火", 震: "雷", 巽: "風", 坎: "水", 艮: "山", 坤: "地" };
  const yang = (v) => v === 7 || v === 9;
  const moves = (v) => v === 6 || v === 9;
  const rem4 = (x) => x % 4 || 4;   /* 四四數完，餘零作四 */
  const yaoName = (i, v) => { const n = yang(v) ? "九" : "六"; return i === 0 ? "初" + n : i === 5 ? "上" + n : n + POS[i]; };
  const lineHtml = (v, sm) => `<span class="yl-line${yang(v) ? "" : " yin"}${moves(v) ? " mv" : ""}${sm ? " sm" : ""}" aria-hidden="true">${yang(v) ? "<i></i>" : "<i></i><i></i>"}</span>`;
  const valText = (v) => `${v}・${NAME[v]}${v === 9 ? "・動 ○" : v === 6 ? "・動 ×" : ""}`;
  const short = (n) => { const zh = YI_CARDS[n - 1].zh; return zh.includes("為") ? zh[0] : zh.slice(2); };
  const randInt = (n) => Math.floor(DC.rand01() * n);
  function gua(lines) {   /* 六爻（由下而上的 6–9）→ 本卦、之卦、動爻、互錯綜 */
    const bits = lines.map((v) => (yang(v) ? 1 : 0));
    const mv = lines.map((v, i) => (moves(v) ? i : -1)).filter((i) => i >= 0);
    const zb = bits.map((b, i) => (mv.includes(i) ? 1 - b : b));
    const huOf = (x) => DC.hexNum([x[1], x[2], x[3], x[2], x[3], x[4]]);
    const trig = (x) => DC.TRIG[DC.trigIdx(x)];
    return {
      bits, mv, ben: DC.hexNum(bits), zhi: mv.length ? DC.hexNum(zb) : null,
      lower: trig(bits.slice(0, 3)), upper: trig(bits.slice(3, 6)),
      hu: huOf(bits), cuo: DC.hexNum(bits.map((b) => 1 - b)), zong: DC.hexNum(bits.slice().reverse()),
    };
  }
  function toDivine(sid) {   /* 從教學跳去真的起卦 */
    if (typeof setView === "function") setView("divine");
    const b = document.querySelector(`.spread-btn[data-sid="${sid}"]`);
    if (b) b.click();
  }
  const progHtml = (lines, note) => `<div class="yl-prog">${POS.map((p, i) => {
    const v = lines[i];
    return v ? `<div class="r"><span class="i">${p}爻</span>${lineHtml(v, true)}<span class="v">${valText(v)}${note && note[i] ? "　" + note[i] : ""}</span></div>`
      : `<div class="r empty"><span class="i">${p}爻</span>${lineHtml(7, true)}<span class="v">尚未起</span></div>`;
  }).join("")}</div>`;

  /* ── 骨架 ── */
  const CH = [
    ["yinyang", "陰陽與四象"], ["yarrow", "揲蓍・大衍"], ["coins", "三枚銅錢"],
    ["build", "從爻到卦"], ["prob", "兩法機率"], ["najia", "六爻納甲入門"],
  ];
  const NUM = ["壹", "貳", "參", "肆", "伍", "陸"];
  root.innerHTML = `
    <p class="section-label">入門教學</p>
    <p class="yl-intro">易經起卦只做一件事：<b>得出六個數</b>，每個數是六、七、八、九其中之一。<br>
      數字決定這一爻是陰是陽、動或不動；六爻由下往上疊成一卦，動爻一變，又生出之卦。下面每一章都可以親手操作。
      <small>起卦前先把問題想清楚、一事一占。《蒙》卦辭：「初筮告，再三瀆，瀆則不告。」</small></p>
    <div class="yl-tabs" role="tablist" aria-label="教學章節">${CH.map(([id, t], i) =>
      `<button class="yl-tab" type="button" role="tab" data-ch="${id}"><b>${NUM[i]}</b>${t}</button>`).join("")}</div>
    ${CH.map(([id]) => `<div class="yl-ch" id="yl-${id}" role="tabpanel" hidden></div>`).join("")}`;
  const tabs = [...root.querySelectorAll(".yl-tab")];
  function showCh(id) {
    tabs.forEach((b) => { const on = b.dataset.ch === id; b.classList.toggle("on", on); b.setAttribute("aria-selected", on ? "true" : "false"); });
    CH.forEach(([c]) => { root.querySelector("#yl-" + c).hidden = c !== id; });
    try { localStorage.setItem("dc-yl-ch", id); } catch (e) {}
  }
  tabs.forEach((b) => b.addEventListener("click", () => showCh(b.dataset.ch)));
  const $c = (id) => root.querySelector("#yl-" + id);

  /* ════ 壹 陰陽與四象 ════ */
  $c("yinyang").innerHTML = `
    <h3>陰陽與四象</h3>
    <p class="yl-quote">《繫辭》：「易有太極，是生兩儀，兩儀生四象，四象生八卦。」</p>
    <p>一條連著的線 ${lineHtml(7, true)} 是<b>陽爻</b>，中間斷開的 ${lineHtml(8, true)} 是<b>陰爻</b>。
      但起卦得到的不只是陰陽，而是四種數——這就是「四象」：</p>
    <div class="yl-four">
      <div><div class="n">九</div><div class="nm">老陽</div>${lineHtml(9)}<div class="ch mv">陽到了頭，<b>要動</b><br>變成陰 ⚋</div></div>
      <div><div class="n">七</div><div class="nm">少陽</div>${lineHtml(7)}<div class="ch">年輕的陽<br>不動</div></div>
      <div><div class="n">八</div><div class="nm">少陰</div>${lineHtml(8)}<div class="ch">年輕的陰<br>不動</div></div>
      <div><div class="n">六</div><div class="nm">老陰</div>${lineHtml(6)}<div class="ch mv">陰到了頭，<b>要動</b><br>變成陽 ⚊</div></div>
    </div>
    <p>記法：<b>單數是陽、雙數是陰；七八是「少」不動，九六是「老」要變。</b>物極必反——老陽變陰、老陰變陽，這種會變的爻就叫<b>動爻</b>（也叫變爻），
      畫卦時老陽常記作 ○、老陰記作 ×。</p>
    <div class="yl-box">
      <div class="yl-k">六爻由下而上</div>
      <p>一卦六爻，<b>從最下面往上數</b>：初、二、三、四、五、上。起卦時第一次得到的數畫在最下面。</p>
      <p>爻的名字＝位置＋陰陽：陽爻稱「九」、陰爻稱「六」（七、八也一樣這樣叫）。最下與最上把位置寫在前面，其他寫在後面——
        例如最下面是陽爻叫<b>初九</b>，第三爻是陰爻叫<b>六三</b>，最上面是陰爻叫<b>上六</b>。</p>
      <p>下面三爻是<b>下卦</b>（內卦），上面三爻是<b>上卦</b>（外卦），各是一個經卦：乾天、兌澤、離火、震雷、巽風、坎水、艮山、坤地。</p>
    </div>
    <p class="yl-note">接下來兩章是兩種得出這六個數的方法：揲蓍（古法）和擲錢（後世簡法）。到「從爻到卦」可以自己點點看。</p>`;

  /* ════ 貳 揲蓍・大衍筮法 ════ */
  const Y = { lines: [], lus: [], k: 0, n: 49, L: 24, step: 0, lu: [] };
  const STEP_NAMES = ["分二", "掛一", "揲左", "揲右", "歸奇"];
  const BIAN = ["初變", "再變", "三變"];
  const CN = { 4: "四", 5: "五", 8: "八", 9: "九" };
  function randSplit(n) {   /* 隨手一分：大致對半、不刻意 */
    let L = 0;
    for (let i = 0; i < n; i++) if (DC.rand01() < 0.5) L++;
    return Math.min(n - 2, Math.max(1, L));
  }
  Y.L = randSplit(49);
  const bars = (n, cls) => `<div class="yl-bars${cls ? " " + cls : ""}">${"<i></i>".repeat(n)}</div>`;
  function grouped(x) {   /* x 策四四一數：整組在前，餘數（1–4）標紅 */
    const r = rem4(x), full = (x - r) / 4;
    return `<div class="yl-bars">${Array.from({ length: full }, () => `<span class="grp">${"<i></i>".repeat(4)}</span>`).join("")}<span class="grp rem">${"<i></i>".repeat(r)}</span></div>`;
  }
  const pile = (lab, inner) => `<div class="yl-pile">${inner}<span class="lab">${lab}</span></div>`;
  function yarrowStage() {
    const { n, L, step } = Y, R = n - L;
    if (step === 0) {
      const b = Array.from({ length: n }, (_, i) => `<i data-i="${i}"${i === L - 1 ? ' class="cut"' : ""}></i>`).join("");
      return pile(`手上 <b>${n}</b> 策（點一根，從那裡分開）`, `<div class="yl-bars pick">${b}</div>`);
    }
    const left = step >= 3 ? (step >= 5 ? bars(L - rem4(L)) : grouped(L)) : bars(L);
    const rr = step >= 2 ? R - 1 : R;
    const right = step >= 4 ? (step >= 5 ? bars(rr - rem4(rr)) : grouped(rr)) : bars(rr);
    const hand = step >= 2 && step < 5 ? pile("掛一（夾在指間）", '<div class="yl-bars"><i class="hang"></i></div>') : "";
    const g = 1 + rem4(L) + rem4(rr);
    const aside = step >= 5 ? pile(`歸奇於扐 <b>${g}</b> 策`, bars(g, "aside")) : "";
    return pile(`左手 <b>${step >= 5 ? L - rem4(L) : L}</b> 策`, left) + hand + pile(`右手 <b>${step >= 5 ? rr - rem4(rr) : rr}</b> 策`, right) + aside;
  }
  function yarrowSay() {
    const { n, L, step, k } = Y, R = n - L, rr = R - 1;
    const head = `<b>第 ${Y.lines.length + 1} 爻・${BIAN[k]}</b>　`;
    if (Y.lines.length === 6) {
      const G = gua(Y.lines);
      return `六爻揲完，十八變成卦：本卦「<b>${short(G.ben)}</b>」${G.zhi ? `，動爻在${G.mv.map((i) => POS[i] + "爻").join("、")}，之卦「<b>${short(G.zhi)}</b>」` : "，六爻皆靜"}。
        《繫辭》：「四營而成易，十有八變而成卦。」`;
    }
    if (step === 6) {
      const left = n - Y.lu[2], v = left / 4, small = Y.lu.filter((x) => x === 5 || x === 4).length;
      return `三變扐出 ${Y.lu.map((x) => CN[x]).join("、")}，手上剩 <b>${left}</b> 策。${left} ÷ 4 ＝ <b>${v}</b> → <b>${NAME[v]}</b> ${lineHtml(v, true)}${moves(v) ? "（動爻）" : "（不動）"}。<br>
        <span class="yl-note">另一種算法（掛扐法）只看三變扐出的數：五、四算「少」，九、八算「多」。三少為老陽、三多為老陰、一少兩多為少陽、兩少一多為少陰——這一爻有 ${small} 個少，答案一樣。</span>`;
    }
    return head + [
      `<b>分而為二以象兩</b>：把手上 ${n} 策隨手分成左右兩把，各幾根不必算，憑手感就好。拖曳滑桿或直接點一根蓍草決定從哪裡分開。${k === 0 ? "<br><span class='yl-note'>每一爻都從四十九策起：大衍之數五十，先取一策放回不用（象太極），其用四十有九。</span>" : ""}`,
      `分好了：左手 ${L} 策、右手 ${R} 策。下一步是掛一。`,
      `<b>掛一以象三</b>：從右手那把抽出一策，夾在左手小指與無名指之間。右手剩 ${rr} 策。下一步把左手那把四根四根地數。`,
      `<b>揲之以四以象四時</b>：左手那把四根四根地數，${L} 策數完剩 <b class="yl-red">${rem4(L)}</b> 策${L % 4 === 0 ? "（剛好數完，餘零作四）" : ""}。`,
      `右手那把（掛一後剩 ${rr} 策）也四根四根地數，剩 <b class="yl-red">${rem4(rr)}</b> 策${rr % 4 === 0 ? "（餘零作四）" : ""}。`,
      `<b>歸奇於扐以象閏</b>：掛的一策＋左餘 ${rem4(L)}＋右餘 ${rem4(rr)}＝<b>${1 + rem4(L) + rem4(rr)}</b> 策，放到一旁。${k === 0 ? "初變扐出的數一定是五或九" : "再變、三變扐出的數一定是四或八"}。手上剩 ${n - 1 - rem4(L) - rem4(rr)} 策${k < 2 ? "，用它做下一變" : ""}。`,
    ][step];
  }
  function yarrowRender() {
    const el = $c("yarrow");
    const done = Y.lines.length === 6;
    const steps = STEP_NAMES.map((s, i) => `<span class="${Y.step === 6 || done ? "done" : i < Y.step ? "done" : i === Y.step ? "on" : ""}">${s}</span>`).join("");
    const btn = done ? "再揲一卦" : Y.step === 6 ? `揲第 ${Y.lines.length + 1} 爻（重新拿起四十九策）` : Y.step === 5 ? (Y.k < 2 ? `做${BIAN[Y.k + 1]}` : "算出這一爻") : ["照這樣分開", "掛一", "揲左手", "揲右手", "歸奇"][Y.step];
    el.querySelector(".yl-steps").innerHTML = done ? "" : (Y.k ? `<span class="done">${BIAN.slice(0, Y.k).join("・")}已成</span>` : "") + steps;
    el.querySelector(".yl-stage").innerHTML = done ? "" : yarrowStage();
    el.querySelector(".yl-say").innerHTML = yarrowSay();
    el.querySelector(".yl-split").hidden = done || Y.step !== 0;
    const rg = el.querySelector(".yl-split input");
    rg.max = Y.n - 2; rg.value = Y.L;
    el.querySelector(".yl-split output").textContent = `左 ${Y.L}・右 ${Y.n - Y.L}`;
    el.querySelector(".y-next").textContent = btn;
    el.querySelector(".y-line").hidden = done;
    el.querySelector(".y-to-build").hidden = !done;
    el.querySelector(".y-prog").innerHTML = progHtml(Y.lines, Y.lus.map((lu) => lu.map((x) => CN[x]).join("・")));
    el.querySelectorAll(".yl-bars.pick i").forEach((b) => b.addEventListener("click", () => { Y.L = Math.min(Y.n - 2, Math.max(1, +b.dataset.i + 1)); yarrowRender(); }));
  }
  function yarrowNext() {
    if (Y.lines.length === 6) { Object.assign(Y, { lines: [], lus: [], k: 0, n: 49, step: 0, lu: [] }); Y.L = randSplit(49); return; }
    if (Y.step === 6) { Object.assign(Y, { k: 0, n: 49, step: 0, lu: [] }); Y.L = randSplit(49); return; }
    if (Y.step < 4) { Y.step++; return; }
    if (Y.step === 4) { Y.lu.push(1 + rem4(Y.L) + rem4(Y.n - Y.L - 1)); Y.step = 5; return; }
    /* step 5：歸奇之後 */
    const g = Y.lu[Y.k];
    if (Y.k < 2) { Y.n -= g; Y.k++; Y.step = 0; Y.L = randSplit(Y.n); return; }
    Y.step = 6;
    Y.lines.push((Y.n - g) / 4); Y.lus.push(Y.lu.slice());
  }
  $c("yarrow").innerHTML = `
    <h3>揲蓍・大衍筮法</h3>
    <p class="yl-quote">《繫辭》：「大衍之數五十，其用四十有九。分而為二以象兩，掛一以象三，揲之以四以象四時，歸奇於扐以象閏。」</p>
    <p>這是《周易》本來的起卦法。四十九根蓍草經過「分二、掛一、揲四、歸奇」四個動作叫<b>一變</b>，三變得一爻，十八變得一卦。
      下面照著做一次——分開的位置由你決定，每一步的數字都是真的算出來的。</p>
    <div class="yl-steps"></div>
    <div class="yl-stage"></div>
    <div class="yl-split"><span>左手</span><input type="range" min="1" max="47" aria-label="左手分到幾策"><span>右手</span><output></output>
      <button class="ghost-btn" type="button" data-act="rand">隨手一分</button></div>
    <div class="yl-box yl-say" aria-live="polite"></div>
    <div class="yl-row" style="justify-content:center">
      <button class="ghost-btn gold y-next" type="button"></button>
      <button class="ghost-btn y-line" type="button">自動演完這一爻</button>
      <button class="ghost-btn y-all" type="button">直接揲完六爻</button>
      <button class="ghost-btn gold y-to-build" type="button" hidden>帶到「從爻到卦」看怎麼讀</button>
    </div>
    <div class="y-prog"></div>
    <p class="yl-note">實際揲蓍時不必算機率：分二全憑手感。照這個規則，<b>陽爻容易動、陰爻不容易動</b>（老陽 3/16、老陰 1/16），這是大衍筮法和擲錢最大的不同，第伍章有模擬。
      想真的問一件事，請到<a href="#" data-go="yi-shi">起卦問事・揲蓍</a>。</p>`;
  (function wireYarrow() {
    const el = $c("yarrow");
    el.querySelector(".yl-split input").addEventListener("input", (e) => { Y.L = +e.target.value; yarrowRender(); });
    el.querySelector('[data-act="rand"]').addEventListener("click", () => { Y.L = randSplit(Y.n); yarrowRender(); });
    el.querySelector(".y-next").addEventListener("click", () => { yarrowNext(); yarrowRender(); });
    el.querySelector(".y-line").addEventListener("click", () => {
      if (Y.step === 6) yarrowNext();
      while (Y.step !== 6) { if (Y.step === 0) Y.L = randSplit(Y.n); yarrowNext(); }
      yarrowRender();
    });
    el.querySelector(".y-all").addEventListener("click", () => {
      if (Y.lines.length === 6) yarrowNext();
      while (Y.lines.length < 6) { if (Y.step === 6) yarrowNext(); if (Y.step === 0) Y.L = randSplit(Y.n); yarrowNext(); }
      yarrowRender();
    });
    el.querySelector(".y-to-build").addEventListener("click", () => { B.lines = Y.lines.slice(); buildRender(); showCh("build"); });
    yarrowRender();
  })();

  /* ════ 參 三枚銅錢 ════ */
  const C = { coins: [2, 2, 3], rot: [0, 0, 180], lines: [] };
  const coinFace = '<div class="coin-face zi"><span class="cz t">乾</span><span class="cz b">隆</span><span class="cz r">通</span><span class="cz l">寶</span></div><div class="coin-face bei"></div>';
  const coinRead = (cs) => {
    const v = cs[0] + cs[1] + cs[2], bei = cs.filter((x) => x === 3).length;
    const why = { 0: "三枚都是字——全是陰而且到了極點", 1: "一背兩字——背少，「少者為主」，背代表陽", 2: "兩背一字——字少，「少者為主」，字代表陰", 3: "三枚都是背——全是陽而且到了極點" }[bei];
    return { v, bei, why };
  };
  function coinsRender(animate) {
    const el = $c("coins");
    el.querySelectorAll(".yl-coins .coin").forEach((coin, i) => {
      const inner = coin.firstElementChild;
      if (animate) { coin.classList.remove("tossing"); void coin.offsetWidth; coin.classList.add("tossing"); coin.style.animationDelay = i * 90 + "ms"; inner.style.transitionDelay = i * 90 + "ms"; }
      else inner.style.transitionDelay = "0ms";
      inner.style.transform = `rotateX(${C.rot[i]}deg)`;
      coin.setAttribute("aria-label", `第 ${i + 1} 枚：${C.coins[i] === 3 ? "背" : "字"}，點一下翻面`);
    });
    el.querySelector(".yl-coinlab").innerHTML = C.coins.map((x) => `<span>${x === 3 ? "背＝3" : "字＝2"}</span>`).join("");
    const r = coinRead(C.coins);
    el.querySelector(".c-read").innerHTML = `${C.coins.join(" ＋ ")} ＝ <span class="yl-big">${r.v}</span>　→　<b>${NAME[r.v]}</b>（${COIN_NAME[r.v]}）${lineHtml(r.v, true)}${moves(r.v) ? '　<span class="yl-red">動爻</span>' : "　不動"}<br><span class="yl-note">${r.why}。</span>`;
    el.querySelector(".c-prog").innerHTML = progHtml(C.lines, null);
    el.querySelector(".c-add").disabled = C.lines.length >= 6;
    el.querySelector(".c-add").textContent = C.lines.length >= 6 ? "六爻已滿" : `記下這一爻（第 ${C.lines.length + 1} 爻・${POS[C.lines.length] || ""}爻）`;
    el.querySelector(".c-to-build").hidden = C.lines.length < 6;
  }
  function setCoin(i, val, spin) {   /* 背朝上＝轉到 180°（與起卦問事的擲錢動畫同一套 3D 錢） */
    let t = C.rot[i] + (spin || 0);
    if ((((t % 360) + 360) % 360 === 180) !== (val === 3)) t += 180;
    C.rot[i] = t; C.coins[i] = val;
  }
  /* 小測驗：看三枚錢說出是哪一種爻（不計分，答錯就再看一次說明） */
  const Q = { coins: null };
  function quizNew() {
    Q.coins = [0, 0, 0].map(() => (DC.rand01() < 0.5 ? 2 : 3));
    const el = $c("coins");
    el.querySelector(".coinrow").textContent = Q.coins.map((x) => (x === 3 ? "背" : "字")).join(" ");
    el.querySelector(".q-fb").innerHTML = "　";
  }
  $c("coins").innerHTML = `
    <h3>三枚銅錢</h3>
    <p class="yl-quote">以錢代蓍，相傳出自京房、《火珠林》一系：三枚錢擲一次得一爻，六擲成卦。</p>
    <p>銅錢有兩面：有字的一面叫<b>字</b>，另一面叫<b>背</b>。本館的算法是<b>背算 3、字算 2</b>，三枚加起來一定是六、七、八、九其中之一——正好對上四象。
      點銅錢可以翻面，或按「擲一次」。</p>
    <div class="yl-coins">${[0, 1, 2].map(() => `<div class="coin" role="button" tabindex="0"><div class="coin-inner">${coinFace}</div></div>`).join("")}</div>
    <div class="yl-coinlab"></div>
    <div class="yl-box c-read" aria-live="polite"></div>
    <div class="yl-box">
      <div class="yl-k">口訣：少者為主</div>
      <p>看三枚裡<b>哪一種面比較少</b>，那一面說了算：一背兩字是陽（叫「<b>單</b>」）、兩背一字是陰（叫「<b>拆</b>」）。
        三枚同面就是到了極點，要變：三背是老陽（叫「<b>重</b>」，記 ○），三字是老陰（叫「<b>交</b>」，記 ×）。</p>
      <p class="yl-note">也有人反過來以字為陽。哪一種都行，擲之前自己定好、前後一致就好；本館「起卦問事」一律用背 3 字 2。</p>
    </div>
    <div class="yl-row" style="justify-content:center">
      <button class="ghost-btn gold c-toss" type="button">擲一次</button>
      <button class="ghost-btn c-add" type="button"></button>
      <button class="ghost-btn c-clear" type="button">清空重來</button>
      <button class="ghost-btn gold c-to-build" type="button" hidden>帶到「從爻到卦」看怎麼讀</button>
    </div>
    <div class="c-prog"></div>
    <p class="yl-note">第一擲是初爻、畫在最下面，第六擲是上爻。想真的問一件事，請到<a href="#" data-go="yi-cast">起卦問事・三錢六擲</a>。</p>
    <div class="yl-box yl-quiz">
      <div class="yl-k">考考你</div>
      <p>擲出這三枚，是哪一種爻？</p>
      <div class="coinrow"></div>
      <div class="yl-row">${[7, 8, 9, 6].map((v) => `<button class="ghost-btn q-ans" type="button" data-v="${v}">${NAME[v]}</button>`).join("")}
        <button class="ghost-btn q-next" type="button">換一題</button></div>
      <p class="q-fb" aria-live="polite">　</p>
    </div>`;
  (function wireCoins() {
    const el = $c("coins");
    el.querySelectorAll(".yl-coins .coin").forEach((coin, i) => {
      const flip = () => { setCoin(i, C.coins[i] === 3 ? 2 : 3); coinsRender(false); };
      coin.addEventListener("click", flip);
      coin.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } });
    });
    el.querySelector(".c-toss").addEventListener("click", () => { DC.coinLine().coins.forEach((x, i) => setCoin(i, x, 900)); coinsRender(true); });
    el.querySelector(".c-add").addEventListener("click", () => { if (C.lines.length < 6) { C.lines.push(coinRead(C.coins).v); coinsRender(false); } });
    el.querySelector(".c-clear").addEventListener("click", () => { C.lines = []; coinsRender(false); });
    el.querySelector(".c-to-build").addEventListener("click", () => { B.lines = C.lines.slice(); buildRender(); showCh("build"); });
    el.querySelectorAll(".q-ans").forEach((b) => b.addEventListener("click", () => {
      const r = coinRead(Q.coins), ok = +b.dataset.v === r.v;
      el.querySelector(".q-fb").innerHTML = (ok ? "<b>對。</b>" : `<span class="yl-red">不是喔，</span>答案是<b>${NAME[r.v]}</b>。`) +
        `${Q.coins.join("＋")}＝${r.v}；${r.why}。`;
    }));
    el.querySelector(".q-next").addEventListener("click", quizNew);
    quizNew();
    coinsRender(false);
  })();

  /* ════ 肆 從爻到卦 ════ */
  const B = { lines: [7, 7, 7, 8, 8, 8] };   /* 預設：地天泰（下乾上坤） */
  function readRule(G, lines) {
    const m = G.mv.length, bz = `本卦「${short(G.ben)}」`, zz = G.zhi ? `之卦「${short(G.zhi)}」` : "";
    const still = [0, 1, 2, 3, 4, 5].filter((i) => !G.mv.includes(i));
    switch (m) {
      case 0: return `<b>六爻皆靜</b>：讀${bz}的<b>卦辭</b>（可參彖傳、大象）。內卦為貞（我方、現況），外卦為悔（對方、後勢）。`;
      case 1: return `<b>一爻動</b>：讀${bz}<b>${yaoName(G.mv[0], lines[G.mv[0]])}</b>的爻辭。`;
      case 2: return `<b>二爻動</b>：${bz}兩個動爻（${G.mv.map((i) => yaoName(i, lines[i])).join("、")}）的爻辭都讀，以<b>上面那一爻 ${yaoName(G.mv[1], lines[G.mv[1]])}</b> 為主。`;
      case 3: { const z = DC.zhuRank(G.mv); return `<b>三爻動</b>：${bz}和${zz}的卦辭一起讀，本卦為貞、之卦為悔。依朱子變占表，這組動爻排第 ${z.rank} 卦，${z.zhen ? `前十卦<b>主貞</b>——以${bz}為主` : `後十卦<b>主悔</b>——以${zz}為主`}。`; }
      case 4: return `<b>四爻動</b>：改讀${zz}裡兩個<b>不變的爻</b>（${still.map((i) => yaoName(i, lines[i])).join("、")}）的爻辭，以<b>下面那一爻 ${yaoName(still[0], lines[still[0]])}</b> 為主。`;
      case 5: return `<b>五爻動</b>：讀${zz}唯一不變的那一爻 <b>${yaoName(still[0], lines[still[0]])}</b> 的爻辭。`;
      default: return G.ben === 1 ? "<b>六爻皆動</b>：乾卦讀「<b>用九</b>：見群龍无首，吉」。"
        : G.ben === 2 ? "<b>六爻皆動</b>：坤卦讀「<b>用六</b>：利永貞」。"
        : `<b>六爻皆動</b>：讀${zz}的卦辭。`;
    }
  }
  const fig = (n, cap) => `<figure><img src="${YI_CARDS[n - 1].img}" alt="${YI_CARDS[n - 1].zh}卦牌" loading="lazy"><figcaption>${cap}<br>${YI_CARDS[n - 1].glyph} ${YI_CARDS[n - 1].zh}<small>第 ${n} 卦・${YI_CARDS[n - 1].keys.split("・").slice(0, 2).join("・")}</small></figcaption></figure>`;
  function buildRender() {
    const el = $c("build"), L = B.lines, G = gua(L);
    el.querySelector(".yl-yao").innerHTML = L.map((v, i) =>
      `<button type="button" data-i="${i}" aria-label="${POS[i]}爻：${NAME[v]}，點一下換"><span class="pos">${yaoName(i, v)}</span>${lineHtml(v)}<span class="val${moves(v) ? " mv" : ""}">${valText(v)}</span></button>`).join("");
    el.querySelectorAll(".yl-yao button").forEach((b) => b.addEventListener("click", () => {
      const i = +b.dataset.i;
      B.lines[i] = { 7: 8, 8: 9, 9: 6, 6: 7 }[B.lines[i]];
      buildRender();
      el.querySelector(`.yl-yao button[data-i="${i}"]`).focus();
    }));
    el.querySelector(".yl-gua").innerHTML = fig(G.ben, "本卦・貞") +
      (G.zhi ? fig(G.zhi, "之卦・悔") : `<div class="none">六爻皆靜<br>沒有之卦</div>`);
    el.querySelector(".b-struct").innerHTML = `上卦 <b>${G.upper}</b>（${NAT[G.upper]}）在上、下卦 <b>${G.lower}</b>（${NAT[G.lower]}）在下，合成「${YI_CARDS[G.ben - 1].zh}」。` +
      (G.mv.length ? `動爻：${G.mv.map((i) => yaoName(i, L[i])).join("、")}；把它們陰陽互換，就得到之卦「${short(G.zhi)}」。` : "沒有動爻。");
    el.querySelector(".b-rule").innerHTML = readRule(G, L);
    el.querySelector(".b-more").innerHTML = `互卦「${short(G.hu)}」（二三四爻作下卦、三四五爻作上卦，看事中暗藏的情勢）・錯卦「${short(G.cuo)}」（六爻陰陽全反，立場對調）・綜卦「${short(G.zong)}」（整卦上下顛倒，從對方看過來）。`;
  }
  $c("build").innerHTML = `
    <h3>從爻到卦</h3>
    <p class="yl-quote">朱子《易學啟蒙・考變占》：依動爻多寡，決定讀哪一句。</p>
    <p>點任何一爻，會依 七→八→九→六 輪換。看看本卦、之卦怎麼跟著變，以及這一卦該讀哪一句。從「揲蓍」「三枚銅錢」擲出的六爻也可以帶過來。</p>
    <div class="yl-build">
      <div><div class="yl-yao"></div>
        <div class="yl-row"><button class="ghost-btn b-rand" type="button">用三錢隨機擲一卦</button><button class="ghost-btn b-still" type="button">全部改成不動</button></div></div>
      <div><div class="yl-gua"></div></div>
    </div>
    <div class="yl-box"><div class="yl-k">卦的結構</div><p class="b-struct"></p></div>
    <div class="yl-box"><div class="yl-k">這一卦讀哪一句</div><p class="b-rule"></p>
      <p class="yl-note">六種情況：靜讀本卦卦辭；一爻動讀該爻；二爻動以上爻為主；三爻動兼讀兩卦卦辭；四爻動、五爻動改讀之卦的不變爻；六爻皆動讀之卦卦辭（乾坤讀用九、用六）。卦辭爻辭請以《周易》原文為準。</p></div>
    <div class="yl-box"><div class="yl-k">輔參：互、錯、綜</div><p class="b-more"></p>
      <p class="yl-note">這三種只是輔助觀察，主斷仍以本卦、之卦和上面那一句為準。</p></div>`;
  (function wireBuild() {
    const el = $c("build");
    el.querySelector(".b-rand").addEventListener("click", () => { B.lines = [0, 1, 2, 3, 4, 5].map(() => DC.coinLine().v); buildRender(); });
    el.querySelector(".b-still").addEventListener("click", () => { B.lines = B.lines.map((v) => (v === 9 ? 7 : v === 6 ? 8 : v)); buildRender(); });
    buildRender();
  })();

  /* ════ 伍 兩法機率 ════ */
  const THEORY = { coins: { 6: 2, 7: 6, 8: 6, 9: 2 }, yarrow: { 6: 1, 7: 5, 8: 7, 9: 3 } };   /* 以 1/16 計 */
  function probRender(sim) {
    const el = $c("prob");
    el.querySelector("tbody").innerHTML = [9, 7, 8, 6].map((v) => {
      const cell = (k, cls) => {
        const th = THEORY[k][v] / 16, got = sim ? sim[k][v] / sim.n : null;
        return `<td><span class="yl-bar${cls}" style="width:${Math.round(th * 220)}px"></span>${THEORY[k][v]}/16（${(th * 100).toFixed(1)}%）${sim ? `<br><span class="yl-note">模擬 ${(got * 100).toFixed(1)}%</span>` : ""}</td>`;
      };
      return `<tr><td>${lineHtml(v, true)} ${v}・${NAME[v]}</td>${cell("yarrow", " y")}${cell("coins", "")}</tr>`;
    }).join("");
  }
  $c("prob").innerHTML = `
    <h3>兩種起法差在哪</h3>
    <p class="yl-quote">朱子掛扐法的機率：老陰 1/16、少陽 5/16、少陰 7/16、老陽 3/16。</p>
    <p>擲錢是揲蓍的簡化，得到的也是六七八九，但<b>機率不一樣</b>：</p>
    <div class="yl-tbl"><table class="yl-prob"><thead><tr><th>爻</th><th>揲蓍（大衍）</th><th>三枚銅錢</th></tr></thead><tbody></tbody></table></div>
    <div class="yl-row"><button class="ghost-btn gold p-run" type="button">各起 1,600 爻模擬看看</button></div>
    <ul>
      <li>擲錢的陰陽、動靜完全對稱：老陽、老陰各 1/8，<b>動爻的機會陰陽一樣</b>。</li>
      <li>揲蓍的陰陽總數一樣各半（8/16），但<b>老陽是老陰的三倍</b>：陽爻容易動、陰爻不容易動。古人說「陽主動、陰主靜」，揲蓍的機率正好如此。</li>
      <li>兩種方法一爻會動的機會都是 1/4，平均每卦 1.5 個動爻；差別只在動的是陽爻居多（揲蓍）還是陰陽各半（擲錢）。</li>
    </ul>
    <p class="yl-note">所以兩種方法都正統，只是氣質不同：想照《周易》本法、求慎重就揲蓍；臨時起意、手邊只有零錢就擲錢。</p>`;
  $c("prob").querySelector(".p-run").addEventListener("click", () => {
    const sim = { n: 1600, coins: { 6: 0, 7: 0, 8: 0, 9: 0 }, yarrow: { 6: 0, 7: 0, 8: 0, 9: 0 } };
    for (let i = 0; i < sim.n; i++) { sim.coins[DC.coinLine().v]++; sim.yarrow[DC.yarrowLine().v]++; }
    probRender(sim);
  });
  probRender(null);

  /* ════ 陸 六爻納甲入門 ════ */
  $c("najia").innerHTML = `
    <h3>六爻納甲入門</h3>
    <p class="yl-quote">京房八宮、《火珠林》、《增刪卜易》一系：同樣三錢起卦，讀法換成五行生剋。</p>
    <p>前面講的是「讀卦辭爻辭」的周易讀法。<b>納甲</b>（也叫文王課、六爻）起卦一樣，但成卦之後不以卦爻辭為主，而是給每一爻配上干支五行，看生剋旺衰：</p>
    <ol>
      <li><b>八宮與世應</b>：六十四卦分屬乾、坎、艮、震、巽、離、坤、兌八宮，每卦有一個<b>世爻</b>（代表自己）和一個<b>應爻</b>（代表對方、對象）。</li>
      <li><b>納甲</b>：每一爻配上天干地支，地支帶五行。</li>
      <li><b>六親</b>：拿卦所屬那一宮的五行當「我」，和各爻五行比：生我者<b>父母</b>、我生者<b>子孫</b>、剋我者<b>官鬼</b>、我剋者<b>妻財</b>、同類為<b>兄弟</b>。</li>
      <li><b>用神</b>：依所問之事挑一個六親來看——問文書長輩房屋看父母、問工作官司疾病看官鬼、問錢財看妻財、問子女平安看子孫、問同輩競爭看兄弟。</li>
      <li><b>月建、日辰</b>：起卦當下的月份與日子，決定用神是旺是衰；<b>旬空</b>、<b>月破</b>的爻要等出空、填實才應事。</li>
      <li><b>動變</b>：動爻能生剋別的爻，動爻變出的爻回頭生剋本爻。六神（青龍、朱雀、勾陳、螣蛇、白虎、玄武）只作象意參考。</li>
    </ol>
    <p>這些排盤本館會自動替你算好，排在起卦結果裡，也寫進 AI 提示詞。要用就到<a href="#" data-go="yi-najia">起卦問事・六爻納甲</a>。</p>
    <p class="yl-note">周易讀法和納甲讀法是兩套系統，同一卦不要混著斷：選了哪一種起法，就照那一種讀。</p>`;

  /* 跳轉連結：到起卦問事的指定起法 */
  root.addEventListener("click", (e) => {
    const a = e.target.closest("[data-go]");
    if (!a) return;
    e.preventDefault();
    toDivine(a.dataset.go);
  });

  let first = "yinyang";
  try { const s = new URLSearchParams(location.search).get("ch") || localStorage.getItem("dc-yl-ch"); if (CH.some(([c]) => c === s)) first = s; } catch (e) {}
  showCh(first);

  /* 開發測試：?learntest=1 → 揲蓍逐步走完六爻（每變扐數須為 5|9、4|8，餘策 ÷4 ∈ 6–9）、三錢記滿六爻、從爻到卦朱子讀法抽查、機率模擬，結果進標題 */
  if (/[?&]learntest=1/.test(location.search)) {
    const bad = [];
    const yEl = $c("yarrow"), next = yEl.querySelector(".y-next");
    let guard = 0;
    while (Y.lines.length < 6 && guard++ < 400) {
      if (Y.step === 0) { Y.L = 1 + randInt(Y.n - 2); }   /* 極端分法也要成立 */
      next.click();
      if (Y.step === 5 && !(Y.k === 0 ? [5, 9] : [4, 8]).includes(Y.lu[Y.k])) bad.push("扐數" + Y.lu.join(","));
    }
    if (Y.lines.length !== 6 || Y.lines.some((v) => ![6, 7, 8, 9].includes(v))) bad.push("揲蓍六爻 " + Y.lines.join(","));
    if (yEl.querySelector(".y-to-build").hidden) bad.push("揲蓍完成鈕");
    yEl.querySelector(".y-to-build").click();
    if (B.lines.join() !== Y.lines.join()) bad.push("帶入從爻到卦");
    const cEl = $c("coins");
    for (let i = 0; i < 6; i++) { cEl.querySelector(".c-toss").click(); cEl.querySelector(".c-add").click(); }
    if (C.lines.length !== 6 || !cEl.querySelector(".c-add").disabled) bad.push("三錢六爻");
    setCoin(0, 3); setCoin(1, 2); setCoin(2, 2); if (coinRead(C.coins).v !== 7) bad.push("一背兩字≠7");
    const cases = [   /* [六爻, 讀法須含] */
      [[7, 7, 7, 8, 8, 8], "六爻皆靜"], [[9, 7, 7, 8, 8, 8], "初九"], [[7, 9, 7, 6, 8, 8], "六四</b> 為主"],
      [[9, 9, 9, 9, 9, 9], "用九"], [[6, 6, 6, 6, 6, 6], "用六"], [[9, 9, 9, 8, 8, 8], "第 1 卦"], [[9, 9, 9, 6, 8, 8], "之卦「豫」"], [[7, 7, 7, 6, 6, 6], "第 20 卦"],
      [[9, 9, 9, 9, 8, 8], "下面那一爻 六五"], [[7, 9, 9, 9, 6, 6], "唯一不變的那一爻 <b>初九"],
    ];
    cases.forEach(([ls, want]) => { const h = readRule(gua(ls), ls); if (!h.includes(want)) bad.push(ls.join("") + "→" + h.replace(/<[^>]+>/g, "").slice(0, 30)); });
    if (gua([7, 7, 7, 8, 8, 8]).ben !== 11) bad.push("泰卦序");
    $c("prob").querySelector(".p-run").click();
    showCh("build");
    document.title = bad.length ? "LEARN-TEST-FAIL " + bad.join("｜") : "LEARN-TEST-OK";
  }
})();
