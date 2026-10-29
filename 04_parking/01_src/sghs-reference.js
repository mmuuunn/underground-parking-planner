// SGHS drawing observations and approximate envelopes; never survey or as-built coordinates.
'use strict';
(function(root){
  const point=(x,y)=>[Math.round((x+8.4)*1000),Math.round((y+1.2)*1000)];
  const poly=P=>P.map(p=>point(...p)),rect=(x,y,w,h)=>poly([[x,y],[x+w,y],[x+w,y+h],[x,y+h]]);
  const core=(id,x,y,w,d)=>({id,c:point(x+w/2,y+d/2),w:w*1000,d:d*1000,keep:{x:true,y:true},referenceEnvelopeOnly:true});
  const room=(id,x,y,w,d)=>({id,c:point(x+w/2,y+d/2),w:w*1000,d:d*1000});
  const referenceGrid={gx:8400,gy:9000,aisleMm:6000,stallW:2500,stallD:5000,columnMm:600,wallMm:400};
  const chain=xs=>xs.reduce((out,x)=>out.concat(out.at(-1)+x),[0]);
  const dimensions={x:[2600,9000,6000,3000,8400,8400,8400,3000,6850,5350],y:[3600,9000,9000,9000,9000,6500]};
  const x=chain(dimensions.x),y=chain(dimensions.y);
  // Dimension endpoints include wall/core references: they are not all column axes.
  const axes={x:[1,2,3,4,5,6,7,9].map(i=>x[i]+8400),y:[1,2,3,4,5].map(i=>y[i]+1200)};
  const site=poly([[-8.4,-1.2],[62.5,-1.2],[62.5,47],[29.7,47],[29.7,58.2],[-8.4,29.3]]);
  const mass=poly([[0,0],[61,0],[61,46.1],[19,46.1],[16.5,45.8],[14,44.9],[0,34.6]]);
  const sourceRoot='http://127.0.0.1:8873/source/'+encodeURIComponent('01 당선작_SGHS')+'/';
  const row=(id,b,facing)=>({id,polygon:rect(...b),facing,certainty:'estimated',meaning:'원도 주차열 범위 · 수동 추적, 칸 치수·대수 확정 아님'});
  const commonRows=[row('서측 외벽',[.6,.6,5,33.2],'E'),row('서측 안쪽',[11.8,22.3,5,13.6],'W'),row('남서측 쌍열',[11.8,4.4,9.8,11.2],'EW'),row('중앙 북측 1',[29.5,27.8,7.4,4.8],'S'),row('중앙 북측 2',[37.8,27.8,7.4,4.8],'S'),row('중앙 남측 1',[29.5,21.7,7.4,4.8],'N'),row('중앙 남측 2',[37.8,21.7,7.4,4.8],'N'),row('동측 외벽',[55.3,7,5,31.9],'W')];
  const floors=['B1','B2'].map((id,i)=>{
    const oldCores=[core('C1',17.6,21.6,3,18),core('C2',45.8,24.6,3,8),core('C3',45.8,3.6,3,12)];
    const oldRooms=i?[room('기계전기실',28.8,0,14.2,15.6),room('기계전기실 하부',43,0,5.8,3.6)]:[room('용역원실',36,3.6,7.1,6)];
    const before={v:2,ucs:0,mass,cores:oldCores,ramp:{p:point(i?20.6:28.8,42.85),k:2,len:i?25000:28000,w:6500,alignedAngleDeg:180},snap:100,module:'sghs',floorMm:i?3500:4000,allowExternalRamp:false,allowedBoundary:site,autoZones:false,occupants:oldRooms,occupantPolicy:'report'};
    const rooms=i?[room('기계전기실 주부',29,0,14.2,15.6),room('기계전기실 남동부',43.2,0,5.6,3.6),room('기계전기실 동측 확장',43.2,3.6,2.6,4.2),room('C3 연결 홀',43.2,7.8,2.6,7.8)]:[room('용역원실·화장실 남측',35.9,3.6,7.3,3),room('용역원실·화장실 북측',35.9,6.6,7.3,3)];
    const revised={...before,columnAxes:axes,cores:[core('C1 계단·승강기·홀 외곽',17.6,21.6,4,18),core('C2 계단·홀 외곽',45.8,21.6,3,11),i?core('C3 계단·승강기 외곽',45.8,3.6,3,12):core('C3 계단·승강기·홀 외곽',43.2,3.6,5.6,12)],occupants:rooms,ramp:{...before.ramp,len:i?16800:20200,referenceVisibleOnly:true}};
    // The north dimension endpoint appears to follow the inside wall face; keep r1 and test this reading separately.
    const landingBoundary={edge:'north',sourceInnerY:47300,outerY:47700,wallMm:400,certainty:'estimated',note:'B1 상부 6.5m 치수 끝점을 벽 안쪽으로 해석한 시험. 원도 실측·벽 상세 미확정. 램프·코어·기둥은 기존 입력 유지.'};
    const landing=i?null:{...revised,mass:revised.mass.map(([x,y])=>[x,y===landingBoundary.sourceInnerY?landingBoundary.outerY:y])};
    const rows=commonRows.map(r=>({...r}));
    if(i){
      rows.push(row('북동측 주차열 1',[37.8,39.2,7.4,4.9],'N'),row('북동측 주차열 2',[49.5,39.2,5,4.9],'N'),row('남동측 회전 주차열',[49.5,.6,5,5.1],'N'));
      for(const r of rows.filter(r=>r.id.startsWith('중앙')&&r.id.endsWith('1')))r.polygon=rect(26, r.id.includes('북측')?27.8:21.7,10.9,4.8);
    }else rows.push(row('중앙 장애인 열',[21.8,21.7,6.8,4.8],'N'),row('남측 단열',[27.6,4.4,4.9,11.2],'W'),row('남측 장애인 열',[33.5,10.5,7.8,5.1],'N'),row('동측 북단',[55.3,40.2,5,5.1],'W'),row('동측 남단',[55.3,.6,5,5.1],'W'));
    const routes=[{id:'서측 진입 연결 후보',points:poly([[i?20.6:28.8,42.85],[15,42.85],[8.7,36],[8.7,18.3],[24.2,18.3]]),certainty:'estimated'},{id:'동측·중앙 연결 후보',points:poly([[24.2,18.3],[51.8,18.3],[51.8,35.5],[i?24.2:28.8,35.5]]),certainty:'estimated'},{id:'서측 남부 가지',points:poly([[8.7,18.3],[8.7,3.6]]),certainty:'estimated'},{id:'동측 남부 가지',points:poly([[51.8,18.3],[51.8,7.8]]),certainty:'estimated'}];
    let aligned,alignedBoundary,alignedTrace;
    if(landing){
      aligned={...landing,cores:landing.cores.map((c,j)=>j?c:core(c.id,17.6,21.6,3,18))};
      alignedBoundary={...landingBoundary,certainty:'user_confirmed',wallCertainty:'assumed',note:'사용자 확인 기준: 램프와 외벽이 맞닿는 선은 외벽 내측선. 벽 두께 400mm는 임시 가정. C1 우측은 기둥열에 정렬; 실제 벽 상세·주차 조작은 미확인.'};
      const west=rows.find(r=>r.id==='서측 외벽').polygon,east=rows.find(r=>r.id==='동측 남단').polygon,half=3000;
      const wx=Math.max(...west.map(p=>p[0])),ex=Math.min(...east.map(p=>p[0])),wy=Math.min(...west.map(p=>p[1])),ey=Math.min(...east.map(p=>p[1])),top=point(0,18.3)[1];
      const westX=wx+half,eastX=ex-half,rectMm=([x0,y0,x1,y1])=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
      const correctedRoutes=routes.map(r=>({...r,points:r.points.map(([x,y])=>[x===point(8.7,0)[0]?westX:x===point(51.8,0)[0]?eastX:x,y])}));
      correctedRoutes.find(r=>r.id==='서측 남부 가지').points[1]=[westX,wy];
      correctedRoutes.find(r=>r.id==='동측 남부 가지').points[1]=[eastX,ey];
      const terminalAisles=[{id:'서측 하단',bounds:[wx,wy,wx+2*half,top]},{id:'동측 하단',bounds:[ex-2*half,ey,ex,top]}].map(a=>({...a,polygon:rectMm(a.bounds)}));
      const columnConflicts=[];
      for(let ix=0;ix<axes.x.length;ix++)for(let iy=0;iy<axes.y.length;iy++){
        const x=axes.x[ix],y=axes.y[iy],hc=300,b=[x-hc,y-hc,x+hc,y+hc];
        if(terminalAisles.some(a=>Math.min(a.bounds[2],b[2])>Math.max(a.bounds[0],b[0])&&Math.min(a.bounds[3],b[3])>Math.max(a.bounds[1],b[1])))columnConflicts.push({id:`X${ix+1}/Y${iy+1}`,center:[x,y],polygon:rectMm(b)});
      }
      alignedTrace={routes:correctedRoutes,terminalAisles,columnConflicts,fronts:[{id:'서측 하단 열',points:[[wx,wy],[wx,top]]},{id:'동측 최하단 열',points:[[ex,ey],[ex,Math.max(...east.map(p=>p[1]))]]}],widthMm:2*half,certainty:'estimated',note:'추적 주차열 앞면에 맞추고 말단을 평평하게 닫은 6m 차로 면 후보. 주차열 형상·기둥 600mm는 가정이며 자동 생성·조향·회차 검증 결과가 아님.'};
    }
    return {id,label:'지하 '+(i+1)+'층',source:'DG-80514_plan_0'+(i+6)+'.jpg',crop:i?[374,505,1942,1474]:[375,501,1942,1473],before,revised,...(landing?{landing,landingBoundary,aligned,alignedBoundary,alignedTrace}:{}),rows,routes,rooms,visibleRamp:rect(i?20.6:28.8,39.6,i?16.8:20.2,6.5),loading:i?null:rect(22.1,27.6,5.8,10.5),referenceCount:null};
  });
  function calibrateClearance(columnMm=referenceGrid.columnMm){
    if(!Number.isFinite(columnMm)||columnMm<=0)throw new RangeError('역산 기둥 폭은 양의 유한한 mm 값이어야 합니다');
    const f=floors[0],a=f.aligned,tr=f.alignedTrace,width=referenceGrid.aisleMm,hc=columnMm/2;
    const westFace=a.columnAxes.x[1]-hc,eastFace=a.columnAxes.x.at(-1)-hc,westFront=westFace-width,eastFront=eastFace;
    const westRow=f.rows.find(r=>r.id==='서측 외벽'),eastRow=f.rows.find(r=>r.id==='동측 남단');
    const westShift=westFront-Math.max(...westRow.polygon.map(p=>p[0])),eastShift=eastFront-Math.min(...eastRow.polygon.map(p=>p[0]));
    const rows=f.rows.map(r=>({...r,polygon:r.polygon.map(([x,y])=>[x+(r.id==='서측 외벽'?westShift:r.id.startsWith('동측')?eastShift:0),y])}));
    const oldWest=(tr.terminalAisles[0].bounds[0]+tr.terminalAisles[0].bounds[2])/2,oldEast=(tr.terminalAisles[1].bounds[0]+tr.terminalAisles[1].bounds[2])/2;
    const westCenter=westFace-width/2,eastCenter=eastFace-width/2,rectMm=([x0,y0,x1,y1])=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
    const routes=tr.routes.map(r=>({...r,points:r.points.map(([x,y])=>[x===oldWest?westCenter:x===oldEast?eastCenter:x,y])}));
    const terminalAisles=tr.terminalAisles.map((s,i)=>{const right=i?eastFace:westFace,b=[right-width,s.bounds[1],right,s.bounds[3]];return {...s,bounds:b,polygon:rectMm(b)};});
    const fronts=tr.fronts.map((s,i)=>({...s,points:s.points.map(([,y])=>[i?eastFront:westFront,y])})),columnConflicts=[];
    const southwest=rows.find(r=>r.id==='남서측 쌍열').polygon,south=rows.find(r=>r.id==='남측 단열').polygon;
    const left=Math.max(...southwest.map(p=>p[0])),right=Math.min(...south.map(p=>p[0])),bottom=Math.min(...southwest.concat(south).map(p=>p[1]));
    const parent=routes.find(r=>r.id==='동측·중앙 연결 후보'),junction=[(left+right)/2,parent.points[0][1]],end=[junction[0],bottom];
    parent.points.splice(1,0,junction.slice());
    routes.push({id:'중앙 남측 가지',points:[junction.slice(),end.slice()],certainty:'derived'});
    const centralBounds=[left,bottom,right,junction[1]];
    terminalAisles.push({id:'중앙 남측',bounds:centralBounds,polygon:rectMm(centralBounds)});
    fronts.push({id:'남서측 쌍열 앞면',points:[[left,bottom],[left,Math.max(...southwest.map(p=>p[1]))]]},{id:'남측 단열 앞면',points:[[right,bottom],[right,Math.max(...south.map(p=>p[1]))]]});
    const centralConnection={parentRouteId:parent.id,branchRouteId:'중앙 남측 가지',junction,end,widthMm:right-left};
    for(let ix=0;ix<a.columnAxes.x.length;ix++)for(let iy=0;iy<a.columnAxes.y.length;iy++){
      const x=a.columnAxes.x[ix],y=a.columnAxes.y[iy],b=[x-hc,y-hc,x+hc,y+hc];
      if(terminalAisles.some(s=>Math.min(s.bounds[2],b[2])>Math.max(s.bounds[0],b[0])&&Math.min(s.bounds[3],b[3])>Math.max(s.bounds[1],b[1])))columnConflicts.push({id:`X${ix+1}/Y${iy+1}`,center:[x,y],polygon:rectMm(b)});
    }
    const sourceWestX=Math.min(...f.revised.mass.map(p=>p[0])),outerWestX=sourceWestX-referenceGrid.wallMm;
    const input={...structuredClone(a),referenceColumnMm:columnMm,mass:a.mass.map(([x,y])=>[x===sourceWestX?outerWestX:x,y])};
    const boundary={...f.alignedBoundary,certainty:'user_assumption',note:'사용자 전제: SGHS 원본은 작동 가능한 계획이며 기둥 면을 제외한 차로 순폭은 6m. 주차 깊이 5m·구조축을 유지하고 추적 주차열 위치를 역산. 외벽 접한 선은 내측으로 정합; 벽 400mm는 임시 가정.'};
    const trace={...tr,rows,routes,terminalAisles,fronts,columnConflicts,columnMm,centralConnection,certainty:'user_assumption',note:'기둥 실제 면에서 순폭 6m를 확보하도록 역산한 참고 모형. 중앙 남측 가지는 기존 가로 동선의 분기점을 공유한다. 원본의 작동을 전제로 하며 실측 결과와 구분한다.'};
    const equation={clearWidthMm:width,columnMm,westColumnFaceMm:westFace,westParkingFrontMm:westFront,westParkingBackMm:Math.min(...rows.find(r=>r.id==='서측 외벽').polygon.map(p=>p[0])),westCenterMm:westCenter,eastColumnFaceMm:eastFace,eastParkingFrontMm:eastFront,eastCenterMm:eastCenter,parkingDepthMm:referenceGrid.stallD,westRowShiftMm:westShift,eastRowShiftMm:eastShift,sourceWestInnerX:sourceWestX,outerWestX};
    return {input,trace,boundary,equation};
  }
  const calibrated=calibrateClearance();
  Object.assign(floors[0],{clearance:calibrated.input,clearanceTrace:calibrated.trace,clearanceBoundary:calibrated.boundary,clearanceEquation:calibrated.equation});
  // User-marked source interpretation: the light hatch west of C3 is not its core envelope.
  const reviewed=structuredClone(calibrated.input),c3=reviewed.cores[2],right=c3.c[0]+c3.w/2,left=reviewed.columnAxes.x.at(-2);
  c3.w=right-left;c3.c[0]=(left+right)/2;
  const rampLeft=Math.max(...floors[0].visibleRamp.map(p=>p[0])),rampRight=calibrated.equation.eastParkingFrontMm;
  const rampBottom=Math.min(...floors[0].visibleRamp.map(p=>p[1])),rampTop=calibrated.boundary.sourceInnerY;
  reviewed.occupants.push({id:'B2 하행 램프 동측 접속부',kind:'ramp-access',c:[(rampLeft+rampRight)/2,(rampBottom+rampTop)/2],w:rampRight-rampLeft,d:rampTop-rampBottom,certainty:'user_confirmed',referenceReservationOnly:true});
  Object.assign(floors[0],{reviewed,reviewedTrace:structuredClone(calibrated.trace),reviewedBoundary:{...calibrated.boundary,note:calibrated.boundary.note+' C3의 좌측 해치 과대영역을 제거하고 B2 하행 램프의 동측 접속부를 주차 제외 공간으로 예약했습니다. 접속부의 실제 주행·회차는 미검증입니다.'}});
  // Compare supplied geometry against separately identified source regions before judging the engine.
  function auditB1(plan,G){
    const {CL,boolOp,areaOf,rectPoly,bbox}=G,I=CL.ClipType.ctIntersection,U=CL.ClipType.ctUnion;
    const area=P=>Math.abs(areaOf(P)),over=(A,B)=>area(boolOp(A,B,I)),shape=c=>rectPoly([c.c[0]-c.w/2,c.c[1]-c.d/2,c.c[0]+c.w/2,c.c[1]+c.d/2]);
    const rows=floors[0].reviewedTrace.rows,kept=(plan.stalls||[]).map(s=>s.pts),candidates=kept.concat(plan.lost||[]),union=boolOp(candidates,[],U);
    const reservation=shape(reviewed.occupants.find(c=>c.kind==='ramp-access')),core=shape(reviewed.cores[2]);
    const rowResults=rows.map(row=>({id:row.id,sourceAreaM2:area([row.polygon])/1e6,coveragePct:Math.round(over([row.polygon],union)/area([row.polygon])*1000)/10,candidates:candidates.filter(P=>over([P],[row.polygon])>1e4).length,kept:kept.filter(P=>over([P],[row.polygon])>1e4).length}));
    const outside=candidates.flatMap((P,i)=>{const ratio=over([P],rows.map(r=>r.polygon))/area([P]);return ratio<.5?[{index:i,pts:P,sourceRowOverlapPct:Math.round(ratio*1000)/10,bounds:bbox(P)}]:[];});
    return {basis:'user-confirmed core/ramp meaning; estimated source parking-row envelopes',status:'DIFFERENCES_REQUIRE_REVIEW',candidateCount:candidates.length,keptCount:kept.length,
      coreMismatch:!plan.cores?.[2]||area(boolOp([plan.cores[2].pts],[core],CL.ClipType.ctXor))>1e4,
      rampReservationMissing:!plan.occupants?.some(c=>c.kind==='ramp-access'&&area(boolOp([c.pts],[reservation],CL.ClipType.ctXor))<=1e4),
      rampCandidateHits:candidates.filter(P=>over([P],[reservation])>1e4).length,
      rows:rowResults,emptyRows:rowResults.filter(r=>r.candidates===0).map(r=>r.id),outsideRows:outside,
      note:'면적 일치율은 추적 주차열과 생성 후보의 겹침이며 원본 대수·주행 합격을 뜻하지 않습니다. 열 밖 후보는 후보 면적의 절반 미만이 추적 열에 포함된 경우입니다.'};
  }
  const data={id:'SGHS',revision:'2026-10-29-r1',sourceRoot,dimensions,site,floors,grid:referenceGrid,calibrateClearance,auditB1,evidence:[
    {certainty:'assumed',item:'좌표 기준',value:'mm 단위 도면 좌표에 X +8400 / Y +1200 적용. Y는 도면 위쪽이며 북향·측량 좌표는 미확인',source:'기존 파일럿과 같은 로컬 원점'},
    {certainty:'explicit_in_source',item:'치수열',value:'X 2.6·9·6·3·8.4·8.4·8.4·3·6.85·5.35m / Y 3.6·9·9·9·9·6.5m',source:'plan_06·07 하단·좌측 치수선'},
    {certainty:'derived',item:'구조축 위치',value:'하단 왼쪽 치수 기준점에서 누적; 벽·코어 참조점인 X=0·48.8·61m는 기둥 축에서 제외. Y=3.6~39.6m의 5축',source:'plan_06·07 치수열 + 검은 기둥·벽 위치 대조'},
    {certainty:'estimated',item:'외곽·코어·실',value:'도면 비례 추적. C1 연결 홀, C2 하부 홀, C3 홀, B2 설비실 꺾임 보완. 코어 내부 상세 생략',source:'plan_06·07'},
    {certainty:'estimated',item:'B1 착지 검토 입력',value:'상부 치수 끝점 Y=47300을 벽 안쪽으로 해석하고 외벽 바깥면만 +400mm. 기존 보완 입력 보존. 벽 두께·검사 공차 유지, 실측 확정 아님',source:'plan_06 상부 흰 바닥·검은 외벽 경계와 6.5m 치수선'},
    {certainty:'user_confirmed',item:'B1 피드백 보정 기준',value:'램프 위 외벽 접한 선을 내측선으로 채택; 벽 두께 400mm는 임시 가정. C1 우측 기둥열 정렬과 좌우 하단 주차열의 접면 보정은 별도 버전. 자동 동선에 추적선을 합성하지 않음',source:'2026-10-29 사용자 초록/파랑 표시 및 외벽 내측선 확인'},
    {certainty:'user_assumption',item:'B1 순폭 6m 역산',value:'SGHS 원본은 작동 가능한 계획으로 전제. 기둥 면 제외 순폭 6m·주차 깊이 5m를 유지하도록 추적 주차열과 서측 벽 기준을 정합. 기둥 600mm일 때 서측 주차열 300mm 서쪽, 동측 50mm 동쪽 이동. 실측 확정값과 구분',source:'2026-10-29 사용자 역산 지시'},
    {certainty:'derived',item:'B1 중앙 남측 연결',value:'중앙 가로 동선에서 남측 주차열 사이로 분기. 양측 추적 앞면 X=30000/36000 사이의 중심 X=33000, Y=19500에서 5600까지 연결; 순폭 6m 유지',source:'2026-10-29 사용자 파란 표시와 추적 주차열 앞면'},
    {certainty:'user_confirmed',item:'B1 원본 대조 보정 · reviewed',value:'C3 좌측을 X=54200 기둥열에 맞춰 폭 3m로 보정. B2 하행 램프 동측 접속부 X=57400~63750 / Y=40800~47300은 주차 제외 예약. 상세 형상·주행은 미검증',source:'2026-10-29 사용자 파란 코어 경계·초록 램프 접근 표시와 plan_06 벽·해치 대조'},
    {certainty:'estimated',item:'램프 형상',value:'B1 노출 직선 약 20.2m / B2 약 16.8m; 6.5m 상부 띠를 사각형으로 근사. B2 사선 단부는 미재현',source:'plan_06·07 상단 사선·해칭·화살표'},
    {certainty:'assumed',item:'기둥·주차 모듈',value:'선택한 모든 축 교점에 0.6m 기둥; 차로 6m, 칸 2.5×5m, 벽 0.4m. 원도의 개별 교점 존재·유효 폭 확정 아님',source:'기존 엔진의 직교 격자·시험용 설정'},
    {certainty:'estimated',item:'주차열·동선',value:'주차열 범위는 수동 추적. 내부 연결 중심선은 빈 공간에서 추정; 방향·회전반경·통행 가능 검증 안 됨',source:'plan_06·07 빈 공간·주차열·램프 화살표'},
    {certainty:'unknown',item:'전체 램프·진입·대수',value:'전체 경사 길이·완화·층간 연결·실제 도로 진입점·원안 총 주차대수 미확인. 수정안 경사 계산은 보류',source:'확보 평면만으로 확정 불가'}
  ],limits:['단층 두 건의 비교이며 B1↔B2 차량 연결 시험이 아니다.','기본 자동 생성기는 수동 추적선을 사용하지 않는다. 연결망 엔진 후보는 명시적으로 추적 연결망을 실제 차로·칸 생성과 검사에 넘기는 별도 실험이며 원본 재현·주행 합격과 구분한다.','현재 비교 입력은 전교점 기둥 가정이며 원본 이미지의 기둥 배열과 완전히 일치한다고 보지 않는다.','외곽 곡선은 다각선 근사, B2 램프 단부와 코어·설비실 경계는 원본 이미지 추가 확인이 필요하다.']};
  if(typeof module!=='undefined'&&module.exports)module.exports=data;else root.SGHSReference=data;
})(typeof window!=='undefined'?window:globalThis);

