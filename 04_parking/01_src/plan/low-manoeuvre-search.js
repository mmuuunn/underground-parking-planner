'use strict';
const M = require('./vehicle-manoeuvres.js');
const TAU = 2 * Math.PI, mod = a => (a % TAU + TAU) % TAU, wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const pose = q => Array.isArray(q) && q.length === 3 && q.every(Number.isFinite);
const same = (a, b) => pose(a) && pose(b) && distance(a, b) < .01 && Math.abs(wrap(a[2] - b[2])) < 1e-7;
function check(ok, message) { if (!ok) throw new RangeError(message); }
function end(start, controls) { return controls.reduce((q, c) => M.advance(q, c.gear * c.lengthMm, c.curvature), start); }
function count(controls, initialGear) { let gear = initialGear, changes = 0; for (const c of controls) { if (gear && gear !== c.gear) changes++; gear = c.gear; } return changes; }

// shortcut: Four CSC families and bounded fallback cannot prove a global minimum; extend when measured cases need it.
function dubins(a, b, radius) {
  const dx = (b[0] - a[0]) / radius, dy = (b[1] - a[1]) / radius, d = Math.hypot(dx, dy), theta = Math.atan2(dy, dx);
  const A = mod(a[2] - theta), B = mod(b[2] - theta), sa = Math.sin(A), sb = Math.sin(B), ca = Math.cos(A), cb = Math.cos(B), cab = Math.cos(A - B), paths = [];
  function add(types, t, p, q) {
    const controls = [t, p, q].map((x, i) => ({gear: 1, curvature: types[i] === 'S' ? 0 : (types[i] === 'L' ? 1 : -1) / radius, lengthMm: x * radius})).filter(c => c.lengthMm > 1e-6);
    if (same(end(a, controls), b)) paths.push(controls);
  }
  let p2 = 2 + d*d - 2*cab + 2*d*(sa-sb), z;
  if (p2 >= -1e-12) { z = Math.atan2(cb-ca, d+sa-sb); add('LSL', mod(-A+z), Math.sqrt(Math.max(0,p2)), mod(B-z)); }
  p2 = 2 + d*d - 2*cab + 2*d*(sb-sa);
  if (p2 >= -1e-12) { z = Math.atan2(ca-cb, d-sa+sb); add('RSR', mod(A-z), Math.sqrt(Math.max(0,p2)), mod(-B+z)); }
  p2 = -2 + d*d + 2*cab + 2*d*(sa+sb);
  if (p2 >= -1e-12) { const p = Math.sqrt(Math.max(0,p2)); z = Math.atan2(-ca-cb,d+sa+sb)-Math.atan2(-2,p); add('LSR',mod(-A+z),p,mod(-B+z)); }
  p2 = d*d - 2 + 2*cab - 2*d*(sa+sb);
  if (p2 >= -1e-12) { const p = Math.sqrt(Math.max(0,p2)); z = Math.atan2(ca+cb,d-sa-sb)-Math.atan2(2,p); add('RSL',mod(A-z),p,mod(B-z)); }
  return paths;
}
function search(space, start, goals, vehicle, options = {}) {
  const v = M.vehicle(vehicle), maxNodes = options.maxNodes ?? 5000, analyticLimit = options.maxAnalyticPaths ?? 180;
  const initialGear = options.initialGear ?? 1, finalGear = options.finalGear ?? 1, maxLengthMm = options.maxLengthMm ?? 50000;
  check(pose(start) && Array.isArray(goals) && goals.length > 0 && goals.length <= 64 && goals.every(pose), '유한한 시작 자세와 목표 자세 1~64개가 필요합니다');
  check(space && ['paths','edges','allowed','blockers'].every(k => Array.isArray(space[k])), '차량 검사 공간이 필요합니다');
  check(Number.isInteger(maxNodes) && maxNodes >= 0 && maxNodes <= 30000 && Number.isInteger(analyticLimit) && analyticLimit >= 0 && analyticLimit <= 2000, '탐색 한도를 확인하세요');
  check([0,1,-1].includes(initialGear) && [0,1,-1].includes(finalGear) && Number.isFinite(maxLengthMm) && maxLengthMm > 0, '전후진 조건과 길이 한도를 확인하세요');
  const stats = {analyticTested: 0, connectorTested: 0, expanded: 0, searchCalls: 0, approximateGoalsFound: 0};
  const limits = {maxNodes, maxAnalyticPaths: analyticLimit, maxConnectorPathsPerSearch: 24, maxSearchCalls: 6, maxGearChanges: 4, maxLengthMm};
  let best = null;
  function replay(controls) {
    check(Array.isArray(controls) && controls.length <= 10000 && controls.every(c => c && [1,-1].includes(c.gear) && Number.isFinite(c.curvature) && Math.abs(c.curvature) <= 1/v.minRadiusMm+1e-12 && Number.isFinite(c.lengthMm) && c.lengthMm > 0), '경로 제어값이 올바르지 않습니다');
    let q = start; for (const c of controls) { const part = M.motion(space,q,c.gear,c.curvature,c.lengthMm,v); if (!part.ok) return null; q = part.q; }
    const goalIndex = goals.findIndex(g => same(q,g)), lastGear = controls.at(-1)?.gear || initialGear || finalGear;
    const lengthMm = controls.reduce((s,c) => s+c.lengthMm,0), gearChanges = count(controls,initialGear);
    if (goalIndex < 0 || finalGear && lastGear !== finalGear || gearChanges > 4 || lengthMm > maxLengthMm) return null;
    return {start:start.slice(),end:q,controls:controls.map(c=>({...c})),goalIndex,lengthMm,gearChanges};
  }
  function prefer(candidate, source) { if (candidate && (!best || candidate.gearChanges < best.gearChanges || candidate.gearChanges === best.gearChanges && candidate.lengthMm < best.lengthMm-1e-6)) best = {...candidate,source}; }
  function candidates(q, prefixes, priorControls = []) {
    const paths = [];
    for (const gear of [1,-1]) {
      if (finalGear && gear !== finalGear) continue;
      for (const lengthMm of prefixes) {
        const prefix = lengthMm ? [{gear,curvature:0,lengthMm}] : [], p = end(q,prefix);
        if (lengthMm && !M.motion(space,q,gear,0,lengthMm,v).ok) continue;
        for (const goal of goals) for (const radius of [v.minRadiusMm,v.minRadiusMm+1000,v.minRadiusMm+3000]) {
          const a = [p[0],p[1],p[2]+(gear<0?Math.PI:0)], b = [goal[0],goal[1],goal[2]+(gear<0?Math.PI:0)];
          for (const parts of dubins(a,b,radius)) {
            const controls = priorControls.concat(prefix,parts.map(c=>({gear,curvature:gear*c.curvature,lengthMm:c.lengthMm})));
            const length = controls.reduce((s,c)=>s+c.lengthMm,0), changes = count(controls,initialGear);
            if (length <= maxLengthMm && changes <= 4 && (!best || changes < best.gearChanges || changes === best.gearChanges && length < best.lengthMm-1e-6)) paths.push({controls,length,changes});
          }
        }
      }
    }
    return paths.sort((a,b)=>a.changes-b.changes || a.length-b.length);
  }
  const finish = reason => best ? {state:'path-found',...best,stats,limits,optimality:'not-proven-globally'}
    : {state:'not-found',reason,stats,limits,optimality:'not-proven-globally'};
  if (!M.poseFits(space,start,v)) { check(!options.baseline,'기존 경로의 시작 자세가 현재 공간에 맞지 않습니다'); return finish('blocked-start-pose'); }
  if (options.baseline) { const known = replay(options.baseline.controls); check(known,'기존 경로가 현재 공간·목표·조건과 일치하지 않습니다'); prefer(known,'baseline'); }
  if (goals.some(g=>same(g,start))) prefer(replay([]),'stationary');
  for (const p of candidates(start,Array.from({length:10},(_,i)=>i*500))) {
    if (stats.analyticTested >= analyticLimit) break; stats.analyticTested++; prefer(replay(p.controls),'analytic');
  }
  if (best?.gearChanges === 0) return finish();
  const attempts = Math.min(6,goals.length);
  for (let i=0; i<attempts && stats.expanded<maxNodes; i++) {
    const budget = Math.floor((maxNodes-stats.expanded)/(attempts-i)); if (budget<1) break;
    const found = M.search(space,start,goals[i],v,{maxNodes:budget,radiusMm:14000,initialGear,finalGear});
    stats.searchCalls++; stats.expanded += found.expanded || 0;
    if (found.state !== 'path-found') continue; stats.approximateGoalsFound++;
    prefer(replay(found.controls),'bounded-search-exact');
    for (const p of candidates(found.end,[0],found.controls).slice(0,24)) { stats.connectorTested++; prefer(replay(p.controls),'bounded-search-with-exact-connector'); }
    if (best?.gearChanges === 0) break;
  }
  return finish(stats.expanded>=maxNodes?'search-limit':'sampled-candidates-exhausted');
}
function loop(data) {
  check(data && pose(data.start) && Array.isArray(data.controls) && data.controls.length>0 && data.controls.length<=10000, '순환 경로를 확인하세요');
  let q = data.start.slice(), lengthMm = 0;
  const spans = data.controls.map(c=>{check(c && Number.isFinite(c.lengthMm) && c.lengthMm>0 && Number.isFinite(c.curvature) && (c.gear===undefined||c.gear===1),'순환 경로 제어값을 확인하세요');const span={start:q,s:lengthMm,lengthMm:c.lengthMm,curvature:c.curvature};q=M.advance(q,c.lengthMm,c.curvature);lengthMm+=c.lengthMm;return span;});
  check(same(q,data.start),'순환 경로의 위치와 방향이 닫혀야 합니다');
  const cycle = s => (s%lengthMm+lengthMm)%lengthMm;
  function at(s) { check(Number.isFinite(s),'순환 경로 거리를 확인하세요'); s=cycle(s);const c=spans.find(c=>s<c.s+c.lengthMm-1e-8)||spans.at(-1);return M.advance(c.start,s-c.s,c.curvature); }
  function nearest(p) {
    check(pose(p),'차량 자세를 확인하세요');let best;
    for(const c of spans){let t;if(!c.curvature)t=(p[0]-c.start[0])*Math.cos(c.start[2])+(p[1]-c.start[1])*Math.sin(c.start[2]);else{const k=c.curvature,cx=c.start[0]-Math.sin(c.start[2])/k,cy=c.start[1]+Math.cos(c.start[2])/k,h=Math.atan2(k*(p[0]-cx),-k*(p[1]-cy));t=(k>0?mod(h-c.start[2]):-mod(c.start[2]-h))/k;}
      for(const d of [0,Math.max(0,Math.min(c.lengthMm,t)),c.lengthMm]){const pose=M.advance(c.start,d,c.curvature),gap=distance(p,pose);if(!best||gap<best.distanceMm-.001||Math.abs(gap-best.distanceMm)<=.001&&Math.abs(wrap(p[2]-pose[2]))<Math.abs(wrap(p[2]-best.pose[2])))best={s:cycle(c.s+d),pose,distanceMm:gap};}}
    return best;
  }
  function between(a,b) {
    check(Number.isFinite(a)&&Number.isFinite(b),'순환 접속 거리를 확인하세요');let s=cycle(a),remaining=cycle(b-a);const controls=[];
    if(Math.min(remaining,lengthMm-remaining)<1e-6)return controls;
    while(remaining>1e-6){const c=spans.find(c=>s<c.s+c.lengthMm-1e-6)||spans[0],length=Math.min(remaining,c.s+c.lengthMm-s);check(length>0,'순환 구간 분할 오류');controls.push({gear:1,curvature:c.curvature,lengthMm:length});remaining-=length;s=cycle(s+length);if(lengthMm-s<1e-6)s=0;}
    check(same(end(at(a),controls),at(b)),'순환 구간의 접속 오차');return controls;
  }
  return {lengthMm,at,nearest,between};
}
module.exports = {search,loop};
