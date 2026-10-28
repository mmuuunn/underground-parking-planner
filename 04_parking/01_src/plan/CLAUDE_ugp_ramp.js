/* 지하주차 계획 엔진 — S3 램프.
 * 램프 = 몸체(벽처럼 빠짐) + 착지점 + 착지 방향. 지금은 직선 생성기 하나(곡선은 로드맵 단계 1).
 * 착지는 고정된 차로 격자선(가로 램프 y = Y0 + m·gy, 세로 램프 x = 기둥 사이 가운데)에 붙인다. 놓은 자리에서 가까운 선부터 시도해
 * 착지에서 같은 축으로 곧게 순환 차로에 닿는 첫 자리를 쓴다(같은 입력이면 늘 같은 자리). 그 접속선이 동선의 시작이다.
 */
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const Gm = isNode ? require('./CLAUDE_ugp_geom.js') : root.UGP.geom;
  const Net = isNode ? require('./CLAUDE_ugp_network.js') : root.UGP.network;
  const Curve = isNode ? require('./CLAUDE_ugp_curve_ramp.js') : root.UGP.curveRamp;
  const {CL, add, sub, mul, len, boolOp, areaOf, rayHits} = Gm;

  // Public geometry contract, independent of the grid and placement policy.
  // Only a straight generator is supplied; body/landing/tangent can be consumed
  // without reconstructing a rectangle from its bounding box.
  function createStraight(spec) {
    const landing = spec.landing || [spec.x, spec.y], raw = spec.tangent || Gm.rot([1,0], spec.angleDeg || 0);
    if (!landing.every(Number.isFinite) || !raw.every(Number.isFinite) || !(len(raw)>0) || !(spec.widthMm>0) || !(spec.lengthMm>0)) throw new RangeError('직선 램프의 착지·접선·폭·길이가 올바르지 않습니다');
    const tangent = mul(raw,1/len(raw)), n=[-tangent[1],tangent[0]], start=add(landing,mul(tangent,-spec.lengthMm)), h=spec.widthMm/2;
    return {kind:'straight',body:[add(start,mul(n,-h)),add(landing,mul(n,-h)),add(landing,mul(n,h)),add(start,mul(n,h))],landing:landing.slice(),tangent,widthMm:spec.widthMm,lengthMm:spec.lengthMm,start};
  }
  function assessApproach(path,rings,tangent){
    const angle=(a,b)=>Math.acos(Math.max(-1,Math.min(1,Gm.dot(a,b)/(len(a)*len(b)||1))))*180/Math.PI;
    const legs=path.slice(1).map((p,i)=>sub(p,path[i])).filter(v=>len(v)>1),angles=[];
    for(let i=1;i<legs.length;i++){const v=angle(legs[i-1],legs[i]);if(v>5)angles.push(v);}
    const end=path.at(-1),incoming=legs.at(-1)||tangent;let near=null;
    if(end)for(const P of rings)for(let i=0;i<P.length;i++){const a=P[i],b=P[(i+1)%P.length],d=Gm.segDist(end,a,b);if(!near||d<near.d)near={P,i,d};}
    if(near){const {P,i}=near,n=P.length,a=P[i],b=P[(i+1)%n],v=sub(b,a),u=Gm.norm(v),dot=Gm.dot(incoming,u),cross=incoming[0]*u[1]-incoming[1]*u[0],sign=Math.abs(dot)>1e-6?(dot>=0?1:-1):(cross<=0?1:-1);
      const f=Math.max(0,Math.min(1,Gm.dot(sub(end,a),v)/(len(v)**2||1))),p=add(a,mul(v,f));let direction=mul(u,sign),distance=len(sub(sign>0?b:a,p)),cornerIndex=sign>0?i+1:i;
      // At a vertex the incoming edge has zero remaining length. Use the
      // outgoing tangent, rather than counting two phantom 90-degree turns.
      if(distance<=1){const q=P[(cornerIndex+n)%n],r=P[(cornerIndex+sign+n)%n];direction=Gm.norm(sub(r,q));distance=len(sub(r,q));cornerIndex+=sign;}
      const join=angle(incoming,direction);if(join>5)angles.push(join);
      for(let k=0;k<n&&distance<=6000+1;k++){const index=(cornerIndex+sign*k+n*2)%n,q=P[index],r=P[(index+sign+n)%n],next=sub(r,q);if(len(next)<1)continue;const turn=angle(direction,next);if(turn>5)angles.push(turn);direction=next;distance+=len(next);}
    }
    const first=legs.length?Math.round(len(legs[0])):0,turns=angles.map(a=>Math.round(a*10)/10),accepted=!!end&&(turns.length===0||first>=6000&&turns.length===1&&angles[0]<=90.5);
    return {points:path,firstStraightMm:first,turnAnglesDeg:turns,turnCount:turns.length,accepted,summary:end?`착지 뒤 ${(first/1000).toFixed(3)}m 직진 · ${turns.length?turns.map(a=>a.toFixed(1)+'°').join(' → ')+' 꺾임 '+turns.length+'번':'꺾임 없음'}${accepted?'':' — 합류 모양 확인 필요'}`:'착지에서 차로로 이어지는 길이 없습니다'};
  }
  function joinGeometry(G, input, base, violations) {
    const original=input.ramp;
    if(!Array.isArray(original.body)||original.body.length<3||!original.body.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite))||!Array.isArray(original.landing)||!original.landing.every(Number.isFinite)||!Array.isArray(original.tangent)||!original.tangent.every(Number.isFinite)||!(len(original.tangent)>0)||!(original.widthMm>0))throw new RangeError('램프의 몸체·착지·접선·폭이 올바르지 않습니다');
    const shape = r => {
      const body=r.body.map(G.L),p=G.L(r.landing),u=Gm.norm(G.L(r.tangent)),ar=boolOp([G.inner],[body],CL.ClipType.ctDifference),ln=Net.lanes(G,body);
      return {r,body,p,u,ar,ln,hit:ln.ringCL.length?rayHits(p,u,ln.ringCL)[0]:null};
    };
    let chosen=shape(original);
    // 몸체가 있는 램프도 차로 축과 평행하면 가장 가까운 격자선의 착지를 먼저 시도한다.
    // 곡선은 반드시 원 생성기로 다시 만든다. 몸체만 옮기면 판정 도형·고도가 어긋난다.
    if(!chosen.hit){
      const {p,u}=chosen, horizontal=Math.abs(u[0])>0.9999,vertical=Math.abs(u[1])>0.9999;
      if(horizontal||vertical){
        const target=horizontal?[p[0],G.lineY(Math.round((p[1]-G.Y0)/G.gy))]:[G.midX(Math.round((p[0]-G.X0)/G.cfg.gx-.5)),p[1]];
        if(len(sub(target,p))>1){
          const landing=G.W(target).map(Math.round);
          const shifted=original.kind==='curve'?(original.spec?Curve.createCurve({...original.spec,landing,tangent:original.tangent,turn:original.turn}):null):createStraight({landing,tangent:original.tangent,widthMm:original.widthMm,lengthMm:original.lengthMm});
          if(shifted?.body){
            const next=shape(shifted),mass=input.mass.map(G.L),outside=Math.abs(areaOf(boolOp([next.body],[mass],CL.ClipType.ctDifference)));
            if(next.hit&&(input.allowExternalRamp===true||outside<=1e6))chosen=next;
          }
        }
      }
    }
    const {r,body,p,u,ar,ln}=chosen;
    let hit=chosen.hit,turn=null,destinationSegment=null;
    if(!hit){
      let best=null;
      for(const sg of ln.segs)for(let t=0;t<=1;t+=.05){const q=add(sg.a,mul(sub(sg.b,sg.a),t)),f=Gm.dot(sub(q,p),u);if(f<G.a/2)continue;const dd=len(sub(q,p));if(!best||dd<best.dd)best={q,c:add(p,mul(u,f)),dd,sg};}
      if(best){const legs=[[p,best.c],[best.c,best.q]].filter(([x,y])=>len(sub(y,x))>1),co=new CL.ClipperOffset(2,2),bands=new CL.Paths();legs.forEach(([x,y])=>co.AddPath(Gm.toC([x,y]),CL.JoinType.jtMiter,CL.EndType.etOpenButt));co.Execute(bands,G.a/2-50);if(legs.length&&Math.abs(areaOf(boolOp(bands.map(Gm.fromC),ar,CL.ClipType.ctDifference)))<1e6){hit=best.c;turn=best.q;destinationSegment=best.sg;}}
    }
    const path=hit?[p,hit,...(turn?[turn]:[])]:[];
    const approachInfo=assessApproach(path,ln.ringCL,u);
    if(!approachInfo.accepted)violations.push({id:'RAMP_OFFGRID',note:approachInfo.summary,at:G.W(p).map(Math.round)});
    // 곡선은 직선 17% 검사를 쓰지 않는다 — 경사는 판정기 R02가 구간별로 본다
    const curve=r.kind==='curve',slope=!curve&&Number.isFinite(input.floorMm)&&r.lengthMm>0?Math.round(input.floorMm/r.lengthMm*1000)/10:null;
    if(slope!==null&&slope>17)violations.push({id:'RAMP_SLOPE',note:`램프 경사 ${slope}%가 직선 기준 17%를 넘습니다 — 길이를 늘리세요`});
    if(hit)ln.segs.push({a:p.slice(),b:len(sub(hit,p))>1?hit:add(p,mul(u,1)),kind:'ramp',h:null,v:null});
    if(turn)ln.segs.push({a:hit.slice(),b:turn,kind:'ramp',h:null,v:null});
    return {rampOut:{...(curve?{kind:'curve',id:r.id,sourceRamp:r}:{}),body,landing:p,u,widthMm:r.widthMm,lengthMm:r.lengthMm??null,start:r.start?G.L(r.start):null,slopePct:slope,shiftMm:Math.round(len(sub(r.landing,original.landing))),approach:path,approachInfo},area:ar,lanesOut:ln};
  }

  // 반환: {rampOut, area(실내 면 − 몸체), lanesOut(램프를 반영한 동선망, 접속선 포함)}. 위반은 violations에 더한다
  function placeRamp(G, input, base, violations) {
    const {cfg, inner, L, gy, lineY, midX} = G, X0 = G.X0, Y0 = G.Y0;
    if (!input.ramp) return {rampOut: null, area: [inner], lanesOut: base};
    if (input.ramp.body) return joinGeometry(G,input,base,violations);
    const r = input.ramp, k = ((Math.round(((r.angleDeg - G.ucs) % 360 + 360) % 360 / 90)) % 4), u = [[1, 0], [0, 1], [-1, 0], [0, -1]][k], p0 = L([r.x, r.y]), h = r.widthMm / 2, n2 = [-u[1], u[0]];
    const m0 = k % 2 === 0 ? Math.round((p0[1] - Y0) / gy) : Math.round((p0[0] - X0) / cfg.gx - .5), tries = [0, 1, -1, 2, -2, 3, -3];
    const slope = Number.isFinite(input.floorMm) ? Math.round(input.floorMm / r.lengthMm * 1000) / 10 : null;
    let first = null; const massL = input.mass.map(L);
    for (const dm of tries) {
      const p = p0.slice(); if (k % 2 === 0) p[1] = lineY(m0 + dm); else p[0] = midX(m0 + dm);
      const straight=createStraight({landing:p,tangent:u,widthMm:r.widthMm,lengthMm:r.lengthMm}), back=straight.start, body=straight.body;
      const ar = boolOp([inner], [body], CL.ClipType.ctDifference), ln = Net.lanes(G, body), hit = ln.ringCL.length ? rayHits(p, u, ln.ringCL)[0] : null;
      const cand = {rampOut: {body, landing: p, start: back, u, k, slopePct: slope, lengthMm: r.lengthMm, widthMm: r.widthMm, shiftMm: Math.round(len(sub(p, p0)))}, area: ar, ln, hit};
      // 매스 밖으로 나가는 자리는 고르지 않는다(외벽 바깥면 기준 — 벽을 뚫고 들어오는 램프는 정상). 모두 밖이면 첫 자리를 두고 위반으로 알린다
      cand.outside = input.allowExternalRamp!==true&&Math.abs(areaOf(boolOp([body], [massL], CL.ClipType.ctDifference))) > 1e6;
      if (!first) first = cand;
      if (hit && !cand.outside) { first = cand; break; }
    }
    // 격자선 위에 매스 안이면서 이어지는 자리가 없으면(좁은 날개 등): 놓은 자리 그대로 두고 착지에서 곧게 가다 처음 만나는 순환 차로에 합류(꺾어 합류)
    if (!first.hit || first.outside) {
      const p = p0.slice(), straight=createStraight({landing:p,tangent:u,widthMm:r.widthMm,lengthMm:r.lengthMm}), back=straight.start, body=straight.body;
      if (input.allowExternalRamp===true||Math.abs(areaOf(boolOp([body], [massL], CL.ClipType.ctDifference))) <= 1e6) {
        const ln = Net.lanes(G, body), ar = boolOp([inner], [body], CL.ClipType.ctDifference);
        let hit = ln.ringCL.length ? rayHits(p, u, ln.ringCL)[0] : null, turn = null;
        // 곧게 가서 안 닿으면 한 번 꺾어 잇는다: 착지 앞쪽에서 가장 가까운 순환 차로 점 q, 꺾는 점 c = 착지 축 위 q의 발. 두 다리의 차로 폭(a)이 실내 면(램프 뺀) 안이어야 한다
        if (!hit) {
          let best = null;
          for (const sg of ln.segs) for (let t = 0; t <= 1; t += .05) { const q = add(sg.a, mul(sub(sg.b, sg.a), t)), f = (q[0] - p[0]) * u[0] + (q[1] - p[1]) * u[1]; if (f < G.a / 2) continue; const dd = len(sub(q, p)); if (!best || dd < best.dd) best = {q, c: add(p, mul(u, f)), dd}; }
          if (best) {
            const legs = [[p, best.c], [best.c, best.q]].filter(([x, y]) => len(sub(y, x)) > 1), co = new CL.ClipperOffset(2, 2), band = new CL.Paths();
            legs.forEach(([x, y]) => co.AddPath(Gm.toC([x, y]), CL.JoinType.jtMiter, CL.EndType.etOpenButt)); co.Execute(band, G.a / 2 - 50);
            if (legs.length && Math.abs(areaOf(boolOp(band.map(Gm.fromC), ar, CL.ClipType.ctDifference))) < 1e6) { hit = best.c; turn = best.q; }
          }
        }
        if (hit) { first = {rampOut: {body, landing: p, start: back, u, k, slopePct: slope, lengthMm: r.lengthMm, widthMm: r.widthMm, shiftMm: 0, turn}, area: ar, ln, hit, outside: false};
          violations.push({id: 'RAMP_OFFGRID', note: '램프 착지 축이 차로 격자선에 맞지 않아 착지 뒤 꺾어 합류합니다 — 격자선(차로 축)에 맞는 자리로 옮기면 곧게 이어집니다'}); }
      }
    }
    const {rampOut, area} = first, lanesOut = first.ln;
    if (slope !== null && slope > 17) violations.push({id: 'RAMP_SLOPE', note: `램프 경사 ${slope}%가 직선 기준 17%를 넘습니다 — 길이를 늘리세요`});
    // 매스 밖·접속 없음은 S7 독립 검사가 최종 도형으로 판정한다
    if (first.hit) lanesOut.segs.push({a: rampOut.landing.slice(), b: len(sub(first.hit, rampOut.landing)) > 1 ? first.hit : add(rampOut.landing, mul(u, 1)), kind: 'ramp', h: null, v: null});
    if (first.hit && rampOut.turn) lanesOut.segs.push({a: first.hit.slice(), b: rampOut.turn, kind: 'ramp', h: null, v: null});
    rampOut.approach=first.hit?[rampOut.landing,first.hit,...(rampOut.turn?[rampOut.turn]:[])]:[];
    rampOut.approachInfo=assessApproach(rampOut.approach,lanesOut.ringCL,u);
    if(!rampOut.approachInfo.accepted){const existing=violations.find(v=>v.id==='RAMP_OFFGRID');if(existing)Object.assign(existing,{note:rampOut.approachInfo.summary,at:G.W(rampOut.landing).map(Math.round)});else violations.push({id:'RAMP_OFFGRID',note:rampOut.approachInfo.summary,at:G.W(rampOut.landing).map(Math.round)});}
    return {rampOut, area, lanesOut};
  }
  const api = {placeRamp, createStraight};
  if (isNode) module.exports = api; else (root.UGP = root.UGP || {}).ramp = api;
})(this);
