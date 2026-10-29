'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const read = file => fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
const json = file => JSON.parse(read(file));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const scalar = (text, key) => text.match(new RegExp('^' + key + ':[ \\t]*(.+)$', 'm'))?.[1].trim().replace(/^["']|["']$/g, '');
function inside(repo, relative) {
  const file = path.resolve(repo, relative), rel = path.relative(repo, file);
  if (path.isAbsolute(relative) || !rel || rel.startsWith('..') || path.isAbsolute(rel)) throw Error('저장소 안의 상대 경로가 필요합니다: ' + relative);
  return file;
}
function item(repo, file) {
  const text = read(file), lines = text.split(/\r?\n/), start = lines.indexOf('completion_contract: |');
  if (start < 0) throw Error('completion_contract 누락: 목표·실행 경로·검사 방법을 먼저 정하세요');
  const block = []; for (const line of lines.slice(start + 1)) { if (line && !line.startsWith('  ')) break; block.push(line.slice(2)); }
  const contract = JSON.parse(block.join('\n'));
  const allowed = text.match(/^allowed_files:[ \t]*\r?\n((?:[ \t]+-[^\r\n]*(?:\r?\n|$))*)/m)?.[1].split(/\r?\n/).filter(x => /^\s+- /.test(x)).map(x => x.replace(/^\s+- /, '').trim()) || [];
  return {id:scalar(text, 'id'), owner:scalar(text, 'owner'), stage:scalar(text, 'stage'), status:scalar(text, 'status'), run:scalar(text, 'completion_run'), allowed, contract, file, repo};
}
function validate(i) {
  const c = i.contract, nonempty = x => typeof x === 'string' && x.trim().length > 0;
  if (!['product', 'experiment', 'support'].includes(c.kind) || !['goal', 'stage_goal', 'target'].every(k => nonempty(c[k]))) throw Error('작업 종류·목표·현재 단계 목표·실행 대상이 필요합니다');
  const stage = inside(i.repo, 'tools/harness/stages/01_' + i.stage + '.yaml');
  const goals = [...read(stage).matchAll(/^(?:must_answer|exit_conditions):[ \t]*\r?\n((?:[ \t]+-[^\r\n]*(?:\r?\n|$))*)/gm)].flatMap(m => m[1].split(/\r?\n/));
  if (!goals.some(line => line.trim() === '- ' + c.stage_goal)) throw Error('현재 단계에 없는 목표입니다: ' + c.stage_goal);
  if (!Array.isArray(c.depends_on) || !Array.isArray(c.checks) || !c.checks.length || typeof c.review_required !== 'boolean' || typeof c.user_required !== 'boolean') throw Error('선행작업·실행형 검사·검토/승인 필요 여부를 명시하세요');
  if (i.allowed.some(p => /^04_parking\/(01_src\/|src\/|[^/]+\.html$)/.test(p)) && !c.user_required) throw Error('제품 코드·화면 변경에는 사용자 확인이 필요합니다');
  const ids = new Set();
  for (const check of c.checks) {
    if (!/^[a-z0-9-]+$/.test(check.id) || ids.has(check.id) || !Array.isArray(check.args) || !check.args.every(x => typeof x === 'string') || !/\.(?:cjs|mjs|js)$/.test(check.script)) throw Error('검사 식별자·Node 스크립트·인수를 확인하세요');
    ids.add(check.id); if (!fs.statSync(inside(i.repo, check.script)).isFile()) throw Error('검사 파일이 없습니다');
  }
  if (c.kind === 'product') {
    const u = new URL(c.product?.url), expect = c.product?.expect;
    if (u.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(u.hostname) || u.pathname !== '/04_parking/underground-compare.html' || c.target !== '04_parking/underground-compare.html' || u.searchParams.get('reference') !== 'sghs') throw Error('제품 검증은 실제 SGHS 제품 화면을 지정해야 합니다');
    if (!expect || !Object.keys(expect).length || c.user_required !== true) throw Error('제품의 측정 기대값과 사용자 승인이 필요합니다');
    for (const [key, rule] of Object.entries(expect)) {
      if (!/^(result|routes)\.[a-zA-Z0-9_.]+$/.test(key) || /(__proto__|prototype|constructor)/.test(key) || !rule || Object.keys(rule).length !== 1 || !['eq', 'gte', 'lte'].includes(Object.keys(rule)[0])) throw Error('측정 경로와 eq/gte/lte 기대값을 확인하세요');
      if (!('eq' in rule) && !Number.isFinite(Object.values(rule)[0])) throw Error('수치 기대값은 유한한 숫자여야 합니다');
    }
  } else if (c.product) throw Error('참고 실험·지원 작업을 제품 진척으로 기록할 수 없습니다');
}
const scopeDigest = i => hash(JSON.stringify({id:i.id, owner:i.owner, stage:i.stage, allowed:i.allowed, contract:i.contract}));
const sourceDigest = i => hash(JSON.stringify(i.allowed.filter(p => path.resolve(i.repo, p) !== path.resolve(i.file)).map(p => [p, hash(fs.readFileSync(inside(i.repo, p)))])));
function dependencies(i) {
  for (const dep of i.contract.depends_on) {
    if (!/^tools\/harness\/work-items\/[A-Z0-9-]+\.yaml$/.test(dep)) throw Error('선행작업 경로가 올바르지 않습니다');
    const d = item(i.repo, inside(i.repo, dep));
    if (d.id === i.id || d.status !== 'ACCEPTED' || !d.run || !/^[\w-]+$/.test(d.run)) throw Error('선행작업 미완료: ' + d.id);
    const receipt = json(path.join(i.repo, 'tools/harness/runs', d.run, 'completion.json'));
    if (receipt.workItem !== d.id || receipt.status !== 'TASK_VERIFIED' || receipt.scopeDigest !== scopeDigest(d)) throw Error('선행작업의 완료 증거가 없습니다: ' + d.id);
  }
}
function matches(observed, rule) {
  if ('eq' in rule) return JSON.stringify(observed) === JSON.stringify(rule.eq);
  return Number.isFinite(observed) && ('gte' in rule ? observed >= rule.gte : observed <= rule.lte);
}
function productVerdict(c, before, after) {
  if (before.generator !== 'automatic' || after.generator !== 'automatic' || before.url !== c.product.url || after.url !== c.product.url) return {passed:false, reason:'참고 연결망 또는 다른 화면의 결과는 제품 증거가 아닙니다'};
  if (!before.inputDigest || before.inputDigest !== after.inputDigest) return {passed:false, reason:'기준 입력이 달라 같은 조건의 제품 개선으로 비교할 수 없습니다'};
  const checks = Object.entries(c.product.expect).map(([key, rule]) => ({key, expected:rule, before:before.values[key], after:after.values[key], passed:matches(after.values[key], rule), improved:!matches(before.values[key], rule) && matches(after.values[key], rule)}));
  return {passed:after.reloadStable && checks.every(x => x.passed) && checks.some(x => x.improved), checks, reason:'기대값 충족·개선·재열기 동일성을 모두 확인합니다'};
}
async function observe(i, dir, name) {
  // shortcut: this adapter observes the existing SGHS snapshot; add another adapter when a second product case needs it.
  let chromium; try { ({chromium} = require('playwright')); } catch { throw Error('제품 화면 검증에 설치된 Playwright가 필요합니다. NODE_PATH에 해당 node_modules 경로를 지정하세요'); }
  const browser = await chromium.launch({headless:true});
  const context = await browser.newContext({viewport:{width:1500,height:1050}}), page = await context.newPage(), errors = [];
  try {
    page.on('pageerror', e => errors.push(e.message)); await page.goto(i.contract.product.url);
    await page.waitForFunction(() => window.sghsScene?.snapshot()?.result?.graph, null, {timeout:30000});
    const take = () => page.evaluate(keys => {
      const s = window.sghsScene.snapshot(), values = {};
      for (const key of keys) values[key] = key.split('.').reduce((o,k) => o?.[k], s);
      return {generator:s.result.networkCandidate?.source || 'automatic', values, input:JSON.stringify(s.input), output:JSON.stringify(s.result)};
    }, Object.keys(i.contract.product.expect));
    let first = await take();
    // First calculation persists its selected phase; only its provenance may change on the first reopen.
    if (JSON.parse(first.output).grid.phaseFrom === 'auto') {
      await page.reload(); await page.waitForFunction(() => window.sghsScene?.snapshot()?.result?.graph, null, {timeout:30000});
      const settled = await take(), geometry = value => {const r=JSON.parse(value);delete r.grid.phaseFrom;return JSON.stringify(r);};
      if (first.input !== settled.input || geometry(first.output) !== geometry(settled.output)) throw Error('최초 저장·재열기에서 입력 또는 실제 결과가 달라졌습니다');
      first = settled;
    }
    await page.screenshot({path:path.join(dir, name + '.png'), fullPage:true});
    await page.reload(); await page.waitForFunction(() => window.sghsScene?.snapshot()?.result?.graph, null, {timeout:30000});
    const again = await take(), result = {url:page.url(), generator:first.generator, values:first.values, inputDigest:hash(first.input), outputDigest:hash(first.output), reloadStable:!errors.length && first.input === again.input && first.output === again.output, errors};
    write(path.join(dir, name + '.json'), result); return result;
  } finally { await context.close(); await browser.close(); }
}
function approval(dir, filename, required, i, manifest, digest, user = false) {
  if (!required) return {required:false, status:'NOT_REQUIRED'};
  const file = path.join(dir, filename); if (!fs.existsSync(file)) return {required:true, status:'PENDING'};
  const p = json(file), valid = p.workItem === i.id && p.runId === manifest.runId && p.sourceDigest === digest && p.status === (user ? 'approved' : 'passed') && typeof p.evidence === 'string' && p.evidence.trim() && (user ? p.actor === 'user' : p.role === 'independent' && p.actor && p.actor !== i.owner && fs.existsSync(path.resolve(dir, p.evidence)));
  return {required:true, status:valid ? 'PASSED' : 'INVALID', reason:valid ? undefined : '승인 대상·실행·코드 지문·담당·근거가 일치하지 않습니다'};
}
async function preflight(i, dir) {
  validate(i); dependencies(i);
  const manifest = json(path.join(dir, 'manifest.json'));
  if (manifest.workItem !== i.id) throw Error('다른 작업의 실행 기록입니다');
  const frozen = {workItem:i.id, runId:manifest.runId, scopeDigest:scopeDigest(i), contract:i.contract, before:i.contract.kind === 'product' ? await observe(i, dir, 'product-before') : null};
  write(path.join(dir, 'scope.json'), frozen);
  manifest.userGate = {required:i.contract.user_required, status:i.contract.user_required ? 'PENDING' : 'NOT_REQUIRED'};
  write(path.join(dir, 'manifest.json'), manifest); return frozen;
}
function checkScope(i, dir) {
  validate(i); dependencies(i);
  const manifest = json(path.join(dir, 'manifest.json')), frozen = json(path.join(dir, 'scope.json'));
  if (manifest.workItem !== i.id || frozen.workItem !== i.id || frozen.runId !== manifest.runId || frozen.scopeDigest !== scopeDigest(i)) throw Error('시작 후 목표·실행 경로·검사가 바뀌었거나 다른 작업의 실행입니다. 새 범위로 시작하세요');
  return {manifest, frozen};
}
async function verify(i, dir) {
  const {manifest, frozen} = checkScope(i, dir);
  const v = manifest.verification, common = !!v && v.mode === 'VERIFY' && v.passed === true && v.tests > 0 && v.pass === v.tests && v.fail === 0 && v.sourceDigest === sourceDigest(i), checks = [];
  if (common) for (const c of i.contract.checks) {
    try { const output = execFileSync(process.execPath, [inside(i.repo, c.script), ...c.args], {cwd:i.repo, encoding:'utf8', timeout:120000, maxBuffer:4*1024*1024}); fs.writeFileSync(path.join(dir, c.id + '.log'), output); checks.push({id:c.id, passed:true}); }
    catch (e) { checks.push({id:c.id, passed:false, reason:String(e.stderr || e.message).slice(0,2000)}); }
  }
  let product = {required:i.contract.kind === 'product', passed:null};
  if (product.required && common && checks.every(c => c.passed)) {
    try { product = {...product, ...productVerdict(i.contract, frozen.before, await observe(i, dir, 'product-after'))}; }
    catch (e) { product = {...product, passed:false, reason:e.message}; }
  }
  const digest = sourceDigest(i), active = i.allowed.filter(p => !/\.(md|yaml)$/.test(p)), risky = active.some(p => /^04_parking\/(01_src|src)\//.test(p)) || active.length >= 5, review = approval(dir, 'review.json', i.contract.review_required || risky, i, manifest, digest), user = approval(dir, 'user-approval.json', i.contract.user_required, i, manifest, digest, true);
  const commonCurrent = common && v.sourceDigest === digest, machinePassed = commonCurrent && checks.length === i.contract.checks.length && checks.every(c => c.passed) && (!product.required || product.passed);
  const status = !machinePassed || [review.status,user.status].includes('INVALID') ? 'TASK_FAILED' : review.status === 'PENDING' ? 'REVIEW_PENDING' : user.status === 'PENDING' ? 'USER_GATE' : 'TASK_VERIFIED';
  const result = {workItem:i.id, runId:manifest.runId, kind:i.contract.kind, goal:i.contract.goal, status, scopeDigest:frozen.scopeDigest, sourceDigest:digest, common:{passed:commonCurrent, tests:v?.tests, pass:v?.pass, reason:commonCurrent ? undefined : '공통시험 실패·미실행 또는 코드 지문 불일치'}, checks, product, review, user, productProgress:status === 'TASK_VERIFIED' && product.required};
  write(path.join(dir, 'completion.json'), result);
  manifest.status = status; manifest.completion = result; manifest.userGate = user; write(path.join(dir, 'manifest.json'), manifest);
  return result;
}
async function selfTest() {
  const assert = require('node:assert/strict'), os = require('node:os'), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-gate-test-')), passed = [];
  const check = (name, fn) => { fn(); passed.push(name); };
  try {
    fs.mkdirSync(path.join(temp, 'tools/harness/stages'), {recursive:true}); fs.writeFileSync(path.join(temp, 'tools/harness/stages/01_vehicle-circulation.yaml'), 'must_answer:\n  - stage goal\nnot_in_stage:\n  - excluded\n');
    fs.writeFileSync(path.join(temp, 'check.cjs'), 'console.log("checked")');
    const file = path.join(temp, 'item.yaml'), c = {kind:'support',goal:'goal',stage_goal:'stage goal',target:'script',depends_on:[],checks:[{id:'check',script:'check.cjs',args:[]}],review_required:false,user_required:false};
    const make = contract => { fs.writeFileSync(file, 'id: TEST\nowner: writer\nstage: vehicle-circulation\nstatus: SCOPED\nallowed_files:\n  - check.cjs\ncompletion_contract: |\n' + JSON.stringify(contract,null,2).split('\n').map(x=>'  '+x).join('\n') + '\n'); return item(temp,file); };
    let i = make(c); check('complete scope accepted', () => validate(i));
    check('missing contract rejected', () => {fs.writeFileSync(file,'id: TEST');assert.throws(()=>item(temp,file),/completion_contract/);}); i = make(c);
    check('unknown stage goal rejected', () => assert.throws(()=>validate({...i,contract:{...c,stage_goal:'other'}})));
    check('excluded scope cannot be a stage goal', () => assert.throws(()=>validate({...i,contract:{...c,stage_goal:'excluded'}})));
    check('missing executable check rejected', () => assert.throws(()=>validate({...i,contract:{...c,checks:[]}})));
    check('missing dependency rejected', () => assert.throws(()=>dependencies({...i,contract:{...c,depends_on:['tools/harness/work-items/MISSING.yaml']}})));
    const depPath='tools/harness/work-items/DONE.yaml', depFile=inside(temp,depPath);fs.mkdirSync(path.dirname(depFile),{recursive:true});fs.copyFileSync(file,depFile);
    fs.writeFileSync(depFile,read(depFile).replace('id: TEST','id: DONE').replace('status: SCOPED','status: USER_GATE')+'\ncompletion_run: done\n');
    const dependent={...i,contract:{...c,depends_on:[depPath]}};
    check('pending dependency blocks next work',()=>assert.throws(()=>dependencies(dependent),/미완료/));
    fs.writeFileSync(depFile,read(depFile).replace('status: USER_GATE','status: ACCEPTED'));fs.mkdirSync(path.join(temp,'tools/harness/runs/done'),{recursive:true});
    check('accepted label without receipt rejected',()=>assert.throws(()=>dependencies(dependent)));
    write(path.join(temp,'tools/harness/runs/done/completion.json'),{workItem:'DONE',status:'TASK_VERIFIED',scopeDigest:scopeDigest(item(temp,depFile))});
    check('completed dependency allows next work',()=>dependencies(dependent));
    check('outside script rejected', () => assert.throws(()=>inside(temp,'../outside.cjs')));
    check('scope change detected', () => assert.notEqual(scopeDigest(i),scopeDigest({...i,contract:{...c,kind:'experiment'}})));
    const pc = {...c,kind:'product',target:'04_parking/underground-compare.html',user_required:true,product:{url:'http://127.0.0.1:8874/04_parking/underground-compare.html?reference=sghs&floor=B1&revision=calibrated',expect:{'result.stallCount':{gte:60},'result.graph.hasLoop':{eq:true}}}};
    const before = {url:pc.product.url,generator:'automatic',inputDigest:'same-input',reloadStable:true,values:{'result.stallCount':9,'result.graph.hasLoop':false}}, after = {...before,values:{'result.stallCount':66,'result.graph.hasLoop':true}};
    check('real product progress accepted', () => assert(productVerdict(pc,before,after).passed));
    check('SGHS nine stalls rejected', () => assert(!productVerdict(pc,before,before).passed));
    check('supplied 66 cannot replace automatic result', () => assert(!productVerdict(pc,before,{...after,generator:'supplied-centerlines'}).passed));
    check('unchanged successful result is not progress', () => assert(!productVerdict(pc,after,after).passed));
    check('unstable reopen rejected', () => assert(!productVerdict(pc,before,{...after,reloadStable:false}).passed));
    check('changed input cannot claim improvement', () => assert(!productVerdict(pc,before,{...after,inputDigest:'changed'}).passed));
    check('comparison page rejected', () => assert.throws(()=>validate({...i,contract:{...pc,product:{...pc.product,url:'http://127.0.0.1:8874/04_parking/sghs-compare.html'}}})));
    check('product approval cannot be disabled', () => assert.throws(()=>validate({...i,contract:{...pc,user_required:false}})));
    const dir = path.join(temp,'run'); fs.mkdirSync(dir); write(path.join(dir,'manifest.json'),{workItem:i.id,runId:'run',verification:{mode:'VERIFY',passed:true,tests:109,pass:109,fail:0,sourceDigest:sourceDigest(i)}}); await preflight(i,dir);
    let r = await verify(i,dir); check('support passes but credits no product progress', () => {assert.equal(r.status,'TASK_VERIFIED');assert.equal(r.productProgress,false);});
    const required = make({...c,review_required:true,user_required:true}); await preflight(required,dir); r=await verify(required,dir); check('109 passing tests do not bypass independent review',()=>assert.equal(r.status,'REVIEW_PENDING'));
    const proof={workItem:i.id,runId:'run',sourceDigest:sourceDigest(required),status:'passed',role:'independent',actor:'reviewer',evidence:'report.txt'}; fs.writeFileSync(path.join(dir,'report.txt'),'review'); write(path.join(dir,'review.json'),proof); r=await verify(required,dir);check('review does not replace user approval',()=>assert.equal(r.status,'USER_GATE'));
    write(path.join(dir,'user-approval.json'),{...proof,status:'approved',actor:'user'});r=await verify(required,dir);check('all required gates pass',()=>assert.equal(r.status,'TASK_VERIFIED'));
    write(path.join(dir,'review.json'),{...proof,actor:i.owner});r=await verify(required,dir);check('self review is not independent',()=>assert.equal(r.status,'TASK_FAILED'));write(path.join(dir,'review.json'),proof);
    fs.appendFileSync(path.join(temp,'check.cjs'),'\n// changed');r=await verify(required,dir);check('stale review and approval rejected',()=>assert.equal(r.review.status,'INVALID'));check('stale common test cannot be reused',()=>{assert.equal(r.common.passed,false);assert.equal(r.status,'TASK_FAILED');});
    make({...required.contract,goal:'changed after start'});await assert.rejects(()=>verify(item(temp,file),dir),/시작 후/);passed.push('goal cannot be changed to pass');
    return {passed:true,tests:passed.length,cases:passed};
  } finally {
    if (path.dirname(temp) !== path.resolve(os.tmpdir()) || !path.basename(temp).startsWith('harness-gate-test-')) throw Error('Unexpected test cleanup path');
    fs.rmSync(temp,{recursive:true,force:true});
  }
}
module.exports = {item, validate, dependencies, scopeDigest, productVerdict, preflight, verify, checkScope, observe, selfTest};
if (require.main === module) (async () => {
  if (process.argv[2] === '--self-test') { console.log(JSON.stringify(await selfTest())); return; }
  const [mode,repo,file,dir] = process.argv.slice(2), i = item(path.resolve(repo),path.resolve(file));
  const result = mode === 'preflight' ? await preflight(i,path.resolve(dir)) : mode === 'verify' ? await verify(i,path.resolve(dir)) : mode === 'scope' ? {scopeDigest:checkScope(i,path.resolve(dir)).frozen.scopeDigest,sourceDigest:sourceDigest(i)} : (()=>{throw Error('preflight, scope 또는 verify가 필요합니다');})();
  console.log(JSON.stringify(result)); if (mode === 'verify' && result.status !== 'TASK_VERIFIED') process.exitCode=1;
})().catch(e => { console.error(e.message); process.exitCode=1; });
