'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const E=require('../../../src/underground/evaluators/evaluator-core.js');
const rules=require('../../../src/underground/rules/kr-parking-rules-2026-07-27.json');

const base=()=>({
  project:{permitDate:'2026-10-24',parkingKind:'noeoe',parkingLots:[{id:'A',totalStalls:40}],rampSystems:[{id:'S',lotIds:['A']}]},
  floor:{id:'B1',levelMm:0,heightMm:3600},
  ramps:[{id:'R',systemId:'S',shape:{type:'straight',lengthMm:30000},lanes:1,operation:'oneWay',separatedInOut:false,section:{legalLaneWidthMm:3300,wallToCurbMm:{left:300,right:300},curb:{left:{heightMm:100},right:{heightMm:100}}}}],
  fixed:{entrances:[]},stalls:{items:[]}
});
const clone=x=>structuredClone(x);
const NT={mode:'numeric-test'};
const runWith=(input,ruleSet,options)=>E.evaluate({input,candidate:{schema:'ug-candidate/0.1',geometry:{stalls:[]}},ruleSet,options});
const run=(input,options)=>runWith(input,rules,options);
const all=(r,id)=>r.items.filter(x=>x.id===id);
const one=(r,id,subjectId)=>{const a=all(r,id).filter(x=>subjectId===undefined||x.subjectId===subjectId);assert.ok(a.length,`missing ${id}`);return a[0];};
const expect=(r,id,verdict,reason)=>{const x=one(r,id);assert.equal(x.verdict,verdict);if(reason)assert.equal(x.reason,reason);return x;};
const setTotal=(x,n,id='A')=>{x.project.parkingLots=[{id,totalStalls:n}];x.project.rampSystems=[{id:'S',lotIds:[id]}];return x;};
const curve=(x,radius=5500)=>{x.ramps[0].shape={type:'curve',lengthMm:24000,innerRadiusMm:radius};x.ramps[0].section.legalLaneWidthMm=6500;x.ramps[0].lanes=2;return x;};
const stall=(w,d,type,orientation='perpendicular')=>({id:'P',widthMm:w,depthMm:d,declaredType:type,orientation});
const filled=(over={},def='PASS')=>[].concat(...Object.entries(E.registry).map(([d,ids])=>ids.map(id=>over[id]!==undefined?over[id]:E.makeItem(id,d,def==='NA'?null:def,def==='NA'?'NOT_APPLICABLE':undefined)))); const byDomain=(doms,verdict)=>Object.fromEntries(doms.flatMap(d=>E.registry[d].map(id=>[id,E.makeItem(id,d,verdict)])));

