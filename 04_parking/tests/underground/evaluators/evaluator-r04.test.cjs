'use strict';
// 완화구간 판정(R04) 계약 v0.1 시험 T04-01–14. 04_docs/underground-ramp-transition-contract.md
const test=require('node:test');
const assert=require('node:assert/strict');
const E=require('../../../src/underground/evaluators/evaluator-core.js');
const rules=require('../../../src/underground/rules/kr-parking-rules-2026-07-27.json');

// 구간은 위층 → 아래층 순서 [id, kind, 길이, 내려가는 높이]
const ramp=(segs,{reverse=false}={})=>{let z=0;const S=segs.map(([id,kind,lengthMm,drop])=>{const s={id,kind,lengthMm,startLevelMm:z,endLevelMm:z-drop};z-=drop;return s;});
  const out=reverse?S.slice().reverse().map(s=>({...s,startLevelMm:s.endLevelMm,endLevelMm:s.startLevelMm})):S;
  return{id:'R',systemId:'S',shape:{type:segs.some(s=>s[1]==='curve')?'curve':'straight',lengthMm:S.reduce((n,s)=>n+s.lengthMm,0),innerRadiusMm:6000},lanes:2,operation:'twoWay',
    section:{legalLaneWidthMm:6500,wallToCurbMm:{left:300,right:300},curb:{left:{heightMm:150},right:{heightMm:150}}},segments:out,connects:{upperLevelMm:0,lowerLevelMm:z}};};
const run=(r,total=80,ruleSet=rules)=>E.evaluate({ruleSet,input:{project:{permitDate:'2026-10-24',parkingKind:'noeoe',parkingLots:[{id:'A',totalStalls:total}],rampSystems:[{id:'S',lotIds:['A']}]},floor:{id:'B1',levelMm:0,heightMm:3800},ramps:[r],fixed:{entrances:[]}},candidate:{schema:'ug-candidate/0.1',geometry:{stalls:[]}}});
const r04=(...a)=>run(...a).items.find(x=>x.id==='R04');
const verdict=(...a)=>{const x=r04(...a);return x.applicability==='NOT_APPLICABLE'?'NA':x.verdict;};
const ST=['s','straight',20000,3400],TOP=['t','transition',1700,144];

test('T04-01 직선 17% 완화 없음은 위 끝 볼록 실패',()=>{const x=r04(ramp([ST]));assert.equal(x.verdict,'FAIL');assert.equal(x.evidence.failedBreak.type,'convex');assert.equal(x.evidence.failedBreak.upper,'upperFloor');});
test('T04-02 위 완화 1,700·8.47%는 통과',()=>{const x=r04(ramp([TOP,ST]));assert.equal(x.verdict,'PASS');assert.equal(x.evidence.maxSlopePct,17);assert.match(x.evidence.assumption,/평평/);});
test('T04-03 위 완화 1,699는 실패',()=>assert.equal(verdict(ramp([['t','transition',1699,144],ST])),'FAIL'));
test('T04-04 완화 경사가 최대의 ½을 1mm 넘으면 실패',()=>{const x=r04(ramp([['t','transition',1700,145],ST]));assert.equal(x.verdict,'FAIL');assert.deepEqual(x.evidence.failedBreak.tooSteepTransitionIds,['t']);});
test('T04-05 최대 10%면 완화 6%는 실패(실제 최대의 ½ = 5%)',()=>{assert.equal(verdict(ramp([['t','transition',1700,102],['s','straight',20000,2000]])),'FAIL');assert.equal(verdict(ramp([['t','transition',1700,85],['s','straight',20000,2000]])),'PASS');});
test('T04-06 직선 8.4%는 변화가 기준 미만이라 요구 없음',()=>{const x=r04(ramp([['s','straight',20000,1680]]));assert.equal(x.verdict,'PASS');assert.ok(x.evidence.breaks.every(b=>!b.required));});
test('T04-07 곡선 7%는 볼록 실패, 6.9%는 통과',()=>{assert.equal(verdict(ramp([['c','curve',20000,1400]])),'FAIL');assert.equal(verdict(ramp([['c','curve',20000,1380]])),'PASS');});
test('T04-07b 직선–곡선 경계는 곡선 기준 7%p(D2)',()=>{const y=r04(ramp([TOP,['c','curve',20000,2700],['s','straight',20000,1200]]));const k=y.evidence.breaks.find(q=>q.lower==='s'&&q.upper==='c');assert.equal(k.thresholdPct,7);assert.equal(k.type,'concave');});
test('T04-08 100대: 아래 오목 2m 없으면 실패',()=>{const x=r04(ramp([TOP,ST]),100);assert.equal(x.verdict,'FAIL');assert.equal(x.evidence.failedBreak.type,'concave');assert.equal(x.evidence.failedBreak.requiredMm,2000);});
test('T04-09 100대: 위 1.7m + 아래 2m 통과',()=>assert.equal(verdict(ramp([TOP,ST,['b','transition',2000,160]]),100),'PASS'));
test('T04-10 99대: 오목 요구 없음',()=>assert.equal(verdict(ramp([TOP,ST]),99),'PASS'));
test('T04-11 구간을 아래→위로 넣어도 같은 결과',()=>{for(const [segs,n] of [[[TOP,ST],80],[[TOP,ST],100],[[ST],80],[[TOP,ST,['b','transition',2000,160]],100]]){const a=r04(ramp(segs),n),b=r04(ramp(segs,{reverse:true}),n);assert.equal(b.verdict,a.verdict);assert.deepEqual(b.evidence.breaks,a.evidence.breaks);}});
test('T04-12 kind 누락은 확인 불가',()=>{const r=ramp([TOP,ST]);delete r.segments[0].kind;const x=r04(r);assert.equal(x.reason,'MISSING_INPUT');assert.deepEqual(x.missingInputs,['ramp.segments[0].kind']);});
test('T04-13 규칙 자료가 결과를 바꿈 / 레코드가 없으면 확인 불가',()=>{const m=structuredClone(rules);m.rules.find(q=>q.ruleId==='kr.rule6.p1.5.transition-break-straight').quantity.value=8.3;assert.equal(verdict(ramp([['s','straight',20000,1680]]),80,m),'FAIL');
  const d=structuredClone(rules);d.rules=d.rules.filter(q=>q.ruleId!=='kr.rule6.p1.5.transition-max-slope-ratio');assert.equal(r04(ramp([TOP,ST]),80,d).reason,'RULE_UNVERIFIED');
  const c=structuredClone(rules);c.rules=c.rules.filter(q=>q.ruleId!=='kr.rule6.p1.5.transition-concave-100');assert.equal(verdict(ramp([TOP,ST]),80,c),'PASS');assert.equal(r04(ramp([TOP,ST]),100,c).reason,'RULE_UNVERIFIED');});
