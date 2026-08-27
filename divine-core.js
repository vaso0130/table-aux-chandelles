/* ═══════════════════════════════════════════════════════════════
   燭光牌桌 · 術數核心引擎 divine-core.js
   天文曆算(太陽系黃經/上升點/節氣/農曆)+ 各式起盤演算法。
   行星位置採 Schlyter 簡化根數(精度約 ±0.1°,月亮 ±0.5°),
   對星座級判讀綽綽有餘;金句式解讀由各館頁面與 AI 提示詞承擔。
   ═══════════════════════════════════════════════════════════════ */
"use strict";
var DC = {};
(function () {
  const RAD = Math.PI / 180;
  const rev = x => { x %= 360; return x < 0 ? x + 360 : x; };
  const rev180 = x => { x = rev(x); return x > 180 ? x - 360 : x; };
  const sind = x => Math.sin(x * RAD), cosd = x => Math.cos(x * RAD), tand = x => Math.tan(x * RAD);
  const atan2d = (y, x) => Math.atan2(y, x) / RAD;
  const pad2 = n => String(n).padStart(2, "0");
  DC.rev = rev; DC.pad2 = pad2;
  DC.numOr = (v, d) => { v = parseFloat(v); return Number.isFinite(v) ? v : d; }; // 「0」不可落回預設(時區 UTC+0 合法)

  DC.rand = function (n) { // crypto 隨機 0..n-1
    const u = new Uint32Array(1), lim = Math.floor(4294967296 / n) * n;
    do { crypto.getRandomValues(u); } while (u[0] >= lim);
    return u[0] % n;
  };

  /* ── 時間 ── */
  DC.jdFromUTC = ms => ms / 86400000 + 2440587.5;
  const utc = (y, mo, d, h, mi) => { // Date.UTC 會把 0-99 年映射為 19xx,改用 setUTCFullYear
    const dt = new Date(0); dt.setUTCFullYear(y, mo - 1, d); dt.setUTCHours(h || 0, mi || 0, 0, 0); return dt.getTime();
  };
  DC.utcMs = (y, mo, d, h, mi, tz) => utc(y, mo, d, h, mi) - (tz || 0) * 3600000;
  DC.jd = (y, mo, d, h, mi, tz) => DC.jdFromUTC(DC.utcMs(y, mo, d, h, mi, tz));
  DC.jdToDate = (jd, tz) => new Date((jd - 2440587.5) * 86400000 + (tz || 0) * 3600000); // 讀取用 getUTC*
  DC.fmtJD = function (jd, tz, withTime) {
    const d = DC.jdToDate(jd, tz);
    let s = d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
    if (withTime !== false) s += " " + pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes());
    return s;
  };
  const ldn = (jd, tz) => Math.floor(jd + tz / 24 + 0.5); // 當地日序號(午夜換日)
  const deltaTdays = jd => { // ΔT=TT−UT(Espenak–Meeus 簡式,1900–2150 適用),單位:日
    const y = 2000 + (jd - 2451545.0) / 365.25;
    let t, dt;
    if (y < 1920) { t = y - 1900; dt = -2.79 + 1.494119 * t - 0.0598939 * t * t + 0.0061966 * t * t * t - 0.000197 * t * t * t * t; }
    else if (y < 1941) { t = y - 1920; dt = 21.20 + 0.84493 * t - 0.076100 * t * t + 0.0020936 * t * t * t; }
    else if (y < 1961) { t = y - 1950; dt = 29.07 + 0.407 * t - t * t / 233 + t * t * t / 2547; }
    else if (y < 1986) { t = y - 1975; dt = 45.45 + 1.067 * t - t * t / 260 - t * t * t / 718; }
    else if (y < 2005) { t = y - 2000; dt = 63.86 + 0.3345 * t - 0.060374 * t * t + 0.0017275 * t * t * t + 0.000651814 * t * t * t * t + 0.00002373599 * t * t * t * t * t; }
    else if (y < 2050) { t = y - 2000; dt = 62.92 + 0.32217 * t + 0.005589 * t * t; }
    else { const u = (y - 1820) / 100; dt = -20 + 32 * u * u - 0.5628 * (2150 - y); }
    return dt / 86400;
  };
  const nutLon = d => -0.00479 * sind(rev(125.04 - 0.052954 * d)); // 黃經章動主項(度)

  /* ═══ 天文:太陽/月亮/行星 黃經 ═══ */
  function sunPos(jd) { // 入參 UT;內部以 TT 計,回傳視黃經(含章動與光行差)
    const d = jd + deltaTdays(jd) - 2451543.5;
    const w = 282.9404 + 4.70935e-5 * d, e = 0.016709 - 1.151e-9 * d, M = rev(356.0470 + 0.9856002585 * d);
    const E = M + e * (180 / Math.PI) * sind(M) * (1 + e * cosd(M));
    const xv = cosd(E) - e, yv = sind(E) * Math.sqrt(1 - e * e);
    const v = atan2d(yv, xv), r = Math.sqrt(xv * xv + yv * yv);
    const lonGeom = rev(v + w); // 幾何黃經(合成行星地心位置用)
    const lon = rev(lonGeom + nutLon(d) - 0.00569); // 視黃經:章動+光行差 −20.5″
    return { lon, r, x: r * cosd(lonGeom), y: r * sind(lonGeom), Ms: M, ws: w };
  }
  DC.sunLon = jd => sunPos(jd).lon;

  DC.moonLon = function (jd) { // 入參 UT;內部以 TT 計,回傳視黃經(含章動)
    const d = jd + deltaTdays(jd) - 2451543.5;
    const N = rev(125.1228 - 0.0529538083 * d), i = 5.1454, w = rev(318.0634 + 0.1643573223 * d);
    const a = 60.2666, e = 0.054900, M = rev(115.3654 + 13.0649929509 * d);
    let E = M + e * (180 / Math.PI) * sind(M) * (1 + e * cosd(M));
    for (let k = 0; k < 5; k++) E = E - (E - (180 / Math.PI) * e * sind(E) - M) / (1 - e * cosd(E));
    const xv = a * (cosd(E) - e), yv = a * Math.sqrt(1 - e * e) * sind(E);
    const v = atan2d(yv, xv), r = Math.sqrt(xv * xv + yv * yv);
    const xe = r * (cosd(N) * cosd(v + w) - sind(N) * sind(v + w) * cosd(i));
    const ye = r * (sind(N) * cosd(v + w) + cosd(N) * sind(v + w) * cosd(i));
    let lon = rev(atan2d(ye, xe));
    const s = sunPos(jd), Ls = rev(s.Ms + s.ws), Lm = rev(N + w + M), Ms = s.Ms, Mm = M;
    const D = rev(Lm - Ls), F = rev(Lm - N);
    lon += -1.274 * sind(Mm - 2 * D) + 0.658 * sind(2 * D) - 0.186 * sind(Ms)
      - 0.059 * sind(2 * Mm - 2 * D) - 0.057 * sind(Mm - 2 * D + Ms) + 0.053 * sind(Mm + 2 * D)
      + 0.046 * sind(2 * D - Ms) + 0.041 * sind(Mm - Ms) - 0.035 * sind(D)
      - 0.031 * sind(Mm + Ms) - 0.015 * sind(2 * F - 2 * D) + 0.011 * sind(Mm - 4 * D);
    return rev(lon + nutLon(d));
  };
  DC.moonNodeLon = function (jd) { // 平均北交點(羅睺)
    return rev(125.1228 - 0.0529538083 * (jd - 2451543.5));
  };

  const ELEM = { // Schlyter 平根數 [N, i, w, a, e, M0, Md]
    mer: [48.3313, 3.24587e-5, 7.0047, 5e-8, 29.1241, 1.01444e-5, 0.387098, 0, 0.205635, 5.59e-10, 168.6562, 4.0923344368],
    ven: [76.6799, 2.46590e-5, 3.3946, 2.75e-8, 54.8910, 1.38374e-5, 0.723330, 0, 0.006773, -1.302e-9, 48.0052, 1.6021302244],
    mar: [49.5574, 2.11081e-5, 1.8497, -1.78e-8, 286.5016, 2.92961e-5, 1.523688, 0, 0.093405, 2.516e-9, 18.6021, 0.5240207766],
    jup: [100.4542, 2.76854e-5, 1.3030, -1.557e-7, 273.8777, 1.64505e-5, 5.20256, 0, 0.048498, 4.469e-9, 19.8950, 0.0830853001],
    sat: [113.6634, 2.38980e-5, 2.4886, -1.081e-7, 339.3939, 2.97661e-5, 9.55475, 0, 0.055546, -9.499e-9, 316.9670, 0.0334442282],
    ura: [74.0005, 1.3978e-5, 0.7733, 1.9e-8, 96.6612, 3.0565e-5, 19.18171, -1.55e-8, 0.047318, 7.45e-9, 142.5905, 0.011725806],
    nep: [131.7806, 3.0173e-5, 1.7700, -2.55e-7, 272.8461, -6.027e-6, 30.05826, 3.313e-8, 0.008606, 2.15e-9, 260.2471, 0.005995147]
  };
  function helio(el, d) {
    const N = rev(el[0] + el[1] * d), i = el[2] + el[3] * d, w = rev(el[4] + el[5] * d);
    const a = el[6] + el[7] * d, e = el[8] + el[9] * d, M = rev(el[10] + el[11] * d);
    let E = M + e * (180 / Math.PI) * sind(M) * (1 + e * cosd(M));
    for (let k = 0; k < 6; k++) E = E - (E - (180 / Math.PI) * e * sind(E) - M) / (1 - e * cosd(E));
    const xv = a * (cosd(E) - e), yv = a * Math.sqrt(1 - e * e) * sind(E);
    const v = atan2d(yv, xv), r = Math.sqrt(xv * xv + yv * yv);
    return {
      x: r * (cosd(N) * cosd(v + w) - sind(N) * sind(v + w) * cosd(i)),
      y: r * (sind(N) * cosd(v + w) + cosd(N) * sind(v + w) * cosd(i)),
      z: r * sind(v + w) * sind(i), M
    };
  }
  function planetLons(jd) { // 地心黃經(木土天攝動加於日心黃經後再合成、冥王星近似式)
    const d = jd + deltaTdays(jd) - 2451543.5, s = sunPos(jd), out = {};
    const Mj = rev(ELEM.jup[10] + ELEM.jup[11] * d), MsS = rev(ELEM.sat[10] + ELEM.sat[11] * d), Mu = rev(ELEM.ura[10] + ELEM.ura[11] * d);
    for (const k in ELEM) {
      const h = helio(ELEM[k], d);
      let lonh = atan2d(h.y, h.x); // 日心黃經(Schlyter 攝動加在此層)
      if (k === "jup") lonh += -0.332 * sind(2 * Mj - 5 * MsS - 67.6) - 0.056 * sind(2 * Mj - 2 * MsS + 21)
        + 0.042 * sind(3 * Mj - 5 * MsS + 21) - 0.036 * sind(Mj - 2 * MsS) + 0.022 * cosd(Mj - MsS)
        + 0.023 * sind(2 * Mj - 3 * MsS + 52) - 0.016 * sind(Mj - 5 * MsS - 69);
      if (k === "sat") lonh += 0.812 * sind(2 * Mj - 5 * MsS - 67.6) - 0.229 * cosd(2 * Mj - 4 * MsS - 2)
        + 0.119 * sind(Mj - 2 * MsS - 3) + 0.046 * sind(2 * Mj - 6 * MsS - 69) + 0.014 * sind(Mj - 3 * MsS + 32);
      if (k === "ura") lonh += 0.040 * sind(MsS - 2 * Mu + 6) + 0.035 * sind(MsS - 3 * Mu + 33) - 0.015 * sind(Mj - Mu + 20);
      const rh = Math.sqrt(h.x * h.x + h.y * h.y); // 黃道面投影半徑(=r·cos lat)
      out[k] = rev(atan2d(rh * sind(lonh) + s.y, rh * cosd(lonh) + s.x));
    }
    { // 冥王星(1900-2100 近似式,日心→地心;未乘 cos(lat),黃經誤差約 0.06°,可容)
      const S = 50.03 + 0.033459652 * d, P = 238.95 + 0.003968789 * d;
      const lonh = 238.9508 + 0.00400703 * d - 19.799 * sind(P) + 19.848 * cosd(P) + 0.897 * sind(2 * P)
        - 4.956 * cosd(2 * P) + 0.610 * sind(3 * P) + 1.211 * cosd(3 * P) - 0.341 * sind(4 * P)
        - 0.190 * cosd(4 * P) + 0.128 * sind(5 * P) - 0.034 * cosd(5 * P) - 0.038 * sind(6 * P)
        + 0.031 * cosd(6 * P) + 0.020 * sind(S - P) - 0.010 * cosd(S - P);
      const r = 40.72 + 6.68 * sind(P) + 6.90 * cosd(P) - 1.18 * sind(2 * P) - 0.03 * cosd(2 * P)
        + 0.15 * sind(3 * P) - 0.14 * cosd(3 * P);
      out.plu = rev(atan2d(r * sind(lonh) + s.y, r * cosd(lonh) + s.x));
    }
    return out;
  }

  DC.PLANETS = [
    { id: "sun", zh: "太陽", gl: "☉" }, { id: "moo", zh: "月亮", gl: "☽" },
    { id: "mer", zh: "水星", gl: "☿" }, { id: "ven", zh: "金星", gl: "♀" },
    { id: "mar", zh: "火星", gl: "♂" }, { id: "jup", zh: "木星", gl: "♃" },
    { id: "sat", zh: "土星", gl: "♄" }, { id: "ura", zh: "天王星", gl: "♅" },
    { id: "nep", zh: "海王星", gl: "♆" }, { id: "plu", zh: "冥王星", gl: "♇" },
    { id: "nod", zh: "北交點", gl: "☊" }
  ];
  DC.chart = function (jd) { // 全行星地心黃經 + 逆行旗標 + 日速(度/日,入相位判別用)
    const p1 = planetLons(jd - 0.5), p2 = planetLons(jd + 0.5);
    const now = planetLons(jd);
    const list = [
      { id: "sun", lon: DC.sunLon(jd), retro: false, speed: rev180(DC.sunLon(jd + 0.5) - DC.sunLon(jd - 0.5)) },
      { id: "moo", lon: DC.moonLon(jd), retro: false, speed: rev180(DC.moonLon(jd + 0.5) - DC.moonLon(jd - 0.5)) }
    ];
    for (const k of ["mer", "ven", "mar", "jup", "sat", "ura", "nep", "plu"]) {
      const sp = rev180(p2[k] - p1[k]);
      list.push({ id: k, lon: now[k], retro: sp < 0, speed: sp });
    }
    list.push({ id: "nod", lon: DC.moonNodeLon(jd), retro: true, speed: -0.0529538083 });
    for (const p of list) { const m = DC.PLANETS.find(q => q.id === p.id); p.zh = m.zh; p.gl = m.gl; }
    return list;
  };

  /* ── 上升/天頂/宮位 ── */
  DC.obliquity = jd => 23.4393 - 3.563e-7 * (jd - 2451543.5);
  DC.gmst = jd => rev(280.46061837 + 360.98564736629 * (jd - 2451545.0));
  DC.ascMc = function (jd, latDeg, lonDeg) { // lonDeg 東經為正
    const eps = DC.obliquity(jd);
    const ramc = rev(DC.gmst(jd) + lonDeg);
    const mc = rev(atan2d(sind(ramc), cosd(ramc) * cosd(eps)));
    const asc = rev(atan2d(cosd(ramc), -(sind(ramc) * cosd(eps) + tand(latDeg) * sind(eps))));
    return { asc, mc, ramc };
  };

  DC.ZODIAC = ["牡羊", "金牛", "雙子", "巨蟹", "獅子", "處女", "天秤", "天蠍", "射手", "摩羯", "水瓶", "雙魚"];
  DC.ZOD_GL = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"];
  DC.RULER = ["火星", "金星", "水星", "月亮", "太陽", "水星", "金星", "火星", "木星", "土星", "土星", "木星"]; // 傳統守護
  DC.signOf = lon => Math.floor(rev(lon) / 30);
  DC.fmtLon = function (lon) {
    lon = rev(lon);
    let s = Math.floor(lon / 30);
    const d = lon - s * 30;
    let dd = Math.floor(d), mm = Math.round((d - dd) * 60);
    if (mm === 60) { mm = 0; dd += 1; if (dd === 30) { dd = 0; s = (s + 1) % 12; } }
    return DC.ZODIAC[s] + " " + dd + "°" + pad2(mm) + "′";
  };

  DC.ASPECTS = [[0, "合相", "☌"], [60, "六合", "⚹"], [90, "四分", "□"], [120, "三合", "△"], [180, "對分", "☍"]];
  DC.aspects = function (listA, listB) { // listB 省略=盤內互相
    const res = [], inner = !listB; listB = listB || listA;
    for (let i = 0; i < listA.length; i++)
      for (let j = inner ? i + 1 : 0; j < listB.length; j++) {
        const a = listA[i], b = listB[j];
        if (a.id === "nod" && b.id === "nod") continue;
        const diff = Math.abs(rev180(a.lon - b.lon));
        for (const [ang, name, gl] of DC.ASPECTS) {
          const lum = (a.id === "sun" || a.id === "moo" || b.id === "sun" || b.id === "moo");
          const orb = ang === 60 ? (lum ? 4 : 3) : (lum ? 8 : 6); // 六合容許度收窄
          if (Math.abs(diff - ang) <= orb) {
            let applying = null; // 入相/離相:兩星皆有速度時,推 0.1 日後角距是否收緊
            if (typeof a.speed === "number" && typeof b.speed === "number") {
              const dNext = Math.abs(rev180((a.lon + a.speed * 0.1) - (b.lon + b.speed * 0.1)));
              applying = Math.abs(dNext - ang) < Math.abs(diff - ang);
            }
            res.push({ a, b, ang, name, gl, orb: Math.abs(diff - ang), applying });
          }
        }
      }
    res.sort((x, y) => x.orb - y.orb);
    return res;
  };

  /* ── 太陽黃經跨越求解(節氣/返照)── */
  DC.sunCross = function (targetLon, jdStart) { // jdStart 之後第一次跨越
    let t = jdStart, prev = rev180(DC.sunLon(t) - targetLon);
    for (let i = 0; i < 400; i++) {
      const t2 = t + 1, cur = rev180(DC.sunLon(t2) - targetLon);
      if (prev < 0 && cur >= 0) { // 跨越,二分
        let lo = t, hi = t2;
        for (let k = 0; k < 40; k++) {
          const mid = (lo + hi) / 2;
          (rev180(DC.sunLon(mid) - targetLon) < 0) ? lo = mid : hi = mid;
        }
        return (lo + hi) / 2;
      }
      t = t2; prev = cur;
    }
    return null;
  };
  DC.solarTerm = function (year, lonDeg) { // 該年太陽到 lonDeg 的時刻(JD, UT)
    const approx = DC.jd(year, 1, 1, 0, 0, 0) + rev(lonDeg - 280) / 0.9856 - 3;
    return DC.sunCross(lonDeg, approx - 5);
  };
  DC.TERMS = ["冬至", "小寒", "大寒", "立春", "雨水", "驚蟄", "春分", "清明", "穀雨", "立夏", "小滿", "芒種",
    "夏至", "小暑", "大暑", "立秋", "處暑", "白露", "秋分", "寒露", "霜降", "立冬", "小雪", "大雪"]; // 自黃經270起每15°

  /* ── 新月(定朔)── */
  DC.newMoonAfter = function (jdStart) {
    let t = jdStart, prev = rev180(DC.moonLon(t) - DC.sunLon(t));
    for (let i = 0; i < 40; i++) {
      const t2 = t + 1, cur = rev180(DC.moonLon(t2) - DC.sunLon(t2));
      if (prev < 0 && cur >= 0) {
        let lo = t, hi = t2;
        for (let k = 0; k < 40; k++) {
          const mid = (lo + hi) / 2;
          (rev180(DC.moonLon(mid) - DC.sunLon(mid)) < 0) ? lo = mid : hi = mid;
        }
        return (lo + hi) / 2;
      }
      t = t2; prev = cur;
    }
    return null;
  };
  DC.lunarReturnAfter = function (jdStart, natalMoonLon) {
    let t = jdStart, prev = rev180(DC.moonLon(t) - natalMoonLon);
    for (let i = 0; i < 40; i++) {
      const t2 = t + 1, cur = rev180(DC.moonLon(t2) - natalMoonLon);
      if (prev < 0 && cur >= 0) {
        let lo = t, hi = t2;
        for (let k = 0; k < 40; k++) {
          const mid = (lo + hi) / 2;
          (rev180(DC.moonLon(mid) - natalMoonLon) < 0) ? lo = mid : hi = mid;
        }
        return (lo + hi) / 2;
      }
      t = t2; prev = cur;
    }
    return null;
  };

  /* ── 恆星(J2000 黃經,歲差 +50.29″/年)── */
  DC.STARS = [
    ["大陵五 Algol", 56.17, "最凶名之星:危機、失落與斷頭台。落點提醒此處須極度小心。"],
    ["昴宿 Alcyone", 60.00, "眼淚與洞見之星:敏感、看見他人所未見,亦易多愁。"],
    ["畢宿五 Aldebaran", 69.79, "四王星之東:正直與榮譽帶來成功,唯須光明磊落。"],
    ["參宿七 Rigel", 76.83, "教育者與開拓者之星:技藝、聲名、快速崛起。"],
    ["參宿四 Betelgeuse", 88.75, "巨人之肩:順境中的大成就與物質收穫。"],
    ["天狼星 Sirius", 104.08, "全天最亮:炙熱的名聲、野心與燒灼般的行動力。"],
    ["北河三 Pollux", 113.22, "拳手之星:勇敢、直接,也易招衝突。"],
    ["南河三 Procyon", 115.78, "迅速而短暫的機運:來得快,須即刻把握。"],
    ["軒轅十四 Regulus", 149.83, "王者之星:榮耀、領導與加冕——但戒報復,否則隕落。"],
    ["角宿一 Spica", 203.83, "天賜之禮:才華、保護與豐收,全天最吉恆星之一。"],
    ["大角 Arcturus", 204.23, "領路人之星:開創新路,在變局中領航。"],
    ["心宿二 Antares", 249.77, "火星之敵:強烈、執著、置之死地而後生。"],
    ["織女一 Vega", 285.32, "藝術與魅力之星:音樂、優雅,廣受喜愛。"],
    ["河鼓二 Altair", 301.78, "飛鷹之星:大膽、果決,一飛沖天。"],
    ["壘壁陣四 Deneb Algedi", 323.55, "立法者之星:公正、務實,先苦後甘。"],
    ["北落師門 Fomalhaut", 333.87, "四王星之南:理想與名聲,唯須初心純正。"]
  ];
  DC.fixedStarHits = function (chartList, jd, orb) {
    orb = orb || 1.5;
    const yrs = (jd - 2451545) / 365.25, prec = yrs * 0.013969;
    const hits = [];
    for (const [name, lon0, note] of DC.STARS) {
      const slon = rev(lon0 + prec);
      for (const p of chartList) {
        const d = Math.abs(rev180(p.lon - slon));
        if (d <= orb) hits.push({ star: name, note, planet: p, orb: d, slon });
      }
    }
    hits.sort((a, b) => a.orb - b.orb);
    return hits;
  };

  /* ── 印度占星(恆星黃道)── */
  DC.ayanamsa = jd => 23.853 + 0.013969 * ((jd - 2451545) / 365.25); // Lahiri 近似
  DC.NAKS = [
    ["Ashvini 阿濕維尼", "Ketu", "迅捷、療癒、新的開端"], ["Bharani 頗羅墮", "金星", "孕育、承擔、極致"],
    ["Krittika 基栗底迦", "太陽", "鋒利、淨化、決斷"], ["Rohini 廬醯尼", "月亮", "豐饒、美感、成長"],
    ["Mrigashira 摩梨伽尸羅", "火星", "尋覓、好奇、溫柔"], ["Ardra 阿陀羅", "Rahu", "風暴、蛻變、洞徹"],
    ["Punarvasu 富那婆蘇", "木星", "回歸、復原、光明再臨"], ["Pushya 弗沙", "土星", "滋養、虔敬、最吉之宿"],
    ["Ashlesha 阿沙離沙", "水星", "纏繞、機敏、深藏"], ["Magha 摩伽", "Ketu", "王座、祖蔭、威嚴"],
    ["P.Phalguni 前頗求尼", "金星", "享樂、愛侶、創造"], ["U.Phalguni 後頗求尼", "太陽", "契約、慷慨、扶持"],
    ["Hasta 訶悉多", "月亮", "巧手、機智、掌握"], ["Chitra 質多羅", "火星", "華彩、工藝、雕琢"],
    ["Svati 私婆底", "Rahu", "獨立、如風、平衡"], ["Vishakha 毘釋珂", "木星", "目標、勝利之門"],
    ["Anuradha 阿奴羅陀", "土星", "友誼、忠誠、遠方成功"], ["Jyeshtha 折沙他", "水星", "資深、權柄、護衛"],
    ["Mula 牟藍", "Ketu", "連根拔起、追本溯源"], ["P.Ashadha 前阿沙荼", "金星", "不敗、淨化、宣言"],
    ["U.Ashadha 後阿沙荼", "太陽", "終極勝利、恆久"], ["Shravana 室羅伐", "月亮", "聆聽、學問、傳承"],
    ["Dhanishtha 但你瑟陀", "火星", "節奏、富饒、群體"], ["Shatabhisha 舍多毘沙", "Rahu", "百藥、隱士、密封"],
    ["P.Bhadrapada 前跋陀羅", "木星", "雙面、烈火、獻身"], ["U.Bhadrapada 後跋陀羅", "土星", "深海、慈悲、根基"],
    ["Revati 離婆底", "水星", "護航、圓滿、歸途"]
  ];
  DC.DASHA_SEQ = [["Ketu", 7], ["金星", 20], ["太陽", 6], ["月亮", 10], ["火星", 7], ["Rahu", 18], ["木星", 16], ["土星", 19], ["水星", 17]];
  DC.nakOf = function (sidLon) {
    const w = 360 / 27, i = Math.floor(rev(sidLon) / w);
    return { idx: i, name: DC.NAKS[i][0], lord: DC.NAKS[i][1], key: DC.NAKS[i][2], pada: Math.floor((rev(sidLon) - i * w) / (w / 4)) + 1, frac: (rev(sidLon) - i * w) / w };
  };
  DC.vimshottari = function (moonSidLon, birthJD) { // 大運時間軸
    const nak = DC.nakOf(moonSidLon);
    const startIdx = nak.idx % 9;
    const seq = DC.DASHA_SEQ;
    const firstLeft = seq[startIdx][1] * (1 - nak.frac);
    const list = []; let t = birthJD;
    list.push({ lord: seq[startIdx][0], from: t, to: t + firstLeft * 365.2425, years: seq[startIdx][1], balance: firstLeft });
    t += firstLeft * 365.2425;
    for (let k = 1; k < 9; k++) {
      const s = seq[(startIdx + k) % 9];
      list.push({ lord: s[0], from: t, to: t + s[1] * 365.2425, years: s[1] });
      t += s[1] * 365.2425;
    }
    return list;
  };
  DC.navamsaSign = sidLon => Math.floor(rev(sidLon) / (30 / 9)) % 12;

  /* ── 宿曜(二十七宿,略牛宿;以恆星月宿起算)── */
  DC.XIU27 = ["婁", "胃", "昴", "畢", "觜", "參", "井", "鬼", "柳", "星", "張", "翼", "軫", "角", "亢", "氐", "房", "心", "尾", "箕", "斗", "女", "虛", "危", "室", "壁", "奎"];
  DC.XIU_NOTE = [
    "溫和篤實,積少成多,晚年愈盛", "重情藏鋒,外柔內韌,善守成", "華美聰慧,眾星拱月,防自恃",
    "沉穩大器,厚積而發,得長者緣", "銳眼細心,善謀多藝,防多疑", "剛毅果決,武勇進取,防鋒芒傷人",
    "明朗通達,學問之宿,利文書", "內斂多思,直覺敏銳,宜修行", "柔中帶媚,人緣極佳,防情多累",
    "光華外放,自尊心強,宜居高位", "進取華麗,善交際,福祿之宿", "才藝縱橫,飄逸不群,防漂泊",
    "機敏迅捷,商才出眾,善轉圜", "領袖之宿,剛直尚義,防樹敵", "堅忍寡言,大器晚成,守則吉",
    "沉潛重義,家宅之宿,和為貴", "明辨善斷,富貴之宿,防躁進", "情深志堅,王者氣象,防孤高",
    "烈而有信,快意恩仇,宜化戾氣", "豁達出塵,遠行有利,防散漫", "度量宏大,積財之宿,守信則昌",
    "勤勉持家,細水長流,防小氣", "空靈善思,宜學宜藝,防虛耗", "膽大心細,臨危有變,防行險",
    "安穩豐厚,置產之宿,福自天來", "文墨之宿,溫雅好學,貴人多助", "端正自持,兩界之門,先難後易"
  ];
  DC.SANKU = ["命", "榮", "衰", "安", "危", "成", "壞", "友", "親"]; // 三九秘法(1命10業19胎)
  DC.xiuRelation = function (fromIdx, toIdx) {
    const dist = ((toIdx - fromIdx) % 27 + 27) % 27 + 1; // 1..27
    let rel;
    if (dist === 1) rel = "命"; else if (dist === 10) rel = "業"; else if (dist === 19) rel = "胎";
    else rel = DC.SANKU[(dist - 1) % 9];
    const ring = dist <= 9 ? "近距離" : dist <= 18 ? "中距離" : "遠距離";
    return { dist, rel, ring };
  };
  DC.YAO7 = ["日", "月", "火", "水", "木", "金", "土"];
  DC.yaoOfDate = (y, m, d) => DC.YAO7[new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0 ? 0 : [0, 1, 2, 3, 4, 5, 6][new Date(Date.UTC(y, m - 1, d)).getUTCDay()]];

  /* ═══ 干支曆法 ═══ */
  DC.STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
  DC.BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
  DC.GZ = i => DC.STEMS[i % 10] + DC.BRANCHES[i % 12];
  DC.STEM_WX = ["木", "木", "火", "火", "土", "土", "金", "金", "水", "水"];
  DC.BRANCH_WX = ["水", "土", "木", "木", "土", "火", "火", "土", "金", "金", "土", "水"];
  DC.WX = ["木", "火", "土", "金", "水"];
  DC.HIDDEN = [["癸"], ["己", "癸", "辛"], ["甲", "丙", "戊"], ["乙"], ["戊", "乙", "癸"], ["丙", "庚", "戊"], ["丁", "己"], ["己", "丁", "乙"], ["庚", "壬", "戊"], ["辛"], ["戊", "辛", "丁"], ["壬", "甲"]];
  DC.NAYIN = ["海中金", "爐中火", "大林木", "路旁土", "劍鋒金", "山頭火", "澗下水", "城頭土", "白蠟金", "楊柳木",
    "泉中水", "屋上土", "霹靂火", "松柏木", "長流水", "砂中金", "山下火", "平地木", "壁上土", "金箔金",
    "覆燈火", "天河水", "大驛土", "釵釧金", "桑柘木", "大溪水", "沙中土", "天上火", "石榴木", "大海水"];
  DC.nayin = gzIdx => DC.NAYIN[Math.floor(gzIdx / 2)];

  DC.dayGZ = function (y, m, d) { // 1949-10-01 = 甲子(已驗:2000-01-01 戊午)
    const days = Math.round((DC.utcMs(y, m, d, 0, 0, 0) - Date.UTC(1949, 9, 1)) / 86400000);
    return ((days % 60) + 60) % 60;
  };

  DC.tenGod = function (dayStem, otherStem) {
    const dw = Math.floor(dayStem / 2), ow = Math.floor(otherStem / 2);
    const rel = ((ow - dw) % 5 + 5) % 5;
    const same = (dayStem % 2) === (otherStem % 2);
    return [["比肩", "劫財"], ["食神", "傷官"], ["偏財", "正財"], ["七殺", "正官"], ["偏印", "正印"]][rel][same ? 0 : 1];
  };

  DC.bazi = function (y, m, d, h, mi, tz) { // 回傳完整四柱
    let Y = y, M = m, D = d;
    if (h >= 23) { // 夜子時起翌日日柱(子平慣例)
      const nd = new Date(Date.UTC(y, m - 1, d + 1)); Y = nd.getUTCFullYear(); M = nd.getUTCMonth() + 1; D = nd.getUTCDate();
    }
    const jdB = DC.jd(y, m, d, h, mi, tz);
    const lam = DC.sunLon(jdB);
    const lichun = DC.solarTerm(y, 315);
    const yr = jdB >= lichun ? y : y - 1;
    const yS = ((yr - 4) % 10 + 10) % 10, yB = ((yr - 4) % 12 + 12) % 12;
    const mIdx = Math.floor(rev(lam - 315) / 30); // 0=寅月
    const mB = (mIdx + 2) % 12, mS = ((yS % 5) * 2 + 2 + mIdx) % 10;
    const dIdx = DC.dayGZ(Y, M, D), dS = dIdx % 10, dB = dIdx % 12;
    const hB = Math.floor(((h % 24) + 1) / 2) % 12;
    const hS = ((dS % 5) * 2 + hB) % 10;
    const yIdx = ((yr - 4) % 60 + 60) % 60;
    const mGZi = (() => { for (let i = 0; i < 60; i++) if (i % 10 === mS && i % 12 === mB) return i; })();
    const hGZi = (() => { for (let i = 0; i < 60; i++) if (i % 10 === hS && i % 12 === hB) return i; })();
    // 空亡(日旬)
    const xun = Math.floor(dIdx / 10);
    const kong = [(10 - 2 * xun + 12) % 12, (11 - 2 * xun + 12) % 12];
    return {
      jd: jdB, sunLon: lam, year: yr,
      pillars: [
        { tag: "年柱", s: yS, b: yB, gz: DC.GZ(yIdx), ny: DC.nayin(yIdx) },
        { tag: "月柱", s: mS, b: mB, gz: DC.GZ(mGZi), ny: DC.nayin(mGZi) },
        { tag: "日柱", s: dS, b: dB, gz: DC.GZ(dIdx), ny: DC.nayin(dIdx) },
        { tag: "時柱", s: hS, b: hB, gz: DC.GZ(hGZi), ny: DC.nayin(hGZi) }
      ],
      dIdx, mIdx, hB, kong: kong.map(b => DC.BRANCHES[b])
    };
  };

  DC.dayun = function (bz, male) { // 大運:陽年男/陰年女順排
    const yangYear = bz.pillars[0].s % 2 === 0;
    const fwd = (yangYear && male) || (!yangYear && !male);
    const curJieLon = rev(315 + 30 * bz.mIdx), nextJieLon = rev(315 + 30 * (bz.mIdx + 1));
    let gapDays;
    if (fwd) gapDays = DC.sunCross(nextJieLon, bz.jd - 1) - bz.jd;
    else gapDays = bz.jd - DC.sunCross(curJieLon, bz.jd - 40);
    const startAge = gapDays / 3; // 三日一年
    const mS = bz.pillars[1].s, mB = bz.pillars[1].b;
    let mGZi = 0; for (let i = 0; i < 60; i++) if (i % 10 === mS && i % 12 === mB) { mGZi = i; break; }
    const list = [];
    for (let k = 1; k <= 8; k++) {
      const idx = ((mGZi + (fwd ? k : -k)) % 60 + 60) % 60;
      list.push({ gz: DC.GZ(idx), s: idx % 10, b: idx % 12, fromAge: startAge + (k - 1) * 10 });
    }
    return { fwd, startAge, list };
  };

  DC.shensha = function (bz) { // 常用神煞
    const dS = bz.pillars[2].s, dB = bz.pillars[2].b, yB = bz.pillars[0].b;
    const bAll = bz.pillars.map(p => p.b);
    const out = [];
    const tianyi = [[1, 7], [0, 8], [11, 9], [11, 9], [1, 7], [0, 8], [1, 7], [6, 2], [3, 5], [3, 5]][dS];
    const hitT = bAll.filter(b => tianyi.includes(b));
    if (hitT.length) out.push("天乙貴人(" + hitT.map(b => DC.BRANCHES[b]).join("") + ")——一生逢凶化吉的貴人星");
    const peachOf = b => [9, 6, 3, 0][b % 4]; // 申子辰→酉 寅午戌→卯 巳酉丑→午 亥卯未→子
    if (bAll.some(b => b === peachOf(yB) || b === peachOf(dB))) out.push("桃花——人緣與異性緣旺,魅力外放");
    const maOf = b => [2, 11, 8, 5][b % 4];
    if (bAll.some(b => b === maOf(yB) || b === maOf(dB))) out.push("驛馬——奔波走動、遷移旅行、變動中得利");
    const wenchang = [5, 6, 8, 9, 8, 9, 11, 0, 2, 3][dS];
    if (bAll.includes(wenchang)) out.push("文昌貴人(" + DC.BRANCHES[wenchang] + ")——聰明好學,利考試文書");
    const yang = [3, 2, 6, 5, 6, 5, 9, 8, 0, 11][dS]; // 羊刃(陽干為刃)
    if (dS % 2 === 0 && bAll.includes(yang)) out.push("羊刃——剛烈果決,有魄力也易衝動");
    return out;
  };

  /* ── 農曆(定朔+冬至定月,含閏月)── */
  DC.lunar = function (y, m, d, tz) {
    tz = tz == null ? 8 : tz;
    const myLdn = ldn(DC.jd(y, m, d, 12, 0, tz), tz);
    const wsThis = DC.solarTerm(y, 270);
    let ws1, ws2;
    if (myLdn >= ldn(DC.newMoonBefore(wsThis), tz)) { ws1 = wsThis; ws2 = DC.solarTerm(y + 1, 270); }
    else { ws1 = DC.solarTerm(y - 1, 270); ws2 = wsThis; }
    // 月序:自含冬至之月(十一月)起
    const moons = [DC.newMoonBefore(ws1)];
    while (true) {
      const nx = DC.newMoonAfter(moons[moons.length - 1] + 1);
      moons.push(nx);
      if (ldn(nx, tz) > ldn(ws2, tz)) break;
    }
    const mStarts = moons.map(t => ldn(t, tz));
    const ws2d = ldn(ws2, tz);
    let lastIdx = 0; // 下一歲的冬至月朔索引
    for (let i = 0; i < mStarts.length; i++) if (mStarts[i] <= ws2d) lastIdx = i;
    const leapSui = lastIdx === 13; // 兩冬至月朔之間有 13 個朔望月→閏歲
    const hasZhong = i => { // 該月是否含中氣(黃經 270+30k)
      for (let k = 0; k < 13; k++) {
        const lonT = rev(270 + 30 * k);
        const yGuess = DC.jdToDate(moons[i], tz).getUTCFullYear();
        for (const yy of [yGuess - 1, yGuess, yGuess + 1]) {
          const t = DC.solarTerm(yy, lonT);
          if (t && ldn(t, tz) >= mStarts[i] && ldn(t, tz) < mStarts[i + 1]) return true;
        }
      }
      return false;
    };
    let num = 11, leapUsed = false;
    const months = [];
    for (let i = 0; i < mStarts.length - 1; i++) {
      let isLeap = false;
      if (i > 0) {
        if (leapSui && !leapUsed && !hasZhong(i)) { isLeap = true; leapUsed = true; }
        else num = num % 12 + 1;
      }
      months.push({ start: mStarts[i], end: mStarts[i + 1], num, isLeap });
    }
    for (const mo of months) {
      if (myLdn >= mo.start && myLdn < mo.end)
        return { month: mo.num, day: myLdn - mo.start + 1, isLeap: mo.isLeap };
    }
    return null;
  };
  DC.newMoonBefore = function (jd) {
    let t = DC.newMoonAfter(jd - 35);
    while (true) { const nx = DC.newMoonAfter(t + 1); if (nx > jd) break; t = nx; }
    return t;
  };
  DC.lunarYearGZ = function (y, m, lun) { // 農曆歸年(正月初一換歲)之年干支;lun 為 DC.lunar 結果
    const ly = (m <= 2 && lun.month >= 11) ? y - 1 : y;
    const idx = ((ly - 4) % 60 + 60) % 60;
    return { year: ly, idx, s: idx % 10, b: idx % 12, gz: DC.GZ(idx) };
  };
  DC.CN_MONTH = ["正", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];
  DC.CN_DAY = (() => { const a = []; const d1 = ["初", "十", "廿", "三"]; const d2 = "一二三四五六七八九十";
    for (let i = 1; i <= 30; i++) { if (i === 10) a.push("初十"); else if (i === 20) a.push("二十"); else if (i === 30) a.push("三十"); else a.push(d1[Math.floor((i - 1) / 10)] + d2[(i - 1) % 10]); } return a; })();

  /* ═══ 易 ═══ */
  DC.TRIG = ["乾", "兌", "離", "震", "巽", "坎", "艮", "坤"]; // 先天卦序 1..8
  DC.TRIG_SYM = ["☰", "☱", "☲", "☳", "☴", "☵", "☶", "☷"];
  DC.TRIG_WX = ["金", "金", "火", "木", "木", "水", "土", "土"];
  DC.TRIG_LINES = [[1, 1, 1], [1, 1, 0], [1, 0, 1], [1, 0, 0], [0, 1, 1], [0, 1, 0], [0, 0, 1], [0, 0, 0]]; // 下起
  DC.HEX_NAME = [ // [上卦][下卦]
    ["乾為天", "天澤履", "天火同人", "天雷無妄", "天風姤", "天水訟", "天山遯", "天地否"],
    ["澤天夬", "兌為澤", "澤火革", "澤雷隨", "澤風大過", "澤水困", "澤山咸", "澤地萃"],
    ["火天大有", "火澤睽", "離為火", "火雷噬嗑", "火風鼎", "火水未濟", "火山旅", "火地晉"],
    ["雷天大壯", "雷澤歸妹", "雷火豐", "震為雷", "雷風恆", "雷水解", "雷山小過", "雷地豫"],
    ["風天小畜", "風澤中孚", "風火家人", "風雷益", "巽為風", "風水渙", "風山漸", "風地觀"],
    ["水天需", "水澤節", "水火既濟", "水雷屯", "水風井", "坎為水", "水山蹇", "水地比"],
    ["山天大畜", "山澤損", "山火賁", "山雷頤", "山風蠱", "艮為山", "山水蒙", "山地剝"],
    ["地天泰", "地澤臨", "地火明夷", "地雷復", "地風升", "地水師", "地山謙", "坤為地"]
  ];
  DC.meihua = function (uNum, lNum, movNum) { // 上卦數/下卦數/動爻數(古法:餘0作8、作6)
    const u = ((uNum - 1) % 8 + 8) % 8, l = ((lNum - 1) % 8 + 8) % 8;
    let mov = movNum % 6; if (mov === 0) mov = 6; // 1..6 自下而上
    const linesL = DC.TRIG_LINES[l].slice(), linesU = DC.TRIG_LINES[u].slice();
    const lines = linesL.concat(linesU);
    const lines2 = lines.slice(); lines2[mov - 1] = 1 - lines2[mov - 1];
    const trigOf = ls => DC.TRIG_LINES.findIndex(t => t[0] === ls[0] && t[1] === ls[1] && t[2] === ls[2]);
    const l2 = trigOf(lines2.slice(0, 3)), u2 = trigOf(lines2.slice(3, 6));
    const hu = { l: trigOf([lines[1], lines[2], lines[3]]), u: trigOf([lines[2], lines[3], lines[4]]) };
    const tiIsLower = mov > 3; // 動爻在上卦→上為用,下為體
    const ti = tiIsLower ? l : u, yong = tiIsLower ? u : l;
    const sheng = (a, b) => (DC.WX.indexOf(DC.TRIG_WX[b]) - DC.WX.indexOf(DC.TRIG_WX[a]) + 5) % 5; // a→b 關係
    const relCode = sheng(yong, ti); // 用對體:0比和 1用生? 注意方向
    let rel;
    const tw = DC.TRIG_WX[ti], yw = DC.TRIG_WX[yong];
    const idx = w => DC.WX.indexOf(w);
    if (tw === yw) rel = "體用比和,和氣相扶,事多順遂";
    else if ((idx(yw) + 1) % 5 === idx(tw)) rel = "用生體,得外力相助,吉";
    else if ((idx(tw) + 1) % 5 === idx(yw)) rel = "體生用,我方付出耗洩,先勞後獲";
    else if ((idx(yw) + 2) % 5 === idx(tw)) rel = "用剋體,外境相迫,凶,宜避其鋒";
    else rel = "體剋用,我能制事,先難後易,終可成";
    return {
      upper: u, lower: l, name: DC.HEX_NAME[u][l],
      hu: { upper: hu.u, lower: hu.l, name: DC.HEX_NAME[hu.u][hu.l] },
      bian: { upper: u2, lower: l2, name: DC.HEX_NAME[u2][l2] },
      mov, lines, ti, yong, tiIsLower, rel
    };
  };

  /* ═══ 生命靈數 ═══ */
  const digitsOf = s => String(s).split("").map(Number).filter(n => !isNaN(n));
  DC.numReduce = function (n, keepMaster) {
    while (n > 9) {
      if (keepMaster && (n === 11 || n === 22 || n === 33)) return n;
      n = digitsOf(n).reduce((a, b) => a + b, 0);
    }
    return n;
  };
  DC.lifeNumbers = function (y, m, d, nowY, nowM, nowD) {
    const all = digitsOf(y).concat(digitsOf(m), digitsOf(d));
    const total = all.reduce((a, b) => a + b, 0);
    const lp = DC.numReduce(total, true);
    const ry = DC.numReduce(digitsOf(y).reduce((a, b) => a + b, 0), false);
    const rm = DC.numReduce(m, false), rd0 = DC.numReduce(d, false);
    const birthday = DC.numReduce(d, true);
    const attitude = DC.numReduce(rm + rd0, false);
    const c1 = Math.abs(rm - rd0), c2 = Math.abs(rd0 - ry), c3 = Math.abs(c1 - c2), c4 = Math.abs(rm - ry);
    const p1 = DC.numReduce(rm + rd0, true), p2 = DC.numReduce(rd0 + ry, true),
      p3 = DC.numReduce(p1 + p2, true), p4 = DC.numReduce(rm + ry, true); // 巔峰數遇 11/22/33 保留大師數(與生命數/生日數一致)
    const lpS = DC.numReduce(lp, false);
    const a1 = 36 - lpS;
    const py = DC.numReduce(rm + rd0 + DC.numReduce(digitsOf(nowY).reduce((a, b) => a + b, 0), false), false);
    const pm = DC.numReduce(py + nowM, false);
    const pd = DC.numReduce(pm + nowD, false);
    const grid = {}; for (let i = 1; i <= 9; i++) grid[i] = 0;
    for (const n of all) if (n > 0) grid[n]++;
    const LINES = [["123", "藝術線", "美感、表達與品味"], ["456", "組織線", "秩序、執行與管理"], ["789", "權力線", "影響力、企圖與擔當"],
      ["147", "務實線", "腳踏實地、積累成業"], ["258", "情感線", "同理、連結與人和"], ["369", "智慧線", "思辨、公益與遠見"],
      ["159", "事業線", "意志貫徹、勇往直前"], ["357", "人緣線", "表達魅力、廣結善緣"]];
    const lines = LINES.filter(([ln]) => ln.split("").every(ch => grid[+ch] > 0)).map(([ln, name, note]) => ({ ln, name, note }));
    const missing = Object.keys(grid).filter(k => grid[k] === 0).map(Number);
    return { total, lp, birthday, attitude, talent: total, challenges: [c1, c2, c3, c4], pinnacles: [{ n: p1, from: 0, to: a1 }, { n: p2, from: a1 + 1, to: a1 + 9 }, { n: p3, from: a1 + 10, to: a1 + 18 }, { n: p4, from: a1 + 19, to: 999 }], py, pm, pd, grid, lines, missing };
  };
  DC.NUM_CORE = {
    1: { t: "開創者", key: "獨立・領導・原創", light: "有開路的膽識與行動力,適合站在最前面", shadow: "固執己見、孤軍奮戰", love: "主動直接,需要被崇拜也要學會傾聽", money: "敢衝敢賺,開創型財富,忌躁進豪賭", work: "適合創業、領導、開疆闢土的角色", study: "自學力強,興趣導向,坐不住填鴨式教學" },
    2: { t: "協調者", key: "合作・感應・陪伴", light: "溫柔細膩,天生的外交官與傾聽者", shadow: "依賴、猶豫、過度敏感", love: "重視陪伴與默契,容易為愛委屈自己", money: "合夥聚財,細水長流,忌情緒化消費", work: "適合輔佐、公關、協調與幕僚工作", study: "同儕共學效果佳,需要溫暖的學習環境" },
    3: { t: "表達者", key: "創意・語言・歡樂", light: "點子多、口才好,走到哪裡亮到哪裡", shadow: "三分鐘熱度、情緒起伏大", love: "浪漫愛玩,需要新鮮感與掌聲", money: "以才華與名氣生財,忌揮霍", work: "適合創作、行銷、演藝、教學", study: "圖像與故事記憶佳,怕枯燥重複" },
    4: { t: "築基者", key: "穩定・制度・安全感", light: "踏實可靠,一磚一瓦築起長城", shadow: "僵化、過度防衛、怕改變", love: "慢熱長情,以行動代替甜言蜜語", money: "儲蓄置產型,積少成多,忌過度保守錯失良機", work: "適合工程、財務、制度建立與品管", study: "按部就班,筆記與系統化整理是利器" },
    5: { t: "自由者", key: "冒險・變化・五感", light: "適應力極強,在變動中如魚得水", shadow: "浮動、承諾困難、感官沉溺", love: "愛自由也愛刺激,綁不住、卻可以並肩飛", money: "財來財去,多元收入,忌衝動投機", work: "適合業務、旅行、媒體、自由業", study: "體驗式學習,邊玩邊學效率最高" },
    6: { t: "照顧者", key: "責任・愛・療癒", light: "溫暖有肩膀,家庭與團隊的支柱", shadow: "過度承擔、控制式的愛", love: "願意付出一切,也要學會讓對方長大", money: "為家人聚財,穩健理財,忌爛好人借貸", work: "適合醫療、教育、服務、美的行業", study: "有使命感就讀得下去,為所愛之人而學" },
    7: { t: "探尋者", key: "分析・真理・直覺", light: "打破砂鍋問到底,思想深刻有靈性", shadow: "多疑、疏離、鑽牛角尖", love: "需要精神共鳴,慢熟而深刻", money: "以專業與智慧生財,忌過度分析錯失時機", work: "適合研究、技術、玄學、顧問", study: "天生的學者,獨處深讀勝過群體討論" },
    8: { t: "掌權者", key: "權力・財富・因果", light: "格局大、執行強,天生的經營者", shadow: "控制慾、以成敗論英雄", love: "強勢護短,以給予資源表達愛", money: "大進大出,經營槓桿有天分,忌貪", work: "適合企業經營、金融、政治、不動產", study: "目標導向,證照與實利驅動學習" },
    9: { t: "圓夢者", key: "博愛・想像・完成", light: "同理心與想像力豐沛,為眾人而燃燒", shadow: "濫情、逃避現實、曲終人散的失落", love: "浪漫如詩,愛的是「愛」本身,需落地", money: "財富與福報相連,施比受更能招財", work: "適合公益、藝術、宗教、國際事務", study: "融會貫通型,學什麼像什麼" },
    11: { t: "靈感大師(卓越數)", key: "直覺・啟發・光", light: "2 的敏感加上 1 的開創,能照亮他人", shadow: "神經緊繃、理想與現實拉扯", love: "追求靈魂伴侶,需要被深深理解", money: "以啟發他人生財,忌好高騖遠", work: "適合心靈導師、設計、傳播", study: "靈光乍現型,需學會落實步驟" },
    22: { t: "築夢大師(卓越數)", key: "宏圖・實現・基業", light: "4 的穩固乘以大格局,能把夢想蓋成大樓", shadow: "壓力山大、完美主義", love: "承諾極重,愛得深沉而長久", money: "能聚大財成大業,忌事必躬親", work: "適合大型組織、建設、跨國事業", study: "理論與實務並重,大器晚成" },
    33: { t: "奉獻大師(卓越數)", key: "大愛・療癒・犧牲", light: "6 的愛擴及眾生,是人間的暖爐", shadow: "背負他人業力、忘了自己", love: "母性/父性之愛,記得先愛自己", money: "財從善來,取之社會用之社會", work: "適合醫護、宗教、身心靈、慈善", study: "為助人而學,學了就想教人" }
  };

  /* ═══ 紫微斗數 ═══ */
  DC.ZW_PALACES = ["命宮", "兄弟", "夫妻", "子女", "財帛", "疾厄", "遷移", "交友", "官祿", "田宅", "福德", "父母"];
  DC.ziwei = function (lm, ld, hb, yS, yB, male) {
    const P = Array.from({ length: 12 }, (_, b) => ({ branch: b, stars: [], good: [], bad: [], hua: [] }));
    const ming = ((2 + (lm - 1) - hb) % 12 + 12) % 12;
    const shen = ((2 + (lm - 1) + hb) % 12 + 12) % 12;
    // 宮干(五虎遁)
    const firstStem = (yS % 5) * 2 + 2;
    for (let b = 0; b < 12; b++) {
      const off = (b - 2 + 12) % 12;
      P[b].stem = (firstStem + off) % 10;
    }
    // 五行局:命宮干支納音
    let mingGZi = 0; for (let i = 0; i < 60; i++) if (i % 10 === P[ming].stem && i % 12 === ming) { mingGZi = i; break; }
    const ny = DC.nayin(mingGZi);
    const ju = ny.includes("水") ? 2 : ny.includes("木") ? 3 : ny.includes("金") ? 4 : ny.includes("土") ? 5 : 6;
    const juName = ["", "", "水二局", "木三局", "金四局", "土五局", "火六局"][ju];
    // 紫微落宮
    const q = Math.ceil(ld / ju), r = q * ju - ld;
    let zw = (r % 2 === 0) ? (2 + (q - 1) + r) : (2 + (q - 1) - r);
    zw = ((zw) % 12 + 12) % 12;
    const put = (b, name, arr) => P[((b) % 12 + 12) % 12][arr || "stars"].push(name);
    put(zw, "紫微"); put(zw - 1, "天機"); put(zw - 3, "太陽"); put(zw - 4, "武曲"); put(zw - 5, "天同"); put(zw - 8, "廉貞");
    const fu = (4 - zw + 12) % 12;
    put(fu, "天府"); put(fu + 1, "太陰"); put(fu + 2, "貪狼"); put(fu + 3, "巨門"); put(fu + 4, "天相"); put(fu + 5, "天梁"); put(fu + 6, "七殺"); put(fu + 10, "破軍");
    // 六吉六煞
    put((10 - hb + 12) % 12, "文昌", "good"); put((4 + hb) % 12, "文曲", "good");
    put((4 + (lm - 1)) % 12, "左輔", "good"); put((10 - (lm - 1) + 12) % 12, "右弼", "good");
    const kuiyue = [[1, 7], [0, 8], [11, 9], [11, 9], [1, 7], [0, 8], [1, 7], [6, 2], [3, 5], [3, 5]][yS];
    put(kuiyue[0], "天魁", "good"); put(kuiyue[1], "天鉞", "good");
    const lucun = [2, 3, 5, 6, 5, 6, 8, 9, 11, 0][yS];
    put(lucun, "祿存", "good"); put(lucun + 1, "擎羊", "bad"); put(lucun - 1 + 12, "陀羅", "bad");
    const fireBase = [2, 3, 1, 9][yB % 4], bellBase = [10, 10, 3, 10][yB % 4]; // 申子辰/巳酉丑/寅午戌/亥卯未
    const grp = [0, 1, 2, 3][yB % 4];
    const fb = [[2, 10], [3, 10], [1, 3], [9, 10]][grp]; // [火起,鈴起]
    put((fb[0] + hb) % 12, "火星", "bad"); put((fb[1] + hb) % 12, "鈴星", "bad");
    put((11 - hb + 12) % 12, "地空", "bad"); put((11 + hb) % 12, "地劫", "bad");
    put([2, 11, 8, 5][yB % 4], "天馬", "good");
    // 四化
    const HUA = [["廉貞", "破軍", "武曲", "太陽"], ["天機", "天梁", "紫微", "太陰"], ["天同", "天機", "文昌", "廉貞"],
      ["太陰", "天同", "天機", "巨門"], ["貪狼", "太陰", "右弼", "天機"], ["武曲", "貪狼", "天梁", "文曲"],
      ["太陽", "武曲", "太陰", "天同"], ["巨門", "太陽", "文曲", "文昌"], ["天梁", "紫微", "左輔", "武曲"],
      ["破軍", "巨門", "太陰", "貪狼"]][yS];
    const HUA_T = ["化祿", "化權", "化科", "化忌"];
    for (let b = 0; b < 12; b++)
      for (const arr of ["stars", "good"])
        for (const st of P[b][arr]) {
          const hi = HUA.indexOf(st);
          if (hi >= 0) P[b].hua.push(st + HUA_T[hi]);
        }
    // 宮名(逆佈)與大限
    const yangYear = yS % 2 === 0, fwd = (yangYear && male) || (!yangYear && !male);
    for (let k = 0; k < 12; k++) {
      const b = ((ming - k) % 12 + 12) % 12;
      P[b].palace = DC.ZW_PALACES[k];
      P[((ming + (fwd ? k : -k)) % 12 + 12) % 12].daxian = (ju + k * 10) + "-" + (ju + k * 10 + 9);
    }
    P[shen].isShen = true;
    return { P, ming, shen, ju, juName, zw, fu };
  };

  /* ═══ 九星氣學 ═══ */
  DC.NSTAR = ["", "一白水星", "二黑土星", "三碧木星", "四綠木星", "五黃土星", "六白金星", "七赤金星", "八白土星", "九紫火星"];
  DC.NSTAR_WX = ["", "水", "土", "木", "木", "土", "金", "金", "土", "火"];
  DC.nineStarYear = function (effYear) { let n = (11 - (effYear % 9)) % 9; return n === 0 ? 9 : n; };
  DC.nineStarFemale = function (effYear) { let n = ((effYear % 9) + 4) % 9; return n === 0 ? 9 : n; };
  DC.nineStarMonth = function (honmei, mIdx) { // mIdx: 0=寅月
    const start = [8, 2, 5][(honmei - 1) % 3];
    let n = ((start - mIdx) % 9 + 9) % 9; return n === 0 ? 9 : n;
  };

  /* ═══ 奇門遁甲(時家轉盤,拆補定元)═══ */
  DC.qimen = function (y, m, d, h, mi, tz) {
    const bz = DC.bazi(y, m, d, h, mi, tz);
    const lam = bz.sunLon;
    const termIdx = Math.floor(rev(lam - 270) / 15);
    const yang = termIdx < 12;
    const JU = [[1, 7, 4], [2, 8, 5], [3, 9, 6], [8, 5, 2], [9, 6, 3], [1, 7, 4], [3, 9, 6], [4, 1, 7], [5, 2, 8], [4, 1, 7], [5, 2, 8], [6, 3, 9],
      [9, 3, 6], [8, 2, 5], [7, 1, 4], [2, 5, 8], [1, 4, 7], [9, 3, 6], [7, 1, 4], [6, 9, 3], [5, 8, 2], [6, 9, 3], [5, 8, 2], [4, 7, 1]];
    const yuan = Math.floor((bz.dIdx % 15) / 5); // 0上1中2下
    const ju = JU[termIdx][yuan];
    // 地盤
    const SEQ = ["戊", "己", "庚", "辛", "壬", "癸", "丁", "丙", "乙"];
    const dipan = {};
    for (let i = 0; i < 9; i++) {
      const p = yang ? ((ju - 1 + i) % 9) + 1 : ((ju - 1 - i) % 9 + 9) % 9 + 1;
      dipan[p] = SEQ[i];
    }
    // 時干支
    const hS = bz.pillars[3].s, hB = bz.pillars[3].b;
    let hIdx = 0; for (let i = 0; i < 60; i++) if (i % 10 === hS && i % 12 === hB) { hIdx = i; break; }
    const xun = Math.floor(hIdx / 10);
    const yiChar = ["戊", "己", "庚", "辛", "壬", "癸"][xun];
    const xunName = "甲" + DC.BRANCHES[(12 - 2 * xun) % 12] + yiChar;
    const palaceOf = ch => { for (let p = 1; p <= 9; p++) if (dipan[p] === ch) return p; return 5; };
    const STAR = ["", "天蓬", "天芮", "天沖", "天輔", "天禽", "天心", "天柱", "天任", "天英"];
    const DOOR = ["", "休門", "死門", "傷門", "杜門", "", "開門", "驚門", "生門", "景門"];
    let fuGong = palaceOf(yiChar); // 直符宮(地盤)
    const fuStar = STAR[fuGong], fuDoor = fuGong === 5 ? DOOR[2] : DOOR[fuGong];
    const tgChar = hS === 0 ? yiChar : DC.STEMS[hS];
    let tp = palaceOf(tgChar); if (tp === 5) tp = 2;
    let fg = fuGong === 5 ? 2 : fuGong;
    // 天盤(轉盤):星與其攜帶之地盤干隨直符轉
    const RING = [1, 8, 3, 4, 9, 2, 7, 6];
    const ri = p => RING.indexOf(p === 5 ? 2 : p);
    const shift = ((ri(tp) - ri(fg)) % 8 + 8) % 8;
    const tianpan = {};
    for (let i = 0; i < 8; i++) {
      const from = RING[i], to = RING[(i + shift) % 8];
      let star = STAR[from], stem = dipan[from];
      if (from === 2) { star = "天芮禽"; stem = dipan[2] + dipan[5]; }
      tianpan[to] = { star, stem };
    }
    // 直使門落宮
    const xb = (12 - 2 * xun) % 12;
    const elapsed = ((hB - xb) % 12 + 12) % 12;
    let shiGong = yang ? ((fuGong - 1 + elapsed) % 9) + 1 : ((fuGong - 1 - elapsed) % 9 + 9) % 9 + 1;
    if (shiGong === 5) shiGong = 2;
    const doors = {};
    const shiftD = ((ri(shiGong) - ri(fg)) % 8 + 8) % 8;
    for (let i = 0; i < 8; i++) {
      const from = RING[i], to = RING[(i + shiftD) % 8];
      doors[to] = fuGong === 5 && from === 2 ? DOOR[2] : DOOR[from];
    }
    // 八神
    const GODS = ["值符", "螣蛇", "太陰", "六合", "白虎", "玄武", "九地", "九天"];
    const gods = {};
    for (let i = 0; i < 8; i++) {
      const p = RING[(ri(tp) + (yang ? i : -i) % 8 + 8) % 8];
      gods[p] = GODS[i];
    }
    const dayStemChar = DC.STEMS[bz.pillars[2].s];
    const dayChar = bz.pillars[2].s === 0 ? ["戊", "己", "庚", "辛", "壬", "癸"][Math.floor(bz.dIdx / 10)] : dayStemChar;
    let dayGongDi = palaceOf(dayChar); if (dayGongDi === 5) dayGongDi = 2;
    let dayGongTian = 0;
    for (let p = 1; p <= 9; p++) if (p !== 5 && tianpan[p] && tianpan[p].stem.includes(dayChar)) { dayGongTian = p; break; }
    return {
      bz, yang, ju, yuan, termIdx, term: DC.TERMS[termIdx], xunName,
      juName: (yang ? "陽遁" : "陰遁") + "一二三四五六七八九"[ju - 1] + "局(" + ["上", "中", "下"][yuan] + "元)",
      dipan, tianpan, doors, gods, fuGong, fuStar, fuDoor, shiGong, tp, dayChar, dayGongDi, dayGongTian
    };
  };
  DC.GONG_NAME = ["", "坎一宮(北)", "坤二宮(西南)", "震三宮(東)", "巽四宮(東南)", "中五宮", "乾六宮(西北)", "兌七宮(西)", "艮八宮(東北)", "離九宮(南)"];

  /* ═══ 大六壬 ═══ */
  DC.liuren = function (dayIdx, hb, sunLonNow) {
    const dS = dayIdx % 10, dB = dayIdx % 12;
    const signIdx = Math.floor(rev(sunLonNow) / 30);
    const jiang = (10 - signIdx + 12) % 12; // 月將
    const o = ((jiang - hb) % 12 + 12) % 12;
    const up = b => (b + o) % 12;
    const JI = [2, 4, 5, 7, 5, 7, 8, 10, 11, 1]; // 日干寄宮
    const ji = JI[dS];
    const k1 = { low: -1, lowS: dS, upB: up(ji) };          // 干上
    const k2 = { low: k1.upB, upB: up(k1.upB) };
    const k3 = { low: dB, upB: up(dB) };
    const k4 = { low: k3.upB, upB: up(k3.upB) };
    const lessons = [k1, k2, k3, k4];
    const wxS = s => DC.WX.indexOf(DC.STEM_WX[s]);
    const wxB = b => DC.WX.indexOf(DC.BRANCH_WX[b]);
    const kills = (a, b) => (a + 2) % 5 === b;
    const stemYang = dS % 2 === 0;
    const dayWx = wxS(dS);
    let chuan = null, keti = "";
    const lowWx = (les, i) => i === 0 ? wxS(dS) : wxB(les.low);
    // 賊剋:下賊上(下剋上)/上剋下
    const zeiList = [], keList = [];
    lessons.forEach((les, i) => {
      const lw = lowWx(les, i), uw = wxB(les.upB);
      if (kills(lw, uw)) zeiList.push(les.upB);
      else if (kills(uw, lw)) keList.push(les.upB);
    });
    const uniq = a => [...new Set(a)];
    const pickBi = arr => {
      const f = arr.filter(b => (b % 2 === 0) === stemYang);
      return f.length ? f : arr;
    };
    const JG = { 2: [0], 4: [1], 5: [2, 4], 7: [3, 5], 8: [6], 10: [7], 11: [8], 1: [9] }; // 十干寄宮(子午卯酉無寄干)
    const dipos = b => ((b - o) % 12 + 12) % 12;
    const pickShe = (arr, isZei) => { // 涉害正法(《大全·課經》):自所乘地盤歷歸本家(含起點不含本家),計地支本氣+寄宮干之剋,深者發用
      const depth = X => {
        const xw = wxB(X); let n = 0;
        const P = dipos(X), steps = ((X - P) % 12 + 12) % 12;
        for (let k = 0; k < steps; k++) {
          const pos = (P + k) % 12;
          const elems = [wxB(pos)].concat((JG[pos] || []).map(s => wxS(s)));
          for (const e of elems) if (isZei ? kills(e, xw) : kills(xw, e)) n++; // 下賊上數受剋,上剋下數所剋
        }
        return n;
      };
      const ds = arr.map(depth), mx = Math.max.apply(null, ds);
      const deep = arr.filter((b, i) => ds[i] === mx);
      if (deep.length === 1) return { b: deep[0], tag: "涉害課" };
      const meng = [2, 8, 5, 11], zhong = [0, 6, 3, 9]; // 俱深俱淺:先臨孟(見機)、次臨仲(察微)、復等剛日干上柔日支上(綴瑕)
      let f = deep.filter(b => meng.includes(dipos(b)));
      if (f.length === 1) return { b: f[0], tag: "涉害課(見機)" };
      f = deep.filter(b => zhong.includes(dipos(b)));
      if (f.length === 1) return { b: f[0], tag: "涉害課(察微)" };
      return { b: stemYang ? k1.upB : k3.upB, tag: "涉害課(綴瑕)" };
    };
    const fuyin = o === 0, fanyin = o === 6;
    let first = null;
    const zu = uniq(zeiList), ku = uniq(keList);
    if (zu.length === 1) { first = zu[0]; keti = "重審課(下賊上)"; }
    else if (zu.length > 1) { const b = pickBi(zu); if (b.length === 1) { first = b[0]; keti = "知一課(比用)"; } else { const r = pickShe(b, true); first = r.b; keti = r.tag; } }
    else if (ku.length === 1) { first = ku[0]; keti = "元首課(上剋下)"; }
    else if (ku.length > 1) { const b = pickBi(ku); if (b.length === 1) { first = b[0]; keti = "知一課(比用)"; } else { const r = pickShe(b, false); first = r.b; keti = r.tag; } }
    if (first == null && !fuyin && !fanyin) {
      // 遙剋
      const yaoKe = [k2, k3, k4].map(l => l.upB).filter(b => kills(wxB(b), dayWx));
      const yaoBei = [k2, k3, k4].map(l => l.upB).filter(b => kills(dayWx, wxB(b)));
      if (yaoKe.length) { const b = pickBi(uniq(yaoKe)); first = b[0]; keti = "遙剋課(蒿矢)"; }
      else if (yaoBei.length) { const b = pickBi(uniq(yaoBei)); first = b[0]; keti = "遙剋課(彈射)"; }
    }
    let mid = null, last = null;
    if (first == null && !fuyin && !fanyin) {
      const distinct = uniq(lessons.map(l => l.upB * 16 + (l.low === -1 ? ji : l.low))); // 課同以「上神+所臨地盤位」判(干課以寄宮位比對)
      if (distinct.length === 4) { // 昴星
        if (stemYang) { first = up(9); mid = k3.upB; last = k1.upB; keti = "昴星課(虎視)"; }
        else { first = ((9 - o) % 12 + 12) % 12; mid = k1.upB; last = k3.upB; keti = "昴星課(冬蛇掩目)"; }
      } else { // 別責/八專(簡法)
        if (ji === dB) { // 八專
          if (stemYang) first = (k1.upB + 2) % 12; else first = ((k4.upB - 2) % 12 + 12) % 12;
          mid = k1.upB; last = k1.upB; keti = "八專課(簡法)";
        } else { // 別責:剛日取干合之干寄宮上神;柔日取支前三合(三合順次位)之天盤字。中末俱干上神
          if (stemYang) { const heStem = (dS + 5) % 10; first = up(JI[heStem]); }
          else first = (dB + 4) % 12;
          mid = k1.upB; last = k1.upB; keti = "別責課";
        }
      }
    }
    const XING3 = { 0: 3, 3: 0, 1: 10, 10: 7, 7: 1, 2: 5, 5: 8, 8: 2 }; // 三刑(辰午酉亥自刑不在表)
    const selfXing = b => XING3[b] == null;
    if (fuyin && first == null) {
      first = stemYang ? k1.upB : k3.upB; // 陽日自任取干上,陰日自信取支上
      keti = stemYang ? "伏吟課(自任)" : "伏吟課(自信)";
    }
    if (fanyin && first == null) {
      const ma = [2, 11, 8, 5][dB % 4];
      first = ma; mid = k3.upB; last = k1.upB; keti = "返吟課(無剋取馬)";
    }
    if (mid == null) {
      if (fuyin) { // 伏吟有剋還為用,迤邐刑之作中末;初自刑中取日辰並,中自刑末取沖
        if (keti.indexOf("伏吟") < 0) keti += "(伏吟)";
        mid = selfXing(first) ? (stemYang ? k3.upB : k1.upB) : XING3[first];
        last = selfXing(mid) ? (mid + 6) % 12 : XING3[mid];
      } else { mid = up(first); last = up(mid); }
    }
    // 天將
    const GUI = [[1, 7], [0, 8], [11, 9], [11, 9], [1, 7], [0, 8], [1, 7], [6, 2], [5, 3], [5, 3]][dS]; // 壬癸蛇兔藏:晝巳夜卯
    const isDay = hb >= 3 && hb <= 8; // 卯~申為晝
    const gui = isDay ? GUI[0] : GUI[1];
    const guiDi = ((gui - o) % 12 + 12) % 12;
    const shun = [11, 0, 1, 2, 3, 4].includes(guiDi);
    const JIANG12 = ["貴人", "螣蛇", "朱雀", "六合", "勾陳", "青龍", "天空", "白虎", "太常", "玄武", "太陰", "天后"];
    const jiangOf = b => {
      const p = ((b - o) % 12 + 12) % 12;
      const idx = shun ? ((p - guiDi) % 12 + 12) % 12 : ((guiDi - p) % 12 + 12) % 12;
      return JIANG12[idx];
    };
    // 遁干與六親
    const xunD = Math.floor(dayIdx / 10), xb2 = (12 - 2 * xunD) % 12;
    const dunGan = b => { const off = ((b - xb2) % 12 + 12) % 12; return off < 10 ? DC.STEMS[off] : "空亡"; };
    const liuqin = b => {
      const rel = ((wxB(b) - dayWx) % 5 + 5) % 5;
      return ["兄弟", "子孫", "妻財", "官鬼", "父母"][rel];
    };
    const mk = b => ({ b, zh: DC.BRANCHES[b], jiang: jiangOf(b), dun: dunGan(b), qin: liuqin(b) });
    return {
      jiang, jiangZh: DC.BRANCHES[jiang], o, up, jiangOf, keti, fuyin, fanyin,
      lessons: lessons.map((l, i) => ({
        low: i === 0 ? DC.STEMS[dS] : DC.BRANCHES[l.low],
        up: DC.BRANCHES[l.upB], jiang: jiangOf(l.upB)
      })),
      chuan: [mk(first), mk(mid), mk(last)],
      gui: DC.BRANCHES[gui], isDay, shun,
      tianpan: Array.from({ length: 12 }, (_, i) => DC.BRANCHES[up(i)])
    };
  };

  /* ── 本命與行年(六壬/奇門入盤用)── */
  DC.BR_PALACE = [1, 8, 8, 3, 4, 4, 9, 2, 2, 7, 6, 6]; // 地支寄宮(子坎丑寅艮…)
  DC.xingnian = function (male, xusui) { // 行年:男一歲丙寅順行,女一歲壬申逆行
    const idx = male ? (2 + xusui - 1) % 60 : ((8 - (xusui - 1)) % 60 + 60) % 60;
    return { idx, gz: DC.GZ(idx), b: idx % 12 };
  };

  /* ═══ 太乙神數(歲計簡式)═══ */
  // 太乙九宮配卦異於洛書:乾一(天門)、離二、艮三、震四、中五、兌六、坤七、坎八、巽九(對宮合十)
  DC.TAIYI_GONG = ["", "乾一宮(西北)", "離二宮(南)", "艮三宮(東北)", "震四宮(東)", "中五宮", "兌六宮(西)", "坤七宮(西南)", "坎八宮(北)", "巽九宮(東南)"];
  DC.TAIYI_GRID = [9, 2, 7, 4, 5, 6, 3, 8, 1]; // 南上北下之太乙式盤面(左上東南…右下西北)
  DC.taiyi = function (year) {
    const jiNian = year + 10153917; // 太乙統宗積年
    const c24 = ((jiNian - 1) % 24 + 24) % 24;
    const seq = [1, 2, 3, 4, 6, 7, 8, 9];
    const gong = seq[Math.floor(c24 / 3)];
    const yearIn = c24 % 3 + 1;
    const ju = ((jiNian - 1) % 72 + 72) % 72 + 1;
    const yIdx = ((year - 4) % 60 + 60) % 60;
    return { jiNian, gong, gongName: DC.TAIYI_GONG[gong], yearIn, ju, gz: DC.GZ(yIdx) };
  };

  /* ═══ 太乙人道命法(日計論命,楊景磐《太乙通解》系;三數與落宮經雙命例驗證)═══ */
  DC.TAIYI_RING = [ // 十六神環(順時針):[神名, 位, 八正宮數(間神0), 太乙宮號(間神0)]
    ["地主", "子", 8, 8], ["陽德", "丑", 0, 0], ["和德", "艮", 3, 3], ["呂申", "寅", 0, 0],
    ["高叢", "卯", 4, 4], ["太陽", "辰", 0, 0], ["大炅", "巽", 9, 9], ["大神", "巳", 0, 0],
    ["大威", "午", 2, 2], ["天道", "未", 0, 0], ["大武", "坤", 7, 7], ["武德", "申", 0, 0],
    ["太簇", "酉", 6, 6], ["陰主", "戌", 0, 0], ["陰德", "乾", 1, 1], ["大義", "亥", 0, 0]
  ];
  DC.taiyiMing = function (y, m, d, h, mi, tz, male) {
    tz = tz == null ? 8 : tz;
    const bb = DC.bazi(y, m, d, h == null ? 12 : h, mi || 0, tz);
    // 上一個冬至與距日數
    const bLdn = ldn(DC.jd(y, m, d, 12, 0, tz), tz);
    let wsY = y, ws = DC.solarTerm(wsY, 270), wsLdn = ldn(ws, tz);
    if (bLdn < wsLdn) { wsY = y - 1; ws = DC.solarTerm(wsY, 270); wsLdn = ldn(ws, tz); }
    // 積日:祖數 29277(與統宗積年 10153917 同餘)×歲實 365.2425 取整,再以曆算冬至日干支校正相位
    let D0 = Math.floor((29277 + wsY) * 365.2425);
    const wsD = DC.jdToDate(ws, tz);
    const wsIdx = DC.dayGZ(wsD.getUTCFullYear(), wsD.getUTCMonth() + 1, wsD.getUTCDate());
    let diffGz = ((wsIdx - D0 % 60) % 60 + 60) % 60; if (diffGz > 30) diffGz -= 60;
    D0 += diffGz;
    const jiRi = D0 + (bLdn - wsLdn);
    // 天地人三數與受氣干支
    const tian = ((jiRi % 720) + 720) % 720 + 1;
    const diN = (tian - 1) % 72 + 1;   // 地數=入局數(陽遁七十二局)
    const ren = (tian - 1) % 12 + 1;
    const shouqi = DC.GZ((tian - 1) % 60);
    // 太乙落宮:三日一徙,宮序一二三四(不入五)六七八九
    const seq8 = [1, 2, 3, 4, 6, 7, 8, 9];
    const gong = seq8[(Math.ceil(diN / 3) - 1) % 8];
    const tyRing = { 1: 14, 2: 8, 3: 2, 4: 4, 6: 12, 7: 10, 8: 0, 9: 6 }[gong];
    // 文昌(天目):局數 mod 18(0作18),自武德(申)次位酉起順行,乾巽(天門地戶)重留——雙命例(局59→亥、局70→未)唯一解
    const WC_SEQ = [12, 13, 14, 14, 15, 0, 1, 2, 3, 4, 5, 6, 6, 7, 8, 9, 10, 11];
    const r18 = (diN - 1) % 18;
    const wcRing = WC_SEQ[r18];
    const RING_B = [0, 1, 1, 2, 3, 4, 4, 5, 6, 7, 7, 8, 9, 10, 10, 11]; // 環位→支序(維宮取前一支)
    const wcB = RING_B[wcRing];
    // 計神:自寅起一逆行十二辰,數至人數
    const jiShen = ((2 - (ren - 1)) % 12 + 12) % 12;
    // 始擊(客目):計神加和德(艮),文昌所乘之辰
    const sjB = ((1 + wcB - jiShen) % 12 + 12) % 12;
    const B_RING = [0, 1, 3, 4, 5, 7, 8, 9, 11, 12, 13, 15]; // 支序→環位
    const sjRing = B_RING[sjB];
    // 主客算:自起點(八正起宮數/間神起一)順行歷八正宮加宮數,至太乙前一宮止
    const calc = start => {
      if (start === tyRing) return 0; // 臨太乙宮,算不得行(掩)
      let n = DC.TAIYI_RING[start][2] || 1;
      for (let i = (start + 1) % 16; i !== tyRing; i = (i + 1) % 16) n += DC.TAIYI_RING[i][2];
      return n;
    };
    const jiang = suan => { // 大將=算之個位(整十以 mod 9);參將=大將×3 之個位
      if (!suan) return null;
      let dg = suan % 10; if (dg === 0) { dg = suan % 9; if (dg === 0) dg = 9; }
      let cn = (dg * 3) % 10; if (cn === 0) cn = (dg * 3) % 9 || 9;
      const NAME = { 1: "乾", 2: "午", 3: "艮", 4: "卯", 5: "中", 6: "酉", 7: "坤", 8: "子", 9: "巽" };
      return { da: dg, daPos: NAME[dg], can: cn, canPos: NAME[cn] };
    };
    const zhu = calc(wcRing), ke = calc(sjRing);
    // 命宮:生月支加臨年支上,陽男陰女順(陰男陽女逆)數至生時支
    const yZ = bb.pillars[0].b, mZ = bb.pillars[1].b, hZ = bb.hB;
    const yangY = bb.pillars[0].s % 2 === 0;
    const fwd = male == null ? true : (male === yangY);
    const off = ((hZ - mZ) % 12 + 12) % 12;
    const ming = fwd ? (yZ + off) % 12 : ((yZ - off) % 12 + 12) % 12;
    return {
      bb, jiRi, tian, di: diN, ren, shouqi, ju: diN,
      gong, gongName: DC.TAIYI_GONG[gong],
      wenchang: { ring: wcRing, name: DC.TAIYI_RING[wcRing][0], pos: DC.TAIYI_RING[wcRing][1], b: wcB },
      jishen: { b: jiShen, zh: DC.BRANCHES[jiShen] },
      shiji: { ring: sjRing, name: DC.TAIYI_RING[sjRing][0], pos: DC.TAIYI_RING[sjRing][1], b: sjB },
      zhuSuan: zhu, zhuJiang: jiang(zhu), keSuan: ke, keJiang: jiang(ke),
      ming, mingZh: DC.BRANCHES[ming], fwd
    };
  };

  /* ═══ 河洛理數(簡式)═══ */
  DC.heluo = function (bz, male) { // 河洛理數正統起例:天干納甲洛書數+地支河圖生成數(一支一奇一偶)
    const SN = [6, 2, 8, 7, 1, 9, 3, 4, 6, 2]; // 戊一乙癸二,庚三辛四同,壬甲從六數,丁七丙八宮,己九
    const BN = [[1, 6], [5, 10], [3, 8], [3, 8], [5, 10], [2, 7], [2, 7], [5, 10], [4, 9], [4, 9], [5, 10], [1, 6]]; // 亥子一六,寅卯三八,巳午二七,申酉四九,辰戌丑未五十
    let tian = 0, di = 0; const nums = [];
    for (const p of bz.pillars)
      for (const n of [SN[p.s]].concat(BN[p.b])) { nums.push(n); if (n % 2 === 1) tian += n; else di += n; }
    const tr = (tian - 1) % 25 + 1, dr = (di - 1) % 30 + 1; // 天滿25去、地滿30去(1..25/1..30)
    const yangYear = bz.pillars[0].s % 2 === 0;
    const LUO = { 1: 5, 2: 7, 3: 3, 4: 4, 6: 0, 7: 1, 8: 6, 9: 2 }; // 洛書數配後天卦:一坎二坤三震四巽六乾七兌八艮九離
    const guaOf = r => {
      let g = r % 10; if (g === 0) g = Math.floor(r / 10); // 餘10用1、20用2
      if (g === 5) { // 五居中無卦:依三元寄卦(上元男艮女坤/中元陽男陰女艮、陰男陽女坤/下元男離女兌)
        const yy = bz.year;
        if (yy < 1924) return male ? 6 : 7;
        if (yy < 1984) return (male === yangYear) ? 6 : 7;
        return male ? 2 : 1;
      }
      return LUO[g];
    };
    const tg = guaOf(tr), dg = guaOf(dr);
    const tianUp = male === yangYear; // 陽男陰女天卦上、陰男陽女地卦上
    const upper = tianUp ? tg : dg, lower = tianUp ? dg : tg;
    const lines = DC.TRIG_LINES[lower].concat(DC.TRIG_LINES[upper]);
    // 元堂:子~巳陽時數陽爻、午~亥陰時數陰爻,自初爻起;重宮寄宮依《起元堂詩》
    const yangHour = bz.hB < 6, h = bz.hB % 6;
    const same = [], other = [];
    lines.forEach((v, i) => ((v === 1) === yangHour ? same : other).push(i));
    const mCnt = same.length;
    let yt;
    if (mCnt === 6 || mCnt === 0) yt = (yangHour ? 0 : 3) + h % 3; // 乾坤純卦:陽時下卦、陰時上卦輪兩遍
    else if (mCnt === 3) yt = same[h % 3];
    else if (mCnt >= 4) yt = h < mCnt ? same[h] : other[h - mCnt];
    else yt = h < 2 * mCnt ? same[h % mCnt] : other[h - 2 * mCnt];
    // 後天卦:元堂爻變+上下卦互換;至尊卦(坎/屯/蹇)逢九五、上六依月令陰陽定互換
    const lines2 = lines.slice(); lines2[yt] = 1 - lines2[yt];
    const trigOf = ls => DC.TRIG_LINES.findIndex(t => t[0] === ls[0] && t[1] === ls[1] && t[2] === ls[2]);
    const nl = trigOf(lines2.slice(0, 3)), nu = trigOf(lines2.slice(3, 6));
    const zhiZun = upper === 5 && (lower === 5 || lower === 3 || lower === 6); // 坎上而坎/震/艮下:坎、屯、蹇
    const yangMonth = bz.mIdx <= 5; // 寅~未月為陽月
    let swap = true;
    if (zhiZun && (yt === 4 || yt === 5)) swap = yt === 4 ? yangMonth : !yangMonth; // 九五變陽月換、上六變陰月換
    const hUp = swap ? nl : nu, hLo = swap ? nu : nl;
    return {
      tian, di, tianRest: tr, diRest: dr, nums, tianUp,
      xiantian: { upper, lower, name: DC.HEX_NAME[upper][lower] },
      houtian: { upper: hUp, lower: hLo, name: DC.HEX_NAME[hUp][hLo] },
      yuantang: yt + 1, lines
    };
  };

  /* ═══ 自我檢核(開發用)═══ */
  DC.selfTest = function () {
    const out = [];
    const t = (name, cond, detail) => out.push((cond ? "✓ " : "✗ ") + name + (detail ? " → " + detail : ""));
    t("2000-01-01 日柱=戊午", DC.GZ(DC.dayGZ(2000, 1, 1)) === "戊午", DC.GZ(DC.dayGZ(2000, 1, 1)));
    const lc26 = DC.fmtJD(DC.solarTerm(2026, 315), 8, false);
    t("2026 立春=02-04", lc26 === "2026-02-04", lc26);
    const ws25 = DC.fmtJD(DC.solarTerm(2025, 270), 8, false);
    t("2025 冬至=12-21/22", ws25 === "2025-12-21" || ws25 === "2025-12-22", ws25);
    const cny26 = DC.lunar(2026, 2, 17, 8);
    t("2026-02-17=正月初一", cny26 && cny26.month === 1 && cny26.day === 1 && !cny26.isLeap, JSON.stringify(cny26));
    const cny25 = DC.lunar(2025, 1, 29, 8);
    t("2025-01-29=正月初一", cny25 && cny25.month === 1 && cny25.day === 1, JSON.stringify(cny25));
    const leap25 = DC.lunar(2025, 7, 30, 8);
    t("2025-07-30=閏六月", leap25 && leap25.month === 6 && leap25.isLeap, JSON.stringify(leap25));
    const bz = DC.bazi(1990, 5, 15, 10, 0, 8);
    t("1990-05-15 年柱=庚午", bz.pillars[0].gz === "庚午", bz.pillars.map(p => p.gz).join(" "));
    const ay = DC.ayanamsa(DC.jd(2026, 1, 1, 0, 0, 0));
    t("2026 Lahiri≈24.2°", Math.abs(ay - 24.2) < 0.15, ay.toFixed(2));
    const sl = DC.sunLon(DC.jd(2026, 3, 20, 14, 46, 0));
    t("2026 春分點太陽≈0°", Math.abs(rev180(sl)) < 0.5, sl.toFixed(2));
    // 日出時上升點應近太陽黃經(台北 2026-03-20 06:00 當地)
    const jdSr = DC.jd(2026, 3, 20, 6, 0, 8);
    const am = DC.ascMc(jdSr, 25.04, 121.51);
    t("春分日出 ASC≈太陽", Math.abs(rev180(am.asc - DC.sunLon(jdSr))) < 8, "ASC=" + am.asc.toFixed(1) + " SUN=" + DC.sunLon(jdSr).toFixed(1));
    const bz2 = DC.bazi(2000, 1, 1, 12, 0, 8);
    t("2000-01-01 己卯年(未過立春)", bz2.pillars[0].gz === "己卯", bz2.pillars.map(p => p.gz).join(" "));
    const lr = DC.liuren(0, 0, 350); // 甲子日子時,太陽在雙魚→亥將
    t("六壬:太陽350°→亥將", lr.jiangZh === "亥", lr.jiangZh);
    const qm = DC.qimen(2026, 7, 22, 10, 0, 8);
    t("奇門起局(2026-07-22 10:00)", !!qm.juName && Object.keys(qm.tianpan).length === 8, qm.juName + " 旬首" + qm.xunName);
    const zwT = DC.ziwei(1, 1, 0, 2, 2, true); // 丙寅年正月初一子時
    t("紫微起盤成立", zwT.P.filter(p => p.stars.length).length >= 6, zwT.juName + " 命宮" + DC.BRANCHES[zwT.ming]);
    // ── 資料完整性(文庫;DECKS_MINI 同步斷言鎖:改牌名忘重抽會在此紅燈)──
    try {
      const MC = { len: 36, sib: 52, bel: 53, kip: 36, gra: 54, run: 24, esp: 40, yi: 64, zw: 36, dt: 78 };
      const F1 = { len: "騎士", sib: "交談", bel: "命運", kip: "男主人翁", gra: "問卜者", run: "費胡", esp: "金幣一", yi: "乾為天", zw: "紫微", dt: "雲遊者" };
      let miniOk = true, why = "";
      for (const k in MC) {
        const d = DC.DECKS_MINI[k];
        if (!d || d.cards.length !== MC[k]) { miniOk = false; why = k + " 張數 " + (d ? d.cards.length : "無"); break; }
        const c0 = d.cards[0];
        if (!Array.isArray(c0) || c0.length !== 3 || c0[0] !== F1[k] || ["+", "-", "0"].indexOf(c0[2]) < 0) { miniOk = false; why = k + " 首牌 " + JSON.stringify(c0); break; }
      }
      t("DECKS_MINI 十套張數/首牌/三元組", miniOk, why);
      t("DECK_GUIDES 鍵集=DECKS_MINI", Object.keys(DC.DECK_GUIDES).sort().join() === Object.keys(DC.DECKS_MINI).sort().join());
      t("QS_MINI=100", DC.QS_MINI.length === 100, DC.QS_MINI.length);
      t("KIEU=35", DC.KIEU.length === 35, DC.KIEU.length);
      t("YIJU=100", DC.YIJU.length === 100, DC.YIJU.length);
      t("numOr('0')=0(時區陷阱)", DC.numOr("0", 8) === 0);
      t("TONES 全形五款", DC.TONES.length === 5 && DC.TONES.every(s => s.indexOf(",") < 0));
    } catch (e) { t("文庫斷言", false, e.message); }
    return out.join("\n");
  };
})();

