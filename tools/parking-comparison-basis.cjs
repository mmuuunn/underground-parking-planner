'use strict';
// Comparison support only: invokes existing generators/verifiers and never edits their policies.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..'),DIR=path.join(ROOT,'04_parking/01_src/plan');
const E=require(path.join(DIR,'CLAUDE_ugp_plan.js')),V=require(path.join(DIR,'CLAUDE_ugp_verify.js'));
const L=require('./depth-layout-lab.cjs'),C=require(path.join(DIR,'candidate-comparison.js'));
const FILE=path.join(__dirname,'harness/comparison-basis.json');
const OUT='C:/Users/seok2/.codex/visualizations/2026/11/02/01a19d26-097b-7e02-9981-0add2515568c/comparison-conditions';
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(stable(JSON.parse(JSON.stringify(x)??'null')))).digest('hex');
const cleanPlan=plan=>{const p=structuredClone(plan);delete p.planMass;return p;};
const read=()=>JSON.parse(fs.readFileSync(FILE,'utf8'));
function effective(input,entryPoint='generate'){
 return {entryPoint,aisleSurfaceMode:input.aisleSurfaceMode||'legacy',obstacleClearance:input.obstacleClearance||'box',
  trafficMode:input.trafficMode||'loop',stallStripProjection:input.stallStripProjection||(entryPoint==='generate'?'occupied-bands':'envelope'),
  stallRowSelection:input.stallRowSelection||'sequential',stallRowAlignment:input.stallRowAlignment||'independent',
  occupantPolicy:input.occupantPolicy||'report',autoZones:input.autoZones!==false};
}
function sources(basis){
 const files=fs.readdirSync(DIR).filter(f=>f.endsWith('.js')).map(f=>'04_parking/01_src/plan/'+f).concat([
  '00_shared/lib/clipper.js','04_parking/src/underground/candidates/rectangular-loop-v04.js',
  '04_parking/01_src/CLAUDE_ug_plan_engine.js','04_parking/01_src/CODEX_ug_compare_page.js','04_parking/underground-compare.html',
  'tools/depth-layout-lab.cjs','tools/parking-comparison-basis.cjs']);
 const result={generation:{},shared:{}};
 for(const file of files.sort())result[basis.allowedGenerationSourceChanges.includes(file)?'generation':'shared'][file]=
  crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,file))).digest('hex');
 return result;
}
function physical(plan){return {innerOutline:plan.innerOutline,parkingInnerPaths:plan.parkingInnerPaths,
 columns:plan.columns,cores:plan.cores,occupants:plan.occupants,parkingReservations:plan.parkingReservations,
 ramp:plan.ramp&&{body:plan.ramp.body,landing:plan.ramp.landing,tangent:plan.ramp.tangent,widthMm:plan.ramp.widthMm,lengthMm:plan.ramp.lengthMm,start:plan.ramp.start},
 floor:plan.planningBoundary.floorPaths};}
function routeSummary(plan){const r=E.inspectVehicleRoutes(plan);return {entry:r.entry.state,exit:r.exit.state,
 entryIssue:r.entry.firstIssue?.id||null,exitIssue:r.exit.firstIssue?.id||null};}