test('T1A-01 80대 1차로 3.3m 실패',()=>{const x=setTotal(base(),80);const q=expect(run(x),'R01','FAIL');assert.equal(q.evidence.rampSystemTotalStalls,80);assert.ok(q.ruleRef.ruleId);});
test('T1A-02 대수 입력 없으면 분기 확인 불가',()=>{const x=base();delete x.project.parkingLots;delete x.project.rampSystems;const q=expect(run(x),'R01','UNDETERMINED','BRANCH_DIVERGES');assert.ok(q.missingInputs.includes('ramp.systemId'));assert.ok(q.missingInputs.includes('project.parkingLots[].totalStalls'));});
test('T1A-03 40대 1차로 3.3m 통과',()=>assert.equal(expect(run(base()),'R01','PASS').verdict,'PASS'));
test('T1A-04 대수 미상이어도 직선 6m 통과',()=>{const x=base();delete x.project.parkingLots;delete x.project.rampSystems;x.ramps[0].lanes=2;x.ramps[0].section.legalLaneWidthMm=6000;expect(run(x),'R01','PASS');});
test('T1A-05 40대 양방향 3.3m 실패',()=>{const x=base();x.ramps[0].operation='twoWay';x.ramps[0].lanes=2;expect(run(x),'R01','FAIL');});
test('T1A-06 층고와 구간 없으면 경사 확인 불가',()=>{const x=base();delete x.floor.heightMm;expect(run(x),'R02','UNDETERMINED','MISSING_INPUT');});
test('T1A-07 직선 평균 18% 실패',()=>{const x=base();x.ramps[0].shape.lengthMm=20000;const q=expect(run(x),'R02','FAIL');assert.equal(q.evidence.averageSlopePct,18);});
test('T1A-08 직선 평균 12%는 구간 최대 확인 불가',()=>expect(run(base()),'R02','UNDETERMINED'));
test('T1A-09 구간 하나 18% 실패와 구간 id',()=>{const x=base();x.ramps[0].segments=[{id:'a',kind:'straight',lengthMm:10000,startLevelMm:0,endLevelMm:1000},{id:'b',kind:'straight',lengthMm:10000,startLevelMm:1000,endLevelMm:2800},{id:'c',kind:'straight',lengthMm:10000,startLevelMm:2800,endLevelMm:3600}];const q=expect(run(x),'R02','FAIL');assert.equal(q.evidence.failedSegmentId,'b');});
test('T1A-10 곡선 평균 15% 실패',()=>{const x=curve(base(),6000);x.floor.heightMm=3600;x.ramps[0].shape.lengthMm=24000;expect(run(x),'R02','FAIL');});
test('T1A-11 반경 4.5m는 대수 없이 실패',()=>{const x=curve(base(),4500);delete x.project.parkingLots;delete x.project.rampSystems;expect(run(x),'R03','FAIL');});
test('T1A-12 반경 5.5m 대수 미상은 분기 확인 불가',()=>{const x=curve(base());delete x.project.parkingLots;delete x.project.rampSystems;expect(run(x),'R03','UNDETERMINED','BRANCH_DIVERGES');});
test('T1A-13 완화구간 40/80/미상',()=>{let x=base();let q=one(run(x),'R04');assert.equal(q.applicability,'NOT_APPLICABLE');assert.equal(q.verdict,null);x=setTotal(base(),80);expect(run(x),'R04','UNDETERMINED','MISSING_INPUT');x=base();delete x.project.parkingLots;delete x.project.rampSystems;expect(run(x),'R04','UNDETERMINED','BRANCH_DIVERGES');});
test('T1A-14 종류 미지정 1.8m 확인 불가',()=>{const x=base();x.stalls.items=[stall(1800,5000)];expect(run(x,NT),'L01','UNDETERMINED','OPEN_BRANCH_SET');});
test('T1A-15 일반형 1.8m 실패',()=>{const x=base();x.stalls.items=[stall(1800,5000,'general')];expect(run(x,NT),'L01','FAIL');});
test('T1A-16 경형 1.8m 실패',()=>{const x=base();x.stalls.items=[stall(1800,3600,'compact')];expect(run(x,NT),'L01','FAIL');});
test('T1A-17 경형 2.0x3.6 통과',()=>{const x=base();x.stalls.items=[stall(2000,3600,'compact')];expect(run(x,NT),'L01','PASS');});
test('T1A-18 기본 일반형 적용 통과',()=>{const x=base();x.project.stallDefaultType='general';x.stalls.items=[stall(2500,5000)];const q=expect(run(x,NT),'L01','PASS');assert.equal(q.evidence.defaultTypeApplied,true);});
test('T1A-19 일반 크기 장애인형 실패',()=>{const x=base();x.stalls.items=[stall(2500,5000,'accessible')];expect(run(x,NT),'L01','FAIL');});
test('T1A-20 미확인 규칙은 확인 불가',()=>{const x=base();x.stalls.items=[stall(1000,2300,'motorcycle','parallel')];expect(run(x,NT),'L01','UNDETERMINED','RULE_UNVERIFIED');});
test('T1A-21 판본 날짜와 가정',()=>{let r=run(base());assert.equal(r.ruleSets[0].editionAssumed,false);const x=base();delete x.project.permitDate;r=run(x);assert.equal(r.ruleSets[0].editionAssumed,true);assert.notEqual(r.overall.grade,'검토 완료');});
test('T1A-22 도형만 통과면 기하 초안',()=>{const items=filled(byDomain(['R','V','S','P','L'],'UNDETERMINED'));assert.equal(E.computeOverall(items,{editionAssumed:false}).grade,'기하 초안');});
test('T1A-23 도형과 한 영역 통과면 부분 검토',()=>{const items=filled(byDomain(['V','S','P','L'],'UNDETERMINED'));assert.equal(E.computeOverall(items,{editionAssumed:false}).grade,'부분 검토');});
test('T1A-24 전부 통과와 해당 없음',()=>{const na={R03:E.makeItem('R03','R',null,'NOT_APPLICABLE')};for(const items of [filled(),filled(na)]){assert.equal(E.computeOverall(items,{editionAssumed:false}).grade,'검토 완료');assert.equal(E.computeOverall(items,{editionAssumed:true}).grade,'부분 검토');}});
test('T1A-25 실패나 입력 오류면 등급 없음',()=>{for(const v of ['FAIL','INPUT_ERROR']){const o=E.computeOverall([E.makeItem('G01','G',v)],{});assert.equal(o.grade,null);assert.doesNotMatch(JSON.stringify(o),/기하 초안|부분 검토|검토 완료/);}});
test('T1A-26 금지 표현 없음',()=>{const s=JSON.stringify(run(base()));for(const w of ['사용 가능','법규 충족','최적안','배치 불가'])assert.ok(!s.includes(w));});
test('T1A-27 항목 verdict에 NOT_FOUND 없음',()=>assert.ok(run(base()).items.every(x=>x.verdict!=='NOT_FOUND')));
test('T1A-28 전체 레지스트리와 적용여부(v1.1.5: 외곽 없는 G02는 MISSING_INPUT)',()=>{const r=run(base()),domains=new Set(r.items.map(x=>x.domain));assert.deepEqual([...domains].sort(),['G','L','P','R','S','V']);assert.ok(r.items.every(x=>x.applicability));for(const id of ['G08','V01','S01','P01'])assert.equal(one(r,id).reason,'NOT_IMPLEMENTED');assert.equal(one(r,'G02').reason,'MISSING_INPUT');});
test('T1A-29 비정상 수치는 예외 대신 입력 오류',()=>{for(const bad of [NaN,-1,'3300']){const x=base();x.ramps[0].section.legalLaneWidthMm=bad;assert.doesNotThrow(()=>run(x));assert.ok(run(x).items.some(q=>q.verdict==='INPUT_ERROR'));}});
test('T1A-30 규칙 데이터 수치가 결과를 바꿈',()=>{const x=base();x.ramps[0].shape.lengthMm=22000;const a=run(x);const m=clone(rules),rr=m.rules.find(q=>q.ruleId==='kr.rule6.p1.5.ramp-straight-slope');rr.quantity.value=16;const b=E.evaluate({input:x,candidate:{geometry:{stalls:[]}},ruleSet:m});assert.notEqual(one(a,'R02').verdict,one(b,'R02').verdict);});
test('T1A-31 합계 50과 51 경계',()=>{let x=curve(base());x.project.parkingLots=[{id:'A',totalStalls:20},{id:'B',totalStalls:30}];x.project.rampSystems=[{id:'S',lotIds:['A','B']}];let r=run(x);expect(r,'R03','PASS');assert.equal(one(r,'R01').evidence.rampSystemTotalStalls,50);x.project.parkingLots[1].totalStalls=31;expect(run(x),'R03','FAIL');});
test('T1A-32 독립 램프 체계 분리',()=>{const x=curve(base());x.project.parkingLots=[{id:'A',totalStalls:40},{id:'B',totalStalls:80}];x.project.rampSystems=[{id:'S1',lotIds:['A']},{id:'S2',lotIds:['B']}];x.ramps=[clone(x.ramps[0]),clone(x.ramps[0])];x.ramps[0].id='R1';x.ramps[0].systemId='S1';x.ramps[1].id='R2';x.ramps[1].systemId='S2';const r=run(x);assert.equal(one(r,'R03','R1').verdict,'PASS');assert.equal(one(r,'R03','R2').verdict,'FAIL');});
test('T1A-33 후보 대수는 판정에 영향 없음',()=>{const x=curve(base());for(const n of [40,80,200]){const r=E.evaluate({input:x,candidate:{stallCount:n,geometry:{stalls:Array(n).fill({})}},ruleSet:rules});assert.equal(one(r,'R03').verdict,'PASS');}});
test('T1A-34 벽 사이 폭에서 법정 폭 판정',()=>{const cases=[[3000,null,'FAIL'],[3300,null,'UNDETERMINED'],[4000,{left:300,right:300},'PASS'],[3800,{left:300,right:300},'FAIL']];for(const [w,c,v] of cases){const x=base();delete x.ramps[0].section.legalLaneWidthMm;x.ramps[0].section.wallToWallMm=w;if(c)x.ramps[0].section.wallToCurbMm=c;else delete x.ramps[0].section.wallToCurbMm;assert.equal(one(run(x),'R01').verdict,v);}expect(run(base()),'R01','PASS');});
test('T1A-35 이륜 비평행 1.0x2.3 통과',()=>{const x=base();x.stalls.items=[stall(1000,2300,'motorcycle')];expect(run(x,NT),'L01','PASS');});
test('T1A-36 평행 경형 1.7x4.5 통과(v1.1.4)',()=>{const x=base();x.stalls.items=[stall(1700,4500,'compact','parallel')];expect(run(x,NT),'L01','PASS');x.stalls.items=[stall(1700,4400,'compact','parallel')];expect(run(x,NT),'L01','FAIL');x.stalls.items=[stall(1000,2300,'motorcycle','parallel')];expect(run(x,NT),'L01','UNDETERMINED','RULE_UNVERIFIED');});
test('T1A-37 개정 전 허가일 판본 없음',()=>{const x=curve(base());x.project.permitDate='2026-03-30';assert.equal(one(run(x),'R01').reason,'EDITION_NOT_LOADED');assert.equal(one(run(x),'R03').reason,'EDITION_NOT_LOADED');});
test('T1A-38 반경 5.5m 80대 실패 40대 통과',()=>{let x=setTotal(curve(base()),80);expect(run(x),'R03','FAIL');x=setTotal(curve(base()),40);expect(run(x),'R03','PASS');});
test('T1A-39 지하 부설 8대 이하도 제6조로 판정(v1.1.4)',()=>{const x=setTotal(curve(base()),8);x.project.parkingKind='buseol';x.project.facilityUse='업무시설';x.fixed.entrances=[{id:'E',systemId:'S',widthMm:3500}];const r=run(x);for(const id of ['R01','R03','L04']){const q=one(r,id);assert.notEqual(q.reason,'RULE_UNVERIFIED',id);assert.equal(q.verdict,'PASS',id);assert.match(JSON.stringify(q.evidence),/제11조제1항 준용/);}});
test('T1A-40 부설 단독·다세대는 확인 불가',()=>{for(const use of ['단독주택','다세대주택']){const x=curve(base());x.project.parkingKind='buseol';x.project.facilityUse=use;for(const id of ['R01','R03','L04'])assert.equal(one(run(x),id).verdict,'UNDETERMINED');}});
test('T1A-41 부설 9대 이상 준용 표시',()=>{const x=setTotal(base(),9);x.project.parkingKind='buseol';x.project.facilityUse='업무시설';x.fixed.entrances=[{id:'E',systemId:'S',widthMm:3500}];const r=run(x);for(const id of ['R01','L04'])assert.match(JSON.stringify(one(r,id).evidence),/제11조제1항 준용/);});
test('T1A-42 연석 위치와 높이 경계',()=>{const vals=[[250,100,'FAIL'],[300,100,'PASS'],[300,99,'FAIL'],[300,149,'PASS'],[300,150,'PASS'],[300,151,'FAIL']];for(const [d,h,v] of vals){const x=base();x.ramps[0].section.wallToCurbMm={left:d,right:300};x.ramps[0].section.curb={left:{heightMm:h},right:{heightMm:100}};assert.equal(one(run(x),'R09').verdict,v);}const x=base();delete x.ramps[0].section.curb;expect(run(x),'R09','UNDETERMINED');});
test('T1A-43 연석 가로폭은 R01 R09에 영향 없음',()=>{let signature;for(const w of [0,150,300]){const x=base();x.ramps[0].section.curb.left.widthMm=w;x.ramps[0].section.curb.right.widthMm=w;const r=run(x),s=[one(r,'R01').verdict,one(r,'R09').verdict];signature??=s;assert.deepEqual(s,signature);}const src=fs.readFileSync(path.resolve(__dirname,'../../../src/underground/evaluators/evaluator-core.js'),'utf8');assert.doesNotMatch(src,/curb[^\n]{0,30}widthMm/i);});
test('T1A-44 입력 불변과 V06 미구현',()=>{const x=base();x.ramps[0].section.curb.left.widthMm=2000;x.ramps[0].section.curb.right.widthMm=2000;x.ramps[0].section.vehiclePassableWidthMm=-700;const before=clone(x),r=run(x);assert.deepEqual(x,before);assert.equal(one(r,'V06').reason,'NOT_IMPLEMENTED');});
test('T1A-45 직선 R03은 해당 없음',()=>{const x=base();delete x.project.parkingLots;delete x.project.rampSystems;const r=run(x),q=one(r,'R03');assert.equal(q.applicability,'NOT_APPLICABLE');assert.equal(q.verdict,null);assert.equal(q.reason,'NOT_APPLICABLE');assert.equal(r.domainSummary.R.notApplicable,1);});
test('T1A-46 곡선 R03 적용성',()=>{let x=setTotal(curve(base(),6000),80);let q=one(run(x),'R03');assert.equal(q.applicability,'APPLICABLE');assert.equal(q.verdict,'PASS');x=curve(base());delete x.ramps[0].shape.innerRadiusMm;expect(run(x),'R03','UNDETERMINED','MISSING_INPUT');x=base();delete x.ramps[0].shape.type;q=expect(run(x),'R03','UNDETERMINED','MISSING_INPUT');assert.equal(q.applicability,'APPLICABLE');assert.ok(q.missingInputs.includes('ramp.shape.type'));});
test('T1A-47 집계에서 해당 없음은 독립',()=>{const N=id=>E.makeItem(id,'P',null,'NOT_APPLICABLE'),U=id=>E.makeItem(id,'P','UNDETERMINED');const s=E.summarize(filled({P01:E.makeItem('P01','P','PASS'),P02:N('P02'),P03:N('P03'),P04:U('P04'),P05:U('P05')})).P;assert.deepEqual({pass:s.pass,notApplicable:s.notApplicable,undetermined:s.undetermined,fail:s.fail,inputError:s.inputError},{pass:1,notApplicable:2,undetermined:2,fail:0,inputError:0});assert.equal(s.domainPassed,false);});
test('T1A-48 영역 완료 계산과 램프 누락',()=>{const N=id=>E.makeItem(id,'S',null,'NOT_APPLICABLE'),P=id=>E.makeItem(id,'S','PASS');let s=E.summarize(filled({S01:P('S01'),S02:P('S02'),S03:N('S03'),S04:N('S04')})).S;assert.equal(s.domainPassed,true);s=E.summarize(filled({S01:N('S01'),S02:N('S02'),S03:N('S03'),S04:N('S04')})).S;assert.equal(s.notApplicableDomain,true);assert.equal(s.domainPassed,false);s=E.summarize(filled({S01:P('S01'),S02:E.makeItem('S02','S','UNDETERMINED','NOT_IMPLEMENTED'),S03:N('S03'),S04:N('S04')})).S;assert.equal(s.domainPassed,false);const x=base();x.ramps=[];const r=run(x);for(const q of r.items.filter(i=>i.domain==='R')){assert.notEqual(q.applicability,'NOT_APPLICABLE');assert.equal(q.verdict,'UNDETERMINED');}});

