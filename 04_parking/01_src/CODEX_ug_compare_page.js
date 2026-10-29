/* Codex 지하주차 계획 화면(underground-compare.html), 곡선 화면 연결 89차.
 * 기존 CLAUDE_ug_compare_page.js의 편집 동작을 보존한 화면 소유 사본.
 * 지하주차 계획 화면(underground-compare.html). 계산은 계획 엔진 v0.5(UGPlan: 차로 먼저 · 단일안, 동선 검사는 순환 엔진 v0.4의 graphInfo)를 부르고,
 * 이 파일은 입력(매스·UCS·코어·램프·모듈)·편집·표현만 맡는다. 단위 mm, 세계 좌표는 y 위쪽.
 * 조작 규칙은 통합 캔버스(07_integrated_canvas/01_src/ui-edit.js·ui-state.js)와 맞춘다: 휠 확대, 휠 버튼·Space+끌기 이동, 끄는 중 숫자+Enter,
 * 방향키 이동, Del, R 회전, Ctrl+끌기 복사, Ctrl+Z/Y(전체 상태 스냅숏 스택), 자동 저장.
 * 엔진이 수 ms라 끄는 동안에도 다시 계산해 보여 주고, 놓으면 코어·램프를 엔진이 붙인 자리(구조열·차로 축)로 옮겨 저장한다.
 * 화면 좌표(D): 세계 점 p를 UCS로 돌린 u = rot(p, −ucs)의 [u.x, −u.y]. 도면 그룹은 transform="scale(1,-1) rotate(−ucs)"로 같은 변환을 한다.
 */
'use strict';
const SITE = [[-49338,64968],[-43711,65645],[67007,12166],[67742,7397],[37015,-34457],[30224,-30255],[26582,-31258],[23369,-32143],[20185,-34285],[-4356,-39324],[-11075,-40704],[-25459,-52254],[-39885,16502],[-48960,63033]];
const referenceQuery = new URL(location.href).searchParams;
const referenceScene = referenceQuery.get('reference') === 'sghs' ? {floor:referenceQuery.get('floor')||'B1',revision:referenceQuery.get('revision')||'revised'} : null;
const WALL = 400, FLOOR = 3800, STORE = referenceScene ? `ug-sghs:2026-10-29-r1:${referenceScene.floor}:${referenceScene.revision}` : 'ug-compare:v2';
const $ = (id) => document.getElementById(id);

// ── 기하 ──
const rot = (p, deg) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c]; };
const add = (a, b) => [a[0] + b[0], a[1] + b[1]], sub = (a, b) => [a[0] - b[0], a[1] - b[1]], mul = (a, k) => [a[0] * k, a[1] * k], dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const signedArea = (P) => P.reduce((s, a, i) => { const b = P[(i + 1) % P.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2;
const area = (P) => Math.abs(signedArea(P));
const bbox = (P) => [Math.min(...P.map((p) => p[0])), Math.min(...P.map((p) => p[1])), Math.max(...P.map((p) => p[0])), Math.max(...P.map((p) => p[1]))];
const edgeAngle = (a, b) => { let t = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI; while (t > 90) t -= 180; while (t <= -90) t += 180; return Math.round(t * 1e4) / 1e4; };
const wrapAngle = deg => ((deg + 180) % 360 + 360) % 360 - 180;
const longestEdgeAngle = (P) => { let best = null; P.forEach((a, i) => { const b = P[(i + 1) % P.length], L = Math.hypot(...sub(b, a)); if (!best || L > best.L) best = {L, t: edgeAngle(a, b)}; }); return best.t; };
function selfCrossing(P) {
  const n = P.length, cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) { if (i === 0 && j === n - 1) continue; const a = P[i], b = P[(i + 1) % n], c = P[j], d = P[(j + 1) % n]; if (cr(a, b, c) * cr(a, b, d) < 0 && cr(c, d, a) * cr(c, d, b) < 0) return true; }
  return false;
}
// 두 직선(점+방향)의 교점, 평행이면 null
const meet = (p, u, q, v) => { const d = u[0] * v[1] - u[1] * v[0]; if (Math.abs(d) < 1e-9) return null; const t = ((q[0] - p[0]) * v[1] - (q[1] - p[1]) * v[0]) / d; return add(p, mul(u, t)); };
// 변 i를 돌출: 이웃 변은 그대로 두고 변 양 끝에 새 꼭짓점 두 개를 넣어 d만큼 민다(한 변만 늘이기)
function extrudeEdge(P, i, d) {
  if (!d) return P.map(p => p.slice());
  const n = P.length, a = P[i], b = P[(i + 1) % n], L = Math.hypot(...sub(b, a)), u = mul(sub(b, a), 1 / L), out = signedArea(P) > 0 ? [u[1], -u[0]] : [-u[1], u[0]];
  const a2 = add(a, mul(out, d)).map(Math.round), b2 = add(b, mul(out, d)).map(Math.round), Q = P.map((p) => p.slice());
  Q.splice(i + 1, 0, a2, b2); return dropStraight(Q);
}
// 한 줄 위에 놓인 점(곧게 이어지거나 되돌아가는 바늘 끝)을 지운다
function dropStraight(P) {
  let Q = P.slice();
  for (let it = 0; it < 4; it++) Q = Q.filter((p, i) => { const a = Q[(i + Q.length - 1) % Q.length], b = Q[(i + 1) % Q.length]; return Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) > 1 * Math.hypot(b[0] - a[0], b[1] - a[1]) && Math.hypot(p[0] - a[0], p[1] - a[1]) > 1; });
  return Q;
}
// 변 i를 바깥 법선 방향으로 d만큼 민다. 양 끝은 이웃 변을 따라 미끄러져 이웃 변 방향이 유지된다(직교 매스는 직교 유지).
function pushEdge(P, i, d) {
  if (!d) return P.map(p => p.slice());
  const n = P.length, a = P[i], b = P[(i + 1) % n], L = Math.hypot(...sub(b, a));
  if (L < 1) return P.map(p => p.slice());
  const u = mul(sub(b, a), 1 / L), out = signedArea(P) > 0 ? [u[1], -u[0]] : [-u[1], u[0]];
  // A split straight edge has parallel neighbours. Their intersection is
  // undefined (or far away after mm rounding), so make a local jog.
  const parallel = v => { const length = Math.hypot(...v); return length < 1 || Math.abs(u[0] * v[1] - u[1] * v[0]) / length < .01; };
  const a2 = add(a, mul(out, d)), pa = P[(i + n - 1) % n], nb = P[(i + 2) % n];
  if (parallel(sub(a, pa)) || parallel(sub(b, nb))) return extrudeEdge(P, i, d);
  const A = meet(a2, u, pa, sub(a, pa)) || a2, B = meet(a2, u, nb, sub(b, nb)) || add(b, mul(out, d));
  const limit = Math.max(2 * L, 8 * Math.abs(d), 2000);
  if (Math.hypot(...sub(A, a)) > limit || Math.hypot(...sub(B, b)) > limit) return extrudeEdge(P, i, d);
  const Q = P.map((p) => p.slice()); Q[i] = A.map(Math.round); Q[(i + 1) % n] = B.map(Math.round); return Q;
}
const usableMass = P => P.length >= 3 && P.every(p => p.every(Number.isFinite)) && area(P) > 1e6 && area(P) <= 60000e6 && !selfCrossing(P);

// ── 주차 모듈(기둥 간격 gx: 칸 3대 + 기둥, gy: 차로 = 2gy − 2·칸 깊이) ──
const MODULES = {normal: {name: '일반형 2.5×5.0 · 기둥 8.1×8.0', grid: {gx: 8100, gy: 8000, stallW: 2500, stallD: 5000}}, wide: {name: '확장형 2.6×5.2 · 기둥 8.4×8.2', grid: {gx: 8400, gy: 8200, stallW: 2600, stallD: 5200}}};
const insidePoly = (P, p) => { let s = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[j], b = P[i]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) s = !s; } return s; };
function followAlignedEdge() {
  const binding=doc.ramp.edgeBinding;if(!binding||curveMode())return;
  const M=doc.mass,i=binding.index;if(!(i>=0&&i<M.length)){delete doc.ramp.edgeBinding;return;}
  const a=M[i],b=M[(i+1)%M.length],e=sub(b,a),length=Math.hypot(...e);
  if(length<1000){delete doc.ramp.edgeBinding;return;}
  const u=mul(e,1/length),inward=signedArea(M)>0?[-u[1],u[0]]:[u[1],-u[0]];
  const direction=binding.reverse?mul(u,-1):u,from=binding.reverse?b:a;
  const along=Math.max(0,Math.min(length,binding.ratio*length));
  doc.ramp.p=add(add(from,mul(direction,along)),mul(inward,WALL+300+doc.ramp.w/2)).map(Math.round);
  doc.ramp.alignedAngleDeg=wrapAngle(Math.atan2(direction[1],direction[0])*180/Math.PI);
}
function remapAlignedEdge(oldMass,newMass,editedIndex) {
  const binding=doc.ramp.edgeBinding;if(!binding||oldMass.length===newMass.length)return;
  if(newMass.length>oldMass.length){
    const added=newMass.length-oldMass.length;
    if(binding.index===editedIndex)binding.index=editedIndex+1;
    else if(binding.index>editedIndex)binding.index+=added;
  }else if(binding.index>=editedIndex){delete doc.ramp.edgeBinding;}
}
function splitAlignedEdge(index,fraction) {
  const b=doc.ramp.edgeBinding;if(!b)return;
  if(b.index>index)b.index++;
  else if(b.index===index){
    const t=b.reverse?1-b.ratio:b.ratio;
    if(t>fraction){b.index=index+1;b.ratio=b.reverse?(1-t)/(1-fraction):(t-fraction)/(1-fraction);}
    else b.ratio=b.reverse?(fraction-t)/fraction:t/fraction;
  }
  followAlignedEdge();
}
function removeAlignedVertex(index) {
  const b=doc.ramp.edgeBinding;if(!b)return;
  const n=doc.mass.length;
  if(b.index===index||b.index===(index+n-1)%n)delete doc.ramp.edgeBinding;
  else if(b.index>index)b.index--;
}

// ── 문서(저장·실행 취소 대상) ──
function defaultDoc() {
  const ucs = longestEdgeAngle(SITE), W = (u) => rot([u[0] * 1000, u[1] * 1000], ucs).map(Math.round);
  return {v: 2, ucs, mass: [[-50, 10], [-30, 10], [-30, -12], [46, -12], [46, 10], [51, 10], [51, 38], [-50, 38]].map(W),
    cores: [{c: W([-5, 25]), w: 9000, d: 7000}, {c: W([20, 0]), w: 9000, d: 7000}], ramp: {p: W([-22, 34.2]), k: 0, len: 24000, w: 6000}, snap: 1000, module: 'normal'};
}
function validDoc(d) {
  if(d?.referenceColumnMm!==undefined&&(!Number.isFinite(d.referenceColumnMm)||d.referenceColumnMm<=0))return false;
  if(d?.columnAxes!==undefined){try{UGP.grid.normalize({mass:d.mass,grid:{columnAxes:d.columnAxes,...(d.referenceColumnMm!==undefined?{columnMm:d.referenceColumnMm}:{})}});}catch(e){return false;}}
  const ok = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
  return d && d.v === 2 && Number.isFinite(d.ucs) && Array.isArray(d.mass) && d.mass.length >= 3 && d.mass.every(ok) && Array.isArray(d.cores) && d.cores.every((c) => ok(c.c) && c.w > 0 && c.d > 0) && d.ramp && ok(d.ramp.p) && d.ramp.len > 0 && d.ramp.w > 0 && (d.ramp.alignedAngleDeg === undefined || Number.isFinite(d.ramp.alignedAngleDeg));
}
function load() { try { const d = JSON.parse(localStorage.getItem(STORE)); return validDoc(d) ? d : null; } catch (e) { return null; } }
function save() { try { localStorage.setItem(STORE, JSON.stringify(doc)); } catch (e) { /* 저장 불가: 무시 */ } }
let doc = load() || defaultDoc();
const REVIEW_BACKUP = STORE + ':before-turn-bay';
let reviewLoadError = '';
if (new URL(location.href).searchParams.get('scene') === 'turn87') {
  const previous = load();
  let backupReady=true;
  if (previous && previous.layoutAlternative !== 'turnBay') {
    try { localStorage.setItem(REVIEW_BACKUP, JSON.stringify(previous)); } catch (e) { backupReady=false; }
  }
  if (!backupReady) reviewLoadError='이전 장면을 보관할 수 없어 실험안을 불러오지 않았습니다. 브라우저 저장 공간을 확인하세요.';
  if (backupReady) {
    doc = {v:2, mass:[[-30089,8981],[-26923,-11428],[23749,-35903],[49409,17223],[-11822,46799]], ucs:-25.7815,
      cores:[{c:[22127,184],w:9489,d:5981,doors:{ENT:100}}], ramp:{p:[3395,19905],k:0,len:24000,w:6000},
      snap:1000,module:'wide',floorMm:3800,allowExternalRamp:true,layoutAlternative:'turnBay'};
    doc.phase={key:JSON.stringify([doc.mass,doc.ucs,doc.module]),p:[4000,0]};
    save();
    try {
      if (localStorage.getItem(STORE) === JSON.stringify(doc)) {
        const clean=new URL(location.href);clean.searchParams.delete('scene');history.replaceState(null,'',clean.href);
      }
    } catch (e) { /* keep the scene link when storage is unavailable */ }
  }
}
const hist = {stack: [], i: -1};
function pushHist() { const j = JSON.stringify(doc); if (hist.stack[hist.i] === j) return false; hist.stack.length = hist.i + 1; hist.stack.push(j); hist.i++; if (hist.stack.length > 80) { hist.stack.shift(); hist.i--; } updUndo(); return true; }
function commit(label) { ui.ghosts = null; if (pushHist()) { save(); recompute(label); } else renderEdit(); }
function jump(i) { if (ui.drag) endDrag(false); if (i < 0 || i >= hist.stack.length || i === hist.i) return; hist.i = i; doc = JSON.parse(hist.stack[i]); ui.sel = null; save(); updUndo(); renderAll(); recompute('실행 취소/다시 실행'); }
const updUndo = () => { $('undoBtn').disabled = hist.i <= 0; $('redoBtn').disabled = hist.i >= hist.stack.length - 1; };

