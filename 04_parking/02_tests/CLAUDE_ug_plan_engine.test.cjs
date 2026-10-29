'use strict';
// 계획 엔진 v0.5: 사용자 피드백에서 엔진이 지켜야 할 약속을 고정한다.
const assert = require('assert');
const E = require('../01_src/CLAUDE_ug_plan_engine.js');
const M = (pts) => pts.map(([x, y]) => [x * 1000, y * 1000]);
const ramp = (x, y, deg) => ({x: x * 1000, y: y * 1000, angleDeg: deg, widthMm: 6000, lengthMm: 24000});
const run = (mass, cores, r) => E.generate({mass: M(mass), ucs: 0, cores, ramp: r, floorMm: 3800});
const box = [[0, 0], [80, 0], [80, 60], [0, 60]];

// 1 직사각 80×60(코어 1, 램프 위쪽 벽): 순환, 막다른 끝 없음, 위·아래 벽 쪽 줄에 칸
const rect = run(box, [{c: [40000, 36000], w: 9000, d: 7000}], ramp(30, 52, 0));
assert(rect.graph.hasLoop, '순환');
assert.strictEqual(rect.graph.deadEnds.length, 0, '막다른 끝 없음');
assert(rect.stalls.some((s) => Math.max(...s.pts.map((p) => p[1])) > 50000) && rect.stalls.some((s) => Math.min(...s.pts.map((p) => p[1])) < 8000), '위·아래 벽 쪽 줄');
assert(rect.perStallM2 < 45, `대당 면적 ${rect.perStallM2}`);

// 1-1 램프가 실제로 이어지지 않으면 순환으로 치지 않는다, 매스 밖 램프는 불성립(Codex 66차 반례)
const noLink = run([[0, 0], [60, 0], [60, 40], [0, 40]], [], ramp(50, 32, 0));
assert(!noLink.graph.hasLoop && noLink.status === 'INFEASIBLE', '진입선 없는 램프를 순환으로 판정하면 안 됨');
const outside = run(box, [], ramp(-10, 52, 0));
assert(outside.status === 'INFEASIBLE' && outside.violations.some((v) => v.id === 'RAMP_OUTSIDE'), '매스 밖 램프는 불성립');
// 1-2 코어가 막은 차로는 면에서도 빠진다, 잔여공간에 기둥이 섞이지 않는다
{
  const CL = require('../../00_shared/lib/clipper.js'), toC = (P) => P.map(([x, y]) => ({X: x, Y: y}));
  const inter = (A, B) => { const c = new CL.Clipper(), o = new CL.Paths(); c.AddPaths(A.map(toC), CL.PolyType.ptSubject, true); c.AddPaths(B.map(toC), CL.PolyType.ptClip, true); c.Execute(CL.ClipType.ctIntersection, o, CL.PolyFillType.pftNonZero, CL.PolyFillType.pftNonZero); return o.reduce((t, p) => t + CL.Clipper.Area(p), 0); };
  // 코어가 서쪽 순환 차로를 막는 위상 [3950, 0]으로 고정(자동 위상은 이 코어를 칸 자리에 붙여 막히지 않는다)
  const blocked = E.generate({mass: M(box), ucs: 0, cores: [{c: [5000, 24000], w: 9000, d: 7000}], ramp: ramp(30, 52, 0), floorMm: 3800, phase: [3950, 0]});
  assert(blocked.violations.some((v) => v.id === 'CORE_IN_AISLE') && !blocked.graph.hasLoop, '이 장면은 코어가 순환을 막는다');
  assert(Math.abs(inter(blocked.aisles, blocked.cores.map((c) => c.pts))) < 1e4, '코어 밑에 차로 면이 남으면 안 됨');
  assert(Math.abs(inter(rect.dry, rect.columns)) < 1e4, '잔여공간에 기둥 면적이 섞이면 안 됨');
}
// 2 착지에서 곧게: 램프 진입 차로가 램프 축과 나란하고, 그 위에 기둥이 없다
const e = rect.graph.edges.find((x) => x.kind === 'ramp'), a = rect.graph.nodes[e.a].p, b = rect.graph.nodes[e.b].p;
assert(Math.abs(a[1] - b[1]) < 1, '진입 차로가 램프 축과 평행');
assert(!rect.columns.some((c) => { const cx = (c[0][0] + c[2][0]) / 2, cy = (c[0][1] + c[2][1]) / 2; return Math.abs(cy - a[1]) < 3000 && cx > Math.min(a[0], b[0]) && cx < Math.max(a[0], b[0]); }), '진입 차로에 기둥 없음');

// 3 차로 띠는 끊김 없이 이어진다(순환 띠가 한 덩어리)
assert(rect.aisles.filter((P) => P.reduce((t, p, i) => t + p[0] * P[(i + 1) % P.length][1] - P[(i + 1) % P.length][0] * p[1], 0) > 0).length === 1, '차로 띠 한 덩어리');

// 4 구조열 고정·코어 안 기둥: 코어를 옮겨도 기둥 세로선은 같은 격자 위, 코어 안에도 기둥이 있다
const colX = (r) => new Set(r.columns.map((c) => Math.round((c[0][0] + c[2][0]) / 2)));
const c2 = run(box, [{c: [55000, 36000], w: 9000, d: 7000}], ramp(30, 52, 0));
const phase = new Set([...colX(rect), ...colX(c2)].map((x) => ((x % 8100) + 8100) % 8100));
assert.strictEqual(phase.size, 1, '코어를 옮겨도 기둥 세로선은 같은 격자 위');
const core = rect.cores[0].pts, inCore = rect.columns.some((c) => { const cx = (c[0][0] + c[2][0]) / 2, cy = (c[0][1] + c[2][1]) / 2; return cx >= core[0][0] - 1 && cx <= core[2][0] + 1 && cy >= core[0][1] - 1 && cy <= core[2][1] + 1; });
assert(inCore, '코어 자리(벽 포함)에도 기둥');

// 5 같은 입력이면 같은 결과: 엔진이 붙인 램프·코어 자리로 다시 계산해도 그대로
const again = run(box, [{c: rect.cores[0].center, w: 9000, d: 7000}], {...ramp(0, 0, 0), x: rect.ramp.landing[0], y: rect.ramp.landing[1]});
assert.strictEqual(again.stallCount, rect.stallCount, '다시 계산해도 같은 대수');
assert.strictEqual(again.ramp.shiftMm, 0, '붙인 램프는 더 움직이지 않음');

// 6 사선 벽: 순환이 있고 벽에 직각인 칸이 생긴다
const diag = run([[0, 0], [80, 0], [80, 30], [55, 60], [0, 60]], [], ramp(30, 52, 0));
assert(diag.graph.hasLoop, '사선 매스 순환');
assert(diag.stalls.some((s) => { const [p, q] = s.pts; return Math.abs(p[0] - q[0]) > 100 && Math.abs(p[1] - q[1]) > 100; }), '사선 벽에 직각 칸');

console.log('ug-plan v0.5 ok', {rect: rect.stallCount, perStall: rect.perStallM2.toFixed(1), diag: diag.stallCount});

// 7 램프 자리 제안: 지금 자리보다 나은 것만, 점수 순
const inp = {mass: M(box), ucs: 0, cores: [{c: [40000, 36000], w: 9000, d: 7000}], ramp: ramp(30, 52, 0), floorMm: 3800};
const sug = E.suggestRamps(inp);
assert(sug.length > 0, '이 장면은 더 나은 램프 자리가 있어야 한다(빈 배열이면 아래 every가 그냥 참이 됨)');
assert(sug.every((x) => x.stallCount - 0 >= 0) && sug.every((x, i) => i === 0 || sug[i - 1].score >= x.score), '점수 순');
assert(sug.every((x) => x.score > rect.stallCount - rect.deadSideCount), '지금보다 나은 자리만');
console.log('suggest', sug.map((x) => x.stallCount));

// 8 위치 불변: 같은 매스·코어·램프를 통째로 옮기고 UCS로 돌려도 대수가 같다(저장 좌표 mm 반올림 흔들림 포함)
{
  const rot = (p, deg) => { const t = deg * Math.PI / 180; return [p[0] * Math.cos(t) - p[1] * Math.sin(t), p[0] * Math.sin(t) + p[1] * Math.cos(t)]; };
  const u = -25.8, Wt = (q, t) => rot([(q[0] + t[0]) * 1000, (q[1] + t[1]) * 1000], u).map(Math.round);
  const shape = [[-50, 38], [-50, 26], [-30, 26], [-30, -12], [46, -12], [46, 10], [32, 38]];
  const at = (t) => E.generate({ucs: u, mass: shape.map((q) => Wt(q, t)), cores: [{c: Wt([16, 21], t), w: 9000, d: 9000}], ramp: {...(([x, y]) => ({x, y}))(Wt([-26, 30], t)), angleDeg: u, widthMm: 6000, lengthMm: 24000}, floorMm: 3800}).stallCount;
  const counts = new Set([[0, 0], [1.37, 2.11], [4.24, 0], [7.9, 3.3], [0.3, 8.8]].map(at));
  assert.strictEqual(counts.size, 1, `옮기면 대수가 달라짐: ${[...counts]}`);
}
console.log('translation ok');

// 9 좁은 날개 안 램프: 격자선에 맞는 자리가 매스 밖뿐이면 놓은 자리 그대로 두고 한 번 꺾어 합류(불성립으로 떨어지지 않음).
//   그 상황이 생기는 위상 [7750, 0]을 입력으로 고정한다. 자동 위상은 실제 대수로 고르므로 대수가 같거나 많다
{
  const rot = (p, deg) => { const t = deg * Math.PI / 180; return [p[0] * Math.cos(t) - p[1] * Math.sin(t), p[0] * Math.sin(t) + p[1] * Math.cos(t)]; };
  const u = -25.8, Wq = (q) => rot([q[0] * 1000, q[1] * 1000], u).map(Math.round), rp = Wq([-26, 32]);
  const inp9 = {ucs: u, mass: [[-50, 38], [-50, 26], [-30, 26], [-30, -12], [46, -12], [46, 10], [32, 38]].map(Wq), cores: [], ramp: {x: rp[0], y: rp[1], angleDeg: u, widthMm: 6000, lengthMm: 24000}, floorMm: 3800};
  const r = E.generate({...inp9, phase: [7750, 0]});
  assert(r.graph.hasLoop && r.stallCount > 80, `좁은 날개 램프 ${r.stallCount}대`);
  assert(r.violations.some((v) => v.id === 'RAMP_OFFGRID') && !r.violations.some((v) => v.id === 'RAMP_OUTSIDE'), '꺾어 합류로 알리고 매스 밖이 아님');
  const auto = E.generate(inp9);
  assert(auto.graph.hasLoop && auto.stallCount >= r.stallCount, `자동 위상 ${auto.grid.phase} ${auto.stallCount}대`);
}
console.log('offgrid ok');

