/* 지하주차 계획 엔진 — 공용 기하 도우미. 단위 mm, 다각형 [[x,y],...].
 * 도형 연산은 Clipper(정수 mm). 축과 나란한지 판정은 저장 좌표의 mm 반올림 흔들림(직교 변도 1mm쯤 기욺)을 감안해 5mm 또는 0.1%까지 허용한다.
 */
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const CL = isNode ? require('../../../00_shared/lib/clipper.js') : root.ClipperLib;
  const rot = (p, deg) => { const t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c]; };
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]], sub = (a, b) => [a[0] - b[0], a[1] - b[1]], mul = (a, k) => [a[0] * k, a[1] * k], dot = (a, b) => a[0] * b[0] + a[1] * b[1], len = (a) => Math.hypot(a[0], a[1]);
  const bbox = (P) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of P) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return [x0, y0, x1, y1]; };
  const boxHit = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const rectPoly = (r) => [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]];
  const signedArea = (P) => P.reduce((s, a, i) => { const b = P[(i + 1) % P.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2;
  // ── Clipper 도우미(정수 mm) ──
  const toC = (P) => P.map(([x, y]) => ({X: Math.round(x), Y: Math.round(y)})), fromC = (P) => P.map((q) => [q.X, q.Y]);
  function offs(P, d) { const co = new CL.ClipperOffset(4, 2), out = new CL.Paths(); co.AddPath(toC(P), CL.JoinType.jtMiter, CL.EndType.etClosedPolygon); co.Execute(out, d); return out.filter((p) => CL.Clipper.Orientation(p)).map(fromC); }
  function offsP(paths, d) { const co = new CL.ClipperOffset(4, 2), out = new CL.Paths(); co.AddPaths(paths.map(toC), CL.JoinType.jtMiter, CL.EndType.etClosedPolygon); co.Execute(out, d); return out.map(fromC); }
  function boolOp(A, B, type) { const c = new CL.Clipper(), out = new CL.Paths(); c.AddPaths(A.map(toC), CL.PolyType.ptSubject, true); if (B.length) c.AddPaths(B.map(toC), CL.PolyType.ptClip, true); c.Execute(type, out, CL.PolyFillType.pftNonZero, CL.PolyFillType.pftNonZero); return out.map(fromC); }
  const areaOf = (paths) => paths.reduce((s, p) => s + signedArea(p), 0); // 구멍은 음수라 알아서 빠진다
  // 점-선분 거리
  const segDist = (p, a, b) => { const ab = sub(b, a), t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1))); return len(sub(p, add(a, mul(ab, t)))); };
  // 선분이 축 정렬 사각형 r 안을 지나는 매개변수 구간(Liang–Barsky), 없으면 null
  function clipSeg(a, b, r) {
    const d = sub(b, a); let t0 = 0, t1 = 1;
    for (const [p, q] of [[-d[0], a[0] - r[0]], [d[0], r[2] - a[0]], [-d[1], a[1] - r[1]], [d[1], r[3] - a[1]]]) {
      if (Math.abs(p) < 1e-9) { if (q < 0) return null; continue; }
      const t = q / p; if (p < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
      if (t0 >= t1) return null;
    }
    return t1 - t0 > 1e-6 ? [t0, t1] : null;
  }
  // 수평선 y가 다각형들 안을 지나는 x 구간, 세로선 x가 지나는 y 구간
  function hSpans(polys, y) {
    const xs = [];
    for (const P of polys) P.forEach((a, i) => { const b = P[(i + 1) % P.length]; if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1])); });
    xs.sort((p, q) => p - q); const out = []; for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]); return out;
  }
  const vSpans = (polys, x) => hSpans(polys.map((Pg) => Pg.map(([px, py]) => [py, px])), x);
  // 구간 목록에서 다른 구간들을 뺀다
  const minus = (spans, cutsp) => spans.flatMap(([s0, s1]) => { let out = [[s0, s1]]; for (const [c0, c1] of cutsp) out = out.flatMap(([u0, u1]) => (c1 <= u0 || c0 >= u1 ? [[u0, u1]] : [[u0, Math.max(u0, c0)], [Math.min(u1, c1), u1]].filter(([v0, v1]) => v1 - v0 > 1))); return out; });
  // 반직선 a→(방향 u)이 다각형 둘레와 만나는 점들(가까운 순)
  function rayHits(a, u, polys) {
    const ts = [];
    for (const P of polys) P.forEach((p, i) => {
      const q = P[(i + 1) % P.length], e = sub(q, p), den = u[0] * e[1] - u[1] * e[0], w = sub(p, a);
      // 같은 선 위로 겹치는 변: 반직선이 그 변에 들어서는 지점(이미 위에 있으면 0)
      if (Math.abs(den) < 1e-9) { if (Math.abs(w[0] * u[1] - w[1] * u[0]) < 1) { const t1 = dot(w, u), t2 = dot(sub(q, a), u); if (Math.max(t1, t2) >= 0) ts.push(Math.max(0, Math.min(t1, t2))); } return; }
      const t = (w[0] * e[1] - w[1] * e[0]) / den, s2 = (w[0] * u[1] - w[1] * u[0]) / den; if (t >= 0 && s2 >= 0 && s2 <= 1) ts.push(t);
    });
    return ts.sort((x, y) => x - y).map((t) => add(a, mul(u, t)));
  }
  const norm = (v) => mul(v, 1 / (len(v) || 1));
  const meet = (p, u, q, v) => { const dd = u[0] * v[1] - u[1] * v[0]; if (Math.abs(dd) < 1e-9) return null; const t = ((q[0] - p[0]) * v[1] - (q[1] - p[1]) * v[0]) / dd; return add(p, mul(u, t)); };
  function selfCrossing(P) {
    const n = P.length, cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) { if (i === 0 && j === n - 1) continue; const a = P[i], b = P[(i + 1) % n], c = P[j], e = P[(j + 1) % n]; if (cr(a, b, c) * cr(a, b, e) < -1 && cr(c, e, a) * cr(c, e, b) < -1) return true; }
    return false;
  }
  // 겹친 점·한 줄 위 점 정리
  function clean(P) {
    let Q = P.filter((p, i) => len(sub(p, P[(i + 1) % P.length])) > 5);
    for (let k = 0; k < 3; k++) Q = Q.filter((p, i) => { const a = Q[(i + Q.length - 1) % Q.length], b = Q[(i + 1) % Q.length]; return Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) > 5 * len(sub(b, a)); });
    return Q;
  }
  const nearest = (vals, v) => vals.reduce((b, x) => (Math.abs(x - v) < Math.abs(b - v) ? x : b), vals[0]);
  // 축과 나란한 변: 5mm 또는 길이의 0.1%까지(저장 좌표 mm 반올림 흔들림)
  const isH = (p, q) => Math.abs(q[1] - p[1]) <= Math.max(5, .001 * Math.abs(q[0] - p[0]));
  const isV = (p, q) => Math.abs(q[0] - p[0]) <= Math.max(5, .001 * Math.abs(q[1] - p[1]));
  // 거의 축과 나란한 변: 축에서 벗어난 폭(짧은 쪽 성분)이 tol 이하. 살짝 기운 벽(1–3°)은 사선이 아니라 직교 벽처럼 격자로 다룬다
  const nearAxis = (p, q, tol) => Math.min(Math.abs(q[0] - p[0]), Math.abs(q[1] - p[1])) <= tol;
  const api = {CL, nearAxis, rot, add, sub, mul, dot, len, bbox, boxHit, rectPoly, signedArea, toC, fromC, offs, offsP, boolOp, areaOf, segDist, clipSeg, hSpans, vSpans, minus, rayHits, norm, meet, selfCrossing, clean, nearest, isH, isV};
  if (isNode) module.exports = api; else (root.UGP = root.UGP || {}).geom = api;
})(this);
