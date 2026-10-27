'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const E=require('../../../src/underground/evaluators/evaluator-core.js');
const A=require('../../../src/underground/adapters/rectangular-loop-v04-adapter.js');
const U=require('../../../src/underground/candidates/rectangular-loop-v04.js');
const rules=require('../../../src/underground/rules/kr-parking-rules-2026-07-27.json');

const rect=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
const clone=x=>structuredClone(x);
const ev=(input,candidate,options)=>E.evaluate({input,candidate,ruleSet:rules,options});
const all=(r,id)=>r.items.filter(x=>x.id===id);
const one=(r,id,subjectId)=>{const a=all(r,id).filter(x=>subjectId===undefined||x.subjectId===subjectId);assert.ok(a.length,`missing ${id} ${subjectId||''}`);return a[0];};
const expect=(r,id,verdict,reason,subjectId)=>{const x=one(r,id,subjectId);assert.equal(x.verdict,verdict,`${id} ${x.message}`);if(reason)assert.equal(x.reason,reason,id);return x;};
const sig=r=>r.items.map(q=>[q.id,q.subjectId,q.applicability,q.verdict,q.reason].join('|')).sort();

// 기준 장면 B(10장): 외곽 67.2×50.4m, 코어 (25.2,33.6)m 8.4×8.4m, 램프 착지 (33.6,4.2)m 90도 길이 30m 폭 6m, 층고 3.6m, 모듈 8.1×8.0m
const sceneB=()=>({mass:rect(0,0,67200,50400),cores:[rect(25200,33600,8400,8400)],ramp:{x:33600,y:4200,angleDeg:90,lengthMm:30000,widthMm:6000},floorMm:3600,grid:{gx:8100,gy:8000}});
// v0.4 램프 몸체는 착지 뒤로 외곽 밖(y<0)까지 나간다. 그 부분을 지상 도로 접속 구간으로 선언한다(G07 v1.1.5)
const ROAD=rect(30000,-26000,7200,26000);
const adaptB=(road=ROAD)=>{const v=sceneB(),a=A.adapt(v,U.generate(v));if(road)a.input.ramps[0].roadConnection={outsidePolygon:road};return a;};

// 손계산 장면(T1B-14): 외곽 20×20m, 차로 y 5–11m, 칸 2.5×5.0m 4개(차로 위아래로 접함), 코어·램프·제안 기둥
const stall=(id,x,y,w=2500,d=5000)=>({id,polygon:rect(x,y,w,d)});
const H=()=>({project:{permitDate:'2026-10-24',parkingKind:'noeoe',stallDefaultType:'general'},floor:{id:'B1',levelMm:0,heightMm:3600,outline:{kind:'inner',polygons:[rect(0,0,20000,20000)]}},fixed:{cores:[{id:'C',polygon:rect(14000,14000,5000,5000)}]},stalls:{orientation:'perpendicular'}});
const HC=()=>({schema:'ug-candidate/0.1',candidateId:'H',routeType:'manual',generator:{name:'hand',version:'0'},frame:{originMm:[0,0],angleDeg:0},
  geometry:{stalls:[stall('s1',1000,0),stall('s2',3500,0),stall('s3',1000,11000),stall('s4',3500,11000)],lanes:[{id:'L',polygon:rect(0,5000,20000,6000)}],ramps:[{id:'RB',bodyPolygon:rect(8000,11000,4000,8000)}],columns:[{id:'K',polygon:rect(6100,0,400,400),origin:'proposed'}],reserved:[],turnaround:[]},
  omissions:{columns:[],stalls:[],areas:[]},selfReport:{valid:true,status:'FEASIBLE'}});
const setStall=(c,id,poly)=>{c.geometry.stalls.find(s=>s.id===id).polygon=poly;return c;};

