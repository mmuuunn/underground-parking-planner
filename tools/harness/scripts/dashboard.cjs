'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
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
  const block = key => Object.fromEntries((text.match(new RegExp('^'+key+':[ \\t]*\\r?\\n((?:  [^\\r\\n]*(?:\\r?\\n|$))*)','m'))?.[1] || '').split(/\r?\n/).map(line=>line.match(/^  ([\w-]+):[ \t]*(.*)$/)).filter(Boolean).map(m=>[m[1],m[2]]));
  return { id: scalar('id'), name: scalar('name'), currentStage: scalar('current_stage'), currentWork:scalar('current_work_item'), goal:scalar('product_goal'), status: scalar('status'), stage: scalar('stage'), question: scalar('question'), reviewer: scalar('reviewer'), userGate: scalar('user_gate'), reviewResult: scalar('review_result'), remaining: list('remaining'), acceptance: list('acceptance'), results:block('results'), allowed:list('allowed_files'), reviewFor:scalar('dashboard_review_for'), sources:list('dashboard_sources'), exitConditions:list('exit_conditions'), excluded:list('not_in_stage') };
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
  const warnings = [], items = [], runs = [], sources = [];
  const repo = path.resolve(dir, '../..'), evidence = new Map();
  const read = file => fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'');
  const hash = value => crypto.createHash('sha256').update(value).digest('hex');
  function source(file) {
    const full=fs.realpathSync(file), stat=fs.statSync(full);
    const key=hash(full).slice(0,24); evidence.set(key, full);
    return {path:full, href:'/api/evidence?key='+key, updatedAt:stat.mtime.toISOString()};
  }
  function digest(item) {
    try { return hash(JSON.stringify(item.allowed.filter(p=>path.resolve(repo,p)!==item.source.path).map(p=>{
      const file=path.resolve(repo,p); if(!file.startsWith(repo+path.sep))throw Error('범위 밖 파일');
      return [p,hash(fs.readFileSync(file))];
    }))); } catch { return null; }
  }
  for (const name of fs.readdirSync(path.join(dir, 'work-items')).filter(n => n.endsWith('.yaml'))) {
    try {
      const file = path.join(dir, 'work-items', name);
      const item = parseItem(fs.readFileSync(file, 'utf8'));
      if (!item.id || !item.status) throw Error('id 또는 status 없음');
      items.push({...item, source:source(file), updatedAt: fs.statSync(file).mtime.toISOString()});
    } catch (error) { warnings.push(name + ': ' + error.message); }
  }
  for(const item of items) {
    item.digest=digest(item);
    for(const name of item.sources) {
      try {
        const file=fs.realpathSync(path.resolve(repo,name)), research=path.join(require('node:os').homedir(),'.codex','research');
        if(![dir,research].some(base=>file.startsWith(path.resolve(base)+path.sep)) || !/\.(md|json)$/i.test(file) || fs.statSync(file).size>1024*1024)throw Error('허용된 근거 파일이 아님');
        const text=read(file), parsed=file.endsWith('.json')?JSON.parse(text):null;
        const row=text.split(/\r?\n/).find(line=>/^\|\s*[○△×]/.test(line));
        const cells=row?.split('|').slice(1,-1).map(s=>s.trim());
        sources.push({item:item.reviewFor || item.id, ...source(file), summary:cells?.[1] || null, next:cells?.[2] || null, sourceDigest:parsed?.sourceDigest || null});
      } catch(error) { warnings.push(name+': '+error.message); }
    }
  }
  for (const entry of fs.readdirSync(path.join(dir, 'runs'), {withFileTypes: true})) {
    if (!entry.isDirectory()) continue;
    const file = path.join(dir, 'runs', entry.name, 'manifest.json');
    if (!fs.existsSync(file)) continue;
    try {
      const m = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
      const completionFile=path.join(dir,'runs',entry.name,'completion.json');
      let completion=null, completionSource=null;
      if(fs.existsSync(completionFile)) {
        try { completion=JSON.parse(read(completionFile)); if(completion.workItem!==m.workItem || completion.runId!==m.runId)throw Error('작업/실행 불일치'); completionSource=source(completionFile); }
        catch(error){completion=null;warnings.push(entry.name+': 완료 기록 '+error.message);}
      }
      const recorded=completion?.sourceDigest || m.verification?.sourceDigest, current=items.find(i=>i.id===m.workItem)?.digest;
      runs.push({id: m.runId, item: m.workItem, status: m.status, startedAt: m.startedAt, verification: m.verification || null, userGate: m.userGate || null, source:source(file), completion, completionSource, freshness:recorded && current ? (recorded===current?'matching':'changed') : 'unknown'});
    } catch (error) { warnings.push(entry.name + ': 실행 기록을 읽지 못했습니다'); }
  }
  runs.sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')));
  items.sort((a, b) => a.id.localeCompare(b.id));
  const policy = parseItem(fs.readFileSync(path.join(dir, 'policy.yaml'), 'utf8'));
  const stageFile = fs.readdirSync(path.join(dir, 'stages')).find(n => n.endsWith('_' + policy.currentStage + '.yaml'));
  if (!stageFile) throw Error('Current stage file missing: ' + policy.currentStage);
  const stage = parseItem(fs.readFileSync(path.join(dir, 'stages', stageFile), 'utf8'));
  stage.source=source(path.join(dir,'stages',stageFile));
  const policySource=source(path.join(dir,'policy.yaml'));
  let head=null, changes=null;
  try { head=execFileSync('git',['--no-optional-locks','rev-parse','HEAD'],{cwd:repo,encoding:'utf8',timeout:3000,windowsHide:true,stdio:['ignore','pipe','pipe']}).trim(); changes=execFileSync('git',['--no-optional-locks','status','--short'],{cwd:repo,encoding:'utf8',timeout:3000,windowsHide:true,stdio:['ignore','pipe','pipe']}).trim().split(/\r?\n/).filter(Boolean); } catch { warnings.push('Git 상태 확인 불가'); }
  sources.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  for(const s of sources) { const bound=sources.find(x=>x.item===s.item&&path.dirname(x.path)===path.dirname(s.path)&&x.sourceDigest); const current=items.find(i=>i.id===s.item)?.digest; s.freshness=bound?.sourceDigest&&current?(bound.sourceDigest===current?'matching':'changed'):'unknown'; }
  const productRuns=runs.filter(r=>!r.item?.startsWith('UG-HARNESS-'));
  const areas=[['input','입력',/^UG-(GRID|SITE)/],['layout','자동 배치',/^UG-(LAYOUT|STALL|SGHS-(ROW|PAIRED|RESERVATION))/],['routes','램프 · 순환',/^UG-(VEHICLE|AISLE|SGHS-(AUTO|NETWORK|LANDING|ACCESS|AISLE|CLEARANCE))/],['review','결과 검토',/^UG-(VEHICLE|SGHS-(SOURCE|FEEDBACK))/],['save','저장 · 출력',/^UG-(SCENE|LAYOUT-004)/]].map(([id,label,pattern])=>({id,label,items:items.filter(i=>pattern.test(i.id)).map(i=>i.id)}));
  const focus={input:['UG-SITE-001','대지·도로 조건'],layout:['UG-STALL-STRIP-REGRESSION-001','일반 입력 칸 복구'],routes:['UG-SGHS-AUTO-NETWORK-001','실제 사례 자동 순환'],review:['UG-VEHICLE-006','램프 후보 판정 표시'],save:['UG-SCENE-001','장면 공유']};
  for(const a of areas){a.focus=focus[a.id][0];a.focusLabel=focus[a.id][1];a.focusStatus=items.find(i=>i.id===a.focus)?.status||null;}
  const find=id=>items.find(i=>i.id===id);
  const caseRow=(label,id,field,note)=>{const i=find(id);return {label,item:id,text:i?.results?.[field] || '연결된 결과 기록 없음',note,source:i?.source || null};};
  const cases=[caseRow('일반 기준 사례','UG-STALL-STRIP-REGRESSION-001','preservation','기존 결과 보존 기록입니다. 실제 차량 이용 전체 합격과 다릅니다.'),caseRow('일반 입력 회귀 사례','UG-STALL-STRIP-REGRESSION-001','counterexample','고정된 한 입력의 칸 복구 결과입니다.'),caseRow('SGHS · 일반 자동 생성','UG-SGHS-AUTO-NETWORK-001','ordinary_baseline','아래 참고 연결망과 다른 실행 경로입니다.'),caseRow('SGHS · 공급한 참고 연결망','UG-SGHS-AUTO-NETWORK-001','supplied_baseline','중심선을 제공한 실험입니다. 자동 생성 성과에 합산하지 않습니다.')];
  cases[0].text=cases[0].text.split(';').filter(part=>!part.trim().startsWith('SGHS')).join(';')||'일반 기준 보존 기록 없음';
  const updated=[policySource,stage.source,...items.map(i=>i.source),...runs.flatMap(r=>[r.source,r.completionSource]),...sources].filter(Boolean).map(s=>s.updatedAt).sort().at(-1)||null;
  const result={stage,goal:policy.goal,head,changes,items,runs,sources,areas,cases,warnings,checkedAt:new Date().toISOString(),evidenceUpdatedAt:updated,currentWork:items.some(i=>i.id===policy.currentWork)?policy.currentWork:null,recordedImplementing:items.filter(i=>i.status==='IMPLEMENTING').map(i=>i.id),recentWork:productRuns[0]?.item||null};
  Object.defineProperty(result,'evidence',{value:evidence}); return result;
}

