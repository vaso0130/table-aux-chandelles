"use strict";

/* 核心術數的無瀏覽器回歸稽核。執行：node tests/audit-core.js */
const assert = require("node:assert/strict");
const crypto = require("node:crypto").webcrypto;
const fs = require("node:fs");
const vm = require("node:vm");

const box = { console, crypto, Date, Math, setTimeout };
vm.createContext(box);
for (const file of ["js/divine-core.js", "js/divine-lore.js"])
  vm.runInContext(fs.readFileSync(file, "utf8"), box, { filename: file });
box.DC.TONES = ["一", "二", "三", "四", "五"];
const DC = box.DC;

const builtIn = DC.selfTest();
assert(!builtIn.split("\n").some(line => line.startsWith("✗")), builtIn);

// 日期、時辰與已知農曆錨點。
assert.deepEqual([0, 0, 1, 1, 11], [23, 0, 1, 2, 22].map(DC.hourBranch));
const lateZi = DC.bazi(2000, 1, 1, 23, 30, 8, "lateZi");
const midnight = DC.bazi(2000, 1, 1, 23, 30, 8, "midnight");
assert.equal(lateZi.pillars[2].gz, "己未");
assert.equal(midnight.pillars[2].gz, "戊午");
for (const [y, m, d, lm, ld, leap] of [
  [2023, 1, 22, 1, 1, false],
  [2024, 2, 10, 1, 1, false],
  [2025, 1, 29, 1, 1, false],
  [2025, 7, 25, 6, 1, true],
  [2026, 2, 17, 1, 1, false]
]) {
  const actual = DC.lunar(y, m, d, 8);
  assert.equal(`${actual.month}/${actual.day}/${actual.isLeap}`, `${lm}/${ld}/${leap}`, `${y}-${m}-${d}`);
}

// 所有梅花輸入餘數都必須得到合法本、互、變卦及 1..6 動爻。
for (let upper = 1; upper <= 8; upper++) for (let lower = 1; lower <= 8; lower++) {
  for (let moving = 1; moving <= 6; moving++) {
    const x = DC.meihua(upper, lower, moving);
    assert(x.name && x.hu.name && x.bian.name);
    assert(x.mov >= 1 && x.mov <= 6);
  }
}

// 六十日 × 十二時 × 十二月將，全組合不得出現無效三傳或天盤。
for (let day = 0; day < 60; day++) for (let hour = 0; hour < 12; hour++) {
  for (let sign = 0; sign < 12; sign++) {
    const x = DC.liuren(day, hour, sign * 30 + 15);
    assert.equal(x.tianpan.length, 12);
    assert.equal(x.chuan.length, 3);
    assert(x.chuan.every(c => c && c.b >= 0 && c.b < 12));
  }
}

// 跨節氣抽樣奇門盤：八個外宮的星、門、神不得缺席。
for (let month = 1; month <= 12; month++) for (const hour of [0, 6, 12, 18]) {
  const x = DC.qimen(2026, month, 15, hour, 0, 8);
  assert.equal(Object.keys(x.tianpan).length, 8);
  assert.equal(Object.keys(x.doors).length, 8);
  assert.equal(Object.keys(x.gods).length, 8);
}

// 紫微的每個月、日、時樣本都必須安齊十四主星且十二宮名不重複。
for (let month = 1; month <= 12; month++) for (const day of [1, 15, 30]) {
  for (const hour of [0, 6, 11]) {
    const x = DC.ziwei(month, day, hour, 0, 0, true);
    assert.equal(x.P.reduce((n, p) => n + p.stars.length, 0), 14);
    assert.equal(new Set(x.P.map(p => p.palace)).size, 12);
  }
}

// 卦名表：經卦三爻由下而上，HEX_NAME[上][下]；艮列曾錯置蒙與艮。
for (let u = 0; u < 8; u++) for (let l = 0; l < 8; l++) {
  const name = DC.HEX_NAME[u][l];
  if (u === l) assert.match(name, /為/);
  else assert.ok(name.startsWith(["天", "澤", "火", "雷", "風", "水", "山", "地"][u]), name);
}
assert.equal(DC.HEX_NAME[6][5], "山水蒙");
assert.equal(DC.HEX_NAME[6][6], "艮為山");

