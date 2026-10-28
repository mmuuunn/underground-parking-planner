/* UI contracts for the planning calculation. No placement logic lives here. */
(() => {
  'use strict';
  const G=UGP.geom,pathsD=P=>P.map(q=>'M'+q.map(p=>p.join(',')).join('L')+'Z').join(''),esc=escapeText;
  const names={accessible:'장애인',expanded:'확장형',compact:'경형',electric:'친환경차 전용',charging:'충전',family:'가족배려',women:'여성우선'};
  const segmentNames={'top-transition':'위층 바닥의 경사 완충','top-straight':'위층 진입 직선',arc:'곡선 구간','bottom-straight':'아래층 도착 직선','bottom-transition':'아래층 바닥의 경사 완충'};
  const fields={curveRadius:['안쪽 회전 여유 (m)','램프 안쪽 연석을 기준으로 회전 반경을 조정합니다.'],curveWidth:['차량이 지나는 유효 폭 (m)','벽·연석을 포함한 전체 폭과 구분하는 차로 폭입니다.'],curveTop:['위층 진입 직선 (m)','위층에서 곡선으로 들어가기 전 길이입니다. 위층 바닥의 경사 완충을 포함합니다.'],curveBottom:['아래층 도착 직선 (m)','곡선에서 나온 뒤 아래층 바닥에 닿기까지 길이입니다. 바닥 이후의 평평한 합류 직선 6m와 별개입니다.'],curveUpper:['위층 바닥 높이 (m)','높이 기준점입니다. 아래층 높이와의 차를 램프와 코어 계단에 같이 적용합니다.'],curveLower:['아래층 바닥 높이 (m)','위층보다 낮은 바닥 높이입니다. 기본 입력의 층간 높이 차와 연결됩니다.'],curveTransitionTop:['위층 경사 완충 (m)','위층 진입 직선 안에 포함됩니다. 평평한 바닥과 주경사 사이의 경사 변화를 완화합니다.'],curveTransitionBottom:['아래층 경사 완충 (m)','아래층 도착 직선 안에 포함됩니다. 경사 길이에 추가로 더하는 값이 아닙니다.'],curveCurbInner:['안쪽 연석 폭 (m)','차로 안쪽 연석의 실제 폭입니다. 모르면 비워 둡니다.'],curveCurbOuter:['바깥 연석 폭 (m)','차로 바깥쪽 연석의 실제 폭입니다. 모르면 비워 둡니다.']};
  let selectedZone=null,activeField=null;const routeCache=new WeakMap(),anchors=new WeakMap();
  const structure=document.createElement('div');structure.className='structure-editor';structure.id='structureEditor';
  structure.innerHTML=`<label class="field-label" for="structureMode">기둥 구조</label><select id="structureMode" class="full-select"><option value="auto">자동 · 균등 격자</option><option value="fixed">직접 입력 · 불균등 격자</option></select><div id="structureFields" hidden><p class="note">도면의 왼쪽 아래 외곽을 기준으로 첫 축 위치를 입력합니다. X는 오른쪽, Y는 위쪽입니다. 모든 축 교점에 기둥을 두며, 외곽 밖 교점은 제외합니다.</p><div class="structure-origins"><label for="axisStartX">X 첫 축 (m)<input id="axisStartX" type="number" step="0.001"></label><label for="axisStartY">Y 첫 축 (m)<input id="axisStartY" type="number" step="0.001"></label></div><label for="axisSpansX">X 축 간격 (m)</label><textarea id="axisSpansX" rows="2" placeholder="6 9 8.4" spellcheck="false"></textarea><label for="axisSpansY">Y 축 간격 (m)</label><textarea id="axisSpansY" rows="2" placeholder="9 9 8.4" spellcheck="false"></textarea><p class="note">간격은 공백·쉼표·줄바꿈으로 구분합니다. 축은 방향별 2~128개, 최소 간격은 기둥 폭 0.6m입니다.</p><button id="seedStructure" class="mini-btn">현재 결과의 기둥 축 가져오기</button><p class="note">가져온 값은 편집 시작값입니다. 원도 치수와 비교한 뒤 적용하세요.</p></div><p id="structureSummary" class="note"></p><p id="structureMessage" class="structure-message" role="status" aria-live="polite"></p><div class="row"><button id="applyStructure" class="mini-btn">구조 적용</button><button id="revertStructure" class="mini-btn">입력 되돌리기</button></div><details class="setting-details"><summary>구조축 파일</summary><div class="row"><button id="exportStructure" class="mini-btn">JSON 저장</button><button id="importStructure" class="mini-btn">JSON 불러오기</button></div><input id="structureFile" type="file" accept=".json,application/json" hidden><p class="note">구조축만 저장합니다. 전체 배치를 피드백하려면 상단의 ‘장면 복사’를 사용하세요.</p></details>`;
  $('moduleSel').closest('section').appendChild(structure);
  let structureKey=null,structureDirty=false;
  const structureBase=()=>G.bbox(doc.mass.map(p=>rot(p,-doc.ucs))).slice(0,2);
  const metres=v=>Number((v/1000).toFixed(3));
  function structureMessage(message,error=false){$('structureMessage').textContent=message;$('structureMessage').classList.toggle('error',error);}
  function writeStructure(axes){
    const base=structureBase();
    for(const [i,axis]of ['x','y'].entries()){
      const key=axis.toUpperCase(),xs=axes?.[axis]||[];
      $('axisStart'+key).value=xs.length?metres(xs[0]-base[i]):'';
      $('axisSpans'+key).value=xs.slice(1).map((v,j)=>metres(v-xs[j])).join(' ');
    }
  }
  function structureAxes(){
    if(doc.columnAxes)return {x:doc.columnAxes.x.slice(),y:doc.columnAxes.y.slice()};
    const r=ui.res;if(!r||r.fail||!r.columns?.length)throw Error('가져올 기둥이 없습니다. 첫 축 위치와 간격을 직접 입력하세요.');
    const centers=r.columns.map(P=>{const b=G.bbox(P.map(p=>rot(p,-doc.ucs)));return [(b[0]+b[2])/2,(b[1]+b[3])/2];});
    const unique=i=>[...new Set(centers.map(p=>Math.round(p[i])))].sort((a,b)=>a-b);
    return {x:unique(0),y:unique(1)};
  }
  function seedStructure(){writeStructure(structureAxes());}
  function markStructureDirty(){structureDirty=true;$('applyStructure').disabled=false;structureMessage('아직 적용하지 않은 입력입니다. 현재 배치는 유지됩니다.');}
  function validateStructure(axes){
    if(!axes||!Array.isArray(axes.x)||!Array.isArray(axes.y))throw Error('X·Y 구조축 배열이 필요합니다.');
    const input=planInput(),frame=UGP.grid.frame({...input,grid:{...input.grid,columnAxes:axes}});
    UGP.grid.setPhase(frame,[0,0]);UGP.layout.placeColumns(frame,[],null);
    return frame.columnAxes;
  }
  function readStructure(){
    const base=structureBase(),axes={};
    for(const [i,axis]of ['x','y'].entries()){
      const key=axis.toUpperCase(),start=$('axisStart'+key),raw=$('axisSpans'+key).value.trim();
      if(!start.value||!Number.isFinite(start.valueAsNumber))throw Error(key+' 첫 축 위치를 숫자로 입력하세요.');
      if(!raw)throw Error(key+' 축 간격을 하나 이상 입력하세요.');
      const values=raw.split(/[\s,;]+/).map(Number);
      if(values.length>127||values.some(v=>!Number.isFinite(v)||v<.6))throw Error(key+' 간격은 0.6m 이상 숫자로 최대 127개 입력하세요.');
      const xs=[Math.round(base[i]+start.valueAsNumber*1000)];for(const v of values)xs.push(xs.at(-1)+Math.round(v*1000));axes[axis]=xs;
    }
    return validateStructure(axes);
  }
  function resetStructureForm(){
    $('structureMode').value=doc.columnAxes?'fixed':'auto';$('structureFields').hidden=!doc.columnAxes;
    writeStructure(doc.columnAxes);structureDirty=false;$('applyStructure').disabled=true;structureMessage('');
  }
  $('structureMode').onchange=()=>{const fixed=$('structureMode').value==='fixed';$('structureFields').hidden=!fixed;markStructureDirty();if(fixed&&!$('axisSpansX').value){try{seedStructure();}catch(e){structureMessage(e.message,true);}};};
  for(const id of ['axisStartX','axisStartY','axisSpansX','axisSpansY'])$(id).oninput=()=>{markStructureDirty();$(id).removeAttribute('aria-invalid');};
  $('seedStructure').onclick=()=>{try{seedStructure();markStructureDirty();}catch(e){structureMessage(e.message,true);}};
  $('revertStructure').onclick=()=>resetStructureForm();
  function applyStructure(axes,message){
    if(axes)axes=validateStructure(axes);
    if(axes)doc.columnAxes=axes;else delete doc.columnAxes;
    structureDirty=false;structureKey=null;setTool('select');$('ucsList').innerHTML='';
    commit(message||(axes?'불균등 구조축 적용':'자동 구조 격자로 복원'));
    renderStructure();structureMessage(ui.res?.fail?'구조축은 저장됐으나 배치를 계산하지 못했습니다. 결과의 오류를 확인하세요.':'적용했습니다. 기둥·축선과 결과의 문제 위치를 확인하세요.',!!ui.res?.fail);
  }
  $('applyStructure').onclick=()=>{
    try{applyStructure($('structureMode').value==='fixed'?readStructure():null);}catch(e){structureMessage(e.message,true);}
  };
  $('exportStructure').onclick=()=>{
    if(!doc.columnAxes)return structureMessage('직접 입력한 구조축을 먼저 적용하세요.',true);
    const value={schema:'ug-column-axes/1',unit:'mm',ucs:doc.ucs,columnAxes:doc.columnAxes},url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');
    a.href=url;a.download='parking-column-axes.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  $('importStructure').onclick=()=>$('structureFile').click();
  $('structureFile').onchange=async()=>{
    const file=$('structureFile').files[0];if(!file)return;
    try{
      if(file.size>65536)throw Error('구조축 JSON은 64KB 이하 파일만 읽습니다.');
      const value=JSON.parse(await file.text());
      if(value?.schema!=='ug-column-axes/1'||value.unit!=='mm'||!Number.isFinite(value.ucs)||Math.abs(value.ucs-doc.ucs)>.001)throw Error('구조축 파일 형식 또는 도면 방향이 다릅니다. 같은 방향에서 저장한 파일을 사용하세요.');
      const axes=validateStructure(value.columnAxes);$('structureMode').value='fixed';$('structureFields').hidden=false;writeStructure(axes);markStructureDirty();structureMessage('파일을 읽었습니다. 위치와 간격을 확인한 뒤 구조 적용을 누르세요.');
    }catch(e){structureMessage('불러오지 못했습니다: '+e.message,true);}finally{$('structureFile').value='';}
  };
  function renderStructure(){
    const key=JSON.stringify([doc.columnAxes,doc.mass,doc.ucs]);if(key!==structureKey){structureKey=key;resetStructureForm();}
    const fixed=!!doc.columnAxes;
    for(const id of ['ucsPick','ucsLong','ucsSuggest'])$(id).disabled=fixed;
    $('phaseSuggest').textContent=fixed?'주차 모듈 위치 비교':'구조열 위치 제안';
    document.querySelector('label[for="moduleSel"]').textContent=fixed?'주차구획 · 차로 모듈 (기둥은 고정)':'주차구획 · 기둥 간격';
    $('structureSummary').textContent=fixed?`적용 중 · X ${doc.columnAxes.x.length}축 / Y ${doc.columnAxes.y.length}축 · 기둥 ${ui.res?.columns?.length??'—'}개. 기둥·코어 위치를 유지하며 주차·차로를 계산합니다. 코어는 직접 끌어 옮길 수 있습니다.`:'적용 중 · 균등 격자. 직접 입력으로 바꾸면 구간별 간격을 편집할 수 있습니다.';
    $('exportStructure').disabled=!fixed;$('applyStructure').disabled=!structureDirty;
    if(fixed)$('ucsInfo').textContent=`구조 방향 ${doc.ucs.toFixed(1)}° 고정 · 첫 축 위치는 이 방향의 외곽 왼쪽 아래 기준`;
    if(fixed&&$('detail').firstElementChild)$('detail').firstElementChild.textContent=`직접 입력 구조 · X ${doc.columnAxes.x.length}축 / Y ${doc.columnAxes.y.length}축 · 주차 모듈과 구조축은 별도`;
  }
  const text=s=>Object.entries({...segmentNames,upperLevelMm:'위층 바닥 높이',lowerLevelMm:'아래층 바닥 높이',innerRadiusMm:'안쪽 회전 여유',legalLaneWidthMm:'차로 유효 폭',straightTopMm:'위층 진입 직선',straightBottomMm:'아래층 도착 직선'}).reduce((s,[id,n])=>s.replaceAll(id,n),String(s||'')).replace(/core-(\d+)/g,(_,n)=>'코어 '+(+n+1)).replace(/column-(\d+)/g,(_,n)=>'기둥 '+(+n+1));
  const fmt=n=>Number.isFinite(n)?Number(n.toFixed(2)).toLocaleString('ko-KR'):'미입력';
  function review(q){
    const e=q?.evidence||{},id=q?.id,pass=q?.verdict==='PASS',na=q?.applicability==='NOT_APPLICABLE',failed=q?.verdict==='FAIL';
    const field={R01:'curveWidth',R02:'rampDrop',R03:'curveRadius',R04:'curveTransitionTop',R09:'curveCurbInner',G07:'rampKind'}[id]||'rampKind';
    let title={R01:'차로의 유효 폭',R02:'램프 구간별 경사',R03:'안쪽 회전 여유',R04:'바닥과 만나는 경사 완충',R09:'연석의 폭·높이',G07:'램프 몸체와 주변 공간'}[id]||'램프 입력';
    let detail='',action={R01:'차로 폭 조정',R02:'층간 높이·램프 길이 조정',R03:'회전 반경 조정',R04:'경사 완충 길이 조정',R09:'연석 입력 확인',G07:'램프 위치·겹친 요소 확인'}[id]||'입력 확인';
    if(failed&&id==='R02'){title=(segmentNames[e.failedSegmentId]||'램프 구간')+'이 가파릅니다';detail=`현재 ${fmt(e.slopePct??e.averageSlopePct)}% / 적용 상한 ${fmt(e.maxSlopePct)}%`;}
    if(failed&&id==='R01')title='차량이 지나는 폭이 부족합니다';
    if(failed&&id==='R03')title='안쪽 회전 여유가 부족합니다';
    if(failed&&id==='R04')title='바닥 접속부의 경사 완충을 조정하세요';
    if(failed&&id==='G07')title=e.violations?.length?'램프가 기둥·코어와 겹칩니다':'램프가 허용 외곽을 벗어납니다';
    const message=failed&&id==='R02'?'현재 바닥 높이 차와 램프 길이로는 경사가 가파릅니다. 해당 구간을 늘리거나 두 층의 높이 조건을 확인하세요.':text(q?.message||'배치한 램프의 검사 정보가 없습니다. 입력과 연결 상태를 확인하세요.').replace(/([\d.]+)mm²/g,(_,n)=>fmt(+n/1e6)+'㎡').replace(/([\d.]+)mm\b/g,(_,n)=>fmt(+n/1000)+'m').replace(/\d+\.\d{3,}/g,n=>Number(n).toFixed(2));
    return {title,detail,message,action,field,state:na?'해당 없음':pass?'조건 충족':failed?'수정 필요':'입력·조건 확인'};
  }
  function routes(r){if(!r||r.fail||ui.drag)return null;if(!routeCache.has(r))routeCache.set(r,UGPlan.inspectVehicleRoutes(r));return routeCache.get(r);}
  function issues(r){
    const list=(r?.issues||[]).map(x=>({...x,fixes:x.fixes||[]})),tr=routes(r);
    for(const key of ['entry','exit']){const route=tr?.[key],v=route?.firstIssue;if(!v)continue;
      const same=v.id==='RAMP_APPROACH'?list.find(x=>x.id==='RAMP_OFFGRID'):null;
      if(same){same.note+=` · ${key==='entry'?'진입':'진출'} 차량 정지`;same.traffic=key;continue;}
      list.push({id:v.id,note:`${key==='entry'?'진입':'진출'} 차량: ${v.note}`,at:v.at,zone:v.body?[v.body]:[],fixes:['ramp','phase'],traffic:key});}
    return list;
  }
  function issueHtml(x,r){
    if(x.id!=='RAMP_RULES')return esc(text(x.note));
    const qs=(r.rampEvaluation?.items||[]).filter(q=>q.subjectId==='R'&&q.applicability!=='NOT_APPLICABLE'&&q.verdict!=='PASS');
    return qs.length?qs.map(q=>{const a=review(q);return `<strong>${esc(a.title)}</strong><p class="issue-explanation">${esc(a.detail||a.message)}<br>${esc(a.action)}</p>`;}).join(''):esc(text(x.note));
  }
  function focusField(id){
    const f=$(id);if(!f)return;for(let p=f.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;
    $('planningPanel').hidden=false;$('appearancePanel').hidden=true;$('planTab').setAttribute('aria-selected','true');$('appearanceTab').setAttribute('aria-selected','false');$('planTab').classList.add('active');$('appearanceTab').classList.remove('active');
    f.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});f.focus();
  }
  renderCurveReview=function(result){
    $('curveReview').hidden=!curveMode();if(!curveMode())return;
    const c=curveSettings(),curve=result?.curveRamp||getCurveRamp(),ev=result?.rampEvaluation;
    $('curveIssues').innerHTML=(curve.violations||[]).length?'<ul>'+(curve.violations||[]).map(v=>`<li>${esc(text(v.note).replaceAll('transitions.topMm','위층 경사 완충').replaceAll('transitions.bottomMm','아래층 경사 완충'))}</li>`).join('')+'</ul>':'';
    $('curveChecks').innerHTML=RAMP_CHECKS.map(([id])=>{const q=ev?.items.find(x=>x.id===id&&x.subjectId===curve.id),a=review(q||{id});return `<details class="ramp-check" data-check="${id}" data-verdict="${q?.verdict||'UNDETERMINED'}" ${q&&q.verdict!=='PASS'&&q.applicability!=='NOT_APPLICABLE'?'open':''}><summary><span>${esc(a.title)}</span><b>${a.state}</b></summary>${a.detail?`<p class="check-evidence">${esc(a.detail)}</p>`:''}<p>${esc(a.message)}</p>${a.state!=='조건 충족'&&a.state!=='해당 없음'?`<button type="button" class="mini-btn check-action" data-focus-field="${a.field}">${esc(a.action)}</button>`:''}<details class="check-detail"><summary>검사 근거</summary>${id} · ${esc(q?.ruleRef?.id||'적용 조건과 원문은 검토 정보 참조')}</details></details>`;}).join('');
    const slope=curve.referenceSlopes?.gradeLinePct;
    $('curveMetrics').textContent=curve.body?`층간 높이 ${fmt((c.upperLevelMm-c.lowerLevelMm)/1000)}m · 곡선 경사 ${fmt(slope)}% · 수평 길이 ${fmt(curve.lengthMm/1000)}m`:'';
    $('curveConditions').textContent=`여러 층을 포함한 램프 이용 대수 ${c.totalStalls??'미입력'}${c.totalStalls===null?'':'대'} · 기준일 ${c.permitDate||'미입력'}`;
    $('curveMeasurement').textContent='경사는 안쪽 차로의 경사 측정선을 기준으로 봅니다. 전체 램프가 맡는 대수를 이 층의 생성 대수로 대체하지 않습니다.';
    const all=RAMP_CHECKS.every(([id])=>{const q=ev?.items.find(x=>x.id===id&&x.subjectId===curve.id);return q&&(q.verdict==='PASS'||q.applicability==='NOT_APPLICABLE');});
    $('curveReviewSummary').textContent=all?'6개 조건 확인':'수정·입력 확인';
  };
  // Keep the original numeric fields and stored mm values, displaying metres.
  for(const [id,[title,help]] of Object.entries(fields)){
    const f=$(id);if(!f)continue;f.parentElement.firstChild.textContent=title;f.dataset.displayScale='1000';f.step='0.01';if(f.hasAttribute('min'))f.min=Number(f.min)>0?'0.01':'0';
    f.title=help;f.addEventListener('focus',()=>{activeField=id;$('rampFieldHelp').textContent=help;renderEdit();drawScheme();});
  }
  const curveBox=$('curveRampFields');curveBox.querySelector('p.note').textContent='구간을 선택하면 평면도에서 같은 부분이 강조됩니다. 길이·높이는 m 단위입니다.';
  const scheme=document.createElement('div');scheme.innerHTML=`<label class="field-label" for="rampDrop">두 층 바닥의 높이 차 (m)</label><input id="rampDrop" type="number" min="0.1" max="20" step="0.1" class="full-select"><svg class="ramp-scheme" viewBox="0 0 270 125" role="img" aria-label="위층 진입 직선, 곡선, 아래층 도착 직선과 바닥 이후 합류 공간"><text x="6" y="15">위층 바닥</text><text x="190" y="90">아래층 바닥</text><path data-part="curveTop" d="M8 28H55L85 42"/><path data-part="curveRadius" d="M85 42C105 49 143 58 163 68"/><path data-part="curveBottom" d="M163 68L194 82H222"/><path d="M222 82H265" fill="none" stroke="#6f9bba" stroke-dasharray="3 3"/><text x="4" y="110">완충은 각 직선 안에 포함</text><text x="175" y="122">바닥 이후 합류 6m</text></svg><div class="ramp-segments"><button class="mini-btn" data-focus-field="curveTop">위층 직선</button><button class="mini-btn" data-focus-field="curveRadius">곡선·반경</button><button class="mini-btn" data-focus-field="curveBottom">아래층 직선</button><button class="mini-btn" data-focus-field="curveTransitionTop">경사 완충</button></div><p id="rampFieldHelp" class="note">높이 차는 램프 경사와 코어 계단에 함께 반영됩니다.</p>`;
  curveBox.querySelector('p').after(scheme);
  $('rampDrop').step='0.01';
  const levels=document.createElement('details');levels.className='setting-details';levels.innerHTML='<summary>각 층의 기준 높이 직접 입력</summary><div class="curve-fields"></div>';for(const id of ['curveUpper','curveLower'])levels.querySelector('div').appendChild($(id).parentElement);scheme.after(levels);
  $('rampDrop').onchange=()=>{if(!$('rampDrop').value||!$('rampDrop').reportValidity())return;const c=curveSettings();doc.ramp.curve={...c,lowerLevelMm:Math.round(c.upperLevelMm-$('rampDrop').valueAsNumber*1000)};commit('층간 높이 차 변경');};
  $('rampDrop').onfocus=()=>{activeField='rampDrop';$('rampFieldHelp').textContent='두 층의 바닥 높이 차입니다. 위층 기준을 유지하며 아래층 높이와 코어 계단을 함께 바꿉니다.';renderEdit();drawScheme();};
  function drawScheme(){document.querySelectorAll('.ramp-scheme [data-part]').forEach(p=>p.classList.toggle('selected',p.dataset.part===activeField||activeField==='rampDrop'));document.querySelectorAll('.ramp-segments [data-focus-field]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.focusField===activeField)));}
  document.addEventListener('click',e=>{const b=e.target.closest('[data-focus-field],[data-part]');if(b)focusField(b.dataset.focusField||b.dataset.part);});

  const options=document.createElement('section');options.id='parkingOptionSection';options.innerHTML=`<div class="section-title"><h2>주차칸 종류</h2></div><p class="note">사업 기준의 최소 목표를 입력합니다. 충전은 친환경차 전용에도 포함되며 실제 칸은 한 번만 셉니다.</p><div class="planning-options">${Object.entries(names).map(([key,name])=>`<div class="parking-option" data-option="${key}"><label for="quota-${key}-mode">${name}</label><div class="option-inputs"><select id="quota-${key}-mode" aria-label="${name} 목표 방식"><option value="off">해제</option><option value="ratio">비율 %</option><option value="count">최소 대수</option>${key==='accessible'?'<option value="default">기존 기본값</option>':''}</select><input id="quota-${key}-value" type="number" min="0" step="0.5" aria-label="${name} 목표 값"><select id="quota-${key}-round" aria-label="${name} 끝수 처리"><option value="ceil">올림</option><option value="round">반올림</option><option value="floor">버림</option></select></div><details><summary class="note">산정 기준</summary><label class="option-basis">산정 전체 대수<input id="quota-${key}-basis" type="number" min="0" step="1" placeholder="이 층" aria-label="${name} 산정 전체 대수"></label></details><small id="quota-${key}-result"></small></div>`).join('')}</div>`;
  $('rampSettings').after(options);
  const optionDetails=document.createElement('details');optionDetails.className='setting-details';optionDetails.innerHTML='<summary>종류별 목표 조정</summary>';options.appendChild(optionDetails);optionDetails.appendChild(options.querySelector('.planning-options'));
  $('accRate').closest('label').style.display='none';
  for(const key of Object.keys(names))for(const suffix of ['mode','value','round','basis'])$('quota-'+key+'-'+suffix).onchange=()=>{
    const mode=$('quota-'+key+'-mode').value,value=$('quota-'+key+'-value'),basis=$('quota-'+key+'-basis');
    if(!value.checkValidity()||!basis.checkValidity()){value.reportValidity();basis.reportValidity();return;}
    if((mode==='ratio'||mode==='count')&&(!value.value||mode==='ratio'&&value.valueAsNumber>100||mode==='count'&&!Number.isInteger(value.valueAsNumber))){value.setCustomValidity('비율은 0–100, 대수는 0 이상 정수로 입력하세요.');value.reportValidity();value.setCustomValidity('');return;}
    doc.parkingOptions={...(doc.parkingOptions||{})};if(mode==='default')delete doc.parkingOptions[key];else doc.parkingOptions[key]=mode==='off'?{mode:'off'}:{mode,value:value.valueAsNumber/(mode==='ratio'?100:1),rounding:$('quota-'+key+'-round').value,...(basis.value?{basisTotal:basis.valueAsNumber}:{})};
    commit(names[key]+' 주차 목표 변경');
  };
  const areaSection=document.createElement('section');areaSection.id='planningAreas';areaSection.innerHTML=`<h2>잔여공간 정리</h2><label class="toggle-row"><span>남는 공간을 DA·PIT로 제안</span><input type="checkbox" id="autoZonesToggle"></label><div id="planningAreaSummary" class="area-summary"></div><button class="add-btn" id="pickZone">도면에서 영역 선택</button><p class="note">DA·PIT는 단면 확인 전 계획 제안입니다. 선택한 영역을 바꾸거나 바닥으로 유지할 수 있습니다. 대당 면적은 이 분류 전 본체 실내 면적을 기준으로 합니다.</p><div class="zone-editor" id="zoneEditor" hidden><p id="zoneInfo"></p><select id="zoneKind" aria-label="선택 영역 용도"><option value="da">DA · 외기 여유</option><option value="pit">PIT · 설비 여유</option><option value="keep">바닥 유지 · 자동 분류 제외</option></select><div class="row"><button class="mini-btn" id="applyZone">적용</button><button class="mini-btn" id="releaseZone">자동으로 돌리기</button><button class="mini-btn" id="closeZone">닫기</button></div></div>`;
  options.after(areaSection);
  $('autoZonesToggle').onchange=()=>{doc.autoZones=$('autoZonesToggle').checked;selectedZone=null;commit('잔여공간 자동 정리 변경');};
  $('pickZone').onclick=()=>{ui.zonePick=!ui.zonePick;svg.classList.toggle('zone-pick',ui.zonePick);$('pickZone').textContent=ui.zonePick?'도면에서 DA·PIT 또는 유지 영역을 누르세요':'도면에서 영역 선택';};
  $('closeZone').onclick=()=>{selectedZone=null;renderAll();};
  $('applyZone').onclick=()=>{if(!selectedZone)return;const z=selectedZone,kind=$('zoneKind').value,key=z.source==='auto'?'zoneAssignments':'nonParkingZones';doc[key]=(doc[key]||[]).filter(x=>x.id!==z.id);doc[key].push({id:z.id,kind,paths:JSON.parse(JSON.stringify(z.paths))});selectedZone=null;commit(kind==='keep'?'영역 바닥 유지':kind.toUpperCase()+' 영역 지정');};
  $('releaseZone').onclick=()=>{if(!selectedZone)return;const key=selectedZone.source==='auto'?'zoneAssignments':'nonParkingZones';doc[key]=(doc[key]||[]).filter(z=>z.id!==selectedZone.id);selectedZone=null;commit('영역 자동 분류 복원');};
  const inside=(paths,p)=>paths.reduce((s,P)=>s+(G.CL.Clipper.PointInPolygon({X:p[0],Y:p[1]},G.toC(P))!==0?Math.sign(G.signedArea(P)):0),0)!==0;
  function zones(r){return (r?.nonParkingZones||[]).concat(r?.keptZones||[],(doc.nonParkingZones||[]).filter(z=>z.kind==='keep').map(z=>({...z,source:'input',areaM2:Math.abs(G.areaOf(z.paths))/1e6})));}
  function chooseZone(z){selectedZone=z;ui.zonePick=false;svg.classList.remove('zone-pick');renderAll();$('planningAreas').scrollIntoView({block:'nearest'});}
  svg.addEventListener('pointerdown',e=>{if(e.button!==0||ui.drag)return;const target=e.target.closest?.('[data-zone-id]');if(!ui.zonePick&&!target)return;const r=ui.live||ui.res;if(!r||r.fail)return;const p=world(e),z=zones(r).find(z=>target?z.id===target.dataset.zoneId:inside(z.paths,p));e.stopImmediatePropagation();e.preventDefault();if(z)chooseZone(z);else flash('DA·PIT 또는 유지 영역 안을 선택하세요. Esc로 취소합니다.');},true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){ui.zonePick=false;svg.classList.remove('zone-pick');selectedZone=null;render(ui.res);}});
  function anchor(z){
    if(anchors.has(z))return anchors.get(z);const ps=[];
    for(const P of z.paths.filter(P=>G.signedArea(P)>0)){
      const b=G.bbox(P);ps.push([(b[0]+b[2])/2,(b[1]+b[3])/2]);
      for(let i=0;i<P.length;i++){const a=P[i],d=sub(P[(i+1)%P.length],a),L=Math.hypot(...d);if(L<1000)continue;const m=add(a,mul(d,.5)),n=[-d[1]/L,d[0]/L];for(const off of [800,1500,2500,4000])ps.push(add(m,mul(n,off)));}
      for(const x of [.2,.4,.6,.8])for(const y of [.2,.4,.6,.8])ps.push([b[0]+(b[2]-b[0])*x,b[1]+(b[3]-b[1])*y]);
    }
    const valid=ps.filter(p=>inside(z.paths,p));anchors.set(z,valid);return valid;
  }
  function drawZones(g,r){
    if(!r||r.fail)return;
    for(const z of zones(r)){const on=selectedZone?.id===z.id,p=el('path',{d:pathsD(z.paths),fill:z.kind==='da'?'url(#daHatch)':z.kind==='pit'?'#ece8df':'#f5f4f0','fill-rule':'nonzero',stroke:on?'#b78337':z.kind==='pit'?'#a69a85':'#a6a6a6','stroke-width':on?1.8:.7,'stroke-dasharray':z.source==='auto'&&!z.assigned?'4 2':'','vector-effect':NSS,'data-planning-zone':z.kind},g);el('title',{},p).textContent=`${z.kind==='keep'?'바닥 유지':z.kind.toUpperCase()} · ${fmt(z.areaM2)}㎡ · ${z.assigned?'직접 분류':z.source==='auto'?'계획 제안':'직접 지정'}`;}
  }
  function drawZoneLabels(g,r){if(!r||r.fail||ui.drag)return;const k=scale(),placed=[];for(const z of zones(r)){if(z.areaM2<3||z.source==='auto'&&!z.assigned&&z.areaM2<10)continue;
    const name=`${z.kind==='keep'?'유지':z.kind.toUpperCase()} ${Number(z.areaM2.toFixed(1))}㎡`,w=(name.length*4.4+6)/k,h=13/k;
    const p=anchor(z).map(toD).find(p=>{const b=[p[0]-w/2,p[1]-h/2,p[0]+w/2,p[1]+h/2];return placed.every(q=>b[0]>q[2]||b[2]<q[0]||b[1]>q[3]||b[3]<q[1])&&[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]].every(q=>inside(z.paths,rot([q[0],-q[1]],doc.ucs)));});if(!p)continue;placed.push([p[0]-w/2,p[1]-h/2,p[0]+w/2,p[1]+h/2]);
    const t=el('text',{x:p[0],y:p[1],fill:z.kind==='pit'?'#8d7655':'#7c8386','font-size':8/k,'text-anchor':'middle','dominant-baseline':'middle','paint-order':'stroke',stroke:'#f7f5ef','stroke-width':3/k,'data-zone-id':z.id,'pointer-events':'all',style:'cursor:pointer'},g);t.textContent=name;}}
  function highlightRamp(g,spec){
    if(!activeField||!spec.body)return;let P=spec.gradeLine;
    if(activeField==='curveRadius')P=spec.curbs.inner.wallSide.slice(spec.spec.straightTopMm>0?1:0,spec.spec.straightBottomMm>0?-1:undefined);
    else if(activeField==='curveWidth'){const n=Math.floor(spec.innerWall.length/2);P=[spec.curbs.inner.wallSide[n],spec.curbs.outer.wallSide[n]];}
    else if(activeField==='curveTop')P=spec.gradeLine.slice(0,2);
    else if(activeField==='curveBottom')P=spec.gradeLine.slice(-2);
    else if(activeField==='curveTransitionTop'||activeField==='curveTransitionBottom'){
      const top=activeField==='curveTransitionTop',a=top?spec.gradeLine[0]:spec.gradeLine.at(-1),b=top?spec.gradeLine[1]:spec.gradeLine.at(-2),d=sub(b,a),L=Math.hypot(...d),length=spec.segments.find(s=>s.id===(top?'top-transition':'bottom-transition'))?.lengthMm||0;P=length&&L?[a,add(a,mul(d,Math.min(length,L)/L))]:null;
    }
    if(P?.length)el('polyline',{points:pts(P),fill:'none',stroke:'#d3a052','stroke-width':3,opacity:.8,'vector-effect':NSS,'data-ramp-highlight':activeField},g);
  }
  const traffic=document.createElement('section');traffic.id='vehicleReview';traffic.innerHTML='<h2>차량 동선 확인</h2><div id="vehicleRouteStates"></div><p class="note">차체 4.6×1.9m의 평면 확인입니다. 첫 문제 앞에서 멈추며, 조향·후진·교행 검토는 별도입니다.</p>';$('planningAreas').after(traffic);
  function render(r){
    renderStructure();
    if(document.activeElement!==$('rampDrop'))$('rampDrop').value=fmt((curveSettings().upperLevelMm-curveSettings().lowerLevelMm)/1000).replaceAll(',','');
    for(const key of Object.keys(names)){
      const cfg=doc.parkingOptions?.[key],q=r?.parkingSummary?.requirements[key],mode=cfg?.mode||(key==='accessible'?'default':'off'),v=$('quota-'+key+'-value'),m=$('quota-'+key+'-mode');m.value=mode;
      v.disabled=['off','default'].includes(mode);v.step=mode==='count'?'1':'0.5';v.max=mode==='ratio'?'100':'';if(document.activeElement!==v)v.value=cfg?.value!==undefined?Number((cfg.value*(mode==='ratio'?100:1)).toFixed(4)):mode==='default'?Number(((doc.accessibleRate??.03)*100).toFixed(2)):0;
      const round=$('quota-'+key+'-round');round.value=cfg?.rounding||(key==='electric'?'round':'ceil');round.disabled=mode==='off'||mode==='count'||mode==='default';
      const basis=$('quota-'+key+'-basis');if(document.activeElement!==basis)basis.value=cfg?.basisTotal??'';basis.disabled=mode==='off'||mode==='default';
      const info=$('quota-'+key+'-result');info.textContent=q?`목표 ${q.need}대 · 배치 ${q.placed}대${q.short?' · 부족 '+q.short+'대':q.excess?' · 목표보다 '+q.excess+'대 많음':''}`:'추가 목표 해제';info.classList.toggle('short',!!q?.short);
    }
    $('autoZonesToggle').checked=doc.autoZones!==false;const a=r?.areas;$('planningAreaSummary').innerHTML=a?[['층 전체 외곽',a.floorEnvelopeM2],['주차에 쓰는 바닥',a.parkingSurfaceM2],['DA 계획',a.daM2],['PIT 계획',a.pitM2],['잔여 바닥 유지',a.keptFreeM2],['아직 미분류',a.unassignedFreeM2]].map(([n,v])=>`<span>${n}<b>${fmt(v)}㎡</b></span>`).join(''):'';
    if(selectedZone){selectedZone=zones(r).find(z=>z.id===selectedZone.id)||null;}
    $('zoneEditor').hidden=!selectedZone;if(selectedZone){$('zoneInfo').textContent=`${selectedZone.kind.toUpperCase()} · ${fmt(selectedZone.areaM2)}㎡ · ${selectedZone.assigned?'직접 분류':selectedZone.source==='auto'?'자동 제안':'직접 지정'}`;$('zoneKind').value=selectedZone.kind;$('releaseZone').disabled=selectedZone.source!=='input'&&!selectedZone.assigned;}
    let stale=$('zoneAssignmentNotice');if(!stale){stale=document.createElement('p');stale.id='zoneAssignmentNotice';stale.className='note';$('zoneEditor').after(stale);}const unused=r?.unmatchedZoneAssignments||[];stale.innerHTML=unused.length?`형상이 달라진 분류 ${unused.length}개는 다시 확인하세요. <button class="mini-btn" id="discardZoneAssignments">바뀐 분류 지우기</button>`:'';if(unused.length)$('discardZoneAssignments').onclick=()=>{doc.zoneAssignments=(doc.zoneAssignments||[]).filter(z=>!unused.includes(z.id));commit('형상이 바뀐 잔여영역 분류 해제');};
    $('pickZone').textContent=ui.zonePick?'도면에서 영역 선택 중 · Esc 취소':'도면에서 영역 선택';
    const tr=routes(r);$('vehicleRouteStates').innerHTML=tr?['entry','exit'].map(key=>{const v=tr[key];return `<div class="traffic-state" data-state="${v.state}"><span>${key==='entry'?'진입 · 파랑':'진출 · 적갈색'}</span><b>${v.state==='clear'?'표시 경로 차체 확인':v.state==='blocked'?'문제 앞 정지':'연결 확인 필요'}</b></div>`;}).join(''):'<p class="note">배치를 놓으면 차량 경로를 확인합니다.</p>';drawScheme();
  }
  window.UGPlanningUI={render,review,routes,issues,issueHtml,drawZones,drawZoneLabels,highlightRamp,focusField,text,structure:{axes:structureAxes,apply:applyStructure}};
  for(const s of document.querySelectorAll('.legend>span')){const t=s.textContent.trim();if(t==='DA')s.lastChild.textContent='DA · 외기 여유';if(t==='자투리 후보'){s.lastChild.textContent='PIT · 설비 여유';const i=s.querySelector('i');if(i)i.style.background='#ece8df';}}
})();
