/* 지하주차 계획 엔진 — S1 바탕(실내 면)·S2 구조 격자.
 * 격자 맥락 G 하나에 설정·실내 면·UCS 변환·격자 위상(X0·Y0)을 담아 다음 단계로 넘긴다. 위상 고르기(실제 대수 비교)는 CLAUDE_ugp_plan.js.
 *   세로 기둥선 x = X0 + i·gx, 차로 격자선 y = Y0 + m·gy, 기둥 줄 y = Y0 + (m + ½)·gy, 세로 차로는 기둥 사이 가운데 x = X0 + (i + ½)·gx.
 */
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const Gm = isNode ? require('./CLAUDE_ugp_geom.js') : root.UGP.geom;
  const {rot, sub, len, bbox, signedArea, offs, offsP, norm} = Gm;
  const DEFAULTS = Object.freeze({gx: 8100, gy: 8000, columnMm: 600, stallW: 2500, stallD: 5000, wallMm: 400});

  // Explicit structural axes are absolute UCS coordinates, independent of the parking module/phase.
  function columnAxes(raw, width) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(k => !['x', 'y'].includes(k))) throw new RangeError('columnAxes는 x·y 구조축 좌표 배열이어야 합니다');
    const out = {};
    for (const axis of ['x', 'y']) {
      const xs = raw[axis];
      if (!Array.isArray(xs) || xs.length < 2 || xs.length > 128 || !Array.from(xs).every(Number.isFinite) || xs.some((v, i) => i && v - xs[i - 1] < width)) throw new RangeError(`columnAxes.${axis}: 유한한 좌표 2~128개를 기둥 폭 이상의 간격으로 오름차순 입력하세요`);
      out[axis] = xs.slice();
    }
    return out;
  }

  function normalize(input) {
    if (!input || !Array.isArray(input.mass) || input.mass.length < 3) throw new TypeError('지하층 외곽(mass)이 필요합니다');
    const cfg = {...DEFAULTS, ...(input.grid || {})};
    for (const k of ['gx', 'gy', 'columnMm', 'stallW', 'stallD']) if (!(cfg[k] > 0)) throw new RangeError(k + ' 값이 올바르지 않습니다');
    if (Object.prototype.hasOwnProperty.call(cfg, 'columnAxes')) {
      if (!Number.isFinite(cfg.columnMm)) throw new RangeError('columnMm 값이 올바르지 않습니다');
      cfg.columnAxes = columnAxes(cfg.columnAxes, cfg.columnMm);
    }
    const a = cfg.aisleMm ?? (2 * cfg.gy - 2 * cfg.stallD), n = Math.floor((cfg.gx - cfg.columnMm) / cfg.stallW);
    if (a < 6000) throw new RangeError(`세로 기둥 간격 ${cfg.gy}mm로는 차로가 ${a}mm라 6m보다 좁습니다`);
    if (n < 1) throw new RangeError('가로 기둥 간격에 칸이 들어가지 않습니다');
    return {cfg, a, n, ucs: Number.isFinite(input.ucs) ? input.ucs : 0};
  }

  // S1 바탕 + 격자 맥락. lineY·midX는 G.X0·G.Y0를 부를 때마다 읽는다
  function frame(input) {
    const {cfg, a, n, ucs} = normalize(input), d = cfg.stallD, L = (p) => rot(p, -ucs);
    const parts = offs(input.mass.map(L), -cfg.wallMm).sort((p, q) => Math.abs(signedArea(q)) - Math.abs(signedArea(p))), inner = parts[0];
    if (!inner) throw new RangeError('외벽 두께를 빼면 남는 면적이 없습니다');
    // ponytail: 한 층 = 실내 면 한 덩어리. 외벽 두께로 갈라진 다른 조각은 계산하지 않고 면적만 알린다(여러 구역은 로드맵)
    const lostParts = parts.slice(1).filter((q) => Math.abs(signedArea(q)) > 10e6).map((q) => Math.abs(signedArea(q)) / 1e6);
    const b = bbox(inner);
    const G = {cfg, a, n, ucs, d, gy: cfg.gy, L, W: (p) => rot(p, ucs), inner, b, lostParts, P: 2 * cfg.gy, X0: 0, Y0: 0};
    G.columnAxes = cfg.columnAxes || null;
    G.lineY = (m) => G.Y0 + m * G.gy;
    G.midX = (i) => G.X0 + (i + .5) * G.cfg.gx;
    return G;
  }

  // 외곽 순환 중심선(실내 면을 d + a/2 줄인 것)의 축과 나란한 변: 위치·안쪽 방향·길이
  function axisEdges(G, vert) {
    const es = []; G.raw0.forEach((Pg) => Pg.forEach((p, i) => { const q = Pg[(i + 1) % Pg.length], u = norm(sub(q, p)), nIn = G.sgn0 > 0 ? [-u[1], u[0]] : [u[1], -u[0]]; if (vert ? Math.abs(q[0] - p[0]) <= Math.max(5, .001 * Math.abs(q[1] - p[1])) : Math.abs(q[1] - p[1]) <= Math.max(5, .001 * Math.abs(q[0] - p[0]))) es.push({v: vert ? p[0] : p[1], dir: Math.sign(vert ? nIn[0] : nIn[1]), L: len(sub(q, p))}); }));
    return es;
  }
  // S2 위상 후보(실내 면 상자 기준 상대값): 실제 벽 변 하나가 격자선(안쪽)에 딱 맞는 위상들 — 긴 변 순, 같으면 아래·왼쪽 먼저.
  //   후보가 벽 변에서 나오므로 1mm 흔들림에 결과가 바뀌지 않는다. 그 축에 직교 벽이 없으면 빈 목록(부르는 쪽이 고르게 훑는다)
  function phaseCands(G, vert) {
    const {d, a, inner, b, cfg, gy} = G, g = vert ? cfg.gx : gy, half = vert ? cfg.gx / 2 : 0;
    if (!G.raw0) { G.raw0 = offsP([inner], -(d + a / 2)); G.sgn0 = G.raw0.length ? Math.sign(signedArea(G.raw0.reduce((m, q) => (Math.abs(signedArea(q)) > Math.abs(signedArea(m)) ? q : m)))) : 1; }
    const es = axisEdges(G, vert), base = vert ? b[0] : b[1], out = [];
    es.sort((x, y) => Math.round((y.L - x.L) / 100) || (x.v - y.v)).forEach((e) => { const o = Math.round((((e.v - base - half) % g) + g) % g); if (!out.some((c) => Math.abs(c - o) < 50 || Math.abs(c - o) > g - 50)) out.push(o); });
    return out;
  }
  // 위상을 정하고 기둥 세로선 목록을 만든다(phase = 상자 기준 [x, y])
  function setPhase(G, phase) {
    const {cfg, b} = G; G.X0 = b[0] + phase[0]; G.Y0 = b[1] + phase[1]; G.xLines = [];
    for (let x = G.X0 - Math.ceil((G.X0 - b[0]) / cfg.gx) * cfg.gx; x <= b[2] + cfg.gx; x += cfg.gx) G.xLines.push(x);
    if (G.columnAxes) G.xLines = G.columnAxes.x.slice();
    G.xBays = G.columnAxes ? G.xLines.slice(0, -1).map((x, i) => [x, G.xLines[i + 1]]) : G.xLines.map(x => [x, x + cfg.gx]);
  }
  const api = {DEFAULTS, normalize, frame, phaseCands, setPhase};
  if (isNode) module.exports = api; else (root.UGP = root.UGP || {}).grid = api;
})(this);
