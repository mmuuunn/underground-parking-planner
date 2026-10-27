/* 지하주차 계획 엔진 — 곡선 램프 생성기(로드맵 단계 1). 계약: 04_docs/underground-curved-ramp-contract.md v0.2.
 * 원호 1개 + 위·아래 직선. 진행은 위층 → 아래층, 착지점은 아래층 끝의 법령상 차로 너비 띠 중앙, 내려가며 좌회전이면 안쪽 = 왼쪽.
 * 법규 판정은 하지 않는다: 판정기 입력(evaluatorRamp)과 후보 도형(candidateRamp)을 내고, 입력 오류·자기 겹침·완화 자리 없음만 violations에 적는다.
 * 모든 선은 원호 중심에서 잰 "반경" r 하나로 표현한다(직선 구간은 같은 r을 띠 중앙에서 Rc − r 만큼 옆으로 민 선).
 */
(function (root) {
  'use strict';
  // 생성기의 높이 배분 상한(0.1% 단위 정수). 판정은 판정기가 규칙 데이터로 다시 한다
  const CAP = {curve: 140, straight: 170};
  const SAG_MM = 10, SLIVER_MM = 1000;
  const ENUM = {radiusReference: ['innerWallFace', 'innerCurbWallSide'], widthReference: ['curbWallSides', 'wallToWall'], gradeReference: ['laneCenter', 'conservativeInner']};
  const fin = Number.isFinite, isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]], mul = (a, k) => [a[0] * k, a[1] * k];
  const rot = (p, t) => { const c = Math.cos(t), s = Math.sin(t); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c]; };
  const cap = (kind, len) => Math.floor(CAP[kind] * len / 1000);
  const pt2 = (p) => Array.isArray(p) && p.length === 2 && p.every(fin);

  // 아래로 h를 구간들에 나눈다: 무게 비례 내림 → 남는 mm는 앞(위)부터 1mm씩, 각 구간은 용량까지
  function fill(segs, h, wt = (s) => s.lengthMm) {
    let left = h;
    const tot = segs.reduce((s, x) => s + wt(x), 0);
    if (!tot) return left;
    for (const s of segs) { const g = Math.min(Math.floor(h * wt(s) / tot), s.cap - s.h); s.h += g; left -= g; }
    while (left > 0 && segs.some((s) => s.h < s.cap)) for (const s of segs) if (left > 0 && s.h < s.cap) { s.h++; left--; }
    return left;
  }
  // 이웃하지 않는 변끼리 교차하면 자기 겹침
  function selfCrosses(P) {
    const n = P.length, o = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const a = P[i], b = P[(i + 1) % n], c = P[j], d = P[(j + 1) % n];
      if (o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0) return true;
    }
    return false;
  }

  function createCurve(spec) {
    const V = [], bad = (field, note) => V.push({id: 'INPUT_ERROR', field, note});
    spec = isObj(spec) ? spec : {};
    const id = typeof spec.id === 'string' && spec.id.trim() ? spec.id : null;
    if (!id) bad('id', '램프 id가 없습니다');
    const nonNeg = (v, field, def) => { const x = v === undefined ? def : v; if (!fin(x) || x < 0) { bad(field, `${field}는 0 이상의 수여야 합니다`); return 0; } return x; };
    const pair = (v, field, def, optional) => { if (v === undefined && optional) return null; const o = v === undefined ? {inner: def, outer: def} : v; if (!isObj(o)) { bad(field, `${field}는 {inner, outer}여야 합니다`); return {inner: 0, outer: 0}; } return {inner: nonNeg(o.inner, field + '.inner', optional ? undefined : def), outer: nonNeg(o.outer, field + '.outer', optional ? undefined : def)}; };
    if (!pt2(spec.landing)) bad('landing', '착지점이 올바르지 않습니다');
    const tl = pt2(spec.tangent) ? Math.hypot(...spec.tangent) : 0;
    if (!(tl > 1e-9) || !fin(tl)) bad('tangent', '진행 방향의 길이가 0이거나 올바르지 않습니다');
    if (!['left', 'right'].includes(spec.turn)) bad('turn', "turn은 'left' 또는 'right'여야 합니다");
    if (!fin(spec.turnDeg) || !(spec.turnDeg > 0 && spec.turnDeg < 360)) bad('turnDeg', '회전각은 0° 초과 360° 미만이어야 합니다');
    if (!fin(spec.innerRadiusMm) || !(spec.innerRadiusMm > 0)) bad('innerRadiusMm', '내변반경은 0보다 커야 합니다');
    if (!fin(spec.legalLaneWidthMm) || !(spec.legalLaneWidthMm > 0)) bad('legalLaneWidthMm', '법령상 차로 너비는 0보다 커야 합니다');
    if (![1, 2].includes(spec.lanes)) bad('lanes', '차로 수는 1 또는 2여야 합니다');
    const wtc = pair(spec.wallToCurbMm, 'wallToCurbMm', 300), curbH = pair(spec.curbHeightMm, 'curbHeightMm', 150), curbW = pair(spec.curbWidthMm, 'curbWidthMm', undefined, true);
    const drain = nonNeg(spec.drainMarginMm, 'drainMarginMm', 0), Lt0 = nonNeg(spec.straightTopMm, 'straightTopMm', 0), Lb0 = nonNeg(spec.straightBottomMm, 'straightBottomMm', 0);
    if (spec.transitions !== undefined && !isObj(spec.transitions)) bad('transitions', 'transitions는 {topMm, bottomMm}여야 합니다');
    const tr = isObj(spec.transitions) ? spec.transitions : {}, tTop = nonNeg(tr.topMm, 'transitions.topMm', 0), tBot = nonNeg(tr.bottomMm, 'transitions.bottomMm', 0);
    const ms = spec.measurement === undefined ? {} : spec.measurement, M = {};
    if (!isObj(ms)) bad('measurement', 'measurement는 객체여야 합니다');
    for (const [k, opts] of Object.entries(ENUM)) { const v = isObj(ms) && ms[k] !== undefined ? ms[k] : opts[0]; if (!opts.includes(v)) bad('measurement.' + k, `${k}는 ${opts.join('/')} 중 하나여야 합니다`); M[k] = v; }
    // 높이: 완전한 connects → 그대로, connects가 아예 없을 때만 층고
    const lv = isObj(spec.levels) ? spec.levels : {}, assumptions = [], int = (v) => Number.isSafeInteger(v);
    let up = null, lo = null;
    if (lv.connects !== undefined) {
      const c = isObj(lv.connects) ? lv.connects : {};
      if (!int(c.upperLevelMm) || !int(c.lowerLevelMm)) bad('levels.connects', '위·아래 고도는 둘 다 정수 mm여야 합니다(층고로 채우지 않음)'); else { up = c.upperLevelMm; lo = c.lowerLevelMm; }
    } else if (isObj(lv.floor)) {
      if (!int(lv.floor.levelMm) || !int(lv.floor.heightMm)) bad('levels.floor', '층 고도·층고는 정수 mm여야 합니다'); else { up = lv.floor.levelMm; lo = lv.floor.levelMm - lv.floor.heightMm; assumptions.push('층고로 고저차 가정'); }
    } else bad('levels', '높이 출처(connects 또는 floor)가 없습니다');
    if (up !== null && !(up > lo)) bad('levels', '위 끝이 아래 끝보다 높아야 합니다');
    const W = spec.legalLaneWidthMm;
    if (curbW && fin(W) && curbW.inner + curbW.outer >= W) bad('curbWidthMm', '연석 폭의 합이 법령상 차로 너비 이상입니다');
    // 선(원호 중심에서의 반경)
    const Rin = spec.innerRadiusMm, curbRef = M.radiusReference === 'innerCurbWallSide', wallW = M.widthReference === 'wallToWall';
    const rWallIn = curbRef ? Rin - wtc.inner : Rin;
    if (fin(Rin) && Rin > 0 && !(rWallIn > 0)) bad('innerRadiusMm', '안쪽 벽 반경이 0 이하입니다');
    if (V.length) return {kind: 'curve', id, body: null, violations: V};

    const bIn = wallW ? rWallIn : rWallIn + wtc.inner, Rc = bIn + W / 2;
    const rCurbIn = rWallIn + wtc.inner, rWallOut = (wallW ? bIn + W : bIn + W + wtc.outer) + drain, rCurbOut = rWallOut - drain - wtc.outer;
    const rLaneCenter = bIn + (spec.lanes === 2 ? W / 4 : W / 2), Rg = M.gradeReference === 'conservativeInner' ? rWallIn + (spec.lanes === 2 ? W / 4 : W / 2) : rLaneCenter; // 기본: 안쪽 차로 중심선(사용자 2026-10-26), 1차로는 차로 중심선
    const th = spec.turnDeg * Math.PI / 180, arcLen = Math.floor(Rg * th + 1e-9);
    if (arcLen < 1) return {kind: 'curve', id, body: null, violations: [{id: 'INPUT_ERROR', field: 'turnDeg', note: '회전각이 너무 작아 원호 길이가 1mm 미만입니다'}]};
    // 완화구간은 인접 직선 안에서 떼어 낸다
    let Lt = Lt0, Lb = Lb0;
    const segs = [];
    const take = (len, t, side) => { if (!t) return [len, 0]; if (len < t) { V.push({id: 'TRANSITION_NO_ROOM', field: 'transitions.' + side + 'Mm', note: `${side === 'top' ? '위' : '아래'} 직선(${len}mm)이 완화구간(${t}mm)보다 짧아 완화구간을 만들지 않았습니다`}); return [len, 0]; } return len - t < SLIVER_MM ? [0, len] : [len - t, t]; }; // 떼고 남은 직선이 1m 미만이면 완화구간에 합친다(경사 0인 조각이 꺾임을 만들지 않게)
    let tT, tB; [Lt, tT] = take(Lt, tTop, 'top'); [Lb, tB] = take(Lb, tBot, 'bottom');
    for (const [sid, kind, len] of [['top-transition', 'transition', tT], ['top-straight', 'straight', Lt], ['arc', 'curve', arcLen], ['bottom-straight', 'straight', Lb], ['bottom-transition', 'transition', tB]])
      if (len > 0) segs.push({id: sid, kind, lengthMm: len, cap: kind === 'transition' ? 0 : cap(kind, len), h: 0});
    // 높이 배분(곡선 계약 v0.4): 모든 구간에 "상한 경사 × 길이" 비례로 나눈다. 원호와 직선의 경사 차가 상한 차(3%p) 안이라 램프 안 꺾임(7%p)이 생기지 않는다.
    //   완화구간 목표 경사는 주 구간 최대 상한의 ½. 남는 mm는 주 구간 → 완화 순서로 위부터. 그래도 남으면 원호가 맡는다(길이를 늘리지 않음 → 판정기 R02 실패)
    const H = up - lo, arc = segs.find((s) => s.kind === 'curve'), mains = segs.filter((s) => s.kind !== 'transition'), trs = segs.filter((s) => s.kind === 'transition');
    const pmax = Math.max(...mains.map((s) => CAP[s.kind])), pct10 = (s) => (s.kind === 'transition' ? pmax / 2 : CAP[s.kind]);
    // 원호에 바로 붙은 완화구간은 곡선 꺾임 기준(7%p) + 0.5%p = 7.5% 이하(완화구간 계약 권장 검사)
    for (const s of trs) { const i = segs.indexOf(s), nb = s.id.startsWith('top') ? segs[i + 1] : segs[i - 1]; s.cap = Math.floor(s.lengthMm * (nb && nb.kind === 'curve' ? Math.min(pmax / 2, 75) : pmax / 2) / 1000); }
    let left = fill(segs, H, (s) => s.lengthMm * pct10(s));
    left = fill(mains, left); left = fill(trs, left);
    // 완화구간은 실제 최대 경사의 ½ 이하(완화구간 계약 D1): 넘친 mm는 주 구간(여유 있는 위부터), 없으면 원호로
    const mx = mains.reduce((p, s) => (s.h * p.lengthMm > p.h * s.lengthMm ? s : p));
    for (const t of trs) { const c = Math.floor(t.lengthMm * mx.h / (2 * mx.lengthMm)); if (t.h > c) { left += t.h - c; t.h = c; } }
    left = fill(mains, left);
    arc.h += left;
    let z = up;
    const segments = segs.map((s) => { const o = {id: s.id, kind: s.kind, lengthMm: s.lengthMm, startLevelMm: z, endLevelMm: z - s.h}; z -= s.h; return o; });

    // 도형: 착지 → 아래 직선 → 원호 → 위 직선(위 끝). 원호 분할은 가장 바깥 선의 처짐 ≤ 10mm
    const L = spec.landing.slice(), t = mul(spec.tangent, 1 / tl), sgn = spec.turn === 'left' ? 1 : -1, n = mul([-t[1], t[0]], sgn);
    const P1 = add(L, mul(t, -Lb0)), C = add(P1, mul(n, Rc)), t0 = rot(t, -sgn * th), n0 = rot(n, -sgn * th), P0 = add(C, mul(n0, -Rc)), start = add(P0, mul(t0, -Lt0));
    const k = Math.max(1, Math.ceil(th / (2 * Math.acos(Math.max(-1, 1 - SAG_MM / rWallOut))))) || 1;
    // 반경 r 선, 위 끝 → 아래 끝
    const line = (r) => {
      const off = (p, nn) => add(p, mul(nn, Rc - r)), out = [];
      if (Lt0 > 0) out.push(off(start, n0));
      for (let i = k; i >= 0; i--) out.push(add(C, mul(rot(n, -sgn * th * i / k), -r)));
      if (Lb0 > 0) out.push(off(L, n));
      return out;
    };
    const innerWall = line(rWallIn), outerWall = line(rWallOut), body = outerWall.concat(innerWall.slice().reverse());
    // 자기 겹침은 입력 오류(4장): 몸체를 내지 않는다
    if (selfCrosses(body)) return {kind: 'curve', id, body: null, violations: V.concat({id: 'SELF_OVERLAP', note: '램프 몸체가 스스로 겹칩니다 — 직선 길이나 회전각을 줄이세요'})};
    const curbs = {inner: {wallSide: line(rCurbIn), trafficSide: curbW ? line(rCurbIn + curbW.inner) : null}, outer: {wallSide: line(rCurbOut), trafficSide: curbW ? line(rCurbOut - curbW.outer) : null}};
    const hArc = arc.h, pct = (r) => hArc / (r * th) * 100;
    const measurement = {...M, basis: '관행·보수적 선택', decided: '사용자 2026-10-26'};
    const side = (inner, outer) => (sgn > 0 ? {left: inner, right: outer} : {left: outer, right: inner});
    const curbOf = (h, w) => ({heightMm: h, ...(w !== undefined ? {widthMm: w} : {})});
    const lengthMm = segments.reduce((s, x) => s + x.lengthMm, 0), wallToWallMm = rWallOut - rWallIn;
    const evaluatorRamp = {
      id, systemId: spec.systemId, ...(spec.operation !== undefined ? {operation: spec.operation} : {}), ...(spec.separatedInOut !== undefined ? {separatedInOut: spec.separatedInOut} : {}), lanes: spec.lanes,
      shape: {type: 'curve', innerRadiusMm: Rin, lengthMm},
      section: {legalLaneWidthMm: W, wallToWallMm, wallToCurbMm: side(wtc.inner, wtc.outer + drain), curb: side(curbOf(curbH.inner, curbW?.inner), curbOf(curbH.outer, curbW?.outer))},
      segments, connects: {upperLevelMm: up, lowerLevelMm: lo}, ...(spec.roadConnection !== undefined ? {roadConnection: spec.roadConnection} : {}), measurement, assumptions,
    };
    return {
      kind: 'curve', id, spec: {...spec}, body, innerWall, outerWall, curbs, gradeLine: line(Rg), laneBandCenter: line(Rc), landing: L, tangent: t, start,
      center: C, widthMm: W, wallToWallMm, lanes: spec.lanes, turn: spec.turn, turnDeg: spec.turnDeg, innerRadiusMm: Rin,
      segments, referenceSlopes: {innerWallPct: pct(rWallIn), gradeLinePct: hArc / arcLen * 100, laneCenterPct: pct(rLaneCenter), outerWallPct: pct(rWallOut)},
      measurement, assumptions, evaluatorRamp, candidateRamp: {id, bodyReference:'outer',bodyPolygon: body.map(p=>p.map(Math.round)), segments}, violations: V,
    };
  }
  const api = {createCurve, CAP};
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else (root.UGP = root.UGP || {}).curveRamp = api;
})(this);
