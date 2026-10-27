// 코어 생성기 2판 — 칸 격자를 먼저 만들지 않고, 크기가 정해진 방을 설계자 순서대로 조립한다(2026-10-23, 사용자: "재사용 말고 근본적으로 새로").
// 원칙(사용자 2026-10-23)
//  1) 코어는 직사각형. 빈칸·창고·코어 밖으로 뺀 자리를 만들지 않는다.
//  2) 승강로·EPS는 입력 치수. 샤프트는 승강기 깊이 안에서 해결: EPS는 홀을 보고(점검구), PS는 그 뒤에 같은 폭으로 깊이를 채운다.
//     승강기 뒤가 300+벽 이상 남으면 그 자리를 PS(배관 피트)로 쓴다. 샤프트를 승강기 줄 끝에 길게 이어 붙이지 않는다.
//  3) 두 열의 길이가 다르면 짧은 쪽 앞(입구 쪽)을 홀(로비)로 쓴다. 얇게 남으면 옆 방(계단실·샤프트)이 채워 벽선을 맞춘다.
//  4) 문 원칙: 계단실 문은 층 바닥(출입) 자리, 승강기 쪽 홀을 보는 벽, 홀 쪽으로 열림(사용자 결정 2026-10-23), 열린 문짝이 다른 방·문과 닿지 않음.
//     승강기 문은 홀 쪽 칸 가운데, EPS 점검구는 홀 쪽, PS는 문 없음, 코어 입구는 홀 앞 벽 가운데.
// 좌표: mm, x 오른쪽, y 앞(입구 쪽, 0)에서 뒤로. 방 사각형은 벽 안쪽 치수, 벽 두께 t.
(function (root) {
  const CL = typeof module !== 'undefined' ? require('./core_layout.js') : root.CoreLayout;
  const Stair = typeof module !== 'undefined' ? require('../../01_stair/01_src/stair.js') : root.Stair;
  const JAMB = 100, FIT = 300, PS_MIN = 600;
  const R = (x0, y0, x1, y1) => ({ x0, y0, x1, y1 });
  const bbox = (rs) => R(Math.min(...rs.map((r) => r.x0)), Math.min(...rs.map((r) => r.y0)), Math.max(...rs.map((r) => r.x1)), Math.max(...rs.map((r) => r.y1)));
  const NAMES = { S: '계단실', H: '공용홀', E1: '승강기', E2: '승강기 2', E3: '승강기 3', E4: '승강기 4', EPS: 'EPS', PS: 'PS' };

  // U자 계단을 놓는다. dir 'v' = 길이가 y 방향, 'h' = x 방향. entryAtStart = 층 바닥(출입) 자리가 시작 쪽(위·왼쪽)
  function stairAt(env, x0, y0, dir, entryAtStart) {
    const { lay, ent, Ls, Ws } = env, L = (lx) => (entryAtStart ? ent + lx : Ls - ent - lx);
    const map = ([lx, ly]) => (dir === 'v' ? [x0 + ly, y0 + L(lx)] : [x0 + L(lx), y0 + ly]);
    const rects = lay.rects.map((r) => { const p = r.pts.map(map); return { kind: r.kind, x0: Math.min(...p.map((q) => q[0])), y0: Math.min(...p.map((q) => q[1])), x1: Math.max(...p.map((q) => q[0])), y1: Math.max(...p.map((q) => q[1])) }; });
    const room = dir === 'v' ? R(x0, y0, x0 + Ws, y0 + Ls) : R(x0, y0, x0 + Ls, y0 + Ws);
    const entry = dir === 'v' ? (entryAtStart ? R(x0, y0, x0 + Ws, y0 + ent) : R(x0, y0 + Ls - ent, x0 + Ws, y0 + Ls)) : (entryAtStart ? R(x0, y0, x0 + ent, y0 + Ws) : R(x0 + Ls - ent, y0, x0 + Ls, y0 + Ws));
    return { room, draw: { rects, lines: lay.lines.map((ln) => ln.map(map)) }, entry };
  }
  // 샤프트 묶음: 홀을 보는 폭 ew를 가능한 한 얇게. 깊이 D(승강기 깊이 등) 안에 EPS(앞, 점검구) + 벽 + PS(뒤)를 채우되 각자 입력 면적은 지킨다.
  // ew = (EPS 면적 + PS 면적) ÷ (D − 벽), 단 점검구 폭 + 양옆 벽(800) 이상. EPS 깊이 = EPS 면적 ÷ ew(최소 800), PS = 나머지(최소 600)
  const up50 = (v) => Math.ceil(v / 50 - 1e-9) * 50;
  function packDims(sp, t, D) {
    const Ae = sp.epsW * sp.epsD, Ap = sp.psW * sp.psD, J2 = sp.hatchW + 2 * JAMB;
    if (!D) D = Math.max(sp.epsD, 800) + t + Math.max(PS_MIN, Ap / Math.max(sp.epsW, J2));
    let ew = Math.max(J2, up50((Ae + Ap) / (D - t))), ed = Math.max(800, up50(Ae / ew)), pd = D - ed - t;
    if (pd < PS_MIN) { ed = Math.max(800, D - t - PS_MIN); pd = D - t - ed; ew = Math.max(J2, up50(Math.max(Ae / ed, Ap / pd))); } // 얕은 승강기: EPS 최소 800 우선, PS는 배관 피트만큼 얇게(면적은 폭으로 맞춤)
    return { ew, ed, pd, depth: D };
  }
  // 조립 도구: 방·코어 밖 자리를 모으고, 남는 띠를 원칙 4)대로 처리한다
  function builder(t) {
    const rooms = {}, cutouts = [], add = (k, r) => { (rooms[k] = rooms[k] || { key: k, name: NAMES[k], rects: [] }).rects.push(r); return r; };
    // 방 r 뒤(dir 쪽)로 남는 길이 rest. 방이 늘어날 수 있으면(grow) 얇은 띠는 흡수, 아니면 벽. 두꺼우면 코어 밖(edge = 바깥 벽 바깥면까지)
    const rest = (r, dir, restLen, grow, outerFace) => {
      if (restLen <= 0.5) return;
      if (restLen < FIT + t) { if (grow) { if (dir === 'x+') r.x1 += restLen; else if (dir === 'x-') r.x0 -= restLen; else if (dir === 'y+') r.y1 += restLen; else r.y0 -= restLen; } return; }
      if (outerFace == null) return; // 바깥에 안 닿으면 두꺼운 벽(이 생성기에서는 생기지 않게 배치)
      if (dir === 'x+') cutouts.push(R(r.x1 + t, r.y0, outerFace, r.y1)); else if (dir === 'x-') cutouts.push(R(outerFace, r.y0, r.x0 - t, r.y1));
      else if (dir === 'y+') cutouts.push(R(r.x0, r.y1 + t, r.x1, outerFace)); else cutouts.push(R(r.x0, outerFace, r.x1, r.y0 - t));
    };
    return { rooms, cutouts, add, rest };
  }
  // 코어 밖 자리끼리 벽 하나 사이로 붙거나 바깥 벽 모서리에 걸치면 이어 준다(벽만 섬처럼 남지 않게)
  function tidyCutouts(cut, W, H, t) {
    for (const c of cut) { if (c.x0 <= t + 0.5) c.x0 = 0; if (c.y0 <= t + 0.5) c.y0 = 0; if (c.x1 >= W - t - 0.5) c.x1 = W; if (c.y1 >= H - t - 0.5) c.y1 = H; }
    const add = [];
    for (const a of cut) for (const b of cut) if (a !== b) {
      const ox = [Math.max(a.x0, b.x0), Math.min(a.x1, b.x1)], oy = [Math.max(a.y0, b.y0), Math.min(a.y1, b.y1)];
      if (b.y0 >= a.y1 - 0.5 && b.y0 - a.y1 <= t + 0.5 && ox[1] - ox[0] > 1) add.push(R(ox[0], a.y1, ox[1], b.y0));
      if (b.x0 >= a.x1 - 0.5 && b.x0 - a.x1 <= t + 0.5 && oy[1] - oy[0] > 1) add.push(R(a.x1, oy[0], b.x0, oy[1]));
    }
    return cut.concat(add).filter((c) => c.x1 - c.x0 > 1 && c.y1 - c.y0 > 1);
  }
  const door = (o) => ({ fits: true, ...o });
  const stairDoor = (sp, st, wallAxis, orient, swingIntoSide) => {
    const e = st.entry, mid = orient === 'v' ? (e.y0 + e.y1) / 2 : (e.x0 + e.x1) / 2, span = orient === 'v' ? e.y1 - e.y0 : e.x1 - e.x0, w = Math.min(sp.stairDoorW, span - 2 * JAMB);
    const st0 = orient === 'v' ? st.room.y0 : st.room.x0, hinge = Math.abs((orient === 'v' ? e.y0 : e.x0) - st0) < 1 ? 'lo' : 'hi'; // 출입 자리 쪽 방 모서리에 경첩 — 문짝이 첫 단에서 멀어짐
    return door({ id: 'S-H', a: 'S', b: 'H', orient, axis: wallAxis, center: mid, width: w, hinge, type: sp.stairKind === 'open' ? 'open' : 'swing', swingInto: sp.stairKind === 'open' ? undefined : 'H' });
  };
  const hallW = (sp) => Math.max(sp.hallMinW + (sp.evCount - 1) * 300, sp.entryDoorW + 2 * JAMB, 1400);
  const axis = (xs) => xs.some((x) => x.status === 'FAIL') ? 'FAIL' : xs.length && xs.every((x) => x.status === 'NOT_CHECKED') ? 'NOT_CHECKED' : xs.some((x) => x.status !== 'PASS' && x.status !== 'N/A') ? 'CHECK' : 'PASS';
  function review(a, sp, env) {
    const P = [], L = [], E = [], add = (xs, id, label, status, note) => xs.push({ id, label, status, note });
    const eps = a.doors.find((d) => d.id === 'EPS-H'), hall = Math.max(...a.rooms.H.rects.map((q) => Math.min(q.x1 - q.x0, q.y1 - q.y0)));
    add(P, 'no-void', '빈칸 없는 직사각형', 'PASS', '모든 내부 자리를 방·홀·벽이 채움');
    add(P, 'eps-access', 'EPS 점검 접근', eps ? 'PASS' : 'FAIL', eps ? `공용홀에서 폭 ${sp.hatchW}mm 점검구로 접근` : '공용홀 쪽 점검구 없음');
    add(P, 'ev-lobby', '승강기 앞 대기폭', hall >= hallW(sp) ? 'PASS' : 'CHECK', `${Math.round(hall)}mm / 계획 출발값 ${hallW(sp)}mm. 장애인용 승강기 활동공간은 별도 확인`);
    const prof = Stair.PROFILES[sp.stairUse];
    for (const c of Stair.checks(env.g, { tread: sp.tread, width: sp.stairWidth, floorHeight: sp.floorHeight, railOn: false, railH: 850 }, prof)) {
      if (c.id === '2rt') add(P, c.id, c.label, c.status, `${c.value} (권장값, 법정 기준 아님)`);
      else if (['riser', 'tread', 'width', 'landing-gap', 'landing-w', 'headroom'].includes(c.id)) add(L, c.id, c.label, c.status, `${typeof c.value === 'number' ? Math.round(c.value * 10) / 10 : c.value} / 기준 ${c.limit} · ${c.cite || ''}${c.note ? ' · ' + c.note : ''}`);
    }
    const sd = a.doors.filter((d) => d.a === 'S' && d.b === 'H'), cite = '피난방화규칙 제9조제2항제1호바목';
    if (sp.stairKind === 'special') {
      add(L, 'special-vestibule', '특별피난계단 부속실', 'FAIL', '현재 안에는 노대 또는 배연설비가 있는 3㎡ 이상 부속실이 없어 특별피난계단으로 쓸 수 없음 · 피난방화규칙 제9조제2항제3호가목');
      add(L, 'special-door', '부속실·계단실 출입구', 'FAIL', '부속실 양쪽의 60분(+) 방화문과 피난 방향 열림이 평면에 없음 · 피난방화규칙 제9조제2항제3호자목');
    } else if (sp.stairKind === 'evac') {
      if (!sd.length || sd.every((d) => d.type === 'open')) add(L, 'evac-door', '피난계단 출입구', 'FAIL', `계단과 홀 사이에 방화문이 없음 · ${cite}`);
      else add(L, 'evac-door', '피난계단 출입구', sp.stairDoorW < 900 ? 'FAIL' : 'CHECK', `유효너비 ${sp.stairDoorW}mm${sp.stairDoorW < 900 ? '로 900mm 미달' : '로 폭은 충족'}. 60분(+) 방화문과 실제 피난 방향으로 열리는지는 프로젝트 조건 확인 필요 · ${cite}`);
    } else if (sp.stairKind === 'open') add(L, 'open-stair', '계단실 트임', 'CHECK', '일반 직통계단이고 피난계단·특별피난계단 대상이 아닐 때만 가능');
    else add(L, 'evac-need', '피난계단 해당 여부', 'NOT_CHECKED', '층수·용도·바닥면적 입력이 없어 판정하지 않음');
    add(L, 'ev-law', '승강기 대수·비상용 승강기', 'NOT_CHECKED', '연면적·층수·높이 입력이 없어 판정하지 않음');
    add(E, 'eps', 'EPS 크기', 'NOT_CHECKED', `입력 ${sp.epsW}×${sp.epsD}mm. 기기와 작업 공간을 정해야 판정 가능`);
    add(E, 'ps', 'PS 크기·점검', 'NOT_CHECKED', `입력 ${sp.psW}×${sp.psD}mm. 배관 종류·관경·점검 방식을 정해야 판정 가능`);
    add(E, 'vertical', '위아래 층 연속', 'NOT_CHECKED', '한 층 평면만으로 판정하지 않음');
    const out = { geom: 'PASS', plan: axis(P), law: axis(L), equip: axis(E), planItems: P, lawItems: L, equipItems: E, stairUse: prof ? prof.name : '' };
    out.text = `기하 성립 · 계획 ${CL.WORD[out.plan]} · 법규 ${CL.WORD[out.law]} · 설비 ${CL.WORD[out.equip]}`;
    return out;
  }

  // A·A2 대면형: 계단 열 | 홀 | 승강기 열. side = 'ev'(샤프트가 승강기 옆, A) 또는 'stair'(샤프트가 계단 옆, A2)
  function altFacing(sp, env, side) {
    const t = sp.wall, n = sp.evCount, Hw = hallW(sp), b = builder(t), Ds = env.Ws, De = sp.evD, P = packDims(sp, t, side === 'ev' ? De : Ds);
    const evL = n * sp.evW + (n - 1) * t;
    const Lsc = side === 'stair' ? env.Ls + t + P.ew : env.Ls, Lec = side === 'ev' ? evL + t + P.ew : evL, L = Math.max(Lsc, Lec);
    const xS = t, xH = xS + Ds + t, xE = xH + Hw + t, W = xE + De + t, H = t + L + t;
    const lobS = L - Lsc >= FIT + t ? L - Lsc : 0, lobE = L - Lec >= FIT + t ? L - Lec : 0, yS = t + lobS, yE = t + lobE; // 짧은 열은 뒤로 붙이고 앞은 로비
    const st = stairAt(env, xS, yS, 'v', true), S = b.add('S', st.room);
    b.add('H', R(xH, t, xH + Hw, t + L));
    if (lobS) { b.add('H', R(xS, t, xS + Ds, yS - t)); b.add('H', R(xS + Ds, t, xH, yS - t)); }
    if (lobE) { b.add('H', R(xE, t, xE + De, yE - t)); b.add('H', R(xH + Hw, t, xE, yE - t)); }
    const doors = [door({ id: 'ENT', a: 'H', b: 'OUT', side: 'S', orient: 'h', axis: t / 2, center: xH + Hw / 2, width: sp.entryDoorW, type: 'open' }), stairDoor(sp, st, xH - t / 2, 'v')];
    const pack = (x0, y0, facing, colDepth) => { // facing 'x-': 홀이 왼쪽. PS는 열 깊이를 채운다(승강기 깊이 안에서 해결)
      const E = facing === 'x-' ? R(x0, y0, x0 + P.ed, y0 + P.ew) : R(x0 + colDepth - P.ed, y0, x0 + colDepth, y0 + P.ew);
      const Q = facing === 'x-' ? R(E.x1 + t, y0, x0 + colDepth, y0 + P.ew) : R(x0, y0, E.x0 - t, y0 + P.ew);
      b.add('EPS', E); b.add('PS', Q);
      doors.push(door({ id: 'EPS-H', a: 'EPS', b: 'H', orient: 'v', axis: facing === 'x-' ? E.x0 - t / 2 : E.x1 + t / 2, center: (E.y0 + E.y1) / 2, width: sp.hatchW, type: 'hatch', swingInto: 'H' }));
      return [E, Q];
    };
    let y = yE; const evs = [];
    for (let i = 0; i < n; i++) { const k = `E${i + 1}`, r = b.add(k, R(xE, y, xE + sp.evD, y + sp.evW)); evs.push(r); doors.push(door({ id: `${k}-H`, a: k, b: 'H', orient: 'v', axis: xE - t / 2, center: y + sp.evW / 2, width: sp.evDoorW, type: 'slide', swingInto: 'H' })); y += sp.evW + t; }
    let tailS = [S], tailE = null;
    if (side === 'ev') tailE = pack(xE, y, 'x-', De); else tailS = pack(xS, yS + env.Ls + t, 'x+', Ds);
    // 얇게 남는 길이(로비가 안 될 만큼)는 끝 방이 채운다. 승강기가 끝이면 두꺼운 벽
    if (!lobS && L - Lsc > 0.5) tailS.forEach((r) => { r.y1 = t + L; });
    if (!lobE && L - Lec > 0.5) {
      if (tailE) tailE.forEach((r) => { r.y1 = t + L; });
      else if (evs.length) evs[evs.length - 1].y1 = t + L; // A2의 얇은 뒤 띠는 마지막 승강로가 흡수해 뒷벽을 맞춘다
    }
    // A2: 승강기 뒤에 PS를 달 수 있을 만큼 남으면(작은 승강기) 그 자리를 PS로
    const lob = Math.max(lobS, lobE), big = lob > 3000; // 한 열이 너무 짧으면 로비가 지나치게 깊다 — 비교용으로만
    return { id: side === 'ev' ? 'A' : 'A2', name: side === 'ev' ? 'A안 · 홀을 사이에 둔 대면형 — 승강기 옆 EPS, 그 뒤 PS' : 'A2안 · 홀을 사이에 둔 대면형 — 계단 옆 EPS, 그 뒤 PS', W, H, b, doors, stairDraw: st.draw, stairShape: 'u', fit: !big, fitNote: big ? `${lobE ? '승강기' : '계단'} 열이 짧아 입구 쪽 홀이 ${(lob / 1000).toFixed(1)}m 깊어짐 — 이 입력에서는 비교용` : undefined };
  }

  // B·B2·B3 일렬형: 앞 홀 띠 + 한 줄(계단·승강기·샤프트 묶음). order = 'S P E' | 'S E P' | 'E S P'
  function altRow(sp, env, order) {
    const t = sp.wall, n = sp.evCount, b = builder(t), Hd = Math.max(sp.hallMinW, 1200);
    const D = Math.max(env.Ws, sp.evD), y0 = t + Hd + t, P = packDims(sp, t, D);
    const widths = { S: env.Ls, P: P.ew, E: n * sp.evW + (n - 1) * t }, seq = order.split(' ');
    const W = t + seq.reduce((s, k) => s + widths[k] + t, 0), H = y0 + D + t, doors = [], xs = {};
    let x = t; for (const k of seq) { xs[k] = x; x += widths[k] + t; }
    const st = stairAt(env, xs.S, y0, 'h', !(xs.E > xs.S)), S = b.add('S', st.room); S.y1 = y0 + D; // 계단 출입 자리는 승강기 쪽 끝, 깊이 차이는 계단실이 채움
    doors.push(stairDoor(sp, st, y0 - t / 2, 'h'));
    const evBack = D - sp.evD >= FIT + t; // 승강기 뒤가 300 + 벽 이상 남으면 그 자리를 PS(배관 피트)로
    for (let i = 0; i < n; i++) { const kk = `E${i + 1}`, x0 = xs.E + i * (sp.evW + t), r = b.add(kk, R(x0, y0, x0 + sp.evW, y0 + (evBack ? sp.evD : D))); /* 얇게 남는 뒤는 승강로가 채워 뒷벽을 맞춘다 */ doors.push(door({ id: `${kk}-H`, a: kk, b: 'H', orient: 'h', axis: y0 - t / 2, center: x0 + sp.evW / 2, width: sp.evDoorW, type: 'slide', swingInto: 'H' })); }
    const E = b.add('EPS', R(xs.P, y0, xs.P + P.ew, y0 + P.ed)), Q = b.add('PS', R(xs.P, E.y1 + t, xs.P + P.ew, y0 + D));
    doors.push(door({ id: 'EPS-H', a: 'EPS', b: 'H', orient: 'h', axis: y0 - t / 2, center: (E.x0 + E.x1) / 2, width: sp.hatchW, type: 'hatch', swingInto: 'H' }));
    if (evBack) {
      const yb = y0 + sp.evD + t; b.add('PS', R(xs.E, yb, xs.E + widths.E, y0 + D));
      const adj = Math.abs(xs.E + widths.E + t - xs.P) < 1 ? [xs.E + widths.E, xs.P] : Math.abs(xs.P + P.ew + t - xs.E) < 1 ? [xs.P + P.ew, xs.E] : null; // 샤프트 묶음과 맞닿으면 PS를 하나로 잇는다
      if (adj) b.add('PS', R(adj[0], Math.max(yb, Q.y0), adj[1], y0 + D));
    }
    b.add('H', R(t, t, W - t, t + Hd));
    doors.unshift(door({ id: 'ENT', a: 'H', b: 'OUT', side: 'S', orient: 'h', axis: t / 2, center: W / 2, width: sp.entryDoorW, type: 'open' }));
    const id = { 'S P E': 'B', 'S E P': 'B2', 'E S P': 'B3' }[order], nm = { 'S P E': '계단 | 샤프트 | 승강기', 'S E P': '계단 | 승강기 | 샤프트', 'E S P': '승강기 | 계단 | 샤프트' }[order];
    return { id, name: `${id}안 · 앞 홀을 같이 쓰는 일렬형 — ${nm}`, W, H, b, doors, stairDraw: st.draw, stairShape: 'u' };
  }

  // C ㄷ자: 앞 홀 띠 + [계단 | 승강기들·샤프트 덩어리 | 계단] + 뒤 계단 줄. 덩어리 앞이 남으면 홀(승강기 앞 홀이 깊어짐)
  function altWrap(sp, env) {
    const t = sp.wall, n = sp.evCount, b = builder(t), Wd = sp.stairWidth, tr = sp.tread, Hd = Math.max(sp.hallMinW, sp.entryDoorW + 2 * JAMB);
    const Bd = sp.evD, P = packDims(sp, t, Bd), Bw = n * sp.evW + n * t + P.ew, Ltop = Bw + 2 * t, N = env.g.n;
    const capT = Math.floor(Ltop / tr + 1e-9) + 1; let s = Math.max(2, Math.ceil((N - capT) / 2)); if (N - 2 * s < 2) s = Math.floor((N - 2) / 2);
    const r2 = N - 2 * s, fit = s >= 2 && r2 >= 2 && (r2 - 1) * tr <= Ltop + 1e-6;
    const D = Math.max(Bd, (s - 1) * tr - t), y0 = t + Hd + t, xL = t, xB = t + Wd + t, xR = xB + Bw + t, W = xR + Wd + t, yTop = y0 + D + t, H = yTop + Wd + t;
    const front = D - Bd, by0 = front >= FIT + t ? y0 + front : y0; // 덩어리를 뒤로 붙이고 앞은 홀, 얕으면 앞에 붙임(뒤는 두꺼운 벽)
    b.add('H', R(t, t, W - t, t + Hd)); if (by0 > y0) b.add('H', R(xB, t + Hd, xB + Bw, by0 - t));
    ['S'].forEach(() => { b.add('S', R(xL, y0, xL + Wd, yTop)); b.add('S', R(xR, y0, xR + Wd, yTop)); b.add('S', R(xL, yTop, W - t, yTop + Wd)); b.add('S', R(xL, y0 + D, xL + Wd, yTop)); });
    const doors = [door({ id: 'ENT', a: 'H', b: 'OUT', side: 'S', orient: 'h', axis: t / 2, center: W / 2, width: sp.entryDoorW, type: 'open' }),
      // 계단 양 끝(층 바닥 자리 둘)은 피난계단이면 60분(+) 방화문: 다른 안과 같은 여닫이, 홀 쪽 열림(98차, 법규 실패 해소). 트인 계단(open)일 때만 문 없이
      ...[['S-H1', xL], ['S-H2', xR]].map(([id, x]) => door(sp.stairKind === 'open' ? { id, a: 'S', b: 'H', orient: 'h', axis: y0 - t / 2, center: x + Wd / 2, width: Wd - 2 * JAMB, type: 'open' } : { id, a: 'S', b: 'H', orient: 'h', axis: y0 - t / 2, center: x + Wd / 2, width: Math.min(sp.stairDoorW, Wd - 2 * JAMB), hinge: 'lo', type: 'swing', swingInto: 'H' }))];
    let x = xB;
    for (let i = 0; i < n; i++) { const k = `E${i + 1}`, r = b.add(k, R(x, by0, x + sp.evW, by0 + sp.evD)); doors.push(door({ id: `${k}-H`, a: k, b: 'H', orient: 'h', axis: by0 - t / 2, center: x + sp.evW / 2, width: sp.evDoorW, type: 'slide', swingInto: 'H' })); x += sp.evW + t; }
    const E = b.add('EPS', R(x, by0, x + P.ew, by0 + P.ed)), Q = b.add('PS', R(x, E.y1 + t, x + P.ew, by0 + Bd));
    doors.push(door({ id: 'EPS-H', a: 'EPS', b: 'H', orient: 'h', axis: by0 - t / 2, center: (E.x0 + E.x1) / 2, width: sp.hatchW, type: 'hatch', swingInto: 'H' }));
    // 계단 그림: 좌우 구간(s단)은 뒤 계단참으로 오르고, 위 구간(r2단)이 두 계단참 사이
    const run = (r) => (r - 1) * tr, yf = yTop - run(s), slack = Ltop - run(r2), xa = xL + Wd + slack / 2, X1 = W - t;
    const fl = [R(xL, yf, xL + Wd, yTop), R(xa, yTop, xa + run(r2), yTop + Wd), R(X1 - Wd, yf, X1, yTop)], landings = [R(xL, yTop, xa, yTop + Wd), R(xa + run(r2), yTop, X1, yTop + Wd)], lines = [];
    for (let i = 1; i < s - 1; i++) lines.push([[xL, yf + i * tr], [xL + Wd, yf + i * tr]], [[X1 - Wd, yf + i * tr], [X1, yf + i * tr]]);
    for (let i = 1; i < r2 - 1; i++) lines.push([[xa + i * tr, yTop], [xa + i * tr, yTop + Wd]]);
    const draw = { rects: fl.map((q) => ({ kind: 'flight', ...q })).concat(landings.map((q) => ({ kind: 'landing', ...q }))), lines };
    return { id: 'C', name: 'C안 · 승강기를 감싸는 ㄷ자 계단형', W, H, b, doors, stairDraw: draw, stairShape: 'wrap', fit, fitNote: fit ? `좌우 ${s}단 · 위 ${r2}단` : `위 구간 ${r2}단이 승강기 덩어리 폭에 맞지 않음 — 이 입력에서는 비교용` };
  }

  function finish(d, sp, env) {
    const t = sp.wall, cut = tidyCutouts(d.b.cutouts, d.W, d.H, t), rooms = d.b.rooms;
    for (const k of Object.keys(rooms)) rooms[k].bbox = bbox(rooms[k].rects);
    const ps = rooms.PS.bbox, eps = rooms.EPS.bbox, notes = [`EPS ${Math.round(eps.x1 - eps.x0)}×${Math.round(eps.y1 - eps.y0)}`, `PS ${Math.round(ps.x1 - ps.x0)}×${Math.round(ps.y1 - ps.y0)} (입력 ${sp.psW}×${sp.psD}와 같은 면적, EPS 폭에 맞춤)`];
    const ok = d.fit !== false;
    const a = { id: d.id, name: d.name, gen: 2, t, outer: { w: d.W, h: d.H }, rooms, doors: d.doors, cutouts: cut, stairDraw: d.stairDraw, stairShape: d.stairShape, status: 'OK', candidate: ok, candidateNote: ok ? '정상 비교 후보' : d.fitNote, notes: d.fitNote ? notes.concat(d.fitNote) : notes };
    a.review = review(a, sp, env); a.statusText = a.review.text;
    return a;
  }

  function generate(input) {
    const { spec, errors, fields } = CL.normalizeSpec(input || {});
    if (errors.length) return { ok: false, errors, fields, spec };
    let g; try { g = Stair.calc({ floorHeight: spec.floorHeight, targetRiser: spec.targetRiser, tread: spec.tread, width: spec.stairWidth, minFlights: 2 }); } catch (e) { return { ok: false, errors: ['계단 계산에 실패했습니다: ' + e.message], spec }; }
    if (g.flights.length !== 2) return { ok: false, errors: [`층고 ${spec.floorHeight}mm는 2회전 U형으로 그릴 수 없습니다`], spec };
    const lay = Stair.layout(g, { tread: spec.tread, width: spec.stairWidth, turn: 180, side: 1 });
    const stairLen = lay.bounds.x1 - lay.bounds.x0, Ws = lay.bounds.y1 - lay.bounds.y0, ent = Math.max(spec.stairWidth, 1200), env = { g, lay, ent, Ws, Ls: ent + stairLen };
    const alts = [altFacing(spec, env, 'ev'), altRow(spec, env, 'S P E'), altWrap(spec, env), altFacing(spec, env, 'stair'), altRow(spec, env, 'S E P'), altRow(spec, env, 'E S P')].map((d) => finish(d, spec, env));
    return { ok: true, gen: 2, spec, stair: { g, lay, stairLen, stairWid: Ws, entryDepth: ent }, alts };
  }
  const api = { generate, packDims, FIT, PS_MIN, NAMES };
  if (typeof module !== 'undefined') module.exports = api; else root.CoreGen2 = api;
})(this);
