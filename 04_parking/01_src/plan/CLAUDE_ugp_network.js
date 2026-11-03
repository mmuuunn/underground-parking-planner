/* 지하주차 계획 엔진 — S4 동선망 1번 생성기(격자 칸 합집합 순환 + 가지 + 안쪽 줄).
 * V = 실내 면을 (칸 깊이 d + 차로 반 a/2) 줄인 영역(램프 옆은 a/2만). 순환 영역 = V 안에 통째로 드는 격자 칸의 합 ∪ 사선 변 근처의 V.
 * 그 경계를 a/2로 열고(가는 부분 제거) 다듬은 것이 순환 중심선. 순환이 못 들어간 좁은 날개는 격자선 하나로 가지 차로.
 * 안쪽 줄 차로는 순환·가지·다른 줄에서 2·gy 이상 떨어진 격자선. 결과는 차로 중심선 조각 목록 segs({a,b,kind,h|v,ri}).
 */
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const Gm = isNode ? require('./CLAUDE_ugp_geom.js') : root.UGP.geom;
  const {CL, add, sub, mul, dot, len, bbox, rectPoly, signedArea, toC, fromC, offsP, boolOp, areaOf, segDist, hSpans, vSpans, minus, norm, meet, selfCrossing, clean, isH, isV} = Gm;

  // 순환 중심선 다듬기: 축과 나란한 변이 격자선에서 조금(차로 반 이내) 어긋나 있으면 안쪽 격자선으로 민다.
  //   사선 근처를 벽 따라 둔 부분과 격자 칸 부분이 만나는 곳의 미세한 꺾임이 여기서 없어진다. 밀어서 자기교차가 생기면 그 변은 둔다.
  function tidy(G, P0) {
    const {cfg, a, gy, lineY, midX} = G, X0 = G.X0, Y0 = G.Y0;
    const sg0 = Math.sign(signedArea(P0)), nIn = (u) => (sg0 > 0 ? [-u[1], u[0]] : [u[1], -u[0]]);
    const push = (P, i, t) => { const n2 = P.length, p = P[i], q = P[(i + 1) % n2], u = norm(sub(q, p)), nv = nIn(u), p2 = add(p, mul(nv, t)), pa = P[(i + n2 - 1) % n2], nb = P[(i + 2) % n2]; const A = meet(p2, u, pa, sub(p, pa)) || p2, B = meet(p2, u, nb, sub(q, nb)) || add(q, mul(nv, t)); const Q = P.map((x) => x.slice()); Q[i] = A; Q[(i + 1) % n2] = B; return Q; };
    let P = P0.map((x) => x.slice());
    for (let i = 0; i < P.length; i++) {
      const p = P[i], q = P[(i + 1) % P.length], nv = nIn(norm(sub(q, p))); let t = 0;
      if (isH(p, q)) { const tgt = nv[1] > 0 ? lineY(Math.ceil((p[1] - Y0) / gy - 1e-6)) : lineY(Math.floor((p[1] - Y0) / gy + 1e-6)); t = Math.abs(tgt - p[1]); }
      else if (isV(p, q)) { const tgt = nv[0] > 0 ? midX(Math.ceil((p[0] - X0) / cfg.gx - .5 - 1e-6)) : midX(Math.floor((p[0] - X0) / cfg.gx - .5 + 1e-6)); t = Math.abs(tgt - p[0]); }
      if (t > 1 && t < a / 2) { const Q = push(P, i, t); if (!selfCrossing(Q)) P = Q; }
    }
    return clean(P);
  }

  // 순환 중심선 펴기(= 차량 동선): 차가 달릴 수 없는 꼭짓점을 나쁜 것부터 고친다.
  //   · 짧은 조각(a 미만)에 붙은 90°보다 급한 꺾임(톱니 잡음, 사선깎임의 뾰족한 V자) → 꼭짓점을 지운다
  //   · 긴 두 변이 만나는 90°보다 급한 꺾임(예각 매스 모서리) → 모서리를 짧은 변의 절반(최대 a)만큼 깎아 반씩 두 번 꺾는다(지우면 차로가 크게 잘린다)
  //   · 앞뒤 변이 같은 방향으로 나란한 짧은 계단 조각(살짝 기운 벽을 격자 칸으로 따라간 전변사선) → 앞 변이나 뒤 변을 다른 쪽 선으로 옮겨
  //     한 직선으로 잇는다(비스듬히 이으면 차로가 기울어 그 옆 직교 칸 줄이 무너진다). 옮긴 변 끝은 이웃 변을 따라 미끄러진다
  //   새 선분이 Vt(중심선이 놓일 수 있는 범위) 안이고 자기교차가 없을 때만 고친다
  function straighten(G, P, Vt) {
    const a = G.a, turn = (p, q, r) => { const u = sub(q, p), v = sub(r, q); return Math.acos(Math.max(-1, Math.min(1, dot(u, v) / ((len(u) * len(v)) || 1)))) * 180 / Math.PI; };
    const inV = (p, q) => { const co = new CL.ClipperOffset(2, 2), o = new CL.Paths(); co.AddPath(toC([p, q]), CL.JoinType.jtMiter, CL.EndType.etOpenButt); co.Execute(o, 20); return Math.abs(areaOf(boolOp(o.map(fromC), Vt, CL.ClipType.ctDifference))) < 40 * 200; };
    let Q = P;
    for (let it = 0; it < 4 * P.length && Q.length > 4; it++) {
      const n = Q.length, fixes = [], at = (i) => Q[((i % n) + n) % n];
      // 지운 꼭짓점이 새 선분에서 a 넘게 떨어지면(긴 대각선으로 순환을 크게 자르는 경우) 지우지 않는다
      const drop = (i, w) => { if (segDist(at(i), at(i - 1), at(i + 1)) <= a) fixes.push({w, seg: [[at(i - 1), at(i + 1)]], Q: Q.filter((_, k) => k !== i)}); };
      for (let i = 0; i < n; i++) {
        const p = at(i - 1), q = at(i), r = at(i + 1), t = turn(p, q, r), l1 = len(sub(q, p)), l2 = len(sub(r, q));
        if (t > 91 && Math.min(l1, l2) >= a) { const c = Math.min(a, Math.min(l1, l2) / 2), c1 = add(q, mul(norm(sub(p, q)), c)), c2 = add(q, mul(norm(sub(r, q)), c)); fixes.push({w: 1e9 + t, seg: [[c1, c2]], Q: [...Q.slice(0, i), c1, c2, ...Q.slice(i + 1)]}); }
        else if (t > 91) drop(i, 1e9 + t);
        else if (l2 < a && dot(norm(sub(q, p)), norm(sub(at(i + 2), r))) > 0.99) {
          const s = at(i + 2), u = norm(sub(q, p)), pp = at(i - 2), ss = at(i + 3);
          // 앞 변(p→q)을 r을 지나는 선으로: p는 그 앞 변(pp→p)을 따라 미끄러진다. 뒤 변(r→s)을 q를 지나는 선으로: s는 (s→ss)를 따라
          const p2 = meet(r, u, pp, sub(p, pp)), s2 = meet(q, u, ss, sub(s, ss)), ix = (k) => ((k % n) + n) % n;
          if (p2) fixes.push({w: a - l2, seg: [[pp, p2], [p2, r]], Q: Q.map((x, k) => (k === ix(i - 1) ? p2 : k === ix(i) ? r : x))});
          if (s2) fixes.push({w: a - l2, seg: [[q, s2], [s2, ss]], Q: Q.map((x, k) => (k === ix(i + 1) ? q : k === ix(i + 2) ? s2 : x))});
        }
      }
      fixes.sort((x, y) => y.w - x.w);
      const f = fixes.find((x) => x.seg.every(([s, e]) => inV(s, e)) && !selfCrossing(x.Q));
      if (!f) break;
      Q = clean(f.Q);
    }
    return Q;
  }

  // body: 램프 몸체(없으면 null). 코어는 여기서 빼지 않는다 — 순환 모양을 코어 둘레로 바꾸면 코어 둘레에 띠가 생겨 대수를 크게 잃는다
  function lanes(G, body) {
    const {cfg, a, d, inner, b, gy, lineY, midX} = G, X0 = G.X0, Y0 = G.Y0;
    // V: 차로 중심선이 놓일 수 있는 범위 — 벽에서는 칸 한 줄 + 차로 반(d + a/2), 램프 옆은 차로 반(a/2)만 띄운다(램프 벽에 바로 붙는 차로)
    const blk = body ? [body] : [];
    const V = (blk.length ? boolOp(offsP([inner], -(d + a / 2)), offsP(blk, a / 2 - 1), CL.ClipType.ctDifference) : offsP([inner], -(d + a / 2))).filter((Pg) => Math.abs(signedArea(Pg)) > 4 * a * a);
    if (!V.length) return {ringCL: [], segs: []};
    // 순환 영역 = V 안에 통째로 드는 격자 칸(기둥 사이 가운데 x, 차로 격자선 y로 나뉜 칸)의 합 → 경계가 늘 격자선 위(안쪽으로 맞춤, 벽 쪽은 여유 공간)
    const vb = V.reduce((m, Pg) => { const q = bbox(Pg); return [Math.min(m[0], q[0]), Math.min(m[1], q[1]), Math.max(m[2], q[2]), Math.max(m[3], q[3])]; }, [Infinity, Infinity, -Infinity, -Infinity]);
    const cells = [];
    for (let i = Math.floor((vb[0] - X0) / cfg.gx) - 1; midX(i) < vb[2]; i++) for (let m = Math.floor((vb[1] - Y0) / gy) - 1; lineY(m) < vb[3]; m++) {
      // 칸 경계가 V 경계와 일부러 겹치므로 반올림 오차(100mm 띠까지)는 안으로 본다 — 위치를 옮겨도 같은 결과
      const c = rectPoly([midX(i), lineY(m), midX(i + 1), lineY(m + 1)]); if (Math.abs(areaOf(boolOp([c], V, CL.ClipType.ctDifference))) < 100 * (cfg.gx + gy)) cells.push(c);
    }
    // 사선 변 근처는 격자에 맞추지 않고 V 그대로(사선 벽을 따라 도는 순환 차로, 벽에 직각인 칸). 축에서 a/2 이하로만 벗어난 변은 격자 칸으로(기둥 줄 유지)
    const co2 = new CL.ClipperOffset(2, 2), dz = new CL.Paths();
    //   램프 몸체에서 생긴 경계(곡선 몸체의 둥근 둘레)는 사선 벽으로 보지 않는다 — 따라가면 몸체 옆 순환 차로가 삼각으로 튄다(91·92차)
    const byBody = (p, q) => !!body && Math.min(...body.map((x, i) => segDist(add(p, mul(sub(q, p), .5)), x, body[(i + 1) % body.length]))) < a / 2 + 100;
    V.forEach((Pg) => Pg.forEach((p, k) => { const q = Pg[(k + 1) % Pg.length]; if (!Gm.nearAxis(p, q, a / 2) && len(sub(q, p)) > 1000 && !byBody(p, q)) co2.AddPath(toC([p, q]), CL.JoinType.jtMiter, CL.EndType.etOpenButt); }));
    co2.Execute(dz, Math.max(cfg.gx, gy));
    const Rd = dz.length ? boolOp(V, dz.map(fromC), CL.ClipType.ctIntersection) : [];
    // 격자 칸 부분에서 폭이 차로 + 칸 한 줄(a + d)보다 좁은 돌기는 지운다 — 그보다 좁으면 마주 보는 두 차로 사이에 칸 줄이 못 들어가는 틈(기둥이 끼는 ㄷ자 계단)이 된다.
    //   지우는 것은 한 곳에 옆으로 길게 붙은 선반형 돌기뿐(붙은 길이 ≥ 조각 긴 변의 0.6). 끝으로 붙은 손가락형 날개(L자 날개)와
    //   두 곳 이상에 닿는 통로는 순환이 지나가는 길이라 둔다 — 지우면 막다른 가지가 된다
    const cellsU = boolOp(cells, [], CL.ClipType.ctUnion), cellsO = offsP(offsP(cellsU, -(a + d) / 2), (a + d) / 2);
    //   사선 영역(Rd)에 닿는 돌기도 둔다 — 지우면 사선 차로와 만나는 곳이 뾰족한 V자 회전이 된다(사선깎임 기준 도면)
    const shelf = (pc) => { const g = offsP([pc], 50), t = boolOp(g, cellsO, CL.ClipType.ctIntersection).filter((q) => Math.abs(signedArea(q)) > 1e4), bb = bbox(pc); return t.length === 1 && !(Rd.length && Math.abs(areaOf(boolOp(g, Rd, CL.ClipType.ctIntersection))) > 1e4) && Math.abs(signedArea(t[0])) / 50 >= 0.6 * Math.max(bb[2] - bb[0], bb[3] - bb[1]); }; // 접촉 띠 폭 50mm → 면적 ÷ 50 = 붙은 길이
    const keepBack = cellsO.length ? boolOp(cellsU, cellsO, CL.ClipType.ctDifference).filter((pc) => !shelf(pc)) : [];
    const R = boolOp((cellsO.length ? cellsO.concat(keepBack) : cellsU).concat(Rd), [], CL.ClipType.ctUnion);
    // 폭이 차로 하나(a)보다 좁은 부분은 지운다
    const Vt = offsP(V, 100), ringCL = offsP(offsP(R, -a / 2), a / 2).filter((Pg) => Math.abs(signedArea(Pg)) > 4 * a * a).map((Pg) => straighten(G, tidy(G, Pg), Vt)), segs = [];
    // shortcut: one rectangular loop, one side only; broader shapes need a separate candidate grammar.
    if (G.automaticWallSide && ringCL.length === 1) {
      const P = ringCL[0], rb = bbox(P), side = G.automaticWallSide === 'left' ? 0 : 2;
      const target = b[side] + (side === 0 ? 1 : -1) * (d + a / 2);
      if (P.length === 4 && P.every(p => [rb[0], rb[2]].includes(p[0]) && [rb[1], rb[3]].includes(p[1])) &&
          (side === 0 ? target < rb[0] - 1 : target > rb[2] + 1)) {
        for (const p of P) if (p[0] === rb[side]) p[0] = target;
      }
    }
    ringCL.forEach((Pg, ri) => Pg.forEach((p, k) => { const q = Pg[(k + 1) % Pg.length]; segs.push({a: p, b: q, kind: 'ring', ri, h: isH(p, q) ? (p[1] + q[1]) / 2 : null, v: isV(p, q) ? (p[0] + q[0]) / 2 : null}); }));
    // 가지 차로: 순환이 들어가지 못한 좁은 날개(V에는 있고 순환 영역 밖)에 격자선 하나로 가운데 차로를 낸다(막다른 가지)
    // 격자선이 V 경계 위에 딱 놓이는 경우가 흔하다(위상을 벽에 맞추므로) — 50mm 넓힌 V로 구간을 찾아 1mm 흔들림에 결과가 바뀌지 않게
    const Vx = offsP(V, 50);
    const thr = 2 * gy - 100, spurs = [], ringOnly = segs.slice(), farFromRing = (q) => !ringOnly.length || Math.min(...ringOnly.map((sg) => segDist(q, sg.a, sg.b))) >= a + d - 1;
    const farFromSpurs = (h, v, c, s0, s1) => !spurs.some((sp) => (h !== null ? sp.h !== null && Math.abs(sp.h - c) < thr : sp.v !== null && Math.abs(sp.v - c) < thr) && Math.min(s1, sp.e) > Math.max(s0, sp.s));
    for (let m = Math.floor((vb[1] - Y0) / gy); lineY(m) <= vb[3]; m++) {
      const y = lineY(m);
      for (const [x0, x1] of minus(hSpans(Vx, y), hSpans(ringCL, y).map(([u0, u1]) => [u0 - a / 2, u1 + a / 2]))) {
        if (x1 - x0 < 2 * cfg.gx || !farFromSpurs(y, null, y, x0, x1) || !farFromRing([(x0 + x1) / 2, y])) continue;
        segs.push({a: [x0 - a / 2, y], b: [x1 + a / 2, y], kind: 'spur', h: y, v: null}); spurs.push({h: y, v: null, s: x0, e: x1});
      }
    }
    for (let i = Math.floor((vb[0] - X0) / cfg.gx) - 1; midX(i) <= vb[2]; i++) {
      const x = midX(i);
      for (const [y0, y1] of minus(vSpans(Vx, x), vSpans(ringCL, x).map(([u0, u1]) => [u0 - a / 2, u1 + a / 2]))) {
        if (y1 - y0 < 2 * gy || !farFromSpurs(null, x, x, y0, y1) || !farFromRing([x, (y0 + y1) / 2])) continue;
        segs.push({a: [x, y0 - a / 2], b: [x, y1 + a / 2], kind: 'spur', h: null, v: x}); spurs.push({h: null, v: x, s: y0, e: y1});
      }
    }
    // 안쪽 줄 차로: 순환 안 격자선 y에서, 위·아래로 나란한 차로(순환·가지·먼저 둔 줄 중 45°보다 눕은 변)까지 간격이 2·gy 이상인 구간
    //   = 등 맞댄 두 줄(기둥 한 칸에 3대 × 2)이 들어가는 자리. 구간 끝은 나란한 차로의 끝점(순환 모서리)에서 정확히 자른다.
    //   구간 끝이 순환에 닿지 않으면 그 끝을 막는 나란한 차로까지 세로로 이어 고리를 만든다(막다른 끝 없이). 옆 세로 차로까지 거리는 보지 않는다
    const flat = () => segs.filter((sg) => Math.abs(sg.b[0] - sg.a[0]) > Math.abs(sg.b[1] - sg.a[1])); // 45°보다 눕은 변만 나란한 차로로 본다
    const yOn = (sg, x) => sg.a[1] + (sg.b[1] - sg.a[1]) * (x - sg.a[0]) / (sg.b[0] - sg.a[0]);
    const over = (sg, x) => x >= Math.min(sg.a[0], sg.b[0]) - 1 && x <= Math.max(sg.a[0], sg.b[0]) + 1;
    const gapAt = (x, y) => flat().reduce((m, sg) => (over(sg, x) ? Math.min(m, Math.abs(yOn(sg, x) - y)) : m), Infinity);
    for (let m = Math.ceil((b[1] - Y0) / gy); lineY(m) < b[3]; m++) {
      const y = lineY(m);
      for (const [x1, x2] of hSpans(ringCL, y)) {
        const xs = [x1, x2, ...flat().flatMap((sg) => [sg.a[0], sg.b[0]]).filter((x) => x > x1 + 1 && x < x2 - 1)].sort((p, q) => p - q), fit = [];
        for (let k = 0; k + 1 < xs.length; k++) { if (xs[k + 1] - xs[k] < 1 || gapAt((xs[k] + xs[k + 1]) / 2, y) < thr) continue; const last = fit[fit.length - 1]; if (last && xs[k] - last[1] < 1) last[1] = xs[k + 1]; else fit.push([xs[k], xs[k + 1]]); }
        for (const [s0, s1] of fit) {
          if (s1 - s0 < 2 * cfg.gx) continue;
          segs.push({a: [s0, y], b: [s1, y], kind: 'row', h: y, v: null});
          for (const xe of [s0, s1]) {
            if (Math.abs(xe - x1) < 1 || Math.abs(xe - x2) < 1) continue;
            let best = null; for (const sg of flat()) { if (sg.kind === 'row' && sg.h === y || !over(sg, xe)) continue; const dy = Math.abs(yOn(sg, xe) - y); if (dy < thr && (!best || dy < best.dy)) best = {dy, y2: yOn(sg, xe)}; }
            if (best) segs.push({a: [xe, y], b: [xe, best.y2], kind: 'row', h: null, v: xe});
          }
        }
      }
    }
    const unresolvedTurns=[];
    for(const P of ringCL)P.forEach((q,i)=>{const a=sub(q,P[(i+P.length-1)%P.length]),b=sub(P[(i+1)%P.length],q),angleDeg=Math.acos(Math.max(-1,Math.min(1,dot(a,b)/(len(a)*len(b)||1))))*180/Math.PI;if(angleDeg>90.5)unresolvedTurns.push({at:q.slice(),angleDeg});});
    return {ringCL, segs,unresolvedTurns};
  }
  // 동선 조각을 서로 닿는 곳에서 나눠 그래프로(S7 독립 검사에 넘기는 증거). 끝점끼리 30mm 안이면 같은 점
  function buildGraph(pieces) {
    const cuts = pieces.map((s) => [s.a, s.b]), TOL = 30;
    for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) {
      const A = pieces[i], B = pieces[j];
      for (const pt of [A.a, A.b]) if (segDist(pt, B.a, B.b) < TOL) cuts[j].push(pt);
      for (const pt of [B.a, B.b]) if (segDist(pt, A.a, A.b) < TOL) cuts[i].push(pt);
      const d1 = sub(A.b, A.a), d2 = sub(B.b, B.a), den = d1[0] * d2[1] - d1[1] * d2[0];
      if (Math.abs(den) > 1e-9) { const w0 = sub(B.a, A.a), t = (w0[0] * d2[1] - w0[1] * d2[0]) / den, s2 = (w0[0] * d1[1] - w0[1] * d1[0]) / den; if (t > 0 && t < 1 && s2 > 0 && s2 < 1) { const x = add(A.a, mul(d1, t)); cuts[i].push(x); cuts[j].push(x); } }
    }
    const nodes = [], nodeMap = new Map(), edges = [], key=(x,y)=>x+','+y;
    const nid=p=>{const x=Math.floor(p[0]/TOL),y=Math.floor(p[1]/TOL);let best=null,dist=Infinity;
      for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const id of nodeMap.get(key(x+dx,y+dy))||[]){const d=len(sub(nodes[id].p,p));if(d<=TOL&&(d<dist||d===dist&&id<best)){best=id;dist=d;}}
      if(best!==null)return best;const id=nodes.length,k=key(x,y);nodes.push({id,p:p.slice()});if(!nodeMap.has(k))nodeMap.set(k,[]);nodeMap.get(k).push(id);return id;};
    pieces.forEach((s, i) => { const u = sub(s.b, s.a), ps = cuts[i].slice().sort((p, q) => dot(sub(p, s.a), u) - dot(sub(q, s.a), u)); for (let k = 1; k < ps.length; k++) { if (len(sub(ps[k], ps[k - 1])) < TOL) continue; const ea = nid(ps[k - 1]), eb = nid(ps[k]); if (ea !== eb) edges.push({id: edges.length, a: ea, b: eb, kind: s.kind}); } });
    return {nodes, edges};
  }
  const api = {tidy, lanes, buildGraph};
  if (isNode) module.exports = api; else (root.UGP = root.UGP || {}).network = api;
})(this);