const rot=(p,deg)=>{const a=deg*Math.PI/180;return[p[0]*Math.cos(a)-p[1]*Math.sin(a),p[0]*Math.sin(a)+p[1]*Math.cos(a)];};
const isPoly=v=>Array.isArray(v)&&v.length>=3&&v.every(q=>Array.isArray(q)&&q.length===2&&q.every(Number.isFinite));
const rotateAll=(o,deg)=>isPoly(o)?o.map(p=>rot(p,deg)):Array.isArray(o)?o.map(x=>rotateAll(x,deg)):o&&typeof o==='object'?Object.fromEntries(Object.entries(o).map(([k,v])=>[k,rotateAll(v,deg)])):o;

test('T1B-01 기준 장면 B + v0.4 어댑터(지상 도로 접속 구간 선언): G01–G07 통과, G08–G10 미구현, 등급 없음, 범위 표시',()=>{
  const {input,candidate}=adaptB(),r=ev(input,candidate);
  for(const id of ['G01','G02','G03','G04','G05','G06','G07'])expect(r,id,'PASS');
  for(const id of ['G08','G09','G10'])expect(r,id,'UNDETERMINED','NOT_IMPLEMENTED');
  expect(r,'R01','UNDETERMINED');expect(r,'R02','UNDETERMINED');
  assert.equal(r.overall.grade,null);
  assert.ok(r.overall.scopeLabel.includes('G01–G07 검사, G08–G10 미검증'),r.overall.scopeLabel);});
test('T1B-01 보조: 지상 도로 접속 선언이 없거나 모자라면 G07 실패',()=>{let {input,candidate}=adaptB(null);let q=expect(ev(input,candidate),'G07','FAIL');assert.equal(q.evidence.undeclaredOutsideAreaMm2,154800000);
  ({input,candidate}=adaptB(rect(30000,-10000,7200,10000)));q=expect(ev(input,candidate),'G07','FAIL');assert.equal(q.evidence.undeclaredOutsideAreaMm2,6000*15800);
  ({input,candidate}=adaptB([[0,0],[1,1]]));expect(ev(input,candidate),'G07','INPUT_ERROR');expect(ev(input,candidate),'G01','INPUT_ERROR');});
test('T1B-02 칸 하나를 차로 안으로 20cm 이동하면 G03 실패와 위치',()=>{
  const r=ev(H(),setStall(HC(),'s1',rect(1000,200,2500,5000))),q=expect(r,'G03','FAIL');
  const v=q.evidence.violations.find(x=>x.stallId==='s1');assert.ok(v);assert.equal(v.overlapAreaMm2,500000);assert.equal(v.withId,'L');assert.ok(Array.isArray(v.location));});
test('T1B-03 두 칸을 겹치면 G05 실패',()=>{const q=expect(ev(H(),setStall(HC(),'s2',rect(3000,0,2500,5000))),'G05','FAIL');assert.equal(q.evidence.violations[0].overlapAreaMm2,2500000);});
test('T1B-04 칸 하나를 코어 안으로 넣으면 G04 실패',()=>{const c=HC();c.geometry.stalls.push(stall('s5',15000,14500));const q=expect(ev(H(),c),'G04','FAIL');assert.ok(q.evidence.violations.some(v=>v.stallId==='s5'&&v.withId==='C'&&v.overlapAreaMm2===11250000));});
test('T1B-05 칸 하나를 외곽 밖으로 빼면 G02 실패',()=>{const q=expect(ev(H(),setStall(HC(),'s1',rect(-1000,0,2500,5000))),'G02','FAIL');assert.equal(q.evidence.violations[0].outsideAreaMm2,5000000);});
test('T1B-06 칸 변이 차로 변과 정확히 접하면 통과(회전해도 같음)',()=>{expect(ev(H(),HC()),'G03','PASS');expect(ev(rotateAll(H(),30),rotateAll(HC(),30)),'G03','PASS');expect(ev(rotateAll(H(),30),rotateAll(HC(),30)),'G05','PASS');});
test('T1B-07 코어를 (100,100)m에 두고 미선언이면 G06 입력 오류, 등급 없음, 실패 0건',()=>{
  const {input,candidate}=adaptB();input.fixed.cores[0].polygon=rect(100000,100000,8400,8400);delete input.fixed.cores[0].relation;
  const r=ev(input,candidate);expect(r,'G06','INPUT_ERROR','ZONE_MISMATCH');assert.equal(r.overall.grade,null);assert.equal(r.overall.counts.fail,0);});
