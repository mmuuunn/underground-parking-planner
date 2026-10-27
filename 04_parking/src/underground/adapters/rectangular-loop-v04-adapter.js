/* v0.4 정형 순환형 생성기 → 계약(PlanningInput·Candidate·SearchOutcome) 번역. 계약 1-8, 3장, 5-3.
 * 번역만 한다. v0.4의 판정 상태(valid·status)는 selfReport로만 옮기고, INFEASIBLE은 '미발견'으로 번역한다.
 */
(function(root,factory){'use strict';const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;root.UGAdapterV04=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const finite=Number.isFinite;
  const UNSEARCHED=['중앙 주통로형','가지형+회차','여러 구역 결합'];
  const SUGGEST={LANDING:'램프 위치·방향을 바꾸거나 램프를 입력해 다시 탐색',NO_LOOP:'순환이 필요 없는 다른 동선 유형(회차형 등)으로 탐색',DEAD_END:'막다른 차로를 없애도록 모듈·원점 범위를 넓혀 다시 탐색',RAMP_CORE:'램프 몸체와 코어가 겹치지 않게 위치를 조정'};

  function adapt(v,res){
    const g=v.grid||{},ramp=v.ramp||null,curved=!!ramp&&ramp.type==='curve',id='v04-'+(res.origin?res.origin.ox+'_'+res.origin.oy:'none');
    const assumptions=['외곽(mass)은 안쪽 면(inner)으로 간주함(1-8)'];
    let ramps=[];
    if(ramp){const sweep=Math.min(359,Math.abs(ramp.sweepDeg||0))*Math.PI/180;
      ramps=[{id:'ramp-0',shape:curved?{type:'curve',lengthMm:ramp.radiusMm*sweep,innerRadiusMm:ramp.radiusMm-ramp.widthMm/2}:{type:'straight',lengthMm:ramp.lengthMm},section:{wallToWallMm:ramp.widthMm}}];
      assumptions.push('v0.4 램프 평면 폭(widthMm)을 벽 사이 전체 너비(wallToWallMm)로 옮김. 연석 정보 없음(1-8)');}
    const input={floor:{id:'v04',outline:{kind:'inner',polygons:[v.mass]},...(finite(v.floorMm)?{heightMm:v.floorMm}:{}),...(finite(g.wallMm)?{wallMm:g.wallMm}:{})},
      fixed:{cores:(v.cores||[]).map((p,i)=>({id:'core-'+i,polygon:p}))},ramps,generator:{...g}};
    const ok=res.status!=='INFEASIBLE';
    const candidate={schema:'ug-candidate/0.1',candidateId:id,routeType:'rect-loop',generator:{name:'rectangular-loop',version:res.schema},
      frame:{originMm:res.origin?[res.origin.ox,res.origin.oy]:[0,0],angleDeg:res.angleDeg},
      geometry:{stalls:res.stalls.map((s,i)=>({id:'stall-'+i,polygon:s.pts,orientation:'perpendicular',rowId:s.side})),
        lanes:res.aisles.map((p,i)=>({id:'lane-'+i,polygon:p})),
        ramps:res.ramp?[{id:'ramp-0',bodyPolygon:res.ramp.body,landingPolygon:res.ramp.landing}]:[],
        columns:res.columns.map((p,i)=>({id:'col-'+i,polygon:p,origin:'proposed'})),reserved:[],turnaround:[],circulation:res.circulation},
      omissions:{columns:[],stalls:Object.entries(res.excluded||{}).flatMap(([reason,ps])=>ps.map(polygon=>({polygon,reason}))),areas:[]},
      selfReport:{valid:res.valid,status:res.status,loopExists:!!(res.circulation&&res.circulation.hasLoop),stallCount:res.stallCount,violations:res.violations}};
    // v0.4는 원점을 축마다 8곳 표본으로 찾고, 원점이 주어지면 그 한 곳만 쓴다
    const searched={routeTypes:['rect-loop'],angles:[res.angleDeg],originSamples:(finite(g.ox)?1:8)*(finite(g.oy)?1:8),modules:[{gx:res.moduleMm&&res.moduleMm.gx,gy:res.moduleMm&&res.moduleMm.gy}]};
    const searchOutcome=ok?{status:'FOUND',searched,candidates:[{candidateId:id,evaluationRef:null}]}:
      {status:'NOT_FOUND',searched,candidates:[],notFound:{closestCandidates:[{candidateId:id,blockedBy:res.violations.map(x=>x.id),notes:res.violations.map(x=>x.note)}],unsearched:UNSEARCHED,suggestions:res.violations.map(x=>SUGGEST[x.id]).filter(Boolean)}};
    return{input,candidate,searchOutcome,assumptions};}
  return{adapt};
});
