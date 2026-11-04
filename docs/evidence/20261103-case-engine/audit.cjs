'use strict';
// Read-only measurements for the crosswalk report; never changes engine inputs or golden values.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const args=process.argv.slice(2),option=k=>args.includes(k)?args[args.indexOf(k)+1]:null;
const repo=path.resolve(option('--repo')||path.join(__dirname,'../../..'));
const source=path.join(repo,'04_parking/01_src'),E=require(path.join(source,'CLAUDE_ug_plan_engine.js'));
const Grid=require(path.join(source,'plan/CLAUDE_ugp_grid.js')),Lay=require(path.join(source,'plan/CLAUDE_ugp_layout.js'));
const F=require(path.join(source,'sghs-reference.js'));
const R=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]],clone=structuredClone;
const bb=P=>[Math.min(...P.map(p=>p[0])),Math.min(...P.map(p=>p[1])),Math.max(...P.map(p=>p[0])),Math.max(...P.map(p=>p[1]))];
const overlap=(a,b)=>Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]));
const summary=r=>({count:r.stallCount,status:r.status,columns:r.columns.length,loop:r.graph.hasLoop,deadSide:r.deadSideCount,lost:r.lostCount,violations:[...new Set(r.violations.map(v=>v.id))].sort()});
const make=d=>{d=clone(d);const p=d.ramp;return {...d,phase:[6400,8000],grid:{...F.grid,columnAxes:d.columnAxes,columnMm:d.referenceColumnMm,columnIntersections:d.columnIntersections},floorMm:undefined,ramp:E.createStraightRamp({landing:p.p,angleDeg:p.alignedAngleDeg,widthMm:p.w,lengthMm:p.len})};};
const result={basis:'Independent rectangle arithmetic and actual public entry calls; no engine, golden or stored scene edits',checks:{}};

// Exercise the actual adapter expression with inert UI dependencies, without copying its field mapping.
const page=fs.readFileSync(path.join(source,'CODEX_ug_compare_page.js'),'utf8');
const adapter=page.slice(page.indexOf('const planInput = () => {'),page.indexOf('function solveCurveInput('));
assert(adapter.startsWith('const planInput = () => {'));
const context={doc:clone(F.floors[0].calibrated),rampSpec:r=>r,planningMass:()=>null,coreLayouts:()=>null,referenceScene:{floor:'B1'},MODULES:{sghs:{grid:F.grid}},WALL:400,docPhase:()=>[6400,8000],projectFloor:()=>3800};
vm.createContext(context);vm.runInContext(adapter+';globalThis.forwarded=planInput();',context);
result.adapter={fixtureSelection:context.doc.stallRowSelection,automaticSelection:context.doc.automaticRowSelection??null,forwardedSelection:context.forwarded.stallRowSelection??null,fixtureAlignment:context.doc.stallRowAlignment,forwardedAlignment:context.forwarded.stallRowAlignment??null};
result.adapter.continuousForwarded=result.adapter.forwardedSelection==='continuous';
result.checks.adapterAlignment=result.adapter.forwardedAlignment==='back-to-back';assert(result.checks.adapterAlignment);