test('T1B-08 같은 코어에 external-separate, 문 입력 없음이면 G06 통과, P02 확인 불가, 실패 0건',()=>{
  const {input,candidate}=adaptB();input.fixed.cores[0].polygon=rect(100000,100000,8400,8400);input.fixed.cores[0].relation='external-separate';
  const r=ev(input,candidate);expect(r,'G06','PASS');expect(r,'P02','UNDETERMINED');assert.equal(r.overall.counts.fail,0);});
test('T1B-09 코어가 외곽 경계에 걸치고 미선언이면 G06 입력 오류(ZONE_STRADDLE)',()=>{
  const {input,candidate}=adaptB();input.fixed.cores[0].polygon=rect(63000,20000,8400,8400);expect(ev(input,candidate),'G06','INPUT_ERROR','ZONE_STRADDLE');});
test('T1B-10 램프 몸체와 코어가 겹치면 G07 실패',()=>{const x=H();x.fixed.cores[0].polygon=rect(10000,15000,5000,4000);const q=expect(ev(x,HC()),'G07','FAIL',undefined,'RB');assert.ok(q.evidence.violations.some(v=>v.withId==='C'&&v.overlapAreaMm2===8000000));});
test('T1B-11 독립성: selfReport가 FEASIBLE이어도 겹치면 G03/G05 실패',()=>{
  const {input,candidate}=adaptB();candidate.selfReport={...candidate.selfReport,valid:true,status:'FEASIBLE'};
  const s0=candidate.geometry.stalls[0];candidate.geometry.stalls.push({...clone(s0),id:'dup'});
  const t=candidate.geometry.stalls.find(s=>s.polygon[0][1]===16000);t.polygon=t.polygon.map(([x,y])=>[x,y+200]);
  const r=ev(input,candidate);expect(r,'G05','FAIL');expect(r,'G03','FAIL');});
test('T1B-12 독립성: 도형이 정상이면 selfReport 변조 전후 결과가 같음',()=>{
  const {input,candidate}=adaptB(),a=ev(input,candidate);candidate.selfReport={valid:false,status:'INFEASIBLE',hasLoop:false,hasPerimeterLoop:false,connected:false,stallCount:0,violations:[{id:'X'}]};
  if(candidate.geometry.circulation)candidate.geometry.circulation={...candidate.geometry.circulation,hasLoop:false,connected:false};
  const b=ev(input,candidate);assert.deepEqual(b.items,a.items);assert.deepEqual(b.overall,a.overall);});
test('T1B-13 회전: 기준 장면과 손계산 장면(통과·실패)을 30도·90도 회전해도 항목별 판정이 같음',()=>{
  const {input,candidate}=adaptB(),fail=[H(),setStall(HC(),'s1',rect(1000,200,2500,5000))];
  for(const [i,c] of [[input,candidate],[H(),HC()],fail]){const s0=sig(ev(i,c));for(const d of [30,90])assert.deepEqual(sig(ev(rotateAll(i,d),rotateAll(c,d))),s0,`${d}도`);}});