function start(port = 8765, dir = root) {
  return http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    if(!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host||'')){res.writeHead(403);res.end();return;}
    if (req.url === '/api/status') {
      try { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(readDashboard(dir))); }
      catch (error) { res.writeHead(500, {'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify({error: '기록을 읽지 못했습니다: ' + error.message})); }
    } else if(req.url.startsWith('/api/evidence?')) {
      try { const key=new URL(req.url,'http://127.0.0.1').searchParams.get('key'), file=readDashboard(dir).evidence.get(key); if(!file){res.writeHead(404);res.end('Unknown evidence');return;} res.setHeader('Content-Type','text/plain; charset=utf-8');res.end(fs.readFileSync(file)); }
      catch {res.writeHead(404);res.end('Evidence unavailable');}
    } else if (req.url === '/' || req.url === '/dashboard.html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      fs.createReadStream(path.join(dir, 'dashboard.html')).on('error',()=>{res.statusCode=404;res.end('Dashboard unavailable');}).pipe(res);
    } else { res.writeHead(404); res.end('Not found'); }
  }).listen(port, '127.0.0.1', () => console.log('Harness dashboard: http://127.0.0.1:' + port));
}
if (require.main === module) start(Number(process.env.HARNESS_DASHBOARD_PORT || 8765));
module.exports = {parseItem, readProgress, readDashboard, start};