// ---- v1.1.3 추가 회귀시험 T1A-49 – T1A-66 ----
const ent=(w=3500,extra={})=>({id:'E',systemId:'S',widthMm:w,...extra});
const withEnt=(x,w)=>{x.fixed.entrances=[ent(w)];return x;};
const NTitem=(x,...items)=>{x.stalls.items=items.length?items:[stall(2500,5000,'general')];return x;};
const withSeg=(x,segs)=>{x.ramps[0].segments=segs;return x;};
const mutate=fn=>{const m=clone(rules);fn(m);return m;};
const rec=(m,id)=>m.rules.find(q=>q.ruleId===id);
const problems=x=>(x.evidence.ruleProblems||[]).map(p=>typeof p==='string'?p:p.ruleId);
// 항목별 (정상 입력, 그 항목이 쓰는 규칙, 옵션)
const gateCases=()=>[
  ['R01',base(),'kr.rule6.p1.5.ramp-straight-one-lane-width'],
  ['R02',withSeg(base(),[{id:'a',kind:'straight',lengthMm:30000,startLevelMm:0,endLevelMm:3600}]),'kr.rule6.p1.5.ramp-straight-slope'],
  ['R03',curve(base()),'kr.rule6.p1.5.curve-inner-radius'],
  ['R09',base(),'kr.rule6.p1.5.curb-wall-offset'],
  ['L01',NTitem(base()),'kr.rule3.p1.2.general',NT],
  ['L04',withEnt(base()),'kr.rule6.p1.4.entrance-width']
];
test('T1A-49 규칙 상태 관문: needs-recheck·pending·source 없음은 확인 불가',()=>{for(const [id,x,rid,opt] of gateCases()){assert.ok(['PASS','FAIL'].includes(one(run(x,opt),id).verdict),id+' 기준 입력');
  for(const [name,fn] of [['status',r=>{r.status='needs-recheck';}],['unverified',r=>{r.status='unverified';}],['pending',r=>{r.source.secondCheck='pending';}],['nosource',r=>{delete r.source;}]]){const m=mutate(s=>fn(rec(s,rid)));const q=one(runWith(x,m,opt),id);assert.equal(q.verdict,'UNDETERMINED',id+name);assert.equal(q.reason,'RULE_UNVERIFIED',id+name);assert.ok(problems(q).includes(rid),id+name);}}});