/* ═══ 牌組名錄(MIX 快抽用,自 index.html 抽出) ═══ */
DC.DECKS_MINI = { // 由 index.html?minidump=1 自動重生:每張=[名,首關鍵詞,吉凶+/-/0];改牌名後重抽
  len: { name: "雷諾曼", rev: false, cards: [["騎士","消息","+"],["三葉草","幸運","+"],["船","旅行","0"],["房屋","家庭","+"],["樹","健康","0"],["雲","困惑","-"],["蛇","糾葛","-"],["棺材","結束","-"],["花束","禮物","+"],["鐮刀","切割","-"],["鞭子","爭執","-"],["鳥","交談","0"],["小孩","開始","+"],["狐狸","狡猾","-"],["熊","力量","0"],["星星","希望","+"],["鸛鳥","改變","+"],["狗","忠誠","+"],["塔","權威","0"],["花園","社交","0"],["山","阻礙","-"],["岔路","選擇","0"],["老鼠","損耗","-"],["心","愛情","+"],["戒指","承諾","0"],["書","秘密","0"],["信","訊息","0"],["男人","男性","0"],["女人","女性","0"],["百合","平靜","+"],["太陽","成功","+"],["月亮","情緒","0"],["鑰匙","解答","+"],["魚","金錢","+"],["錨","穩定","+"],["十字架","負擔","-"]] },
  sib: { name: "西碧拉", rev: true, cards: [["交談","對話","+"],["家宅","家庭","+"],["眺望樓","佳音","+"],["愛情","真愛","+"],["心之喜","如願","+"],["金錢","財運","+"],["藝術家","才華","+"],["希望","希望","+"],["忠誠","忠貞","+"],["恆心","堅持","+"],["情郎","男性","0"],["佳人","女性","0"],["大貴人","貴人","+"],["姻盟","契約","+"],["傲慢","自負","-"],["旅行","旅程","+"],["摯友","友誼","+"],["鴻運","勝利","+"],["驚喜","驚喜","+"],["大慰藉","苦盡甘來","+"],["重聚","重逢","+"],["歡愉","快樂","+"],["輕浮","輕率","-"],["僕從","消息","0"],["少女","真誠","+"],["博士","智者","+"],["內室","私密","0"],["信函","訊息","0"],["女僕","助力","+"],["虛偽","欺瞞","-"],["憂鬱","低潮","-"],["思緒","思考","0"],["孩童","新生","+"],["珍禮","贈禮","+"],["迷亂","混亂","-"],["竊賊","失竊","-"],["信使","遠訊","0"],["婦人","支持","+"],["商賈","事業","+"],["悲淚","噩耗","-"],["老婦","長者","0"],["鰥夫","孤獨","-"],["病榻","病痛","-"],["死神","終結","-"],["嘆息","等待","0"],["厄運","禍事","-"],["嫉妒","猜忌","-"],["監牢","困局","-"],["軍士","阻礙","0"],["仇敵","對手","-"],["仇婦","敵意","-"],["神父","信靠","+"]] },
  bel: { name: "貝林神諭", rev: true, cards: [["命運","命運","0"],["男性之星","男性","0"],["女性之星","女性","0"],["誕生","新生","+"],["成功","成功","+"],["晉升","高升","+"],["榮耀","榮譽","+"],["思念","思念","+"],["田園","健康","+"],["禮物","禮物","+"],["背叛","背叛","-"],["啟程","出發","0"],["無常","善變","-"],["發現","發現","+"],["水","情感","0"],["家神","家庭","+"],["疾病","病痛","-"],["變化","改變","0"],["金錢","金錢","+"],["才智","才智","+"],["失竊","失竊","-"],["事業","事業","+"],["商貿","交易","0"],["消息","消息","0"],["逸樂","享樂","+"],["和平","和平","+"],["結合","結合","+"],["家庭","家人","+"],["愛","愛情","+"],["宴席","豐盛","+"],["激情","激情","0"],["惡意","惡意","-"],["訴訟","訴訟","-"],["專橫","壓迫","-"],["敵人","敵人","-"],["談判","談判","0"],["火","能量","0"],["意外","意外","-"],["支持","奧援","+"],["美麗","美","+"],["繼承","繼承","+"],["睿智","智慧","+"],["名聲","名聲","+"],["機緣","機運","0"],["幸福","幸福","+"],["不幸","不順","-"],["荒蕪","停滯","-"],["宿命","宿命","-"],["恩典","恩典","+"],["崩毀","崩塌","-"],["延遲","延遲","-"],["隱修","獨處","0"],["藍卡","守護","+"]] },
  kip: { name: "奇卜", rev: false, cards: [["男主人翁","男性","0"],["女主人翁","女性","0"],["婚姻","婚姻","+"],["相會","會面","+"],["善紳士","貴人","+"],["善夫人","貴人","+"],["信件","訊息","0"],["偽善者","虛偽","-"],["轉變","改變","0"],["旅程","旅行","0"],["橫財","大筆進帳","+"],["富家女","年輕女子","+"],["富家子","年輕男子","+"],["悲訊","壞消息","-"],["情場圓滿","愛情善果","+"],["心思","想法","0"],["獲贈","禮物","+"],["幼童","孩子","+"],["喪逝","結束","-"],["屋宅","房屋","+"],["內室","私領域","0"],["軍士","制服者","0"],["法庭","訴訟","-"],["竊案","失竊","-"],["殊榮","榮譽","+"],["鴻福","大幸運","+"],["意外之財","意外進帳","+"],["期待","等待","0"],["囹圄","受困","-"],["官吏","官方","0"],["小恙","短病","-"],["憂煩","煩惱","-"],["陰鬱","低潮","-"],["勞作","工作","0"],["遠路","漫長","0"],["望洋","希望","0"]] },
  gra: { name: "大雷諾曼", rev: false, cards: [["問卜者","男性","0"],["問卜者(女)","女性","0"],["家宅之喜","家中大喜","+"],["摯友之助","友誼","+"],["得意之喜","成功","+"],["和睦復歸","和解","+"],["家族之贈","繼承","+"],["良言","忠告","+"],["護佑","保護","+"],["歡宴","慶祝","+"],["情場大捷","如願","+"],["安穩之光","長久安定","+"],["忠實信使","忠誠青年","+"],["慈心之后","守護女性","+"],["仁厚之王","寬厚男性","+"],["財富之鑰","財運大開","+"],["天佑","庇護","+"],["商機","獲利機會","+"],["守成","謹慎","0"],["意外進帳","不期之財","+"],["慧財","以智生財","+"],["小利","小財","+"],["恆業","堅持","0"],["豐盈","繁榮","+"],["轉富","重大轉變","+"],["得力夥伴","能幹協力","+"],["財慧之婦","精明女性","+"],["有力靠山","影響力","+"],["要訊","重大消息","0"],["契合","合作","+"],["快旅","短程旅行","+"],["遠緣","國外","0"],["銳意","大膽行動","+"],["讒言之防","可疑訊息","-"],["巧勝","機敏","+"],["文書","手續","0"],["小挫","暫時受挫","-"],["遠行","遠途","0"],["信差","傳訊者","0"],["異鄉之女","外地女性","0"],["行旅之王","四海男子","0"],["判決","正義","0"],["兩難","對立","-"],["微愁","小悲傷","-"],["靜思","沉澱","0"],["割捨","必要之失","-"],["未卜","懸而未決","-"],["小叛","小背叛","-"],["養息","健康","-"],["至暗","重大困難","-"],["夜變","劇烈轉折","-"],["讒人","嫉妒者","-"],["孀婦","孤獨女性","-"],["法家","執法者","0"]] },
  run: { name: "盧恩符文", rev: true, cards: [["費胡","財富","+"],["烏魯茲","原力","+"],["索里沙茲","荊棘","-"],["安蘇茲","神諭","+"],["萊多","車輪","0"],["肯納茲","火炬","+"],["給勃","禮物","+"],["溫佑","喜悅","+"],["哈格拉茲","冰雹","-"],["瑙提茲","匱乏","-"],["伊薩","冰","-"],["耶拉","豐年","+"],["艾瓦茲","紫杉","0"],["佩斯洛","命運杯","0"],["埃爾哈茲","麋角","+"],["索維洛","太陽","+"],["提瓦茲","戰神","+"],["貝卡諾","樺樹","+"],["埃瓦茲","駿馬","+"],["瑪納茲","人","0"],["拉古茲","水","0"],["英瓦茲","種子","+"],["達嘎茲","破曉","+"],["歐瑟拉","祖產","+"]] },
  esp: { name: "西班牙牌", rev: false, cards: [["金幣一","大財","+"],["金幣二","交換","0"],["金幣三","才能得酬","+"],["金幣四","守財","0"],["金幣五","小損","-"],["金幣六","互助","+"],["金幣七","收成","+"],["金幣侍從","帶財消息","0"],["金幣騎士","財在路上","0"],["金幣國王","富人","+"],["聖杯一","家宅之喜","+"],["聖杯二","兩心相許","+"],["聖杯三","慶祝","+"],["聖杯四","膩","0"],["聖杯五","小失望","-"],["聖杯六","舊情","0"],["聖杯七","美夢","0"],["聖杯侍從","多情信使","0"],["聖杯騎士","浪漫追求","+"],["聖杯國王","寬厚長者","+"],["寶劍一","決斷","0"],["寶劍二","僵局","-"],["寶劍三","心碎","-"],["寶劍四","停戰","0"],["寶劍五","損失","-"],["寶劍六","遠離是非","0"],["寶劍七","取巧","-"],["寶劍侍從","探子","-"],["寶劍騎士","衝突逼近","-"],["寶劍國王","執法者","0"],["棍杖一","新工作","+"],["棍杖二","抉擇","0"],["棍杖三","初步成果","+"],["棍杖四","安家立業","+"],["棍杖五","競爭","0"],["棍杖六","捷報","+"],["棍杖七","堅守立場","0"],["棍杖侍從","勤快幫手","+"],["棍杖騎士","遠行","0"],["棍杖國王","掌舵人","+"]] },
  yi: { name: "易經", rev: false, cards: [["乾為天","剛健","+"],["坤為地","包容","+"],["水雷屯","初創","0"],["山水蒙","啟蒙","0"],["水天需","等待","0"],["天水訟","爭訟","-"],["地水師","動眾","0"],["水地比","親附","+"],["風天小畜","小蓄","0"],["天澤履","履險","0"],["地天泰","通泰","+"],["天地否","閉塞","-"],["天火同人","同志","+"],["火天大有","大有","+"],["地山謙","謙遜","+"],["雷地豫","喜悅","+"],["澤雷隨","隨順","0"],["山風蠱","積弊","-"],["地澤臨","君臨","+"],["風地觀","觀察","0"],["火雷噬嗑","咬合","0"],["山火賁","文飾","0"],["山地剝","剝落","-"],["地雷復","復甦","+"],["天雷無妄","無妄","0"],["山天大畜","大蓄","+"],["山雷頤","頤養","0"],["澤風大過","超載","-"],["坎為水","重險","-"],["離為火","附麗","0"],["澤山咸","感應","+"],["雷風恆","恆久","+"],["天山遯","退避","0"],["雷天大壯","壯盛","0"],["火地晉","晉升","+"],["地火明夷","晦暗","-"],["風火家人","家道","+"],["火澤睽","乖離","-"],["水山蹇","險阻","-"],["雷水解","解除","+"],["山澤損","減損","0"],["風雷益","增益","+"],["澤天夬","決斷","0"],["天風姤","邂逅","0"],["澤地萃","聚合","+"],["地風升","上升","+"],["澤水困","困窮","-"],["水風井","水井","0"],["澤火革","變革","0"],["火風鼎","鼎新","+"],["震為雷","震動","0"],["艮為山","靜止","0"],["風山漸","漸進","+"],["雷澤歸妹","錯位","-"],["雷火豐","豐盛","+"],["火山旅","羈旅","0"],["巽為風","巽入","0"],["兌為澤","喜悅","+"],["風水渙","渙散","0"],["水澤節","節制","0"],["風澤中孚","誠信","+"],["雷山小過","小過","0"],["水火既濟","已成","0"],["火水未濟","未成","0"]] },
  zw: { name: "紫微", rev: true, cards: [["紫微","帝座","+"],["天機","智謀","+"],["太陽","光明","+"],["武曲","剛毅","+"],["天同","福星","+"],["廉貞","才情","0"],["天府","庫星","+"],["太陰","細膩","+"],["貪狼","慾望","0"],["巨門","口才","0"],["天相","印星","+"],["天梁","蔭星","+"],["七殺","將星","0"],["破軍","耗星","0"],["左輔","助力","+"],["右弼","助力","+"],["文昌","科甲","+"],["文曲","才藝","+"],["天魁","陽貴","+"],["天鉞","陰貴","+"],["擎羊","刑傷","-"],["陀羅","拖延","-"],["火星","爆發","-"],["鈴星","陰火","-"],["地空","空想","-"],["地劫","劫失","-"],["祿存","財祿","+"],["天馬","驛動","0"],["化祿","財源","+"],["化權","權柄","+"],["化科","名聲","+"],["化忌","執念","-"],["紅鸞","姻緣","+"],["天喜","喜事","+"],["天刑","自律","-"],["天姚","魅力","0"]] },
  dt: { name: "東方塔羅", rev: true, cards: [["雲遊者","起程","0"],["方士","造化","+"],["巫祝","靈覺","0"],["鳳后","豐饒","+"],["天子","秩序","+"],["國師","師承","0"],["鵲橋","良緣","+"],["兵車","進取","+"],["伏虎","柔克剛","+"],["隱士","求道","0"],["轉輪","時運","+"],["明鏡","公道","0"],["倒懸","換位","0"],["無常","終結","0"],["中庸","調和","+"],["心魔","執迷","-"],["雷塔","驟變","-"],["星宿","希望","+"],["月宮","幻影","0"],["金烏","晝明","+"],["渡劫","覺醒","0"],["大同","圓成","+"],["青龍・一","新財","+"],["青龍・二","權衡","0"],["青龍・三","匠藝","+"],["青龍・四","守財","0"],["青龍・五","困窘","-"],["青龍・六","施受","+"],["青龍・七","待收","0"],["青龍・八","精進","+"],["青龍・九","豐足","+"],["青龍・十","家業","+"],["青龍・童子","學徒","+"],["青龍・將軍","踏實","+"],["青龍・娘娘","持家","+"],["青龍・帝君","實業之主","+"],["朱雀・一","火種","+"],["朱雀・二","展望","0"],["朱雀・三","先機","+"],["朱雀・四","慶成","+"],["朱雀・五","競逐","-"],["朱雀・六","凱旋","+"],["朱雀・七","據守","0"],["朱雀・八","疾行","+"],["朱雀・九","戒備","0"],["朱雀・十","重擔","-"],["朱雀・童子","熱血","+"],["朱雀・將軍","衝鋒","0"],["朱雀・娘娘","光采","+"],["朱雀・帝君","開創雄主","+"],["白虎・一","破妄","+"],["白虎・二","僵持","0"],["白虎・三","錐心","-"],["白虎・四","休兵","0"],["白虎・五","慘勝","-"],["白虎・六","渡厄","0"],["白虎・七","暗謀","-"],["白虎・八","自縛","-"],["白虎・九","夜懼","-"],["白虎・十","谷底","-"],["白虎・童子","機警","0"],["白虎・將軍","疾攻","0"],["白虎・娘娘","明察","0"],["白虎・帝君","律法之主","+"],["玄武・一","心泉","+"],["玄武・二","交杯","+"],["玄武・三","同歡","+"],["玄武・四","倦怠","0"],["玄武・五","憾失","-"],["玄武・六","舊憶","+"],["玄武・七","幻夢","0"],["玄武・八","離塵","0"],["玄武・九","願足","+"],["玄武・十","圓滿","+"],["玄武・童子","善感","+"],["玄武・將軍","浪漫","0"],["玄武・娘娘","慈心","+"],["玄武・帝君","沉穩之主","+"]] },
};
DC.DECK_GUIDES = { // 各牌組一句讀法總綱(手寫維護,給 MIX 合參提示詞用)
  len: "雷諾曼 36 張,象物直白如電報;兩牌相鄰讀作「前牌名詞+後牌修飾」,無正逆位。",
  sib: "西碧拉 52 張義大利沙龍牌,四花色=情感/契約幸運/消息利益/考驗陰影;人物牌優先讀作具體的人(阻礙位=阻你的人、助力位=貴人、潛藏位=幕後之人);逆位=受阻或人心已轉。",
  bel: "貝林 53 張法國神諭,七星體家族各七張;同家族多張並出=該領域主導;火星/土星家族落阻礙位凶而有解;藍卡受守護、三主牌為全局樞紐。",
  kip: "奇卜 36 張德式人物情境牌,只讀正位;人物牌請讀四鄰——右=迎面而來、左=已成過去、上=心頭之念、下=立足之基。",
  gra: "大雷諾曼 54 張(男女問卜者+52 撲克),疊五大神話系列;同系列多張=同一則神話的分鏡(金羊毛=求取、特洛伊=攻守、煉金=轉化、時序=時機、意外=變數),只讀正位。",
  run: "盧恩 24 符分三族:弗雷族(1-8)司生計、海姆達爾族(9-16)司變局、提爾族(17-24)司人事天命;某族過半即為重心;正逆同形之符所言為常數。",
  esp: "西班牙牌 40 張民間紙牌:金幣=財、聖杯=情、寶劍=非、棍杖=勞;人頭牌指認真實人物(sota 晚輩/caballo 在路上/rey 拍板者);同數成對依傳統斷法,只讀正位。",
  yi: "周易六十四卦,三枚錢擲卦;以動爻論變,本卦為體、之卦為變。",
  zw: "紫微 36 星曜牌(原創):十四主星+六吉六煞+四化雜曜;正位=入廟得力、逆位=落陷失輝;煞星入廟可「煞為我用」。",
  dt: "東方塔羅 78 張(華夏重詮,結構對應標準塔羅):四象小牌=青龍木財帛/朱雀火行動/白虎金思辨/玄武水情感,兼讀五行生剋;大牌權重最重。",
};
/* ═══ 別館共用:城市/語氣/歷史 ═══ */
DC.CITIES = [
  ["台北", 25.04, 121.51, 8], ["新北", 25.01, 121.46, 8], ["桃園", 24.99, 121.30, 8], ["台中", 24.15, 120.67, 8],
  ["台南", 22.99, 120.21, 8], ["高雄", 22.63, 120.30, 8], ["香港", 22.32, 114.17, 8], ["北京", 39.90, 116.41, 8],
  ["上海", 31.23, 121.47, 8], ["東京", 35.68, 139.69, 9], ["首爾", 37.57, 126.98, 9], ["新加坡", 1.35, 103.82, 8],
  ["倫敦", 51.51, -0.13, 0], ["巴黎", 48.86, 2.35, 1], ["紐約", 40.71, -74.01, -5], ["洛杉磯", 34.05, -118.24, -8],
  ["自訂", null, null, null]
];
DC.fillCitySelect = function (sel, latEl, lonEl, tzEl) {
  DC.CITIES.forEach(function (c, i) { var o = document.createElement("option"); o.value = i; o.textContent = c[0]; sel.appendChild(o); });
  sel.addEventListener("change", function () {
    var c = DC.CITIES[+sel.value];
    if (c[1] != null) { latEl.value = c[1]; lonEl.value = c[2]; tzEl.value = c[3]; }
  });
  sel.value = 0; latEl.value = DC.CITIES[0][1]; lonEl.value = DC.CITIES[0][2]; tzEl.value = DC.CITIES[0][3];
};

