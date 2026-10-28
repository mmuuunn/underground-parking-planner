/* 지하주차 계획 엔진 v0.5 — 순서 조립(단일안, 차로 먼저). 단위 mm, 다각형 [[x,y],...], 세계 좌표 y 위쪽.
 * 사용자가 정한 매스·코어·램프로 한 개의 안을 만든다. 단계별 파일(같은 폴더):
 *   S1 바탕·S2 구조 격자  CLAUDE_ugp_grid.js     실내 면, UCS, 위상 후보(벽 변 기반). 위상 고르기(실제 대수 비교)는 여기서(rankPhases)
 *   S4 동선망             CLAUDE_ugp_network.js  1번 생성기: 격자 칸 합집합 순환 + 가지 + 안쪽 줄, 그래프(검사용 증거)
 *   S3 램프               CLAUDE_ugp_ramp.js     몸체·착지·접속선(직선 생성기)
 *   점유물·S5·기둥·S6     CLAUDE_ugp_layout.js   코어 붙이기·차로 자르기, 차로 면, 기둥, 칸
 *   S7 독립 검사          CLAUDE_ugp_verify.js   최종 도형만 보고 겹침·앞면·접속·순환·칸 분류(엔진 판단을 믿지 않음)
 *   S8 잔여               여기서: 허용 영역 − (차로·검사 통과 칸·코어·램프·기둥)
 * 설계: 리뷰용/01_클로드_작성/67_지하주차_엔진재구성_설계안_2026-10-25/00_설계안.md
 * 확인하지 않는 것: 정밀 회전 궤적·교행, 사업별 의무 적용 여부, 설비·피난. 칸별 목표는 프로젝트 입력으로 계산한다.
 */
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const need = (name, file) => (isNode ? require(file) : root.UGP[name]);
  const Gm = need('geom', './CLAUDE_ugp_geom.js'), Grid = need('grid', './CLAUDE_ugp_grid.js'), Net = need('network', './CLAUDE_ugp_network.js');
  const Ramp = need('ramp', './CLAUDE_ugp_ramp.js'), Lay = need('layout', './CLAUDE_ugp_layout.js'), Ver = need('verify', './CLAUDE_ugp_verify.js');
  const Curve = need('curveRamp', './CLAUDE_ugp_curve_ramp.js');
  const Modules = need('stallModules', './stall-modules.js');
  const Routing = need('occupantRouting', './occupant-routing.js');
  const CoreFit = need('coreFit', './core-fit.js');
  const Boundary = need('boundary','./planning-boundary.js'), Zones = need('zones','./planning-zones.js'), Allocation=need('allocation','./stall-allocation.js');
  const VehicleRoutes=need('vehicleRoutes','./vehicle-routes.js');
  const {CL, add, sub, mul, len, rectPoly, signedArea, boolOp, areaOf, offsP} = Gm;

  // 위상 하나로 계획 전체. phase = 실내 면 상자(UCS 좌표) 기준 [x, y] mm
  function build(input, phase) {
    input={...input,mass:Boundary.outer(input.parkingMass||input.mass)};
    const G = Grid.frame(input), {cfg, a, d, W, L, inner, b} = G, warnings = [], violations = [];
    if (G.lostParts.length) violations.push({id: 'SPLIT_INNER', note: `외벽 두께를 빼면 실내 면이 ${G.lostParts.length + 1}조각으로 갈라집니다 — 가장 큰 조각만 계산했고 ${G.lostParts.map((x) => Math.round(x)).join('·')}㎡는 빠졌습니다`});
    // S2 구조 격자
    Grid.setPhase(G, phase);
    // S4 동선망(램프 없이) → S3 램프(몸체를 뺀 동선망 + 접속선)
    const base = Net.lanes(G, null);
    if (!base.ringCL.length) throw new RangeError(`매스 폭이 너무 좁아 외곽 순환 차로를 둘 수 없습니다(폭 ${(2 * (d + a)) / 1000}m 이상 필요)`);
    const {rampOut, area:baseArea, lanesOut} = Ramp.placeRamp(G, input, base, violations);
    const boundary=Boundary.resolve(input,rampOut?{...input.ramp,body:rampOut.body.map(W),kind:rampOut.kind}:null);
    if(boundary.issue)violations.push({id:boundary.disconnected?'RAMP_DISCONNECTED':'RAMP_BOUNDARY',note:boundary.issue,at:rampOut?W(rampOut.landing):null});
    const manualZones=Zones.explicit(input).filter(z=>z.kind!=='keep'),zoneLocal=manualZones.flatMap(z=>z.paths.map(P=>P.map(L)));
    const holeLocal=(input.massHoles||[]).map(P=>Boundary.outer(P).map(L)),innerHoles=holeLocal.length?offsP(holeLocal,cfg.wallMm):[];
    const area=boolOp(baseArea,innerHoles.concat(zoneLocal),CL.ClipType.ctDifference);
    const {ringCL, segs} = lanesOut;
    for(const t of lanesOut.unresolvedTurns||[])violations.push({id:'RING_SHARP_TURN',at:W(t.at).map(Math.round),angleDeg:t.angleDeg,note:`순환 차로에서 진행 방향이 ${t.angleDeg.toFixed(1)}° 바뀝니다 — 이 구간을 지나지 않도록 차로·램프 자리를 조정하세요`});
    if (!ringCL.length) throw new RangeError('램프를 빼고 나니 순환 차로를 둘 자리가 없습니다');
    // 점유물(코어) → 동선 자르기 → S5 차로 면
    const cores = Lay.snapCores(G, input, segs);
    { const e1 = a / 2 - 100; cores.forEach((c) => { c.blocks = segs.some((sg) => Gm.clipSeg(sg.a, sg.b, [c.r[0] - e1, c.r[1] - e1, c.r[2] + e1, c.r[3] + e1])); }); }
    // 생성기 안으로 앉힌 코어: 도면(방·벽·문·계단)과 입구 앞 보행 여유. 기둥을 피하지 못했거나 입구가 차로에 안 닿거나 법규 실패면 알린다
    cores.forEach((c, i) => { if (!c.fit) return; c.geo = CoreFit.geometry(c.fit); const n = `코어 ${i + 1}`;
      if(c.fit.loose)violations.push({id:'CORE_COLUMN_PROTRUDES',note:`${n} 바깥선 밖으로 기둥 ${c.fit.loose}개가 튀어나옵니다 — 코어 크기나 자리를 조정하세요`,at:W([(c.r[0]+c.r[2])/2,(c.r[1]+c.r[3])/2]).map(Math.round)});
      if (c.fit.roomCols) violations.push({id: 'CORE_COLUMN_IN_ROOM', note: `${n} 방 안에 기둥 ${c.fit.roomCols}개가 떨어집니다 — 구조 검토 필요(코어 자리·크기를 바꾸면 피할 수 있습니다)`, at: W([(c.r[0] + c.r[2]) / 2, (c.r[1] + c.r[3]) / 2]).map(Math.round)});
      if (!c.fit.reach) violations.push({id: 'CORE_DOOR_OFF_AISLE', note: `${n} 입구 앞 ${CoreFit.WALK / 1000}m 안에 차로가 없습니다 — 입구 쪽을 차로에 붙이세요`, at: W(c.fit.out).map(Math.round)});
      if (c.fit.alt.law === 'FAIL') violations.push({id: 'CORE_LAW', note: `${n} ${c.fit.alt.id}안은 코어 생성기 법규 판정 실패입니다${c.fit.alt.lawNote ? ' — ' + c.fit.alt.lawNote : ''}`, at: W([(c.r[0] + c.r[2]) / 2, (c.r[1] + c.r[3]) / 2]).map(Math.round)}); });
    cores.forEach((c,i)=>{if(input.cores[i]?.layouts?.length&&!c.fit)violations.push({id:'CORE_CONFIG_MISSING',note:`코어 ${i+1} 상자 안에 선택한 승강기 구성이 들어가지 않습니다 — 상자 크기를 늘리거나 승강기 대수를 줄이세요`,at:W([(c.r[0]+c.r[2])/2,(c.r[1]+c.r[3])/2]).map(Math.round)});});
    const occupants=(input.occupants||[]).map((c,i)=>{
      if(!Array.isArray(c.c)||!c.c.every(Number.isFinite)||!(c.w>0&&c.d>0))throw new RangeError('점유물의 중심·폭·깊이를 확인하세요');
      const q=L(c.c);return {id:c.id||'occupant-'+i,kind:c.kind||'equipment',r:[q[0]-c.w/2,q[1]-c.d/2,q[0]+c.w/2,q[1]+c.d/2]};
    });
    const obstacles=cores.concat(occupants),policy=input.occupantPolicy||'report';
    if(!['report','bypass'].includes(policy))throw new RangeError('알 수 없는 코어 차단 정책입니다');
    // 우회 전 구조를 먼저 고정한다. 새 차로와 겹친다는 이유로 기둥을 지우지 않는다.
    const originalPieces=Lay.cutByCores(G,segs,obstacles,policy==='report'?violations:[]);
    const originalAisle=Lay.aisleSurface(G,ringCL,originalPieces,area,obstacles);
    const columns=Lay.placeColumns(G,originalAisle,rampOut);
    let pieces,routing={created:[],failed:[]};
    if(policy==='bypass'&&obstacles.length){
      routing=Routing.bypass(G,segs,area,obstacles,columns);pieces=routing.pieces;
      if(routing.created.length)warnings.push(`막힌 구간 ${routing.created.length}곳에 우회 차로를 만들었습니다`);
      if(routing.failed.length||(routing.blockedCount&&!routing.created.length))violations.push({id:'BYPASS_UNAVAILABLE',note:`차로 폭을 확보할 수 없는 우회 ${routing.failed.length||routing.blockedCount}곳은 만들지 못했습니다`,at:W(routing.failed[0]?.a||segs[0].a).map(Math.round)});
    }else pieces=originalPieces;
    const aisleU = Lay.aisleSurface(G, ringCL, pieces, area, obstacles);
    const graph = Net.buildGraph(pieces);
    // 기둥 · S6 칸
    const blockedStatic = [...obstacles.map((c) => rectPoly(c.r)), ...cores.filter((c) => c.geo).map((c) => c.geo.walk), ...innerHoles,...zoneLocal,...(rampOut ? [rampOut.body] : [])];
    const {stalls, rows, excluded, dbg, outerSign} = Lay.placeStalls(G, segs, area, aisleU, blockedStatic, columns, input.debug, input);
    // 최종 도형(세계 좌표) → S7 독립 검사. 대수·칸 분류·동선 표시·상태는 모두 검사 결과로 정한다
    const Wp = (poly) => poly.map((pt) => W(pt).map(Math.round));
    const out = {
      schema: 'ug-plan/0.5', innerOutline: Wp(inner),parkingInnerPaths:boolOp([inner],innerHoles,CL.ClipType.ctDifference).map(Wp),planningBoundary:boundary,nonParkingZones:manualZones, aisles: aisleU.map(Wp), columns: columns.map(Wp), stalls: stalls.map((s) => ({pts: Wp(s.poly), kind: s.kind, stallType: s.stallType, rowId: s.rowId})),
      stallModules: Modules.catalogue(cfg, input.stallModules), stallRows: rows,
      accessibleCandidateRows: cores.length ? rows.map((row) => ({rowId: row.id, status:'location-only', distanceMm: Math.round(Math.min(...cores.map((c) => row.axis === 'h' ? Math.abs((c.r[1]+c.r[3])/2-row.coordinateMm) : Math.abs((c.r[0]+c.r[2])/2-row.coordinateMm))))})).sort((p,q)=>p.distanceMm-q.distanceMm||p.rowId.localeCompare(q.rowId)).slice(0,4) : [],
      cores: cores.map((c) => ({pts: Wp(rectPoly(c.r)), center: W([(c.r[0] + c.r[2]) / 2, (c.r[1] + c.r[3]) / 2]).map(Math.round), shiftMm: c.shift,
        ...(c.geo ? {plan: {altId: c.fit.alt.id, name: c.fit.alt.name, evCount: c.fit.alt.ev || null, facing: c.fit.f, law: c.fit.alt.law || null, wallMm: c.fit.alt.t, columnsInRoom: c.fit.roomCols, columnsInWall: c.fit.wallCols, columnsAtCorner: c.fit.corner, columnsStraddling: c.fit.loose, growMm: c.fit.grow, boxDeltaMm: c.fit.box, fitsBox: c.fit.fitsBox, entranceReachesAisle: c.fit.reach,
          rooms: c.geo.rooms.map((x) => ({kind: x.kind, pts: Wp(x.poly)})), walls: c.geo.walls.map(Wp), openings: c.geo.openings.map((o) => ({id: o.id, type: o.type, a: W(o.a).map(Math.round), b: W(o.b).map(Math.round), side: o.side})), stair: c.geo.stair.map(Wp), walk: Wp(c.geo.walk)}} : {})})),
      occupants:occupants.map(c=>({id:c.id,kind:c.kind,pts:Wp(rectPoly(c.r))})),
      occupantRouting:{policy,created:routing.created.map(path=>path.map(p=>W(p).map(Math.round))),failed:routing.failed.map(s=>({a:W(s.a).map(Math.round),b:W(s.b).map(Math.round)}))},
      ramp: rampOut && {...(rampOut.kind === 'curve' ? {kind: 'curve', id: rampOut.id, sourceRamp:rampOut.sourceRamp} : {}), body: Wp(rampOut.body), landing: W(rampOut.landing).map(Math.round), tangent: W(rampOut.u), widthMm: rampOut.widthMm, approach:{points:(rampOut.approach||[]).map(p=>W(p).map(Math.round)),widthMm:a,...(rampOut.approachInfo?{firstStraightMm:rampOut.approachInfo.firstStraightMm,turnAnglesDeg:rampOut.approachInfo.turnAnglesDeg,turnCount:rampOut.approachInfo.turnCount,accepted:rampOut.approachInfo.accepted,summary:rampOut.approachInfo.summary}:{})}, start: rampOut.start?W(rampOut.start).map(Math.round):null, slopePct: rampOut.slopePct, lengthMm: rampOut.lengthMm, shiftMm: rampOut.shiftMm},
      graph: {nodes: graph.nodes.map((nd) => ({id: nd.id, p: W(nd.p).map(Math.round)})), edges: graph.edges},
      grid: {gx: cfg.gx, gy: cfg.gy, aisleMm: a, angleDeg: G.ucs, phase: [Math.round(G.X0 - b[0]), Math.round(G.Y0 - b[1])]},
    };
    const placementReport=Ver.check(out,input),sourceStalls=out.stalls;
    const allocated=Allocation.allocate(G,out,placementReport.stallState,input);out.stalls=allocated.stalls;
    let rep,kept,finalRejected=[];
    if(allocated.changes.length){
      rep=Ver.check(out,input);kept=out.stalls.filter((s,i)=>['ok','deadSide'].includes(rep.stallState[i]));
      if(kept.length!==out.stalls.length){finalRejected=out.stalls.filter((s,i)=>!['ok','deadSide'].includes(rep.stallState[i]));violations.push(...rep.violations);out.stalls=kept;rep=Ver.check(out,input);}
    }else{
      // Only rejected candidates were removed and use attributes were assigned.
      // Reuse the independent verdict for identical polygons; no geometry changed.
      const byPolygon=new Map(sourceStalls.map((s,i)=>[s.pts,placementReport.stallState[i]])),states=out.stalls.map(s=>byPolygon.get(s.pts));
      const vs=placementReport.violations.filter(v=>!['STALL_CLASH','STALL_NO_FRONT'].includes(v.id));
      rep={...placementReport,stallState:states,counts:{ok:states.filter(x=>x==='ok').length,deadSide:states.filter(x=>x==='deadSide').length,unreachable:0,noFront:0,clash:0},violations:vs,status:placementReport.status==='INFEASIBLE'?'INFEASIBLE':vs.length?'CONDITIONAL':'FEASIBLE'};kept=out.stalls;
    }
    const parkingSummary=Allocation.summary(kept,allocated.rules);
    for(const [key,q]of Object.entries(parkingSummary.requirements))if(q.short)violations.push({id:key==='accessible'?'ACCESSIBLE_SHORT':'PARKING_SHORT',note:`${q.label} 칸이 ${q.short}대 모자랍니다(배치 ${q.placed}대 / 필요 ${q.need}대)`,parkingType:key});
    violations.push(...placementReport.violations.filter(v=>['STALL_CLASH','STALL_NO_FRONT'].includes(v.id)));
    const accQ=parkingSummary.requirements.accessible,accInfo={ratePct:Math.round((allocated.rules.accessible?.mode==='ratio'?allocated.rules.accessible.value:input.accessibleRate??0.03)*1000)/10,rateSource:allocated.rules.accessible?.source||'project',need:accQ?.need??0,placed:parkingSummary.dimensions.accessible,short:accQ?.short??0,accessStatus:'proximity-only'};
    excluded.unreachable = placementReport.counts.unreachable; excluded.check = placementReport.counts.noFront + placementReport.counts.clash;
    if (excluded.unreachable) warnings.push(`램프에서 닿지 않는 차로에 면한 칸 ${excluded.unreachable}대 제외`);
    if (rep.counts.deadSide) warnings.push(`막다른 차로에 면한 칸 ${rep.counts.deadSide}대(후진·회차 필요)`);
    // S8 미사용 잔여공간: 허용 영역에서 차로·칸·코어·램프·기둥을 뺀 나머지 중 2㎡ 넘는 조각(구멍은 둔다)
    const used = boolOp(out.aisles.concat(kept.map((s) => s.pts), out.cores.map((c) => c.pts),out.occupants.map(c=>c.pts), out.ramp ? [out.ramp.body] : [], out.columns), [], CL.ClipType.ctUnion);
    const rawFree=boolOp(area.map(Wp),used,CL.ClipType.ctDifference);
    const dry = rawFree.filter((q) => Math.abs(signedArea(q)) > 2e6 || signedArea(q) * outerSign < 0);
    const zoning=Zones.calculate(out,input,rawFree);
    out.nonParkingZones=zoning.zones;out.parkingSurface=zoning.parkingSurface;
    // Automatically proposed regions are also checked against the final physical spaces.
    const zoneIssues=Ver.checkZones(out,input),finalIssues=[...new Map(rep.violations.concat(zoneIssues).map(v=>[v.id+'|'+v.note,v])).values()];rep={...rep,violations:finalIssues,status:rep.status==='INFEASIBLE'?'INFEASIBLE':finalIssues.length?'CONDITIONAL':'FEASIBLE'};
    if (rampOut && rampOut.kind === 'curve') { const gap = curveRuleGap(rampOut.id, input.rampEvaluation, rampOut.sourceRamp || input.ramp, curveEvaluationFixed(out)); if (gap) violations.push({id: 'RAMP_RULES', note: gap}); }
    // 칸 없는 섬(98-5, 사용자 지적 "기둥 2개를 도는 동선"): 차로·램프로 둘러싸인 구역에 칸이 ISLAND_MIN대 미만이면 알린다.
    //   실제 공모 평면에서 고리가 도는 섬은 코어 섬·주차 섬뿐이었다(04_docs CLAUDE_V2_도메인교차검토 106–127행). 자동 우회 고침은 재현 장면을 받은 뒤
    for (const isl of emptyIslands(out, kept)) violations.push({id: 'EMPTY_ISLAND', note: `칸이 ${isl.n}대뿐인 섬(${isl.areaM2}㎡)을 차로가 돌아 나갑니다 — 실제 평면에는 없는 동선입니다. 램프 자리·구조열 위치를 바꿔 보세요`, at: isl.at, zone: [isl.poly]});
    const innerArea = Math.abs(areaOf(out.parkingInnerPaths)) / 1e6, allV = [...new Map(violations.concat(rep.violations).map(v=>[v.id+'|'+(v.parkingType||'')+'|'+v.note,v])).values()];
    const sourceRejected=sourceStalls.filter((s,i)=>!['ok','deadSide'].includes(placementReport.stallState[i])),rejected=sourceRejected.concat(finalRejected);
    return Object.assign(out, {
      status: rep.status === 'INFEASIBLE' ? 'INFEASIBLE' : allV.length ? 'CONDITIONAL' : 'FEASIBLE', report: rep,placementReport,parkingSummary,allocationChanges:allocated.changes,areas:zoning.areas,keptZones:zoning.keptZones,unmatchedZoneAssignments:zoning.unmatchedAssignments,unassignedFree:zoning.remaining,rampReview:rampOut?.kind==='curve'?rampReview(input.rampEvaluation,rampOut.id):[],
      stallCount: kept.length, accessible: accInfo, deadSideCount: rep.counts.deadSide, lostCount: rejected.length,allocationDelta:kept.length-(sourceStalls.length-sourceRejected.length), excluded, perStallM2: kept.length ? innerArea / kept.length : null, innerAreaM2: innerArea,
      stalls: kept, lost: rejected.map(s=>s.pts), deadSide: kept.filter((s,i)=>rep.stallState[i]==='deadSide').map(s=>s.pts),
      dry, dryAreaM2: Math.round(Math.abs(areaOf(dry)) / 1e6), leftover: leftovers(dry, out.innerOutline), circulation: circulation(ringCL, segs, rampOut, W),
      graph: {nodes: out.graph.nodes, edges: graph.edges.map((e, i) => ({...e, onCycle: rep.edges[i].onCycle, reached: rep.edges[i].reached, ok: rep.edges[i].ok})), rootId: rep.rootId, hasLoop: rep.hasLoop, deadEnds: rep.deadEnds},
      violations: allV, warnings: allV.map((v) => v.note).concat(warnings), issues: issueList(allV, out, rep, rampOut, W, cores,sourceStalls,placementReport),
      debug: dbg && dbg.map((x) => ({pts: Wp(x.poly), why: x.why})), debugRing: input.debug ? ringCL.map(Wp) : undefined, debugSegs: input.debug ? segs.map((sg) => ({kind: sg.kind, a: W(sg.a), b: W(sg.b)})) : undefined,
    });
  }
  // 위반마다 도면 위치와 고칠 방향(93차 C): {id, note, at(세계 좌표), zone(강조할 다각형들), points(강조할 점들), core(코어 번호), fixes}
  //   fixes: ramp(램프 자리 제안) · phase(구조열 위치 비교) · ucs(격자 방향 비교) · coreMove(코어 옮길 자리) · bypass(코어 둘레 우회)
  const FIXES = {RING_SHARP_TURN:['ramp','phase'],STALL_NO_FRONT: ['phase', 'ucs'], DEAD_END: ['phase', 'ucs'], CORE_IN_AISLE: ['coreMove', 'bypass'], CORE_DOOR_OFF_AISLE: ['coreMove'], CORE_COLUMN_IN_ROOM: ['coreMove'], CORE_LAW: ['coreMove'], BYPASS_UNAVAILABLE: ['coreMove'], RAMP_OFFGRID: ['ramp'], LANDING: ['ramp'], RAMP_RULES: ['ramp'], RAMP_SLOPE: ['ramp'], EDGE_OFF_AISLE: ['phase', 'ucs'], EMPTY_ISLAND: ['ramp', 'phase']};
  // 차로 면 + 램프 몸체의 합집합에 생긴 구멍 = 차로가 둘러싼 섬. 칸 가운데가 그 안에 든 수를 센다(세계 좌표)
  const ISLAND_MIN = 3; // 출발값(조사 근거 없음, 기둥 사이 한 칸 줄 = 3대) — 사용자 판단 위임 2026-10-26
  function emptyIslands(out, kept) {
    const U = boolOp(out.aisles.concat(out.ramp ? [out.ramp.body] : []), [], CL.ClipType.ctUnion); if (!U.length) return [];
    const sgn = Math.sign(signedArea(U.reduce((m, q) => (Math.abs(signedArea(q)) > Math.abs(signedArea(m)) ? q : m)))), mid = (P) => [0, 1].map((k) => P.reduce((n, q) => n + q[k], 0) / P.length);
    const inside = (P, q) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[j], b = P[i]; if ((a[1] > q[1]) !== (b[1] > q[1]) && q[0] < (b[0] - a[0]) * (q[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
    const occupied=(out.cores||[]).map(c=>c.pts).concat((out.occupants||[]).map(c=>c.pts));
    return U.filter((h) => Math.sign(signedArea(h)) !== sgn && Math.abs(signedArea(h)) > 20e6).filter(h=>!occupied.some(P=>Math.abs(areaOf(boolOp([h],[P],CL.ClipType.ctIntersection)))>1e4)).map((h) => ({poly: h.map((q) => q.map(Math.round)), n: kept.filter((st) => inside(h, mid(st.pts))).length, areaM2: Math.round(Math.abs(signedArea(h)) / 1e6), at: mid(h).map(Math.round)})).filter((x) => x.n < ISLAND_MIN);
  }
  function issueList(allV, out, rep, rampOut, W, cores,sourceStalls,placementReport) {
    const mid = (P) => [0, 1].map((k) => Math.round(P.reduce((n, p) => n + p[k], 0) / P.length)), coreAt = (at) => { if (!at) return -1; let bi = -1, bd = Infinity; out.cores.forEach((c, i) => { const d = Math.hypot(c.center[0] - at[0], c.center[1] - at[1]); if (d < bd) { bd = d; bi = i; } }); return bd < 20000 ? bi : -1; };
    const lost = (sourceStalls||out.stalls).filter((s, i) => (placementReport||rep).stallState[i] === 'noFront').map((s) => s.pts);
    const seen = new Set();
    return allV.flatMap((v) => {
      const base = {id: v.id, note: v.note, parkingType:v.parkingType,fixes: FIXES[v.id] || []};
      if (v.id === 'CORE_IN_AISLE') return cores.map((c, i) => (c.blocks ? {...base, core: i, at: out.cores[i].center, zone: [out.cores[i].pts]} : null)).filter(Boolean);
      const key=v.id+'|'+(v.parkingType||'')+JSON.stringify(v.at);
      if (seen.has(key)) return []; seen.add(key);
      if (v.id === 'STALL_NO_FRONT' && lost.length) return [{...base, at: mid(lost[0]), zone: lost}];
      if (v.id === 'DEAD_END' && rep.deadEnds.length) return [{...base, at: rep.deadEnds[0].map(Math.round), points: rep.deadEnds.map((p) => p.map(Math.round))}];
      if (/^RAMP_|^LANDING/.test(v.id) && rampOut) { const ap = (rampOut.approach || []).map((p) => W(p).map(Math.round)); return [{...base, at: ap[1] || W(rampOut.landing).map(Math.round), zone: [rampOut.body.map((p) => W(p).map(Math.round))], points: ap.slice(1)}]; }
      if (v.id === 'EMPTY_ISLAND') return [{...base, at: v.at, zone: v.zone}];
      if (/^CORE_/.test(v.id)) { const i = coreAt(v.at); return [{...base, at: v.at, ...(i >= 0 ? {core: i, zone: [out.cores[i].pts]} : {})}]; }
      return [{...base, at: v.at || null}];
    });
  }
  function leftovers(dry, innerW) {
    const band = boolOp([innerW], offsP([innerW], -100), CL.ClipType.ctDifference), sg = Math.sign(signedArea(innerW));
    const outer = dry.filter((q) => Math.sign(signedArea(q)) === sg), holes = dry.filter((q) => Math.sign(signedArea(q)) !== sg);
    const inside = (P, p) => { let h = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) h = !h; } return h; };
    return outer.map((q) => {
      const paths = [q, ...holes.filter((hh) => inside(q, hh[0]))], A = Math.abs(areaOf(paths)), contact = Math.abs(areaOf(boolOp(paths, band, CL.ClipType.ctIntersection))) / 100;
      const wide = A >= 4e6 && Math.abs(areaOf(offsP(paths, -1000))) >= 2e6; // 폭 2m가 나오는 조각만 자투리 후보(칸 섬 둘레의 1m 띠는 빼낸다)
      const kind = contact >= 2000 ? (A / contact <= Math.max(3000, contact / 2) ? 'da' : 'gap') : wide ? 'room' : 'minor';
      return {kind, areaM2: Math.round(A / 1e5) / 10, paths};
    });
  }
  // 화면용 차량 동선(세계 좌표): 순환 중심선을 회전 반경으로 둥글린 닫힌 선 + 진행 방향, 램프 접속선, 안쪽 줄·가지(양방향).
  //   방향 = 램프에서 순환에 우회전으로 들어가는 쪽(우측통행, 일방 순환으로 볼 때의 제안 방향). 램프가 없으면 반시계.
  //   반경은 TURN_R(차로 중심 6m), 앞뒤 변이 짧아 안 들어가면 들어가는 만큼 줄이고, 3m 미만이면 tight로 알린다(회전 여유 부족 — 궤적 계산은 아님)
  const TURN_R = 6000, TURN_MIN = 3000;
  function circulation(ringCL, segs, rampOut, W) {
    const cross = (u, v) => u[0] * v[1] - u[1] * v[0], unit = (v) => mul(v, 1 / (len(v) || 1)), tight = [];
    const ap = rampOut?.approach || [], end = ap.length > 1 ? ap[ap.length - 1] : null, inDir = end ? unit(sub(end, ap[ap.length - 2])) : null;
    const rings = [];
    const loops = ringCL.map((P0) => {
      let P = Math.sign(signedArea(P0)) > 0 ? P0 : P0.slice().reverse();
      if (end) { // 접속점에 가장 가까운 변의 방향이 우회전이 되게
        let best = null; P.forEach((p, i) => { const q = P[(i + 1) % P.length], d = Gm.segDist(end, p, q); if (!best || d < best.d) best = {d, e: unit(sub(q, p))}; });
        if (best && best.d < 1000) { const c = cross(inDir, best.e); if (c > 1e-3 || (Math.abs(c) <= 1e-3 && Gm.dot(inDir, best.e) < 0)) P = P.slice().reverse(); }
      }
      rings.push(P.map((p) => W(p).map(Math.round)));
      const out = [], n = P.length;
      P.forEach((q, i) => {
        const p = P[(i + n - 1) % n], r = P[(i + 1) % n], u1 = unit(sub(q, p)), u2 = unit(sub(r, q)), th = Math.acos(Math.max(-1, Math.min(1, Gm.dot(u1, u2))));
        if (th < 0.02) { out.push(q); return; }
        const room = Math.min(len(sub(q, p)), len(sub(r, q))) / 2, R = Math.min(TURN_R, room / Math.tan(th / 2)), T = R * Math.tan(th / 2), s = Math.sign(cross(u1, u2));
        if (R < TURN_MIN) tight.push({at: W(q).map(Math.round), radiusMm: Math.round(R),angleDeg:th*180/Math.PI});
        const a0 = add(q, mul(u1, -T)), c = add(a0, mul([-u1[1] * s, u1[0] * s], R)), k = Math.max(4, Math.ceil(th / 0.06)); // 98-5: 3.4°마다 한 점(화면이 원호로 다시 둥글린다)
        for (let j = 0; j <= k; j++) { const v = sub(a0, c), ang = s * th * j / k, cs = Math.cos(ang), sn = Math.sin(ang); out.push(add(c, [v[0] * cs - v[1] * sn, v[0] * sn + v[1] * cs])); }
      });
      return out.map((p) => W(p).map(Math.round));
    });
    // 진입·진출: 램프 위쪽 끝(직선 램프) → 착지 → 접속선 → 순환 합류점을 2차로로 나눠, 우측통행으로 진입(내려오는 차)은 진행 방향 오른쪽,
    //   진출(올라가는 차)은 그 반대쪽 차로 가운데(a/4 옆)에 둔다. 곡선 램프는 몸체 위 선을 그리지 않고 착지부터
    const base = ap.length > 1 ? [...(rampOut.kind !== 'curve' && rampOut.start ? [rampOut.start] : []), ...ap] : [];
    const side = (P, o) => P.map((p, i) => { const u = unit(add(i > 0 ? unit(sub(p, P[i - 1])) : [0, 0], i + 1 < P.length ? unit(sub(P[i + 1], p)) : [0, 0])), k = i > 0 && i + 1 < P.length ? 1 / Math.max(.5, Gm.dot(u, unit(sub(P[i + 1], p)))) : 1; return add(p, mul([u[1], -u[0]], o * k)); });
    const lanesIO = base.length > 1 ? {entry: side(base, TURN_R / 4).map((p) => W(p).map(Math.round)), exit: side(base, -TURN_R / 4).reverse().map((p) => W(p).map(Math.round))} : {entry: [], exit: []};
    // rings·spine: 둥글리기 전 중심선(순환은 위 진행 방향, spine은 램프 위 끝→착지→접속점). 차량 경로는 이것을 이어 붙인 뒤 둥글린다
    return {loops, rings, spine: base.map((p) => W(p).map(Math.round)), approach: ap.map((p) => W(p).map(Math.round)), ...lanesIO, lanes: segs.filter((s) => s.kind === 'row' || s.kind === 'spur').map((s) => [W(s.a).map(Math.round), W(s.b).map(Math.round)]), tight, turnRadiusMm: TURN_R};
  }
  // 곡선 램프는 판정기 결과(input.rampEvaluation = evaluator-core 결과)로만 성립으로 본다: 이 램프의 법규·몸체 항목이 모두 PASS(또는 해당 없음)여야 한다
  const CURVE_ITEMS = ['R01', 'R02', 'R03', 'R04', 'R09', 'G07'];
  const CURVE_NAMES={R01:'램프 유효 폭',R02:'램프 경사',R03:'안쪽 회전 반경',R04:'바닥 접속부 경사 완충',R09:'연석',G07:'램프 몸체의 겹침·외곽'};
  function rampReview(ev,id){return (ev?.items||[]).filter(q=>CURVE_ITEMS.includes(q.id)&&q.subjectId===id).map(q=>({id:q.id,title:CURVE_NAMES[q.id],state:q.applicability==='NOT_APPLICABLE'?'not-required':q.verdict==='PASS'?'ok':q.verdict==='FAIL'?'change-needed':'input-needed',explanation:q.message||'검사에 필요한 정보를 확인하세요',evidence:q.evidence||{},reason:q.reason||null}));}
  const curveEvaluationFixed = plan => ({
    cores:(plan?.cores||[]).map((x,i)=>({id:'core-'+i,polygon:x.pts})),
    reservedZones:(plan?.occupants||[]).map((x,i)=>({id:'occupant-'+i,polygon:x.pts,role:'other'})),
    columns:(plan?.columns||[]).map((polygon,i)=>({id:'column-'+i,polygon,source:'given'}))
  });
  function curveEvaluationSource(ramp, fixed) {
    const ordered = value => Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
    return JSON.stringify(ordered({evaluatorRamp:ramp?.evaluatorRamp,candidateRamp:ramp?.candidateRamp,fixed}));
  }
  function curveRuleGap(id, ev, ramp, fixed) {
    if (!ev || !Array.isArray(ev.items)) return '곡선 램프는 판정기 결과가 있어야 성립으로 봅니다 — 판정기로 확인하세요';
    if (!ev.curveSource || ev.curveSource !== curveEvaluationSource(ramp, fixed)) return `곡선 램프 ${id}의 판정기 결과가 지금 몸체·고도·고정 요소와 다른 입력에서 나왔습니다 — 다시 판정하세요`;
    const mine = ev.items.filter((x) => CURVE_ITEMS.includes(x.id) && x.subjectId === id), miss = CURVE_ITEMS.filter((k) => !mine.some((x) => x.id === k));
    const open = mine.filter((x) => x.applicability !== 'NOT_APPLICABLE' && x.verdict !== 'PASS').map((x) => `${CURVE_NAMES[x.id]}: ${x.message||(x.verdict==='FAIL'?'조건을 충족하지 못합니다':'입력 정보가 부족합니다')}`);
    if (miss.length) open.push(`${miss.map(k=>CURVE_NAMES[k]).join('·')} 검사 정보가 없습니다`);
    return open.length ? open.join(' / ') : null;
  }
  // 계획 점수: 순환이 있어야 하고, 막다른 쪽 칸·막다른 끝은 감점. 램프가 없으면 앞면이 차로에 닿는 칸 수
  const planScore = (r, hasRamp) => (!hasRamp ? r.stallCount + r.excluded.unreachable : r.graph.hasLoop ? r.stallCount - r.deadSideCount - 5 * r.graph.deadEnds.length : r.stallCount - 1e6);
  // S2 위상 고르기(설계안 B3): 후보 위상마다 실제로 배치해 대수로 비교한다. 코어는 빼고 계산한다(구조열은 매스로 정하고 코어는 따른다).
  //   후보: 직교 벽이 있는 축은 벽 변이 격자선에 맞는 위상들, 없는 축은 고르게 훑기(가로 9·세로 8). 조합 12개 이하는 전부,
  //   넘으면 세로·가로를 번갈아 훑는다(대수 분포가 두 축으로 거의 나뉜다 — 사선 4변 매스에서 72개 전수와 같은 최고안).
  //   같은 점수면 먼저 본 후보(형상 순). 반환: 본 후보 전부, 좋은 순
  // ponytail: 사선 매스는 계산 17–25번(80m 매스 0.2초, 240m면 수 초) — 화면은 매스·UCS·모듈을 바꿀 때만 부르고 결과를 문서에 저장한다
  function rankPhases(input) {
    const G = Grid.frame(input), even = (g, n) => Array.from({length: n}, (_, i) => Math.round(i * g / n));
    const xs = Grid.phaseCands(G, true), ys = Grid.phaseCands(G, false), X = xs.length ? xs : even(G.cfg.gx, 9), Y = ys.length ? ys : even(G.gy, 8);
    const probe = {...input, cores: [], debug: false,autoZones:false,zoneAssignments:[]}, seen = new Map();
    const ev = (x, y) => {
      const k = x + ',' + y;
      if (!seen.has(k)) { let v; try { const r = build(probe, [x, y]); v = {phase: [x, y], stallCount: r.stallCount, hasLoop: r.graph.hasLoop, deadEnds: r.graph.deadEnds.length, score: planScore(r, !!input.ramp)}; } catch (e) { v = {phase: [x, y], stallCount: 0, hasLoop: false, deadEnds: 0, score: -Infinity}; } seen.set(k, v); }
      return seen.get(k);
    };
    if (X.length * Y.length <= 12) { for (const y of Y) for (const x of X) ev(x, y); }
    else {
      let cur = ev(X[0], Y[0]);
      for (let it = 0; it < 4; it++) {
        const before = cur;
        for (const y of Y) { const v = ev(cur.phase[0], y); if (v.score > cur.score) cur = v; }
        for (const x of X) { const v = ev(x, cur.phase[1]); if (v.score > cur.score) cur = v; }
        if (cur === before) break;
      }
    }
    return [...seen.values()].sort((p, q) => q.score - p.score); // 안정 정렬: 같은 점수는 본 순서
  }
  // 같은 매스·램프·모듈이면 같은 위상(기억해 둔다). 키는 실내 면과 램프의 상자 기준 좌표라 매스를 통째로 옮겨도 같다
  const PHASE = new Map();
  function autoPhase(input) {
    const G = Grid.frame(input), {b, L} = G, r = input.ramp;
    const rp=p=>L(p).map((v,i)=>Math.round(v-b[i]));
    const rampKey=r?.body?[r.body.map(rp),rp(r.landing),L(r.tangent),r.widthMm,r.lengthMm]:r?[rp([r.x,r.y]),Math.round(((r.angleDeg-G.ucs)%360+360)%360/90)%4,r.widthMm,r.lengthMm]:null;
    const key = JSON.stringify([G.inner.map(([x, y]) => [x - b[0], y - b[1]]), G.cfg, input.stallModules, input.stallRowTypes, input.stallType, rampKey,(input.massHoles||[]).map(P=>P.map(rp)),(input.nonParkingZones||[]).map(z=>[z.kind,z.paths.map(P=>P.map(rp))]),input.parkingOptions]);
    if (!PHASE.has(key)) { PHASE.set(key, rankPhases(input)[0].phase); if (PHASE.size > 50) PHASE.delete(PHASE.keys().next().value); }
    return PHASE.get(key);
  }
  // 입력 위상(input.phase, 화면 문서에 저장한 것)이 있으면 그대로 쓴다 — 코어·램프를 고치는 동안 구조열이 움직이지 않는다
  const okPhase = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
  function generate(input) {
    Zones.explicit(input);Allocation.rules(input,false);
    if (input.ramp && input.ramp.kind === 'curve' && !Array.isArray(input.ramp.body)) throw new RangeError('곡선 램프에 몸체가 없습니다(생성기 입력 오류: ' + (input.ramp.violations || []).map((v) => v.field || v.id).join(', ') + ')');
    const given = okPhase(input.phase), r = build(input, given ? input.phase : autoPhase(input));
    r.grid.phaseFrom = given ? 'input' : 'auto';
    return r;
  }
  // 위상 다시 고르기(화면의 선택 목록): 좋은 순 count개를 실제 입력(코어 포함)으로 다시 계산한 대수
  function suggestPhases(input, count = 4) {
    return rankPhases(input).slice(0, count).map((c) => { try { const r = build(input, c.phase); return {phase: c.phase, stallCount: r.stallCount, hasLoop: r.graph.hasLoop, deadEnds: r.graph.deadEnds.length}; } catch (e) { return null; } }).filter(Boolean);
  }
  // 램프 자리 제안: 벽마다 후보(벽을 따라 양끝에서 양방향, 벽에서 안쪽으로 직각 ¼·½·¾)를 계산해 대수가 많은 순으로 고른다.
  //   점수 = 대수 − 막다른 차로에 면한 칸 − 막다른 끝 × 5, 순환이 없으면 뺀다. 지금 자리보다 점수가 높은 것만 돌려준다. 같은 착지 자리는 하나만.
  //   구조열(위상)은 지금 것으로 고정한다 — 램프를 옮겨도 기둥은 그대로(설계안 결정 ②)
  // ponytail: 후보 수 = 벽 수 × 7 안팎, 한 번 계산이 수십 ms라 1초 안팎 — 벽이 아주 많으면 Worker로 옮길 것
  function suggestRamps(input, count = 3) {
    if (!input.ramp) return [];
    const F = Grid.frame(input), {inner, W, ucs} = F, out = [];
    // 곡선(spec을 가진 생성기 출력)은 같은 입력으로 착지·방향·회전 쪽만 바꿔 다시 만든다. 벽에서 띄우는 길이는 착지에서 몸체 끝까지의 최대 거리
    const curveSpec = input.ramp.body && input.ramp.kind === 'curve' && input.ramp.spec ? input.ramp.spec : null;
    const len0 = curveSpec ? Math.max(...input.ramp.body.map((q) => len(sub(q, input.ramp.landing)))) : input.ramp.lengthMm;
    const sgn = Math.sign(signedArea(inner));
    inner.forEach((p, i) => {
      const q = inner[(i + 1) % inner.length], e = sub(q, p), Le = len(e); if (Le < 12000 || (Math.abs(e[0]) > 1 && Math.abs(e[1]) > 1)) return;
      const u = mul(e, 1 / Le), nIn = sgn > 0 ? [-u[1], u[0]] : [u[1], -u[0]], ang = (v) => Math.atan2(v[1], v[0]) * 180 / Math.PI + ucs;
      const off = F.cfg.wallMm + input.ramp.widthMm / 2 + 500;
      if (Le >= len0 + 6000) for (const [s0, dir] of [[p, u], [q, mul(u, -1)]]) out.push({p: add(add(s0, mul(dir, len0 + 1000)), mul(nIn, off)), angleDeg: ang(dir)});
      for (const t of [.25, .5, .75]) out.push({p: add(add(p, mul(e, t)), mul(nIn, len0 + 1000)), angleDeg: ang(nIn)});
    });
    let r0 = null; try { r0 = generate(input); } catch (e) { /* 지금 자리 성립 안 함 */ }
    const phase = r0 ? r0.grid.phase : autoPhase(input), seen = new Set(), res = [];
    const routesClear = r => {const routes=VehicleRoutes.routes(r);return routes.entry.state==='clear'&&routes.exit.state==='clear';};
    for (const c of out) {
      const wp = W(c.p);
      try {
        if(input.ramp.body && input.ramp.kind !== 'straight' && !curveSpec) continue;
        const cands = curveSpec ? ['left', 'right'].map((turn) => Curve.createCurve({...curveSpec, landing: wp.map(Math.round), tangent: Gm.rot([1, 0], c.angleDeg), turn}))
          : [input.ramp.body?Ramp.createStraight({landing:wp.map(Math.round),angleDeg:c.angleDeg,widthMm:input.ramp.widthMm,lengthMm:len0}):{...input.ramp,x:Math.round(wp[0]),y:Math.round(wp[1]),angleDeg:c.angleDeg}];
        for (const candidateRamp of cands) {
          if (curveSpec && !candidateRamp.body) continue;
          const r = generate({...input, phase, ramp:candidateRamp});
          if (!r.graph.hasLoop || !r.ramp || (!curveSpec && !routesClear(r))) continue;
          const key = r.ramp.landing.map((v) => Math.round(v / 1000)).join(',') + ',' + Math.round(c.angleDeg) + (curveSpec ? ',' + curveSpec.turn + candidateRamp.turn : ''); if (seen.has(key)) continue; seen.add(key);
          res.push({x: r.ramp.landing[0], y: r.ramp.landing[1], angleDeg: c.angleDeg, ...(curveSpec ? {kind: 'curve', turn: candidateRamp.turn} : {}), stallCount: r.stallCount, deadEnds: r.graph.deadEnds.length, body: r.ramp.body, score: planScore(r, true)});
        }
      } catch (e) { /* 이 자리는 성립 안 함 */ }
    }
    const cur = r0 && r0.graph.hasLoop && (curveSpec || routesClear(r0)) ? planScore(r0, true) : -Infinity;
    // Curve suggestions are screened by the UI with a fresh rule evaluation.
    // Keep lower-count curve positions too: a compliant position can be worth more.
    return res.filter((c) => curveSpec || c.score > cur).sort((x, y) => y.score - x.score).slice(0, count);
  }
  // 코어 옮길 자리(93차 C): 코어 i를 기둥 한두 칸(가로 gx·세로 gy, UCS 방향)씩 옮겨 보고, 그 코어 문제가 없어진 자리를 대수 많은 순으로. 구조열(위상)은 지금 것 그대로
  function suggestCoreMoves(input, i, count = 3) {
    const r0 = generate(input), {gx, gy} = r0.grid, ucs = r0.grid.angleDeg, c0 = input.cores[i], phase = r0.grid.phase, out = [];
    const bad = (r) => r.issues.some((x) => x.core === i);
    for (let m = -2; m <= 2; m++) for (let k = -2; k <= 2; k++) {
      if (!m && !k) continue;
      const c = add(c0.c, Gm.rot([m * gx, k * gy], ucs)).map(Math.round), cores = input.cores.map((x, j) => (j === i ? {...x, c} : x));
      try { const r = generate({...input, cores, phase}); if (!bad(r)) out.push({c, stallCount: r.stallCount, status: r.status, moveMm: Math.round(Math.hypot(m * gx, k * gy))}); } catch (e) { /* 이 자리는 성립 안 함 */ }
    }
    return out.sort((p, q) => q.stallCount - p.stallCount || p.moveMm - q.moveMm).slice(0, count);
  }
  // UCS 제안: 매스 변 방향(5m 넘는 변, 90° 주기로 같은 방향은 하나)마다 격자를 돌려(위상도 그 방향에서 새로 골라) 계산해 대수 순으로 돌려준다.
  // ponytail: 매스 하나에 격자 하나 — 날개마다 다른 방향 격자(여러 구역)는 로드맵 단계 0 이후 과제
  function suggestUcs(input) {
    const angs = []; input.mass.forEach((p, i) => { const q = input.mass[(i + 1) % input.mass.length]; if (len(sub(q, p)) < 5000) return; let t = Math.atan2(q[1] - p[1], q[0] - p[0]) * 180 / Math.PI; t = ((t % 90) + 90) % 90; if (t > 45) t -= 90; t = Math.round(t * 10) / 10; if (!angs.some((x) => Math.abs(x - t) < 1)) angs.push(t); });
    const rampAngle=input.ramp?.tangent?Math.atan2(input.ramp.tangent[1],input.ramp.tangent[0])*180/Math.PI:input.ramp?.angleDeg;
    const k = input.ramp ? Math.round((((rampAngle - (input.ucs || 0)) % 360) + 360) % 360 / 90) % 4 : 0, out = [];
    for (const t of angs) {
      const old=input.ramp,delta=t-(input.ucs||0),turnPoint=p=>add(old.landing,Gm.rot(sub(p,old.landing),delta));
      const ramp=old?.body?{...old,body:old.body.map(turnPoint),tangent:Gm.rot(old.tangent,delta),start:old.start?turnPoint(old.start):null}:old&&{...old,angleDeg:t+90*k};
      try { const r = generate({...input, ucs: t, phase: null, ramp}); out.push({ucs: t, stallCount: r.stallCount, hasLoop: r.graph.hasLoop, deadEnds: r.graph.deadEnds.length}); } catch (e) { /* 이 방향은 성립 안 함 */ }
    }
    return out.sort((x, y) => (y.hasLoop - x.hasLoop) || y.stallCount - x.stallCount);
  }
  // 화면용: 코어·램프를 놓을 때 붙는 자리(세계 좌표). generate와 같은 규칙.
  function snap(input) {
    const r = generate(input);
    return {cores: r.cores.map((c) => c.center), ramp: r.ramp ? r.ramp.landing : null};
  }
  const api = {_emptyIslands: emptyIslands, generate, snap, suggestPhases, suggestRamps, suggestUcs, suggestCoreMoves, configureCore:CoreFit.configure,planningBoundary:Boundary.resolve,rampReview,inspectVehicleRoutes:VehicleRoutes.routes,checkVehiclePath:VehicleRoutes.check,curveEvaluationFixed, curveEvaluationSource, createStraightRamp:Ramp.createStraight, createCurveRamp:Curve.createCurve, DEFAULTS: Grid.DEFAULTS, STALL_MODULES: Modules.CATALOGUE};
  if (isNode) module.exports = api; else root.UGPlan = api;
})(this);