// 起卦：大衍（朱子掛扐法）四象機率 1/16、5/16、7/16、3/16；朱子變占表前十卦即變爻含初爻者。
{ const N = 200000, f = { 6: 0, 7: 0, 8: 0, 9: 0 };
  for (let k = 0; k < N; k++) f[DC.yarrowLine().v]++;
  [[6, 1], [7, 5], [8, 7], [9, 3]].forEach(([v, x]) => assert.ok(Math.abs(f[v] / N - x / 16) < 0.006, "大衍 " + v + ":" + f[v] / N));
  let r = 0; for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) for (let c = b + 1; c < 6; c++) { r++; assert.equal(DC.zhuRank([a, b, c]).zhen, a === 0); }
  assert.equal(r, 20);
  assert.equal(DC.hexNameOf([1, 0, 1, 0, 1, 0]), "水火既濟");
  const nj = DC.najiaPrompt(DC.najia([8, 8, 8, 6, 7, 7], 2026, 10, 25, 11, 2, 8), "T");
  assert.match(nj[1], /^本卦：風地觀（乾宮四世卦，屬金），世在四爻、應在初爻，卦身酉。變卦：天地否/); }

// 文王卦序：64 卦各一，八純卦與既濟、未濟位置。
assert.equal(new Set(DC.KW.flat()).size, 64);
assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(i => DC.KW[i][i]), [1, 58, 30, 51, 57, 29, 52, 2]);
assert.equal(DC.hexNum([1, 0, 1, 0, 1, 0]), 63);
assert.equal(DC.hexNum([0, 1, 0, 1, 0, 1]), 64);
for (let k = 0; k < 1000; k++) { const r = DC.rand01(); assert.ok(r >= 0 && r < 1); }

// 六爻納甲：八宮依「逐爻變一至五世、四爻復變為遊魂、內卦復原為歸魂」獨立生成，64 卦宮位世爻各一。
const seenHex = new Set();
for (let g = 0; g < 8; g++) {
  const t = DC.TRIG_LINES[g];
  let h = t.concat(t);
  const seq = [[h.slice(), 6, "本宮"]];
  for (let k = 0; k < 5; k++) { h[k] = 1 - h[k]; seq.push([h.slice(), k + 1, ["一世", "二世", "三世", "四世", "五世"][k]]); }
  h[3] = 1 - h[3]; seq.push([h.slice(), 4, "遊魂"]);
  h = t.concat(h.slice(3)); seq.push([h.slice(), 3, "歸魂"]);
  for (const [bits, shi, kind] of seq) {
    const r = DC.najiaGong(bits);
    assert.deepEqual([r.gong, r.shi, r.kind], [g, shi, kind], bits.join(""));
    seenHex.add(bits.join(""));
  }
}
assert.equal(seenHex.size, 64);
// 古籍排盤對照（由上而下）：天風姤、風地觀、澤雷隨。
const njRows = nj => [5, 4, 3, 2, 1, 0].map(i => nj.yao[i].qin + nj.yao[i].gan + nj.yao[i].zhi + nj.yao[i].wx
  + (nj.shi === i + 1 ? "世" : nj.ying === i + 1 ? "應" : "") + (nj.fu[i] ? "/伏" + nj.fu[i].qin + nj.fu[i].gan + nj.fu[i].zhi : "")).join(" ");
