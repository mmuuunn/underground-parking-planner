/* 지하주차 계획 엔진 — S7 독립 검사. 엔진의 판단 함수를 쓰지 않고 최종 출력(세계 좌표, 화면에 그리는 그대로)만 보고 다시 판정한다.
 * 화면의 상태·경고·대수는 이 검사의 report 하나를 근거로 한다.
 *   허용 영역 = 실내 면 − 램프 몸체. 칸: 허용 영역 안, 다른 칸·차로 면·기둥·코어·램프와 겹치지 않음, 짧은 변 하나가 차로 면을 향함(앞면).
 *   기둥: 차로 면·램프와 겹치지 않음(코어 안 기둥은 정상). 차로 면: 허용 영역 안, 코어 밑에 없음.
 *   동선: 엔진이 낸 중심선 그래프는 '증거'로만 받는다 — 각 구간의 띠(폭 a − 2·widthMm)가 차로 면 안인 구간만 남긴다.
 *   시작점: 착지 점에 있는 그래프 점 + 착지에서 접선 방향 a/2 길이의 접속 띠(램프 폭과 a 중 좁은 쪽)가 차로 면 안 + 램프 몸체가 매스 안.
 *   순환·막다른 끝·칸 분류(칸 앞 차로 중심 점이 차로 면 안이고 가장 가까운 남은 구간이 램프에서 닿는지, 그 구간이 막다른 가지면 막다른 쪽)는 남은 구간만으로 순환 엔진 v0.4의 graphInfo로 판정.
 * 허용오차(TOL, report.tolerance로 공개): 겹침·돌출 면적 1e4mm²(0.01㎡) 이하는 수치 오차로 본다. 램프 몸체는 매스 밖 1㎡까지(외벽 관통).
 */
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const Gm = isNode ? require('./CLAUDE_ugp_geom.js') : root.UGP.geom;
  const Loop = isNode ? require('../../src/underground/candidates/rectangular-loop-v04.js') : root.UGLoop;
  const Boundary=isNode?require('./planning-boundary.js'):root.UGP.boundary;
  const {CL, add, sub, mul, len, bbox, boxHit, signedArea, boolOp, areaOf, segDist, norm} = Gm;
  const TOL = Object.freeze({areaMm2: 1e4, widthMm: 100, probeMm: 300, nodeMm: 50, rampOutsideMm2: 1e6});
  const I = CL.ClipType.ctIntersection, D = CL.ClipType.ctDifference, U = CL.ClipType.ctUnion;
  const A = (paths) => Math.abs(areaOf(paths));
  // 점이 경로들(구멍 포함, nonzero) 안인지
  const inside = (pt, paths) => paths.reduce((w, P) => w + (CL.Clipper.PointInPolygon({X: pt[0], Y: pt[1]}, Gm.toC(P)) !== 0 ? Math.sign(signedArea(P)) : 0), 0) !== 0;
  // 선분 띠(끝은 잘라 냄)
  const band = (p, q, h) => { const n = mul(norm(sub(q, p)), 1), m = [-n[1] * h, n[0] * h]; return [add(p, m), add(q, m), sub(q, m), sub(p, m)]; };
  const near = (poly, paths) => { const bb = bbox(poly); return paths.filter((q) => boxHit(bb, bbox(q))); };
  const over = (poly, paths) => { const c = near(poly, paths); return c.length ? A(boolOp([poly], c, I)) : 0; };
  // 여러 다각형 중 기준을 넘는 것: 합쳐서 한 번 재 보고 넘을 때만 하나씩
  const offenders = (polys, total, each) => (total(polys) <= TOL.areaMm2 ? [] : polys.map((P, i) => [i, each(P)]).filter(([, v]) => v > TOL.areaMm2));

  function checkZones(out,input,expected){
    if(!expected){const u=input.ucs||0,w=input.grid?.wallMm??400,base=Gm.offs((input.parkingMass||input.mass).map(p=>Gm.rot(p,-u)),-w),holes=(input.massHoles||[]).map(P=>Boundary.outer(P).map(p=>Gm.rot(p,-u)));expected=boolOp(base,holes.length?Gm.offsP(holes,w):[],D).map(P=>P.map(p=>Gm.rot(p,u).map(Math.round)));}
    const result=[],zones=out.nonParkingZones||[],walks=out.cores.filter(c=>c.plan).map(c=>c.plan.walk),ramp=out.ramp?[out.ramp.body]:[];
    const cores=out.cores.map(c=>c.pts).concat((out.occupants||[]).map(c=>c.pts));
    const bands=zones.some(z=>z.source==='input')?out.graph.edges.map(e=>band(out.graph.nodes[e.a].p,out.graph.nodes[e.b].p,out.grid.aisleMm/2-TOL.widthMm)):[];
    const at=paths=>{const b=bbox(paths.flat());return [Math.round((b[0]+b[2])/2),Math.round((b[1]+b[3])/2)];};
    for(const z of zones){
      if(A(boolOp(z.paths,expected,D))>TOL.areaMm2)result.push({id:'ZONE_OUTSIDE',note:`${z.kind.toUpperCase()} 영역이 주차 본체의 실내 경계를 벗어납니다`,at:at(z.paths)});
      const protect=out.aisles.concat(cores,ramp,walks,out.columns,(out.stalls||[]).map(s=>s.pts),z.source==='input'?bands:[]);
      if(A(boolOp(z.paths,protect,I))>TOL.areaMm2)result.push({id:'ZONE_CONFLICT',note:`${z.kind.toUpperCase()} 영역이 주차칸·차로·기둥·코어·출입 여유와 겹칩니다`,at:at(z.paths)});
    }
    return result;
  }

  // out: generate 출력(세계 좌표). input: 원래 입력(mass·ramp.widthMm)
  function check(out, input) {
    const a = out.grid.aisleMm, aisles = out.aisles, ramp = out.ramp, cores = out.cores.map((c) => c.pts).concat((out.occupants||[]).map(c=>c.pts)), V = [];
    // Reconstruct the permitted floor from the user's mass, independently of
    // the declared output boundary. Keep the same mm coordinate convention.
    const ucs = Number.isFinite(input.ucs) ? input.ucs : 0, wall = input.grid?.wallMm ?? 400;
    const mass=input.parkingMass||input.mass;
    const expectedBase=Gm.offs(mass.map((p) => Gm.rot(p, -ucs)), -wall).map((P) => P.map((p) => Gm.rot(p, ucs).map(Math.round)));
    const holes=(input.massHoles||[]).map(P=>Boundary.outer(P).map(p=>Gm.rot(p,-ucs))),holeWalls=holes.length?Gm.offsP(holes,wall).map(P=>P.map(p=>Gm.rot(p,ucs).map(Math.round))):[];
    const expected=boolOp(expectedBase,holeWalls,D),boundary=Boundary.resolve(input,ramp);
    const declaredOutside = A(boolOp([out.innerOutline],expectedBase,D))+A(boolOp(out.parkingInnerPaths||boolOp([out.innerOutline],holeWalls,D),expected,D));
    if (declaredOutside > TOL.areaMm2) V.push({id: 'INNER_OUTSIDE', note: '계산된 실내 경계가 매스의 허용 범위를 벗어납니다'});
    const zones=(out.nonParkingZones||[]).flatMap(z=>z.paths),allowed=boolOp(expected,(ramp?[ramp.body]:[]).concat(zones),D);
    const at = (paths) => { const bb = paths.reduce((m, P) => { const q = bbox(P); return [Math.min(m[0], q[0]), Math.min(m[1], q[1]), Math.max(m[2], q[2]), Math.max(m[3], q[3])]; }, [Infinity, Infinity, -Infinity, -Infinity]); return [Math.round((bb[0] + bb[2]) / 2), Math.round((bb[1] + bb[3]) / 2)]; };
    // 차로 면
    const aOut = boolOp(aisles, allowed, D).filter((P) => Math.abs(signedArea(P)) > TOL.areaMm2);
    if (aOut.length) V.push({id: 'AISLE_OUTSIDE', note: `차로 면 ${aOut.length}곳이 실내 면 밖(또는 램프 위)에 있습니다`, at: at(aOut)});
    const aCore = cores.length ? boolOp(aisles, cores, I).filter((P) => Math.abs(signedArea(P)) > TOL.areaMm2) : [];
    if (aCore.length) V.push({id: 'AISLE_UNDER_CORE', note: `코어 밑에 차로 면이 ${aCore.length}곳 남아 있습니다`, at: at(aCore)});
    const {nodes} = out.graph, h = a / 2 - TOL.widthMm, bands = out.graph.edges.map((e) => band(nodes[e.a].p, nodes[e.b].p, h));
    V.push(...checkZones(out,input,expected));
    if(boundary.disconnected)V.push({id:'RAMP_DISCONNECTED',note:'램프 몸체가 주차 본체에서 떨어져 있습니다',at:ramp?.landing});
    if(boundary.siteOutsideMm2>TOL.areaMm2)V.push({id:'FLOOR_OUTSIDE_ALLOWED',note:'층 외곽이 지정한 허용 경계를 벗어납니다'});
    // 기둥
    const colBlock = aisles.concat(ramp ? [ramp.body] : []);
    const badCols = offenders(out.columns, (Ps) => A(boolOp(Ps, colBlock, I)), (P) => over(P, colBlock));
    if (badCols.length) V.push({id: 'COLUMN_IN_AISLE', note: `기둥 ${badCols.length}개가 차로·램프와 겹칩니다`, at: at(badCols.map(([i]) => out.columns[i]))});
    // 램프 몸체와 코어·점유물: 지우거나 옮기지 않고 겹침만 보고한다(직선 포함, 사용자 결정 2026-10-26)
    const rampCore = ramp && cores.length ? over(ramp.body, cores) : 0;
    if (rampCore > TOL.areaMm2) V.push({id: 'RAMP_HITS_CORE', note: `램프 몸체가 코어·점유물과 ${(rampCore / 1e6).toFixed(1)}㎡ 겹칩니다`, at: ramp.landing});
    // 동선 증거 확인: 차로 면 밖으로 나가는 구간은 버린다
    const offEdge = new Set(offenders(bands, (Ps) => A(boolOp(boolOp(Ps, [], U), aisles, D)), (P) => A(boolOp([P], aisles, D))).map(([i]) => out.graph.edges[i].id));
    const duplicateIds = new Set(), uniqueEdges = new Set();
    for (const e of out.graph.edges) {
      const ends = [nodes[e.a].p.join(','), nodes[e.b].p.join(',')].sort().join('|');
      if (uniqueEdges.has(ends)) duplicateIds.add(e.id); else uniqueEdges.add(ends);
    }
    const okEdges = out.graph.edges.filter((e) => !offEdge.has(e.id) && !duplicateIds.has(e.id));
    if (duplicateIds.size) V.push({id: 'DUPLICATE_EDGE', note: `같은 위치의 중복 동선 ${duplicateIds.size}개를 순환 판정에서 뺐습니다`});
    if (offEdge.size) V.push({id: 'EDGE_OFF_AISLE', note: `동선 ${offEdge.size}구간이 차로 면을 벗어나 동선에서 뺐습니다`, at: at(out.graph.edges.filter((e) => offEdge.has(e.id)).map((e) => [nodes[e.a].p, nodes[e.b].p]))});
    // 시작점
    let rootId = null;
    if (!input.ramp || !ramp) V.push({id: 'LANDING', note: '램프가 없어 동선을 확인할 수 없습니다'});
    else {
      const massOut = A(boolOp([ramp.body], boundary.floorPaths, D));
      const t = ramp.tangent, hw = Math.min(input.ramp.widthMm, a) / 2 - TOL.widthMm, strip = band(ramp.landing, add(ramp.landing, mul(t, a / 2)), hw);
      const nd = nodes.find((n) => len(sub(n.p, ramp.landing)) <= TOL.nodeMm);
      if (massOut > TOL.rampOutsideMm2) V.push({id: 'RAMP_OUTSIDE', note: `램프 몸체 ${(massOut / 1e6).toFixed(1)}㎡가 허용된 층 외곽을 벗어납니다 — 외곽 또는 램프 자리를 확인하세요`, at: ramp.landing});
      else if (!nd || A(boolOp([strip], aisles, D)) > TOL.areaMm2) V.push({id: 'LANDING', note: '램프 착지에서 차로로 곧게 이어지는 진입선이 없습니다 — 램프를 매스 안쪽으로 옮기거나 돌려 보세요', at: ramp.landing});
      else rootId = nd.id;
    }
    // 순환·막다른 끝(남은 구간만)
    const info = Loop._internal.graphInfo({nodes, edges: okEdges}, rootId);
    const reachedE = (e) => rootId !== null && info.reached.has(e.a) && info.reached.has(e.b);
    const hasLoop = okEdges.some((e) => reachedE(e) && !info.bridges.has(e.id));
    const deadNodes = nodes.filter((n) => n.id !== rootId && info.reached.has(n.id) && info.adj[n.id].length === 1);
    // 막다른 가지: 끊으면 갈라지는 구간(다리) 중 램프 반대쪽이 고리 없는 나뭇가지인 것. 램프에서 순환으로 가는 진입 구간은 아니다(너머에 고리)
    const deadE = new Set();
    for (const e of okEdges) if (info.bridges.has(e.id) && reachedE(e)) {
      const side = new Set([e.a]), todo = [e.a];
      while (todo.length) { const u = todo.pop(); for (const [v, eid] of info.adj[u]) if (eid !== e.id && !side.has(v)) { side.add(v); todo.push(v); } }
      const far = side.has(rootId) ? e.b : e.a, comp = new Set([far]), st = [far]; let ec = 0;
      while (st.length) { const u = st.pop(); for (const [v, eid] of info.adj[u]) { if (eid === e.id) continue; ec++; if (!comp.has(v)) { comp.add(v); st.push(v); } } }
      if (ec / 2 === comp.size - 1) deadE.add(e.id);
    }
    if (ramp && rootId !== null && !hasLoop) V.push({id: 'NO_LOOP', note: '램프에서 한 바퀴 돌아 나오는 순환이 없습니다', at: ramp.landing});
    if (deadNodes.length) V.push({id: 'DEAD_END', note: `막다른 차로 끝 ${deadNodes.length}곳`, at: deadNodes[0].p});
    // 칸: 허용 영역·겹침 → 앞면 → 동선
    const S = out.stalls.map((s) => s.pts), state = S.map(() => null);
    const blockers = aisles.concat(out.columns, cores, ramp ? [ramp.body] : [],out.cores.filter(c=>c.plan).map(c=>c.plan.walk));
    for (const [i] of offenders(S, (Ps) => A(boolOp(Ps, allowed, D)), (P) => A(boolOp([P], allowed, D)))) state[i] = 'outside';
    for (const [i] of offenders(S, (Ps) => A(boolOp(Ps, blockers, I)), (P) => over(P, blockers))) state[i] = state[i] || 'hit';
    if (S.reduce((t, P) => t + Math.abs(signedArea(P)), 0) - A(boolOp(S, [], U)) > TOL.areaMm2) {
      const bbs = S.map(bbox);
      S.forEach((P, i) => { for (let j = 0; j < i; j++) if (!state[j] && boxHit(bbs[i], bbs[j]) && A(boolOp([P], [S[j]], I)) > TOL.areaMm2) { state[i] = state[i] || 'overlap'; break; } });
    }
    // 칸 앞 차로 중심 점(앞면에서 a/2)이 차로 면 안이면 가장 가까운 남은 구간(a 안, 모서리 띠 포함)에 붙인다.
    //   두 구간이 만나는 점 앞처럼 거리가 거의 같으면(50mm 안) 막다른 가지가 아닌 쪽 — 1mm 흔들림에 분류가 뒤집히지 않게
    const clearConnection = (p, q) => len(sub(q, p)) <= TOL.nodeMm || A(boolOp([band(p, q, TOL.widthMm)], aisles, D)) <= TOL.areaMm2;
    const edgeAt = (pt) => {
      if (!inside(pt, aisles)) return null;
      const ds = okEdges.map((e) => {
        const p = nodes[e.a].p, q = nodes[e.b].p, u = sub(q, p), t = Math.max(0, Math.min(1, Gm.dot(sub(pt, p), u) / (Gm.dot(u, u) || 1)));
        const foot = add(p, mul(u, t));
        return [e, len(sub(pt, foot)), foot];
      }).filter(([, dd, foot]) => dd < a && clearConnection(pt, foot)), m = Math.min(...ds.map(([, dd]) => dd));
      const near2 = ds.filter(([, dd]) => dd <= m + 50).map(([e]) => e);
      return near2.find((e) => reachedE(e) && !deadE.has(e.id)) || near2.find((e) => reachedE(e)) || near2[0] || null;
    };
    S.forEach((P, i) => {
      if (state[i]) return;
      const c = mul(P.reduce((m, q) => add(m, q), [0, 0]), 1 / P.length);
      const fronts = P.map((p, k) => [p, P[(k + 1) % P.length]]).sort((x, y) => len(sub(x[1], x[0])) - len(sub(y[1], y[0]))).slice(0, 2).map(([p, q]) => {
        const mid = mul(add(p, q), .5), u = norm(sub(q, p)); let n = [-u[1], u[0]]; if ((mid[0] - c[0]) * n[0] + (mid[1] - c[1]) * n[1] < 0) n = mul(n, -1);
        const center = add(mid, mul(n, a / 2)), probe = add(mid, mul(n, TOL.probeMm));
        return [.2, .5, .8].every((s) => inside(add(add(p, mul(sub(q, p), s)), mul(n, TOL.probeMm)), aisles)) && clearConnection(probe, center) ? center : null;
      }).filter(Boolean);
      if (!fronts.length) { state[i] = 'noFront'; return; }
      const e = fronts.map(edgeAt).find(Boolean);
      state[i] = !e || !reachedE(e) ? 'unreachable' : deadE.has(e.id) ? 'deadSide' : 'ok';
    });
    const cnt = (k) => state.filter((x) => x === k).length, clash = cnt('outside') + cnt('hit') + cnt('overlap');
    if (clash) V.push({id: 'STALL_CLASH', note: `실내 면 밖이거나 차로·기둥·코어·다른 칸과 겹치는 칸 ${clash}대를 뺐습니다`, at: at(S.filter((P, i) => ['outside', 'hit', 'overlap'].includes(state[i])))});
    if (cnt('noFront')) V.push({id: 'STALL_NO_FRONT', note: `앞면이 차로에 닿지 않는 칸 ${cnt('noFront')}대를 뺐습니다`, at: at(S.filter((P, i) => state[i] === 'noFront'))});
    return {
      stallState: state, rootId, hasLoop, deadEnds: deadNodes.map((n) => n.p),
      edges: out.graph.edges.map((e) => ({id: e.id, ok: !offEdge.has(e.id) && !duplicateIds.has(e.id), reached: !offEdge.has(e.id) && !duplicateIds.has(e.id) && reachedE(e), onCycle: !offEdge.has(e.id) && !duplicateIds.has(e.id) && !deadE.has(e.id)})), // onCycle = 막다른 가지가 아님(화면의 빨간 점선 구분)
      counts: {ok: cnt('ok'), deadSide: cnt('deadSide'), unreachable: cnt('unreachable'), noFront: cnt('noFront'), clash},
      violations: V, tolerance: TOL,
      status: V.some((v) => ['INNER_OUTSIDE', 'RAMP_OUTSIDE','RAMP_DISCONNECTED','FLOOR_OUTSIDE_ALLOWED', 'LANDING', 'NO_LOOP'].includes(v.id)) ? 'INFEASIBLE' : V.length ? 'CONDITIONAL' : 'FEASIBLE',
    };
  }
  const api = {check,checkZones, TOL};
  if (isNode) module.exports = api; else (root.UGP = root.UGP || {}).verify = api;
})(this);
