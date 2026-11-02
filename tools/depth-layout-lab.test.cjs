'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const L=require('./depth-layout-lab.cjs'),G=require('../04_parking/01_src/plan/CLAUDE_ugp_geom.js');
const checks=[],test=(name,fn)=>{fn();checks.push(name);},R=(a,b,c,d)=>[[a,b],[c,b],[c,d],[a,d]];
// Independent convex separating-axis check; does not use the generator's Clipper intersections.
function overlaps(P,Q){
 for(const S of [P,Q])for(let i=0;i<S.length;i++){const a=S[i],b=S[(i+1)%S.length],n=[a[1]-b[1],b[0]-a[0]],length=Math.hypot(...n);if(!length)continue;
  const p=P.map(x=>(x[0]*n[0]+x[1]*n[1])/length),q=Q.map(x=>(x[0]*n[0]+x[1]*n[1])/length);
  if(Math.min(Math.max(...p),Math.max(...q))-Math.max(Math.min(...p),Math.min(...q))<=.01)return false;
 }return true;
}
function inside(p,paths){let hit=false;for(const P of paths)for(let i=0,j=P.length-1;i<P.length;j=i++){
 const a=P[i],b=P[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;
}return hit;}
function front(s,plan){
 const p=s.pts,center=p.reduce((c,v)=>[c[0]+v[0]/4,c[1]+v[1]/4],[0,0]);
 for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],width=Math.hypot(b[0]-a[0],b[1]-a[1]);if(width>3301)continue;
  const f=[(a[0]+b[0])/2,(a[1]+b[1])/2],d=[f[0]-center[0],f[1]-center[1]],length=Math.hypot(...d),n=d.map(x=>x/length);
  if([.2,.5,.8].every(t=>inside([a[0]+(b[0]-a[0])*t+n[0]*300,a[1]+(b[1]-a[1])*t+n[1]*300],plan.aisles)))
   return {normal:n,back:[center[0]-d[0],center[1]-d[1]]};
 }return null;
}
test('independent overlap check detects collision and permits touching',()=>{
 assert(overlaps(R(0,0,2500,5000),R(2000,4000,2600,4600)));assert(!overlaps(R(0,0,2500,5000),R(2500,0,5000,5000)));
});
const dimension=L.dimensions();
test('dimension sweep crosses actual width, depth, wall and ±1mm boundaries',()=>{
 assert.equal(dimension.count,10584);const pick=(d,depth=5000,width=2500,length=2500,wall=200)=>dimension.records.find(r=>r.d===d&&r.depth===depth&&r.width===width&&r.length===length&&r.wall===wall);
 assert(!pick(4999).oneRow);assert(pick(5000).oneRow);assert(!pick(5000).positiveDA);assert(!pick(5200).positiveDA);assert(pick(5201).positiveDA);
 assert(pick(10000).mirrorRects);assert(!pick(10000).mirrorAndNext);assert(!pick(15999).mirrorAndNext);assert(pick(16000).mirrorAndNext);
 assert(!pick(10000,5200).mirrorRects);assert(pick(10400,5200).mirrorRects);
 assert(!pick(16399,5200).mirrorAndNext);assert(pick(16400,5200).mirrorAndNext);
 assert(!pick(5400,5000,2500,2500,400).positiveDA);assert(pick(5401,5000,2500,2500,400).positiveDA);
 assert(!pick(10000,5000,2600,2599).oneRow);assert(pick(10000,5000,2600,2600).oneRow);
});
test('exact transverse examples separate classification from aisle topology',()=>{
 const d=n=>dimension.tilings.find(t=>t.total===n);assert.equal(d(16000).bothOuter,1);assert.equal(d(20000).bothOuter,17);
 assert.equal(d(26000).bothInnerSingle,1);assert.equal(d(26000).mirrorLayouts,0);
 assert.equal(d(32000).mirrorLayouts,1);assert.deepEqual(d(32000).example,[8000,24000]);
});
test('every declared structural intersection is present or explicitly outside',()=>{
 for(const s of L.scenes()){const p=L.premise(s.input);assert(p.regularModule);assert.equal(p.partial.length,0);assert.equal(p.omitted.length,0);assert.equal(p.inside+p.outside,p.allIntersections);}
 assert.equal(L.premise(L.scenes().find(c=>c.id==='notch').input).outside,4);
});
test('network normalization removes overlaps and zero segments without creating phantom legs',()=>{
 const lines=L.normalize([[[0,0],[0,0],[10000,0]],[[5000,0],[15000,0]]]);
 assert.equal(lines.reduce((n,r)=>n+Math.hypot(r.points[1][0]-r.points[0][0],r.points[1][1]-r.points[0][1]),0),15000);
 assert(lines.every(r=>r.points[0][1]===0&&r.points[1][1]===0));
});
test('candidate generator actually changes lane position, count, direction and topology',()=>{
 const s=L.scenes().find(s=>s.id==='regular'),before=L.hash(s.input),cs=L.candidates(s.input);
 assert(cs.some(c=>c.rows.length===1));assert(cs.some(c=>c.rows.length===3));assert.equal(new Set(cs.map(c=>c.orientation)).size,2);
 assert.equal(new Set(cs.map(c=>c.topology)).size,2);assert(cs.some(c=>c.rows.includes(8400)));assert.equal(L.hash(s.input),before);
});
const data=L.run({quiet:true});
test('free control includes every hypothesis candidate under exactly the same physical input and policy',()=>{
 for(const c of data.cases){assert(c.candidates.some(r=>r.families.includes('hypothesis')));for(const r of c.candidates)assert.equal(r.inputHash,c.inputHash);
  assert.equal(c.bestStructure.id,c.candidates.slice().sort(L.compare)[0].id);
  assert(c.bestStructure.eligible||!c.candidates.some(r=>r.eligible));
 }
});
for(const c of data.cases){
 test(c.id+': all generated candidates preserve the complete input column set',()=>{assert(c.candidates.every(r=>r.columnSame));});
 test(c.id+': kept stalls have independent no-overlap and frontage checks',()=>{
  const plans=[c.bestStructure,c.bestHypothesis].filter(r=>r.eligible);for(const r of plans){const p=r.plan,blocks=p.columns.concat(p.cores.map(c=>c.pts),p.ramp?[p.ramp.body]:[]);
   for(let i=0;i<p.stalls.length;i++){const s=p.stalls[i];assert(front(s,p),'front missing '+c.id+'/'+i);assert(!blocks.some(P=>overlaps(s.pts,P)),'static collision');
    for(let j=0;j<i;j++)assert(!overlaps(s.pts,p.stalls[j].pts),'stall overlap');}
   assert.equal(r.physicalM2,0);assert(r.checks.clash===0&&r.checks.noFront===0&&r.checks.unreachable===0);
  }
 });
}
test('regular generated plan contains actual back-to-back bays with opposing accessible fronts',()=>{
 const p=data.cases.find(c=>c.id==='regular').bestHypothesis.plan,fronts=p.stalls.map(s=>front(s,p));let pairs=0;
 for(let i=0;i<fronts.length;i++)for(let j=0;j<i;j++){const a=fronts[i],b=fronts[j];if(a&&b&&a.normal[0]*b.normal[0]+a.normal[1]*b.normal[1]<-.99&&Math.hypot(a.back[0]-b.back[0],a.back[1]-b.back[1])<1)pairs++;}
 assert(pairs>0);data.independentMirrorPairs=pairs;
});
test('both-outer hall is not thrown away, while return manoeuvres stay unverified',()=>{
 const r=data.cases.find(c=>c.id==='hall').bestHypothesis;assert(r.eligible);assert.equal(r.bays,26);assert(r.exceptions>0);assert(r.depth.faces.every(f=>f.classification==='outer'));
 assert(r.violations.includes('RETURN_MANEUVER_UNVERIFIED'));assert(r.deadSide>0);assert.notEqual(r.status,'FEASIBLE');
});
test('core counterexample is a failed repeated-row recipe, not a claim of universal impossibility',()=>{
 const c=data.cases.find(c=>c.id==='core');assert(c.bestStructure.eligible);assert(c.bestStructure.bays>0);
 assert(!c.bestHypothesis.eligible);assert.equal(c.candidates.filter(r=>r.eligible&&r.families.includes('hypothesis')).length,0);
 assert(c.bestHypothesis.violations.includes('CORE_IN_AISLE'));
});
test('angle/notch trials retain off-aisle and varying-depth failures',()=>{
 const n=data.cases.find(c=>c.id==='notch'),s=data.cases.find(c=>c.id==='slope');assert(n.candidates.some(r=>r.violations.includes('EDGE_OFF_AISLE')&&!r.eligible));
 assert(s.bestHypothesis.depth.faces.some(f=>f.dMaxMm-f.dMinMm>1));assert(s.bestHypothesis.faceClasses.short>0);
});
test('fixed landing blockage produces zero reachable bays in every candidate',()=>{
 const c=data.cases.find(c=>c.id==='landing-block');assert(c.candidates.every(r=>!r.eligible&&r.bays===0));assert(c.candidates.every(r=>r.violations.includes('LANDING')));
});
test('translation and 90-degree rotation keep physical results of a generated network',()=>{
 const s=L.scenes().find(c=>c.id==='regular'),r=data.cases.find(c=>c.id===s.id).bestHypothesis;
 for(const angle of [0,90]){const t=p=>G.add(G.rot(p,angle),[123000,-456000]),i=structuredClone(s.input);i.mass=i.mass.map(t);i.ucs=angle;
  // Axes are absolute UCS coordinates. World translation is transformed back into that frame.
  const delta=G.rot([123000,-456000],-angle);i.grid.columnAxes={x:i.grid.columnAxes.x.map(x=>x+delta[0]),y:i.grid.columnAxes.y.map(y=>y+delta[1])};
  i.ramp={...i.ramp,body:i.ramp.body.map(t),landing:t(i.ramp.landing),start:t(i.ramp.start),tangent:G.rot(i.ramp.tangent,angle)};
  const candidate={...r.candidate,routes:r.candidate.routes.map(route=>({points:route.points.map(t)}))},v=L.evaluate(i,candidate);
  assert.equal(v.bays,r.bays);assert.equal(v.columns,r.columns);assert.equal(v.eligible,r.eligible);assert.deepEqual(v.checks,r.checks);
 }
});
test('local manoeuvre samples are explicit partial witnesses, never whole-journey approvals',()=>{
 const r=data.cases.find(c=>c.id==='regular').bestHypothesis;assert.equal(r.parkingSamples.length,3);assert(r.parkingSamples.every(s=>s.state==='path-found'&&s.poses.length>0));
 assert(r.parkingSamples.every(s=>s.scope.includes('adjacent-aisle')));assert.notEqual(r.status,'FEASIBLE');
});
if(!process.argv.includes('--check')){fs.mkdirSync(L.OUT,{recursive:true});fs.writeFileSync(path.join(L.OUT,'independent-checks.json'),JSON.stringify({checks,mirrorPairs:data.independentMirrorPairs},null,2));}
console.log(JSON.stringify({passed:checks.length,checks,mirrorPairs:data.independentMirrorPairs,candidates:data.cases.reduce((n,c)=>n+c.candidates.length,0)},null,2));
