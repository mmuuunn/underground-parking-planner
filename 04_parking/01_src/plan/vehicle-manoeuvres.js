/* Explicit low-speed car checks. Witnesses are conditional on the stated vehicle;
 * a bounded search failure never proves that a manoeuvre is impossible. */
(function(root){'use strict';
 const node=typeof module!=='undefined'&&module.exports,G=node?require('./CLAUDE_ugp_geom.js'):root.UGP.geom;
 const {CL,boolOp,add,sub,mul,dot,len,bbox}=G,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
 function vehicle(options={}){
  const v={lengthMm:4600,widthMm:1900,wheelbaseMm:2700,rearOverhangMm:900,minRadiusMm:4500,clearanceMm:200,sampleMm:100,...options};
  for(const k of Object.keys(v))if(!Number.isFinite(v[k]))throw RangeError('차량 조건은 유한한 숫자여야 합니다.');
  if(v.lengthMm<2000||v.lengthMm>15000||v.widthMm<1000||v.widthMm>3000||v.wheelbaseMm<1000||v.rearOverhangMm<0||v.wheelbaseMm+v.rearOverhangMm>=v.lengthMm||v.minRadiusMm<v.wheelbaseMm||v.clearanceMm<0||v.clearanceMm>1000||v.sampleMm<25||v.sampleMm>100)throw RangeError('차량 크기·축간·회전반경·여유 또는 검사 간격을 확인하세요.');
  const reach=Math.hypot(Math.max(v.lengthMm-v.rearOverhangMm,v.rearOverhangMm)+v.clearanceMm,v.widthMm/2+v.clearanceMm);
  // A corner moves at most (1 + reach/radius) times rear-axle travel. This guard
  // covers all motion between samples, plus integer geometry rounding.
  return {...v,sweepGuardMm:Math.ceil(v.sampleMm/2*(1+reach/v.minRadiusMm))+2,maxSteerDeg:Math.atan(v.wheelbaseMm/v.minRadiusMm)*180/Math.PI};
 }
 function body(q,v,guard=true){const margin=v.clearanceMm+(guard?v.sweepGuardMm:0),c=Math.cos(q[2]),s=Math.sin(q[2]);return [[-v.rearOverhangMm-margin,-v.widthMm/2-margin],[v.lengthMm-v.rearOverhangMm+margin,-v.widthMm/2-margin],[v.lengthMm-v.rearOverhangMm+margin,v.widthMm/2+margin],[-v.rearOverhangMm-margin,v.widthMm/2+margin]].map(([x,y])=>[q[0]+c*x-s*y,q[1]+s*x+c*y]);}
 function advance(q,s,k){const t=q[2]+s*k;return Math.abs(k)<1e-12?[q[0]+s*Math.cos(q[2]),q[1]+s*Math.sin(q[2]),q[2]]:[q[0]+(Math.sin(t)-Math.sin(q[2]))/k,q[1]+(Math.cos(q[2])-Math.cos(t))/k,wrap(t)];}
 function polygons(paths){if(!Array.isArray(paths)||paths.some(P=>!Array.isArray(P)||P.length<3||P.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))))throw RangeError('차량 검사 도형을 확인하세요.');return paths;}
 function createSpace(plan){
  const lanes=polygons(plan.aisles||[]),floor=plan.parkingInnerPaths||[plan.innerOutline].filter(Boolean),ramps=(plan.ramp?.body?[plan.ramp.body]:[]).concat((plan.parkingReservations||[]).filter(r=>r.kind==='ramp-access').map(r=>r.pts));
  let allowed=floor.length?boolOp(lanes,polygons(floor),CL.ClipType.ctIntersection):boolOp(lanes,[],CL.ClipType.ctUnion);
  if(ramps.length)allowed=boolOp(allowed,ramps,CL.ClipType.ctDifference);
  const blockers=polygons((plan.columns||[]).concat((plan.cores||[]).map(c=>c.pts),(plan.occupants||[]).map(c=>c.pts),(plan.stalls||[]).map(s=>s.pts),(plan.nonParkingZones||[]).flatMap(z=>z.paths||[]),(plan.parkingReservations||[]).filter(r=>r.kind!=='ramp-access').map(r=>r.pts)));
  const free=boolOp(allowed,blockers,CL.ClipType.ctDifference),paths=free.map(P=>({P:G.toC(P),b:bbox(P)})),edges=free.flatMap(P=>P.map((a,i)=>{const b=P[(i+1)%P.length];return {a,b,box:bbox([a,b])};}));
  return {free,paths,edges,allowed,blockers};
 }
 function poseFits(S,q,v){
  if(!Array.isArray(q)||q.length<3||!q.slice(0,3).every(Number.isFinite))return false;
  const P=body(q,v),b=bbox(P);for(const p of P){let inside=false;for(const path of S.paths){const a=path.b;if(p[0]<a[0]||p[0]>a[2]||p[1]<a[1]||p[1]>a[3])continue;const n=CL.Clipper.PointInPolygon({X:Math.round(p[0]),Y:Math.round(p[1])},path.P);if(n===-1)return false;if(n===1)inside=!inside;}if(!inside)return false;}
  const c=Math.cos(q[2]),s=Math.sin(q[2]),local=p=>{const x=p[0]-q[0],y=p[1]-q[1];return [c*x+s*y,-s*x+c*y];},m=v.clearanceMm+v.sweepGuardMm,r=[-v.rearOverhangMm-m,-v.widthMm/2-m,v.lengthMm-v.rearOverhangMm+m,v.widthMm/2+m];
  for(const e of S.edges){if(e.box[2]<b[0]||e.box[0]>b[2]||e.box[3]<b[1]||e.box[1]>b[3])continue;if(G.clipSeg(local(e.a),local(e.b),r))return false;}return true;
 }
 function motion(S,q,gear,k,length,v,collect=false){
  if(![1,-1].includes(gear)||!Number.isFinite(k)||Math.abs(k)>1/v.minRadiusMm+1e-12||!Number.isFinite(length)||length<0)throw RangeError('전후진 방향·곡률·이동 거리를 확인하세요.');
  const n=Math.max(1,Math.ceil(length/v.sampleMm)),poses=[];for(let i=0;i<=n;i++){const at=advance(q,gear*length*i/n,k);if(!poseFits(S,at,v))return {ok:false,at,body:body(at,v)};if(collect)poses.push([...at,gear,k]);}return {ok:true,q:advance(q,gear*length,k),poses};
 }
 class Heap{constructor(){this.a=[];}push(v){let i=this.a.length;this.a.push(v);while(i){const p=(i-1)>>1;if(this.a[p].f<=v.f)break;this.a[i]=this.a[p];i=p;}this.a[i]=v;}pop(){const top=this.a[0],v=this.a.pop();if(this.a.length){let i=0;while(i*2+1<this.a.length){let j=i*2+1;if(j+1<this.a.length&&this.a[j+1].f<this.a[j].f)j++;if(this.a[j].f>=v.f)break;this.a[i]=this.a[j];i=j;}this.a[i]=v;}return top;}get size(){return this.a.length;}}
 function witness(S,last,v,expanded){const controls=[];for(let n=last;n.parent;n=n.parent)controls.unshift({gear:n.gear,curvature:n.k,lengthMm:n.step});let root=last;while(root.parent)root=root.parent;let q=root.q;const poses=[];for(const a of controls){const part=motion(S,q,a.gear,a.curvature,a.lengthMm,v,true);if(!part.ok)throw Error('검색 경로 재검사에 실패했습니다.');poses.push(...part.poses);q=part.q;}return {state:'path-found',poses,controls,gearChanges:last.changes,lengthMm:controls.reduce((s,c)=>s+c.lengthMm,0),expanded,end:q};}
 function search(S,start,goal,v,options={}){
  const maxNodes=options.maxNodes??5000,reverseOnly=options.reverseOnly===true,step=600,radius=options.radiusMm??8000;
  if(!Number.isInteger(maxNodes)||maxNodes<1||maxNodes>30000||!Number.isFinite(radius)||radius<1000||radius>100000||![0,1,-1].includes(options.initialGear??0)||![0,1,-1].includes(options.finalGear??0))throw RangeError('차량 탐색 범위를 확인하세요.');
  if(!poseFits(S,start,v))return {state:'blocked-pose',at:start,body:body(start,v),reason:'start-pose'};
  const h=q=>Math.max(distance(q,goal),v.minRadiusMm*Math.abs(wrap(q[2]-goal[2]))),key=(q,g,c)=>[Math.round(q[0]/200),Math.round(q[1]/200),Math.round(wrap(q[2])/(Math.PI/24)),g,c].join(','),open=new Heap(),best=new Map();
  open.push({q:start.slice(),g:0,f:h(start),gear:options.initialGear??0,changes:0});let expanded=0;
  while(open.size&&expanded<maxNodes){const n=open.pop(),id=key(n.q,n.gear,n.changes);if((best.get(id)??Infinity)<n.g)continue;expanded++;
   if(distance(n.q,goal)<=700&&Math.abs(wrap(n.q[2]-goal[2]))<=5*Math.PI/180&&n.parent&&(!options.finalGear||n.gear===options.finalGear))return witness(S,n,v,expanded);
   for(const gear of reverseOnly?[-1]:[1,-1])for(const k of [-1/v.minRadiusMm,0,1/v.minRadiusMm]){const changes=n.changes+(n.gear&&n.gear!==gear?1:0);if(changes>4)continue;const q=advance(n.q,gear*step,k);if(distance(q,start)>radius&&distance(q,goal)>radius)continue;const cost=n.g+step*(gear<0?1.1:1)+(changes>n.changes?1400:0),id=key(q,gear,changes);if(cost>=(best.get(id)??Infinity))continue;const part=motion(S,n.q,gear,k,step,v);if(!part.ok)continue;best.set(id,cost);open.push({q:part.q,g:cost,f:cost+1.7*h(part.q),gear,k,step,changes,parent:n});}
  }return {state:'not-found',reason:open.size?'search-limit':'sampled-controls-exhausted',expanded,maxNodes};
 }
 const contains=(p,P)=>CL.Clipper.PointInPolygon({X:Math.round(p[0]),Y:Math.round(p[1])},G.toC(P))!==0;
 function endpoints(plan){const g=plan.graph||{},nodes=g.nodes||[],near=nodes.map(()=>[]);for(const e of g.edges||[])if(e.ok&&e.reached){near[e.a].push(e.b);near[e.b].push(e.a);}const ends=[],portals=[];
  for(let id=0;id<nodes.length;id++){if(id===g.rootId||near[id].length!==1)continue;const at=nodes[id].p;if((plan.parkingReservations||[]).some(r=>r.kind==='ramp-access'&&contains(at,r.pts))){portals.push({nodeId:id,at,state:'not-evaluated',note:'아래층 램프 접속부 · 층간 통행 별도'});continue;}const ids=[id];let previous=id,current=near[id][0];while(near[current].length===2&&current!==g.rootId){ids.push(current);const next=near[current].find(i=>i!==previous);previous=current;current=next;}ids.push(current);ends.push({nodeId:id,at,junctionId:current,points:ids.map(i=>nodes[i].p)});
  }return {ends,portals};
 }
 function rejoin(S,plan,end,reverse,v,options){
  if(reverse.state!=='path-found')return {state:'not-evaluated',reason:'reverse-not-confirmed'};
  const g=plan.graph,dist=new Map([[g.rootId,0]]),prev=new Map(),pending=new Set([g.rootId]);while(pending.size){const id=[...pending].sort((a,b)=>dist.get(a)-dist.get(b))[0];pending.delete(id);for(const e of g.edges){if(!e.ok||!e.reached||e.a!==id&&e.b!==id)continue;const next=e.a===id?e.b:e.a,d=dist.get(id)+distance(g.nodes[id].p,g.nodes[next].p);if(d<(dist.get(next)??Infinity)){dist.set(next,d);prev.set(next,id);pending.add(next);}}}
  const P=[g.nodes[end.junctionId].p];for(let id=end.junctionId;prev.has(id)&&P.length<64;){id=prev.get(id);P.push(g.nodes[id].p);}
  let remaining=6000,goal;for(let i=1;i<P.length;i++){const d=sub(P[i],P[i-1]),L=len(d),u=mul(d,1/L);if(L>=remaining){goal=[...add(P[i-1],mul(u,remaining)),Math.atan2(u[1],u[0])];break;}remaining-=L;}
  if(!goal)return {state:'not-evaluated',reason:'root-connection-too-close'};
  const turn=search(S,reverse.end,goal,v,{...options,initialGear:-1,finalGear:1});if(turn.state!=='path-found')return {...turn,at:g.nodes[end.junctionId].p,partialPoses:reverse.poses};
  return {...turn,poses:reverse.poses.concat(turn.poses),controls:reverse.controls.concat(turn.controls),lengthMm:reverse.lengthMm+turn.lengthMm,at:g.nodes[end.junctionId].p};
 }
 function endReview(S,plan,end,v,options){
  const P=end.points,u=G.norm(sub(P[0],P[1])),theta=Math.atan2(u[1],u[0]),length=distance(P[0],P[1]),back=v.lengthMm-v.rearOverhangMm+v.clearanceMm+v.sweepGuardMm+100;
  if(length<back+600)return {...end,turn:{state:'not-evaluated',reason:'short-end-segment'},reverse:{state:'not-evaluated',reason:'short-end-segment'},rejoin:{state:'not-evaluated',reason:'short-end-segment'}};
  const start=[...add(P[0],mul(u,-back)),theta],goal=[start[0],start[1],wrap(theta+Math.PI)],last=P.at(-1),towardsEnd=G.norm(sub(P.at(-2),last)),reverseGoal=[...last,Math.atan2(towardsEnd[1],towardsEnd[0])];
  const turn=search(S,start,goal,v,options);let reverse;
  const d=sub(reverseGoal,start),straight=Math.abs(d[0]*u[1]-d[1]*u[0])<1&&Math.abs(wrap(reverseGoal[2]-theta))<.001;
  if(straight){const part=motion(S,start,-1,0,len(d),v,true);reverse=part.ok?{state:'path-found',poses:part.poses,controls:[{gear:-1,curvature:0,lengthMm:len(d)}],gearChanges:0,lengthMm:len(d),end:part.q}:{state:'blocked-pose',at:part.at,body:part.body,reason:'reverse-body-conflict'};}
  else reverse=search(S,start,reverseGoal,v,{...options,reverseOnly:true,radiusMm:Math.max(8000,distance(start,reverseGoal)+3000)});
  return {...end,start,turn,reverse,rejoin:rejoin(S,plan,end,reverse,v,options)};
 }
 function crossWidth(S,p,u,limit){const n=[-u[1],u[0]],paths=S.free.map(P=>P.map(q=>{const d=sub(q,p);return [dot(d,n),dot(d,u)];}));return G.hSpans(paths,0).map(([a,b])=>Math.max(0,Math.min(b,limit)-Math.max(a,-limit))).reduce((sum,width)=>sum+width,0);}
 function passing(S,plan,e,v){
  const a=plan.graph.nodes[e.a].p,b=plan.graph.nodes[e.b].p,L=distance(a,b),u=mul(sub(b,a),1/L),n=[-u[1],u[0]],theta=Math.atan2(u[1],u[0]),trim=v.lengthMm/2+v.clearanceMm+v.sweepGuardMm+100;
  const base={edgeId:e.id,at:mul(add(a,b),.5),points:[a,b],requiredWidthMm:2*(v.widthMm+2*v.clearanceMm)};
  if((plan.parkingReservations||[]).some(r=>r.kind==='ramp-access'&&(contains(a,r.pts)||contains(b,r.pts))))return {...base,state:'not-evaluated',reason:'ramp-portal'};
  if(L<=2*trim)return {...base,state:'not-evaluated',reason:'short-connection'};
  let minimum=Infinity,bottleneck=null;for(let s=trim;s<=L-trim;s+=Math.min(500,L-2*trim)){const at=add(a,mul(u,s)),width=crossWidth(S,at,u,(plan.grid.aisleMm||6000)/2);if(width<minimum){minimum=width;bottleneck=at;}}
  const start=add(a,mul(u,trim)),end=add(a,mul(u,L-trim)),centreOffset=v.lengthMm/2-v.rearOverhangMm,offset=(plan.grid.aisleMm||6000)/4,posesFor=(at,direction,shift,d)=>{const centre=add(at,mul(n,shift+direction*d));return [...add(centre,mul(u,-direction*centreOffset)),wrap(theta+(direction<0?Math.PI:0))];};
  for(const shift of [0,-300,300])for(const d of [offset,offset+250,offset-250]){const q1=posesFor(start,1,shift,d),q2=posesFor(end,-1,shift,d);if(2*d<v.widthMm+2*(v.clearanceMm+v.sweepGuardMm))continue;const A=motion(S,q1,1,0,L-2*trim,v,true),B=motion(S,q2,1,0,L-2*trim,v,true);if(A.ok&&B.ok)return {...base,state:'path-found',minimumWidthMm:minimum,tracks:[A.poses,B.poses],offsetMm:d,centreShiftMm:shift};}
  return {...base,state:minimum<base.requiredWidthMm?'width-shortage':'not-found',minimumWidthMm:minimum,at:bottleneck,reason:minimum<base.requiredWidthMm?'two-car-clearance':'tested-parallel-tracks'};
 }
 function inspect(plan,options={}){
  if(!plan?.graph||!Array.isArray(plan.graph.nodes)||!Array.isArray(plan.graph.edges)||plan.graph.nodes.some(n=>!Array.isArray(n.p)||n.p.length!==2||!n.p.every(Number.isFinite))||plan.graph.edges.some(e=>!Number.isInteger(e.a)||!Number.isInteger(e.b)||!plan.graph.nodes[e.a]||!plan.graph.nodes[e.b]))throw RangeError('검사할 차로 연결망을 확인하세요.');
  const v=vehicle(options.vehicle),S=createSpace(plan),parts=endpoints(plan),ends=parts.ends.slice(0,16).map(end=>endReview(S,plan,end,v,{maxNodes:options.maxNodes??5000})),passings=plan.graph.edges.filter(e=>e.ok&&e.reached).slice(0,256).map(e=>passing(S,plan,e,v));
  return {schema:'vehicle-manoeuvres/1',vehicle:v,ends,portals:parts.portals,passings,summary:{turnFound:ends.filter(e=>e.turn.state==='path-found').length,reverseFound:ends.filter(e=>e.reverse.state==='path-found').length,rejoinFound:ends.filter(e=>e.rejoin.state==='path-found').length,endCount:ends.length,passingFound:passings.filter(e=>e.state==='path-found').length,passingShortage:passings.filter(e=>e.state==='width-shortage').length,passingUnverified:passings.filter(e=>!['path-found','width-shortage'].includes(e.state)).length},limits:{searchNodesPerAttempt:options.maxNodes??5000,localTurnRadiusMm:8000,maxGearChanges:4,positionToleranceMm:700,headingToleranceDeg:5,positionGridMm:200,primitiveLengthMm:600,unexaminedEnds:Math.max(0,parts.ends.length-16),unexaminedEdges:Math.max(0,plan.graph.edges.filter(e=>e.ok&&e.reached).length-256),scope:'low-speed-flat-floor; local turning; reverse to junction and rootward rejoin; straight parallel passing',excluded:'intersection simultaneous turns; individual stall access; grades; steering-rate/dynamics; driver errors; structural/legal approval'},source:'https://msl.cs.uiuc.edu/planning/node658.html'};
 }
 function parking(plan,index){
  if(!Number.isInteger(index)||!plan?.stalls?.[index])throw RangeError('주차칸을 선택하세요.');
  const stall=plan.stalls[index],P=polygons([stall.pts])[0],v=vehicle({clearanceMm:100}),centre=mul(P.reduce((s,p)=>add(s,p),[0,0]),1/P.length),edges=P.map((a,i)=>{const b=P[(i+1)%P.length],f=mul(add(a,b),.5),inward=G.norm(sub(centre,f)),width=distance(a,b);return {a,b,f,inward,width};}).sort((a,b)=>a.width-b.width),fronts=edges.filter(e=>e.width<=edges[0].width+1&&plan.aisles.some(A=>contains(add(e.f,mul(e.inward,-300)),A)));
  // shortcut: adjacent-aisle reverse parking only; add a checked ramp journey separately.
  const base={schema:'parking-playback/1',index,vehicle:v,scope:'adjacent-aisle reverse entry and forward exit; other bays occupied',state:'not-found',reason:'tested-arcs-blocked'};
  if(!fronts.length)return {...base,reason:'no-adjacent-aisle'};
  for(const e of fronts){
   const depth=distance(e.f,centre)*2,accessible=stall.stallType==='accessible',usable=accessible?e.width-800:e.width,t=G.norm(sub(e.b,e.a)),f=accessible?add(e.f,mul(t,-400)):e.f,n=e.inward,out=mul(n,-1),theta=Math.atan2(out[1],out[0]),bay=[add(f,mul(t,-usable/2)),add(f,mul(t,usable/2)),add(add(f,mul(t,usable/2)),mul(n,depth)),add(add(f,mul(t,-usable/2)),mul(n,depth))];
   if(usable<v.widthMm+2*(v.clearanceMm+v.sweepGuardMm)||depth<v.lengthMm+2*(v.clearanceMm+v.sweepGuardMm))continue;
   const S=createSpace({...plan,aisles:plan.aisles.concat([bay]),stalls:plan.stalls.filter((s,i)=>i!==index)}),goal=[...add(f,mul(n,depth/2+v.lengthMm/2-v.rearOverhangMm)),theta];
   for(const R of [4500,5000,5500,6000])for(const d of [-500,-200,0,200,400,600,800,1000,1200,1400,1600,1800,2000,2200,2400,2600,2800,3000])for(const side of [-1,1]){
    const k=side/R,corner=[...add(f,mul(n,d)),theta],start=advance(corner,Math.PI*R/2,k),a=motion(S,start,-1,k,Math.PI*R/2,v,true);if(!a.ok)continue;
    const b=motion(S,a.q,-1,0,distance(corner,goal),v,true);if(!b.ok)continue;
    const c=motion(S,b.q,1,0,distance(corner,goal),v,true),h=c.ok&&motion(S,c.q,1,k,Math.PI*R/2,v,true);if(!h?.ok)continue;
    const entry=a.poses.concat(b.poses),exit=c.poses.concat(h.poses);return {...base,state:'path-found',reason:null,front:f,bay,entry,exit,poses:entry.concat(exit),lengthMm:Math.PI*R+2*distance(corner,goal)};
   }
   for(const side of [-1,1]){
    const target=[...add(add(f,mul(out,3000)),mul(t,side*4500)),wrap(theta+side*Math.PI/2)],exit=search(S,goal,target,v,{maxNodes:2000,initialGear:1,finalGear:1});if(exit.state!=='path-found')continue;
    let q=exit.end,entry=[];for(const control of exit.controls.slice().reverse()){const part=motion(S,q,-control.gear,control.curvature,control.lengthMm,v,true);if(!part.ok){entry=[];break;}entry.push(...part.poses);q=part.q;}
    if(entry.length)return {...base,state:'path-found',reason:null,front:f,bay,entry,exit:exit.poses,poses:entry.concat(exit.poses),lengthMm:exit.lengthMm*2,gearChanges:exit.gearChanges};
   }
  }return base;
 }
 const api={vehicle,body,advance,createSpace,poseFits,motion,search,inspect,parking};if(node)module.exports=api;else(root.UGP=root.UGP||{}).vehicleManoeuvres=api;
})(this);
