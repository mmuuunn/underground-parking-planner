'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const P=require('./parking-comparison-basis.cjs');
const basis=P.read(),checks=[],test=(name,fn)=>{fn();checks.push(name);};
const baseline=P.run(basis),primary=baseline.receipts.find(r=>r.id==='regular').receipt;
const clone=structuredClone,rebind=r=>{r.inputHash=P.hash(r.input);if(r.plan){r.planHash=P.hash(r.plan);r.physicalHash=P.hash(P.physical(r.plan));}return r;};
const compare=r=>P.compare(primary,r,basis);
test('six frozen automatic baselines reproduce their exact input and output',()=>{
 assert.equal(baseline.receipts.length,6);for(const r of baseline.receipts)assert(r.selfComparison.sameConditions);
 assert.deepEqual(baseline.receipts.filter(r=>r.receipt.plan).map(r=>[r.id,r.receipt.plan.stallCount]),[['regular',50],['core',46],['notch',22],['slope',42],['landing-block',0]]);
});
test('structure-aligned phase is derived from axes, not a searched capacity optimum',()=>{
 assert.deepEqual(basis.phaseDerivation.phase,[3600,7600]);
 for(const spec of basis.cases){assert.equal(spec.premise.partial.length,0);assert.equal(spec.premise.omitted.length,0);assert(spec.premise.regularModule);
  assert.equal(spec.premise.inside+spec.premise.outside,spec.premise.allIntersections);}
});
test('identical 50-bay plans have zero gain and never receive improvement credit',()=>{
 const r=compare(clone(primary));assert(r.sameConditions);assert.equal(r.capacityDelta,0);assert.equal(r.decision,'NO_IMPROVEMENT');assert.equal(r.productApproval,false);
});
test('raw FEASIBLE does not hide the independently detected blocked entry',()=>{
 assert.equal(primary.plan.status,'FEASIBLE');assert.equal(primary.routes.entry,'blocked');assert.equal(primary.routes.entryIssue,'VEHICLE_OUTSIDE_LANE');
 const r=compare(clone(primary));assert(r.failures.includes('displayed-vehicle-route-not-clear'));assert.equal(r.wholeJourney,'NOT_EVALUATED');
});
test('small hall keeps its actual generation error rather than becoming a zero-bay success',()=>{
 const r=baseline.receipts.find(r=>r.id==='hall');assert.equal(r.selfComparison.decision,'SAME_KNOWN_ERROR');assert.equal(r.selfComparison.capacityDelta,null);assert(!r.receipt.plan);
});
test('product and connected-network effective profiles are genuinely different',()=>{
 const a=P.effective(primary.input),b=P.effective({...primary.input,aisleSurfaceMode:'network',obstacleClearance:'euclidean',trafficMode:'two-way',stallRowSelection:'continuous',stallRowAlignment:'back-to-back'},'generateConnected');
 assert.equal(a.stallStripProjection,'occupied-bands');assert.equal(b.stallStripProjection,'envelope');assert.notEqual(P.hash(a),P.hash(b));assert.deepEqual(a,basis.policy);
});
test('changed envelope input blocks comparison even when a receipt is rebound',()=>{
 const r=clone(primary);r.input.mass[0][0]+=100;const v=compare(rebind(r));assert(!v.sameConditions);assert(v.blocked.includes('input-changed'));assert.equal(v.capacityDelta,null);
});
test('changed phase or missing structural intersection cannot enter the comparison',()=>{
 for(const mutate of [r=>r.input.phase[0]+=400,r=>r.input.grid.columnAxes.y.splice(1,1)]){const r=clone(primary);mutate(r);assert(!compare(rebind(r)).sameConditions);}
});
test('switching loop to two-way is an incompatible policy, not an improvement',()=>{
 const r=clone(primary);r.input.trafficMode='two-way';r.policy=P.effective(r.input);const v=compare(rebind(r));assert(!v.sameConditions);assert(v.blocked.includes('effective-policy-changed'));
});
test('declared policy cannot disagree with the policy derived from the input',()=>{
 const r=clone(primary);r.policy.stallStripProjection='envelope';assert(compare(r).blocked.includes('effective-policy-changed'));
});
test('supplied centerlines cannot masquerade as a product automatic call',()=>{
 const r=clone(primary);r.entryPoint='generateConnected';r.plan.networkCandidate={source:'supplied-centerlines'};const v=compare(rebind(r));assert(!v.sameConditions);assert(v.blocked.includes('automatic-entry-required'));
});
test('shared verifier source, runtime or source manifest changes block comparison',()=>{
 const r=clone(primary),key=Object.keys(r.sources.shared).find(k=>k.includes('ugp_verify'));r.sources.shared[key]='0'.repeat(64);assert(compare(r).blocked.includes('shared-calculation-or-verifier-source-changed'));
 const v=clone(primary);v.runtime='different-node';assert(compare(v).blocked.includes('runtime-changed'));
 const m=clone(primary);delete m.sources.generation[Object.keys(m.sources.generation)[0]];assert(compare(m).blocked.includes('generation-source-manifest-changed'));
});
test('only the declared generator sources may differ without changing comparison conditions',()=>{
 const r=clone(primary);r.sources.generation[basis.allowedGenerationSourceChanges[0]]='0'.repeat(64);const v=compare(r);assert(v.sameConditions);assert.equal(v.decision,'NO_IMPROVEMENT');
});
test('deleting a column or moving the ramp fails even with fresh output hashes',()=>{
 for(const mutate of [r=>r.plan.columns.pop(),r=>r.plan.ramp.landing[0]+=100]){const r=clone(primary);mutate(r);const v=compare(rebind(r));assert(!v.sameConditions);assert(v.blocked.includes('fixed-geometry-changed'));}
});
test('fixed core dimensions are bound separately from the input declaration',()=>{
 const a=baseline.receipts.find(r=>r.id==='core').receipt,r=clone(a);r.plan.cores[0].pts[0][0]+=100;
 assert(P.compare(a,rebind(r),basis).blocked.includes('fixed-geometry-changed'));
});
test('duplicate stall cannot become a one-bay improvement',()=>{
 const r=clone(primary);r.plan.stalls.push(clone(r.plan.stalls[0]));r.plan.stallCount++;
 const v=compare(rebind(r));assert(v.sameConditions);assert(v.failures.includes('kept-stall-geometry-or-access-failed'));assert.notEqual(v.decision,'CANDIDATE_FOR_REVIEW');
});
test('a copied count without a real stall is rejected',()=>{
 const r=clone(primary);r.plan.stallCount++;const v=compare(rebind(r));assert(v.failures.includes('stall-count-disagrees-with-geometry'));assert.notEqual(v.decision,'CANDIDATE_FOR_REVIEW');
});
test('generator evaluation budget must be recorded for changed outputs',()=>{
 const r=clone(primary);r.plan.stalls.pop();r.plan.stallCount--;const v=compare(rebind(r));assert(v.failures.includes('candidate-evaluation-budget-unverified'));assert(v.failures.includes('capacity-loss'));
});
test('old success expectations, whole-journey promotion and missing metadata are refused',()=>{
 const invalid=clone(primary);invalid.planHash='not-original';assert.throws(()=>P.compare(invalid,primary,basis),/baseline mismatch/);
 const r=clone(primary);r.fullJourneyVerdict='PASS';assert(compare(r).blocked.includes('unsupported-whole-journey-promotion'));
 const missing=clone(primary);delete missing.sources;assert(compare(missing).blocked.includes('comparison-metadata-missing'));
});
test('adding a DA proposal or local playback cannot grant product approval',()=>{
 const r=clone(primary);r.plan.localPlayback={state:'path-found'};r.plan.areas.daM2+=100;const v=compare(rebind(r));assert.notEqual(v.decision,'CANDIDATE_FOR_REVIEW');assert.equal(v.productApproval,false);assert.equal(v.wholeJourney,'NOT_EVALUATED');
});
if(!process.argv.includes('--check')){fs.mkdirSync(P.OUT,{recursive:true});fs.writeFileSync(path.join(P.OUT,'guard-checks.json'),JSON.stringify({passed:checks.length,checks},null,2));}
console.log(JSON.stringify({passed:checks.length,checks,baselineCounts:baseline.receipts.map(r=>({id:r.id,count:r.receipt.plan?.stallCount,decision:r.selfComparison.decision}))},null,2));