DC.TONES = ["溫暖但誠實", "直白犀利，不留情面", "溫柔療癒，多些鼓勵", "冷靜理性，條理分析", "詩意神秘，如占卜師低語"]; // ⇄ index.html 牌桌館的語氣選單須與此逐字相同(兩邊共用 dc-tone 鍵)
DC.toneInit = function (onChange) { // 需要頁面有 #tone-select 與 #tone-custom
  var sel = document.getElementById("tone-select"), cus = document.getElementById("tone-custom");
  if (!sel) return;
  DC.TONES.forEach(function (t) { var o = document.createElement("option"); o.value = t; o.textContent = t; sel.appendChild(o); });
  var oc = document.createElement("option"); oc.value = "__custom__"; oc.textContent = "自訂…"; sel.appendChild(oc);
  try {
    var s = localStorage.getItem("dc-tone") || DC.TONES[0];
    if (s !== "__custom__" && DC.TONES.indexOf(s) < 0) { var s2 = s.replace(/,/g, "，"); if (DC.TONES.indexOf(s2) >= 0) s = s2; } // 舊半形值遷移
    cus.value = localStorage.getItem("dc-tone-custom") || "";
    sel.value = DC.TONES.indexOf(s) >= 0 ? s : "__custom__";
  } catch (e) { sel.value = DC.TONES[0]; }
  cus.hidden = sel.value !== "__custom__";
  var ch = function () {
    cus.hidden = sel.value !== "__custom__";
    try {
      localStorage.setItem("dc-tone", sel.value === "__custom__" ? "__custom__" : sel.value);
      localStorage.setItem("dc-tone-custom", cus.value);
    } catch (e) {}
    if (onChange) onChange(DC.toneValue());
  };
  sel.addEventListener("change", ch); cus.addEventListener("input", ch);
};
DC.toneValue = function () {
  var sel = document.getElementById("tone-select"), cus = document.getElementById("tone-custom");
  if (!sel) return "溫暖但誠實";
  return sel.value === "__custom__" ? (cus.value.trim() || "溫暖但誠實") : sel.value;
};
DC.toneHead = function () { return "請以繁體中文解讀,語氣:「" + DC.toneValue() + "」。"; };

