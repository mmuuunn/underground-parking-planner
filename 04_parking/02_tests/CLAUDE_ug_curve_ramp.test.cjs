'use strict';
// 곡선 램프 계약 v0.2 9장 시험 C01–C24. 공통 장면: 허가 기준일 2026-10-24, 노외, 체계 S = 주차장 A 80대, twoWay, 분리 false,
// connects 0/−3,800, 2차로 W 6,500, R_in 6,000, 간격 300, 연석 150, 좌회전, 착지 (0,0) 진행 (1,0).
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../01_src/plan/CLAUDE_ugp_curve_ramp.js');
const P = require('../01_src/CLAUDE_ug_plan_engine.js');
const E = require('../src/underground/evaluators/evaluator-core.js');
const rules = require('../src/underground/rules/kr-parking-rules-2026-07-27.json');

const spec = (o = {}) => ({id: 'R', systemId: 'S', operation: 'twoWay', separatedInOut: false, landing: [0, 0], tangent: [1, 0], turn: 'left', turnDeg: 204, innerRadiusMm: 6000, lanes: 2, legalLaneWidthMm: 6500, wallToCurbMm: {inner: 300, outer: 300}, curbHeightMm: {inner: 150, outer: 150}, levels: {connects: {upperLevelMm: 0, lowerLevelMm: -3800}}, ...o});
const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const gen = (o) => { const c = C.createCurve(spec(o)); assert.ok(c.body, JSON.stringify(c.violations)); return c; };
const evaluate = (c, total = 80, fixed = {}) => E.evaluate({ruleSet: rules, input: {
  project: {permitDate: '2026-10-24', parkingKind: 'noeoe', ...(total === null ? {} : {parkingLots: [{id: 'A', totalStalls: total}], rampSystems: [{id: 'S', lotIds: ['A']}]})},
  floor: {id: 'B1', levelMm: 0, heightMm: 3800, outline: {kind: 'inner', polygons: [rect(-60000, -60000, 120000, 120000)]}},
  ramps: [c.evaluatorRamp], fixed: {cores: fixed.cores || [], columns: fixed.columns || []}},
  candidate: {schema: 'ug-candidate/0.1', geometry: {stalls: [], ramps: [c.candidateRamp]}}});
const item = (r, id) => r.items.find((x) => x.id === id && x.subjectId === 'R');
const v = (r, id) => { const x = item(r, id); return x.applicability === 'NOT_APPLICABLE' ? 'NA' : x.verdict; };
const seg = (c, id) => c.segments.find((s) => s.id === id);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const near = (a, b, tol = 1e-6) => a.length === b.length && a.every((p, i) => dist(p, b[i]) <= tol);
const sig = (r) => r.items.filter((x) => x.subjectId === 'R').map((x) => [x.id, x.applicability, x.verdict, x.reason].join('|')).sort();
const errs = (o) => { const c = C.createCurve(spec(o)); assert.equal(c.body, null, JSON.stringify(o)); return c.violations.map((x) => x.field); };

