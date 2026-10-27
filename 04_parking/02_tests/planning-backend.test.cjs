'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../01_src/plan/CLAUDE_ugp_plan.js'),G=require('../01_src/plan/CLAUDE_ugp_geom.js'),V=require('../01_src/plan/CLAUDE_ugp_verify.js');
const B=require('../01_src/plan/planning-boundary.js'),Z=require('../01_src/plan/planning-zones.js'),A=require('../01_src/plan/stall-allocation.js');
const Gen=require('../../06_core_layout/01_src/core_gen2.js'),Eval=require('../src/underground/evaluators/evaluator-core.js');
const rules=require('../src/underground/rules/kr-parking-rules-2026-07-27.json');
const R=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
const area=P=>Math.abs(G.areaOf(P)),inter=(a,b)=>area(G.boolOp(a,b,G.CL.ClipType.ctIntersection));
const mass=R(0,0,80000,60000),base={mass,ucs:0,cores:[],ramp:{x:30000,y:52000,angleDeg:0,widthMm:6000,lengthMm:24000},floorMm:3800};
const layouts=ev=>Gen.generate({floorHeight:3800,evCount:ev}).alts.filter(a=>a.status==='OK'&&a.candidate!==false).map(a=>({id:a.id,ev,outer:a.outer,t:a.t,rooms:Object.fromEntries(Object.entries(a.rooms).map(([k,v])=>[k,v.rects])),doors:a.doors,stairDraw:a.stairDraw,law:a.review.law}));
const coreInput={mass:[[0,50000],[101400,50000],[101400,22100],[96300,22100],[96300,0],[20000,0]],ucs:0,cores:[{c:[44400,33600],w:9000,d:8000,layouts:layouts(1)}],ramp:{...base.ramp,x:32000,y:41700},grid:{wallMm:400},floorMm:3800,phase:[7359,1200]};
function curve(o={}){const c=E.createCurveRamp({id:'R',systemId:'S',operation:'twoWay',landing:[75000,35000],tangent:[-1,0],turn:'left',turnDeg:180,innerRadiusMm:6000,lanes:2,legalLaneWidthMm:6500,straightTopMm:3000,straightBottomMm:3000,transitions:{topMm:1700,bottomMm:1700},levels:{connects:{upperLevelMm:0,lowerLevelMm:-3800}},...o});assert(c.body,JSON.stringify(c.violations));return c;}
function evaluated(input){
  const draft=E.generate(input),c=draft.ramp.sourceRamp,fx=E.curveEvaluationFixed(draft),b=B.resolve(input,c);
  const ev=Eval.evaluate({ruleSet:rules,input:{project:{permitDate:'2026-10-26',parkingKind:'noeoe',parkingLots:[{id:'A',totalStalls:80}],rampSystems:[{id:'S',lotIds:['A']}]},floor:{id:'B1',levelMm:-3800,heightMm:3800,wallMm:400,outline:{kind:'outer',polygons:b.floorPaths}},ramps:[c.evaluatorRamp],fixed:fx},candidate:{schema:'ug-candidate/0.1',geometry:{stalls:[],ramps:[c.candidateRamp]}}});
  ev.curveSource=E.curveEvaluationSource(c,fx);return {ev,result:E.generate({...input,ramp:c,phase:draft.grid.phase,rampEvaluation:ev})};
}

