'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const E=require('../01_src/plan/CLAUDE_ugp_plan.js'),Grid=require('../01_src/plan/CLAUDE_ugp_grid.js'),Lay=require('../01_src/plan/CLAUDE_ugp_layout.js'),G=require('../01_src/plan/CLAUDE_ugp_geom.js');
const page=fs.readFileSync(path.join(__dirname,'../01_src/CODEX_ug_compare_page.js'),'utf8'),controls=fs.readFileSync(path.join(__dirname,'../01_src/planning-controls.js'),'utf8');
const slice=(start,end)=>page.slice(page.indexOf(start),page.indexOf(end,page.indexOf(start)));
const copy=x=>JSON.parse(JSON.stringify(x));
const formIds=['columnSizeMm','structureMode','structureFields','axisStartX','axisStartY','axisSpansX','axisSpansY','applyStructure'];
function setup(initialDoc,initialStorage){
  const nodes=new Map(),node=id=>{if(nodes.has(id))return nodes.get(id);let value='';const n={id,get value(){return value;},set value(v){value=String(v);},disabled:false,hidden:false,textContent:'',innerHTML:'',files:[],click(){},classList:{toggle(){}},removeAttribute(){},appendChild(){},insertAdjacentHTML(_,html){this.innerHTML=html+this.innerHTML;},closest(){return node('section');},get valueAsNumber(){return this.value===''?NaN:Number(this.value);},reportValidity(){return Number.isSafeInteger(this.valueAsNumber)&&this.valueAsNumber>0;}};nodes.set(id,n);return n;};
  let doc={v:2,mass:[[0,0],[49400,0],[49400,50000],[0,50000]],ucs:0,module:'normal',referenceColumnMm:600,columnAxes:{x:[4000,12100,20200,28300,36400,44500],y:[4000,12000,20000,28000,36000,44000]},cores:[],occupants:[],occupantPolicy:'report',allowExternalRamp:true,autoZones:true,ramp:{p:[400,8400],k:0,alignedAngleDeg:0,len:24000,w:6000},floorMm:3800};
  doc.phase={key:JSON.stringify([doc.mass,doc.ucs,doc.module,doc.columnAxes,doc.referenceColumnMm]),p:[3600,7600]};
  if(initialDoc)doc=copy(initialDoc);
  const storage=new Map(initialStorage||[['ug-compare:v2:plan:original','original-scene']]),STORE='ug-compare:v2:plan:column-test';
  const c={doc,STORE,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},storage,$:node,inputs:[],exports:[],Blob,URL:{createObjectURL:b=>{c.exports.push(b);return 'blob:test';},revokeObjectURL(){}},setTimeout:f=>f(),escapeText:x=>x,UGPlan:E,UGP:{geom:G,grid:Grid,layout:Lay},WALL:400,FLOOR:3800,referenceScene:null,ui:{drag:null,res:null},MODULES:{normal:{grid:{gx:8100,gy:8000,stallW:2500,stallD:5000}}},curveMode:()=>false,projectFloor:()=>3800,rot:G.rot,setTool(){},renderEdit(){},flash(){},document:{createElement:()=>node('structure'),querySelector:s=>node(s),activeElement:null},renderAll:()=>c.columnUI?.renderStructure(),recompute:()=>vm.runInContext('recomputeNow()',c),solve:()=>{const input=vm.runInContext('planInput()',c);c.inputs.push(copy(input));return E.generate(input);}};
  vm.createContext(c);
  vm.runInContext(slice('const rampSpec =','function evaluateCurveRamp')+slice('const phaseKey =','// 코어 생성기')+slice('const planInput =','function solveCurveInput')+slice('function validDoc(d)','let doc =')+slice('const hist =','const ui =')+slice('function recomputeNow(label)','// 끄는 중'),c);
  c.recompute();vm.runInContext('pushHist();',c);
  vm.runInContext(controls.slice(0,controls.indexOf('  const text=s=>'))+'globalThis.columnUI={renderStructure,apply:applyStructure,state:()=>({structureDirty,structureKey})};renderStructure();})();',c);
  return {c,node,storage,STORE};
}
function snapshot({c,node,storage}){
  return JSON.stringify({doc:c.doc,storage:[...storage],hist:vm.runInContext('hist',c),state:c.columnUI.state(),form:formIds.map(id=>{const n=node(id);return [id,n.value,n.hidden,n.disabled];})});
}
function draft(s,value){s.node('columnSizeMm').value=value;s.node('columnSizeMm').oninput();}
function apply(s,value){draft(s,value);s.node('applyStructure').onclick();}
function importFile(s,value,raw=false,size=100){s.node('structureFile').files=[{size,text:async()=>raw?value:JSON.stringify(value)}];return s.node('structureFile').onchange();}
function axisFile(s,axes=s.c.doc.columnAxes){return {schema:'ug-column-axes/1',unit:'mm',ucs:s.c.doc.ucs,columnAxes:copy(axes)};}
function installAxisCallers(s){
  const {c}=s,drawing=fs.readFileSync(path.join(__dirname,'../01_src/CODEX_underground_drawing_presentation.js'),'utf8'),events={};
  c.UGPlanningUI={structure:{apply:c.columnUI.apply}};c.axisEdit={entry:null,drag:null};c.axisForm={};c.axisHelp=()=>{};c.drawLabels=()=>{};
  c.svg={addEventListener:(name,fn)=>{events[name]=fn;},hasPointerCapture:()=>false,releasePointerCapture(){}};
  vm.runInContext(drawing.slice(drawing.indexOf('  function closeAxisEntry()'),drawing.indexOf('  axisButton.onclick=')),c);
  vm.runInContext(drawing.slice(drawing.indexOf('  axisForm.onsubmit='),drawing.indexOf("  $('cancelAxisDimension').onclick")),c);
  vm.runInContext(drawing.slice(drawing.indexOf("  svg.addEventListener('pointerup'"),drawing.indexOf("  svg.addEventListener('wheel'")),c);
  return events;
}
test('column input applies 600→500→600 with fixed axes/phase, saving, reload and undo',()=>{
  const {c,node,storage,STORE}=setup();assert.match(node('structure').innerHTML,/id="columnSizeMm"/);
  const axes=JSON.stringify(c.doc.columnAxes),phase=JSON.stringify(c.doc.phase.p);assert.equal(c.ui.res.stallCount,62);
  const apply=n=>{node('columnSizeMm').value=String(n);node('columnSizeMm').oninput();node('applyStructure').onclick();};
  apply(500);assert.equal(c.doc.referenceColumnMm,500);assert.equal(c.ui.res.stallCount,66);assert.equal(c.ui.res.columns.length,36);assert.equal(JSON.stringify(c.doc.columnAxes),axes);assert.equal(JSON.stringify(c.doc.phase.p),phase);
  const saved=storage.get(STORE);assert.equal(JSON.parse(saved).referenceColumnMm,500);c.doc=vm.runInContext('load()',c);c.recompute();assert.equal(c.ui.res.stallCount,66);
  apply(600);assert.equal(c.ui.res.stallCount,62);assert.equal(c.doc.referenceColumnMm,600);
  vm.runInContext('jump(hist.i-1)',c);assert.equal(c.ui.res.stallCount,66);assert.equal(c.doc.referenceColumnMm,500);assert.equal(node('columnSizeMm').value,'500');
  vm.runInContext('jump(hist.i+1)',c);assert.equal(c.ui.res.stallCount,62);assert.equal(node('columnSizeMm').value,'600');
  assert.equal(storage.get('ug-compare:v2:plan:original'),'original-scene');
});
test('legacy documents keep the 600mm default until applying, including automatic structure',()=>{
  const {c,node}=setup();delete c.doc.columnAxes;delete c.doc.referenceColumnMm;
  vm.runInContext('doc.phase={key:phaseKey(),p:[3600,7600]}',c);c.recompute();
  assert.equal(node('columnSizeMm').value,'600');assert.equal(c.doc.referenceColumnMm,undefined);
  node('columnSizeMm').value='500';node('columnSizeMm').oninput();node('applyStructure').onclick();
  assert.equal(c.doc.columnAxes,undefined);assert.equal(c.doc.referenceColumnMm,500);
  assert(c.ui.res.columns.every(P=>{const b=G.bbox(P);return b[2]-b[0]===500&&b[3]-b[1]===500;}));
});
test('invalid sizes/axis spacing preserve the applied document; revert cancels pending width',()=>{
  const {c,node,storage,STORE}=setup(),before=JSON.stringify(c.doc),saved=storage.get(STORE);
  const history=JSON.stringify(vm.runInContext('hist',c));
  for(const value of ['',0,-500,500.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,9000]){node('columnSizeMm').value=String(value);node('columnSizeMm').oninput();node('applyStructure').onclick();assert.equal(JSON.stringify(c.doc),before);assert.equal(storage.get(STORE),saved);assert.equal(JSON.stringify(vm.runInContext('hist',c)),history);}
  node('columnSizeMm').value='500';node('axisSpansY').value='0.4 8 8 8 8';node('applyStructure').onclick();assert.equal(JSON.stringify(c.doc),before);
  node('revertStructure').onclick();assert.equal(node('columnSizeMm').value,'600');assert.equal(JSON.stringify(c.doc),before);
  node('columnSizeMm').value='500';node('axisSpansY').value='0.55 8 8 8 8';node('applyStructure').onclick();assert.equal(c.doc.columnAxes.y[1]-c.doc.columnAxes.y[0],550);assert.equal(c.doc.referenceColumnMm,500);
});
test('S0-F1: missing/falsy file axes preserve all unapplied fields, storage and history',async()=>{
  const s=setup();draft(s,'500');s.node('axisStartX').value='4.1';s.node('axisSpansY').value='7 8 9';
  for(const value of [undefined,null,false,0,'']){
    const file=axisFile(s);if(value===undefined)delete file.columnAxes;else file.columnAxes=value;
    const before=snapshot(s);await importFile(s,file);assert.equal(snapshot(s),before,String(value));assert.match(s.node('structureMessage').textContent,/불러오지 못했습니다/);
  }
});
test('S0-P1: malformed files/cancel are atomic; valid import stays unapplied; export stays axes-only',async()=>{
  const s=setup();draft(s,'500');s.node('axisStartX').value='4.123';
  const invalid=[['{',true],['{}',true],[{...axisFile(s),schema:'bad'}],[{...axisFile(s),unit:'m'}],[{...axisFile(s),ucs:1}],[{...axisFile(s),ucs:null}],
    [axisFile(s,{x:[],y:[0,8000]})],[axisFile(s,{x:[0,499],y:[0,8000]})],[axisFile(s,{x:[8000,0],y:[0,8000]})],[axisFile(s,{x:[0,8000],y:null})],
    [axisFile(s,{x:[0,8000],y:[0,8000],z:[]})],[axisFile(s),false,65537]];
  for(const [value,raw,size]of invalid){const before=snapshot(s);await importFile(s,value,raw,size);assert.equal(snapshot(s),before);assert.match(s.node('structureMessage').textContent,/불러오지 못했습니다/);}
  s.node('structureFile').files=[];const cancelled=snapshot(s);await s.node('structureFile').onchange();assert.equal(snapshot(s),cancelled);
  const beforeDoc=JSON.stringify(s.c.doc),beforeStore=JSON.stringify([...s.storage]),beforeHist=JSON.stringify(vm.runInContext('hist',s.c));
  const axes=copy(s.c.doc.columnAxes);axes.x[0]+=100;
  await importFile(s,axisFile(s,axes));assert.equal(JSON.stringify(s.c.doc),beforeDoc);assert.equal(JSON.stringify([...s.storage]),beforeStore);assert.equal(JSON.stringify(vm.runInContext('hist',s.c)),beforeHist);assert.equal(s.node('columnSizeMm').value,'500');assert.equal(s.node('axisStartX').value,'4.1');assert.equal(s.node('applyStructure').disabled,false);
  s.node('exportStructure').onclick();const exported=JSON.parse(await s.c.exports[0].text());assert.deepEqual(exported,axisFile(s));assert.deepEqual(Object.keys(exported),['schema','unit','ucs','columnAxes']);
  s.node('applyStructure').onclick();assert.equal(s.c.doc.referenceColumnMm,500);assert.deepEqual(copy(s.c.doc.columnAxes),axes);
});
test('S0-F2: both axis key orders retain the valid phase and 62→66→62 geometry across fresh reload',()=>{
  for(const reverse of [false,true]){
    const seed=setup().c.doc;
    if(reverse)seed.columnAxes={y:seed.columnAxes.y,x:seed.columnAxes.x};
    seed.phase.key=JSON.stringify([seed.mass,seed.ucs,seed.module,seed.columnAxes,seed.referenceColumnMm]);
    const s=setup(seed),axes=copy(s.c.doc.columnAxes),unrelated=copy(s.c.doc);for(const key of ['columnAxes','referenceColumnMm','phase'])delete unrelated[key];
    vm.runInContext('save()',s.c);
    assert.equal(s.c.ui.res.stallCount,62);
    for(const [size,count]of [[500,66],[600,62]]){
      apply(s,size);assert.equal(s.c.ui.res.stallCount,count);assert.equal(s.c.ui.res.columns.length,36);assert.deepEqual(copy(s.c.doc.columnAxes),axes);assert.deepEqual(copy(vm.runInContext('planInput().phase',s.c)),[3600,7600]);
      assert(s.c.ui.res.columns.every(P=>{const b=G.bbox(P);return b[2]-b[0]===size&&b[3]-b[1]===size;}));
      const other=copy(s.c.doc);for(const key of ['columnAxes','referenceColumnMm','phase'])delete other[key];assert.deepEqual(other,unrelated);
      const fresh=setup(JSON.parse(s.storage.get(s.STORE)),s.storage);assert.equal(fresh.c.ui.res.stallCount,count);assert.equal(fresh.node('columnSizeMm').value,String(size));assert.equal(vm.runInContext('validDoc(load())',fresh.c),true);
    }
  }
});
test('S0-F3: external API ignores every unapplied size string and only explicit apply commits it',()=>{
  const s=setup();
  for(const raw of ['500','','invalid','500.5','Infinity']){
    draft(s,raw);s.node('axisStartX').value='5';const before=JSON.stringify(s.c.doc),hist=JSON.stringify(vm.runInContext('hist',s.c));
    s.c.columnUI.apply(copy(s.c.doc.columnAxes),'외부 축 편집');assert.equal(s.c.doc.referenceColumnMm,600);assert.equal(JSON.stringify(s.c.doc),before);assert.equal(JSON.stringify(vm.runInContext('hist',s.c)),hist);assert.equal(s.node('columnSizeMm').value,raw);assert.equal(s.node('axisStartX').value,'4');assert.equal(s.node('applyStructure').disabled,false);assert.match(s.node('structureMessage').textContent,/적용 중.*600.*미적용/);
  }
  draft(s,'500');s.node('applyStructure').onclick();assert.equal(s.c.doc.referenceColumnMm,500);assert.equal(s.c.ui.res.stallCount,66);
});
test('S0-F3/P3/P5: real numeric/drag callers use applied size, keep drafts, and restore history forms',()=>{
  for(const caller of ['numeric','drag']){
    const s=setup(),events=installAxisCallers(s);draft(s,'500');
    const original=copy(s.c.doc),axes=copy(original.columnAxes);
    if(caller==='numeric'){
      s.c.axisEdit.entry={axis:'x',index:1,axes,doc0:JSON.stringify(original)};s.node('axisDimensionValue').value='8.2';s.c.axisForm.onsubmit({preventDefault(){}});
      assert.equal(s.node('axisDimensionError').textContent,'');assert.equal(s.c.doc.columnAxes.x[1],12200);
    }else{
      s.c.axisEdit.drag={axis:'x',index:0,axes,delta:100,pointerId:1,doc0:JSON.stringify(original)};events.pointerup({pointerId:1,preventDefault(){},stopImmediatePropagation(){}});assert.equal(s.c.doc.columnAxes.x[0],4100);
    }
    assert.equal(s.c.doc.referenceColumnMm,600);assert.equal(JSON.parse(s.storage.get(s.STORE)).referenceColumnMm,600);assert.equal(s.node('columnSizeMm').value,'500');assert.equal(s.c.inputs.at(-1).phase,undefined);assert.equal(s.c.ui.res.grid.phaseFrom,'auto');
    const edited=JSON.stringify(s.c.doc);vm.runInContext('jump(hist.i-1)',s.c);assert.deepEqual(copy(s.c.doc),original);assert.equal(s.node('columnSizeMm').value,'600');vm.runInContext('jump(hist.i+1)',s.c);assert.equal(JSON.stringify(s.c.doc),edited);assert.equal(s.node('columnSizeMm').value,'600');
    draft(s,'500');s.node('revertStructure').onclick();assert.equal(s.node('columnSizeMm').value,'600');assert.equal(JSON.stringify(s.c.doc),edited);
    const cancelBefore=snapshot(s);s.c.axisEdit.drag={axes:copy(s.c.doc.columnAxes),delta:100,pointerId:2};events.pointercancel();assert.equal(snapshot(s),cancelBefore);
  }
});
test('S0-P3/P4: external axis validation uses applied width and never adds a legacy size field',()=>{
  const s=setup();draft(s,'500');const narrow=copy(s.c.doc.columnAxes);narrow.y=[4000,4550,12000,20000,28000,36000];const before=snapshot(s);
  assert.throws(()=>s.c.columnUI.apply(narrow,'외부 축 편집'));assert.equal(snapshot(s),before);
  s.node('axisSpansY').value='0.499 8 8 8 8';const invalidBefore=snapshot(s);s.node('applyStructure').onclick();assert.equal(snapshot(s),invalidBefore);
  s.node('axisSpansY').value='0.5 8 8 8 8';s.node('applyStructure').onclick();assert.equal(s.c.doc.referenceColumnMm,500);assert.equal(s.c.doc.columnAxes.y[1]-s.c.doc.columnAxes.y[0],500);
  delete s.c.doc.referenceColumnMm;s.c.doc.columnAxes=copy(setup().c.doc.columnAxes);vm.runInContext('doc.phase={key:phaseKey(),p:[3600,7600]}',s.c);s.c.recompute();draft(s,'');
  const axes=copy(s.c.doc.columnAxes);axes.x[0]+=100;s.c.columnUI.apply(axes,'옛 문서 축 편집');assert.equal(Object.hasOwn(s.c.doc,'referenceColumnMm'),false);assert.equal(Object.hasOwn(JSON.parse(s.storage.get(s.STORE)),'referenceColumnMm'),false);assert.equal(s.node('columnSizeMm').value,'');assert(s.c.ui.res.columns.every(P=>G.bbox(P)[2]-G.bbox(P)[0]===600));
});
test('S0-P3: an invalid pre-existing phase is not promoted by a size-only edit',()=>{
  const s=setup();s.c.doc.phase={key:'stale',p:[3600,7600]};apply(s,500);assert.equal(s.c.inputs.at(-1).phase,undefined);assert.equal(s.c.ui.res.grid.phaseFrom,'auto');
});
