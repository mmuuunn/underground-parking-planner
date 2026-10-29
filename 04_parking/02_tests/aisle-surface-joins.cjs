'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),src=path.join(root,'04_parking/01_src/plan');
const G=require(src+'/CLAUDE_ugp_geom.js'),Lay=require(src+'/CLAUDE_ugp_layout.js'),E=require(src+'/CLAUDE_ugp_plan.js'),V=require(src+'/CLAUDE_ugp_verify.js');
const {CL,add,sub,mul,len,norm,rot,rectPoly,boolOp,areaOf,toC,fromC}=G,I=CL.ClipType.ctIntersection,D=CL.ClipType.ctDifference,X=CL.ClipType.ctXor;
const area=P=>Math.abs(areaOf(P)),op=(A,B,t=I)=>boolOp(A,B,t),over=(A,B,t=I)=>area(op(A,B,t));
const canonical=x=>JSON.parse(JSON.stringify(x)),hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function engineResult(r){r=canonical(r);if(r.planMass){assert.deepEqual(r.planMass,r.planningBoundary.floorMass);delete r.planMass;}return r;}
const evidence=path.resolve(process.argv[3]||process.env.AISLE_EVIDENCE||'C:/Users/seok2/.codex/research/AISLE-SURFACE-JOINS-20261030');
const saved=()=>JSON.parse(fs.readFileSync(path.join(evidence,'baseline.json'),'utf8'));
const seg=(a,b,extra={})=>({a,b,kind:'ring',ri:0,cut:true,h:G.isH(a,b)?a[1]:null,v:G.isV(a,b)?a[0]:null,...extra});
const bounds=[rectPoly([-200000,-200000,200000,200000])];
const surface=(ps,w=6000,obs=[])=>Lay.aisleSurface({a:w,aisleSurfaceMode:'joined'},[],ps,bounds,obs);
function offset(P,w,closed=false){const co=new CL.ClipperOffset(2,2),out=new CL.Paths();co.AddPath(toC(P),CL.JoinType.jtMiter,closed?CL.EndType.etClosedLine:CL.EndType.etOpenButt);co.Execute(out,w/2);return out.map(fromC);}
const band=(a,b,w)=>offset([a,b],w);
const roi=[rectPoly([21500,25500,24000,31300])],probe=[22600,27000];
const contains=(Ps,p)=>Ps.reduce((s,P)=>s+(CL.Clipper.PointInPolygon({X:p[0],Y:p[1]},toC(P))?Math.sign(G.signedArea(P)):0),0)!==0;
const protectedFiles=['AGENTS.md','README.md','docs/COMPLETION_BASELINE.md'];
const golden=require('./fixtures/underground-golden-cases.json').cases;
function generated(input){let captured;const original=Lay.aisleSurface;Lay.aisleSurface=(...a)=>{captured=a;return original(...a);};try{return {result:E.generate(input),captured};}finally{Lay.aisleSurface=original;}}
async function browser(name){
  const {chromium}=require('playwright'),browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1500,height:1050}}),errors=[];
  if(name==='before-reproduced'){
    const {execFileSync}=require('node:child_process');
    for(const file of ['CLAUDE_ugp_layout.js','CLAUDE_ugp_plan.js']){
      const body=execFileSync('git',['show',(saved().sourceCommit||'814a9dd')+':04_parking/01_src/plan/'+file],{cwd:root,encoding:'utf8'});
      await page.route('**/01_src/plan/'+file,route=>route.fulfill({contentType:'text/javascript',body}));
    }
  }
  try{page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8874/04_parking/underground-compare.html?reference=sghs&floor=B1&revision=calibrated');await page.waitForFunction(()=>window.sghsScene?.snapshot()?.result?.graph);
    await page.reload();await page.waitForFunction(()=>window.sghsScene?.snapshot()?.result?.graph);
    const s=await page.evaluate(()=>({...window.sghsScene.snapshot(),engineInput:planInput()}));await page.screenshot({path:path.join(evidence,name+'.png'),fullPage:true});
    await page.evaluate(()=>{ui.view=fitBox([[12000,22000],[30000,35000]],svg.clientWidth,svg.clientHeight,60);setView();});
    await page.screenshot({path:path.join(evidence,name+'-detail.png'),fullPage:true});
    await page.reload();await page.waitForFunction(()=>window.sghsScene?.snapshot()?.result?.graph);const again=await page.evaluate(()=>window.sghsScene.snapshot());
    assert.deepEqual(again.input,s.input);assert.deepEqual(again.result,s.result);assert.deepEqual(errors,[]);assert(!s.result.networkCandidate);
    fs.writeFileSync(path.join(evidence,name+'.json'),JSON.stringify(s));return s;
  }finally{await browser.close();}
}
async function main(){
  fs.mkdirSync(evidence,{recursive:true});
  if(process.argv[2]==='--before-ui'){const s=await browser('before-reproduced');assert.deepEqual(engineResult(s.result),engineResult(saved().result));console.log('Original engine reproduced the saved nine-stall baseline in the actual product UI');return;}
  if(process.argv[2]==='--capture'){
    assert(!fs.existsSync(path.join(evidence,'baseline.json')),'Never overwrite captured baseline evidence');
    const s=await browser('before'),sourceCommit=require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),base={sourceCommit,input:s.input,engineInput:s.engineInput,result:s.result,protected:Object.fromEntries(protectedFiles.map(f=>[f,hash(path.join(root,f))])),golden:golden.map(c=>({id:c.id,result:E.generate(c.input)}))};
    assert.deepEqual(canonical(E.generate(s.engineInput)),engineResult(s.result));fs.writeFileSync(path.join(evidence,'baseline.json'),JSON.stringify(base));console.log('Captured actual automatic product and six golden cases');return;
  }
  let cases=0,maxExcess=0,maxMissing=0;const failures=[];
  for(const angle of [0,15,30,45,60,75,90])for(const rotation of [0,30,60,90,120,150])for(const width of [6000,6500,7000])for(const move of [[0,0],[10000,20000],[37000,-25000],[-15000,8000]]){
    const rad=angle*Math.PI/180,world=p=>add(rot(p,rotation),move),P=[[-25000*Math.cos(rad),-25000*Math.sin(rad)],[0,0],[25000,0]].map(world),ps=[seg(P[0],P[1]),seg(P[1],P[2])],actual=surface(ps,width),expected=offset(P,width);
    const excess=over(actual,expected,D),missing=over(expected,actual,D);maxExcess=Math.max(maxExcess,excess);maxMissing=Math.max(maxMissing,missing);
    assert(excess<=10000&&missing<=10000,JSON.stringify({angle,rotation,width,move,excess,missing}));
    // Clipper stores integer millimetres; inset probes 1mm, while the full offset comparison above is exact.
    for(const p of ps)assert(over(band(p.a,p.b,width-2),actual,D)<=10000,'normal full-width band '+JSON.stringify({angle,rotation,width,move}));
    assert(over(actual,surface(ps.slice().reverse().map(p=>({...p,a:p.b,b:p.a})),width),X)<=10000,'ordering and direction');cases++;
  }
  for(const rotation of [0,30,90,150])for(const move of [[0,0],[37000,-25000]]){
    const W=p=>add(rot(p,rotation),move),s=(a,b,e)=>seg(W(a),W(b),e),box=b=>[rectPoly(b).map(W)];
    const t=[s([-20000,0],[20000,0]),s([0,0],[0,20000])],paths=surface(t);
    for(const p of t)assert(over(band(p.a,p.b,6000),paths,D)<=10000,'T full width');
    for(const gap of [1,10,31,100,500,6000]){
      const broken=surface([s([-20000,0],[0,0]),s([gap,0],[20000,0])]);assert(over(broken,box([1,-2900,gap-1,2900]))<10000,'real gap stays open');
    }
    const cut=Lay.cutByCores({a:6000},[seg([-20000,0],[20000,0])],[{r:[-1000,-1000,1000,1000]}],[]);
    assert.deepEqual(cut.map(p=>[p.aEnd,p.bEnd]),[['network','cut'],['cut','network']]);
    const transformed=cut.map(p=>({...p,a:W(p.a),b:W(p.b)})),clipped=surface(transformed);
    assert(over(clipped,box([-3899,-2900,3899,2900]))<=10000,'cut gap is not healed');
    for(const p of transformed)assert(over(band(p.a,p.b,6000),clipped,D)<=10000,'cut retained width');
    const terminal=surface([s([0,0],[20000,0])]);assert(over(terminal,box([-2999,-2900,-1,2900]))<=10000);assert(over(terminal,box([20001,-2900,22999,2900]))<=10000);
  }
  const base=saved(),{result:r,captured:[frame,rings,pieces,floor,obstacles]}=generated(base.engineInput),old=base.result;
  assert(!r.networkCandidate);for(const f of protectedFiles)assert.equal(hash(path.join(root,f)),base.protected[f],f+' preserved');
  for(const k of ['columns','cores','occupants','ramp','innerOutline','planningBoundary','parkingInnerPaths'])assert.deepEqual(canonical(r[k]),old[k],k+' preserved');
  assert.deepEqual(r.graph.nodes,old.graph.nodes);assert.deepEqual(r.graph.edges.map(e=>[e.a,e.b]),old.graph.edges.map(e=>[e.a,e.b]));assert.equal(r.grid.aisleMm,6000);
  const removed=over(op(old.aisles,r.aisles,D),roi)/1e6,added=over(op(r.aisles,old.aisles,D),roi)/1e6;
  const joint=[19000,27600],incident=pieces.filter(s=>[s.a,s.b].some(p=>len(sub(frame.W(p),joint))<1));assert.equal(incident.length,2);
  const ends=incident.map(s=>len(sub(frame.W(s.a),joint))<1?s.b:s.a),expectedJoin=offset([ends[0],frame.L(joint),ends[1]],frame.a).map(P=>P.map(p=>frame.W(p).map(Math.round)));
  const joinDifference=over(op(r.aisles,roi),op(expectedJoin,roi),X)/1e6;assert(joinDifference<=.01,'actual ROI must match independent connected offset');
  assert(contains(old.aisles,probe)&&!contains(r.aisles,probe));
  if(!(removed>2.6&&added<.01))failures.push({check:'frozen marked-region threshold',expected:'removed > 2.6m2; added < 0.01m2',removed,added});
  let maxBandLoss=0;
  const local=Lay.aisleSurface(frame,rings,pieces,floor,obstacles);
  for(const p of pieces){const allowed=op(op(band(p.a,p.b,frame.a-2),floor),obstacles.map(c=>rectPoly(c.r)),D),missing=over(allowed,local,D);maxBandLoss=Math.max(maxBandLoss,missing);assert(missing<=10000,'SGHS full normal band retained '+JSON.stringify(p));}
  const audit=V.check(r,base.engineInput);assert.equal(audit.counts.noFront,0);assert.equal(audit.counts.clash,0);assert.equal(r.status,old.status);
  assert(over(r.aisles,r.columns.concat(r.cores.map(c=>c.pts),r.occupants.map(c=>c.pts),[r.ramp.body]))<=10000,'no obstacle collisions');
  const key=s=>JSON.stringify(s.pts),kept=old.stalls.filter(s=>r.stalls.some(t=>key(t)===key(s))),lost=old.stalls.filter(s=>!r.stalls.some(t=>key(t)===key(s))),addedStalls=r.stalls.filter(s=>!old.stalls.some(t=>key(t)===key(s)));
  const oldOnNew=V.check({...old,aisles:r.aisles},base.engineInput);
  const lostDetails=lost.map(s=>({pts:s.pts,reason:oldOnNew.stallState[old.stalls.indexOf(s)]}));
  assert(lostDetails.every(s=>s.reason==='noFront'),'any lost existing stall must have depended on the removed cap');
  const fixtureComparison=golden.map((c,i)=>{
    const now=E.generate(c.input),prior=base.golden[i].result,oldOnNew=V.check({...prior,aisles:now.aisles},c.input);
    const lost=prior.stalls.filter(s=>!now.stalls.some(t=>key(t)===key(s))),added=now.stalls.filter(s=>!prior.stalls.some(t=>key(t)===key(s)));
    const actual={stallCount:now.stallCount,hasLoop:now.graph.hasLoop,deadEnds:now.graph.deadEnds.length,dryAreaM2:now.dryAreaM2,status:now.status,violations:[...new Set(now.violations.map(v=>v.id))].sort()};
    const matches=JSON.stringify(actual)===JSON.stringify(c.expected);
    if(!matches)failures.push({check:c.id+' original golden',actual,expected:c.expected});
    const structureMatches=JSON.stringify(now.columns)===JSON.stringify(prior.columns);
    if(!structureMatches)failures.push({check:c.id+' columns preserved',before:prior.columns.length,after:now.columns.length});
    return{id:c.id,before:prior.stallCount,after:now.stallCount,dryBeforeM2:prior.dryAreaM2,dryAfterM2:now.dryAreaM2,aisleBeforeM2:area(prior.aisles)/1e6,aisleAfterM2:area(now.aisles)/1e6,removedAreaM2:over(prior.aisles,now.aisles,D)/1e6,addedAreaM2:over(now.aisles,prior.aisles,D)/1e6,status:now.status,oldOnNew:oldOnNew.counts,lost:lost.map(s=>({pts:s.pts,state:oldOnNew.stallState[prior.stalls.indexOf(s)]})),added,goldenMatches:matches,structureMatches};
  });
  const live=await browser('after');assert.deepEqual(live.input,base.input);assert.deepEqual(engineResult(live.result),canonical(r));
  const summary={sweep:{cases,maxExcessM2:maxExcess/1e6,maxMissingM2:maxMissing/1e6},sghs:{beforeCount:old.stallCount,afterCount:r.stallCount,retained:kept.length,removed:lostDetails,added:addedStalls,removedInMarkedRegionM2:removed,addedInMarkedRegionM2:added,independentJoinDifferenceM2:joinDifference,aisleBeforeM2:area(old.aisles)/1e6,aisleAfterM2:area(r.aisles)/1e6,maxRetainedBandLossM2:maxBandLoss/1e6,oldStallsOnNewSurface:oldOnNew.counts,finalFrontFailures:audit.counts.noFront,clashes:audit.counts.clash,status:r.status},golden:fixtureComparison,liveAutomatic:true,reloadStable:true,protectedFilesUnchanged:true,failures};
  fs.writeFileSync(path.join(evidence,'validation.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
  assert.equal(failures.length,0,'Frozen acceptance or existing golden results differ; no acceptance values were changed');
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