const ui = {tool: 'select', sel: null, view: null, res: null, prev: null, lastChange: null, ver: 0, drag: null, draw: null, typed: '', space: false, msg: '', msgT: 0, guide: null, mouse: [0, 0], alignRamp: false};

// ── 계산 ──
// 98-5: 손잡이와 선택 영역은 엔진이 실제로 앉힌 코어 외곽에 둔다(사용자 지적: 손잡이와 코어 사이 간격). 상자는 끌기를 시작할 때 실제 코어로 맞춘다
const coreRect = (i) => { const k = doc.cores[i], f = (ui.live || ui.res)?.cores?.[i]; if (!f?.plan || (ui.drag && ui.drag.i === i && ['core', 'coreEdge'].includes(ui.drag.kind))) return k; const L = f.pts.map(toU), xs = L.map((q) => q[0]), ys = L.map((q) => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys); return {c: fromU([(x0 + x1) / 2, (y0 + y1) / 2]).map(Math.round), w: Math.round(x1 - x0), d: Math.round(y1 - y0)}; };
const syncCoreBox = (i) => { const r = coreRect(i); Object.assign(doc.cores[i], {c: r.c, w: r.w, d: r.d}); delete doc.cores[i].keep; };
// 기둥 자석: 결과의 기둥 중심·양 면(지역 축). 끄는 동안 8px 안이면 붙는다
function colFeats(side) { const r = ui.res; if (!r || r.fail || !r.columns?.length) return {x: [], y: []}; const C = r.columns.map((P) => P.map(toU)), hc = (Math.max(...C[0].map((q) => q[0])) - Math.min(...C[0].map((q) => q[0]))) / 2, f = (k) => [...new Set(C.map((P) => Math.round(P.reduce((s, q) => s + q[k], 0) / P.length)))].flatMap((v) => side?[v+side*hc]:[v-hc,v+hc]); return {x: f(0), y: f(1)}; }
const magnet = (v, F, tol) => { let b = null; for (const f of F) if (Math.abs(f - v) <= tol && (b === null || Math.abs(f - v) < Math.abs(b - v))) b = f; return b; };
const corePoly = (k) => { const h = [k.w / 2, k.d / 2]; return [[-h[0], -h[1]], [h[0], -h[1]], [h[0], h[1]], [-h[0], h[1]]].map((p) => add(k.c, rot(p, doc.ucs)).map(Math.round)); };
const movePlanningRegions = mv => {if(doc.massHoles)doc.massHoles=doc.massHoles.map(P=>P.map(mv));for(const key of ['nonParkingZones','zoneAssignments'])if(doc[key])doc[key]=doc[key].map(z=>({...z,paths:z.paths.map(P=>P.map(mv))}));};
const CURVE_DEFAULTS = Object.freeze({
  turn:'left', turnDeg:204, innerRadiusMm:6000, lanes:2, legalLaneWidthMm:6500,
  straightTopMm:3000, straightBottomMm:3000, upperLevelMm:0, lowerLevelMm:-3800,
  topTransitionMm:1700, bottomTransitionMm:1700, curbWidthInnerMm:null, curbWidthOuterMm:null,
  separatedInOut:false, totalStalls:80, permitDate:'2026-10-26', parkingKind:'noeoe', facilityUse:''
});
const curveMode = () => doc.ramp.kind === 'curve';
const curveSettings = () => ({...CURVE_DEFAULTS,...doc.ramp.curve});
const escapeText = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// The embedded data is an exact copy of the canonical JSON. This keeps file:// usable.
let rampRules = null, rampRulesError = null;
try { rampRules = JSON.parse($('parkingRules').textContent); }
catch(e) { rampRulesError = '램프 판정 기준을 읽지 못했습니다: '+e.message; }
let curveCache = null;
function getCurveRamp() {
  const c=curveSettings(), angle=(doc.ucs+90*doc.ramp.k)*Math.PI/180;
  const spec={
    id:'R', systemId:'S', operation:c.lanes===2?'twoWay':'oneWay', separatedInOut:c.separatedInOut,
    landing:doc.ramp.p.map(Math.round), tangent:[Math.cos(angle),Math.sin(angle)],
    turn:c.turn, turnDeg:c.turnDeg, innerRadiusMm:c.innerRadiusMm, lanes:c.lanes,
    legalLaneWidthMm:c.legalLaneWidthMm, straightTopMm:c.straightTopMm, straightBottomMm:c.straightBottomMm,
    wallToCurbMm:{inner:300,outer:300}, curbHeightMm:{inner:150,outer:150},
    transitions:{topMm:c.topTransitionMm,bottomMm:c.bottomTransitionMm},
    levels:{connects:{upperLevelMm:c.upperLevelMm,lowerLevelMm:c.lowerLevelMm}}
  };
  if(c.curbWidthInnerMm!==null||c.curbWidthOuterMm!==null)
    spec.curbWidthMm={inner:c.curbWidthInnerMm,outer:c.curbWidthOuterMm};
  const key=JSON.stringify(spec);
  if(curveCache?.key===key)return curveCache.out;
  const out=UGP.curveRamp.createCurve(spec);
  if(out.evaluatorRamp)out.lengthMm=out.evaluatorRamp.shape.lengthMm;
  curveCache={key,out};return out;
}
const rampSpec = (r) => curveMode() ? getCurveRamp() : Number.isFinite(r.alignedAngleDeg)
  ? UGPlan.createStraightRamp({landing:r.p.map(Math.round),angleDeg:r.alignedAngleDeg,widthMm:r.w,lengthMm:r.len})
  : ({x: Math.round(r.p[0]), y: Math.round(r.p[1]), angleDeg: doc.ucs + 90 * r.k, widthMm: r.w, lengthMm: r.len});
function evaluateCurveRamp(curve,plan,mass=doc.mass) {
  if(!rampRules||!window.UGEvaluator)throw new Error(rampRulesError||'램프 판정기를 불러오지 못했습니다');
  const c=curveSettings();
  const floorBoundary=plan?.planningBoundary||UGPlan.planningBoundary({mass,massHoles:doc.massHoles,allowExternalRamp:doc.allowExternalRamp,allowedBoundary:doc.allowedBoundary},curve);
  const fixed=plan?UGPlan.curveEvaluationFixed(plan):{
    cores:doc.cores.map((x,i)=>({id:'core-'+i,polygon:corePoly(x)})),
    reservedZones:(doc.occupants||[]).map((x,i)=>({id:'occupant-'+i,polygon:corePoly(x),role:'other'})),
    columns:[]
  };
  const project={...(c.permitDate?{permitDate:c.permitDate}:{}),parkingKind:c.parkingKind,...(c.facilityUse?{facilityUse:c.facilityUse}:{})};
  // An empty total means unknown; never substitute the generated parking count.
  if(c.totalStalls!==null){project.parkingLots=[{id:'A',totalStalls:c.totalStalls}];project.rampSystems=[{id:'S',lotIds:['A']}];}
  const evaluation=UGEvaluator.evaluate({ruleSet:rampRules,input:{
    project,floor:{id:'B1',levelMm:c.lowerLevelMm,heightMm:c.upperLevelMm-c.lowerLevelMm,outline:{kind:'outer',polygons:floorBoundary.floorPaths},wallMm:WALL},
    ramps:[curve.evaluatorRamp],fixed
  },candidate:{schema:'ug-candidate/0.1',geometry:{stalls:[],lanes:[],ramps:[curve.candidateRamp]}}});
  evaluation.curveSource=UGPlan.curveEvaluationSource(curve,fixed);
  return evaluation;
}
// 구조열(격자 위상): 매스·UCS·모듈이 바뀌어 확정될 때만 엔진이 다시 고르고(실제 대수 비교) 문서에 적는다.
//   코어·램프를 고치는 동안과 끄는 중 미리 보기는 적어 둔 위상을 그대로 쓴다(설계안 결정 ②). 실행 취소하면 위상도 같이 돌아간다
const phaseKey = () => JSON.stringify([doc.mass,doc.ucs,doc.module,...(doc.columnAxes?[doc.columnAxes]:[]),...(doc.referenceColumnMm!==undefined?[doc.referenceColumnMm]:[])]);
const phaseMatches = () => {if(doc.phase?.key===phaseKey())return true;try{const old=JSON.parse(doc.phase?.key);return Array.isArray(old)&&old.length===5&&JSON.stringify(old.slice(0,3))===phaseKey();}catch(e){return false;}};
const docPhase = () => (doc.phase && (ui.drag || phaseMatches()) ? doc.phase.p : undefined);
function planningMass(ramp) {
  const body=ramp?.body?ramp:ramp?UGPlan.createStraightRamp(ramp):null;
  const b=UGPlan.planningBoundary({mass:doc.mass,massHoles:doc.massHoles,allowedBoundary:doc.allowedBoundary,allowExternalRamp:doc.allowExternalRamp??true},body);
  return {...b,mass:b.floorMass};
}
// 코어 생성기 2판의 안 목록(층고 기준, 한 번만 만든다). 엔진이 이 중에서 상자에 들어가고 구조 격자에 맞는 안·방향·자리를 고른다
// 구성 입력(승강기 대수)마다 따로 만든다 — 상자가 코어 크기(98차), 구성은 생성기 입력. 'auto'면 1–4대 안을 모두 넘겨 엔진이 상자를 가장 잘 채우는 대수를 고른다
const coreLayoutCache = new Map();
const projectFloor = () => curveMode()?curveSettings().upperLevelMm-curveSettings().lowerLevelMm:(doc.floorMm||FLOOR);
const coreLayouts = (ev = 1,height=projectFloor()) => {
  const key=ev+':'+height;
  if (coreLayoutCache.has(key)) return coreLayoutCache.get(key);
  if (ev === 'auto') { const all = [1, 2, 3, 4].flatMap((n) => coreLayouts(n,height) || []); coreLayoutCache.set(key, all.length ? all : null); return coreLayoutCache.get(key); }
  let v = null;
  try { const g = window.CoreGen2?.generate({floorHeight: height, evCount: ev}); v = g?.ok ? g.alts.filter((a) => a.status === 'OK' && a.candidate !== false).map((a) => ({id: a.id, ev, name: a.name, outer: a.outer, t: a.t, rooms: Object.fromEntries(Object.entries(a.rooms).map(([k, v]) => [k, v.rects])), doors: a.doors, stairDraw: a.stairDraw, law: a.review?.law, lawNote: a.review?.lawItems?.find((x) => x.status === 'FAIL')?.note})) : null; } catch (e) { v = null; }
  coreLayoutCache.set(key, v);
  return v;
};
function changeCoreEv(i,ev){
  const original=doc.cores[i],next=UGPlan.configureCore(original,ev,coreLayouts(ev)||[]),grew=next.w!==original.w||next.d!==original.d;
  delete next.layouts;delete next.configurationFits;doc.cores[i]=next;ui.sel={kind:'core',i};
  commit(`코어 ${i+1} 승강기 ${ev==='auto'?'자동':ev+'대'}${grew?' · 상자 크기 맞춤':''}`);
}
const planInput = () => {
  const ramp=rampSpec(doc.ramp),boundary=planningMass(ramp);
  return {mass:doc.mass,massHoles:doc.massHoles,allowExternalRamp:doc.allowExternalRamp??true,allowedBoundary:doc.allowedBoundary,nonParkingZones:doc.nonParkingZones,zoneAssignments:doc.zoneAssignments,autoZones:doc.autoZones,parkingOptions:doc.parkingOptions,planningBoundary:boundary,ucs:doc.ucs,cores:doc.cores.map(c=>{const l=coreLayouts(c.ev??'auto');const selected=referenceScene&&c.referenceEnvelopeOnly?null:l;const fixed=doc.columnAxes?{...c,keep:{x:true,y:true}}:c;return selected?{...fixed,layouts:selected}:fixed;}),...(Number.isFinite(doc.accessibleRate)?{accessibleRate:doc.accessibleRate}:{}),occupants:doc.occupants||[],occupantPolicy:doc.occupantPolicy||'report',ramp,grid:{...(MODULES[doc.module]||MODULES.normal).grid,wallMm:WALL,...(doc.referenceColumnMm!==undefined?{columnMm:doc.referenceColumnMm}:{}),...(doc.columnAxes?{columnAxes:doc.columnAxes}:{})},floorMm:referenceScene&&doc.ramp.referenceVisibleOnly?undefined:projectFloor(),phase:docPhase()};
};
function solveCurveInput(input) {
  let draft,placedCurve=input.ramp;
  for(let attempt=0;attempt<3;attempt++){
    const boundary=planningMass(placedCurve);
    input={...input,planningBoundary:boundary,ramp:placedCurve};
    const first=evaluateCurveRamp(placedCurve,null,input.mass);
    draft=UGPlan.generate({...input,rampEvaluation:first});
    const next=draft.ramp?.sourceRamp||placedCurve;
    if(JSON.stringify(next.body)===JSON.stringify(placedCurve.body))break;
    if(attempt===2)throw new Error('램프의 자동 위치 조정이 계속되어 외곽을 확정할 수 없습니다. 램프를 직접 옮겨 주세요.');
    placedCurve=next;
  }
  const evaluation=evaluateCurveRamp(placedCurve,draft,input.mass);
  const result=UGPlan.generate({...input,phase:draft.grid.phase,rampEvaluation:evaluation});
  result.grid.phaseFrom=draft.grid.phaseFrom;
  return {...result,planMass:result.planningBoundary.floorMass,curveRamp:placedCurve,rampEvaluation:evaluation,
    violations:result.violations.concat(placedCurve.violations)};
}
function suggestCurvePositions(input) {
  const positions=UGPlan.suggestRamps(input,Infinity), reviewed=[];
  for(const position of positions){
    try{
      const curve=UGPlan.createCurveRamp({...input.ramp.spec,
        landing:[position.x,position.y],tangent:rot([1,0],position.angleDeg),turn:position.turn});
      if(!curve.body)continue;
      const result=solveCurveInput({...input,ramp:curve,phase:undefined});
      const issues=result.violations.map(v=>v.note||v.id);
      reviewed.push({...position,x:result.ramp.landing[0],y:result.ramp.landing[1],
        body:result.ramp.body,stallCount:result.stallCount,status:result.status,
        hasLoop:result.graph.hasLoop,issues:[...new Set(issues)],
        angleDeg:Math.atan2(result.ramp.tangent[1],result.ramp.tangent[0])*180/Math.PI});
    }catch(e){/* This position cannot produce a plan. */}
  }
  const order={FEASIBLE:0,CONDITIONAL:1,INFEASIBLE:2};
  return reviewed.sort((a,b)=>(order[a.status]??3)-(order[b.status]??3)||b.stallCount-a.stallCount).slice(0,5);
}
function solve() {
  if (reviewLoadError) return {fail:reviewLoadError};
  const mass = doc.mass;
  if (selfCrossing(mass)) return {fail: '매스 외곽선이 서로 엇갈립니다'};
  // ponytail: 크기 상한 — 엔진이 동기 계산이라 거대한 매스는 화면을 멈춘다. 계산을 Worker로 옮기면 올릴 수 있다
  if (area(mass) > 60000e6) return {fail: `매스가 ${fmt(area(mass) / 1e6)}㎡로 너무 큽니다(한 층 6만㎡까지)`};
  const input=planInput();
  if(curveMode()&&doc.layoutAlternative==='turnBay')return {fail:'직선 램프 회차 공간 실험안을 해제한 뒤 곡선 램프를 선택하세요.'};
  if(curveMode()&&!input.ramp.body)return {fail:'곡선 램프 입력을 확인해 주세요',curveRamp:input.ramp,violations:input.ramp.violations};
  try {
    if(!curveMode()){
      const r=doc.layoutAlternative==='turnBay' ? UGPlan.suggestTurnBay(input)?.plan : UGPlan.generate(input);
      if(!r)return {fail:'현재 조건에서는 회차 공간 대안을 만들 수 없습니다. 대안을 해제하거나 조건을 조정하세요.'};
      return {...r,planMass:r.planningBoundary.floorMass};
    }
    return solveCurveInput(input);
  } catch (e) { return {fail:e.message,curveRamp:curveMode()?input.ramp:null}; }
}
// 확정 계산: 결과를 보이고, 엔진이 붙인 코어·램프 자리를 문서에 옮겨 적는다(같은 실행 취소 단계로)
let calculationTicket=0;
// 파일 직접 열기를 유지한다. 무거운 계산 전 두 번의 화면 갱신으로 안내부터 표시한다.
function withCalculationNotice(work) {
  const notice=$('calculationNotice');
  if(!notice)return work();
  const ticket=++calculationTicket;
  notice.hidden=false;ui.busy=true;
  const app=document.querySelector('.app');if(app)app.inert=true;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    if(ticket!==calculationTicket)return;
    try{work();}catch(e){flash(`계산을 완료하지 못했습니다: ${e.message}`);}
    finally{if(ticket===calculationTicket){notice.hidden=true;ui.busy=false;if(app)app.inert=false;}}
  }));
}
function recompute(label) {
  if($('phaseList'))$('phaseList').innerHTML='';
  if(area(doc.mass)>8000e6&&$('calculationNotice'))return withCalculationNotice(()=>recomputeNow(label));
  recomputeNow(label);
}
function recomputeNow(label) {
  ui.live=null;
  const r = solve(); ui.prev = ui.res; ui.res = r; ui.lastChange = label;
  if (!r.fail) {
    const moved = [];
    r.cores.forEach((c, i) => { if (doc.cores[i] && c.shiftMm > 0) { doc.cores[i].c = c.center; moved.push(`코어 ${i + 1} ${(c.shiftMm / 1000).toFixed(1)}m`); } });
    if (r.ramp && r.ramp.shiftMm > 0 && !referenceScene) { doc.ramp.p = r.ramp.landing; moved.push(`램프 ${(r.ramp.shiftMm / 1000).toFixed(1)}m`); }
    const fresh = r.grid.phaseFrom === 'auto'; if (fresh) doc.phase = {key: phaseKey(), p: r.grid.phase};
    if (moved.length || fresh) { hist.stack[hist.i] = JSON.stringify(doc); save(); }
    if (moved.length) flash(`구조열·차로 축에 맞춰 붙였습니다: ${moved.join(', ')}`);
  }
  renderAll();
}
// 끄는 중 미리 보기: 문서는 건드리지 않고 결과 층만 다시 그린다(프레임당 한 번)
let liveQueued = false;
function liveRecompute() { if (liveQueued) return; if(area(doc.mass)>8000e6){$('ptSub').textContent='이동을 마치면 배치를 계산합니다';return;} liveQueued = true; requestAnimationFrame(() => { liveQueued = false; if (!ui.drag) return; ui.live = solve(); const L = $('Lres'); if (L) { L.innerHTML = ''; drawResult(L, ui.live); } renderStats(ui.live, true); }); }

