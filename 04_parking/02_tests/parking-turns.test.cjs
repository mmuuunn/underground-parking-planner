'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../01_src/plan/CLAUDE_ugp_plan.js'),N=require('../01_src/plan/CLAUDE_ugp_network.js');
const wide={aisles:[[[-20000,-20000],[20000,-20000],[20000,20000],[-20000,20000]]],columns:[],cores:[],occupants:[],graph:{hasLoop:true,rootId:0}};
test('current rapid turn angle and distance boundaries',()=>{
  for(const [deg,state] of [[90,'clear'],[90.49,'clear'],[90.5,'clear'],[90.51,'blocked']]){
    const t=deg*Math.PI/180, v=E.checkVehiclePath(wide,[[-10000,0],[0,0],[10000*Math.cos(t),10000*Math.sin(t)]]);
    assert.equal(v.state,state,`${deg} degrees`);
    if(state==='blocked')assert.equal(v.firstIssue.id,'VEHICLE_SHARP_TURN');
  }
  for(const [distance,state] of [[4711,'blocked'],[4712,'blocked'],[4713,'clear']]){
    const t=50*Math.PI/180,u=100*Math.PI/180,p=[[-10000,0],[0,0],[distance*Math.cos(t),distance*Math.sin(t)]];
    p.push([p[2][0]+10000*Math.cos(u),p[2][1]+10000*Math.sin(u)]);
    const v=E.checkVehiclePath(wide,p);assert.equal(v.state,state,`${distance} mm`);
    if(state==='blocked')assert.equal(v.firstIssue.id,'VEHICLE_SHARP_TURN');
  }
});
test('straight and curved ramps use the same 6m approach boundary for one 90 degree turn',()=>{
  const base={mass:[[0,0],[100000,0],[100000,100000],[0,100000]],ucs:0,cores:[],floorMm:3800,allowExternalRamp:true,phase:[0,0]};
  for(const [x,accepted] of [[26649,false],[26650,true],[26651,true]]){
    const landing=[x,35000],tangent=[-1,0];
    const straight=E.createStraightRamp({landing,tangent,widthMm:6500,lengthMm:24000});
    const curve=E.createCurveRamp({id:'R',systemId:'S',operation:'twoWay',landing,tangent,turn:'left',turnDeg:180,innerRadiusMm:6000,lanes:2,legalLaneWidthMm:6500,straightTopMm:3000,straightBottomMm:3000,transitions:{topMm:1700,bottomMm:1700},levels:{connects:{upperLevelMm:0,lowerLevelMm:-3800}}});
    assert.ok(curve.body);
    const approaches=[straight,curve].map(ramp=>{const p=E.generate({...base,ramp});if(!accepted){const v=p.violations.find(v=>v.id==='RAMP_OFFGRID');assert.deepEqual(p.issues.find(v=>v.id==='RAMP_OFFGRID').at,v.at);}return p.ramp.approach;});
    for(const a of approaches){assert.equal(a.firstStraightMm,x-20650);assert.deepEqual(a.turnAnglesDeg,[90]);assert.equal(a.accepted,accepted);assert.ok(a.summary.includes(`착지 뒤 ${((x-20650)/1000).toFixed(3)}m 직진`));}
    assert.deepEqual(approaches[0],approaches[1]);
  }
});
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
test('fixed 50-bay baseline joins the ring with complete clear trips while the old late turn stays blocked',()=>{
  const P=require('../../tools/parking-comparison-basis.cjs'),spec=P.read().cases.find(c=>c.id==='regular'),fixed=structuredClone(spec.input),events=[];
  E.generate(fixed,event=>events.push(event));const baseline=events.find(e=>e.id==='baseline').plan,before=P.hash(baseline);
  assert.equal(baseline.stallCount,50);assert.equal(baseline.columns.length,36);assert.equal(before,spec.expected.planHash);
  const routes=E.inspectVehicleRoutes(baseline);
  for(const key of ['entry','exit']){const v=routes[key],replay=E.checkVehiclePath(baseline,v.points);
    assert.equal(v.state,'clear',key+' '+JSON.stringify(v.firstIssue));assert.equal(replay.state,'clear');assert.equal(v.stopDistanceMm,v.lengthMm);assert(v.samples>100);
    assert.deepEqual(v.vehicle,{lengthMm:4600,widthMm:1900});assert.equal(v.sampleMm,500);assert.equal(v.turnWindowMm,4712);assert.equal(v.turnLimitDeg,90.5);
  }
  const late=E.checkVehiclePath(baseline,[[-23600,6900],[14600,6900],[17650,9950]]);
  assert.equal(late.state,'blocked');assert.equal(late.firstIssue.id,'VEHICLE_OUTSIDE_LANE');assert.equal(late.firstIssue.outsideAreaM2,.665);assert.deepEqual(late.firstIssue.at,[14200,6900]);
  assert.equal(P.hash(baseline),before);assert.deepEqual(fixed,spec.input);
});

