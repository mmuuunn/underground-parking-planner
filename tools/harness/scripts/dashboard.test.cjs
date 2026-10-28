'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {parseItem, readDashboard} = require('./dashboard.cjs');

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
