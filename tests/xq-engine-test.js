/* 象棋卜卦引擎測試：以《改寫人生的象棋卜卦》書中例題的得分與格局為準。
 * 棋序一律為 [中, 左, 右, 上, 下]。書中少數例題省略了部分付出，只驗書上寫出的那一項。 */
require("../xq-engine.js");
const A = (s) => XQE.analyzeCross(s.split(""));
let fail = 0, n = 0;
function check(label, a, exp) {
  n++;
  const bad = [];
  if (exp.gain !== undefined && Math.abs(a.gain - exp.gain) > 1e-9) bad.push(`收穫 ${a.gain}≠${exp.gain}`);
  if (exp.cost !== undefined && Math.abs(a.cost - exp.cost) > 1e-9) bad.push(`付出 ${a.cost}≠${exp.cost}`);
  for (const k of ["tongchi", "beitong", "tongchiMaybe", "beitongMaybe"]) if (exp[k] !== undefined && a[k] !== exp[k]) bad.push(`${k}=${a[k]}`);
  (exp.pats || []).forEach((p) => { if (!a.pats.some((x) => x.name === p)) bad.push("缺格局 " + p); });
  (exp.nopats || []).forEach((p) => { if (a.pats.some((x) => x.name === p)) bad.push("多格局 " + p); });
  if (bad.length) {
    fail++;
    console.log("✗ " + label + "：" + bad.join("；"));
    a.caps.forEach((c) => console.log("    " + c.by.ch + "→" + c.target.ch + " " + c.v + (c.why.length ? "（" + c.why.join("、") + "）" : "") + (c.chain ? " 接續" : "")));
    console.log("    格局：" + a.pats.map((p) => p.name).join("、"));
  }
}
check("p.51 保護", A("兵相車相馬"), { gain: 15, cost: 25 });
check("p.52 抗衡", A("車仕相卒包"), { gain: 100, cost: 30, tongchi: true });
check("p.53 牽制", A("士傌卒炮象"), { gain: 17.5, cost: 40 });
check("p.54 牽制一", A("傌象傌士將"), { gain: 70, cost: 90, beitong: true });
check("p.54 牽制二", A("兵相俥象馬"), { gain: 20, cost: 40 });
check("p.55 兵護不了", A("仕將相兵仕"), { beitong: true, cost: 160 });
check("p.65 兵卒好朋友", A("兵車仕相卒"), { gain: 15, cost: 10, pats: ["好朋友格"] });
check("p.66 炮包好朋友", A("象炮包傌俥"), { gain: 40, cost: 35, pats: ["好朋友格"] });
check("p.67 好人緣", A("士卒包兵帥"), { gain: 10, cost: 30, pats: ["好人緣格"] });
check("p.71 士士消耗", A("相士兵士炮"), { gain: 30, cost: 40, pats: ["消耗格"] });
check("p.78 通吃", A("兵士包象俥"), { gain: 115, cost: 10, tongchi: true });
check("p.78 牽制非通吃", A("兵仕包象俥"), { tongchi: false });
check("p.79 被通吃一", A("傌士象兵車"), { beitong: true });
check("p.79 被通吃二", A("相將仕兵士"), { beitong: true });
check("p.83 富貴格左", A("帥傌象士卒"), { gain: 215, cost: 40, pats: ["富貴格", "明君格"] });
check("p.83 富貴格中", A("傌將士炮相"), { beitong: true });
check("p.83 富貴格右", A("士象炮仕帥"), { gain: 37.5, cost: 80, pats: ["暴動格"] });
check("p.92 眾星拱月", A("俥卒象士車"), { gain: 70, cost: 60, pats: ["眾星拱月格／鬱卒格"] });
check("p.94 一枝獨秀左", A("將卒相車士"), { gain: 20, pats: ["一枝獨秀格", "暴動格"] });
check("p.94 一枝獨秀右", A("相炮帥士兵"), { gain: 0, cost: 20 });
check("p.97 唯一色炮", A("將卒車炮士"), { cost: 60 });
check("p.98 三人同心", A("兵士兵兵車"), { gain: 60, cost: 10, pats: ["三人同心格"], nopats: ["消耗格"] });
check("p.103 勝利格左", A("仕士卒兵車"), { gain: 50, cost: 90, pats: ["勝利格"] });
check("p.103 勝利格中", A("車炮兵馬俥"), { gain: 40, cost: 30 });
check("p.105 雨傘格", A("兵士卒車兵"), { gain: 50, cost: 15, pats: ["雨傘格"] });
check("p.107 十字天助", A("俥車士傌兵"), { gain: 90, cost: 30, pats: ["十字天助格", "互相欣賞格"] });
check("p.114 傌傌牽制", A("炮士將傌傌"), { gain: 140, cost: 70, beitong: true });
check("p.115 接班", A("仕將馬相兵"), { gain: 10, cost: 55 });
check("p.117 易誤判一", A("炮士兵傌馬"), { gain: 30, cost: 12.5, beitong: false });
/* 書中主算 +30 時漏列了仕吃馬（+20），隨後的「先吃馬可通吃」才算進去 */
check("p.118 兩種可能", A("仕卒車卒馬"), { gain: 50, cost: 60, tongchiMaybe: true });
check("p.118 雨傘非被通吃", A("卒帥俥炮士"), { gain: 77.5, beitong: false });
check("p.119 相消耗", A("相相士卒包"), { gain: 25, cost: 20, beitong: false });
check("p.119 勝利格", A("士兵傌卒相"), { gain: 35, cost: 35 });
check("範例一 林先生", A("象俥卒兵士"), { gain: 40, cost: 20, tongchi: true, pats: ["好人緣格"] });
check("範例二 林小姐", A("士相炮傌炮"), { gain: 62.5, cost: 0, tongchiMaybe: true, pats: ["眾星拱月格／鬱卒格", "消耗格"] });
check("範例三 莊小姐", A("將馬帥炮兵"), { gain: 65, cost: 80, pats: ["好朋友格", "明君格", "暴動格", "偏桃花"] });
check("範例四 馬先生", A("傌兵馬士炮"), { gain: 30, beitongMaybe: true, pats: ["好人緣格"] });
check("範例五 包先生", A("車卒馬包炮"), { gain: 22.5, cost: 15, pats: ["好朋友格", "正桃花", "事業格", "一枝獨秀格"] });
check("範例六 李小姐", A("象象俥炮相"), { gain: 42.5, cost: 40, pats: ["消耗格", "好朋友格"] });
check("p.217 工作右", A("車相包相仕"), { gain: 160, cost: 45, tongchi: true });
check("p.217 工作左", A("卒象將兵仕"), { gain: 5, cost: 5 });
check("p.218 保險", A("兵炮象將兵"), { gain: 100, cost: 10 });
check("p.224 房子", A("象仕馬兵卒"), { gain: 50, cost: 20 });
check("p.236 緣分", A("車兵包相兵"), { tongchi: true });
/* 以下兩例書中直接說會被通吃，但中間其實能吃外圍逃走（書 p.78、p.110 的定義：能跑掉就不算被通吃），本站標為「可能」 */
check("p.237 緣分", A("相將仕馬相"), { beitong: false, beitongMaybe: true });
check("p.234 業績", A("兵車象傌士"), { beitong: false, beitongMaybe: true });
/* 命盤：張先生命盤（書 p.171–187），抽出順序 1中 2左 3右 4上 5下，之後每局中左右下 */
const chart = XQE.analyzeChart("馬炮士仕兵包卒馬兵相包兵帥車卒炮卒將俥相兵傌傌象士俥兵象仕卒車卒".split(""));
const R = (k) => chart.rounds[k - 1];
const upList = (k, own) => R(k).up.filter((u) => (u.by.red === R(k).list[0].red) === own).map((u) => u.target.ch).sort().join("");
const chk = (label, ok) => { n++; if (!ok) { fail++; console.log("✗ 命盤 " + label); } };
chk("總格被通吃", R(1).a.beitongChart);
chk("學習格：右馬往上吃炮、仕", upList(2, true) === "炮仕".split("").sort().join(""));
chk("學習格：上兵往上吃馬、士", upList(2, false) === "馬士".split("").sort().join(""));
chk("學習格收付 +15 −7.5", R(2).a.gain === 15 && R(2).a.cost === 7.5);
chk("情感格：上兵吃包卒馬、左包吃上兩局的炮", upList(3, true) === "包卒馬".split("").sort().join("") && upList(3, false) === "炮");
chk("事業格：車吃帥 +80、得炮好處 +7.5", R(4).a.gain === 87.5);
chk("事業格：往上 +120（兵相兵、相兵兵）", R(4).upGain === 120);
chk("事業格：炮往上吃馬、卒 −30", R(4).upCost === 30);
chk("事業格：十年運勢屬通吃", R(4).a.tongchiChart);
chk("41~50：將吃俥 +30、相 +40、兵好處 +5；付出 −80", R(5).a.gain === 75 && R(5).a.cost === 80);
chk("41~50：俥往上吃卒車包卒包馬士馬", upList(5, false) === "卒車包卒包馬士馬".split("").sort().join(""));
chk("51~60：被通吃（重大關卡）", R(6).a.beitong);
chk("51~60：上兵往上吃將卒車卒", upList(6, true) === "將卒車卒".split("").sort().join(""));
chk("61~70：通吃；上士往上吃兩傌一兵", R(7).a.tongchi && upList(7, false) === "傌傌兵".split("").sort().join(""));
chk("71~80：卒吃俥兵、車吃兵俥傌傌兵俥", R(8).upGain === 160);
console.log(fail ? `${fail}/${n} 例不符` : `PASS：${n} 例全部符合書中算法`);
process.exitCode = fail ? 1 : 0;
