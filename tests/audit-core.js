"use strict";

/* 核心術數的無瀏覽器回歸稽核。執行：node tests/audit-core.js */
const assert = require("node:assert/strict");
const crypto = require("node:crypto").webcrypto;
const fs = require("node:fs");
const vm = require("node:vm");

const box = { console, crypto, Date, Math, setTimeout };
vm.createContext(box);
for (const file of ["divine-core.js", "divine-lore.js"])
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

console.log(`PASS: ${builtIn.split("\n").length} 項內建檢核 + 全域組合稽核`);
