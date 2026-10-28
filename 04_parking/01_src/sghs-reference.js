// SGHS drawing observations and approximate envelopes; never survey or as-built coordinates.
'use strict';
(function(root){
  const point=(x,y)=>[Math.round((x+8.4)*1000),Math.round((y+1.2)*1000)];
  const poly=P=>P.map(p=>point(...p)),rect=(x,y,w,h)=>poly([[x,y],[x+w,y],[x+w,y+h],[x,y+h]]);
  const core=(id,x,y,w,d)=>({id,c:point(x+w/2,y+d/2),w:w*1000,d:d*1000,keep:{x:true,y:true},referenceEnvelopeOnly:true});
  const room=(id,x,y,w,d)=>({id,c:point(x+w/2,y+d/2),w:w*1000,d:d*1000});
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
    const rows=commonRows.map(r=>({...r}));
    if(i){
      rows.push(row('북동측 주차열 1',[37.8,39.2,7.4,4.9],'N'),row('북동측 주차열 2',[49.5,39.2,5,4.9],'N'),row('남동측 회전 주차열',[49.5,.6,5,5.1],'N'));
      for(const r of rows.filter(r=>r.id.startsWith('중앙')&&r.id.endsWith('1')))r.polygon=rect(26, r.id.includes('북측')?27.8:21.7,10.9,4.8);
    }else rows.push(row('중앙 장애인 열',[21.8,21.7,6.8,4.8],'N'),row('남측 단열',[27.6,4.4,4.9,11.2],'W'),row('남측 장애인 열',[33.5,10.5,7.8,5.1],'N'),row('동측 북단',[55.3,40.2,5,5.1],'W'),row('동측 남단',[55.3,.6,5,5.1],'W'));
    const routes=[{id:'서측 진입 연결 후보',points:poly([[i?20.6:28.8,42.85],[15,42.85],[8.7,36],[8.7,18.3],[24.2,18.3]]),certainty:'estimated'},{id:'동측·중앙 연결 후보',points:poly([[24.2,18.3],[51.8,18.3],[51.8,35.5],[i?24.2:28.8,35.5]]),certainty:'estimated'},{id:'서측 남부 가지',points:poly([[8.7,18.3],[8.7,3.6]]),certainty:'estimated'},{id:'동측 남부 가지',points:poly([[51.8,18.3],[51.8,7.8]]),certainty:'estimated'}];
    return {id,label:'지하 '+(i+1)+'층',source:'DG-80514_plan_0'+(i+6)+'.jpg',crop:i?[374,505,1942,1474]:[375,501,1942,1473],before,revised,rows,routes,rooms,visibleRamp:rect(i?20.6:28.8,39.6,i?16.8:20.2,6.5),loading:i?null:rect(22.1,27.6,5.8,10.5),referenceCount:null};
  });
  const data={id:'SGHS',revision:'2026-10-29-r1',sourceRoot,dimensions,site,floors,grid:{gx:8400,gy:9000,aisleMm:6000,stallW:2500,stallD:5000,columnMm:600,wallMm:400},evidence:[
    {certainty:'assumed',item:'좌표 기준',value:'mm 단위 도면 좌표에 X +8400 / Y +1200 적용. Y는 도면 위쪽이며 북향·측량 좌표는 미확인',source:'기존 파일럿과 같은 로컬 원점'},
    {certainty:'explicit_in_source',item:'치수열',value:'X 2.6·9·6·3·8.4·8.4·8.4·3·6.85·5.35m / Y 3.6·9·9·9·9·6.5m',source:'plan_06·07 하단·좌측 치수선'},
    {certainty:'derived',item:'구조축 위치',value:'하단 왼쪽 치수 기준점에서 누적; 벽·코어 참조점인 X=0·48.8·61m는 기둥 축에서 제외. Y=3.6~39.6m의 5축',source:'plan_06·07 치수열 + 검은 기둥·벽 위치 대조'},
    {certainty:'estimated',item:'외곽·코어·실',value:'도면 비례 추적. C1 연결 홀, C2 하부 홀, C3 홀, B2 설비실 꺾임 보완. 코어 내부 상세 생략',source:'plan_06·07'},
    {certainty:'estimated',item:'램프 형상',value:'B1 노출 직선 약 20.2m / B2 약 16.8m; 6.5m 상부 띠를 사각형으로 근사. B2 사선 단부는 미재현',source:'plan_06·07 상단 사선·해칭·화살표'},
    {certainty:'assumed',item:'기둥·주차 모듈',value:'선택한 모든 축 교점에 0.6m 기둥; 차로 6m, 칸 2.5×5m, 벽 0.4m. 원도의 개별 교점 존재·유효 폭 확정 아님',source:'기존 엔진의 직교 격자·시험용 설정'},
    {certainty:'estimated',item:'주차열·동선',value:'주차열 범위는 수동 추적. 내부 연결 중심선은 빈 공간에서 추정; 방향·회전반경·통행 가능 검증 안 됨',source:'plan_06·07 빈 공간·주차열·램프 화살표'},
    {certainty:'unknown',item:'전체 램프·진입·대수',value:'전체 경사 길이·완화·층간 연결·실제 도로 진입점·원안 총 주차대수 미확인. 수정안 경사 계산은 보류',source:'확보 평면만으로 확정 불가'}
  ],limits:['단층 두 건의 비교이며 B1↔B2 차량 연결 시험이 아니다.','추적선은 수동 참고 도형이다. 자동 생성 엔진의 칸·차로·검사 결과로 사용하지 않는다.','기존 구조축 엔진은 교점별 생략을 지원하지 않아 원도 기둥 배열의 완전 일치는 주장하지 않는다.','외곽 곡선은 다각선 근사, B2 램프 단부와 코어·설비실 경계는 원도 추가 확인이 필요하다.']};
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
