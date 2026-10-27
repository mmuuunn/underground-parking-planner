'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../01_src/plan/CLAUDE_ugp_plan.js'),N=require('../01_src/plan/CLAUDE_ugp_network.js');
const wide={aisles:[[[-20000,-20000],[20000,-20000],[20000,20000],[-20000,20000]]],columns:[],cores:[],occupants:[],graph:{hasLoop:true,rootId:0}};
test('F1/F2 a U-turn and a subdivided rapid turn stop for direction change',()=>{
  for(const P of [[[-15000,0],[10000,0],[-15000,500]],[[-15000,0],[0,0],[342,940],[-15000,6540]]]){const v=E.checkVehiclePath(wide,P);assert.equal(v.state,'blocked');assert.equal(v.firstIssue.id,'VEHICLE_SHARP_TURN');assert(v.firstIssue.angleDeg>90);assert(v.stopDistanceMm<v.lengthMm);}
});
test('a rapid multi-bend turn reports the bend that crosses the limit',()=>{
  const P=[[0,0],[3000,0],[4000,1000],[4000,3000],[3000,4000]];
  const v=E.checkVehiclePath(wide,P);
  assert.equal(v.state,'blocked');
  assert.equal(v.firstIssue.id,'VEHICLE_SHARP_TURN');
  assert.deepEqual(v.firstIssue.at,[4000,3000]);
  assert.equal(v.firstIssue.distanceMm,3000+Math.SQRT2*1000+2000);
  assert.equal(v.stopDistanceMm,Math.round(v.firstIssue.distanceMm-v.vehicle.lengthMm/2-100));
});
test('when multiple bends violate the limit, the earliest crossing is reported',()=>{
  const P=[[0,0],[3000,0],[3420,-940],[4186,-297],[3686,569]];
  const v=E.checkVehiclePath(wide,P);
  assert.equal(v.state,'blocked');
  assert.equal(v.firstIssue.id,'VEHICLE_SHARP_TURN');
  assert.deepEqual(v.firstIssue.at,[3420,-940]);
  assert.equal(v.firstIssue.distanceMm,3000+Math.hypot(420,-940));
  assert.equal(v.stopDistanceMm,Math.round(v.firstIssue.distanceMm-v.vehicle.lengthMm/2-100));
});
test('P1 gradual 90 and 180 degree arcs stay clear',()=>{
  for(const steps of [30,60]){const P=[[-15000,-6000],[0,-6000]];for(let k=1;k<=steps;k++){const t=-Math.PI/2+k*Math.PI/60;P.push([6000*Math.cos(t),6000*Math.sin(t)].map(Math.round));}P.push(steps===30?[6000,15000]:[-15000,6000]);assert.equal(E.checkVehiclePath(wide,P).state,'clear');}
});
const mass=[[0,18000],[15000,0],[101481,0],[101481,51840],[0,51840]],input={mass,ucs:0,cores:[],phase:[7400,3600],floorMm:3800,allowExternalRamp:true},ramp=y=>({x:11850,y,angleDeg:270,widthMm:6000,lengthMm:24000});
test('F3/F4 both ramp forms report the same short approach and the unresolved 140 degree corner',()=>{
  const a=E.generate({...input,ramp:ramp(26000)}),b=E.generate({...input,ramp:E.createStraightRamp(ramp(26000))});
  for(const p of [a,b]){assert.equal(p.stallCount,120);assert.equal(p.ramp.approach.accepted,false);assert(p.ramp.approach.firstStraightMm<6000);assert(p.violations.some(v=>v.id==='RAMP_OFFGRID'));assert(p.issues.some(v=>v.id==='RING_SHARP_TURN'&&v.at));const routes=E.inspectVehicleRoutes(p);assert.equal(routes.entry.state,'blocked');assert.equal(routes.exit.state,'blocked');}
  assert.deepEqual(a.ramp.approach,b.ramp.approach);
});
test('P3 aligned and raw external ramps share a connected graph',()=>{
  for(const r of [ramp(43440),E.createStraightRamp(ramp(43440))]){const p=E.generate({...input,ramp:r});assert.equal(p.stallCount,130);assert(p.graph.hasLoop);assert.equal(p.planningBoundary.bodyOutsideMm2,0);assert.deepEqual(p.grid.phase,[7400,3600]);}
});
test('nearby graph endpoints merge across a bucket boundary, distinct endpoints do not',()=>{
  const p=[11850,36000],q=[11850+1e-8,36000-1e-8],g=N.buildGraph([{a:[0,0],b:p,kind:'ring'},{a:q,b:[20000,0],kind:'ring'},{a:[20000,0],b:[0,0],kind:'ring'}]);assert.equal(g.nodes.length,3);assert.equal(g.edges.length,3);
  const far=N.buildGraph([{a:[0,0],b:[1000,0],kind:'ring'},{a:[1031,0],b:[2000,0],kind:'ring'}]);assert.equal(far.nodes.length,4);
});
test('P2 baseline capacities are preserved and no rapid turn is returned clear',()=>{
  for(const c of require('./fixtures/underground-golden-cases.json').cases){const p=E.generate(c.input);assert.equal(p.stallCount,c.expected.stallCount,c.id);const routes=E.inspectVehicleRoutes(p);for(const key of ['entry','exit']){const v=routes[key];assert(v.state==='clear'||v.firstIssue?.note,c.id+' '+key);}}
});
// 103: routes are joined on the unrounded centre line, so the junction turn is the real one.
// These baselines drive a full lap without stopping; the others stop for a real cause.
test('P2b junction joins do not invent stops on the baselines',()=>{
  const cases=Object.fromEntries(require('./fixtures/underground-golden-cases.json').cases.map(c=>[c.id,E.inspectVehicleRoutes(E.generate(c.input))]));
  for(const id of ['rectangle','diagonal','nowon-user-snapshot','narrow-wing'])for(const key of ['entry','exit'])assert.equal(cases[id][key].state,'clear',id+' '+key+' '+JSON.stringify(cases[id][key].firstIssue));
  assert.equal(cases['l-shape'].entry.firstIssue.id,'RAMP_APPROACH');
  // all-oblique: the ring U-turns round a 3.6 m island at its lower-left corner (ring shape, not the join).
  assert.equal(cases['all-oblique'].entry.firstIssue.id,'VEHICLE_SHARP_TURN');
  const moved=E.inspectVehicleRoutes(E.generate({...input,ramp:ramp(43440)}));assert.equal(moved.entry.state,'clear');assert.equal(moved.exit.state,'clear');
  // Inside the pentagon the nearest problem is reported first: the short merge on entry, the 140 degree ring corner on exit.
  const inside=E.inspectVehicleRoutes(E.generate({...input,ramp:ramp(26000)}));assert.equal(inside.entry.firstIssue.id,'RAMP_APPROACH');assert.equal(inside.exit.firstIssue.id,'VEHICLE_SHARP_TURN');
});
