/* 象棋卜卦引擎（象棋館；參考《改寫人生的象棋卜卦》的體系，本站實作與改寫）。
 * 純計算、無 DOM：十字五子的吃子、保護、抗衡、牽制、得失計分、格局判定，與命盤八局（含過局往上吃）。
 * 盤面座標：x 0 左、1 中、2 右；y 由上往下增加。十字五位：①中 ②左 ③右 ④上 ⑤下。
 * 書中分數「僅供判定參考」，例題偶有省略；本引擎以書中例題為測試（tests/xq-engine-test.js）。 */
(function (root) {
  const KINDS = ["king", "guard", "elephant", "chariot", "horse", "cannon", "soldier"];
  const VAL = { king: 80, guard: 60, elephant: 40, chariot: 30, horse: 20, cannon: 15, soldier: 10 };
  const CH = { king: ["帥", "將"], guard: ["仕", "士"], elephant: ["相", "象"], chariot: ["俥", "車"], horse: ["傌", "馬"], cannon: ["炮", "包"], soldier: ["兵", "卒"] };
  const PAIR = { king: "帥將", guard: "仕士", elephant: "相象", chariot: "俥車", horse: "傌馬", cannon: "炮包", soldier: "兵卒" };
  const WX = { king: "金", guard: "金", elephant: "火", chariot: "木", horse: "木", cannon: "水", soldier: "土" };
  const TRI = { king: "天", guard: "天", elephant: "天", chariot: "人", horse: "人", cannon: "人", soldier: "地" };
  /* 臟腑：五行對應，傌馬另主關節筋絡 */
  const ORGAN = { king: "大腦中樞、神經與氣血運行", guard: "肺、支氣管、大腸、皮膚", elephant: "心血管、小腸", chariot: "肝膽、筋、眼睛",
    horse: "關節筋絡（也較易有意外碰撞）", cannon: "腎臟、膀胱、泌尿與婦科、骨頭、耳朵", soldier: "脾胃、肌肉、口腔" };
  const WX_ORGAN = { 金: "肺、支氣管、大腸、皮膚", 木: "肝膽、筋、眼睛", 火: "心血管、小腸", 土: "脾胃、肌肉、口腔", 水: "腎臟、泌尿、婦科、骨頭、耳朵" };
  const KIND_OF = {};
  KINDS.forEach((k) => { KIND_OF[CH[k][0]] = [k, true]; KIND_OF[CH[k][1]] = [k, false]; });

  const POS = [[1, 1], [0, 1], [2, 1], [1, 0], [1, 2]];   // ①中 ②左 ③右 ④上 ⑤下
  const POS_ZH = ["中", "左", "右", "上", "下"];
  const NUM = ["①", "②", "③", "④", "⑤"];

  let uid = 0;
  function piece(ch) {
    if (ch && typeof ch === "object") return ch;
    const k = KIND_OF[ch];
    if (!k) throw new Error("不是棋子：" + ch);
    return { kind: k[0], red: k[1], ch, id: "p" + (++uid) };
  }
  const val = (p) => VAL[p.kind];
  const color = (p) => (p.red ? "紅" : "黑");

  /* ── 盤面：Map key "x,y" → piece ── */
  const key = (x, y) => x + "," + y;
  const xy = (k) => k.split(",").map(Number);
  function clone(b) { return new Map(b); }
  function crossBoard(list) {   // list：五子（中左右上下）
    const b = new Map();
    list.forEach((c, i) => { if (c) b.set(key(POS[i][0], POS[i][1]), piece(c)); });
    return b;
  }

  let slide = false;
  /* 走法（幾何）：帥仕相俥兵走直、傌走斜、炮隔一子飛山；俥可沿直線滑過空位；兵不能往下 */
  function geomOK(b, p, from, to) {
    const [x1, y1] = xy(from), [x2, y2] = xy(to), dx = x2 - x1, dy = y2 - y1, ax = Math.abs(dx), ay = Math.abs(dy);
    switch (p.kind) {
      case "horse": return ax === 1 && ay === 1;
      case "soldier": return ax + ay === 1 && dy !== 1;
      case "chariot": {
        if ((dx && dy) || (!dx && !dy)) return false;
        if (!slide) return ax + ay === 1;   /* 十字單卦裡俥車只走一步；命盤過局才可沿縱列隔空 */
        const sx = Math.sign(dx), sy = Math.sign(dy);
        for (let x = x1 + sx, y = y1 + sy; x !== x2 || y !== y2; x += sx, y += sy) if (b.has(key(x, y))) return false;
        return true;
      }
      case "cannon": {
        if ((dx && dy) || (!dx && !dy)) return false;
        const sx = Math.sign(dx), sy = Math.sign(dy);
        let n = 0;
        for (let x = x1 + sx, y = y1 + sy; x !== x2 || y !== y2; x += sx, y += sy) if (b.has(key(x, y))) n++;
        return n === 1;
      }
      default: return ax + ay === 1;   // king, guard, elephant
    }
  }
  /* 位階：同色不吃；將帥不吃兵卒、兵卒不吃將帥（loose 時不論，用於判斷保護）；仕士不吃將帥；相象不吃將帥仕士 */
  function rankOK(p, q, loose) {
    if (!p || !q || p.red === q.red) return false;
    if (p.kind === "king") return q.kind !== "soldier" || loose;
    if (p.kind === "soldier") return q.kind !== "king" || loose;
    if (p.kind === "guard") return q.kind !== "king";
    if (p.kind === "elephant") return q.kind !== "king" && q.kind !== "guard";
    return true;
  }
  function canCap(b, from, to, loose) {
    const p = b.get(from), q = b.get(to);
    return !!p && !!q && rankOK(p, q, loose) && geomOK(b, p, from, to);
  }
  function moved(b, from, to) { const b2 = clone(b); b2.set(to, b.get(from)); b2.delete(from); return b2; }
  /* 保護：P 吃到 Q 的位置後，Q 方有別的棋子能吃回來 */
  function protectedAt(b, from, to) {
    const q = b.get(to), b2 = moved(b, from, to);
    for (const [k, r] of b2) if (k !== to && r.red === q.red && canCap(b2, k, to, true)) return true;
    return false;
  }
  /* 牽制：一、Q 能吃 P 方其它棋子；二、P 原本在保護某隻同色棋，一離開那隻就失去保護 */
  const SMALL = { soldier: 1, cannon: 1 };   /* 怕被吃的是兵卒炮包：牽制能量小（命盤中可不顧牽制） */
  function restrained(b, from, to, ignoreSmall) {
    const p = b.get(from);
    for (const [k, r] of b) if (k !== from && k !== to && r.red === p.red && !(ignoreSmall && SMALL[r.kind]) && canCap(b, to, k, false)) return true;
    const b3 = moved(b, from, to);
    for (const [k, r] of b) {
      if (k === from || k === to || r.red !== p.red || (ignoreSmall && SMALL[r.kind])) continue;
      for (const [a, e] of b) {
        if (a === to || e.red === p.red || !canCap(b, a, k, false)) continue;
        if (!canCap(moved(b, a, k), from, k, true)) continue;   // P 原本護得到 R
        if (canCap(b3, a, k, false) && !protectedAt(b3, a, k)) return true;
      }
    }
    return false;
  }

  /* ── 十字五子分析 ── */
  const REL = (() => {   // 位置關係：adj 相鄰（中與外圍）、diag 斜對、across 相隔
    const r = {};
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
      if (i === j) continue;
      const [x1, y1] = POS[i], [x2, y2] = POS[j], d = Math.abs(x1 - x2) + Math.abs(y1 - y2);
      r[i + "" + j] = d === 1 ? "adj" : (Math.abs(x1 - x2) === 1 && Math.abs(y1 - y2) === 1) ? "diag" : "across";
    }
    return r;
  })();
  const rel = (i, j) => REL[i + "" + j];
  const visible = (i, j) => rel(i, j) !== "across";
  function friendRel(kind, r) { return kind === "horse" ? r === "diag" : kind === "cannon" ? r === "across" : r === "adj"; }

  function captureValue(ctx, b, from, to) {
    const p = b.get(from), q = b.get(to), why = [];
    if (!canCap(b, from, to, false)) return null;
    const full = val(q);
    if (ctx.lone && ctx.lone.id === p.id && (p.kind === "horse" || p.kind === "cannon")) {
      const fr = ctx.friendPairs.some((f) => f.includes(p.id) && f.includes(q.id));
      return { v: full, full: true, why: ["唯一顏色的" + p.ch + "一定會吃" + (fr ? "（與好朋友，被吃機率約 50%）" : "")], p50: fr };
    }
    if (ctx.lone && ctx.lone.id === q.id) return { v: full / 2, full: false, why: ["唯一顏色不會被吃，只得好處"] };
    if (ctx.friend) return { v: full / 2, full: false, why: ["好朋友格，不真吃，只得好處"] };
    if (protectedAt(b, from, to)) why.push("有保護");
    else if (to === ctx.centerKey && b.get(to) === ctx.centerPiece && canCap(b, to, from, false)) why.push("中間能抗衡");
    else if (restrained(b, from, to, ctx.ignoreSmall)) why.push("牽制");
    return why.length ? { v: full / 2, full: false, why } : { v: full, full: true, why: [] };
  }
  /* 一隻棋的收穫：直接能吃或得好處的全部計入；整隻吃掉後移到該位置，可接著吃（中間被吃後入中、傌馬繞一圈） */
  function haul(ctx, b, from, seen, depth) {
    const out = [];
    for (const to of b.keys()) {
      const q = b.get(to);
      if (seen.has(q.id)) continue;
      const cv = captureValue(ctx, b, from, to);
      if (!cv) continue;
      seen.add(q.id);
      out.push({ target: q, at: to, from, v: cv.v, full: cv.full, why: cv.why, p50: cv.p50, chain: depth > 0 });
      if (cv.full && depth < 4) out.push(...haul(ctx, moved(b, from, to), to, seen, depth + 1));
    }
    return out;
  }
  /* 能不能整隻吃：依序吃掉、移動（對方不動），dfs 找出能否達成目標 */
  function canReach(ctx, b, side, goal, ignoreRestraint, depth) {
    if (goal(b)) return true;
    if (depth > 6) return false;
    for (const [from, p] of b) {
      if (p.red !== side) continue;
      for (const to of b.keys()) {
        if (!canCap(b, from, to, false)) continue;
        const q = b.get(to);
        let full;
        if (ctx.lone && ctx.lone.id === p.id && (p.kind === "horse" || p.kind === "cannon")) full = true;
        else if ((ctx.lone && ctx.lone.id === q.id) || ctx.friend) full = false;
        else full = !protectedAt(b, from, to) && !(to === ctx.centerKey && q === ctx.centerPiece && canCap(b, to, from, false)) && (ignoreRestraint || !restrained(b, from, to));
        if (!full) continue;
        /* 書中推演時，吃子者有時視為留在原位（只是拿掉被吃的棋），有時接著走（傌馬繞圈）：兩種都試 */
        const stay = clone(b); stay.delete(to);
        if (canReach(ctx, moved(b, from, to), side, goal, ignoreRestraint, depth + 1) || canReach(ctx, stay, side, goal, ignoreRestraint, depth + 1)) return true;
      }
    }
    return false;
  }

  function analyzeCross(list, opt) {
    opt = opt || {};
    const ps = list.map(piece), b = crossBoard(ps);
    const center = ps[0], own = center.red;
    const centerKey = key(1, 1);
    const at = (i) => ps[i];
    const reds = ps.filter((p) => p.red).length;
    const lone = reds === 1 ? ps.find((p) => p.red) : reds === 4 ? ps.find((p) => !p.red) : null;
    const friendPairs = [], pats = [];
    for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) {
      const a = ps[i], c = ps[j];
      if (a.kind === c.kind && a.red !== c.red && friendRel(a.kind, rel(i, j))) friendPairs.push([a.id, c.id, i, j]);
    }
    const ctx = { friend: friendPairs.length > 0, friendPairs, lone, centerKey, centerPiece: center, ignoreSmall: !!opt.ignoreSmall };

    /* 得失：每隻棋各自計（同一目標可被不同棋子各算一次，與書中算法一致） */
    const caps = [];
    for (const [from, p] of b) for (const h of haul(ctx, b, from, new Set([p.id]), 0)) caps.push(Object.assign({ by: p }, h));
    /* 相鄰明君：將帥與對方兵卒互為依存不互吃，將帥得兵卒好處、兵卒得將帥好處（最多 40） */
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
      const k = ps[i], s = ps[j];
      if (k.kind === "king" && s.kind === "soldier" && k.red !== s.red && rel(i, j) === "adj") {
        caps.push({ by: k, target: s, v: val(s) / 2, full: false, why: ["相鄰明君，得兵卒好處"] });
        caps.push({ by: s, target: k, v: val(k) / 2, full: false, why: ["相鄰明君，得將帥好處（最多 40）"] });
      }
    }
    const gain = caps.filter((c) => c.by.red === own).reduce((s, c) => s + c.v, 0);
    const cost = caps.filter((c) => c.by.red !== own).reduce((s, c) => s + c.v, 0);

    /* 通吃／被通吃 */
    const enemyIds = ps.filter((p) => p.red !== own).map((p) => p.id), ownIds = ps.filter((p) => p.red === own).map((p) => p.id);
    const fullBy = (side) => caps.filter((c) => c.full && c.by.red === side);
    const eatenAll = (ids, side) => ids.length > 0 && ids.every((id) => fullBy(side).some((c) => c.target.id === id));
    const tongchi = !ctx.friend && eatenAll(enemyIds, own);
    const centerEaten = fullBy(!own).some((c) => c.target.id === center.id);
    const beitong = centerEaten || eatenAll(ownIds, !own);
    const goneAll = (ids) => (bb) => ![...bb.values()].some((p) => ids.includes(p.id));
    const centerGone = (bb) => ![...bb.values()].some((p) => p.id === center.id);
    const tongchiMaybe = !tongchi && enemyIds.length > 0 && canReach(ctx, b, own, goneAll(enemyIds), false, 0);
    const beitongMaybe = !beitong && (canReach(ctx, b, !own, centerGone, true, 0)
      || (lone && lone.red !== own && caps.some((c) => c.by.id === lone.id && c.target.id === center.id)));

    /* ── 格局 ── */
    const add = (id, name, side, text, extra) => pats.push(Object.assign({ id, name, side, text }, extra || {}));
    const sideOf = (p) => (p.red === own ? "自己" : "對方");
    const byKind = {};
    ps.forEach((p, i) => (byKind[p.kind] = byKind[p.kind] || []).push(i));
    friendPairs.forEach(([, , i, j]) => add(1, "好朋友格", null, PAIR[at(i).kind] + "（" + POS_ZH[i] + POS_ZH[j] + "）", { kind: at(i).kind, adjCenter: i === 0 || j === 0 }));
    for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) {
      const a = at(i), c = at(j), r = rel(i, j);
      if (a.kind === c.kind && a.red !== c.red && !friendRel(a.kind, r)) {
        const good = (a.kind === "horse" || a.kind === "cannon") ? r !== "across" : r === "diag";
        if (good) add(2, "好人緣格", null, PAIR[a.kind] + "（" + POS_ZH[i] + POS_ZH[j] + "）", { kind: a.kind });
        if (r === "across" && a.kind !== "cannon") add(6, "分離格", null, PAIR[a.kind] + "隔開（" + POS_ZH[i] + POS_ZH[j] + "）", { kind: a.kind, pos: [i, j] });
      }
      if (((a.kind === "guard" && c.kind === "chariot") || (a.kind === "chariot" && c.kind === "guard")) && a.red !== c.red && r !== "across") {
        const g = a.kind === "guard" ? a : c;
        add(3, "互相欣賞格", null, (g.red ? "紅仕黑車" : "黑士紅俥") + (r === "adj" ? "相鄰" : "斜對"), { adj: r === "adj" });
      }
    }
    const soldierRed = ps.filter((p) => p.kind === "soldier" && p.red).length, soldierBlack = ps.filter((p) => p.kind === "soldier" && !p.red).length;
    const sanren = soldierRed >= 3 ? true : soldierBlack >= 3 ? false : null;
    if (sanren !== null) add(19, "三人同心格", sanren === own ? "自己" : "對方", (sanren ? "兵" : "卒") + "三隻以上，如一隻車的能耐");
    /* 三人同心：異色兵卒若同時看得到全部，才不論消耗與破壞 */
    const sanrenClean = sanren !== null && (() => {
      const opp = ps.map((p, i) => [p, i]).filter(([p]) => p.kind === "soldier" && p.red !== sanren);
      const mates = ps.map((p, i) => [p, i]).filter(([p]) => p.kind === "soldier" && p.red === sanren);
      return opp.every(([, i]) => mates.every(([, j]) => visible(i, j)));
    })();
    KINDS.forEach((k) => {
      const idx = byKind[k] || [];
      [true, false].forEach((red) => {
        const same = idx.filter((i) => at(i).red === red);
        if (same.length < 2) return;
        if (k === "soldier" && same.length >= 3 && sanrenClean) return;
        for (let a = 0; a < same.length; a++) for (let c = a + 1; c < same.length; c++) {
          const r = rel(same[a], same[c]);
          add(4, "消耗格", red === own ? "自己" : "對方", CH[k][red ? 0 : 1] + CH[k][red ? 0 : 1] + "消耗（" + { adj: "相鄰", diag: "斜對", across: "分離" }[r] + "）",
            { kind: k, red, strength: { adj: 3, diag: 2, across: 1 }[r], pos: [same[a], same[c]] });
        }
      });
      const rc = idx.filter((i) => at(i).red).length, bc = idx.length - rc;
      if (rc >= 1 && bc >= 1 && rc + bc >= 3 && !(k === "soldier" && sanrenClean)) add(5, "破壞格", null, PAIR[k] + (rc > bc ? "一黑配兩紅" : "一紅配兩黑"), { kind: k });
    });
    const pairKinds = KINDS.filter((k) => (byKind[k] || []).some((i) => at(i).red) && (byKind[k] || []).some((i) => !at(i).red));
    const pairCount = pairKinds.reduce((s, k) => s + Math.min(byKind[k].filter((i) => at(i).red).length, byKind[k].filter((i) => !at(i).red).length), 0);
    if (pairCount >= 2) {
      const fk = new Set(friendPairs.map(([, , i]) => at(i).kind));
      add(7, "困擾格", null, pairKinds.map((k) => PAIR[k]).join("、") + "兩組", { kinds: pairKinds, strength: pairKinds.filter((k) => fk.has(k)).length });
    }
    const kingInfo = [];
    ps.forEach((k, i) => {
      if (k.kind !== "king") return;
      const sees = ps.some((s, j) => s.kind === "soldier" && s.red !== k.red && j !== i && visible(i, j));
      const seesAbove = opt.soldierAbove && opt.soldierAbove(k.red);
      if (sees || seesAbove) {
        const adj = ps.some((s, j) => s.kind === "soldier" && s.red !== k.red && rel(i, j) === "adj");
        add(8, "明君格", sideOf(k), k.ch + "看得到" + (k.red ? "卒" : "兵") + (adj ? "（相鄰）" : sees ? "（斜對）" : "（看得到上一局）"), { pos: i, adj });
      } else add(9, "暴動格", sideOf(k), k.ch + "看不到" + (k.red ? "卒" : "兵"), { pos: i });
      kingInfo.push(i);
    });
    if (tongchi) add(10, "通吃格", "自己", "能把對方全部吃掉：開頭不錯、最後容易歸零");
    else if (tongchiMaybe) add(10, "通吃格（可能）", "自己", "若先吃掉對方的保護者，就能把對方全吃——存在通吃的可能", { maybe: true });
    if (beitong) add(11, "被通吃格", "自己", centerEaten ? "中間的棋子會被整隻吃掉" : "自己的棋子都會被吃光");
    else if (beitongMaybe) add(11, "被通吃格（可能）", "自己", "外在有不確定的能量：若對方不顧牽制先吃掉保護者，中間有被吃的可能", { maybe: true });
    if (["chariot", "horse", "cannon"].every((k) => byKind[k])) add(12, "事業格", null, "俥傌炮／車馬包同時出現");
    if (["king", "guard", "elephant"].every((k) => byKind[k])) add(13, "富貴格", null, "帥仕相／將士象同時出現");
    for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) {
      const a = at(i), c = at(j);
      const peach = a.red !== c.red && ((a.kind === "cannon" && c.kind === "cannon") || (a.kind === "cannon" && c.kind === "king") || (a.kind === "king" && c.kind === "cannon"));
      if (!peach) continue;
      const cann = a.kind === "cannon" ? [a, i] : [c, j], kng = a.kind === "king" ? [a, i] : c.kind === "king" ? [c, j] : null;
      const bad = kng && kng[0].red === own && cann[0].red !== own && caps.some((x) => x.by.id === cann[0].id && x.target.id === kng[0].id);
      add(14, rel(i, j) === "across" ? "正桃花" : "偏桃花", null, a.ch + c.ch + (rel(i, j) === "across" ? "相隔" : rel(i, j) === "adj" ? "相鄰" : "斜對") + (bad ? "——對方的" + cann[0].ch + "吃到我們的" + kng[0].ch + "（爛桃花）" : ""), { zheng: rel(i, j) === "across", bad });
    }
    if (reds === 0 || reds === 5) add(15, "全紅全黑格（悔恨格）", null, "五隻同色：陰陽不協調，結果與期待落差大");
    if (lone && lone.id === center.id) add(17, "眾星拱月格／鬱卒格", null, "唯一不同色在中間：" + (reds === 4 ? "四紅一黑" : "四黑一紅"));
    if (lone && lone.id !== center.id) add(18, "一枝獨秀格", null, "唯一不同色在外圍（" + POS_ZH[ps.indexOf(lone)] + lone.ch + "）：別人看到的較像這隻的特質");
    const sameC = (idx) => idx.every((i) => at(i).red === at(idx[0]).red);
    if (sameC([1, 2, 4])) {
      const self = friendPairs.some(([, , i, j]) => i === 0 || j === 0) || friendPairs.length > 0;
      add(22, "勝利格", null, "左右下同色成 V 字：事情容易成局" + (self ? "（靠自己的能耐）" : "（靠他人協助）"));
    }
    if (sameC([1, 2, 3])) add(23, "雨傘格", null, (at(1).red ? "紅" : "黑") + "雨傘：有天助但心情悶；" + (at(1).red ? "外界看好" : "外界不看好"));
    if (sameC([0, 1, 2]) || sameC([0, 3, 4])) add(24, "十字天助格", null, "十字同色：有天助");

    /* 犯小人：對方的傌馬炮包吃到或得到我們的好處 */
    const xiaoren = caps.filter((c) => c.by.red !== own && (c.by.kind === "horse" || c.by.kind === "cannon") && c.target.red === own);
    /* 天人地、五行、陰陽 */
    const tri = { 天: false, 人: false, 地: false };
    ps.forEach((p) => (tri[TRI[p.kind]] = true));
    const wx = { 金: 0, 木: 0, 火: 0, 土: 0, 水: 0 };
    ps.forEach((p) => wx[WX[p.kind]]++);
    const yinyang = reds === 0 || reds === 5 ? "全" + (reds ? "紅" : "黑") : reds === 1 || reds === 4 ? (reds === 4 ? "四紅一黑" : "四黑一紅") : "協調";
    /* 中間受威脅 */
    const threats = caps.filter((c) => c.target.id === center.id && c.by.red !== own);

    return { ctx, pieces: ps, own, center, gain, cost, caps, pats, friend: ctx.friend, lone, tongchi, tongchiMaybe, beitong, beitongMaybe,
      xiaoren, tri, wx, yinyang, reds, threats, kingInfo, board: b };
  }

  /* 倍率：通吃／被通吃 收穫 ×20%；陰陽不協調（四比一）×50%；全紅全黑 ×20% */
  function factor(a) {
    const f = { gain: 1, cost: 1, notes: [] };
    if (a.tongchi) { f.gain *= 0.2; f.notes.push("通吃格：收穫約只留 20%"); }
    if (a.beitong) { f.gain *= 0.2; f.notes.push("被通吃格：收穫頂多 20%，甚至歸零"); }
    if (a.reds === 1 || a.reds === 4) { f.gain *= 0.5; f.cost *= 0.5; f.notes.push("陰陽不協調：收穫與付出約 50%"); }
    if (a.reds === 0 || a.reds === 5) { f.gain *= 0.2; f.cost *= 0.2; f.notes.push("全紅全黑：收穫與付出約 20%"); }
    return f;
  }

  /* 位置角色：依求問者性別與婚姻（離婚同單身） */
  function roles(sex, married) {
    const m = sex === "男", w = sex === "女";
    return [
      "自己",
      married && m ? "妻子、女性平輩" : married && w ? "兄弟姊妹、女性平輩" : "姊妹、女性平輩（朋友、同事）",
      married && w ? "丈夫、男性平輩" : married && m ? "兄弟姊妹、男性平輩" : "兄弟" + (w ? "、男友" : "") + "、男性平輩（朋友、同事）",
      "父母、長輩、上司" + (married ? (m ? "、岳父母" : w ? "、公婆" : "") : ""),
      married ? "兒女、晚輩、下屬" : "晚輩、下屬",
    ];
  }

  /* ── 命盤：32 子排 33 位（第 4 隻移到第 33 位），八局縱向相連 ── */
  /* 第 k 局（1..8）：上 (1,2k-2)、左 (0,2k-1)、中 (1,2k-1)、右 (2,2k-1)、下 (1,2k) */
  const roundKeys = (k) => [key(1, 2 * k - 1), key(0, 2 * k - 1), key(2, 2 * k - 1), key(1, 2 * k - 2), key(1, 2 * k)];
  const ROUND_NAME = ["總格", "學習格・11~20 歲", "情感格・21~30 歲", "事業格・31~40 歲", "41~50 歲", "51~60 歲", "61~70 歲", "71~80 歲"];
  /* 每局各位置對應的歲數（虛歲）：上＝第 1、10 年，中＝2、7，左＝3、8，右＝4、9，下＝5、6 */
  function ages(k) {
    if (k < 2) return null;
    const base = (k - 1) * 10;
    return [[base + 2, base + 7], [base + 3, base + 8], [base + 4, base + 9], [base + 1, base + 10], [base + 5, base + 6]];
  }
  /* 抽出順序 → 33 位：1中 2左 3右 4上 5下；之後每局 中左右下；第 33 位補第 4 隻 */
  function chartBoard(seq) {
    const ps = seq.map(piece), b = new Map(), order = [];
    const put = (k, p) => { b.set(k, p); order.push(k); };
    const r1 = roundKeys(1);
    put(r1[0], ps[0]); put(r1[1], ps[1]); put(r1[2], ps[2]); put(r1[3], ps[3]); put(r1[4], ps[4]);
    let n = 5;
    for (let k = 2; k <= 8; k++) {
      const rk = roundKeys(k);
      put(rk[0], ps[n++]); put(rk[1], ps[n++]); put(rk[2], ps[n++]);
      if (k < 8) put(rk[4], ps[n++]);
    }
    b.set(roundKeys(8)[4], ps[3]);   // 第 33 位＝原第 4 隻（同一隻）
    return { b, ps };
  }
  /* 過局往上吃：上一局以前都只是「資料」，不論保護、牽制與格局；跨局後無將帥兵卒不互吃之限，但仕士仍不吃將帥、相象不吃將帥仕士 */
  function rankAcross(p, q) {
    if (!p || !q || p.red === q.red) return false;
    if (p.kind === "guard") return q.kind !== "king";
    if (p.kind === "elephant") return q.kind !== "king" && q.kind !== "guard";
    return true;
  }
  function upHaul(b, from, mover, topY, seen, depth) {
    const out = [];
    if (depth > 8) return out;
    for (const to of b.keys()) {
      const q = b.get(to), [, y] = xy(to);
      if (y >= topY || seen.has(q.id)) continue;
      if (!rankAcross(mover, q) || !geomOK(b, mover, from, to)) continue;
      seen.add(q.id);
      out.push({ target: q, at: to, v: val(q) });
      out.push(...upHaul(moved(b, from, to), to, mover, topY, seen, depth + 1));
    }
    return out;
  }
  function analyzeChart(seq, opt) {
    opt = opt || {};
    const { b, ps } = chartBoard(seq);
    const rounds = [];
    const total = analyzeCross(roundKeys(1).map((k) => b.get(k)), {});
    for (let k = 1; k <= 8; k++) {
      const rk = roundKeys(k), list = rk.map((kk) => b.get(kk));
      const topY = 2 * k - 2;
      const soldierAbove = k > 1 ? (red) => {   // 明君：看得到上一局的兵卒也算
        for (const [kk, p] of b) { const [, y] = xy(kk); if (y < topY && y >= topY - 3 && p.kind === "soldier" && p.red !== red) return true; }
        return false;
      } : null;
      const a = k === 1 ? total : analyzeCross(list, { soldierAbove });
      /* 命盤：牽制若只是怕失去兵卒炮包，可不顧；總格或十年運勢「可能」的通吃／被通吃，都當作會呈現（書 p.77） */
      const a2 = analyzeCross(list, { ignoreSmall: true });
      a.tongchiChart = a.tongchi || a.tongchiMaybe || a2.tongchi;
      a.beitongChart = a.beitong || (k === 1 && a.beitongMaybe);
      const up = [];
      if (k > 1) {
        /* 過局往上吃：當局的棋只能靠「整隻吃掉」在當局內移動（命盤中怕失去兵卒炮包的牽制可不顧），
           一進到上一局以前，就只看走法、不論保護牽制，可一路吃下去；下方⑤吃到中間＝重大關卡，不再往上 */
        const y0 = 2 * k - 2;
        const toCross = (gk) => { const [x, y] = xy(gk); return key(x, y - y0); };
        const ctx2 = Object.assign({}, a.ctx, { ignoreSmall: true });
        const crossOf = (bb) => { const m = new Map(); rk.forEach((gk) => { if (bb.has(gk)) m.set(toCross(gk), bb.get(gk)); }); return m; };
        const centerEatenByBottom = a.caps.some((c) => c.by.id === list[4].id && c.target.id === list[0].id && c.full);
        a.centerEatenByBottom = centerEatenByBottom;
        const walk = (bb, from, mover, seen, depth, out, inRoundOnly) => {
          if (depth > 10) return;
          slide = true;
          for (const to of bb.keys()) {
            const q = bb.get(to), y = xy(to)[1];
            if (seen.has(q.id) || q.red === mover.red) continue;
            const inRound = rk.includes(to);
            if (inRound) {
              if (!inRoundOnly) continue;
              if (mover === list[4] && q === list[0]) continue;
              slide = false;
              const cb = crossOf(bb), cv = cb.has(toCross(from)) ? captureValue(ctx2, cb, toCross(from), toCross(to)) : null;
              slide = true;
              if (!cv || !cv.full) continue;
              seen.add(q.id);
              walk(moved(bb, from, to), to, mover, seen, depth + 1, out, true);
            } else {
              if (y >= topY + 0 && !rk.includes(to)) continue;
              slide = true;
              if (!rankAcross(mover, q) || !geomOK(bb, mover, from, to)) continue;
              seen.add(q.id);
              out.push({ by: mover, target: q, at: to, v: val(q) });
              walk(moved(bb, from, to), to, mover, seen, depth + 1, out, false);
            }
          }
        };
        /* 只留當局與以前的局（下方各局不參與） */
        const above = new Map([...b].filter(([gk]) => xy(gk)[1] <= 2 * k));
        list.forEach((p, i) => {
          const out = [];
          /* 中間走到 ④ 與走到左右是兩條路，各算各的（書中兩條都計） */
          if (i === 0) {
            rk.slice(1).forEach((gk) => {
              const cb = crossOf(above), cv = captureValue(ctx2, cb, toCross(rk[0]), toCross(gk));
              if (!cv || !cv.full || above.get(gk).red === p.red) return;
              const o2 = [];
              walk(moved(above, rk[0], gk), gk, p, new Set([above.get(gk).id]), 1, o2, false);
              out.push(...o2);
            });
          } else walk(above, rk[i], p, new Set(), 0, out, true);
          out.forEach((h) => up.push(Object.assign({ fromPos: i }, h)));
        });
        slide = false;
      }
      const own = list[0].red;
      const upGain = up.filter((u) => u.by.red === own).reduce((s, u) => s + u.v, 0);
      const upCost = up.filter((u) => u.by.red !== own).reduce((s, u) => s + u.v, 0);
      rounds.push({ k, name: ROUND_NAME[k - 1], list, a, up, upGain, upCost, ages: ages(k) });
    }
    /* 中間縱向連續五隻以上同色：自第五隻那年起體質轉弱 */
    const col = [];
    for (let y = 0; y <= 16; y++) if (b.has(key(1, y))) col.push([y, b.get(key(1, y))]);
    let run = 1, weakFrom = null;
    for (let i = 1; i < col.length; i++) {
      run = col[i][1].red === col[i - 1][1].red ? run + 1 : 1;
      if (run === 5 && weakFrom === null) weakFrom = col[i][0];
    }
    return { b, ps, rounds, total, weakFromY: weakFrom };
  }

  /* 命盤總格的特殊格局（大師格、皇帝格、修行緣分格、需特別經營婚姻） */
  function chartTotalPats(a, sex) {
    const out = [], ps = a.pieces, own = a.own;
    const outerSoldier = [1, 2, 3, 4].every((i) => ps[i].kind === "soldier");
    if (outerSoldier && ps[0].kind === "soldier") out.push({ name: "皇帝格", text: "五隻都是兵卒：做什麼都容易往上走" });
    else if (outerSoldier) out.push({ name: "大師格", text: { king: "做任何行業都適合", guard: "適合從政、掌權", elephant: "一代宗師", chariot: "適合領導一群人做事", horse: "會有一群人跟著一起奔波", cannon: "外貌出眾，適合當明星偶像" }[ps[0].kind] });
    const hmc = ps.filter((p) => p.red === own && (p.kind === "horse" || p.kind === "cannon"));
    const hmcEat = a.caps.some((c) => c.by.red === own && (c.by.kind === "horse" || c.by.kind === "cannon") && c.target.red !== own);
    const xiu = [];
    if (ps[0].kind === "elephant") xiu.push(hmc.length ? "中間是相象，又有同色傌馬炮包：與神明有緣" : "中間是相象：有修行緣分");
    else if (ps.some((p, i) => i && p.kind === "elephant" && p.red === own) && hmc.length) xiu.push("同色相象配同色傌馬炮包：有修行緣分");
    if (hmcEat) xiu.push("同色傌馬炮包吃得到對方：直覺力好");
    if (ps[0].kind === "horse" || ps[0].kind === "cannon") xiu.push("中間是傌馬炮包：體質較敏感、直覺強");
    if (a.pats.some((p) => p.id === 23 || p.id === 24)) xiu.push("有雨傘格或十字天助格：有天助");
    if (xiu.length) out.push({ name: "修行緣分格", text: xiu.join("；") });
    if (sex === "女") {   /* 書中稱離婚格；本站只提醒婚姻需要特別經營，不論次數 */
      const c = [];
      if (ps[0].kind === "king" || (!ps[0].red && (ps[0].kind === "guard" || ps[0].kind === "chariot"))) c.push("中間氣勢強、主見重");
      if (ps.some((p, i) => i && p.kind === "king")) c.push("帥將不在中間");
      if (a.pats.some((p) => p.id === 6)) c.push("分離格");
      if (a.pats.some((p) => p.id === 12) && ["chariot", "horse", "cannon"].includes(ps[0].kind)) c.push("事業格且一隻在中間");
      if (a.beitong || a.tongchi) c.push(a.beitong ? "被通吃格" : "通吃格");
      if (a.reds === 0 || a.reds === 5) c.push("全紅全黑");
      if (c.length) out.push({ name: "婚姻需特別經營", text: "總格有" + c.join("、") + "：感情與婚姻需要多花心力經營" });
    }
    return out;
  }

  /* 吃與被吃的衍伸解釋（年運、命盤用） */
  const EAT_NOTE = {
    guard: { get: "得到名聲、權力、文憑", lose: "名譽受損、糾紛、官司", by: "易有糾紛、名譽受損，或因自以為是而損失；留意血光" },
    elephant: { get: "有置產或宗教修行的機緣", lose: "火氣大" },
    chariot: { get: "得到名聲、權力", lose: "行車糾紛、車關", by: "行車糾紛、車關" },
    horse: { get: "人脈擴展，善巧、創意、點子多", lose: "意外受傷", by: "意外受傷、犯小人、投資失利" },
    cannon: { get: "受人喜歡，善巧、創意、點子多", by: "犯小人、投資失利" },
    king: { by: "身邊的人易執著、外在壓力較大" },
  };

  root.XQE = { KINDS, VAL, CH, PAIR, WX, TRI, ORGAN, WX_ORGAN, POS_ZH, NUM, piece, analyzeCross, factor, roles, analyzeChart, chartTotalPats,
    ROUND_NAME, ages, EAT_NOTE, color, val };
})(typeof window !== "undefined" ? window : globalThis);
