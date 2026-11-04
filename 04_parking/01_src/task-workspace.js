(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  function init() {
    const layout = $('layoutControls');
    if (!layout || !$('layoutSave')?.contains($('workflowTraffic'))) return false;
    if ($('taskNavigation')) return true;
    const nav = document.createElement('nav');
    nav.id = 'taskNavigation';
    nav.setAttribute('aria-label', '작업 바로가기');
    nav.innerHTML = '<p class="task-eyebrow">프로젝트</p><strong id="taskProject"></strong><div class="task-steps"><button type="button" data-task="conditions">조건 입력</button><button type="button" data-task="lanes">차로 편집</button><button type="button" data-task="layout">대안 비교</button><button type="button" data-task="review">차량 검토</button><button type="button" data-task="save">저장</button></div><p class="task-eyebrow">도면 요소</p><div class="task-elements"><button type="button" data-feature="outline">외곽 조정</button><button type="button" data-feature="columns">기둥 치수·축 조정</button><button type="button" data-feature="core">코어 조정</button><button type="button" data-feature="ramp">램프 조정</button><button type="button" data-task="lanes">차로 편집</button></div><p class="task-nav-note">선택 → 속성 편집</p>';
    document.querySelector('.app-header').after(nav);
    document.body.classList.add('workspace-a');
    let task = 'conditions';
    const titles = {conditions:'조건 입력', lanes:'선택한 차로', layout:'대안 비교', review:'차량 검토', save:'저장·다시 열기'};
    const aside = document.querySelector('aside');
    const heading = document.createElement('div');
    heading.id = 'taskHeading'; heading.innerHTML = '<h2></h2><p>같은 입력에서 배치와 검토 범위를 함께 확인합니다.</p>';
    aside.prepend(heading);
    aside.insertBefore($('selectionInspector'), $('planningPanel'));
    const conditions = document.createElement('section');
    conditions.id = 'taskConditions';
    conditions.innerHTML = '<p class="note">이번 차로 편집에서 유지하는 조건</p><label>지하 외곽<output id="taskMass"></output></label><label>구조축·기둥<output id="taskColumns"></output></label><label>코어·램프<output id="taskFixed"></output></label><p class="note">도면 요소를 선택하면 기존 위치·크기를 조정할 수 있습니다. 참고 입력의 치수와 연결층은 별도 확인이 필요합니다.</p>';
    $('planningPanel').prepend(conditions);
    const inputDetails = document.createElement('details');
    inputDetails.id = 'taskInputDetails'; inputDetails.innerHTML = '<summary>입력 수치·고급 설정</summary>';
    $('planningPanel').append(inputDetails);
    inputDetails.append($('moduleSel').closest('section'), $('advancedPlanning'));
    const pending = () => !$('workflowCancel').disabled || !!ui.drag;
    function navigate(next) {
      if (pending()) { flash('미리보기를 적용하거나 취소한 뒤 이동하세요.'); return; }
      $('planTab').click(); task = next;
      if (next === 'lanes') $('workflowLanes').click();
      else if (next === 'review') $('workflowTraffic').click();
      else $('workflowInput').click();
      sync();
      const target = next === 'conditions' ? $('taskLoad') : next === 'lanes' ? $('workflowTarget') : next === 'save' ? $('taskSaveNow') : next === 'review' ? $('manoeuvreRun') : $('workflowManual').getAttribute('aria-pressed') === 'true' ? $('workflowManual') : $('workflowAuto');
      target.focus({preventScroll:true});
    }
    nav.addEventListener('click', e => {
      const next = e.target.closest('button')?.dataset.task;
      if (next) navigate(next);
    });
    function feature(name) {
      if (pending()) return;
      navigate('conditions');
      if (name === 'columns') {
        inputDetails.open = true;
        if ($('editStructureCanvas').getAttribute('aria-pressed') !== 'true') $('editStructureCanvas').click();
        $('columnSizeMm')?.scrollIntoView({block:'center'}); $('columnSizeMm')?.focus({preventScroll:true});
      }
      else if (name === 'ramp') $('workflowRamp').click();
      else { setTool('select'); ui.sel = name === 'outline' ? {kind:'mass'} : doc.cores.length ? {kind:'core',i:0} : null; renderAll(); if (!ui.sel) flash('도면 위의 + 코어로 코어를 추가하세요.'); }
      sync();
    }
    nav.addEventListener('click', e => { const name = e.target.closest('button')?.dataset.feature; if (name) feature(name); });
    const tools = document.createElement('div');
    tools.id = 'taskElementTools';
    tools.innerHTML = '<button type="button" data-feature="outline">외곽</button><button type="button" data-feature="columns">기둥 치수·축</button><button type="button" data-feature="core">코어</button>';
    $('canvasActions').prepend(tools);
    tools.onclick = e => { const name=e.target.closest('button')?.dataset.feature; if(name)feature(name); };
    const header = document.querySelector('.header-actions');
    const load = document.createElement('button'); load.id = 'taskLoad'; load.className = 'hbtn'; load.textContent = '입력 불러오기';
    load.onclick = () => { if (pending()) return; $('siteProjectOpen').click(); $('projectShelf').open = true; $('workspaceSaved').focus(); };
    header.prepend(load);
    const saveShortcut = document.createElement('button'); saveShortcut.className = 'hbtn'; saveShortcut.textContent = '저장'; saveShortcut.onclick = () => navigate('save'); header.append(saveShortcut);
    const theme = document.createElement('div'); theme.id = 'taskTheme'; theme.setAttribute('role','group'); theme.setAttribute('aria-label','화면 모드');
    theme.innerHTML = '<button type="button" data-theme="light">화이트</button><button type="button" data-theme="dark">다크</button>';
    header.append(theme);
    let themeName = 'light';
    try { if(localStorage.getItem('parking-redesign-theme-v2')==='dark')themeName='dark'; } catch {}
    function setTheme(value) { document.documentElement.dataset.theme=value; theme.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.theme===value))); }
    setTheme(themeName);
    theme.onclick = e => { const value=e.target.closest('button')?.dataset.theme; if(!value)return;setTheme(value);try{localStorage.setItem('parking-redesign-theme-v2',value);}catch{} };
    const more = document.createElement('details'); more.id = 'taskMore'; more.innerHTML = '<summary>도면 도구</summary><div></div>'; header.append(more);
    for(const id of ['siteProjectOpen','fitBtn','copyScene','presentationBtn','printBtn'])more.lastElementChild.append($(id));
    layout.classList.add('task-layout');
    layout.querySelector('h2').textContent = '배치·비교';
    const intro = document.createElement('p');
    intro.className = 'note';
    intro.textContent = '배치 방식 선택 → 주차열 대안 미리보기 → 적용·검토';
    layout.querySelector('h2').after(intro);
    function group(id, title, nodes, description) {
      const box = document.createElement('div');
      box.id = id; box.className = 'task-group';
      const label = document.createElement('h3');
      label.id = id + 'Label'; label.textContent = title; box.append(label);
      box.setAttribute('role', 'group'); box.setAttribute('aria-labelledby', label.id);
      if (description) {
        const help = document.createElement('p');
        help.id = id + 'Help'; help.className = 'note'; help.textContent = description; box.append(help);
        nodes.flatMap(n => [...n.querySelectorAll('button')]).forEach(b => b.setAttribute('aria-describedby', help.id));
      }
      box.append(...nodes); layout.append(box); return box;
    }
    group('taskMode', '배치 방식', [$('layoutModeRow')], '자동: 차로와 칸을 함께 배치 · 반자동: 정한 차로에 칸 배치');
    const shelf = group('taskAlternatives', '대안 선반', [$('layoutALT')], '조건 동일 · 차량 통행 검토 별도');
    $('layoutALT').prepend($('workflowALT2'));
    const candidate = document.createElement('p'); candidate.id = 'taskCandidate'; shelf.append(candidate);
    const preview = group('taskPreview', '미적용 변경', [$('layoutApply'), $('workflowStatus')]);
    preview.setAttribute('role', 'status'); preview.setAttribute('aria-live', 'polite');
    const notice = document.createElement('p');
    notice.className = 'note'; notice.textContent = '현재는 미리보기입니다. 변경을 적용하거나 취소한 뒤 다른 작업을 진행하세요.';
    preview.querySelector('h3').after(notice);
    group('taskSave', '저장·검토', [$('layoutSave'), $('workflowSave')], '후보 대수와 차량 통행 확인은 별개입니다. 적용한 안에서 통행을 검토하세요.');
    const saveNow = document.createElement('button'); saveNow.id = 'taskSaveNow'; saveNow.className = 'mini-btn'; saveNow.textContent = '현재 입력 저장';
    saveNow.onclick = () => { if(!pending())save(); };
    $('layoutSave').prepend(saveNow);
    const oldPanel = renderPanel;
    renderPanel = function() { oldPanel(); sync(); };
    function sync() {
      const live = ui.live || ui.res;
      if(ui.laneEditing)task='lanes';
      else if(task==='lanes')task='conditions';
      document.body.dataset.workspaceTask=task;
      heading.querySelector('h2').textContent=titles[task];
      $('taskProject').textContent=referenceScene?referenceScene.floor+' 지하주차장':doc.name||'일반 도면';
      $('taskMass').textContent='꼭짓점 '+doc.mass.length+'개 · 입력 외곽 유지';
      $('taskColumns').textContent=(doc.columnAxes?'직접 입력 구조축':'자동 격자')+' · 기둥 '+(ui.res?.columns?.length??'—')+'개';
      $('taskFixed').textContent='코어 '+doc.cores.length+'개 · '+(curveMode()?'곡선':'직선')+' 램프';
      candidate.textContent=live?.fail?'계산 실패 · 조건을 확인하세요.':'후보 '+(live?.stallCount??'—')+'칸 · '+(ui.live?'적용 전':'적용한 배치');
      const hidden=$('layoutApply').hidden;
      if(preview.hidden!==hidden)preview.hidden=hidden;
      saveNow.disabled=pending();
      nav.querySelectorAll('[data-task]').forEach(b=>{ b.setAttribute('aria-current',b.dataset.task===task?'step':'false'); b.disabled=pending(); });
    }
    new MutationObserver(sync).observe($('layoutApply'), {attributes: true, attributeFilter: ['hidden']});
    const selectionObserver=new MutationObserver(sync);
    selectionObserver.observe($('selectionInspector'),{attributes:true,attributeFilter:['hidden']});
    sync();
    requestAnimationFrame(()=>{if(ui.res)fit();});
    return true;
  }
  const observer = new MutationObserver(() => { if (init()) observer.disconnect(); });
  if (!init()) observer.observe(document.documentElement, {childList: true, subtree: true});
})();
