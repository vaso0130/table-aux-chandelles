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
    const hdT = DC.humanDesign(1990, 5, 15, 10, 0, 8); // 人類圖錨例:太陽弧差恆 88°,樣本命盤鎖定
    t("人類圖:1990-05-15 錨例", hdT.pers[0].gate === 23 && hdT.pers[0].line === 6 && hdT.des[0].gate === 30 && hdT.type === "P" && hdT.profile === "6/2" && hdT.channels.length === 5,
      hdT.pers[0].gate + "." + hdT.pers[0].line + "/" + hdT.des[0].gate + " " + hdT.type + " " + hdT.profile);
    t("人類圖:曼陀羅錨點", DC.hdGate(302).gate === 41 && DC.hdGate(0).gate === 25 && DC.hdGate(280.5).gate === 38,
      [302, 0, 280.5].map(x => DC.hdGate(x).gate).join(","));
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

/* ═══ 跨館共用 summarizer(單一事實來源:各館與 MIX 一律呼叫此處,勿再手刻) ═══ */
DC.hourBranch = function (h) { return Math.floor(((h % 24) + 1) / 2) % 12; }; // 時支(23時起子)
DC.effYearLichun = function (y, m, d, h, mi, tz) { // 立春換歲之有效年
  return DC.jd(y, m, d, h == null ? 12 : h, mi || 0, tz == null ? 8 : tz) >= DC.solarTerm(y, 315) ? y : y - 1;
};
DC.meihuaTime = function (y, mo, d, h, tz) { // 梅花時間卦(邵子古法:農曆年月日+時支;年支以正月初一換歲)
  const lun = DC.lunar(y, mo, d, tz == null ? 8 : tz);
  const yB = DC.lunarYearGZ(y, mo, lun).b;
  const hb = DC.hourBranch(h);
  const uN = (yB + 1) + lun.month + lun.day, lN = uN + hb + 1;
  return { mh: DC.meihua(uN, lN, lN), lun, yB, hb, uN, lN };
};
DC.dangsaju = function (y, m, d, h, tz) { // 唐四柱:陰曆歸年起星,年月日時四落點
  const lun = DC.lunar(y, m, d, tz == null ? 8 : tz);
  const yB = DC.lunarYearGZ(y, m, lun).b;
  const hb = DC.hourBranch(h);
  const pM = (yB + lun.month - 1) % 12, pD = (pM + lun.day - 1) % 12, pH = (pD + hb) % 12;
  return { lun, yB, hb, pos: [yB, pM, pD, pH] };
};
DC.STAGE12 = ["長生", "沐浴", "冠帶", "臨官", "帝旺", "衰", "病", "死", "墓", "絕", "胎", "養"];
DC.CHANGSHENG = [11, 6, 2, 9, 2, 9, 5, 0, 8, 3]; // 十干長生位:甲亥乙午丙戊寅丁己酉庚巳辛子壬申癸卯
DC.twelveUn = function (dayStem, branch, style) { // 十二運;style "he"=和流(臨官稱建禄)
  const idx = dayStem % 2 === 0
    ? ((branch - DC.CHANGSHENG[dayStem]) % 12 + 12) % 12
    : ((DC.CHANGSHENG[dayStem] - branch) % 12 + 12) % 12;
  const name = DC.STAGE12[idx];
  return style === "he" && name === "臨官" ? "建禄" : name;
};
DC.nineStarBoard = function (effYear) { // 九星年盤飛泊:中宮星/查宮函式/五黃與暗劍殺方(五黃入中則無)
  const yearStar = DC.nineStarYear(effYear);
  const palaceStar = function (p) { return ((yearStar - 1 + (p - 5)) % 9 + 9) % 9 + 1; };
  let wuhuang = 5;
  for (let p = 1; p <= 9; p++) if (palaceStar(p) === 5) wuhuang = p;
  const OPP = { 1: 9, 9: 1, 2: 8, 8: 2, 3: 7, 7: 3, 4: 6, 6: 4, 5: 5 };
  return { yearStar, palaceStar, wuhuang, anjian: OPP[wuhuang], center: wuhuang === 5 };
};
DC.qimenNianming = function (qm, year) { // 奇門年命:主流「年干落宮」+輔「年支寄宮」
  const yIdx = ((year - 4) % 60 + 60) % 60, yS = yIdx % 10, yB = yIdx % 12;
  const ch = yS === 0 ? ["戊", "己", "庚", "辛", "壬", "癸"][Math.floor(yIdx / 10)] : DC.STEMS[yS];
  let g = 0;
  for (const p of [1, 8, 3, 4, 9, 2, 7, 6]) if (qm.tianpan[p] && qm.tianpan[p].stem.includes(ch)) { g = p; break; }
  return { ch, ganGong: g, zhiB: yB, zhiGong: DC.BR_PALACE[yB] };
};
DC.qimenDayYongshen = function (qm, y, m, d, tz) { // 奇門時間用神:所問之日干支入局
  const bzT = DC.bazi(y, m, d, 12, 0, tz == null ? 8 : tz);
  const yiX = ["戊", "己", "庚", "辛", "壬", "癸"][Math.floor(bzT.dIdx / 10)];
  const jia = bzT.pillars[2].s === 0;
  const ch = jia ? yiX : DC.STEMS[bzT.pillars[2].s];
  let tG = 0;
  for (const p of [1, 8, 3, 4, 9, 2, 7, 6]) if (qm.tianpan[p] && qm.tianpan[p].stem.includes(ch)) { tG = p; break; }
  let dG = 0;
  for (let p = 1; p <= 9; p++) if (qm.dipan[p] === ch) { dG = p; break; }
  if (dG === 5) dG = 2;
  return { bzT, ch, jia, yi: yiX, tG, dG, bG: DC.BR_PALACE[bzT.pillars[2].b] };
};
/* ═══ 人類圖 Human Design(2026-08 三期③)═══
   回歸黃道;設計端=本命太陽前 88° 日弧之時刻(牛頓迭代);
   曼陀羅:閘門41起於302°(水瓶2°),每門5.625°、每爻0.9375°;
   交點採平均交點(與官方真交點差<1.7°,爻位邊界者於提示詞註明)。 */
