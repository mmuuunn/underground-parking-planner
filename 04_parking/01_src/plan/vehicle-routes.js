/* On-demand paths and planar body sampling for the drawing. This is not a
 * steering, reversing or passing simulation. No work runs during normal placement.
 */
(function(root){
  'use strict';
  const node=typeof module!=='undefined'&&module.exports,G=node?require('./CLAUDE_ugp_geom.js'):root.UGP.geom;
  const {CL,boolOp,areaOf,sub,len,mul,add}=G;
  const area=P=>Math.abs(areaOf(P));
  function clean(P){const out=[];for(const p of P||[]){if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))throw new RangeError('차량 경로의 좌표를 확인하세요');if(!out.length||len(sub(p,out[out.length-1]))>1)out.push(p.slice());}return out;}
  const TURN_WINDOW=4712,TURN_LIMIT=90.5;
  function turnIssue(P){
    const segs=[];let passed=0;
    for(let i=1;i<P.length;i++){const d=sub(P[i],P[i-1]),L=len(d);if(L>1)segs.push({a:P[i-1],u:mul(d,1/L),start:passed,end:passed+L});passed+=L;}
    let first=null;
    for(let i=0;i<segs.length;i++)for(let j=i+1;j<segs.length&&segs[j].start-segs[i].end<=TURN_WINDOW;j++){
      const angle=Math.acos(Math.max(-1,Math.min(1,G.dot(segs[i].u,segs[j].u))))*180/Math.PI;
      // The threshold is crossed at the later bend, not the first bend in the window.
      // Several starting segments can detect it; report the earliest actual crossing.
      if(angle>TURN_LIMIT&&(!first||segs[j].start<first.distanceMm))first={id:'VEHICLE_SHARP_TURN',at:segs[j].a.map(Math.round),angleDeg:Math.round(angle*10)/10,windowMm:TURN_WINDOW,distanceMm:segs[j].start,note:`경로 4.7m 안에서 진행 방향이 ${angle.toFixed(1)}° 바뀝니다 — 합류 방향과 직선 길이를 조정하세요`};
    }return first;
  }
  const space=plan=>({allowed:boolOp((plan.aisles||[]).concat(plan.ramp?[plan.ramp.body]:[]),[],CL.ClipType.ctUnion),blockers:(plan.columns||[]).concat((plan.cores||[]).map(c=>c.pts),(plan.occupants||[]).map(c=>c.pts))});
  // True when a length×width body centred on each point (along the local direction) stays in the lane.
  function bodiesFit(S,P,length=4600,width=1900){
    for(let i=0;i<P.length;i++){const d=sub(P[Math.min(i+1,P.length-1)],P[Math.max(i-1,0)]),L=len(d);if(!L)continue;
      const u=mul(d,1/L),n=[-u[1],u[0]],body=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>add(add(P[i],mul(u,a*length/2)),mul(n,b*width/2)));
      if(area(boolOp([body],S.allowed,CL.ClipType.ctDifference))>1e4||area(boolOp([body],S.blockers,CL.ClipType.ctIntersection))>1e4)return false;}
    return true;
  }
  function check(plan,points,options={}){
    const P=clean(points),length=options.lengthMm??4600,width=options.widthMm??1900,step=options.sampleMm??500;
    if(!(Number.isFinite(length)&&length>0&&Number.isFinite(width)&&width>0&&Number.isFinite(step)&&step>=100))throw new RangeError('차량 크기와 동선 확인 간격을 확인하세요');
    const total=P.reduce((s,p,i)=>s+(i?len(sub(p,P[i-1])):0),0),base={points:P,lengthMm:Math.round(total),vehicle:{lengthMm:length,widthMm:width},sampleMm:step,turnWindowMm:TURN_WINDOW,turnLimitDeg:TURN_LIMIT,scope:'planar-body-samples-and-turn-window'};
    if(P.length<2||total<length||plan.graph?.rootId==null)return {...base,state:'unconnected',stopDistanceMm:0,firstIssue:{id:'ROUTE_DISCONNECTED',at:P[0]||plan.ramp?.landing||null,note:'램프와 차로의 연결 및 경로 길이를 확인하세요'}};
    const {allowed,blockers}=space(plan);
    const reached=(plan.graph.edges||[]).filter(e=>e.ok&&e.reached),onRamp=p=>plan.ramp&&CL.Clipper.PointInPolygon({X:Math.round(p[0]),Y:Math.round(p[1])},G.toC(plan.ramp.body))!==0;
    const sharp=turnIssue(P),stopTurn=()=>({...base,state:'blocked',samples,stopDistanceMm:Math.max(0,Math.round(sharp.distanceMm-length/2-100)),firstIssue:sharp});
    let next=length/2,passed=0,samples=0;
    for(let i=1;i<P.length;i++){
      const d=sub(P[i],P[i-1]),L=len(d),u=mul(d,1/L),n=[-u[1],u[0]];
      while(next<=passed+L&&next<=total-length/2){
        if(sharp&&next+length/2>=sharp.distanceMm)return stopTurn();
        const at=add(P[i-1],mul(u,next-passed)),body=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>add(add(at,mul(u,a*length/2)),mul(n,b*width/2)).map(Math.round));samples++;
        if(plan.graph.edges?.length&&!onRamp(at)&&!reached.some(e=>G.segDist(at,plan.graph.nodes[e.a].p,plan.graph.nodes[e.b].p)<=plan.grid.aisleMm/2))return {...base,state:'blocked',samples,stopDistanceMm:Math.max(0,Math.round(next-step)),firstIssue:{id:'ROUTE_NOT_REACHED',at:at.map(Math.round),body,note:'이 구간은 램프에서 닿는 차로로 확인되지 않았습니다'}};
        const outside=area(boolOp([body],allowed,CL.ClipType.ctDifference)),hit=area(boolOp([body],blockers,CL.ClipType.ctIntersection));
        if(outside>1e4||hit>1e4)return {...base,state:'blocked',samples,stopDistanceMm:Math.max(0,Math.round(next-step)),firstIssue:{id:hit>1e4?'VEHICLE_HITS_OBJECT':'VEHICLE_OUTSIDE_LANE',at:at.map(Math.round),body,outsideAreaM2:outside/1e6,overlapAreaM2:hit/1e6,note:hit>1e4?'차량 몸체가 기둥·벽·점유물과 겹칩니다':'차량 몸체가 확인된 차로 폭을 벗어납니다'}};
        next+=step;
      }
      passed+=L;
    }
    if(sharp)return stopTurn();return {...base,state:'clear',samples,stopDistanceMm:Math.round(total),firstIssue:null};
  }
  // Keep right of travel by off(i) on leg i and meet neighbouring legs at their offset
  // lines. Parallel legs with different offsets change lane over SHIFT_MM instead of a jog.
  const SHIFT_MM=3000;
  function offsetLegs(P,off){
    const legs=[];for(let i=1;i<P.length;i++){const L=len(sub(P[i],P[i-1])),u=mul(sub(P[i],P[i-1]),1/L),n=[u[1],-u[0]],o=off(i-1);legs.push({a:add(P[i-1],mul(n,o)),b:add(P[i],mul(n,o)),u,L});}
    if(!legs.length)return P.slice();const out=[legs[0].a];
    for(let i=1;i<legs.length;i++){const p=legs[i-1],q=legs[i],den=p.u[0]*q.u[1]-p.u[1]*q.u[0];
      // Nearly parallel legs: a miter point would be ill-conditioned (it can land far behind).
      if(Math.abs(den)<0.02&&G.dot(p.u,q.u)>0){if(len(sub(q.a,p.b))<50)out.push(p.b);else out.push(add(p.b,mul(p.u,-Math.min(SHIFT_MM,p.L/2))),add(q.a,mul(q.u,Math.min(SHIFT_MM,q.L/2))));continue;}
      if(Math.abs(den)<0.02){out.push(p.b,q.a);continue;}
      const w=sub(q.a,p.a),t=(w[0]*q.u[1]-w[1]*q.u[0])/den;out.push(add(p.a,mul(p.u,t)));}
    out.push(legs.at(-1).b);return clean(out);
  }
  // Round each corner with the largest radius (TURN_R down to RADII's end) whose swept body
  // stays in the lane; legs limit it to half their length. If none fits, the largest is kept
  // so the body check reports the real conflict. A sharp corner with short legs keeps a tiny
  // radius, so the turn-window check still stops there.
  const TURN_R=6000,RADII=[6000,5000,4000,3000,2000];
  function fillet(P0,fits=()=>true){
    // A straight-through point (e.g. the landing on the ramp link) is not a corner and must not shorten the legs.
    const P=P0.filter((q,i)=>i===0||i===P0.length-1||G.dot(G.norm(sub(q,P0[i-1])),G.norm(sub(P0[i+1],q)))<Math.cos(0.02));
    const out=[P[0]];
    for(let i=1;i<P.length-1;i++){
      const p=P[i-1],q=P[i],r=P[i+1],l1=len(sub(q,p)),l2=len(sub(r,q)),u1=mul(sub(q,p),1/l1),u2=mul(sub(r,q),1/l2),th=Math.acos(Math.max(-1,Math.min(1,G.dot(u1,u2))));
      if(th<0.02||th>Math.PI-0.02){out.push(q);continue;}
      const cap=Math.min(l1,l2)/2/Math.tan(th/2),s=Math.sign(u1[0]*u2[1]-u1[1]*u2[0]),k=Math.max(4,Math.ceil(th/0.06));
      const arc=R=>{const T=R*Math.tan(th/2),a0=add(q,mul(u1,-T)),c=add(a0,mul([-u1[1]*s,u1[0]*s],R)),v=sub(a0,c),A=[];for(let j=0;j<=k;j++){const ang=s*th*j/k,cs=Math.cos(ang),sn=Math.sin(ang);A.push(add(c,[v[0]*cs-v[1]*sn,v[0]*sn+v[1]*cs]));}return A;};
      const tries=[...new Set(RADII.map(R=>Math.min(R,cap)))],pick=tries.map(arc).find(fits)||arc(tries[0]);
      out.push(...pick);
    }
    out.push(P.at(-1));return clean(out.map(p=>p.map(Math.round)));
  }
  // Centre-line route: ramp spine to the junction, then one lap of the unrounded ring from
  // that junction. Rounding happens after joining, so the turn at the junction is the real one.
  function lap(rings,at){
    let best=null;for(const P of rings||[])for(let i=0;i<P.length;i++){const d=G.segDist(at,P[i],P[(i+1)%P.length]);if(!best||d<best.d)best={P,i,d};}
    if(!best)return [];const {P,i}=best;return clean([at,...P.slice(i+1),...P.slice(0,i+1),at]);
  }
  // Path distance where the route first passes within `tol` of `at` (else at its nearest pass).
  function passAt(P,at,tol){
    let passed=0,best=null;
    for(let i=1;i<P.length;i++){const e=sub(P[i],P[i-1]),L=len(e);if(!L)continue;const f=Math.max(0,Math.min(1,G.dot(sub(at,P[i-1]),e)/(L*L))),d=len(sub(add(P[i-1],mul(e,f)),at)),s=passed+f*L;
      if(d<=tol)return s;if(!best||d<best.d)best={d,s};passed+=L;}
    return best?best.s:0;
  }
  function twoWayRoutes(plan,options){
    if(plan.ramp?.kind==='curve')throw new RangeError('왕복형 대표 경로는 현재 직선 램프 입력만 지원합니다');
    const graph=plan.graph||{},nodes=graph.nodes||[],rootId=graph.rootId,dist=new Map(),prev=new Map(),pending=new Set();
    if(rootId!=null){dist.set(rootId,0);pending.add(rootId);}
    while(pending.size){const id=[...pending].sort((a,b)=>dist.get(a)-dist.get(b)||a-b)[0];pending.delete(id);for(const e of graph.edges||[]){if(!e.ok||!e.reached||e.a!==id&&e.b!==id)continue;const next=e.a===id?e.b:e.a,d=dist.get(id)+len(sub(nodes[id].p,nodes[next].p));if(d<(dist.get(next)??Infinity)){dist.set(next,d);prev.set(next,id);pending.add(next);}}}
    let target=options.targetNodeId??[...dist.keys()].filter(i=>i!==rootId).sort((a,b)=>dist.get(b)-dist.get(a)||a-b)[0];
    if(options.targetNodeId!==undefined&&(!Number.isInteger(target)||!dist.has(target)||target===rootId))throw new RangeError('램프에서 연결된 목적 차로 점을 선택하세요');
    const ids=[];if(target!==undefined){for(let id=target;id!==undefined;id=prev.get(id))ids.unshift(id);}
    const centre=ids.length>1?clean([...(plan.ramp?.start?[plan.ramp.start]:[]),...(plan.ramp?.landing?[plan.ramp.landing]:[]),...ids.map(i=>nodes[i].p)]):[],offset=(plan.grid?.aisleMm||TURN_R)/4,S=space(plan),fits=P=>bodiesFit(S,P,options.lengthMm,options.widthMm);
    const path=P=>P.length>1?fillet(offsetLegs(P,()=>offset),fits):[],entry=path(centre),exit=path(centre.slice().reverse());
    const assess=(P,colorKey)=>{let v=check(plan,P,options);if(plan.ramp?.approach?.accepted===false&&v.state!=='unconnected')v={...v,state:'blocked',stopDistanceMm:0,firstIssue:{id:'RAMP_APPROACH',at:plan.ramp.landing,note:plan.ramp.approach.summary||'램프 합류 조건을 확인하세요'}};
      // A clear planar trip does not demonstrate the manoeuvre needed to start the return trip.
      if(v.state==='clear')v={...v,planarState:'clear',verifiedDistanceMm:v.stopDistanceMm,state:'unverified',stopDistanceMm:0,firstIssue:{id:'RETURN_MANEUVER_UNVERIFIED',at:nodes[target]?.p,note:'대표 경로의 평면 차체 검사는 확인했으나 끝에서 돌아 나오기·후진·교행은 검토 전입니다'}};return {colorKey,...v};};
    return {entry:assess(entry,'entry'),exit:assess(exit,'exit'),targetNodeId:target,trafficBasis:'two-way-network',roundTrip:'unverified',verification:'representative-planar-trips-only'};
  }
  function routes(plan,options={}){
    if(plan.report?.trafficMode==='two-way')return twoWayRoutes(plan,options);
    const C=plan.circulation||{},ramp=plan.ramp,source=ramp?.sourceRamp,o=(plan.grid?.aisleMm||TURN_R)/4;
    const spine=C.spine?.length>1?C.spine:[],ring=spine.length?lap(C.rings,spine.at(-1)):[];
    // The two-way ramp link keeps right by a/4; the proposed one-way ring is driven on its centre line,
    // as drawn. Offsets are applied before rounding so the junction turn is rounded as driven.
    const n=clean(spine).length-1,S=spine.length?space(plan):null,fits=A=>bodiesFit(S,A,options.lengthMm,options.widthMm);
    // Join a continuing ring leg on its centre line before rounding, so a lane-return jog cannot shorten the approach turn.
    const entryLaneEnd=n>1&&ring.length>1&&G.dot(G.norm(sub(spine.at(-1),spine.at(-2))),G.norm(sub(ring[1],ring[0])))>Math.cos(.02)?n-1:n;
    let entry=spine.length?fillet(offsetLegs(clean(spine.concat(ring.slice(1))),i=>i<entryLaneEnd?o:0),fits):[],exit=spine.length?fillet(offsetLegs(clean(ring.concat(spine.slice().reverse().slice(1))),i=>i>=ring.length-1?o:0),fits):[];
    if(source?.gradeLine?.length&&source.laneBandCenter?.length===source.gradeLine.length){
      const inner=source.gradeLine,outer=source.laneBandCenter.map((p,i)=>sub(mul(p,2),inner[i]));
      const incoming=source.turn==='left'?outer:inner,outgoing=source.turn==='left'?inner:outer;
      // The ramp's lane width and floor lane width differ slightly. Spread that
      // offset along the approach instead of inserting a 125 mm right-angle step.
      entry=incoming.slice(0,-1).concat(entry);exit=exit.concat(outgoing.slice().reverse().slice(1));
    }
    const incoming=clean(entry),outgoing=clean(exit);
    const ringTrip=P=>{const v=check(plan,P,options);if(plan.graph?.hasLoop&&v.state!=='unconnected')return v;const {samples,...base}=v;return {...base,state:'unconnected',stopDistanceMm:0,firstIssue:{id:'ROUTE_DISCONNECTED',at:v.points[0]||plan.ramp?.landing||null,note:'램프에서 순환 차로까지의 연결과 경로 길이를 확인하세요'}};};
    const result={entry:{colorKey:'entry',...ringTrip(incoming)},exit:{colorKey:'exit',...ringTrip(outgoing)},trafficBasis:'proposed-one-way-ring',verification:'planar-body-samples-and-turn-window'};
    // Landing restrictions precede traffic simulation; do not call a short merge clear.
    if(plan.ramp?.approach?.accepted===false)for(const key of ['entry','exit']){const v=result[key];if(v.state==='unconnected')continue;const at=plan.ramp.landing,issue={id:'RAMP_APPROACH',at,note:plan.ramp.approach.summary||'램프 합류 조건을 확인하세요'},distance=v.points.reduce((s,p,i)=>i?s+len(sub(p,v.points[i-1])):s,0);const atDistance=passAt(v.points,at,(plan.grid?.aisleMm||TURN_R)/2);if(v.state==='clear'||atDistance<=v.stopDistanceMm)result[key]={...v,state:'blocked',stopDistanceMm:Math.max(0,Math.min(distance,atDistance-v.vehicle.lengthMm/2)),firstIssue:issue};}
    return result;
  }
  const api={check,routes};if(node)module.exports=api;else(root.UGP=root.UGP||{}).vehicleRoutes=api;
})(this);
