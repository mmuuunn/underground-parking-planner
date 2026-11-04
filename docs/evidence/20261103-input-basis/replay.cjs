'use strict';
// Self-audit only. Existing code, inputs, tests and acceptance rules are never written.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os'),vm=require('node:vm'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const args=process.argv.slice(2),option=k=>args.includes(k)?args[args.indexOf(k)+1]:null;
const repo=path.resolve(__dirname,'../../..'),read=p=>fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''),json=p=>JSON.parse(read(p));
const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),valueHash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const visual='C:/Users/seok2/.codex/visualizations/2026/11/02';
const e2Dir=path.join(visual,'01a19c45-577f-7672-823f-da810977b649/e2-reference-layouts');
const wallDir=path.join(visual,'01a19ced-e76b-7a61-89cf-c9cc7fc092ef/wall-row-build');
const evidence=path.join(visual,'01a19ced-e76b-7a61-89cf-c9cc7fc092ef/input-basis-replay');
const itemFile=path.join(repo,'tools/harness/work-items/UG-WALL-ROW-CANDIDATE-001.yaml');
const contract=text=>{const lines=text.split(/\r?\n/),i=lines.indexOf('completion_contract: |'),out=[];assert(i>=0);for(const l of lines.slice(i+1)){if(l&&!l.startsWith('  '))break;out.push(l.slice(2));}return JSON.parse(out.join('\n'));};
const scene=contract(read(itemFile)).product.scene;
const sourceDir=path.join(repo,'04_parking/01_src'),pageFile=path.join(sourceDir,'CODEX_ug_compare_page.js');
const bb=P=>[Math.min(...P.map(p=>p[0])),Math.min(...P.map(p=>p[1])),Math.max(...P.map(p=>p[0])),Math.max(...P.map(p=>p[1]))];
const centers=columns=>columns.map(P=>{const b=bb(P);return [(b[0]+b[2])/2,(b[1]+b[3])/2];});
const spans=xs=>xs.slice(1).map((x,i)=>x-xs[i]);

if(option('--engine')){
 const variant=option('--engine');assert(['current','rejected'].includes(variant));
 if(variant==='rejected'){
  // Load preserved source bytes into a fresh process; do not copy them into the product tree.
  const Module=require('node:module'),original=Module._extensions['.js'],overlay=new Map();
  for(const name of ['CLAUDE_ugp_network.js','CLAUDE_ugp_plan.js','CODEX_ug_compare_page.js'])overlay.set(path.resolve(sourceDir,name==='CODEX_ug_compare_page.js'?name:'plan/'+name),path.join(wallDir,name+'.rejected'));
  Module._extensions['.js']=(module,file)=>overlay.has(path.resolve(file))?module._compile(read(overlay.get(path.resolve(file))),file):original(module,file);
 }
 const E=require(path.join(sourceDir,'CLAUDE_ug_plan_engine.js')),Grid=require(path.join(sourceDir,'plan/CLAUDE_ugp_grid.js')),V=require(path.join(sourceDir,'plan/CLAUDE_ugp_verify.js'));
 const page=read(variant==='rejected'?path.join(wallDir,'CODEX_ug_compare_page.js.rejected'):pageFile);
 const modules=page.split(/\r?\n/).find(l=>l.startsWith('const MODULES = '));assert(modules);
 const planning=page.slice(page.indexOf('function planningMass('),page.indexOf('// 코어 생성기 2판'));
 const adapter=page.slice(page.indexOf('const planInput = () => {'),page.indexOf('function solveCurveInput('));assert(planning.startsWith('function planningMass(')&&adapter.startsWith('const planInput'));
 const context={doc:structuredClone(scene),UGPlan:E,WALL:400,referenceScene:null,coreLayouts:()=>null,projectFloor:()=>scene.floorMm||3800,docPhase:()=>scene.phase,rampSpec:r=>E.createStraightRamp({landing:r.p,angleDeg:r.alignedAngleDeg,widthMm:r.w,lengthMm:r.len})};
 vm.createContext(context);vm.runInContext(modules+'\n'+planning+'\n'+adapter+'\nglobalThis.input=planInput();globalThis.normal=MODULES.normal;',context);
 const input=structuredClone(context.input),before=JSON.stringify(input),r=E.generate(input),frame=Grid.frame(input),outCenters=centers(r.columns);
 assert.equal(JSON.stringify(input),before);assert.equal(r.columns.length,12);
 const expected=scene.columnAxes.x.flatMap(x=>scene.columnAxes.y.map(y=>[x,y]));assert.deepEqual(outCenters,expected);
 const removed=structuredClone(r);removed.columns=removed.columns.slice(1);
 const originalVerdict=V.check(r,input),removedVerdict=V.check(removed,input);
 const result={variant,inputHash:valueHash(input),sceneHash:valueHash(scene),normalModule:structuredClone(context.normal),explicitAxes:scene.columnAxes,xSpansMm:spans(scene.columnAxes.x),ySpansMm:spans(scene.columnAxes.y),missingInteriorYForDeclared8m:[12000,28000].filter(y=>!scene.columnAxes.y.includes(y)),count:r.stallCount,status:r.status,columnCount:r.columns.length,columnsPreserved:true,inputPreserved:true,loop:r.graph.hasLoop,deadSide:r.deadSideCount,counts:r.placementReport.counts,issues:r.violations.map(v=>v.id),automaticWallRow:r.automaticWallRow||null,structureRepeatMm:frame.gy,laneRepeatMm:frame.P,outputDeletionProbe:{originalColumns:r.columns.length,probeColumns:removed.columns.length,originalIssues:originalVerdict.violations.map(v=>v.id),probeIssues:removedVerdict.violations.map(v=>v.id),probeStatus:removedVerdict.status,note:'Only an in-memory output copy loses one column; original input/output files are untouched'}};
 const F=require(path.join(sourceDir,'sghs-reference.js')),d=F.floors[0].calibrated;
 result.documentedNonuniformControl={source:'sghs-reference.js calibrated; partially estimated, not structural approval',normalizeAccepts:!!Grid.normalize({...d,grid:{...F.grid,columnAxes:d.columnAxes,columnMm:d.referenceColumnMm,columnIntersections:d.columnIntersections}}),xSpansMm:spans(d.columnAxes.x),ySpansMm:spans(d.columnAxes.y),omissions:d.columnIntersections};
 process.stdout.write(JSON.stringify(result));return;
}