test('T1B-14 손계산 장면: 각 항목 기대값이 손계산과 일치',()=>{
  const r=ev(H(),HC());
  for(const id of ['G01','G02','G03','G04','G05','G06','G07'])expect(r,id,'PASS');
  assert.equal(one(r,'G02').evidence.maxOutsideAreaMm2,0);assert.equal(one(r,'G03').evidence.maxOverlapAreaMm2,0);assert.equal(one(r,'G05').evidence.maxOverlapAreaMm2,0);
  const l=all(r,'L01');assert.equal(l.length,4);for(const q of l){assert.equal(q.verdict,'PASS');assert.equal(q.evidence.widthMm,2500);assert.equal(q.evidence.depthMm,5000);assert.equal(q.evidence.measurementSource,'candidate-geometry');assert.equal(q.evidence.geometryVerified,true);}
  assert.ok(r.independence.recomputed.includes('stall.dimensions'));
  const n=ev(H(),setStall(HC(),'s4',rect(3500,11000,2400,5000)));expect(n,'L01','FAIL',undefined,'s4');assert.equal(one(n,'L01','s4').evidence.widthMm,2400);
  assert.equal(r.overall.grade,null);assert.ok(r.overall.scopeLabel.includes('G01–G07 검사, G08–G10 미검증'));});
test('T1B-15 v0.4 INFEASIBLE은 SearchOutcome NOT_FOUND와 탐색 범위로 번역, 배치 불가 문구 없음',()=>{
  const v=sceneB();delete v.ramp;const res=U.generate(v);assert.equal(res.status,'INFEASIBLE');
  const o=A.adapt(v,res).searchOutcome;assert.equal(o.status,'NOT_FOUND');
  for(const k of ['routeTypes','angles','originSamples','modules'])assert.ok(o.searched[k]!==undefined,k);
  assert.ok(o.notFound&&Array.isArray(o.notFound.unsearched)&&o.notFound.unsearched.length);assert.ok(o.notFound.closestCandidates.length);
  assert.ok(!JSON.stringify(A.adapt(v,res)).includes('배치 불가'));
  assert.equal(adaptB().searchOutcome.status,'FOUND');});
test('T1B-16 기존 v0.4 시험 14개 회귀',()=>{
  const dir=path.resolve(__dirname,'../candidates'),files=['rectangular-loop-v04.test.cjs','rectangular-loop-v04-circulation.test.cjs','rectangular-loop-v04-perimeter.test.cjs'].map(f=>path.join(dir,f));
  const env={...process.env};delete env.NODE_TEST_CONTEXT;
  const p=spawnSync(process.execPath,['--test',...files],{encoding:'utf8',env});assert.equal(p.status,0,p.stdout);assert.match(p.stdout,/ℹ pass 14\b/);assert.match(p.stdout,/ℹ fail 0\b/);});

test('T1B-17 (50차 반례) 경계를 가로지른 코어는 abutting 선언이 있어도 G06 입력 오류(ZONE_STRADDLE)',()=>{
  for(const rel of [undefined,'abutting','inside','external-separate']){const x=H();x.fixed.cores[0].polygon=rect(18000,14000,5000,5000);if(rel)x.fixed.cores[0].relation=rel;const q=expect(ev(x,HC()),'G06','INPUT_ERROR','ZONE_STRADDLE');assert.equal(q.evidence.insideAreaMm2,10000000);assert.equal(q.evidence.outsideAreaMm2,15000000);}});
test('T1B-18 외곽(floor.outline) 누락은 확인 불가(MISSING_INPUT), 외곽이 필요 없는 항목은 계속 판정',()=>{
  const x=H();delete x.floor.outline;let r=ev(x,HC());
  assert.ok(expect(r,'G01','UNDETERMINED','MISSING_INPUT').missingInputs.includes('floor.outline'));
  for(const id of ['G02','G06','G07'])assert.ok(expect(r,id,'UNDETERMINED','MISSING_INPUT').missingInputs.includes('floor.outline'),id);
  for(const id of ['G03','G04','G05'])expect(r,id,'PASS');expect(r,'L01','PASS');
  r=ev(x,setStall(HC(),'s1',rect(1000,200,2500,5000)));expect(r,'G03','FAIL');
  const y=H();y.fixed.cores[0].polygon=rect(10000,15000,5000,4000);delete y.floor.outline;expect(ev(y,HC()),'G07','FAIL');
  const z=H();z.floor.outline=5;expect(ev(z,HC()),'G01','INPUT_ERROR');});

