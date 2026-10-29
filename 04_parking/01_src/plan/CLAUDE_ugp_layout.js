/* 지하주차 계획 엔진 — 점유물(코어)·S5 차로 면·기둥·S6 칸.
 * 코어는 구조에 종속된다: 놓은 자리에서 왼·오른 변 중 하나, 아래·위 변 중 하나를 기둥선에 붙인다(네 조합 중 차로를 막지 않고 가장 적게
 *   움직이는 것, 모두 막으면 가장 적게 움직이는 것). 크기 조절로 고정한 축(keep)은 붙이지 않는다. 코어는 겹친 칸·차로 중심선만 지운다.
 * 차로 면은 코어를 자른 뒤의 동선 조각에서 만든다(화면의 차로 면·동선·대수가 같은 근거). 기둥은 구조 격자 전체에서 차로·램프에 걸린 것만 뺀다.
 * 칸은 같은 선의 차로 구간을 합쳐(긴 줄부터, 좌표 순 — 형상으로만 정한 순서) 가로는 기둥 사이 n대, 세로는 칸 폭으로 이어서, 사선 벽은 벽에 직각으로 놓는다.
 */
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const Gm = isNode ? require('./CLAUDE_ugp_geom.js') : root.UGP.geom;
  const Modules = isNode ? require('./stall-modules.js') : root.UGP.stallModules;
  const CoreFit = isNode ? require('./core-fit.js') : root.UGP.coreFit;
  const {CL, add, sub, mul, len, bbox, boxHit, rectPoly, signedArea, toC, fromC, boolOp, areaOf, clipSeg, isH, isV} = Gm;

  const coreMargin = (G) => G.a / 2 - 100; // 띠가 코어에 맞닿기만 하면 막힌 것이 아니다
  function snapCores(G, input, segs) {
    const {cfg, gy, L} = G, X0 = G.X0, Y0 = G.Y0, e1 = coreMargin(G);
    const nearest = (xs, v) => xs.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a);
    const yCols = (v) => G.columnAxes ? nearest(G.columnAxes.y, v) : Y0 + (Math.round((v - Y0) / gy - .5) + .5) * gy;
    const xCol = (v) => G.columnAxes ? nearest(G.columnAxes.x, v) : X0 + Math.round((v - X0) / cfg.gx) * cfg.gx;
    const blocksLane = (r) => segs.some((sg) => clipSeg(sg.a, sg.b, [r[0] - e1, r[1] - e1, r[2] + e1, r[3] + e1]));
    return (input.cores || []).map((c) => {
      // 코어 생성기 안이 있으면 실제 외곽을 구조 격자에 맞춰 앉힌다(core-fit.js). 상자에 들어가는 안이 없으면 아래 상자 방식으로
      const fitted = Array.isArray(c.layouts) && c.layouts.length ? CoreFit.fit(G, c, segs) : null;
      if (fitted) return {r: fitted.r, shift: fitted.shift, fit: fitted};
      const q = L(c.c), l = q[0] - c.w / 2, r2 = q[0] + c.w / 2, bt = q[1] - c.d / 2, tp = q[1] + c.d / 2, cand = [];
      const kp = c.keep || {}, dxs = kp.x ? [0] : [xCol(l) - l, xCol(r2) - r2], dys = kp.y ? [0] : [yCols(bt) - bt, yCols(tp) - tp];
      for (const dx of dxs) for (const dy of dys) cand.push({r: [l + dx, bt + dy, r2 + dx, tp + dy], m: Math.hypot(dx, dy)});
      cand.sort((x, y) => x.m - y.m);
      const best = cand.find((x) => !blocksLane(x.r)) || cand[0];
      return {r: best.r, shift: Math.round(best.m)};
    });
  }
  // 차로 자르기: 코어가 덮는 중심선 구간을 뺀다
  function cutByCores(G, segs, cores, violations) {
    const e1 = coreMargin(G), obsR = cores.map((c) => [c.r[0] - e1, c.r[1] - e1, c.r[2] + e1, c.r[3] + e1]), pieces = [];
    for (const s of segs) {
      let keep = [[0, 1]];
      for (const r of obsR) { const c = clipSeg(s.a, s.b, r); if (!c) continue; keep = keep.flatMap(([t0, t1]) => [[t0, Math.min(t1, c[0])], [Math.max(t0, c[1]), t1]]).filter(([t0, t1]) => (t1 - t0) * len(sub(s.b, s.a)) > 300); }
      for (const [t0, t1] of keep) pieces.push({a: add(s.a, mul(sub(s.b, s.a), t0)), b: add(s.a, mul(sub(s.b, s.a), t1)), kind: s.kind, h: s.h, ri: s.ri, cut: keep.length !== 1 || keep[0][0] > 0 || keep[0][1] < 1});
    }
    if (cores.some((c, i) => segs.some((s) => clipSeg(s.a, s.b, obsR[i])))) violations.push({id: 'CORE_IN_AISLE', note: '코어가 차로를 막습니다 — 코어를 칸 자리로 옮기면 동선이 이어집니다'});
    return pieces;
  }
  // S5 차로 면: 끊기지 않은 순환 고리는 닫힌 선, 나머지(끊긴 고리 조각·줄·가지)는 끝을 a/2 내민 열린 선, 램프 진입은 착지에서 바로
  function aisleSurface(G, ringCL, pieces, area, cores) {
    const co = new CL.ClipperOffset(2, 2), bandOut = new CL.Paths(), cutRings = new Set(pieces.filter((pc) => pc.kind === 'ring' && pc.cut).map((pc) => pc.ri));
    ringCL.forEach((Pg, ri) => { if (!cutRings.has(ri)) co.AddPath(toC(Pg), CL.JoinType.jtMiter, CL.EndType.etClosedLine); });
    pieces.filter((pc) => pc.kind !== 'ring' || cutRings.has(pc.ri)).forEach((pc) => co.AddPath(toC([pc.a, pc.b]), CL.JoinType.jtMiter, pc.kind === 'ramp' ? CL.EndType.etOpenButt : CL.EndType.etOpenSquare));
    co.Execute(bandOut, G.a / 2);
    return boolOp(boolOp(bandOut.map(fromC), area, CL.ClipType.ctIntersection), cores.map((c) => rectPoly(c.r)), CL.ClipType.ctDifference);
  }
  const hitArea = (poly, paths) => { const bb = bbox(poly), cand = paths.filter((q) => boxHit(bb, bbox(q))); return cand.length && Math.abs(areaOf(boolOp([poly], cand, CL.ClipType.ctIntersection))) > 1e4; };
  const insideOf = (inner) => (poly) => Math.abs(areaOf(boolOp([poly], [inner], CL.ClipType.ctDifference))) < 1e4;
  // 기둥: 구조 격자 전체. 차로·램프에 걸리면 두지 않고, 코어 안에는 둔다(코어는 기둥을 품은 벽으로 구획)
  function placeColumns(G, aisleU, rampOut) {
    const {cfg, inner, b, gy, xLines} = G, Y0 = G.Y0, hc = cfg.columnMm / 2, inside = insideOf(inner), columns = [];
    if (G.columnAxes) {
      for (const x of xLines) for (const y of G.columnAxes.y) {
        if (!G.columnExists(x, y)) continue;
        const r = rectPoly([x - hc, y - hc, x + hc, y + hc]);
        if (inside(r)) columns.push(r); // Fixed structure must survive even when a generated aisle/ramp collides.
        else if (hitArea(r, [inner])) throw new RangeError(`고정 기둥 (${x}, ${y})이 실내 외곽에 걸칩니다 — 구조축 또는 외곽을 확인하세요`);
      }
      return columns;
    }
    for (const x of xLines) for (let m = Math.floor((b[1] - Y0) / gy) - 1; Y0 + (m + .5) * gy < b[3]; m++) {
      const y = Y0 + (m + .5) * gy, r = rectPoly([x - hc, y - hc, x + hc, y + hc]);
      if (!inside(r) || hitArea(r, aisleU) || (rampOut && hitArea(r, [rampOut.body]))) continue; // 램프 몸체 안의 격자 기둥은 직선·곡선 모두 뺀다(램프 구간은 전이보로 받는다고 보는 기본계획 가정, 사용자 결정 2026-10-26)
      columns.push(r);
    }
    return columns;
  }
  // Competing row fragments are alternatives. Prefer continuous groups, then capacity and retained geometry.
  function selectRows(groups, baseline) {
    const old = new Set(baseline.map(s => JSON.stringify(s.poly)));
    const fragments=groups.flatMap(g=>{
      const parts=[];let previous=null;
      for(const s of g){
        const axis=s.rowId.startsWith('h:')?0:1,other=1-axis;
        if(!previous||Math.abs(previous.bb[axis+2]-s.bb[axis])>1||Math.abs(previous.bb[other]-s.bb[other])>1||Math.abs(previous.bb[other+2]-s.bb[other+2])>1)parts.push([]);
        parts.at(-1).push(s);previous=s;
      }
      return parts;
    });
    const rows = fragments.map(g => ({stalls:g, weight:g.length*g.length,
      kept:g.filter(s=>old.has(JSON.stringify(s.poly))).length, bb:bbox(g.flatMap(s=>s.poly))}));
    rows.sort((p,q)=>p.bb[0]-q.bb[0]||p.bb[1]-q.bb[1]||p.bb[2]-q.bb[2]||p.bb[3]-q.bb[3]);
    const links = rows.map(()=>new Set());
    for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
      if(boxHit(rows[i].bb,rows[j].bb)&&rows[i].stalls.some(s=>rows[j].stalls.some(t=>boxHit(s.bb,t.bb)&&hitArea(s.poly,[t.poly])))){
        links[i].add(j);links[j].add(i);
      }
    }
    const pending = new Set(rows.map((_,i)=>i)), chosen=[];
    while(pending.size){
      const component=[], todo=[pending.values().next().value];pending.delete(todo[0]);
      while(todo.length){const i=todo.pop();component.push(i);for(const j of links[i])if(pending.delete(j))todo.push(j);}
      component.sort((i,j)=>rows[j].weight-rows[i].weight||rows[j].kept-rows[i].kept||i-j);
      let best=[], bestScore=[-1,-1,-1], visits=0;
      const consider=ids=>{
        const score=ids.reduce((a,i)=>[a[0]+rows[i].weight,a[1]+rows[i].stalls.length,a[2]+rows[i].kept],[0,0,0]);
        if(score[0]>bestScore[0]||score[0]===bestScore[0]&&(score[1]>bestScore[1]||score[1]===bestScore[1]&&score[2]>bestScore[2])){best=ids.slice();bestScore=score;}
      };
      const greedy=[];for(const i of component)if(greedy.every(j=>!links[i].has(j)))greedy.push(i);consider(greedy);
      // shortcut: bounded search for unusually dense row conflicts; retain the best valid selection at the limit.
      const search=(left,ids,score)=>{
        if(++visits>20000)return;
        if(!left.length){consider(ids);return;}
        if(score+left.reduce((s,i)=>s+rows[i].weight,0)<bestScore[0])return;
        const i=left[0],rest=left.slice(1);
        search(rest.filter(j=>!links[i].has(j)),ids.concat(i),score+rows[i].weight);
        search(rest,ids,score);
      };
      search(component,[],0);chosen.push(...best);
    }
    const picked=chosen.sort((i,j)=>i-j).flatMap(i=>rows[i].stalls), selected=new Set(chosen);
    // Choosing one row must not erase the non-overlapping tail of a competing row.
    const tails=rows.flatMap((r,i)=>selected.has(i)?[]:[r.stalls.filter(s=>!picked.some(t=>boxHit(s.bb,t.bb)&&hitArea(s.poly,[t.poly])))]).filter(g=>g.length);
    return tails.length?picked.concat(selectRows(tails,baseline)):picked;
  }
  // S6 칸. 반환 {stalls:[{poly,bb,cl,kind}], excluded, dbg}
  function placeStalls(G, segs, area, aisleU, blockedStatic, columns, debug, options = {}) {
    const {cfg, a, d, n, inner, xLines} = G, w = cfg.stallW, inside = insideOf(inner);
    const projection = options.stallStripProjection || 'envelope';
    if (!['envelope', 'occupied-bands'].includes(projection)) throw new RangeError('알 수 없는 주차열 장애물 투영: ' + projection);
    const selection=options.stallRowSelection||'sequential';
    if(!['sequential','continuous'].includes(selection))throw new RangeError('알 수 없는 주차열 선택: '+selection);
    const baseline=selection==='continuous'?placeStalls(G,segs,area,aisleU,blockedStatic,columns,false,{...options,stallRowSelection:'sequential'}).stalls:null;
    const blocked = aisleU.concat(blockedStatic, columns);
    const stalls = [], rows = [], excluded = {wall: 0, blocked: 0, overlap: 0, unreachable: 0}, dbg = debug ? [] : null;
    const groups=[];let activeRow = null,activeGroup=null;
    const tryStall = (poly, front, toAisle, kind) => {
      if (!inside(poly)) { excluded.wall++; if (dbg) dbg.push({poly, why: 'wall'}); return; }
      if (hitArea(poly, blocked)) { excluded.blocked++; if (dbg) dbg.push({poly, why: hitArea(poly, aisleU) ? 'aisle' : hitArea(poly, columns) ? 'column' : 'core/ramp'}); return; }
      const bb = bbox(poly); if (!activeGroup&&stalls.some((s) => boxHit(bb, s.bb) && hitArea(poly, [s.poly]))) { excluded.overlap++; return; }
      (activeGroup||stalls).push({poly, bb, cl: add(front, mul(toAisle, a / 2)), kind, stallType: activeRow?.stallType || 'normal', rowId: activeRow?.id || null});
    };
    const hLines = segs.filter((s) => s.h !== null), vLines = segs.filter((s) => s.v !== null);
    const margin = (cfg.gx - n * w) / 2;
    const merged = (lines, key, lo) => {
      const by = new Map(); for (const sl of lines) { const k2 = Math.round(sl[key]); if (!by.has(k2)) by.set(k2, []); by.get(k2).push([Math.min(sl.a[lo], sl.b[lo]), Math.max(sl.a[lo], sl.b[lo]), sl.kind]); }
      const out = []; for (const [k2, iv] of by) { iv.sort((x, y) => x[0] - y[0]); for (const v of iv) { const last = out.length && out[out.length - 1]; if (last && last.k === k2 && v[0] <= last.e + a) last.e = Math.max(last.e, v[1]); else out.push({k: k2, s: v[0], e: v[1], kind: v[2]}); } }
      // 칸은 먼저 놓은 줄이 겹치는 자리를 차지하므로 순서를 형상으로만 정한다(긴 줄부터, 같으면 좌표 순) — 다각형 시작 꼭짓점이 달라도 같은 결과
      return out.sort((p2, q2) => (q2.e - q2.s) - (p2.e - p2.s) || p2.k - q2.k || p2.s - q2.s);
    };
    // 가로 차로 양옆: 기둥 사이 n대
    for (const ln of merged(hLines, 'h', 0)) {
      const x1 = ln.s - a / 2, x2 = ln.e + a / 2;
      for (const sg of [1, -1]) {
        activeRow = Modules.row(G, options, 'h', ln.k, sg); rows.push({...activeRow,span:[x1,x2]});
        const w = activeRow.widthMm, d = activeRow.depthMm;
        if (activeRow.stallType === 'accessible') continue; // location reservation only; shared access is not yet laid out
        const yA = ln.k + sg * a / 2, yB = yA + sg * d;
        for (const [x, end] of G.xBays) {
          if(baseline){activeGroup=[];groups.push(activeGroup);}
          const span = end - x, n = Math.floor((span - cfg.columnMm) / w), margin = (span - n * w) / 2;
          for (let m = 0; m < n; m++) {
          const sx = x + margin + m * w; if (sx < x1 - 1 || sx + w > x2 + 1) continue;
          tryStall(rectPoly([sx, Math.min(yA, yB), sx + w, Math.max(yA, yB)]), [sx + w / 2, yA], [0, -sg], ln.kind);
          }
        }
      }
    }
    // 세로 차로 양옆: 칸 줄 띠에서 실제 기둥·코어·램프·차로가 차지한 구간을 먼저 빼고, 남은 빈 구간마다 칸을 가운데 맞춰 채운다
    //   (세로 기둥 간격 gy에 칸 폭이 딱 맞지 않아도 기둥 사이마다 같은 묶음 — 이어 놓고 기둥에 걸린 칸을 지우던 '이빨 빠짐'을 없앤다)
    for (const ln of merged(vLines, 'v', 1)) {
      const y1 = ln.s - a / 2, y2 = ln.e + a / 2;
      for (const sg of [1, -1]) {
        activeRow = Modules.row(G, options, 'v', ln.k, sg); rows.push({...activeRow,span:[y1,y2]});
        const w = activeRow.widthMm, d = activeRow.depthMm;
        if (activeRow.stallType === 'accessible') continue;
        const xA = ln.k + sg * a / 2, xB = xA + sg * d, x0 = Math.min(xA, xB), x1 = Math.max(xA, xB), strip = rectPoly([x0, y1, x1, y2]);
        const hits = boolOp([strip], blocked.filter((q) => boxHit(bbox(strip), bbox(q))), CL.ClipType.ctIntersection).filter((q) => Math.abs(signedArea(q)) > 1e4);
        let intervals = hits.map(q => { const bq = bbox(q); return [bq[1], bq[3]]; });
        if (projection === 'occupied-bands') {
          // 경계선으로만 이어진 기둥·차로의 bbox는 빈 구간까지 덮는다. 면적이 있는 높이 띠만 제외한다.
          const ys = [...new Set(hits.flatMap(q => q.map(p => p[1])))].sort((p, q) => p - q);
          intervals = ys.slice(1).flatMap((hi, i) => {
            const lo = ys[i], band = rectPoly([x0, lo, x1, hi]);
            return Math.abs(areaOf(boolOp(hits, [band], CL.ClipType.ctIntersection))) > 1 ? [[lo, hi]] : [];
          });
        }
        // 남는 길이는 구간마다 번갈아 아래·위 끝으로 모은다(93차 B2): 이웃 구간의 틈이 사이 기둥 양옆에서 만나 한 덩어리 자투리가 된다(가운데 맞춤은 양 끝에 반씩 갈라졌다).
        //   모은 자리에서 칸이 하나라도 걸리면 그 구간은 가운데 맞춤 그대로(대수를 잃지 않는다)
        const free = Gm.minus([[y1, y2]], intervals).sort((p, q) => p[0] - q[0]);
        const fits = (y) => { const poly = rectPoly([x0, y, x1, y + w]), bb = bbox(poly); return inside(poly) && !hitArea(poly, blocked) && !stalls.some((s) => boxHit(bb, s.bb) && hitArea(poly, [s.poly])); };
        for (const [k, [f0, f1]] of free.entries()) {
          const cnt = Math.floor((f1 - f0 + 1) / w), spare = f1 - f0 - cnt * w, packed = k % 2 ? spare : 0;
          let off = Array.from({length: cnt}, (_, m) => f0 + packed + m * w).every(fits) ? packed : spare / 2;
          if(baseline){
            activeGroup=[];groups.push(activeGroup);
            const anchors=baseline.filter(s=>s.rowId===activeRow.id&&s.bb[1]>=f0-1&&s.bb[3]<=f1+1);
            // Extend an existing row's spacing without moving its valid members when a crossing row is replaced.
            off=anchors.length?((Math.min(...anchors.map(s=>s.bb[1]))-f0)%w+w)%w:spare/2;
          }
          for (let m = 0; m < cnt; m++) { const y = f0 + off + m * w; tryStall(rectPoly([x0, y, x1, y + w]), [xA, y + w / 2], [-sg, 0], ln.kind); }
        }
      }
    }
    if(baseline){activeGroup=null;const picked=selectRows(groups,baseline);stalls.push(...picked);excluded.overlap+=groups.reduce((n,g)=>n+g.length,0)-picked.length;}
    // 사선 벽(램프 옆면 포함): 벽에 직각인 칸. 바깥 경로의 방향으로 안쪽을 정한다(구멍은 반대 방향이라 같은 쪽이 안쪽)
    const outerSign = Math.sign(signedArea(area.reduce((m, q) => (Math.abs(signedArea(q)) > Math.abs(signedArea(m)) ? q : m))));
    activeRow = null;
    const diagEdges = []; for (const Pg of area) Pg.forEach((p, i) => diagEdges.push([p, Pg[(i + 1) % Pg.length]]));
    diagEdges.sort((x, y) => len(sub(y[1], y[0])) - len(sub(x[1], x[0])) || x[0][0] - y[0][0] || x[0][1] - y[0][1]);
    for (const [p, q] of diagEdges) {
      const e = sub(q, p), Le = len(e); if (Le < w || Gm.nearAxis(p, q, a / 2)) continue; // 살짝 기운 벽은 세로·가로 줄 칸이 맡는다
      const u = mul(e, 1 / Le), nn = outerSign > 0 ? [-u[1], u[0]] : [u[1], -u[0]], cnt = Math.floor(Le / w), off = (Le - cnt * w) / 2;
      for (let m = 0; m < cnt; m++) { const s0 = add(p, mul(u, off + m * w)), s1 = add(s0, mul(u, w)); tryStall([s0, s1, add(s1, mul(nn, d)), add(s0, mul(nn, d))], add(add(s0, mul(u, w / 2)), mul(nn, d)), nn, 'wall'); }
    }
    // 사선 순환 차로의 양옆(벽 쪽은 위에서 이미 찼으므로 실제로는 안쪽 면): 차로에 직각인 칸. 차로 끝·모서리는 차로 면·다른 칸에 걸려 저절로 빠진다
    for (const sg of segs) {
      if (sg.kind !== 'ring' || sg.h !== null || sg.v !== null) continue;
      const e = sub(sg.b, sg.a), Le = len(e); if (Le < w || Gm.nearAxis(sg.a, sg.b, a / 2)) continue;
      const u = mul(e, 1 / Le);
      // 기울어진 칸 줄은 직교 기둥 격자를 가로지른다 — 시작점을 칸 폭의 ⅕씩 밀어 보고 들어가는 칸이 가장 많은 위치를 쓴다(같으면 앞의 것)
      const rowAt = (nn, s) => { const out = []; for (let t = s; t + w <= Le; t += w) { const s0 = add(add(sg.a, mul(u, t)), mul(nn, a / 2)), s1 = add(s0, mul(u, w)), poly = [s0, s1, add(s1, mul(nn, d)), add(s0, mul(nn, d))], bb = bbox(poly); if (inside(poly) && !hitArea(poly, blocked) && !stalls.some((x) => boxHit(bb, x.bb) && hitArea(poly, [x.poly]))) out.push([poly, add(s0, mul(u, w / 2))]); } return out; };
      for (const nn of [[-u[1], u[0]], [u[1], -u[0]]]) {
        let best = []; for (let k = 0; k < 5; k++) { const r = rowAt(nn, k * w / 5); if (r.length > best.length) best = r; }
        for (const [poly, front] of best) tryStall(poly, front, mul(nn, -1), 'ring');
      }
    }
    return {stalls, rows, excluded, dbg, outerSign};
  }
  const api = {snapCores, cutByCores, aisleSurface, placeColumns, placeStalls};
  if (isNode) module.exports = api; else (root.UGP = root.UGP || {}).layout = api;
})(this);