const gou = DC.najia([8, 7, 7, 7, 7, 7], 2026, 10, 25, 10, 0, 8);
assert.equal(njRows(gou), "父母壬戌土 兄弟壬申金 官鬼壬午火應 兄弟辛酉金 子孫辛亥水/伏妻財甲寅 父母辛丑土世");
assert.equal(gou.guaShen, "午");
const guan = DC.najia([8, 8, 8, 6, 7, 7], 2026, 10, 25, 11, 2, 8);
assert.equal(njRows(guan), "妻財辛卯木 官鬼辛巳火/伏兄弟壬申 父母辛未土世 妻財乙卯木 官鬼乙巳火 父母乙未土應/伏子孫甲子");
assert.equal(guan.bian[3].qin + guan.bian[3].gan + guan.bian[3].zhi, "官鬼壬午");
assert.deepEqual([guan.month, guan.dayGZ, guan.kong, guan.guaShen, guan.shen[0]], ["戌", "壬申", "戌亥", "酉", "玄武"]);
const sui = DC.najia([7, 8, 8, 7, 7, 8], 2026, 10, 25, 11, 3, 8);
assert.equal(njRows(sui), "妻財丁未土應 官鬼丁酉金 父母丁亥水/伏子孫庚午 妻財庚辰土世 兄弟庚寅木 父母庚子水");

// 式占館教學書的星門神將須與排盤用的名稱表一致（任一邊改名即報錯）。
const shiLearn = fs.readFileSync("js/learn/shi-learn.js", "utf8");
for (const name of [...DC.QM_STAR, ...DC.QM_DOOR, ...DC.QM_GODS, ...DC.LR_JIANG].filter(Boolean))
  assert.ok(shiLearn.includes('["' + name + '"'), "shi-learn.js 缺「" + name + "」的解說");

// 同題比對（牌桌館與各館共用）。
assert.equal(DC.simQ("", ""), 1);
assert.ok(DC.simQ("他會不會回來", "他還會回來嗎") >= DC.SIMQ_TH);
assert.ok(DC.simQ("他會不會回來", "這份工作適合我嗎") < DC.SIMQ_TH);

// Weton 35 日週期必須覆蓋 35 種組合；合婚為八類且整除落 Pesthi。
const wetonPairs = new Set();
for (let n = 0; n < 35; n++) {
  const d = new Date(Date.UTC(2026, 0, 1 + n));
  const w = DC.weton(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  wetonPairs.add(`${w.wd},${w.pas}`);
}
assert.equal(wetonPairs.size, 35);
for (let remainder = 1; remainder <= 8; remainder++) {
  const x = DC.jodoh(8, remainder);
  assert.equal(x.remainder, remainder);
  assert.equal(x.result, DC.JODOH8[remainder - 1]);
}
assert.match(DC.jodoh(16, 16).result[0], /^Pesthi/);

// 象棋聖元派：十四種棋都有資料，紅黑成對強度相同、數字相同（帥 1／將 9、兵 7／卒 8 例外），兵卒依性別論正常反常。
box.window = box;
vm.runInContext(fs.readFileSync("js/data/xq-data.js", "utf8"), box, { filename: "js/data/xq-data.js" });
const XQ = box.XQ;
assert.equal(XQ.CARDS.length, 32);
assert.equal(Object.keys(XQ.SY).length, 14);
for (const [r, k] of ["帥將", "仕士", "相象", "俥車", "傌馬", "炮包", "兵卒"]) {
  assert.equal(XQ.SY[r].pct, XQ.SY[k].pct);
  assert.equal(XQ.SY[r].cls, XQ.SY[k].cls);
  for (const t of XQ.TOPICS) assert.ok(XQ.SY[r].t[t] && XQ.SY[k].t[t]);
  if (XQ.SY[r].cls === 2) { assert.ok(XQ.SY[k].turn); assert.equal(XQ.SY[r].num, XQ.SY[k].num); }
}
assert.deepEqual(["仕", "相", "俥", "傌", "炮"].map((c) => XQ.SY[c].pct), [100, 90, 80, 70, 60]);
assert.match(XQ.verdict("士", ["是", "不是"]), /不是/);
assert.match(XQ.verdict("仕", ["是", "不是"]), /「是」/);
assert.match(XQ.sexNote("兵", "男"), /反常/);
assert.match(XQ.sexNote("卒", "男"), /正常/);
assert.equal(XQ.sexNote("仕", "男"), "");

console.log(`PASS: ${builtIn.split("\n").length} 項內建檢核 + 全域組合稽核`);