DC.HD_SEQ = [41, 19, 13, 49, 30, 55, 37, 63, 22, 36, 25, 17, 21, 51, 42, 3, 27, 24, 2, 23, 8, 20, 16, 35, 45, 12, 15, 52, 39, 53, 62, 56, 31, 33, 7, 4, 29, 59, 40, 64, 47, 6, 46, 18, 48, 57, 32, 50, 28, 44, 1, 43, 14, 34, 9, 5, 26, 11, 10, 58, 38, 54, 61, 60];
DC.HD_CENTERS = ["頭腦", "概念(Ajna)", "喉嚨", "G(自我)", "意志(心)", "薦骨", "直覺(脾)", "情緒(太陽神經叢)", "根部"];
DC.HD_GC = { 64: 0, 61: 0, 63: 0, 47: 1, 24: 1, 4: 1, 17: 1, 43: 1, 11: 1,
  62: 2, 23: 2, 56: 2, 35: 2, 12: 2, 45: 2, 33: 2, 8: 2, 31: 2, 20: 2, 16: 2,
  1: 3, 13: 3, 25: 3, 46: 3, 2: 3, 15: 3, 10: 3, 7: 3, 26: 4, 51: 4, 21: 4, 40: 4,
  34: 5, 5: 5, 14: 5, 29: 5, 59: 5, 9: 5, 3: 5, 42: 5, 27: 5,
  48: 6, 57: 6, 44: 6, 50: 6, 32: 6, 28: 6, 18: 6, 36: 7, 22: 7, 37: 7, 6: 7, 49: 7, 55: 7, 30: 7,
  53: 8, 60: 8, 52: 8, 19: 8, 39: 8, 41: 8, 58: 8, 38: 8, 54: 8 };
DC.HD_CHANNELS = [[1, 8, "啟發"], [2, 14, "脈動"], [3, 60, "突變"], [4, 63, "邏輯"], [5, 15, "韻律"], [6, 59, "親密"],
  [7, 31, "領導"], [9, 52, "專注"], [10, 20, "覺醒"], [10, 34, "探索"], [10, 57, "完美形式"], [11, 56, "好奇"],
  [12, 22, "開放"], [13, 33, "浪子"], [16, 48, "才華"], [17, 62, "接受"], [18, 58, "批判"], [19, 49, "整合"],
  [20, 34, "魅力"], [20, 57, "腦波"], [21, 45, "金錢線"], [23, 43, "架構"], [24, 61, "察覺"], [25, 51, "發起"],
  [26, 44, "臣服"], [27, 50, "保存"], [28, 38, "掙扎"], [29, 46, "發現"], [30, 41, "夢想"], [32, 54, "蛻變"],
  [34, 57, "力量"], [35, 36, "無常"], [37, 40, "社群"], [39, 55, "情緒表達"], [42, 53, "成熟"], [47, 64, "抽象"]];
DC.HD_TYPES = {
  M: { name: "顯示者 Manifestor", strat: "行動前告知受影響的人", sig: "平和", notself: "憤怒" },
  G: { name: "生產者 Generator", strat: "等待,然後回應", sig: "滿足", notself: "挫敗" },
  MG: { name: "顯示生產者 Manifesting Generator", strat: "等待回應,行動前告知", sig: "滿足(兼平和)", notself: "挫敗(兼憤怒)" },
  P: { name: "投射者 Projector", strat: "等待被認可與邀請", sig: "成功", notself: "苦澀" },
  R: { name: "反映者 Reflector", strat: "等待一個月循環(約28天)再決定", sig: "驚喜", notself: "失望" }
};
DC.HD_PROFILE = { "1/3": "探究者/烈士", "1/4": "探究者/機會主義者", "2/4": "隱士/機會主義者", "2/5": "隱士/異端者",
  "3/5": "烈士/異端者", "3/6": "烈士/人生典範", "4/6": "機會主義者/人生典範", "4/1": "機會主義者/探究者",
  "5/1": "異端者/探究者", "5/2": "異端者/隱士", "6/2": "人生典範/隱士", "6/3": "人生典範/烈士" };