// ── 그리기 ──
const NS = 'http://www.w3.org/2000/svg', NSS = 'non-scaling-stroke';
const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
const pts = (P) => P.map((q) => q[0] + ',' + q[1]).join(' ');
const toD = (p) => { const u = rot(p, -doc.ucs); return [u[0], -u[1]]; };
const toU = (p) => rot(p, -doc.ucs), fromU = (u) => rot(u, doc.ucs);
const svg = $('plan');
const scale = () => { const vb = svg.viewBox.baseVal; return vb && vb.width ? Math.min(svg.clientWidth / vb.width, svg.clientHeight / vb.height) : 0.01; };
function fitBox(P, cw, ch, padPx) { const D = P.map(toD), b = bbox(D), w = b[2] - b[0], h = b[3] - b[1], k = Math.min((cw - 2 * padPx) / w, (ch - 2 * padPx) / h), vw = cw / k, vh = ch / k; return [(b[0] + b[2]) / 2 - vw / 2, (b[1] + b[3]) / 2 - vh / 2, vw, vh]; }
function fit() { ui.view = fitBox(SITE.concat(doc.mass), Math.max(svg.clientWidth, 200), Math.max(svg.clientHeight, 200), 50); setView(); renderEdit(); }
function setView() { svg.setAttribute('viewBox', ui.view.join(' ')); drawLabels(); $('scalebar').firstElementChild.style.width = (10000 * scale()) + 'px'; }