const calibrated=make(F.floors[0].calibrated),snap=JSON.stringify(calibrated),network={...calibrated,aisleSurfaceMode:'network',obstacleClearance:'euclidean'};
const direct=E.generate(calibrated),automatic=E.generate({...calibrated,stallRowSelection:context.forwarded.stallRowSelection}),connected=E.generateConnected(network,F.floors[0].calibratedTrace.routes);
const twoWay=E.generateConnected({...network,trafficMode:'two-way'},F.floors[0].calibratedTrace.routes);
result.sghs={engineWithFixture:summary(direct),adapterRowPolicy:summary(automatic),suppliedDefault:summary(connected),suppliedTwoWay:summary(twoWay)};
assert.equal(connected.stallCount,66);assert.equal(connected.status,'INFEASIBLE');assert.equal(connected.graph.hasLoop,false);assert.equal(connected.deadSideCount,66);
assert.equal(twoWay.stallCount,66);
result.checks.twoWayPolicy=twoWay.violations.some(v=>v.id==='RETURN_MANEUVER_UNVERIFIED');
// HEAD predates the two-way policy; retain and report its old failure rather than expecting a new feature.
assert.equal(twoWay.status,result.checks.twoWayPolicy?'CONDITIONAL':'INFEASIBLE');
assert.equal(JSON.stringify(calibrated),snap);result.checks.inputPreserved=true;
const previous=E.generateConnected({...make(F.floors[0].calibratedBeforeAlignment),aisleSurfaceMode:'network',obstacleClearance:'euclidean'},F.floors[0].calibratedBeforeAlignmentTrace.routes);
const sourceAudit=F.auditB1(connected,require(path.join(source,'plan/CLAUDE_ugp_geom.js')),'calibrated');
result.sourceDiagnostic={basis:'Existing source-envelope diagnostic, not independent evidence of exact original coordinates',visibleReadCount:sourceAudit.visibleSourceCount,officialSourceCount:F.floors[0].referenceCount,rows:sourceAudit.rows.map(r=>({id:r.id,candidates:r.candidates,matchingFacing:r.matchingFacing,wrongFacing:r.wrongFacing})),outsideRows:sourceAudit.outsideRows.length};
const loading=bb(F.floors[0].loading),axisRectangle=P=>{const b=bb(P);return P.length===4&&P.every(p=>(p[0]===b[0]||p[0]===b[2])&&(p[1]===b[1]||p[1]===b[3]));};
result.sourceDiagnostic.loadingCandidateHits=connected.stalls.filter(s=>axisRectangle(s.pts)&&overlap(bb(s.pts),loading)>10000).length;
const sw=r=>r.stalls.map(s=>bb(s.pts)).filter(b=>b[0]>=19750&&b[2]<=30000&&b[1]>=5000&&b[3]<=17000).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
const oldSW=sw(previous),newSW=sw(connected);assert.equal(newSW.length,8);
assert.deepEqual(newSW.slice(0,4).map(b=>[b[1],b[3]]),newSW.slice(4).map(b=>[b[1],b[3]]));
result.pairedB1={beforeOffsetMm:oldSW[4][1]-oldSW[0][1],afterOffsetMm:newSW[4][1]-newSW[0][1],stalls:8,total:connected.stallCount};

const fixed={mass:R(0,0,60000,50000),cores:[],phase:[0,0],grid:{aisleMm:6000,columnAxes:{x:[20000,40000],y:[12000,30000]}},ramp:E.createStraightRamp({landing:[15000,42000],angleDeg:0,widthMm:6000,lengthMm:10000}),autoZones:false,stallRowSelection:'continuous'};
const routes=[{points:[[15000,42000],[33000,42000],[50000,42000],[50000,8000]]},{points:[[33000,42000],[33000,18000]]}];
const oldT=E.generateConnected({...fixed,stallRowSelection:'sequential'},routes),newT=E.generateConnected(fixed,routes),gap=clone(routes);gap[1].points[0][1]-=500;
const broken=E.generateConnected(fixed,gap),blocked=E.generateConnected({...fixed,cores:[{c:[33000,30000],w:8000,d:6000,keep:{x:true,y:true}}]},routes);
assert.deepEqual([oldT.stallCount,newT.stallCount],[46,47]);assert(broken.placementReport.counts.unreachable>0);assert(blocked.placementReport.counts.unreachable>0);
const columnHit=E.generateConnected({...fixed,aisleSurfaceMode:'network'},[{points:[[15000,42000],[20000,42000],[20000,8000]]}]);
assert(columnHit.columns.some(P=>JSON.stringify(bb(P))===JSON.stringify([19700,29700,20300,30300])));
assert(columnHit.violations.some(v=>v.id==='FIXED_COLUMN_BLOCKS_ROUTE'));
const omit={ix:0,iy:0,state:'omitted',reason:'explicit audit input; not a structural approval'},withOmit=E.generateConnected({...fixed,grid:{...fixed.grid,columnIntersections:[omit]}},routes);
assert.equal(withOmit.columns.length,newT.columns.length-1);assert.throws(()=>E.generateConnected({...fixed,grid:{...fixed.grid,columnIntersections:[{ix:0,iy:0,state:'omitted'}]}},routes),RangeError);
result.controls={continuousT:[oldT.stallCount,newT.stallCount],gapUnreachable:broken.placementReport.counts.unreachable,coreBlockUnreachable:blocked.placementReport.counts.unreachable,fixedColumnCollision:summary(columnHit),explicitOmissionColumns:[newT.columns.length,withOmit.columns.length],invalidOmissionRejected:true};

