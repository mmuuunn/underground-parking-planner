'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),src=path.join(root,'04_parking/01_src/plan'),E=require(src+'/CLAUDE_ugp_plan.js'),Lay=require(src+'/CLAUDE_ugp_layout.js'),G=require(src+'/CLAUDE_ugp_geom.js'),V=require(src+'/CLAUDE_ugp_verify.js');
const dir=path.resolve(process.argv[3]||'C:/Users/seok2/.codex/research/AISLE-SURFACE-RELATION-20261030'),mode=process.argv[2];
const I=G.CL.ClipType.ctIntersection,D=G.CL.ClipType.ctDifference,U=G.CL.ClipType.ctUnion,box=G.rectPoly,area=P=>Math.abs(G.areaOf(P))/1e6,op=(a,b,t=I)=>G.boolOp(a,b,t);
const plain=x=>JSON.parse(JSON.stringify(x)),hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),write=(f,x)=>fs.writeFileSync(path.join(dir,f),JSON.stringify(x,null,2));
const protectedFiles=['AGENTS.md','README.md','docs/COMPLETION_BASELINE.md'],cases=require('./fixtures/underground-golden-cases.json').cases;
const roi=[box([16000,19650,22000,25950])],column=[box([19750,22550,20250,23050])];
function generated(input){const traces=[],old=Lay.aisleSurface;Lay.aisleSurface=function(frame,rings,pieces,floor,obstacles){const result=old.apply(this,arguments);traces.push(plain({a:frame.a,rings,pieces,floor,obstacles,result}));return result;};try{return {result:plain(E.generate(input)),traces};}finally{Lay.aisleSurface=old;}}
function canonicalResult(r){r=plain(r);delete r.planMass;return r;}
async function live(name){
 const {chromium}=require('playwright'),browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1500,height:1050}}),page=await context.newPage(),errors=[];
 try{
  page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8874/04_parking/underground-compare.html?reference=sghs&floor=B1&revision=calibrated');
  const take=async()=>{await page.waitForFunction(()=>window.sghsScene?.snapshot()?.result?.graph);return page.evaluate(()=>({snapshot:JSON.parse(JSON.stringify(window.sghsScene.snapshot())),engineInput:JSON.parse(JSON.stringify(planInput()))}));};
  const first=await take();await page.screenshot({path:path.join(dir,name+'-first.png'),fullPage:true});await page.reload();const settled=await take();
  const norm=s=>{s=plain(s);delete s.result.grid.phaseFrom;return s;};assert.deepEqual(norm(first.snapshot),norm(settled.snapshot),'initial save changes no geometry');
  await page.screenshot({path:path.join(dir,name+'.png'),fullPage:true});
  for(const [id,bounds] of [['column',[[14000,18000],[23500,27500]]],['join',[[12000,28000],[30000,42000]]]]){
   await page.evaluate(bounds=>{ui.view=fitBox(bounds,svg.clientWidth,svg.clientHeight,60);setView();},bounds);await page.screenshot({path:path.join(dir,name+'-'+id+'.png'),fullPage:true});
  }
  await page.reload();const again=await take();assert.deepEqual(again,settled);assert.deepEqual(errors,[]);assert(!settled.snapshot.result.networkCandidate);
  write(name+'.json',{...settled,first: first.snapshot,firstReopenGeometryEqual:true,reopenEqual:true,errors});return settled;
 }finally{await context.close();await browser.close();}
}
function geometryControls(){
 const bounds=[box([-50000,-50000,50000,50000])],seg=(a,b)=>({a,b,kind:'row',h:a[1]===b[1]?a[1]:null,v:a[0]===b[0]?a[0]:null});
 const surface=(pieces,width=6000,obstacles=[],floor=bounds)=>Lay.aisleSurface({a:width},[],pieces,floor,obstacles);
 const band=(a,b,w)=>{const u=G.norm(G.sub(b,a)),n=[-u[1]*w/2,u[0]*w/2];return[G.add(a,n),G.add(b,n),G.sub(b,n),G.sub(a,n)];};
 for(const ps of [[seg([-20000,0],[20000,0])],[seg([-20000,0],[0,0]),seg([0,0],[0,20000])],[seg([-20000,0],[20000,0]),seg([0,0],[0,20000])]]){
  const actual=surface(ps);for(const p of ps)assert(area(op([band(p.a,p.b,6000)],actual,D))<=.01,'normal width');assert.equal(actual.filter(P=>G.signedArea(P)>0).length,1,'normal junction connected');
 }
 let positions=0;
 for(const width of [4000,6000,8000])for(let x=-3500;x<=3500;x+=500)for(let y=-6000;y<=6000;y+=1000){
  const obstacles=[{r:[x-250,y-250,x+250,y+250]}],floor=[box([-width/2,-15000,width/2,15000])],expected=op(floor,obstacles.map(c=>box(c.r)),D),actual=surface([seg([0,-20000],[0,20000])],width,obstacles,floor);
  assert(area(op(expected,actual,D))<=.01&&area(op(actual,expected,D))<=.01,'physical obstacle only: '+[width,x,y]);positions++;
 }
 for(const gap of [1,10,100,300,1000,6000]){
  const floor=[box([-20000,-3000,0,3000]),box([gap,-3000,20000,3000])],actual=surface([seg([-20000,0],[20000,0])],6000,[],floor);
  assert.equal(actual.filter(P=>G.signedArea(P)>0).length,2,'real floor gap preserved');assert.equal(area(op(actual,[box([0,-3000,gap,3000])])),0);
 }
 const wall=[{r:[-3500,-500,3500,500]}],blocked=surface([seg([0,-20000],[0,20000])],6000,wall);
 assert.equal(blocked.filter(P=>G.signedArea(P)>0).length,2,'full-width physical barrier preserved');return {normal:3,columnPositions:positions,physicalGaps:6,fullBarrier:1};
}
async function main(){
 fs.mkdirSync(dir,{recursive:true});
 if(mode==='--capture'){
  assert(!fs.existsSync(path.join(dir,'baseline.json')),'Never overwrite baseline');
  const s=await live('before'),engine=generated(s.engineInput);assert.deepEqual(engine.result,canonicalResult(s.snapshot.result));
  const baseline={head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),input:s.snapshot.input,engineInput:s.engineInput,result:engine.result,traces:engine.traces,golden:cases.map(c=>({id:c.id,result:plain(E.generate(c.input))})),protected:Object.fromEntries(protectedFiles.map(f=>[f,hash(path.join(root,f))]))};
  write('baseline.json',baseline);console.log(JSON.stringify({captured:true,count:engine.result.stallCount,aisleM2:area(engine.result.aisles),roiM2:area(op(engine.result.aisles,roi))}));return;
 }
 assert.equal(mode,'--verify');const base=JSON.parse(fs.readFileSync(path.join(dir,'baseline.json'),'utf8')),controls=geometryControls(),now=generated(base.engineInput),r=now.result,failures=[];
 const check=(label,fn)=>{try{fn();}catch(e){failures.push({label,error:e.message});}};
 for(const [f,h]of Object.entries(base.protected))check('preserve '+f,()=>assert.equal(hash(path.join(root,f)),h));
 for(const key of ['columns','cores','occupants','ramp','innerOutline','planningBoundary','parkingInnerPaths'])check('SGHS '+key,()=>assert.deepEqual(r[key],base.result[key]));
 check('graph topology',()=>assert.deepEqual({nodes:r.graph.nodes,edges:r.graph.edges.map(e=>[e.a,e.b,e.kind])},{nodes:base.result.graph.nodes,edges:base.result.graph.edges.map(e=>[e.a,e.b,e.kind])}));
 check('physical ROI',()=>assert.equal(area(op(r.aisles,roi)),37.55));
 check('physical column preserved',()=>{assert(r.columns.some(P=>JSON.stringify(P)===JSON.stringify(column[0])));assert.equal(area(op(r.aisles,column)),0);});
 check('full floor and obstacle relation',()=>{const last=now.traces.at(-1);assert.equal(area(op(last.result,last.floor,D)),0);assert.equal(area(op(last.result,last.obstacles.map(c=>box(c.r)))),0);});
 let generatedPhases=0;
 for(const dx of [-1000,-500,0,500,1000])for(const dy of [-1000,-500,0,500,1000]){
  const sample=generated({...base.engineInput,phase:[base.engineInput.phase[0]+dx,base.engineInput.phase[1]+dy]}),final=sample.traces.at(-1);
  check('design lines at phase '+[dx,dy],()=>{assert(final.pieces.every(p=>!p.cut),'clearance cuts must not define floor ends');assert.equal(area(op(final.result,final.floor,D)),0);assert.equal(area(op(final.result,final.obstacles.map(c=>box(c.r)))),0);assert.deepEqual(sample.result.columns,base.result.columns);});generatedPhases++;
 }
 check('six metre and unmet circulation',()=>{assert.equal(r.grid.aisleMm,6000);assert.equal(r.graph.hasLoop,false);assert.equal(r.status,'INFEASIBLE');assert(r.violations.some(v=>v.id==='FIXED_COLUMN_BLOCKS_ROUTE'));assert(r.violations.some(v=>v.id==='NO_LOOP'));});
 const golden=cases.map(c=>{const next=plain(E.generate(c.input)),before=base.golden.find(x=>x.id===c.id).result,actual={stallCount:next.stallCount,hasLoop:next.graph.hasLoop,deadEnds:next.graph.deadEnds.length,dryAreaM2:next.dryAreaM2,status:next.status,violations:[...new Set(next.violations.map(v=>v.id))].sort()};check(c.id+' frozen golden',()=>assert.deepEqual(actual,c.expected));check(c.id+' entire baseline',()=>assert.deepEqual(next,before));return{id:c.id,beforeCount:before.stallCount,afterCount:next.stallCount,wholeResultEqual:JSON.stringify(before)===JSON.stringify(next),aisleBeforeM2:area(before.aisles),aisleAfterM2:area(next.aisles),actual};});
 const key=s=>JSON.stringify(s.pts),audit=V.check(r,base.engineInput),oldOnNew=V.check({...base.result,aisles:r.aisles},base.engineInput),lost=base.result.stalls.filter(s=>!r.stalls.some(t=>key(t)===key(s))),added=r.stalls.filter(s=>!base.result.stalls.some(t=>key(t)===key(s)));
 check('final stall collision and frontage',()=>{assert.equal(audit.counts.clash,0);assert.equal(audit.counts.noFront,0);});
 const s=await live('after');check('same product input',()=>assert.deepEqual(s.snapshot.input,base.input));check('actual automatic product',()=>assert.deepEqual(canonicalResult(s.snapshot.result),r));
 const summary={controls:{...controls,generatedPhases},before:{count:base.result.stallCount,aisleM2:area(base.result.aisles),components:base.result.aisles.filter(P=>G.signedArea(P)>0).length,roiM2:area(op(base.result.aisles,roi))},after:{count:r.stallCount,aisleM2:area(r.aisles),components:r.aisles.filter(P=>G.signedArea(P)>0).length,roiM2:area(op(r.aisles,roi)),status:r.status,routes:s.snapshot.routes},golden,stalls:{retained:base.result.stalls.length-lost.length,lost:lost.map(s=>({pts:s.pts,stateOnNewSurface:oldOnNew.stallState[base.result.stalls.indexOf(s)]})),added,counts:audit.counts},failures};
 write('validation.json',summary);write('after-engine.json',now);console.log(JSON.stringify(summary));assert.deepEqual(failures,[],'Frozen work acceptance failed');
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
