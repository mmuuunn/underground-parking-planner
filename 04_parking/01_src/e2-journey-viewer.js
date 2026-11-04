(function(root,factory){'use strict';
  const node=typeof module!=='undefined'&&module.exports;
  const api=factory(node?require('./plan/vehicle-manoeuvres.js'):root.UGP?.vehicleManoeuvres);
  if(node)module.exports=api;else api.mount();
})(typeof window!=='undefined'?window:globalThis,function(M){'use strict';
  const ids=['ramp-entry','loop-to-parking','parking-entry','parking-exit','loop-to-ramp','ramp-exit'];
  const names=['램프 진입','고리 이동','주차 입차','주차 출차','고리 복귀','램프 진출'];
  const same=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===3&&b.length===3&&a.every(Number.isFinite)&&b.every(Number.isFinite)&&Math.hypot(a[0]-b[0],a[1]-b[1])<.01&&Math.abs(Math.atan2(Math.sin(a[2]-b[2]),Math.cos(a[2]-b[2])))<1e-7;
  function ensure(ok,message){if(!ok)throw Error(message);}
  function timeline(route){
    ensure(route&&Array.isArray(route.phases)&&route.phases.length===6,'전체 여정 6구간이 필요합니다.');
    let q=route.phases[0].start,mm=0,gear=1,changes=0;const segments=[],phases=[];
    for(let i=0;i<6;i++){
      const phase=route.phases[i];ensure(phase.id===ids[i]&&same(q,phase.start)&&Array.isArray(phase.controls),'여정 구간의 접속이 맞지 않습니다.');
      ensure(phase.margin===(i===2||i===3?100:200),'경로의 여유 조건이 다릅니다.');phases.push({from:mm,name:names[i]});
      for(const c of phase.controls){
        ensure(c&&[1,-1].includes(c.gear)&&Number.isFinite(c.lengthMm)&&c.lengthMm>0&&Number.isFinite(c.curvature)&&Math.abs(c.curvature)<=1/4500+1e-12,'경로 제어값을 확인할 수 없습니다.');
        if(i!==2&&i!==3)ensure(c.gear===1,'고리와 램프는 전진 경로여야 합니다.');
        if(gear!==c.gear)changes++;gear=c.gear;
        segments.push({from:mm,to:mm+c.lengthMm,start:q.slice(),gear,curvature:c.curvature,phase:i,changes});
        q=M.advance(q,c.gear*c.lengthMm,c.curvature);mm+=c.lengthMm;
      }
      ensure(same(q,phase.end),'구간의 끝점이 맞지 않습니다.');
    }
    ensure(Number.isFinite(route.travelM)&&Math.abs(mm/1000-route.travelM)<.0001&&changes===route.gearChanges,'경로 수치와 재생 자료가 다릅니다.');
    return {segments,phases,lengthMm:mm,gearChanges:changes,end:q.slice()};
  }
  function at(t,mm){
    ensure(Number.isFinite(mm),'재생 위치가 올바르지 않습니다.');mm=Math.max(0,Math.min(t.lengthMm,mm));
    const c=t.segments.find(c=>mm<c.to-1e-7)||t.segments.at(-1),q=M.advance(c.start,c.gear*Math.max(0,Math.min(c.to-c.from,mm-c.from)),c.curvature);
    return {q,gear:c.gear,phase:c.phase,changes:c.changes,mm};
  }
  function prepare(data){
    ensure(data?.schema==='e2-journeys/1'&&data.stalls?.length===50&&data.journeys?.length===50,'E2 50칸의 비교 자료가 필요합니다.');
    for(const P of [data.fixed?.mass,data.fixed?.innerOutline,...(data.fixed?.columns||[]),...(data.fixed?.cores||[]),data.fixed?.ramp,...(data.aisles||[]),...data.stalls])ensure(Array.isArray(P)&&P.length>=3&&P.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)),'E2 도면 자료를 확인할 수 없습니다.');
    const vehicle=data.vehicle;ensure(vehicle&&vehicle.lengthMm===4600&&vehicle.widthMm===1900&&vehicle.minRadiusMm===4500&&vehicle.rearOverhangMm===900&&vehicle.wheelbaseMm===2700,'검토 차량의 치수가 다릅니다.');
    const seen=new Set();return data.journeys.map((j,i)=>{
      ensure(j.index===i&&j.id==='P'+String(i+1).padStart(2,'0')&&!seen.has(j.id),'주차칸 식별자가 다릅니다.');seen.add(j.id);
      const before=timeline(j.before),after=timeline(j.after),entry=data.ramps.find(r=>r.id==='R-IN'),exit=data.ramps.find(r=>r.id==='R-OUT');
      for(const r of [j.before,j.after])ensure(same(r.phases[0].start,entry?.start)&&same(r.phases[5].end,exit?.end)&&same(r.phases[2].end,j.parked)&&same(r.phases[3].start,j.parked),'램프·주차 완료 자세가 맞지 않습니다.');
      ensure(after.gearChanges<before.gearChanges||after.gearChanges===before.gearChanges&&after.lengthMm<=before.lengthMm+.001,'개선 경로가 비교 기준보다 나쁩니다.');return {before,after};
    });
  }
  function mount(){
    const openButton=document.getElementById('e2JourneyOpen');if(!openButton)return;
    let dialog,data,prepared,selected=0,version='after',position=0,frame=0,last=0,playing=false;
    const $=id=>dialog.querySelector('#'+id),svgNode=(tag,attrs,parent)=>{const e=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);parent?.append(e);return e;};
    const points=P=>P.map(p=>p[0]+','+(-p[1])).join(' '),current=()=>prepared[selected][version];
    const style=document.createElement('style');style.textContent=`
      #e2JourneyDialog{box-sizing:border-box;width:96vw;max-width:1600px;height:92vh;max-height:96vh;padding:0;border:1px solid #cbd5d1;border-radius:12px;background:#f5f7f4;color:#233b32;font:14px system-ui,sans-serif;box-shadow:0 16px 70px #0004}
      #e2JourneyDialog::backdrop{background:#172e29bb}#e2JourneyDialog *{box-sizing:border-box}#e2JourneyDialog button,#e2JourneyDialog select{font:inherit;min-height:36px;border:1px solid #b9c8bf;border-radius:5px;background:white;color:#234435;padding:6px 10px;cursor:pointer}#e2JourneyDialog button:disabled{opacity:.5;cursor:default}#e2JourneyDialog :focus-visible{outline:3px solid #357bbf;outline-offset:2px}
      .e2-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 20px;background:#fff;border-bottom:1px solid #d6dfd8}.e2-head h2{font-size:19px;margin:0}.e2-head p{font-size:12px;margin:5px 0 0;color:#576e62}
      .e2-layout{display:grid;grid-template-columns:minmax(0,1fr) 340px;height:calc(100% - 83px);min-height:0}.e2-map{min-width:0;min-height:0;display:flex;flex-direction:column;padding:14px;background:#eef2ec}.e2-map svg{width:100%;height:0;flex:1 1 0;min-height:0;background:#fff;border:1px solid #cbd6cc;border-radius:8px}.e2-legend{display:flex;flex-shrink:0;gap:16px;flex-wrap:wrap;font-size:12px;margin:10px 0 0}.e2-legend b{color:#197659}.e2-legend span{color:#ad7131}
      .e2-controls{padding:18px;overflow:auto;border-left:1px solid #d6dfd8;background:#fff}.e2-controls h3{font-size:17px;margin:0 0 12px}.e2-controls label{display:block;font-weight:600;margin:14px 0 6px}.e2-controls select{width:100%}.e2-select{display:flex;gap:6px}.e2-select select{flex:1;min-width:0}.e2-controls table{border-collapse:collapse;width:100%;font-size:13px;margin:16px 0}.e2-controls th,.e2-controls td{padding:9px 3px;text-align:right;border-bottom:1px solid #e1e7df}.e2-controls th:first-child{text-align:left}.e2-controls td:last-child{font-weight:700;color:#197659}.e2-note{font-size:12px;line-height:1.6;color:#657569;margin:10px 0}.e2-buttons{display:flex;flex-wrap:wrap;gap:6px;margin:14px 0}.e2-buttons button:first-child{background:#215b46!important;color:white!important}
      #e2Position{width:100%;margin:14px 0;accent-color:#197659}#e2Progress{font-variant-numeric:tabular-nums}#e2State{font-size:16px;font-weight:700;margin:12px 0 4px}#e2Phases{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:14px}#e2Phases button{font-size:11px;padding:5px}#e2Phases [aria-current=step]{border-color:#197659;background:#e0f1e8}#e2Map [data-e2-stall]{cursor:pointer;stroke:#6a8073;stroke-width:35;fill:#f7f8f3}#e2Map [data-e2-stall][aria-pressed=true]{fill:#c6ead7;stroke:#197659;stroke-width:100}#e2Map [data-e2-stall]:focus{stroke:#357bbf;stroke-width:140;outline:none}
      @media(max-width:850px){#e2JourneyDialog{height:95vh;width:98vw;overflow:auto}.e2-layout{display:flex;flex-direction:column;height:auto}.e2-map{height:53vh;min-height:340px;padding:8px}.e2-controls{overflow:visible;border-left:0;border-top:1px solid #d6dfd8;padding:14px}.e2-head{padding:10px 12px}.e2-head h2{font-size:16px}}
    `;document.head.append(style);
    function pause(){playing=false;cancelAnimationFrame(frame);frame=0;last=0;if(dialog)$('e2Play').disabled=false;}
    function draw(){
      const t=current(),p=at(t,position),v=M.vehicle({...data.vehicle,clearanceMm:0,sampleMm:25});
      $('e2Car').setAttribute('points',points(M.body(p.q,v,false)));
      const q=p.q,c=Math.cos(q[2]),s=Math.sin(q[2]),tip=[[3100,0],[2200,550],[2200,-550]].map(([x,y])=>[q[0]+c*x-s*y,q[1]+s*x+c*y]);$('e2CarFront').setAttribute('points',points(tip));
      $('e2Position').value=String(Math.round(position/t.lengthMm*10000));$('e2Progress').textContent=(position/1000).toFixed(1)+' / '+(t.lengthMm/1000).toFixed(1)+' m · '+(position/t.lengthMm*100).toFixed(1)+'%';
      const status=(position>=t.lengthMm?'진출 완료':names[p.phase])+' · '+(p.gear===1?'전진':'후진');if($('e2State').textContent!==status)$('e2State').textContent=status;
      $('e2GearNow').textContent='현재까지 전후진 전환 '+p.changes+' / '+t.gearChanges+'회';
      for(const b of $('e2Phases').children)b.setAttribute('aria-current',+b.dataset.phase===p.phase?'step':'false');
    }
    function plot(t,parent,color,dash){
      const P=[];for(const c of t.segments){const n=Math.max(1,Math.ceil((c.to-c.from)/250));for(let i=0;i<=n;i++)P.push(M.advance(c.start,c.gear*(c.to-c.from)*i/n,c.curvature));}
      svgNode('polyline',{points:points(P),fill:'none',stroke:color,'stroke-width':130,'stroke-dasharray':dash,opacity:.85,'pointer-events':'none'},parent);
    }
    function choose(index){
      pause();selected=index;position=0;$('e2Stall').value=String(index);const j=data.journeys[index],before=prepared[index].before,after=prepared[index].after;
      $('e2Selected').textContent=j.id+' 경로 비교';$('e2BeforeGear').textContent=before.gearChanges+'회';$('e2AfterGear').textContent=after.gearChanges+'회';$('e2BeforeM').textContent=(before.lengthMm/1000).toFixed(1)+' m';$('e2AfterM').textContent=(after.lengthMm/1000).toFixed(1)+' m';
      const delta=(after.lengthMm-before.lengthMm)/1000,gear=before.gearChanges-after.gearChanges;
      $('e2Difference').textContent=(gear?'전후진 전환 '+gear+'회 감소':'전후진 전환 동일')+' · 거리 '+Math.abs(delta).toFixed(1)+' m '+(Math.abs(delta)<.05?'동일':delta>0?'증가':'감소');
      $('e2Previous').disabled=index===0;$('e2Next').disabled=index===49;
      for(const el of $('e2Map').querySelectorAll('[data-e2-stall]'))el.setAttribute('aria-pressed',+el.dataset.e2Stall===index?'true':'false');
      $('e2Routes').replaceChildren();plot(before,$('e2Routes'),'#c08b46','400 230');plot(after,$('e2Routes'),'#198064','');draw();
    }
    function tick(now){
      if(!playing||!dialog.open)return;position=Math.min(current().lengthMm,position+(last?Math.min(now-last,250):0)*2*Number($('e2Speed').value));last=now;draw();
      if(position>=current().lengthMm)pause();else frame=requestAnimationFrame(tick);
    }
    function play(){pause();if(position>=current().lengthMm)position=0;playing=true;$('e2Play').disabled=true;frame=requestAnimationFrame(tick);}
    function create(){
      data=window.E2JourneyData;prepared=prepare(data);dialog=document.createElement('dialog');dialog.id='e2JourneyDialog';dialog.setAttribute('aria-labelledby','e2Title');
      dialog.innerHTML=`<header class="e2-head"><div><h2 id="e2Title">E2 · 주차칸별 전체 경로 비교</h2><p>고정 배치 50칸 · 주차칸을 선택하고 램프 진입부터 진출까지 재생하세요.</p></div><button id="e2Close" type="button" aria-label="E2 체험 닫기">닫기</button></header>
        <div class="e2-layout"><div class="e2-map"><svg id="e2Map" role="group" aria-label="E2 고정 주차 배치 · 주차칸 선택"></svg><p class="e2-legend"><span>점선: 기존 경로</span><b>실선: 개선 경로</b><i>채운 칸: 선택</i></p></div>
        <section class="e2-controls" aria-label="E2 경로 선택과 재생"><h3 id="e2Selected"></h3><label for="e2Stall">주차칸 선택</label><div class="e2-select"><button id="e2Previous" type="button" aria-label="이전 주차칸">←</button><select id="e2Stall"></select><button id="e2Next" type="button" aria-label="다음 주차칸">→</button></div>
        <table aria-label="선택 주차칸의 전체 왕복 경로 비교"><thead><tr><th scope="col">전체 왕복</th><th scope="col">기존</th><th scope="col">개선</th></tr></thead><tbody><tr><th scope="row">전후진 전환</th><td id="e2BeforeGear"></td><td id="e2AfterGear"></td></tr><tr><th scope="row">거리</th><td id="e2BeforeM"></td><td id="e2AfterM"></td></tr></tbody></table><p id="e2Difference" class="e2-note"></p>
        <label for="e2Version">재생할 경로</label><select id="e2Version"><option value="after">개선 경로</option><option value="before">기존 경로</option></select><div class="e2-buttons"><button id="e2Play" type="button">재생</button><button id="e2Pause" type="button">일시정지</button><button id="e2Restart" type="button">처음으로</button></div>
        <p id="e2State" role="status" aria-live="polite"></p><p id="e2GearNow" class="e2-note"></p><label for="e2Position">여정 위치</label><input id="e2Position" type="range" min="0" max="10000" value="0" step="1"><output id="e2Progress" for="e2Position"></output><div id="e2Phases" role="group" aria-label="구간으로 이동"></div>
        <label for="e2Speed">재생 속도</label><select id="e2Speed"><option value="1">1×</option><option value="4">4×</option><option value="8" selected>8×</option><option value="16">16×</option></select><p class="e2-note">1×는 2 m/s입니다. 조작 횟수는 전진↔후진 전환을 뜻합니다. 조작을 줄이면서 거리가 늘어난 경로도 있습니다.</p>
        <p class="e2-note">고정 E2의 평면 경로 검토용입니다. 다른 칸은 모두 점유한 조건이며, 차량 4.6×1.9 m·뒷축 최소 회전반경 4.5 m·주행 여유 200 mm·주차 여유 100 mm입니다. 6m 미만 직진만으로 실패 처리하지 않았습니다. 경사·교행·보행·조향 속도·법규·실차와 전역 최소 조작은 미검증입니다.</p><p class="e2-note">현재 편집 중인 배치에 적용하거나 저장하지 않습니다. 별도 독립 검토와 사용자 확인은 대기 중입니다.</p></section></div>`;
      document.body.append(dialog);dialog.addEventListener('keydown',e=>e.stopPropagation());dialog.addEventListener('keyup',e=>e.stopPropagation());dialog.addEventListener('close',pause);dialog.addEventListener('cancel',pause);
      const map=$('e2Map'),all=[...data.fixed.mass,...data.fixed.ramp],xs=all.map(p=>p[0]),ys=all.map(p=>p[1]);map.setAttribute('viewBox',[Math.min(...xs)-2500,-Math.max(...ys)-2500,Math.max(...xs)-Math.min(...xs)+5000,Math.max(...ys)-Math.min(...ys)+5000].join(' '));
      for(const P of [data.fixed.mass])svgNode('polygon',{points:points(P),fill:'#f2f3ec',stroke:'#4d6154','stroke-width':180},map);
      for(const P of data.aisles.concat([data.fixed.ramp]))svgNode('polygon',{points:points(P),fill:'#e6eae2'},map);
      for(const P of data.fixed.columns.concat(data.fixed.cores))svgNode('polygon',{points:points(P),fill:'#52645a'},map);
      for(const r of data.ramps){const p=r.id==='R-IN'?r.start:r.end;svgNode('circle',{cx:p[0],cy:-p[1],r:240,fill:'#315c7a'},map);svgNode('text',{x:p[0],y:-p[1]-650,'text-anchor':'middle','font-size':680,fill:'#315c7a'},map).textContent=r.id==='R-IN'?'램프 진입':'램프 진출';}
      const labels=svgNode('g',{'pointer-events':'none'},null);
      for(let i=0;i<50;i++){
        const P=data.stalls[i],j=data.journeys[i];svgNode('polygon',{points:points(P),'data-e2-stall':i,role:'button',tabindex:0,'aria-label':j.id+' 주차칸 경로 비교','aria-pressed':'false'},map);
        const centre=P.reduce((s,p)=>[s[0]+p[0]/P.length,s[1]+p[1]/P.length],[0,0]);svgNode('text',{x:centre[0],y:-centre[1]+200,'text-anchor':'middle','font-size':620,fill:'#334e3d'},labels).textContent=j.id;
        const option=document.createElement('option');option.value=String(i);option.textContent=j.id;$('e2Stall').append(option);
      }
      svgNode('g',{id:'e2Routes'},map);map.append(labels);svgNode('polygon',{id:'e2Car',fill:'#164e42',stroke:'white','stroke-width':70,'pointer-events':'none'},map);svgNode('polygon',{id:'e2CarFront',fill:'white','pointer-events':'none'},map);
      for(const [i,name]of names.entries()){const b=document.createElement('button');b.type='button';b.dataset.phase=String(i);b.textContent=name;b.onclick=()=>{pause();position=current().phases[i].from;draw();};$('e2Phases').append(b);}
      function selectEvent(e){const el=e.target.closest('[data-e2-stall]');if(el)choose(+el.dataset.e2Stall);}
      map.addEventListener('click',selectEvent);map.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectEvent(e);}});
      $('e2Stall').onchange=e=>choose(+e.target.value);$('e2Previous').onclick=()=>choose(Math.max(0,selected-1));$('e2Next').onclick=()=>choose(Math.min(49,selected+1));
      $('e2Version').onchange=e=>{pause();version=e.target.value;position=0;draw();};$('e2Position').oninput=e=>{pause();position=current().lengthMm*Number(e.target.value)/10000;draw();};
      $('e2Play').onclick=play;$('e2Pause').onclick=pause;$('e2Restart').onclick=()=>{pause();position=0;draw();};$('e2Close').onclick=()=>dialog.close();
      document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});choose(0);
    }
    function open(){
      try{if(!dialog)create();if(!dialog.open)dialog.showModal();$('e2Stall').focus();}
      catch(error){if(dialog){dialog.remove();dialog=undefined;}openButton.disabled=true;const message=document.createElement('p');message.setAttribute('role','alert');message.textContent='E2 비교 자료를 열 수 없습니다. '+error.message;openButton.after(message);}
    }
    openButton.onclick=open;
    // shortcut: validated fixed E2 witnesses only; connect newly generated layouts after they have equivalent full-path evidence.
    if(new URL(location.href).searchParams.get('e2')==='1')open();
    return {open};
  }
  return {timeline,at,prepare,mount};
});