test('straight ramp suggestions exclude blocked routes even when they have more stalls',()=>{
  const c=require('./fixtures/underground-golden-cases.json').cases.find(c=>c.id==='l-shape');
  const base=E.generate(c.input),blocked=E.generate({...c.input,phase:base.grid.phase,ramp:{...c.input.ramp,x:25400,y:65700,angleDeg:0}});
  assert.equal(blocked.stallCount,81);assert.equal(E.inspectVehicleRoutes(blocked).entry.state,'blocked');
  const suggestions=E.suggestRamps(c.input,5);assert.ok(suggestions.length);
  for(const s of suggestions){
    const plan=E.generate({...c.input,phase:base.grid.phase,ramp:{...c.input.ramp,x:s.x,y:s.y,angleDeg:s.angleDeg}}),routes=E.inspectVehicleRoutes(plan);
    assert.equal(plan.stallCount,s.stallCount);assert.equal(routes.entry.state,'clear');assert.equal(routes.exit.state,'clear');
  }
  assert.equal(suggestions[0].stallCount,78);
  assert.equal(suggestions[0].status,'CONDITIONAL');
  assert.ok(suggestions[0].issues.some(note=>note.includes('69㎡')));
});
test('straight ramp suggestions expose a violated allowed boundary',()=>{
  const c=require('./fixtures/underground-golden-cases.json').cases.find(c=>c.id==='rectangle');
  const input={...c.input,allowedBoundary:[[0,0],[40000,0],[40000,60000],[0,60000]]};
  const base=E.generate(input),suggestions=E.suggestRamps(input,3);assert.ok(suggestions.length);
  for(const s of suggestions){
    const plan=E.generate({...input,phase:base.grid.phase,ramp:{...input.ramp,x:s.x,y:s.y,angleDeg:s.angleDeg}});
    assert.equal(plan.status,'INFEASIBLE');assert.equal(s.status,plan.status);
    assert.ok(plan.violations.some(v=>v.id==='FLOOR_OUTSIDE_ALLOWED'));
    assert.ok(s.issues.includes(plan.violations.find(v=>v.id==='FLOOR_OUTSIDE_ALLOWED').note));
  }
});
test('F3/F4 both ramp forms report the same short approach and the unresolved 140 degree corner',()=>{
  const a=E.generate({...input,ramp:ramp(26000)}),b=E.generate({...input,ramp:E.createStraightRamp(ramp(26000))});
  for(const p of [a,b]){assert.equal(p.stallCount,120);assert.equal(p.ramp.approach.accepted,false);assert(p.ramp.approach.firstStraightMm<6000);assert(p.violations.some(v=>v.id==='RAMP_OFFGRID'));assert(p.issues.some(v=>v.id==='RING_SHARP_TURN'&&v.at));const routes=E.inspectVehicleRoutes(p);assert.equal(routes.entry.state,'blocked');assert.equal(routes.exit.state,'blocked');}
  assert.deepEqual(a.ramp.approach,b.ramp.approach);
});

