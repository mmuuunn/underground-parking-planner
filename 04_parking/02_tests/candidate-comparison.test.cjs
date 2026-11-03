'use strict';
const {test} = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const {fromPlan, compare} = require('../01_src/plan/candidate-comparison.js');
const E = require('../01_src/plan/CLAUDE_ugp_plan.js');
const rect = (x, y, w, h) => [[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
const clone = structuredClone, hash = x => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const frozen = x => { if (x && typeof x === 'object') { Object.values(x).forEach(frozen); Object.freeze(x); } return x; };
function candidate(id='A', count=1) {
  return {id, title:id, fixed:{mass:rect(0,0,60000,50000),innerOutline:rect(400,400,59200,49200),columns:[],cores:[],ramp:rect(0,5000,60000,6000),landing:[20000,8000]},
    aisles:[rect(1000,1000,50000,20000)],stalls:Array.from({length:count},(_,i)=>rect(34000+i*3000,5500,2500,5000)),ramps:[{id:'R-IN',start:[44000,8000,Math.PI]},{id:'R-OUT',end:[24000,8000,Math.PI]}]};
}
// Synthetic receipts exercise ingestion and continuity; they are not physical vehicle approvals.
function witness(index=0) {
  let q=[44000,8000,Math.PI];
  const phases=['ramp-entry','loop-to-parking','parking-entry','parking-exit','loop-to-ramp','ramp-exit'].map((id,i)=>{
    const start=q.slice(),gear=i===2?-1:1,L=i===2||i===3?1000:i===1?5000-index*3000:i===4?5000+index*3000:5000;
    q=[q[0]-gear*L,q[1],q[2]];
    return {id,start,end:q.slice(),margin:i===2||i===3?100:200,controls:[{gear,curvature:0,lengthMm:L}]};
  });
  return {id:'P'+index,index,state:'full-planar-journey-found',parked:phases[2].end,roundTripGearChanges:2,travelM:22,phases};
}
function report(candidates, records=candidates.map(c=>[witness()])) {
  const groups=candidates.map((c,i)=>({id:c.id,geometryHash:hash({fixed:c.fixed,aisles:c.aisles,stalls:c.stalls}),results:records[i],summary:{fullJourneys:records[i].filter(r=>r.state==='full-planar-journey-found').length}}));
  return {criteria:{sameVehicle:true,drivingMarginMm:200,parkingAndLocalConnectionMarginMm:100,minRearAxleRadiusMm:4500,sampleMm:25,intermediateGuardMm:26,scope:'single moving vehicle planar'},groups,
    audit:{passed:true,maxOutsideMm2:0,maxObstacleMm2:0,stepMm:25,extraGuardMm:26,candidates:groups.map((g,i)=>({id:g.id,geometryHash:g.geometryHash,placed:candidates[i].stalls.length,fullJourneys:g.summary.fullJourneys}))}};
}

test('missing evidence remains unknown even if the generator declares FEASIBLE',()=>{
  const c=candidate();c.sourceStatus='FEASIBLE';const r=compare([c]);
  assert.equal(r.feasibilityVerdict,null);assert.equal(r.rows[0].sourceStatus,'FEASIBLE');
  assert.equal(r.rows[0].placedStalls,1);assert.equal(r.rows[0].stallM2,12.5);
  assert.equal(r.rows[0].evidence.fullJourneyCount,null);assert.equal(r.rows[0].evidence.unverifiedStalls,1);
  assert.equal(r.rows[0].comparison.measurementConditionsMatch,null);assert.equal(r.rows[0].evidence.physicalRecheck,false);
});
test('bound reports preserve partial and missing results without calling them failures',()=>{
  const candidates=[candidate('A',2),candidate('B')],proof=report(candidates,[[witness(),{index:1,state:'not-found-within-budget'}],[witness()]]),before=clone({candidates,proof});
  const result=compare(frozen(candidates),frozen(proof));assert.deepEqual({candidates,proof},before);
  assert.equal(result.rows[0].evidence.state,'imported-bound-report');assert.equal(result.rows[0].evidence.fullJourneyCount,1);
  assert.equal(result.rows[0].evidence.unverifiedStalls,1);assert.deepEqual(result.rows[0].evidence.gearChangeDistribution,{'2':1});
  assert.equal(result.rows[0].evidence.meanTravelM,22);assert.equal(result.rows[1].comparison.layoutDeltaStalls,-1);
  assert.equal(result.rows[1].comparison.journeyDeltaStalls,0);
});
test('changed columns invalidate stale evidence only for the affected candidate',()=>{
  const candidates=[candidate('A'),candidate('B')],proof=report(candidates);candidates[1].fixed.columns.push(rect(10000,10000,500,500));
  const result=compare(candidates,proof);assert.equal(result.rows[0].evidence.fullJourneyCount,1);
  assert.equal(result.rows[1].evidence.state,'rejected');assert.deepEqual(result.rows[1].evidence.reasons,['geometry-hash-mismatch']);
  assert.equal(result.rows[1].comparison.fixedInputMatches,false);assert.equal(result.rows[1].comparison.layoutDeltaStalls,null);
});
test('current reports with different fixed inputs are displayed but not compared',()=>{
  const candidates=[candidate('A'),candidate('B')];candidates[1].fixed.columns=[rect(10000,10000,500,500)];
  const result=compare(candidates,report(candidates));assert.equal(result.rows[1].evidence.fullJourneyCount,1);
  assert.equal(result.rows[1].comparison.journeyDeltaStalls,null);assert(result.rows[1].comparison.reasons.includes('fixed-input-mismatch'));
});
test('different declared vehicle conditions cannot produce a journey delta',()=>{
  const candidates=[candidate('A'),candidate('B')],proof=report(candidates);
  proof.groups[1].criteria={...proof.criteria,scope:'different vehicle dimensions declared by source'};
  const row=compare(candidates,proof).rows[1];assert.equal(row.evidence.fullJourneyCount,1);
  assert.equal(row.comparison.measurementConditionsMatch,false);assert.equal(row.comparison.journeyDeltaStalls,null);
});
test('bad audits, counts, duplicate stalls and local paths cannot inflate the full count',()=>{
  const candidates=[candidate('A',2)];
  const mutations=[
    p=>{p.audit.passed=false;},p=>{p.audit.candidates[0].geometryHash='stale';},p=>{p.groups[0].summary.fullJourneys=999;},
    p=>{p.groups[0].results[1].index=0;},p=>{p.groups[0].results[0].phases=p.groups[0].results[0].phases.slice(2,4);},
    p=>{p.groups[0].results[0].phases[1].start[0]+=300;},p=>{p.groups[0].results[0].roundTripGearChanges=0;},
    p=>{p.groups[0].results[0].travelM=1;},p=>{p.groups[0].results[0].phases[2].margin=0;},
    p=>{p.groups[0].results[0].phases[0].controls[0].curvature=1/1000;},p=>{p.criteria.sampleMm=100;},
    p=>{delete p.criteria.sameVehicle;},p=>{p.audit.maxObstacleMm2=100;}
  ];
  for(const mutate of mutations){const proof=report(candidates,[[witness(),witness(1)]]);mutate(proof);const row=compare(candidates,proof).rows[0];assert.equal(row.evidence.state,'rejected');assert.equal(row.evidence.fullJourneyCount,null);assert.equal(row.evidence.unverifiedStalls,2);}
});
test('invalid geometry and ambiguous identifiers are rejected at ingestion',()=>{
  assert.throws(()=>compare([]));assert.throws(()=>compare([candidate(),candidate()]));
  const c=candidate();c.aisles[0][0][0]=NaN;assert.throws(()=>compare([c]),/유한한/);
  const candidates=[candidate()],p=report(candidates);p.groups.push(clone(p.groups[0]));assert.throws(()=>compare(candidates,p),/후보 목록/);
});
test('opposite polygon winding cannot cancel occupied stall area',()=>{
  const c=candidate('A',2);c.stalls[1].reverse();const row=compare([c]).rows[0];assert.equal(row.stallM2,25);
  const other=clone(c);other.stalls[1].reverse();assert.equal(compare([other]).rows[0].unallocatedM2,row.unallocatedM2);
});
test('duplicate stall geometry is rejected for every starting vertex and winding without mutating indices',()=>{
  for(const reverse of [false,true])for(let start=0;start<4;start++)for(const closed of [false,true]){
    const c=candidate('A',2),p=clone(c.stalls[0]);if(reverse)p.reverse();
    c.stalls[1]=p.slice(start).concat(p.slice(0,start));if(closed)c.stalls[1].push(clone(c.stalls[1][0]));
    const before=clone(c);assert.throws(()=>compare([frozen(c)]),/duplicate-stall-geometry/);assert.deepEqual(c,before);
  }
  const c=candidate('A',2),row=compare([c],report([c],[[witness(),witness(1)]])).rows[0];
  assert.equal(row.placedStalls,2);assert.equal(row.stallM2,25);assert.equal(row.evidence.fullJourneyCount,2);
});
test('a continuous journey copied to another stall index is rejected even with the original receipt',()=>{
  const c=candidate('A',2),proof=report([c],[[witness(),witness(1)]]),before=clone(c);
  proof.groups[0].results[1]={...clone(proof.groups[0].results[0]),index:1,id:'P1'};
  const row=compare([c],proof).rows[0];assert.equal(row.evidence.state,'rejected');
  assert.deepEqual(row.evidence.reasons,['parked-stall-mismatch']);assert.equal(row.evidence.fullJourneyCount,null);
  assert.equal(row.evidence.unverifiedStalls,2);assert.deepEqual(c,before);
});
test('parked reference points use the actual polygon including its boundary and winding',()=>{
  for(const [polygon,valid] of [[rect(35000,8000,2500,5000),true],[rect(35000.001,8000,2500,5000),false],
    [[[34000,7000],[37000,7000],[37000,7500],[34500,7500],[34500,10000],[34000,10000]],false]]){
    for(const p of [polygon,polygon.slice().reverse()]){
      const c=candidate();c.stalls=[p];const row=compare([c],report([c])).rows[0];
      assert.equal(row.evidence.state,valid?'imported-bound-report':'rejected');
      if(!valid)assert.deepEqual(row.evidence.reasons,['parked-stall-mismatch']);
    }
  }
});
test('aisle area unions overlaps and disjoint contours while preserving holes and islands',()=>{
  const a=rect(0,0,10000,6000),disjoint=rect(20000,0,10000,6000),outer=rect(0,0,10000,10000),hole=rect(3000,3000,4000,4000).reverse(),island=rect(4000,4000,2000,2000);
  for(const [aisles,expected] of [[[a,rect(5000,0,10000,6000)],90],[[a,disjoint],120],[[a,disjoint.slice().reverse()],120],
    [[outer,hole],84],[[outer,hole,island,disjoint.slice().reverse()],148],[[outer.slice().reverse(),hole.slice().reverse()],84],[[],0]]){
    const c=candidate();c.aisles=aisles;const before=clone(c);assert.equal(compare([frozen(c)]).rows[0].aisleM2,expected);assert.deepEqual(c,before);
  }
});
test('audit areas reject negative or out-of-range values and retain zero and positive tolerance',()=>{
  for(const key of ['maxOutsideMm2','maxObstacleMm2'])for(const value of [-.001,-1,-100,-1000000,0,.001,.5,1,1.001,NaN,Infinity]){
    const c=candidate(),proof=report([c]);proof.audit[key]=value;const row=compare([c],proof).rows[0],valid=Number.isFinite(value)&&value>=0&&value<=1;
    assert.equal(row.evidence.state,valid?'imported-bound-report':'rejected');
    assert.equal(row.evidence.fullJourneyCount,valid?1:null);if(!valid)assert.deepEqual(row.evidence.reasons,['audit-not-passed']);
  }
});
test('native generate and generateConnected adapters preserve the input and outputs',()=>{
  const ramp=E.createStraightRamp({landing:[5000,15000],tangent:[1,0],widthMm:6000,lengthMm:24000});
  const input={mass:rect(0,0,60000,50000),cores:[],phase:[0,0],allowExternalRamp:true,ramp,grid:{columnAxes:{x:[20000,28000,36000,44000],y:[5000,45000]}}};
  const generated=E.generate(input),connected=E.generateConnected(input,[{points:[[5000,15000],[10000,15000]]},{points:[[10000,15000],[50000,15000],[50000,35000],[10000,35000],[10000,15000]]}]);
  const before=clone({input,generated,connected});const rows=compare([fromPlan('generated',input,generated),fromPlan('connected',input,connected)]).rows;
  assert.equal(rows[0].placedStalls,generated.stalls.length);assert.equal(rows[1].placedStalls,connected.stalls.length);
  assert.equal(rows[1].sourceStatus,connected.status);assert(rows.every(r=>r.evidence.fullJourneyCount===null));
  assert.deepEqual({input,generated,connected},before);
});
test('CLI is usable, rejects malformed JSON, and never overwrites its inputs',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'candidate-comparison-')),cli=path.resolve(__dirname,'../../tools/compare-candidates.cjs');
  try {const candidates=[candidate()],proof=report(candidates),a=path.join(temp,'candidates.json'),b=path.join(temp,'evidence.json');fs.writeFileSync(a,JSON.stringify({candidates}));fs.writeFileSync(b,JSON.stringify(proof));const before=[fs.readFileSync(a,'utf8'),fs.readFileSync(b,'utf8')];
    const result=JSON.parse(cp.execFileSync(process.execPath,[cli,a,b],{encoding:'utf8'}));assert.equal(result.rows[0].evidence.fullJourneyCount,1);
    assert.deepEqual([fs.readFileSync(a,'utf8'),fs.readFileSync(b,'utf8')],before);
    fs.writeFileSync(b,'{invalid');assert.notEqual(cp.spawnSync(process.execPath,[cli,a,b],{encoding:'utf8'}).status,0);
    assert(cp.execFileSync(process.execPath,[cli,'--help'],{encoding:'utf8'}).includes('사용법'));
  } finally {assert(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep+'candidate-comparison-'));fs.rmSync(temp,{recursive:true});}
});