DC.hdGate = function (lon) { // 黃經→閘門.爻
  const off = (((lon - 302) % 360) + 360) % 360;
  const idx = Math.floor(off / 5.625);
  return { gate: DC.HD_SEQ[idx], line: Math.floor((off - idx * 5.625) / 0.9375) + 1 };
};
DC.humanDesign = function (y, m, d, h, mi, tz) {
  const rv = a => ((a % 360) + 360) % 360, rv180 = a => ((a % 360) + 540) % 360 - 180;
  const jdP = DC.jd(y, m, d, h, mi, tz);
  const sunP = DC.sunLon(jdP);
  let jdD = jdP - 88 / 0.985647;                       // 設計端:太陽退 88° 之時刻
  for (let i = 0; i < 10; i++) jdD += rv180(rv(sunP - 88) - DC.sunLon(jdD)) / 0.985647;
  const pts = jd => {
    const ch = DC.chart(jd), o = [];
    const push = (id, zh, gl, lon) => { const g = DC.hdGate(lon); o.push({ id, zh, gl, lon: rv(lon), gate: g.gate, line: g.line }); };
    const by = id => ch.find(p => p.id === id);
    push("sun", "太陽", "☉", by("sun").lon);
    push("ear", "地球", "⊕", by("sun").lon + 180);
    push("moo", "月亮", "☽", by("moo").lon);
    push("nn", "北交點", "☊", by("nod").lon);
    push("sn", "南交點", "☋", by("nod").lon + 180);
    for (const k of ["mer", "ven", "mar", "jup", "sat", "ura", "nep", "plu"]) push(k, by(k).zh, by(k).gl, by(k).lon);
    return o;
  };
  const pers = pts(jdP), des = pts(jdD);
  const gates = new Set();
  pers.forEach(p => gates.add(p.gate)); des.forEach(p => gates.add(p.gate));
  const channels = DC.HD_CHANNELS.filter(c => gates.has(c[0]) && gates.has(c[1]));
  const defined = new Set();
  channels.forEach(c => { defined.add(DC.HD_GC[c[0]]); defined.add(DC.HD_GC[c[1]]); });
  // 中心連通性(僅算已定義通道連起的已定義中心)
  const adj = {}; defined.forEach(c => adj[c] = new Set());
  channels.forEach(c => { const a = DC.HD_GC[c[0]], b = DC.HD_GC[c[1]]; if (a !== b) { adj[a].add(b); adj[b].add(a); } });
  const comp = {}; let nComp = 0;
  defined.forEach(c => {
    if (comp[c] != null) return;
    nComp++; const st = [c]; comp[c] = nComp;
    while (st.length) { const u = st.pop(); adj[u].forEach(v => { if (comp[v] == null) { comp[v] = nComp; st.push(v); } }); }
  });
  const reach = (from, to) => defined.has(from) && defined.has(to) && comp[from] === comp[to];
  const motorThroat = [4, 5, 7, 8].some(mo => reach(mo, 2));
  let type;
  if (!defined.size) type = "R";
  else if (defined.has(5)) type = motorThroat ? "MG" : "G";
  else type = motorThroat ? "M" : "P";
  let auth;
  if (defined.has(7)) auth = "情緒權威——沒有當下的真實,等情緒波過完再決定";
  else if (defined.has(5)) auth = "薦骨權威——聽當下的直覺聲音(嗯哼/嗯嗯)回應";
  else if (defined.has(6)) auth = "直覺權威——當下一閃而過的微弱訊號,只說一次";
  else if (defined.has(4)) auth = "意志權威——聽自己說出口的承諾與想要";
  else if (defined.has(3)) auth = "自我投射權威——透過說話聽見自己的方向";
  else if (type === "R") auth = "月循環權威——跟著月亮走完 28 天再定";
  else auth = "無內在權威(環境權威)——在對的環境與信任的人面前談,答案自然浮現";
  const pf = pers[0].line + "/" + des[0].line;
  const DEFN = ["", "一分人(能量一氣呵成)", "二分人(兩區各自運作,需橋樑)", "三分人(三區,需多元人際)", "四分人(四區,極需他人)"];
  const cross = "(" + pers[0].gate + "/" + pers[1].gate + " | " + des[0].gate + "/" + des[1].gate + ")";
  const angle = pf === "4/1" ? "並置十字" : (pers[0].line < des[0].line ? "右角度十字" : "左角度十字"); // 右角:1/3~4/6;左角:5/1~6/3
  return { jdP, jdD, pers, des, gates, channels, defined, nComp, type, T: DC.HD_TYPES[type], auth,
    profile: pf, profileName: DC.HD_PROFILE[pf] || "", defName: defined.size ? DEFN[nComp] : "無定義(反映者)", cross, angle };
};