test('contained curve is connected in either outline direction; holes remain holes',()=>{
  const c=curve({landing:[30000,30000],tangent:[1,0]}),m=R(0,0,100000,100000);
  for(const outline of [m,m.slice().reverse()]){const b=B.resolve({mass:outline},c);assert.equal(b.outerCount,1);assert.equal(b.disconnected,false);assert.equal(b.bodyOutsideMm2,0);}
  const b=B.resolve({mass:m,massHoles:[R(50000,10000,5000,5000)]},c);
  assert.equal(inter(b.floorPaths,[R(51000,11000,1000,1000)]),0);
  assert(B.resolve({mass:R(200000,200000,40000,40000)},c).disconnected);
});
test('external curved ramp passes body-boundary and landing checks with stable body grid',()=>{
  const inp={...base,ramp:curve()},r=evaluated(inp);
  assert(r.result.planningBoundary.joined);assert(r.result.graph.hasLoop);
  assert(!r.result.violations.some(x=>['RAMP_BOUNDARY','RAMP_OUTSIDE','RAMP_DISCONNECTED','RAMP_RULES','LANDING'].includes(x.id)),JSON.stringify(r.result.violations));
  assert.equal(r.ev.items.find(x=>x.id==='G07'&&x.subjectId==='R').verdict,'PASS');
  const moved=E.generate({...inp,phase:r.result.grid.phase,ramp:curve({landing:[75000,27000]})});
  assert.deepEqual(moved.grid.phase,r.result.grid.phase);assert.deepEqual(moved.innerOutline,r.result.innerOutline);
});
test('external boundary does not waive fixed collision or explicit allowed boundary',()=>{
  const inp={...base,ramp:curve(),occupants:[{id:'fixed',c:[83000,27000],w:3000,d:3000}]},r=evaluated(inp);
  assert(r.result.violations.some(x=>x.id==='RAMP_HITS_CORE'));
  assert.equal(r.ev.items.find(x=>x.id==='G07'&&x.subjectId==='R').verdict,'FAIL');
  const restricted=E.generate({...base,ramp:curve(),allowedBoundary:mass});
  assert(restricted.violations.some(x=>x.id==='FLOOR_OUTSIDE_ALLOWED'));
});
test('EV configuration grows only as needed and every chosen configuration fits',()=>{
  let c={c:[44000,33000],w:9000,d:7000};
  for(const ev of [1,2,3,4,'auto']){
    c=E.configureCore(c,ev,ev==='auto'?[1,2,3,4].flatMap(layouts):layouts(ev));
    const r=E.generate({...coreInput,cores:[c]});assert(r.cores[0].plan,ev+' has no fitted plan');
    if(ev!=='auto')assert.equal(r.cores[0].plan.evCount,ev);
    assert(r.cores[0].plan.columnsStraddling===0);
  }
});
test('fitted core contains every touching column without protruding',()=>{
  const r=E.generate(coreInput);
  for(const c of r.cores)for(const col of r.columns)if(inter([c.pts],[col])>1e4)assert(area(G.boolOp([col],[c.pts],G.CL.ClipType.ctDifference))<1e4,'column protrudes');
  assert(!r.violations.some(x=>x.id==='CORE_COLUMN_PROTRUDES'));
});
test('core island is retained, column-only island is identified',()=>{
  const aisles=[R(0,0,22000,22000),R(6000,6000,10000,10000).reverse()],plain={aisles,ramp:null,cores:[]};
  assert.equal(E._emptyIslands(plain,[]).length,1);
  assert.equal(E._emptyIslands({...plain,cores:[{pts:R(6500,6500,9000,9000)}]},[]).length,0);
});
test('DA and PIT split a deep wall strip and preserve access space',()=>{
  const walk=R(1000,7000,1500,1500),out={innerOutline:R(0,0,40000,30000),cores:[{plan:{walk}}]},free=[R(0,0,5000,30000)];
  const r=Z.calculate(out,{},free);assert(r.zones.some(x=>x.kind==='da'));assert(r.zones.some(x=>x.kind==='pit'));
  assert(inter(r.zones.flatMap(z=>z.paths),[walk])<1e4);
  assert(Math.abs(area(r.parkingSurface)+r.areas.nonParkingM2*1e6-1200e6)<1e4);
  assert(r.areas.unassignedFreeM2<r.areas.nonParkingM2);
});
test('explicit PIT is a placement blocker, and conflicting zones are reported',()=>{
  const before=E.generate(base),s=before.stalls[0],nonParkingZones=[{id:'pit',kind:'pit',paths:[s.pts]}];
  const after=E.generate({...base,phase:before.grid.phase,nonParkingZones});assert(after.stallCount<before.stallCount);
  assert(after.stalls.every(t=>inter([s.pts],[t.pts])<1e4));
  const q=before.aisles.find(P=>G.signedArea(P)>0),bad=E.generate({...base,phase:before.grid.phase,nonParkingZones:[{kind:'pit',paths:[q]}]});
  assert(bad.violations.some(x=>x.id==='ZONE_CONFLICT'));
});
test('mixed dimensions and use quotas are independently checked and never double-counted',()=>{
  const inp={...coreInput,parkingOptions:{accessible:{mode:'ratio',value:0.03},compact:{mode:'count',value:3},expanded:{mode:'count',value:2},charging:{mode:'count',value:2},electric:{mode:'count',value:4},family:{mode:'count',value:2},women:{mode:'count',value:1}}},r=E.generate(inp);
  assert.equal(r.parkingSummary.total,r.stalls.length);
  assert.equal(Object.values(r.parkingSummary.dimensions).reduce((a,b)=>a+b,0),r.stalls.length);
  assert(Object.values(r.parkingSummary.requirements).every(q=>q.short===0),JSON.stringify(r.parkingSummary));
  assert(r.stalls.filter(s=>s.uses.includes('charging')).every(s=>s.uses.includes('electric')));
  const rep=V.check(r,inp);assert.equal(rep.counts.clash,0);assert.equal(rep.counts.noFront,0);assert.equal(rep.counts.ok+rep.counts.deadSide,r.stallCount);
  assert.equal(r.report.stallState.length,r.stalls.length);
  assert.equal(r.lostCount,r.lost.length);
  assert.equal(r.allocationDelta,r.stallCount-(r.placementReport.stallState.length-r.placementReport.stallState.filter(s=>!['ok','deadSide'].includes(s)).length));
  assert(r.stalls.filter(s=>s.stallType==='compact').every(s=>{const b=G.bbox(s.pts);return b[2]-b[0]===2000&&b[3]-b[1]===3600;}));
});
test('quota rounding is per option and shortage cannot disappear',()=>{
  assert.equal(A.required({mode:'ratio',value:0.04,rounding:'ceil',minTotal:0,minimum:0},101),5);
  assert.equal(A.required({mode:'ratio',value:0.04,rounding:'round',minTotal:0,minimum:0},101),4);
  const r=E.generate({...base,parkingOptions:{accessible:{mode:'count',value:2},charging:{mode:'count',value:10000}}});
  assert.equal(r.parkingSummary.requirements.accessible.short,2);assert(r.parkingSummary.requirements.charging.short>0);assert(r.violations.some(v=>v.id==='ACCESSIBLE_SHORT'));
  assert.throws(()=>E.generate({...base,parkingOptions:{compact:{mode:'ratio',value:2}}}),RangeError);
});
test('same-size use assignment preserves all geometry and final count',()=>{
  const plain=E.generate(base),r=E.generate({...base,phase:plain.grid.phase,parkingOptions:{electric:{mode:'count',value:4},family:{mode:'count',value:2}}});
  assert.equal(r.stallCount,plain.stallCount);assert.deepEqual(r.stalls.map(s=>s.pts),plain.stalls.map(s=>s.pts));
  assert.equal(r.parkingSummary.uses.electric,4);assert.equal(r.parkingSummary.uses.family,2);
});
test('ramp review distinguishes a failed constraint from missing information',()=>{
  const review=E.rampReview({items:[{id:'R02',subjectId:'R',verdict:'FAIL',message:'curve grade exceeds its limit',evidence:{current:15,limit:14}},{id:'R04',subjectId:'R',verdict:'UNDETERMINED',message:'total is missing'}]},'R');
  assert.equal(review[0].state,'change-needed');assert.equal(review[1].state,'input-needed');assert(review[0].title&&!review[0].title.includes('R02'));
});
test('planar vehicle check stops before a body collision and rejects a disconnected path',()=>{
  const plan={aisles:[R(-5000,-3000,30000,6000)],cores:[],columns:[],occupants:[],graph:{hasLoop:true,rootId:0}};
  const clear=E.checkVehiclePath(plan,[[0,0],[20000,0]]);assert.equal(clear.state,'clear');assert(clear.samples>0);
  const blocked=E.checkVehiclePath({...plan,columns:[R(9500,-300,600,600)]},[[0,0],[20000,0]]);assert.equal(blocked.state,'blocked');assert.equal(blocked.firstIssue.id,'VEHICLE_HITS_OBJECT');assert(blocked.stopDistanceMm<9500);
  assert.equal(E.checkVehiclePath({...plan,graph:{hasLoop:false,rootId:null}},[[0,0],[20000,0]]).state,'unconnected');
});
test('entry and exit path data extend onto the curved ramp in opposite ramp lanes',()=>{
  const r=evaluated({...base,ramp:curve()}).result,paths=E.inspectVehicleRoutes(r);
  assert(paths.entry.points.length>r.circulation.entry.length);assert(paths.exit.points.length>r.circulation.exit.length);
  assert.equal(paths.entry.colorKey,'entry');assert.equal(paths.exit.colorKey,'exit');
  assert(G.len(G.sub(paths.entry.points[0],paths.exit.points.at(-1)))>2000);
  assert(paths.entry.samples>0&&paths.exit.samples>0);
  assert.equal(paths.entry.state,'clear');assert.equal(paths.exit.state,'clear');
});
test('manual quotas and void/zone area accounts preserve their explicit meanings',()=>{
  const rs=A.rules({parkingOptions:{accessible:{mode:'count',value:1}}},false).result;
  assert.equal(A.required(rs.accessible,8),1);
  const r=E.generate({...base,massHoles:[R(10000,10000,3000,3000)]});
  assert(inter(r.parkingSurface,[R(10000,10000,3000,3000)])<1e4);
  assert(!r.violations.some(v=>v.id==='INNER_OUTSIDE'));
  assert(Math.abs(r.areas.parkingSurfaceM2+r.areas.nonParkingM2-r.areas.innerM2)<0.02);
  assert.throws(()=>Z.explicit({nonParkingZones:[{kind:'da',paths:[R(0,0,3000,3000)]},{kind:'pit',paths:[R(1000,1000,3000,3000)]}]}),RangeError);
  const short=E.generate({...base,parkingOptions:{electric:{mode:'count',value:10000},family:{mode:'count',value:10000},women:{mode:'count',value:10000}}});
  assert.equal(short.issues.filter(x=>x.id==='PARKING_SHORT').length,3);
});

