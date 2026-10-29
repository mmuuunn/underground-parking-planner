'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),evidence='C:/Users/seok2/.codex/research/AISLE-SURFACE-JOINS-20261030',base=JSON.parse(fs.readFileSync(path.join(evidence,'baseline.json'),'utf8'));
const canonical=x=>JSON.parse(JSON.stringify(x)),hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function main(){
  for(const name of ['CLAUDE_ugp_layout.js','CLAUDE_ugp_plan.js']){
    const file='04_parking/01_src/plan/'+name,prior=execFileSync('git',['show','814a9dd:'+file],{cwd:root,encoding:'utf8'});
    assert.equal(fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n'),prior.replace(/\r\n/g,'\n'),name+' must exactly match original source');
  }
  for(const [file,expected] of Object.entries(base.protected))assert.equal(hash(path.join(root,file)),expected,'user file preserved: '+file);
  const E=require('../01_src/plan/CLAUDE_ugp_plan.js'),G=require('../01_src/plan/CLAUDE_ugp_geom.js');
  const cases=require('./fixtures/underground-golden-cases.json').cases,golden=cases.map(c=>{
    const r=E.generate(c.input),prior=base.golden.find(b=>b.id===c.id).result;
    assert.deepEqual(canonical(r),prior,c.id+' entire result must be restored');return{id:c.id,count:r.stallCount,columns:r.columns.length};
  });
  const engine=E.generate(base.engineInput),old=canonical(base.result);assert.deepEqual(old.planMass,old.planningBoundary.floorMass);delete old.planMass;assert.deepEqual(canonical(engine),old,'entire SGHS result restored');
  const {chromium}=require('playwright'),browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1500,height:1050}}),errors=[];
  try{
    page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8874/04_parking/underground-compare.html?reference=sghs&floor=B1&revision=calibrated');await page.waitForFunction(()=>window.sghsScene?.snapshot()?.result?.graph);
    await page.reload();await page.waitForFunction(()=>window.sghsScene?.snapshot()?.result?.graph);
    const take=()=>page.evaluate(()=>JSON.parse(JSON.stringify(window.sghsScene.snapshot()))),s=await take();
    assert.deepEqual(s.input,base.input);assert.deepEqual(s.result,base.result);assert(!s.result.networkCandidate);
    await page.screenshot({path:path.join(evidence,'recovered.png'),fullPage:true});
    await page.evaluate(()=>{ui.view=fitBox([[12000,22000],[30000,35000]],svg.clientWidth,svg.clientHeight,60);setView();});
    await page.screenshot({path:path.join(evidence,'recovered-detail.png'),fullPage:true});
    await page.reload();await page.waitForFunction(()=>window.sghsScene?.snapshot()?.result?.graph);const again=await take();assert.deepEqual(again,s);assert.deepEqual(errors,[]);
    const summary={status:'RESTORED_NOT_FIXED',golden,actualAutomatic:true,reloadStable:true,userFilesPreserved:true,sghs:{count:engine.stallCount,components:engine.aisles.filter(P=>G.signedArea(P)>0).length,aisleAreaM2:Math.abs(G.areaOf(engine.aisles))/1e6,entireResultMatchesOriginal:true},limits:['Original aisle scraps and pre-existing disconnections remain unresolved','Failed implementation was withdrawn; this is recovery, not product progress']};
    fs.writeFileSync(path.join(evidence,'recovery.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