test('T1A-50 규칙 손상·누락·중복·ruleSet 없음',()=>{for(const [id,x,rid,opt] of gateCases()){const dims=id==='L01';
  const muts=[['missing',s=>{s.rules=s.rules.filter(q=>q.ruleId!==rid);}],['duplicate',s=>{s.rules.push(clone(rec(s,rid)));}]];
  for(const bad of [NaN,'3300',-1,0])muts.push(['value '+bad,s=>{const q=rec(s,rid).quantity;if(dims)q.widthMm=bad;else q.value=bad;}]);
  if(!dims)muts.push(['unit',s=>{rec(s,rid).quantity.unit='m';}]);
  for(const [name,fn] of muts){const m=mutate(fn);let r;assert.doesNotThrow(()=>{r=runWith(x,m,opt);});const q=one(r,id);assert.equal(q.verdict,'UNDETERMINED',id+name);assert.equal(q.reason,'RULE_UNVERIFIED',id+name);assert.ok(problems(q).includes(rid),id+name);}}
  const x=withEnt(NTitem(base()));for(const rs of [null,undefined,{},{rules:'x'},{rules:[null]}]){let r;assert.doesNotThrow(()=>{r=runWith(x,rs,NT);});for(const id of ['R01','R02','R03','R04','R09','L01','L04']){const q=one(r,id);assert.equal(q.verdict,'UNDETERMINED',id);assert.equal(q.reason,'RULE_UNVERIFIED',id);assert.deepEqual(q.missingInputs,[]);}}
  assert.deepEqual(one(runWith(x,null,NT),'R03').evidence.ruleProblems,['ruleSet']);});