// 441 independent start/end combinations: feasibility is interval arithmetic modulo bay width.
const paired={cases:0,capacityPreserved:0,alignmentPossible:0,alignedWhenPossible:0,impossibleRetained:0,rectangleCollisions:0};
for(let i=0;i<21;i++)for(let j=0;j<21;j++){
 const a0=1000+i*125,a1=13000,b0=1000+j*125,b1=13000+(j%5)*125,w=2500;
 const G=Grid.frame({mass:R(0,0,40000,20000),cores:[],grid:{aisleMm:6000,columnMm:500,columnAxes:{x:[30000,35000],y:[16000,18500]}}});Grid.setPhase(G,[0,0]);G.aisleSurfaceMode='network';
 const lines=[{a:[10000,a0],b:[10000,a1],v:10000,h:null,kind:'spur'},{a:[26000,b0],b:[26000,b1],v:26000,h:null,kind:'spur'}];
 const aisles=[R(7000,a0,13000,a1),R(23000,b0,29000,b1)],run=alignment=>Lay.placeStalls(G,lines,[G.inner],aisles,[],[],false,{stallRowSelection:'continuous',stallRowAlignment:alignment});
 const before=run('independent'),after=run('back-to-back'),na=Math.floor((a1-a0)/w),nb=Math.floor((b1-b0)/w),amax=a1-na*w,bmax=b1-nb*w;
 const possible=Math.ceil((b0-amax)/w)<=Math.floor((bmax-a0)/w),left=after.stalls.filter(s=>s.bb[0]===13000),right=after.stalls.filter(s=>s.bb[0]===18000);
 paired.cases++;assert.equal(before.stalls.length,after.stalls.length);paired.capacityPreserved++;
 if(possible){paired.alignmentPossible++;assert(Math.abs((left[0].bb[1]-right[0].bb[1])/w-Math.round((left[0].bb[1]-right[0].bb[1])/w))<1e-8);paired.alignedWhenPossible++;}
 else{assert.deepEqual(after.stalls,before.stalls);paired.impossibleRetained++;}
 for(const s of after.stalls)for(const lane of aisles)if(overlap(s.bb,bb(lane))>1)paired.rectangleCollisions++;
 for(let k=0;k<after.stalls.length;k++)for(let l=0;l<k;l++)if(overlap(after.stalls[k].bb,after.stalls[l].bb)>1)paired.rectangleCollisions++;
}
assert.equal(paired.rectangleCollisions,0);result.pairedSweep=paired;

const G=Grid.frame({mass:R(0,0,40000,20000),cores:[],grid:{aisleMm:6000,columnMm:500,columnAxes:{x:[10000,20000,30000],y:[16000,18500]}}});Grid.setPhase(G,[0,0]);G.aisleSurfaceMode='network';
const horizontal=Lay.placeStalls(G,[{a:[1000,10000],b:[39000,10000],v:null,h:10000,kind:'spur'}],[G.inner],[R(1000,7000,39000,13000)],[],[],false,{stallRowSelection:'continuous'});
assert.equal(horizontal.stalls.length,12);assert(horizontal.stalls.every(s=>s.bb[0]>=10000&&s.bb[2]<=30000));
result.horizontalOuterBays={scope:'placement-only, no supplied column solids, no reach certification',count:horizontal.stalls.length,enumeratedX:[10000,30000],laneX:[1000,39000],innerX:[400,39600],noOuterBayCandidates:true};

// A tiny core touching a large enclosed island exempts the whole island in the current heuristic.
const island={aisles:[R(0,0,30000,30000),R(6000,6000,24000,24000).reverse()],ramp:null,cores:[]};
assert.equal(E._emptyIslands(island,[]).length,1);
const islandSweep={cases:0,coreOverlapsHole:0,wholeIslandExempted:0,noCoreOverlapFlagged:0};
for(let i=0;i<21;i++)for(let j=0;j<21;j++){
 const b=[4500+i*1000,4500+j*1000,5500+i*1000,5500+j*1000],hits=overlap(b,[6000,6000,24000,24000])>10000;
 const findings=E._emptyIslands({...island,cores:[{pts:R(...b)}]},[]);islandSweep.cases++;
 if(hits){islandSweep.coreOverlapsHole++;assert.equal(findings.length,0);islandSweep.wholeIslandExempted++;}
 else{assert.equal(findings.length,1);islandSweep.noCoreOverlapFlagged++;}
}
result.islandSweep={...islandSweep,holeM2:324,coreM2:1,interpretation:'Measures a heuristic exception, not proof that every exempt core island is a bad plan'};
const golden=JSON.parse(fs.readFileSync(path.join(repo,'04_parking/02_tests/fixtures/underground-golden-cases.json'),'utf8'));
result.goldenSources=golden.cases.map(c=>({id:c.id,source:c.source}));
const goldenInput=clone(golden.cases.find(c=>c.id==='rectangle').input),normal=E.generate(goldenInput);
assert.equal(normal.stallCount,130);assert(normal.graph.hasLoop);result.controls.rectangle=summary(normal);
result.checks.selfCheck=true;
if(args.includes('--check'))assert.deepEqual(result,JSON.parse(fs.readFileSync(path.join(__dirname,'measurements.json'),'utf8')));
if(option('--output'))fs.writeFileSync(path.resolve(option('--output')),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