// Executable fixture checks keep source observations separate from engine output.
if(typeof module!=='undefined'&&require.main===module){
  const assert=require('node:assert/strict'),E=require('./plan/CLAUDE_ugp_plan.js'),G=require('./plan/CLAUDE_ugp_geom.js'),c=module.exports;
  assert.equal(c.dimensions.x.reduce((a,b)=>a+b),61000);assert.equal(c.dimensions.y.reduce((a,b)=>a+b),46100);
  const summaries=[];
  for(const f of c.floors)for(const rev of ['before','revised']){
    const d=structuredClone(f[rev]),rp=d.ramp,input={...d,grid:{...c.grid,...(d.columnAxes?{columnAxes:d.columnAxes}:{})},floorMm:rp.referenceVisibleOnly?undefined:d.floorMm,ramp:E.createStraightRamp({landing:rp.p,angleDeg:rp.alignedAngleDeg,widthMm:rp.w,lengthMm:rp.len})};
    const source=JSON.stringify(input),r=E.generate(input),v=E.inspectVehicleRoutes(r),again=E.generate(input);
    assert.equal(JSON.stringify(input),source);assert.deepEqual(r.stalls,again.stalls);assert.equal(r.stallCount,r.stalls.length);assert.equal(r.cores.length,3);
    for(let i=0;i<3;i++)assert.deepEqual(r.cores[i].center,d.cores[i].c);
    if(rev==='before'){assert.equal(r.stallCount,0);assert.equal(r.status,'INFEASIBLE');}
    else{
      assert.deepEqual(r.grid.columnAxes,d.columnAxes);assert.equal(r.ramp.slopePct,null);assert.equal(f.referenceCount,null);
      assert.equal(r.stallCount,0);assert.equal(r.status,'INFEASIBLE');assert.equal(v.entry.state,'unconnected');assert.equal(v.exit.state,'unconnected');assert.equal(r.columns.length,39);
      assert.equal(d.columnAxes.x.length,8);assert.equal(d.columnAxes.y.length,5);
      for(const P of r.columns){const b=G.bbox(P);assert(d.columnAxes.x.includes((b[0]+b[2])/2));assert(d.columnAxes.y.includes((b[1]+b[3])/2));}
      assert(r.stalls.every(s=>Math.abs(G.areaOf(G.boolOp([s.pts],r.columns,G.CL.ClipType.ctIntersection)))<1e4));
    }
    summaries.push({floor:f.id,revision:rev,count:r.stallCount,status:r.status,columns:r.columns.length,entry:v.entry.state,exit:v.exit.state,entryIssue:v.entry.firstIssue,exitIssue:v.exit.firstIssue,rampShiftMm:r.ramp.shiftMm,coreShiftMm:r.cores.map(k=>k.shiftMm),hasLoop:r.graph.hasLoop,deadEnds:r.graph.deadEnds?.length,violations:r.violations.map(v=>v.id)});
  }
  assert.throws(()=>E.generate({mass:[],cores:[]}),/지하층 외곽/);
  assert.throws(()=>E.generate({...c.floors[0].revised,grid:{columnAxes:{x:[0,0],y:[0,9000]}}}),/columnAxes/);
  console.log(JSON.stringify({checks:'source dimensions; baseline reproduction; fixed cores and axes; no slope claim from visible length; no source-count claim; repeatability; input preservation; invalid input rejection',summaries},null,2));
}