test('T04-14 층 바닥 가정은 종합 가정 목록에 오른다',()=>assert.ok(run(ramp([TOP,ST])).overall.notes.assumptions.some(a=>/평평/.test(a))));
test('T04-15 (89차 반례) 소수 mm 고도·아주 긴 구간·소수 넷째 자리 규칙도 정확히 비교',()=>{
  const r=ramp([['s','straight',21454,0]]);r.segments[0].startLevelMm=-1728.9;r.segments[0].endLevelMm=-3552.49;r.connects={upperLevelMm:-1728.9,lowerLevelMm:-3552.49};
  const x=r04(r,100);assert.equal(x.verdict,'FAIL');assert.equal(x.evidence.breaks.length,2);
  const y=ramp([['a','straight',19960319,-783455],['b','straight',16363087,748601]]);assert.equal(verdict(y),'PASS');
  const m=structuredClone(rules);m.rules.find(q=>q.ruleId==='kr.rule6.p1.5.transition-break-straight').quantity.value=8.4996;assert.equal(verdict(ramp([['s','straight',1000000,84998]]),80,m),'FAIL');});
test('T04-16 (89차 반례) 완화구간 표시라도 최대의 ½보다 급하면 자리와 상관없이 실패',()=>{
  assert.equal(verdict(ramp([['t','transition',20000,3400]])),'FAIL');
  const x=r04(ramp([['a','straight',10000,500],['t','transition',2000,340],['b','straight',10000,500]]));assert.equal(x.verdict,'FAIL');assert.deepEqual(x.evidence.tooSteepTransitionIds,['t']);});
test('T04-17 직선–곡선 경계는 오르막으로 들어서는 쪽의 종류를 따른다(사용자 결정 2026-10-26)',()=>{
  // 위 직선 6.9%, 아래 곡선 14%: 오르막으로 곡선에서 직선으로 들어서므로 8.5%p 기준 → 변화 7.1%p는 꺾임이 아님
  const up=r04(ramp([['s','straight',20000,1380],['c','curve',20000,2800]]));assert.equal(up.verdict,'PASS');assert.ok(!up.evidence.breaks.some(b=>b.lower==='c'&&b.upper==='s'));
  // 반대로 위가 곡선이면 들어서는 쪽이 곡선이라 7%p 기준 → 꺾임으로 잡히고 100대에서는 완화구간이 없어 실패
  const dn=r04(ramp([['c','curve',20000,2800],['s','straight',20000,1380]]),100);const b=dn.evidence.breaks.find(q=>q.lower==='s'&&q.upper==='c');assert.equal(b.thresholdPct,7);assert.equal(dn.verdict,'FAIL');});
test('T04-18 설계 권장 경고: 평평한 완화구간은 R04 통과지만 경고, ½ 완화구간은 경고 없음',()=>{
  const flat=r04(ramp([['t','transition',1700,0],ST]));assert.equal(flat.verdict,'PASS');assert.equal(flat.evidence.advisories.length,1);assert.match(flat.message,/설계 권장 경고 1건/);
  const half=r04(ramp([TOP,ST]));assert.equal(half.verdict,'PASS');assert.deepEqual(half.evidence.advisories,[]);assert.doesNotMatch(half.message,/경고/);});