test('T1B-19 (52차 반례) abutting은 경계에서 1mm 이내(1mm 포함)만 통과, 1mm 초과는 ZONE_MISMATCH',()=>{
  for(const [gap,v] of [[0,'PASS'],[0.5,'PASS'],[0.999,'PASS'],[1,'PASS'],[1.001,'INPUT_ERROR'],[2,'INPUT_ERROR']]){const x=H();x.fixed.cores[0].polygon=rect(20000+gap,14000,5000,5000);x.fixed.cores[0].relation='abutting';const q=expect(ev(x,HC()),'G06',v,v==='PASS'?undefined:'ZONE_MISMATCH');assert.ok(Math.abs(q.evidence.gapToBoundaryMm-gap)<1e-9,String(gap));}});
// 54차 반례: 외곽(원점 기준 20×20m)과 코어(외곽 오른쪽 변에서 gap만큼 떨어진 5×5m)를 함께 원점 중심으로 회전한다.
// 회전은 거리를 바꾸지 않으므로 실제 간격은 회전 전과 같은 gap이다. 좌표는 둥글리지 않은 실수 그대로 넣어(둥글리면 간격이
// 바뀔 수 있음) 계산 잡음만 남게 한다. 기대: gap 1mm는 통과, 1.01mm·2mm는 ZONE_MISMATCH.
test('T1B-21 (54차 반례) 외곽과 코어를 30도·90도 함께 회전해도 abutting 간격 정확히 1mm는 통과',()=>{
  for(const deg of [30,90])for(const [gap,v] of [[0,'PASS'],[1,'PASS'],[1.01,'INPUT_ERROR'],[2,'INPUT_ERROR']]){
    const x=H();x.fixed.cores[0].polygon=rect(20000+gap,14000,5000,5000);x.fixed.cores[0].relation='abutting';
    const y=rotateAll(x,deg),q=expect(ev(y,rotateAll(HC(),deg)),'G06',v,v==='PASS'?undefined:'ZONE_MISMATCH');
    assert.ok(Math.abs(q.evidence.gapToBoundaryMm-gap)<=0.001,`${deg}도 ${gap}mm → ${q.evidence.gapToBoundaryMm}`);}});
// outer 회전 반례(55차 보고): 간격은 "외곽에서 벽 두께를 반영한 실제 판정 경계와 코어 사이의 거리"다.
// inner: 외곽 20×20m의 변 자체가 판정 경계. outer: 바깥면 20.6×20.6m, 벽 300mm → 판정 경계는 x·y 300–20300mm.
// 코어(5×5m, abutting)는 판정 경계 오른쪽 변에서 gap만큼 떨어뜨린 뒤 외곽과 함께 원점 중심으로 회전한다.
// 회전은 거리를 바꾸지 않으므로 실제 간격은 gap 그대로다. 회전 좌표는 둥글리지 않는다.
// 기대: 0mm·정확히 1mm는 통과, 1.01mm·2mm는 ZONE_MISMATCH. 재어진 간격은 gap과 1e-6mm 안에서 같아야 한다.
test('T1B-22 inner·outer 외곽을 0·30·90도 회전해도 판정 경계와 코어 간격 1mm 포함 기준이 같다',()=>{
  const scenes={inner:()=>{const x=H();return{x,edge:20000};},outer:()=>{const x=H();x.floor.outline={kind:'outer',polygons:[rect(0,0,20600,20600)]};x.floor.wallMm=300;return{x,edge:20300};}};
  for(const [kind,mk] of Object.entries(scenes))for(const deg of [0,30,90])for(const [gap,v] of [[0,'PASS'],[1,'PASS'],[1.01,'INPUT_ERROR'],[2,'INPUT_ERROR']]){
    const {x,edge}=mk();x.fixed.cores[0].polygon=rect(edge+gap,14000,5000,5000);x.fixed.cores[0].relation='abutting';
    const q=expect(ev(rotateAll(x,deg),rotateAll(HC(),deg)),'G06',v,v==='PASS'?undefined:'ZONE_MISMATCH'),tag=`${kind} ${deg}도 ${gap}mm → ${q.evidence.gapToBoundaryMm}`;
    assert.equal(q.evidence.distanceBoundary,'exact',tag);assert.ok(Math.abs(q.evidence.gapToBoundaryMm-gap)<=1e-6,tag);}});