test('reclassifying a computed free zone preserves the allocated stalls and respects floor retention',()=>{
  const before=E.generate(coreInput),z=before.nonParkingZones.find(z=>z.kind==='da');assert(z);
  const input={...coreInput,phase:before.grid.phase,zoneAssignments:[{id:z.id,kind:'pit',paths:z.paths}]},after=E.generate(input);
  assert.deepEqual(after.stalls,before.stalls);assert.equal(after.nonParkingZones.find(x=>x.id===z.id).kind,'pit');assert.equal(after.unmatchedZoneAssignments.length,0);
  const kept=E.generate({...input,zoneAssignments:[{id:z.id,kind:'keep',paths:z.paths}]});
  assert.deepEqual(kept.stalls,before.stalls);assert(kept.keptZones.some(x=>x.id===z.id));assert(kept.areas.keptFreeM2>0);assert(kept.areas.nonParkingM2<before.areas.nonParkingM2);
  assert(Math.abs(kept.areas.unassignedFreeM2-before.areas.unassignedFreeM2)<.02);
  const moved=z.paths.map(P=>P.map(p=>[p[0]+5000,p[1]])),stale=E.generate({...input,zoneAssignments:[{id:z.id,kind:'pit',paths:moved}]});
  assert(stale.unmatchedZoneAssignments.includes(z.id));assert.equal(stale.nonParkingZones.find(x=>x.id===z.id).kind,'da');
});