DC.histBind = function () { // 跨館共用歷史(需 #hist-list/#hist-clear/#out/#prompt-box/#prompt-sec)
  var $id = function (x) { return document.getElementById(x); };
  var list = $id("hist-list");
  if (!list) { DC.histSave = function () {}; return; }
  var KEY = "dc-hall-history";
  var all = function () { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; } };
  var save = function (a) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) {} };
  var render = function () {
    var arr = all();
    if (!arr.length) { list.innerHTML = '<p class="hist-empty">尚無紀錄——起一盤吧。</p>'; return; }
    list.innerHTML = "";
    arr.forEach(function (r, i) {
      var d = new Date(r.t);
      var div = document.createElement("div");
      div.className = "hist-item";
      var info = document.createElement("div"); info.className = "h-info";
      var when = document.createElement("span"); when.className = "h-when";
      when.textContent = d.getFullYear() + "/" + (d.getMonth() + 1) + "/" + d.getDate() + " " + DC.pad2(d.getHours()) + ":" + DC.pad2(d.getMinutes());
      var what = document.createElement("span"); what.className = "h-what";
      what.textContent = "【" + r.page + "】" + r.title;
      info.appendChild(when); info.appendChild(what);
      if (r.q) { var qq = document.createElement("span"); qq.className = "h-q"; qq.textContent = r.q; info.appendChild(qq); }
      var act = document.createElement("div"); act.className = "h-actions";
      var bv = document.createElement("button"); bv.className = "ghost-btn"; bv.textContent = "重看";
      bv.onclick = function () {
        $id("out").innerHTML = r.html;
        $id("prompt-box").value = r.prompt;
        $id("prompt-sec").hidden = false;
        $id("out").scrollIntoView({ behavior: "smooth" });
      };
      var bd = document.createElement("button"); bd.className = "ghost-btn"; bd.textContent = "刪除";
      bd.onclick = function () { var a = all(); a.splice(i, 1); save(a); render(); };
      act.appendChild(bv); act.appendChild(bd);
      div.appendChild(info); div.appendChild(act);
      list.appendChild(div);
    });
  };
  var clr = $id("hist-clear");
  if (clr) clr.onclick = function () { save([]); render(); };
  DC.histSave = function (page, title, q, html, prompt) {
    var a = all();
    a.unshift({ t: Date.now(), page: page, title: title, q: q || "", html: html, prompt: prompt });
    while (a.length > 30) a.pop();
    save(a); render();
  };
  render();
};
DC.histSave = function () {}; // histBind 前的安全預設

