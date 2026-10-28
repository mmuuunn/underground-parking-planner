'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..');

function parseItem(text) {
  text = text.replace(/^\uFEFF/, '');
  const scalar = key => {
    const match = text.match(new RegExp('^' + key + ':[ \\t]*(.+)$', 'm'));
    return match ? match[1].trim().replace(/^["']|["']$/g, '') : null;
  };
  const list = key => {
    const match = text.match(new RegExp('^' + key + ':[ \\t]*\\r?\\n((?:[ \\t]+-[^\\r\\n]*(?:\\r?\\n|$))*)', 'm'));
    return match ? match[1].split(/\r?\n/).filter(line => /^\s+-\s+/.test(line)).map(line => line.replace(/^\s+-\s+/, '').trim()) : [];
  };
  return { id: scalar('id'), name: scalar('name'), currentStage: scalar('current_stage'), status: scalar('status'), stage: scalar('stage'), question: scalar('question'), reviewer: scalar('reviewer'), userGate: scalar('user_gate'), reviewResult: scalar('review_result'), remaining: list('remaining'), acceptance: list('acceptance') };
}

function readProgress(dir) {
  const progress = JSON.parse(fs.readFileSync(path.join(dir, 'progress.json'), 'utf8').replace(/^\uFEFF/, ''));
  if (!progress.rubric || !Array.isArray(progress.categories) || !progress.categories.length || !Array.isArray(progress.snapshots)) throw Error('평가표 형식 오류');
  const ids = progress.categories.map(c => c.id);
  if (new Set(ids).size !== ids.length || progress.categories.some(c => !c.id || !c.label || !Number.isFinite(c.max) || c.max <= 0) || progress.categories.reduce((n,c) => n+c.max,0) !== 100) throw Error('평가 항목 또는 배점 오류');
  for (const s of progress.snapshots) {
    if (!s.date || !Number.isFinite(Date.parse(s.date)) || !s.status || !s.title || !s.scores || !s.evidence || !Array.isArray(s.changes) || !Array.isArray(s.limitations)) throw Error('평가 기록 형식 오류');
    for (const c of progress.categories) if (!Number.isFinite(s.scores[c.id]) || s.scores[c.id] < 0 || s.scores[c.id] > c.max || typeof s.evidence[c.id] !== 'string' || !s.evidence[c.id].trim()) throw Error('점수 또는 근거 누락');
  }
  progress.snapshots.sort((a,b) => Date.parse(a.date)-Date.parse(b.date));
  return progress;
}

function readDashboard(dir = root) {
  const warnings = [], items = [], runs = [];
  for (const name of fs.readdirSync(path.join(dir, 'work-items')).filter(n => n.endsWith('.yaml'))) {
    try {
      const file = path.join(dir, 'work-items', name);
      const item = parseItem(fs.readFileSync(file, 'utf8'));
      if (!item.id || !item.status) throw Error('id 또는 status 없음');
      items.push({...item, updatedAt: fs.statSync(file).mtime.toISOString()});
    } catch (error) { warnings.push(name + ': ' + error.message); }
  }
  for (const entry of fs.readdirSync(path.join(dir, 'runs'), {withFileTypes: true})) {
    if (!entry.isDirectory()) continue;
    const file = path.join(dir, 'runs', entry.name, 'manifest.json');
    if (!fs.existsSync(file)) continue;
    try {
      const m = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
      runs.push({id: m.runId, item: m.workItem, status: m.status, startedAt: m.startedAt, verification: m.verification || null, userGate: m.userGate || null});
    } catch (error) { warnings.push(entry.name + ': 실행 기록을 읽지 못했습니다'); }
  }
  runs.sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')));
  items.sort((a, b) => a.id.localeCompare(b.id));
  const policy = parseItem(fs.readFileSync(path.join(dir, 'policy.yaml'), 'utf8'));
  const stageFile = fs.readdirSync(path.join(dir, 'stages')).find(n => n.endsWith('_' + policy.currentStage + '.yaml'));
  if (!stageFile) throw Error('Current stage file missing: ' + policy.currentStage);
  const stage = parseItem(fs.readFileSync(path.join(dir, 'stages', stageFile), 'utf8'));
  let progress = null;
  try { progress = readProgress(dir); } catch (error) { warnings.push('평가 기록: ' + error.message); }
  return {stage, items, runs, progress, warnings, checkedAt: new Date().toISOString()};
}

function start(port = 8765) {
  return http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    if (req.url === '/api/status') {
      try { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(readDashboard())); }
      catch (error) { res.writeHead(500, {'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify({error: '기록을 읽지 못했습니다: ' + error.message})); }
    } else if (req.url === '/' || req.url === '/dashboard.html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      fs.createReadStream(path.join(root, 'dashboard.html')).pipe(res);
    } else { res.writeHead(404); res.end('Not found'); }
  }).listen(port, '127.0.0.1', () => console.log('Harness dashboard: http://127.0.0.1:' + port));
}
if (require.main === module) start(Number(process.env.HARNESS_DASHBOARD_PORT || 8765));
module.exports = {parseItem, readProgress, readDashboard, start};
