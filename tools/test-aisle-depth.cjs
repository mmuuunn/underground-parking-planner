'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),src=path.join(root,'04_parking/01_src');
const E=require(path.join(src,'CLAUDE_ug_plan_engine.js')),H=require(path.join(src,'plan/aisle-depth-hypothesis.js'));
const G=require(path.join(src,'plan/CLAUDE_ugp_geom.js')),V=require(path.join(src,'plan/CLAUDE_ugp_verify.js'));
const out=process.env.DEPTH_CAPTURE_DIR||'C:/Users/seok2/.codex/visualizations/2026/11/02/01a19d26-097b-7e02-9981-0add2515568c/depth-hypothesis';
const args=process.argv.slice(2),checkOnly=args.includes('--check'),R=(a,b,c,d)=>G.rectPoly([a,b,c,d]);
const hash=x=>crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const area=P=>Math.abs(G.areaOf(P)),inter=(a,b)=>area(G.boolOp(a,b,G.CL.ClipType.ctIntersection));
const checks=[];function test(name,fn){fn();checks.push(name);}
const input={grid:{stallW:2500,stallD:5000}};
function strip(d,options={}){
 const y=6000+d,inner=options.outline||R(0,0,30000,40000),aisles=[R(0,y-6000,30000,y)];
 const nodes=[{id:0,p:[0,y-3000]},{id:1,p:[30000,y-3000]}],edges=[{id:0,a:0,b:1,kind:'spur',reached:true,ok:true}];
 if(options.next){aisles.push(R(0,y+10000,30000,y+16000));nodes.push({id:2,p:[0,y+13000]},{id:3,p:[30000,y+13000]});edges.push({id:1,a:2,b:3,kind:'spur',reached:true,ok:true});}
 return {innerOutline:inner,parkingInnerPaths:[inner],grid:{aisleMm:6000},graph:{nodes,edges},aisles,columns:options.columns||[],cores:[],ramp:null,
  stalls:Array.from({length:12},(_,i)=>({pts:R(i*2500,d-5000,(i+1)*2500,d),rowId:'test'})),nonParkingZones:[],occupants:[],...options.plan};
}
test('5m/10m exact boundaries and insufficient depth',()=>{
 for(const[d,c]of [[0,'short'],[4999,'short'],[5000,'outer'],[9999,'outer'],[10000,'inner']])assert.equal(H.classify(d),c);
 assert.equal(H.laneClass('outer','outer'),'exception');assert.equal(H.laneClass('inner','inner'),'internal');assert.equal(H.laneClass('outer','inner'),'outermost');
});
test('d starts at lane edge and excludes all 6m lane width',()=>{
 const f=H.analyze(strip(7000),input).faces.find(f=>f.normal[1]<0);assert.equal(f.dMm,7000);assert.equal(f.classification,'outer');
});
test('5m gives no DA after a physical 200mm wall',()=>{
 const h=H.analyze(strip(5000),input),f=h.faces.find(f=>f.normal[1]<0);assert(f.daReasons.includes('NO_DA_DEPTH_AFTER_WALL'));assert.equal(h.da.length,0);
});
test('clear outer row yields DA polygon and wall with no overlap',()=>{
 const p=strip(7000),h=H.analyze(p,input);assert(h.da.length>0);assert(h.walls.length>0);assert(inter(h.da.flatMap(z=>z.paths),h.walls.map(w=>w.pts))<=1e4);
 assert.equal(h.daAreaM2,54);assert.equal(h.wallAreaM2,6);
});
test('DA wall collision with fixed column rejects, rather than removing column',()=>{
 const p=strip(7000,{columns:[R(1000,1800,1600,2400)]}),before=hash(p);const h=H.analyze(p,input);
 assert(h.faces.some(f=>f.daReasons?.includes('WALL_CONFLICT')));assert.equal(hash(p),before);
});
test('10m without next aisle does not certify mirror access',()=>{
 const h=H.analyze(strip(5000),input);assert(h.faces.some(f=>f.mirror&&!f.mirror.checks.secondFrontOnAisle&&f.mirror.state==='rejected'));
});
test('actual back-to-back rows require next aisle at the far front',()=>{
 const h=H.analyze(strip(5000,{next:true}),input);assert(h.faces.some(f=>f.mirror?.state==='geometry-only-unverified'));
});
test('a nearer intervening lane defeats mirror despite d exceeding 10m',()=>{
 const p=strip(5000,{next:true});p.aisles.push(R(0,15000,30000,17000));
 const h=H.analyze(p,input);assert(h.faces.some(f=>f.classification==='inner'&&f.mirror&&!f.mirror.checks.noAisleThroughRows));
});
test('fixed obstacle remains a mirror counterexample even with 10m and next lane',()=>{
 const h=H.analyze(strip(5000,{next:true,plan:{cores:[{pts:R(5000,18000,9000,22000)}]}}),input);assert(h.faces.some(f=>f.mirror&&!f.mirror.checks.noStaticCollision));
});
test('angled wall splits 5m and10m threshold along the same face',()=>{
 const p=strip(7000,{outline:[[0,0],[30000,6000],[30000,40000],[0,40000]]});const h=H.analyze(p,input),f=h.faces.filter(f=>f.normal[1]<0);
 assert(f.some(f=>f.classification==='outer'));assert(f.some(f=>f.classification==='short'));
 for(const q of f)assert(!(q.dMinMm<5000-1&&q.dMaxMm>5000+1));
});
test('rotation and translation preserve depth classifications and DA area',()=>{
 const p=strip(7000),turn=q=>G.add(G.rot(q,37),[123456,-654321]),t=structuredClone(p);
 t.innerOutline=t.innerOutline.map(turn);t.parkingInnerPaths=t.parkingInnerPaths.map(P=>P.map(turn));t.aisles=t.aisles.map(P=>P.map(turn));t.stalls=t.stalls.map(s=>({...s,pts:s.pts.map(turn)}));t.graph.nodes=t.graph.nodes.map(n=>({...n,p:turn(n.p)}));
 const a=H.analyze(p,input),b=H.analyze(t,input);assert.deepEqual(b.faces.map(f=>f.classification),a.faces.map(f=>f.classification));assert(Math.abs(a.daAreaM2-b.daAreaM2)<.03);
});
test('nonstandard module depth is reported, never squeezed into 5m assumptions',()=>{
 const h=H.analyze(strip(7000),{grid:{stallW:2600,stallD:5200}});assert.equal(h.da.length,0);assert(h.faces.some(f=>f.daReasons?.includes('ACTUAL_STALL_DEPTH_DIFFERS')));
});
test('both outer faces remain a lane-class exception',()=>{
 const h=H.analyze(strip(7000,{outline:R(0,0,30000,20000)}),input);assert(h.sections.some(s=>s.sides.every(x=>x==='outer')&&s.classification==='exception'));
});
test('user-kept space cannot become DA',()=>{
 const p=strip(7000),kept={id:'keep',kind:'keep',paths:[R(0,0,30000,1800)]};
 assert.equal(H.analyze(p,{...input,nonParkingZones:[kept]}).da.length,0);
 p.keptZones=[kept];assert.equal(H.analyze(p,input).da.length,0);
});
test('a ramp body and a core in the residual DA area stay protected',()=>{
 for(const plan of [{ramp:{body:R(2000,200,7000,1600)}},{cores:[{pts:R(2000,200,7000,1600)}]}]){
  const p=strip(7000,{plan}),h=H.analyze(p,input),f=Object.values(plan).flatMap(x=>Array.isArray(x)?x.map(c=>c.pts):[x.body]);
  assert(inter(h.da.flatMap(z=>z.paths),f)<=1e4);assert(h.faces.some(f=>f.daReasons?.includes('DA_OCCUPIED')));
 }
});
const golden=JSON.parse(fs.readFileSync(path.join(root,'04_parking/02_tests/fixtures/underground-golden-cases.json'),'utf8'));
const F=require(path.join(src,'sghs-reference.js')),doc=structuredClone(F.floors[0].calibrated),r=doc.ramp;
const sghs={...doc,phase:[6400,8000],grid:{...F.grid,columnAxes:doc.columnAxes,columnMm:doc.referenceColumnMm,columnIntersections:doc.columnIntersections},floorMm:undefined,
 ramp:E.createStraightRamp({landing:r.p,angleDeg:r.alignedAngleDeg,widthMm:r.w,lengthMm:r.len}),stallRowSelection:doc.automaticRowSelection};
