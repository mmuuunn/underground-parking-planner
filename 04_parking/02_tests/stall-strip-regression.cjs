'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const E=require('../01_src/plan/CLAUDE_ugp_plan.js'),G=require('../01_src/plan/CLAUDE_ugp_geom.js'),V=require('../01_src/plan/CLAUDE_ugp_verify.js');
const cases=require('./fixtures/underground-golden-cases.json').cases;
const root=path.resolve(__dirname,'../..'),[mode,target]=process.argv.slice(2),dir=path.resolve(target),plain=x=>JSON.parse(JSON.stringify(x));
const area=P=>Math.abs(G.areaOf(P))/1e6,intersection=(a,b)=>G.boolOp(a,b,G.CL.ClipType.ctIntersection);
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const fixture={...cases[0].input,ramp:{...cases[0].input.ramp,y:48400},phase:[0,0],occupantPolicy:'bypass',occupants:[{id:'solid',c:[66000,46000],w:2000,d:3000}]};
const recovered=[[61250,32400,66250,34900],[61250,37900,66250,40400]],struct=r=>Object.fromEntries(['aisles','columns','cores','occupants','ramp','graph','circulation'].map(k=>[k,r[k]]));
const key=P=>JSON.stringify(P),generated=input=>plain(E.generate(input));
function sweep(){const out=[];for(let ix=0;ix<5;ix++)for(let iy=0;iy<5;iy++){const input={...fixture,occupants:[{id:'solid',c:[10000+14000*ix,10000+9000*iy],w:2000,d:3000}]};out.push({ix,iy,input,result:generated(input)});}return out;}
fs.mkdirSync(dir,{recursive:true});
if(mode==='--capture'){
 assert(!fs.existsSync(path.join(dir,'baseline.json')),'Do not overwrite baseline');
 const input=JSON.parse(fs.readFileSync(path.join(dir,'sghs-input.json'),'utf8')),result=generated(fixture);assert.equal(result.stallCount,125,'counterexample must reproduce before editing');
 const baseline={fixture,result,sghs:{input,result:generated(input)},golden:cases.map(c=>({id:c.id,result:generated(c.input)})),sweep:sweep(),protected:Object.fromEntries(['AGENTS.md','README.md','docs/COMPLETION_BASELINE.md'].map(f=>[f,hash(f)]))};
 fs.writeFileSync(path.join(dir,'baseline.json'),JSON.stringify(baseline,null,2));console.log('Captured 125-stall regression, SGHS, six goldens and 25 bypass cases.');
}else{
 assert.equal(mode,'--verify');const b=JSON.parse(fs.readFileSync(path.join(dir,'baseline.json'),'utf8')),r=generated(b.fixture),verdict=V.check(r,b.fixture);
 assert(r.stallCount>=126,`bypass regression: expected at least 126, got ${r.stallCount}`);
 assert.deepEqual(generated({...b.fixture,stallStripProjection:'envelope'}),b.result,'explicit legacy projection remains available');
 assert.throws(()=>E.generate({...b.fixture,stallStripProjection:'unknown'}),/주차열 장애물 투영/);
 assert.deepEqual(struct(r),struct(b.result),'recover stalls without changing physical geometry or graph');
 for(const bounds of recovered){const s=r.stalls.find(s=>key(G.bbox(s.pts))===key(bounds));assert(s,'valid original stall must be offered again: '+bounds);assert(['ok','deadSide'].includes(verdict.stallState[r.stalls.indexOf(s)]));const x=bounds[2],y=bounds[1];assert.equal(area(intersection(r.aisles,[G.rectPoly([x,y,x+300,y+2500])])),.75,'full front band');}
 assert.equal(verdict.counts.clash,0);assert.equal(verdict.counts.noFront,0);assert.equal(verdict.counts.unreachable,0);
 const sghs=generated(b.sghs.input);assert.deepEqual(sghs,b.sghs.result,'SGHS whole result preserved');assert.equal(sghs.stallCount,9);assert.equal(sghs.grid.aisleMm,6000);
 assert.equal(area(intersection(sghs.aisles,[G.rectPoly([16000,19650,22000,25950])])),37.55);assert.equal(area(intersection(sghs.aisles,[G.rectPoly([19750,22550,20250,23050])])),0);
 for(const c of cases)assert.deepEqual(generated(c.input),b.golden.find(g=>g.id===c.id).result,c.id+' whole golden');
 for(const[f,h]of Object.entries(b.protected))assert.equal(hash(f),h,'preserve '+f);
 for(const input of [{...fixture,occupants:[{c:[40000,30000],w:80000,d:1000}]},{...fixture,occupants:[],massHoles:[G.rectPoly([0,29750,80000,30250])]}]){
  const blocked=generated(input);assert.equal(blocked.aisles.filter(P=>G.signedArea(P)>0).length,2,'physical separation survives normal generation');
  const forbidden=input.massHoles||input.occupants.map(o=>G.rectPoly([o.c[0]-o.w/2,o.c[1]-o.d/2,o.c[0]+o.w/2,o.c[1]+o.d/2]));
  assert.equal(area(intersection(blocked.aisles,forbidden)),0);assert.equal(area(intersection(blocked.stalls.map(s=>s.pts),forbidden)),0);
 }
 const changes=[];
 for(const old of b.sweep){const next=generated(old.input),audit=V.check(next,old.input);assert.deepEqual(struct(next),struct(old.result),'fixed structure and route '+[old.ix,old.iy]);assert(next.stallCount>=old.result.stallCount,'no bypass capacity regression');assert.equal(audit.counts.clash,0);assert.equal(audit.counts.noFront,0);if(key(next.stalls)!==key(old.result.stalls))changes.push({at:[old.ix,old.iy],before:old.result.stallCount,after:next.stallCount,removed:old.result.stalls.filter(s=>!next.stalls.some(t=>key(s.pts)===key(t.pts))),added:next.stalls.filter(s=>!old.result.stalls.some(t=>key(s.pts)===key(t.pts)))});}
 const summary={before:b.result.stallCount,after:r.stallCount,recovered,verdict:verdict.counts,sghs:{count:sghs.stallCount,aisleM2:area(sghs.aisles),roiM2:37.55},golden:6,bypassCases:25,changes};
 fs.writeFileSync(path.join(dir,'validation.json'),JSON.stringify(summary,null,2));fs.writeFileSync(path.join(dir,'after.json'),JSON.stringify({input:b.fixture,result:r},null,2));console.log(JSON.stringify({before:summary.before,after:summary.after,verdict:summary.verdict,golden:6,bypassCases:25,changes:changes.map(c=>({at:c.at,before:c.before,after:c.after}))}));
}
