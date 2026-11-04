'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {parseItem, readProgress, readDashboard} = require('./dashboard.cjs');
const {start} = require('./dashboard.cjs');
const crypto = require('node:crypto');

test('top-level state and lists remain separate from nested records', () => {
  const item = parseItem('\uFEFFid: X\nstatus: RESCOPE_REQUIRED\nquestion: test?\nremaining:\n  - first\n  - second\nother:\n  status: ACCEPTED\n');
  assert.equal(item.status, 'RESCOPE_REQUIRED');
  assert.deepEqual(item.remaining, ['first', 'second']);
  assert.deepEqual(item.acceptance, []);
});

test('selects actual work states and orders evidence without promoting baseline to acceptance', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-dashboard-'));
  try {
    for (const sub of ['work-items', 'runs/a', 'runs/b', 'stages']) fs.mkdirSync(path.join(dir, sub), {recursive:true});
    fs.writeFileSync(path.join(dir, 'policy.yaml'), 'current_stage: vehicle-circulation\n');
    fs.writeFileSync(path.join(dir, 'work-items', 'x.yaml'), 'id: X\nstatus: RESCOPE_REQUIRED\nstage: vehicle-circulation\n');
    fs.writeFileSync(path.join(dir, 'stages', '01_vehicle-circulation.yaml'), 'id: vehicle-circulation\nstatus: ACTIVE\n');
    fs.writeFileSync(path.join(dir, 'runs/a/manifest.json'), JSON.stringify({runId:'a',workItem:'X',startedAt:'2026-01-01',status:'BASELINED',verification:{mode:'BASELINE',passed:true}}));
    fs.writeFileSync(path.join(dir, 'runs/b/manifest.json'), JSON.stringify({runId:'b',workItem:'X',startedAt:'2026-01-02',status:'VERIFICATION_FAILED',verification:{mode:'VERIFY',passed:false}}));
    const data = readDashboard(dir);
    assert.equal(data.items[0].status, 'RESCOPE_REQUIRED');
    assert.deepEqual(data.runs.map(r => r.id), ['b', 'a']);
    assert.equal(data.runs[0].verification.passed, false);
    fs.writeFileSync(path.join(dir, 'work-items', 'x.yaml'), 'id: X\nstatus: IMPLEMENTING\n');
    assert.equal(readDashboard(dir).items[0].status, 'IMPLEMENTING');
  } finally { fs.rmSync(dir, {recursive:true, force:true}); }
});

test('layout experiment source contains no Japanese text', () => {
  const text = fs.readFileSync(path.join(__dirname, '../work-items/UG-LAYOUT-005.yaml'), 'utf8');
  assert.doesNotMatch(text, /[\u3040-\u30ff\u4e00-\u9fff]/);
  assert.match(parseItem(text).question, /B/);
});


test('progress rejects unsupported scores and missing evidence', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-score-'));
  try {
    const p = {rubric:'v1', categories:[{id:'x',label:'X',max:100}], snapshots:[{date:'2026-10-28T20:49:00+09:00',status:'provisional',title:'baseline',scores:{x:52},evidence:{x:'evidence'},changes:[],limitations:[]}]};
    const file = path.join(dir,'progress.json');
    fs.writeFileSync(file,JSON.stringify(p));
    assert.equal(readProgress(dir).snapshots[0].scores.x,52);
    p.snapshots[0].scores.x=101; fs.writeFileSync(file,JSON.stringify(p)); assert.throws(()=>readProgress(dir));
    p.snapshots[0].scores.x=52; p.snapshots[0].evidence.x=''; fs.writeFileSync(file,JSON.stringify(p)); assert.throws(()=>readProgress(dir));
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});