test('ramp issue positions retain reported world coordinates and preserve missing-position fallback',()=>{
  const G=require('../01_src/plan/CLAUDE_ugp_geom.js'),l=require('./fixtures/underground-golden-cases.json').cases.find(c=>c.id==='l-shape').input;
  for(const base of [l,{...input,ramp:ramp(26000)}])for(const [angle,shift] of [[0,[0,0]],[37,[12345,-6789]],[90,[-20000,10000]]]){
    const point=p=>G.add(G.rot(p,angle),shift),landing=point([base.ramp.x,base.ramp.y]),p=E.generate({...base,mass:base.mass.map(point),ucs:base.ucs+angle,ramp:{...base.ramp,x:landing[0],y:landing[1],angleDeg:base.ramp.angleDeg+angle}}),v=p.violations.find(v=>v.id==='RAMP_OFFGRID'),marker=p.issues.find(v=>v.id==='RAMP_OFFGRID');
    assert.ok(v?.at);assert.deepEqual(marker.at,v.at);assert.deepEqual(marker.at,p.ramp.landing);assert.equal(marker.note,v.note);
    const routes=E.inspectVehicleRoutes(p);assert.equal(routes.entry.firstIssue.id,'RAMP_APPROACH');assert.deepEqual(marker.at,routes.entry.firstIssue.at);
  }
  const p=E.generate({...l,floorMm:5000}),v=p.violations.find(v=>v.id==='RAMP_SLOPE');assert.ok(v);assert.equal(v.at,undefined);assert.deepEqual(p.issues.find(v=>v.id==='RAMP_SLOPE').at,p.ramp.approach.points[1]||p.ramp.landing);
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
test('turn-bay proposal preserves the scene and reports the unverified dead end',()=>{
  const C=require('../../06_core_layout/01_src/core_gen2.js');
  const layouts=[1,2,3,4].flatMap(ev=>{const g=C.generate({floorHeight:3800,evCount:ev});return g.ok?g.alts.filter(a=>a.status==='OK'&&a.candidate!==false).map(a=>({id:a.id,ev,name:a.name,outer:a.outer,t:a.t,rooms:Object.fromEntries(Object.entries(a.rooms).map(([k,v])=>[k,v.rects])),doors:a.doors,stairDraw:a.stairDraw,law:a.review?.law,lawNote:a.review?.lawItems?.find(x=>x.status==='FAIL')?.note})):[];});
  const input={mass:[[-30089,8981],[-26923,-11428],[23749,-35903],[49409,17223],[-11822,46799]],ucs:-25.7815,cores:[{c:[22127,184],w:9489,d:5981,doors:{ENT:100},layouts}],grid:{gx:8400,gy:8200,stallW:2600,stallD:5200,wallMm:400},floorMm:3800,phase:[4000,0],allowExternalRamp:true,ramp:{x:3395,y:19905,angleDeg:-25.7815,widthMm:6000,lengthMm:24000}};
  const before=E.generate(input),result=E.suggestTurnBay(input);assert.ok(result);const after=result.plan;
  assert.equal(before.stallCount,82);assert.equal(after.stallCount,87);assert.equal(after.status,'CONDITIONAL');assert.equal(result.turning,'UNVERIFIED');
  assert.equal(after.deadSideCount,7);assert(after.violations.some(v=>v.id==='DEAD_END'));assert.deepEqual(after.columns,before.columns);assert.deepEqual(after.cores,before.cores);assert.deepEqual(after.ramp.body,before.ramp.body);
  const routes=E.inspectVehicleRoutes(after);assert.equal(routes.entry.state,'clear');assert.equal(routes.exit.state,'clear');
  assert.equal(before.areas.nonParkingM2,0);assert.equal(after.areas.nonParkingM2,0);
  assert(after.areas.unassignedFreeM2<before.areas.unassignedFreeM2-300);
  assert.deepEqual(E.generate(input),before);assert.equal(E.suggestTurnBay({...input,ramp:null}),null);assert.equal(E.suggestTurnBay({...input,ramp:{...input.ramp,angleDeg:input.ramp.angleDeg+90}}),null);
});