test('T1A-51 차로 수 미입력은 분기 확인 불가',()=>{const x=base();delete x.ramps[0].lanes;delete x.ramps[0].operation;const q=expect(run(x),'R01','UNDETERMINED','BRANCH_DIVERGES');assert.ok(q.evidence.branches.length>=2);assert.deepEqual([...new Set(q.evidence.branches.map(b=>b.result))].sort(),['FAIL','PASS']);assert.ok(q.missingInputs.includes('ramp.lanes'));});
test('T1A-52 50대 이상 곡선·분리·차로 수',()=>{const mk=(w,sep)=>{const x=setTotal(curve(base()),80);x.ramps[0].section.legalLaneWidthMm=w;if(sep===undefined)delete x.ramps[0].separatedInOut;else x.ramps[0].separatedInOut=sep;return x;};
  expect(run(mk(6000,false)),'R01','FAIL');expect(run(mk(6500,false)),'R01','PASS');
  let x=setTotal(base(),80);x.ramps[0].separatedInOut=true;expect(run(x),'R01','PASS');
  x=setTotal(base(),80);delete x.ramps[0].separatedInOut;expect(run(x),'R01','UNDETERMINED','BRANCH_DIVERGES');
  x=base();x.ramps[0].operation='twoWay';expect(run(x),'R01','INPUT_ERROR');});
test('T1A-53 대수·차로 수·분리 모두 미상이어도 모든 분기 실패면 실패',()=>{const x=base();for(const k of ['lanes','operation','separatedInOut'])delete x.ramps[0][k];delete x.project.parkingLots;delete x.project.rampSystems;x.ramps[0].section.legalLaneWidthMm=3000;const q=expect(run(x),'R01','FAIL');assert.notEqual(q.reason,'BRANCH_DIVERGES');});
test('T1A-54 출입구 분기',()=>{let x=withEnt(base(),1000);delete x.project.parkingLots;delete x.project.rampSystems;expect(run(x),'L04','FAIL');
  x=withEnt(base());delete x.project.parkingLots;delete x.project.rampSystems;x.fixed.entrances[0].separated=true;expect(run(x),'L04','PASS');
  x=withEnt(setTotal(base(),80));expect(run(x),'L04','UNDETERMINED','BRANCH_DIVERGES');
  x.ramps[0].separatedInOut=true;expect(run(x),'L04','UNDETERMINED','BRANCH_DIVERGES');
  x=withEnt(setTotal(base(),80),5500);expect(run(x),'L04','PASS');});
test('T1A-55 R02 고저차 출처: connects가 층고보다 우선',()=>{const mk=()=>{const x=base();x.ramps[0].shape.lengthMm=20000;return x;};
  let x=mk();x.ramps[0].connects={upperLevelMm:0,lowerLevelMm:-3000};let q=expect(run(x),'R02','UNDETERMINED');assert.equal(q.evidence.riseMm,3000);
  x=mk();x.ramps[0].connects={lowerLevelMm:-3000};expect(run(x),'R02','UNDETERMINED','MISSING_INPUT');
  x=mk();const r=run(x);q=expect(r,'R02','FAIL');assert.ok(q.evidence.assumption);assert.ok(r.overall.notes.assumptions.length>0);});
test('T1A-56 R02 구간 종류와 경계',()=>{const seg=(o={})=>({id:'a',lengthMm:20000,startLevelMm:0,endLevelMm:3000,...o});const mk=(segs,len=20000)=>{const x=withSeg(base(),segs);x.ramps[0].shape.lengthMm=len;return x;};
  expect(run(mk([seg()])),'R02','UNDETERMINED','BRANCH_DIVERGES');
  expect(run(mk([seg({endLevelMm:3600})])),'R02','FAIL');
  expect(run(mk([seg({kind:'ramp'})])),'R02','INPUT_ERROR');
  expect(run(mk([seg({kind:'straight',lengthMm:10000,endLevelMm:1000}),seg({id:'b',kind:'straight',lengthMm:10000,startLevelMm:1500,endLevelMm:3000})])),'R02','INPUT_ERROR');
  const x=mk([seg()]);x.ramps[0].shape.type='straight';expect(run(x),'R02','UNDETERMINED','BRANCH_DIVERGES');
  const c=(end)=>{const y=withSeg(curve(base()),[seg({kind:'curve',endLevelMm:end})]);y.ramps[0].shape.lengthMm=20000;return y;};
  expect(run(c(2800)),'R02','PASS');expect(run(c(2801)),'R02','FAIL');
  expect(run(mk([seg({kind:'transition'})])),'R02','UNDETERMINED','BRANCH_DIVERGES');expect(run(mk([seg({kind:'transition',endLevelMm:2800})])),'R02','PASS');expect(run(mk([seg({kind:'transition',endLevelMm:3600})])),'R02','FAIL');});
test('T1A-57 음수 고도는 정상, 음수 치수는 입력 오류',()=>{let x=withSeg(base(),[{id:'a',kind:'straight',lengthMm:30000,startLevelMm:-3600,endLevelMm:-7200}]);x.floor.levelMm=-7200;let r=run(x);expect(r,'R02','PASS');assert.notEqual(one(r,'G01').verdict,'INPUT_ERROR');
  x=withSeg(base(),[{id:'a',kind:'straight',lengthMm:-30000,startLevelMm:0,endLevelMm:3600}]);r=run(x);expect(r,'R02','INPUT_ERROR');expect(r,'G01','INPUT_ERROR');
  x=base();x.ramps[0].section.legalLaneWidthMm=-3300;expect(run(x),'R01','INPUT_ERROR');});