const cases=golden.cases.map(c=>({id:c.id,input:c.input,source:'existing golden; unchanged'})).concat([{id:'sghs-auto',input:sghs,source:'calibrated actual automatic adapter settings; no supplied lanes'}]);
const stable=p=>({stalls:p.stalls,columns:p.columns,cores:p.cores,ramp:p.ramp,graph:p.graph,aisles:p.aisles,report:p.report,status:p.status,stallCount:p.stallCount});
function continuity(p){
 const rows=new Map();
 for(const s of p.stalls){const edges=s.pts.map((a,i)=>[a,s.pts[(i+1)%s.pts.length]]).sort((a,b)=>G.len(G.sub(a[1],a[0]))-G.len(G.sub(b[1],b[0])));
  const u=G.norm(G.sub(edges[0][1],edges[0][0]));if(u[0]<-.0001||Math.abs(u[0])<.0001&&u[1]<0){u[0]*=-1;u[1]*=-1;}
  const n=[-u[1],u[0]],center=s.pts.reduce((a,b)=>G.add(a,G.mul(b,.25)),[0,0]),along=s.pts.map(v=>G.dot(v,u));
  const key=s.rowId||Math.round(Math.atan2(u[1],u[0])*1800/Math.PI)+':'+Math.round(G.dot(center,n)/10);
  if(!rows.has(key))rows.set(key,[]);rows.get(key).push([Math.min(...along),Math.max(...along)]);
 }
 const runs=[];for(const r of rows.values()){r.sort((a,b)=>a[0]-b[0]);let count=0,end=-Infinity;for(const[a,b]of r){if(a>end+5){if(count)runs.push(count);count=0;}count++;end=Math.max(end,b);}if(count)runs.push(count);}
 return {rows:rows.size,continuousRuns:runs.length,counts:runs.sort((a,b)=>b-a),longest:Math.max(0,...runs)};
}
test('continuity separates a gap within the same row',()=>{
 assert.equal(continuity({stalls:[0,2500,6500,9000].map(x=>({rowId:'r',pts:R(x,0,x+2500,5000)}))}).longest,2);
});
const results=[];
for(const c of cases){
 const beforeInput=hash(c.input),before=E.generate(c.input),beforeDigest=hash(before),after=H.apply(before,c.input),h=after.depthHypothesis;
 test(c.id+': identical input, bays, structure, core, ramp, access graph and status',()=>{assert.equal(hash(c.input),beforeInput);assert.equal(hash(before),beforeDigest);assert.deepEqual(stable(after),stable(before));assert.deepEqual(continuity(after),continuity(before));assert.deepEqual(h.zoneIssues,[]);});
 test(c.id+': no DA/wall collision and no DA on an inner or short face',()=>{
  const blocks=before.columns.concat(before.cores.map(c=>c.pts),before.stalls.map(s=>s.pts),before.aisles,before.ramp?[before.ramp.body]:[]);
  assert(inter(h.da.flatMap(z=>z.paths).concat(h.walls.map(w=>w.pts)),blocks)<=1e4);
  for(const d of h.da)assert.equal(h.faces.find(f=>'depth-da-'+f.id===d.id).classification,'outer');
 });
 results.push({id:c.id,source:c.source,inputHash:beforeInput,input:c.input,before,after,summary:{
  bays:[before.stallCount,after.stallCount],status:[before.status,after.status],columns:before.columns.length,continuity:continuity(before),
  stallChecks:before.report.counts,loop:before.graph.hasLoop,deadEnds:before.graph.deadEnds.length,
  oldAutoDAm2:before.areas?.daM2??null,newDAm2:h.daAreaM2,wallM2:h.wallAreaM2,otherFreeM2:area(h.otherFree)/1e6,
  faces:h.faces.reduce((a,f)=>(a[f.classification]=(a[f.classification]||0)+1,a),{}),
  exceptions:h.sections.filter(s=>s.classification==='exception').length,
  mirrors:h.faces.filter(f=>f.mirror).reduce((a,f)=>(a[f.mirror.state]=(a[f.mirror.state]||0)+1,a),{})}});
}
function diagram(item,after=true){
 const p=after?item.after:item.before,h=after?p.depthHypothesis:null,b=G.bbox(p.innerOutline),pad=2500;
 const poly=(P,fill,stroke='#999',extra='')=>`<polygon points="${P.map(q=>q.join(',')).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="50" ${extra}/>`;
 const paths=(Ps,fill)=>`<path d="${Ps.map(P=>'M'+P.map(q=>q.join(',')).join('L')+'Z').join('')}" fill="${fill}" fill-rule="nonzero"/>`;
 let x=poly(p.innerOutline,'#faf9f6','#222')+paths(p.aisles,'#ddd')+p.stalls.map(s=>poly(s.pts,'white')).join('')+p.columns.map(P=>poly(P,'#333')).join('')+p.cores.map(c=>poly(c.pts,'#aaa','#111')).join('')+(p.ramp?poly(p.ramp.body,'#bbb','#111'):'');
 if(h)x+=paths(h.otherFree,'#ece3d3');else x+=paths((p.nonParkingZones||[]).filter(z=>z.kind==='da').flatMap(z=>z.paths),'#b9cbc6');
 if(h){x+=h.da.flatMap(z=>z.paths).map(P=>poly(P,'#a9c2bd','#32675b')).join('')+h.walls.map(w=>poly(w.pts,'#162b26')).join('');
 for(const f of h.faces){const mid=G.mul(G.add(f.start,f.end),.5),dp=f.dimension;
  x+=`<g class="face" data-id="${f.id}" tabindex="0"><title>${f.id}: d=${(f.dMinMm/1000).toFixed(2)}–${(f.dMaxMm/1000).toFixed(2)}m / ${f.classification}; ${f.daReasons?.join(',')||f.mirror?.state||''}</title><line x1="${f.start[0]}" y1="${f.start[1]}" x2="${f.end[0]}" y2="${f.end[1]}" stroke="${f.classification==='outer'?'#32675b':f.classification==='short'?'#a34b36':'#596a89'}" stroke-width="160"/><line class="dimension" x1="${dp[0][0]}" y1="${dp[0][1]}" x2="${dp[1][0]}" y2="${dp[1][1]}" stroke="#9a573b" stroke-width="60" stroke-dasharray="180 180"/><text class="dimension" transform="translate(${mid[0]} ${mid[1]}) scale(1,-1)" font-size="550" fill="#222">${f.id} d=${(f.dMm/1000).toFixed(2)}m</text></g>`;
 }}
 return `<svg viewBox="${b[0]-pad} ${-b[3]-pad} ${b[2]-b[0]+pad*2} ${b[3]-b[1]+pad*2}" role="img" aria-label="${item.id} ${after?'面별깊이 가설':'기존 배치'} · mm"><g transform="scale(1,-1)">${x}</g></svg>`;
}
function html(){
 const labels={outer:'외곽측 5≤d<10',inner:'내부측 d≥10',short:'깊이 부족 d<5'};
 return `<!doctype html><html lang="ko"><meta charset="utf-8"><title>차로 면별 깊이 가설 비교</title><style>body{margin:30px auto;max-width:1500px;padding:0 22px;background:#f6f5f1;color:#252721;font:15px/1.6 system-ui}h1{font-size:26px}h2{margin-top:45px}table{border-collapse:collapse;width:100%;font-size:13px}td,th{text-align:left;padding:9px;border-bottom:1px solid #ccc}summary,button{cursor:pointer}.drawings{display:grid;grid-template-columns:1fr 1fr;gap:15px}svg{width:100%;background:#eeede7}.dimension{display:none}.face:hover .dimension,.face:focus .dimension,.show .dimension{display:block}.selected line{stroke:#a34b36;stroke-width:250}.scroll{max-height:460px;overflow:auto}pre{background:#eae8e1;padding:20px;overflow:auto}button{padding:8px 14px}small{color:#666}@media(max-width:850px){.drawings{grid-template-columns:1fr}}</style>
 <h1>차로 각 면의 깊이 · mirror와 DA 비교 실험</h1><p>2026-11-03 · 동일 입력 지문 · 기존 엔진과 주차 배치 보존 · 실험 후보는 승인 전</p>
 <p><b>판정: 조건 보완.</b> 5/10m는 면별 거친 분류에 쓸 수 있다. mirror 성립에는 실제 10m 띠의 무충돌과 양쪽 앞면의 차로 접속이 더 필요하다. DA 후보도 벽과 기능 검토가 남는다. 대수 개선을 입증하지 않았다.</p>
 <pre>외곽측: 외벽 │ DA d−5m−벽두께 │ DA벽 │ 주차열 5m →│ 차로
                    ←──── d: 차로 가장자리부터 외벽 안쪽까지 ────→
 mirror: 차로 │← 주차열 5m │ 등 │ 주차열 5m →│ 다음 차로
                    ←──────── 10m ────────→
 내부측 분류 d≥10m ≠ mirror 성립. 다음 차로의 앞면 접속·연결을 별도 검사.</pre>
 <p>DA 벽 두께 200mm는 실험 가정이다. 초록: 외곽측 / 파랑: 내부측 / 갈색: 부족 / 초록 면: DA 후보 / 짙은 초록: DA 벽 / 베이지: 기타 잔여 바닥. 축척은 각 전후 도면끼리 동일. 좌표 단위 mm, d 표기는 m. 차로 꼭짓점·1칸보다 짧은 구간은 제안 제외.</p>
 <table><tr><th>입력</th><th>기존→후보 대수 / 상태</th><th>기둥 / 최장열</th><th>기존 DA→가설 DA ㎡</th><th>DA 벽 / 기타 잔여 ㎡</th><th>mirror 기하 검토/기각</th></tr>${results.map(c=>`<tr><td>${c.id}</td><td>${c.summary.bays.join('→')} / ${c.summary.status.join('→')}</td><td>${c.summary.columns} / ${c.summary.continuity.longest}</td><td>${(c.summary.oldAutoDAm2||0).toFixed(1)}→${c.summary.newDAm2.toFixed(1)}</td><td>${c.summary.wallM2.toFixed(1)} / ${c.summary.otherFreeM2.toFixed(1)}</td><td>${JSON.stringify(c.summary.mirrors)}</td></tr>`).join('')}</table>
 ${results.map(c=>`<section><h2>${c.id}</h2><small>입력 SHA256 ${c.inputHash} · ${c.source}</small><div class="drawings"><div><h3>기존 · ${c.before.stallCount}대</h3>${diagram(c,false)}</div><div><h3>가설 · ${c.after.stallCount}대</h3>${diagram(c)}</div></div><button onclick="this.parentElement.classList.toggle('show')">모든 d값 표시 / 숨기기</button><p>면을 가리키거나 아래 행을 선택하면 d 측정선 표시. 전체 차로 분류 예외 ${c.summary.exceptions}구간. 칸 검사 ${JSON.stringify(c.summary.stallChecks)}. 순환 ${c.summary.loop}; 막다른끝 ${c.summary.deadEnds}. 주차열 구성·기둥·코어·램프·차로 그래프는 전후 동일.</p><details><summary>각 면의 적용 구간·거리·판정 이유 전체 보기 (${c.after.depthHypothesis.faces.length})</summary><div class="scroll"><table><tr><th>면 / 차로 길이 범위 m</th><th>d 최소~최대 m</th><th>분류</th><th>DA 또는 mirror 결과</th></tr>${c.after.depthHypothesis.faces.map(f=>`<tr onclick="const s=this.closest('section');s.querySelectorAll('.selected').forEach(e=>e.classList.remove('selected'));const g=s.querySelector('[data-id=&quot;${f.id}&quot;]');if(g){g.classList.add('selected');g.focus()}"><td>${f.id} / ${f.rangeMm.map(x=>(x/1000).toFixed(2)).join('~')}</td><td>${(f.dMinMm/1000).toFixed(3)}~${(f.dMaxMm/1000).toFixed(3)}</td><td>${labels[f.classification]}</td><td>${f.daState||f.mirror?.state||'짧은 구간: mirror 제안 제외'} ${f.daReasons?.join(', ')||''} ${f.mirror?Object.entries(f.mirror.checks).filter(([k,v])=>!v).map(([k])=>k).join(', '):''}</td></tr>`).join('')}</table></div></details></section>`).join('')}
 <h2>좋아진 점 / 나빠진 점 / 미검증</h2><p>좋아진 점: 차로 면별 d 측정 범위, DA 벽 위치, 실제 잔여 깊이와 후보 기각 이유를 추적할 수 있다. 내부측 공간을 일괄 DA로 바꾸지 않는다.</p><p>나빠진 점: 보수적으로 기존 한 줄이 확인되고 벽·DA 전체가 비어 있는 구간만 채택하므로 DA 후보가 줄거나 조각날 수 있다. 차로 구간 투영과 기둥 단면으로 구간을 나눠 짧은 구간을 놓친다. 주차대수·열 연속성·접근은 개선하지 않았다.</p><p>미검증: 새 차로망이나 주차열 재생성은 구현하지 않음. 고정 배치 위의 DA 공간안과 mirror 가능성 실험이다. 기하-only mirror도 주차칸별 조향·교행을 통과한 뜻이 아니다. DA 용도·배수·환기·유지관리·벽 구조 미검증. 외벽 관통 설비와 출입문 위치도 입력이 없다. 독립 담당 검토·사용자 화면 승인 대기.</p><p>실험 제품 주소: <a href="http://127.0.0.1:8874/04_parking/underground-compare.html?depthHypothesis=1">일반 자동 생성</a> · <a href="http://127.0.0.1:8874/04_parking/underground-compare.html?reference=sghs&amp;floor=B1&amp;revision=calibrated&amp;depthHypothesis=1">SGHS 자동 생성</a>. 기본 주소에는 실험을 적용하지 않는다.</p></html>`;
}
async function browser(){
 const {chromium}=require('playwright'),b=await chromium.launch({headless:true}),browserChecks=[];
 try{for(const suffix of ['', '?reference=sghs&floor=B1&revision=calibrated']){
  const ctx=await b.newContext({viewport:{width:1500,height:1000}}),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const url='http://127.0.0.1:8874/04_parking/underground-compare.html'+suffix;
  await page.goto(url);await page.waitForFunction(()=>typeof ui!=='undefined'&&ui.res?.graph&&!ui.busy);await page.reload();await page.waitForFunction(()=>ui.res?.graph&&!ui.busy);
  const take=()=>page.evaluate(()=>({input:planInput(),doc:structuredClone(doc),result:ui.res}));
  const baseline=await take();assert(!baseline.result.depthHypothesis);
  assert.equal(await page.locator('[data-depth-wall],#depthHypothesisNotice').count(),0);
  await page.goto(url+(suffix?'&':'?')+'depthHypothesis=1');await page.waitForFunction(()=>ui.res?.depthHypothesis&&!ui.busy);
  const experiment=await take();assert.deepEqual(experiment.input,baseline.input);assert.deepEqual(stable(experiment.result),stable(baseline.result));assert.equal(experiment.doc.layoutMode,baseline.doc.layoutMode);
  assert.equal(await page.locator('#plan [data-depth-wall]').count(),experiment.result.depthHypothesis.walls.length);
  assert.equal(await page.locator('#plan [data-depth-face]').count(),experiment.result.depthHypothesis.faces.length);
  assert(await page.evaluate(()=>{const line=document.querySelector('#plan [data-depth-face]'),f=ui.res.depthHypothesis.faces[0];
    return !line||Number(line.getAttribute('x1'))===f.start[0]&&Number(line.getAttribute('y1'))===f.start[1];}));
  assert(await page.locator('#depthHypothesisNotice').isVisible());
  assert(!experiment.result.networkCandidate);assert.deepEqual(experiment.result.depthHypothesis.zoneIssues,[]);
  await page.reload();await page.waitForFunction(()=>ui.res?.depthHypothesis&&!ui.busy);const reload=await take();assert.deepEqual(reload,experiment);assert.deepEqual(errors,[]);
  const name=suffix?'sghs':'general';await page.screenshot({path:path.join(out,'product-'+name+'.png'),fullPage:true});
  browserChecks.push({case:name,inputHash:hash(baseline.input),bays:[baseline.result.stallCount,experiment.result.stallCount],automatic:true,reloadStable:true,errors,daM2:experiment.result.depthHypothesis.daAreaM2});
  fs.writeFileSync(path.join(out,'product-'+name+'.json'),JSON.stringify({baseline,experiment},null,2));await ctx.close();
 }}finally{await b.close();}return browserChecks;
}
(async()=>{
 if(!checkOnly){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'comparison.json'),JSON.stringify({checks,results},null,2));fs.writeFileSync(path.join(out,'comparison.html'),html());
  if(args.includes('--browser')){const b=await browser();fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(b,null,2));console.log(JSON.stringify(b));}}
 console.log(JSON.stringify({passed:checks.length,checks,cases:results.map(c=>({id:c.id,...c.summary}))},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