function observe(spec,basis=read()){
 const input=structuredClone(spec.input),before=hash(input),stamp=sources(basis);
 const r={schema:'parking-comparison-receipt/1',caseId:spec.id,basisHash:hash(basis),input,inputHash:before,
  entryPoint:'generate',policy:effective(input),sources:stamp,runtime:process.version,fullJourneyVerdict:'NOT_EVALUATED'};
 try{r.plan=cleanPlan(E.generate(input));r.planHash=hash(r.plan);r.routes=routeSummary(r.plan);r.physicalHash=hash(physical(r.plan));}
 catch(e){r.error={name:e.name,message:e.message};}
 if(hash(input)!==before)throw Error('Generator mutated the frozen input');
 return r;
}
function assertBaseline(r,spec,basis=read()){
 const errors=[];if(r.basisHash!==hash(basis))errors.push('basis-hash');
 if(hash(r.input)!==hash(spec.input)||r.inputHash!==hash(r.input))errors.push('input-hash');
 if(hash(r.policy)!==hash(basis.policy)||hash(r.policy)!==hash(effective(r.input,r.entryPoint)))errors.push('policy');
 if(spec.expected.kind==='error'){if(hash(r.error)!==hash({name:spec.expected.name,message:spec.expected.message}))errors.push('expected-error');}
 else if(!r.plan||r.planHash!==spec.expected.planHash||hash(r.plan)!==r.planHash||hash(r.routes)!==hash(spec.expected.routes))errors.push('expected-plan');
 if(errors.length)throw Error(spec.id+': baseline mismatch '+errors.join(','));
 return true;
}
function compare(before,after,basis=read()){
 const blocked=[],failures=[],add=(ok,reason)=>{if(!ok)blocked.push(reason);};
 const spec=basis.cases.find(c=>c.id===before.caseId);if(!spec)throw Error('Unknown baseline case');
 assertBaseline(before,spec,basis);
 if(!after?.input||!after.sources?.shared||!after.sources?.generation)return {sameConditions:false,decision:'COMPARISON_BLOCKED',blocked:['comparison-metadata-missing'],failures,capacityDelta:null};
 add(before.basisHash===after.basisHash,'comparison-basis-changed');
 add(before.caseId===after.caseId,'case-changed');
 add(after.inputHash===hash(after.input)&&before.inputHash===after.inputHash,'input-changed');
 add(after.entryPoint==='generate'&&after.policy?.entryPoint==='generate'&&!after.plan?.networkCandidate,'automatic-entry-required');
 add(hash(after.policy)===hash(effective(after.input,after.entryPoint))&&hash(after.policy)===hash(basis.policy),'effective-policy-changed');
 add(hash(before.sources.shared)===hash(after.sources.shared),'shared-calculation-or-verifier-source-changed');
 add(hash(Object.keys(before.sources.generation).sort())===hash(Object.keys(after.sources.generation).sort()),'generation-source-manifest-changed');
 add(before.runtime===after.runtime,'runtime-changed');
 add(after.fullJourneyVerdict==='NOT_EVALUATED','unsupported-whole-journey-promotion');
 if(before.error||after.error){
  add(!!before.error&&!!after.error&&hash(before.error)===hash(after.error),'generation-error-changed');
  return {sameConditions:blocked.length===0,decision:blocked.length?'COMPARISON_BLOCKED':'SAME_KNOWN_ERROR',blocked,failures,capacityDelta:null,wholeJourney:'NOT_EVALUATED'};
 }
 add(!!after.plan&&after.planHash===hash(after.plan),'output-binding-mismatch');
 if(!after.plan)return {sameConditions:false,decision:'COMPARISON_BLOCKED',blocked,failures};
 add(before.physicalHash===hash(physical(after.plan))&&after.physicalHash===hash(physical(after.plan)),'fixed-geometry-changed');
 if(blocked.length)return {sameConditions:false,decision:'COMPARISON_BLOCKED',blocked,failures,capacityDelta:null,wholeJourney:'NOT_EVALUATED'};
 let report,routes;try{report=V.check(after.plan,after.input);routes=routeSummary(after.plan);}catch(e){failures.push('independent-check-error: '+e.message);}
 if(after.plan.stallCount!==after.plan.stalls.length)failures.push('stall-count-disagrees-with-geometry');
 if(report&&['clash','noFront','unreachable'].some(k=>report.counts[k]>0))failures.push('kept-stall-geometry-or-access-failed');
 const state={FEASIBLE:0,CONDITIONAL:1,INFEASIBLE:2};
 if(!(after.plan.status in state)||state[after.plan.status]>state[before.plan.status])failures.push('status-downgraded');
 if(after.plan.status==='FEASIBLE'&&(report?.status!=='FEASIBLE'||after.plan.violations.length))failures.push('unsupported-status-promotion');
 const oldIds=new Set(before.plan.violations.map(v=>v.id));
 if(after.plan.violations.some(v=>!oldIds.has(v.id)))failures.push('new-generator-violation');
 if(before.plan.graph.hasLoop&&!after.plan.graph.hasLoop)failures.push('lost-loop');
 if(after.plan.deadSideCount>before.plan.deadSideCount||after.plan.graph.deadEnds.length>before.plan.graph.deadEnds.length)failures.push('increased-dead-side-or-dead-ends');
 if(routes&&['entry','exit'].some(k=>routes[k]!=='clear'))failures.push('displayed-vehicle-route-not-clear');
 if(after.plan.stallCount<before.plan.stallCount)failures.push('capacity-loss');
 if(after.planHash!==before.planHash){const t=after.plan.automaticCandidateComparison;
  if(!t||!Number.isInteger(t.proposedCandidates)||t.proposedCandidates<0||t.proposedCandidates>basis.candidateBudget.maximumProposedCandidates||
   !Number.isInteger(t.evaluations)||t.evaluations!==1+t.proposedCandidates||!t.baselineIncluded)failures.push('candidate-evaluation-budget-unverified');
 }
 const geometry=C.compare([C.fromPlan('baseline',before.input,before.plan),C.fromPlan('candidate',after.input,after.plan)]);
 if(!geometry.rows[1].comparison.fixedInputMatches)failures.push('existing-comparison-fixed-input-mismatch');
 const capacityDelta=after.plan.stallCount-before.plan.stallCount;
 const routeResolved=routes&&['entry','exit'].some(k=>before.routes[k]!=='clear')&&['entry','exit'].every(k=>routes[k]==='clear');
 const improved=failures.length===0&&(capacityDelta>=basis.criteria.requiredCapacityGain||routeResolved);
 return {sameConditions:true,decision:improved?'CANDIDATE_FOR_REVIEW':capacityDelta===0&&after.planHash===before.planHash?'NO_IMPROVEMENT':'CANDIDATE_REJECTED',
  blocked,failures,capacityDelta,routeResolved,independentCounts:report?.counts,routes,
  continuity:{before:L.continuity(before.plan),after:L.continuity(after.plan)},
  wholeJourney:'NOT_EVALUATED',DAIsProposalOnly:true,productApproval:false,
  geometryEvidence:{fixedInputMatches:geometry.rows[1].comparison.fixedInputMatches,layoutDeltaStalls:geometry.rows[1].comparison.layoutDeltaStalls}};
}
function run(basis=read()){
 const receipts=basis.cases.map(spec=>{const a=observe(spec,basis);assertBaseline(a,spec,basis);const b=observe(spec,basis);
  if(a.planHash!==b.planHash||hash(a.error||null)!==hash(b.error||null))throw Error(spec.id+': nondeterministic');
  return {id:spec.id,role:spec.role,receipt:a,selfComparison:compare(a,b,basis)};});
 return {schema:'parking-comparison-setup/1',basisHash:hash(basis),receipts,scope:'comparison preparation; no candidate generator implemented'};
}
function html(result,basis){
 const p=basis.policy;return `<!doctype html><html lang="ko"><meta charset="utf-8"><title>주차 생성기 비교 조건 v1</title><style>body{font:16px/1.7 system-ui;max-width:1120px;margin:36px auto;padding:0 22px;background:#f5f4ee;color:#272b27}h1{font-size:27px}h2{font-size:21px;margin-top:34px}table{width:100%;border-collapse:collapse;font-size:14px}td,th{text-align:left;border-bottom:1px solid #ccc;padding:12px;vertical-align:top}pre{white-space:pre-wrap;background:#e9e6dc;padding:20px}.notice{border-left:4px solid #856f4e;padding:12px 18px;background:#eae4d6}.scroll{overflow:auto}img{width:100%}</style>
 <h1>기존 제품과 새 후보의 비교 조건 · v1</h1><p>2026-11-03 · 첫 개선은 고정 구조축과 직선 램프의 정형 사례 · 새 생성 로직은 아직 추가하지 않음</p>
 <p class="notice">기준안은 50칸·기둥36개이며 실제 제품·계산기·재열기 결과가 같다. 생성기 상태는 FEASIBLE이지만 별도 차량 표시 경로의 진입은 blocked다. 기준안을 정상 계획으로 승인한 것이 아니다. 이 문제를 숨기지 않고 비교의 알려진 실패로 보존한다.</p>
 <h2>무엇을 고정했나</h2><p>외곽, 모든 기둥 교점, 코어와 예약공간, 램프 몸체·착지·방향, 주차 규격, 벽 두께, 구조 모듈 위치를 입력 지문에 묶었다. X8.1m/Y8.0m 축의 중간 기둥을 생략하지 않는다. 주차 모듈 위치는 구조축에서 수식으로 계산한 [${basis.phaseDerivation.phase.join(', ')}]mm다. 후보의 대수를 보고 고른 값이 아니다. 이 입력은 통제용 가정이며 실제 구조 승인값이 아니다.</p>
 <div class="scroll"><table><tr><th>항목</th><th>이번 제품 기준</th><th>앞선 실험과의 차이</th></tr>
 <tr><td>실행 경로</td><td>실제 UGPlan.generate</td><td>제공 중심선을 받는 generateConnected 결과로 대체 금지</td></tr>
 <tr><td>차로 면 / 장애물 여유</td><td>${p.aisleSurfaceMode} / ${p.obstacleClearance}</td><td>network / euclidean은 별도 실험 조건</td></tr>
 <tr><td>통행 기준</td><td>${p.trafficMode} · 순환 조건 유지</td><td>two-way를 넣어 NO_LOOP를 우회하지 않음</td></tr>
 <tr><td>주차열</td><td>${p.stallRowSelection} / ${p.stallRowAlignment} / ${p.stallStripProjection}</td><td>continuous·back-to-back 변경은 이번 비교 중 혼입 금지</td></tr>
 <tr><td>DA</td><td>기존 자동 제안 · 벽 인접3m</td><td>실험용200mm DA벽은 활성화하지 않음. 면적 증가를 성공으로 채점하지 않음</td></tr>
 <tr><td>후보 수</td><td>기존안1 + 신규 최대${basis.candidateBudget.maximumProposedCandidates}안</td><td>무제한 탐색과 소수 후보를 같은 비용으로 비교하지 않음</td></tr></table></div>
 <h2>보존한 기준 사례</h2><div class="scroll"><table><tr><th>사례</th><th>역할</th><th>현재 생성 결과</th><th>차량 표시 경로</th><th>동일안 재비교</th></tr>${result.receipts.map(r=>{const spec=basis.cases.find(s=>s.id===r.id),p=r.receipt.plan;return `<tr><td>${spec.title}</td><td>${r.role==='initial-improvement-target'?'첫 개선 대상':'회귀 감시'}</td><td>${p?`${p.stallCount}칸 / 기둥${p.columns.length} / ${p.status}`:'기존 생성 오류 유지: '+r.receipt.error.message}</td><td>${p?`진입 ${r.receipt.routes.entry}<br>진출 ${r.receipt.routes.exit}`:'측정 불가'}</td><td>${r.selfComparison.capacityDelta===null?'기존 오류 동일':r.selfComparison.capacityDelta+'칸 변화'}<br>${r.selfComparison.decision}</td></tr>`;}).join('')}</table></div>
 <p>정형만 제품 화면에서 직접 대조했다. 코어·꺾임·사선·차단은 코어 상자를 고정한 계산 회귀 입력이다. 이 회귀 입력을 제품의 상세 코어 자동 설계 결과로 부르지 않는다. 작은 홀의 현재 오류를0칸 정상 결과로 바꾸지 않는다.</p>
 <h2>언제 새 후보를 검토할 수 있나</h2><ol><li>입력·실행 경로·실효 정책·공유 검사 코드·고정 형상이 모두 같아야 한다. 다른 조건이면 비교 자체를 차단한다.</li><li>새 충돌·미도달·실패 사유가 없어야 하고, 대수·순환·막다른쪽 칸이 악화되면 안 된다. 진입·진출의 기존 차량 표시 경로 검사는 clear여야 한다.</li><li>그 상태에서 최소1칸 증가하거나, 대수 손실 없이 알려진 차량 경로 문제를 해결해야 ‘검토할 개선 후보’가 된다. 승인은 별도다.</li></ol>
 <p>기존 상태값을 그대로 믿지 않고 기존 형상 검사와 차량 경로 검사를 다시 실행한다. 모든 칸의 전체 차량 여정은 NOT_EVALUATED로 남긴다. 국부 입출차 표본이나 DA의 양의 면적을 전체 승인으로 올리지 않는다.</p>
 <p class="notice">앞선 실험의75칸과 현재50칸은 조건이 다르다. 75→50의 퇴보나50→75의 제품 개선으로 계산하지 않는다. 새 후보는 이50칸 기준과 동일한 조건에서 다시 생성해야 한다.</p>
 <h2>실행과 남은 일</h2><pre>node tools/parking-comparison-basis.cjs
node tools/parking-comparison-basis.test.cjs --check
# 이후 변경 코드를 고정 기준안과 비교(기준 영수증 덮어쓰기 없음)
node tools/parking-comparison-basis.cjs --compare-current
# 실제 제품·재열기 대조
node tools/parking-comparison-basis.cjs --browser</pre><p>이후 변경이 허용되는 계산 파일은 차로 생성과 계획 조립 두 곳뿐이다. 새 후보는 제안 수·전체 평가 수와 기존안 포함 여부도 기록해야 한다. 주차열 처리·램프·구조·검사·차량 조건을 바꾸려면 기준을 다시 설정해야 한다. 새 차로 후보 구현, 비교 성능 측정과 사용자 도면 승인은 다음 작업이다.</p>
 <p>기준 SHA256 ${result.basisHash}</p><img src="product-baseline.png" alt="실제 제품에서 확인한50칸 기준안"></html>`;
}
async function browser(basis=read()){
 const {chromium}=require('playwright'),b=await chromium.launch({headless:true});
 try{const context=await b.newContext({viewport:{width:1500,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto(basis.requiredProductCheck.url);await page.waitForFunction(()=>typeof ui!=='undefined'&&ui.res?.graph&&!ui.busy);
  await page.evaluate(scene=>{doc=structuredClone(scene);doc.phase={key:phaseKey(),p:scene.phase};save();recomputeNow('고정 비교 조건 확인');fit();},basis.primaryScene);
  const take=()=>page.evaluate(()=>({input:planInput(),plan:ui.res,doc:structuredClone(doc)}));
  const first=await take();await page.reload();await page.waitForFunction(()=>ui.res?.graph&&!ui.busy);const second=await take();
  const spec=basis.cases.find(s=>s.role==='initial-improvement-target'),backend=observe(spec,basis);
  if(hash(first)!==hash(second)||hash(first.input)!==backend.inputHash||hash(cleanPlan(first.plan))!==backend.planHash||first.plan.networkCandidate||errors.length)throw Error('Product input/result/reload mismatch');
  fs.mkdirSync(OUT,{recursive:true});await page.screenshot({path:path.join(OUT,'product-baseline.png'),fullPage:true});
  const result={automatic:true,inputHash:backend.inputHash,planHash:backend.planHash,backendEqualsBrowser:true,reloadStable:true,pageErrors:errors,
   bays:first.plan.stallCount,routes:routeSummary(first.plan)};fs.writeFileSync(path.join(OUT,'browser-baseline.json'),JSON.stringify(result,null,2));
  await context.close();return result;
 }finally{await b.close();}
}
module.exports={read,hash,cleanPlan,effective,sources,physical,observe,assertBaseline,compare,run,html,browser,OUT};
if(require.main===module)(async()=>{const basis=read(),frozen=path.join(OUT,'frozen-baseline-v1.json');
 if(process.argv.includes('--compare-current')){const saved=JSON.parse(fs.readFileSync(frozen,'utf8')),before=saved.receipts.find(r=>r.role==='initial-improvement-target').receipt;
  const spec=basis.cases.find(s=>s.id===before.caseId);console.log(JSON.stringify(compare(before,observe(spec,basis),basis),null,2));return;}
 const result=run(basis);fs.mkdirSync(OUT,{recursive:true});
 if(fs.existsSync(frozen)&&hash(JSON.parse(fs.readFileSync(frozen,'utf8')))!==hash(result))throw Error('Frozen baseline differs; preserve the existing receipt and establish a new basis');
 if(!fs.existsSync(frozen))fs.writeFileSync(frozen,JSON.stringify(result,null,2));
 fs.writeFileSync(path.join(OUT,'baseline-receipts.json'),JSON.stringify(result,null,2));
 fs.writeFileSync(path.join(OUT,'conditions.html'),html(result,basis));if(process.argv.includes('--browser'))console.log(await browser(basis));
 console.log(JSON.stringify({scope:result.scope,basisHash:result.basisHash,cases:result.receipts.map(r=>({id:r.id,count:r.receipt.plan?.stallCount,decision:r.selfComparison.decision,delta:r.selfComparison.capacityDelta}))},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
