/* Geometry types and use attributes have separate quotas. A physical space is
 * counted once. Allocation precedes the final independent geometry check.
 */
(function(root){
  'use strict';
  const node=typeof module!=='undefined'&&module.exports,G=node?require('./CLAUDE_ugp_geom.js'):root.UGP.geom;
  const M=node?require('./stall-modules.js'):root.UGP.stallModules;
  const {CL,boolOp,areaOf,bbox,boxHit}=G,I=CL.ClipType.ctIntersection,D=CL.ClipType.ctDifference;
  const LABEL={accessible:'장애인',expanded:'확장형',compact:'경형',electric:'친환경차 전용',charging:'충전',women:'여성우선',family:'가족배려'};
  const DIM=['accessible','expanded','compact'],USE=['charging','electric','family','women'];
  const area=ps=>Math.abs(areaOf(ps)),mid=P=>[0,1].map(k=>P.reduce((n,p)=>n+p[k],0)/P.length);
  function rule(raw,key){
    if(raw===false||raw==null||raw.mode==='off')return null;
    if(typeof raw!=='object'||!['ratio','count'].includes(raw.mode)||!Number.isFinite(raw.value)||raw.value<0||raw.mode==='ratio'&&raw.value>1||raw.mode==='count'&&!Number.isInteger(raw.value))throw new RangeError(LABEL[key]+' 목표는 비율(0–1) 또는 정수 대수로 입력하세요');
    const rounding=raw.rounding||(key==='electric'?'round':'ceil');
    if(!['ceil','round','floor'].includes(rounding))throw new RangeError('주차 목표의 끝수 처리 방식이 올바르지 않습니다');
    for(const k of ['basisTotal','minTotal','minimum'])if(raw[k]!==undefined&&(!Number.isInteger(raw[k])||raw[k]<0))throw new RangeError('주차 목표의 산정 대수와 하한을 확인하세요');
    return {...raw,rounding,minTotal:raw.minTotal??(key==='accessible'&&raw.mode==='ratio'?10:0),minimum:raw.minimum??0};
  }
  function rules(input,hasDoors){
    const provided=input.parkingOptions||{};
    if(typeof provided!=='object'||Array.isArray(provided))throw new RangeError('주차 옵션 형식이 올바르지 않습니다');
    for(const k of Object.keys(provided))if(!(k in LABEL))throw new RangeError('알 수 없는 주차 옵션: '+k);
    if(input.accessibleRate!==undefined&&(!Number.isFinite(input.accessibleRate)||input.accessibleRate<0||input.accessibleRate>1))throw new RangeError('장애인 칸 비율은 0–1입니다');
    const result={};for(const k of Object.keys(LABEL))result[k]=rule(provided[k],k);
    const legacy=!Object.prototype.hasOwnProperty.call(provided,'accessible');
    if(legacy&&input.accessible!==false&&hasDoors)result.accessible=rule({mode:'ratio',value:input.accessibleRate??0.03,source:input.accessibleRate===undefined?'default':'input'},'accessible');
    return {result,legacy};
  }
  function required(r,n){
    if(!r)return 0;const base=r.basisTotal??n;
    if(base<r.minTotal)return r.minimum;
    const v=r.mode==='count'?r.value:base*r.value;
    return Math.max(r.minimum,r.mode==='count'?v:r.rounding==='ceil'?Math.ceil(v-1e-9):r.rounding==='floor'?Math.floor(v+1e-9):Math.floor(v+0.5+1e-9));
  }
  function counts(stalls){
    const dimensions={normal:0,expanded:0,compact:0,accessible:0},uses={electric:0,charging:0,women:0,family:0};
    for(const s of stalls){dimensions[s.stallType||'normal']=(dimensions[s.stallType||'normal']||0)+1;for(const k of new Set(s.uses||[]))if(k in uses)uses[k]++;}
    return {total:stalls.length,dimensions,uses};
  }
  function summary(stalls,rs){
    const c=counts(stalls),requirements={};for(const [k,r]of Object.entries(rs))if(r){const need=required(r,c.total),placed=DIM.includes(k)?c.dimensions[k]:c.uses[k];requirements[k]={label:LABEL[k],mode:r.mode,value:r.value,rounding:r.rounding,basisTotal:r.basisTotal??c.total,need,placed,short:Math.max(0,need-placed),excess:Math.max(0,placed-need),source:r.source||'project'};}
    return {...c,requirements};
  }
  function allocate(frame,out,state,input){
    const doors=out.cores.filter(c=>c.plan).map(c=>mid(c.plan.openings.find(o=>o.id==='ENT')?[c.plan.openings.find(o=>o.id==='ENT').a,c.plan.openings.find(o=>o.id==='ENT').b]:c.plan.walk));
    const {result:rs,legacy}=rules(input,doors.length>0),Gf=frame,mods=M.catalogue(frame.cfg,input.stallModules);
    let kept=out.stalls.filter((s,i)=>['ok','deadSide'].includes(state[i]));
    const eligible=new Set(out.stalls.filter((s,i)=>state[i]==='ok'));
    const rowMap=new Map((out.stallRows||[]).map(r=>[r.id,r])),bays=new Map();
    for(const s of kept){
      if(!eligible.has(s)||s.stallType!=='normal')continue;const row=rowMap.get(s.rowId);if(!row||!['h','v'].includes(row.axis))continue;
      const axis=row.axis==='h'?0:1,bb=bbox(s.pts.map(frame.L));
      let step=axis===0?frame.cfg.gx:frame.gy,base=axis===0?frame.X0:frame.Y0+frame.gy/2,bin=Math.floor((bb[axis]-base+1)/step);
      if(frame.columnAxes){
        const lines=axis===0?frame.columnAxes.x:frame.columnAxes.y;
        bin=lines.findIndex((v,i)=>i<lines.length-1&&bb[axis]>=v-1&&bb[axis+2]<=lines[i+1]+1);
        if(bin<0)continue; // A stall spanning an axis is not a complete structural bay for conversion.
        base=lines[bin];step=lines[bin+1]-base;
      }else base+=bin*step;
      const id=s.rowId+'|'+bin;
      if(!bays.has(id))bays.set(id,{id,row,axis,step,base,items:[],boxes:[]});const b=bays.get(id);b.items.push(s);b.boxes.push(bb);
    }
    const blocker=out.aisles.concat(out.columns,out.cores.map(c=>c.pts),(out.occupants||[]).map(c=>c.pts),out.cores.filter(c=>c.plan).map(c=>c.plan.walk),out.ramp?[out.ramp.body]:[],(out.nonParkingZones||[]).flatMap(z=>z.paths));
    const blockBoxes=blocker.map(P=>({P,b:bbox(P)})),reservationBoxes=(out.parkingReservations||[]).map(c=>({P:c.pts,b:bbox(c.pts)})),allowed=out.parkingInnerPaths||[out.innerOutline];
    const overlaps=(P,Q)=>area(boolOp([P],Q,I))>1e4;
    function clear(P,others,ignoreReservation=false){const b=bbox(P);return area(boolOp([P],allowed,D))<=1e4&&!overlaps(P,blockBoxes.filter(q=>boxHit(b,q.b)).map(q=>q.P))&&!overlaps(P,others.filter(s=>boxHit(b,bbox(s.pts))).map(s=>s.pts))&&(ignoreReservation||!overlaps(P,reservationBoxes.filter(q=>boxHit(b,q.b)).map(q=>q.P)));}
    const crossings=(a,b)=>out.graph.edges.filter(e=>{const c=out.graph.nodes[e.a].p,d=out.graph.nodes[e.b].p,o=(p,q,r)=>Math.sign((q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]));return o(a,b,c)*o(a,b,d)<0&&o(c,d,a)*o(c,d,b)<0;}).length;
    const proximity=P=>{const c=mid(P);return doors.length?doors.map(d=>[crossings(d,c),Math.hypot(c[0]-d[0],c[1]-d[1])]).sort((a,b)=>a[0]-b[0]||a[1]-b[1])[0]:[0,0];};
    const locked=new Set(),changes=[];
    function conversion(b,key){
      const spec=mods[key];if(!(spec.widthMm>0&&spec.depthMm>0))throw new RangeError(LABEL[key]+' 칸의 폭과 깊이를 확인하세요');
      if(spec.widthMm<M.CATALOGUE[key].widthMm||spec.depthMm<M.CATALOGUE[key].depthMm)throw new RangeError(LABEL[key]+' 칸의 폭·깊이가 기본 최소 치수보다 작습니다');
      if(!b.items.every(s=>kept.includes(s)))return null;
      const axis=b.axis,other=1-axis,full=axis===0;
      const normalCount=frame.columnAxes?Math.floor((b.step-frame.cfg.columnMm)/frame.cfg.stallW):frame.n;
      if(full&&b.items.length!==normalCount)return null;
      const low=full?b.base+frame.cfg.columnMm/2:Math.min(...b.boxes.map(q=>q[axis]));
      const high=full?b.base+b.step-frame.cfg.columnMm/2:Math.max(...b.boxes.map(q=>q[axis+2]));
      const n=Math.floor((high-low+1)/spec.widthMm);if(!n)return null;
      const off=low+(high-low-n*spec.widthMm)/2,front=b.row.coordinateMm+b.row.side*frame.a/2,otherStalls=kept.filter(s=>!b.items.includes(s)),add=[];
      let skippedReservation=false;
      for(let i=0;i<n;i++){
        const lo=off+i*spec.widthMm,hi=lo+spec.widthMm,back=front+b.row.side*spec.depthMm;
        const q=axis===0?[lo,Math.min(front,back),hi,Math.max(front,back)]:[Math.min(front,back),lo,Math.max(front,back),hi];
        const pts=G.rectPoly(q).map(p=>frame.W(p).map(Math.round)),others=otherStalls.concat(add);
        if(!clear(pts,others)){
          if(clear(pts,others,true)){skippedReservation=true;continue;}
          return null;
        }
        add.push({pts,kind:b.items[0].kind,rowId:b.items[0].rowId,stallType:key,widthMm:spec.widthMm,depthMm:spec.depthMm,uses:[],allocationBay:b.id});
      }
      // A reservation may split a bay, but partial conversion must not discard valid capacity.
      if(!add.length||skippedReservation&&add.length<b.items.length)return null;
      const near=proximity(add[0].pts);return {b,key,add,near,cost:(b.items.length-add.length)/add.length};
    }
    // Every successful step consumes a different bay. Final-total quotas cannot cause a cycle.
    for(let step=0;step<bays.size;step++){
      const c=counts(kept);let choice=null;
      for(const key of DIM){
        if(!rs[key]||key==='accessible'&&!doors.length||c.dimensions[key]>=required(rs[key],c.total))continue;
        const candidates=[...bays.values()].filter(b=>!locked.has(b.id)).map(b=>conversion(b,key)).filter(Boolean);
        candidates.sort((a,b)=>(key==='accessible'?a.near[0]-b.near[0]||a.near[1]-b.near[1]:a.cost-b.cost)||a.b.id.localeCompare(b.b.id));
        if(candidates.length){choice=candidates[0];break;}
      }
      if(!choice)break;
      const {b,key,add}=choice;locked.add(b.id);kept=kept.filter(s=>!b.items.includes(s)).concat(add);changes.push({bayId:b.id,type:key,before:b.items.length,after:add.length});
    }
    // Attributes change neither dimensions nor physical count. Charging is a subset of electric.
    kept=kept.map(s=>({...s,uses:[...new Set(s.uses||[])]}));
    for(const key of USE){
      const r=rs[key];if(!r)continue;
      let remaining=required(r,kept.length)-counts(kept).uses[key];
      const allowedTypes=r.allowedTypes||['normal','expanded'];
      const candidates=kept.filter(s=>!s.uses.includes(key)&&allowedTypes.includes(s.stallType||'normal')&&s.uses.every(u=>(key==='charging'&&u==='electric')||(key==='electric'&&u==='charging')||(r.allowOverlapWith||[]).includes(u)));
      candidates.sort((a,b)=>key==='charging'?(Number(b.uses.includes('electric'))-Number(a.uses.includes('electric'))||proximity(a.pts)[1]-proximity(b.pts)[1]):proximity(a.pts)[1]-proximity(b.pts)[1]);
      for(const s of candidates){if(remaining--<=0)break;if(key==='charging'&&!s.uses.includes('electric'))s.uses.push('electric');s.uses.push(key);}
    }
    return {stalls:kept,rules:rs,legacy,changes,summary:summary(kept,rs)};
  }
  const api={allocate,summary,required,rules,counts};if(node)module.exports=api;else(root.UGP=root.UGP||{}).allocation=api;
})(this);