const outDir=path.resolve(option('--out-dir')||fs.mkdtempSync(path.join(os.tmpdir(),'ug-input-basis-replay-')));fs.mkdirSync(outDir,{recursive:true});
const result={kind:'SELF_AUDIT_NOT_INDEPENDENT_REVIEW_NOT_PRODUCT_ACCEPTANCE',representativeFailures:2};
const source=json(path.join(e2Dir,'fixed-input.json')),schemes=json(path.join(e2Dir,'schemes.json')).schemes,raw=json(source.source).candidates[0];
const c=centers(source.fixed.columns),known=[[36750,36400],[44850,36400]];
assert.deepEqual(source.fixed,raw.fixed);
result.e2={input:path.join(e2Dir,'fixed-input.json'),source:source.source,provenance:source.provenance,sourceFixedPreserved:true,columnCount:c.length,xAxesMm:[...new Set(c.map(p=>p[0]))].sort((a,b)=>a-b),yAxesMm:[...new Set(c.map(p=>p[1]))].sort((a,b)=>a-b),userFlaggedPoints:known.map(point=>({point,present:c.some(p=>p[0]===point[0]&&p[1]===point[1])})),schemes:schemes.map(s=>({id:s.id,count:s.stalls.length,columnCount:s.fixed.columns.length,fixedPreserved:JSON.stringify(s.fixed)===JSON.stringify(source.fixed)})),savedHistoricalVerification:{passed:json(path.join(e2Dir,'verification.json')).passed,generatorImported:json(path.join(e2Dir,'verification.json')).generatorImported}};
assert.equal(result.e2.columnCount,38);assert(result.e2.userFlaggedPoints.every(p=>!p.present));assert(result.e2.schemes.every(s=>s.fixedPreserved));

const spatialCode=`import json,sys
from shapely.geometry import Polygon,box,shape,Point
from pathlib import Path
d=Path(sys.argv[1]);src=json.loads((d/'fixed-input.json').read_text(encoding='utf-8'));cases=json.loads((d/'schemes.json').read_text(encoding='utf-8'))['schemes'];f=src['fixed'];out=[]
for x,y in [(36750,36400),(44850,36400)]:
 p=box(x-300,y-300,x+300,y+300)
 out.append({'point':[x,y],'footprintInsideFloor':p.difference(Polygon(f['innerOutline'])).area<1,'rampOverlapMm2':p.intersection(Polygon(f['ramp'])).area,'schemes':[{'id':c['id'],'aisleOverlapMm2':p.intersection(shape(c['aisle'])).area,'stallHits':[s['id'] for s in c['stalls'] if p.intersection(Polygon(s['polygon'])).area>1]} for c in cases]})
print(json.dumps(out))
`;
const spatial=spawnSync('python',['-c',spatialCode,e2Dir],{encoding:'utf8',timeout:30000});
result.e2.spatial=spatial.status===0?JSON.parse(spatial.stdout):{unreproduced:String(spatial.stderr).slice(-1000)};