function fixture() {
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'harness-dashboard-evidence-')), dir=path.join(base,'tools','harness');
  for(const sub of ['work-items','runs/one','stages'])fs.mkdirSync(path.join(dir,sub),{recursive:true});
  fs.writeFileSync(path.join(dir,'policy.yaml'),'current_stage: vehicle-circulation\nproduct_goal: test goal\n');
  fs.writeFileSync(path.join(dir,'stages/01_vehicle-circulation.yaml'),'id: vehicle-circulation\nstatus: ACTIVE\nexit_conditions:\n  - evidence required\n');
  fs.writeFileSync(path.join(dir,'dashboard.html'),'<!doctype html><title>Fixture</title>');
  return {base,dir,write:(file,value)=>fs.writeFileSync(path.join(dir,file),typeof value==='string'?value:JSON.stringify(value)),cleanup:()=>{
    assert.equal(path.dirname(base),fs.realpathSync(os.tmpdir()));assert.match(path.basename(base),/^harness-dashboard-evidence-/);fs.rmSync(base,{recursive:true,force:true});
  }};
}
test('completion evidence stays separate from work status and becomes stale after a source edit',()=>{
  const f=fixture();try{
    fs.writeFileSync(path.join(f.base,'engine.js'),'version one');
    f.write('work-items/X.yaml','id: X\nstatus: REVIEW_PENDING\nallowed_files:\n  - engine.js\n  - tools/harness/work-items/X.yaml\nresults:\n  decision: next experiment\n');
    const sha=v=>crypto.createHash('sha256').update(v).digest('hex'), digest=sha(JSON.stringify([['engine.js',sha('version one')]]));
    f.write('runs/one/manifest.json',{runId:'one',workItem:'X',status:'TESTS_PASSED',startedAt:'2026-01-01',verification:{mode:'VERIFY',passed:true,sourceDigest:digest}});
    f.write('runs/one/completion.json',{workItem:'X',runId:'one',status:'TASK_FAILED',sourceDigest:digest,checks:[{passed:false}],review:{status:'PENDING'},user:{status:'PENDING'}});
    let d=readDashboard(f.dir);assert.equal(d.items[0].status,'REVIEW_PENDING');assert.equal(d.runs[0].completion.status,'TASK_FAILED');assert.equal(d.runs[0].freshness,'matching');assert.equal(d.currentWork,null);assert.equal(d.items[0].results.decision,'next experiment');
    fs.writeFileSync(path.join(f.base,'engine.js'),'version two');d=readDashboard(f.dir);assert.equal(d.runs[0].freshness,'changed');assert.equal(d.items[0].status,'REVIEW_PENDING');
    f.write('runs/one/completion.json',{workItem:'OTHER',runId:'one',status:'TASK_VERIFIED'});d=readDashboard(f.dir);assert.equal(d.runs[0].completion,null);assert.ok(d.warnings.some(w=>w.includes('불일치')));
  }finally{f.cleanup()}
});
test('empty records, explicit current work and supported report links are read afresh',()=>{
  const f=fixture();try{
    let d=readDashboard(f.dir);assert.equal(d.items.length,0);assert.equal(d.recentWork,null);assert.equal(d.currentWork,null);assert.equal(d.cases.length,4);
    f.write('work-items/X.yaml','id: X\nstatus: IMPLEMENTING\ndashboard_review_for: X\ndashboard_sources:\n  - tools/harness/review.md\n  - tools/harness/review.json\n');
    f.write('review.md','| 목표 | 문제 | 다음 |\n|---|---|---|\n| △ 범위 | 보완 필요 | 캐시 확인 |\n');f.write('review.json',{sourceDigest:'old'});
    f.write('policy.yaml','current_stage: vehicle-circulation\ncurrent_work_item: X\n');d=readDashboard(f.dir);assert.equal(d.currentWork,'X');assert.deepEqual(d.recordedImplementing,['X']);assert.equal(d.sources.find(s=>s.summary).summary,'보완 필요');assert.equal(d.sources.find(s=>s.summary).next,'캐시 확인');assert.equal(d.sources[0].freshness,'changed');
    f.write('review.md','| △ 범위 | 후속 검토 변경 | 다음 조건 |\n');assert.equal(readDashboard(f.dir).sources.find(s=>s.summary).summary,'후속 검토 변경');
    f.write('work-items/X.yaml','id: X\nstatus: FUTURE_STATE\n');d=readDashboard(f.dir);assert.equal(d.items[0].status,'FUTURE_STATE');assert.equal(d.sources.length,0);
  }finally{f.cleanup()}
});
test('HTTP serves fresh GET records and only registered evidence on loopback',async()=>{
  const f=fixture(), server=start(0,f.dir);try{
    await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
    assert.equal(server.address().address,'127.0.0.1');let response=await fetch(base+'/api/status');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');let d=await response.json();assert.equal(d.items.length,0);
    f.write('work-items/X.yaml','id: X\nstatus: REVIEW_PENDING\n');d=await (await fetch(base+'/api/status')).json();assert.equal(d.items[0].status,'REVIEW_PENDING');
    response=await fetch(base+d.items[0].source.href);assert.equal(response.status,200);assert.match(await response.text(),/REVIEW_PENDING/);
    assert.equal((await fetch(base+'/api/evidence?key=../../policy.yaml')).status,404);assert.equal((await fetch(base+'/api/status',{method:'POST'})).status,405);assert.equal((await fetch(base+'/not-found')).status,404);
  }finally{await new Promise(resolve=>server.close(resolve));f.cleanup()}
});