test('C01 204° 안쪽 차로 중심선 13.468% 통과, 참고 경사', () => {
  const c = gen();
  assert.deepEqual(c.segments, [{id: 'arc', kind: 'curve', lengthMm: 28216, startLevelMm: 0, endLevelMm: -3800}]);
  assert.equal(c.evaluatorRamp.shape.lengthMm, 28216);
  assert.equal(v(evaluate(c), 'R02'), 'PASS');
  assert.ok(Math.abs(c.referenceSlopes.gradeLinePct - 13.4675) < 1e-3);
  assert.ok(Math.abs(c.referenceSlopes.innerWallPct - 17.79) < 0.01);
  assert.ok(Math.abs(c.referenceSlopes.laneCenterPct - 13.47) < 0.01);
  // 내부 설정 conservativeInner(안쪽 벽 + W/4)는 그대로 남아 있다
  assert.equal(seg(gen({measurement: {gradeReference: 'conservativeInner'}}), 'arc').lengthMm, 27148);
});
test('C02 용량 경계 3,950 통과·3,951 실패 / 정확히 14%는 통과', () => {
  assert.equal(v(evaluate(gen({levels: {connects: {upperLevelMm: 0, lowerLevelMm: -3950}}})), 'R02'), 'PASS');
  assert.equal(v(evaluate(gen({levels: {connects: {upperLevelMm: 0, lowerLevelMm: -3951}}})), 'R02'), 'FAIL');
  const c = gen({turnDeg: 20000.5 / 7925 * 180 / Math.PI, levels: {connects: {upperLevelMm: 0, lowerLevelMm: -2800}}});
  assert.equal(seg(c, 'arc').lengthMm, 20000);
  assert.equal(v(evaluate(c), 'R02'), 'PASS');
});
test('C03 R_in 5,999는 R03 실패, 생성 정상', () => {
  const c = gen({innerRadiusMm: 5999});
  assert.deepEqual(c.violations, []);
  assert.equal(v(evaluate(c), 'R03'), 'FAIL');
});
test('C04 R_in 5,500 대수 49·50·51·미상', () => {
  const c = gen({innerRadiusMm: 5500});
  assert.deepEqual([49, 50, 51, null].map((n) => v(evaluate(c, n), 'R03')), ['PASS', 'PASS', 'FAIL', 'UNDETERMINED']);
});
test('C05 1차로 3,600/3,599 40대, 80대 분리 true·false·미상, 측정선 = 안쪽 벽 + 간격 + 1,800', () => {
  const one = (o) => gen({lanes: 1, operation: 'oneWay', legalLaneWidthMm: 3600, ...o});
  assert.equal(v(evaluate(one(), 40), 'R01'), 'PASS');
  assert.equal(v(evaluate(one({legalLaneWidthMm: 3599}), 40), 'R01'), 'FAIL');
  assert.deepEqual([true, false, undefined].map((s) => v(evaluate(one({separatedInOut: s}), 80), 'R01')), ['PASS', 'FAIL', 'UNDETERMINED']);
  assert.equal(seg(one(), 'arc').lengthMm, Math.floor(8100 * 204 * Math.PI / 180));
  assert.ok(one().gradeLine.slice(0, -0).every((p) => Math.abs(dist(p, one().center) - 8100) < 1e-6));
});
test('C06 90° + 위 직선 12,500: 상한 비례 배분 원호 1,712 직선 2,088', () => {
  const c = gen({turnDeg: 90, straightTopMm: 12500});
  assert.equal(seg(c, 'arc').startLevelMm - seg(c, 'arc').endLevelMm, 1712);
  assert.equal(seg(c, 'top-straight').startLevelMm - seg(c, 'top-straight').endLevelMm, 2088);
  const r = evaluate(c);
  assert.equal(v(r, 'R02'), 'PASS');
  assert.ok(Math.abs(item(r, 'R02').evidence.segments.find((s) => s.segmentId === 'top-straight').slopePct - 16.704) < 1e-9);
});
test('C07 90° 직선 없음: 원호가 3,800 전부, 길이 연장 없음', () => {
  const c = gen({turnDeg: 90});
  assert.deepEqual(c.segments, [{id: 'arc', kind: 'curve', lengthMm: Math.floor(7925 * Math.PI / 2), startLevelMm: 0, endLevelMm: -3800}]);
  assert.equal(v(evaluate(c), 'R02'), 'FAIL');
});
test('C08 직선 위·아래 나눔: 상한 × 길이 비례, 남는 mm는 위', () => {
  let c = gen({turnDeg: 90, straightTopMm: 8000, straightBottomMm: 4500});
  const drop = (id) => seg(c, id).startLevelMm - seg(c, id).endLevelMm;
  assert.deepEqual([drop('top-straight'), drop('arc'), drop('bottom-straight')], [1337, 1712, 751]);
  c = gen({turnDeg: 90, straightBottomMm: 12500});
  assert.deepEqual(c.segments.map((s) => s.id), ['arc', 'bottom-straight']);
  assert.equal(drop('bottom-straight'), 2087);
});
test('C09 위 완화 1,700: 직선 안에서 떼어 냄, 부족분은 원호 → R02 실패, R04 통과(완화 계약 v0.1)', () => {
  const c = gen({turnDeg: 90, straightTopMm: 12500, transitions: {topMm: 1700}});
  assert.deepEqual(c.segments.map((s) => [s.id, s.lengthMm]), [['top-transition', 1700], ['top-straight', 10800], ['arc', 12448]]);
  const t = seg(c, 'top-transition');
  assert.ok((t.startLevelMm - t.endLevelMm) * 1000 <= 85 * t.lengthMm);
  assert.equal(t.startLevelMm - t.endLevelMm, 144); // 최대 경사(직선 1,836/10,800 = 17%)의 ½ 이하
  assert.equal(seg(c, 'arc').startLevelMm - seg(c, 'arc').endLevelMm, 3800 - 144 - 1836);
  const r = evaluate(c);
  assert.equal(v(r, 'R02'), 'FAIL');
  assert.equal(v(r, 'R04'), 'PASS');
  // 자리가 없으면 만들지 않고 기록
  const no = gen({turnDeg: 90, straightTopMm: 1000, transitions: {topMm: 1700}});
  assert.deepEqual(no.violations.map((x) => x.id), ['TRANSITION_NO_ROOM']);
  assert.ok(!no.segments.some((s) => s.kind === 'transition'));
});
test('C09b 생성기 램프는 램프 안 꺾임이 없다(89차 반례: 204° + 위 직선 6,000 + 위 완화 1,700)', () => {
  const c = gen({straightTopMm: 6000, transitions: {topMm: 1700}}), r = evaluate(c);
  assert.equal(v(r, 'R04'), 'PASS');
  assert.ok(item(r, 'R04').evidence.breaks.every((b) => b.lower === 'lowerFloor' || b.upper === 'upperFloor'), '꺾임은 층 바닥과의 경계뿐');
});
test('C09c 원호에 바로 붙은 완화구간은 7.5% 이하, 경사가 통과인 생성기 램프는 권장 경고가 없다', () => {
  const c = gen({straightTopMm: 1900, transitions: {topMm: 1700}}), t = seg(c, 'top-transition');
  assert.equal(t.lengthMm, 1900);
  assert.ok((t.startLevelMm - t.endLevelMm) * 1000 <= 75 * t.lengthMm);
  let s = 11, n = 0; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 400; k++) {
    const g = C.createCurve(spec({turnDeg: 30 + rnd() * 300, innerRadiusMm: 5000 + rnd() * 4000, straightTopMm: Math.round(2000 + rnd() * 15000), straightBottomMm: Math.round(2000 + rnd() * 15000), transitions: {topMm: 1700, bottomMm: rnd() < .5 ? 2000 : 0}, levels: {connects: {upperLevelMm: 0, lowerLevelMm: -Math.round(3000 + rnd() * 1500)}}}));
    if (!g.body) continue;
    const r = evaluate(g, 120);
    if (v(r, 'R02') === 'PASS' && v(r, 'R04') === 'PASS') { n++; assert.deepEqual(item(r, 'R04').evidence.advisories, [], JSON.stringify(g.segments.map((x) => [x.id, x.lengthMm, x.startLevelMm - x.endLevelMm]))); }
  }
  assert.ok(n > 100, '경고 검사 대상이 충분해야 한다');
});
test('C10 R04 대수 49·50·99·100, 완화 없음·있음', () => {
  // 완화 계약 v0.1: 없음 → 50대부터 위 끝 볼록 실패 / 위 1,700 → 99대까지 통과, 100대는 아래 끝 오목 2m 없음 실패
  for (const [o, want] of [[{}, ['NA', 'FAIL', 'FAIL', 'FAIL']], [{turnDeg: 90, straightTopMm: 12500, transitions: {topMm: 1700}}, ['NA', 'PASS', 'PASS', 'FAIL']],
    [{turnDeg: 90, straightTopMm: 12500, straightBottomMm: 3000, transitions: {topMm: 1700, bottomMm: 2000}}, ['NA', 'PASS', 'PASS', 'PASS']]]) {
    const c = gen(o);
    assert.deepEqual([49, 50, 99, 100].map((n) => v(evaluate(c, n), 'R04')), want, JSON.stringify(o));
  }
});
test('C11 배수 여유 100: 바깥 벽만 밀림', () => {
  const a = gen(), b = gen({drainMarginMm: 100});
  assert.equal(b.wallToWallMm, 7200);
  assert.equal(b.evaluatorRamp.section.wallToWallMm, 7200);
  assert.deepEqual(b.evaluatorRamp.section.wallToCurbMm, {left: 300, right: 400});
  assert.deepEqual([b.landing, b.center], [a.landing, a.center]);
  for (const k of ['innerWall', 'gradeLine', 'laneBandCenter']) assert.ok(near(a[k], b[k]), k);
  assert.ok(near(a.curbs.inner.wallSide, b.curbs.inner.wallSide) && near(a.curbs.outer.wallSide, b.curbs.outer.wallSide));
  assert.ok(Math.abs(dist(b.outerWall[0], b.center) - dist(a.outerWall[0], a.center) - 100) < 1e-6);
  const ra = evaluate(a), rb = evaluate(b);
  for (const id of ['R01', 'R03']) assert.equal(v(rb, id), v(ra, id));
});
test('C12 우회전 중심 (0,−9,550), inner=right / 비대칭 간격', () => {
  const r = gen({turn: 'right'});
  assert.ok(dist(r.center, [0, -9550]) < 1e-9);
  assert.ok(dist(gen().center, [0, 9550]) < 1e-9);
  const w = {wallToCurbMm: {inner: 300, outer: 600}};
  assert.deepEqual(gen(w).evaluatorRamp.section.wallToCurbMm, {left: 300, right: 600});
  assert.deepEqual(gen({...w, turn: 'right'}).evaluatorRamp.section.wallToCurbMm, {left: 600, right: 300});
});
test('C13 몸체가 기둥·코어와 겹침: 지우지 않고 겹침 보고', () => {
  const c = gen(), col = {id: 'K1', polygon: rect(-300, 3000, 600, 600)}, core = {id: 'C1', polygon: rect(-2000, 15000, 4000, 4000)}, keep = structuredClone([col, core]);
  const r = evaluate(c, 80, {columns: [col], cores: [core]});
  assert.equal(v(r, 'G07'), 'FAIL');
  assert.deepEqual([col, core], keep);
  // 계획 엔진: 곡선 몸체 안의 격자 기둥은 직선처럼 빠지고(COLUMN_IN_AISLE 없음), 코어 겹침은 보고
  const M = [[0, 0], [80000, 0], [80000, 60000], [0, 60000]], st = P.generate({mass: M, ucs: 0, cores: [], ramp: {x: 30000, y: 52000, angleDeg: 0, widthMm: 6000, lengthMm: 24000}, floorMm: 3800});
  const cu = gen({landing: st.ramp.landing, turn: 'right'});
  const out = P.generate({mass: M, ucs: 0, cores: [{c: cu.laneBandCenter[Math.floor(cu.laneBandCenter.length / 2)], w: 4000, d: 4000}], ramp: cu, floorMm: 3800, phase: st.grid.phase});
  const ids = out.violations.map((x) => x.id);
  assert.ok(!ids.includes('COLUMN_IN_AISLE') && ids.includes('RAMP_HITS_CORE'), ids.join(','));
  for (const q of out.columns) assert.ok(q.length === 4 && Math.abs(Math.abs(q[2][0] - q[0][0]) - 600) <= 1 && Math.abs(Math.abs(q[2][1] - q[0][1]) - 600) <= 1);
});
test('C14 같은 입력 같은 꼭짓점, 이동·회전·좌우 대칭에 같은 판정', () => {
  assert.deepEqual(C.createCurve(spec()), C.createCurve(spec()));
  const a = gen({straightTopMm: 3000, straightBottomMm: 2000}), ra = evaluate(a);
  const R = (p, d) => { const t = d * Math.PI / 180; return [p[0] * Math.cos(t) - p[1] * Math.sin(t), p[0] * Math.sin(t) + p[1] * Math.cos(t)]; };
  for (const [d, off] of [[37, [12345, -6789]], [-120, [0, 20000]]]) {
    const T = (p) => { const q = R(p, d); return [q[0] + off[0], q[1] + off[1]]; };
    const b = gen({straightTopMm: 3000, straightBottomMm: 2000, landing: T([0, 0]), tangent: R([1, 0], d)});
    assert.deepEqual(b.segments, a.segments);
    assert.ok(near(b.body, a.body.map(T), 1e-6));
    assert.deepEqual(sig(evaluate(b)), sig(ra));
  }
  const m = gen({straightTopMm: 3000, straightBottomMm: 2000, turn: 'right'}), F = (p) => [p[0], -p[1]];
  assert.ok(near(m.body, a.body.map(F), 1e-6));
  assert.deepEqual(sig(evaluate(m)), sig(ra));
  // 계획 엔진: 매스·램프를 같이 옮기고 돌려도 대수·순환·상태가 같다
  const Mass = [[0, 0], [80000, 0], [80000, 60000], [0, 60000]], keys = new Set();
  for (const d of [0, 17.3, -25.8]) for (const off of [[0, 0], [13700, 21100]]) {
    const T = (p) => R([p[0] + off[0], p[1] + off[1]], d).map(Math.round);
    const c = gen({landing: T([30000, 52000]), tangent: R([1, 0], d), turn: 'right'});
    const r = P.generate({mass: Mass.map(T), ucs: d, cores: [], ramp: c, floorMm: 3800});
    keys.add([r.stallCount, r.graph.hasLoop, r.graph.deadEnds.length, r.status].join('/'));
  }
  assert.equal(keys.size, 1, [...keys].join(' | '));
});
test('C15 radiusReference innerCurbWallSide 6,300', () => {
  const c = gen({innerRadiusMm: 6300, measurement: {radiusReference: 'innerCurbWallSide'}});
  assert.ok(c.innerWall.every((p) => Math.abs(dist(p, c.center) - 6000) < 1e-6));
  assert.equal(c.evaluatorRamp.shape.innerRadiusMm, 6300);
  const r = item(evaluate(c), 'R03');
  assert.equal(r.evidence.innerRadiusMm, 6300);
  assert.equal(r.evidence.measurement.radiusReference, 'innerCurbWallSide');
  assert.ok(dist(c.center, gen().center) < 1e-9);
  // 반경 기준을 바꿔도 같은 도면이면 경사 측정선(안쪽 차로 중심선)·구간이 같다
  assert.deepEqual(c.segments, gen().segments);
  assert.ok(c.gradeLine.every((p) => Math.abs(dist(p, c.center) - 7925) < 1e-6));
});
test('C16 층고 가정 / connects 부분 입력은 오류', () => {
  const c = gen({levels: {floor: {levelMm: 0, heightMm: 3800}}});
  assert.ok(c.assumptions.includes('층고로 고저차 가정'));
  assert.deepEqual(c.evaluatorRamp.connects, {upperLevelMm: 0, lowerLevelMm: -3800});
  assert.deepEqual(item(evaluate(c), 'R02').evidence.rampAssumptions, ['층고로 고저차 가정']);
  assert.deepEqual(errs({levels: {connects: {upperLevelMm: 0}, floor: {levelMm: 0, heightMm: 3800}}}), ['levels.connects']);
});
test('C17 입력 오류는 몸체 없음', () => {
  assert.deepEqual(errs({levels: {connects: {upperLevelMm: 0, lowerLevelMm: -3800.5}}}), ['levels.connects']);
  assert.deepEqual(errs({levels: {connects: {upperLevelMm: -3800, lowerLevelMm: 0}}}), ['levels']);
  assert.deepEqual(errs({tangent: [0, 0]}), ['tangent']);
  assert.deepEqual(errs({straightTopMm: -1}), ['straightTopMm']);
  assert.deepEqual(errs({wallToCurbMm: {inner: -1, outer: 300}}), ['wallToCurbMm.inner']);
  assert.deepEqual(errs({id: undefined}), ['id']);
  assert.deepEqual(errs({lanes: 3}), ['lanes']);
  assert.deepEqual(errs({innerRadiusMm: 0}), ['innerRadiusMm']);
  assert.deepEqual(errs({landing: [NaN, 0]}), ['landing']);
  assert.doesNotThrow(() => C.createCurve(null));
});
test('C18 359° 생성 / 360° 범위 밖 / 긴 직선 자기 겹침', () => {
  assert.deepEqual(gen({turnDeg: 359}).violations, []);
  assert.deepEqual(errs({turnDeg: 360}), ['turnDeg']);
  assert.deepEqual(errs({turnDeg: 0}), ['turnDeg']);
  const so = C.createCurve(spec({turnDeg: 359, straightTopMm: 20000}));
  assert.equal(so.body, null);
  assert.deepEqual(so.violations.map((x) => x.id), ['SELF_OVERLAP']);
  // 88차 반례: 원호가 1mm 미만이 되는 작은 회전각은 멈추지 않고 입력 오류
  assert.deepEqual(errs({turnDeg: 0.007}), ['turnDeg']);
  assert.deepEqual(errs({tangent: [1e-320, 0]}), ['tangent']);
  assert.ok(gen({innerRadiusMm: 1, legalLaneWidthMm: 1, wallToCurbMm: {inner: 0, outer: 0}}).body.length >= 4);
});
test('C19 연석 폭 없음은 미확인 / 폭 합 ≥ W는 오류', () => {
  const a = gen(), b = gen({curbWidthMm: {inner: 150, outer: 150}});
  assert.equal(a.curbs.inner.trafficSide, null);
  assert.equal(b.curbs.inner.trafficSide.length, b.curbs.inner.wallSide.length);
  const ra = evaluate(a), rb = evaluate(b);
  for (const id of ['R01', 'R09']) assert.equal(v(ra, id), v(rb, id));
  assert.equal(b.evaluatorRamp.section.curb.left.widthMm, 150);
  assert.deepEqual(errs({curbWidthMm: {inner: 3250, outer: 3250}}), ['curbWidthMm']);
});
test('C20 고도 배분: 아래로만, 이어짐, 끝은 입력과 같음', () => {
  const cases = [{}, {turnDeg: 90}, {turnDeg: 90, straightTopMm: 8000, straightBottomMm: 4500}, {turnDeg: 45, straightTopMm: 3333, straightBottomMm: 7777, transitions: {topMm: 1700, bottomMm: 2000}},
    {turnDeg: 300, levels: {connects: {upperLevelMm: -3600, lowerLevelMm: -7300}}}, {turnDeg: 30, straightBottomMm: 1, levels: {floor: {levelMm: 100, heightMm: 4100}}}];
  for (const o of cases) {
    const c = gen(o), S = c.segments, {upperLevelMm: up, lowerLevelMm: lo} = c.evaluatorRamp.connects;
    assert.equal(S[0].startLevelMm, up); assert.equal(S[S.length - 1].endLevelMm, lo);
    S.forEach((s, i) => { assert.ok(Number.isInteger(s.startLevelMm) && Number.isInteger(s.endLevelMm) && s.endLevelMm <= s.startLevelMm); if (i) assert.equal(s.startLevelMm, S[i - 1].endLevelMm); });
    assert.equal(c.evaluatorRamp.shape.lengthMm, S.reduce((n, s) => n + s.lengthMm, 0));
  }
});
test('C21 경사 길이는 R_g×θ 내림, 도면 선분 합이 아님', () => {
  const c = gen(), g = c.gradeLine, chords = g.slice(1).reduce((n, p, i) => n + dist(p, g[i]), 0);
  assert.equal(seg(c, 'arc').lengthMm, Math.floor(7925 * 204 * Math.PI / 180));
  assert.notEqual(seg(c, 'arc').lengthMm, Math.floor(chords));
  // 처짐 10mm 이하: 바깥 벽 현의 가운데가 원에서 10mm 안
  const o = c.outerWall, r = dist(o[0], c.center);
  for (let i = 1; i < o.length; i++) assert.ok(r - dist([(o[i][0] + o[i - 1][0]) / 2, (o[i][1] + o[i - 1][1]) / 2], c.center) <= 10 + 1e-9);
});
test('C22 직선 생성기 그대로', () => {
  const s = P.createStraightRamp({landing: [0, 0], tangent: [1, 0], widthMm: 6000, lengthMm: 24000});
  assert.deepEqual(s.body, [[-24000, -3000], [0, -3000], [0, 3000], [-24000, 3000]]);
  assert.equal(s.kind, 'straight');
  // 기준 다섯 형태 500개 불변은 CLAUDE_ug_plan_invariance.test.cjs, 직선 결과 HEAD 비교는 88차 보고 참조
});
test('C23 기준 다섯 형태에 같은 자리 곡선(비교 기록, 합격 기준 아님)', () => {
  const SH = {직사각: [[0, 0], [80, 0], [80, 60], [0, 60]], L자: [[0, 0], [80, 0], [80, 30], [40, 30], [40, 70], [0, 70]], 사선깎임: [[0, 0], [80, 0], [80, 30], [55, 60], [0, 60]], 좁은날개: [[0, 0], [100, 0], [100, 20], [60, 20], [60, 60], [0, 60]], 전변사선: [[0, 0], [80, 5], [72, 60], [12, 64]]};
  for (const [name, s] of Object.entries(SH)) {
    const mass = s.map(([x, y]) => [x * 1000, y * 1000]), st = P.generate({mass, ucs: 0, cores: [], ramp: {x: 30000, y: 52000, angleDeg: 0, widthMm: 6000, lengthMm: 24000}, floorMm: 3800});
    const c = gen({landing: st.ramp.landing, turn: 'right'}), cu = P.generate({mass, ucs: 0, cores: [], ramp: c, floorMm: 3800, phase: st.grid.phase});
    const r = evaluate(c), why = ['R01', 'R02', 'R03', 'R04', 'R09'].filter((id) => !['PASS', 'NA'].includes(v(r, id))).map((id) => `${id} ${item(r, id).reason}`);
    console.log(`${name}: 직선 ${st.stallCount}대 순환 ${st.graph.hasLoop} 남는 ${st.dryAreaM2}㎡ | 곡선 ${cu.stallCount}대 순환 ${cu.graph.hasLoop} 남는 ${cu.dryAreaM2}㎡ ${cu.status} [${cu.violations.map((x) => x.id).join(',')}] 판정기 미충족: ${why.join(', ')}`);
    assert.notEqual(cu.status, 'FEASIBLE');
    assert.ok(cu.violations.some((x) => x.id === 'RAMP_RULES'));
    assert.ok(!cu.violations.some((x) => x.id === 'RAMP_SLOPE'));
  }
});
test('C23b 곡선은 판정기 결과로만 성립: 결과 없음·미충족·충족', () => {
  const M = [[0, 0], [80000, 0], [80000, 60000], [0, 60000]], st = P.generate({mass: M, ucs: 0, cores: [], ramp: {x: 30000, y: 52000, angleDeg: 0, widthMm: 6000, lengthMm: 24000}, floorMm: 3800});
  const c = gen({landing: st.ramp.landing, turn: 'right'}), base = {mass: M, ucs: 0, cores: [], ramp: c, floorMm: 3800, phase: st.grid.phase};
  const bound = (ramp, total) => { const draft = P.generate({...base, ramp}), fixed = P.curveEvaluationFixed(draft), result = evaluate(ramp, total, fixed); result.curveSource = P.curveEvaluationSource(ramp, fixed); return result; };
  const note = (ev) => P.generate({...base, rampEvaluation: ev}).violations.find((x) => x.id === 'RAMP_RULES')?.note;
  assert.match(note(undefined), /판정기 결과/);
  assert.match(note(bound(c, 80)), /경사 완충.*완화구간/);
  // 49대·외곽 안이면 R01–R09·G07 모두 PASS 또는 해당 없음 → RAMP_RULES 없음(다른 위반은 별개)
  const ok = bound(c, 49);
  assert.ok(['R01', 'R02', 'R03', 'R04', 'R09', 'G07'].every((id) => ['PASS', 'NA'].includes(v(ok, id))));
  assert.equal(note(ok), undefined);
  assert.match(note(evaluate(c, 49)), /다른 입력/, '판정한 입력 증거가 빠진 결과는 받지 않는다');
  // 다른 램프 id의 결과는 쓰지 않는다
  assert.match(note({...ok, items: ok.items.map((x) => ({...x, subjectId: 'X'}))}), /검사 정보가 없습니다/);
  // 88차 반례: 다른 몸체(R_in 3,000)에 이 결과를 넣으면 받지 않는다
  const other = gen({landing: st.ramp.landing, turn: 'right', innerRadiusMm: 3000});
  assert.match(P.generate({...base, ramp: other, rampEvaluation: ok}).violations.find((x) => x.id === 'RAMP_RULES').note, /다른 입력/);
  const center = ramp => ramp.body.reduce((p,q)=>[p[0]+q[0]/ramp.body.length,p[1]+q[1]/ramp.body.length],[0,0]);
  const small0=gen({landing:st.ramp.landing,turn:'right',innerRadiusMm:4000});
  const shift=center(c).map((x,i)=>x-center(small0)[i]);
  const small=gen({landing:st.ramp.landing.map((x,i)=>Math.round(x+shift[i])),turn:'right',innerRadiusMm:4000});
  assert.ok(dist(center(c),center(small))<2,'old centroid check would treat these bodies as the same');
  assert.equal(v(evaluate(small,49),'R03'),'FAIL');
  assert.match(P.generate({...base,ramp:small,rampEvaluation:ok}).violations.find(x=>x.id==='RAMP_RULES').note,/다른 입력/);
  const otherHeight=gen({landing:st.ramp.landing,turn:'right',levels:{connects:{upperLevelMm:0,lowerLevelMm:-3900}}});
  assert.match(P.generate({...base,ramp:otherHeight,rampEvaluation:ok}).violations.find(x=>x.id==='RAMP_RULES').note,/다른 입력/);
  const withCore={...base,cores:[{c:[40000,30000],w:6000,d:8000}]};
  assert.match(P.generate({...withCore,rampEvaluation:ok}).violations.find(x=>x.id==='RAMP_RULES').note,/다른 입력/);
  // 몸체 없는 곡선은 엔진이 알 수 있는 오류로 멈춘다
  assert.throws(() => P.generate({...base, ramp: C.createCurve(spec({turnDeg: 360}))}), RangeError);
});
test('C24 measurement 없는 자료는 결과 불변(근거만 추가)', () => {
  const c = gen({turnDeg: 90, straightTopMm: 12500, levels: {floor: {levelMm: 0, heightMm: 3800}}}), plain = structuredClone(c);
  delete plain.evaluatorRamp.measurement; delete plain.evaluatorRamp.assumptions;
  const a = evaluate(c), b = evaluate(plain);
  assert.deepEqual(sig(a), sig(b));
  for (const x of a.items) {
    const y = b.items.find((q) => q.id === x.id && q.subjectId === x.subjectId), {measurement, rampAssumptions, ...rest} = x.evidence;
    assert.deepEqual(rest, y.evidence, x.id);
    assert.deepEqual([x.verdict, x.reason, x.message], [y.verdict, y.reason, y.message]);
    if (x.subjectId === 'R' && x.domain === 'R') assert.equal(measurement.radiusReference, 'innerWallFace');
  }
  assert.deepEqual(a.overall, b.overall);
  // 88차 반례: JSON으로 못 바꾸는 값이 와도 판정이 무너지지 않는다
  const odd = structuredClone(c); odd.evaluatorRamp.measurement = {x: 10n, f() {}};
  assert.deepEqual(sig(evaluate(odd)), sig(a));
});
test('C25 곡선 램프 자리 제안: 같은 생성기 입력으로 착지·방향·회전 쪽을 바꿔 대수를 다시 센다', () => {
  const M = [[0, 0], [80000, 0], [80000, 60000], [0, 60000]], st = P.generate({mass: M, ucs: 0, cores: [], ramp: {x: 30000, y: 52000, angleDeg: 0, widthMm: 6000, lengthMm: 24000}, floorMm: 3800});
  const c = gen({landing: st.ramp.landing, turn: 'right'}), inp = {mass: M, ucs: 0, cores: [], ramp: c, floorMm: 3800, phase: st.grid.phase};
  const sug = P.suggestRamps(inp, 3);
  assert.ok(sug.length > 0);
  for (const s of sug) {
    assert.equal(s.kind, 'curve'); assert.ok(['left', 'right'].includes(s.turn)); assert.ok(s.stallCount >= 0);
    // 제안을 그대로 다시 만들면 같은 대수
    const t = [Math.cos(s.angleDeg * Math.PI / 180), Math.sin(s.angleDeg * Math.PI / 180)];
    const again = P.generate({...inp, ramp: P.createCurveRamp({...c.spec, landing: [s.x, s.y], tangent: t, turn: s.turn})});
    assert.equal(again.stallCount, s.stallCount); assert.ok(again.graph.hasLoop);
  }
});
test('C25b 완화구간 곡선 후보는 옮긴 몸체와 실제 구조열로 다시 판정한다', () => {
  const mass=rect(0,0,80000,60000),ramp=gen({landing:[30000,52000],straightTopMm:3000,straightBottomMm:3000,transitions:{topMm:1700,bottomMm:1700}});
  const input={mass,ucs:0,cores:[],ramp,floorMm:3800};
  const suggestions=P.suggestRamps(input,Infinity);
  assert.ok(suggestions.length>0);
  for(const s of suggestions){
    const candidate=P.createCurveRamp({...ramp.spec,landing:[s.x,s.y],tangent:[Math.cos(s.angleDeg*Math.PI/180),Math.sin(s.angleDeg*Math.PI/180)],turn:s.turn});
    const draft=P.generate({...input,ramp:candidate}),placed=draft.ramp.sourceRamp,fixed=P.curveEvaluationFixed(draft);
    const verdict=evaluate(placed,80,fixed);verdict.curveSource=P.curveEvaluationSource(placed,fixed);
    const actual=P.generate({...input,ramp:candidate,phase:draft.grid.phase,rampEvaluation:verdict});
    assert.equal(v(verdict,'R04'),'PASS');
    assert.equal(actual.violations.find(x=>x.id==='RAMP_RULES')?.note.includes('다른 입력')||false,false);
    assert.ok(actual.ramp.approach.turnCount>=0);
  }
});
test('C26 사선 외벽 램프의 짧은 S자 합류는 조건부로 남긴다', () => {
  const mass=[[0,0],[80000,0],[80000,50000],[65000,50000],[25000,65000],[0,65000]];
  const ramp=P.createStraightRamp({landing:[46173,53109],angleDeg:-20.56,widthMm:6000,lengthMm:24000});
  const result=P.generate({mass,ucs:0,cores:[],ramp,floorMm:3800});
  assert.equal(result.stallCount,128); // 94차: 사선 순환 차로 안쪽 칸·중심선 펴기(113→128)
  assert.equal(result.graph.hasLoop,true);
  // The turn 0.86 m beyond the contact point is now included in the 6 m review.
  assert.equal(result.ramp.approach.turnCount,3);
  assert.ok(result.ramp.approach.firstStraightMm<6000);
  assert.match(result.violations.find(x=>x.id==='RAMP_OFFGRID').note,/꺾임 3번/);
  assert.equal(result.status,'CONDITIONAL');
});
test('C27 곡선 몸체 옆 순환 차로가 삼각으로 튀지 않는다(가짜 24° 꺾임 없음, 93차)', () => {
  const M = [[0, 0], [80000, 0], [80000, 60000], [0, 60000]], c = gen({landing: [24508, 8400], straightTopMm: 3000, straightBottomMm: 3000, transitions: {topMm: 1700, bottomMm: 1700}});
  const r = P.generate({mass: M, ucs: 0, cores: [], ramp: c, floorMm: 3800});
  assert.ok(r.graph.hasLoop);
  assert.equal(r.ramp.approach.accepted, true, r.ramp.approach.summary);
  assert.ok(r.ramp.approach.turnAnglesDeg.every((a) => Math.abs(a - 90) < 1), JSON.stringify(r.ramp.approach.turnAnglesDeg));
});