test('T1A-58 판본 일관성(v1.1.4)',()=>{const mk=d=>{const x=withEnt(NTitem(base()));x.project.permitDate=d;return x;};
  let r=run(mk('2026-03-30'),NT);for(const id of ['R01','R02','R03','R04','R09','L04'])expect(r,id,'UNDETERMINED','EDITION_NOT_LOADED');expect(r,'L01','PASS');
  for(const d of ['2026-03-31','2026-05-01','2026-07-26']){r=run(mk(d),NT);for(const id of ['R01','R09','L01','L04'])expect(r,id,'PASS');assert.equal(one(r,'R03').applicability,'NOT_APPLICABLE');assert.equal(one(r,'R04').applicability,'NOT_APPLICABLE');assert.ok(r.items.every(q=>q.reason!=='EDITION_NOT_LOADED'),d);const c=setTotal(curve(base()),40);c.project.permitDate=d;expect(run(c),'R03','PASS');}
  r=run(mk('2018-12-31'),NT);expect(r,'L01','UNDETERMINED','EDITION_NOT_LOADED');
  r=run(mk('2026-13-01'),NT);for(const id of ['R01','R02','R03','R04','R09','L01','L04'])expect(r,id,'INPUT_ERROR');expect(r,'G01','INPUT_ERROR');
  for(const d of ['2026-02-30','20261024',2026,''])expect(run(mk(d),NT),'R01','INPUT_ERROR');
  const m=mutate(s=>{for(const q of s.rules)q.edition.effectiveTo='2026-12-31';});expect(runWith(mk('2026-12-31'),m,NT),'R01','PASS');expect(runWith(mk('2027-01-01'),m,NT),'R01','UNDETERMINED','EDITION_NOT_LOADED');});
test('T1A-59 잘못된 형태의 입력',()=>{let x=base();x.ramps=[null];let r=run(x);expect(r,'R01','INPUT_ERROR');assert.ok(one(r,'G01').evidence.fields.includes('ramps[0]'));
  x=withSeg(base(),[null]);r=run(x);expect(r,'R02','INPUT_ERROR');expect(r,'G01','INPUT_ERROR');expect(r,'R01','PASS');
  x=base();x.project.parkingLots=[null];r=run(x);expect(r,'R01','INPUT_ERROR');expect(r,'R04','INPUT_ERROR');expect(r,'G01','INPUT_ERROR');expect(r,'R09','PASS');
  x=base();x.fixed.entrances=[null];r=run(x);expect(r,'L04','INPUT_ERROR');expect(r,'G01','INPUT_ERROR');
  x=base();x.stalls.items=[null];r=run(x,NT);expect(r,'L01','INPUT_ERROR');expect(r,'G01','INPUT_ERROR');
  assert.doesNotThrow(()=>{r=run(undefined);});assert.deepEqual(r.items.map(q=>q.id).filter((v,i,a)=>a.indexOf(v)===i).sort(),[].concat(...Object.values(E.registry)).sort());expect(r,'G01','INPUT_ERROR');
  for(const bad of [null,5,'x',[]]){assert.doesNotThrow(()=>{r=run(bad);});assert.ok(r.items.length>=39);}
  x=base();x.ramps={};r=run(x);for(const id of ['R01','R02','R03','R04','R09'])expect(r,id,'INPUT_ERROR');expect(r,'G01','INPUT_ERROR');
  x=base();x.project=5;assert.doesNotThrow(()=>run(x));x=base();x.ramps[0].section=7;r=run(x);expect(r,'R01','INPUT_ERROR');expect(r,'R09','INPUT_ERROR');
  assert.doesNotThrow(()=>E.evaluate());assert.doesNotThrow(()=>E.evaluate({}));});
test('T1A-60 램프 체계 검사',()=>{const bad=fn=>{const x=base();fn(x);const r=run(x);expect(r,'R01','INPUT_ERROR');expect(r,'R04','INPUT_ERROR');expect(r,'G01','INPUT_ERROR');return x;};
  bad(x=>{x.project.rampSystems=[{id:'S',lotIds:[]}];});bad(x=>{x.project.rampSystems=[{id:'S',lotIds:['A','A']}];});
  bad(x=>{x.project.rampSystems=[{id:'S',lotIds:['A']},{id:'S',lotIds:['A']}];});bad(x=>{x.project.parkingLots=[{id:'A',totalStalls:40},{id:'A',totalStalls:40}];});
  for(const t of [20.5,'20',-1,NaN,Infinity])bad(x=>{x.project.parkingLots[0].totalStalls=t;});
  const ok=base();ok.project.parkingLots=[{id:'A',totalStalls:40}];ok.project.rampSystems=[{id:'S1',lotIds:['A']},{id:'S2',lotIds:['A']}];ok.ramps=[clone(ok.ramps[0]),clone(ok.ramps[0])];ok.ramps[0].id='R1';ok.ramps[0].systemId='S1';ok.ramps[1].id='R2';ok.ramps[1].systemId='S2';const r=run(ok);for(const id of ['R1','R2']){assert.equal(one(r,'R01',id).verdict,'PASS');assert.equal(one(r,'R01',id).evidence.rampSystemTotalStalls,40);}
  const part=base();part.project.parkingLots=[{id:'A',totalStalls:40},{id:'B',totalStalls:80}];part.project.rampSystems=[{id:'S',lotIds:['A','B']}];delete part.project.parkingLots[1].totalStalls;const q=expect(run(part),'R01','UNDETERMINED','BRANCH_DIVERGES');assert.ok(q.missingInputs.includes('project.parkingLots[].totalStalls'));assert.equal(q.evidence.rampSystemTotalStalls,null);
  const unrelated=base();unrelated.project.parkingLots=[{id:'A',totalStalls:40},{id:'B',totalStalls:-5}];unrelated.project.rampSystems=[{id:'S',lotIds:['A']}];const r2=run(unrelated);expect(r2,'R01','PASS');expect(r2,'G01','INPUT_ERROR');});