function defs(s) {
  const d = el('defs', {}, s), m = el('marker', {id: 'arr' + (s === svg ? '' : 'm'), viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto'}, d);
  el('path', {d: 'M0,0 L10,5 L0,10 z', fill: 'var(--ramp)'}, m);
  const hp = el('pattern', {id: 'dryHatch', width: 1200, height: 1200, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)'}, d);
  el('line', {x1: 0, y1: 0, x2: 0, y2: 1200, stroke: '#4a5560', 'stroke-width': 220}, hp);
}
function drawResult(g, r) {
  if (!r || r.fail) return;
  // A room proposal is an uncommitted rectangle in unused space. Columns stay
  // visible, and no equipment use or access approval is inferred from it.
  for(const c of r.roomCandidates||[]){
    const p=el('polygon',{points:pts(c.polygon),fill:'rgba(201,163,84,.14)',stroke:c.nearRightCorner?'#d7aa5a':'#9f987a','stroke-width':1.5,'stroke-dasharray':'7 4','vector-effect':NSS},g);
    el('title',{},p).textContent=`빈 공간 검토 후보 ${c.id.split('-')[1]} · ${c.areaM2}㎡ · 용도·출입·구조 확인 필요`;
  }
  // 차로(외곽 순환 띠는 구멍이 있는 모양이라 경로 하나로 그린다)
  el('path', {d: r.aisles.map((P) => 'M' + P.map((q) => q.join(',')).join('L') + 'Z').join(''), fill: 'var(--aisle)', 'fill-rule': 'nonzero', stroke: 'var(--aisleL)', 'stroke-width': .5, 'vector-effect': NSS}, g);
  // 동선 중심선: 고리 위는 흐린 점선, 막다른 가지는 빨간 점선
  for (const e of r.graph.edges) { const a = r.graph.nodes[e.a].p, b = r.graph.nodes[e.b].p; el('line', {x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: e.kind === 'ramp' ? 'var(--ramp)' : !e.reached ? 'var(--mute)' : e.onCycle ? 'rgba(108,180,255,.45)' : 'var(--dead)', 'stroke-width': e.onCycle ? 1 : 1.6, 'stroke-dasharray': '5 4', 'vector-effect': NSS}, g); }
  for (const p of r.graph.deadEnds) el('circle', {cx: p[0], cy: p[1], r: 2200, fill: 'var(--deadf)', stroke: 'var(--dead)', 'vector-effect': NSS}, g);
  for (const st of r.stalls) el('polygon', {points: pts(st.pts), fill: 'var(--stallf)', stroke: 'var(--stall)', 'stroke-width': .7, 'vector-effect': NSS}, g);
  for (const P of r.deadSide) el('polygon', {points: pts(P), fill: 'rgba(229,97,107,.18)', stroke: 'none'}, g);
  for (const P of r.lost) el('polygon', {points: pts(P), fill: 'none', stroke: 'var(--mute)', 'stroke-width': .6, 'stroke-dasharray': '3 3', 'vector-effect': NSS}, g);
  for (const c of r.columns) el('polygon', {points: pts(c), fill: 'var(--col)'}, g);
  if (r.innerOutline) el('polygon', {points: pts(r.innerOutline), fill: 'none', stroke: 'var(--wall)', 'stroke-width': .6, 'vector-effect': NSS}, g);
}
function rampBody(spec) { if(spec.body)return {start:spec.start||doc.ramp.p,body:spec.body}; if(spec.kind==='curve')return {start:spec.start||doc.ramp.p,body:[]}; const a = spec.angleDeg * Math.PI / 180, u = [Math.cos(a), Math.sin(a)], n = [-u[1], u[0]], P = [spec.x, spec.y], h = spec.widthMm / 2, B = add(P, mul(u, -spec.lengthMm)); return {start: B, body: [add(B, mul(n, -h)), add(P, mul(n, -h)), add(P, mul(n, h)), add(B, mul(n, h))]}; }
function drawRamp(g, spec, pick) {
  // Startup renders once before the drawing adapter is loaded. Curve geometry
  // must already be drawn from its body, never from straight x/y/length fields.
  if(spec.kind==='curve'){
    const p=spec.body?el('polygon',{points:pts(spec.body),fill:'#f2f1ee',stroke:'#555','vector-effect':NSS},g)
      :el('circle',{cx:doc.ramp.p[0],cy:doc.ramp.p[1],r:600,fill:'none',stroke:'#a65a39','vector-effect':NSS},g);
    if(pick){p.dataset.ramp='1';p.style.cursor='move';}
    return;
  }
  const rs = rampBody(spec), p = el('polygon', {points: pts(rs.body), fill: 'var(--rampf)', stroke: 'var(--ramp)', 'stroke-width': pick && ui.sel && ui.sel.kind === 'ramp' ? 2.6 : 1.2, 'vector-effect': NSS}, g);
  if (pick) { p.dataset.ramp = 1; p.style.cursor = 'move'; }
  const end=spec.landing||[spec.x,spec.y], ln = el('line', {x1: rs.start[0], y1: rs.start[1], x2: end[0], y2: end[1], stroke: 'var(--ramp)', 'stroke-width': 1.5, 'vector-effect': NSS, 'marker-end': 'url(#arr)'}, g); ln.style.pointerEvents = 'none';
}
// 큰 도면: 층을 나눠 끄는 동안에는 편집 층과 치수만 다시 그린다
function renderPlan() {
  svg.innerHTML = ''; defs(svg);
  const g = el('g', {id: 'content', transform: `scale(1,-1) rotate(${-doc.ucs})`}, svg);
  const site = el('polygon', {points: pts(SITE), fill: 'none', stroke: 'var(--wall)', 'stroke-width': 1, 'stroke-dasharray': '6 4', 'vector-effect': NSS}, g);
  site.style.pointerEvents = 'none';
  el('polygon', {id: 'massFill', points: pts(doc.mass), fill: 'var(--paper)', stroke: 'none'}, g).style.pointerEvents = 'none';
  const rl = el('g', {id: 'Lres'}, g); rl.style.pointerEvents = 'none'; drawResult(rl, ui.res);
  el('g', {id: 'Ledit'}, g);
  el('g', {id: 'Llab'}, svg); el('g', {id: 'Lguide'}, svg);
  ui.g = g; renderEdit();
}
// 매스 편집 도구막대: 선택한 꼭짓점·변 옆에 뜬다
function renderMassBar() {
  let bar = $('massBar'); if (!bar) { bar = document.createElement('div'); bar.id = 'massBar'; bar.className = 'massBar'; document.querySelector('main').appendChild(bar); }
  const sel = ui.sel, M = doc.mass; if (!sel || ui.drag || ui.tool !== 'select' || !['vtx', 'edge'].includes(sel.kind) || !$('content')) { bar.style.display = 'none'; return; }
  const at = sel.kind === 'vtx' ? M[sel.i] : mul(add(M[sel.i], M[(sel.i + 1) % M.length]), .5), sp = svg.createSVGPoint(); sp.x = at[0]; sp.y = at[1];
  const q = sp.matrixTransform($('content').getScreenCTM()), r = document.querySelector('main').getBoundingClientRect();
  bar.style.display = 'flex'; bar.style.left = (q.x - r.left + 14) + 'px'; bar.style.top = (q.y - r.top + 14) + 'px';
  bar.innerHTML = sel.kind === 'vtx' ? `<button data-mb="del">꼭짓점 삭제 <kbd>Del</kbd></button>`
    : `<button data-mb="split">가운데 꼭짓점 추가</button><span>끌기:</span><button data-mb="slide" class="${ui.edgeMode !== 'extrude' ? 'on' : ''}">이웃 변 따라</button><button data-mb="extrude" class="${ui.edgeMode === 'extrude' ? 'on' : ''}">이 변만 돌출 <kbd>E</kbd></button>`;
  bar.querySelectorAll('button').forEach((b) => (b.onclick = () => {
    const k = b.dataset.mb;
    if (k === 'del') { if (doc.mass.length <= 3) return flash('꼭짓점이 3개 이상 있어야 합니다');removeAlignedVertex(sel.i); doc.mass.splice(sel.i, 1);followAlignedEdge(); ui.sel = {kind: 'mass'}; commit('꼭짓점 삭제'); renderAll(); }
    else if (k === 'split') { const i = sel.i, a = M[i], c = M[(i + 1) % M.length]; doc.mass.splice(i + 1, 0, mul(add(a, c), .5).map(Math.round));splitAlignedEdge(i,.5); ui.sel = {kind: 'vtx', i: i + 1}; commit('꼭짓점 추가'); renderAll(); }
    else { ui.edgeMode = k; renderMassBar(); flash(k === 'extrude' ? '변을 끌면 이웃 변은 그대로 두고 이 변만 밀려 나갑니다(양 끝에 새 변이 생김)' : '변을 끌면 양 끝이 이웃 변을 따라 미끄러집니다'); }
  }));
}
function renderEdit() {
  const L = $('Ledit'); if (!L) return; L.innerHTML = ''; $('massFill').setAttribute('points', pts(doc.mass));
  const k = scale(), hs = 6 / k, sel = ui.sel, massSel = sel && ['mass', 'vtx', 'edge'].includes(sel.kind), M = doc.mass, n = M.length;
  // 매스: 안쪽(이동), 외곽선, 변(밀기), 꼭짓점·중점 손잡이
  const fill = el('polygon', {points: pts(M), fill: massSel ? 'rgba(108,180,255,.05)' : 'transparent', stroke: 'none'}, L);
  if (ui.tool === 'select') { fill.dataset.mass = 1; fill.style.cursor = massSel ? 'move' : 'pointer'; }
  el('polygon', {points: pts(M), fill: 'none', stroke: massSel ? 'var(--accent)' : 'var(--ink)', 'stroke-width': 2.2, 'vector-effect': NSS}, L).style.pointerEvents = 'none';
  // 코어·램프
  doc.cores.forEach((c0, i) => {
    const c = coreRect(i), on = sel && sel.kind === 'core' && sel.i === i, p = el('polygon', {points: pts(corePoly(c)), fill: 'var(--coref)', 'fill-opacity': .6, stroke: 'var(--core)', 'stroke-width': on ? 2.6 : 1.2, 'vector-effect': NSS}, L);
    if (ui.tool === 'select') { p.dataset.core = i; p.style.cursor = 'move'; }
    // 선택한 코어: 네 변 가운데 손잡이를 끌어 폭·깊이 조절(반대 변은 그대로)
    if (on && ui.tool === 'select') for (const [side, ux, uy] of [['l', -1, 0], ['r', 1, 0], ['b', 0, -1], ['t', 0, 1]]) {
      // 변에서 10px 바깥, 보이는 손잡이 10px · 잡히는 영역 26px(글자·문 손잡이와 겹치지 않게)
      const m = add(c.c, rot([ux * (c.w / 2 + 10 / k), uy * (c.d / 2 + 10 / k)], doc.ucs)), hit = el('rect', {x: m[0] - 13 / k, y: m[1] - 13 / k, width: 26 / k, height: 26 / k, fill: 'transparent', transform: `rotate(${doc.ucs} ${m[0]} ${m[1]})`}, L), hb = el('rect', {x: m[0] - 5 / k, y: m[1] - 5 / k, width: 10 / k, height: 10 / k, rx: 2 / k, transform: `rotate(${doc.ucs} ${m[0]} ${m[1]})`, fill: 'var(--core)', stroke: 'var(--floor)', 'stroke-width': 1, 'vector-effect': NSS}, L);
      for (const h of [hit, hb]) { h.dataset.cedge = side; h.dataset.ci = i; h.style.cursor = ux ? 'ew-resize' : 'ns-resize'; }
    }
  });
  drawRamp(L, rampSpec(doc.ramp), ui.tool === 'select');
  // 램프 자리 제안(점선): 눌러서 적용
  (ui.ghosts || []).forEach((gh, i) => { const g2 = el('polygon', {points: pts(gh.body), fill: 'rgba(180,140,255,.12)', stroke: 'var(--ramp)', 'stroke-width': 1.6, 'stroke-dasharray': '6 4', 'vector-effect': NSS}, L); g2.dataset.ghost = i; g2.style.cursor = 'pointer'; });
  // 변 고르기(선택·UCS)
  const edgeHit = (P, i, key) => { const a = P[i], b = P[(i + 1) % P.length], e = el('line', {x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: 'transparent', 'stroke-width': 10, 'vector-effect': NSS}, L); e.dataset[key] = i; return e; };
  if (ui.tool === 'ucs') { M.forEach((_, i) => { const e = edgeHit(M, i, 'ucsm'); e.setAttribute('stroke', 'rgba(108,180,255,.35)'); e.style.cursor = 'pointer'; }); SITE.forEach((_, i) => { const e = edgeHit(SITE, i, 'ucss'); e.setAttribute('stroke', 'rgba(141,152,165,.25)'); e.style.cursor = 'pointer'; }); }
  if (ui.tool === 'select') M.forEach((_, i) => { const e = edgeHit(M, i, 'edge'), on = sel && sel.kind === 'edge' && sel.i === i; e.style.cursor = ui.alignRamp?'crosshair':'grab'; if (on || ui.alignRamp) e.setAttribute('stroke', 'rgba(108,180,255,.45)'); });
  if (ui.tool === 'select' && massSel) M.forEach((a, i) => {
    const on = sel.kind === 'vtx' && sel.i === i, v = el('rect', {x: a[0] - hs * .7, y: a[1] - hs * .7, width: hs * 1.4, height: hs * 1.4, fill: on ? '#fff' : 'var(--accent)', stroke: 'var(--floor)', 'stroke-width': 1, 'vector-effect': NSS}, L);
    v.dataset.vtx = i; v.style.cursor = 'move';
  });
  // 그리는 중인 매스
  if (ui.draw && ui.draw.pts.length) {
    const P = ui.draw.pts.concat(ui.draw.cur ? [ui.draw.cur] : []);
    el('polyline', {points: pts(P), fill: 'none', stroke: 'var(--accent)', 'stroke-width': 1.6, 'stroke-dasharray': '6 3', 'vector-effect': NSS}, L);
    ui.draw.pts.forEach((p, i) => el('circle', {cx: p[0], cy: p[1], r: (i === 0 ? 5 : 3) / k, fill: i === 0 ? 'none' : 'var(--accent)', stroke: 'var(--accent)', 'vector-effect': NSS}, L));
  }
  if (ui.rect) el('polygon', {points: pts(ui.rect), fill: 'rgba(108,180,255,.08)', stroke: 'var(--accent)', 'stroke-width': 1.6, 'stroke-dasharray': '6 3', 'vector-effect': NSS}, L);
  drawLabels(); renderMassBar();
}
// 치수: 화면 좌표 층에 같은 글자 크기로
function drawLabels() {
  const L = $('Llab'); if (!L) return; L.innerHTML = ''; const k = scale(), fs = 11 / k;
  const txt = (p, s, color, dy = 0) => { const d = toD(p), t = el('text', {x: d[0], y: d[1] + dy / k, 'font-size': fs, fill: color, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'paint-order': 'stroke', stroke: 'var(--floor)', 'stroke-width': 3 / k}, L); t.textContent = s; };
  const M = doc.mass;
  M.forEach((a, i) => { const b = M[(i + 1) % M.length], len = Math.hypot(...sub(b, a)); if (len * k < 40) return; const out = signedArea(M) > 0 ? 1 : -1, u = mul(sub(b, a), 1 / len), nrm = [u[1] * out, -u[0] * out]; txt(add(mul(add(a, b), .5), mul(nrm, 12 / k)), (len / 1000).toFixed(1), 'var(--mute)'); });
  (!ui.drag?ui.res?.roomCandidates||[]:[]).forEach((c,i)=>{const q=c.polygon,wide=Math.hypot(...sub(q[1],q[0]))*k,high=Math.hypot(...sub(q[3],q[0]))*k;if(wide<48||high<22)return;txt(mul(add(q[0],q[2]),.5),`빈 공간 검토 ${i+1} · ${c.areaM2}㎡`,'#d7aa5a');});
  if (ui.draw && ui.draw.cur && ui.draw.pts.length) { const a = ui.draw.pts.at(-1), b = ui.draw.cur; txt(mul(add(a, b), .5), (Math.hypot(...sub(b, a)) / 1000).toFixed(2) + ' m' + (ui.typed ? ` · 입력 ${ui.typed}` : ''), 'var(--accent)', -12); }
  (ui.ghosts || []).forEach((gh, i) => { const c = gh.body.reduce((m, q) => add(m, mul(q, 1 / gh.body.length)), [0, 0]), cur = ui.res && !ui.res.fail ? ui.res.stallCount : null; txt(c, `제안 ${i + 1} · ${gh.stallCount}대${gh.status ? ` · ${gh.status==='FEASIBLE'?'기초조건 통과':gh.status==='CONDITIONAL'?'조건부':'배치 불가'}` : ''}${cur !== null ? ` (${gh.stallCount - cur >= 0 ? '+' : ''}${gh.stallCount - cur})` : ''}`, 'var(--ramp)', 0); });
  if (ui.drag && ui.drag.label) txt(ui.mouse, ui.drag.label + (ui.typed ? ` · 입력 ${ui.typed} mm, Enter` : ''), 'var(--accent)', -18);
  const G = $('Lguide'); if (G) { G.innerHTML = ''; if (ui.guide) for (const [a, b] of ui.guide) { const A = toD(a), B = toD(b); el('line', {x1: A[0], y1: A[1], x2: B[0], y2: B[1], stroke: 'var(--accent)', 'stroke-width': 1, 'stroke-dasharray': '4 4', 'vector-effect': NSS}, G).style.pointerEvents = 'none'; } }
}

// ── 패널 ──
const fmt = (a) => Math.round(a).toLocaleString();
function deltaHtml(key, better) {
  const p = ui.prev, s = ui.res; if (!p || !s || !ui.lastChange || s.fail || p.fail) return '';
  const d = s[key] - p[key]; if (!d) return '<span class="delta">변화 없음</span>';
  return `<span class="delta ${(better === 'up' ? d > 0 : d < 0) ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d}</span>`;
}
// 결과 요약(끄는 중에는 미리 보기 값)
function renderStats(r, live) {
  if (!r || r.fail) { $('ptName').textContent = '성립 안 함'; $('ptSub').textContent = r ? r.fail : ''; $('stats').innerHTML = `<div class="big" style="color:var(--bad);font-size:15px">${r ? r.fail : ''}</div>`; return; }
  const loop = r.graph.hasLoop, dead = r.graph.deadEnds.length;
  $('ptName').textContent = `${r.stallCount}대`;
  $('ptSub').textContent = `${loop ? '한 바퀴 도는 순환' : '순환 없음'} · 막다른 끝 ${dead}곳 · ${r.perStallM2 ? r.perStallM2.toFixed(1) + '㎡/대' : '대당 면적 없음'}${live ? ' · 미리 보기' : ''}`;
  const ex = r.excluded, items = [];
  if (r.deadSideCount) items.push(`<li class="c">막다른 차로에 면한 칸 ${r.deadSideCount}대(빨간 칸) — 후진·회차 필요</li>`);
  if (ex.unreachable) items.push(`<li class="c">램프에서 갈 수 없는 차로에 면해 뺀 칸 ${ex.unreachable}대(점선 칸)</li>`);
  r.violations.filter((v) => v.id !== 'DEAD_END').forEach((v) => items.push(`<li class="c">${v.note}</li>`));
  if (loop && !dead) items.unshift('<li class="p">램프에서 내려와 한 바퀴 돌아 나올 수 있음 — 막다른 차로 없음</li>');
  $('stats').innerHTML = `<div class="big">${r.stallCount}<small>대</small>${live ? '' : deltaHtml('stallCount', 'up')}</div>` +
    `<div class="flow">실내 면 ${fmt(r.innerAreaM2)}㎡ · 대당 ${r.perStallM2 ? r.perStallM2.toFixed(1) + '㎡' : '—'} · 기둥 ${r.columns.length}개 · 차로 ${r.grid.aisleMm / 1000}m · 미사용 잔여공간 ${fmt(r.dryAreaM2 || 0)}㎡</div>` +
    `<ul class="pc">${items.join('')}</ul>` + (!live && ui.lastChange ? `<div class="kv" style="margin-top:6px">증감은 직전 계산 대비 · ${ui.lastChange}</div>` : '');
}
const TOOLS = [['select', '선택·편집', 'V'], ['draw', '다각형 매스', 'P'], ['rect', '사각형 매스', 'B'], ['ucs', 'UCS 맞추기', 'U']];
const HINT = {select: '매스를 누르면 꼭짓점(■)이 나타납니다 · 변을 끌면 늘이고 줄이기(E: 이 변만 돌출) · 변을 두 번 누르면 그 자리에 꼭짓점 추가 · 안쪽을 끌면 매스 통째로(코어·램프 함께) 이동 · 코어를 누르면 변 손잡이로 크기 조절(끄는 중 숫자+Enter = 새 길이 mm)',
  draw: '클릭으로 꼭짓점 찍기(직교 고정, Shift 해제) · 숫자+Enter 길이 지정 · 첫 점 클릭 또는 Enter로 닫기 · Backspace 마지막 점 지우기 · Esc 취소',
  rect: '끌어서 사각형 매스를 그립니다(UCS 축 기준)', ucs: '수평으로 둘 매스 변(파랑) 또는 대지 변(회색)을 누르세요 · Esc 취소'};
function setTool(t) { if(t==='ucs'&&doc.columnAxes)return flash('직접 입력 구조는 방향이 고정됩니다. 구조 입력을 해제한 뒤 방향을 바꾸세요.'); ui.tool = t; if(t!=='select')ui.alignRamp=false; ui.draw = t === 'draw' ? {pts: []} : null; ui.rect = null; ui.typed = ''; if (t !== 'select') ui.sel = null; renderTools(); renderEdit(); }
function renderTools() {
  const T = $('tools'); T.innerHTML = '';
  for (const [t, label, key] of TOOLS) { const b = document.createElement('button'); b.innerHTML = `${label}<kbd>${key}</kbd>`; if (ui.tool === t) b.className = 'on'; b.onclick = () => setTool(t); T.appendChild(b); }
  renderHint();
}
function renderHint() { const H = $('hintbar'); H.innerHTML = (Date.now() < ui.msgT ? `<span class="msg">${ui.msg}</span> ` : '') + `<span>${HINT[ui.tool]}</span>`; }
function flash(m) { ui.msg = m; ui.msgT = Date.now() + 4000; renderHint(); setTimeout(renderHint, 4100); }
function applyRampGhost(i) {
  const gh=ui.ghosts?.[i];if(!gh)return;
  doc.ramp.p=[gh.x,gh.y];
  delete doc.ramp.edgeBinding;
  if(curveMode())doc.ramp.curve={...curveSettings(),turn:gh.turn};
  if(Number.isFinite(doc.ramp.alignedAngleDeg)&&!curveMode())doc.ramp.alignedAngleDeg=gh.angleDeg;
  else doc.ramp.k=((Math.round((gh.angleDeg-doc.ucs)/90)%4)+4)%4;
  ui.ghosts=null;ui.sel={kind:'ramp'};commit(`램프 제안 ${i+1} 적용`);renderAll();
}
function renderRampCandidates() {
  const box=$('rampCandidateList');if(!box)return;
  const ghosts=ui.ghosts||[];
  box.hidden=!ghosts.length;
  box.innerHTML=ghosts.map((gh,i)=>`<button type="button" class="ramp-candidate" data-candidate="${i}"><b>제안 ${i+1} · ${gh.stallCount}대</b><span>${gh.status==='FEASIBLE'?'기초조건 통과':gh.status==='INFEASIBLE'?'배치 불가':gh.status==='CONDITIONAL'?'조건부':'자리 비교'}</span>${gh.issues?.length?`<small>${escapeText(gh.issues.slice(0,2).join(' · '))}</small>`:''}</button>`).join('');
  box.querySelectorAll('[data-candidate]').forEach(button=>button.onclick=()=>applyRampGhost(+button.dataset.candidate));
}
function renderPanel() {
  const reviewNotice=$('turnBayNotice');
  if(reviewNotice)reviewNotice.hidden=doc.layoutAlternative!=='turnBay';
  if($('turnBayRestore')){try{$('turnBayRestore').hidden=!localStorage.getItem(REVIEW_BACKUP);}catch(e){$('turnBayRestore').hidden=true;}}
  const M = doc.mass, A = area(M) / 1e6, ortho = M.every((a, i) => { const t = (edgeAngle(a, M[(i + 1) % M.length]) - doc.ucs + 360) % 90; return t < .5 || t > 89.5; });
  const boundary=planningMass(rampSpec(doc.ramp));
  $('massInfo').innerHTML = `입력 외곽 ${fmt(A)}㎡${boundary.joined?` · 램프 포함 ${fmt(area(boundary.mass)/1e6)}㎡`:''} · 꼭짓점 ${M.length}개 · ${ortho ? 'UCS와 직교' : '사선 변 있음'}` + (ui.sel && ui.sel.kind === 'edge' ? ` · 선택한 변 ${(Math.hypot(...sub(M[(ui.sel.i + 1) % M.length], M[ui.sel.i])) / 1000).toFixed(2)} m` : '');
  $('ucsInfo').textContent = `현재 ${doc.ucs.toFixed(1)}° — 도면의 수평이자 기둥 격자·주차 줄 방향`;
  $('ucsPick').className = 'mini-btn' + (ui.tool === 'ucs' ? ' on' : '');
  const cl = $('coreList'); cl.innerHTML = '';
  doc.cores.forEach((k, i) => {
    const row = document.createElement('div'); row.className = 'coreRow' + (ui.sel && ui.sel.kind === 'core' && ui.sel.i === i ? ' on' : '');
    row.innerHTML = `<b>코어 ${i + 1}</b>폭 <input type="number" step="0.1" min="2" value="${k.w / 1000}"> × 깊이 <input type="number" step="0.1" min="2" value="${k.d / 1000}"> m <select title="승강기 대수(코어 생성기 구성). 자동이면 상자를 가장 잘 채우는 대수">${['auto', 1, 2, 3, 4].map((n) => `<option value="${n}"${(k.ev ?? 'auto') === n ? ' selected' : ''}>${n === 'auto' ? 'EV 자동' : `EV ${n}대`}</option>`).join('')}</select> <button class="mini-btn">삭제</button>`
      + `<div class="coreSub">입구 <select title="입구가 향하는 쪽(격자 기준)">${[['', '자동'], ['N', '위'], ['S', '아래'], ['E', '오른쪽'], ['W', '왼쪽']].map(([v, t]) => `<option value="${v}"${(k.facing || '') === v ? ' selected' : ''}>${t}</option>`).join('')}</select> 문 위치 <input type="number" step="0.1" value="${((k.doors || {}).ENT || 0) / 1000}" title="홀 앞 벽을 따라 옮김(m, + 오른쪽). 홀 벽 끝에서 멈춤"> m</div>`;
    const [iw, id, idoor] = row.querySelectorAll('input'), [, sface] = row.querySelectorAll('select'), set = () => { const w = +iw.value * 1000, d = +id.value * 1000; if (!(w >= 2000 && d >= 2000)) return; k.w = w; k.d = d; ui.sel = {kind: 'core', i}; commit(`코어 ${i + 1} 크기 ${(w / 1000).toFixed(1)}×${(d / 1000).toFixed(1)}m`); };
    iw.onchange = set; id.onchange = set; [iw, id].forEach((x) => (x.onkeydown = (e) => { if (e.key === 'Enter') x.blur(); }));
    // 구성을 바꾸면 그 구성의 가장 작은 안이 들어가도록 상자를 필요한 만큼만 키운다(상자가 코어 크기, 98차)
    sface.onchange = () => { if (sface.value) k.facing = sface.value; else delete k.facing; ui.sel = {kind: 'core', i}; commit(`코어 ${i + 1} 입구 ${sface.selectedOptions[0].text}`); };
    idoor.onchange = () => { const v = Math.round(+idoor.value * 1000); if (!Number.isFinite(v)) return; k.doors = {...(k.doors || {}), ENT: v}; if (!v) delete k.doors.ENT; delete k.doorMm; ui.sel = {kind: 'core', i}; commit(`코어 ${i + 1} 문 위치 ${(v / 1000).toFixed(1)}m`); };
    idoor.onkeydown = (e) => { if (e.key === 'Enter') idoor.blur(); };
    row.querySelector('select').onchange = e=>changeCoreEv(i,e.target.value==='auto'?'auto':+e.target.value);
    row.querySelector('b').onclick = () => { ui.sel = {kind: 'core', i}; renderAll(); };
    row.querySelector('button').onclick = () => { doc.cores.splice(i, 1); ui.sel = null; commit(`코어 ${i + 1} 삭제`); };
    cl.appendChild(row);
  });
  renderCurveControls();
  $('rampLen').value = doc.ramp.len / 1000; $('rampW').value = doc.ramp.w;
  const ri = ui.res && !ui.res.fail && ui.res.ramp;
  const approach=ri?.approach?.summary;
  $('rampInfo').textContent = (curveMode() ? '착지점을 끌어 배치합니다. R 키·회전 버튼으로 방향을 바꿉니다.' : ui.alignRamp ? '맞출 외곽 변을 도면에서 클릭하세요.' : doc.ramp.edgeBinding ? `외곽 변에 연결됨 · 벽을 옮기거나 돌리면 램프도 따라갑니다.` : Number.isFinite(doc.ramp.alignedAngleDeg) ? `외곽 변 방향 ${doc.ramp.alignedAngleDeg.toFixed(1)}°` : ri ? `경사 ${ri.slopePct}% (직선 기준 17% 이하, 층고 ${FLOOR / 1000}m)` : '')+(approach?` · 차로 연결: ${approach}`:'');
  $('rampAlignEdge').classList.toggle('on',ui.alignRamp);$('rampAlignEdge').setAttribute('aria-pressed',String(ui.alignRamp));
  renderCurveReview(ui.live||ui.res);
  renderRampCandidates();
  $('snapRow').innerHTML = '';
  for (const v of [0, 100, 500, 1000, 5000]) { const b = document.createElement('button'); b.className = 'mini-btn' + (doc.snap === v ? ' on' : ''); b.textContent = v ? v / 1000 + ' m' : '끔'; b.onclick = () => { doc.snap = v; save(); renderPanel(); }; $('snapRow').appendChild(b); }
  $('moduleSel').innerHTML = Object.entries(MODULES).map(([k, m]) => `<option value="${k}"${doc.module === k ? ' selected' : ''}>${doc.columnAxes?m.name.replace('기둥','주차 모듈'):m.name}</option>`).join('');
  renderStats(ui.res, false);
  const r = ui.res;
  $('detail').innerHTML = r && !r.fail ? `<div>엔진: ${r.schema} · 격자 ${(+r.grid.angleDeg).toFixed(1)}° · 기둥 ${r.grid.gx}×${r.grid.gy} · 차로 ${r.grid.aisleMm}mm</div><ul>${r.warnings.map((w) => `<li>${w}</li>`).join('') || '<li>검사 항목 위반 없음</li>'}</ul><div>뺀 칸: 실내 면 밖 ${r.excluded.wall} · 차로·램프·코어·기둥과 겹침 ${r.excluded.blocked} · 다른 칸과 겹침 ${r.excluded.overlap} · 갈 수 없는 차로 ${r.excluded.unreachable} · 독립 검사에서 뺀 칸 ${r.excluded.check || 0}(겹침 허용오차 ${r.report ? r.report.tolerance.areaMm2 / 1e6 : 0.01}㎡)</div><div>확인하지 않는 것: 회전 궤적, 일방통행 방향, 법정 대수, 장애인·확장형 비율, 램프 완화 구간, 설비·피난. 벽 쪽 세로·사선 칸 줄에는 기둥을 두지 않았습니다(외벽이 받는다고 가정).</div>` : (r ? r.fail : '');
  $('north').style.transform = `rotate(${doc.ucs}deg)`;
  const bypass=$('bypassBtn');if(bypass){bypass.textContent=doc.occupantPolicy==='bypass'?'우회 해제':'우회 만들기';bypass.disabled=!doc.cores.length&&!(doc.occupants||[]).length;}
}
function renderAll() { renderPlan(); renderPanel(); renderTools(); }

// ── 조작 ──
const world = (ev) => { const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; const q = p.matrixTransform($('content').getScreenCTM().inverse()); return [q.x, q.y]; };
const step = (ev) => (ev && ev.altKey ? 0 : doc.snap);
const snapV = (v, s) => (s ? Math.round(v / s) * s : v);
// UCS 좌표에서: 다른 꼭짓점의 x·y에 화면 10px 안이면 붙이고(안내선), 아니면 스냅 간격으로 반올림
function snapPoint(w, ev, others) {
  const u = toU(w), tol = 10 / scale(), s = step(ev); let gx = null, gy = null, bx = tol, by = tol;
  if (!(ev && ev.altKey)) for (const o of others) { const q = toU(o); if (Math.abs(q[0] - u[0]) < bx) { bx = Math.abs(q[0] - u[0]); gx = q; } if (Math.abs(q[1] - u[1]) < by) { by = Math.abs(q[1] - u[1]); gy = q; } }
  const r = [gx ? gx[0] : snapV(u[0], s), gy ? gy[1] : snapV(u[1], s)], W = fromU(r);
  ui.guide = [gx && [fromU(gx), W], gy && [fromU(gy), W]].filter(Boolean);
  return W.map(Math.round);
}
function startDrag(ev, d) { ui.drag = {...d, start: world(ev), doc0: JSON.stringify(doc), moved: false}; ui.typed = ''; try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* 합성 이벤트 */ } }
function applyDrag(ev, typedDist) {
  const d = ui.drag, d0 = JSON.parse(d.doc0), w = ev ? world(ev) : null; let du = w ? toU(sub(w, d.start)) : null;
  if (d.kind === 'edge') {
    const M = d0.mass, i = d.i, a = M[i], b = M[(i + 1) % M.length], u = mul(sub(b, a), 1 / Math.hypot(...sub(b, a))), out = signedArea(M) > 0 ? [u[1], -u[0]] : [-u[1], u[0]];
    let off = typedDist != null ? Math.sign(d.off || 1) * typedDist : snapV(dot(sub(w, d.start), out), step(ev));
    const next=ui.edgeMode === 'extrude' ? extrudeEdge(M, i, off) : pushEdge(M, i, off);
    if (!usableMass(next)) { d.invalid='외곽을 만들 수 없는 위치입니다'; return; }
    d.invalid=null;d.off = off;doc=d0;doc.mass = next;remapAlignedEdge(M,next,i);followAlignedEdge(); d.label = `${off >= 0 ? '+' : '−'}${Math.abs(off / 1000).toFixed(2)} m ${off >= 0 ? '늘림' : '줄임'}${ui.edgeMode === 'extrude' ? '(돌출)' : ''}`;
  } else if (d.kind === 'coreEdge') {
    // 끈 변만 움직이고 반대 변은 고정. 0.1m 단위(Alt: 자유), 기둥 중심·면 8px 안이면 붙는다(98-5). 숫자 입력은 새 길이(mm)
    doc = d0; const k = doc.cores[d.i], horiz = d.side === 'l' || d.side === 'r', sg = d.side === 'r' || d.side === 't' ? 1 : -1, old = horiz ? k.w : k.d, cu = toU(k.c), ax = horiz ? 0 : 1;
    const lo = cu[ax] - old / 2, hi = cu[ax] + old / 2, free = ev && ev.altKey;
    let edge = typedDist != null ? (sg > 0 ? lo + typedDist : hi - typedDist) : (sg > 0 ? hi : lo) + snapV(horiz ? du[0] : du[1], free ? 0 : 100);
    const mg = typedDist == null && !free ? magnet(edge, colFeats(sg)[horiz ? 'x' : 'y'], 8 / scale()) : null; if (mg !== null) edge = mg;
    const nlo = sg > 0 ? lo : Math.min(edge, hi - 2000), nhi = sg > 0 ? Math.max(edge, lo + 2000) : hi, nv = Math.round(nhi - nlo), cn = cu.slice(); cn[ax] = (nlo + nhi) / 2;
    if (horiz) k.w = nv; else k.d = nv; k.c = fromU(cn).map(Math.round);
    const e2 = sg > 0 ? nhi : nlo, other = horiz ? [cu[1] - k.d, cu[1] + k.d] : [cu[0] - k.w, cu[0] + k.w];
    ui.guide = mg !== null ? [[fromU(horiz ? [e2, other[0]] : [other[0], e2]), fromU(horiz ? [e2, other[1]] : [other[1], e2])]] : null;
    d.label = `${horiz ? '폭' : '깊이'} ${(old / 1000).toFixed(2)} → ${(nv / 1000).toFixed(2)} m${mg !== null ? ' · 기둥에 맞춤' : ''}`;
  } else if (d.kind === 'coreDoor') {
    // 문을 벽을 따라 끈다(0.05m 단위, Alt: 자유). 엔진이 벽 구간 안에서 멈춘다
    doc = d0; const k = doc.cores[d.i], v = Math.round(typedDist != null ? typedDist : d.base + snapV(dot(sub(w, d.start), d.u), ev && ev.altKey ? 0 : 50));
    k.doors = {...(k.doors || {}), [d.id]: v}; if (!v) delete k.doors[d.id]; delete k.doorMm;
    d.label = `${d.id === 'ENT' ? '출입문' : '승강기 문'} ${v >= 0 ? '+' : '−'}${Math.abs(v / 1000).toFixed(2)} m`;
  } else if (d.kind === 'vtx') {
    const M = d0.mass, n = M.length; doc.mass = M.map((p) => p.slice());
    doc.mass[d.i] = typedDist != null ? d.last : snapPoint(add(M[d.i], sub(w, d.start)), ev, M.filter((_, j) => j !== d.i)); d.last = doc.mass[d.i];
    followAlignedEdge();
    d.label = `${(Math.hypot(...sub(doc.mass[d.i], M[(d.i + n - 1) % n])) / 1000).toFixed(2)} m / ${(Math.hypot(...sub(doc.mass[d.i], M[(d.i + 1) % n])) / 1000).toFixed(2)} m`;
  } else {
    // 이동(매스 통째·코어·램프): 숫자 입력이면 끈 방향의 주축으로 그 거리만큼
    if (typedDist != null) { const v = d.lastDu || [1, 0]; du = Math.abs(v[0]) >= Math.abs(v[1]) ? [Math.sign(v[0]) * typedDist, 0] : [0, Math.sign(v[1]) * typedDist]; }
    else { const s = d.kind === 'core' ? (ev && ev.altKey ? 0 : 100) : step(ev); du = [snapV(du[0], s), snapV(du[1], s)]; d.lastDu = du; }
    // 코어 이동: 네 변 중 기둥 중심·면에 8px 안인 것에 붙인다
    if (d.kind === 'core' && typedDist == null && !(ev && ev.altKey)) { const k0 = d0.cores[d.i], cu = toU(k0.c), F = colFeats(), g = []; [[0, k0.w], [1, k0.d]].forEach(([ax, sz]) => { let best = null; for (const e of [cu[ax] - sz / 2, cu[ax] + sz / 2]) { const m = magnet(e + du[ax], F[ax ? 'y' : 'x'], 8 / scale()); if (m !== null && (best === null || Math.abs(m - e - du[ax]) < Math.abs(best.m - best.e - du[ax]))) best = {m, e}; } if (best) { du[ax] = best.m - best.e; const o = ax ? [cu[0] - k0.w, cu[0] + k0.w] : [cu[1] - k0.d, cu[1] + k0.d]; g.push([fromU(ax ? [o[0], best.m] : [best.m, o[0]]), fromU(ax ? [o[1], best.m] : [best.m, o[1]])]); } }); ui.guide = g.length ? g : null; }
    const dw = fromU(du), mv = (p) => add(p, dw).map(Math.round);
    doc = d0;
    if (d.kind === 'mass') { doc.mass = doc.mass.map(mv); doc.cores.forEach((c) => (c.c = mv(c.c))); doc.ramp.p = mv(doc.ramp.p);movePlanningRegions(mv);followAlignedEdge(); }
    else if (d.kind === 'core') { doc.cores[d.i].c = mv(doc.cores[d.i].c); delete doc.cores[d.i].keep; }
    else if (d.kind === 'ramp') {doc.ramp.p = mv(doc.ramp.p);delete doc.ramp.edgeBinding;}
    d.label = `${(Math.hypot(...du) / 1000).toFixed(2)} m 이동`;
  }
  d.moved = true; renderEdit(); renderPanelLite(); liveRecompute();
}
const renderPanelLite = () => { const M = doc.mass; $('massInfo').textContent = `면적 ${fmt(area(M) / 1e6)}㎡ · 꼭짓점 ${M.length}개`; };
function endDrag(ok) {
  const d = ui.drag; if (!d) return; ui.drag = null; ui.guide = null; ui.typed = ''; ui.live = null;
  if (!ok) { doc = JSON.parse(d.undo0 || d.doc0); if (d.undo0) ui.sel = null; renderAll(); return; }
  if (!d.moved) { if (d.undo0) { doc = JSON.parse(d.undo0); ui.sel = null; } renderAll(); return; }
  // 되돌아가는 바늘 끝(한 줄 위에서 방향이 뒤집히는 점)은 지운다 — 곧은 변 가운데 일부러 넣은 꼭짓점은 남긴다
  if (['vtx', 'edge'].includes(d.kind)) for (let it = 0; it < 4; it++) doc.mass = doc.mass.filter((p, i, Q) => { const a2 = Q[(i + Q.length - 1) % Q.length], b2 = Q[(i + 1) % Q.length]; const cr = (p[0] - a2[0]) * (b2[1] - a2[1]) - (p[1] - a2[1]) * (b2[0] - a2[0]); return !(Math.abs(cr) <= Math.hypot(b2[0] - a2[0], b2[1] - a2[1]) * 1 && dot(sub(p, a2), sub(b2, p)) < 0); });
  if (d.invalid || !usableMass(doc.mass)) { doc = JSON.parse(d.doc0); renderAll(); flash(d.invalid||'외곽이 올바르지 않아 되돌렸습니다'); return; }
  commit({edge: `변 ${d.label}`, vtx: '꼭짓점 이동', mass: `매스 ${d.label}`, core: `코어 ${d.i + 1} ${d.label}`, coreEdge: `코어 ${d.i + 1} ${d.label}`, coreDoor: `코어 ${d.i + 1} ${d.label}`, ramp: `램프 ${d.label}`, mid: '꼭짓점 추가'}[d.why || d.kind] || '편집');
  renderAll();
}
// 그리기 도구: 직교 고정(Shift 해제), 스냅 간격 반올림, 첫 점 10px 안이면 닫기
function drawPoint(ev, typedDist) {
  const P = ui.draw.pts, w = world(ev);
  if (!P.length) return snapPoint(w, ev, []);
  const last = P.at(-1); let du = toU(sub(w, last));
  if (!ev.shiftKey) du = Math.abs(du[0]) >= Math.abs(du[1]) ? [du[0], 0] : [0, du[1]];
  const L = Math.hypot(...du) || 1, len = typedDist != null ? typedDist : snapV(L, step(ev)), p = add(last, fromU(mul(du, len / L))).map(Math.round);
  if (typedDist == null && P.length >= 3 && Math.hypot(...sub(w, P[0])) * scale() < 10) return P[0];
  return p;
}
function finishDraw() {
  const P = ui.draw.pts; if (P.length < 3) { flash('꼭짓점이 3개 이상 필요합니다'); return; }
  if (selfCrossing(P)) { flash('변끼리 엇갈려 매스로 쓸 수 없습니다'); return; }
  setMass(P.map((p) => p.slice()), '매스 새로 그림');
}
// 새 매스: 램프가 매스 밖이면 가장 긴 변 안쪽을 따라 다시 놓고, 매스 밖 코어는 알린다
function setMass(P, label) {
  doc.mass = signedArea(P) > 0 ? P : P.reverse();
  delete doc.ramp.edgeBinding;
  const inside = (p) => insidePoly(doc.mass, p), notes = [];
  if (!curveMode() && (!inside(doc.ramp.p) || doc.allowExternalRamp===false&&!inside(rampBody(rampSpec(doc.ramp)).start))) {
    let best = null; doc.mass.forEach((a, i) => { const b = doc.mass[(i + 1) % doc.mass.length], L = Math.hypot(...sub(b, a)); if (!best || L > best.L) best = {a, b, L}; });
    const u = mul(sub(best.b, best.a), 1 / best.L), n = [-u[1], u[0]], t = Math.min(best.L - 4000, doc.ramp.len + WALL + 3000);
    doc.ramp.p = add(add(best.a, mul(u, t)), mul(n, WALL + 3400)).map(Math.round);
    doc.ramp.k = (((Math.round((Math.atan2(u[1], u[0]) * 180 / Math.PI - doc.ucs) / 90)) % 4) + 4) % 4;
    notes.push('램프를 가장 긴 변을 따라 다시 놓았습니다');
  }
  const out = doc.cores.map((c, i) => (inside(c.c) ? null : i + 1)).filter(Boolean);
  notes.unshift('기존 매스를 새 매스로 바꿨습니다(Ctrl+Z로 되돌리기)');
  if (out.length) notes.push(`코어 ${out.join('·')}이(가) 매스 밖에 있습니다 — 끌어 옮기거나 지우세요`);
  ui.sel = {kind: 'mass'}; setTool('select'); commit(label); renderAll(); if (notes.length) flash(notes.join(' · '));
}
let pan = null;
svg.addEventListener('pointerdown', (ev) => {
  ui.mouse = world(ev);
  if (ev.button === 1 || (ev.button === 0 && ui.space)) { ev.preventDefault(); pan = {x: ev.clientX, y: ev.clientY, v: ui.view.slice(), k: 1 / scale()}; try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* 합성 */ } return; }
  if (ev.button !== 0) return;
  const t = ev.target.dataset || {};
  if (ui.alignRamp) {
    if(t.edge===undefined)return flash('외곽 변을 클릭하세요');
    const M=doc.mass,i=+t.edge,a=M[i],b=M[(i+1)%M.length],e=sub(b,a),L=Math.hypot(...e);
    if(L<1000)return flash('1m보다 긴 외곽 변을 선택하세요');
    const u=mul(e,1/L),n=signedArea(M)>0?[-u[1],u[0]]:[u[1],-u[0]];
    const prev=rot([1,0],Number.isFinite(doc.ramp.alignedAngleDeg)?doc.ramp.alignedAngleDeg:doc.ucs+90*doc.ramp.k);
    const direction=dot(prev,u)>=0?u:mul(u,-1),from=dot(direction,u)>0?a:b;
    const clicked=Math.max(0,Math.min(L,dot(sub(world(ev),from),direction)));
    const along=L>=doc.ramp.len?Math.max(doc.ramp.len,Math.min(L,clicked)):clicked;
    doc.ramp.edgeBinding={index:i,reverse:dot(direction,u)<0,ratio:along/L};
    followAlignedEdge();
    ui.alignRamp=false;ui.sel={kind:'ramp'};commit(`직선 램프를 외곽 변 ${i+1}에 맞춤`);
    if(L<doc.ramp.len)flash(`선택한 변 ${(L/1000).toFixed(1)}m가 램프 ${(doc.ramp.len/1000).toFixed(1)}m보다 짧습니다. 검토 결과를 확인하세요.`);
    return;
  }
  if (ui.tool === 'draw') { const p = drawPoint(ev); if (ui.draw.pts.length >= 3 && p === ui.draw.pts[0]) { finishDraw(); return; } ui.draw.pts.push(p); ui.typed = ''; renderEdit(); return; }
  if (ui.tool === 'rect') { ui.rect0 = snapPoint(world(ev), ev, []); try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* 합성 */ } return; }
  if (ui.tool === 'ucs') {
    const P = t.ucsm !== undefined ? doc.mass : t.ucss !== undefined ? SITE : null; if (!P) return;
    const i = +(t.ucsm ?? t.ucss); doc.ucs = edgeAngle(P[i], P[(i + 1) % P.length]); setTool('select'); commit(`UCS ${doc.ucs.toFixed(1)}°`); fit(); return;
  }
  if (t.ghost !== undefined) { applyRampGhost(+t.ghost); return; }
  if (t.cface !== undefined) { const i = +t.cface, k = doc.cores[i], seq = ['N', 'E', 'S', 'W'], cur = t.cur || 'S'; if (ev.altKey) delete k.facing; else k.facing = seq[(seq.indexOf(cur) + 1) % 4]; ui.sel = {kind: 'core', i}; commit(`코어 ${i + 1} 입구 ${k.facing ? {N: '위', E: '오른쪽', S: '아래', W: '왼쪽'}[k.facing] : '자동'}`); return; }
  if (t.cev !== undefined) { const i=+t.cev,seq=['auto',1,2,3,4];changeCoreEv(i,seq[(seq.indexOf(doc.cores[i].ev??'auto')+1)%seq.length]);return; }
  if (t.cdoor !== undefined) { ui.sel = {kind: 'core', i: +t.ci}; startDrag(ev, {kind: 'coreDoor', i: +t.ci, id: t.cdoor, u: [+t.ux, +t.uy], base: +t.base || 0}); }
  else if (t.cedge !== undefined) { ui.sel = {kind: 'core', i: +t.ci}; syncCoreBox(+t.ci); startDrag(ev, {kind: 'coreEdge', i: +t.ci, side: t.cedge}); }
  else if (t.vtx !== undefined) { ui.sel = {kind: 'vtx', i: +t.vtx}; startDrag(ev, {kind: 'vtx', i: +t.vtx}); }
  else if (t.mid !== undefined) { const i = +t.mid + 1, a = doc.mass[i - 1], b = doc.mass[i % doc.mass.length]; doc.mass.splice(i, 0, mul(add(a, b), .5).map(Math.round));splitAlignedEdge(i-1,.5); ui.sel = {kind: 'vtx', i}; startDrag(ev, {kind: 'vtx', i, why: 'mid'}); }
  else if (t.edge !== undefined) { ui.sel = {kind: 'edge', i: +t.edge}; startDrag(ev, {kind: 'edge', i: +t.edge}); }
  else if (t.core !== undefined) {
    let i = +t.core; const before = JSON.stringify(doc), copy = ev.ctrlKey || ev.metaKey; syncCoreBox(i);
    if (copy) { doc.cores.push({...doc.cores[i], c: doc.cores[i].c.slice()}); i = doc.cores.length - 1; }
    ui.sel = {kind: 'core', i}; startDrag(ev, {kind: 'core', i, copy}); if (copy) ui.drag.undo0 = before;
  }
  else if (t.ramp !== undefined) { ui.sel = {kind: 'ramp'}; startDrag(ev, {kind: 'ramp'}); }
  else if (t.mass !== undefined) { const was = ui.sel && ['mass', 'vtx', 'edge'].includes(ui.sel.kind); ui.sel = {kind: 'mass'}; if (was) startDrag(ev, {kind: 'mass'}); }
  else ui.sel = null;
  renderEdit(); renderPanel();
});
svg.addEventListener('pointermove', (ev) => {
  ui.mouse = world(ev);
  if (pan) { ui.view = [pan.v[0] - (ev.clientX - pan.x) * pan.k, pan.v[1] - (ev.clientY - pan.y) * pan.k, pan.v[2], pan.v[3]]; setView(); return; }
  if (ui.drag) { applyDrag(ev); return; }
  if (ui.tool === 'draw' && ui.draw.pts.length) { ui.draw.cur = drawPoint(ev); ui.draw.ev = ev; renderEdit(); }
  if (ui.tool === 'rect' && ui.rect0) { const a = toU(ui.rect0), b = toU(snapPoint(world(ev), ev, [])); ui.rect = [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]].map(fromU).map((p) => p.map(Math.round)); ui.guide = null; renderEdit(); }
});
svg.addEventListener('pointerup', () => {
  if (pan) { pan = null; return; }
  if (ui.drag) { endDrag(true); return; }
  if (ui.tool === 'rect' && ui.rect0) {
    const R = ui.rect; ui.rect0 = null; ui.rect = null;
    if (R && Math.hypot(...sub(R[1], R[0])) > 5000 && Math.hypot(...sub(R[2], R[1])) > 5000) setMass(R, '사각형 매스 그림');
    else { flash('5m보다 작은 사각형은 만들지 않습니다'); renderEdit(); }
  }
});
svg.addEventListener('dblclick', (ev) => {
  const t = ev.target.dataset || {};
  if (ui.tool === 'draw') { finishDraw(); return; }
  if (t.vtx !== undefined) { if (doc.mass.length <= 3) return;removeAlignedVertex(+t.vtx); doc.mass.splice(+t.vtx, 1);followAlignedEdge(); ui.sel = {kind: 'mass'}; commit('꼭짓점 삭제'); renderAll(); return; }
  // 변 두 번 누르기: 누른 자리(변 위로 내린 점)에 꼭짓점 추가
  if (t.edge !== undefined) { const i = +t.edge, M = doc.mass, a = M[i], b = M[(i + 1) % M.length], w = world(ev), u = sub(b, a), k = Math.max(.05, Math.min(.95, dot(sub(w, a), u) / dot(u, u))); doc.mass.splice(i + 1, 0, add(a, mul(u, k)).map(Math.round));splitAlignedEdge(i,k); ui.sel = {kind: 'vtx', i: i + 1}; commit('꼭짓점 추가'); renderAll(); return; }
  if (ev.target === svg) fit();
});
svg.addEventListener('wheel', (ev) => { ev.preventDefault(); const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; const q = p.matrixTransform(svg.getScreenCTM().inverse()), z = ev.deltaY < 0 ? 0.8 : 1.25, v = ui.view; ui.view = [q.x - (q.x - v[0]) * z, q.y - (q.y - v[1]) * z, v[2] * z, v[3] * z]; setView(); renderEdit(); }, {passive: false});
svg.addEventListener('mousedown', (ev) => { if (ev.button === 1) ev.preventDefault(); });
document.addEventListener('keydown', (ev) => {
  if(ui.busy)return;
  const tag = (ev.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
  const k = ev.key.toLowerCase();
  if (ev.ctrlKey || ev.metaKey) { if (k === 'z') { ev.preventDefault(); ev.shiftKey ? jump(hist.i + 1) : jump(hist.i - 1); } else if (k === 'y') { ev.preventDefault(); jump(hist.i + 1); } return; }
  if (ev.key === ' ') { ev.preventDefault(); ui.space = true; svg.style.cursor = 'grab'; return; }
  // 끄는 중·그리는 중 숫자 입력
  if ((ui.drag || (ui.draw && ui.draw.pts.length)) && /^[0-9.]$/.test(ev.key)) { ui.typed += ev.key; drawLabels(); ev.preventDefault(); return; }
  if (ev.key === 'Backspace' && ui.typed) { ui.typed = ui.typed.slice(0, -1); drawLabels(); ev.preventDefault(); return; }
  if (ev.key === 'Enter') {
    if (ui.drag && +ui.typed > 0) { if (ui.drag.kind === 'vtx') { flash('꼭짓점은 숫자 입력 대신 변을 끌어 정확히 옮기세요'); return; } applyDrag(null, +ui.typed); endDrag(true); return; }
    if (ui.draw) { if (+ui.typed > 0 && ui.draw.pts.length && ui.draw.ev) { ui.draw.pts.push(drawPoint(ui.draw.ev, +ui.typed)); ui.typed = ''; ui.draw.cur = null; renderEdit(); } else finishDraw(); return; }
  }
  if (ev.key === 'Escape' && ui.ghosts) { ui.ghosts = null; renderEdit(); renderRampCandidates(); return; }
  if (ev.key === 'Escape') { if(ui.alignRamp){ui.alignRamp=false;renderAll();}else if (ui.drag) endDrag(false); else if (ui.tool !== 'select') setTool('select'); else { ui.sel = null; renderEdit(); renderPanel(); } return; }
  if (ui.draw && ev.key === 'Backspace') { ui.draw.pts.pop(); renderEdit(); ev.preventDefault(); return; }
  if (k === 'e' && !ui.drag) { ui.edgeMode = ui.edgeMode === 'extrude' ? 'slide' : 'extrude'; flash(ui.edgeMode === 'extrude' ? '변 끌기: 이 변만 돌출' : '변 끌기: 이웃 변 따라'); renderMassBar(); return; }
  const tool = {v: 'select', p: 'draw', b: 'rect', u: 'ucs'}[k]; if (tool && !ui.drag) { setTool(tool); return; }
  const sel = ui.sel; if (!sel || ui.drag) return;
  if (k === 'delete' || k === 'backspace') {
    if (sel.kind === 'core') { doc.cores.splice(sel.i, 1); ui.sel = null; commit(`코어 ${sel.i + 1} 삭제`); renderAll(); }
    else if (sel.kind === 'vtx' && doc.mass.length > 3) {removeAlignedVertex(sel.i);doc.mass.splice(sel.i, 1);followAlignedEdge(); ui.sel = {kind: 'mass'}; commit('꼭짓점 삭제'); renderAll(); }
    ev.preventDefault(); return;
  }
  if (k === 'r') {
    if (sel.kind === 'core') { const c = doc.cores[sel.i]; [c.w, c.d] = [c.d, c.w]; commit(`코어 ${sel.i + 1} 90° 회전`); renderAll(); }
    else if (sel.kind === 'ramp') {delete doc.ramp.edgeBinding;if(!curveMode()&&Number.isFinite(doc.ramp.alignedAngleDeg))doc.ramp.alignedAngleDeg=wrapAngle(doc.ramp.alignedAngleDeg+(ev.shiftKey?-90:90));else doc.ramp.k = (doc.ramp.k + (ev.shiftKey ? 3 : 1)) % 4; commit('램프 90° 회전'); renderAll(); }
    return;
  }
  const arrows = {arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, 1], arrowdown: [0, -1]}[k];
  if (arrows) {
    ev.preventDefault(); const s = (doc.snap || 1000) * (ev.shiftKey ? 5 : 1), dw = fromU(mul(arrows, s)), mv = (p) => add(p, dw).map(Math.round);
    if (sel.kind === 'core') doc.cores[sel.i].c = mv(doc.cores[sel.i].c);
    else if (sel.kind === 'ramp') {doc.ramp.p = mv(doc.ramp.p);delete doc.ramp.edgeBinding;}
    else if (sel.kind === 'mass') { doc.mass = doc.mass.map(mv); doc.cores.forEach((c) => (c.c = mv(c.c))); doc.ramp.p = mv(doc.ramp.p);movePlanningRegions(mv);followAlignedEdge(); }
    else if (sel.kind === 'vtx') {doc.mass[sel.i] = mv(doc.mass[sel.i]);followAlignedEdge();}
    else if (sel.kind === 'edge') { const M = doc.mass, a = M[sel.i], b = M[(sel.i + 1) % M.length], u = mul(sub(b, a), 1 / Math.hypot(...sub(b, a))), out = signedArea(M) > 0 ? [u[1], -u[0]] : [-u[1], u[0]]; doc.mass = pushEdge(M, sel.i, dot(dw, out) >= 0 ? s : -s);remapAlignedEdge(M,doc.mass,sel.i);followAlignedEdge(); }
    commit('방향키 이동'); renderAll();
  }
});
document.addEventListener('keyup', (ev) => { if (ev.key === ' ') { ui.space = false; svg.style.cursor = ''; } });
window.addEventListener('resize', () => { if (ui.view) fit(); });

