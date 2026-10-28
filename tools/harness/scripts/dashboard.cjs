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
  return {stage, items, runs, warnings, checkedAt: new Date().toISOString()};
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
module.exports = {parseItem, readDashboard, start};
