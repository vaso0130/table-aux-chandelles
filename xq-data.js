/* 象棋占卜（牌桌館・東方館；MIX 共用）：32 子蓋棋洗勻，翻五顆「開門卦」。
 * 台灣民間各家讀法不一，本站取：中為主位，四角依右上起、左上承、左下轉、右下收；
 * 紅為陽、為明、為主動，黑為陰、為暗、為被動；同色「將士象」「車馬炮」成組。純規則可判的組合由 analyze() 列出。 */
(function () {
  /* [類, 紅字, 黑字, 每色子數, 紅關鍵詞, 紅義, 紅吉凶, 黑關鍵詞, 黑義, 黑吉凶] */
  const KINDS = [
    ["king", "帥", "將", 1, "主事・權柄・明主", "主事的人站在明處：你（或能拍板的上位者）掌握主導權，事情有核心可依。", "good",
      "主事・權柄・暗主", "主導權在另一方或在幕後：能拍板的人不是你，先摸清他的意向。", "mid"],
    ["guard", "仕", "士", 2, "貼身・輔佐・護主", "身邊有可靠的人在守著你：伴侶、顧問、得力助手，近身的助力。", "good",
      "貼身・密議・私心", "身邊人另有盤算或在暗中商議；親近的人是關鍵，也可能是變數。", "mid"],
    ["elephant", "相", "象", 2, "穩重・家宅・守成", "守住本分與基業：家庭、房產、穩定收入是靠山；宜守不宜冒進。", "good",
      "保守・田產・拘束", "過於保守或被舊框架綁住；財產、家務、長輩的意見牽動此事。", "mid"],
    ["chariot", "俥", "車", 2, "主力・直進・資源", "實力雄厚、一路直行：資金、人力、正面進攻都有利。", "good",
      "強敵・衝撞・重壓", "對面有強勢力量直衝而來，硬碰硬要掂量；也指大筆開銷。", "bad"],
    ["horse", "傌", "馬", 2, "奔走・機遇・轉彎", "奔波帶來機會，拐個彎就有路：出差、移動、換跑道。", "good",
      "絆腳・波折・暗轉", "事情拐彎、有人絆馬腳：行程變動，或意料之外的轉折。", "bad"],
    ["cannon", "炮", "包", 2, "借力・隔山・聲勢", "隔山打牛：透過中間人或借勢成事，消息與聲勢對你有利。", "good",
      "口舌・突襲・暗箭", "突然的消息或口舌是非，小心背後放話、隔山而來的暗箭。", "bad"],
    ["soldier", "兵", "卒", 5, "小步・累積・過河", "一步一步往前，小事累積成大事；過了河，小兵也能立功。", "mid",
      "瑣事・小人・擋路", "瑣碎的小麻煩或小人擋路；人多嘴雜，但個個力量不大。", "bad"]
  ];
  const KIND_ZH = { king: "將帥", guard: "仕士", elephant: "相象", chariot: "車", horse: "馬", cannon: "炮包", soldier: "兵卒" };

  /* 牌面圖：東方館工筆人物（tools/generate-xq-cards.ps1）；紅相=宰相、黑象=戰象，紅炮=銅砲、黑包=拋石機 */
  const IMG = { king: ["r-king", "b-general"], guard: ["r-guard", "b-guard"], elephant: ["r-minister", "b-elephant"], chariot: ["r-chariot", "b-chariot"],
    horse: ["r-horse", "b-horse"], cannon: ["r-cannon", "b-catapult"], soldier: ["r-soldier", "b-soldier"] };
  const glyph = (red, ch) => '<span class="xqp ' + (red ? "r" : "b") + '">' + ch + "</span>";
  const CARDS = [];
  [true, false].forEach(red => KINDS.forEach(k => {
    for (let i = 0; i < k[3]; i++) CARDS.push({
      n: CARDS.length + 1, kind: k[0], red, ch: red ? k[1] : k[2],
      zh: (red ? "紅" : "黑") + (red ? k[1] : k[2]), name: (red ? "紅" : "黑") + (red ? k[1] : k[2]),
      latin: (red ? "紅方・" : "黑方・") + KIND_ZH[k[0]],
      keys: red ? k[4] : k[7], text: red ? k[5] : k[8], pol: red ? k[6] : k[9],
      img: "cards-xq/" + IMG[k[0]][red ? 0 : 1] + ".jpg",
      glyph: glyph(red, red ? k[1] : k[2]), pks: red ? "紅方" : "黑方", pk: red ? "紅方・陽・明" : "黑方・陰・暗"
    });
  }));

  const POS = ["主位・本體", "起・開端", "承・發展", "轉・變數", "收・結果"];
  const HINTS = [
    "事情的本體與問卜者自身的處境；主位顏色定全局基調",
    "事情怎麼開始、起因在哪",
    "事情如何承接發展、眼下的走勢",
    "轉折與變數，最容易出狀況或出現轉機的地方",
    "最後的結果與收尾"
  ];
  const PLACE = [[2, 2], [3, 1], [1, 1], [1, 3], [3, 3]];   // 3×3：中、右上、左上、左下、右下

  /* 組合判讀：輸入五顆（或任意數）棋子物件 */
  function analyze(ps) {
    const out = [], reds = ps.filter(p => p.red).length, blacks = ps.length - reds;
    const has = (kind, red) => ps.some(p => p.kind === kind && (red === undefined || p.red === red));
    const cnt = (kind, red) => ps.filter(p => p.kind === kind && (red === undefined || p.red === red)).length;
    out.push("紅黑：紅 " + reds + "、黑 " + blacks + (reds === ps.length ? "——一色全紅，事在明處，大勢明朗順遂" : blacks === ps.length ? "——一色全黑，暗流遍布，宜守宜靜" :
      reds > blacks ? "——紅多，事在明處、主動有利" : "——黑多，事在暗處、宜觀察再動"));
    if (ps.length >= 5) out.push("主位為" + ps[0].name + "——" + (ps[0].red ? "本體在明，你手上有主動權" : "本體在暗，此事有看不見的部分"));
    if (has("king", true) && has("king", false)) out.push("王見王：帥將同現——雙方主事者都要出面，對峙、攤牌或談判在即");
    [true, false].forEach(red => {
      const c = red ? "紅" : "黑";
      if (has("king", red) && has("guard", red) && has("elephant", red)) out.push(c + "方「" + (red ? "帥仕相" : "將士象") + "」成組——" + (red ? "內部齊心、根基穩固，大吉之象" : "對方陣營完整穩固，不易撼動"));
      if (has("chariot", red) && has("horse", red) && has("cannon", red)) out.push(c + "方「" + (red ? "俥傌炮" : "車馬包") + "」成組——" + (red ? "攻勢齊備，可主動出擊" : "對方攻勢齊備，宜避其鋒"));
    });
    if (cnt("chariot") >= 2) out.push("雙車並見——力量對撞，" + (cnt("chariot", true) === 2 ? "我方實力雄厚" : cnt("chariot", false) === 2 ? "對方來勢洶洶" : "兩強相爭"));
    if (cnt("horse") >= 2) out.push("雙馬並見——奔波往返多，事情會拐好幾個彎");
    if (cnt("cannon") >= 2) out.push("雙炮並見——消息、聲浪多，" + (cnt("cannon", false) >= 1 ? "留意口舌" : "宣傳造勢有利"));
    const sol = cnt("soldier");
    if (sol >= 3) out.push("兵卒 " + sol + " 顆——" + (cnt("soldier", true) > cnt("soldier", false) ? "眾人之力、積少成多" : "瑣事纏身、小人擾攘") + "，大事要靠一點一滴推");
    if (ps.length >= 5) {
      const arc = ps.slice(1).map(p => p.red ? "紅" : "黑").join("");
      out.push("起承轉收：" + arc + "——" + (arc === "紅紅紅紅" ? "一路順行" : arc === "黑黑黑黑" ? "一路受阻，需耐心" : arc[3] === "紅" ? "收尾在紅，終局向好" : "收尾在黑，結果要多留後手"));
    }
    return out;
  }
  const POL_ZH = { good: "吉", bad: "凶", mid: "平" };

  window.XQ = { KINDS, CARDS, POS, HINTS, PLACE, analyze, glyph, POL_ZH };
})();