// ── 버튼 ──
$('undoBtn').onclick = () => jump(hist.i - 1);
$('redoBtn').onclick = () => jump(hist.i + 1);
$('fitBtn').onclick = fit;
$('resetBtn').onclick = () => { if (!confirm('매스·코어·램프를 처음 상태로 되돌릴까요? (실행 취소로 다시 돌아올 수 있습니다)')) return; doc = defaultDoc(); ui.sel = null; commit('처음 상태로'); fit(); };
if($('turnBayOff'))$('turnBayOff').onclick=()=>{delete doc.layoutAlternative;commit('회차 공간 실험안 해제');};
if($('turnBayRestore'))$('turnBayRestore').onclick=()=>{
  let previous=null;try{previous=JSON.parse(localStorage.getItem(REVIEW_BACKUP));}catch(e){/* no saved scene */}
  if(!validDoc(previous))return flash('복원할 이전 장면이 없습니다');
  doc=previous;ui.sel=null;commit('이전 장면 복원');fit();
};
$('ucsPick').onclick = () => setTool(ui.tool === 'ucs' ? 'select' : 'ucs');
$('ucsSuggest').onclick = () => withCalculationNotice(() => {
  if(doc.columnAxes)return flash('직접 입력한 구조축은 자동으로 회전하지 않습니다.');
  const list = curveMode()?suggestCurveUcs():UGPlan.suggestUcs(planInput()); if (!list.length) return flash('성립하는 방향을 찾지 못했습니다');
  const best = list[0], cur = ui.res && !ui.res.fail ? ui.res.stallCount : null;
  $('ucsList').innerHTML = list.map((c) => `<button class="mini-btn${Math.abs(c.ucs - doc.ucs) < .2 ? ' on' : ''}" data-ucs="${c.ucs}">${c.ucs.toFixed(1)}° · ${c.stallCount}대${c.hasLoop ? '' : ' (순환 없음)'}</button>`).join('');
  $('ucsList').querySelectorAll('button').forEach((b) => (b.onclick = () => { doc.ucs = +b.dataset.ucs; commit(`UCS ${doc.ucs.toFixed(1)}°`); fit(); $('ucsList').innerHTML = ''; }));
  flash(`매스 변 방향 ${list.length}가지를 계산했습니다 — 가장 많은 것은 ${best.ucs.toFixed(1)}° ${best.stallCount}대${cur !== null ? `(지금 ${cur}대)` : ''}. 눌러서 적용`);
});
if($('phaseSuggest'))$('phaseSuggest').onclick=()=>withCalculationNotice(()=>{
 const key=phaseKey(), input=planInput();
 if(curveMode()){if(!input.ramp.body)return flash('곡선 램프 입력부터 확인해 주세요');input.rampEvaluation=evaluateCurveRamp(input.ramp);}
 if(selfCrossing(doc.mass)||area(doc.mass)>60000e6)return flash('외곽을 확인한 뒤 다시 제안해 주세요');
 const list=UGPlan.suggestPhases(input);
 const container=$('phaseList');container.innerHTML='';
 if(!list.length){container.textContent='비교할 구조열 위치를 찾지 못했습니다';return;}
 list.forEach((candidate,i)=>{
  const b=document.createElement('button');b.className='mini-btn phase-option';
  b.textContent=`안 ${i+1} · ${candidate.stallCount}대 · ${candidate.hasLoop?'순환 있음':'순환 없음'} · 막다른 끝 ${candidate.deadEnds}`;
  b.onclick=()=>{if(key!==phaseKey())return;doc.phase={key:phaseKey(),p:candidate.phase.slice()};commit(`구조열 위치 안 ${i+1}`);};
  container.appendChild(b);
 });
});
$('ucsLong').onclick = () => { if(doc.columnAxes)return flash('직접 입력 구조의 방향은 고정됩니다.'); doc.ucs = longestEdgeAngle(doc.mass); commit(`UCS ${doc.ucs.toFixed(1)}°`); fit(); };
$('addCore').onclick = () => { const v = ui.view, D = [v[0] + v[2] / 2, v[1] + v[3] / 2]; doc.cores.push({c: fromU([D[0], -D[1]]).map(Math.round), w: 8000, d: 8000}); ui.sel = {kind: 'core', i: doc.cores.length - 1}; commit('코어 추가'); renderAll(); };
if($('bypassBtn'))$('bypassBtn').onclick=()=>{doc.occupantPolicy=doc.occupantPolicy==='bypass'?'report':'bypass';commit(doc.occupantPolicy==='bypass'?'코어 차단 구간 우회':'우회 해제');};
$('moduleSel').onchange = () => { doc.module = $('moduleSel').value; commit(`모듈 ${MODULES[doc.module].name}`); };
$('rampLen').onkeydown = (e) => { if (e.key === 'Enter') e.target.blur(); };
$('rampLen').onchange = () => { const v = +$('rampLen').value * 1000; if (!(v >= 10000)) return; doc.ramp.len = v;followAlignedEdge(); commit(`램프 길이 ${v / 1000}m`); };
$('rampW').onchange = () => { doc.ramp.w = +$('rampW').value;followAlignedEdge(); commit(`램프 폭 ${doc.ramp.w / 1000}m`); };
$('rampAlignEdge').onclick=()=>{ui.alignRamp=!ui.alignRamp;if(ui.alignRamp)setTool('select');renderEdit();renderPanel();};
$('rampSuggest').onclick = () => withCalculationNotice(() => { const input=planInput(); ui.ghosts = curveMode()?suggestCurvePositions(input):UGPlan.suggestRamps(input); if (!ui.ghosts.length) flash('검토할 램프 자리를 찾지 못했습니다(벽을 따라·벽에서 직각으로 놓는 후보 기준)'); else flash(`램프 자리 ${ui.ghosts.length}곳을 보였습니다. 결과를 확인하고 선택하세요.`); renderEdit();renderRampCandidates(); });
$('rampRot').onclick = () => {delete doc.ramp.edgeBinding;if(!curveMode()&&Number.isFinite(doc.ramp.alignedAngleDeg))doc.ramp.alignedAngleDeg=wrapAngle(doc.ramp.alignedAngleDeg+90);else doc.ramp.k = (doc.ramp.k + 1) % 4; commit('램프 90° 회전'); };
$('rampFlip').onclick = () => { if(doc.ramp.edgeBinding&&!curveMode()){doc.ramp.edgeBinding.reverse=!doc.ramp.edgeBinding.reverse;doc.ramp.edgeBinding.ratio=1-doc.ramp.edgeBinding.ratio;followAlignedEdge();}else if(!curveMode()&&Number.isFinite(doc.ramp.alignedAngleDeg))doc.ramp.alignedAngleDeg=wrapAngle(doc.ramp.alignedAngleDeg+180);else doc.ramp.k = (doc.ramp.k + 2) % 4; commit('램프 방향 뒤집기'); };