// 외곽 다각형끼리의 관계(v1.1.9): 부분 겹침만 입력 오류. 첫 다각형은 20×20m 외곽, 둘째를 바꿔 가며 본다.
const outline2=second=>{const x=H();x.floor.outline.polygons=[rect(0,0,20000,20000),second];return ev(x,HC());};
test('T1B-23(a) 외곽 다각형 부분 겹침(5m×20m 겹침)은 G01 입력 오류, 두 경로 모두 근거, G06 등 외곽 사용 항목도 입력 오류',()=>{
  const r=outline2(rect(15000,0,10000,20000)),q=expect(r,'G01','INPUT_ERROR');
  for(const f of ['floor.outline.polygons[0]','floor.outline.polygons[1]'])assert.ok(q.evidence.fields.includes(f),f);
  for(const id of ['G02','G06','G07'])expect(r,id,'INPUT_ERROR');});
for(const [tag,name,second] of [['b','경계선 접촉',rect(20000,0,10000,20000)],['c','꼭짓점 접촉',rect(20000,20000,5000,5000)],['d','서로 떨어짐',rect(30000,0,5000,5000)],['e','완전 포함(구멍)',rect(12000,1000,1500,1500)]])
  test(`T1B-23(${tag}) 외곽 다각형 ${name}은 겹침 입력 오류가 아님`,()=>{const r=outline2(second);expect(r,'G01','PASS');expect(r,'G06','PASS');});
test('T1B-20 (52차 반례) 램프 입력 id가 중복이면 roadConnection 선언을 고르지 않고 G07 입력 오류',()=>{
  const {input,candidate}=adaptB();input.ramps=[clone(input.ramps[0]),clone(input.ramps[0])];delete input.ramps[0].roadConnection;
  const q=expect(ev(input,candidate),'G07','INPUT_ERROR');for(const f of ['ramps[0].id','ramps[1].id'])assert.ok(q.evidence.fields.includes(f),f);
  input.ramps[1].id='ramp-x';expect(ev(input,candidate),'G07','FAIL');});