// Run byte-identical original criteria on copied evidence; its report writes only into this new folder.
const copyDir=path.join(outDir,'e2-original-verifier');fs.mkdirSync(copyDir,{recursive:true});
for(const name of ['verify.py','fixed-input.json','schemes.json','repository-before.json']){fs.copyFileSync(path.join(e2Dir,name),path.join(copyDir,name));assert.equal(digest(path.join(e2Dir,name)),digest(path.join(copyDir,name)));}
const run=spawnSync('python',[path.join(copyDir,'verify.py')],{encoding:'utf8',timeout:120000,maxBuffer:2*1024*1024});
fs.writeFileSync(path.join(copyDir,'execution.log'),(run.stdout||'')+'\n'+(run.stderr||''));
const oldSnapshot=json(path.join(e2Dir,'repository-before.json')),drift=Object.entries(oldSnapshot).filter(([p,h])=>!fs.existsSync(path.join(repo,p))||digest(path.join(repo,p))!==h).map(([p])=>p);
result.e2.originalVerifierReplay={criteriaByteIdentical:true,exitCode:run.status,repositoryDrift:drift,completeReplay:run.status===0,error:run.status===0?null:(run.stderr||run.error?.message||'unknown').split(/\r?\n/).find(l=>l.startsWith('AssertionError'))||'Original verifier did not complete',geometryChecksReachedPreservationGuard:(run.stderr||'').includes('assert not changed,changed')};

const children={};for(const variant of ['current','rejected']){
 const run=spawnSync(process.execPath,[__filename,'--engine',variant],{encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024});assert.equal(run.status,0,run.stderr);children[variant]=JSON.parse(run.stdout);
}
assert.equal(children.current.count,53);assert.equal(children.rejected.count,54);assert.equal(children.current.inputHash,children.rejected.inputHash);
assert(children.current.missingInteriorYForDeclared8m.length===2&&children.rejected.ySpansMm.every(s=>s===16000));
result.wall={sceneSource:itemFile,current:children.current,rejectedArchive:children.rejected,sameInputHash:true};
const prior=json(path.join(wallDir,'files-before.json'));
result.wall.historicalDependencyDrift=prior.filter(p=>!fs.existsSync(path.join(repo,p.path))||digest(path.join(repo,p.path)).toUpperCase()!==p.hash.toUpperCase()).map(p=>p.path);
const protectedFiles=json(path.join(evidence,'protected-before.json'));
result.preservation={protectedFiles:protectedFiles.length,changed:protectedFiles.filter(p=>!fs.existsSync(p.path)||digest(p.path).toUpperCase()!==p.hash.toUpperCase()).map(p=>p.path)};
result.preservation.replayCriticalChanges=result.preservation.changed.filter(p=>p.startsWith(e2Dir)||p.startsWith(wallDir)||/CLAUDE_ugp_|CODEX_ug_compare_page|sghs-reference|CLAUDE_ug_plan_engine|package\.json|underground-compare\.html|02_tests/.test(p));
assert.deepEqual(result.preservation.replayCriticalChanges,[]);
// Concurrent unrelated work is reported, not silently treated as this audit's write or a geometry verdict.
const stable=v=>{v=structuredClone(v);delete v.preservation;delete v.wall.historicalDependencyDrift;delete v.e2.originalVerifierReplay.repositoryDrift;return v;};
if(args.includes('--check'))assert.deepEqual(stable(result),stable(json(path.join(__dirname,'measurements.json'))));
if(option('--output'))fs.writeFileSync(path.resolve(option('--output')),JSON.stringify(result,null,2)+'\n');
fs.writeFileSync(path.join(outDir,'measurements.json'),JSON.stringify(result,null,2)+'\n');
process.stdout.write(JSON.stringify({kind:result.kind,outDir,e2:result.e2,wall:{current:result.wall.current.count,rejected:result.wall.rejectedArchive.count,sameInputHash:true,ySpansMm:result.wall.current.ySpansMm,columns:result.wall.current.columnCount,historicalDependencyDrift:result.wall.historicalDependencyDrift},preservation:result.preservation},null,2)+'\n');
