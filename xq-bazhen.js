/* 八陣大卦（觀棋知命一派）：32 張全翻，排成先天八卦陣。
 * 擁有者提供：先說問題、洗牌、先抽 8 張、再抽 24 張排在八角卦陣上；觀棋知命圖：先天方位與棋子歸卦（帥將乾、仕士兌、相象離、俥車震、傌馬巽、炮包坎、兵艮、卒坤）。
 * 其餘規則查無出處，為本站依《說卦傳》與易理推出的讀法（本站讀法），頁面與提示詞都照實標明；不取其他流派（男紅女黑、地支應期等）。
 * 需先載 divine-core.js（DC.TRIG／TRIG_WX／TRIG_LINES／HEX_NAME／trigIdx）。 */
(function () {
  const T = DC.TRIG;                          // 先天序：乾兌離震巽坎艮坤（0..7），也是排子的宮序
  const OPP = [7, 6, 5, 4, 3, 2, 1, 0];       // 先天對宮：乾坤、兌艮、離坎、震巽
  const KIND_GUA = { king: 0, guard: 1, elephant: 2, chariot: 3, horse: 4, cannon: 5 };
  const guaOf = (c) => (c.kind === "soldier" ? (c.red ? 6 : 7) : KIND_GUA[c.kind]);   // 兵歸艮、卒歸坤
  /* 陣圖位置（3×3，先天方位：乾上坤下、離左坎右）：[列, 欄] */
  const CELL = [[0, 1], [0, 0], [1, 0], [2, 0], [0, 2], [1, 2], [2, 2], [2, 1]];
  /* 宮的主題（《說卦傳》原文＋本站白話） */
  const PALACE = [
    { q: "乾，健也。乾為天，為圜，為君，為父。乾為首。", t: "事業、上司、權位、父親" },
    { q: "兌，說也。兌為澤，為少女，為巫，為口舌，為毀折。兌為口。", t: "喜悅、言語口舌、人緣、少女" },
    { q: "離，麗也。離為火，為日，為電，為中女。離為目。", t: "名聲、文書考試、眼光、中女" },
    { q: "震，動也。震為雷，為長子，為決躁。震為足。", t: "行動、開創、變動、長男" },
    { q: "巽，入也。巽為木，為風，為長女，為近利市三倍。巽為股。", t: "生意、消息、出入往來、長女" },
    { q: "坎，陷也。坎為水，為隱伏，為加憂，為心病。坎為耳。", t: "險難、心事、財物流動、中男" },
    { q: "艮，止也。艮為山，為徑路，為門闕。艮為手。", t: "停滯、房宅、守成、少男與子女" },
    { q: "坤，順也。坤為地，為母，為眾。坤為腹。", t: "家庭、母親與配偶、大眾、土地" }
  ];
  /* 《說卦傳》「帝出乎震」一段：方位與時節 */
  const SEASON = ["西北・秋冬之交", "西・秋", "南・夏", "東・春", "東南・春夏之交", "北・冬", "東北・冬春之交", "西南・夏秋之交"];
  /* 問事類別 → 主宮 */
  const TOPICS = [["", "讓 AI 依問題判斷"], ["0", "事業、上司（乾宮）"], ["1", "感情、人際、口舌（兌宮）"], ["2", "考試、名聲、文書（離宮）"], ["3", "變動、出行、開創（震宮）"],
    ["4", "生意、消息、往來（巽宮）"], ["5", "困難、心事、錢財流動（坎宮）"], ["6", "房產、子女、守成（艮宮）"], ["7", "家庭、健康、大眾（坤宮）"]];

  const SHENG = { 金: "水", 水: "木", 木: "火", 火: "土", 土: "金" }, KE = { 金: "木", 木: "土", 土: "水", 水: "火", 火: "金" };
  /* 宮為體、子為用（梅花體用之理） */
  function rel(palace, gua) {
    if (palace === gua) return { k: "歸位", s: 2, txt: "歸位：力量純粹、得其本位" };
    const b = DC.TRIG_WX[palace], u = DC.TRIG_WX[gua];
    if (b === u) return { k: "比和", s: 1, txt: "比和（同屬" + b + "）：平穩" };
    if (SHENG[u] === b) return { k: "用生體", s: 1, txt: "用生體（" + u + "生" + b + "）：得助" };
    if (KE[b] === u) return { k: "體剋用", s: 0, txt: "體剋用（" + b + "剋" + u + "）：可掌控" };
    if (SHENG[b] === u) return { k: "體生用", s: -1, txt: "體生用（" + b + "生" + u + "）：耗洩" };
    return { k: "用剋體", s: -2, txt: "用剋體（" + u + "剋" + b + "）：受壓" };
  }
  const hexName = (up, lo) => DC.HEX_NAME[up][lo];

  /* picks：32 個棋字（抽出順序）；cards：XQ.CARDS；main：主宮 0..7 或 null */
  function analyze(picks, cards, main) {
    const card = (ch) => cards.find((c) => c.ch === ch);
    const P = T.map((name, k) => {
      const ps = [0, 1, 2, 3].map((r) => card(picks[r * 8 + k]));   // 主子、初輔、二輔、三輔
      const m = ps[0], mg = guaOf(m), aux = ps.slice(1);
      const r = rel(k, mg);
      const auxRel = aux.map((c) => rel(k, guaOf(c)));
      const zhen = DC.trigIdx(aux.map((c) => (c.red ? 1 : 0)));   // 三輔由下而上，紅陽黑陰
      const auxScore = auxRel.reduce((a, x) => a + (x.s > 0 ? 0.5 : x.s < 0 ? -0.5 : 0), 0);
      return {
        k, name, sym: DC.TRIG_SYM[k], wx: DC.TRIG_WX[k], ps, m, mg, rel: r, auxRel, zhen,
        hex: hexName(k, mg), opp: mg === OPP[k], shiHe: zhen === mg, shiNi: zhen === OPP[mg],
        score: (r.s + auxScore) * (main === k ? 2 : 1)
      };
    });
    const up = P[0].mg, lo = P[7].mg, L = DC.TRIG_LINES[lo].concat(DC.TRIG_LINES[up]);
    const huLo = DC.trigIdx(L.slice(1, 4)), huUp = DC.trigIdx(L.slice(2, 5));
    const total = P.reduce((a, p) => a + p.score, 0);
    const verdict = total >= 4 ? "順" : total <= -4 ? "阻" : "平";
    let ying = null;
    if (main !== null && main !== undefined) {
      const p = P[main], n = p.mg + 1, reds = p.ps.slice(1).filter((c) => c.red).length;
      ying = { n, unit: reds >= 2 ? "日或旬" : "月", season: SEASON[main], text: "約 " + n + (reds >= 2 ? " 日或 " + n + " 旬" : " 個月") + "；方位時節取「" + SEASON[main] + "」" };
    }
    const kings = P.filter((p) => p.m.kind === "king").map((p) => p.name);
    return { P, zong: { up, lo, name: hexName(up, lo) }, hu: { up: huUp, lo: huLo, name: hexName(huUp, huLo) }, total, verdict, ying, kings, main };
  }

  window.BZ = { T, OPP, CELL, PALACE, SEASON, TOPICS, guaOf, rel, analyze };
})();