// 10 S7 독립 검사(B2): 최종 도형만 보고 판정한다. 결과를 일부러 망가뜨리면 잡아야 하고, 멀쩡한 결과에 다시 돌리면 판정이 같아야 한다
{
  const V = require('../01_src/plan/CLAUDE_ugp_verify.js'), inp = {mass: M(box), ucs: 0, cores: [{c: [40000, 36000], w: 9000, d: 7000}], ramp: ramp(30, 52, 0), floorMm: 3800};
  const clone = (x) => JSON.parse(JSON.stringify(x)), ids = (rep) => rep.violations.map((v) => v.id);
  assert.strictEqual(rect.report.tolerance.areaMm2, 1e4, '허용오차 공개');
  assert.strictEqual(rect.status, 'FEASIBLE', `기본 직사각 상태 ${rect.status} ${rect.violations.map((v) => v.id)}`);
  const re = V.check(rect, inp);
  assert(re.stallState.every((s) => s === 'ok') && re.status === 'FEASIBLE', '검사를 결과에 다시 돌려도 같은 판정');
  // 칸 하나를 차로 위로 옮기면 겹침으로 뺀다
  const t1 = clone(rect); t1.stalls[0].pts = t1.stalls[0].pts.map(([x, y]) => [x, y + 3000]);
  const r1 = V.check(t1, inp); assert(ids(r1).includes('STALL_CLASH') && r1.stallState[0] !== 'ok', '차로를 덮은 칸');
  // 가짜 순환: 다른 곳에 고리가 있어도 착지 구간이 끊기면 순환이 아니다
  const t2 = clone(rect); t2.graph.edges = t2.graph.edges.filter((e) => e.kind !== 'ramp');
  const r2 = V.check(t2, inp); assert(!r2.hasLoop && r2.status === 'INFEASIBLE' && r2.counts.ok === 0, '착지에서 끊긴 동선');
  // 동선 구간이 차로 면 밖이면 증거로 쓰지 않는다(코어 밑 차로: 면을 지운 곳의 중심선)
  const t3 = clone(rect); t3.cores.push({pts: [[20000, 3000], [30000, 3000], [30000, 14000], [20000, 14000]]});
  const r3 = V.check(t3, inp); assert(ids(r3).includes('AISLE_UNDER_CORE'), '코어 밑 차로 면');
  const t4 = clone(rect), hole = [[20000, 3000], [20000, 14000], [30000, 14000], [30000, 3000]]; t4.aisles = t4.aisles.concat([hole]); // 시계 방향(구멍)으로 차로 면을 판다
  const r4 = V.check(t4, inp); assert(ids(r4).includes('EDGE_OFF_AISLE') && r4.deadEnds.length > 0 && r4.counts.deadSide > 0, '끊긴 순환은 막다른 끝');
  // 착지 앞 접속 띠가 차로 면 밖이면 시작점이 없다
  const L0 = rect.ramp.landing, t5 = clone(rect); t5.aisles = t5.aisles.concat([[[L0[0] - 3000, L0[1] - 3000], [L0[0] - 3000, L0[1] + 3000], [L0[0] + 3000, L0[1] + 3000], [L0[0] + 3000, L0[1] - 3000]]]);
  assert(ids(V.check(t5, inp)).includes('LANDING'), '착지 앞 차로 없음');
  // 미세 겹침은 허용오차 안(전변 사선, Codex 66차 3-12), 앞이 차로에 닿지 않는 모서리 칸은 뺀다
  const all = run([[0, 0], [80, 5], [70, 60], [10, 65]], [], ramp(30, 52, 0));
  assert(all.report.counts.clash === 0 && all.placementReport.counts.noFront > 0 && all.violations.some((v) => v.id === 'STALL_NO_FRONT'), '전변 사선 검사');
  // 모서리 칸: 앞이 순환 모서리 차로 면에 닿으면 갈 수 있는 칸이다
  assert.strictEqual(rect.excluded.unreachable, 0, '순환 모서리 칸');
}
console.log('verify ok');

// 11 격자 위상(B3): 실제 대수로 고르고, 입력 위상이 있으면 그대로 쓴다(화면은 매스·UCS·모듈을 바꿀 때만 다시 고르고 문서에 저장)
{
  const inp = {mass: M(box), ucs: 0, cores: [{c: [40000, 36000], w: 9000, d: 7000}], ramp: ramp(30, 52, 0), floorMm: 3800};
  assert.strictEqual(rect.grid.phaseFrom, 'auto');
  const fixed = E.generate({...inp, phase: [1000, 2000]});
  assert(fixed.grid.phaseFrom === 'input' && fixed.grid.phase[0] === 1000 && fixed.grid.phase[1] === 2000, '입력 위상 그대로');
  // 위상 다시 고르기 목록: 첫째가 자동으로 고른 위상, 대수는 실제 입력(코어 포함)
  const ph = E.suggestPhases(inp);
  assert(ph.length >= 2 && ph[0].phase.join() === rect.grid.phase.join() && ph[0].stallCount === rect.stallCount, '위상 목록');
  // 램프 제안은 지금 위상으로 고정해 계산한다(램프를 옮겨도 기둥은 그대로)
  const s0 = E.suggestRamps(inp)[0], moved = E.generate({...inp, phase: rect.grid.phase, ramp: {...inp.ramp, x: s0.x, y: s0.y, angleDeg: s0.angleDeg}});
  assert.strictEqual(moved.stallCount, s0.stallCount, '램프 제안 = 지금 위상으로 옮긴 결과');
  // 모든 변이 사선인 매스: 벽 변 후보가 없어 고르게 훑는다(Codex 66차 3-5: 위상만 바꿔 59→99대)
  const all = run([[0, 0], [80, 5], [72, 60], [12, 64]], [], ramp(30, 52, 0));
  assert(all.stallCount >= 90 && all.graph.hasLoop, `전변 사선 ${all.stallCount}대`);
}
console.log('phase ok');