function renderCurveControls() {
  const on=curveMode(),c=curveSettings();
  $('rampKind').value=on?'curve':'straight';$('straightRampFields').hidden=on;$('curveRampFields').hidden=!on;
  $('rampSuggest').disabled=false;
  $('rampSuggest').title=on?'곡선 램프 후보마다 다시 판정해 자리 제안':'직선 램프 자리 제안';
  for(const field of document.querySelectorAll('[data-curve-field]')){
    const value=c[field.dataset.curveField];
    if(document.activeElement!==field){
      if(field.type==='checkbox')field.checked=!!value;
      else field.value=value==null?'':typeof value==='number'&&field.dataset.displayScale?Number((value/Number(field.dataset.displayScale)).toFixed(4)):value;
    }
  }
}
const RAMP_CHECKS=[['R01','차로 너비'],['R02','구간 경사'],['R03','내변반경'],['R04','완화구간'],['R09','연석'],['G07','몸체·외곽']];
function renderCurveReview(result) {
  const box=$('curveReview');box.hidden=!curveMode();if(!curveMode())return;
  const curve=result?.curveRamp||getCurveRamp(),evaluation=result?.rampEvaluation;
  const violations=curve.violations||[];
  $('curveIssues').innerHTML=violations.length?'<ul>'+violations.map(v=>`<li><strong>${escapeText(v.id)}</strong>${v.field?' · '+escapeText(v.field):''}<br>${escapeText(v.note)}</li>`).join('')+'</ul>':'';
  const checks=RAMP_CHECKS.map(([id,name])=>{
    const q=evaluation?.items.find(x=>x.id===id&&x.subjectId===curve.id);
    const status=!q?'未':q.applicability==='NOT_APPLICABLE'?'NA':q.verdict;
    const title={PASS:'통과',FAIL:'실패',INPUT_ERROR:'입력 오류',UNDETERMINED:'확인 불가',NA:'해당 없음','未':'미판정'}[status]||'확인 불가';
    const message=q?.message||(curve.body?(result?.fail||'배치한 몸체를 다시 계산해 주세요'):'입력 오류로 몸체와 판정을 만들지 않았습니다.');
    return `<details class="ramp-check" data-check="${id}" data-verdict="${status}"><summary><span>${name}</span><b>${title}</b></summary><p>${escapeText(message)}</p></details>`;
  });
  $('curveChecks').innerHTML=checks.join('');
  const m=evaluation?.items.find(x=>x.id==='R02'&&x.subjectId===curve.id)?.evidence?.measurement||curve.measurement;
  const c=curveSettings(),grade=m?.gradeReference==='conservativeInner'?'차로 중앙보다 안쪽의 보수적 선':c.lanes===2?'안쪽 차로 중심선':'1차로 중심선';
  $('curveMeasurement').textContent=m?`측정 기준 · 반경: ${m.radiusReference==='innerCurbWallSide'?'안쪽 연석 벽 쪽 끝':'안쪽 벽 마감면'} · 경사: ${grade} · 너비: ${m.widthReference==='wallToWall'?'벽 사이':'연석 포함, 벽–연석 간격 제외'}. 근거: ${m.basis}.`:'측정 기준은 올바른 몸체가 만들어진 뒤 표시합니다.';
  const slope=curve.referenceSlopes?.gradeLinePct;
  $('curveMetrics').textContent=curve.body?`곡선 경사 ${slope.toFixed(3)}% · 전체 수평 길이 ${(curve.lengthMm/1000).toFixed(3)}m · 벽 간격 ${(curve.wallToWallMm/1000).toFixed(2)}m`:'';
  const total=c.totalStalls===null?'대수 미입력':`같은 램프 이용 전체 ${c.totalStalls}대`;
  $('curveConditions').textContent=`${total} · ${{noeoe:'노외',buseol:'부설',unknown:'종류 미확인'}[c.parkingKind]||'종류 미확인'} · 기준일 ${c.permitDate||'미입력'}`;
  $('curveReviewSummary').textContent=violations.length?'램프 입력·완화 확인 필요':!evaluation?'램프 판정 대기':RAMP_CHECKS.some(([id])=>{const q=evaluation.items.find(x=>x.id===id&&x.subjectId===curve.id);return !q||(q.applicability!=='NOT_APPLICABLE'&&q.verdict!=='PASS');})?'램프 검토 필요':'램프 6개 항목 확인';
}
// Unlike the engine's UCS suggestion, each frontend candidate gets a fresh body
// and evaluation for that orientation. No old body's verdict is reused.
function suggestCurveUcs() {
  const angles=[];
  doc.mass.forEach((p,i)=>{const q=doc.mass[(i+1)%doc.mass.length];if(Math.hypot(...sub(q,p))<5000)return;let a=((edgeAngle(p,q)%90)+90)%90;if(a>45)a-=90;a=Math.round(a*10)/10;if(!angles.some(v=>Math.abs(v-a)<1))angles.push(a);});
  const oldUcs=doc.ucs,list=[];
  try{
    for(const ucs of angles){
      doc.ucs=ucs;
      try{const r=solve();if(!r.fail)list.push({ucs,stallCount:r.stallCount,hasLoop:r.graph.hasLoop});}catch(e){/* unsuitable orientation */}
    }
  }finally{doc.ucs=oldUcs;}
  return list.sort((a,b)=>(b.hasLoop-a.hasLoop)||b.stallCount-a.stallCount);
}
$('rampKind').onchange=()=>{
  doc.ramp.kind=$('rampKind').value;
  ui.alignRamp=false;
  if(curveMode()&&!doc.ramp.curve)doc.ramp.curve={...CURVE_DEFAULTS};
  ui.sel={kind:'ramp'};commit(curveMode()?'곡선 램프 선택':'직선 램프 선택');
};
for(const field of document.querySelectorAll('[data-curve-field]')){
  field.onkeydown=e=>{if(e.key==='Enter')field.blur();};
  field.onchange=()=>{
    if(!field.reportValidity())return;
    const value=field.type==='checkbox'?field.checked:field.type==='number'?(field.value.trim()===''?null:field.dataset.displayScale?Math.round(field.valueAsNumber*Number(field.dataset.displayScale)):field.valueAsNumber):field.dataset.curveField==='lanes'?Number(field.value):field.value;
    doc.ramp.curve={...curveSettings(),[field.dataset.curveField]:value};
    commit('곡선 램프 조건 변경');
  };
}

