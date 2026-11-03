'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const E=require('../01_src/CLAUDE_ug_plan_engine.js'),V=require('../01_src/plan/CLAUDE_ugp_verify.js');
const G=require('../01_src/plan/CLAUDE_ugp_geom.js'),H=require('../01_src/plan/aisle-depth-hypothesis.js');
const P=require('../../tools/parking-comparison-basis.cjs'),L=require('../../tools/depth-layout-lab.cjs');
const OUT='C:/Users/seok2/.codex/visualizations/2026/11/02/01a19d26-097b-7e02-9981-0add2515568c/automatic-ab';
const area=paths=>Math.abs(G.areaOf(paths))/1e6,clone=structuredClone;
const canonicalPolygon=P=>P.map(p=>p.join(',')).sort().join('|');
function overlaps(A,B){
 for(const P of [A,B])for(let i=0;i<P.length;i++){
  const a=P[i],b=P[(i+1)%P.length],n=[a[1]-b[1],b[0]-a[0]],project=Q=>Q.map(q=>q[0]*n[0]+q[1]*n[1]);
  const x=project(A),y=project(B);if(Math.min(...x)>=Math.max(...y)-1e-6||Math.min(...y)>=Math.max(...x)-1e-6)return false;
 }return true;
}
function run(){
 const basis=P.read(),spec=basis.cases.find(s=>s.id==='regular'),input=clone(spec.input),unchanged=P.hash(input),events=[];
 const selected=E.generate(input,event=>events.push(event));
 // Exact frozen geometry is in the versioned basis; use a fresh receipt only for source/runtime binding.
 const before=P.observe(spec,basis);P.assertBaseline(before,spec,basis);
 const testNames=[],test=(name,fn)=>{fn();testNames.push(name);};
 const trace={proposedCandidates:events.length-1,evaluations:events.length,baselineIncluded:events[0]?.id==='baseline'};
 const base=events[0].plan,baseKeys=new Set(base.stalls.map(s=>canonicalPolygon(s.pts)));
 const rows=events.map(event=>{
  if(event.error)return event;
  const raw=event.plan,plan=clone(raw);if(event.id!=='baseline')plan.automaticCandidateComparison={...trace,candidateId:event.id,selected:false};
  const receipt={...before,plan,planHash:P.hash(plan),physicalHash:P.hash(P.physical(plan))};
  const keys=new Set(raw.stalls.map(s=>canonicalPolygon(s.pts))),routes=E.inspectVehicleRoutes(raw),depth=H.analyze(raw,input);
  const old=V.check({...raw,stalls:base.stalls},input),intersect=(A,B)=>area(G.boolOp(A,B,G.CL.ClipType.ctIntersection));
  const rawBands=raw.graph.edges.map(e=>{const a=raw.graph.nodes[e.a].p,b=raw.graph.nodes[e.b].p,
   n=G.mul(G.norm([a[1]-b[1],b[0]-a[0]]),raw.grid.aisleMm/2);return [G.add(a,n),G.add(b,n),G.sub(b,n),G.sub(a,n)];});
  return {...event,comparison:P.compare(before,receipt,basis),checks:V.check(raw,input).counts,routes,
   continuity:L.continuity(raw),depth,added:raw.stalls.filter(s=>!baseKeys.has(canonicalPolygon(s.pts))),
   removed:base.stalls.filter(s=>!keys.has(canonicalPolygon(s.pts))),oldBaysOnNewSurface:old.counts,
   aisleCollisionM2:{physical:intersect(raw.aisles,raw.columns.concat(raw.cores.map(c=>c.pts),raw.ramp?[raw.ramp.body]:[])),
    graphBandColumn:intersect(rawBands,raw.columns)},
   DA:{zones:raw.nonParkingZones.filter(z=>z.kind==='da'),pit:raw.nonParkingZones.filter(z=>z.kind==='pit'),other:raw.unassignedFree,
    areaM2:raw.areas,wall:'NOT_DESIGNED; existing automatic DA proposals only; hypothesis wall disabled'}};
 });
 test('same automatic generate evaluates baseline, A and B once, with no fourth or combined plan',()=>{
  assert.deepEqual(events.map(e=>e.id),['baseline','A','B']);assert.deepEqual(trace,{proposedCandidates:2,evaluations:3,baselineIncluded:true});
 });
 test('frozen regular baseline remains exact50 with36 columns and input phase',()=>{
  assert.equal(P.hash(base),spec.expected.planHash);assert.equal(base.stallCount,50);assert.equal(base.columns.length,36);
  assert.deepEqual(base.grid.phase,[3600,7600]);assert.equal(P.hash(input),unchanged);
 });
 test('A moves only left8400; B moves only right41000 from the original ring',()=>{
  const bounds=p=>G.bbox(p.circulation.rings[0]),b=bounds(base),a=bounds(events[1].plan),c=bounds(events[2].plan);
  assert.deepEqual(a,[8400,b[1],b[2],b[3]]);assert.deepEqual(c,[b[0],b[1],41000,b[3]]);
  assert.equal(a[0]-base.grid.aisleMm/2-G.bbox(base.innerOutline)[0],5000);
  assert.equal(G.bbox(base.innerOutline)[2]-c[2]-base.grid.aisleMm/2,5000);
 });
 test('all candidates retain physical input, all36 fixed intersections and effective policies',()=>{
  for(const row of rows){assert(row.comparison.sameConditions);assert.deepEqual(P.physical(row.plan),P.physical(base));
   const centers=row.plan.columns.map(p=>p.reduce((v,q)=>[v[0]+q[0]/p.length,v[1]+q[1]/p.length],[0,0]));
   for(const x of input.grid.columnAxes.x)for(const y of input.grid.columnAxes.y)assert(centers.some(p=>p[0]===x&&p[1]===y));
  }assert.deepEqual(P.effective(input),basis.policy);
 });
 test('fresh shared verification reports no kept-bay collision, missing front, or unreachable bay',()=>{
  for(const row of rows)for(const key of ['clash','noFront','unreachable'])assert.equal(row.checks[key],0);
 });
 test('physical lanes and graph bands avoid fixed obstacles, without underlying column-block violations',()=>{
  for(const row of rows){assert(row.aisleCollisionM2.physical<=.01);assert(row.aisleCollisionM2.graphBandColumn<=.01);
   assert(!row.plan.violations.some(v=>['COLUMN_IN_AISLE','FIXED_COLUMN_BLOCKS_ROUTE','CORE_IN_AISLE'].includes(v.id)));}
 });
 test('independent convex separating-axis checks confirm bay/static and bay/bay separation',()=>{
  for(const row of rows){const p=row.plan,blocks=p.columns.concat(p.cores.map(c=>c.pts),p.ramp?[p.ramp.body]:[]);
   for(let i=0;i<p.stalls.length;i++){
    assert(!blocks.some(q=>overlaps(p.stalls[i].pts,q)),row.id+' fixed collision');
    for(let j=0;j<i;j++)assert(!overlaps(p.stalls[i].pts,p.stalls[j].pts),row.id+' bay collision');
   }
  }
 });
 test('A62 and B50 preserve loop and no dead ends but both fail entry and pass exit',()=>{
  assert.deepEqual(rows.map(r=>r.plan.stallCount),[50,62,50]);
  for(const row of rows){assert.equal(row.plan.status,'FEASIBLE');assert(row.plan.graph.hasLoop);assert.equal(row.plan.deadSideCount,0);
   assert.equal(row.plan.graph.deadEnds.length,0);assert.equal(row.routes.entry.state,'blocked');assert.equal(row.routes.exit.state,'clear');
   assert.equal(row.routes.entry.firstIssue.id,'VEHICLE_OUTSIDE_LANE');}
 });
 test('production rejection agrees with frozen comparison rules; extra bays cannot hide failed entry',()=>{
  for(const row of rows.slice(1)){assert.deepEqual(row.failures,['displayed-route-not-clear']);
   assert.equal(row.comparison.decision,'CANDIDATE_REJECTED');assert.deepEqual(row.comparison.failures,['displayed-vehicle-route-not-clear']);
   assert.equal(row.comparison.productApproval,false);assert.equal(row.comparison.wholeJourney,'NOT_EVALUATED');}
  assert.deepEqual(selected,base);assert(!selected.automaticCandidateComparison);
 });
 test('all six original cases keep exact outputs or exact errors',()=>{
  for(const s of basis.cases)P.assertBaseline(P.observe(s,basis),s,basis);
 });
 test('core, notch, slope and unsupported policy paths do not enter the rectangular candidate experiment',()=>{
  for(const s of basis.cases.filter(s=>s.id!=='regular'&&s.id!=='hall')){const seen=[];E.generate(clone(s.input),e=>seen.push(e));assert.equal(seen.length,1);}
  for(const policy of [{stallRowSelection:'continuous'},{stallRowAlignment:'back-to-back'},{trafficMode:'two-way'}]){
   const seen=[];E.generate({...clone(input),...policy},e=>seen.push(e));assert.equal(seen.length,1);
  }
 });
 test('depth labels measure each face from its aisle edge, excluding the6m aisle',()=>{
  for(const row of rows)for(const f of row.depth.faces){assert.equal(f.classification,H.classify(f.dMm));
   assert(Math.abs(G.len(G.sub(f.dimension[1],f.dimension[0]))-f.dMm)<1e-5);}
 });
 test('SAT self-check distinguishes positive overlap from touching edges',()=>{
  const box=(x,y)=>G.rectPoly([x,y,x+100,y+100]);assert(overlaps(box(0,0),box(99,99)));assert(!overlaps(box(0,0),box(100,0)));
 });
 const productFile=path.join(OUT,'product-browser.json'),productCheck=fs.existsSync(productFile)?JSON.parse(fs.readFileSync(productFile,'utf8')):null;
 if(productCheck)test('actual product input and all three plans match backend; save/reload stable; current source receipt',()=>{
  assert.equal(productCheck.first.inputHash,P.hash(input));assert.equal(productCheck.first.planHash,P.hash(selected));
  assert.equal(P.hash(productCheck.sources),P.hash(P.sources(basis)));assert(productCheck.reloadStable);assert.equal(productCheck.errors.length,0);
  for(const row of rows)assert.equal(productCheck.first.events.find(e=>e.id===row.id).planHash,P.hash(row.plan));
 });
 return {date:'2026-11-03',kind:'bounded product-path experiment',trace,tests:testNames.length,testNames,
  decision:'NO_IMPROVEMENT_FOR_A_B; baseline retained',basisHash:P.hash(basis),sources:P.sources(basis),
  rows,selectedHash:P.hash(selected),baselineHash:P.hash(base),input,
  wholeJourney:'NOT_EVALUATED',independentReview:'PENDING',productCheck,
  productScreen:productCheck?'VERIFIED; actual automatic entry, three candidate hashes and save/reload identical':'NOT_CHECKED; awaiting screen-control readiness',userApproval:'PENDING'};
}
function diagram(row){
 const p=row.plan,b=G.bbox(p.innerOutline),pad=7000;
 const paths=(Ps,fill,stroke='none',width=65)=>`<path d="${Ps.map(P=>'M'+P.map(q=>q.join(',')).join('L')+'Z').join('')}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" fill-rule="nonzero"/>`;
 const text=(q,t,color='#26372e',size=850)=>`<text x="${q[0]}" y="${-q[1]}" fill="${color}" font-size="${size}" text-anchor="middle">${t}</text>`;
 let ink=paths([p.innerOutline],'#fcfbf6','#333')+paths(p.nonParkingZones.filter(z=>z.kind==='pit').flatMap(z=>z.paths),'#ece3cc')+paths(p.unassignedFree||[],'#d7c9a9')+
  paths(p.nonParkingZones.filter(z=>z.kind==='da').flatMap(z=>z.paths),'#a5c7bd')+paths(p.aisles,'#d7dcde')+
  paths(p.stalls.map(s=>s.pts),'#f8f9f5','#60746a')+paths(row.added.map(s=>s.pts),'#c3dccb','#2b7049',100)+
  paths(row.removed.map(s=>s.pts),'none','#a34a40',130)+paths(p.columns,'#35433d')+paths(p.cores.map(c=>c.pts),'#788780')+paths(p.ramp?[p.ramp.body]:[],'#b2b7b4','#555');
 ink+=p.circulation.rings.map(P=>`<path d="M${P.map(q=>q.join(',')).join('L')}Z" fill="none" stroke="#587588" stroke-width="110"/>`).join('');
 ink+=`<path d="M${p.ramp.approach.points.map(q=>q.join(',')).join('L')}" fill="none" stroke="#9d4a40" stroke-width="150"/>`;
 const issue=row.routes.entry.firstIssue;if(issue?.body)ink+=paths([issue.body],'#bc4c4040','#aa352b',160);
 let labels='';const ring=p.circulation.rings[0],cx=(b[0]+b[2])/2,cy=(b[1]+b[3])/2;
 for(let i=0;i<ring.length;i++){
  const a=ring[i],z=ring[(i+1)%ring.length],m=G.mul(G.add(a,z),.5),horizontal=Math.abs(a[1]-z[1])<1;
  for(const sign of [-1,1]){
   const n=horizontal?[0,sign]:[sign,0],start=G.add(m,G.mul(n,p.grid.aisleMm/2));
   const end=horizontal?[start[0],sign<0?b[1]:b[3]]:[sign<0?b[0]:b[2],start[1]],d=G.len(G.sub(end,start));
   const point=G.mul(G.add(start,end),.5),cls=H.classify(d),label=cls==='short'?'부족':cls==='outer'?'외곽':'내부';
   ink+=`<path d="M${start.join(',')}L${end.join(',')}" stroke="#71634d" stroke-width="65" stroke-dasharray="250 160"/>`;
   const at=horizontal?[point[0]+(i===0?-6500:6500),point[1]]:[point[0],point[1]+(sign<0?-2300:2300)];
   labels+=text(at,`d=${(d/1000).toFixed(2)}m ${label}`,'#4c4539',850);
  }
 }
 if(issue?.at)labels+=text([issue.at[0],issue.at[1]-2300],'진입 차체 이탈','#a33830',850);
 return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" role="img" aria-label="${row.id} 도면, 각 면 깊이와 주차칸 변경" viewBox="${b[0]-pad} ${-b[3]-pad} ${b[2]-b[0]+2*pad} ${b[3]-b[1]+2*pad}"><g transform="scale(1,-1)">${ink}</g>${labels}</svg>`;
}
function report(result){
 const rows=result.rows,metric=row=>`<tr><th>${row.id}</th><td>${row.plan.stallCount}</td><td>${row.continuity.longest}칸 / ${row.continuity.runs}개</td><td>${row.checks.clash}/${row.checks.noFront}/${row.checks.unreachable}</td><td>${row.plan.graph.hasLoop?'유지':'없음'} / ${row.plan.graph.deadEnds.length}</td><td>${row.routes.entry.state} / ${row.routes.exit.state}</td><td>+${row.added.length} / −${row.removed.length}</td><td>${area(row.DA.zones.flatMap(z=>z.paths)).toFixed(2)} / ${area(row.DA.pit.flatMap(z=>z.paths)).toFixed(2)} / ${area(row.DA.other||[]).toFixed(2)}</td></tr>`;
 return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>자동 차로 A·B 비교</title><style>body{margin:32px auto;max-width:1350px;padding:0 20px;background:#f5f4ed;color:#28362e;font:16px/1.65 system-ui}h1{font-size:27px}h2{font-size:21px}.notice{padding:16px;border-left:4px solid #9d4a40;background:#ece5db}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:10px;border-bottom:1px solid #ccc;vertical-align:top}.plans{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}svg{width:100%;height:auto;background:#fcfbf6}article h2{margin-bottom:0}article p{margin:0 0 12px}code{word-break:break-all}details{margin:20px 0}@media(max-width:850px){.plans{grid-template-columns:1fr}}</style>
 <h1>자동 차로 A·B 비교 · 기존 50칸 유지</h1><p>2026-11-03 · 고정 비교조건 v1 · 기존안1 + 독립 후보2 · 실제 UGPlan.generate 계산 경로</p>
 <p class="notice"><strong>이번 A·B 후보 방식의 개선 효과 없음.</strong> A는62칸으로 늘었지만 진입 실패가 남아 탈락했다. B는50칸이며 같은 진입 실패가 남아 탈락했다. 추가 후보·A+B·위치 탐색은 하지 않았다. 10m 가설 전체의 기각은 아니다.</p>
 <div class="scroll"><table><tr><th>안</th><th>칸</th><th>최장 연속 / 묶음</th><th>충돌/전면없음/미도달</th><th>순환 / 막다른끝</th><th>진입 / 진출</th><th>새칸 / 빠진칸</th><th>DA후보 / PIT후보 / 미지정㎡</th></tr>${rows.map(metric).join('')}</table></div>
 <p>모두 기둥36개·생성기 FEASIBLE이다. FEASIBLE은 전체 차량 운행 합격을 뜻하지 않는다. 진입 차체가 차로 밖으로 벗어나는 위치를 붉게 표시했다. 연속 묶음 증가는 열이 길어졌다는 뜻이 아니며 최장 연속은 모두3칸이다.</p>
 <div class="plans">${rows.map(row=>`<article><h2>${row.id==='baseline'?'기존안':`후보 ${row.id}`}</h2><p>${row.id==='A'?'왼쪽 차로만 외벽 쪽으로':row.id==='B'?'오른쪽 차로만 외벽 쪽으로':'원래 자동 생성'} · ${row.plan.stallCount}칸</p>${diagram(row)}</article>`).join('')}</div>
 <p>세 도면은 같은 축척이다. 초록=새 칸, 붉은 테두리=빠진 기존 칸, 회색=차로, 짙은 사각=고정 기둥, 청록=기존 방식 DA 후보, 연한 베이지=PIT 후보, 짙은 베이지=미지정 잔여. PIT와 DA는 기존 자동 잔여 분류이며 설비 기능 승인이 아니다. d는 차로 가장자리부터 외벽 안쪽 면까지의 수직 거리이며 차로6m를 제외한다. 도면의 점선은 직선 차로 중간 단면의 대표값이다.</p>
 <h2>가설을 적용한 범위와 탈락 이유</h2><p>A의 왼쪽 외벽 방향 d는12.75→5.00m, B의 오른쪽은5.55→5.00m다. 5≤d&lt;10m는 외곽, d≥10m는 내부, d&lt;5m는 부족으로 표시했다. 내부라는 분류만으로 실제 mirror·다음 차로·차량 접근이 성립한다고 판정하지 않았다. mirror는 가운데 차로 없이 등을 맞댄 두 주차열이다.</p>
 <p>외곽49.4×50m, 구조축8.1×8.0m, 기둥600mm 전체36교점, 외벽400mm, 주차2.5×5m, 차로6m, 위상[3600,7600]mm와 램프 몸체·착지·접선을 유지했다. 정책은 legacy/box/loop/occupied-bands/sequential/independent/report/autoZones다.</p>
 <p>두 후보 모두 형상 충돌·전면 차로·미도달 검사0, 순환 고리 유지다. 실제 차로와 고정 장애물의 겹침 및 그래프 중심선 폭과 기둥의 겹침도 검사했다. 그러나 기존 inspectVehicleRoutes의 VEHICLE_OUTSIDE_LANE가 남았다. A의 첫 실패 표본 차체 이탈면적은0.665→0.190㎡로 줄었지만 여전히 실패다. 이는 전체 경로의 최대 이탈면적이 아니다. ‘진입·진출 통과 후 최소1칸 증가 또는50칸 유지와 진입 문제 해결’ 조건을 충족하지 못한다. 기준을 완화하지 않고 기존안을 그대로 반환한다.</p>
 <h2>DA와 미검증</h2><p>DA는 기존 자동 후보 형상만 표시했다. 새 DA 벽을 설계하지 않았으며200mm 가설 벽도 적용하지 않았다. 청록 공간을 설비실·덕트 공간의 완성으로 보지 않는다. 벽 위치·두께·개구부·설비 기능은 미설계/미검증이다. d=5m인 변경면에는 주차열 뒤 잔여 깊이가 없으며 DA를 억지로 만들지 않는다.</p>
 <p>공유 검사와 별도 SAT 충돌식을 확인했으나 작성자의 자체 시험이다. 독립 검토·사용자 도면 확인은 대기 중이다. ${result.productCheck?'실제 제품 화면의 자동 generate에서 기존안·A·B가 모두 실행됨을 확인했고, 입력과 세 안의 형상 지문이 백엔드와 일치했다. 저장·재열기 결과도 동일하며 화면 오류0이다. 격리 저장공간을 사용해 사용자 기존 저장자료는 건드리지 않았다.':'실제 제품 화면 실행·저장 후 재열기는 화면제어 준비 응답 전이라 미확인이다.'} 전체 칸의 램프 왕복주행·정밀조향·교행·법규·구조설계 승인은 미검증이다.</p>
 <details><summary>구간별 모든 면의 d와 분류</summary><div class="scroll"><table><tr><th>안/면</th><th>d최소~최대(m)</th><th>분류</th><th>적용 구간(mm)</th></tr>${rows.flatMap(r=>r.depth.faces.map(f=>`<tr><td>${r.id}/${f.id}</td><td>${(f.dMinMm/1000).toFixed(3)}~${(f.dMaxMm/1000).toFixed(3)}</td><td>${f.classification}</td><td>${f.rangeMm.map(n=>Math.round(n)).join('~')}</td></tr>`)).join('')}</table></div></details>
 <p>실행·형상·실패 위치 원자료: <a href="result.json">result.json</a> · 기준 지문 <code>${result.basisHash}</code></p></html>`;
}
module.exports={run,report,diagram,OUT};
if(require.main===module){const result=run();if(!process.argv.includes('--check')){
 fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(path.join(OUT,'result.json'),JSON.stringify(result,null,2));
 fs.writeFileSync(path.join(OUT,'report.html'),report(result));
 for(const row of result.rows)fs.writeFileSync(path.join(OUT,row.id+'.svg'),diagram(row));
 }console.log(JSON.stringify({passed:true,tests:result.tests,selected:result.selectedHash===result.baselineHash?'baseline':'candidate',rows:result.rows.map(r=>({id:r.id,bays:r.plan.stallCount,added:r.added.length,removed:r.removed.length,entry:r.routes.entry.state,exit:r.routes.exit.state,decision:r.comparison.decision})),decision:result.decision},null,2));}