test('T1A-61 L01 방향 상속',()=>{const mk=(st,item,w,d,type)=>{const x=base();if(st)x.stalls.orientation=st;x.stalls.items=[{id:'P',widthMm:w,depthMm:d,declaredType:type,...(item?{orientation:item}:{})}];return x;};
  expect(run(mk('parallel',null,1700,4500,'compact'),NT),'L01','PASS');expect(run(mk('parallel',null,1000,2300,'motorcycle'),NT),'L01','UNDETERMINED','RULE_UNVERIFIED');
  expect(run(mk(null,null,2000,3600,'compact'),NT),'L01','UNDETERMINED','MISSING_INPUT');
  expect(run(mk('parallel','perpendicular',2000,3600,'compact'),NT),'L01','PASS');
  expect(run(mk('perpendicular',null,2000,3600,'compact'),NT),'L01','PASS');
  expect(run(mk(null,'diagonal',2000,3600,'compact'),NT),'L01','INPUT_ERROR');
  expect(run(mk('diagonal',null,2000,3600,'compact'),NT),'L01','INPUT_ERROR');
  expect(run(mk(null,'angled',2000,3500,'compact'),NT),'L01','FAIL');});
test('T1A-62 L01 모드 경계(v1.1.5: candidate 모드는 후보 도형에서 측정)',()=>{let x=NTitem(base());let r=run(x);let q=expect(r,'L01','UNDETERMINED','MISSING_INPUT');assert.ok(q.missingInputs.includes('candidate.geometry.stalls'));assert.notEqual(q.evidence.measurementSource,'declared-test-values');assert.equal(r.overall.mode,'candidate');assert.notEqual(one(r,'G01').verdict,'INPUT_ERROR');
  r=run(x,{mode:'candidate'});expect(r,'L01','UNDETERMINED','MISSING_INPUT');
  r=run(x,NT);q=expect(r,'L01','PASS');assert.equal(q.evidence.measurementSource,'declared-test-values');assert.equal(q.evidence.geometryVerified,false);assert.equal(r.overall.grade,null);assert.equal(r.overall.mode,'numeric-test');
  assert.ok(!r.independence.recomputed.includes('stall.dimensions'));
  x=base();x.stalls.items=[];expect(run(x,NT),'L01','UNDETERMINED','MISSING_INPUT');
  const cand=E.evaluate({input:NTitem(base()),candidate:{geometry:{stalls:[{id:'z',polygon:[]}]}},ruleSet:rules});expect(cand,'L01','INPUT_ERROR');assert.notEqual(one(cand,'L01').evidence.measurementSource,'declared-test-values');});
test('T1A-63 R03 이륜 전용 규칙은 범위 밖, 형상 모순은 입력 오류',()=>{const x=setTotal(curve(base(),3500),40);expect(run(x),'R03','FAIL');
  const m=mutate(s=>{s.rules=s.rules.filter(q=>q.ruleId!=='kr.rule6.p1.5.motorcycle-curve-inner-radius');});expect(runWith(x,m),'R03','FAIL');expect(runWith(setTotal(curve(base(),5500),40),m),'R03','PASS');
  const y=withSeg(base(),[{id:'a',kind:'curve',lengthMm:30000,startLevelMm:0,endLevelMm:3600}]);y.ramps[0].shape.type='straight';const r=run(y);for(const id of ['R01','R02','R03'])expect(r,id,'INPUT_ERROR');
  const z=withSeg(curve(base()),[{id:'a',kind:'straight',lengthMm:24000,startLevelMm:0,endLevelMm:2000}]);expect(run(z),'R03','INPUT_ERROR');
  const w=withSeg(curve(base()),[{id:'a',lengthMm:24000,startLevelMm:0,endLevelMm:2000}]);assert.notEqual(one(run(w),'R03').verdict,'INPUT_ERROR');});
test('T1A-64 G01은 외곽 없이 PASS를 만들지 않는다(v1.1.5: candidate 외곽 누락은 MISSING_INPUT)',()=>{let r=run(base(),NT);let q=expect(r,'G01','UNDETERMINED','NOT_IMPLEMENTED');assert.equal(q.evidence.checked,'input-format-and-numbers');assert.equal(q.evidence.remaining,'polygon-validity');
  const x=base();x.ramps[0].section.legalLaneWidthMm='3300';r=run(x);q=expect(r,'G01','INPUT_ERROR');assert.ok(q.evidence.fields.includes('ramps[0].section.legalLaneWidthMm'));
  const y=base();y.ramps[0].section.vehiclePassableWidthMm=-700;y.generator={gridMm:-5};q=expect(run(y),'G01','UNDETERMINED','MISSING_INPUT');assert.ok(q.missingInputs.includes('floor.outline'));
  assert.ok(run(base()).items.filter(i=>i.domain==='G'&&i.verdict==='PASS').length===0);});
const reg=()=>[].concat(...Object.entries(E.registry).map(([d,ids])=>ids.map(id=>[id,d])));
const fullList=()=>reg().map(([id,d])=>E.makeItem(id,d,'PASS'));
test('T1A-65 집계 방어',()=>{let o=E.computeOverall([],{});assert.equal(o.grade,null);assert.equal(o.notes.missingItemIds.length,39);assert.equal(E.summarize([]).G.domainPassed,false);
  const seven=fullList().slice(0,7);o=E.computeOverall(seven,{editionAssumed:false});assert.notEqual(o.grade,'검토 완료');assert.equal(o.grade,null);assert.equal(o.notes.missingItemIds.length,32);assert.ok(o.notes.missingItemIds.includes('L05'));
  assert.equal(E.computeOverall(fullList(),{editionAssumed:false}).grade,'검토 완료');
  const dup=fullList();dup.push(E.makeItem('R01','R','FAIL'));o=E.computeOverall(dup,{});assert.equal(o.grade,null);assert.ok(o.notes.duplicateItemKeys.includes('R01|'));assert.ok(E.summarize(dup).R.inputError>=1);assert.equal(E.summarize(dup).R.pass,E.summarize(fullList()).R.pass-1);
  const dup2=fullList();dup2.push(E.makeItem('R01','R','PASS'));assert.equal(E.computeOverall(dup2,{}).grade,null);
  const ea=fullList();ea[reg().findIndex(([id])=>id==='R01')]=E.makeItem('R01','R','PASS',null,{editionAssumed:true});o=E.computeOverall(ea,{editionAssumed:false});assert.equal(o.editionAssumed,true);assert.equal(o.grade,'부분 검토');assert.equal(E.computeOverall(fullList(),{editionAssumed:true}).editionAssumed,true);assert.equal(typeof E.computeOverall([],{}).editionAssumed,'boolean');
  const frozen=Object.freeze(fullList().map(Object.freeze));const snap=JSON.stringify(frozen);assert.doesNotThrow(()=>E.computeOverall(frozen,{}));assert.doesNotThrow(()=>E.summarize(frozen));assert.equal(JSON.stringify(frozen),snap);
  assert.ok(Object.isFrozen(E.registry)&&Object.isFrozen(E.registry.G));assert.throws(()=>{E.registry.G.pop();});
  assert.doesNotThrow(()=>E.computeOverall(null,null));});
