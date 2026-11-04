'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fixture=require('../01_src/e2-journey-data.js');
const {build,inspect}=require('../../tools/rebuild-e2-modules.cjs');
test('fixed E2 modules preserve the original and expose fresh unverified geometry',()=>{
  const before=JSON.stringify(fixture),result=build(fixture);
  assert.equal(JSON.stringify(fixture),before);
  assert.deepEqual(result.candidate.fixed,fixture.fixed);
  assert.notEqual(result.candidate.geometryHash,fixture.geometryHash);
  assert.equal(result.candidate.routeEvidence.state,'not-evaluated');
  assert.equal(result.candidate.journeys,undefined);
});
test('P24/P28 area becomes one complete north-facing three-bay structural module',()=>{
  const {candidate:c,summary:s}=build(fixture),m=s.targetModule;
  assert(m);assert.equal(m.kind,'structural-triple');assert.equal(m.indices.length,3);
  assert.deepEqual(m.clearSpan,[28950,36450]);assert.deepEqual(m.inward,[0,-1]);
  assert.equal(m.frontY,21400);
  assert.deepEqual(m.indices.map(i=>c.stalls[i][0]),[[28950,21400],[31450,21400],[33950,21400]]);
});
test('all accepted groups are complete triples or documented wall pairs, never isolated bays',()=>{
  const {candidate:c,summary:s}=build(fixture);
  assert(s.tripleModules>0);assert.equal(s.bays,3*s.tripleModules+2*s.wallPairExceptions);
  assert(c.modules.every(m=>m.kind==='structural-triple'||/^[WE]-wall-/.test(m.id)&&m.reason.includes('7400')));
  assert.equal(inspect(c).passed,true);
});
test('misaligned facing, missing members and moved stalls fail the module audit',()=>{
  const original=build(fixture).candidate;
  for(const mutate of [c=>c.modules[0].indices.pop(),c=>c.stalls[0][0][0]+=100,
                      c=>c.modules[0].inward=[1,0],c=>c.stalls[0]=structuredClone(c.stalls[1])]){
    const c=structuredClone(original);mutate(c);assert.equal(inspect(c).passed,false);
  }
});
test('only the two scoped aisle extensions are added and holes remain non-driving islands',()=>{
  const {candidate:c,summary:s,extensions}=build(fixture),G=require('../01_src/plan/CLAUDE_ugp_geom.js');
  assert.equal(extensions.length,2);assert(s.addedAisleM2>0&&s.addedAisleM2<=9.000001);
  assert(c.aisles.some(P=>G.signedArea(P)<0));
  const island=[[14990,19990],[15010,19990],[15010,20010],[14990,20010]];
  assert.equal(Math.abs(G.areaOf(G.boolOp([island],c.aisles,G.CL.ClipType.ctIntersection))),0);
});
test('modified or unsupported source geometry is rejected and generation is deterministic',()=>{
  const altered=structuredClone(fixture);altered.fixed.columns[0][0][0]+=1;
  assert.throws(()=>build(altered),/preserved fixed E2/);
  assert.deepEqual(build(fixture),build(fixture));
});
