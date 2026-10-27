// 코어 평면 그림(공용): 2판 생성기(core_gen2.js)가 낸 alt를 SVG 조각으로. 통합 캔버스(07)와 코어 도구(06)가 같이 쓴다. 전역 esc(00_shared/ui.js) 필요.
function coreRoomBox(r) {
  return { x0: Math.min(...r.rects.map((q) => q.x0)), y0: Math.min(...r.rects.map((q) => q.y0)), x1: Math.max(...r.rects.map((q) => q.x1)), y1: Math.max(...r.rects.map((q) => q.y1)) };
}
function coreCenterBox(a, r) {
  const b = coreRoomBox(r), d = (a.t || 250) / 2;
  return { x0:b.x0 - d, y0:b.y0 - d, x1:b.x1 + d, y1:b.y1 + d };
}
function coreStairSvg(a, ctx) {
  let rects = [], lines = [];
  if (a.stairDraw) { rects = a.stairDraw.rects.map((r) => ({ kind:r.kind, pts:[[r.x0,r.y0],[r.x1,r.y0],[r.x1,r.y1],[r.x0,r.y1]] })); lines = a.stairDraw.lines || []; }
  else if (ctx && ctx.stair && ctx.stair.lay && a.stairAt) {
    const lay = ctx.stair.lay, x0 = lay.bounds.x0, so = a.stairAt, horiz = a.stairDir === 'h';
    const map = (p) => horiz ? [so.x0 + p[0] - x0, so.y0 + p[1]] : [so.x0 + p[1], so.y0 + p[0] - x0];
    rects = lay.rects.map((r) => ({ kind:r.kind, pts:r.pts.map(map) }));
    lines = lay.lines.map((ln) => ln.map(map));
  }
  const all = rects.flatMap((r) => r.pts), wall = a.t || 250, d = wall / 2;
  if (!all.length) return '';
  const x0 = Math.min(...all.map((p) => p[0])), x1 = Math.max(...all.map((p) => p[0])), y0 = Math.min(...all.map((p) => p[1])), y1 = Math.max(...all.map((p) => p[1]));
  const rooms = Object.entries(a.rooms).filter(([k]) => !['H','R','S'].includes(k)).map(([,r]) => coreRoomBox(r));
  const centerRooms = rooms.map((b) => ({ x0:b.x0-d, x1:b.x1+d, y0:b.y0-d, y1:b.y1+d }));
  const overlaps = (a0,a1,b0,b1) => Math.min(a1,b1) > Math.max(a0,b0);
  const snap = (v, axis) => { const q=centerRooms.flatMap((b)=>axis==='x'?[b.x0,b.x1]:[b.y0,b.y1]).sort((m,n)=>Math.abs(m-v)-Math.abs(n-v))[0]; return Math.abs(q-v)<=d ? q : v; };
  const centeredRect = (r) => {
    const rx0=Math.min(...r.pts.map(p=>p[0])), rx1=Math.max(...r.pts.map(p=>p[0])), ry0=Math.min(...r.pts.map(p=>p[1])), ry1=Math.max(...r.pts.map(p=>p[1]));
    const SB = a.gen === 2 && a.rooms.S ? a.rooms.S.bbox : null, at = (v, e, lim) => (SB ? Math.abs(v - SB[e]) < 1 : v === lim);
    let nx0=at(rx0,'x0',x0)?rx0-d:rx0, nx1=at(rx1,'x1',x1)?rx1+d:rx1, ny0=at(ry0,'y0',y0)?ry0-d:ry0, ny1=at(ry1,'y1',y1)?ry1+d:ry1;
    for (const b of rooms) {
      if (b.x0-rx1===wall && overlaps(ry0,ry1,b.y0,b.y1)) nx1=rx1+d;
      if (rx0-b.x1===wall && overlaps(ry0,ry1,b.y0,b.y1)) nx0=rx0-d;
      if (b.y0-ry1===wall && overlaps(rx0,rx1,b.x0,b.x1)) ny1=ry1+d;
      if (ry0-b.y1===wall && overlaps(rx0,rx1,b.x0,b.x1)) ny0=ry0-d;
    }
    nx0=snap(nx0,'x'); nx1=snap(nx1,'x'); ny0=snap(ny0,'y'); ny1=snap(ny1,'y');
    return r.pts.map((p) => [p[0]===rx0?nx0:p[0]===rx1?nx1:p[0], p[1]===ry0?ny0:p[1]===ry1?ny1:p[1]]);
  };
  const points = (pts) => pts.map((p) => `${p[0]},${p[1]}`).join(' ');
  const adjusted = rects.map((r) => ({ r, pts:centeredRect(r) }));
  const lineHit = (ln) => { const mx=(ln[0][0]+ln[ln.length-1][0])/2, my=(ln[0][1]+ln[ln.length-1][1])/2; return adjusted.find(({r})=>r.kind==='flight' && mx>=Math.min(...r.pts.map(p=>p[0])) && mx<=Math.max(...r.pts.map(p=>p[0])) && my>=Math.min(...r.pts.map(p=>p[1])) && my<=Math.max(...r.pts.map(p=>p[1]))); };
  const fullTread = (ln) => {
    const hit=lineHit(ln);
    if (!hit) return ln;
    const bx0=Math.min(...hit.pts.map(p=>p[0])), bx1=Math.max(...hit.pts.map(p=>p[0])), by0=Math.min(...hit.pts.map(p=>p[1])), by1=Math.max(...hit.pts.map(p=>p[1]));
    const horizontal=Math.abs(ln[0][1]-ln[ln.length-1][1]) < Math.abs(ln[0][0]-ln[ln.length-1][0]);
    const ordered=lines.filter((q)=>lineHit(q)===hit && (Math.abs(q[0][1]-q[q.length-1][1]) < Math.abs(q[0][0]-q[q.length-1][0]))===horizontal).sort((m,n)=>horizontal?m[0][1]-n[0][1]:m[0][0]-n[0][0]), i=ordered.indexOf(ln), at=(horizontal?by0:bx0)+(i+1)*(horizontal?by1-by0:bx1-bx0)/(ordered.length+1);
    return horizontal ? [[bx0,at],[bx1,at]] : [[at,by0],[at,by1]];
  };
  return adjusted.map(({r,pts}) => `<polygon class="core-stair-${r.kind}" points="${points(pts)}"/>`).join('') + lines.map((ln) => `<polyline class="core-stair-step" points="${points(fullTread(ln))}"/>`).join('');
}
// 문: 코어 계산(alt.doors)이 정한 자리·종류를 그대로 그린다 — 승강기(미닫이)·계단실(여닫이 호)·EPS(점검구 점선)·입구(트임 + ▲)
function coreDoorSvg(a, d) {
  if (!d.fits) return '';
  const t = a.t || 250, v = d.orient === 'v', w = d.width, c = d.center, ax = d.axis, h = t / 2;
  const P = (along, across) => (v ? [ax + across, along] : [along, ax + across]); // 벽을 따라 / 벽을 가로질러
  const L = (p, q) => `M${p[0]} ${p[1]}L${q[0]} ${q[1]}`;
  const into = d.swingInto && a.rooms[d.swingInto] ? coreRoomBox(a.rooms[d.swingInto]) : null, ic = into && (v ? (into.x0 + into.x1) / 2 : (into.y0 + into.y1) / 2), sg = into ? Math.sign(ic - ax) || 1 : 1;
  const lo = c - w / 2, hi = c + w / 2, ev = /^E\d*$/.test(d.a), layer = ev ? 'CORE_EV' : d.a === 'S' ? 'CORE_STAIR' : d.b === 'OUT' ? 'CORE_TEXT' : 'CORE_SHAFT';
  let s = `<line class="${ev ? 'core-ev-cut' : 'core-door-cut'}" x1="${P(lo, 0)[0]}" y1="${P(lo, 0)[1]}" x2="${P(hi, 0)[0]}" y2="${P(hi, 0)[1]}"/>`;
  let p = L(P(lo, -h), P(lo, h)) + L(P(hi, -h), P(hi, h)); // 문틀
  if (d.type === 'swing') { const hg = d.hinge === 'hi' ? hi : lo, dir = d.hinge === 'hi' ? -1 : 1, arc = Array.from({ length: 9 }, (_, i) => { const th = (i / 8) * Math.PI / 2; return P(hg + dir * w * Math.sin(th), sg * w * Math.cos(th)); }); p += L(P(hg, 0), arc[0]) + 'M' + arc.map((q) => `${q[0]} ${q[1]}`).join('L'); } // 문짝 + 열림 호(꺾은선 — DXF로도 그대로 나감)
  if (d.type === 'slide') p += L(P(lo + w * 0.08, -sg * h * 0.6), P(hi - w * 0.08, -sg * h * 0.6));
  s += `<path class="${ev ? 'core-ev-door' : 'core-door'}" data-layer="${layer}" d="${p}"/>`;
  if (d.type === 'hatch') s += `<path class="core-door core-hatch" data-layer="${layer}" d="${L(P(lo, 0), P(hi, 0))}"/>`;
  if (d.b === 'OUT') { const k = Math.min(w * 0.35, 420), out = d.side === 'S' || d.side === 'W' ? -1 : 1, tip = P(c, out * (h + 80)), b1 = P(c - k / 2, out * (h + 80 + k)), b2 = P(c + k / 2, out * (h + 80 + k)); s += `<path class="core-entry" d="M${tip[0]} ${tip[1]}L${b1[0]} ${b1[1]}L${b2[0]} ${b2[1]}Z"/>`; }
  return s;
}
function coreSemantic(a, ctx) {
  const t = a.t || 250, W = a.outer.w, Hh = a.outer.h, fsd = Math.max(300, Math.min(W, Hh) * 0.06);
  let s = `<rect class="core-bound" x="0" y="0" width="${W}" height="${Hh}"/>`; // 코어 세트 최대 범위(바깥 벽 바깥면)
  const cuts = a.cutouts || [];
  if (cuts.length) { // 실제 코어 외곽(최대 범위에서 코어 밖으로 뺀 자리를 뺀 꺾인 선)
    const xs = [...new Set([0, W, ...cuts.flatMap((c) => [c.x0, c.x1])])].sort((p, q) => p - q), ys = [...new Set([0, Hh, ...cuts.flatMap((c) => [c.y0, c.y1])])].sort((p, q) => p - q);
    const fill = (i, j) => i >= 0 && j >= 0 && i < xs.length - 1 && j < ys.length - 1 && !cuts.some((c) => (xs[i] + xs[i + 1]) / 2 > c.x0 && (xs[i] + xs[i + 1]) / 2 < c.x1 && (ys[j] + ys[j + 1]) / 2 > c.y0 && (ys[j] + ys[j + 1]) / 2 < c.y1);
    let d = '';
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) if (fill(i, j)) {
      if (!fill(i - 1, j)) d += `M${xs[i]} ${ys[j]}V${ys[j + 1]}`; if (!fill(i + 1, j)) d += `M${xs[i + 1]} ${ys[j]}V${ys[j + 1]}`;
      if (!fill(i, j - 1)) d += `M${xs[i]} ${ys[j]}H${xs[i + 1]}`; if (!fill(i, j + 1)) d += `M${xs[i]} ${ys[j + 1]}H${xs[i + 1]}`;
    }
    s += `<path class="core-outline" d="${d}"/>`;
  }
  if (a.rooms.H) s += a.rooms.H.rects.map((q) => `<rect class="core-hall" x="${q.x0}" y="${q.y0}" width="${q.x1 - q.x0}" height="${q.y1 - q.y0}"/>`).join(''); // 공용홀(옅게)
  const S = a.rooms.S, sb = S && coreRoomBox(S), sArea = S && S.rects.reduce((m, q) => m + (q.x1 - q.x0) * (q.y1 - q.y0), 0);
  if (sb && Math.abs(sArea - (sb.x1 - sb.x0) * (sb.y1 - sb.y0)) < 1e3) { const b = coreCenterBox(a, S); s += `<rect class="core-room-line" x="${b.x0}" y="${b.y0}" width="${b.x1 - b.x0}" height="${b.y1 - b.y0}"/>`; } // 계단실 벽(ㄷ자 C안은 계단 그림이 곧 벽)
  for (const [k, r] of Object.entries(a.rooms)) {
    if (k === 'H' || k === 'R' || k === 'S') continue;
    const b = coreCenterBox(a, r), w = b.x1 - b.x0, h = b.y1 - b.y0, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, fs = Math.max(260, Math.min(w, h) * .24);
    s += `<rect class="core-plan-zone${k === 'SR' ? ' core-spare' : ''}" data-k="${esc(k)}" x="${b.x0}" y="${b.y0}" width="${w}" height="${h}"/>`;
    if (/^E\d*$/.test(k)) s += `<path class="core-plan-symbol" d="M${b.x0} ${b.y0}L${b.x1} ${b.y1}M${b.x1} ${b.y0}L${b.x0} ${b.y1}"/><text class="core-plan-text" x="${cx}" y="${cy}" font-size="${fs}">EV</text>`;
    else s += `<text class="core-plan-text" x="${cx}" y="${cy}" font-size="${k === 'SR' ? fs * 0.8 : fs}">${k === 'SR' ? '창고' : esc(k)}</text>`;
  }
  s += coreStairSvg(a, ctx) + (a.doors || []).map((d) => coreDoorSvg(a, d)).join('');
  s += `<text class="core-dim" x="${W / 2}" y="${Hh + fsd * 0.6}" font-size="${fsd}">${(W / 1000).toFixed(2)} m</text><text class="core-dim" x="${W + fsd * 0.55}" y="${Hh / 2}" font-size="${fsd}" transform="rotate(90 ${W + fsd * 0.55} ${Hh / 2})">${(Hh / 1000).toFixed(2)} m</text>`;
  return s;
}
function coreMini(a, ctx) {
  const m = Math.max(a.outer.w, a.outer.h) * 0.09;
  return `<svg viewBox="${-m} ${-m} ${a.outer.w + m * 2.3} ${a.outer.h + m * 2.3}" style="width:100%;height:150px;background:var(--bg)">${coreSemantic(a, ctx || (typeof coreResult !== 'undefined' ? coreResult : null))}</svg>`;
}