test('attached external straight ramp keeps its floor envelope and reachable parking after moving upward',()=>{
  const mass=[[0,18000],[15000,0],[101481,0],[101481,51840],[0,51840]],input={mass,ucs:0,cores:[],phase:[7400,3600],floorMm:3800,allowExternalRamp:true};
  const ramp=y=>({x:11850,y,angleDeg:270,widthMm:6000,lengthMm:24000}),before=E.generate({...input,ramp:ramp(26000)}),after=E.generate({...input,ramp:ramp(43440)});
  assert(after.stallCount>0&&after.graph.hasLoop);assert.equal(after.planningBoundary.bodyOutsideMm2,0);assert(after.planningBoundary.joined);assert(!after.violations.some(v=>['RAMP_OUTSIDE','RAMP_BOUNDARY','RAMP_DISCONNECTED'].includes(v.id)));
  assert.deepEqual(after.grid.phase,before.grid.phase);assert.deepEqual(after.innerOutline,before.innerOutline);
  const restricted=E.generate({...input,allowedBoundary:mass,ramp:ramp(43440)});assert(restricted.violations.some(v=>v.id==='FLOOR_OUTSIDE_ALLOWED'));assert.equal(restricted.status,'INFEASIBLE');
  const detached=E.generate({...input,ramp:{...ramp(43440),y:90000}});assert(detached.violations.some(v=>v.id==='RAMP_DISCONNECTED'));assert.equal(detached.status,'INFEASIBLE');
  const denied=E.generate({...input,allowExternalRamp:false,ramp:ramp(43440)});assert(denied.violations.some(v=>v.id==='RAMP_OUTSIDE'));
});