async function startPlan(){
  if(referenceScene){
    await import('./sghs-reference.js');
    const data=window.SGHSReference,f=data.floors.find(f=>f.id===referenceScene.floor);
    if(!f||!['before','revised','landing','aligned','clearance','reviewed'].includes(referenceScene.revision)||!f[referenceScene.revision])throw Error('SGHS 층 또는 입력 버전을 확인하세요');
    MODULES.sghs={name:'SGHS 시험 모듈 · 칸·벽·기둥 치수는 가정',grid:data.grid};
    SITE.splice(0,SITE.length,...structuredClone(data.site));
    doc=load()||structuredClone(f[referenceScene.revision]);
    if(!validDoc(doc))throw Error('SGHS 저장 입력을 읽을 수 없습니다');
    document.title='SGHS '+f.label+' · 원도 대조';
    document.querySelector('.project .eyebrow').textContent='동대문구 구민회관 · SGHS';
    document.querySelector('.floor-tab').textContent=f.id+' '+f.label+' 평면도';
    document.querySelector('.sheet-heading h1').textContent=f.label+' 평면도';
    document.querySelector('.sheet-heading p').textContent='SGHS · '+({before:'보완 전 입력',revised:'보완 입력',landing:'착지 검토 · 상부 벽 기준선 추정',aligned:'피드백 보정 · 외벽 내측 기준 / 벽 두께 가정',clearance:'원본 작동 전제 · 순폭 6m 역산',reviewed:'원본 대조 보정 · C3 / 하행 램프 주차 제외'}[referenceScene.revision])+' / 추정 치수 포함';
    document.querySelector('.sheet-caption strong').textContent=f.label+' 평면도';
    $('north').style.display='none'; // Drawing-up is not a verified geographic north direction.
    $('plan').setAttribute('aria-label','편집 가능한 SGHS '+f.label+' 주차 평면도');
    $('resetBtn').onclick=()=>{doc=structuredClone(f[referenceScene.revision]);ui.sel=null;commit('SGHS 선택 버전의 입력 복원');fit();};
    window.sghsScene={floor:f.id,revision:referenceScene.revision,snapshot:()=>({input:structuredClone(doc),result:ui.res,routes:ui.res&&!ui.res.fail?UGPlan.inspectVehicleRoutes(ui.res):null})};
  }
  if (!MODULES[doc.module]) doc.module = 'normal';
  pushHist(); renderAll(); fit(); recompute(null);
  if(referenceScene)save();
}
startPlan().catch(e=>{reviewLoadError=e.message;ui.res={fail:e.message};renderAll();});
