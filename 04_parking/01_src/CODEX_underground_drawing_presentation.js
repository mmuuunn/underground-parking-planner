/* CODEX drawing presentation for underground-compare.html (curve ramp UI, 89차).
 * Based on the original drawing adapter, kept unchanged in its source file.
 * Reads the existing editor document and engine result. Does not replace solve,
 * generate, commit, snapping, history, or placement geometry.
 * Unknown core interiors and traffic directions are deliberately not invented.
 */
(() => {
  'use strict';
  const view = {inspection:false,fill:false,stoppers:true,names:true,dimensions:true,axes:true,site:false,motion:!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches};
  const original = {defs,renderEdit,drawLabels,renderPanel,setView,renderHint};
  const line = (g,a,b,attrs={}) => el('line',{x1:a[0],y1:a[1],x2:b[0],y2:b[1],stroke:'#a0a0a0','stroke-width':.55,'vector-effect':NSS,...attrs},g);
  const pathOf = polygons => polygons.map(P=>'M'+P.map(p=>p.join(',')).join('L')+'Z').join('');
  const unit = p => {const l=Math.hypot(...p)||1;return p.map(v=>v/l);};
  const average = P => P.reduce((a,p)=>add(a,mul(p,1/P.length)),[0,0]);
  const safe = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = value => Number.isFinite(value)?Math.round(value).toLocaleString('ko-KR'):'—';
  const distance = (p,a,b) => {const ab=sub(b,a),d=dot(ab,ab),t=d?Math.max(0,Math.min(1,dot(sub(p,a),ab)/d)):0;return Math.hypot(...sub(p,add(a,mul(ab,t))));};
  const label = (g,p,text,attrs={}) => {const t=el('text',{x:p[0],y:p[1],fill:'#6b6b6b','font-size':10/Math.max(scale(),.0001),'text-anchor':'middle','dominant-baseline':'middle',...attrs},g);t.textContent=text;return t;};
  const layer = (id,parent) => el('g',{id,'pointer-events':'none'},parent);
  const current = () => ui.live || ui.res;
  const visibleMass = () => planningMass(rampSpec(doc.ramp)).mass;
  // Core drawn from the engine's fitted plan (core-fit.js): filled walls with
  // openings cut out, door leaves and swings, stair treads, lift crosses.
  const ROOM_NAME={S:'계단',H:'홀',EPS:'EPS',PS:'PS'};
  function drawCorePlan(g,core,i,k){
    const p=core.plan,text=(at,value,size,color='#4a4a4a')=>{const t=el('text',{x:0,y:0,transform:`translate(${at[0]} ${at[1]}) rotate(${doc.ucs}) scale(1,-1)`,fill:color,'font-size':size/k,'text-anchor':'middle','dominant-baseline':'middle'},g);t.textContent=value;};
    const root=el('g',{'class':`ug-core-plan${p.law==='FAIL'?' ug-core-fail':''}`,'data-core-index':i,'data-core-alt':p.altId,'data-core-entrance':p.facing,'data-core-law':p.law||'NOT_CHECKED'},g);
    el('polygon',{points:pts(p.walk),fill:'none',stroke:'#7aa7d8','stroke-width':.6,'stroke-dasharray':'3 2','vector-effect':NSS},root);
    for(const room of p.rooms)el('polygon',{points:pts(room.pts),fill:'#fbfbf9',stroke:'none'},root);
    for(const l of p.stair)el('polyline',{points:pts(l),fill:'none',stroke:'#8e8e8e','stroke-width':.45,'vector-effect':NSS},root);
    const named=new Set();
    for(const room of p.rooms){
      const P=room.pts,c=average(P),lift=/^E\d/.test(room.kind);
      if(lift){line(root,P[0],P[2],{stroke:'#7d7d7d','stroke-width':.5});line(root,P[1],P[3],{stroke:'#7d7d7d','stroke-width':.5});text(c,'EV',9,'#3d3d3d');continue;}
      const area=Math.abs((P[2][0]-P[0][0])*(P[2][1]-P[0][1]));if(named.has(room.kind)||area<2.5e6||!ROOM_NAME[room.kind])continue;
      named.add(room.kind);text(c,ROOM_NAME[room.kind],7,'#5d5d5d');
    }
    el('path',{d:pathOf(p.walls),fill:'#2a2a2a','fill-rule':'evenodd',stroke:'none'},root);
    for(const o of p.openings){
      const u=unit(sub(o.b,o.a)),w=Math.hypot(...sub(o.b,o.a)),n=mul([-u[1],u[0]],o.side||1),arc=(h,l,dir)=>{const tip=add(h,mul(n,l)),end=add(h,mul(dir,l));
        line(root,h,tip,{stroke:'#3a3a3a','stroke-width':.8});el('path',{d:`M${tip[0]},${tip[1]} A${l},${l} 0 0 ${((n[0]*dir[1]-n[1]*dir[0])>0)?1:0} ${end[0]},${end[1]}`,fill:'none',stroke:'#8a8a8a','stroke-width':.45,'vector-effect':NSS},root);};
      if(o.type==='slide'){for(const [off,t0,t1] of [[-60,0,.55],[60,.45,1]])line(root,add(add(o.a,mul(u,w*t0)),mul(n,off)),add(add(o.a,mul(u,w*t1)),mul(n,off)),{stroke:'#4a4a4a','stroke-width':.7});continue;} // 두 짝이 가운데서 겹치는 미닫이
      if(o.type==='open'){arc(o.a,w/2,u);arc(o.b,w/2,mul(u,-1));continue;} // entrance: double leaf
      arc(o.a,w,u);
    }
    el('title',{},root).textContent=`코어 ${i+1} · 2판 ${p.altId}안 · 입구 ${p.facing}쪽 · 벽 ${p.wallMm}mm · 벽 속 기둥 ${p.columnsInWall}개(모서리 ${p.columnsAtCorner||0})${p.growMm&&(p.growMm[0]||p.growMm[1])?` · 기둥 면까지 키움 ${p.growMm.map(g=>(g/1000).toFixed(2)).join("×")}m`:""}${p.columnsInRoom?` · 방 안 기둥 ${p.columnsInRoom}개(구조 검토)`:''}${p.entranceReachesAisle?'':' · 입구 앞 차로 없음'}`;
  }
  // 98-5 캔버스 편집(사용자: 모든 조정은 도면 위에서): 문 손잡이(벽을 따라 끌기), 입구 방향(↻ 누르면 다음 변, Alt+누르면 자동), EV 칩(누르면 자동→1→2→3→4대)
  function drawCoreHandles(g){
    const sel=ui.sel?.kind==='core'?ui.sel.i:-1,r=current(),c=r&&!r.fail?r.cores?.[sel]:null;if(!c?.plan||ui.drag)return;
    const k=Math.max(scale(),.0001),p=c.plan,core=doc.cores[sel],up=(at,txt,size,attrs)=>{const t=el('text',{x:0,y:0,transform:`translate(${at[0]} ${at[1]}) rotate(${doc.ucs}) scale(1,-1)`,'font-size':size/k,'text-anchor':'middle','dominant-baseline':'central',...attrs},g);t.textContent=txt;return t;};
    const tag=(e,data)=>{for(const [a,v] of Object.entries(data))e.dataset[a]=v;return e;};
    for(const o of p.openings){
      if(o.type!=='open'&&o.type!=='slide')continue;
      const m=mul(add(o.a,o.b),.5),u=unit(sub(o.b,o.a)),base=(core.doors||{})[o.id]||(o.id==='ENT'?core.doorMm||0:0),data={cdoor:o.id,ci:sel,ux:u[0],uy:u[1],base};
      tag(el('circle',{cx:m[0],cy:m[1],r:11/k,fill:'transparent',style:'cursor:grab'},g),data);
      const h=tag(el('circle',{cx:m[0],cy:m[1],r:4.5/k,fill:'#fff',stroke:'#2f7bd8','stroke-width':1.6,'vector-effect':NSS,style:'cursor:grab'},g),data);
      el('title',{},h).textContent=o.id==='ENT'?'출입문 — 벽을 따라 끌어 옮기기':'승강기 문 — 벽을 따라 끌어 옮기기';
    }
    const ent=p.openings.find(o=>o.id==='ENT');
    if(ent){const m=mul(add(ent.a,ent.b),.5),cc=average(c.pts),out=unit(sub(m,cc)),at=add(add(m,mul(out,22/k)),mul(unit(sub(ent.b,ent.a)),-26/k));
      const b=tag(el('circle',{cx:at[0],cy:at[1],r:9/k,fill:'#fff',stroke:'#2f7bd8','stroke-width':1.2,'vector-effect':NSS,style:'cursor:pointer'},g),{cface:sel,cur:p.facing});
      tag(up(at,'↻',11,{fill:'#2f7bd8',style:'cursor:pointer'}),{cface:sel,cur:p.facing});
      el('title',{},b).textContent=`입구 방향 ${core.facing?'고정':'자동'} — 누르면 다음 변으로, Alt+누르면 자동`;}
    const L=c.pts.map(q=>rot(q,-doc.ucs)),x0=Math.min(...L.map(q=>q[0])),y0=Math.min(...L.map(q=>q[1])),at=rot([x0+46/k,y0-14/k],doc.ucs);
    const ev=core.ev??'auto',txt=`EV ${ev==='auto'?'자동 · ':''}${p.evCount||1}대 ▸`,w=74/k,h=15/k,ul=rot([x0+46/k-w/2,y0-14/k-h/2],doc.ucs);
    const chip=tag(el('rect',{x:0,y:0,width:w,height:h,rx:3/k,transform:`translate(${ul[0]} ${ul[1]}) rotate(${doc.ucs})`,fill:'#fff',stroke:'#2f7bd8','stroke-width':1,'vector-effect':NSS,style:'cursor:pointer'},g),{cev:sel});
    tag(up(at,txt,8.5,{fill:'#2f7bd8','font-weight':600,style:'cursor:pointer'}),{cev:sel});
    el('title',{},chip).textContent='승강기 대수 — 누르면 자동 → 1 → 2 → 3 → 4대';
  }
  function drawCoreInteriors(g){
    const k=Math.max(scale(),.0001);
    const r=current(),plans=r&&!r.fail?r.cores||[]:[];
    const roomLabel=(p,value,color='#42525b')=>{const t=el('text',{x:0,y:0,transform:`translate(${p[0]} ${p[1]}) scale(1,-1)`,fill:color,'font-size':8/k,'text-anchor':'middle','dominant-baseline':'middle','pointer-events':'none'},g);t.textContent=value;};
    doc.cores.forEach((core,i)=>{
      if(plans[i]?.plan)return drawCorePlan(g,plans[i],i,k);
      roomLabel(core.c,'선택한 코어 구성이 들어갈 크기를 확보하세요','#a05237');
    });
  }

  // Vehicle path: ring centreline filleted with the turning radius, thin chevrons in
  // the proposed one-way direction (right turn from the ramp); the ramp's two lanes
  // as entering (into this floor) and leaving; two-way inner lanes plain dashed.
  function drawCirculation(route,r){
    const C=r&&!r.fail&&r.circulation;if(!C)return;
    const BLUE='#2f7bd8',RED='#c0563a',checked=UGPlanningUI.routes(r),moving=view.motion&&checked?.entry.state==='clear'&&checked?.exit.state==='clear';
    const chevron=(c,u,color)=>{const n=[-u[1],u[0]];el('polyline',{points:pts([add(add(c,mul(u,-550)),mul(n,420)),add(c,mul(u,250)),add(add(c,mul(u,-550)),mul(n,-420))]),fill:'none',stroke:color,'stroke-width':1.1,'vector-effect':NSS},route);};
    // A chevron every `step` mm of path length, the first at `first`.
    const along=(P,closed,color,step,first)=>{const Q=closed?P.concat([P[0]]):P;let next=first;
      for(let i=1;i<Q.length;i++){const a=Q[i-1],b=Q[i],L=Math.hypot(...sub(b,a));if(L<1)continue;const u=mul(sub(b,a),1/L);for(;next<=L;next+=step)chevron(add(a,mul(u,next)),u,color);next-=L;}};
    // Use the supplied rounded path without drawing a solid line beneath it.
    const poly=(P,closed,color,extra={})=>el('path',{d:'M'+P.map(p=>p.join(',')).join('L')+(closed?'Z':''),fill:'none',stroke:color,'stroke-width':1.1,'stroke-linejoin':'round','vector-effect':NSS,...extra},route);
    const dashed=(P,closed,color)=>poly(P,closed,color,{'class':moving?'ug-flow':'ug-route-static','stroke-dasharray':'4 12','stroke-linecap':'round','data-flow-path':'true'});
    C.loops.forEach(P=>{dashed(P,true,BLUE);along(P,true,BLUE,12000,6000);});
    for(const [P,name,color] of [[C.entry,'진입 ↓ B1',BLUE],[C.exit,'진출 ↑',RED]]){
      if(!P||P.length<2)continue;
      dashed(P,false,color);along(P,false,color,6000,2500);
      // Label at the ramp's upper end: the start of 진입, the end of 진출.
      const e=name.startsWith('진입')?[P[0],P[1]]:[P[P.length-1],P[P.length-2]],tag=add(e[0],mul(unit(sub(e[1],e[0])),-2200));
      const t=el('text',{x:0,y:0,transform:`translate(${tag[0]} ${tag[1]}) rotate(${doc.ucs}) scale(1,-1)`,fill:color,'font-size':9/Math.max(scale(),.0001),'font-weight':600,'text-anchor':'middle','dominant-baseline':'middle'},route);t.textContent=name;
    }
    for(const [a,b] of C.lanes)poly([a,b],false,BLUE,{'stroke-dasharray':'2 3',opacity:.8});
    for(const t of C.tight){const c=el('circle',{cx:t.at[0],cy:t.at[1],r:1800,fill:'none',stroke:'#d23c3c','stroke-width':1.4,'vector-effect':NSS},route);el('title',{},c).textContent=`회전 여유 부족 — 이 꺾임에 들어가는 회전 반경 ${(t.radiusMm/1000).toFixed(1)}m (기준 ${(C.turnRadiusMm/1000).toFixed(0)}m)`;}
    if(!checked||!view.motion)return;
    const slice=(P,start,end)=>{const Q=[];let passed=0;for(let i=1;i<P.length;i++){const a=P[i-1],d=sub(P[i],a),L=Math.hypot(...d);if(!L)continue;const lo=Math.max(start,passed),hi=Math.min(end,passed+L);if(hi>=lo){for(const s of [lo,hi]){const p=add(a,mul(d,(s-passed)/L));if(!Q.length||Math.hypot(...sub(p,Q.at(-1)))>1)Q.push(p);}}passed+=L;}return Q;};
    for(const [key,color] of [['entry',BLUE],['exit',RED]]){
      const v=checked[key],half=v.vehicle.lengthMm/2,P=slice(v.points,half,Math.min(v.lengthMm-half,v.stopDistanceMm));
      // This exact polyline is sampled by the calculation; do not round its corners again.
      const id='ugVehiclePath-'+key;if(P.length>1)el('path',{id,d:'M'+P.map(p=>p.join(',')).join('L'),fill:'none',stroke:'none'},route);
      const car=el('g',{'class':'ug-car','data-vehicle':key,'data-route-state':v.state,stroke:color,'stroke-width':1.1},route);
      el('path',{d:'M-1700,-900 Q-2300,-860 -2300,-400 L-2300,400 Q-2300,860 -1700,900 L1700,900 Q2300,850 2300,400 L2300,-400 Q2300,-850 1700,-900Z',fill:'#fafbf9','fill-opacity':.9},car);
      el('path',{d:'M-900,-720 L-1350,-540 L-1350,540 L-900,720 M-750,-720 H850 L1250,-560 V560 L850,720 H-750Z M850,-720 L550,-570 V570 L850,720 M-750,-720 L-550,-570 V570 L-750,720 M-500,-570 H500 M-500,570 H500 M-1800,-780 V780 M1780,-780 V780',fill:'none'},car);
      for(const x of [-1400,1400])for(const y of [-940,940])el('line',{x1:x-260,y1:y,x2:x+260,y2:y,'stroke-width':2},car);
      el('title',{},car).textContent=`${key==='entry'?'진입':'진출'} 차량 · ${v.state==='clear'?'제안 경로 재생':v.state==='blocked'?'첫 문제 앞에서 정지':'연결 확인 필요 · 정지'} · 평면 차체 확인`;
      if(P.length<2){const p=v.points[0]||r.ramp?.landing;if(p){const u=unit(sub(v.points[1]||add(p,[1,0]),p)),at=add(p,mul(u,half));car.setAttribute('transform',`translate(${at[0]} ${at[1]}) rotate(${Math.atan2(u[1],u[0])*180/Math.PI})`);}continue;}
      const duration=Math.max(4,(Math.min(v.lengthMm-half,v.stopDistanceMm)-half)/3500);
      const am=el('animateMotion',{dur:duration.toFixed(2)+'s',repeatCount:v.state==='blocked'?'1':'indefinite',fill:'freeze',rotate:'auto'},car);el('mpath',{href:'#'+id},am);
    }
  }

  defs = function(s) {
    original.defs(s);
    s.querySelector('#dryHatch')?.remove();
    const d=s.querySelector('defs'), pattern=el('pattern',{id:'rampHatch',width:600,height:600,patternUnits:'userSpaceOnUse'},d);
    el('line',{x1:0,y1:0,x2:0,y2:600,stroke:'#d8d8d8','stroke-width':25},pattern);
    // DA (dry area): fine diagonal hatch, lighter than the earth outside.
    const da=el('pattern',{id:'daHatch',width:700,height:700,patternUnits:'userSpaceOnUse',patternTransform:'rotate(-45)'},d);
    el('line',{x1:0,y1:0,x2:0,y2:700,stroke:'#9a9a9a','stroke-width':22},da);
    const earth=el('pattern',{id:'earthHatch',width:1300,height:1300,patternUnits:'userSpaceOnUse',patternTransform:'rotate(45)'},d);
    el('line',{x1:0,y1:0,x2:0,y2:1300,stroke:'#acacac','stroke-width':25,opacity:.35},earth);
    const clip=el('clipPath',{id:'aisleSurfaceClip'},d);
    const r=current();if(r&&!r.fail)el('path',{d:pathOf(r.aisles||[]),'clip-rule':'nonzero'},clip);
  };

  function updateGround(){
    const g=$('drawingGround');if(!g)return;
    const mass=visibleMass(),b=bbox(mass.map(toU)),pad=5500;
    const outer=[[b[0]-pad,b[1]-pad],[b[2]+pad,b[1]-pad],[b[2]+pad,b[3]+pad],[b[0]-pad,b[3]+pad]].map(fromU);
    g.innerHTML='';
    for(const fill of ['#787878','url(#earthHatch)'])el('path',{d:pathOf([outer,...planningMass(rampSpec(doc.ramp)).floorPaths]),fill,'fill-rule':'evenodd'},g);
  }

  // The front is inferred only to choose the illustrated opening / wheel stops.
  // This does not alter the stall or certify its actual access.
  function stallFront(P,r) {
    const lengths=P.map((p,i)=>Math.hypot(...sub(P[(i+1)%P.length],p)));
    const shortest=Math.min(...lengths);let best=0,dist=Infinity;
    P.forEach((p,i)=>{if(lengths[i]>shortest+30)return;const m=mul(add(p,P[(i+1)%P.length]),.5);
      for(const e of r.graph?.edges||[]){const a=r.graph.nodes[e.a]?.p,b=r.graph.nodes[e.b]?.p;if(!a||!b)continue;const d=distance(m,a,b);if(d<dist){dist=d;best=i;}}
    });return best;
  }

  function drawStallMark(g,st,r,front){
    const P=st.pts,a=P[front],b=P[(front+1)%4],u=unit(sub(b,a)),v=unit(sub(average(P),mul(add(a,b),.5))),w=Math.hypot(...sub(b,a)),depth=Math.hypot(...sub(P[(front+3)%4],a));
    const to=(x,y)=>add(add(a,mul(u,x)),mul(v,y));
    if(st.stallType==='accessible'){
      const band=800,quad=[to(w-band,0),to(w,0),to(w,depth),to(w-band,depth)];
      const clipId='acc-hatch-'+g.querySelectorAll('[data-accessible-symbol]').length,cp=el('clipPath',{id:clipId},g);el('polygon',{points:pts(quad)},cp);
      const hatch=el('g',{'clip-path':`url(#${clipId})`},g);for(let y=-band;y<depth+band;y+=450)line(hatch,to(w-band,y),to(w,y+band),{stroke:'#7ea5ce','stroke-width':.6});
      line(g,to(w-band,0),to(w-band,depth),{stroke:'#7ea5ce','stroke-width':.65});
      const c=to((w-band)/2,depth*.53),icon=el('g',{transform:`translate(${c[0]} ${c[1]}) rotate(${doc.ucs}) scale(13,-13)`,'data-accessible-symbol':'true',fill:'none',stroke:'#5b86b8','stroke-width':5.5,'stroke-linejoin':'round','stroke-linecap':'round'},g);
      el('circle',{cx:4,cy:-31,r:7,fill:'#5b86b8',stroke:'none'},icon);
      el('path',{d:'M2,-18L4,7H26L38,30M3,-10H20M-4,0A23,23 0 1 0 20,27'},icon);el('title',{},icon).textContent='장애인 주차 · 승하차 여유 표시 · 보행 접근은 별도 검토';return;
    }
    const tags=[];if(st.stallType==='compact')tags.push('경형');if(st.stallType==='expanded')tags.push('확장');
    for(const [key,name]of [['charging','충전'],['electric','전기'],['family','가족'],['women','여성']])if(st.uses?.includes(key)&&!(key==='electric'&&st.uses.includes('charging')))tags.push(name);
    if(!tags.length)return;
    const c=average(P),color=st.uses?.some(x=>x==='electric'||x==='charging')?'#567f70':'#77706b';
    const t=el('text',{x:0,y:0,transform:`translate(${c[0]} ${c[1]}) rotate(${doc.ucs}) scale(1,-1)`,'font-size':Math.min(550,w*.21),fill:color,'text-anchor':'middle','dominant-baseline':'central','data-stall-mark':st.stallType||'normal'},g);t.textContent=tags.join(' · ');
    if(st.uses?.includes('charging')){const at=add(c,rot([0,950],doc.ucs)),bolt=el('g',{transform:`translate(${at[0]} ${at[1]}) rotate(${doc.ucs}) scale(25,25)`,'data-charging-symbol':'true'},g);el('path',{d:'M3,16L-9,-2H0L-3,-16L10,3H1Z',fill:'none',stroke:color,'stroke-width':1.1,'vector-effect':NSS},bolt);}
  }

  drawResult = function(g,r) {
    if(!r||r.fail)return;
    const floor=layer('drawingFloor',g), rooms=layer('drawingRoomSuggestions',g), stalls=layer('drawingStalls',g), diagnostic=layer('drawingDiagnostics',g);
    // Route hierarchy is derived from the supplied edge kinds, never from an
    // invented traffic direction. Clip all emphasis to the actual aisle surface.
    el('path',{d:pathOf(r.aisles||[]),fill:'#f1f1f1','fill-rule':'nonzero'},floor);
    const routes=el('g',{'clip-path':'url(#aisleSurfaceClip)','data-route-hierarchy':'true'},floor);
    const clip=$('aisleSurfaceClip');if(clip){clip.innerHTML='';el('path',{d:pathOf(r.aisles||[]),'clip-rule':'nonzero'},clip);}
    for(const e of r.graph?.edges||[]){
      const a=r.graph.nodes[e.a]?.p,b=r.graph.nodes[e.b]?.p;if(!a||!b||!e.reached)continue;
      const primary=e.kind==='ramp',ring=e.kind==='ring';
      if(primary||ring)line(routes,a,b,{stroke:primary?'#cacaca':'#e3e3e3','stroke-width':r.grid.aisleMm*1.06,'vector-effect':'none','stroke-linecap':'square'});
      if(primary)line(routes,a,b,{stroke:'#969696','stroke-width':.9,'stroke-dasharray':'8 5'});
    }
    // The underlying floor remains tinted even for tiny gaps omitted from the
    // engine's filtered dry polygons. Actual stalls are always painted opaque.
    if(view.inspection)el('path',{d:pathOf(r.aisles||[]),fill:'#f3f3f3','fill-rule':'nonzero',stroke:'#dcdcdc','stroke-width':.5,'vector-effect':NSS},floor);
    // Leftover space by use (engine leftover): DA hatched, leftover-room candidates dashed with area.
    UGPlanningUI.drawZones(rooms,r);
    const dead=new Set((r.deadSide||[]).map(P=>JSON.stringify(P)));
    for(const st of r.stalls||[]){
      const P=st.pts;if(P.length!==4)continue;const front=stallFront(P,r);
      const warn=view.inspection&&dead.has(JSON.stringify(P));
      const acc=st.stallType==='accessible';
      el('polygon',{points:pts(P),fill:acc?'#e3eefb':warn?'#e8e8e8':view.fill?'#f2f2f2':'#ffffff'},stalls);
      drawStallMark(stalls,st,r,front);
      P.forEach((p,i)=>line(stalls,p,P[(i+1)%4],{stroke:warn?'#939393':i===front?'#e2e2e2':'#919191','stroke-width':i===front?.35:.6}));
      if(view.stoppers){
        const back=(front+2)%4,p=P[back],q=P[(back+1)%4],u=unit(sub(q,p)),towards=unit(sub(average(P),mul(add(p,q),.5)));
        for(const t of [.27,.73]){const c=add(add(p,mul(sub(q,p),t)),mul(towards,400));line(stalls,add(c,mul(u,-180)),add(c,mul(u,180)),{stroke:'#a1a1a1','stroke-width':1.6});}
      }
    }
    if(view.inspection){
      for(const e of r.graph?.edges||[]){const a=r.graph.nodes[e.a]?.p,b=r.graph.nodes[e.b]?.p;if(!a||!b)continue;
        line(diagnostic,a,b,{stroke:!e.reached?'#adadad':e.onCycle?'#8d8d8d':'#888888','stroke-width':e.onCycle?.8:1,'stroke-dasharray':'5 4'});
      }
      for(const p of r.graph?.deadEnds||[])el('circle',{cx:p[0],cy:p[1],r:1700,fill:'#efefef',stroke:'#8e8e8e','stroke-width':.8,'vector-effect':NSS},diagnostic);
      for(const P of r.lost||[])el('polygon',{points:pts(P),fill:'none',stroke:'#bababa','stroke-width':.5,'stroke-dasharray':'3 3','vector-effect':NSS},diagnostic);
    }
    const walls=layer('drawingWalls',g);
    for(const occupant of r.occupants||[])el('polygon',{points:pts(occupant.pts),fill:'#ededed',stroke:'#555555','stroke-width':1.2,'vector-effect':NSS},walls);
    if(r.innerOutline?.length){
      el('path',{d:pathOf((r.planningBoundary?.floorPaths||[r.planMass||doc.mass]).concat(r.parkingInnerPaths||[r.innerOutline])),fill:'#393939','fill-rule':'evenodd',stroke:'none'},walls);
      el('polygon',{points:pts(r.innerOutline),fill:'none',stroke:'#393939','stroke-width':.65,'vector-effect':NSS},walls);
    }
    for(const P of r.columns||[])el('polygon',{points:pts(P),fill:'#353535',stroke:'none'},walls);
  };

  drawRamp = function(g,spec,pick){
    if(spec.kind==='curve'){
      const details=layer('curveRampDetails',g);
      if(!spec.body){
        const p=doc.ramp.p,marker=el('circle',{cx:p[0],cy:p[1],r:600,fill:'#f8f8f8',stroke:'#a65a39','stroke-width':2,'vector-effect':NSS},g);
        if(pick){marker.dataset.ramp='1';marker.style.cursor='move';}
        line(details,add(p,[-400,-400]),add(p,[400,400]),{stroke:'#a65a39','stroke-width':1.2});
        line(details,add(p,[-400,400]),add(p,[400,-400]),{stroke:'#a65a39','stroke-width':1.2});
        return;
      }
      const p=el('polygon',{points:pts(spec.body),fill:'#f2f1ee',stroke:ui.sel?.kind==='ramp'?'#555':'#999','stroke-width':.7,'vector-effect':NSS,'data-curve-body':'true'},g);
      if(pick){p.dataset.ramp='1';p.style.cursor='move';}
      // Put all the measured lines above the body, without blocking dragging.
      g.appendChild(details);
      const polyline=(points,name,attrs={})=>{if(!points?.length)return;el('polyline',{points:pts(points),fill:'none',stroke:'#888','stroke-width':.7,'vector-effect':NSS,'data-ramp-line':name,...attrs},details);};
      for(const side of ['inner','outer']){
        const curb=spec.curbs[side];
        if(curb.trafficSide)el('polygon',{points:pts(curb.wallSide.concat(curb.trafficSide.slice().reverse())),fill:'#d2d3d4',stroke:'none'},details);
      }
      const a=spec.curbs.inner.wallSide,b=spec.curbs.outer.wallSide;
      for(let i=1;i<a.length-1;i++)line(details,a[i],b[i],{stroke:'#dddcd8','stroke-width':.4});
      polyline(spec.innerWall,'inner-wall',{stroke:'#424242','stroke-width':1.3});
      polyline(spec.outerWall,'outer-wall',{stroke:'#424242','stroke-width':1.3});
      for(const side of ['inner','outer']){
        polyline(spec.curbs[side].wallSide,side+'-curb',{stroke:'#7e8387','stroke-width':.85});
        polyline(spec.curbs[side].trafficSide,side+'-curb-traffic',{stroke:'#73797e','stroke-width':.65});
      }
      polyline(spec.laneBandCenter,'lane-band-center',{stroke:'#a8a8a8','stroke-dasharray':'6 5','stroke-width':.55});
      polyline(spec.gradeLine,'grade',{stroke:'#966325','stroke-width':1.45,'stroke-dasharray':'7 3'});
      el('circle',{cx:spec.landing[0],cy:spec.landing[1],r:220,fill:'#fff',stroke:'#555','stroke-width':1,'vector-effect':NSS},details);
      UGPlanningUI.highlightRamp(details,spec);
      return;
    }
    const rs=rampBody(spec),p=el('polygon',{points:pts(rs.body),fill:'#f8f8f8',stroke:ui.sel?.kind==='ramp'?'#6e6e6e':'#959595','stroke-width':ui.sel?.kind==='ramp'?1.5:.7,'vector-effect':NSS},g);
    if(pick){p.dataset.ramp='1';p.style.cursor='move';}
    const landing=spec.landing||[spec.x,spec.y],u=unit(sub(landing,rs.start)),n=[-u[1],u[0]],h=spec.widthMm/2;
    const hatch=layer('drawingRampLines',g);
    for(let t=650;t<spec.lengthMm-650;t+=650){const c=add(rs.start,mul(u,t));line(hatch,add(c,mul(n,-h+160)),add(c,mul(n,h-160)),{stroke:'#d8d8d8','stroke-width':.45});}
    const a=add(rs.start,mul(u,spec.lengthMm*.23)),b=add(rs.start,mul(u,spec.lengthMm*.77));
    // Arrow depicts only the ramp's supplied landing direction, not aisle traffic.
    line(hatch,a,b,{stroke:'#898989','stroke-width':.75});
    line(hatch,b,add(add(b,mul(u,-600)),mul(n,300)),{stroke:'#898989','stroke-width':.75});
    line(hatch,b,add(add(b,mul(u,-600)),mul(n,-300)),{stroke:'#898989','stroke-width':.75});
  };

  renderPlan = function(){
    svg.innerHTML='';defs(svg);
    const g=el('g',{id:'content',transform:`scale(1,-1) rotate(${-doc.ucs})`},svg);
    layer('drawingGround',g);updateGround();
    el('polygon',{id:'drawingSite',points:pts(SITE),fill:'none',stroke:'#bababa','stroke-width':.65,'stroke-dasharray':'12 4 2 4','vector-effect':NSS,display:view.site?'':'none','pointer-events':'none'},g);
    el('path',{id:'massFill',d:pathOf(planningMass(rampSpec(doc.ramp)).floorPaths),fill:'#d6d6d6','fill-rule':'nonzero','pointer-events':'none'},g);
    drawResult(layer('Lres',g),ui.res);
    el('g',{id:'Ledit'},g);layer('Llab',svg);layer('Lguide',svg);ui.g=g;renderEdit();
  };

  renderEdit = function(){
    original.renderEdit();
    const fill=$('massFill');if(fill){fill.setAttribute('d',pathOf(planningMass(rampSpec(doc.ramp)).floorPaths));fill.removeAttribute('points');}
    updateGround();
    const edit=$('Ledit');if(!edit)return;
    drawCoreInteriors(layer('drawingCoreInteriors',edit));
    drawCoreHandles(el('g',{id:'coreHandles'},edit));
    // Above the ramp and cores so the ramp lanes stay readable.
    drawCirculation(layer('drawingCirculation',edit),current());
    { const ig=layer('drawingIssues',edit);ig.removeAttribute('pointer-events');drawIssues(ig,current());ig.querySelectorAll('polygon,text').forEach(e=>e.setAttribute('pointer-events','none'));renderIssuePop(); }
    const selected=ui.sel&&['mass','edge','vtx'].includes(ui.sel.kind);
    const outline=edit.querySelector('polygon:not([data-mass])');
    if(outline){outline.setAttribute('stroke',selected?'#6e6e6e':'#393939');outline.setAttribute('stroke-width',selected?1.5:.8);}
    // With a fitted core plan the box is only the size limit (still the drag handle): faint dashed outline.
    const fitted=current()?.cores||[];
    edit.querySelectorAll('[data-core]').forEach(p=>{const on=ui.sel?.kind==='core'&&ui.sel.i===+p.dataset.core,plan=fitted[+p.dataset.core]?.plan;
      p.setAttribute('fill',plan?'#ffffff':'#f4f4f4');p.setAttribute('fill-opacity',plan?'0.01':'1');p.setAttribute('stroke',plan?(on?'#6e6e6e':'#a8a8a8'):'#4b4b4b');p.setAttribute('stroke-width',plan?(on?1.2:.7):on?1.8:1.5);if(plan)p.setAttribute('stroke-dasharray','6 4');else p.removeAttribute('stroke-dasharray');});
    // The original editor calls the replaced drawLabels; do not run it twice.
  };

  const axisEdit={active:false,drag:null,entry:null};
  const axisButton=document.createElement('button');axisButton.id='editStructureCanvas';axisButton.className='mini-btn';axisButton.textContent='구조 편집';axisButton.setAttribute('aria-pressed','false');$('tools').after(axisButton);
  const sheet=svg.closest('.sheet-area'),axisGuide=document.createElement('div');axisGuide.id='axisCanvasGuide';axisGuide.className='axis-canvas-guide';axisGuide.hidden=true;axisGuide.setAttribute('role','status');sheet.append(axisGuide);
  const axisForm=document.createElement('form');axisForm.id='axisDimensionEditor';axisForm.className='axis-dimension-editor';axisForm.hidden=true;
  axisForm.innerHTML='<label for="axisDimensionValue" id="axisDimensionLabel"></label><div class="row"><input id="axisDimensionValue" type="number" step="0.001" min="0.6" required><span>m</span><button type="submit">적용</button><button type="button" id="cancelAxisDimension">취소</button></div><p id="axisDimensionRule"></p><p id="axisDimensionError" role="alert"></p>';sheet.append(axisForm);
  const axisHelp=message=>{axisGuide.textContent=message||'축 이름 드래그 · 치수 클릭으로 간격 입력 · Esc 취소'+(doc.columnAxes?'':' · 처음 적용하면 모든 축 교점을 기둥으로 고정');};
  function closeAxisEntry(){axisEdit.entry=null;axisForm.hidden=true;}
  function cancelAxisDrag(){const d=axisEdit.drag;axisEdit.drag=null;if(d&&svg.hasPointerCapture(d.pointerId))svg.releasePointerCapture(d.pointerId);drawLabels();axisHelp();}
  axisButton.onclick=()=>{
    if(ui.busy||ui.drag)return;
    cancelAxisDrag();closeAxisEntry();axisEdit.active=!axisEdit.active;axisButton.setAttribute('aria-pressed',String(axisEdit.active));axisButton.textContent=axisEdit.active?'구조 편집 완료':'구조 편집';axisGuide.hidden=!axisEdit.active;
    if(axisEdit.active){setTool('select');ui.sel=null;view.axes=true;$('axesToggle').checked=true;axisHelp();}renderEdit();
  };
  function showAxisEntry(axis,index,target){
    try{
      const axes=UGPlanningUI.structure.axes(),key=axis.toUpperCase();if(index<1||index>=axes[axis].length)return;
      closeAxisEntry();axisEdit.entry={axis,index,axes,doc0:JSON.stringify(doc)};
      $('axisDimensionLabel').textContent=`${key}${index}–${key}${index+1} 간격`;
      $('axisDimensionValue').value=Number(((axes[axis][index]-axes[axis][index-1])/1000).toFixed(3));
      $('axisDimensionRule').textContent=`${key}${index} 고정 · ${key}${index+1}만 이동 · 다른 축은 유지`;
      $('axisDimensionError').textContent='';axisForm.hidden=false;
      const box=target.getBoundingClientRect(),area=sheet.getBoundingClientRect();
      axisForm.style.left=Math.max(8,Math.min(box.left-area.left,area.width-axisForm.offsetWidth-8))+'px';
      axisForm.style.top=Math.max(8,Math.min(box.bottom-area.top+8,area.height-axisForm.offsetHeight-8))+'px';
      $('axisDimensionValue').focus();$('axisDimensionValue').select();
    }catch(e){axisHelp(e.message);}
  }
  axisForm.onsubmit=e=>{
    e.preventDefault();const entry=axisEdit.entry;if(!entry)return;
    try{
      if(JSON.stringify(doc)!==entry.doc0)throw Error('배치가 변경됐습니다. 취소 후 치수를 다시 선택하세요.');
      const value=$('axisDimensionValue').valueAsNumber;if(!Number.isFinite(value)||value<.6)throw Error('간격은 0.6m 이상 숫자로 입력하세요.');
      const axes={x:entry.axes.x.slice(),y:entry.axes.y.slice()};axes[entry.axis][entry.index]=axes[entry.axis][entry.index-1]+Math.round(value*1000);
      UGPlanningUI.structure.apply(axes,`${entry.axis.toUpperCase()}${entry.index+1} 축 간격 변경`);closeAxisEntry();axisHelp('간격을 적용했습니다. Ctrl+Z로 되돌릴 수 있습니다.');
    }catch(error){$('axisDimensionError').textContent=error.message;}
  };
  $('cancelAxisDimension').onclick=closeAxisEntry;
  svg.addEventListener('pointerdown',e=>{
    if(!axisEdit.active||ui.busy||e.button!==0||ui.space)return;
    const span=e.target.closest('[data-axis-span]'),handle=e.target.closest('[data-axis-handle]');if(!span&&!handle)return;
    e.preventDefault();e.stopImmediatePropagation();closeAxisEntry();
    const t=span||handle,axis=t.dataset.axis,index=+t.dataset.index;
    if(span){showAxisEntry(axis,index,t);return;}
    try{const axes=UGPlanningUI.structure.axes();axisEdit.drag={axis,index,axes,start:toU(world(e)),delta:0,pointerId:e.pointerId,doc0:JSON.stringify(doc)};svg.setPointerCapture(e.pointerId);drawLabels();axisHelp(`${axis.toUpperCase()}${index+1} 이동 · 0.1m 맞춤 · Alt 자유 이동 · Esc 취소`);}catch(error){axisEdit.drag=null;axisHelp(error.message);}
  },true);
  svg.addEventListener('pointermove',e=>{
    const d=axisEdit.drag;if(!d||d.pointerId!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();
    const step=e.altKey?1:100;d.delta=Math.round((toU(world(e))[d.axis==='x'?0:1]-d.start[d.axis==='x'?0:1])/step)*step;
    drawLabels();axisHelp(`${d.axis.toUpperCase()}${d.index+1} ${(d.delta/1000).toFixed(3)}m 이동 미리보기 · 놓으면 적용 · Esc 취소`);
  },true);
  svg.addEventListener('pointerup',e=>{
    const d=axisEdit.drag;if(!d||d.pointerId!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();axisEdit.drag=null;if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);
    try{if(d.delta){if(JSON.stringify(doc)!==d.doc0)throw Error('배치가 변경되어 이동을 취소했습니다.');d.axes[d.axis][d.index]+=d.delta;UGPlanningUI.structure.apply(d.axes,`${d.axis.toUpperCase()}${d.index+1} 축 이동`);axisHelp('축 이동을 적용했습니다. Ctrl+Z로 되돌릴 수 있습니다.');}else axisHelp();}catch(error){axisHelp('적용하지 않았습니다: '+error.message);}drawLabels();
  },true);
  for(const event of ['pointercancel','lostpointercapture'])svg.addEventListener(event,()=>{if(axisEdit.drag)cancelAxisDrag();});
  svg.addEventListener('wheel',()=>{closeAxisEntry();if(axisEdit.drag)cancelAxisDrag();},true);
  window.addEventListener('blur',()=>{if(axisEdit.drag)cancelAxisDrag();});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&(axisEdit.entry||axisEdit.drag)){e.preventDefault();e.stopImmediatePropagation();closeAxisEntry();cancelAxisDrag();return;}
    if(axisEdit.drag){e.preventDefault();e.stopImmediatePropagation();return;}
    if(!axisEdit.active)return;const span=e.target.closest?.('[data-axis-span]'),handle=e.target.closest?.('[data-axis-handle]');
    if((span||handle)&&['Enter',' '].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();const t=span||handle;showAxisEntry(t.dataset.axis,Math.max(1,+t.dataset.index),t);}
  },true);
  function dimensions(g){
    const k=Math.max(scale(),.0001),M=doc.mass.map(toD),b=bbox(M),pad=23/k,tick=3/k;
    function dimension(a,b2,offset,text){
      const u=unit(sub(b2,a)),n=[-u[1],u[0]],A=add(a,mul(n,offset)),B=add(b2,mul(n,offset));
      line(g,add(a,mul(n,5/k)),add(A,mul(n,5/k)),{stroke:'#c3c3c3','stroke-width':.45});
      line(g,add(b2,mul(n,5/k)),add(B,mul(n,5/k)),{stroke:'#c3c3c3','stroke-width':.45});
      line(g,A,B,{stroke:'#b0b0b0','stroke-width':.5});
      for(const p of [A,B])line(g,add(p,mul(add(u,n),-tick)),add(p,mul(add(u,n),tick)),{stroke:'#808080','stroke-width':.75});
      const p=add(mul(add(A,B),.5),mul(n,-7/k));
      const onEarth=5500*k>34;
      label(g,p,text,{'font-size':9/k,fill:onEarth?'#f0f0f0':'#949494','paint-order':'stroke',stroke:onEarth?'#787878':'#ffffff','stroke-width':4/k,'stroke-linejoin':'round'});
    }
    if(view.dimensions){
      dimension([b[0],b[1]],[b[2],b[1]],-pad,number(b[2]-b[0]));
      dimension([b[0],b[3]],[b[0],b[1]],-pad,number(b[3]-b[1]));
      // Actual segment lengths remain on the selected / actively edited geometry.
      if(selectedMass())M.forEach((p,i)=>{const q=M[(i+1)%M.length],L=Math.hypot(...sub(q,p));if(L*k<75)return;const n=unit([q[1]-p[1],p[0]-q[0]]),mid=add(mul(add(p,q),.5),mul(n,11/k));label(g,mid,number(L),{'font-size':9/k,fill:'#8e8e8e','paint-order':'stroke',stroke:'#ffffff','stroke-width':3/k});});
    }
    const r=current();if(!view.axes||!r||r.fail&&!doc.columnAxes)return;
    const columns=r.columns||[];
    const unique=vals=>[...new Set(vals.map(v=>Math.round(v/10)*10))].sort((a,b2)=>a-b2);
    let fixed=doc.columnAxes||r.grid?.columnAxes;
    if(axisEdit.active){try{fixed=UGPlanningUI.structure.axes();}catch(e){axisHelp(e.message);}}
    if(axisEdit.drag){fixed={x:axisEdit.drag.axes.x.slice(),y:axisEdit.drag.axes.y.slice()};fixed[axisEdit.drag.axis][axisEdit.drag.index]+=axisEdit.drag.delta;}
    const xs=fixed?fixed.x:unique(columns.map(P=>toD(average(P))[0])),ys=fixed?fixed.y.map(v=>-v).reverse():unique(columns.map(P=>toD(average(P))[1]));
    const editing=axisEdit.active&&ui.tool==='select'&&!ui.drag;
    function control(grid,p,width,height,text,attrs){
      const group=el('g',{'class':'axis-canvas-control','pointer-events':'all',tabindex:0,role:'button',...attrs},grid);
      el('rect',{x:p[0]-width/2/k,y:p[1]-height/2/k,width:width/k,height:height/k,rx:5/k,fill:'#e9f2ff',stroke:'#317bc8','stroke-width':1,'vector-effect':NSS},group);
      label(group,p,text,{'font-size':11/k,fill:'#164878','pointer-events':'none'});el('title',{},group).textContent=attrs['aria-label'];return group;
    }
    function marks(values,axis){
      const grid=layer(`drawingAxes${axis}`,g),minPx=axis==='X'?36:29;
      const step=editing?1:Math.max(1,Math.ceil(values.length/(axis==='X'?14:9)));let last=-Infinity;
      values.forEach((v,i)=>{
        const showLabel=i%step===0&&v-last>=minPx/k;if(!fixed&&!showLabel)return;
        const index=axis==='Y'?values.length-i-1:i,axisName=axis.toLowerCase();
        const anchor=axis==='X'?[v,b[1]-(editing?64:52)/k]:[b[0]-(editing?85:55)/k,v];
        const end=axis==='X'?[v,b[3]+8/k]:[b[2]+8/k,v];
        line(grid,anchor,end,{stroke:fixed?'#a9b7c5':'#e0e0e0','stroke-width':fixed?.7:.4,'stroke-dasharray':'9 3 1 3','data-structural-axis':fixed?axis+(axis==='Y'?values.length-i:i+1):''});
        if(fixed&&i&&Math.abs(v-values[i-1])*k>(editing?46:36)){const p=axis==='X'?[(v+values[i-1])/2,b[1]-32/k]:[b[0]-36/k,(v+values[i-1])/2],text=`${Number((Math.abs(v-values[i-1])/1000).toFixed(3))}m`;
          if(editing){const endIndex=axis==='X'?i:index+1;control(grid,p,44,24,text,{'data-axis-span':axis,'data-structural-span':axis,'data-axis':axisName,'data-index':endIndex,'aria-label':`${axis}${endIndex}–${axis}${endIndex+1} 간격 ${text}, 클릭하여 입력`});}
          else label(grid,p,text,{'font-size':8/k,fill:'#59748d','data-structural-span':axis});}
        if(!showLabel)return;last=v;
        if(editing){control(grid,anchor,32,28,axis+(index+1),{'data-axis-handle':axis+(index+1),'data-axis':axisName,'data-index':index,'aria-label':`${axis}${index+1} 축 드래그 이동; Enter로 인접 간격 입력`,style:`cursor:${axis==='X'?'ew':'ns'}-resize`});return;}
        el('circle',{cx:anchor[0],cy:anchor[1],r:7/k,fill:'#ffffff',stroke:'#b1b1b1','stroke-width':.55,'vector-effect':NSS},grid);
        label(grid,anchor,`${axis}${axis==='Y'?values.length-i:i+1}`,{'font-size':7/k,fill:'#929292'});
      });
    }
    if(xs.length)marks(xs,'X');if(ys.length)marks(ys,'Y');
    if(axisEdit.drag){const d=axisEdit.drag,at=d.axis==='x'?0:1;for(const P of columns){if(Math.abs(toU(average(P))[at]-d.axes[d.axis][d.index])>10)continue;const points=P.map(toD).map(p=>at===0?[p[0]+d.delta,p[1]]:[p[0],p[1]-d.delta]);el('polygon',{points:pts(points),fill:'#4d9aff',stroke:'#125aaf','fill-opacity':.7,'stroke-width':2,'vector-effect':NSS,'data-axis-preview':d.axis},g);}}
    if(fixed){const at=[b[0],b[3]];line(g,[at[0]-7/k,at[1]],[at[0]+7/k,at[1]],{stroke:'#59748d'});line(g,[at[0],at[1]-7/k],[at[0],at[1]+7/k],{stroke:'#59748d'});label(g,[at[0]+30/k,at[1]+16/k],'첫 축 기준',{'font-size':8/k,fill:'#59748d'});}
  }
  const selectedMass=()=>ui.sel&&['mass','edge','vtx'].includes(ui.sel.kind);
  drawLabels = function(){
    // Preserve the editor's typed-distance, drawing and guide annotations.
    original.drawLabels();
    const g=$('Llab');if(!g)return;
    if(!ui.drag&&!ui.draw&&!ui.ghosts)g.innerHTML='';
    const k=Math.max(scale(),.0001);
    const added=layer('drawingAnnotations',g);
    dimensions(added);
    UGPlanningUI.drawZoneLabels(added,current());
    const result=current(),bound=doc.ramp.edgeBinding;
    const edgeLength=bound&&bound.index>=0&&bound.index<doc.mass.length?Math.hypot(...sub(doc.mass[(bound.index+1)%doc.mass.length],doc.mass[bound.index])):Infinity;
    const shortEdge=bound&&!curveMode()&&edgeLength<doc.ramp.len;
    // 98차 사용자 지적: 도면 가운데 안내가 작업을 가린다 — 조건부 배치는 오른쪽 '검토할 항목'과 도면 번호로만 알리고, 안 자체가 없을 때만 띄운다
    if(result&&(shortEdge||result.fail)){
      const bounds=bbox(doc.mass.map(toD)),x=(bounds[0]+bounds[2])/2,y=bounds[1]+18/k;
      const ids=new Set((result.violations||[]).map(v=>v.id));
      const advice=shortEdge?`선택한 외벽은 ${(edgeLength/1000).toFixed(1)}m로 램프 ${(doc.ramp.len/1000).toFixed(1)}m보다 짧습니다. 길이나 위치를 조정하세요.`:result.planningBoundary?.issue||result.fail||(
        ids.has('LANDING')?'램프 착지와 차로가 만나지 않습니다. 램프 끝이나 회전 방향을 조정하세요.':
        ids.has('RAMP_OFFGRID')?'램프 착지 뒤 차로까지의 꺾임을 줄이거나 연결 방향을 바꾸세요.':
        ids.has('RAMP_RULES')?'램프의 폭·반경·경사와 층고를 확인하세요.':
        ids.has('CORE_IN_AISLE')?'코어가 차로를 막습니다. 코어 자리 또는 차로 위치를 바꾸세요.':
        ids.has('STALL_NO_FRONT')?'차로와 닿지 않는 주차칸이 있습니다. 연결 차로와 주차 줄을 확인하세요.':
        ids.has('DEAD_END')?'막다른 차로가 있습니다. 순환 연결이나 끝의 회차 공간을 확인하세요.':
        '주차 배치가 성립하지 않습니다. 외곽·램프·코어 위치를 조정하세요.');
      const box=layer('drawingPlanNotice',added),w=520/k,h=(result.issues?.length?68:55)/k;
      el('rect',{x:x-w/2,y:y-h/2,width:w,height:h,rx:5/k,fill:'#fff7e9',stroke:'#bc702f','stroke-width':1.5/k},box);
      label(box,[x,y-9/k],result.status==='CONDITIONAL'&&!shortEdge?'조건부 배치 · 확인 필요':'배치 검토 필요',{'font-size':12/k,'font-weight':'700',fill:'#8e4c1d'});
      label(box,[x,y+11/k],advice,{'font-size':10/k,fill:'#5c4734'});
      if(result.issues?.length)label(box,[x,y+24/k],`도면의 빨간 번호 ${result.issues.length}곳 · 오른쪽 '검토할 항목'에서 위치 보기와 고칠 방향`,{'font-size':8.5/k,fill:'#a0442f'});
    }
    if(view.names){
      const fitted=current()?.cores||[];
      doc.cores.forEach((c,i)=>{
        // Prefer the engine's fitted core (its real outline, alternative and law result).
        const plan=fitted[i]?.plan,altId=plan?.altId,failed=plan?.law==='FAIL';
        const L=plan?fitted[i].pts.map(p=>rot(p,-doc.ucs)):null,top=toD(plan?rot([(Math.min(...L.map(p=>p[0]))+Math.max(...L.map(p=>p[0])))/2,plan.facing==='N'?Math.min(...L.map(p=>p[1]))-2200:Math.max(...L.map(p=>p[1]))],doc.ucs):add(c.c,rot([0,c.d/2],doc.ucs))); // keep the label off the entrance side
        if(failed){
          const box=layer(`coreIssue${i}`,added),w=220/k,h=34/k,y=top[1]-24/k;
          el('rect',{x:top[0]-w/2,y:y-h/2,width:w,height:h,rx:4/k,fill:'#fff4f3',stroke:'#ae4545','stroke-width':1/k},box);
          label(box,[top[0],y-7/k],`코어 ${String(i+1).padStart(2,'0')} · ${altId}안: 법규 불가`,{'font-size':10/k,fill:'#963636','font-weight':'700'});
          label(box,[top[0],y+8/k],'피난계단 방화문 없음',{'font-size':9/k,fill:'#963636'});
        }else{const corner=plan?[Math.min(...L.map(p=>p[0])),-Math.max(...L.map(p=>p[1]))-9/k]:add(top,[0,-9/k]);label(added,corner,`코어 ${String(i+1).padStart(2,'0')}${altId?` · ${altId}안${plan?.evCount>1?` · EV ${plan.evCount}`:''}`:''}`,{'font-size':9/k,fill:'#4c5c66','paint-order':'stroke',stroke:'#f3f5f5','stroke-width':3/k,...(plan?{'text-anchor':'start'}:{})});}
      });
      const spec=rampSpec(doc.ramp),rs=rampBody(spec);
      const point=spec.kind==='curve'?(spec.laneBandCenter?.[Math.floor(spec.laneBandCenter.length/2)]||doc.ramp.p):average(rs.body);
      label(added,add(toD(point),[0,12/k]),spec.kind==='curve'?'곡선 램프':'램프',{'font-size':9/k,fill:'#777','paint-order':'stroke',stroke:'#f8f8f8','stroke-width':5/k});
    }
  };

  renderStats = function(r,live){
    renderCurveReview(r);
    if(!r||r.fail){$('ptName').textContent='배치 확인 필요';$('ptSub').textContent=r?.fail||'계산 중';$('stats').innerHTML=`<p class="review-notice">${safe(r?.fail||'배치를 계산하고 있습니다.')}</p>`;$('reviewBadge').textContent='확인 필요';$('sheetSummary').textContent='배치 확인 필요';return;}
    const listed=UGPlanningUI.issues(r),issues=[...new Set([...(r.violations||[]).map(v=>v.note),...(r.warnings||[]),...listed.map(v=>v.note)])];
    const count=r.stallCount||0,per=Number.isFinite(r.perStallM2)?r.perStallM2.toFixed(1):'—';
    $('ptName').textContent=`${count}대`;$('ptSub').textContent=`${r.graph?.hasLoop?'순환 있음':'순환 확인 필요'} · ${per}㎡/대${live?' · 미리 보기':''}`;
    $('sheetSummary').textContent=`주차 ${count}대  /  실내 ${number(r.innerAreaM2)}㎡  /  기본계획`;
    $('reviewBadge').textContent=r.status==='INFEASIBLE'?'배치 성립 안 됨':issues.length?'동선 검토 필요':'기하 초안';$('reviewBadge').classList.toggle('neutral',!issues.length);
    $('stats').innerHTML=`<div class="count-row"><span class="count-number">${count}</span><span class="count-unit">대</span><span class="count-label">${live?'이동 중 미리 보기':'계획 주차대수'}</span></div>
      <dl class="metrics"><div><dt>실내 면적</dt><dd>${number(r.innerAreaM2)}<small>㎡</small></dd></div><div><dt>대당 면적</dt><dd>${per}<small>㎡ / 대</small></dd></div><div><dt>차로 폭</dt><dd>${(r.grid.aisleMm/1000).toFixed(1)}<small>m</small></dd></div><div><dt>미분류 잔여공간</dt><dd>${number(r.areas?.unassignedFreeM2)}<small>㎡</small></dd></div>${r.accessible?`<div><dt>장애인 칸</dt><dd>${r.accessible.placed}<small>대 / 목표 ${r.accessible.need}</small></dd></div>`:''}</dl>
      ${issues.length?`<details class="review-notice" open><summary>검토할 항목 ${listed.length}개${r.deadSideCount?` · 막다른 쪽 ${r.deadSideCount}대`:''}</summary>${issueItems(r)}<ul>${issues.filter(s=>!listed.some(x=>x.note===s)).map(s=>`<li>${safe(UGPlanningUI.text(s))}</li>`).join('')}</ul></details>`:'<p class="review-note">기하 배치 계산 완료 · 차량·구조 등 추가 검토 필요</p>'}`;
  };
  // Numbered issues (same numbers as the red markers on the drawing), each with
  // "show" and the fixes the engine suggests; core moves are pre-computed on demand.
  const FIX_LABEL={ramp:'램프 자리 제안',phase:'구조열 위치 비교',ucs:'격자 방향 비교',coreMove:'코어 옮길 자리',bypass:'코어 둘레 우회'};
  function issueItems(r){
    const list=UGPlanningUI.issues(r);if(!list.length)return '';
    return `<ol class="issue-list">${list.map((x,n)=>`<li data-issue="${n}"><span class="issue-no">${n+1}</span> ${UGPlanningUI.issueHtml(x,r)}<div class="issue-actions">${x.at?`<button class="mini-btn" data-act="show" data-n="${n}">위치 보기</button>`:''}${x.fixes.map(f=>`<button class="mini-btn" data-act="${f}" data-n="${n}">${FIX_LABEL[f]||f}</button>`).join('')}</div><div class="issue-moves" id="issueMoves${n}"></div></li>`).join('')}</ol>`;
  }
  function issueAct(b,movesBox){
    const r=current(),n=+b.dataset.n,x=UGPlanningUI.issues(r)[n];if(!x)return;
    const act=b.dataset.act;ui.issueFocus=n;renderEdit();
    if(act==='show')return flash(`${n+1}번 위치를 도면에 빨간색으로 표시했습니다`);
    if(act==='ramp')return $('rampSuggest')?.click();
    if(act==='phase')return $('phaseSuggest')?.click();
    if(act==='ucs')return $('ucsSuggest')?.click();
    if(act==='bypass')return $('bypassBtn')?.click();
    if(act==='coreMove'&&x.core!==undefined)withCalculationNotice(()=>{
      const box=movesBox||$('issueMoves'+n),moves=UGPlan.suggestCoreMoves(planInput(),x.core);
      if(!box)return;if(!moves.length){box.textContent='기둥 두 칸 안에서 이 문제가 없어지는 자리를 찾지 못했습니다';return;}
      box.innerHTML=moves.map((m,j)=>`<button class="mini-btn" data-move="${j}">자리 ${j+1} · ${m.stallCount}대 · ${(m.moveMm/1000).toFixed(1)}m 이동</button>`).join('');
      box.querySelectorAll('button').forEach(btn=>btn.onclick=()=>{const m=moves[+btn.dataset.move];doc.cores[x.core].c=m.c;delete doc.cores[x.core].keep;ui.issueFocus=null;commit(`코어 ${x.core+1} 옮김(제안 자리 ${+btn.dataset.move+1})`);});
    });
  }
  $('stats').addEventListener('click',e=>{const b=e.target.closest('button[data-act]');if(b)issueAct(b);});
  // 98-5 도면 위 오류 번호를 누르면 그 자리에 설명과 고칠 방향 말풍선(사용자: 오류 지점도 캔버스에서)
  function renderIssuePop(){
    let pop=$('issuePop');if(!pop){pop=document.createElement('div');pop.id='issuePop';pop.className='issue-pop';document.querySelector('main').appendChild(pop);
      pop.addEventListener('click',e=>{const b=e.target.closest('button[data-act]');if(b)issueAct(b,pop.querySelector('.issue-moves'));if(e.target.closest('[data-close]')){ui.issuePop=null;ui.issueFocus=null;renderIssuePop();renderEdit();}});}
    const r=current(),n=ui.issuePop,x=n!=null?UGPlanningUI.issues(r)[n]:null;if(!x||!x.at||ui.drag){pop.style.display='none';return;}
    const sp=svg.createSVGPoint();sp.x=x.at[0];sp.y=x.at[1];const q=sp.matrixTransform($('content').getScreenCTM()),m=document.querySelector('main').getBoundingClientRect();
    pop.style.display='block';pop.style.left=(q.x-m.left+16)+'px';pop.style.top=(q.y-m.top-10)+'px';
    pop.innerHTML=`<button class="issue-pop-close" data-close="1" aria-label="닫기">×</button><b>${n+1}</b> ${UGPlanningUI.issueHtml(x,r)}<div class="issue-actions">${x.fixes.map(f=>`<button class="mini-btn" data-act="${f}" data-n="${n}">${FIX_LABEL[f]||f}</button>`).join('')}</div><div class="issue-moves"></div>`;
  }
  svg.addEventListener('pointerdown',e=>{const t=e.target.closest?.('[data-issue-n]');if(!t)return;e.stopImmediatePropagation();ui.issuePop=+t.dataset.issueN;ui.issueFocus=ui.issuePop;renderEdit();renderIssuePop();},true);
  // Red markers on the drawing: zone outlines and a numbered circle per issue; the focused one stronger.
  function drawIssues(g,r){
    if(!r||r.fail)return;const k=Math.max(scale(),.0001),placed=[];
    UGPlanningUI.issues(r).forEach((x,n)=>{
      const on=ui.issueFocus===n,stroke='#d23c3c';
      for(const P of x.zone||[])el('polygon',{points:pts(P),fill:on?'rgba(210,60,60,.18)':'none',stroke,'stroke-width':on?1.6:.8,'stroke-dasharray':on?'':'4 3','vector-effect':NSS},g);
      for(const p of x.points||[])el('circle',{cx:p[0],cy:p[1],r:1400,fill:'none',stroke,'stroke-width':on?1.6:.8,'vector-effect':NSS},g);
      if(!x.at)return;
      let at=x.at;for(let j=0;j<12&&placed.some(p=>Math.hypot(...sub(p,at))<23/k);j++)at=add(x.at,rot([25*(1+Math.floor(j/4))/k,0],doc.ucs+j*90));placed.push(at);
      if(at!==x.at)line(g,x.at,at,{stroke,'stroke-width':.7});
      const hit=el('circle',{cx:at[0],cy:at[1],r:9/k,fill:on?stroke:'#fff',stroke,'stroke-width':1.2,'vector-effect':NSS,'pointer-events':'all',style:'cursor:pointer'},g);hit.dataset.issueN=n;el('title',{},hit).textContent='눌러서 설명·고칠 방향 보기';
      const t=el('text',{x:0,y:0,transform:`translate(${at[0]} ${at[1]}) rotate(${doc.ucs}) scale(1,-1)`,fill:on?'#fff':stroke,'font-size':10/k,'font-weight':700,'text-anchor':'middle','dominant-baseline':'central'},g);t.textContent=String(n+1);
    });
  }

  renderPanel = function(){original.renderPanel();UGPlanningUI.render(current());if($('drawingSite'))$('drawingSite').setAttribute('display',view.site?'':'none');};
  fit = function(){
    const spec=rampSpec(doc.ramp),P=(view.site?SITE.concat(doc.mass):doc.mass).concat(rampBody(spec).body);
    ui.view=fitBox(P,Math.max(svg.clientWidth,200),Math.max(svg.clientHeight,200),svg.clientWidth<600?68:108);
    // Asymmetric paper furniture: leave more room above for title and below for caption.
    const k=Math.max(svg.clientHeight/ui.view[3],.0001);
    ui.view[1]-=15/k;setView();renderEdit();
  };
  setView = function(){original.setView();if($('scalebar'))$('scalebar').title='확대·축소에 따라 바뀌는 10m 축척';};
  $('fitBtn').onclick=()=>fit();
  renderHint = function(){original.renderHint();};

  const icons={select:'M4 2 15 11 10 12 8 17Z',draw:'M3 4 14 2 17 13 6 16Z M3 4V2M14 2h2M17 13v3M6 16H3',rect:'M3 3h13v13H3Z',ucs:'M4 2v14h13M4 10l6-6M8 4h2v2'};
  const baseTools=renderTools;
  renderTools=function(){baseTools();$('tools').querySelectorAll('button').forEach((b,i)=>{const entry=TOOLS[i];if(!entry)return;b.title=`${entry[1]} (${entry[2]})`;b.setAttribute('aria-label',b.title);b.setAttribute('aria-pressed',b.classList.contains('on')?'true':'false');b.innerHTML=`<svg viewBox="0 0 20 20" aria-hidden="true"><path d="${icons[entry[0]]}"/></svg>`;});};
  function refresh(){document.body.classList.toggle('inspection',view.inspection);$('drawingMode').classList.toggle('active',!view.inspection);$('inspectionMode').classList.toggle('active',view.inspection);$('drawingMode').setAttribute('aria-pressed',String(!view.inspection));$('inspectionMode').setAttribute('aria-pressed',String(view.inspection));$('viewStatus').textContent=view.inspection?'동선 검토':'도면 보기';renderAll();}
  $('drawingMode').onclick=()=>{view.inspection=false;refresh();};$('inspectionMode').onclick=()=>{view.inspection=true;refresh();};$('inspectFromPanel').onclick=$('inspectionMode').onclick;
  if($('copyScene'))$('copyScene').onclick=()=>{const t=JSON.stringify(doc);(navigator.clipboard?.writeText(t)||Promise.reject()).then(()=>flash('현재 장면을 복사했습니다 — 대화창에 붙여 넣어 주세요'),()=>{window.prompt('아래 글을 복사하세요',t);});};
  if($('motionToggle')){$('motionToggle').checked=view.motion;}
  if($('accRate')){$('accRate').value=Number.isFinite(doc.accessibleRate)?+(doc.accessibleRate*100).toFixed(2):'';$('accRate').onchange=()=>{const v=parseFloat($('accRate').value);if(Number.isFinite(v)&&v>=0)doc.accessibleRate=v/100;else delete doc.accessibleRate;commit(`장애인 칸 비율 ${Number.isFinite(doc.accessibleRate)?(doc.accessibleRate*100)+'%':'기본 3%'}`);};}
  for(const [id,key] of [['motionToggle','motion'],['stallFillToggle','fill'],['stoppersToggle','stoppers'],['namesToggle','names'],['dimensionsToggle','dimensions'],['axesToggle','axes'],['siteToggle','site']])$(id).onchange=()=>{view[key]=$(id).checked;refresh();if(key==='site')fit();};
  function tab(appearance){$('planningPanel').hidden=appearance;$('appearancePanel').hidden=!appearance;for(const [id,active]of [['planTab',!appearance],['appearanceTab',appearance]]){$(id).classList.toggle('active',active);$(id).setAttribute('aria-selected',String(active));}}
  $('planTab').onclick=()=>tab(false);$('appearanceTab').onclick=()=>tab(true);
  document.querySelectorAll('[role=tab]').forEach(b=>b.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const next=b.id==='planTab';tab(next);$(next?'appearanceTab':'planTab').focus();}}));
  $('helpBtn').onclick=()=>{const show=document.body.classList.toggle('show-help');$('helpBtn').setAttribute('aria-expanded',String(show));};
  $('presentationBtn').onclick=()=>{if(ui.drag)return;const shown=document.body.classList.toggle('presentation');$('presentationBtn').textContent=shown?'편집 화면으로':'도면만 보기';$('presentationBtn').setAttribute('aria-pressed',String(shown));requestAnimationFrame(fit);};
  $('printBtn').onclick=()=>window.print();
  document.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='f'&&!e.ctrlKey&&!e.metaKey&&!ui.drag&&!['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)){e.preventDefault();fit();}});
  window.addEventListener('beforeprint',()=>{window.__drawingPrintView=ui.view?.slice();fit();});
  window.addEventListener('afterprint',()=>{if(window.__drawingPrintView){ui.view=window.__drawingPrintView;setView();window.__drawingPrintView=null;}});
  refresh();fit();
})();
