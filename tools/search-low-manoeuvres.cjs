'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const Search=require('../04_parking/01_src/plan/low-manoeuvre-search.js'),Compare=require('../04_parking/01_src/plan/candidate-comparison.js');
const M=require('../04_parking/01_src/plan/vehicle-manoeuvres.js'),G=require('../04_parking/01_src/plan/CLAUDE_ugp_geom.js');
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const equal=(a,b)=>distance(a,b)<.01&&Math.abs(wrap(a[2]-b[2]))<1e-7;
const area=P=>Math.abs(G.areaOf(P));
function ensure(ok,message){if(!ok)throw Error(message);}
function optimize(document,report,id){
  const candidates=Array.isArray(document)?document:document.candidates,comparison=Compare.compare(candidates,report),selected=id||comparison.referenceId;
  const candidate=candidates.find(c=>c.id===selected),row=comparison.rows.find(c=>c.id===selected),old=report.groups.find(c=>c.id===selected);
  ensure(candidate&&row&&row.evidence.state==='imported-bound-report','현재 배치에 결속된 경로 보고가 필요합니다');
  const {fixed,aisles,stalls}=candidate,loop=Search.loop(candidate.loop),entry=candidate.ramps.find(r=>r.id==='R-IN'),exit=candidate.ramps.find(r=>r.id==='R-OUT');
  const entryS=loop.nearest(entry.end),exitS=loop.nearest(exit.start);ensure(equal(entryS.pose,entry.end)&&equal(exitS.pose,exit.start),'램프와 고리의 정확한 접속이 필요합니다');
  const criteria=old.criteria||report.criteria;
  // This tool keeps the vehicle used by the existing parking checks; other sizes need an explicit shared input contract.
  const pv=M.vehicle({clearanceMm:100}),rv=M.vehicle({clearanceMm:200,sampleMm:25}),iv=M.vehicle({clearanceMm:100,sampleMm:25});
  ensure(criteria.drivingMarginMm===200&&criteria.parkingAndLocalConnectionMarginMm===100&&criteria.minRearAxleRadiusMm===4500&&criteria.sampleMm===25&&criteria.intermediateGuardMm===26,'지원하는 기존 차량·여유·검사 조건과 다릅니다');
  ensure(candidate.ramps.some(r=>r.vehicle),'기존 검토 차량의 치수 기록이 필요합니다');
  for(const r of candidate.ramps)if(r.vehicle)for(const key of ['lengthMm','widthMm','wheelbaseMm','rearOverhangMm','minRadiusMm'])ensure(r.vehicle[key]===pv[key],'램프 차량 조건이 다릅니다');
  const base={innerOutline:fixed.innerOutline,aisles,columns:fixed.columns,cores:fixed.cores.map(pts=>({pts})),ramp:{body:fixed.ramp},stalls:stalls.map(pts=>({pts}))};
  const audit={passed:true,stepMm:25,extraGuardMm:26,maxOutsideMm2:0,maxObstacleMm2:0,poses:0,candidates:[],independent:false,scope:'existing motion checker and polygon area replay; no external reviewer'};
  function checkPath(start,controls,S,margin){let q=start;const v=margin===200?rv:iv;
    function sample(p){const P=M.body(p,v),box=G.bbox(P),near=S.blockers.filter(B=>G.boxHit(box,G.bbox(B))),outside=area(G.boolOp([P],S.allowed,G.CL.ClipType.ctDifference)),obstacle=near.length?area(G.boolOp([P],near,G.CL.ClipType.ctIntersection)):0;audit.poses++;audit.maxOutsideMm2=Math.max(audit.maxOutsideMm2,outside);audit.maxObstacleMm2=Math.max(audit.maxObstacleMm2,obstacle);ensure(outside<=1&&obstacle<=1,'차체 재대조 이탈 또는 겹침');}
    sample(q);for(const c of controls){const part=M.motion(S,q,c.gear,c.curvature,c.lengthMm,v);ensure(part.ok,'기존 차량 검사에서 경로 차단');const n=Math.max(1,Math.ceil(c.lengthMm/25));for(let j=1;j<=n;j++)sample(M.advance(q,c.gear*c.lengthMm*j/n,c.curvature));q=part.q;}return q;
  }
  function compose(index,parked,controls,attachS){
    const reverse=controls.slice().reverse().map(c=>({...c,gear:-c.gear})),phases=[{id:'ramp-entry',controls:entry.controls,margin:200},{id:'loop-to-parking',controls:loop.between(entryS.s,attachS),margin:200},{id:'parking-entry',controls:reverse,margin:100},{id:'parking-exit',controls,margin:100},{id:'loop-to-ramp',controls:loop.between(attachS,exitS.s),margin:200},{id:'ramp-exit',controls:exit.controls,margin:200}];
    let q=entry.start.slice(),gear=1,roundTripGearChanges=0,travelM=0;
    for(const p of phases){p.start=q.slice();q=p.controls.reduce((a,c)=>M.advance(a,c.gear*c.lengthMm,c.curvature),q);p.end=q.slice();for(const c of p.controls){if(c.gear!==gear)roundTripGearChanges++;gear=c.gear;travelM+=c.lengthMm/1000;}if(p.id==='parking-entry')ensure(equal(q,parked),'주차 완료 자세 불일치');}
    ensure(equal(q,exit.end),'램프 진출 종료 불일치');return {index,state:'full-planar-journey-found',parked,attachS,attachPose:loop.at(attachS),roundTripGearChanges,travelM,phases};
  }
  const results=[],improvements=[];
  for(let index=0;index<stalls.length;index++){
    const known=old.results.find(r=>r.index===index),bay=stalls[index],S=M.createSpace({...base,aisles:aisles.concat([bay]),stalls:base.stalls.filter((s,i)=>i!==index)});
    const fullSpace=M.createSpace({...base,aisles:aisles.concat([fixed.ramp,bay]),ramp:undefined,stalls:base.stalls.filter((s,i)=>i!==index)});
    if(known?.state!=='full-planar-journey-found'){results.push({id:known?.id||'P'+String(index+1).padStart(2,'0'),index,state:'not-found-within-budget',reason:'no-confirmed-parked-pose; retained as unverified'});continue;}
    const centre=bay.reduce((a,p)=>[a[0]+p[0]/bay.length,a[1]+p[1]/bay.length],[0,0]),parked=known.parked;
    const edges=bay.map((a,i)=>{const b=bay[(i+1)%bay.length],f=[(a[0]+b[0])/2,(a[1]+b[1])/2],n=G.norm(G.sub(centre,f));return {f,n,length:distance(a,b)};}).filter(e=>e.length<2600);
    const front=edges.sort((a,b)=>Math.abs(wrap(Math.atan2(-a.n[1],-a.n[0])-parked[2]))-Math.abs(wrap(Math.atan2(-b.n[1],-b.n[0])-parked[2])))[0]?.f;ensure(front,'주차 앞면이 필요합니다');
    const all=[];for(let s=0;s<loop.lengthMm;s+=1000){const q=loop.at(s),d=distance(q,front);if(d>=1500&&d<=14000&&M.poseFits(S,q,pv))all.push({s,q,d});}all.sort((a,b)=>a.d-b.d);
    const targets=[];for(const t of all)if(targets.every(a=>distance(a.q,t.q)>1200||Math.abs(wrap(a.q[2]-t.q[2]))>.4)){targets.push(t);if(targets.length===20)break;}
    const previous=known.phases.find(p=>p.id==='parking-exit'),previousEnd=previous.end,join=loop.nearest(previousEnd);ensure(equal(join.pose,previousEnd),'기존 출차 경로가 고리에 정확히 접속하지 않습니다');
    if(!targets.some(t=>equal(t.q,previousEnd)))targets.push({s:join.s,q:previousEnd});
    const found=Search.search(S,parked,targets.map(t=>t.q),pv,{baseline:{controls:previous.controls},maxNodes:30000,initialGear:1,finalGear:1});ensure(found.state==='path-found','검증한 기존 경로가 탐색에서 사라졌습니다');
    let next=compose(index,parked,found.controls,targets[found.goalIndex].s),adopted=next.roundTripGearChanges<known.roundTripGearChanges||next.roundTripGearChanges===known.roundTripGearChanges&&next.travelM<known.travelM-1e-6;
    if(!adopted)next=structuredClone(known);
    next.id=known.id;next.search={...found.stats,source:found.source,adopted,optimality:found.optimality,beforeGearChanges:known.roundTripGearChanges,beforeTravelM:known.travelM};
    for(const p of next.phases){const q=checkPath(p.start,p.controls,fullSpace,p.margin);ensure(equal(q,p.end),'전체 여정 구간 끝 불일치');}
    if(adopted)improvements.push({id:known.id,before:known.roundTripGearChanges,after:next.roundTripGearChanges,beforeM:known.travelM,afterM:next.travelM});results.push(next);
    if(process.env.LOW_MANOEUVRE_PROGRESS==='1')process.stderr.write(JSON.stringify({id:next.id,before:known.roundTripGearChanges,after:next.roundTripGearChanges,adopted,source:found.source,expanded:found.stats.expanded})+'\n');
  }
  const found=results.filter(r=>r.state==='full-planar-journey-found'),distribution={};for(const r of found)distribution[r.roundTripGearChanges]=(distribution[r.roundTripGearChanges]||0)+1;
  const group={id:selected,title:candidate.title,geometryHash:row.geometryHash,results,summary:{examined:stalls.length,fullJourneys:found.length,unresolved:results.filter(r=>r.state!=='full-planar-journey-found').map(r=>r.id),gearChangeDistribution:distribution,meanTravelM:found.length?found.reduce((s,r)=>s+r.travelM,0)/found.length:null}};
  audit.candidates=[{id:selected,geometryHash:row.geometryHash,placed:stalls.length,fullJourneys:found.length}];
  const output={schema:'low-manoeuvre-report/1',criteria:structuredClone(criteria),groups:[group],audit,improvements,vehicle:{lengthMm:pv.lengthMm,widthMm:pv.widthMm,wheelbaseMm:pv.wheelbaseMm,rearOverhangMm:pv.rearOverhangMm,minRadiusMm:pv.minRadiusMm},baselineDigest:crypto.createHash('sha256').update(JSON.stringify(old)).digest('hex'),limits:['기존 입력·검사 조건 유지; 전역 최소 조작 또는 최단 거리 증명이 아님','미확인 주차칸은 이번 도구에서 승격하지 않음','평면 단독 차량만 검사; 경사·시야·교행·조향 속도·실차·법규 미검증']};
  ensure(Compare.compare([candidate],output).rows[0].evidence.state==='imported-bound-report','공통 비교 형식 재검사 실패');return output;
}
function main(args){
  if(args.length===1&&args[0]==='--help'){process.stdout.write('사용법: node tools/search-low-manoeuvres.cjs <후보.json> <검증보고.json> [후보ID]\n기존 차량 조건으로 적은 조작 경로를 탐색·재검사하여 새 보고를 표준 출력합니다. 입력은 수정하지 않습니다.\n');return;}
  ensure(args.length===2||args.length===3,'후보 파일과 검증보고 파일이 필요합니다');const candidate=JSON.parse(fs.readFileSync(args[0],'utf8')),report=JSON.parse(fs.readFileSync(args[1],'utf8'));process.stdout.write(JSON.stringify(optimize(candidate,report,args[2]))+'\n');
}
if(require.main===module){try{main(process.argv.slice(2));}catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}}
module.exports={optimize};
