// 코어 레이아웃 생성기 — 소형 단일 압축 코어(승강기 1~3대 + 계단 1개 + EPS·PS + 공용홀) 한 덩어리의 내부 평면 알트.
// 길이 단위 mm. 브라우저와 node 양쪽에서 로드된다. 계단 단수·단높이·구간별 단수·U형 평면은 01_stair의 계산을 그대로 쓴다.
// 여기서 다루는 것은 코어 "안"의 위상(맞닿음·마주 봄·접근 순서·문)뿐이다. 코어가 건물 어디에 놓이는지, 법규 적합 여부는 다루지 않는다.
(function (root) {
  'use strict';
  const Stair = typeof module !== 'undefined' ? require('../../01_stair/01_src/stair.js') : root.Stair;

  // 방 이름. 승강기는 대수만큼 E1~E4. 샤프트는 EPS(작은 점검구가 있음)와 PS(닫힌 샤프트).
  const NAMES = { S: '계단실', H: '공용홀', E1: '승강기', E2: '승강기 2', E3: '승강기 3', E4: '승강기 4', EPS: 'EPS', PS: 'PS', R: '잔여 공간', SR: '창고(여유)' };
  const KIND = { S: 'S', H: 'H', E1: 'E', E2: 'E', E3: 'E', E4: 'E', EPS: 'P', PS: 'P', R: 'R', SR: 'X' }; // 분석에서는 승강기끼리, 샤프트끼리 같은 종류로 본다
  const EV_KEYS = ['E1', 'E2', 'E3', 'E4']; // 4대는 한 줄로 쌓는다(공모 17번 기숙사의 2×2는 아직 없음)
  // 승강기 승강로 규격 후보. 한 제조사 카탈로그 값이며 국내 법정 규격이 아니다 — 사용자 확인 전 미승인.
  const EV_SOURCE = 'TK Elevator EOX 카탈로그 승강로 치수표(속도 1.0 m/s, 이동 높이 40m 이하, 출입구 한 곳)';
  const EV_SOURCE_URLS = ['https://digital.brochure.tkelevator.com/brochure/eox1b/shaft-dimensions-8/', 'https://digital.brochure.tkelevator.com/brochure/eox1b/shaft-dimensions-1000-kg-at-1-0-m-s/'];
  const EV_SPECS = [
    { id: 'p1600', label: '인승 미확인 소형 (칸 1600×1350, 공모 DXF 12·13·16·18번) · 문 폭 1200', w: 2100, d: 1840, door: 1200 }, // 승강로 안쪽은 12번 동신초 도면 실측(문 쪽 2100 × 깊이 1840). 카탈로그 값이 아님
    { id: 'p8', label: '8인승 (630kg) · 문 폭 900', w: 1600, d: 1680, door: 900 },
    { id: 'p13d', label: '13인승 (1000kg) 깊은 승강로 · 문 폭 900', w: 1600, d: 2380, door: 900 },
    { id: 'p13w', label: '13인승 (1000kg) 넓은 승강로 · 문 폭 1000', w: 2220, d: 1645, door: 1000 },
    { id: 'p15', label: '15인승 (1150kg) · 문 폭 1000', w: 2160, d: 2345, door: 1000 },
    { id: 'p17', label: '17인승 (1275kg) · 문 폭 1000', w: 2160, d: 2545, door: 1000 },
    { id: 'p21', label: '21인승 (1600kg) · 문 폭 1100', w: 2360, d: 2645, door: 1100 }];
  // 아래 기본값은 모두 미승인 값이다(사용자 확인 전). EPS·PS 크기는 소형 공공건축 계획 단계에서 흔히 잡는 최소 치수로 둔 가정값이다.
  const DEFAULTS = { floorHeight: 3600, targetRiser: 160, tread: 280, stairWidth: 1200, wall: 250, evSpec: 'p15', evCount: 1, evW: 2160, evD: 2345, evDoorW: 1000, epsW: 1200, epsD: 900, psW: 900, psD: 900, hatchW: 600, hallMinW: 2000, stairDoorW: 1000, entryDoorW: 1200, stairUse: 'floor120', stairKind: 'evac', aShaft: 'side' };
  const STAIR_KINDS = { unknown: '아직 모름', normal: '일반 직통계단', evac: '건물 안 피난계단', special: '특별피난계단(부속실 필요)', open: '일반 직통계단 · 계단실이 홀로 트임(문 없음)' };
  const LABELS = { stairUse: '계단 법규 기준', stairKind: '계단 종류', aShaft: 'A안 샤프트 배치', floorHeight: '층고', targetRiser: '단높이', tread: '단너비', stairWidth: '계단 유효폭', wall: '벽 두께', evSpec: '승강기 규격', evCount: '승강기 대수', evW: '승강기 샤프트 가로', evD: '승강기 샤프트 세로', evDoorW: '승강기 문 폭', epsW: 'EPS 가로', epsD: 'EPS 세로', psW: 'PS 가로', psD: 'PS 세로', hatchW: 'EPS 점검구 폭', hallMinW: '공용홀 최소 폭', stairDoorW: '계단실 문 폭', entryDoorW: '코어 출입구 폭' };
  const RANGE = { floorHeight: [2000, 8000], targetRiser: [100, 250], tread: [200, 400], stairWidth: [600, 3000] }; // 이 밖의 값은 입력 중간값으로 보고 그리지 않는다
  const SHAFT_MIN = 600; // 칸 경계를 합칠 때 쓰는 최소 깊이(미승인 값)
  const LEAD_MIN = 50; // 남는 깊이를 홀 자리로 돌리는 최소값(이보다 얕으면 끝 방이 흡수)
  const SNAP = 300; // 열마다 다른 칸 경계가 벽 두께 + 이 값보다 가까우면 하나로 합친다(앞 방이 조금 커짐)
  const REST_OK = 0.5e6; // 잔여 면적이 이보다 작으면 계획 검토 통과(mm², 미승인 값)
  const JAMB = 100; // 문 옆 벽이 최소한 남아야 하는 길이
  const PS_MIN = 600; // PS를 벽선 맞춤으로 줄일 수 있는 최소(외부관리 점검구 600×600, 04_research/EPS_PS_치수조사.md)
  const EPS_MIN = 800; // EPS 최소 안쪽(분전함 150 + 작업 공간 600~650)
  const clampR = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  const epsMinOf = (sp) => Math.max(EPS_MIN, sp.hatchW + 2 * JAMB);
  // 같은 열에 쌓는 EPS·PS의 공통 폭: 두 범위(최소~입력값)가 겹치면 겹치는 가장 큰 폭으로 맞춘다(벽선 일치). 안 겹치면 큰 쪽.
  const shaftColW = (sp) => { const lo = Math.max(epsMinOf(sp), PS_MIN), hi = Math.min(Math.max(sp.epsW, sp.hatchW + 2 * JAMB), sp.psW); return lo <= hi ? hi : Math.max(sp.epsW, sp.psW, sp.hatchW + 2 * JAMB); };
  const DOOR_FRONT = 1200; // 문 앞에 비어 있어야 하는 홀 깊이(승강장·출입 여유, 미승인 값)
  const jong = (w) => { const c = String(w).charCodeAt(String(w).length - 1); return c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 !== 0; };
  const iga = (w) => w + (jong(w) ? '이' : '가'), wagwa = (w) => w + (jong(w) ? '과' : '와');
  // 서로 정확히 맞붙은 사각형 조각을 합쳐 더 큰 사각형으로 만든다(칸 조각 + 칸 사이 틈 조각 → 홀 띠)
  function mergeRects(rects, first = 'h') {
    let rs = rects.map((r) => ({ ...r }));
    const pass = (dir) => {
      let again = true;
      while (again) {
        again = false;
        outer: for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
          const a = rs[i], b = rs[j];
          if (dir === 'h' && a.y0 === b.y0 && a.y1 === b.y1 && (a.x1 === b.x0 || b.x1 === a.x0)) { rs.splice(j, 1); rs[i] = { x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), y0: a.y0, y1: a.y1 }; again = true; break outer; }
          if (dir === 'v' && a.x0 === b.x0 && a.x1 === b.x1 && (a.y1 === b.y0 || b.y1 === a.y0)) { rs.splice(j, 1); rs[i] = { y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1), x0: a.x0, x1: a.x1 }; again = true; break outer; }
        }
      }
    };
    const second = first === 'h' ? 'v' : 'h';
    pass(first); pass(second); pass(first);
    return rs;
  }
  const within = (r, q) => q.x0 >= r.x0 - 1e-6 && q.x1 <= r.x1 + 1e-6 && q.y0 >= r.y0 - 1e-6 && q.y1 <= r.y1 + 1e-6;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const r1 = (n) => Math.round(n * 10) / 10;
  const bboxOf = (rs) => ({ x0: Math.min(...rs.map((r) => r.x0)), y0: Math.min(...rs.map((r) => r.y0)), x1: Math.max(...rs.map((r) => r.x1)), y1: Math.max(...rs.map((r) => r.y1)) });
  const areaOf = (r) => (r.x1 - r.x0) * (r.y1 - r.y0);
  const overlapArea = (a, b) => { const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0); return w > 1e-6 && h > 1e-6 ? w * h : 0; };

  function normalizeSpec(input) {
    const spec = { ...DEFAULTS, ...(input || {}) }, errors = [];
    const ev = EV_SPECS.find((x) => x.id === spec.evSpec);
    if (ev) { spec.evW = ev.w; spec.evD = ev.d; spec.evDoorW = ev.door; } // 규격을 고르면 승강기 크기·문 폭은 규격 값을 쓴다
    else if (spec.evSpec !== 'custom') errors.push('승강기 규격을 목록에서 고르거나 "직접 입력"을 고르세요.');
    if (![1, 2, 3, 4].includes(spec.evCount)) errors.push('승강기 대수는 1·2·3·4 중에서 고르세요.');
    if (!Stair.PROFILES[spec.stairUse]) errors.push('계단 법규 기준을 목록에서 고르세요.');
    if (!STAIR_KINDS[spec.stairKind]) errors.push('계단 종류를 목록에서 고르세요.');
    if (!A_SHAFT[spec.aShaft]) errors.push('A안 샤프트 배치를 목록에서 고르세요.');
    const fields = {}, bad = (k, m) => { errors.push(m); fields[k] = fields[k] || m; }; // fields: 어느 입력칸의 문제인지(화면에서 칸 아래 안내로 쓴다)
    for (const k of Object.keys(DEFAULTS)) {
      if (k === 'evSpec' || k === 'evCount' || k === 'stairUse' || k === 'stairKind' || k === 'aShaft') continue;
      const v = spec[k], rg = RANGE[k];
      if (!(Number.isFinite(v) && v > 0)) bad(k, `${LABELS[k]}은(는) 0보다 큰 숫자여야 합니다.`);
      else if (rg && (v < rg[0] || v > rg[1])) bad(k, `${LABELS[k]}은(는) ${rg[0]}~${rg[1]}mm 사이여야 합니다(지금 ${Math.round(v * 10) / 10}).`);
      else if (!rg && v > 20000) bad(k, `${LABELS[k]}이(가) 너무 큽니다(20m 이하).`);
    }
    if (Number.isFinite(spec.wall) && spec.wall > 0 && (spec.wall < 200 || spec.wall > 300)) bad('wall', '벽 두께는 200~300mm 사이여야 합니다.');
    return { spec, errors, fields };
  }

  // 층고·단높이 연동(양방향). 층고를 바꾸면 지금 단높이에 가장 가까운 단 수로 맞춰 단높이가 따라 바뀌고, 단높이를 바꾸면 단 수는 그대로 두고 층고가 따라 바뀐다.
  function linkStair(state, field, value) {
    const H = state.floorHeight, r = state.targetRiser, n = Math.max(2, Math.round(H / r));
    const o = { floorHeight: H, targetRiser: r };
    if (field === 'floorHeight') { const m = Math.max(2, Math.round(value / r)); o.floorHeight = value; o.targetRiser = value / m; }
    else if (field === 'targetRiser') { o.targetRiser = value; o.floorHeight = Math.round(n * value * 1000) / 1000; }
    else if (field === 'risers') { const m = Math.max(2, Math.round(value)); o.targetRiser = H / m; }
    return { ...o, risers: Math.max(2, Math.round(o.floorHeight / o.targetRiser)) };
  }

  // ---- 칸 격자: 가로·세로 칸 크기와 "칸 → 방" 배정으로 평면을 만든다. 서로 다른 방 사이에는 벽 두께만큼의 벽이 생기고, 같은 방끼리는 벽이 없다.
  function buildGrid(t, colsW, rowsH, assign) {
    const nC = colsW.length, nR = rowsH.length, xs = [], ys = [];
    let x = t; for (const w of colsW) { xs.push([x, x + w]); x += w + t; }
    let y = t; for (const h of rowsH) { ys.push([y, y + h]); y += h + t; }
    const outer = { w: x, h: y }, key = (c, r) => assign(c, r), rooms = {};
    const add = (k, rc) => { (rooms[k] = rooms[k] || { key: k, name: NAMES[k], rects: [] }).rects.push(rc); };
    for (let r = 0; r < nR; r++) for (let c = 0; c < nC; c++) add(key(c, r), { x0: xs[c][0], x1: xs[c][1], y0: ys[r][0], y1: ys[r][1] });
    for (let r = 0; r < nR; r++) for (let c = 0; c < nC - 1; c++) if (key(c, r) === key(c + 1, r)) add(key(c, r), { x0: xs[c][1], x1: xs[c + 1][0], y0: ys[r][0], y1: ys[r][1] });
    for (let r = 0; r < nR - 1; r++) for (let c = 0; c < nC; c++) if (key(c, r) === key(c, r + 1)) add(key(c, r), { x0: xs[c][0], x1: xs[c][1], y0: ys[r][1], y1: ys[r + 1][0] });
    for (let r = 0; r < nR - 1; r++) for (let c = 0; c < nC - 1; c++) { const k = key(c, r); if (k === key(c + 1, r) && k === key(c, r + 1) && k === key(c + 1, r + 1)) add(k, { x0: xs[c][1], x1: xs[c + 1][0], y0: ys[r][1], y1: ys[r + 1][0] }); }
    for (const k of Object.keys(rooms)) rooms[k].bbox = bboxOf(rooms[k].rects);
    for (let r = 0; r < nR; r++) for (let c = 0; c < nC; c++) (rooms[key(c, r)].cells = rooms[key(c, r)].cells || []).push({ c, r, x0: xs[c][0], x1: xs[c][1], y0: ys[r][0], y1: ys[r][1] });
    // 서로 다른 방 사이의 벽 구간
    let segs = [];
    for (let r = 0; r < nR; r++) for (let c = 0; c < nC - 1; c++) { const a = key(c, r), b = key(c + 1, r); if (a !== b) segs.push({ a, b, orient: 'v', axis: xs[c][1] + t / 2, from: ys[r][0], to: ys[r][1] }); }
    for (let r = 0; r < nR - 1; r++) for (let c = 0; c < nC; c++) { const a = key(c, r), b = key(c, r + 1); if (a !== b) segs.push({ a, b, orient: 'h', axis: ys[r][1] + t / 2, from: xs[c][0], to: xs[c][1] }); }
    const merge = (list, sameKey) => {
      list.sort((p, q) => (sameKey(p) < sameKey(q) ? -1 : sameKey(p) > sameKey(q) ? 1 : p.from - q.from));
      const out = [];
      for (const s of list) { const l = out[out.length - 1]; if (l && sameKey(l) === sameKey(s) && s.from - l.to <= t + 0.5) l.to = Math.max(l.to, s.to); else out.push({ ...s }); }
      return out;
    };
    segs = merge(segs, (s) => `${s.orient}|${s.axis}|${s.a}|${s.b}`);
    // 코어 바깥과 접한 벽 구간
    let edges = [];
    for (let c = 0; c < nC; c++) { edges.push({ room: key(c, 0), side: 'S', orient: 'h', axis: t / 2, from: xs[c][0], to: xs[c][1] }); edges.push({ room: key(c, nR - 1), side: 'N', orient: 'h', axis: outer.h - t / 2, from: xs[c][0], to: xs[c][1] }); }
    for (let r = 0; r < nR; r++) { edges.push({ room: key(0, r), side: 'W', orient: 'v', axis: t / 2, from: ys[r][0], to: ys[r][1] }); edges.push({ room: key(nC - 1, r), side: 'E', orient: 'v', axis: outer.w - t / 2, from: ys[r][0], to: ys[r][1] }); }
    edges = merge(edges, (e) => `${e.side}|${e.room}`);
    return { t, outer, rooms, segs, edges };
  }

  // 승강기·EPS·PS를 입력 치수로 정확히 줄인다(칸 격자 때문에 같은 줄의 넓은 방을 따라 커진 만큼). 사용자 원칙: 샤프트·승강로 크기는 입력값으로 고정.
  // 남는 자리는 공용홀이 흡수하고(문 앞 홀이 넓어짐), 홀로 보낼 수 없으면 '창고(여유)'라는 이름 있는 방으로 둔다. 홀과 안 닿고 FIT_MIN보다 얇은 띠는 방을 만들지 않고 두꺼운 벽으로 남긴다.
  const FIT_MIN = 300;
  function fitSizes(grid, sp) {
    const t = grid.t, rooms = grid.rooms, J2 = sp.hatchW + 2 * JAMB, need = { EPS: [Math.max(sp.epsW, J2), Math.max(sp.epsD, J2)], PS: [sp.psW, sp.psD] }, OW = grid.outer.w, OH = grid.outer.h;
    grid.cutouts = grid.cutouts || [];
    EV_KEYS.forEach((k) => { need[k] = [sp.evW, sp.evD]; });
    const ov = (p0, p1, q0, q1) => Math.min(p1, q1) - Math.max(p0, q0) > 1;
    const touch = (a, b) => { // a 기준, b가 벽 하나(t) 건너 어느 쪽에 맞닿았는지
      if (Math.abs(b.x1 + t - a.x0) < 1 && ov(a.y0, a.y1, b.y0, b.y1)) return 'L';
      if (Math.abs(a.x1 + t - b.x0) < 1 && ov(a.y0, a.y1, b.y0, b.y1)) return 'R';
      if (Math.abs(b.y1 + t - a.y0) < 1 && ov(a.x0, a.x1, b.x0, b.x1)) return 'B';
      if (Math.abs(a.y1 + t - b.y0) < 1 && ov(a.x0, a.x1, b.x0, b.x1)) return 'T';
      return null;
    };
    const sidesTo = (box, keys) => { const s = new Set(); for (const k of keys) if (rooms[k]) for (const r of rooms[k].rects) { const d = touch(box, r); if (d) s.add(d); } return s; };
    let changed = false;
    for (const k of Object.keys(need)) {
      const room = rooms[k]; if (!room) continue;
      const b = bboxOf(room.rects), bw = b.x1 - b.x0, bh = b.y1 - b.y0, [w, d] = need[k];
      const shaft = KIND[k] === 'P', lo = k === 'PS' ? PS_MIN : epsMinOf(sp);
      let [rw, rh] = bw >= w - 1e-6 && bh >= d - 1e-6 ? [w, d] : [d, w];
      if (shaft) { rw = Math.min(rw, bw); rh = Math.min(rh, bh); if (rw < lo - 1e-6 || rh < lo - 1e-6) continue; } // 샤프트는 최소~입력값 안에서 칸을 채운다(벽선 맞춤)
      else if (bw < rw - 1e-6 || bh < rh - 1e-6) continue; // 작으면 손대지 않는다(검사가 알린다)
      const ex = bw - rw, ey = bh - rh; if (ex < 1 && ey < 1) continue;
      // 승강기는 남는 자리를 홀 쪽으로 보내 승강기 앞 홀이 넓어지게 한다. EPS(점검구)·PS는 홀 벽에 붙이고 남는 자리를 반대편에 둔다.
      // 남는 폭이 벽보다 얇으면 홀 쪽에 그대로 붙여 문을 지킨다.
      const door = KIND[k] === 'E', sh = sidesTo(b, ['H']); let sx = null, sy = null;
      if (sh.has('L') !== sh.has('R')) sx = (door && ex >= t + 50) === sh.has('L') ? 'R' : 'L';
      if (sh.has('B') !== sh.has('T')) sy = (door && ey >= t + 50) === sh.has('B') ? 'T' : 'B';
      for (const ks of [EV_KEYS.filter((q) => q !== k), ['EPS', 'PS'].filter((q) => q !== k), ['S']]) {
        const s = sidesTo(b, ks);
        if (sx == null && s.has('L') !== s.has('R')) sx = s.has('L') ? 'L' : 'R';
        if (sy == null && s.has('B') !== s.has('T')) sy = s.has('B') ? 'B' : 'T';
      }
      sx = sx || 'L'; sy = sy || 'B';
      const nb = { x0: sx === 'L' ? b.x0 : b.x1 - rw, x1: sx === 'L' ? b.x0 + rw : b.x1, y0: sy === 'B' ? b.y0 : b.y1 - rh, y1: sy === 'B' ? b.y0 + rh : b.y1 };
      room.rects = [nb]; changed = true;
      const rest = [];
      if (ex >= t + 50) rest.push(sx === 'L' ? { x0: nb.x1 + t, x1: b.x1, y0: b.y0, y1: b.y1 } : { x0: b.x0, x1: nb.x0 - t, y0: b.y0, y1: b.y1 });
      if (ey >= t + 50) rest.push(sy === 'B' ? { x0: nb.x0, x1: nb.x1, y0: nb.y1 + t, y1: b.y1 } : { x0: nb.x0, x1: nb.x1, y0: b.y0, y1: nb.y0 - t });
      const atX = sx === 'L' ? b.x1 >= OW - t - 1 : b.x0 <= t + 1, atY = sy === 'B' ? b.y1 >= OH - t - 1 : b.y0 <= t + 1; // 남는 쪽이 코어 바깥 벽에 닿았나
      const cut = (r, axis) => { // 바깥에 닿은 남는 자리는 코어 밖으로(방 쪽 벽 t는 남기고 바깥 벽까지 비운다)
        const c = { ...r };
        if (axis === 'x') { if (sx === 'L') { c.x0 = nb.x1 + t; c.x1 = OW; } else { c.x0 = 0; c.x1 = nb.x0 - t; } } else { if (sy === 'B') { c.y0 = nb.y1 + t; c.y1 = OH; } else { c.y0 = 0; c.y1 = nb.y0 - t; } }
        if (c.y0 <= t + 1) c.y0 = 0; if (c.y1 >= OH - t - 1) c.y1 = OH; if (c.x0 <= t + 1) c.x0 = 0; if (c.x1 >= OW - t - 1) c.x1 = OW;
        if (c.x1 - c.x0 > 1 && c.y1 - c.y0 > 1) grid.cutouts.push(c);
      };
      if (!door || ex < t + 50) { if (ex >= FIT_MIN && atX) { cut({ x0: 0, x1: 0, y0: b.y0, y1: b.y1 }, 'x'); rest.splice(0, rest.length, ...rest.filter((r) => !(r.y0 === b.y0 && r.y1 === b.y1))); } }
      if (!door || ey < t + 50) { if (ey >= FIT_MIN && atY) { cut({ x0: nb.x0, x1: nb.x1, y0: 0, y1: 0 }, 'y'); rest.splice(0, rest.length, ...rest.filter((r) => !(r.x0 === nb.x0 && r.x1 === nb.x1))); } }
      for (const r of rest) {
        const into = door && rooms.H && rooms.H.rects.some((h) => touch(r, h)) ? 'H' : null, hall = !!into;
        if (!hall && Math.min(r.x1 - r.x0, r.y1 - r.y0) < FIT_MIN) continue; // 홀로 못 보내는 얇은 띠는 방으로 두지 않는다(두꺼운 벽)
        if (hall) { // 맞닿은 홀 사각형마다 사이 벽을 터서 하나로 잇는다
          const gaps = rooms.H.rects.filter((h) => touch(r, h)).map((h) => { const d = touch(r, h), X = [Math.max(r.x0, h.x0), Math.min(r.x1, h.x1)], Y = [Math.max(r.y0, h.y0), Math.min(r.y1, h.y1)];
            return d === 'L' ? { x0: r.x0 - t, x1: r.x0, y0: Y[0], y1: Y[1] } : d === 'R' ? { x0: r.x1, x1: r.x1 + t, y0: Y[0], y1: Y[1] } : d === 'B' ? { x0: X[0], x1: X[1], y0: r.y0 - t, y1: r.y0 } : { x0: X[0], x1: X[1], y0: r.y1, y1: r.y1 + t }; });
          rooms.H.rects.push(r, ...gaps);
        } else (rooms.SR = rooms.SR || { key: 'SR', name: NAMES.SR, rects: [] }).rects.push(r); // 홀로 못 보내는 자리는 이름 있는 창고(여유)로
      }
    }
    if (!changed) return grid;
    // 코어 밖 자리 둘이 벽 하나 사이로 붙어 있으면 그 사이 벽도 코어 밖(벽만 홀로 남지 않게)
    const C = grid.cutouts, add = [];
    for (const a of C) for (const b of C) if (a !== b) {
      const ox = [Math.max(a.x0, b.x0), Math.min(a.x1, b.x1)], oy = [Math.max(a.y0, b.y0), Math.min(a.y1, b.y1)];
      if (b.y0 > a.y1 - 1 && b.y0 - a.y1 <= t + 1 && ox[1] - ox[0] > 1) add.push({ x0: ox[0], x1: ox[1], y0: a.y1, y1: b.y0 });
      if (b.x0 > a.x1 - 1 && b.x0 - a.x1 <= t + 1 && oy[1] - oy[0] > 1) add.push({ x0: a.x1, x1: b.x0, y0: oy[0], y1: oy[1] });
    }
    C.push(...add);
    for (const k of Object.keys(rooms)) rooms[k].bbox = bboxOf(rooms[k].rects);
    // 벽 구간·바깥 변을 방 사각형에서 다시 구한다(buildGrid와 같은 모양)
    const keys = Object.keys(rooms), merge = (list, key) => { list.sort((p, q) => (key(p) < key(q) ? -1 : key(p) > key(q) ? 1 : p.from - q.from)); const out = []; for (const s of list) { const l = out[out.length - 1]; if (l && key(l) === key(s) && s.from - l.to <= t + 0.5) l.to = Math.max(l.to, s.to); else out.push({ ...s }); } return out; };
    let segs = [];
    for (let i = 0; i < keys.length; i++) for (let j = 0; j < keys.length; j++) if (i !== j) for (const p of rooms[keys[i]].rects) for (const q of rooms[keys[j]].rects) {
      if (Math.abs(p.x1 + t - q.x0) < 1) { const f = Math.max(p.y0, q.y0), to = Math.min(p.y1, q.y1); if (to - f > 1) segs.push({ a: keys[i], b: keys[j], orient: 'v', axis: p.x1 + t / 2, from: f, to }); }
      if (Math.abs(p.y1 + t - q.y0) < 1) { const f = Math.max(p.x0, q.x0), to = Math.min(p.x1, q.x1); if (to - f > 1) segs.push({ a: keys[i], b: keys[j], orient: 'h', axis: p.y1 + t / 2, from: f, to }); }
    }
    grid.segs = merge(segs, (s) => `${s.orient}|${s.axis}|${s.a}|${s.b}`);
    let edges = [];
    for (const k of keys) for (const r of rooms[k].rects) {
      if (Math.abs(r.y0 - t) < 1) edges.push({ room: k, side: 'S', orient: 'h', axis: t / 2, from: r.x0, to: r.x1 });
      if (Math.abs(r.y1 - (grid.outer.h - t)) < 1) edges.push({ room: k, side: 'N', orient: 'h', axis: grid.outer.h - t / 2, from: r.x0, to: r.x1 });
      if (Math.abs(r.x0 - t) < 1) edges.push({ room: k, side: 'W', orient: 'v', axis: t / 2, from: r.y0, to: r.y1 });
      if (Math.abs(r.x1 - (grid.outer.w - t)) < 1) edges.push({ room: k, side: 'E', orient: 'v', axis: grid.outer.w - t / 2, from: r.y0, to: r.y1 });
    }
    grid.edges = merge(edges, (e) => `${e.side}|${e.room}`);
    return grid;
  }

  // 한 구역(앞 → 뒤 깊이 Z)을 열마다 방을 앞에서부터 쌓아 칸 줄로 나눈다. cols[c] = [[방, 필요 깊이], ...].
  // 열마다 마지막 방 뒤에 남는 깊이가 SHAFT_MIN + 벽 이상이면 잔여 공간(R)으로 따로 두고, 작으면 마지막 방이 흡수한다.
  // 열마다 칸 경계가 다르므로 모든 경계를 모아 공통 줄로 만들고, 벽 두께 + SNAP 안의 경계들은 가장 뒤 경계 하나로 합친다(앞 방이 조금 커짐).
  function stack(cols, Z0, t) {
    const st = cols.map((items) => ({ items, i: 0, start: 0, out: [] })), bs = [];
    for (;;) {
      const live = st.filter((s) => s.i < s.items.length - 1); // 마지막 방은 끝까지 가므로 경계를 만들지 않는다
      if (!live.length) break;
      const ends = live.map((s) => s.start + s.items[s.i][1]).sort((a, b) => a - b);
      let b = ends[0]; for (const e of ends) if (e < b + t + SNAP) b = e;
      for (const s of live) if (s.start + s.items[s.i][1] <= b + 1e-6) { s.out.push([s.items[s.i][0], b]); s.i++; s.start = b + t; }
      bs.push(b);
    }
    const Z = Math.max(Z0, ...st.map((s) => s.start + s.items[s.i][1]));
    for (const s of st) {
      const [k, d] = s.items[s.i]; let end = s.start + d;
      const after = bs.filter((b) => b >= end - 1e-6 && b - end < t + SNAP), before = bs.some((b) => b < end - 1e-6 && end - b < t + SNAP); // 가까운 경계에 맞추거나, 바로 앞 경계와 너무 가까우면 잔여 공간을 만들지 않는다
      if (after.length) end = Math.max(...after);
      else if (before) { const nx = bs.filter((b) => b > end); end = nx.length ? Math.min(...nx) : Z; } // 바로 앞 경계와 너무 가까우면 다음 경계까지 늘린다
      // 초기 계획 화면에서는 이름 없는 잔여실을 만들지 않는다. 정렬 때문에 남는 깊이는 해당 기능 구역이 흡수한다.
      s.out.push([k, Z]);
    }
    bs.sort((a, b) => a - b);
    const tops = [...bs, Z], rows = tops.map((y, i) => y - (i ? bs[i - 1] + t : 0));
    return { Z, rows, assign: (c, r) => st[c].out.find((x) => x[1] >= tops[r] - 1e-6)[0] };
  }

  // 문 하나를 벽에 놓아 본다. 희망 중심에서 시작해, 벽 구간(양옆 벽 JAMB 남김)과 허용 범위(range) 안으로 옮겨 맞춘다. 맞는 자리가 없으면 fits=false.
  function placeDoor(grid, d) {
    const w = d.width;
    const feasible = (s) => { const lo = Math.max(s.from + JAMB, d.range ? d.range[0] : -Infinity) + w / 2, hi = Math.min(s.to - JAMB, d.range ? d.range[1] : Infinity) - w / 2; return lo <= hi + 1e-6 ? [lo, Math.max(lo, hi)] : null; };
    let cands;
    if (d.b === 'OUT') { const order = [d.side, ...['S', 'E', 'W', 'N'].filter((x) => x !== d.side)]; cands = order.flatMap((sd) => grid.edges.filter((e) => e.room === d.a && e.side === sd).sort((p, q) => (q.to - q.from) - (p.to - p.from))); }
    else cands = grid.segs.filter((s) => (s.a === d.a && s.b === d.b) || (s.a === d.b && s.b === d.a)).filter((s) => !d.orient || s.orient === d.orient)
      .sort((p, q) => Math.max(p.from - d.center, 0, d.center - p.to) - Math.max(q.from - d.center, 0, d.center - q.to)); // 희망 중심에 가까운 벽부터
    for (const s of cands) {
      const f = feasible(s); if (!f) continue;
      const keep = (!s.side || s.side === d.side) && d.center >= s.from && d.center <= s.to, want = keep ? d.center : (s.from + s.to) / 2;
      return { ...d, center: Math.min(Math.max(want, f[0]), f[1]), fits: true, orient: s.orient, axis: s.axis, from: s.from, to: s.to, side: s.side || d.side };
    }
    const longest = cands.length ? Math.max(...cands.map((s) => s.to - s.from)) : 0;
    return { ...d, fits: false, orient: cands[0] ? cands[0].orient : null, axis: cands[0] ? cands[0].axis : null, reason: cands.length ? `문 ${Math.round(w)}mm가 들어갈 수 있는 벽이 없음(가장 긴 벽 ${Math.round(longest)}mm, 문 양옆 벽 ${JAMB}mm씩 필요${d.range ? ', 도착 구간 안에서만 가능' : ''})` : '두 방이 벽을 맞대고 있지 않음' };
  }

  const edgeMid = (grid, room, side) => { const e = grid.edges.filter((x) => x.room === room && x.side === side).sort((a, b) => (b.to - b.from) - (a.to - a.from))[0]; return e ? (e.from + e.to) / 2 : 0; }; // 코어 바깥에 면한 가장 긴 벽의 가운데
  // 계단 시작점. 세로(v): 아래쪽 끝이 층 도착 구간, 가로(h): 왼쪽 끝이 층 도착 구간. 계단은 계단실 폭 가운데에 둔다.
  const stairOrigin = (S, env, dir) => (dir === 'h' ? { x0: S.x0 + env.entryDepth, y0: S.y0 + (S.y1 - S.y0 - env.stairWid) / 2 } : { x0: S.x0 + (S.x1 - S.x0 - env.stairWid) / 2, y0: S.y0 + env.entryDepth });

  // 세로 계단실 열(A·D안). 옆 줄(승강기·샤프트)이 계단보다 훨씬 길면 계단실을 늘려 빈 바닥을 만들지 않고, 계단실 앞(입구 쪽)을 공용홀로 넓혀 계단실 문을 그 홀에 둔다.
  // 앞 홀 깊이가 SNAP보다 작으면 계단실이 남는 길이를 흡수한다.
  function stairColumn(env, depths, t) {
    let acc = -t; const ends = depths.map((d) => (acc += t + d));
    const Z = Math.max(env.Ls, acc), e = Z - env.Ls - t;
    // 앞 홀 끝이 옆 줄 경계와 가까우면(벽+SNAP 안) 칸 맞춤에서 경계가 합쳐져 승강기나 PS가 커진다. 경계와 정확히 같거나 충분히 떨어진 깊이 중 가장 깊은 것을 고르고, 차이는 계단실이 흡수한다.
    const ok = (c) => ends.every((b) => Math.abs(b - c) < 1e-6 || Math.abs(b - c) >= t + SNAP);
    const end = Math.max(-1, ...[e, ...ends, ...ends.map((b) => b - t - SNAP - 1)].filter((c) => c <= e + 1e-6 && ok(c)));
    // 앞 홀이 문 앞 여유보다 깊으면 계단실 문을 앞 홀 쪽에, 얕으면(입구 줄 홀 띠) 문은 옆 홀 쪽 벽에 둔다
    if (end >= SNAP) return { Z, items: [['H', end], ['S', env.Ls]], lobby: end >= DOOR_FRONT };
    let sEnd = env.Ls; for (const b of ends) if (b >= env.Ls - 1e-6) { sEnd = b; break; }
    if (sEnd - env.Ls >= SHAFT_MIN + t) sEnd = env.Ls;
    return { Z, items: [['S', sEnd]], lobby: false };
  }
  // 계단실 문: 앞 홀이 있으면 계단실 앞쪽 벽(도착 구간 쪽) 가운데, 없으면 옆 홀 쪽 벽의 도착 구간 안
  const stairDoor = (S, env, sp, lobby) => (lobby ? { id: 'S-H', a: 'S', b: 'H', orient: 'h', center: (S.x0 + S.x1) / 2, width: sp.stairDoorW, type: 'swing', swingInto: 'S' }
    : { id: 'S-H', a: 'S', b: 'H', orient: 'v', center: S.y0 + env.entryDepth / 2, range: [S.y0 + JAMB, S.y0 + env.entryDepth], width: sp.stairDoorW, type: 'swing', swingInto: 'S' });

  // ---- 세 가지 알트 (칸 격자). 모든 칸은 이름 있는 방이다. 배치로 없애지 못한 남는 자리는 잔여 공간(R)으로 따로 보이고 계획 검토에서 면적으로 감점한다.
  // A안: 계단실 | 공용홀 | 승강기 줄 — 홀을 사이에 두고 계단실과 승강기가 마주 봄. 샤프트 배치는 선택값(aShaft)이고 회전·반전처럼 새 안으로 세지 않는다.
  //  line: 승강기 줄 끝에 PS(마지막 승강기에 맞댐) → EPS를 세로로 이어 붙임. 샤프트 폭이 승강기 줄 폭을 따라간다.
  //  side: 승강기 줄 끝에 PS(마지막 승강기에 맞댐)와 EPS를 가로로 나란히. EPS는 홀 쪽이라 점검구로 접근하고, 크기는 요구 치수에 가깝다.
  // 옆 줄이 계단보다 짧으면 남는 길이를 샤프트가 흡수하지 않고 승강기 줄 앞(입구 쪽) 홀로 둔다. 계단이 짧으면 계단실 앞 홀로 둔다(stairColumn).
  const A_SHAFT = { line: '샤프트 세로 이어 붙임', side: '승강기 뒤 PS + 옆 EPS' };
  function altA(sp, env) {
    const t = sp.wall, Es = EV_KEYS.slice(0, sp.evCount), Hw = Math.max(sp.hallMinW + (sp.evCount - 1) * 300, sp.entryDoorW + 2 * JAMB, 1400), epsD = Math.max(sp.epsD, sp.hatchW + 2 * JAMB);
    const side = sp.aShaft === 'side', evRows = Es.map((k) => [k, sp.evD]);
    let widths, cols, depths;
    if (side) {
      const avail = sp.evW - t, eps0 = Math.max(sp.epsW, sp.hatchW + 2 * JAMB), psCol = clampR(avail - eps0, PS_MIN, sp.psW), epsCol = clampR(avail - psCol, epsMinOf(sp), eps0), dLast = Math.max(epsD, sp.psD); // 줄 폭을 승강기에 맞춤(범위 안)
      widths = [epsCol, Math.max(psCol, avail - epsCol)]; cols = [evRows.concat([['EPS', epsD]]), evRows.concat([['PS', sp.psD]])]; depths = evRows.map(([, d]) => d).concat([dLast]); // 샤프트가 상한까지 커도 승강기보다 좁으면 칸만 넓히고 PS는 상한(남는 자리는 코어 밖)
    } else {
      const right = evRows.concat([['PS', sp.psD], ['EPS', epsD]]);
      widths = [Math.max(sp.evW, sp.epsW, sp.psW)]; cols = [right]; depths = right.map(([, d]) => d);
    }
    const sc = stairColumn(env, depths, t), accR = depths.reduce((s, d) => s + t + d, -t), front = sc.Z - accR - t; // 옆 줄 앞 홀 깊이
    const lead = front >= LEAD_MIN ? [['H', front]] : []; // 아주 얕으면(벽 두께 이하) 끝 샤프트가 흡수
    const st = stack([sc.items, lead.concat(depths.map((d) => ['H', d])), ...cols.map((c) => lead.concat(c))], sc.Z, t);
    const grid = buildGrid(t, [env.Ws, Hw, ...widths], st.rows, st.assign);
    const R = grid.rooms, S = R.S.bbox, my = (b) => (b.y0 + b.y1) / 2;
    const doors = [
      { id: 'ENT', a: 'H', b: 'OUT', side: 'S', center: 2 * t + env.Ws + Hw / 2, width: sp.entryDoorW, type: 'open' }, // 출입구는 홀 줄 가운데(앞 홀이 옆으로 넓어져도 옮기지 않음)
      stairDoor(S, env, sp, sc.lobby),
      ...Es.map((k) => ({ id: `${k}-H`, a: k, b: 'H', orient: 'v', center: my(R[k].bbox), width: sp.evDoorW, type: 'slide', swingInto: 'H' })),
      { id: 'EPS-H', a: 'EPS', b: 'H', orient: 'v', center: my(R.EPS.bbox), width: sp.hatchW, type: 'hatch', swingInto: 'H' }];
    return { id: 'A', name: `A안 · 홀을 사이에 둔 대면형 — ${A_SHAFT[side ? 'side' : 'line']}`, shaftLayout: side ? 'side' : 'line', grid, doors, stairDir: 'v', stairShape: 'u',
      order: ['가로 3열로 쌓는다: 계단실 | 공용홀 | 승강기 줄', `승강기 ${sp.evCount}대를 세로로 쌓고 줄 끝에 ${side ? 'PS(마지막 승강기 뒤)와 EPS(옆)를 가로로' : 'PS 뒤에 EPS를 세로로'} 붙인다`, sc.lobby ? '계단실 문은 앞 홀 쪽 벽에 둔다' : '계단실 문은 옆 홀 쪽 벽의 도착 구간에 둔다', ...(lead.length ? ['옆 줄이 계단보다 짧아 남는 깊이는 샤프트를 키우지 않고 앞 홀로 둔다'] : [])] };
  }
  // B·C안 샤프트 줄(앞 EPS · 뒤 PS). 줄 길이가 옆 승강기에 맞춰 길어져도 PS를 키우지 않는다: 남는 깊이는 EPS 앞(홀 쪽) 홀 자리로 둔다.
  // 남는 깊이가 LEAD_MIN보다 얕으면 PS가 흡수(벽 두께 이하의 칸 맞춤 오차). PS·EPS 크기는 입력값이 기준이고 상한 검사(review 'shaft-size')로 확인한다.
  function shaftColumn(sp, epsD, Z, t) {
    const need = epsD + t + sp.psD, lead = Z - need - t;
    return lead >= LEAD_MIN ? [['H', lead], ['EPS', epsD], ['PS', sp.psD]] : [['EPS', epsD], ['PS', sp.psD]];
  }
  // B안: 가로 계단실 | 샤프트 줄(앞 EPS·뒤 PS) | 승강기들 — 같은 홀에 나란히 면하고, 계단과 승강기 사이에 샤프트.
  // B2(shaftEnd): 가로 계단실 | 승강기들 | 샤프트 줄 — 샤프트가 줄 끝에 있는 일렬형(광명 생활문화복합센터·지하 3층 사례에서 공통으로 읽은 배치). 앞 홀 하나를 한 줄이 같이 쓴다.
  function altB(sp, env, shaftEnd) {
    const t = sp.wall, Es = EV_KEYS.slice(0, sp.evCount), Hd = sp.hallMinW, Wsh = shaftColW(sp), epsD = Math.max(sp.epsD, sp.hatchW + 2 * JAMB);
    const Zb = Math.max(env.Ws, sp.evD, epsD + t + sp.psD), shaftCol = shaftColumn(sp, epsD, Zb, t), evCols = Es.map((k) => [[k, sp.evD]]);
    const mid = shaftEnd === 'mid', Sc = [['S', env.Ws]], evW = Es.map(() => sp.evW); // mid(B3): 승강기들 | 계단실 | 샤프트 — 계단이 줄 가운데
    const st = stack(mid ? [...evCols, Sc, shaftCol] : [Sc, ...(shaftEnd ? [...evCols, shaftCol] : [shaftCol, ...evCols])], 0, t);
    const grid = buildGrid(t, mid ? [...evW, env.Ls, Wsh] : [env.Ls, ...(shaftEnd ? [...evW, Wsh] : [Wsh, ...evW])], [Hd, ...st.rows], (c, r) => (r === 0 ? 'H' : st.assign(c, r - 1)));
    const R = grid.rooms, S = R.S.bbox, mx = (b) => (b.x0 + b.x1) / 2;
    const doors = [
      { id: 'ENT', a: 'H', b: 'OUT', side: 'S', center: edgeMid(grid, 'H', 'S'), width: sp.entryDoorW, type: 'open' },
      { id: 'S-H', a: 'S', b: 'H', orient: 'h', center: S.x0 + env.entryDepth / 2, range: [S.x0 + JAMB, S.x0 + env.entryDepth], width: sp.stairDoorW, type: 'swing', swingInto: 'S' },
      ...Es.map((k) => ({ id: `${k}-H`, a: k, b: 'H', orient: 'h', center: mx(R[k].bbox), width: sp.evDoorW, type: 'slide', swingInto: 'H' })),
      { id: 'EPS-H', a: 'EPS', b: 'H', orient: 'h', center: mx(R.EPS.bbox), width: sp.hatchW, type: 'hatch', swingInto: 'H' }];
    return { id: mid ? 'B3' : shaftEnd ? 'B2' : 'B', name: mid ? 'B3안 · 승강기 – 계단 – 샤프트 일렬형(계단이 가운데)' : shaftEnd ? 'B2안 · 계단 – 승강기 – 샤프트 일렬형' : 'B안 · 샤프트를 사이에 둔 나란형', grid, doors, stairDir: 'h', stairShape: 'u',
      order: [mid ? '가로 한 줄로 쌓는다: 승강기들 | 계단실 | 샤프트 줄(앞 EPS·뒤 PS)' : shaftEnd ? '가로 한 줄로 쌓는다: 계단실 | 승강기들 | 샤프트 줄(앞 EPS·뒤 PS)' : '가로 한 줄로 쌓는다: 계단실 | 샤프트 줄(앞 EPS·뒤 PS) | 승강기들', '앞 홀 하나를 계단·승강기·샤프트가 같이 쓴다', ...(shaftCol[0][0] === 'H' ? ['샤프트 줄이 승강기보다 짧아 남는 깊이는 EPS 앞 홀로 둔다(PS·EPS 크기 유지)'] : [])] };
  }
  // C안: 계단이 승강기 덩어리(승강기들 + 샤프트 줄: 앞 EPS·뒤 PS)를 ㄷ자로 감싼다. 계단 홀과 승강기 홀을 같이 쓴다(계단과 홀 사이에 문 없음).
  // 승강기 덩어리가 정방형에 가깝고 계단 길이가 그 둘레와 맞을 때 쓰는 특수형이다. 단 나누기 규칙:
  //  1) 두 모서리 계단참은 계단 폭 × 계단 폭 정사각형  2) 좌우 구간은 같은 단 수(대칭)  3) 위 구간은 두 계단참 사이를 채우는 만큼(좌우를 가장 짧게)
  //  4) 좌우 구간이 덩어리 깊이보다 길면 덩어리 뒤를 늘려 잔여 공간으로 두고, 짧으면 남는 길이는 구간 시작 앞 바닥(홀 높이)으로 둔다
  // 덩어리가 계단에 비해 크거나 길쭉하면 성립은 하지만 계획 검토에서 "C안 조건과 다름"으로 알린다.
  function altC(sp, env) {
    const t = sp.wall, W = sp.stairWidth, Es = EV_KEYS.slice(0, sp.evCount), Hd = Math.max(sp.hallMinW, sp.entryDoorW + 2 * JAMB), Wsh = shaftColW(sp), epsD = Math.max(sp.epsD, sp.hatchW + 2 * JAMB);
    const innerW = [...Es.map(() => sp.evW), Wsh], innerSpan = innerW.reduce((a, x) => a + x, 0) + (innerW.length - 1) * t, Ltop = innerSpan + 2 * t;
    const n = env.g.n, tr = sp.tread, capT = Math.floor(Ltop / tr + 1e-9) + 1;
    let s = Math.max(2, Math.ceil((n - capT) / 2)); if (n - 2 * s < 2) s = Math.floor((n - 2) / 2);
    const r2 = n - 2 * s, fit = s >= 2 && r2 >= 2 && (r2 - 1) * tr <= Ltop + 1e-6;
    const Z0c = Math.max((s - 1) * tr - t, 0), Zc = Math.max(Z0c, sp.evD, epsD + t + sp.psD), st = stack([...Es.map((k) => [[k, sp.evD]]), shaftColumn(sp, epsD, Zc, t)], Z0c, t);
    let g = null; try { g = Stair.calc({ floorHeight: sp.floorHeight, targetRiser: sp.targetRiser, tread: tr, width: W, risersPerFlight: [s, r2, s] }); } catch (e) { g = null; }
    const cols = [W, ...innerW, W], last = cols.length - 1, rows = [Hd, ...st.rows, W], topR = rows.length - 1;
    const grid = buildGrid(t, cols, rows, (c, r) => (r === 0 ? 'H' : r === topR || c === 0 || c === last ? 'S' : st.assign(c - 1, r - 1)));
    const R = grid.rooms, mx = (b) => (b.x0 + b.x1) / 2, X0 = t, X1 = grid.outer.w - t, Yb = R.S.cells.find((q) => q.r === 1).y0, Ytop = R.S.cells.find((q) => q.r === topR).y0;
    const run = (r) => (r - 1) * tr, yf = Ytop - run(s), slack = Ltop - run(r2), xa = X0 + W + slack / 2;
    const fl = [{ x0: X0, x1: X0 + W, y0: yf, y1: Ytop }, { x0: xa, x1: xa + run(r2), y0: Ytop, y1: Ytop + W }, { x0: X1 - W, x1: X1, y0: yf, y1: Ytop }];
    const landings = [{ x0: X0, x1: xa, y0: Ytop, y1: Ytop + W }, { x0: xa + run(r2), x1: X1, y0: Ytop, y1: Ytop + W }];
    const lines = [];
    for (let i = 1; i < s - 1; i++) lines.push([[X0, yf + i * tr], [X0 + W, yf + i * tr]], [[X1 - W, yf + i * tr], [X1, yf + i * tr]]);
    for (let i = 1; i < r2 - 1; i++) lines.push([[xa + i * tr, Ytop], [xa + i * tr, Ytop + W]]);
    const stairDraw = {
      rects: fl.map((q) => ({ kind: 'flight', ...q })).concat(landings.map((q) => ({ kind: 'landing', ...q }))), lines,
      path: [[X0 + W / 2, yf], [X0 + W / 2, Ytop + W / 2], [X1 - W / 2, Ytop + W / 2], [X1 - W / 2, yf]],
      labels: [[X0 + W / 2, (yf + Ytop) / 2, `${s}단`], [xa + run(r2) / 2, Ytop + W / 2, `${r2}단`], [X1 - W / 2, (yf + Ytop) / 2, `${s}단`], [X0 + W / 2, Math.max(Yb + 250, yf - 350), '오름 시작']]
    };
    const doors = [
      { id: 'ENT', a: 'H', b: 'OUT', side: 'S', center: edgeMid(grid, 'H', 'S'), width: sp.entryDoorW, type: 'open' },
      { id: 'S-H1', a: 'S', b: 'H', orient: 'h', center: X0 + W / 2, width: W - 2 * JAMB, type: 'open' }, // 계단 홀과 승강기 홀을 함께 씀(문 없음)
      { id: 'S-H2', a: 'S', b: 'H', orient: 'h', center: X1 - W / 2, width: W - 2 * JAMB, type: 'open' },
      ...Es.map((k) => ({ id: `${k}-H`, a: k, b: 'H', orient: 'h', center: mx(R[k].bbox), width: sp.evDoorW, type: 'slide', swingInto: 'H' })),
      { id: 'EPS-H', a: 'EPS', b: 'H', orient: 'h', center: mx(R.EPS.bbox), width: sp.hatchW, type: 'hatch', swingInto: 'H' }];
    const wrap = { front: yf - Yb, topExtra: slack, block: { w: innerSpan, h: st.Z } }; // 구간 시작 앞 바닥 길이, 위 계단참이 정사각형보다 긴 만큼, 감싸는 덩어리 크기
    return { id: 'C', name: 'C안 · 승강기를 감싸는 ㄷ자 계단형', grid, doors, stairShape: 'wrap', stairDraw, stairFit: fit && !!g && g.custom, stairG: g, stairInfo: { n, flights: [s, r2, s], riser: sp.floorHeight / n, wrap },
      order: ['승강기들과 샤프트 줄을 가운데 덩어리로 두고 ㄷ자 계단이 감싼다', '두 모서리 계단참은 계단 폭 × 계단 폭 정사각형', '좌우 구간은 같은 단 수(대칭), 위 구간은 두 계단참 사이를 채운다', '계단과 홀 사이에 문이 없다(승강기 홀과 같이 씀)'] };
  }

  // ---- 분석: 맞닿음·접근 순서·마주 봄. 방향(회전·반전)에 영향을 받지 않는 값만 쓴다.
  const REAL = Object.keys(NAMES).filter((k) => k !== 'R'), MUST_REACH = (k) => KIND[k] === 'S' || KIND[k] === 'E' || KIND[k] === 'H' || k === 'EPS'; // PS는 닫힌 샤프트라 들어갈 필요가 없다
  function adjacentPairs(rooms, t) {
    const out = new Set(), keys = REAL.filter((k) => rooms[k]);
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
      if (KIND[keys[i]] === KIND[keys[j]]) continue;
      for (const ra of rooms[keys[i]].rects) for (const rb of rooms[keys[j]].rects) {
        const gx = ra.x1 <= rb.x0 + 1e-6 ? rb.x0 - ra.x1 : rb.x1 <= ra.x0 + 1e-6 ? ra.x0 - rb.x1 : -1, oy = Math.min(ra.y1, rb.y1) - Math.max(ra.y0, rb.y0);
        const gy = ra.y1 <= rb.y0 + 1e-6 ? rb.y0 - ra.y1 : rb.y1 <= ra.y0 + 1e-6 ? ra.y0 - rb.y1 : -1, ox = Math.min(ra.x1, rb.x1) - Math.max(ra.x0, rb.x0);
        if ((gx >= 0 && Math.abs(gx - t) <= 1 && oy > 1) || (gy >= 0 && Math.abs(gy - t) <= 1 && ox > 1)) out.add([KIND[keys[i]], KIND[keys[j]]].sort().join('|'));
      }
    }
    return [...out].sort();
  }
  function roomsAdjacent(rooms, a, b, t) {
    if (!rooms[a] || !rooms[b]) return false;
    for (const ra of rooms[a].rects) for (const rb of rooms[b].rects) {
      const gx = ra.x1 <= rb.x0 + 1e-6 ? rb.x0 - ra.x1 : rb.x1 <= ra.x0 + 1e-6 ? ra.x0 - rb.x1 : -1, oy = Math.min(ra.y1, rb.y1) - Math.max(ra.y0, rb.y0);
      const gy = ra.y1 <= rb.y0 + 1e-6 ? rb.y0 - ra.y1 : rb.y1 <= ra.y0 + 1e-6 ? ra.y0 - rb.y1 : -1, ox = Math.min(ra.x1, rb.x1) - Math.max(ra.x0, rb.x0);
      if ((gx >= 0 && Math.abs(gx - t) <= 1 && oy > 1) || (gy >= 0 && Math.abs(gy - t) <= 1 && ox > 1)) return true;
    }
    return false;
  }
  // 방(들)이 공용홀에 면하는 방향: 홀이 그 방의 어느 쪽(E·W·N·S)에 있는지, 가장 길게 맞닿은 쪽
  function hallSide(alt, keys) {
    const H = alt.rooms.H, len = { E: 0, W: 0, N: 0, S: 0 }, t = alt.t;
    for (const k of keys) for (const ra of alt.rooms[k].rects) for (const rb of H.rects) {
      const oy = Math.min(ra.y1, rb.y1) - Math.max(ra.y0, rb.y0), ox = Math.min(ra.x1, rb.x1) - Math.max(ra.x0, rb.x0);
      if (oy > 1 && Math.abs(rb.x0 - ra.x1 - t) <= 1) len.E += oy; if (oy > 1 && Math.abs(ra.x0 - rb.x1 - t) <= 1) len.W += oy;
      if (ox > 1 && Math.abs(rb.y0 - ra.y1 - t) <= 1) len.N += ox; if (ox > 1 && Math.abs(ra.y0 - rb.y1 - t) <= 1) len.S += ox;
    }
    const best = Object.entries(len).sort((a, b) => b[1] - a[1])[0];
    return best[1] > 0 ? best[0] : null;
  }
  const centroid = (room) => { let a = 0, cx = 0, cy = 0; for (const r of room.rects) { const w = areaOf(r); a += w; cx += w * (r.x0 + r.x1) / 2; cy += w * (r.y0 + r.y1) / 2; } return [cx / a, cy / a]; };
  function analyze(alt) {
    const adjacency = adjacentPairs(alt.rooms, alt.t);
    const edges = alt.doors.filter((d) => d.fits).map((d) => [d.a, d.b]);
    const adj = {}; for (const [a, b] of edges) { (adj[a] = adj[a] || []).push(b); (adj[b] = adj[b] || []).push(a); }
    const depth = { OUT: 0 }, parent = {}, queue = ['OUT'];
    while (queue.length) { const u = queue.shift(); for (const v of adj[u] || []) if (!(v in depth)) { depth[v] = depth[u] + 1; parent[v] = u; queue.push(v); } }
    const pathTo = (k) => { const p = []; for (let c = k; c !== undefined; c = parent[c]) p.unshift(c); return p; };
    const Es = EV_KEYS.filter((k) => alt.rooms[k]);
    let rel = 'offset';
    if (adjacency.includes('E|S')) rel = 'adjacent';
    else if (alt.rooms.H && alt.rooms.S && Es.length) {
      // 승강기가 홀을 보는 방향은 승강기 문이 난 벽으로 정한다(앞 홀이 승강기 줄 앞으로 넓어져도 바뀌지 않게). 문이 없으면 가장 길게 맞닿은 쪽
      const doorSide = (k) => { const d = alt.doors.find((x) => x.fits && x.a === k && x.b === 'H'), b = alt.rooms[k].bbox; return d ? (d.orient === 'v' ? (d.axis > (b.x0 + b.x1) / 2 ? 'E' : 'W') : (d.axis > (b.y0 + b.y1) / 2 ? 'N' : 'S')) : null; };
      const eds = Es.map(doorSide).filter(Boolean), sS = hallSide(alt, ['S']), sE = eds.length ? eds.sort((a, b) => eds.filter((x) => x === b).length - eds.filter((x) => x === a).length)[0] : hallSide(alt, Es), opp = { E: 'W', W: 'E', N: 'S', S: 'N' };
      rel = !sS || !sE ? 'offset' : sS === sE ? 'parallel' : opp[sS] === sE ? 'facing' : 'offset';
    }
    const kd = (k) => (k === 'OUT' ? 'OUT' : KIND[k]);
    const doorPairs = [...new Set(edges.map(([a, b]) => [kd(a), kd(b)].sort().join('>')))].sort();
    const dE = Math.min(...Es.map((k) => (k in depth ? depth[k] : Infinity))), dd = (v) => (Number.isFinite(v) ? v : 'x');
    const depthText = `S${dd('S' in depth ? depth.S : Infinity)}E${dd(dE)}P${dd('EPS' in depth ? depth.EPS : Infinity)}`;
    // 샤프트(EPS·PS)가 어느 방과 벽을 맞대는지(방 이름 단위). 회전·반전으로는 바뀌지 않는다
    const nbr = (k) => (alt.rooms[k] ? REAL.filter((j) => j !== k && roomsAdjacent(alt.rooms, k, j, alt.t)).map((j) => (KIND[j] === 'P' ? j : KIND[j])).sort().join('+') : '-');
    const signature = `adj:${adjacency.join(',')}|ps:${nbr('PS')}|eps:${nbr('EPS')}|door:${doorPairs.join(',')}|depth:${depthText}|SE:${rel}`;
    return { evCount: Es.length, shafts: Object.keys(alt.rooms).filter((k) => KIND[k] === 'P').length, adjacency, doorPairs, depth, paths: { S: 'S' in depth ? pathTo('S') : null, E: Es[0] && Es[0] in depth ? pathTo(Es[0]) : null, P: 'EPS' in depth ? pathTo('EPS') : null }, relationSE: rel, signature, reachable: REAL.filter((k) => alt.rooms[k] && MUST_REACH(k) && !(k in depth)).length === 0 };
  }

  // 쉬운 말 요약(분석 결과에서 만든다)
  function describe(a, alt) {
    const nm = (k) => (k === 'OUT' ? '입구' : NAMES[k]);
    const lines = [], ev = a.evCount > 1 ? `승강기 ${a.evCount}대가` : '승강기가';
    if (alt && alt.stairShape === 'wrap') lines.push(`계단이 ${ev.replace('가', '를')} ㄷ자로 감싸고, 계단 홀과 승강기 홀을 함께 씁니다.`);
    else lines.push(a.relationSE === 'adjacent' ? `계단실과 ${ev} 벽을 맞대고 있습니다.` : a.relationSE === 'facing' ? `계단실과 ${ev} 공용홀을 사이에 두고 마주 봅니다.` : a.relationSE === 'parallel' ? `계단실과 ${ev} 같은 홀에 나란히 면하고, 그 사이에 샤프트가 있습니다.` : `계단실과 ${ev} 서로 비켜 있습니다.`);
    lines.push(`샤프트: EPS(점검구 있음)와 PS(닫힌 샤프트)${alt && alt.rooms.R ? '. 배치로 없애지 못한 잔여 공간(용도 미정)이 있습니다' : ''}.`);
    for (const k of ['S', 'E', 'P']) if (a.paths[k]) lines.push(`${k === 'P' ? 'EPS' : nm(a.paths[k][a.paths[k].length - 1])}: ${a.paths[k].map(nm).join(' → ')} (문 ${a.paths[k].length - 1}개)`);
    return lines;
  }

  // 쓰임 없는 홀 칸 찾기: 문(출입구 포함)이 열리는 홀 칸과, 출입구 칸에서 그 칸들까지 가는 최단 경로 위의 칸만 쓰인다. 나머지 홀 칸은 죽은 공간이다.
  function deadHall(alt) {
    const H = alt.rooms.H; if (!H || !H.cells) return [];
    const cells = H.cells, idx = (c) => cells.findIndex((x) => x.c === c.c && x.r === c.r), m = alt.t / 2 + 1;
    const at = (x, y) => cells.findIndex((q) => x > q.x0 - m && x < q.x1 + m && y > q.y0 - m && y < q.y1 + m);
    const anchors = new Set(); let start = -1;
    for (const d of alt.doors) {
      if (!d.fits) continue;
      for (const sg of [-1, 1]) {
        const e = alt.t / 2 + 20, q = d.orient === 'v' ? [d.axis + sg * e, d.center] : [d.center, d.axis + sg * e];
        if (!H.rects.some((r) => q[0] > r.x0 && q[0] < r.x1 && q[1] > r.y0 && q[1] < r.y1)) continue;
        const i = at(q[0], q[1]); if (i >= 0) { anchors.add(i); if (d.b === 'OUT') start = i; }
      }
    }
    if (start < 0) return [];
    for (let i = 0; i < cells.length; i++) if (cells[i].r === cells[start].r) anchors.add(i); // 출입구가 열리는 줄의 홀 칸은 입구 홀로 쓰인다(계단실·승강기 줄 앞 홀)
    const prev = new Map([[start, -1]]), queue = [start];
    while (queue.length) { const u = queue.shift(); for (const v of cells.map((c, i) => i).filter((i) => Math.abs(cells[i].c - cells[u].c) + Math.abs(cells[i].r - cells[u].r) === 1)) if (!prev.has(v)) { prev.set(v, u); queue.push(v); } }
    const used = new Set(); for (const a of anchors) for (let u = a; u !== -1 && u !== undefined && !used.has(u); u = prev.get(u)) used.add(u);
    return cells.filter((c, i) => !used.has(i)).map((c) => ({ c: c.c, r: c.r, area: areaOf(c) }));
  }

  // 여닫이 문(계단실 문·EPS 점검구)이 열릴 때 쓰는 자리: 벽 면에서 문 폭만큼, 문이 열리는 방 쪽으로
  function swingRect(alt, d) {
    if (!d.fits || (d.type !== 'swing' && d.type !== 'hatch') || !alt.rooms[d.swingInto]) return null;
    const into = centroid(alt.rooms[d.swingInto]), v = d.orient === 'v', sg = (v ? into[0] : into[1]) < d.axis ? -1 : 1;
    const a0 = d.axis + sg * alt.t / 2, a1 = a0 + sg * d.width, p = Math.min(a0, a1), q = Math.max(a0, a1), lo = d.center - d.width / 2, hi = d.center + d.width / 2;
    return v ? { x0: p, x1: q, y0: lo, y1: hi } : { x0: lo, x1: hi, y0: p, y1: q };
  }
  // 계단 이용 영역(구간·계단참)의 평면 사각형. U형은 01_stair 배치를 계단실 안으로 옮긴 것, ㄷ자는 그린 사각형 그대로
  function stairZones(alt, env) {
    if (alt.stairDraw) return alt.stairDraw.rects.map((q) => ({ x0: q.x0, x1: q.x1, y0: q.y0, y1: q.y1 }));
    if (!alt.stairAt || !env.lay) return [];
    const so = alt.stairAt, x0 = env.lay.bounds.x0, horiz = alt.stairDir === 'h', map = (p) => (horiz ? [so.x0 + (p[0] - x0), so.y0 + p[1]] : [so.x0 + p[1], so.y0 + (p[0] - x0)]);
    return env.lay.rects.map((rc) => { const pts = rc.pts.map(map), xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; });
  }

  // ---- 검증: 겹침, 외곽 이탈, 출입 불가능, 크기, 문, 문 앞 홀 깊이, 이름 없는 방, 쓰임 없는 홀. 대상 이름과 함께 돌려준다.
  function validate(alt, sp, env) {
    const issues = [], push = (target, kind, message) => issues.push({ target, kind, message });
    const keys = Object.keys(alt.rooms), nm = (k) => NAMES[k] || '이름 없는 방';
    for (const k of keys) if (!NAMES[k]) push('이름 없는 방', 'fill', '이름 없는 방(채움)이 있습니다. 남는 자리는 배치로 없애거나 이름 있는 부속실로 써야 합니다.');
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
      const hit = alt.rooms[keys[i]].rects.some((ra) => alt.rooms[keys[j]].rects.some((rb) => overlapArea(ra, rb) > 0));
      if (hit) push(`${nm(keys[i])}·${nm(keys[j])}`, 'overlap', `${wagwa(nm(keys[i]))} ${iga(nm(keys[j]))} 겹칩니다.`);
    }
    for (const k of keys) if (alt.rooms[k].rects.some((r) => r.x0 < -1e-6 || r.y0 < -1e-6 || r.x1 > alt.outer.w + 1e-6 || r.y1 > alt.outer.h + 1e-6)) push(nm(k), 'outside', `${iga(nm(k))} 코어 외곽 밖으로 나갑니다.`);
    const must = (k, w, d, label) => {
      const room = alt.rooms[k]; if (!room) { push(label, 'missing', `${iga(label)} 평면에 없습니다.`); return; }
      const b = room.bbox, rectangular = Math.abs(room.rects.reduce((s, r) => s + areaOf(r), 0) - areaOf(b)) < 1;
      if (!rectangular) push(label, 'shape', `${iga(label)} 직사각형이 아닙니다.`);
      const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
      if (!((bw >= w - 1e-6 && bh >= d - 1e-6) || (bw >= d - 1e-6 && bh >= w - 1e-6))) push(label, 'size', `${label} 내부가 ${Math.round(bw)}×${Math.round(bh)}mm라 필요한 ${w}×${d}mm보다 작습니다.`);
    };
    for (const k of EV_KEYS) if (alt.rooms[k]) must(k, sp.evW, sp.evD, NAMES[k]);
    must('EPS', epsMinOf(sp), Math.min(epsMinOf(sp), Math.max(sp.epsD, sp.hatchW + 2 * JAMB)), 'EPS'); must('PS', PS_MIN, PS_MIN, 'PS'); // 샤프트는 최소~입력값 범위(벽선 맞춤으로 줄일 수 있음). 최소보다 작을 때만 막는다
    if (alt.stairShape === 'wrap') { if (!alt.stairFit) push('계단실', 'stair', '계단 단이 ㄷ자 계단실의 세 구간에 다 들어가지 않습니다.'); }
    else must('S', env.stairWid, env.entryDepth + env.stairLen, '계단실');
    const dead = deadHall(alt), deadArea = dead.reduce((a, c) => a + c.area, 0);
    if (dead.length) push('공용홀', 'dead', `공용홀에 문도 통로도 아닌 자리(약 ${r1(deadArea / 1e6)}㎡)가 있습니다.`);
    const hall = alt.rooms.H ? [...mergeRects(alt.rooms.H.rects, 'h'), ...mergeRects(alt.rooms.H.rects, 'v')] : [];
    if (alt.rooms.H && !hall.some((r) => Math.min(r.x1 - r.x0, r.y1 - r.y0) >= sp.hallMinW - 1e-6)) push('공용홀', 'size', `공용홀에 폭 ${sp.hallMinW}mm 이상인 곳이 없습니다.`);
    const label = (d) => (d.b === 'OUT' ? '코어 출입구' : `${nm(d.a)}–${nm(d.b)} 문`);
    for (const d of alt.doors) if (!d.fits) push(label(d), 'door', `${iga(label(d))} 들어가지 않습니다: ${d.reason}.`);
    // 문 앞 홀 깊이: 문이 열리는 쪽 공용홀에 폭 × DOOR_FRONT 만큼 빈 자리가 있어야 한다
    const inRoom = (k, x, y) => !!alt.rooms[k] && alt.rooms[k].rects.some((r) => x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1);
    for (const d of alt.doors) {
      if (!d.fits || !alt.rooms.H) continue;
      const v = d.orient === 'v', w = d.width, probe = (sg) => (v ? [d.axis + sg * (alt.t / 2 + 20), d.center] : [d.center, d.axis + sg * (alt.t / 2 + 20)]);
      let sg = 0; for (const s of [-1, 1]) { const q = probe(s); if (inRoom('H', q[0], q[1])) sg = s; }
      if (!sg) continue;
      const a0 = d.axis + sg * alt.t / 2, a1 = a0 + sg * DOOR_FRONT, lo = Math.min(a0, a1), hi = Math.max(a0, a1);
      const front = v ? { x0: lo, x1: hi, y0: d.center - w / 2, y1: d.center + w / 2 } : { x0: d.center - w / 2, x1: d.center + w / 2, y0: lo, y1: hi };
      if (alt.rooms.H.rects.reduce((s, r) => s + overlapArea(r, front), 0) < (front.x1 - front.x0) * (front.y1 - front.y0) - 1) push(label(d), 'front', `${label(d)} 앞 공용홀이 ${DOOR_FRONT}mm보다 얕아 문 앞 여유가 부족합니다.`);
    }
    // 문 열림 충돌: 문짝끼리, 문짝과 계단 이용 영역(첫 단·구간·계단참)
    const sw = alt.doors.map((d) => [d, swingRect(alt, d)]).filter(([, q]) => q), zones = stairZones(alt, env);
    for (let i = 0; i < sw.length; i++) for (let j = i + 1; j < sw.length; j++) if (overlapArea(sw[i][1], sw[j][1]) > 1e3) push(`${label(sw[i][0])}·${label(sw[j][0])}`, 'swing', `${wagwa(label(sw[i][0]))} ${iga(label(sw[j][0]))} 열릴 때 서로 부딪힙니다.`);
    for (const [d, q] of sw) if (zones.some((z) => overlapArea(q, z) > 1e3)) push(label(d), 'swing', `${iga(label(d))} 열릴 때 계단(첫 단 쪽 이용 영역)에 닿습니다 — 문 폭 ${Math.round(d.width)}mm가 계단 앞 도착 구간보다 깁니다.`);
    const an = analyze(alt);
    for (const k of REAL) if (alt.rooms[k] && MUST_REACH(k) && !(k in an.depth)) push(nm(k), 'unreachable', `${nm(k)}에 들어갈 수 없습니다(입구에서 이어지는 문이 없음).`);
    return issues;
  }

  // 방 안에서 요구 치수만큼의 자리. 문이 있으면 문 쪽 벽에 붙여 문 가운데에 맞추고, 없으면(PS) 홀에서 먼 구석에 둔다. 방의 나머지는 "배정이 요구보다 큰 부분".
  function reqRect(alt, k, w, d) {
    const b = alt.rooms[k].bbox, bw = b.x1 - b.x0, bh = b.y1 - b.y0, [rw, rh] = bw >= w - 1e-6 && bh >= d - 1e-6 ? [w, d] : [d, w];
    if (rw > bw + 1e-6 || rh > bh + 1e-6) return null;
    const door = alt.doors.find((x) => x.fits && (x.a === k || x.b === k)), clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    let x0, y0;
    if (door && door.orient === 'v') { x0 = Math.abs(door.axis - b.x0) < Math.abs(door.axis - b.x1) ? b.x0 : b.x1 - rw; y0 = clamp(door.center - rh / 2, b.y0, b.y1 - rh); }
    else if (door) { y0 = Math.abs(door.axis - b.y0) < Math.abs(door.axis - b.y1) ? b.y0 : b.y1 - rh; x0 = clamp(door.center - rw / 2, b.x0, b.x1 - rw); }
    else { const h = alt.rooms.H ? centroid(alt.rooms.H) : [b.x0, b.y0]; x0 = h[0] < (b.x0 + b.x1) / 2 ? b.x1 - rw : b.x0; y0 = h[1] < (b.y0 + b.y1) / 2 ? b.y1 - rh : b.y0; }
    return { x0, y0, x1: x0 + rw, y1: y0 + rh };
  }

  // ---- 판정 네 갈래: 기하(validate) · 건축계획 · 법규 · 설비. "확정"이라는 말은 쓰지 않고, 어디까지 확인했는지를 보인다.
  // 상태: PASS 통과 / CHECK 검토 필요 / FAIL 불가 / NOT_CHECKED 미검토(근거·입력이 없어 판정하지 않음)
  const WORD = { PASS: '통과', CHECK: '검토 필요', FAIL: '불가', NOT_CHECKED: '미검토', 'N/A': '기준 없음' }; // N/A: 고른 기준에 그 항목 한도가 없음(통과로 셈)
  const axis = (arr) => (arr.some((c) => c.status === 'FAIL') ? 'FAIL' : arr.length && arr.every((c) => c.status === 'NOT_CHECKED') ? 'NOT_CHECKED' : arr.some((c) => c.status !== 'PASS' && c.status !== 'N/A') ? 'CHECK' : 'PASS');
  function review(alt, sp, env) {
    const P = [], L = [], E = [], it = (arr, id, label, status, note) => arr.push({ id, label, status, note });
    const m2 = (a) => `${r1(a / 1e6)}㎡`, dim = (b) => `${Math.round(b.x1 - b.x0)}×${Math.round(b.y1 - b.y0)}`;
    // 초기 계획 단계에서는 요구/초과 면적을 도면에 겹쳐 표시하지 않는다. 필요한 최소 치수는 기하 검사에서만 확인한다.
    const need = [...EV_KEYS.filter((k) => alt.rooms[k]).map((k) => [k, sp.evW, sp.evD]), ['EPS', sp.epsW, sp.epsD], ['PS', sp.psW, sp.psD]];
    alt.req = {};
    for (const [k, w, d] of need) if (alt.rooms[k]) alt.req[k] = reqRect(alt, k, w, d);
    const evs = EV_KEYS.filter((k) => alt.rooms[k]), psNext = evs.some((k) => roomsAdjacent(alt.rooms, k, 'PS', alt.t));
    it(P, 'ev-ps', 'EV–PS 맞닿음(선호 배치)', psNext ? 'PASS' : 'CHECK', psNext ? 'PS가 승강기와 벽을 맞댐 — 사용자 선호 배치 관계만 확인. 법적 의무가 아니고, 배관 종류·관경·점검 방식이 없어 설비 적합은 미검토' : 'PS가 승강기와 직접 맞닿지 않음 — 반대 사례 비교용 후보');
    const epsDoor = alt.doors.find((d) => d.id === 'EPS-H');
    it(P, 'eps-access', 'EPS 점검 접근', epsDoor && epsDoor.fits ? 'PASS' : 'FAIL', epsDoor && epsDoor.fits ? `공용홀에서 폭 ${sp.hatchW}mm 점검구로 접근 가능(작업 공간 적정성은 설비 미검토)` : '공용홀에서 EPS 점검구에 접근할 수 없음');
    if (alt.shaftLayout === 'side') { const E = alt.rooms.EPS.bbox, Q = alt.rooms.PS.bbox, extra = Math.max(E.x1, Q.x1) - Math.min(E.x0, Q.x0) - sp.evW; it(P, 'ev-width', '승강기 줄 폭', extra > 300 ? 'CHECK' : 'PASS', extra > 300 ? `EPS·PS를 나란히 둔 줄이 승강기보다 ${Math.round(extra)}mm 넓어 승강기 앞 홀이 그만큼 넓어짐(코어 폭 증가, 승강로는 입력 치수 그대로) — 이 승강기 규격에는 "샤프트 세로 이어 붙임"이 더 작음` : '샤프트 줄 폭이 승강기 폭 안에 들어감'); }
    // 샤프트 크기: 입력값이 상한, 벽선을 맞추려고 범위 안에서 줄였으면 얼마로 줄였는지 알린다(통과). 상한보다 커지면 검토 필요
    const shaftNote = [['EPS', Math.max(sp.epsW, sp.hatchW + 2 * JAMB), Math.max(sp.epsD, sp.hatchW + 2 * JAMB)], ['PS', sp.psW, sp.psD]].map(([k, w, d]) => { const b = alt.rooms[k].bbox, bw = Math.round(b.x1 - b.x0), bh = Math.round(b.y1 - b.y0), fit = (bw <= w + 1 && bh <= d + 1) || (bw <= d + 1 && bh <= w + 1); return { k, bw, bh, w, d, fit, same: fit && bw * bh >= w * d - 1 }; });
    const over = shaftNote.filter((x) => !x.fit), cut = shaftNote.filter((x) => x.fit && !x.same);
    it(P, 'shaft-size', 'EPS·PS 크기', over.length ? 'CHECK' : 'PASS', over.length ? over.map((x) => `${x.k} ${x.bw}×${x.bh}(입력 ${x.w}×${x.d})`).join(' · ') + ' — 입력보다 커짐' : cut.length ? cut.map((x) => `${x.k} ${x.bw}×${x.bh}(입력 ${x.w}×${x.d})`).join(' · ') + ' — 벽선을 맞추려고 줄임' : '입력 크기 그대로');
    const lobbyNeed = Math.max(1400, sp.hallMinW + (sp.evCount - 1) * 300), hallShort = Math.min(alt.rooms.H.bbox.x1 - alt.rooms.H.bbox.x0, alt.rooms.H.bbox.y1 - alt.rooms.H.bbox.y0);
    it(P, 'ev-lobby', '승강기 앞 대기폭', hallShort >= lobbyNeed ? 'PASS' : 'CHECK', `${Math.round(hallShort)}mm / 계획 출발값 ${lobbyNeed}mm${sp.evCount > 1 ? ` (승강기 ${sp.evCount}대라 대기 겹침을 줄이도록 넓힘)` : ''}. 일반 승강기 대수별 법정 폭은 확인되지 않았고, 장애인용 승강기는 전면 1.4×1.4m 활동공간을 별도 확인`);
    if (alt.stairShape === 'u') {
      const b = alt.rooms.S.bbox, over = Math.max(b.x1 - b.x0, b.y1 - b.y0) - env.Ls;
      it(P, 'stair-room', '계단실 길이', over > 300 ? 'CHECK' : 'PASS', over > 300 ? `계단실이 계단 + 도착 구간보다 ${Math.round(over)}mm 길다(옆 줄 칸에 맞춤)` : '계단 + 도착 구간에 맞음');
    } else {
      const w = alt.stairInfo.wrap, f = alt.stairInfo.flights, W = sp.stairWidth, ar = Math.max(w.block.w, w.block.h) / Math.min(w.block.w, w.block.h);
      it(P, 'c-sym', '좌우 대칭', f[0] === f[2] ? 'PASS' : 'CHECK', `좌우 ${f[0]}단·${f[2]}단, 위 ${f[1]}단`);
      it(P, 'c-top', '계단참 모양', w.topExtra > sp.tread ? 'CHECK' : 'PASS', w.topExtra > sp.tread ? `위 구간이 두 계단참 사이를 다 채우지 못해 계단참이 정사각형보다 ${Math.round(w.topExtra / 2)}mm씩 김 — 승강기 덩어리가 이 계단에 비해 넓음` : `두 모서리 계단참 ${W}×${W} 정사각형`);
      it(P, 'c-front', '구간 시작 앞 바닥', w.front > W ? 'CHECK' : 'PASS', `좌우 구간 시작 앞 바닥 ${Math.round(w.front)}mm${w.front > W ? ' — 승강기 덩어리가 이 계단에 비해 깊음(계단 폭보다 김)' : ''}`);
      it(P, 'c-shape', '감싸는 덩어리 비례', ar > 1.5 ? 'CHECK' : 'PASS', `승강기 덩어리 ${Math.round(w.block.w)}×${Math.round(w.block.h)}(긴 변/짧은 변 ${ar.toFixed(2)})${ar > 1.5 ? ' — C안은 덩어리가 정방형에 가깝고 계단 길이가 둘레와 맞을 때 쓰는 형식' : ''}`);
    }
    // 법규: 계단 치수는 01_stair의 기준표·판정을 그대로 쓴다(근거 원문: 06_core_layout/03_law, 국가법령정보 Open API)
    const g = alt.stairG, prof = Stair.PROFILES[sp.stairUse];
    if (!g) it(L, 'stair', '계단 계산', 'FAIL', '이 단 나누기로는 계단을 계산할 수 없음');
    else for (const c of Stair.checks(g, { tread: sp.tread, width: sp.stairWidth, floorHeight: sp.floorHeight, railOn: false, railH: 850 }, prof)) {
      if (c.id === '2rt') it(P, '2rt', '2R+T 보행감', c.status, `${c.value} (권장 600~650, 법정 기준 아님)`);
      else if (['riser', 'tread', 'width', 'landing-gap', 'landing-w', 'headroom'].includes(c.id)) it(L, c.id, c.label, c.status, `${typeof c.value === 'number' ? Math.round(c.value * 10) / 10 : c.value} / 기준 ${c.limit} · ${c.cite || ''}${c.note ? ' · ' + c.note : ''}`);
    }
    const kind = sp.stairKind, cite9 = '피난방화규칙 제9조제2항제1호';
    if (kind === 'special') {
      it(L, 'special-vestibule', '특별피난계단 부속실', 'FAIL', `현재 안에는 노대 또는 배연설비가 있는 3㎡ 이상 부속실이 없어 특별피난계단으로 쓸 수 없음 · 피난방화규칙 제9조제2항제3호가목`);
      it(L, 'special-door', '부속실·계단실 출입구', 'FAIL', `부속실 양쪽의 60분(+) 방화문과 피난 방향 열림이 평면에 없음 · 피난방화규칙 제9조제2항제3호자목`);
    } else if (kind === 'evac') {
      if (alt.stairShape === 'wrap' && !alt.doors.some((d) => d.a === 'S' && d.type === 'swing')) it(L, 'evac-door', '피난계단 출입구', 'FAIL', `계단과 홀 사이에 문이 없음. 피난계단 출입구에는 60분(+) 방화문이 있어야 해 이 형식 그대로는 쓸 수 없음 · ${cite9}바목`);
      else it(L, 'evac-door', '피난계단 출입구', sp.stairDoorW >= 900 ? 'CHECK' : 'FAIL', `계단실 문 폭 ${sp.stairDoorW}(유효너비로 간주) / 기준 ≥ 900${sp.stairDoorW >= 900 ? ' 충족' : ' 미달'} · 60분(+) 방화문·피난 방향 열림은 도면 표기로 확인 · ${cite9}바목`);
      it(L, 'evac-wall', '계단실 구획', 'CHECK', `벽 ${alt.t}mm로 그림. 내화구조 벽으로 구획해야 하며 재료·구조는 평면이 판정하지 않음 · ${cite9}가목`);
    } else if (kind === 'open') {
      it(L, 'open-stair', '계단실 트임', 'CHECK', `계단실이 문 없이 홀로 트임. 일반 직통계단이고 피난계단·특별피난계단 대상이 아닐 때만 가능 — 층수·용도 확인 필요(건축법 시행령 제35조) · 피난계단이면 출입구 60분(+) 방화문 필요(${cite9}바목)`);
    } else if (kind === 'unknown') {
      it(L, 'evac-door', '피난계단 출입구', 'CHECK', alt.stairShape === 'wrap' && !alt.doors.some((d) => d.a === 'S' && d.type === 'swing') ? `계단과 홀 사이에 문이 없음. 이 계단이 피난계단·특별피난계단이면 이 형식 그대로는 쓸 수 없음(출입구 60분(+) 방화문) · ${cite9}바목` : `피난계단이면 출입구 유효너비 0.9m 이상(지금 문 폭 ${sp.stairDoorW})·60분(+) 방화문 · ${cite9}바목`);
      it(L, 'evac-need', '피난계단 해당 여부', 'NOT_CHECKED', '층수·용도·바닥면적 입력이 없어 판정하지 않음(건축법 시행령 제35조). "계단 종류"를 고르면 그 기준으로 검사. 특별피난계단(부속실)은 이번 범위 밖');
    }
    it(L, 'ev-law', '승강기 대수·비상용 승강기', 'NOT_CHECKED', '연면적·층수·높이 입력이 없어 판정하지 않음(건축법 제64조, 건축물의 설비기준 등에 관한 규칙)');
    // 설비: 법정 최소 치수가 없고 근거가 2차 자료뿐이라 판정하지 않고 참고만 보인다(06_core_layout/04_research/EPS_PS_치수조사.md)
    it(E, 'eps', 'EPS 크기', 'NOT_CHECKED', `요구 ${sp.epsW}×${sp.epsD}(임시 가정). 확인한 법령에 일률적인 숫자 최소는 없지만 "수선·유지관리에 지장 없게"는 법적 기준(건축법 시행령 제87조①) — 들어갈 기기(분전함·통신함)와 작업 공간을 정해야 판정 가능. 통신까지 넣으면 부족할 수 있음 [사례]`);
    it(E, 'hatch', 'EPS 점검구', 'NOT_CHECKED', `폭 ${sp.hatchW}(임시 가정). 샤프트 점검구 지침값(밖에서 관리 600×600 이상, 사람이 들어가 관리 600×1600 이상)은 기계설비 기준이라 EPS 문에 그대로 쓸 근거는 없음 [지침: 국토교통부 건설기준]`);
    it(E, 'ps', 'PS 점검', 'NOT_CHECKED', `요구 ${sp.psW}×${sp.psD}(임시 가정), 점검구 없이 닫힘으로 그림. 배관 종류·관경·밸브를 알아야 크기를 판정 가능. 점검이 필요하면 밖에서 관리 600×600, 사람이 들어가면 600×1600 이상 [지침]`);
    it(E, 'vert', '위아래 층 연속', 'NOT_CHECKED', '샤프트 위치가 위아래 층에서 이어지는지는 한 층 평면으로 판정하지 않음');
    const out = { geom: alt.issues.length ? 'FAIL' : 'PASS', plan: axis(P), law: axis(L), equip: axis(E), planItems: P, lawItems: L, equipItems: E, stairUse: prof ? prof.name : '' };
    out.text = `${out.geom === 'PASS' ? '기하 성립' : '기하 불성립'} · 계획 ${WORD[out.plan]} · 법규 ${WORD[out.law]} · 설비 ${WORD[out.equip]}`;
    return out;
  }

  // 안마다 "어떤 순서로 놓았나 / 왜 후보에서 뺐나 / 어떤 규칙을 어겼나"를 한 곳에 모은다. 새 판정을 하지 않고 이미 나온 결과를 모아 보인다.
  function rulesOf(alt, def, sp) {
    const order = [...(def.order || []), `칸 경계가 벽 두께 + ${SNAP}mm 안에 있으면 하나로 합친다(앞 방이 조금 커짐)`, 'PS·EPS 크기는 입력값으로 고정한다(남는 자리는 홀·잔여 공간으로 둔다)'];
    const excluded = alt.candidate ? [] : alt.id === 'C' && alt.excludeReason ? alt.excludeReason.split(', ') : alt.issues.map((x) => x.message);
    const violated = alt.issues.map((x) => x.message).concat([...alt.review.planItems, ...alt.review.lawItems, ...alt.review.equipItems].filter((x) => x.status === 'FAIL').map((x) => `${x.label}: ${x.note}`));
    return { order, excluded, violated };
  }
  function finish(def, sp, env) {
    const g = def.grid, alt = { id: def.id, name: def.name, t: g.t, outer: g.outer, rooms: g.rooms, segs: g.segs, edges: g.edges, doors: def.doors.map((d) => placeDoor(g, d)) };
    alt.cutouts = g.cutouts || []; // 코어 밖으로 뺀 자리(외곽이 꺾이는 곳). 최대 범위(outer) 안이지만 코어가 아니다
    alt.stairShape = def.stairShape || 'u'; alt.stairDir = def.stairDir || 'v'; if (def.shaftLayout) alt.shaftLayout = def.shaftLayout;
    if (alt.stairShape === 'wrap') { alt.stairDraw = def.stairDraw; alt.stairFit = def.stairFit; alt.stairInfo = def.stairInfo; alt.stairG = def.stairG; }
    else { alt.stairAt = stairOrigin(alt.rooms.S.bbox, env, alt.stairDir); alt.stairInfo = { n: env.g.n, flights: env.g.flights.map((f) => f.risers), riser: env.g.riser }; alt.stairG = env.g; }
    alt.analysis = analyze(alt); alt.summary = describe(alt.analysis, alt);
    alt.issues = validate(alt, sp, env); alt.status = alt.issues.length ? 'BLOCKED' : 'OK';
    alt.review = review(alt, sp, env); alt.statusText = alt.review.text;
    // C안은 그릴 수 있다는 이유만으로 대표 후보가 아니다. 세 구간·계단참·감싸는 비례가 맞지 않으면 비교용 제외안으로 남긴다.
    const cChecks = alt.review.planItems.filter((x) => ['c-sym', 'c-top', 'c-front', 'c-shape'].includes(x.id));
    alt.candidate = alt.status === 'OK' && (alt.id !== 'C' || (alt.stairFit && cChecks.length === 4 && cChecks.every((x) => x.status === 'PASS')));
    if (alt.candidate) alt.candidateNote = '정상 비교 후보';
    else if (alt.id !== 'C') alt.candidateNote = '기하 불성립으로 제외';
    else {
      const WHY = { 'c-sym': '좌우 계단 단 수가 달라서', 'c-top': '승강기 덩어리가 계단보다 넓어 위 계단참이 정사각형보다 길어져서', 'c-front': '승강기 덩어리가 계단에 비해 깊어서', 'c-shape': '승강기 덩어리가 정방형에서 멀어서' };
      const why = (alt.stairFit ? [] : ['계단 단이 ㄷ자 세 구간에 안 들어가서']).concat(cChecks.filter((x) => x.status !== 'PASS').map((x) => WHY[x.id]));
      alt.excludeReason = why.join(', ');
      alt.candidateNote = `현재 입력에서는 제외 — 승강기 덩어리와 ㄷ자 계단 길이가 서로 맞지 않습니다. 이 안은 선택하지 마세요.`;
      alt.review.planWord = '현재 조건에 안 맞음';
      alt.review.text = alt.review.text.replace(/계획 [^·]+ · /, '현재 조건에 안 맞음 · ');
      alt.statusText = alt.review.text;
    }
    alt.rules = rulesOf(alt, def, sp);
    return alt;
  }

  // 지금 형식(계단참 1개 U형, 2구간)으로 그릴 수 있는 층고 범위. 입력 허용 범위(RANGE)와 다르다. 단높이·단너비·계단 폭에 따라 계산한다
  const frCache = new Map();
  function floorRange(input) {
    const sp = { ...DEFAULTS, ...(input || {}) }, key = `${sp.targetRiser}|${sp.tread}|${sp.stairWidth}`;
    if (frCache.has(key)) return frCache.get(key);
    const ok = (H) => { try { return Stair.calc({ floorHeight: H, targetRiser: sp.targetRiser, tread: sp.tread, width: sp.stairWidth, minFlights: 2 }).flights.length === 2; } catch (e) { return false; } };
    let lo = null, hi = null, extra = 0; // hi: 가장 낮은 층고부터 끊기지 않고 그릴 수 있는 마지막 값. extra: 그 위에서 띄엄띄엄 되는 값 수(10mm 간격)
    for (let H = RANGE.floorHeight[0]; H <= RANGE.floorHeight[1]; H += 10) { const g = ok(H); if (g && lo === null) lo = H; if (lo !== null && hi === null && !g) hi = H - 10; else if (hi !== null && g) extra++; }
    if (lo !== null && hi === null) hi = RANGE.floorHeight[1];
    const out = { input: RANGE.floorHeight, min: lo, max: hi, extra }; frCache.set(key, out); return out;
  }

  function generate(input) {
    const { spec, errors, fields } = normalizeSpec(input);
    if (errors.length) return { ok: false, errors, fields, spec };
    let g; try { g = Stair.calc({ floorHeight: spec.floorHeight, targetRiser: spec.targetRiser, tread: spec.tread, width: spec.stairWidth, minFlights: 2 }); } catch (e) { return { ok: false, errors: ['계단 계산에 실패했습니다: ' + e.message], spec }; }
    if (g.flights.length !== 2) return { ok: false, fields: { floorHeight: `층고 ${spec.floorHeight}mm는 계단참이 2개 이상 필요해 지금 형식(2회전 U형)으로 그릴 수 없습니다(${Stair.LANDING_MAX_H * 2}mm 이하).` }, errors: [`층고 ${spec.floorHeight}mm에서는 계단이 ${g.flights.length}구간(계단참 ${g.flights.length - 1}개)이 필요해 2회전 U형 하나로 만들 수 없습니다. 이번 단위는 2회전 U형(A·B안) 기준입니다.`], spec, stair: { g } };
    const lay = Stair.layout(g, { tread: spec.tread, width: spec.stairWidth, turn: 180, side: 1 });
    const stairLen = lay.bounds.x1 - lay.bounds.x0, stairWid = lay.bounds.y1 - lay.bounds.y0, entryDepth = Math.max(spec.stairWidth, 1200);
    const env = { g, lay, stairLen, stairWid, entryDepth, Ws: stairWid, Ls: entryDepth + stairLen };
    // A안은 샤프트 배치 두 가지를 둘 다 낸다: aShaft가 고른 배치가 A, 다른 배치가 A2(목록 끝 — B·C 순서는 그대로)
    const a2 = { ...altA({ ...spec, aShaft: spec.aShaft === 'side' ? 'line' : 'side' }, env), id: 'A2' };
    // 계단실 문 없음(소규모 건물 사례: 공모 DXF 12·13·14·16번): 문 자리를 문짝 없는 트임으로 바꾼다
    const openStair = (d) => (spec.stairKind === 'open' ? { ...d, doors: d.doors.map((x) => (x.id === 'S-H' ? { ...x, type: 'open', swingInto: undefined } : x)) } : d);
    const alts = [altA(spec, env), altB(spec, env), altC(spec, env), a2, altB(spec, env, true), altB(spec, env, 'mid')].map(openStair).map((d) => ({ ...d, grid: fitSizes(d.grid, spec) })).map((d) => finish(d, spec, env));
    const sigs = alts.map((a) => a.analysis.signature);
    return { ok: true, spec, stair: { g, lay, stairLen, stairWid, entryDepth }, alts, distinct: new Set(sigs).size === sigs.length };
  }

  // 승강기 대수(1·2·3)를 바꿔 가며 세 안이 어떻게 변하는지 비교한다. 같은 다른 입력에서 대수만 바꾼다.
  function compareCounts(input) {
    const runs = [1, 2, 3].map((n) => ({ n, r: generate({ ...(input || {}), evCount: n }) }));
    const base = runs[0].r, memo = {};
    if (!base.ok) return { runs, memo, ok: false, errors: base.errors };
    for (const [i, a0] of base.alts.entries()) {
      const lines = [];
      for (const { n, r } of runs.slice(1)) {
        if (!r.ok) { lines.push(`${n}대: 그릴 수 없음 — ${r.errors[0]}`); continue; }
        const a = r.alts[i], an = a.analysis, b = a0.analysis, parts = [];
        parts.push(a.status === 'OK' ? a.statusText : `기하 불성립(${a.issues.map((x) => x.target).filter((v, j, arr) => arr.indexOf(v) === j).join('·')})`);
        const REL = { adjacent: '맞닿음', facing: '마주 봄', parallel: '나란함', offset: '비켜 있음' }, KN = { S: '계단실', E: '승강기', H: '공용홀', P: '샤프트' }, pn = (x) => x.split('|').map((k) => KN[k]).join('–');
        const add = an.adjacency.filter((x) => !b.adjacency.includes(x)), del = b.adjacency.filter((x) => !an.adjacency.includes(x));
        parts.push(an.relationSE === b.relationSE ? `유형 유지(계단실–승강기 ${REL[an.relationSE]})` : `유형 바뀜(${REL[b.relationSE]} → ${REL[an.relationSE]})`);
        if (add.length || del.length) parts.push(`맞닿음 변화: ${add.map((x) => '+' + pn(x)).concat(del.map((x) => '−' + pn(x))).join(', ')}`);
        const pct = (x, y) => `${y >= x ? '+' : ''}${Math.round((y / x - 1) * 100)}%`;
        parts.push(`바깥 ${r1(a0.outer.w / 1000)}×${r1(a0.outer.h / 1000)}m → ${r1(a.outer.w / 1000)}×${r1(a.outer.h / 1000)}m (가로 ${pct(a0.outer.w, a.outer.w)}, 세로 ${pct(a0.outer.h, a.outer.h)})`);
        const ha = (x) => x.rooms.H.rects.reduce((s, q) => s + areaOf(q), 0) / 1e6;
        parts.push(`공용홀 ${r1(ha(a0))}→${r1(ha(a))}㎡`);
        if (a.stairShape === 'wrap') parts.push(`계단 구간 ${a0.stairInfo.flights.join('+')} → ${a.stairInfo.flights.join('+')}단`);
        if (a.stairShape === 'u') { const sh = a.rooms.S.bbox, slack = Math.max(sh.x1 - sh.x0, sh.y1 - sh.y0) - (base.stair.entryDepth + base.stair.stairLen); if (slack > 300) parts.push(`계단실이 계단보다 ${Math.round(slack)}mm 길어짐(승강기 줄에 맞춤)`); }
        lines.push(`${n}대: ${parts.join(' · ')}`);
      }
      memo[a0.id] = lines;
    }
    return { runs, memo, ok: true };
  }

  // 회전·반전한 같은 안(같은 안으로 세어지는지 확인하는 분석·시험 전용). 방과 문의 위치를 옮기며, stairAt은 옮기지 않으므로 renderAlt에는 쓰지 않는다.
  function transformAlt(alt, { quarterTurns = 0, mirror = false } = {}) {
    let W = alt.outer.w, H = alt.outer.h;
    const rotR = (r, h) => ({ x0: h - r.y1, x1: h - r.y0, y0: r.x0, y1: r.x1 }); // 90도 회전: (x,y) → (h-y, x)
    const rotD = (d, h) => (d.orient === 'v' ? { ...d, orient: 'h', axis: d.axis, center: h - d.center, from: h - d.to, to: h - d.from } : { ...d, orient: 'v', axis: h - d.axis, center: d.center });
    let rooms = Object.fromEntries(Object.entries(alt.rooms).map(([k, v]) => [k, { ...v, rects: v.rects.map((r) => ({ ...r })) }]));
    let doors = alt.doors.map((d) => ({ ...d }));
    for (let i = 0; i < ((quarterTurns % 4) + 4) % 4; i++) {
      rooms = Object.fromEntries(Object.entries(rooms).map(([k, v]) => [k, { ...v, rects: v.rects.map((r) => rotR(r, H)) }]));
      doors = doors.map((d) => rotD(d, H)); [W, H] = [H, W];
    }
    if (mirror) {
      rooms = Object.fromEntries(Object.entries(rooms).map(([k, v]) => [k, { ...v, rects: v.rects.map((r) => ({ x0: W - r.x1, x1: W - r.x0, y0: r.y0, y1: r.y1 })) }]));
      doors = doors.map((d) => (d.orient === 'v' ? { ...d, axis: W - d.axis } : { ...d, center: W - d.center, from: W - d.to, to: W - d.from }));
    }
    for (const k of Object.keys(rooms)) rooms[k].bbox = bboxOf(rooms[k].rects);
    const out = { ...alt, outer: { w: W, h: H }, rooms, doors };
    out.analysis = analyze(out);
    return out;
  }

  // 방을 이루는 사각형 조각들의 바깥 윤곽선. 같은 방 조각끼리 맞닿은 변은 두 번 나오므로 지워서 방 안쪽에 선이 생기지 않게 한다.
  function outlinePath(rects, Y) {
    const count = new Map(), segs = new Map();
    for (const r of rects) for (const e of [['h', r.y0, r.x0, r.x1], ['h', r.y1, r.x0, r.x1], ['v', r.x0, r.y0, r.y1], ['v', r.x1, r.y0, r.y1]]) { const k = e.join('|'); count.set(k, (count.get(k) || 0) + 1); segs.set(k, e); }
    const out = [];
    for (const [k, c] of count) if (c === 1) { const [o, at, a, b] = segs.get(k); out.push(o === 'h' ? `M${r1(a)} ${r1(Y(at))}L${r1(b)} ${r1(Y(at))}` : `M${r1(at)} ${r1(Y(a))}L${r1(at)} ${r1(Y(b))}`); }
    return out.join('');
  }

  // ---- 평면 그리기(SVG 문자열). 벽체는 두께만큼 비운 이중선, 문·계단·승강기·샤프트·치수를 같이 그린다.
  function renderAlt(alt, ctx) {
    const { outer, t } = alt, W = outer.w, H = outer.h, Y = (y) => H - y, fs = Math.max(W, H) / 34, pad = fs * 4, uid = 'cl' + alt.id;
    const o = [], P = (pts) => pts.map((p) => `${r1(p[0])},${r1(Y(p[1]))}`).join(' ');
    o.push(`<svg class="cl-svg" data-alt="${esc(alt.id)}" viewBox="${r1(-pad)} ${r1(-pad)} ${r1(W + pad * 2)} ${r1(H + pad * 2.4)}" role="img" aria-label="${esc(alt.name)} 평면" xmlns="http://www.w3.org/2000/svg">`);
    o.push(`<defs><pattern id="${uid}h" width="${fs * .9}" height="${fs * .9}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="${fs * .9}" class="cl-hatch"/></pattern></defs>`);
    o.push(`<rect class="cl-wall" x="0" y="0" width="${r1(W)}" height="${r1(H)}"/>`);
    for (const c of alt.cutouts || []) o.push(`<rect class="cl-out" x="${r1(c.x0)}" y="${r1(Y(c.y1))}" width="${r1(c.x1 - c.x0)}" height="${r1(c.y1 - c.y0)}"/>`); // 코어 밖(외곽이 꺾인 자리)
    for (const k of Object.keys(alt.rooms)) for (const r of alt.rooms[k].rects) o.push(`<rect class="cl-room cl-room-${k}" data-room="${k}" shape-rendering="crispEdges" x="${r1(r.x0)}" y="${r1(Y(r.y1))}" width="${r1(r.x1 - r.x0)}" height="${r1(r.y1 - r.y0)}"/>`);
    for (const k of Object.keys(alt.rooms)) { const d = outlinePath(alt.rooms[k].rects, Y); if (d) o.push(`<path class="cl-edge" data-room="${k}" d="${d}"/>`); }
    const R = alt.rooms, req = alt.req || {}, box = (b, cls, style) => `<rect class="${cls}" x="${r1(b.x0)}" y="${r1(Y(b.y1))}" width="${r1(b.x1 - b.x0)}" height="${r1(b.y1 - b.y0)}"${style ? ` style="${style}"` : ''}/>`;
    // 초기 계획 그림에는 요구/초과 배정선과 잔여 해치를 겹치지 않는다. EPS·PS만 기능 구역 전체를 빗금으로 구분한다.
    for (const k of Object.keys(R).filter((x) => KIND[x] === 'P')) o.push(box(R[k].bbox, 'cl-shaft', `fill:url(#${uid}h)`));
    // 승강기: 샤프트 안 X 표시
    for (const b of EV_KEYS.filter((k) => R[k]).map((k) => R[k].bbox)) { const m = Math.min(220, (b.x1 - b.x0) / 6); o.push(`<rect class="cl-evcar" x="${r1(b.x0 + m)}" y="${r1(Y(b.y1 - m))}" width="${r1(b.x1 - b.x0 - 2 * m)}" height="${r1(b.y1 - b.y0 - 2 * m)}"/><path class="cl-evx" d="M${r1(b.x0 + m)} ${r1(Y(b.y0 + m))}L${r1(b.x1 - m)} ${r1(Y(b.y1 - m))}M${r1(b.x0 + m)} ${r1(Y(b.y1 - m))}L${r1(b.x1 - m)} ${r1(Y(b.y0 + m))}"/>`); }
    // 계단: 01_stair의 U형 평면(구간 사각형·디딤 선)을 계단실 안에 옮겨 그린다
    if (alt.stairDraw) {
      const sd = alt.stairDraw, rect = (q, cls) => `<rect class="${cls}" x="${r1(q.x0)}" y="${r1(Y(q.y1))}" width="${r1(q.x1 - q.x0)}" height="${r1(q.y1 - q.y0)}"/>`;
      for (const q of sd.rects) o.push(rect(q, `cl-flight cl-${q.kind}`));
      for (const ln of sd.lines) o.push(`<polyline class="cl-step" points="${P(ln)}"/>`);
      o.push(`<polyline class="cl-arrow" points="${P(sd.path)}"/>`);
      const a = sd.path[sd.path.length - 1], b = sd.path[sd.path.length - 2], dir = [a[0] - b[0], a[1] - b[1]], nn = Math.hypot(dir[0], dir[1]) || 1, u = [dir[0] / nn, dir[1] / nn], hd = fs * .9;
      o.push(`<polygon class="cl-arrowhead" points="${P([a, [a[0] - u[0] * hd - u[1] * hd * .45, a[1] - u[1] * hd + u[0] * hd * .45], [a[0] - u[0] * hd + u[1] * hd * .45, a[1] - u[1] * hd - u[0] * hd * .45]])}"/>`);
      o.push(`<circle class="cl-arrowdot" cx="${r1(sd.path[0][0])}" cy="${r1(Y(sd.path[0][1]))}" r="${r1(fs * .3)}"/>`);
      for (const [x, y, txt] of sd.labels) o.push(`<text class="cl-t cl-tsm" x="${r1(x)}" y="${r1(Y(y))}" text-anchor="middle" font-size="${r1(fs * .75)}">${esc(txt)}</text>`);
    } else if (ctx && ctx.lay && R.S) {
      const so = alt.stairAt, lay = ctx.lay, x0 = lay.bounds.x0, horiz = alt.stairDir === 'h', map = (p) => (horiz ? [so.x0 + (p[0] - x0), so.y0 + p[1]] : [so.x0 + p[1], so.y0 + (p[0] - x0)]);
      for (const rc of lay.rects) o.push(`<polygon class="cl-flight cl-${rc.kind}" points="${P(rc.pts.map(map))}"/>`);
      for (const ln of lay.lines) o.push(`<polyline class="cl-step" points="${P(ln.map(map))}"/>`);
      const g = ctx.g, f0 = lay.frames[0], Wd = ctx.spec.stairWidth, gap = lay.lw - 2 * Wd, midX = f0.x1 + g.landingDepth / 2, z1 = Wd / 2, z2 = Wd + gap + Wd / 2;
      const endX = f0.x1 - g.flights[1].treads * ctx.spec.tread, path = [[0, z1], [midX, z1], [midX, z2], [endX, z2]].map((p) => map([p[0] + x0, p[1]]));
      o.push(`<polyline class="cl-arrow" points="${P(path)}"/>`);
      const a = path[3], b = path[2], dir = [a[0] - b[0], a[1] - b[1]], n = Math.hypot(dir[0], dir[1]) || 1, u = [dir[0] / n, dir[1] / n], hd = fs * .9;
      o.push(`<polygon class="cl-arrowhead" points="${P([a, [a[0] - u[0] * hd - u[1] * hd * .45, a[1] - u[1] * hd + u[0] * hd * .45], [a[0] - u[0] * hd + u[1] * hd * .45, a[1] - u[1] * hd - u[0] * hd * .45]])}"/>`);
      o.push(`<circle class="cl-arrowdot" cx="${r1(path[0][0])}" cy="${r1(Y(path[0][1]))}" r="${r1(fs * .3)}"/>`);
      const lab = (pt, txt) => o.push(`<text class="cl-t cl-tsm" x="${r1(pt[0])}" y="${r1(Y(pt[1]))}" text-anchor="middle" font-size="${r1(fs * .8)}">${esc(txt)}</text>`);
      lab(map([x0 + g.flights[0].treads * ctx.spec.tread / 2, z1 - Wd * .18]), `${g.flights[0].risers}단`);
      lab(map([x0 + g.flights[1].treads * ctx.spec.tread / 2, z2 + Wd * .18]), `${g.flights[1].risers}단`);
      lab(map([x0 + f0.x1 + g.landingDepth / 2, (z1 + z2) / 2]), '참');
      lab(map([x0 - Math.min(ctx.entryDepth || 1200, 1200) / 2, z1]), '오름 시작');
    }
    // 공용홀 치수: 가장 큰 직사각형 부분의 폭(짧은 변)과 길이(긴 변)를 홀 안에 치수선으로
    if (R.H) {
      const m = [...mergeRects(R.H.rects, 'h'), ...mergeRects(R.H.rects, 'v')].reduce((a, b) => (areaOf(b) > areaOf(a) ? b : a)), w = m.x1 - m.x0, h = m.y1 - m.y0, tk = fs * .35;
      const part = R.H.rects.reduce((a, q) => a + areaOf(q), 0) > areaOf(m) + 1; // 홀이 꺾이거나 앞이 넓어지면 치수는 점선 직사각형 구간만 잰다
      const dim = (p, q, lab, rot) => { const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, v = p[0] === q[0];
        return `<line x1="${r1(p[0])}" y1="${r1(Y(p[1]))}" x2="${r1(q[0])}" y2="${r1(Y(q[1]))}"/>` + [p, q].map((e) => `<line x1="${r1(e[0] - tk)}" y1="${r1(Y(e[1]) + tk)}" x2="${r1(e[0] + tk)}" y2="${r1(Y(e[1]) - tk)}"/>`).join('')
          + `<text x="${r1(v ? mx - fs * .35 : mx)}" y="${r1(v ? Y(my) : Y(my) - fs * .3)}" text-anchor="middle" font-size="${r1(fs * .7)}"${rot ? ` transform="rotate(-90 ${r1(mx - fs * .35)} ${r1(Y(my))})"` : ''}>${lab} ${Math.round(v ? Math.abs(q[1] - p[1]) : Math.abs(q[0] - p[0]))}</text>`; };
      const g = h >= w ? dim([m.x0, m.y0 + h * .28], [m.x1, m.y0 + h * .28], '홀 폭') + dim([m.x0 + fs * 1.1, m.y0], [m.x0 + fs * 1.1, m.y1], '홀 길이', true)
        : dim([m.x0 + w * .28, m.y0], [m.x0 + w * .28, m.y1], '홀 폭', true) + dim([m.x0, m.y0 + fs * 1.1], [m.x1, m.y0 + fs * 1.1], '홀 길이');
      o.push(`<g class="cl-dim cl-hdim" data-w="${Math.round(Math.min(w, h))}" data-l="${Math.round(Math.max(w, h))}">${part ? `<rect class="cl-hrect" x="${r1(m.x0)}" y="${r1(Y(m.y1))}" width="${r1(w)}" height="${r1(h)}"/>` : ''}${g}</g>`);
    }
    // 문
    for (const d of alt.doors) {
      if (!d.fits) continue;
      const lo = d.center - d.width / 2, hi = d.center + d.width / 2, v = d.orient === 'v';
      const gapRect = v ? { x: d.axis - t / 2, y: Y(hi), w: t, h: d.width } : { x: lo, y: Y(d.axis + t / 2), w: d.width, h: t };
      o.push(`<rect class="cl-doorgap" x="${r1(gapRect.x)}" y="${r1(gapRect.y)}" width="${r1(gapRect.w)}" height="${r1(gapRect.h)}"/>`);
      if (d.type === 'open') { const tp = v ? [[d.axis, lo], [d.axis, hi]] : [[lo, d.axis], [hi, d.axis]]; o.push(`<polyline class="cl-jamb" points="${P(tp)}"/>`); continue; }
      if (d.type === 'slide') { const a = v ? [d.axis, lo + d.width * .1] : [lo + d.width * .1, d.axis], b = v ? [d.axis, hi - d.width * .1] : [hi - d.width * .1, d.axis]; o.push(`<polyline class="cl-slide" points="${P([a, b])}"/>`); continue; }
      const into = R[d.swingInto] ? centroid(R[d.swingInto]) : [d.axis, d.axis], sgn = v ? (into[0] < d.axis ? -1 : 1) : (into[1] < d.axis ? -1 : 1);
      const hinge = v ? [d.axis, lo] : [lo, d.axis], closed = v ? [d.axis, hi] : [hi, d.axis], open = v ? [d.axis + sgn * d.width, lo] : [lo, d.axis + sgn * d.width];
      const p = (q) => [q[0], Y(q[1])], h = p(hinge), c = p(closed), op = p(open), cr = (c[0] - h[0]) * (op[1] - h[1]) - (c[1] - h[1]) * (op[0] - h[0]);
      o.push(`<polyline class="cl-leaf" points="${P([hinge, open])}"/><path class="cl-swing" d="M${r1(c[0])} ${r1(c[1])}A${r1(d.width)} ${r1(d.width)} 0 0 ${cr > 0 ? 1 : 0} ${r1(op[0])} ${r1(op[1])}"/>`);
    }
    // 방 이름과 크기
    for (const k of Object.keys(R)) {
      const rm = R[k]; if (!rm) continue;
      const big = rm.rects.reduce((a, b) => (areaOf(b) > areaOf(a) ? b : a)), bb = rm.bbox, cen = centroid(rm), inside = rm.rects.some((q) => cen[0] > q.x0 && cen[0] < q.x1 && cen[1] > q.y0 && cen[1] < q.y1);
      const cx = inside ? cen[0] : (big.x0 + big.x1) / 2, cy = inside ? cen[1] : (big.y0 + big.y1) / 2;
      if (k === 'S') continue; // 계단실 이름은 아래에서 계단 그림과 겹치지 않는 자리에 쓴다
      const dims = `${Math.round(bb.x1 - bb.x0)}×${Math.round(bb.y1 - bb.y0)}`;
      const sub = k === 'H' ? `${r1(rm.rects.reduce((a, q) => a + areaOf(q), 0) / 1e6)}㎡` : dims;
      o.push(`<text class="cl-t" x="${r1(cx)}" y="${r1(Y(cy) - (k === 'E' ? 0 : fs * .1))}" text-anchor="middle" font-size="${r1(fs)}">${esc(NAMES[k])}${KIND[k] === 'E' ? ' EV' : ''}</text><text class="cl-t cl-tsm" x="${r1(cx)}" y="${r1(Y(cy) + fs * .95)}" text-anchor="middle" font-size="${r1(fs * .7)}">${sub}</text>`);
    }
    if (R.S && alt.stairShape === 'wrap') { const b = R.S.bbox; o.push(`<text class="cl-t" x="${r1((b.x0 + b.x1) / 2)}" y="${r1(Y(b.y1) + fs * 1.3)}" text-anchor="middle" font-size="${r1(fs)}">${NAMES.S}</text>`); }
    else if (R.S) { const b = R.S.bbox; o.push(alt.stairDir === 'h' ? `<text class="cl-t" x="${r1(b.x0 + 120)}" y="${r1(Y(b.y1) + fs * 1.2)}" text-anchor="start" font-size="${r1(fs)}">${NAMES.S}</text>` : `<text class="cl-t" x="${r1((b.x0 + b.x1) / 2)}" y="${r1(Y(b.y1) + fs * 1.5)}" text-anchor="middle" font-size="${r1(fs)}">${NAMES.S}</text>`); }
    // 출입구 표시
    for (const d of alt.doors) if (d.fits && d.b === 'OUT') { const side = d.orient === 'h' ? 'S' : 'W'; o.push(`<text class="cl-t cl-tsm" x="${r1(d.orient === 'h' ? d.center : d.axis)}" y="${r1(d.orient === 'h' ? Y(d.axis) + fs * 2.1 : Y(d.center))}" text-anchor="middle" font-size="${r1(fs * .75)}">출입 ${side === 'S' ? '↑' : '→'}</text>`); }
    // 전체 치수
    const dy = Y(0) + fs * 2.6, dx = -fs * 2.6;
    o.push(`<g class="cl-dim"><line x1="0" y1="${r1(dy)}" x2="${r1(W)}" y2="${r1(dy)}"/><line x1="0" y1="${r1(dy - fs * .4)}" x2="0" y2="${r1(dy + fs * .4)}"/><line x1="${r1(W)}" y1="${r1(dy - fs * .4)}" x2="${r1(W)}" y2="${r1(dy + fs * .4)}"/><text x="${r1(W / 2)}" y="${r1(dy + fs * 1.3)}" text-anchor="middle" font-size="${r1(fs * .9)}">${Math.round(W)}</text>`
      + `<line x1="${r1(dx)}" y1="0" x2="${r1(dx)}" y2="${r1(H)}"/><line x1="${r1(dx - fs * .4)}" y1="0" x2="${r1(dx + fs * .4)}" y2="0"/><line x1="${r1(dx - fs * .4)}" y1="${r1(H)}" x2="${r1(dx + fs * .4)}" y2="${r1(H)}"/><text transform="translate(${r1(dx - fs * .6)} ${r1(H / 2)}) rotate(-90)" text-anchor="middle" font-size="${r1(fs * .9)}">${Math.round(H)}</text></g>`);
    o.push('</svg>');
    return o.join('');
  }

  const api = { A_SHAFT, floorRange, swingRect, stairZones, NAMES, KIND, EV_KEYS, DEFAULTS, LABELS, RANGE, EV_SPECS, EV_SOURCE, EV_SOURCE_URLS, SHAFT_MIN, WORD, STAIR_KINDS, normalizeSpec, linkStair, generate, compareCounts, validate, deadHall, analyze, describe, transformAlt, renderAlt, buildGrid, placeDoor, esc };
  if (typeof module !== 'undefined') module.exports = api; else root.CoreLayout = api;
})(typeof window !== 'undefined' ? window : globalThis);
