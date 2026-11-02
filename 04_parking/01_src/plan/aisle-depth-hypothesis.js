/* Opt-in geometric experiment. Distances are mm; no new structural or vehicle approval. */
(function(root){
  'use strict';
  const node=typeof module!=='undefined'&&module.exports;
  const G=node?require('./CLAUDE_ugp_geom.js'):root.UGP.geom;
  const Zones=node?require('./planning-zones.js'):root.UGP.zones;
  const {add,sub,mul,dot,len,norm,boolOp,areaOf,CL}=G;
  const I=CL.ClipType.ctIntersection,D=CL.ClipType.ctDifference,U=CL.ClipType.ctUnion;
  const A=paths=>Math.abs(areaOf(paths)),cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
  const classify=d=>d<5000?'short':d<10000?'outer':'inner';
  const laneClass=(a,b)=>a==='inner'&&b==='inner'?'internal':
    [a,b].includes('outer')&&[a,b].includes('inner')?'outermost':'exception';
  function hit(p,n,outline){
    let best=null;
    outline.forEach((a,i)=>{const b=outline[(i+1)%outline.length],v=sub(b,a),den=cross(n,v);
      if(Math.abs(den)<1e-8)return;
      const w=sub(a,p),d=cross(w,v)/den,t=cross(w,n)/den;
      if(d>=-1e-6&&t>=-1e-8&&t<=1+1e-8&&(!best||d<best.d))best={d:Math.max(0,d),edge:i};
    });return best;
  }
  function analyze(plan,input){
    if(!plan?.graph||!plan.innerOutline?.length)throw new TypeError('계산된 도면이 필요합니다');
    const wallMm=200,width=input.grid?.stallW??2500,depth=input.grid?.stallD??5000;
    if(![width,depth].every(v=>Number.isFinite(v)&&v>0))throw new RangeError('유한한 주차 폭·깊이가 필요합니다');
    const outline=plan.innerOutline,half=plan.grid.aisleMm/2;
    const fixed={columns:plan.columns,cores:plan.cores.map(c=>c.pts),ramp:plan.ramp?[plan.ramp.body]:[],
      occupants:(plan.occupants||[]).map(c=>c.pts)};
    const physical=Object.values(fixed).flat(),stalls=plan.stalls.map(s=>s.pts);
    const protectedPaths=physical.concat(plan.aisles,stalls,(plan.parkingReservations||[]).map(c=>c.pts),
      plan.cores.flatMap(c=>c.plan?[c.plan.walk]:[]),(plan.nonParkingZones||[]).filter(z=>z.source==='input'||z.assigned).flatMap(z=>z.paths),
      (plan.keptZones||[]).flatMap(z=>z.paths),Zones.explicit(input).filter(z=>z.kind==='keep').flatMap(z=>z.paths));
    const domain=plan.parkingInnerPaths||[outline];
    const free=boolOp(domain,protectedPaths,D),faces=[],sections=[],unmeasured=[],da=[],walls=[],claimed=[];
    const quad=(p,q,n,a,b)=>[add(p,mul(n,a)),add(q,mul(n,a)),add(q,mul(n,b)),add(p,mul(n,b))];
    for(const edge of plan.graph.edges){
      if(edge.kind==='ramp')continue;
      const p=plan.graph.nodes[edge.a].p,q=plan.graph.nodes[edge.b].p,u=norm(sub(q,p)),length=len(sub(q,p));
      if(length<width)continue;
      const left=[-u[1],u[0]],cuts=[0,length];
      // Project wall vertices and threshold crossings: classification is local, not one midpoint per face.
      for(const v of outline){const t=dot(sub(v,p),u);if(t>0&&t<length)cuts.push(t);}
      for(const n of [left,mul(left,-1)])for(let k=0;k<outline.length;k++){
        const a=outline[k],b=outline[(k+1)%outline.length],v=sub(b,a);
        const normalSlope=dot(v,n),alongSlope=dot(v,u);
        for(const threshold of [5000,10000])if(Math.abs(normalSlope)>1e-8){
          const r=(threshold+half-dot(sub(a,p),n))/normalSlope;
          const t=dot(sub(a,p),u)+r*alongSlope;if(r>0&&r<1&&t>0&&t<length)cuts.push(t);
        }
      }
      // Obstacle/aisle endpoints bound conservative rectangular proposals; no clipping around columns to fake a clear wall.
      for(const P of physical.concat(plan.aisles))for(const v of P){const t=dot(sub(v,p),u);if(t>0&&t<length)cuts.push(t);}
      const ts=[...new Set(cuts.map(t=>Math.round(t*1000)/1000))].sort((a,b)=>a-b);
      for(let k=1;k<ts.length;k++){
        const lo=ts[k-1],hi=ts[k];if(hi-lo<1)continue;
        const pair=[];
        for(const [side,n]of [['L',left],['R',mul(left,-1)]]){
          const start=add(add(p,mul(u,lo)),mul(n,half)),end=add(add(p,mul(u,hi)),mul(n,half));
          const at=t=>add(start,mul(sub(end,start),t)),mid=at(.5),h=hit(mid,n,outline);
          if(!h||CL.Clipper.PointInPolygon({X:mid[0],Y:mid[1]},G.toC(outline))===0){pair.push('unknown');unmeasured.push({edgeId:edge.id,side,rangeMm:[lo,hi],reason:'FACE_OUTSIDE_OUTLINE_OR_NO_WALL'});continue;}
          const samples=[hit(at(1e-7),n,outline),hit(at(1-1e-7),n,outline)];
          if(samples.some(x=>!x)){pair.push('unknown');continue;}
          const dMin=Math.min(...samples.map(x=>x.d)),dMax=Math.max(...samples.map(x=>x.d));
          const cls=classify(h.d),id=`E${edge.id??edge.a+'-'+edge.b}.${k}${side}`;
          const f={id,edgeId:edge.id,side,start,end,normal:n,rangeMm:[lo,hi],dMm:h.d,dMinMm:dMin,dMaxMm:dMax,
            classification:cls,wallPoint:add(mid,mul(n,h.d)),dimension:[mid,add(mid,mul(n,h.d))],
            shortByMm:Math.max(0,5000-dMin),reached:edge.reached===true};
          pair.push(cls);faces.push(f);
          if(cls==='outer'){
            const row=quad(start,end,n,0,depth),wall=quad(start,end,n,depth,depth+wallMm);
            const gross=[add(start,mul(n,depth+wallMm)),add(end,mul(n,depth+wallMm)),
              add(end,mul(n,samples[1].d)),add(start,mul(n,samples[0].d))];
            f.roughResidualMm=[dMin-5000,dMax-5000];f.daWall=wall;f.daOutline=gross;
            f.daReasons=[];
            if(depth!==5000)f.daReasons.push('ACTUAL_STALL_DEPTH_DIFFERS');
            if(dMin<=depth+wallMm)f.daReasons.push('NO_DA_DEPTH_AFTER_WALL');
            if(A(boolOp([row],plan.aisles,I))>1e4)f.daReasons.push('ROW_INTERSECTS_AISLE');
            if(A(boolOp([wall],protectedPaths.concat(claimed),I))>1e4)f.daReasons.push('WALL_CONFLICT');
            if(A(boolOp([gross],protectedPaths.concat(claimed),I))>1e4)f.daReasons.push('DA_OCCUPIED');
            if(A(boolOp([wall,gross],domain,D))>1e4)f.daReasons.push('OUTSIDE_DOMAIN');
            const covered=A(boolOp([row],stalls,I));
            if(covered<width*depth-1e4)f.daReasons.push('NO_FULL_EXISTING_ROW');
            if(!f.reached)f.daReasons.push('AISLE_UNREACHED');
            f.daState=f.daReasons.length?'rejected':'candidate-unverified';
            if(!f.daReasons.length){const paths=boolOp([gross],[],U);da.push({id:'depth-da-'+id,kind:'da',paths,source:'hypothesis',status:'proposal',areaM2:A(paths)/1e6});walls.push({id,pts:wall});claimed.push(wall,...paths);}
          }
          if(cls==='inner'&&hi-lo>=width){
            const endRow=add(start,mul(u,Math.floor((hi-lo)/width)*width));
            const row1=quad(start,endRow,n,0,depth),row2=quad(start,endRow,n,depth,2*depth);
            const nextFront=[add(start,mul(n,2*depth)),add(endRow,mul(n,2*depth))];
            const frontage=quad(nextFront[0],nextFront[1],n,0,300),need=(len(sub(endRow,start)))*300;
            const firstStrip=quad(start,endRow,n,-300,0),firstNeed=len(sub(endRow,start))*300;
            const checks={actualDepthMatches:depth===5000,noStaticCollision:A(boolOp([row1,row2],physical,I))<=1e4,
              noAisleThroughRows:A(boolOp([row1,row2],plan.aisles,I))<=1e4,
              insideDomain:A(boolOp([row1,row2],domain,D))<=1e4,
              firstFrontOnAisle:A(boolOp([firstStrip],plan.aisles,I))>=firstNeed-1e4,
              secondFrontOnAisle:A(boolOp([frontage],plan.aisles,I))>=need-1e4};
            const probe=add(add(nextFront[0],mul(u,len(sub(endRow,start))/2)),mul(n,half));
            const next=plan.graph.edges.find(e=>e!==edge&&e.reached&&e.ok!==false&&
              G.segDist(probe,plan.graph.nodes[e.a].p,plan.graph.nodes[e.b].p)<100);
            checks.nextAisleReached=!!next;checks.firstAisleReached=f.reached&&edge.ok!==false;
            const existingCoverage=A(boolOp([row1,row2],stalls,I))/A([row1,row2]);
            f.mirror={row1,row2,nextFront,checks,existingCoverage,
              state:Object.values(checks).every(Boolean)?'geometry-only-unverified':'rejected'};
          }
        }
        sections.push({edgeId:edge.id,rangeMm:[lo,hi],sides:pair,classification:laneClass(...pair)});
      }
    }
    const occupiedDA=da.flatMap(z=>z.paths),wallPaths=boolOp(walls.map(w=>w.pts),[],U);
    return {schema:'aisle-depth-hypothesis/1',classificationDepthMm:[5000,10000],assumedDAWallMm:wallMm,
      actualStallMm:[width,depth],faces,sections,unmeasured,da,walls,
      otherFree:boolOp(free,occupiedDA.concat(wallPaths),D),daAreaM2:A(occupiedDA)/1e6,wallAreaM2:A(wallPaths)/1e6,
      status:'UNVERIFIED',limits:['10m class does not prove two-row access','DA function, drainage, ventilation, wall design and swept paths unverified',
        'Existing aisles and stalls retained; no new aisle search or extra stalls claimed','Graph edges shorter than one stall width are not proposed']};
  }
  function apply(plan,input){
    const depthHypothesis=analyze(plan,input);
    const manual=(plan.nonParkingZones||[]).filter(z=>z.source==='input'||z.assigned);
    // Only replace automatic use suggestions; preserve explicit and assigned uses and every parking/route object.
    const candidate={...plan,depthHypothesis,nonParkingZones:manual.concat(depthHypothesis.da)};
    const free=boolOp(depthHypothesis.otherFree.concat(depthHypothesis.da.flatMap(z=>z.paths)),[],U);
    const zoning=Zones.calculate(candidate,{...input,autoZones:false,zoneAssignments:[],nonParkingZones:candidate.nonParkingZones},free);
    candidate.nonParkingZones=zoning.zones.map(z=>manual.find(m=>m.id===z.id)||{...z,source:'auto',hypothesis:true,status:'proposal'});
    candidate.areas={...zoning.areas,hypothesisWallM2:depthHypothesis.wallAreaM2};
    candidate.parkingSurface=boolOp(zoning.parkingSurface,depthHypothesis.walls.map(w=>w.pts),D);
    candidate.areas.parkingSurfaceM2=A(candidate.parkingSurface)/1e6;candidate.unassignedFree=zoning.remaining;
    candidate.depthHypothesis.zoneIssues=(node?require('./CLAUDE_ugp_verify.js'):root.UGP.verify).checkZones(candidate,input);
    return candidate;
  }
  const api={classify,laneClass,analyze,apply};
  if(node)module.exports=api;else{
    root.UGAisleDepth=api;
    if(new URLSearchParams(location.search).get('depthHypothesis')==='1'){
      const original=root.UGPlan.generate;
      root.UGPlan.generate=function(input){return apply(original(input),input);};
      document.addEventListener('DOMContentLoaded',()=>{
        const originalDraw=root.UGPlanningUI.drawZones;
        root.UGPlanningUI.drawZones=function(group,plan){
          originalDraw(group,plan);if(!plan?.depthHypothesis)return;
          const svg=(tag,attrs,title)=>{const e=document.createElementNS('http://www.w3.org/2000/svg',tag);
            for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);
            const t=document.createElementNS(e.namespaceURI,'title');t.textContent=title;e.append(t);group.append(e);};
          for(const w of plan.depthHypothesis.walls)svg('polygon',{points:w.pts.map(p=>p.join(',')).join(' '),fill:'#444',
            'data-depth-wall':w.id},'DA 벽 후보 · 두께 200mm 가정 · 구조 미검증');
          for(const f of plan.depthHypothesis.faces){const a=f.start,b=f.end;
            svg('line',{x1:a[0],y1:a[1],x2:b[0],y2:b[1],stroke:f.classification==='short'?'#9c503c':'#6a817b',
              'stroke-width':1,'vector-effect':'non-scaling-stroke','data-depth-face':f.id},
              `${f.id}: d ${(f.dMinMm/1000).toFixed(2)}~${(f.dMaxMm/1000).toFixed(2)}m · ${f.classification}`);
          }
        };
        const note=document.createElement('p');note.id='depthHypothesisNotice';note.textContent='깊이 가설 실험 · DA와 벽은 후보 · 기능과 차량 조향 미검증';
        document.querySelector('.workspace-bar')?.after(note);
      },{once:true});
    }
  }
})(this);
