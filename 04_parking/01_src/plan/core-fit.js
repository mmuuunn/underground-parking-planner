/* 지하주차 계획 엔진 — 코어를 구조 격자에 맞춰 앉힌다(95차 D1–D3).
 * 입력 코어 {c, w, d, layouts}: layouts = 코어 생성기 2판(06_core_layout/core_gen2.js)의 안 목록. 상자 w×d가 코어 크기다(98차 사용자 지적: 상자를 끌면 코어가 따라 커지고 줄어야 한다).
 *   상자보다 작은 안을 골라 홀을 늘려 상자를 채운다(생성기의 공용홀 폭을 키운 것과 같음). 홀로 못 늘리는 축은 안 크기 그대로 상자 안에서 기둥에 맞춘다. 상자보다 큰 안은 쓰지 않는다.
 *   놓은 자리에서 차로를 막을 때만 엔진이 한 칸 안에서 자리를 옮기고, 그래도 막으면 안 자체 크기로 줄인다.
 * 안마다 네 방향(입구가 향하는 쪽 S·N·E·W) × 변 맞춤(변마다 SNAP 안에 있는 기둥 중심선·안쪽 면·바깥 면, 또는 놓은 자리 그대로)을 보고
 *   ① 차로를 막지 않고 ② 법규 실패가 아니고(상자를 벗어나더라도 실패 안보다 먼저) ③ 방(계단·홀·승강로·샤프트) 안에 기둥이 없고 ④ 입구 앞 보행 여유(WALK)가 차로에 닿고 ⑤ 모서리 기둥이 벽에 묻히고 ⑥ 상자를 많이 채우고(같으면 승강기가 적은 안 — EV 자동일 때), 변 기둥이 벽에 많이 묻히고
 *   ⑦ 남는 땅이 적고 ⑧ 덜 움직이는 것을 고른다(앞의 것이 우선). 기둥에서 SNAP보다 먼 변은 놓은 자리 그대로라 코어를 격자 칸 어디에나 둘 수 있다. 기둥은 지우지 않는다 — 벽 속에 묻히거나, 못 피하면 위반으로 알린다.
 * 좌표: 격자 맥락 G의 지역 좌표(UCS로 돌린 mm). 생성기 좌표는 x 오른쪽, y 입구(0)에서 뒤로.
 */
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const Gm = isNode ? require('./CLAUDE_ugp_geom.js') : root.UGP.geom;
  const {CL, rectPoly, boolOp, segDist, clipSeg} = Gm;
  const WALK = 1500; // 입구 앞 보행 여유 깊이(사용자 위임 권장값 2026-10-26)
  const SNAP = 300; // 변이 이 거리(기둥 반 폭) 안의 기둥 면·중심선에 붙는다. 98차 0.6m → 98-5 0.3m: 화면이 끄는 동안 기둥에 붙여 주므로 엔진은 작은 어긋남만 맞춘다(사용자: 치수를 부드럽게 고르고 싶음)

  // 생성기 좌표 (x, y) → 지역 좌표. 상자 원점 (x0, y0), 입구가 향하는 쪽 f
  const placer = (f, x0, y0, W, H) => ({S: (x, y) => [x0 + x, y0 + y], N: (x, y) => [x0 + W - x, y0 + H - y], E: (x, y) => [x0 + H - y, y0 + x], W: (x, y) => [x0 + y, y0 + W - x]}[f]);
  const sizeOf = (f, W, H) => (f === 'S' || f === 'N' ? [W, H] : [H, W]);
  const less = (p, q) => { const i = p.findIndex((v, k) => v !== q[k]); return i >= 0 && p[i] < q[i]; }; // 앞 항목부터 비교(같으면 먼저 본 것)
  const rectOf = (to, q) => { const a = to(q.x0, q.y0), b = to(q.x1, q.y1); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]; };

  // One configuration change policy for engine clients and canvas/panel controls.
  function configure(core, ev, layouts) {
    if(!['auto',1,2,3,4].includes(ev))throw new RangeError('승강기 대수는 자동 또는 1–4대입니다');
    const alts=(layouts||[]).filter(a=>a.law!=='FAIL'),sizes=alts.flatMap(a=>(core.facing? [core.facing]:['S','E']).map(f=>sizeOf(f,a.outer.w,a.outer.h)));
    const choices=sizes.map(([w,d])=>({w:Math.max(core.w,Math.ceil(w/100)*100),d:Math.max(core.d,Math.ceil(d/100)*100)}));
    choices.sort((a,b)=>a.w*a.d-b.w*b.d||a.w-b.w);
    const size=choices[0]||{w:core.w,d:core.d};
    return {...core,...size,ev,...(layouts?{layouts}:{}),configurationFits:choices.length>0};
  }

  // 코어를 한 축으로 by만큼 늘린다(98차): 홀만 가로지르는 선에서 잘라 그 뒤 좌표를 민다 — 생성기에서 "공용홀 최소 폭"을 키운 것과 같다.
  //   계단·승강로·샤프트는 늘리지 않는다(사용자 2026-10-26: 계단이 깨지면 안 됨). 문 폭을 자르지 않는다. 홀만으로 못 늘리는 축이면 null
  function stretch(alt, ax, by) {
    if (!by) return alt;
    const [lo, hi] = ax === 'x' ? ['x0', 'x1'] : ['y0', 'y1'], along = ax === 'x' ? 'h' : 'v', all = Object.entries(alt.rooms).flatMap(([k, rs]) => rs.map((r) => [k, r]));
    // 자르는 선은 방만 지나야 한다: 지나는 방들 사이 틈이 벽 두께 이하(벽 덩어리를 늘리지 않는다), 문 폭을 가르지 않는다
    const [plo, phi] = ax === 'x' ? ['y0', 'y1'] : ['x0', 'x1'], depth = ax === 'x' ? alt.outer.h : alt.outer.w;
    const ok = (c, kinds) => { const hit = all.filter(([, r]) => r[lo] < c && c < r[hi]); if (!hit.every(([k]) => kinds.includes(k)) || !alt.doors.every((dd) => dd.orient !== along || Math.abs(c - dd.center) > dd.width / 2 + 100)) return false;
      let y = 0; for (const [, r] of hit.sort((p, q) => p[1][plo] - q[1][plo])) { if (r[plo] - y > alt.t + 1) return false; y = Math.max(y, r[phi]); } return depth - y <= alt.t + 1; };
    const cuts = all.filter(([kk]) => kk === 'H').flatMap(([, r]) => [.5, .3, .7, .15, .85].map((f) => r[lo] + (r[hi] - r[lo]) * f)).concat(alt.doors.filter((dd) => dd.orient === along).flatMap((dd) => [dd.center + dd.width / 2 + 150, dd.center - dd.width / 2 - 150]));
    const c = cuts.find((v) => ok(v, ['H']));
    if (c === undefined) return null;
    const mv = (v) => (v > c ? v + by : v), k = ax === 'x' ? 0 : 1;
    return {...alt, outer: {...alt.outer, [ax === 'x' ? 'w' : 'h']: alt.outer[ax === 'x' ? 'w' : 'h'] + by},
      rooms: Object.fromEntries(Object.entries(alt.rooms).map(([kk, rs]) => [kk, rs.map((r) => ({...r, [lo]: mv(r[lo]), [hi]: mv(r[hi])}))])),
      doors: alt.doors.map((dd) => (dd.orient === along ? {...dd, center: mv(dd.center)} : {...dd, axis: mv(dd.axis)})),
      stairDraw: alt.stairDraw && {...alt.stairDraw, lines: (alt.stairDraw.lines || []).map((ln) => ln.map((p) => p.map((v, i) => (i === k ? mv(v) : v))))}};
  }

  // 문을 그 벽을 따라 옮긴다(98차 사용자 요청: 진입 문·EV 문 위치 조정). shifts = {문 id: mm(생성기 축 + 방향)}.
  //   문 양쪽 방의 벽 구간이 겹치는 안에서 멈춘다(출입문은 홀 앞 벽, EV 문은 승강로 벽)
  function shiftDoors(alt, shifts) {
    if (!shifts || !Object.values(shifts).some(Boolean)) return alt;
    return {...alt, doors: alt.doors.map((dd) => {
      const off = shifts[dd.id]; if (!off) return dd;
      const [lo, hi, plo, phi] = dd.orient === 'h' ? ['x0', 'x1', 'y0', 'y1'] : ['y0', 'y1', 'x0', 'x1'];
      const side = (k) => (alt.rooms[k] || []).filter((r) => r[lo] - 1 <= dd.center && dd.center <= r[hi] + 1 && Math.min(Math.abs(r[plo] - dd.axis), Math.abs(r[phi] - dd.axis)) <= alt.t / 2 + 1);
      const spans = [dd.a, dd.b].filter((k) => alt.rooms[k]).map((k) => side(k)[0]).filter(Boolean);
      if (!spans.length) return dd;
      const s0 = Math.max(...spans.map((r) => r[lo])) + dd.width / 2 + 100, s1 = Math.min(...spans.map((r) => r[hi])) - dd.width / 2 - 100;
      return s1 < s0 ? dd : {...dd, center: Math.min(s1, Math.max(s0, dd.center + off))};
    })};
  }

  function fit(G, core, segs) {
    const {cfg, a, gy} = G, q = G.L(core.c), hc = cfg.columnMm / 2, e1 = a / 2 - 100;
    const blocksLane = (r) => segs.some((sg) => clipSeg(sg.a, sg.b, [r[0] - e1, r[1] - e1, r[2] + e1, r[3] + e1]));
    const colX = G.xLines, colY = (lo, hi) => { if (G.columnAxes) return G.columnAxes.y.filter(y => y >= lo && y <= hi); const out = []; for (let m = Math.floor((lo - G.Y0) / gy - .5) - 1; G.Y0 + (m + .5) * gy <= hi + gy; m++) out.push(G.Y0 + (m + .5) * gy); return out; };
    const maxBay = xs => Math.max(...xs.slice(1).map((v, i) => v - xs[i]));
    const reachX = G.columnAxes ? maxBay(G.columnAxes.x) : cfg.gx, reachY = G.columnAxes ? maxBay(G.columnAxes.y) : gy;
    // 한 축의 [시작, 끝] 후보: 상자 변 그대로 또는 SNAP 안의 기둥 중심·안쪽 면·바깥 면. 길이는 안의 크기 이상
    //   far: 물러난 경우(상자가 차로를 막음)에는 한 변을 한 칸 안의 기둥에 맞춰 옮겨도 된다(엔진이 자리를 찾는다)
    //   fixed: 홀로 못 늘리는 축 — 안 크기 그대로, 상자 안(±SNAP)에서 미끄러지며 상자 변·가운데·기둥 면에 맞춘다
    const spans = (lines, c, size, min, far, fixed) => {
      const near = (v, d, side) => lines.map(x=>x+side*hc).filter((f) => Math.abs(f - v) <= d), opts = (v,side) => [v, ...near(v, SNAP,side)], out = [];
      if (fixed) {
        const lo = c - size / 2, hi = c + size / 2;
        for (const s0 of [c - min / 2, lo, hi - min, ...near(c,size/2+SNAP,-1), ...near(c,size/2+SNAP,1).map(f=>f-min)]) if (s0 >= lo - SNAP - 1 && s0 + min <= hi + SNAP + 1) out.push([s0, s0 + min]);
        if (far) { for (const f of near(c,far+min/2,-1))out.push([f,f+min]);for(const f of near(c,far+min/2,1))out.push([f-min,f]); }
        return out;
      }
      for (const s0 of opts(c - size / 2,-1)) for (const e0 of opts(c + size / 2,1)) if (e0 - s0 >= min - 1) out.push([s0, e0]);
      if (far) for (const s0 of near(c - size / 2, far,-1)) for (const e0 of opts(s0 + size,1)) if (e0 - s0 >= min - 1) out.push([s0, e0]);
      if (far) for (const e0 of near(c + size / 2, far,1)) for (const s0 of opts(e0 - size,-1)) if (e0 - s0 >= min - 1) out.push([s0, e0]);
      return out;
    };
    let best = null;
    for (const alt0 of core.layouts || []) {
      const lawFail = alt0.law === 'FAIL', cache = new Map();
      // 입구 방향을 정했으면(core.facing) 그 방향만 본다
      for (const f of ['S', 'N', 'E', 'W'].filter((x) => !core.facing || x === core.facing)) {
        const [w, h] = sizeOf(f, alt0.outer.w, alt0.outer.h); if (w > core.w + 1 || h > core.d + 1) continue;
        const cys = colY(q[1] - core.d / 2 - 2 * reachY, q[1] + core.d / 2 + 2 * reachY), sn = f === 'S' || f === 'N', gx = !!stretch(alt0, 'x', 100), gyOk = !!stretch(alt0, 'y', 100), fixX = !(sn ? gx : gyOk), fixY = !(sn ? gyOk : gx);
        // 물러나는 순서(own): 0 상자 크기·놓은 자리(변만 SNAP 안에서 붙음) → 1 상자 크기·한 칸 안에서 옮김 → 2 안 자체 크기·한 칸 안에서 옮김. 차로를 막지 않는 첫 단계가 이긴다
        for (const [own, sw, sd] of [[0, core.w, core.d], [1, core.w, core.d], [2, w, h]]) for (const [x0, x1] of spans(colX, q[0], sw, w, own && reachX, fixX)) for (const [y0, y1] of spans(cys, q[1], sd, h, own && reachY, fixY)) {
          if (G.columnAxes && ((core.keep?.x && (Math.abs(x0-(q[0]-core.w/2))>1 || Math.abs(x1-(q[0]+core.w/2))>1)) || (core.keep?.y && (Math.abs(y0-(q[1]-core.d/2))>1 || Math.abs(y1-(q[1]+core.d/2))>1)))) continue;
          // 늘린 만큼 생성기 축으로 펴기(S·N은 가로 = 생성기 x, E·W는 가로 = 생성기 y)
          const gw = Math.round(x1 - x0 - w), gh = Math.round(y1 - y0 - h), [ux, uy] = f === 'S' || f === 'N' ? [gw, gh] : [gh, gw], ck = `${f}|${ux}|${uy}`;
          if (!cache.has(ck)) { const s1 = stretch(alt0, 'x', ux); cache.set(ck, s1 && stretch(s1, 'y', uy)); }
          const alt = cache.get(ck) && shiftDoors(cache.get(ck), {...(core.doorMm ? {ENT: core.doorMm} : {}), ...(core.doors || {})}); if (!alt) continue;
          const r = [x0, y0, x1, y1], to = placer(f, x0, y0, alt.outer.w, alt.outer.h);
          const rooms = Object.values(alt.rooms).flatMap((rs) => rs.map((rr) => rectOf(to, rr)));
          // 기둥 셈: 방 안(중심이 방을 기둥 반 폭만큼 줄인 안) · 벽 속 · 모서리에 묻힘(모서리가 기둥 안, 중심은 코어 안) · 걸침(중심은 밖인데 코어에 걸침)
          //   문 자리에 걸린 기둥은 방 안 기둥과 같이 센다(문을 막는다)
          const doorR = alt.doors.map((dd) => { const lo = dd.center - dd.width / 2, hi = dd.center + dd.width / 2, ax = dd.axis; return rectOf(to, dd.orient === 'h' ? {x0: lo, y0: ax - alt.t, x1: hi, y1: ax + alt.t} : {x0: ax - alt.t, y0: lo, x1: ax + alt.t, y1: hi}); });
          let roomCols = 0, wallCols = 0, corner = 0, loose = 0; const cols = [];
          for (const x of colX) { if (x < r[0] - hc || x > r[2] + hc) continue; for (const y of cys) { if (y < r[1] - hc || y > r[3] + hc) continue;
            const inR = x >= r[0] - 1 && x <= r[2] + 1 && y >= r[1] - 1 && y <= r[3] + 1, touch = x > r[0] - hc + 1 && x < r[2] + hc - 1 && y > r[1] - hc + 1 && y < r[3] + hc - 1;
            if (!touch) continue; cols.push([x, y]);
            if (doorR.some((t) => x + hc > t[0] && x - hc < t[2] && y + hc > t[1] && y - hc < t[3])) { roomCols++; continue; }
            if (x-hc<r[0]-1||x+hc>r[2]+1||y-hc<r[1]-1||y+hc>r[3]+1) loose++;
            if (!inR) continue;
            if (rooms.some((t) => x > t[0] + hc && x < t[2] - hc && y > t[1] + hc && y < t[3] - hc)) roomCols++; else wallCols++;
            if ([r[0], r[2]].some((cx) => Math.abs(Math.abs(cx-x)-hc)<=1) && [r[1], r[3]].some((cy) => Math.abs(Math.abs(cy-y)-hc)<=1)) corner++; } }
          const ent = alt.doors.find((dd) => dd.id === 'ENT'), front = to(ent.center, 0), out = to(ent.center, -WALK);
          const reach = segs.some((sg) => sg.kind !== 'ramp' && segDist(out, sg.a, sg.b) <= a / 2);
          // 남는 땅 어림: 변 바깥으로 다음 기둥 면까지 칸이 못 채우는 틈(가로는 칸 폭의 나머지, 세로는 칸 깊이보다 얕은 틈) × 변 길이
          // ponytail: 실제 칸 배치 전 어림값 — 순위 끝자리 비교용, 정확한 잔여는 build의 leftover
          const gapX = (g) => (g > 1 ? g % cfg.stallW : 0), gapY = (g) => (g > 1 && g < cfg.stallD ? g : 0);
          const fx = colX.filter((x) => x + hc <= r[0] + 1).pop(), fx2 = colX.find((x) => x - hc >= r[2] - 1), fy = cys.filter((y) => y + hc <= r[1] + 1).pop(), fy2 = cys.find((y) => y - hc >= r[3] - 1);
          const gap = (fx === undefined ? 0 : gapX(r[0] - fx - hc)) * (y1 - y0) + (fx2 === undefined ? 0 : gapX(fx2 - hc - r[2])) * (y1 - y0) + (fy === undefined ? 0 : gapY(r[1] - fy - hc)) * (x1 - x0) + (fy2 === undefined ? 0 : gapY(fy2 - hc - r[3])) * (x1 - x0);
          const dx = (x0 + x1) / 2 - q[0], dy = (y0 + y1) / 2 - q[1];
          const unfilled = own < 2 ? Math.round(Math.max(0, core.w * core.d - (x1 - x0) * (y1 - y0)) / 5e6) : 0; // 상자를 덜 채운 면적(5㎡ 단위): 사용자가 정한 크기가 먼저
          const key = [blocksLane(r) ? 1 : 0, lawFail ? 1 : 0, loose, own, roomCols, reach ? 0 : 1, -corner, unfilled, alt0.ev || 1, -wallCols, Math.round(gap / 1e6), Math.round(Math.hypot(dx, dy) / 100)];
          if (!best || less(key, best.key)) best = {key, alt, f, r, to, rooms, roomCols, wallCols, corner, loose, cols, hc, grow: [Math.round(x1 - x0 - w), Math.round(y1 - y0 - h)], box: [Math.round(x1 - x0 - core.w), Math.round(y1 - y0 - core.d)], reach, front, out, shift: Math.round(Math.hypot(dx, dy)), fitsBox: own === 0};
        }
      }
    }
    return best;
  }

  // 고른 안의 도면(지역 좌표): 방, 벽(코어 외곽 − 방 − 개구부), 문, 계단 선, 입구 앞 보행 여유
  function geometry(b) {
    const {alt, to, r} = b, t = alt.t;
    const rooms = Object.entries(alt.rooms).flatMap(([kind, rs]) => rs.map((rr) => ({kind, poly: rectPoly(rectOf(to, rr))})));
    const openings = alt.doors.map((dd) => { const h = dd.orient === 'h', lo = dd.center - dd.width / 2, hi = dd.center + dd.width / 2, ax = dd.axis;
      const rr = h ? {x0: lo, y0: ax - t / 2 - 5, x1: hi, y1: ax + t / 2 + 5} : {x0: ax - t / 2 - 5, y0: lo, x1: ax + t / 2 + 5, y1: hi};
      const p = h ? [to(lo, ax), to(hi, ax)] : [to(ax, lo), to(ax, hi)], into = dd.swingInto && alt.rooms[dd.swingInto] ? dd.swingInto : dd.id === 'ENT' ? 'H' : null;
      // 문짝이 열리는 쪽: swingInto 방의 가운데 쪽(출입문은 홀 쪽)
      let side = null; if (into) { const c = rectOf(to, alt.rooms[into][0]), m = [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2], v = [(c[0] + c[2]) / 2 - m[0], (c[1] + c[3]) / 2 - m[1]], u = [p[1][0] - p[0][0], p[1][1] - p[0][1]], n = [-u[1], u[0]]; side = Math.sign(n[0] * v[0] + n[1] * v[1]) || 1; }
      return {id: dd.id, type: dd.type, a: p[0], b: p[1], side, cut: rectPoly(rectOf(to, rr))}; });
    const shell = boolOp(boolOp([rectPoly(r)], rooms.map((x) => x.poly), CL.ClipType.ctDifference), openings.map((o) => o.cut), CL.ClipType.ctDifference);
    // 코어에 닿은 기둥은 벽과 한 덩어리(98차): 벽 채움에 합친다. 문 자리는 다시 비운다
    const hc = b.hc || 300, walls = boolOp(boolOp(shell, b.cols.map(([x, y]) => rectPoly([x - hc, y - hc, x + hc, y + hc])), CL.ClipType.ctUnion), openings.map((o) => o.cut), CL.ClipType.ctDifference);
    const stair = (alt.stairDraw?.lines || []).map((ln) => ln.map(([x, y]) => to(x, y)));
    const ent = openings.find((o) => o.id === 'ENT'), u = [ent.b[0] - ent.a[0], ent.b[1] - ent.a[1]], L = Math.hypot(...u), uu = [u[0] / L, u[1] / L], dn = [b.out[0] - b.front[0], b.out[1] - b.front[1]];
    const walk = [Gm.add(ent.a, Gm.mul(uu, -300)), Gm.add(ent.b, Gm.mul(uu, 300)), Gm.add(Gm.add(ent.b, Gm.mul(uu, 300)), dn), Gm.add(Gm.add(ent.a, Gm.mul(uu, -300)), dn)];
    return {rooms, walls, openings: openings.map(({cut, ...o}) => o), stair, walk};
  }

  const api = {fit, geometry, configure, WALK};
  if (isNode) module.exports = api; else (root.UGP = root.UGP || {}).coreFit = api;
})(this);