// ---- 계약 밖 보조 시험 ----
test('AUX-1B-01 G01 다각형 검사: 자기교차·좌표 비유한·점 부족·도형 누락은 입력 오류',()=>{
  let x=H();x.floor.outline.polygons=[[[0,0],[20000,20000],[20000,0],[0,20000]]];let r=ev(x,HC());let q=expect(r,'G01','INPUT_ERROR');assert.ok(q.evidence.fields.includes('floor.outline.polygons[0]'));expect(r,'G02','INPUT_ERROR');
  r=ev(H(),setStall(HC(),'s1',[[0,0],[NaN,0],[0,10]]));assert.ok(expect(r,'G01','INPUT_ERROR').evidence.fields.includes('candidate.geometry.stalls[0].polygon'));expect(r,'G05','INPUT_ERROR');expect(r,'L01','INPUT_ERROR',undefined,'s1');expect(r,'L01','PASS',undefined,'s2');
  x=H();x.floor.outline.polygons=[[[0,0],[20000,20000],[20000,0],[0,10000]]];assert.ok(expect(ev(x,HC()),'G01','INPUT_ERROR').evidence.fields.includes('floor.outline.polygons[0]'));
  r=ev(H(),setStall(HC(),'s1',[[0,0],[10,0]]));expect(r,'G01','INPUT_ERROR');
  r=ev(H(),{schema:'ug-candidate/0.1'});assert.ok(expect(r,'G01','UNDETERMINED','MISSING_INPUT').missingInputs.includes('candidate.geometry'));
  r=ev(H(),{geometry:5});assert.ok(expect(r,'G01','INPUT_ERROR').evidence.fields.includes('candidate.geometry'));
  x=H();x.floor.outline.kind='outer';r=ev(x,HC());assert.ok(expect(r,'G01','INPUT_ERROR').evidence.fields.includes('floor.wallMm'));
  x=H();x.floor.outline.kind='outer';x.floor.wallMm=500;r=ev(x,HC());expect(r,'G01','PASS');expect(r,'G02','FAIL');
  const c=HC();c.geometry.stalls[1].id='s1';expect(ev(H(),c),'G01','INPUT_ERROR');
  r=ev(H(),setStall(HC(),'s1',[...rect(1000,0,2500,5000),[1000,0]]));expect(r,'G01','PASS');});
test('AUX-1B-02 입력과 후보를 고치지 않음, 예외 없음',()=>{const {input,candidate}=adaptB(),a=clone(input),b=clone(candidate);ev(input,candidate);assert.deepEqual(input,a);assert.deepEqual(candidate,b);
  for(const bad of [null,5,{geometry:5},{geometry:{stalls:5,lanes:[null],ramps:[{id:'r'}]}}])assert.doesNotThrow(()=>{const r=ev(H(),bad);assert.equal(new Set(r.items.map(q=>q.id)).size,39);assert.ok(!r.items.some(q=>q.evidence&&q.evidence.exception));});});
test('AUX-1B-03 직사각형이 아닌 칸은 측정 미구현으로 확인 불가, 관계 선언 불일치는 입력 오류',()=>{
  const r=ev(H(),setStall(HC(),'s1',[[1000,0],[3500,0],[3500,5000],[2000,5000],[1000,4000]]));expect(r,'L01','UNDETERMINED','NOT_IMPLEMENTED','s1');
  let x=H();x.fixed.cores[0].relation='external-separate';expect(ev(x,HC()),'G06','INPUT_ERROR','ZONE_MISMATCH');
  x=H();x.fixed.cores[0].relation='nearby';expect(ev(x,HC()),'G06','INPUT_ERROR');
  x=H();x.fixed.cores[0].polygon=rect(20000,14000,5000,5000);x.fixed.cores[0].relation='abutting';expect(ev(x,HC()),'G06','PASS');
  x=H();x.fixed.cores[0].polygon=rect(20500,14000,5000,5000);x.fixed.cores[0].relation='abutting';expect(ev(x,HC()),'G06','INPUT_ERROR','ZONE_MISMATCH');
  x.fixed.cores[0].relation='external-separate';expect(ev(x,HC()),'G06','PASS');});
test('AUX-1B-04 차로·칸 목록 누락은 확인 불가, 겹침 판정에 법규 허용오차를 쓰지 않음',()=>{
  let c=HC();delete c.geometry.lanes;expect(ev(H(),c),'G03','UNDETERMINED','MISSING_INPUT');
  c=HC();c.geometry.stalls=[];const r=ev(H(),c);for(const id of ['G02','G03','G04','G05'])expect(r,id,'UNDETERMINED','MISSING_INPUT');
  expect(ev(H(),setStall(HC(),'s1',rect(1000,0.03,2500,5000))),'G03','PASS');expect(ev(H(),setStall(HC(),'s1',rect(1000,1,2500,5000))),'G03','FAIL');
  expect(ev(H(),setStall(HC(),'s4',rect(3500,11000,2499,5000))),'L01','FAIL',undefined,'s4');});
