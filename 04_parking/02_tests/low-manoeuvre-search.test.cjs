'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const M=require('../01_src/plan/vehicle-manoeuvres.js'),Search=require('../01_src/plan/low-manoeuvre-search.js');
const rect=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]],wide=M.createSpace({aisles:[rect(-50000,-50000,100000,100000)]}),v=M.vehicle({clearanceMm:100});
const line=(gear,lengthMm)=>({gear,curvature:0,lengthMm}),wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
function exact(result,goal){assert.equal(result.state,'path-found');assert(Math.hypot(result.end[0]-goal[0],result.end[1]-goal[1])<.01);assert(Math.abs(wrap(result.end[2]-goal[2]))<1e-7);let q=result.start;for(const c of result.controls){assert(Math.abs(c.curvature)<=1/v.minRadiusMm+1e-12);const p=M.motion(wide,q,c.gear,c.curvature,c.lengthMm,v);assert(p.ok);q=p.q;}assert(Math.hypot(q[0]-result.end[0],q[1]-result.end[1])<.01);}
test('zero-switch analytic path replaces a confirmed shunting route without mutating it',()=>{
  const start=[0,0,0],goals=[[6000,0,0]],baseline={controls:[line(-1,600),line(1,6600)]},before=structuredClone({start,goals,baseline});
  const r=Search.search(wide,start,goals,v,{baseline,maxNodes:0});exact(r,goals[0]);assert.equal(r.gearChanges,0);assert(Math.abs(r.lengthMm-6000)<1e-7);assert.equal(r.source,'analytic');assert.deepEqual({start,goals,baseline},before);
});
test('fewer gear changes take precedence over a nearer target',()=>{
  const r=Search.search(wide,[0,0,0],[[-600,0,0],[6000,0,0]],v,{initialGear:1,finalGear:0,maxNodes:0});exact(r,[6000,0,0]);assert.equal(r.goalIndex,1);assert.equal(r.gearChanges,0);
});
test('reverse-only connectors preserve actual curvature and exact heading',()=>{
  for(const goal of [[-6000,0,0],[-9000,-9000,Math.PI/2]]){const r=Search.search(wide,[0,0,0],[goal],v,{initialGear:-1,finalGear:-1,maxNodes:0});exact(r,goal);assert(r.controls.every(c=>c.gear===-1));assert.equal(r.gearChanges,0);}
});
test('turning paths satisfy the rear-axle radius and exact endpoint',()=>{
  for(const goal of [[9000,9000,Math.PI/2],[9000,-9000,-Math.PI/2],[15000,1000,.1]])exact(Search.search(wide,[0,0,0],[goal],v,{maxNodes:0}),goal);
});
test('a confirmed route is retained when both new-search budgets are zero',()=>{
  const baseline={controls:[line(-1,600),line(1,6600)]},r=Search.search(wide,[0,0,0],[[6000,0,0]],v,{baseline,maxNodes:0,maxAnalyticPaths:0});assert.equal(r.source,'baseline');assert.equal(r.gearChanges,2);assert.deepEqual(r.controls,baseline.controls);assert.equal(r.optimality,'not-proven-globally');
});
test('a tolerance-sized endpoint gap is never accepted as a baseline connection',()=>{
  assert.throws(()=>Search.search(wide,[0,0,0],[[6300,0,0]],v,{baseline:{controls:[line(1,6000)]}}),/일치하지/);
});
test('a blocked exact goal cannot be replaced by the legacy 700mm goal tolerance',()=>{
  const space=M.createSpace({aisles:[rect(-10000,-3000,14400,6000)]}),small=M.vehicle({clearanceMm:0,sampleMm:25}),goal=[900,0,0];
  const approximate=M.search(space,[0,0,0],goal,small,{maxNodes:2,initialGear:1,finalGear:1});assert.equal(approximate.state,'path-found');assert(!M.poseFits(space,goal,small));
  const r=Search.search(space,[0,0,0],[goal],small,{maxNodes:2,maxAnalyticPaths:0});assert.equal(r.state,'not-found');assert(r.stats.expanded<=2);assert(r.stats.approximateGoalsFound>0);
});
test('internal obstacles and a baseline crossing them are rejected',()=>{
  const blocked=M.createSpace({aisles:[rect(-20000,-20000,40000,40000)],columns:[rect(-100,-100,200,200)]});
  const r=Search.search(blocked,[0,0,0],[[6000,0,0]],v,{maxNodes:0});assert.equal(r.state,'not-found');assert.equal(r.reason,'blocked-start-pose');
  assert.throws(()=>Search.search(blocked,[0,0,0],[[6000,0,0]],v,{baseline:{controls:[line(1,6000)]}}),/開始|시작/);
});
test('invalid poses, vehicle conditions, controls and budgets fail at the boundary',()=>{
  for(const bad of [[],[[Infinity,0,0]],[[0,0]],Array.from({length:65},()=>[0,0,0])])assert.throws(()=>Search.search(wide,[0,0,0],bad,v));
  for(const options of [{maxNodes:-1},{maxNodes:30001},{maxNodes:NaN},{maxAnalyticPaths:Infinity},{initialGear:2},{finalGear:2},{maxLengthMm:0}])assert.throws(()=>Search.search(wide,[0,0,0],[[6000,0,0]],v,options));
  for(const control of [{gear:1,curvature:1/1000,lengthMm:1000},line(1,-1),line(0,1000)])assert.throws(()=>Search.search(wide,[0,0,0],[[6000,0,0]],v,{baseline:{controls:[control]}}));
  assert.throws(()=>Search.search(wide,[0,0,0],[[6000,0,0]],{minRadiusMm:1000}));
});
test('budget exhaustion remains not-found and cannot claim optimality or impossibility',()=>{
  const r=Search.search(wide,[0,0,0],[[6000,0,0]],v,{maxNodes:0,maxAnalyticPaths:0});assert.equal(r.state,'not-found');assert.equal(r.reason,'search-limit');assert.equal(r.optimality,'not-proven-globally');assert.equal(r.stats.expanded,0);assert.equal(r.stats.analyticTested,0);
});
test('a stationary exact target is valid only at a fitting pose',()=>{
  const r=Search.search(wide,[0,0,0],[[0,0,0]],v,{maxNodes:0,maxAnalyticPaths:0});assert.equal(r.state,'path-found');assert.deepEqual(r.controls,[]);assert.equal(r.gearChanges,0);
});
test('loop projection and slicing handle closure, wraparound and full-circle arcs',()=>{
  const circle={start:[0,0,0],controls:[{lengthMm:2*Math.PI*4500,curvature:1/4500}]},loop=Search.loop(circle),s=4500*1.5*Math.PI,q=loop.at(s),n=loop.nearest(q);assert(Math.abs(n.s-s)<.01);assert(n.distanceMm<.01);
  const a=loop.lengthMm-500,b=500,controls=loop.between(a,b),end=controls.reduce((q,c)=>M.advance(q,c.lengthMm,c.curvature),loop.at(a));assert(Math.hypot(end[0]-loop.at(b)[0],end[1]-loop.at(b)[1])<.01);assert(Math.abs(controls.reduce((s,c)=>s+c.lengthMm,0)-1000)<.01);assert.deepEqual(loop.between(1000,1000),[]);
  assert.throws(()=>Search.loop({start:[0,0,0],controls:[line(1,6000)]}));assert.throws(()=>Search.loop({start:[0,0,0],controls:[line(-1,6000)]}));
});
test('CLI documents its read-only output and rejects missing or malformed evidence',()=>{
  const cli=path.resolve(__dirname,'../../tools/search-low-manoeuvres.cjs');assert(cp.execFileSync(process.execPath,[cli,'--help'],{encoding:'utf8'}).includes('입력은 수정하지'));
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'low-manoeuvre-'));
  try{const a=path.join(temp,'candidates.json'),b=path.join(temp,'report.json');fs.writeFileSync(a,'{}');fs.writeFileSync(b,'{invalid');assert.notEqual(cp.spawnSync(process.execPath,[cli,a,b],{encoding:'utf8'}).status,0);assert.equal(fs.readFileSync(a,'utf8'),'{}');assert.equal(fs.readFileSync(b,'utf8'),'{invalid');}
  finally{assert(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep+'low-manoeuvre-'));fs.rmSync(temp,{recursive:true});}
});