/* ── 入門教學分頁(需 #views 兩顆 .view-btn 與 #view-learn 容器)── */
DC.learnInit = function (build, after) {
  var views = document.getElementById("views"), learn = document.getElementById("view-learn");
  if (!views || !learn) return;
  var show = function (isLearn) {
    views.querySelectorAll(".view-btn").forEach(function (x) { x.classList.toggle("active", (x.dataset.view === "learn") === isLearn); });
    document.body.classList.toggle("learning", isLearn);
    if (isLearn && !learn.dataset.built) { learn.innerHTML = build(); learn.dataset.built = "1"; if (after) after(learn); }
  };
  views.querySelectorAll(".view-btn").forEach(function (b) {
    b.addEventListener("click", function () { show(b.dataset.view === "learn"); });
  });
  if (/[?&]learn=1/.test(location.search)) show(true);
};

/* 一覽/逐張瀏覽元件(仿牌桌館字典 UX):磚牆一覽 → 點一張看一張,可前後翻頁 */
DC.browser = function (mount, items, renderDetail) {
  var view = -1;
  var draw = function (scroll) {
    if (view < 0) {
      mount.innerHTML = '<div class="dict-grid">' + items.map(function (it, i) {
        return '<button class="dict-tile" type="button"><span class="dt-no">' + (it.no != null ? it.no : (i + 1)) + "</span>" +
          '<span class="dt-t">' + it.t + "</span>" + (it.s ? '<span class="dt-s">' + it.s + "</span>" : "") + "</button>";
      }).join("") + "</div>";
      mount.querySelectorAll(".dict-tile").forEach(function (b, i) {
        b.onclick = function () { view = i; draw(true); };
      });
    } else {
      mount.innerHTML = '<div class="dict-nav">' +
        '<button class="ghost-btn dn-back" type="button">返回一覽</button>' +
        '<button class="ghost-btn dn-prev" type="button">← 上一</button>' +
        '<span class="dn-pos">' + (view + 1) + " / " + items.length + "</span>" +
        '<button class="ghost-btn dn-next" type="button">下一 →</button></div>' +
        '<div class="dict-detail-body">' + renderDetail(view) + "</div>";
      mount.querySelector(".dn-back").onclick = function () { view = -1; draw(true); };
      mount.querySelector(".dn-prev").onclick = function () { view = (view + items.length - 1) % items.length; draw(false); };
      mount.querySelector(".dn-next").onclick = function () { view = (view + 1) % items.length; draw(false); };
      var sc = mount.querySelector(".dict-detail-scroll");
      if (sc) sc.scrollLeft = sc.scrollWidth;
    }
    if (scroll) mount.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  draw(false);
  return { open: function (i) { view = i; draw(false); } };
};
DC.lcard = function (t, body) { return '<div class="result-card"><h3>' + t + "</h3>" + body + "</div>"; };
DC.ltable = function (headers, rows) {
  return '<div class="tbl-scroll"><table class="data wrap"><tr>' + headers.map(function (h) { return "<th>" + h + "</th>"; }).join("") + "</tr>" +
    rows.map(function (r) { return "<tr>" + r.map(function (c, i) { return "<td" + (i === 0 ? ' class="hl"' : "") + ">" + c + "</td>"; }).join("") + "</tr>"; }).join("") + "</table></div>";
};

/* ═══ 南洋館:緬甸八曜/爪哇威頓/泰國七曜/越南翹傳 ═══ */
DC.BUR8 = [ // 週日起;7=羅睺(週三午後)
  ["日曜", "迦樓羅(金翅鳥)", "東北", "太陽", "如金翅鳥凌空:志高自尊,獨立慷慨於志、儉嗇於財(緬諺:日曜生人惜財)"],
  ["月曜", "虎", "東", "月亮", "如林中之虎:聰慧記性佳,溫文之下藏著佔有慾與醋勁"],
  ["火曜", "獅", "東南", "火星", "如獅王直行:誠實敢言,重尊嚴講義氣,寧折不彎"],
  ["水曜", "有牙象", "南", "水星", "如帶牙之象:性急易怒但怒去如風,幽默健談,人緣廣"],
  ["木曜", "鼠", "西", "木星", "如倉中之鼠:溫和好學,福澤自來,唯須防安逸生懶"],
  ["金曜", "天竺鼠", "北", "金星", "如天竺鼠群居:多話善交,愛美有藝術氣質,重感情"],
  ["土曜", "那伽龍", "西南", "土星", "如深潭那伽:沉穩固執,火氣藏於深處,耐力與韌性驚人"],
  ["羅睺", "無牙象", "西北", "羅睺", "如無牙之象:膽大敢衝,野心勃勃,言語鋒利,成敗皆烈"]
];
DC.bur8Index = function (y, m, d, h) {
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return (wd === 3 && (h || 0) >= 12) ? 7 : wd;
};
DC.mahaboteME = function (y, m, d) { // 緬曆年(以潑水節約4/17換歲,簡式)
  const ME = (m > 4 || (m === 4 && d >= 17)) ? y - 638 : y - 639;
  return { ME, r: ((ME % 7) + 7) % 7 };
};
DC.THAI7 = [ // 週日起;7=週三夜(羅睺)
  ["開眼佛(七日瞻菩提)", "紅", "藍", "尊貴自重,光明磊落,天生領袖氣場"],
  ["制止佛(舉掌平亂)", "黃(乳白)", "紅", "溫柔善調解,記性極佳,以柔服人"],
  ["臥佛(吉祥涅槃)", "粉紅", "白", "勇敢果斷,行動至上,吃軟不吃硬"],
  ["托缽佛(清晨化緣)", "綠", "粉紅", "健談善商,頭腦靈活,天生生意囝"],
  ["禪定佛(結跏趺坐)", "橙", "紫", "好學深思,為師之才,言出有據"],
  ["沉思佛(雙手撫胸)", "淺藍", "黑(深藍)", "愛美多感,藝術心腸,為情所重"],
  ["那伽護佛(蛇王護頂)", "紫", "綠", "沉靜堅毅,外冷內熱,愈壓愈強"],
  ["林中受供佛(象猴獻食)", "灰綠", "橙紅", "勤奮硬頸,黑夜行者,靠自己殺出路"]
];
DC.thai7Index = function (y, m, d, h) {
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return (wd === 3 && (h || 0) >= 18) ? 7 : wd;
};
DC.thaiZodiacYear = function (y, m, d) { // 以潑水節4/13換歲(民俗簡式)
  return (m > 4 || (m === 4 && d >= 13)) ? y : y - 1;
};
DC.THAI12 = ["鼠", "牛", "虎", "兔", "那伽(大蛇)", "小蛇", "馬", "羊", "猴", "雞", "狗", "豬"]; // 辰年作那伽
DC.PASARAN = [ // [名, 方位, 色, 性情]
  ["Legi 樂吉", "東", "白", "開朗大方,樂於給予,人見人親"],
  ["Pahing 巴興", "南", "紅", "好強自尊,目標導向,不服輸"],
  ["Pon 坡恩", "西", "黃", "愛表現,聰明健談,場面上的人"],
  ["Wage 瓦格", "北", "黑", "固執沉默,忠誠可託,慢熱深情"],
  ["Kliwon 克里翁", "中", "五彩", "靈性強,多謀善言,情緒深邃"]
];
DC.NEPTU_DAY = [5, 4, 3, 7, 8, 6, 9]; // 週日起
DC.NEPTU_PAS = [5, 9, 7, 4, 8];
DC.DAY_ID = ["Minggu 週日", "Senin 週一", "Selasa 週二", "Rabu 週三", "Kamis 週四", "Jumat 週五", "Sabtu 週六"];
DC.PANCASUDA = [["Sri 斯里", "福澤之命:自帶豐饒,宜納不宜散"], ["Lungguh 隆古", "座位之命:有官祿緣,宜任其位"], ["Gedhong 格東", "庫房之命:善積聚,守成致富"], ["Lara 拉臘", "病苦之命:多勞多憂,養身為先"], ["Pati 帕蒂", "斷絕之命:大起大落,置之死地而後生"]];
DC.DINA = [ // 古典「日象」watak dina:七曜配自然之象
  ["Mega 雲", "如雲之人:來去自在,寬和飄逸,難以捉摸也難以束縛"],
  ["Candra 月", "如月之人:溫潤多感,靜夜生輝,善體人意"],
  ["Geni 火", "如火之人:炙熱勇進,一點就燃,燒向目標也易燒到自己"],
  ["Bumi 地", "如地之人:厚實承載,任勞任怨,萬物在他身上生長"],
  ["Angin 風", "如風之人:無孔不入,消息靈通,行蹤不定"],
  ["Banyu 水", "如水之人:柔而能穿石,隨器成形,聚則成江海"],
  ["Watu 石", "如石之人:沉默堅硬,守諾如山,不動則已動則地裂"]
];
DC.WETON_SPECIAL = { // 特殊威頓日(wd,pas)
  "2,4": ["Anggara Kasih 安卡拉之愛(Selasa Kliwon)", "爪哇最富靈性之日:傳統於此日淨身、冥想、供奉——通陰陽兩界之門"],
  "5,4": ["Jumat Kliwon 聖俗之夜", "民間傳說最玄的日子:夜裡萬籟有靈,宜敬不宜狎,許願與守戒皆倍力"],
  "5,0": ["Jumat Legi 光明之金曜", "與印尼獨立日同威頓:光明開闊之日,宜開創、宜宣告"],
  "6,1": ["Sabtu Pahing 至剛之日", "neptu 18 全曆最高:氣場最硬,成大事也最固執——剛不可久,記得留柔"]
};
DC.JODOH7 = [ // 合婚:(男neptu+女neptu)%7
  ["Pegat 離", "聚散頻繁,多阻隔——非不能成,須有覺悟經營"],
  ["Ratu 王", "天作之合如王與后,人人稱羨"],
  ["Jodoh 合", "本然之配,包容彼此,白首可期"],
  ["Topo 苦盡甘", "先苦後甘,共患難而後共富貴"],
  ["Tinari 福", "順遂有福,財路平坦"],
  ["Padu 吵", "口角不斷卻離不開——吵吵鬧鬧一輩子"],
  ["Sujanan 疑", "多疑多妒,須以坦誠為藥"]
];
DC.weton = function (y, m, d) { // 1945-08-17 = Jumat Legi(印尼獨立日)錨定
  const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1945, 7, 17)) / 86400000);
  const pas = ((days % 5) + 5) % 5;
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const neptu = DC.NEPTU_DAY[wd] + DC.NEPTU_PAS[pas];
  return { wd, pas, neptu, name: DC.DAY_ID[wd].split(" ")[0] + " " + DC.PASARAN[pas][0].split(" ")[0], panca: (neptu - 1) % 5 };
};
DC.nextWeton = function (birthY, birthM, birthD, fromY, fromM, fromD) { // 下一個本命威頓日
  const w = DC.weton(birthY, birthM, birthD);
  for (let k = 0; k <= 35; k++) {
    const t = new Date(Date.UTC(fromY, fromM - 1, fromD + k));
    const w2 = DC.weton(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
    if (w2.wd === w.wd && w2.pas === w.pas) return t;
  }
  return null;
};
DC.KIEU = [ // 《翹傳》選句卅五(Bói Kiều 開卷占;pol: good/mid/bad)
  ["Trăm năm trong cõi người ta,\nChữ tài chữ mệnh khéo là ghét nhau.", "百年人世間,才與命偏偏相妒。", "才命相妒", "所問之事,才華夠而時運掣肘——別怨天,把鋒芒收進鞘,等命追上才。", "mid"],
  ["Trải qua một cuộc bể dâu,\nNhững điều trông thấy mà đau đớn lòng.", "歷經一場滄海桑田,所見所聞令人心傷。", "滄桑之變", "局面正在大變,舊的一頁翻過去了。心會痛,但翻頁不由你我。", "bad"],
  ["Lạ gì bỉ sắc tư phong,\nTrời xanh quen thói má hồng đánh ghen.", "有得必有失何足為奇,蒼天素愛與紅顏為難。", "天妒紅顏", "太順、太美、太出鋒頭之處,正是招忌之處。藏一分,保十分。", "bad"],
  ["Mai cốt cách tuyết tinh thần,\nMỗi người một vẻ mười phân vẹn mười.", "梅之風骨雪之精神,各有其美十分俱足。", "梅骨雪神", "你(或所問之人事)底子極好,各擅勝場——不必比較,做足自己即是十分。", "good"],
  ["Người đâu gặp gỡ làm chi,\nTrăm năm biết có duyên gì hay không?", "何處來的人偏教相遇,百年之後可知有緣無緣?", "邂逅問緣", "緣分已起頭,結局未寫定。此籤許你相遇,不許你保證——用心去試。", "mid"],
  ["Rằng: Trăm năm cũng từ đây,\nCủa tin gọi một chút này làm ghi.", "道是:百年之約自此始,以此信物聊作憑記。", "定情之信", "宜立約、宜承諾、宜交換信物與合同——從此開始的,能走得遠。", "good"],
  ["Tiếc thay chút nghĩa cũ càng,\nDẫu lìa ngó ý còn vương tơ lòng.", "可惜那份舊日情義,藕已斷而絲仍連心。", "藕斷絲連", "舊事未了,舊情未斷。問復合有一線,問放下則須快刀。", "mid"],
  ["Đau đớn thay phận đàn bà,\nLời rằng bạc mệnh cũng là lời chung.", "堪痛女兒之身世,「薄命」二字自古同悲。", "紅顏薄命", "所問之事委屈居多、話語權少。此籤教你先自護,再圖其他。", "bad"],
  ["Có tài mà cậy chi tài,\nChữ tài liền với chữ tai một vần.", "有才何必自恃其才,「才」與「災」原是同韻。", "恃才招災", "本事是真的,但此刻鋒芒太露必招災。低調行事,讓成果替你說話。", "bad"],
  ["Thiện căn ở tại lòng ta,\nChữ tâm kia mới bằng ba chữ tài.", "善根只在自家心裡,一個「心」字抵得三個「才」。", "心勝於才", "此問成敗不在能力在存心。存心正,笨辦法也通;存心偏,巧計必敗。", "good"],
  ["Xưa nay nhân định thắng thiên cũng nhiều.", "自古人定勝天之事,原也不少。", "人定勝天", "上籤。命盤說難,但此籤特許:肯拚就改寫得了。全力以赴。", "good"],
  ["Sen tàn cúc lại nở hoa,\nSầu dài ngày ngắn đông đà sang xuân.", "蓮謝了菊又開花,愁長晝短,冬已向春。", "冬去春來", "壞日子正在過去,節氣已暗轉。再撐一小段,回暖是定局。", "good"],
  ["Trời còn để có hôm nay,\nTan sương đầu ngõ vén mây giữa trời.", "天公留得今日在,巷口霧散,中天雲開。", "霧散雲開", "大好之籤:誤會冰釋、阻礙自除、離散復聚。今日之後,豁然開朗。", "good"],
  ["Bây giờ gương vỡ lại lành,\nKhuôn thiêng lừa lọc đã dành có nơi.", "而今破鏡重圓,冥冥揀選早有安排。", "破鏡重圓", "失去的回得來:復合、失物、舊案重啟皆吉。是天意留的位子。", "good"],
  ["Chọc trời khuấy nước mặc dầu,\nDọc ngang nào biết trên đầu có ai.", "任他攪海翻天由我,縱橫天下,頭上更有何人。", "攪海翻天", "宜大膽開創、自立門戶,氣魄十足;唯記得英雄的結局——留一分敬畏。", "good"],
  ["Làm cho rõ mặt phi thường,\nBấy giờ ta sẽ rước nàng nghi gia.", "且教天下識我非常之面目,那時再風光迎娶。", "非常之志", "先立業後成家、先證明後收成。此籤許你成名,但要你先去掙。", "good"],
  ["Cũng liều nhắm mắt đưa chân,\nMà xem con tạo xoay vần đến đâu.", "索性閉眼邁步,且看造化輪轉到何處。", "閉眼一搏", "已無穩妥之路,只剩一搏。既然要跳,就別回頭看——半途回頭最傷。", "mid"],
  ["Duyên hội ngộ, đức cù lao,\nBên tình bên hiếu bên nào nặng hơn?", "相逢之緣、劬勞之恩,情與孝哪頭更重?", "情孝兩難", "兩件都對的事撞在一起了。此籤不替你選,只提醒:先問哪邊不可逆。", "mid"],
  ["Khi tỉnh rượu lúc tàn canh,\nGiật mình mình lại thương mình xót xa.", "酒醒夜殘時分,驀然驚覺,自傷自憐。", "酒醒夜殘", "熱鬧散後見真章——此問的實情比表面冷清。先安頓自己,再談其他。", "bad"],
  ["Ma đưa lối, quỷ đưa đường,\nLại tìm những chốn đoạn trường mà đi.", "魔引路、鬼帶道,偏往斷腸之地行去。", "鬼迷心竅", "下籤:眼前那條「捷徑」正是坑。有人引你往壞處走——立刻回頭。", "bad"],
  ["Một cung gió thảm mưa sầu,\nBốn dây nhỏ máu năm đầu ngón tay.", "一曲淒風苦雨,四絃嘔血,五指皆傷。", "琴聲泣血", "所問之事耗心耗神,才華換來的是消耗。此局宜止損,不宜戀戰。", "bad"],
  ["Cảnh nào cảnh chẳng đeo sầu,\nNgười buồn cảnh có vui đâu bao giờ?", "何處風景不帶愁,人心既悲,景致何曾歡樂。", "境由心生", "問題不全在外境,大半在心境。心結一鬆,同一局面自有生路。", "mid"],
  ["Chữ trinh còn một chút này,\nChẳng cầm cho vững lại giày cho tan.", "僅存這一點貞守,不緊緊護住,反要踐踏成灰?", "珍守僅有", "手上僅剩的本錢(信譽/積蓄/信任)不可再賭。守住底線,就還有下一局。", "bad"],
  ["Còn non còn nước còn dài,\nCòn về còn nhớ đến người hôm nay.", "山還在水還長,來日方長,歸時猶記今日之人。", "後會有期", "此番未成,不是終局。好聚好散,把情面留住——他日必有再見之用。", "mid"],
  ["Bắt phong trần phải phong trần,\nCho thanh cao mới được phần thanh cao.", "命教風塵便風塵,許你清高時方得清高。", "順受其正", "此刻由不得你挑,先把眼前的局面熬好。時候到了,自然還你清白位子。", "mid"],
  ["Hoa cười ngọc thốt đoan trang,\nMây thua nước tóc tuyết nhường màu da.", "花般笑靨玉般談吐,雲遜其髮,雪讓其膚。", "花笑玉言", "形象大吉:面試、提親、亮相、發表皆宜。你此刻最好看,大方去見人。", "good"],
  ["Sầu đong càng lắc càng đầy,\nBa thu dọn lại một ngày dài ghê.", "愁緒越搖越滿,一日不見,長如三秋。", "一日三秋", "牽掛已深,等待難熬。此籤不凶,只是慢——訊息會來,比你想的晚。", "mid"],
  ["Tưởng bây giờ là bao giờ,\nRõ ràng mở mắt còn ngờ chiêm bao.", "只道此刻是何時,分明睜眼,猶疑夢中。", "疑是夢中", "喜出望外之籤:所盼之事成真,真到你不敢相信。放心,不是夢。", "good"],
  ["Đến bây giờ mới thấy đây,\nMà lòng đã chắc những ngày một hai.", "到今日方才相見,心中早篤定非一日兩日。", "終得相見", "苦候之人事終於露面。之前的等沒白等——快去確認,趁熱把事定下。", "good"],
  ["Hoa tàn mà lại thêm tươi,\nTrăng tàn mà lại hơn mười rằm xưa.", "花殘了反更嬌豔,月缺了反勝當年十五。", "殘花更豔", "上上籤:失而復得,且比從前更好。二度機會勝過初逢,安心收下。", "good"],
  ["Mấy lần cửa đóng then cài,\nĐầy thềm hoa rụng biết người ở đâu?", "幾度門扉深鎖,滿階落花,人在何方?", "門扃花落", "尋人不遇、求事無門。此路暫不通,先退一步,改日改道再叩。", "bad"],
  ["Những là rày ước mai ao,\nMười lăm năm ấy biết bao nhiêu tình!", "朝思暮想至今,十五年來多少深情。", "苦盡回甘", "拖得很久的心願仍有效。此籤認可你的堅持——結果雖遲,情分算數。", "good"],
  ["Trai anh hùng, gái thuyền quyên,\nPhỉ nguyền sánh phượng, đẹp duyên cưỡi rồng.", "男是英雄女是嬋娟,鸞鳳相偕,乘龍之願皆遂。", "英雄佳人", "婚配合作大吉:雙方都是一時之選,強強相配,名實俱歸。", "good"],
  ["Ngày xuân em hãy còn dài,\nXót tình máu mủ thay lời nước non.", "妹妹春日尚長,念骨肉之情,代承山盟。", "託付之義", "此事你未必親自完成——宜託付、宜交棒、宜找替手。所託得人,恩義兩全。", "mid"],
  ["Phận sao phận bạc như vôi,\nĐã đành nước chảy hoa trôi lỡ làng.", "命薄何以薄如石灰,水自流花自落,佳期已誤。", "薄命蹉跎", "下籤:時機已誤,強留無益。認賠放手,把力氣留給下一段。", "bad"]
];
/* ═══ 燭光一句(原創答案之書,開卷館用) ═══ */
DC.YIJU = [
"可以。而且趁現在。","不必。你早就知道不必。","等到月底再說。","這次說「好」。","這次說「不」,並且不解釋。",
"問題不在要不要,在你敢不敢。","先睡一覺,答案明早會自己站好。","值得一試,但別押上全部。","放手。空出來的手才接得住新的。","再堅持一下下,就一下下。",
"別急,火候未到。","急。這件事真的要快。","你已經知道答案了,我只是幫你蓋章。","去問那個你一直不敢問的人。","條件談清楚,就能做。",
"這不是你的戰場。","是你的戰場,列陣吧。","先道歉,再談別的。","今天不宜。改天大吉。","與其問,不如先做一小步。",
"會成,但比你想的慢。","會成,而且比你想的快。","不會成——但你會因此遇到更好的。","把它寫下來,你就會看見漏洞。","找個人商量,別單打獨鬥。",
"這件事,錢不是重點。","這件事,錢就是重點。","相信第一直覺。","第一直覺這次錯了,再想想。","對方比你更緊張。",
"先照顧好身體,其餘都是後話。","機會只敲這一次門。","這扇門關了,但走廊還很長。","半年後你會感謝今天的決定——所以決定吧。","別在生氣的時候做這個決定。",
"可以冒險,記得繫好安全繩。","守住原本的計畫。","計畫該改了,別戀舊。","有人在等你先開口。","沉默是目前最好的回答。",
"說出來吧,憋著會內傷。","這是考驗,不是懲罰。","你把它想得太嚴重了。","你把它想得太簡單了。","帶傘。有備無患的那種帶傘。",
"老朋友手上有你要的線索。","答案在你上次放棄的地方。","重讀一遍,再簽字。","不要跟情緒討價還價,先離開現場。","是緣分,但緣分也需要人經營。",
"不是緣分,是習慣。分清楚。","明知故問。去做。","明知故問。快逃。","給它三個月,到期不好轉就撤。","這次讓別人贏,你贏更大的。",
"小賠即止,別想翻本。","該花的錢,花下去會回來。","省下這筆,你會慶幸。","你缺的不是機會,是休息。","你缺的不是休息,是決心。",
"已經在路上了,再等三天。","換一條路,同一個目的地。","目的地錯了,路再對也沒用。","先完成,再完美。","這件事值得做到完美。",
"別人怎麼想,真的沒那麼重要。","這次,別人的眼光是對的。","把驕傲收起來,把電話打出去。","你不欠任何人交代。","你欠自己一個交代。",
"天快亮了,再撐一夜。","現在退場,是智慧不是懦弱。","種下去。收成是秋天的事。","今天只做最小的那一步。","把門鎖好,把心敞開。",
"舊的不去,新的進不來——去吧。","留著。它還有用。","這個人可以深交。","這個人點到為止就好。","熱鬧是他們的,你早點回家。",
"去湊這個熱鬧,好運藏在人群裡。","先數到十,再回這則訊息。","不回覆,也是一種回覆。","你演得太用力了,做自己比較省力。","認錯不會輸,嘴硬才會。",
"這筆帳,算了比算清划算。","記在帳上,日後有用。","別把梯子借給拆你牆的人。","幫這個忙,福報在後頭。","這個忙幫不得。",
"萬事俱備,你就是那陣東風。","還缺一樣,補齊再動。","答案是「好,但不是跟這個人」。","答案是「好,但不是現在」。","就是這個人,別再東張西望。",
"鏡子裡的那位,才是問題的答案。","燭火搖了搖,說:隨喜。","天機不可洩漏——因為連天也還沒定,你先動,天跟著你。","這一句留白。你寫下的,才算數。","闔上書,去生活。"
];
DC.QS_MINI = [
["太公釣渭","上上","渭水悠悠八十秋/直鉤釣得帝王舟/風雲一旦從龍起/白髮封侯萬事酬"],
["塞翁失馬","中吉","失馬何須問吉凶/塞垣秋草自從容/福兮禍所倚伏處/得失到頭一笑逢"],
["精衛填海","下籤","口銜木石向滄溟/浪打孤羽誓不停/精衛有心天不管/千年空聽海濤聲"],
["蕭何追韓信","上吉","月下輕騎不忍還/追回國士定江山/明珠豈肯藏塵久/一薦登壇天下安"],
["守株待兔","中平","偶得奔兔撞枯樁/便向田頭日日望/歲晚荒畦人笑處/守來守去兩茫茫"],
["魚躍龍門","上上","禹門三級浪如雷/千尾爭趨勢欲摧/一躍天梯雲作路/從今平地起風雷"],
["臥薪嘗膽","中吉","膽味懸門日日嘗/柴薪作枕夜凝霜/十年生聚十年訓/一旦姑蘇霸業償"],
["杞人憂天","中平","杞國有人憂天傾/寢食俱廢瘦骨形/天行有常終不墜/庸人自擾負此生"],
["毛遂自薦","上吉","囊中錐穎久沉埋/一旦鋒芒自薦來/楚殿片言定歃血/始知庸眾有奇才"],
["四面楚歌","下下","垓下夜聞四面歌/八千子弟散如波/英雄至此天亡我/肯過江東奈若何"],
["孟母三遷","上吉","一遷再遷不辭勞/為擇芳鄰斷機教/莫道幼苗天性定/好泥培出棟樑高"],
["刻舟求劍","中平","劍落江心舟自行/船舷刻記笑談生/停舟按記尋遺處/水底茫茫月一泓"],
["鐵杵磨針","中吉","溪畔婆婆杵在手/問言磨作繡花針/謫仙從此收心去/鐵杵原來不負人"],
["覆水難收","下籤","盆水傾階不可收/當年輕別悔今休/馬前縱有還鄉印/難喚糟糠再點頭"],
["三顧茅廬","上上","風雪柴門三度敲/臥龍高枕未曾邀/精誠叩得先生起/一出隆中天下調"],
["亡羊補牢","中吉","夜半圈欄破一方/晨來屈指少三羊/及時修得牢籠固/餘群從此臥斜陽"],
["畫餅充飢","中平","紙上團圞一餅香/望來望去肚空腸/丹青縱好終難嚼/不若親炊黍一觴"],
["完璧歸趙","上吉","連城白璧入強秦/殿上睨柱氣凌雲/智勇周旋還故國/寶光依舊照趙人"],
["夸父逐日","下籤","逐日狂奔意氣豪/飲乾河渭渴難消/道傍棄杖成鄧林/追到黃昏日更遙"],
["柳暗花明","上吉","山窮水復路疑無/轉過溪橋景色殊/柳暗花明逢一村/人間何處不通途"],
["莊周夢蝶","中平","莊生曉夢化蝶飛/花底翩翩忘是非/醒後不知身是客/眼前真幻兩依依"],
["聞雞起舞","中吉","中夜荒雞喔喔啼/攬衣把劍舞霜庭/但教筋骨常磨礪/他日中原任爾行"],
["葉公好龍","中平","畫棟雕龍色色新/真龍一顧失精神/世間多少慕名客/愛到臨頭始見真"],
["破鏡重圓","上吉","半面菱花各自藏/天涯人海兩茫茫/中秋市上高聲賣/照影重圓喜欲狂"],
["大意失荊州","下下","威震華夏一時雄/白衣渡江燈火中/麥城路窄天將曉/回首荊州煙雨濛"],
["圯上納履","中吉","圯橋墮履試孺子/俯身長跪奉還之/一卷兵書酬折節/運籌帷幄看他時"],
["井底之蛙","中平","一井青天曰大觀/坐談滄海笑波瀾/何當躍上欄邊看/始信乾坤萬里寬"],
["枯木逢春","上上","雪壓霜欺歲月深/斷枝誰信有春心/東風一夜吹芽動/老幹重開花滿林"],
["蘇武歸漢","上吉","雪窖冰天十九年/節旄落盡志彌堅/雁書一到單于帳/白髮持旌入漢天"],
["揠苗助長","下籤","宋人憫苗日日量/嫌遲親手拔苗長/歸家自詡功勞大/明日田中盡槁黃"],
["管鮑之交","中吉","貧時分利每多求/鮑叔知君非為謀/薦作齊相成霸業/知心一個勝千儔"],
["杯弓蛇影","中平","壁上雕弓落酒卮/杯中疑見小蛇移/心頭一釋沉痾去/天下本無庸自疑"],
["田忌賽馬","中吉","三番賭馬局初開/先棄一場莫論衰/調度中間藏勝著/輸贏原在算籌來"],
["飛蛾撲火","下下","一點寒燈焰正嬌/紛紛翠羽撲光跳/明知火裡無生路/猶把殘軀葬此宵"],
["囊螢映雪","上吉","囊裡流螢當燭光/窗前積雪映書黃/寒門莫嘆無燈火/自有功名雪夜藏"],
["東施效顰","中平","西子捧心病亦妍/東鄰依樣蹙眉尖/不知妍醜由天賦/依樣葫蘆惹笑喧"],
["大禹治水","上上","父鯀堙川川愈狂/禹疏九河水歸洋/三過家門聽兒哭/一片神州始種桑"],
["螳螂捕蟬","下籤","寒蟬飲露噪高枝/螳臂藏花欲進時/黃雀窺螳人挾彈/眼前之利後頭危"],
["老馬識途","中吉","迷谷茫茫失故蹊/風沙目斷馬頻嘶/放韁一任識途走/踏出山前舊路泥"],
["昭君出塞","中平","毛延壽筆誤傾城/馬上琵琶出塞行/朔漠風沙五十載/換來邊塞息刀兵"],
["班超投筆","上吉","案牘勞形歲月侵/擲毫一嘆立雄心/玉門關外三十國/萬里封侯自此尋"],
["鷸蚌相爭","下籤","蚌殼初開曬晚沙/鷸喙一啄兩相夾/相持不放漁翁至/雙雙提入酒人家"],
["程門立雪","中吉","同侍程門雪正飛/不驚師夢立多時/醒來門外深盈尺/道在誠中不在辭"],
["買櫝還珠","中平","楚人賣珠飾其函/珠光反被匣光掩/鄭人買櫝還珠去/世上幾人識內涵"],
["衣錦還鄉","上上","十年燈火別家山/一領宮袍奪目還/父老爭看橋上過/兒時溪水亦開顏"],
["濫竽充數","下籤","齊王愛聽合竽鳴/南郭先生混隊行/一旦新君要獨奏/連夜收拾出都城"],
["負荊請罪","上吉","負荊肉袒到門前/一揖冰消積歲嫌/將相和時強虜懼/兩心共把趙家肩"],
["疑鄰盜斧","中平","一柄斨斤失屋隅/鄰家童子步趨趨/看他言動無非盜/斧在谷中疑自無"],
["賣油翁","中吉","銅錢覆口一絲孔/瀝油如線不沾濡/莫誇神射穿楊柳/惟手熟爾百巧無"],
["泥牛入海","下下","泥牛昂首入滄溟/浪捲濤吞四體平/縱有音書憑誰寄/茫茫從此無回聲"],
["愚公移山","上吉","一擔一鋤朝復朝/兒孫接力志不搖/山靈也怕痴心客/自遣夸娥背走霄"],
["朝三暮四","中平","狙公賦芧限晨昏/朝三暮四眾狙嗔/改言朝四暮三顆/一樣七枚喜煞人"],
["曲突徙薪","中吉","煙囪太直柴堆近/過客殷勤勸改遷/不聽終遭回祿禍/方知先見值千金"],
["邯鄲學步","下籤","壽陵少年慕邯鄲/學步橋頭日日看/新步未成舊步失/歸來匍匐出重關"],
["紅葉題詩","上吉","深宮紅葉御溝流/題句無心付水悠/流到人間逢韓氏/良緣原自不須求"],
["騎驢覓驢","中平","跨下毛驢步步隨/沿街高問我驢誰/兒童拍手笑翁憨/低頭一看笑自癡"],
["中流擊楫","中吉","樓船北渡大江秋/擊楫中流誓不休/不復中原終不返/一篙撐破萬層愁"],
["畫蛇添足","中平","祠餘卮酒賞舍人/畫地為蛇先者飲/蛇成更與添四足/持杯反落後來人"],
["舜耕歷山","上上","歷山躬稼德風行/讓畔讓居民自成/堯帝聞賢妻二女/一犁耕出帝王名"],
["荊軻刺秦","下籤","風蕭蕭處易水寒/壯士一去不復還/圖窮匕見功虧簣/留與千秋擊築彈"],
["木蘭凱旋","上吉","替爺征戍十二冬/百戰歸來氣若虹/天子策勳辭厚祿/當窗理鬢舊房櫳"],
["三人成虎","中平","市上何曾有虎行/一人言虎二人驚/三人齊說虎真至/百口鑠金疑自生"],
["庖丁解牛","中吉","十九年來刃若新/未嘗硬碰骨與筋/目中不見全牛日/遊刃恢恢自有神"],
["霸王別姬","下下","蓋世英雄困垓臺/悲歌帳下淚成杯/紅顏劍底成永訣/從此江東不再來"],
["鑿壁偷光","上吉","鄰燭輝輝隔壁明/鑿來一線讀書聲/寒門不鎖凌雲志/借得微光照錦程"],
["半途而廢","下籤","行到中途意已闌/回頭便棄舊時鞍/機絲一斷難成匹/惜取當初上路難"],
["結草銜環","中吉","嫁妾一言活一人/戰陣結草躓秦臣/銜環黃雀酬恩客/善念原來有果因"],
["水中撈月","中平","碧井沉沉月一輪/群猴連臂下深津/攪殘波影空歡喜/抬首青天月是真"],
["雲開見月","上上","連宵風雨暗千村/雲幕沉沉月無痕/一夜天公收霧氣/清光依舊滿乾坤"],
["狐假虎威","中平","狐前虎後過山林/百獸奔逃各失魂/莫道狐狸真有勢/威風原是虎之尊"],
["順水行舟","上吉","一篙點破碧粼粼/兩岸青山迎送頻/風正帆懸舟似箭/千里江陵半日臻"],
["對症下藥","中吉","二人同訴頭疼疾/一瀉一發藥不同/病在表裡分明處/神醫下手自從容"],
["賠了夫人又折兵","下籤","巧計招親弄假真/洞房花燭鎖郎君/歸舟已載夫人去/岸上空追折卻軍"],
["嚴陵釣灘","中平","羊裘獨釣富春江/故友龍飛我自藏/加足帝腹渾閒事/一竿風月勝侯王"],
["蘇秦刺股","上吉","說秦失意敝貂還/嫂不為炊妻不歡/錐股一年書讀破/再過洛陽人仰觀"],
["望梅止渴","中平","炎天失道井泉空/士卒唇焦步不前/遙指梅林酸滿口/生津一路到山泉"],
["司馬光破缸","中吉","稚子失身沉甕中/群兒繞走哭聲同/小光拾石當機斷/水瀉缸開救友童"],
["火中取栗","下籤","火裡分明栗子香/貓兒受攛探爐膛/爪焦不見一顆栗/都入靈猴口袋藏"],
["精誠所至","上吉","暮色茫茫石似虎/將軍滿引一弓開/鏃鋒沒羽石中去/精誠至處金石開"],
["五十步笑百步","中平","鼓聲才動棄戈奔/五十步停回首喧/笑彼百步同是走/半斤八兩莫相言"],
["拋磚引玉","中吉","壁上先題兩句詩/瓦磚拋處玉來遲/果然妙手續高唱/以小引大正此時"],
["泣血杜鵑","下籤","蜀魄千年恨未消/聲聲啼血染花梢/不如歸去不如去/月冷空山夜夜號"],
["桃園結義","上吉","桃園花底誓詞同/異姓從茲骨肉融/患難相扶三十載/義字千秋照史紅"],
["掩耳盜鈴","中平","舉椎擊鐘鐘自鳴/掩他雙耳竊鐘行/聲在人間掩在己/自欺從來欺不成"],
["曹沖秤象","中吉","巨象登舟水記痕/化整為零石代身/累石稱來知象重/童心一點勝千鈞"],
["竹籃打水","下籤","提籃下井意殷勤/汲得清泉眼底新/走到半途篩漏盡/空籃依舊付風塵"],
["蟠桃獻壽","上吉","三千年結一番桃/王母瑤池宴碧霄/獻上長生添海屋/彩雲深處鶴聲遙"],
["黔驢技窮","下籤","龐然大物入黔中/一吼曾教虎膽空/蹄盡技窮遭一噬/虛聲原不敵真功"],
["他山之石","中吉","本山玉璞磨難成/借取他山礪石平/攻錯從來資異質/虛懷納諫器方成"],
["退避三舍","中吉","城濮旌旗蔽日開/楚軍驕氣逐風來/三舍一退酬前諾/誘得深入一鼓摧"],
["陶潛歸去","中平","不堪束帶見鄉兒/五斗折腰非我期/歸去來兮田未蕪/東籬采菊晚山知"],
["高山流水","中平","峨峨太山洋洋水/一曲瑤琴誰解聽/鍾期一去弦音絕/千古知音最難尋"],
["撥雲見日","上吉","濃雲蔽日晝如昏/忽有天風掃霧痕/萬里晴光重照眼/山河草木盡朝暾"],
["老蚌生珠","中吉","深川老蚌閉重扉/歲歲含沙人笑痴/一旦剖開光滿室/方知遲得是明珠"],
["一葦渡江","上吉","隻履西歸事渺茫/先傳一葦渡長江/身輕原是心頭定/彼岸從來在腳旁"],
["燕巢幕上","下籤","繡幕銜泥築小窩/雙飛猶自唱春歌/堂前幕布朝夕捲/安樂窩中危機多"],
["錦上添花","上吉","一機雲錦已光華/更有春風送好花/喜事重重連夜至/門前車馬賀聲嘩"],
["雪中送炭","上吉","朔風卷地雪盈扉/爐冷囊空客不歸/忽有故人擔炭至/一星火暖萬愁微"],
["破釜沉舟","中吉","釜破舟沉渡大河/三分糧盡勇心多/一鼓九戰秦師潰/從茲天下識英髦"],
["否極泰來","上上","陰剝將殘陽自回/河冰解凍百花開/從來否極泰相繼/守到春風自此來"]
];
/* ── ?selftest=1:自檢結果進標題(無頭驗收用;node 環境自動跳過) ── */
if (typeof location !== "undefined" && typeof document !== "undefined" && location.search.indexOf("selftest") >= 0) {
  setTimeout(function () {
    try {
      var r = String(DC.selfTest());
      var bad = r.split("\n").filter(function (s) { return s.indexOf("✗") === 0; });
      document.title = bad.length ? "SELFTEST-FAIL-" + bad.length : "SELFTEST-OK";
      var d = document.createElement("div"); d.id = "selftest-dump"; d.hidden = true; d.textContent = r;
      document.body.appendChild(d);
    } catch (e) { document.title = "SELFTEST-ERR " + e.message; }
  }, 50);
}
