'use strict';
// Experimental search only. Existing product generators, inputs and acceptance rules are never edited.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const base=path.join(__dirname,'../04_parking/01_src/plan');
const E=require(path.join(base,'CLAUDE_ugp_plan.js')),G=require(path.join(base,'CLAUDE_ugp_geom.js'));
const Grid=require(path.join(base,'CLAUDE_ugp_grid.js')),Net=require(path.join(base,'CLAUDE_ugp_network.js'));
const V=require(path.join(base,'CLAUDE_ugp_verify.js')),H=require(path.join(base,'aisle-depth-hypothesis.js'));
const Routes=require(path.join(base,'vehicle-routes.js')),M=require(path.join(base,'vehicle-manoeuvres.js'));
const OUT=path.resolve(process.env.DEPTH_LAB_DIR||'C:/Users/seok2/.codex/visualizations/2026/11/02/01a19d26-097b-7e02-9981-0add2515568c/depth-layout-lab');
const R=(a,b,c,d)=>G.rectPoly([a,b,c,d]),A=Ps=>Math.abs(G.areaOf(Ps));
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const intersect=(P,Q)=>A(G.boolOp(P,Q,G.CL.ClipType.ctIntersection));
const unique=xs=>[...new Set(xs.map(Math.round))].sort((a,b)=>a-b);
function scenes(){
 const make=(id,title,mass,cores=[])=>({id,title,basis:'synthetic controlled fixture; not an approved structural design',input:{
  mass,cores,ucs:0,phase:[0,0],allowExternalRamp:true,autoZones:false,trafficMode:'two-way',occupantPolicy:'report',
  aisleSurfaceMode:'network',obstacleClearance:'euclidean',stallRowSelection:'continuous',stallRowAlignment:'back-to-back',
  grid:{gx:8100,gy:8000,stallW:2500,stallD:5000,columnMm:600,wallMm:400,
   columnAxes:{x:[4000,12100,20200,28300,36400,44500],y:[4000,12000,20000,28000,36000,44000]}},
  ramp:E.createStraightRamp({landing:[400,8400],tangent:[1,0],widthMm:6000,lengthMm:24000}),floorMm:3800}});
 const rectangle=R(0,0,49400,50000),small=make('hall','작은 홀 · 양쪽 외곽측',R(0,0,49400,20800));small.input.grid.columnAxes.y=[4000,12000,20000];
 return [small,make('regular','정형 · 다중 차로',rectangle),
  make('core','정형 · 고정 코어',rectangle,[{id:'fixed-core',c:[28300,24400],w:6500,d:7000,keep:{x:true,y:true}}]),
  make('notch','ㄱ자 · 꺾인 외곽',[[0,0],[49400,0],[49400,32000],[33000,32000],[33000,50000],[0,50000]]),
  make('slope','사선 외벽 · 가변 깊이',[[0,0],[49400,0],[49400,46000],[0,50000]]),
  make('landing-block','고정 코어 · 램프 앞 차단',rectangle,[{id:'landing-core',c:[3900,8400],w:6500,d:6500,keep:{x:true,y:true}}])];
}
function premise(input){
 const F=Grid.frame(input),axes=input.grid.columnAxes,h=input.grid.columnMm/2,inside=[],outside=[],partial=[];
 for(const x of axes.x)for(const y of axes.y){const P=R(x-h,y-h,x+h,y+h),area=intersect([P],[F.inner]);
  (area<1?outside:area>=4*h*h-1?inside:partial).push({x,y,pts:P});}
 const spacings={x:axes.x.slice(1).map((v,i)=>v-axes.x[i]),y:axes.y.slice(1).map((v,i)=>v-axes.y[i])};
 return {expectedColumns:inside.map(c=>c.pts.map(p=>F.W(p).map(Math.round))),inside:inside.length,outside:outside.length,partial,spacings,
  omitted:input.grid.columnIntersections||[],allIntersections:axes.x.length*axes.y.length,
  regularModule:spacings.x.every(x=>x===8100)&&spacings.y.every(y=>y===8000),status:partial.length?'INVALID_PARTIAL_COLUMN':'CONTROLLED_ASSUMPTION'};
}
function normalize(routes){
 const segs=routes.filter(P=>P.length>1).flatMap(P=>P.slice(1).map((b,i)=>({a:P[i],b,kind:'spur'})).filter(s=>G.len(G.sub(s.b,s.a))>=30));
 const g=Net.buildGraph(segs),seen=new Set(),out=[];
 for(const e of g.edges){const ends=[g.nodes[e.a].p,g.nodes[e.b].p].sort((a,b)=>a[0]-b[0]||a[1]-b[1]),k=JSON.stringify(ends);if(!seen.has(k)){seen.add(k);out.push({points:ends});}}
 return out.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
function candidates(input){
 const F=Grid.frame(input),b=F.b,axes=input.grid.columnAxes,a=F.a,d=F.d,pool=new Map();
 const emit=(family,orientation,rows,left,right,loop)=>{
  if(!rows.length||right-left<a||rows.length>6)return;
  const W=([s,t])=>orientation?[t,s]:[s,t],landing=orientation?[input.ramp.landing[1],input.ramp.landing[0]]:input.ramp.landing;
  const paths=rows.map(t=>[W([left,t]),W([right,t])]),lo=Math.min(...rows),hi=Math.max(...rows);
  if(hi>lo){paths.push([W([left,lo]),W([left,hi])]);if(loop)paths.push([W([right,lo]),W([right,hi])]);}
  if(!orientation){paths.push([input.ramp.landing,W([left,landing[1]]),W([left,lo])]);}
  else{const t=Math.min(...rows);paths.push([input.ramp.landing,W([landing[0],t]),W([left,t])]);}
  const routes=normalize(paths);if(!routes.length||routes.length>128)return;const k=hash(routes);
  if(pool.has(k)){if(!pool.get(k).families.includes(family))pool.get(k).families.push(family);return;}
  pool.set(k,{id:'N'+(pool.size+1),families:[family],orientation:orientation?'vertical':'horizontal',rows,connectors:[left,right],topology:loop?'ladder-loop':'one-side-tree',routes});
 };
 for(const orientation of [0,1]){
  const run=orientation?1:0,dep=1-run,runAxes=axes[run?'y':'x'],depAxes=axes[dep?'y':'x'];
  const mids=unique(depAxes.slice(1).map((v,i)=>(v+depAxes[i])/2)).filter(t=>t>b[dep]+a/2&&t<b[dep+2]-a/2);
  const spanMids=runAxes.slice(1).map((v,i)=>(v+runAxes[i])/2),connections=[[spanMids[0],spanMids.at(-1)]];
  const wallPair=[b[run]+d+a/2,b[run+2]-d-a/2];connections.push(wallPair);
  for(let stride=1;stride<=3;stride++)for(let phase=0;phase<stride;phase++){
   const rows=mids.filter((_,i)=>i%stride===phase);
   for(const pair of connections)for(const loop of [false,true])emit('structure',orientation,rows,...pair,loop);
  }
  // 16m here is a parking-array repeat (5+6+5), never a structural span.
  for(const reverse of [false,true])for(const extra of [0,1000,2500,4500]){
   const rows=[],start=reverse?b[dep+2]-d-a/2-extra:b[dep]+d+a/2+extra;
   for(let t=start;reverse?t>=b[dep]+a/2:t<=b[dep+2]-a/2;t+=(reverse?-1:1)*(2*d+a))rows.push(t);
   rows.sort((a,b)=>a-b);
   for(const pair of connections)for(const loop of [false,true])emit('hypothesis',orientation,rows,...pair,loop);
  }
  // One-aisle halls are explicit alternatives, not discarded for falling outside the two named classes.
  for(const t of unique([b[dep]+d+a/2,(b[dep]+b[dep+2])/2,b[dep+2]-d-a/2]))
   emit('hall-control',orientation,[t],...wallPair,false);
 }
 return [...pool.values()];
}
function continuity(plan){
 const groups=new Map();for(const s of plan.stalls){const edges=s.pts.map((p,i)=>[p,s.pts[(i+1)%s.pts.length]]).sort((a,b)=>G.len(G.sub(a[1],a[0]))-G.len(G.sub(b[1],b[0])));
  const u=G.norm(G.sub(edges[0][1],edges[0][0]));if(u[0]<-.0001||Math.abs(u[0])<.0001&&u[1]<0){u[0]*=-1;u[1]*=-1;}
  const n=[-u[1],u[0]],c=s.pts.reduce((a,p)=>G.add(a,G.mul(p,.25)),[0,0]),key=Math.round(Math.atan2(u[1],u[0])*1800/Math.PI)+':'+Math.round(G.dot(c,n)/10),ps=s.pts.map(p=>G.dot(p,u));
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push([Math.min(...ps),Math.max(...ps)]);
 }
 const runs=[];for(const ps of groups.values()){ps.sort((a,b)=>a[0]-b[0]);let n=0,last=-Infinity;for(const[a,b]of ps){if(a>last+5){if(n)runs.push(n);n=0;}n++;last=Math.max(last,b);}if(n)runs.push(n);}
 return {longest:Math.max(0,...runs),runs:runs.length,score:runs.reduce((n,k)=>n+k*k,0)};
}
function evaluate(input,candidate,basis=premise(input)){
 const inputHash=hash(input),plan=E.generateConnected(input,candidate.routes),report=V.check(plan,input);
 const columnSame=hash(plan.columns.map(G.bbox).sort())===hash(basis.expectedColumns.map(G.bbox).sort());
 const staticBlocks=plan.columns.concat(plan.cores.map(c=>c.pts),plan.ramp?[plan.ramp.body]:[]);
 const rawBands=candidate.routes.map(({points:[a,b]})=>{const n=G.mul(G.norm([a[1]-b[1],b[0]-a[0]]),plan.grid.aisleMm/2);return [G.add(a,n),G.add(b,n),G.sub(b,n),G.sub(a,n)];});
 const rawColumnM2=intersect(rawBands,plan.columns)/1e6;
 const physicalM2=intersect(plan.aisles,staticBlocks)/1e6;
 const bad=new Set(plan.violations.map(v=>v.id));
 const routes=Routes.routes(plan),routeStates=[routes.entry?.state,routes.exit?.state];
 const eligible=columnSame&&!basis.partial.length&&rawColumnM2<=.01&&physicalM2<=.01&&
  !['LANDING','RAMP_OUTSIDE','RAMP_DISCONNECTED','FLOOR_OUTSIDE_ALLOWED','INNER_OUTSIDE','AISLE_OUTSIDE','AISLE_UNDER_CORE','EDGE_OFF_AISLE','CORE_IN_AISLE','COLUMN_IN_AISLE','FIXED_COLUMN_BLOCKS_ROUTE'].some(k=>bad.has(k))&&
  !routeStates.some(s=>['blocked','unconnected'].includes(s))&&
  report.counts.clash===0&&report.counts.noFront===0&&report.counts.unreachable===0&&plan.stallCount>0;
 if(hash(input)!==inputHash)throw Error('Input mutated');
 return {id:candidate.id,families:candidate.families,inputHash,eligible,bays:plan.stallCount,status:plan.status,columns:plan.columns.length,columnSame,
  rawColumnM2,physicalM2,rawCoreM2:intersect(rawBands,plan.cores.map(c=>c.pts))/1e6,checks:report.counts,lost:plan.lostCount,
  loop:plan.graph.hasLoop,routeStates,unreachedEdges:plan.graph.edges.filter(e=>!e.reached).length,deadSide:plan.deadSideCount,
  continuity:continuity(plan),violations:[...bad].sort(),candidate,plan};
}
const compare=(a,b)=>Number(b.eligible)-Number(a.eligible)||b.bays-a.bays||a.deadSide-b.deadSide||b.continuity.score-a.continuity.score||a.id.localeCompare(b.id);
function dimensions(){
 const depths=unique([4999,5000,5001,5199,5200,5201,5399,5400,5401,5599,5600,5601,9999,10000,10001,10399,10400,10401,
  15999,16000,16001,16399,16400,16401,20999,21000,21001,21599,21600,21601,...Array.from({length:121},(_,i)=>i*250)]);
 const records=[];for(const depth of [5000,5200])for(const width of [2500,2600])for(const wall of [0,200,400])for(const length of [2499,2500,2599,2600,5000,15000])for(const d of depths){
  records.push({depth,width,wall,length,d,class:H.classify(d),oneRow:length>=width&&d>=depth,
   mirrorRects:length>=width&&d>=2*depth,mirrorAndNext:length>=width&&d>=2*depth+6000,
   mirrorNextOuterRow:length>=width&&d>=3*depth+6000,positiveDA:length>=width&&d>depth+wall,DAdepthMm:Math.max(0,d-depth-wall)});
 }
 // Exhaustive finite grid of clear transverse layouts, retaining BOTH-OUTER and short-side exceptions.
 const tilings=[];for(const total of [16000,20000,26000,32000,40000,48000,56000]){
  let tested=0,mirrorLayouts=0,bothOuter=0,bothInnerSingle=0,example=null;
  const points=[];for(let c=8000;c<=total-8000;c+=250)points.push(c);
  const walk=rows=>{if(rows.length){tested++;const sides=rows.map(c=>[H.classify(c-3000),H.classify(total-c-3000)]);
    if(rows.length===1&&sides[0].every(s=>s==='outer'))bothOuter++;
    if(rows.length===1&&sides[0].every(s=>s==='inner'))bothInnerSingle++;
    if(rows.length>1){mirrorLayouts++;if(!example)example=rows.slice();}}
   if(rows.length===4)return;for(const c of points)if(!rows.length||c>=rows.at(-1)+16000)walk(rows.concat(c));};walk([]);
  tilings.push({total,tested,mirrorLayouts,bothOuter,bothInnerSingle,example});
 }
 return {records,tilings,count:records.length,meaning:'Exact dimension inequalities for a rectangular strip only; not vehicle or structural certification'};
}
function details(record,input){
 const h=H.analyze(record.plan,input),route=Routes.routes(record.plan);
 const states=h.faces.filter(f=>f.mirror).reduce((o,f)=>(o[f.mirror.state]=(o[f.mirror.state]||0)+1,o),{});
 const da=H.apply(record.plan,input),samples=[];
 // shortcut: three deterministic local manoeuvres, not complete ramp-to-bay journeys; expand before vehicle approval.
 if(record.eligible)for(const index of unique([0,Math.floor(record.bays/2),record.bays-1])){
  const m=M.parking(record.plan,index);samples.push({index,state:m.state,reason:m.reason,lengthMm:m.lengthMm,vehicle:m.vehicle,
   scope:m.scope,poses:m.state==='path-found'?m.poses:undefined});
 }
 return {...record,depth:h,daPlan:da,vehicleRoutes:{entry:route.entry?.state,exit:route.exit?.state,
  entryIssue:route.entry?.firstIssue,exitIssue:route.exit?.firstIssue},mirrors:states,
  faceClasses:h.faces.reduce((o,f)=>(o[f.classification]=(o[f.classification]||0)+1,o),{}),
  parkingSamples:samples,exceptions:h.sections.filter(s=>s.classification==='exception').length};
}
function svg(plan,h){
 const b=G.bbox(plan.innerOutline),pad=2400,paths=(Ps,fill,stroke='none')=>`<path d="${Ps.map(P=>'M'+P.map(q=>q.join(',')).join('L')+'Z').join('')}" fill="${fill}" stroke="${stroke}" stroke-width="70" fill-rule="nonzero"/>`;
 let x=paths([plan.innerOutline],'#f8f6f0','#333')+paths(plan.aisles,'#d2d4d1');
 if(h)x+=paths(h.otherFree,'#e9dfcc')+paths(h.da.flatMap(z=>z.paths),'#a5c2b8')+paths(h.walls.map(w=>w.pts),'#334b42');
 x+=paths(plan.stalls.map(s=>s.pts),'#fff','#999')+paths(plan.columns,'#333')+paths(plan.cores.map(c=>c.pts),'#999','#333')+(plan.ramp?paths([plan.ramp.body],'#bbb','#555'):'');
 if(h)for(const f of h.faces){const mid=G.mul(G.add(f.start,f.end),.5);x+=`<g tabindex="0" class="face"><title>${f.id} d=${(f.dMinMm/1000).toFixed(2)}~${(f.dMaxMm/1000).toFixed(2)}m ${f.classification};${f.daState||f.mirror?.state||''}</title><line x1="${f.start[0]}" y1="${f.start[1]}" x2="${f.end[0]}" y2="${f.end[1]}" stroke="${f.classification==='short'?'#a64e39':f.classification==='outer'?'#39765d':'#526b91'}" stroke-width="100"/><g class="dim"><line x1="${f.dimension[0][0]}" y1="${f.dimension[0][1]}" x2="${f.dimension[1][0]}" y2="${f.dimension[1][1]}" stroke="#9c4e39" stroke-width="80" stroke-dasharray="200 180"/><text transform="translate(${mid[0]},${mid[1]}) scale(1,-1)" font-size="750">${f.id} ${(f.dMm/1000).toFixed(2)}m</text></g></g>`;}
 return `<svg role="img" aria-label="동일 조건 생성 비교도면 · mm" viewBox="${b[0]-pad} ${-b[3]-pad} ${b[2]-b[0]+pad*2} ${b[3]-b[1]+pad*2}"><g transform="scale(1,-1)">${x}</g></svg>`;
}
function render(data){
 const cell=r=>r?`${r.bays}대 · ${r.eligible?'기하 후보·조향 별도':'기각 후보'}<br>최장 연속 ${r.continuity.longest}칸 / 막다른쪽 ${r.deadSide}칸`:'후보 없음';
 const card=(r,name)=>r?`<div><h3>${name} · ${r.eligible?'검토 후보':'기각된 안'} ${r.bays}칸</h3>${svg(r.plan,r.depth)}<p>${cell(r)} · DA ${r.depth.daAreaM2.toFixed(1)}㎡ / 벽 ${r.depth.wallAreaM2.toFixed(1)}㎡ / 기타 ${A(r.depth.otherFree).toFixed(0)/1e6}㎡</p><p>차량 표시 경로 진입 ${r.vehicleRoutes.entry} / 진출 ${r.vehicleRoutes.exit}. 국부 입출차 표본 ${r.parkingSamples.filter(s=>s.state==='path-found').length}/${r.parkingSamples.length} 경로 발견. 전체 램프↔칸 여정·교행 미검증.</p><details><summary>면별 d값·분류·기각 이유 (${r.depth.faces.length})</summary><div class="scroll"><table><tr><th>면</th><th>d 최소~최대 m</th><th>분류</th><th>DA / mirror</th></tr>${r.depth.faces.map(f=>`<tr><td>${f.id}</td><td>${(f.dMinMm/1000).toFixed(3)}~${(f.dMaxMm/1000).toFixed(3)}</td><td>${f.classification}</td><td>${f.daState||f.mirror?.state||''} ${f.daReasons?.join(', ')||''} ${f.mirror?Object.entries(f.mirror.checks).filter(([k,v])=>!v).map(([k])=>k).join(', '):''}</td></tr>`).join('')}</table></div></details></div>`:'';
 return `<!doctype html><html lang="ko"><meta charset="utf-8"><title>차로·주차열 공동 생성 실험</title><style>body{font:15px/1.6 system-ui;background:#f6f5f0;color:#292d29;max-width:1540px;margin:32px auto;padding:0 22px}h1{font-size:28px}h2{margin-top:42px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;border-bottom:1px solid #ccc;padding:10px;vertical-align:top}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}svg{width:100%;background:#edece6}.dim{display:none}.face:hover .dim,.face:focus .dim{display:block}summary{cursor:pointer}.scroll{max-height:420px;overflow:auto}pre{white-space:pre-wrap;background:#eae8df;padding:20px}.note{padding:14px;background:#e9e3d5}small{color:#666}@media(max-width:900px){.pair{grid-template-columns:1fr}}</style>
 <h1>고정 구조에서 차로와 주차열을 함께 재생성한 실험</h1><p>2026-11-03 · 기존 제품·골든 불변 · 대수 최대화 성능시험이 아닌 가설의 적용범위 탐색</p>
 <p class="note">결론 범위: 치수식으로 확정할 수 있는 한계와, 유한한 후보 탐색에서 확인한 결과를 구별한다. 못 찾은 배치를 불가능으로 판정하지 않는다. 아래 ‘기하·접속 기준 충족’도 차량 조향·설비·구조 승인이나 FEASIBLE 승격을 뜻하지 않는다.</p>
 <h2>이번 실험에서 확인한 핵심</h2><p><b>면별 깊이 분류는 남길 수 있지만, 두 가지 차로 유형과 일정16m 반복만으로 일반 생성기를 구성하기에는 부족하다.</b> 작은 홀26칸은 양쪽 외곽측으로 분류돼도 기하 후보가 된다. 정형은 자유 대조군과 가설군 모두75칸 후보를 찾았다. 고정 코어와 꺾임에서는 자유 대조군이 각각53/28칸을 찾았으나 이번 가설 반복 생성군은 기준을 통과한 후보를 찾지 못했다. 이는 특정 생성 방식의 탐색 실패이며 가설 전체의 불가능 증명이 아니다.</p><p>비어 있는 직사각 단면에서도 d=10~16m 미만이면 mirror 두 열 뒤에 다음6m 차로 전체를 둘 수 없다. 실내 깊이26m의 중앙 차로는 양쪽 d=10m라 내부 차로로 분류되지만, 같은 단면에 등맞댄 열과 다음 평행 차로를 완성할 수 없다. 이 한계는 기존 배치를 고정했기 때문에 생긴 결과가 아니다.</p><h2>왜 이 레이아웃을 시험했나</h2><p>작은 홀은 양쪽 외곽측 예외, 정형 다중 차로는 mirror의 정상 구성, 고정 코어는 장애물과 대안 차로, 꺾임·사선은 구간별 d, 램프 차단은 공간과 접근의 차이를 보기 위해 선정했다. 모든 구조축 교점을 먼저 대조했고 16m 주차 반복을 구조경간으로 사용하지 않았다. 8.1×8.0m는 이번 통제 입력의 가정이며 실제 구조 승인값이 아니다.</p>
 <pre>한 줄 + 차로 + 한 줄 = 5 + 6 + 5 = 16m (벽 두께 제외)
 한 줄 + 차로 + mirror + 차로 + 한 줄 = 5 + 6 + 10 + 6 + 5 = 32m
 세 차로형 = 5 + 6 + 10 + 6 + 10 + 6 + 5 = 48m
 mirror: 차로 │← 5m │등│ 5m →│ 다음 차로
 d는 현재 차로 가장자리→외벽 안쪽. d≥10은 두 열 자체의 깊이이고, 다음 차로 폭 6m는 별도다.</pre>
 <h2>치수 실험 · ${data.dimensions.count}조건</h2><p>5/10m 경계 ±1mm, 칸 깊이5.0/5.2m, 칸 폭2.5/2.6m, 벽0/0.2/0.4m, 면 길이2.499/2.5/2.599/2.6/5/15m를 교차했다. 일반형과 확장형의 실제 조합뿐 아니라 폭·깊이의 효과를 분리한 민감도 조합도 포함했다. DA는 양의 깊이 여부만 검사하며 요구 용량이나 설비 기능을 판정하지 않았다.</p>
 <table><tr><th>실내 전체 깊이</th><th>250mm 유한 격자 후보</th><th>mirror 연결 구성</th><th>한 차로·양쪽 외곽측</th><th>한 차로·양쪽 내부측</th></tr>${data.dimensions.tilings.map(t=>`<tr><td>${t.total/1000}m</td><td>${t.tested}</td><td>${t.mirrorLayouts}</td><td>${t.bothOuter}</td><td>${t.bothInnerSingle}</td></tr>`).join('')}</table>
 <h2>실제 재생성 비교</h2><p>대조군은 구조축 사이 후보, 홀형 후보와 가설에서 제안한 후보까지 모두 포함해 깊이 분류로 제한하지 않고 선택한다. 가설군은 그중 외벽 기준과16m 주차 반복으로 생성한 부분집합이다. 가설군은 외벽에서 주차열5m와 차로 반폭을 확보한 위치부터 차로를 생성하고, 다음 차로는5+5+6=16m 반복으로 제안한다. 양 군 모두 방향·위치·개수·한쪽 연결/사다리 연결을 바꾸고 같은 generateConnected→주차열 선택→최종 검사에 넣었다. 입력·정책·순위 기준은 같다. 기존 일반 generate와는 연결망 정책이 다르므로 제품 자동생성 개선으로 환산하지 않는다. 후보 수가 다르므로 군 간 우열의 통계적 증거로 쓰지 않는다.</p>
 <table><tr><th>사례 / 기둥 전제</th><th>후보 수 / 기준 충족</th><th>자유 후보 전체의 최상위</th><th>가설 기준 최상위</th></tr>${data.cases.map(c=>`<tr><td>${c.title}<br>내부${c.premise.inside} / 외곽제외${c.premise.outside} / 경계걸침${c.premise.partial.length}</td><td>${c.candidates.length} / ${c.candidates.filter(r=>r.eligible).length}<br>전체 대조군${c.candidates.length} / 가설군${c.familyCounts.hypothesis||0}</td><td>${cell(c.bestStructure)}</td><td>${cell(c.bestHypothesis)}</td></tr>`).join('')}</table>
 ${data.cases.map(c=>`<section><h2>${c.title}</h2><small>동일 입력 SHA256 ${c.inputHash} · 구조축 X ${c.premise.spacings.x.join('/')}mm / Y ${c.premise.spacings.y.join('/')}mm</small><p>회색: 차로 / 흰색: 주차 / 검정: 기둥 / 초록: DA 후보 / 짙은 초록: 가정200mm DA벽 / 베이지: 기타 잔여. 각 도면의 면을 가리키면 d 측정선 표시. 같은 사례의 두 도면은 같은 축척.</p><div class="pair">${card(c.bestStructure,'자유 후보 전체 대조군')}${card(c.bestHypothesis,'깊이 가설군')}</div><details><summary>전체 후보 결과 (${c.candidates.length})</summary><div class="scroll"><table><tr><th>후보 / 출처</th><th>차로 구성</th><th>대수 / 연결</th><th>원래 차로와 기둥 겹침㎡</th><th>기존 검사 사유</th></tr>${c.candidates.map(r=>`<tr><td>${r.id} ${r.families.join('/')}</td><td>${r.candidate.orientation} ${r.candidate.rows.map(v=>(v/1000).toFixed(2)).join('/')}m ${r.candidate.topology}</td><td>${r.bays}대 / ${r.eligible?'기준 충족':'미충족'} / 순환${r.loop}</td><td>${r.rawColumnM2.toFixed(3)}</td><td>${r.violations.join(', ')}</td></tr>`).join('')}</table></div></details></section>`).join('')}
 <h2>해석과 한계</h2><p>① 한 차로의 양쪽이 외곽측인 홀형을 예외라고 보고할 수는 있지만 배치 불가로 제외하면 안 된다. ② d가10m 이상16m 미만이면 두 열의 직사각형이 들어가도 같은 방향에 다음6m 차로 전체를 둘 수 없는 빈 직사각형 반례가 생긴다. ③ d는 다른 차로까지 넘어 외벽을 보는 값이라 실제 연속 가용 깊이를 대체하지 못한다. ④ 실제 칸 깊이·면 길이·벽 두께에 따라 후보 성립이 달라진다. ⑤ 통제 입력에서 다른 차로를 생성해 얻은 성공은 종전 고정 배치의 실패를 일반 불가능으로 볼 수 없음을 보여 준다.</p>
 <p>탐색 범위: 직교 차로, 직선 램프, 사다리형/한쪽 연결/단일 홀 후보. 임의 굴절·분기·곡선·전이구조·모든 위상을 망라하지 않는다. 주차 생성기는 기존 코드의 후보 누락·분할·정렬 한계를 그대로 가진다. 대표 후보당 첫·중간·끝3칸의 인접 차로 입출차만 국부 검사했다. 전체 칸 조향·램프↔칸 여정·회차·교행, 실제 DA 기능, 구조와 법규는 미검증. 실패는 ‘이 후보군에서 미발견’으로 해석한다.</p><p>전체 입력·각 후보의 생성 망·수치·대표 도면은 result.json에 보존했다. 기존 제품 주소·입력·엔진은 변경하지 않았다.</p></html>`;
}
function run(options={}){
 const dimension=dimensions(),result={version:2,dimensions:dimension,cases:[],limits:['finite candidate grammar','not product automatic generation','no global optimality claim']};
 for(const scene of scenes()){
  const audit=premise(scene.input);if(audit.partial.length||!audit.regularModule)throw Error('Premise failed: '+scene.id);
  const pool=candidates(scene.input),records=pool.map(c=>evaluate(scene.input,c,audit)).sort(compare),familyCounts={};
  for(const r of records)for(const family of r.families)familyCounts[family]=(familyCounts[family]||0)+1;
  const best=family=>records.find(r=>r.families.includes(family));
  const bestStructure=records[0],bestHypothesis=best('hypothesis'),bestHall=best('hall-control');
  const selected=new Map();for(const r of [bestStructure,bestHypothesis,bestHall])if(r&&!selected.has(r.id))selected.set(r.id,details(r,scene.input));
  const c={...scene,premise:audit,inputHash:hash(scene.input),familyCounts,
   candidates:records.map(({plan,...rest})=>rest),bestStructure:selected.get(bestStructure?.id),bestHypothesis:selected.get(bestHypothesis?.id),bestHall:selected.get(bestHall?.id)};
  result.cases.push(c);if(!options.quiet)console.log(JSON.stringify({scene:scene.id,candidates:records.length,eligible:records.filter(r=>r.eligible).length,
   structure:bestStructure&&{bays:bestStructure.bays,eligible:bestStructure.eligible},hypothesis:bestHypothesis&&{bays:bestHypothesis.bays,eligible:bestHypothesis.eligible}}));
 }
 return result;
}
module.exports={scenes,premise,candidates,normalize,evaluate,compare,dimensions,continuity,details,run,render,OUT,hash};
if(require.main===module){const data=run();fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(path.join(OUT,'result.json'),JSON.stringify(data,null,2));fs.writeFileSync(path.join(OUT,'report.html'),render(data));console.log('REPORT '+path.join(OUT,'report.html'));}
