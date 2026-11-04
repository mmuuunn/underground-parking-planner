'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../01_src/task-workspace.js'),'utf8');
function setup({pending=false,active=false}={}){
  const nodes=new Map(),calls=[],node=id=>{if(!nodes.has(id))nodes.set(id,{value:'500',scrollIntoView:o=>calls.push(['scroll',id,o]),focus:o=>calls.push(['focus',id,o]),getAttribute:()=>String(active),click:()=>{calls.push(['click',id]);if(id==='editStructureCanvas')active=true;}});return nodes.get(id);};
  const c={calls,$:node,inputDetails:{open:false},pending:()=>pending,navigate:t=>calls.push(['navigate',t]),sync:()=>calls.push(['sync']),ui:{sel:null},doc:{cores:[]},setTool:t=>calls.push(['tool',t]),renderAll:()=>calls.push(['render']),flash:t=>calls.push(['flash',t])};vm.createContext(c);
  const start=source.indexOf('    function feature(name)');vm.runInContext(source.slice(start,source.indexOf('    nav.addEventListener(',start)),c);
  return {c,node,calls};
}
test('column actions expose the size input, scroll and focus without committing pending width',()=>{
  const {c,node,calls}=setup(),before=JSON.stringify(c.doc);c.feature('columns');assert.equal(c.inputDetails.open,true);assert.equal(node('columnSizeMm').value,'500');assert.equal(JSON.stringify(c.doc),before);
  assert.deepEqual(calls.filter(x=>x[0]==='navigate'),[['navigate','conditions']]);assert.deepEqual(calls.filter(x=>x[0]==='click'),[['click','editStructureCanvas']]);assert(calls.some(x=>x[0]==='scroll'&&x[1]==='columnSizeMm'));assert(calls.some(x=>x[0]==='focus'&&x[1]==='columnSizeMm'));
  c.feature('columns');assert.equal(calls.filter(x=>x[0]==='click').length,1,'reopening must not toggle axis editing off');
  assert.equal((source.match(/data-feature="columns">기둥 치수·축/g)||[]).length,2,'both navigation buttons must name the size input');
});
test('an unapplied layout preview blocks column navigation and leaves all inputs alone',()=>{
  const {c,node,calls}=setup({pending:true});c.feature('columns');assert.equal(c.inputDetails.open,false);assert.deepEqual(calls,[]);assert.equal(node('columnSizeMm').value,'500');
});
test('core, ramp and outline actions retain their existing behavior',()=>{
  const {c,calls}=setup();c.doc.cores=[{}];c.feature('core');assert.equal(c.ui.sel.kind,'core');assert.equal(c.ui.sel.i,0);c.feature('ramp');assert(calls.some(x=>x[0]==='click'&&x[1]==='workflowRamp'));c.feature('outline');assert.equal(c.ui.sel.kind,'mass');assert.equal(c.inputDetails.open,false);
});