// 12 독립 검사의 거짓 통과 회귀: 중복 길, 잘못된 실내 경계, 떨어진 차로 조각.
{
  const V = require('../01_src/plan/CLAUDE_ugp_verify.js'), G = require('../01_src/plan/CLAUDE_ugp_geom.js');
  const input = {mass: M(box), ucs: 0, cores: [], ramp: ramp(30, 52, 0), floorMm: 3800};
  const original = E.generate(input), copy = () => JSON.parse(JSON.stringify(original));
  const R = (x, y, w, h) => [[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
  const duplicate = copy(), L = original.ramp.landing;
  duplicate.stalls=[]; duplicate.columns=[]; duplicate.cores=[];
  duplicate.aisles=[R(L[0],L[1]-3000,10000,6000)];
  duplicate.graph={nodes:[{id:0,p:L},{id:1,p:[L[0]+10000,L[1]]}],edges:[{id:0,a:0,b:1,kind:'ramp'},{id:1,a:1,b:0,kind:'ramp'}]};
  assert(!V.check(duplicate,input).hasLoop,'같은 직선을 두 번 넘겨도 순환이 아니다');
  const outside=copy(), q=outside.graph.nodes.filter(n=>n.p[1]<40000).sort((a,b)=>b.p[0]-a.p[0])[0];
  outside.innerOutline=R(0,0,120000,60000); outside.columns=[]; outside.cores=[];
  const far={id:outside.graph.nodes.length,p:[100000,q.p[1]]}; outside.graph.nodes.push(far);
  outside.graph.edges.push({id:outside.graph.edges.length,a:q.id,b:far.id,kind:'row'});
  outside.aisles=G.boolOp(outside.aisles.concat([R(q.p[0],q.p[1]-3000,100000-q.p[0],6000)]),[],G.CL.ClipType.ctUnion);
  outside.stalls=[{pts:R(95000,q.p[1]+3000,2500,5000)}];
  const ro=V.check(outside,input); assert(ro.stallState[0]==='outside'&&ro.status==='INFEASIBLE','매스 밖 칸과 잘못된 실내 경계를 제외');
  const pocket=copy(), right=Math.max(...pocket.graph.nodes.map(n=>n.p[0]));
  pocket.columns=[]; pocket.cores=[]; pocket.stalls=[{pts:R(right-12000,15000,5000,2500)}];
  pocket.aisles=G.boolOp(pocket.aisles.concat([R(right-7000,14000,3500,6000)]),[],G.CL.ClipType.ctUnion);
  assert(!['ok','deadSide'].includes(V.check(pocket,input).stallState[0]),'500mm 떨어진 차로 조각을 가까운 길에 붙여 인정하지 않음');
}
console.log('independent counterexamples ok');

// 13 칸 종류는 프로젝트 데이터이며 일반형만 쓰면 기존 기하를 유지한다.
{
  const input={mass:M(box),ucs:0,cores:[{c:[40000,36000],w:9000,d:7000}],ramp:ramp(30,52,0),floorMm:3800};
  const r=E.generate(input), one=r.stallRows.find(x=>x.axis==='h');
  assert.deepStrictEqual(Object.keys(r.stallModules),['normal','expanded','accessible','compact']);
  assert(r.stalls.every(s=>s.stallType==='normal')&&r.accessibleCandidateRows.length>0);
  const changed=E.generate({...input,phase:r.grid.phase,stallRowTypes:{[one.id]:'expanded'},stallModules:{expanded:{depthMm:5000}}});
  assert(changed.stalls.some(s=>s.rowId===one.id&&s.stallType==='expanded'),'줄별 종류 선택');
  const independentWidth=E.generate({...input,phase:r.grid.phase,grid:{aisleMm:6000,stallD:5200,gy:8200}});
  assert.strictEqual(independentWidth.grid.aisleMm,6000,'차로 폭은 칸 깊이와 별도로 지정 가능');
  assert.throws(()=>E.generate({...input,phase:r.grid.phase,stallType:'accessible'}),/공유 여유/,'공유 승하차 여유는 프로젝트가 정한다');
  const reserved=E.generate({...input,phase:r.grid.phase,stallRowTypes:{[one.id]:'accessible'},stallModules:{accessible:{widthMm:3500,depthMm:5200,sharedClearanceMm:1200}}});
  assert(!reserved.stalls.some(s=>s.rowId===one.id),'장애인 공유 여유는 아직 확정 칸으로 생성하지 않고 자리만 준비');
}
console.log('stall module catalogue ok');

// 14 램프의 몸체·착지·접선·폭 계약. 직선 생성기와 명시적 형상 입력을 교환 가능.
{
  const input={mass:M(box),ucs:0,cores:[],ramp:ramp(30,52,0),floorMm:3800},original=E.generate(input);
  assert.strictEqual(original.ramp.widthMm,6000);
  assert(original.ramp.approach.points.length>=2,'명시적 착지 접속선');
  const model=E.createStraightRamp({landing:original.ramp.landing,tangent:original.ramp.tangent,widthMm:6000,lengthMm:24000});
  assert.deepStrictEqual(model.body,original.ramp.body);
  const explicit=E.generate({...input,phase:original.grid.phase,ramp:model});
  assert.deepStrictEqual(explicit.stalls,original.stalls,'동일 직선 형상을 넣으면 칸 결과 같음');
  assert.deepStrictEqual(explicit.aisles,original.aisles,'동일 직선 형상의 차로 결과 같음');
  assert.throws(()=>E.createStraightRamp({landing:[0,0],tangent:[0,0],widthMm:6000,lengthMm:24000}),/올바르지/);
}
console.log('ramp geometry contract ok');

// 15 선택적 우회. 기본은 보고만, 고정 코어와 구조열은 움직이지 않는다.
{
 const input={mass:M(box),ucs:0,cores:[{c:[5000,24000],w:9000,d:7000}],ramp:ramp(30,52,0),floorMm:3800,phase:[3950,0]};
 const blocked=E.generate(input),detour=E.generate({...input,occupantPolicy:'bypass'});
 assert(!blocked.graph.hasLoop,'기본 정책은 차단을 보고');
 assert(detour.occupantRouting.created.length>0&&detour.graph.hasLoop,'선택했을 때만 우회로 순환 복구');
 assert.deepStrictEqual(detour.cores,blocked.cores,'우회를 위해 코어를 움직이지 않음');
 assert.deepStrictEqual(detour.columns,blocked.columns,'우회 전 기둥을 하나도 지우지 않음');
 assert.deepStrictEqual(detour.grid.phase,blocked.grid.phase,'우회 중 구조열 고정');
 assert(!detour.violations.some(v=>['COLUMN_IN_AISLE','AISLE_UNDER_CORE','AISLE_OUTSIDE'].includes(v.id)),'우회 면의 충돌 검사');
 const room=E.generate({...input,cores:[],occupants:[{id:'equipment',c:blocked.cores[0].center,w:9000,d:7000}],occupantPolicy:'bypass'});
 assert(room.occupants.length===1&&room.occupantRouting.created.length>0,'설비실 상자도 고정 점유물로 우회');
 const impossible=E.generate({...input,cores:[{c:[40000,30000],w:70000,d:50000}],occupantPolicy:'bypass'});
 assert(!impossible.graph.hasLoop&&impossible.occupantRouting.created.length===0&&impossible.violations.some(v=>v.id==='BYPASS_UNAVAILABLE'),'폭이 없는 우회는 만들지 않고 이유를 보고');
}
console.log('optional occupant routing ok');

// 16 기존 골든 도면과 전변사선. 수치 보존과 최종 도형의 독립 검사 결과를 함께 확인한다.
{
 const fixtures=require('./fixtures/underground-golden-cases.json');
 const V=require('../01_src/plan/CLAUDE_ugp_verify.js');
 for(const c of fixtures.cases){
  const r=E.generate(c.input), report=V.check(r,c.input);
  const actual={stallCount:r.stallCount,hasLoop:r.graph.hasLoop,deadEnds:r.graph.deadEnds.length,dryAreaM2:r.dryAreaM2,status:r.status,violations:[...new Set(r.violations.map(v=>v.id))].sort()};
  assert.deepStrictEqual(actual,c.expected,c.id+' 기준 결과 변경');
  assert.strictEqual(report.hasLoop,r.graph.hasLoop,c.id+' 최종 순환 재검사');
  assert.strictEqual(report.counts.ok+report.counts.deadSide,r.stallCount,c.id+' 도달 가능한 칸 수');
  if(c.expectedNoFront!==undefined)assert.strictEqual(r.placementReport.counts.noFront,c.expectedNoFront,c.id+' 앞 차로가 없는 칸 수');
  assert(!r.violations.some(v=>['STALL_CLASH','COLUMN_IN_AISLE','AISLE_UNDER_CORE','AISLE_OUTSIDE'].includes(v.id)),c.id+' 도형 충돌');
 }
}
console.log('golden plans ok');
// 93차 A1: 폭 5.1m 돌출부(칸 한 줄 깊이)에서 순환 차로가 ㄷ자로 튀어 마주 보는 두 차로 사이에 칸 줄 없는 틈(기둥이 낌)을 만들지 않는다.
//   사용자 화면 사진 1 장면(꼭짓점 6개, 코어 없이). 나란한 순환 차로 조각끼리 간격은 0이거나 차로 + 칸 깊이(11m) 이상이어야 한다
{
  const r = E.generate({mass: M([[0, 50], [101.4, 50], [101.4, 22.1], [96.3, 22.1], [96.3, 0], [20, 0]]), ucs: 0, cores: [], ramp: ramp(32, 41.7, 0), grid: {wallMm: 400}, floorMm: 3800, phase: [7359, 1200], debug: true});
  const ring = r.debugSegs.filter((s) => s.kind === 'ring'), span = (s, k) => [Math.min(s.a[k], s.b[k]), Math.max(s.a[k], s.b[k])];
  for (const p of ring) for (const q of ring) {
    const k = Math.abs(p.a[1] - p.b[1]) < 1 && Math.abs(q.a[1] - q.b[1]) < 1 ? 0 : Math.abs(p.a[0] - p.b[0]) < 1 && Math.abs(q.a[0] - q.b[0]) < 1 ? 1 : -1;
    if (k < 0 || p === q) continue;
    const [p0, p1] = span(p, k), [q0, q1] = span(q, k), gap = Math.abs(p.a[1 - k] - q.a[1 - k]);
    if (Math.min(p1, q1) - Math.max(p0, q0) > 1000) assert(gap < 1 || gap >= 6000 + 5000 - 1, `순환 차로 ㄷ자 틈 ${gap}mm`);
  }
  assert(r.graph.hasLoop && r.stallCount >= 130, `돌출부 장면 ${r.stallCount}대`);
}
console.log('ring step ok');
// 94차: 순환 중심선(= 차량 동선)에 차가 달릴 수 없는 모양이 없다 — 90°보다 급한 꺾임, 앞뒤가 나란한 6m 미만 계단 요철
{
  const fx = require('./fixtures/underground-golden-cases.json'), sub = (p, q) => [p[0] - q[0], p[1] - q[1]], len = (v) => Math.hypot(v[0], v[1]);
  const deg = (u, v) => Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (len(u) * len(v))))) * 180 / Math.PI;
  for (const c of fx.cases) {
    const r = E.generate({...c.input, debug: true});
    for (const P of r.debugRing) P.forEach((q, i) => {
      const n = P.length, p = P[(i + n - 1) % n], s = P[(i + 1) % n], t = P[(i + 2) % n];
      assert(deg(sub(q, p), sub(s, q)) <= 91, `${c.id} 순환 중심선 급한 꺾임 ${Math.round(deg(sub(q, p), sub(s, q)))}° at ${q.map(Math.round)}`);
      assert(!(len(sub(s, q)) < 6000 && deg(sub(q, p), sub(t, s)) < 8), `${c.id} 순환 중심선 계단 요철 at ${q.map(Math.round)}`);
    });
  }
}
console.log('ring drivable ok');
// 94차: 화면 차량 동선 — 직사각 기준 도면은 닫힌 순환 하나, 회전 여유 부족 없음, 램프에서 우회전(또는 직진)으로 순환에 든다
{
  const c = require('./fixtures/underground-golden-cases.json').cases.find((x) => x.id === 'rectangle'), C = E.generate(c.input).circulation;
  assert(C.loops.length === 1 && C.loops[0].length > 8 && C.tight.length === 0 && C.approach.length >= 2, '직사각 차량 동선');
}
console.log('circulation ok');
// 95차 D1–D3: 코어 생성기 안을 구조 격자에 맞춰 앉힌다 — 사진 1 장면(코어 9×8, 9×10 상자). 방 안 기둥 0, 입구 앞 보행 여유가 차로에 닿고 칸이 그 자리를 비우며,
//   벽 다각형에서 문마다 개구부가 빠지고, 실제 외곽이 상자 안에 든다
{
  const G2 = require('../../06_core_layout/01_src/core_gen2.js'), Gm = require('../01_src/plan/CLAUDE_ugp_geom.js'), gen = G2.generate({floorHeight: 3800});
  const layouts = gen.alts.filter((x) => x.status === 'OK' && x.candidate !== false).map((x) => ({id: x.id, outer: x.outer, t: x.t, rooms: Object.fromEntries(Object.entries(x.rooms).map(([k, v]) => [k, v.rects])), doors: x.doors, stairDraw: x.stairDraw, law: x.review?.law}));
  const boxes = [{c: [44200, 33600], w: 9000, d: 8000}, {c: [77100, 33500], w: 9000, d: 10000}];
  const r = E.generate({mass: M([[0, 50], [101.4, 50], [101.4, 22.1], [96.3, 22.1], [96.3, 0], [20, 0]]), ucs: 0, cores: boxes.map((c) => ({...c, layouts})), ramp: ramp(32, 41.7, 0), grid: {wallMm: 400}, floorMm: 3800, phase: [7359, 1200]});
  r.cores.forEach((c, i) => {
    const p = c.plan, alt = gen.alts.find((x) => x.id === p.altId), bb = Gm.bbox(c.pts);
    assert(p && p.columnsInRoom === 0 && p.entranceReachesAisle, `코어 ${i + 1} 맞춤 ${JSON.stringify(p && {room: p.columnsInRoom, reach: p.entranceReachesAisle})}`);
    assert(p.openings.length === alt.doors.length && p.walls.length >= 1, `코어 ${i + 1} 벽·개구부`);
    // 98차: 코어에 반만 걸친 기둥이 없고(모서리 묻힘은 아래 기둥 칸 시험)(걸친 기둥 없음), 놓은 자리면 코어는 상자 안(변마다 ±0.6m), 묻힌 기둥 자리는 벽 채움에 들어 있다
    assert(p.columnsStraddling === 0 && p.growMm.every((g) => g >= 0), `코어 ${i + 1} 기둥 결합 ${JSON.stringify({c: p.columnsAtCorner, l: p.columnsStraddling, g: p.growMm, b: p.boxDeltaMm})}`);
    const wallA = Math.abs(Gm.areaOf(p.walls)), colsIn = r.columns.filter((q) => Math.abs(Gm.areaOf(Gm.boolOp([q], [c.pts], Gm.CL.ClipType.ctIntersection))) > 1e4);
    assert(colsIn.length && colsIn.every((q) => Math.abs(Math.abs(Gm.areaOf(Gm.boolOp(p.walls, [q], Gm.CL.ClipType.ctUnion))) - wallA) < 1e3), `코어 ${i + 1} 기둥이 벽 밖에 따로 남음`);
    { const [cx, cy] = boxes[i].c; assert(!p.fitsBox || (bb[0] >= cx - boxes[i].w / 2 - 601 && bb[2] <= cx + boxes[i].w / 2 + 601 && bb[1] >= cy - boxes[i].d / 2 - 601 && bb[3] <= cy + boxes[i].d / 2 + 601), `코어 ${i + 1} 상자 안`); }
    assert(!r.stalls.some((s) => Math.abs(Gm.areaOf(Gm.boolOp([s.pts], [p.walk], Gm.CL.ClipType.ctIntersection))) > 1e4), `코어 ${i + 1} 입구 앞에 칸`);
  });
  assert(!r.violations.some((v) => v.id === 'CORE_IN_AISLE'), '코어가 차로를 막음');
}
// 98차 사용자 지적: 상자가 코어 크기다 — 상자를 키우면(오른쪽 손잡이: 왼 변 고정) 코어가 커지고, 반 칸 옮기면 코어도 옮겨진다(기둥 칸에 묶이지 않음)
{
  const G2 = require('../../06_core_layout/01_src/core_gen2.js'), Gm = require('../01_src/plan/CLAUDE_ugp_geom.js'), gen = G2.generate({floorHeight: 3800});
  const layouts = gen.alts.filter((x) => x.status === 'OK' && x.candidate !== false).map((x) => ({id: x.id, outer: x.outer, t: x.t, rooms: Object.fromEntries(Object.entries(x.rooms).map(([k, v]) => [k, v.rects])), doors: x.doors, stairDraw: x.stairDraw, law: x.review?.law}));
  const at = (c, w, d) => { const r = E.generate({mass: M([[0, 50], [101.4, 50], [101.4, 22.1], [96.3, 22.1], [96.3, 0], [20, 0]]), ucs: 0, cores: [{c, w, d, layouts}], ramp: ramp(32, 41.7, 0), grid: {wallMm: 400}, floorMm: 3800, phase: [7359, 1200]}); return Gm.bbox(r.cores[0].pts); };
  const w = (b) => b[2] - b[0], b0 = at([44200, 33600], 9000, 8000), b1 = at([45200, 33600], 11000, 8000), b2 = at([48200, 33600], 9000, 8000);
  const ar = (b) => (b[2] - b[0]) * (b[3] - b[1]);
  assert(ar(b1) > ar(b0) + 5e6, `상자를 키워도 코어가 그대로 ${ar(b0)} → ${ar(b1)}`);
  // 기둥 칸 위에 놓은 9×8 상자: 홀이 칸 폭(기둥 바깥면)까지 차고 모서리 기둥 둘 이상이 벽에 묻힌다
  const base = E.generate({mass: M([[0, 50], [101.4, 50], [101.4, 22.1], [96.3, 22.1], [96.3, 0], [20, 0]]), ucs: 0, cores: [], ramp: ramp(32, 41.7, 0), grid: {wallMm: 400}, floorMm: 3800, phase: [7359, 1200]});
  const cc = base.columns.map((q) => [(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2]), xs = [...new Set(cc.map((p) => Math.round(p[0])))].sort((p, q) => p - q), ys = [...new Set(cc.map((p) => Math.round(p[1])))].sort((p, q) => p - q);
  const bx = xs.find((x) => x > 40000), by = ys.find((y) => y > 29000), rb = E.generate({mass: M([[0, 50], [101.4, 50], [101.4, 22.1], [96.3, 22.1], [96.3, 0], [20, 0]]), ucs: 0, cores: [{c: [bx + 4050, by + 4000], w: 9000, d: 8000, layouts}], ramp: ramp(32, 41.7, 0), grid: {wallMm: 400}, floorMm: 3800, phase: [7359, 1200]});
  assert(rb.cores[0].plan.columnsAtCorner >= 2, `기둥 칸 위 상자인데 모서리 묻힘 ${rb.cores[0].plan.columnsAtCorner}`);
  assert(b2[0] >= 48200 - 4500 - 301 && b2[2] <= 48200 + 4500 + 301 && b2[0] - b0[0] > 2000, `4m 옮겨도 코어가 옮긴 상자 안에 없음(기둥 칸에 묶임) ${b0[0]} → ${b2[0]}`);
}
// 98-4 코어 편집: 입구 방향 고정, 문 위치 옮김(홀 벽 안에서 멈춤), EV 자동(대수별 안을 함께 넘기면 엔진이 고르고 대수를 알림)
{
  const G2 = require('../../06_core_layout/01_src/core_gen2.js'), Gm = require('../01_src/plan/CLAUDE_ugp_geom.js');
  const lay = (ev) => G2.generate({floorHeight: 3800, evCount: ev}).alts.filter((x) => x.status === 'OK' && x.candidate !== false).map((x) => ({id: x.id, ev, outer: x.outer, t: x.t, rooms: Object.fromEntries(Object.entries(x.rooms).map(([k, v]) => [k, v.rects])), doors: x.doors, stairDraw: x.stairDraw, law: x.review?.law}));
  const run1 = (core) => E.generate({mass: M([[0, 50], [101.4, 50], [101.4, 22.1], [96.3, 22.1], [96.3, 0], [20, 0]]), ucs: 0, cores: [core], ramp: ramp(32, 41.7, 0), grid: {wallMm: 400}, floorMm: 3800, phase: [7359, 1200]}).cores[0].plan;
  const c0 = {c: [44400, 33600], w: 9000, d: 8000, layouts: lay(1)}, p0 = run1(c0);
  const other = p0.facing === 'S' ? 'N' : 'S', p1 = run1({...c0, facing: other});
  assert(p1.facing === other, `입구 방향 고정 ${p1.facing}`);
  const ent = (p) => p.openings.find((o) => o.id === 'ENT'), mid = (o) => [(o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2];
  const p2 = run1({...c0, facing: p0.facing, doorMm: 1000}), m0 = mid(ent(run1({...c0, facing: p0.facing}))), m2 = mid(ent(p2));
  assert(Math.hypot(m2[0] - m0[0], m2[1] - m0[1]) > 300, '문 위치를 옮겨도 그대로');
  const p3 = run1({...c0, facing: p0.facing, doorMm: 99000}), o3 = ent(p3), hall = p3.rooms.filter((r) => r.kind === 'H').map((r) => Gm.bbox(r.pts));
  assert(hall.some((h) => [o3.a, o3.b].every((q) => q[0] >= h[0] - 300 && q[0] <= h[2] + 300 && q[1] >= h[1] - 300 && q[1] <= h[3] + 300)), '문이 홀 벽 밖으로 나감');
  const pa = run1({...c0, w: 12000, layouts: [1, 2, 3, 4].flatMap(lay)});
  assert(pa.evCount >= 1, `EV 자동 대수 ${pa.evCount}`);
  // 98-5 장애인 칸: 필요 대수 = 총 대수 × 비율 올림, 놓은 대수 ≥ 필요, 3.3m 폭, 다른 칸과 겹치지 않음, 비율 입력 반영
  for (const rate of [undefined, 0.04]) {
    const r = E.generate({mass: M([[0, 50], [101.4, 50], [101.4, 22.1], [96.3, 22.1], [96.3, 0], [20, 0]]), ucs: 0, cores: [{...c0, layouts: lay(1)}], ramp: ramp(32, 41.7, 0), grid: {wallMm: 400}, floorMm: 3800, phase: [7359, 1200], accessibleRate: rate});
    const A = r.stalls.filter((x) => x.stallType === 'accessible'), need = Math.ceil(r.stallCount * (rate ?? 0.03) - 1e-9);
    assert(r.accessible.need === need && r.accessible.placed >= need && A.length === r.accessible.placed, `장애인 칸 ${JSON.stringify(r.accessible)} / 총 ${r.stallCount}`);
    assert(A.every((x) => { const b = Gm.bbox(x.pts); return Math.abs(Math.min(b[2] - b[0], b[3] - b[1]) - 3300) < 2; }), '장애인 칸 폭 3.3m');
    assert(A.every((x) => r.stalls.every((y) => y === x || Math.abs(Gm.areaOf(Gm.boolOp([x.pts], [y.pts], Gm.CL.ClipType.ctIntersection))) < 1e4)), '장애인 칸이 다른 칸과 겹침');
  }
}
console.log('core fit ok');
// 93차 B1: 미사용 잔여공간을 쓰임새로 나눈다 — 나눈 면적 합 = 잔여 면적, 외벽 띠는 DA
{
  for (const c of require('./fixtures/underground-golden-cases.json').cases) {
    const r = E.generate(c.input), sum = r.leftover.reduce((s, x) => s + x.areaM2, 0);
    assert(Math.abs(sum - r.dryAreaM2) <= 1 + r.leftover.length * .05, `${c.id} 잔여 나눔 합 ${sum} vs ${r.dryAreaM2}`);
    assert(r.leftover.some((x) => x.kind === 'da'), `${c.id} DA 없음`);
  }
}
console.log('leftover ok');
// 93차 C: 위반마다 위치·고칠 방향, 코어 옮길 자리 — 사진 1 장면(상자 코어)에서 코어 2가 차로를 막는다 → 옮길 자리는 그 문제가 없고 대수가 지금 이상
{
  const inp = {mass: M([[0, 50], [101.4, 50], [101.4, 22.1], [96.3, 22.1], [96.3, 0], [20, 0]]), ucs: 0, cores: [{c: [44200, 33600], w: 9000, d: 8000}, {c: [77100, 33500], w: 9000, d: 10000}], ramp: ramp(32, 41.7, 0), grid: {wallMm: 400}, floorMm: 3800, phase: [7359, 1200]};
  const r = E.generate(inp), blk = r.issues.find((x) => x.id === 'CORE_IN_AISLE');
  assert(blk && blk.core === 1 && blk.at && blk.zone.length === 1 && blk.fixes.includes('coreMove'), '코어 차단 위치');
  assert(r.issues.every((x) => x.at || !['STALL_NO_FRONT', 'DEAD_END'].includes(x.id)), '칸·막다른 끝 위치');
  const mv = E.suggestCoreMoves(inp, 1);
  assert(mv.length && mv.every((m) => !E.generate({...inp, cores: inp.cores.map((c, j) => (j === 1 ? {...c, c: m.c} : c))}).issues.some((x) => x.core === 1)) && mv[0].stallCount >= r.stallCount, '코어 옮길 자리');
}
console.log('issues ok');
// 98-5 칸 없는 섬: 차로 고리(바깥 40×40, 안 20×20 구멍) 안에 칸 1대 → 섬 하나, 칸 3대 → 섬 아님
{
  const R = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], stall = (x, y) => ({pts: R(x, y, x + 2500, y + 5000)});
  const out = {aisles: [R(0, 0, 40000, 40000), R(10000, 10000, 30000, 30000).reverse()], ramp: null};
  assert.strictEqual(E._emptyIslands(out, [stall(15000, 15000)]).length, 1, '칸 1대 섬을 못 찾음');
  assert.strictEqual(E._emptyIslands(out, [stall(12000, 15000), stall(15000, 15000), stall(18000, 15000)]).length, 0, '칸 3대 섬을 빈 섬으로 봄');
}
console.log('empty island ok');

// 교점 예외는 구조축 전체가 아닌 지정한 기둥에만 적용한다.
{
  const {test} = require('node:test');
  const Grid = require('../01_src/plan/CLAUDE_ugp_grid.js'), Layout = require('../01_src/plan/CLAUDE_ugp_layout.js');
  const CoreFit = require('../01_src/plan/core-fit.js'), Gm = require('../01_src/plan/CLAUDE_ugp_geom.js');
  const axes = {x: [10000,19000,25000,33400], y: [12000,21000,30000]};
  const base = {mass: M(box), cores: [{id:'C',c:[25000,30000],w:4000,d:4000,keep:{x:true,y:true}}], ramp:ramp(30,52,0), grid:{columnAxes:axes}, phase:[6000,8000]};
  const omitted = {ix:1,iy:1,state:'omitted',reason:'원도 대조',source:'test drawing'};
  const integrated = {ix:2,iy:2,state:'wall-integrated',reason:'코어벽 부재',coreId:'C'};
  const withRecords = records => ({...base,grid:{...base.grid,columnIntersections:records}});
  const centers = r => r.columns.map(P => { const b=Gm.bbox(P); return [(b[0]+b[2])/2,(b[1]+b[3])/2]; });

  test('intersection input rejects invalid, sparse, duplicate and unreferenced records', () => {
    const invalid = [null,{},'omitted',[null],new Array(1),[{}],
      [{...omitted,ix:-1}],[{...omitted,ix:axes.x.length}],[{...omitted,iy:axes.y.length}],
      [{...omitted,ix:.5}],[{...omitted,iy:NaN}],[{...omitted,ix:'1'}],
      [omitted,{...omitted}],[{...omitted,state:'column'}],[{...omitted,state:'omittted'}],
      [{...omitted,reason:' '}],[{...omitted,reason:1}],[{...omitted,source:42}],
      [{...omitted,extra:true}],[{...omitted,coreId:'C'}],
      [{...integrated,coreId:undefined}],[{...integrated,coreId:'missing'}]];
    for (const records of invalid) assert.throws(() => E.generate(withRecords(records)), /columnIntersections/);
    assert.throws(() => E.generate({...base,grid:{columnIntersections:[]}}), /columnIntersections/);
    assert.throws(() => E.generate({...withRecords([integrated]),cores:[]}), /columnIntersections/);
    assert.throws(() => E.generate({...withRecords([integrated]),cores:[base.cores[0],base.cores[0]]}), /columnIntersections/);
    const input=withRecords([omitted,integrated]), before=structuredClone(input), normalized=Grid.normalize(input);
    assert.notStrictEqual(normalized.cfg.columnIntersections,input.grid.columnIntersections);
    normalized.cfg.columnIntersections[0].reason='changed';
    assert.deepStrictEqual(input,before,'normalization must not mutate source records');
  });

  test('only an explicitly omitted fixed intersection disappears; wall integration preserves structure', () => {
    const original=E.generate(base), input=withRecords([omitted,integrated]), before=structuredClone(input), r=E.generate(input);
    const expected=original.columns.filter(P => {const b=Gm.bbox(P);return (b[0]+b[2])/2!==19000 || (b[1]+b[3])/2!==21000;});
    assert.equal(original.columns.length,12);assert.deepStrictEqual(r.columns,expected);
    assert(centers(r).some(([x,y])=>x===19000&&y===12000),'same X axis must survive');
    assert(centers(r).some(([x,y])=>x===10000&&y===21000),'same Y axis must survive');
    assert.deepStrictEqual(r.cores,original.cores);assert.deepStrictEqual(r.ramp,original.ramp);
    assert.deepStrictEqual(r.innerOutline,original.innerOutline);assert.deepStrictEqual(input,before);
    assert.deepStrictEqual(E.generate(withRecords([])),original,'empty exceptions preserve the full result');
    assert.deepStrictEqual(E.generate(withRecords([integrated])),original,'integration cannot erase a physical collision');
    assert(r.violations.some(v=>v.id==='FIXED_COLUMN_BLOCKS_ROUTE'),'remaining fixed blockers must still be reported');
    assert.notEqual(r.status,'FEASIBLE');
  });

  test('intersection omissions follow fixed axes through phase changes, coordinate edits and UCS rotation', () => {
    const input=withRecords([omitted]), original=E.generate(input);
    assert.deepStrictEqual(E.generate({...input,phase:[2000,3000]}).columns,original.columns);
    const changedAxes={x:[10000,20000,25000,33400],y:axes.y.slice()}, frame=Grid.frame({...input,grid:{...input.grid,columnAxes:changedAxes}});
    Grid.setPhase(frame,[0,0]);
    const moved=centers({columns:Layout.placeColumns(frame,[],null)});
    assert(!moved.some(([x,y])=>x===20000&&y===21000));assert(moved.some(([x,y])=>x===20000&&y===12000));
    const rotated=E.generate({...input,ucs:90,mass:input.mass.map(p=>Gm.rot(p,90)),cores:input.cores.map(c=>({...c,c:Gm.rot(c.c,90)})),ramp:{...input.ramp,x:-52000,y:30000,angleDeg:90}});
    assert.deepStrictEqual(rotated.columns,original.columns.map(P=>P.map(p=>Gm.rot(p,90).map(Math.round))));
  });

  test('core fitting and wall geometry never resurrect an omitted column or hide an integrated one', () => {
    const columnAxes={x:[18000,20000,22000,30000],y:[18000,20000,22000,30000]};
    const alt={id:'test-hall',outer:{w:4000,h:4000},t:200,rooms:{H:[{x0:200,y0:200,x1:3800,y1:3800}]},doors:[{id:'ENT',orient:'h',axis:0,center:2000,width:1000}]};
    const core={id:'hall',c:[20000,20000],w:4000,d:4000,keep:{x:true,y:true},facing:'S',layouts:[alt]};
    const fit = records => {
      const frame=Grid.frame({mass:M(box),cores:[core],grid:{columnAxes,...(records?{columnIntersections:records}:{})}});
      Grid.setPhase(frame,[0,0]);return {frame,result:CoreFit.fit(frame,core,[])};
    };
    const full=fit(), removed=fit([{ix:1,iy:1,state:'omitted',reason:'홀 내부 기둥 생략'}]);
    assert(full.result&&removed.result);assert.deepStrictEqual(removed.result.r,full.result.r);
    assert(full.result.cols.some(([x,y])=>x===20000&&y===20000));
    assert.deepStrictEqual(removed.result.cols,full.result.cols.filter(([x,y])=>x!==20000||y!==20000));
    assert.equal(removed.result.roomCols,full.result.roomCols-1);
    const physical=centers({columns:Layout.placeColumns(removed.frame,[],null)});
    assert(removed.result.cols.every(p=>physical.some(q=>p[0]===q[0]&&p[1]===q[1])));
    const centerColumn=Gm.rectPoly([19700,19700,20300,20300]);
    const overlap = result => Math.abs(Gm.areaOf(Gm.boolOp(CoreFit.geometry(result).walls,[centerColumn],Gm.CL.ClipType.ctIntersection)));
    assert.equal(overlap(full.result),360000);assert.equal(overlap(removed.result),0);
    const wall=fit([{ix:0,iy:1,state:'wall-integrated',reason:'벽과 결합',coreId:'hall'},{ix:1,iy:1,state:'wall-integrated',reason:'충돌 검사를 유지할 반례',coreId:'hall'}]);
    assert.deepStrictEqual(wall.result.cols,full.result.cols);
    assert.equal(wall.result.roomCols,full.result.roomCols);assert.equal(wall.result.loose,full.result.loose);
    assert.deepStrictEqual(CoreFit.geometry(wall.result).walls,CoreFit.geometry(full.result).walls);
  });
}

// B1 착지 검토는 별도 입력이며 기존 r1과 검사 기준을 바꾸지 않는다.
{
  const {test}=require('node:test'), F=require('../01_src/sghs-reference.js');
  const Gm=require('../01_src/plan/CLAUDE_ugp_geom.js'), Ver=require('../01_src/plan/CLAUDE_ugp_verify.js');
  const engineInput = d => {
    d=structuredClone(d);const rp=d.ramp;
    return {...d,grid:{...F.grid,columnAxes:d.columnAxes},floorMm:undefined,ramp:E.createStraightRamp({landing:rp.p,angleDeg:rp.alignedAngleDeg,widthMm:rp.w,lengthMm:rp.len})};
  };
  test('B1 north wall datum trial restores landing while preserving walls and all fixed elements', () => {
    const f=F.floors[0], oldInput=engineInput(f.revised), input=engineInput(f.landing), before=structuredClone(input);
    const old=E.generate({...oldInput,phase:[6000,8000]}), fixed=E.generate({...input,phase:[6000,8000]}), automatic=E.generate(input);
    assert.equal(old.graph.rootId,null);assert(old.violations.some(v=>v.id==='LANDING'));
    for(const r of [fixed,automatic]){
      assert(Number.isInteger(r.graph.rootId));assert(r.graph.edges.some(e=>e.ok&&e.reached));
      assert(!r.violations.some(v=>['LANDING','EDGE_OFF_AISLE'].includes(v.id)));
      assert.equal(Gm.bbox(input.mass)[3]-Gm.bbox(r.innerOutline)[3],400,'physical wall thickness is retained');
      assert.equal(Gm.bbox(r.innerOutline)[3],f.landingBoundary.sourceInnerY);
      assert.deepStrictEqual(r.columns,old.columns);assert.deepStrictEqual(r.cores,old.cores);assert.deepStrictEqual(r.ramp.body,old.ramp.body);
      assert.deepStrictEqual(r.ramp.landing,old.ramp.landing);assert.equal(r.ramp.shiftMm,0);
      assert.equal(r.status,'INFEASIBLE');assert.equal(r.ramp.approach.accepted,false);
      for(const id of ['RAMP_OFFGRID','COLUMN_IN_AISLE','NO_LOOP'])assert(r.violations.some(v=>v.id===id),id+' remains a failure');
    }
    assert(automatic.stallCount>0,'automatic phase may provide access candidates without certifying the whole route');
    assert.deepStrictEqual(input,before);assert.deepStrictEqual(f.landing.cores,f.revised.cores);assert.deepStrictEqual(f.landing.ramp,f.revised.ramp);
    assert.deepStrictEqual(f.landing.columnAxes,f.revised.columnAxes);assert.equal(f.landingBoundary.certainty,'estimated');
    assert.equal(F.floors[1].landing,undefined,'the B1 interpretation must not leak into B2');
  });
  test('restoring the old boundary or obstructing the B1 landing still rejects the connection', () => {
    const input=engineInput(F.floors[0].landing), p=input.ramp.landing;
    const blocked={...input,occupants:input.occupants.concat({id:'landing-obstruction',c:[p[0]-1500,p[1]],w:3000,d:6000})};
    for(const x of [{...input,mass:F.floors[0].revised.mass},blocked]){
      const r=E.generate(x);assert.equal(r.graph.rootId,null);assert(r.violations.some(v=>v.id==='LANDING'));
      assert.equal(r.graph.edges.filter(e=>e.reached).length,0);assert.equal(r.stallCount,0);assert.equal(r.status,'INFEASIBLE');
    }
  });
  test('a valid landing does not certify parking after the onward graph is disconnected', () => {
    const input=engineInput(F.floors[0].landing), r=E.generate(input), root=r.graph.rootId;
    assert(r.stallCount>0&&Number.isInteger(root));
    const broken={...r,graph:{nodes:r.graph.nodes,edges:r.graph.edges.filter(e=>e.a!==root&&e.b!==root).map((e,i)=>({...e,id:i}))}};
    const check=Ver.check(broken,input);assert.equal(check.rootId,root);assert.equal(check.hasLoop,false);
    assert.equal(check.counts.unreachable,r.stallCount);assert.equal(check.status,'INFEASIBLE');
  });
}

// 사용자 피드백 입력과 폭을 가진 추적 차로는 자동 생성 결과와 별도로 검토한다.
{
  const {test}=require('node:test'),F=require('../01_src/sghs-reference.js'),Gm=require('../01_src/plan/CLAUDE_ugp_geom.js');
  const f=F.floors[0],tr=f.alignedTrace;
  const inputFor = d => {d=structuredClone(d);const rp=d.ramp;return {...d,grid:{...F.grid,columnAxes:d.columnAxes},floorMm:undefined,ramp:E.createStraightRamp({landing:rp.p,angleDeg:rp.alignedAngleDeg,widthMm:rp.w,lengthMm:rp.len})};};
  const overlap = (A,B) => Math.abs(Gm.areaOf(Gm.boolOp(A,B,Gm.CL.ClipType.ctIntersection)));
  test('B1 feedback input aligns only the C1 right face and keeps the accepted inner wall datum', () => {
    const oldInput=inputFor(f.landing),input=inputFor(f.aligned),before=structuredClone(input),old=E.generate(oldInput),r=E.generate(input);
    const a=Gm.bbox(old.cores[0].pts),b=Gm.bbox(r.cores[0].pts);
    assert.deepStrictEqual([b[0],b[1],b[3]],[a[0],a[1],a[3]]);assert.equal(b[2],input.grid.columnAxes.x[3]);
    assert.equal(a[2]-b[2],1000);assert.equal(input.cores[0].w,3000);
    assert.deepStrictEqual(r.cores.slice(1),old.cores.slice(1));assert.deepStrictEqual(r.columns,old.columns);assert.equal(r.columns.length,39);
    assert.deepStrictEqual(r.ramp.body,old.ramp.body);assert.deepStrictEqual(input.mass,oldInput.mass);
    assert.equal(Gm.bbox(r.innerOutline)[3],47300);assert.equal(input.grid.wallMm,400);
    assert.equal(f.alignedBoundary.certainty,'user_confirmed');assert.equal(f.alignedBoundary.wallCertainty,'assumed');
    assert(Number.isInteger(r.graph.rootId));assert(r.stallCount>0);assert.equal(r.status,'INFEASIBLE');
    for(const id of ['RAMP_OFFGRID','COLUMN_IN_AISLE','NO_LOOP'])assert(r.violations.some(v=>v.id===id));
    assert.deepStrictEqual(input,before);assert.equal(input.routes,undefined);assert.equal(F.floors[1].aligned,undefined);
  });
  test('terminal reference aisles reach the lower row fronts inside the floor without consuming parking or cores', () => {
    const input=inputFor(f.aligned),r=E.generate(input);
    assert.equal(tr.widthMm,6000);assert.equal(tr.certainty,'estimated');
    for(let i=0;i<2;i++){
      const a=tr.terminalAisles[i],front=tr.fronts[i],b=Gm.bbox(a.polygon);
      assert.equal(b[2]-b[0],6000);assert.deepStrictEqual(Gm.clipSeg(...front.points,b),[0,1]);
      const route=tr.routes.find(x=>x.id===(i?'동측 남부 가지':'서측 남부 가지'));
      assert.equal(route.points.at(-1)[1],front.points[0][1]);assert.equal(route.points.at(-1)[1],1800);
      const outside=Math.abs(Gm.areaOf(Gm.boolOp([a.polygon],[r.innerOutline],Gm.CL.ClipType.ctDifference)));
      assert.equal(outside,0);assert.equal(overlap([a.polygon],f.rows.map(x=>x.polygon)),0);
      assert.equal(overlap([a.polygon],r.cores.map(x=>x.pts).concat(r.occupants.map(x=>x.pts))),0);
    }
    assert.deepStrictEqual(tr.routes.find(x=>x.id==='서측 남부 가지').points.at(-1),[17000,1800]);
    assert.deepStrictEqual(tr.routes.find(x=>x.id==='동측 남부 가지').points.at(-1),[60700,1800]);
  });
  test('short or narrow terminal surfaces fail front coverage and overlapping fixed columns remain visible', () => {
    for(let i=0;i<2;i++){
      const b=Gm.bbox(tr.terminalAisles[i].polygon),front=tr.fronts[i].points;
      assert.notDeepStrictEqual(Gm.clipSeg(...front,[b[0],b[1]+3000,b[2],b[3]]),[0,1]);
      assert.equal(Gm.clipSeg(...front,[b[0]+100,b[1],b[2]-100,b[3]]),null);
    }
    const r=E.generate(inputFor(f.aligned)),bands=tr.terminalAisles.map(a=>a.polygon),hits=r.columns.filter(P=>overlap([P],bands)>0);
    assert.equal(hits.length,2);assert.equal(overlap(hits,bands),360000);
    assert.deepStrictEqual(hits.map(P=>Gm.bbox(P)),tr.columnConflicts.map(c=>Gm.bbox(c.polygon)));
    assert.deepStrictEqual(tr.columnConflicts.map(c=>c.id),['X2/Y1','X2/Y2']);
    assert.equal(r.status,'INFEASIBLE','source overlays must not erase a failing automatic verdict');
  });
}

// 원본 작동과 6m 순폭은 사용자 전제이며 이를 만족하는 추적 모형을 역산한다.
{
  const {test}=require('node:test'),F=require('../01_src/sghs-reference.js'),Gm=require('../01_src/plan/CLAUDE_ugp_geom.js');
  const inputFor = d => {d=structuredClone(d);const rp=d.ramp;return {...d,grid:{...F.grid,columnAxes:d.columnAxes,columnMm:d.referenceColumnMm??F.grid.columnMm},floorMm:undefined,ramp:E.createStraightRamp({landing:rp.p,angleDeg:rp.alignedAngleDeg,widthMm:rp.w,lengthMm:rp.len})};};
  const overlap = (A,B) => Math.abs(Gm.areaOf(Gm.boolOp(A,B,Gm.CL.ClipType.ctIntersection)));
  test('inverse reference retains 6m net clearance and 5m parking for different assumed column sizes', () => {
    for(const columnMm of [400,600,800]){
      const c=F.calibrateClearance(columnMm),r=E.generate(inputFor(c.input));
      assert.equal(c.trace.columnMm,columnMm);assert.equal(c.trace.columnConflicts.length,0);assert.equal(c.boundary.certainty,'user_assumption');
      for(let i=0;i<2;i++){
        const b=Gm.bbox(c.trace.terminalAisles[i].polygon),axis=c.input.columnAxes.x[i?7:1];
        assert.equal(b[2],axis-columnMm/2);assert.equal(b[2]-b[0],6000);
        assert.deepStrictEqual(Gm.clipSeg(...c.trace.fronts[i].points,b),[0,1]);
        assert.equal(overlap([c.trace.terminalAisles[i].polygon],r.columns),0);
        assert.equal(overlap([c.trace.terminalAisles[i].polygon],r.cores.map(x=>x.pts).concat(r.occupants.map(x=>x.pts))),0);
      }
      for(const row of c.trace.rows.filter(x=>x.id==='서측 외벽'||x.id.startsWith('동측'))){
        const b=Gm.bbox(row.polygon);assert.equal(b[2]-b[0],5000);
        assert.equal(Math.abs(Gm.areaOf(Gm.boolOp([row.polygon],[r.innerOutline],Gm.CL.ClipType.ctDifference))),0);
        assert.equal(overlap([row.polygon],c.trace.terminalAisles.map(x=>x.polygon)),0);
      }
    }
  });
  test('600mm inverse model preserves structure and separates its premise from the automatic verdict', () => {
    const f=F.floors[0],c=F.calibrateClearance(600),r=E.generate(inputFor(f.clearance)),old=E.generate(inputFor(f.aligned)),q=c.equation;
    assert.equal(q.westColumnFaceMm,19700);assert.equal(q.westParkingFrontMm,13700);assert.equal(q.westParkingBackMm,8700);assert.equal(q.westCenterMm,16700);
    assert.equal(q.eastColumnFaceMm,63750);assert.equal(q.eastParkingFrontMm,63750);assert.equal(q.eastCenterMm,60750);
    assert.equal(q.westRowShiftMm,-300);assert.equal(q.eastRowShiftMm,50);
    assert.equal(Gm.bbox(r.innerOutline)[0],q.sourceWestInnerX);assert.equal(q.sourceWestInnerX-q.outerWestX,400);
    assert.equal(r.columns.length,39);assert.deepStrictEqual(r.columns,old.columns);assert.deepStrictEqual(r.cores,old.cores);assert.deepStrictEqual(r.ramp.body,old.ramp.body);
    assert.equal(r.status,old.status,'the source premise must not fabricate an engine pass');
    assert.equal(F.floors[1].clearance,undefined);assert.equal(inputFor(f.clearance).routes,undefined);
  });
  test('inverse input rejects invalid dimensions and returns independent geometry copies', () => {
    for(const x of [null,0,-1,NaN,Infinity,'600'])assert.throws(()=>F.calibrateClearance(x),/기둥 폭/);
    const f=F.floors[0],before=JSON.stringify([f.aligned,f.rows,f.alignedTrace]),c=F.calibrateClearance(600);
    c.input.cores[0].w=1;c.trace.rows[0].polygon[0][0]=0;c.trace.routes[0].points[0][0]=0;
    c.trace.terminalAisles[0].polygon[0][0]=0;c.trace.fronts[0].points[0][0]=0;
    assert.equal(JSON.stringify([f.aligned,f.rows,f.alignedTrace]),before);
  });
}

// Explicit connected candidates use the production surfaces, stall placement and unchanged S7 checker.
{
  const {test}=require('node:test'),F=require('../01_src/sghs-reference.js'),Gm=require('../01_src/plan/CLAUDE_ugp_geom.js');
  const V=require('../01_src/plan/CLAUDE_ugp_verify.js');
  const simple=()=>({mass:M([[0,0],[60,0],[60,50],[0,50]]),ucs:0,cores:[],phase:[0,0],grid:{aisleMm:6000,columnAxes:{x:[20000,40000],y:[12000,30000]}},ramp:E.createStraightRamp({landing:[15000,42000],angleDeg:0,widthMm:6000,lengthMm:10000}),autoZones:false});
  const tree=()=>[{points:[[15000,42000],[33000,42000],[50000,42000],[50000,8000]]},{points:[[33000,42000],[33000,18000]]}];
  const overlap=(A,B,type=Gm.CL.ClipType.ctIntersection)=>Math.abs(Gm.areaOf(Gm.boolOp(A,B,type)));
  const reached=(r,p)=>{const n=r.graph.nodes.find(n=>Gm.len(Gm.sub(n.p,p))<1);return !!n&&r.graph.edges.some(e=>e.reached&&(e.a===n.id||e.b===n.id));};
  test('supplied T network creates physical six-metre aisles and accessible candidate stalls without waiving NO_LOOP',()=>{
    const input=simple(),routes=tree(),before=JSON.stringify([input,routes]),r=E.generateConnected(input,routes);
    assert.equal(JSON.stringify([input,routes]),before);assert.deepStrictEqual(r,E.generateConnected(input,routes));
    assert.equal(r.grid.aisleMm,6000);assert.equal(r.stallCount,46);assert.equal(r.graph.edges.length,4);assert(r.graph.edges.every(e=>e.ok&&e.reached));
    assert(reached(r,[33000,18000]));assert.equal(r.placementReport.counts.clash,0);assert.equal(r.placementReport.counts.noFront,0);
    assert.equal(overlap(r.aisles,r.columns),0);assert(r.violations.some(v=>v.id==='NO_LOOP'));assert.equal(r.status,'INFEASIBLE');
    const check=V.check(r,input);assert.equal(check.counts.deadSide,46);assert(check.edges.every(e=>e.ok&&e.reached));assert.equal(check.status,'INFEASIBLE');
  });
  test('a real 500mm centerline gap remains disconnected even when square end surfaces overlap',()=>{
    const routes=tree();routes[1].points[0][1]-=500;const r=E.generateConnected(simple(),routes);
    assert(!reached(r,[33000,18000]));assert.equal(r.graph.edges.filter(e=>e.reached).length,3);assert.equal(r.stallCount,33);assert.equal(r.placementReport.counts.unreachable,13);
  });
  test('supplied candidates retain obstacle, width, landing, slope and loop checks',()=>{
    const input=simple(),routes=tree();
    const blocked=E.generateConnected({...input,cores:[{c:[33000,30000],w:8000,d:6000,keep:{x:true,y:true}}]},routes);
    assert(blocked.violations.some(v=>v.id==='CORE_IN_AISLE'));assert(!reached(blocked,[33000,18000]));assert.equal(overlap(blocked.aisles,blocked.cores.map(c=>c.pts)),0);
    const narrow=structuredClone(input);narrow.mass[1][0]=52000;narrow.mass[2][0]=52000;
    const nr=E.generateConnected(narrow,routes);assert(nr.violations.some(v=>v.id==='EDGE_OFF_AISLE'));assert(!reached(nr,[50000,8000]));
    const off=tree();off[0].points[0][0]+=500;assert(E.generateConnected(input,off).violations.some(v=>v.id==='LANDING'));
    assert(E.generateConnected({...input,floorMm:4000},routes).violations.some(v=>v.id==='RAMP_SLOPE'));
    const loop=[{points:[[15000,42000],[25000,42000]]},{points:[[25000,42000],[50000,42000],[50000,8000],[25000,8000],[25000,42000]]}];
    const lr=E.generateConnected(input,loop);assert(lr.graph.hasLoop);assert(!lr.violations.some(v=>v.id==='NO_LOOP'));assert.equal(lr.status,'CONDITIONAL');
    assert(lr.violations.some(v=>v.id==='SUPPLIED_NETWORK_UNVERIFIED'),'graph connectivity never establishes actual vehicle travel');
  });
  test('B1 supplied routes enter real placement and retain all fixed input geometry and terminal widths',()=>{
    for(const cm of [400,600,800]){
      const c=F.calibrateClearance(cm),d=c.input,rp=d.ramp,input={...d,grid:{...F.grid,columnAxes:d.columnAxes,columnMm:cm},floorMm:undefined,ramp:E.createStraightRamp({landing:rp.p,angleDeg:rp.alignedAngleDeg,widthMm:rp.w,lengthMm:rp.len})};
      const old=E.generate(input);input.phase=old.grid.phase;const before=JSON.stringify([input,c.trace.routes]),r=E.generateConnected(input,c.trace.routes);
      assert.equal(JSON.stringify([input,c.trace.routes]),before);assert.deepStrictEqual(r.columns,old.columns);assert.deepStrictEqual(r.cores,old.cores);assert.deepStrictEqual(r.occupants,old.occupants);
      assert.deepStrictEqual(r.ramp.body,input.ramp.body);assert.deepStrictEqual(r.ramp.landing,input.ramp.landing);assert.equal(r.ramp.shiftMm,0);assert.equal(r.grid.aisleMm,6000);
      for(const a of c.trace.terminalAisles){assert.equal(overlap([a.polygon],r.aisles,Gm.CL.ClipType.ctDifference),0);assert.equal(overlap([a.polygon],r.columns.concat(r.cores.map(c=>c.pts),r.occupants.map(c=>c.pts))),0);}
      const join=r.graph.nodes.find(n=>n.p[0]===33000&&n.p[1]===19500);assert(join);assert.equal(r.graph.edges.filter(e=>e.a===join.id||e.b===join.id).length,3);
      assert.equal(r.status,'INFEASIBLE');assert.equal(r.stallCount,0);assert.equal(r.graph.edges.filter(e=>e.reached).length,0);
      if(cm===600){assert.equal(r.columns.length,39);assert.equal(r.placementReport.counts.unreachable,58);assert.equal(r.placementReport.counts.noFront,1);assert.equal(r.graph.edges.length,13);assert.equal(r.graph.rootId,0);}
      assert(r.violations.some(v=>v.id===(cm===800?'LANDING':'EDGE_OFF_AISLE')));assert(r.violations.some(v=>v.id==='COLUMN_IN_AISLE'));assert(!reached(r,[33000,5600]));
    }
  });
  test('supplied connection boundary rejects malformed or unsupported inputs',()=>{
    const input=simple();for(const routes of [null,[],[{}],[{points:[[0,0],[NaN,1]]}],[{points:[[0,0],[0,0]]}],[{points:[[0,0],new Array(2)]}]])assert.throws(()=>E.generateConnected(input,routes),RangeError);
    assert.throws(()=>E.generateConnected({...input,phase:undefined},tree()),RangeError);
    assert.throws(()=>E.generateConnected({...input,grid:{aisleMm:6000}},tree()),RangeError);
    assert.throws(()=>E.generateConnected({...input,occupantPolicy:'bypass'},tree()),RangeError);
    assert.throws(()=>E.generateConnected({...input,grid:{...input.grid,aisleMm:5900}},tree()),RangeError);
    assert.throws(()=>E.generateConnected({...input,ramp:{...input.ramp,lengthMm:Infinity}},tree()),RangeError);
    const wrong=structuredClone(input);wrong.ramp.body[0][0]+=500;assert.throws(()=>E.generateConnected(wrong,tree()),RangeError);
  });
}

// Source semantics are checked before any claim about reproducing the drawing.
{
  const {test}=require('node:test'),F=require('../01_src/sghs-reference.js'),G=require('../01_src/plan/CLAUDE_ugp_geom.js');
  const inputFor=rev=>{const d=structuredClone(F.floors[0][rev]),p=d.ramp;return {...d,grid:{...F.grid,columnAxes:d.columnAxes,columnMm:d.referenceColumnMm},floorMm:undefined,ramp:E.createStraightRamp({landing:p.p,angleDeg:p.alignedAngleDeg,widthMm:p.w,lengthMm:p.len})};};
  const candidate=rev=>{const input=inputFor(rev);input.phase=E.generate(input).grid.phase;return E.generateConnected(input,F.floors[0][rev+'Trace'].routes);};
  test('reviewed B1 separates C3 wall outline from hatch and reserves the down-ramp access against all stall candidates',()=>{
    const input=inputFor('reviewed'),before=JSON.stringify(input),old=E.generate(inputFor('clearance')),r=E.generate(input),net=candidate('reviewed');
    assert.equal(JSON.stringify(input),before);assert.deepStrictEqual(G.bbox(r.cores[2].pts),[54200,4800,57200,16800]);assert.equal(Math.abs(G.areaOf([r.cores[2].pts]))/1e6,36);
    assert.deepStrictEqual(r.columns,old.columns);assert.deepStrictEqual(r.ramp.body,old.ramp.body);assert.deepStrictEqual(r.cores.slice(0,2),old.cores.slice(0,2));
    const reserve=r.occupants.find(c=>c.kind==='ramp-access');assert.deepStrictEqual(G.bbox(reserve.pts),[57400,40800,63750,47300]);
    for(const out of [r,net]){const audit=F.auditB1(out,G);assert.equal(audit.coreMismatch,false);assert.equal(audit.rampReservationMissing,false);assert.equal(audit.rampCandidateHits,0);assert.equal(out.grid.aisleMm,6000);}
    assert.equal(net.stallCount,0);assert.equal(net.status,'INFEASIBLE');assert.equal(net.placementReport.counts.unreachable,62);
    assert.equal(F.floors[0].clearance.cores[2].w,5600);assert.equal(F.floors[0].clearance.occupants.length,2);assert.equal(F.floors[1].reviewed,undefined);
  });
  test('source audit detects former hatch overread, missing ramp reservation and an introduced ramp stall',()=>{
    const old=candidate('clearance'),failed=F.auditB1(old,G);assert(failed.coreMismatch);assert(failed.rampReservationMissing);assert.equal(failed.rampCandidateHits,2);
    const corrected=candidate('reviewed'),good=F.auditB1(corrected,G);assert(!good.coreMismatch&&!good.rampReservationMissing&&good.rampCandidateHits===0);
    const missing=structuredClone(corrected);missing.occupants=missing.occupants.filter(c=>c.kind!=='ramp-access');assert(F.auditB1(missing,G).rampReservationMissing);
    const wrong=structuredClone(corrected);wrong.lost.push(G.rectPoly([58000,42000,60500,47000]));assert.equal(F.auditB1(wrong,G).rampCandidateHits,1);
    const wide=structuredClone(corrected);wide.cores[2].pts=G.rectPoly([51600,4800,57200,16800]);assert(F.auditB1(wide,G).coreMismatch);
  });
  test('source row audit exposes omissions and extra candidates while keeping actual accepted parking separate',()=>{
    const r=candidate('reviewed'),audit=F.auditB1(r,G),before=JSON.stringify(r);assert.deepStrictEqual(audit,F.auditB1(r,G));assert.equal(JSON.stringify(r),before);
    assert.equal(audit.rows.length,13);assert.equal(audit.candidateCount,62);assert.equal(audit.keptCount,0);assert.equal(audit.outsideRows.length,8);assert.deepStrictEqual(audit.emptyRows,['동측 북단']);
    assert.equal(audit.rows.find(x=>x.id==='서측 안쪽').coveragePct,69.6);assert.equal(audit.rows.find(x=>x.id==='남서측 쌍열').coveragePct,64.5);
    assert.equal(audit.status,'DIFFERENCES_REQUIRE_REVIEW');assert(audit.rows.every(x=>x.kept===0));
    const noCandidates=F.auditB1({...r,stalls:[],lost:[]},G);assert.equal(noCandidates.emptyRows.length,13);assert(noCandidates.rows.every(x=>x.coveragePct===0));
  });
  test('direct source observations separate visible counts, facing and special use from envelope coverage',()=>{
    const rows=F.floors[0].reviewedTrace.rows,by=id=>rows.find(r=>r.id===id).observation;
    assert.equal(rows.reduce((sum,r)=>sum+r.observation.visibleCount,0),59);
    assert.deepEqual(rows.map(r=>r.observation.visibleCount),[11,5,8,3,3,3,3,12,2,4,2,2,1]);
    assert.deepEqual(rows.map(r=>r.facing),['E','W','WE','N','N','S','S','W','S','W','N','W','W']);
    assert(by('서측 외벽').use.includes('전기차 표시 7'));assert(by('중앙 장애인 열').use.includes('해치 통로'));
    const a=F.auditB1(candidate('reviewed'),G),row=id=>a.rows.find(r=>r.id===id);
    assert.equal(a.visibleSourceCount,59);assert.equal(row('중앙 장애인 열').candidates,3);assert.equal(row('중앙 장애인 열').observation.visibleCount,2);
    assert.equal(row('남측 단열').candidates,4);assert.equal(row('남측 단열').matchingFacing,2,'same count and area do not certify direction');
  });
  test('occupied bands recover source-facing candidates lost between boundary-touching obstacles, without certifying reach',()=>{
    const input=inputFor('reviewed');input.stallRowSelection='sequential';input.phase=E.generate(input).grid.phase;
    const before=JSON.stringify(input),routes=F.floors[0].reviewedTrace.routes;
    const old=E.generateConnected({...input,stallStripProjection:'envelope'},routes),r=E.generateConnected(input,routes);
    const oldAudit=F.auditB1(old,G),audit=F.auditB1(r,G),row=(a,id)=>a.rows.find(x=>x.id===id);
    assert.equal(JSON.stringify(input),before);assert.deepEqual(r,E.generateConnected(input,routes));
    assert.deepEqual([old.lostCount,r.lostCount],[58,62]);
    assert.deepEqual([row(oldAudit,'서측 안쪽').matchingFacing,row(audit,'서측 안쪽').matchingFacing],[0,2]);
    assert.deepEqual([row(oldAudit,'남서측 쌍열').matchingFacing,row(audit,'남서측 쌍열').matchingFacing],[2,4]);
    for(const key of ['columns','cores','occupants','aisles','ramp','graph'])assert.deepEqual(r[key],old[key],key+' must not change to recover stalls');
    const added=r.lost.filter(P=>!old.lost.some(Q=>JSON.stringify(P)===JSON.stringify(Q)));
    assert.equal(added.length,4);
    for(const P of added){const b=G.bbox(P);assert.equal(b[2]-b[0],5000);assert.equal(b[3]-b[1],2500);}
    const blocks=r.columns.concat(r.cores.map(c=>c.pts),r.occupants.map(c=>c.pts),[r.ramp.body],r.aisles);
    assert.equal(Math.abs(G.areaOf(G.boolOp(r.lost,blocks,G.CL.ClipType.ctIntersection))),0);
    assert.equal(r.placementReport.counts.unreachable,62);assert.equal(r.placementReport.counts.clash,0);assert.equal(r.stallCount,0);assert.equal(r.status,'INFEASIBLE');assert(r.violations.some(v=>v.id==='NO_LOOP'));
    const solid=structuredClone(input);solid.occupants.push({c:[20000,27300],w:600,d:8400});
    const blocked=E.generateConnected(solid,routes),gap=G.rectPoly([19700,23100,24700,31500]);
    const vertical=blocked.lost.filter(P=>{const b=G.bbox(P);return b[2]-b[0]>b[3]-b[1];});
    assert.equal(Math.abs(G.areaOf(G.boolOp(vertical,[gap],G.CL.ClipType.ctIntersection))),0,'a positive-width obstruction must still remove the blocked vertical-row height');
    assert.throws(()=>E.generateConnected({...input,stallStripProjection:'unknown'},routes),RangeError);
  });
  test('local row selection replaces crossing pairs, preserves confirmed slots and leaves other B1 rows unchanged',()=>{
    const input=inputFor('reviewed');input.phase=E.generate(input).grid.phase;
    const routes=F.floors[0].reviewedTrace.routes,unchanged=JSON.stringify([input,routes]);
    const old=E.generateConnected({...input,stallRowSelection:'sequential'},routes),r=E.generateConnected(input,routes);
    const before=F.auditB1(old,G),after=F.auditB1(r,G),polys=x=>x.stalls.map(s=>s.pts).concat(x.lost),has=(x,b)=>polys(x).some(P=>JSON.stringify(G.bbox(P))===JSON.stringify(b));
    assert.equal(JSON.stringify([input,routes]),unchanged);assert.deepEqual(r,E.generateConnected(input,routes));
    assert.deepEqual([before.candidateCount,after.candidateCount],[62,62]);
    assert.deepEqual(after.rows.map(x=>x.matchingFacing),[11,4,6,3,3,3,3,12,3,2,4,0,2]);
    assert.deepEqual(after.rows.map(x=>x.wrongFacing),[0,1,0,0,0,0,0,0,0,2,0,0,0]);
    for(const b of [[19700,5550,24700,8050],[19700,8050,24700,10550],[19700,28550,24700,31050],[19700,32100,24700,34600]])assert(has(r,b),'preserve the four user-confirmed polygons');
    const removed=polys(old).filter(P=>!polys(r).some(Q=>JSON.stringify(P)===JSON.stringify(Q)));
    assert.equal(removed.length,4);assert(removed.every(P=>{const b=G.bbox(P);return b[2]-b[0]===2500&&b[3]-b[1]===5000;}));
    const affected=new Set([1,2]);for(let i=0;i<13;i++)if(!affected.has(i))assert.deepEqual(after.rows[i],before.rows[i],'other source rows must not regress');
    for(const k of ['columns','cores','occupants','aisles','ramp','graph'])assert.deepEqual(r[k],old[k]);
    assert.equal(r.stallCount,0);assert.equal(r.status,'INFEASIBLE');assert.equal(r.placementReport.counts.unreachable,62);assert.equal(r.placementReport.counts.clash,0);
    const blocks=r.aisles.concat(r.columns,r.cores.map(c=>c.pts),r.occupants.map(c=>c.pts),[r.ramp.body]);
    assert.equal(Math.abs(G.areaOf(G.boolOp(polys(r),blocks,G.CL.ClipType.ctIntersection))),0);
    const permuted=E.generateConnected(input,routes.slice().reverse().map(p=>({...p,points:p.points.slice().reverse()})));
    assert.deepEqual(polys(permuted).map(P=>JSON.stringify(G.bbox(P))).sort(),polys(r).map(P=>JSON.stringify(G.bbox(P))).sort());
    assert.throws(()=>E.generateConnected({...input,stallRowSelection:'unknown'},routes),RangeError);
  });
  test('row selection also works on a non-SGHS T network and keeps true gaps and obstacles failing',()=>{
    const input={mass:M([[0,0],[60,0],[60,50],[0,50]]),ucs:0,cores:[],phase:[0,0],grid:{aisleMm:6000,columnAxes:{x:[20000,40000],y:[12000,30000]}},ramp:E.createStraightRamp({landing:[15000,42000],angleDeg:0,widthMm:6000,lengthMm:10000}),autoZones:false,stallRowSelection:'continuous'};
    const routes=[{points:[[15000,42000],[33000,42000],[50000,42000],[50000,8000]]},{points:[[33000,42000],[33000,18000]]}];
    const old=E.generateConnected({...input,stallRowSelection:'sequential'},routes),r=E.generateConnected(input,routes);
    assert.deepEqual([old.stallCount,r.stallCount],[46,47]);assert.equal(r.placementReport.counts.clash,0);assert.equal(r.placementReport.counts.noFront,0);
    assert(r.graph.edges.every(e=>e.ok&&e.reached));assert(r.violations.some(v=>v.id==='NO_LOOP'));assert.equal(r.status,'INFEASIBLE');
    const gap=structuredClone(routes);gap[1].points[0][1]-=500;const disconnected=E.generateConnected(input,gap);
    assert(disconnected.placementReport.counts.unreachable>0);assert(!disconnected.graph.edges.every(e=>e.reached));
    const blocked=E.generateConnected({...input,cores:[{c:[33000,30000],w:8000,d:6000,keep:{x:true,y:true}}]},routes);
    assert(blocked.violations.some(v=>v.id==='CORE_IN_AISLE'));assert(blocked.placementReport.counts.unreachable>0);
  });
}

// Endpoint-aware lane geometry is opt-in; historical placement fixtures above remain explicit baselines.
{
  const {test}=require('node:test'),F=require('../01_src/sghs-reference.js'),G=require('../01_src/plan/CLAUDE_ugp_geom.js');
  const Lay=require('../01_src/plan/CLAUDE_ugp_layout.js'),Net=require('../01_src/plan/CLAUDE_ugp_network.js'),I=G.CL.ClipType.ctIntersection,D=G.CL.ClipType.ctDifference;
  const area=P=>Math.abs(G.areaOf(P)),over=(A,B,type=I)=>area(G.boolOp(A,B,type)),box=G.rectPoly;
  const surface=(pieces,obstacles=[])=>Lay.aisleSurface({a:6000,aisleSurfaceMode:'network'},[],pieces,[box([-50000,-50000,100000,100000])],obstacles);
  const seg=(a,b)=>({a,b,kind:'spur',h:G.isH(a,b)?a[1]:null,v:G.isV(a,b)?a[0]:null});
  const band=(a,b)=>{const u=G.norm(G.sub(b,a)),n=[-u[1]*3000,u[0]*3000];return[G.add(a,n),G.add(b,n),G.sub(b,n),G.sub(a,n)];};
  test('obstacle cut endpoints and axis metadata survive repeated cutting',()=>{
    const s=seg([10000,0],[10000,30000]),G0={a:6000},once=Lay.cutByCores(G0,[s],[{r:[9000,14000,11000,16000]}],[]);
    assert.equal(once.length,2);assert.deepEqual(once.map(p=>[p.aEnd,p.bEnd]),[['network','cut'],['cut','network']]);assert(once.every(p=>p.v===10000));
    const twice=Lay.cutByCores(G0,once,[{r:[9000,24000,11000,26000]}],[]);
    assert.equal(twice[0].bEnd,'cut');assert.equal(twice[1].aEnd,'cut');assert.equal(twice[1].bEnd,'cut');
    assert.equal(over(surface(once),[box([7000,11200,13000,18800])]),0,'cuts must not grow back into the removed interval');
  });
  test('flat terminals and actual 45-degree, right-angle and T joins preserve full six-metre bands without end overhangs',()=>{
    const cases=[
      [seg([0,0],[20000,0])],
      [seg([0,0],[20000,0]),seg([20000,0],[35000,15000])],
      [seg([0,0],[20000,0]),seg([20000,0],[20000,20000])],
      [seg([0,0],[40000,0]),seg([20000,0],[20000,20000])]
    ];
    for(const pieces of cases){const before=JSON.stringify(pieces),paths=surface(pieces);assert.equal(JSON.stringify(pieces),before);
      for(const p of pieces)assert(over([band(p.a,p.b)],paths,D)<=1e4,'full width must exist on every unobstructed straight segment');
      const reordered=surface(pieces.slice().reverse().map(p=>({...p,a:p.b,b:p.a})));
      assert(over(paths,reordered,G.CL.ClipType.ctXor)<=1e4,'surface must not depend on segment ordering');
    }
    const straight=surface(cases[0]);assert.equal(over(straight,[box([-3000,-3000,-1,3000])]),0);assert.equal(over(straight,[box([20001,-3000,23000,3000])]),0);
    const gap=surface([seg([0,0],[10000,0]),seg([10500,0],[20000,0])]);assert.equal(over(gap,[box([10001,-2900,10499,2900])]),0,'a true gap is not a junction');
  });
  test('a short clipped diagonal cannot manufacture the former C1 square-cap triangle',()=>{
    const pieces=[{...seg([17091.24087591241,37600],[16700,37200]),aEnd:'cut',bEnd:'network'},seg([16700,37200],[16700,19500])];
    const P=box([19700,34600,24700,37100]),old=Lay.aisleSurface({a:6000},[],pieces,[box([0,0,100000,100000])],[]),paths=surface(pieces);
    assert.equal(over([P],old),615417);assert.equal(over([P],paths),0);
    const graph=Net.buildGraph(pieces);assert.equal(graph.nodes.filter(n=>graph.edges.filter(e=>e.a===n.id||e.b===n.id).length===2).length,1);
  });
  test('B1 C1 regains its fifth correctly oriented candidate while width failures, new front failures and unreachable status stay visible',()=>{
    const d=structuredClone(F.floors[0].reviewed),rp=d.ramp,input={...d,phase:[6400,8000],grid:{...F.grid,columnAxes:d.columnAxes,columnMm:d.referenceColumnMm},floorMm:undefined,ramp:E.createStraightRamp({landing:rp.p,angleDeg:rp.alignedAngleDeg,widthMm:rp.w,lengthMm:rp.len})};
    const routes=F.floors[0].reviewedTrace.routes,old=E.generateConnected(input,routes),r=E.generateConnected({...input,aisleSurfaceMode:'network'},routes),audit=F.auditB1(r,G);
    assert.deepEqual(r,E.generateConnected({...input,aisleSurfaceMode:'network'},routes));
    for(const key of ['columns','cores','occupants','ramp'])assert.deepEqual(r[key],old[key]);assert.deepEqual(r.graph.nodes,old.graph.nodes);
    assert.deepEqual(r.graph.edges.map(e=>[e.a,e.b]),old.graph.edges.map(e=>[e.a,e.b]));assert.equal(r.grid.aisleMm,6000);
    assert.deepEqual(audit.rows.map(x=>x.candidates),[11,5,6,3,3,3,3,10,3,4,4,0,2]);
    assert.deepEqual(audit.rows.map(x=>x.matchingFacing),[11,5,6,3,2,3,2,10,3,2,4,0,2]);
    const target=box([19700,34600,24700,37100]);assert.equal(over([target],old.aisles),615417);assert.equal(over([target],r.aisles),0);
    assert(r.lost.some(P=>JSON.stringify(G.bbox(P))===JSON.stringify(G.bbox(target))));
    for(const b of [[19700,5550,24700,8050],[19700,8050,24700,10550],[19700,28550,24700,31050],[19700,32100,24700,34600]])assert(r.lost.some(P=>JSON.stringify(G.bbox(P))===JSON.stringify(b)));
    assert.equal(r.lostCount,64);assert.equal(audit.outsideRows.length,11);assert.equal(r.placementReport.counts.unreachable,61);assert.equal(r.placementReport.counts.noFront,3);assert.equal(r.placementReport.counts.clash,0);
    assert.equal(r.stallCount,0);assert.equal(r.status,'INFEASIBLE');assert.equal(r.graph.edges.filter(e=>e.reached).length,0);
    assert(r.violations.some(v=>v.id==='EDGE_OFF_AISLE'));assert(r.violations.some(v=>v.id==='NO_LOOP'));assert(r.violations.some(v=>v.id==='STALL_NO_FRONT'));
    assert.equal(over(r.aisles,r.columns.concat(r.cores.map(c=>c.pts),r.occupants.map(c=>c.pts))),0);
    assert.equal(over(r.lost,r.aisles.concat(r.columns,r.cores.map(c=>c.pts),r.occupants.map(c=>c.pts),[r.ramp.body])),0);
  });
  test('endpoint-aware networks retain six-metre T reach, real gap rejection and the existing vehicle turn/body checker',()=>{
    const input={mass:M([[0,0],[60,0],[60,50],[0,50]]),ucs:0,cores:[],phase:[0,0],grid:{aisleMm:6000,columnAxes:{x:[20000,40000],y:[12000,30000]}},ramp:E.createStraightRamp({landing:[15000,42000],angleDeg:0,widthMm:6000,lengthMm:10000}),autoZones:false,aisleSurfaceMode:'network'};
    const tree=[{points:[[15000,42000],[33000,42000],[50000,42000],[50000,8000]]},{points:[[33000,42000],[33000,18000]]}],r=E.generateConnected(input,tree);
    assert.equal(r.stallCount,40);assert.equal(r.graph.edges.length,4);assert(r.graph.edges.every(e=>e.ok&&e.reached));assert.equal(r.placementReport.counts.clash,0);assert.equal(r.placementReport.counts.noFront,0);assert(r.violations.some(v=>v.id==='NO_LOOP'));
    const gap=structuredClone(tree);gap[1].points[0][1]-=500;assert(E.generateConnected(input,gap).placementReport.counts.unreachable>0);
    const loop=[{points:[[15000,42000],[25000,42000]]},{points:[[25000,42000],[50000,42000],[50000,8000],[25000,8000],[25000,42000]]}],cyclic=E.generateConnected(input,loop);
    assert.equal(cyclic.stallCount,49);assert(cyclic.graph.hasLoop);assert.equal(cyclic.status,'CONDITIONAL');assert(cyclic.violations.some(v=>v.id==='SUPPLIED_NETWORK_UNVERIFIED'));
    assert.equal(E.checkVehiclePath(cyclic,[[25000,42000],[45000,42000]]).state,'clear');
    const sharp=E.checkVehiclePath(cyclic,[[43000,42000],[50000,42000],[50000,40000],[43000,40000]]);assert.equal(sharp.state,'blocked');assert.equal(sharp.firstIssue.id,'VEHICLE_SHARP_TURN');
    assert.notEqual(E.checkVehiclePath(cyclic,[[25000,42000],[45000,42000]],{widthMm:7000}).state,'clear');
    assert.throws(()=>E.generateConnected({...input,aisleSurfaceMode:'unknown'},tree),RangeError);assert.throws(()=>E.generate(input),RangeError);
  });
}

// 파란 표시의 중앙 가지는 가로 동선과 실제 분기점을 공유한다.
{
  const {test}=require('node:test'),F=require('../01_src/sghs-reference.js');
  const Net=require('../01_src/plan/CLAUDE_ugp_network.js'),Gm=require('../01_src/plan/CLAUDE_ugp_geom.js');
  const connected = routes => {
    const graph=Net.buildGraph(routes.flatMap(r=>r.points.slice(1).map((b,i)=>({a:r.points[i],b,kind:'reference'}))));
    const first=routes[0].points[0],root=graph.nodes.find(n=>Gm.len(Gm.sub(n.p,first))<1),seen=new Set([root.id]),todo=[root.id];
    while(todo.length){const u=todo.pop();for(const e of graph.edges){const v=e.a===u?e.b:e.b===u?e.a:null;if(v!==null&&!seen.has(v)){seen.add(v);todo.push(v);}}}
    return {graph,seen};
  };
  test('central south branch shares a T junction and is reachable from the traced ramp entry', () => {
    const tr=F.floors[0].clearanceTrace,c=tr.centralConnection;
    assert.deepStrictEqual(c.junction,[33000,19500]);assert.deepStrictEqual(c.end,[33000,5600]);
    const parent=tr.routes.find(r=>r.id===c.parentRouteId),branch=tr.routes.find(r=>r.id===c.branchRouteId);
    assert(parent.points.some(p=>p[0]===c.junction[0]&&p[1]===c.junction[1]));assert.deepStrictEqual(branch.points[0],c.junction);
    const {graph,seen}=connected(tr.routes),end=graph.nodes.find(n=>n.p[0]===33000&&n.p[1]===5600),join=graph.nodes.find(n=>n.p[0]===33000&&n.p[1]===19500);
    assert(seen.has(end.id));assert.equal(seen.size,graph.nodes.length);
    assert.equal(graph.edges.filter(e=>e.a===join.id||e.b===join.id).length,3);
    const broken=structuredClone(tr.routes);broken.find(r=>r.id===c.branchRouteId).points[0][1]-=500;
    const bad=connected(broken),badEnd=bad.graph.nodes.find(n=>n.p[0]===33000&&n.p[1]===5600);
    assert(!bad.seen.has(badEnd.id),'an actual gap must not be accepted as a connected junction');
  });
  test('central branch keeps six-metre clearance between both parking fronts and physical obstacles', () => {
    for(const cm of [400,600,800]){
      const c=F.calibrateClearance(cm),a=c.trace.terminalAisles.find(x=>x.id==='중앙 남측'),d=structuredClone(c.input),rp=d.ramp;
      const input={...d,grid:{...F.grid,columnAxes:d.columnAxes,columnMm:cm},floorMm:undefined,ramp:E.createStraightRamp({landing:rp.p,angleDeg:rp.alignedAngleDeg,widthMm:rp.w,lengthMm:rp.len})};
      const r=E.generate(input),b=Gm.bbox(a.polygon);assert.deepStrictEqual(b,[30000,5600,36000,19500]);
      assert.equal(b[2]-b[0],6000);assert.equal(c.trace.centralConnection.widthMm,6000);
      for(const f of c.trace.fronts.slice(-2))assert.deepStrictEqual(Gm.clipSeg(...f.points,b),[0,1]);
      const obstacles=r.columns.concat(r.cores.map(x=>x.pts),r.occupants.map(x=>x.pts),c.trace.rows.map(x=>x.polygon));
      assert.equal(Math.abs(Gm.areaOf(Gm.boolOp([a.polygon],obstacles,Gm.CL.ClipType.ctIntersection))),0);
      assert.equal(Math.abs(Gm.areaOf(Gm.boolOp([a.polygon],[r.innerOutline],Gm.CL.ClipType.ctDifference))),0);
    }
  });
}