test('T1A-66 설명 문구와 범위 표시',()=>{const x=withSeg(base(),[{id:'a',kind:'straight',lengthMm:20000,startLevelMm:0,endLevelMm:3600}]);x.ramps[0].shape.lengthMm=20000;x.fixed.entrances=[ent(3500)];const r=run(x);
  const kinds=new Set();for(const q of r.items){assert.equal(typeof q.message,'string');assert.ok(/[가-힣]/.test(q.message),q.id+' '+q.message);kinds.add(q.applicability==='NOT_APPLICABLE'?'NA':q.verdict+'/'+q.reason);}
  for(const k of ['NA','FAIL/VIOLATES_RULE','PASS/MEETS_RULE','UNDETERMINED/NOT_IMPLEMENTED'])assert.ok(kinds.has(k),k);
  assert.ok(/\d/.test(one(r,'R02').message)&&/17/.test(one(r,'R02').message));
  const bad=run((()=>{const y=base();y.ramps[0].section.legalLaneWidthMm=-1;return y;})());for(const q of bad.items)assert.ok(q.message.length>0);
  assert.ok(r.overall.scopeLabel.includes('계약 범위 한정이며 인허가 적합을 뜻하지 않음'));assert.ok(r.overall.scopeLabel.includes('미검증'));
  assert.ok(bad.overall.scopeLabel.includes('계약 범위 한정이며 인허가 적합을 뜻하지 않음'));
  const n=r.overall.notes;assert.ok(n&&!Array.isArray(n));for(const k of ['missingItemIds','assumptions','limitations'])assert.ok(Array.isArray(n[k]),k);
  assert.ok(n.limitations.length>0);for(const q of E.computeOverall(fullList(),{}).notes.limitations)assert.equal(typeof q,'string');
  assert.ok(E.computeOverall(fullList(),{}).scopeLabel.includes('계약 범위 한정이며 인허가 적합을 뜻하지 않음'));});
test('T1A-67 램프 systemId 형식 오류는 그 램프 항목 전부 입력 오류(48차 반례)',()=>{const cases=[base(),setTotal(curve(base(),4500),40),setTotal(curve(base(),6500),40)];for(const x of cases)for(const bad of [123,'',true,{}]){x.ramps[0].systemId=bad;const r=run(x);for(const id of ['R01','R02','R03','R04','R09'])expect(r,id,'INPUT_ERROR');expect(r,'G01','INPUT_ERROR');assert.ok(one(r,'G01').evidence.fields.includes('ramps[0].systemId'));}
  const y=withEnt(base());y.ramps[0].systemId=123;expect(run(y),'L04','PASS');});
test('AUX-01 미구현 설명과 금지어(계약 밖 보조)',()=>{const r=run(base());for(const q of r.items.filter(i=>i.reason==='NOT_IMPLEMENTED'))assert.ok(q.message.length>0);const s=JSON.stringify(run(withEnt(NTitem(base())),NT));for(const w of ['사용 가능','법규 충족','최적안','배치 불가'])assert.ok(!s.includes(w));});
test('AUX-02 무작위 입력 퍼징(계약 밖 보조): 예외 없음, 39개 ID',()=>{const vals=[undefined,null,NaN,-1,0,1,2,'x','',[],{},[null],{a:1},true,1e308,3300,50];const paths=[['project'],['project','permitDate'],['project','parkingKind'],['project','parkingLots'],['project','rampSystems'],['floor'],['floor','heightMm'],['ramps'],['ramps',0],['ramps',0,'shape'],['ramps',0,'shape','type'],['ramps',0,'segments'],['ramps',0,'section'],['ramps',0,'connects'],['ramps',0,'lanes'],['fixed','entrances'],['stalls','items'],['stalls','orientation']];let seed=7;const rnd=n=>(seed=(seed*1103515245+12345)&0x7fffffff)%n;
  for(let i=0;i<400;i++){const x=base();x.stalls.items=[stall(2500,5000,'general')];x.fixed.entrances=[ent()];for(let k=0;k<1+rnd(3);k++){const p=paths[rnd(paths.length)],v=vals[rnd(vals.length)];let o=x;for(let j=0;j<p.length-1;j++){if(o[p[j]]===null||typeof o[p[j]]!=='object')o[p[j]]={};o=o[p[j]];}o[p[p.length-1]]=v===undefined?null:clone(v);}
    for(const opt of [undefined,NT]){let r;assert.doesNotThrow(()=>{r=run(x,opt);},JSON.stringify(x));assert.ok(!r.items.some(q=>q.evidence&&q.evidence.exception),JSON.stringify(x));assert.equal(new Set(r.items.map(q=>q.id)).size,39);for(const q of r.items){assert.ok(q.message.length>0);assert.ok(q.applicability==='NOT_APPLICABLE'?q.verdict===null:['PASS','FAIL','UNDETERMINED','INPUT_ERROR'].includes(q.verdict));}}}});
