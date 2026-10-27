// 직선 계단 계산 + 기준 검증. 길이 단위 mm. 브라우저와 node 양쪽에서 로드된다.
(function (root) {
  const LANDING_MAX_H = 3000; // 높이 3m 초과 시 3m 이내마다 계단참 (피난방화규칙 제15조제1항제1호)
  const LANDING_MIN_W = 1200;

  // 기준값은 개정·적용 조건에 따라 바뀐다. 고칠 때는 이 표만 고친다.
  // verified: law.go.kr 조문정보 원문(03_law/law-15-source.txt)과 대조했으면 true. 제15조 항목만 해당.
  const PROFILES = {
    elem: { name: '초등학교 옥내계단', widthMin: 1500, riserMax: 160, treadMin: 260, src: '피난방화규칙 제15조제2항제1호', verified: true },
    mid: { name: '중·고등학교 옥내계단', widthMin: 1500, riserMax: 180, treadMin: 260, src: '피난방화규칙 제15조제2항제2호', verified: true },
    assembly: { name: '문화집회·판매시설 등 옥내계단', widthMin: 1200, riserMax: null, treadMin: null, src: '피난방화규칙 제15조제2항제3호 (대상 범위 확인 필요)', verified: true },
    floor120: { name: '지정 층 해당 일반 건축물 옥내계단', widthMin: 1200, riserMax: null, treadMin: null, src: '피난방화규칙 제15조제2항제4호 (면적 조건 확인 필요)', verified: true },
    other: { name: '그 밖의 옥내계단', widthMin: 600, riserMax: null, treadMin: null, src: '피난방화규칙 제15조제2항제5호', verified: true },
    // 주택건설기준 규정 제16조: 제1항 표(03_law/law-housing16-source.txt, 표 이미지 03_law/law-housing16-table.gif)와 제2항제1호(2m 초과 시 2m 이내마다 계단참). 예외(기계실·물탱크실 3m, 동 출입구 1층 2.5m, 세대 내 계단 제외)는 반영하지 않음.
    housing: { name: '주택단지 공동사용 계단', widthMin: 1200, riserMax: 180, treadMin: 260, landingMax: 2000, src: '주택건설기준 규정 제16조제1항 표(공동으로 사용하는 계단)·제2항제1호', verified: true },
    outdoor: { name: '주택단지 건축물의 옥외계단', widthMin: 900, riserMax: 200, treadMin: 240, landingMax: 2000, src: '주택건설기준 규정 제16조제1항 표(건축물의 옥외계단)·제2항제1호', verified: true },
  };

  function calc({ floorHeight: H, targetRiser, tread, width, riserMax, minFlights = 1, landingMax = LANDING_MAX_H, risersPerFlight }) {
    if (![H, targetRiser, tread, width].every((v) => v > 0)) throw new Error('입력은 모두 양수여야 한다');
    let n = Math.max(1, Math.round(H / targetRiser));
    // 목표가 한도 이내인데 반올림 결과가 한도를 넘으면 한도 이내가 되도록 단 수를 올린다. 목표 자체가 한도 초과면 그대로 FAIL.
    const adjusted = riserMax > 0 && targetRiser <= riserMax && H / n > riserMax + 1e-9;
    if (adjusted) n = Math.ceil(H / riserMax - 1e-9);
    const riser = H / n;
    // 한 단 올림 때문에 flight 높이가 3m를 넘을 수 있어서 넘지 않을 때까지 늘린다.
    let k = H > landingMax ? Math.ceil(H / landingMax) : 1; // 계단참 간격 한도(기본 3m, 주택단지 계단은 2m)
    if (minFlights > k) k = Math.min(minFlights, n); // 꺾임 계단은 꺾이는 자리에 계단참이 필요해 최소 flight 수를 강제
    const split = (k) => Array.from({ length: k }, (_, i) => Math.floor(n / k) + (i < n % k ? 1 : 0));
    while (k < n && Math.max(...split(k)) * riser > landingMax + 1e-9) k++;
    // 구간별 단 수를 직접 지정하면(합계가 전체 단 수와 같을 때만) 그대로 쓴다. 맞지 않으면 자동 분할.
    const custom = Array.isArray(risersPerFlight) && risersPerFlight.length > 0 && risersPerFlight.every((v) => Number.isInteger(v) && v >= 1) && risersPerFlight.reduce((a, b) => a + b, 0) === n;
    const per = custom ? risersPerFlight : split(k); k = per.length;
    const flights = per.map((r) => ({ risers: r, treads: r - 1, height: r * riser }));
    const landingDepth = Math.max(LANDING_MIN_W, width);
    const treadsTotal = flights.reduce((s, f) => s + f.treads, 0);
    const run = treadsTotal * tread + (k - 1) * landingDepth;
    return { n, adjusted, custom, riser, flights, landingDepth, treadsTotal, run, angle: (Math.atan2(riser, tread) * 180) / Math.PI, twoRT: 2 * riser + tread };
  }

  const STUB = 600; // 마지막 flight 위에 붙이는 상층 바닥 조각 길이 (표현용)

  // 계단 몸체의 단면 다각형 (x=진행방향, y=높이). 윗선(단형)을 따라가고 아랫선을 되돌아온다.
  // 경사 슬래브 두께 t = 단 안쪽 모서리(root line)에서 하부면까지의 경사면에 수직한 거리.
  // 계단참은 수평 슬래브로 같은 두께 t. 하부면은 지반 또는 계단참 밑면(y-t)과 만나는 지점에서 꺾인다.
  // 3D와 단면 도면이 이 다각형 하나를 같이 쓴다.
  function profile(g, { tread, slab: t }) {
    const r = g.riser, s = r / tread;
    const dv = (t * Math.hypot(r, tread)) / tread; // root line에서 하부면까지의 수직 거리
    const top = [[0, 0]], bot = [[0, 0], [dv / s, 0]], last = g.flights.length - 1;
    let x = 0, y = 0;
    g.flights.forEach((f, i) => {
      const xs = x, ys = y;
      if (i > 0) bot.push([xs + (dv - t) / s, ys - t]); // 아래 계단참 밑면과 만나는 꺾임점
      for (let k = 0; k < f.risers; k++) {
        y += r; top.push([x, y]);
        if (k < f.risers - 1) { x += tread; top.push([x, y]); }
      }
      const run = i < last ? g.landingDepth : STUB;
      bot.push([Math.min(x + (r + dv - t) / s, x + run), y - t]); // 위 계단참 밑면과 만나는 꺾임점
      x += run; top.push([x, y]);
    });
    bot.push([x, y - t]);
    const ring = top.concat(bot.slice(1).reverse()).filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
    return { pts: ring, t, xEnd: x, H: y };
  }

  // ---- 꺾임 계단 평면 배치 ----
  // turn: 0 직선 / 90 ㄱ자 / 180 U자. 각 flight는 자기 좌표계(x=진행, z=폭, 왼쪽이 +z)로 두고, 평면 좌표 = O + f·x + l·z.
  // 단면(profile)은 경로를 펼친 길이 기준 하나라서 flight마다 [x0, xe] 구간을 잘라 쓴다.
  const GAP = 100; // U자 계단의 두 flight 사이 간격(계단 중심 틈)
  const toPlan = (fr, x, z) => [fr.O[0] + fr.f[0] * x + fr.l[0] * z, fr.O[1] + fr.f[1] * x + fr.l[1] * z];
  // 계단참마다 꺾임을 따로 줄 수 있다: input.turns[i] = { turn: 0|90|180, side: 1|-1 }, 없으면 input.turn/side를 모든 계단참에 쓴다.
  const turnOf = (input, i) => (input.turns && input.turns[i]) || { turn: input.turn || 0, side: input.side || 1 };
  function layout(g, input) { // side +1: 오르는 사람 기준 오른쪽으로 꺾임(화면에서 아래쪽), -1: 왼쪽
    const { tread, width: W } = input;
    let O = [0, 0], f = [1, 0], x = 0, y = 0, lwMax = W;
    const frames = [], rects = [], lines = [];
    g.flights.forEach((fl, i) => {
      const last = i === g.flights.length - 1, R = fl.risers, x1 = x + (R - 1) * tread, xe = x1 + (last ? STUB : g.landingDepth), l = [-f[1], f[0]];
      const t = last ? { turn: 0, side: 1 } : turnOf(input, i), side = t.side, lw = t.turn === 180 ? 2 * W + GAP : W; // lw: 이 계단참의 폭 방향 크기
      const fr = { O, f, l, x0: x, x1, xe, y0: y, y1: y + R * g.riser, last, turn: t.turn, side, lw, extZ: side > 0 ? W : W - lw }; frames.push(fr);
      lwMax = Math.max(lwMax, lw);
      const rect = (kind, a, b, c, d) => rects.push({ kind, i, local: { x: [a, b], z: [c, d] }, pts: [[a, c], [b, c], [b, d], [a, d]].map(([u, v]) => toPlan(fr, u, v)) });
      rect('flight', 0, x1 - x, 0, W);
      for (let s = 1; s < fl.treads; s++) lines.push([toPlan(fr, s * tread, 0), toPlan(fr, s * tread, W)]);
      if (!last) {
        rect('landing', x1 - x, xe - x, side > 0 ? 0 : W - lw, side > 0 ? lw : W);
        if (t.turn === 90) { // 다음 flight는 계단참 먼 쪽 끝에 붙어 옆으로 올라감
          if (side > 0) { O = toPlan(fr, xe - x, W); f = l; } else { O = toPlan(fr, xe - x - W, 0); f = [-l[0], -l[1]]; }
        } else if (t.turn === 180) { O = toPlan(fr, x1 - x, side > 0 ? lw : -GAP); f = [-f[0], -f[1]]; } // 되돌아 올라감
        else O = toPlan(fr, xe - x, 0);
      }
      x = xe; y = fr.y1;
    });
    const px = rects.flatMap((r) => r.pts.map((p) => p[0])), py = rects.flatMap((r) => r.pts.map((p) => p[1]));
    return { frames, rects, lines, lw: lwMax, bounds: { x0: Math.min(...px), x1: Math.max(...px), y0: Math.min(...py), y1: Math.max(...py) } };
  }

  // 평면에서 서로 겹치는 구간 쌍을 찾는다(꺾임이 짧은 구간끼리 이어지면 생김). 계단참과 마지막 상층 바닥 조각(STUB)도 포함. 반환: [[구간 i, 구간 j], …] (0부터)
  function overlaps(g, input, lay) {
    const W = input.width, boxes = lay.rects.map((r) => ({ i: r.i, p: r.pts }));
    const fr = lay.frames[lay.frames.length - 1];
    boxes.push({ i: lay.frames.length - 1, p: [[fr.x1 - fr.x0, 0], [fr.xe - fr.x0, 0], [fr.xe - fr.x0, W], [fr.x1 - fr.x0, W]].map(([u, z]) => toPlan(fr, u, z)) });
    const bb = boxes.map((b) => ({ i: b.i, x0: Math.min(...b.p.map((q) => q[0])), x1: Math.max(...b.p.map((q) => q[0])), y0: Math.min(...b.p.map((q) => q[1])), y1: Math.max(...b.p.map((q) => q[1])) }));
    const out = [], e = 1e-6;
    for (let a = 0; a < bb.length; a++) for (let b = a + 1; b < bb.length; b++) {
      if (bb[a].i === bb[b].i) continue;
      if (!(bb[a].x1 <= bb[b].x0 + e || bb[b].x1 <= bb[a].x0 + e || bb[a].y1 <= bb[b].y0 + e || bb[b].y1 <= bb[a].y0 + e) && !out.some((q) => q[0] === bb[a].i && q[1] === bb[b].i)) out.push([bb[a].i, bb[b].i]);
    }
    return out;
  }

  // 단면 다각형을 x∈[a,b]로 자른다 (x는 a 기준으로 이동). 윗선·아랫선이 x 단조라 한 조각만 나온다.
  function sliceProfile(pts, a, b) {
    const clip = (poly, keep, cut) => poly.flatMap((p, i) => {
      const q = poly[(i + 1) % poly.length], pin = keep(p), qin = keep(q), out = [];
      if (pin) out.push(p);
      if (pin !== qin) out.push(cut(p, q));
      return out;
    });
    const at = (v) => (p, q) => [v, p[1] + ((q[1] - p[1]) * (v - p[0])) / (q[0] - p[0])];
    // 오른쪽 경계(x=b)에는 다음 flight 첫 챌판이 폭 0짜리 돌기로 딸려 들어오므로, 경계 위 점은 윗선 끝과 아랫선 끝(링 순서의 처음·마지막)만 남긴다.
    const cut = clip(clip(pts, (p) => p[0] >= a, at(a)), (p) => p[0] <= b, at(b)), onB = (p) => Math.abs(p[0] - b) < 1e-6;
    const first = cut.findIndex(onB), lastB = cut.length - 1 - [...cut].reverse().findIndex(onB);
    return cut.filter((p, i) => !onB(p) || i === first || i === lastB).map((p) => [p[0] - a, p[1]]);
  }

  // ---- 난간 ----
  // 손잡이 꺾은선(단 코 선 위 railH)과 기둥. 단면 좌표 (x=펼친 길이, y=높이). zs는 폭 방향 난간 위치(양옆 + 3m 초과 시 중간).
  // 제15조제1항제3호: 너비 3m 초과면 3m 이내마다 중간 난간, 단높이 ≤150·단너비 ≥300이면 예외.
  // lines/posts의 fi는 위치를 계산할 layout frame 번호. 직선은 frame 0 하나로 이어 붙이고, 꺾임은 flight마다 따로 둔다
  // 꺾임 계단참의 열린 가장자리는 perim(계단참 좌표 u,z의 꺾은선)과 perimPosts로 따로 둔다:
  // ㄱ자는 바깥쪽 두 변(+다음 flight와 겹치지 않는 안쪽 변), U자는 바깥 세 변 + 두 flight 사이 틈 연결.
  function railZs(g, { tread, width }) {
    const mid = width > 3000 && !(g.riser <= 150 && tread >= 300) ? Math.ceil(width / 3000) - 1 : 0;
    return Array.from({ length: mid + 2 }, (_, j) => (width * j) / (mid + 1));
  }
  function rail(g, input) {
    const { tread, railH, width: W } = input, r = g.riser, lines = [], posts = [], plan = [], perim = [], perimPosts = [], last = g.flights.length - 1;
    const anyTurn = !!input.turn || (input.turns || []).some((t) => t && t.turn); // 꺾임이 하나라도 있으면 flight마다 따로
    let x = 0, y = 0, cur = null;
    g.flights.forEach((f, i) => {
      const R = f.risers, x1 = x + (R - 1) * tread, y1 = y + R * r, run = i < last ? g.landingDepth : STUB, fi = anyTurn ? i : 0;
      const t = i < last ? turnOf(input, i) : { turn: 0, side: 1 }, straightLanding = i < last && t.turn === 0;
      if (!cur || anyTurn) { cur = { fi, pts: [] }; lines.push(cur); }
      cur.pts.push([x, y + r + railH], [x1, y1 + railH]);
      if (!anyTurn || straightLanding) cur.pts.push([x1 + run, y1 + railH]); // 직진 계단참 위로는 손잡이를 이어 수직 연결(단순화)
      for (let k = 0; k < R; k++) if (k % 2 === 0 || k === R - 1) posts.push([x + k * tread, y + (k + 1) * r, railH, fi]); // 한 단 걸러 + flight 끝
      if (anyTurn) plan.push({ fi, x: [0, x1 - x + (straightLanding ? run : 0)] });
      if (t.turn) { // 꺾임 계단참 둘레 난간 (계단참 로컬 좌표: u=진행방향, z=폭 방향)
        const a = x1 - x, b = a + g.landingDepth, lw = t.turn === 180 ? 2 * W + GAP : W, yy = y1 + railH;
        const ls = t.turn === 180 ? [[[a, 0], [b, 0], [b, lw], [a, lw]], [[a, W], [a, W + GAP]]] : [[[a, 0], [b, 0], [b, W]], ...(b - W - a > 1e-6 ? [[[a, W], [b - W, W]]] : [])];
        ls.forEach((p0) => {
          const pts = t.side > 0 ? p0 : p0.map(([u, z]) => [u, W - z]); // 반대쪽 꺾임은 폭 방향으로 뒤집는다
          perim.push({ fi: i, y: yy, pts, xs: [x + a, x + b] });
          pts.forEach((p, k) => { // 기둥: 꼭짓점마다, 변은 1m 이내 간격으로
            const q = pts[k - 1], n = q ? Math.ceil(Math.hypot(p[0] - q[0], p[1] - q[1]) / 1000) : 1;
            for (let m = q ? 1 : 0; m <= (q ? n : 0); m++) perimPosts.push({ fi: i, u: q ? q[0] + ((p[0] - q[0]) * m) / n : p[0], z: q ? q[1] + ((p[1] - q[1]) * m) / n : p[1], y: y1, h: railH });
          });
        });
      }
      x = x1 + run; y = y1;
    });
    if (!anyTurn) plan.push({ fi: 0, x: [0, g.treadsTotal * tread + last * g.landingDepth] });
    return { lines, posts, plan, perim, perimPosts, zs: railZs(g, input) };
  }

  const st = (ok) => (ok ? 'PASS' : 'FAIL');

  function checks(g, { tread, width, floorHeight, railOn, railH }, p) {
    const lm = p.landingMax || LANDING_MAX_H, r = (id, label, kind, value, limit, status, note = '') => ({ id, label, kind, value, limit, status, note });
    const out = [
      p.riserMax == null
        ? r('riser', '단높이', '법규', g.riser, '기준 없음', 'N/A', '이 기준 항목에는 단높이 한도가 없음')
        : r('riser', '단높이', '법규', g.riser, `≤ ${p.riserMax}`, st(g.riser <= p.riserMax)),
      p.treadMin == null
        ? r('tread', '단너비', '법규', tread, '기준 없음', 'N/A', '이 기준 항목에는 단너비 한도가 없음')
        : r('tread', '단너비', '법규', tread, `≥ ${p.treadMin}`, st(tread >= p.treadMin)),
      p.widthMin == null
        ? (p.widthCand ? r('width', '유효너비', '법규', width, `후보 ≥ ${p.widthCand.join(' 또는 ≥ ')}`, 'CHECK', `거실 면적을 입력하면 확정. ${width >= Math.max(...p.widthCand) ? '어느 후보든 충족' : '후보에 따라 미충족 가능'}`) : r('width', '유효너비', '법규', width, '기준 없음', 'N/A', (p.notes && p.notes.width) || '이 기준 항목에는 너비 기준 없음'))
        : r('width', '유효너비', '법규', width, `≥ ${p.widthMin}`, st(width >= p.widthMin), '입력값을 유효너비로 간주'),
      r('landing-gap', '계단참 간격', '법규', Math.max(...g.flights.map((f) => f.height)), `≤ ${lm}`, st(g.flights.every((f) => f.height <= lm + 1e-9)), floorHeight > lm ? '' : `높이 ${lm / 1000}m 이하라 계단참 불필요`),
    ];
    if (g.flights.length > 1) out.push(r('landing-w', '계단참 유효너비', '법규', width, `≥ ${LANDING_MIN_W}`, st(width >= LANDING_MIN_W), '계단참 너비를 계단 너비와 같다고 가정'));
    if (floorHeight > 1000) out.push(r('rail', '양옆 난간', '법규', railOn ? '모델 포함' : '모델 미포함', '필요', 'CHECK', '높이 1m 초과 계단·계단참 양옆에 난간 필요(벽 포함). 모델에 난간을 넣은 것은 설치 기준을 검증한 것이 아니므로 판정하지 않고 설계자 확인으로 둔다'));
    const mids = railZs(g, { tread, width }).length - 2;
    if (mids > 0) out.push(r('rail-mid', '중간 난간', '법규', railOn ? `${mids}줄 포함` : '모델 미포함', '필요', 'CHECK', '너비 3m 초과: 3m 이내마다 중간 난간 필요. 모델에 넣은 것은 설치 기준 검증이 아니므로 판정하지 않고 설계자 확인으로 둔다'));
    // 제15조제4항 손잡이 기준은 제3항 용도(공동주택·근생·문화집회·판매·업무 등)의 주계단·피난계단·특별피난계단에만 걸린다.
    // 용도는 입력으로 알 수 있지만 주계단·피난계단 여부는 입력이 없어 PASS/FAIL을 내지 않고 설계자 확인으로 둔다.
    if (railOn) {
      const cmp = `현재 ${railH}${railH === 850 ? ' (850과 일치)' : ' (850과 다름)'}`;
      out.push(p.handUse === false
        ? Object.assign(r('hand', '손잡이 높이', '법규', railH, '= 850', 'N/A', '이 용도는 제15조제3항 대상이 아니라 손잡이 높이 기준(제4항)이 적용되지 않음'), { naKind: 'off' })
        : r('hand', '손잡이 높이', '법규', railH, '= 850', 'CHECK', `제3항 용도의 주계단·피난계단이면 손잡이 높이 850 필요(제4항제2호). ${cmp}. 벽에서 50 이상 이격·단 끝 수평부 300 연장 등은 모델에 없음`));
    }
    out.push(r('headroom', '유효높이', '법규', '-', '≥ 2100', 'CHECK', '상부 구조 정보 없음: 수동 확인'));
    out.push(r('2rt', '2R+T 보행감', '권장', Math.round(g.twoRT), '600~650', g.twoRT >= 600 && g.twoRT <= 650 ? 'PASS' : 'CHECK', '법정 기준 아님. 자료마다 범위가 다름'));
    // 적용 상태 반영: 적용 대상 아님 → N/A, 적용 미확정 → CHECK(충족 여부는 참고로 병기), 해석 미확정 항목의 FAIL → CHECK
    const nt = p.notes || {};
    out.forEach((c) => {
      if (c.kind !== '법규') return;
      if (p.off) { c.note = nt.off; c.status = 'N/A'; }
      else if (p.pending) { c.note = c.status === 'PASS' || c.status === 'FAIL' ? `${c.note ? c.note + ' · ' : ''}${nt.pend}, 기준 적용 시 ${c.status}` : c.note || nt.pend; c.status = 'CHECK'; }
      else if ((p.soft || []).includes(c.id) && c.status === 'FAIL') { c.status = 'CHECK'; c.note = nt.soft; }
    });
    // 표시용 메타데이터: 그룹·근거·CHECK 사유. 상태(PASS/FAIL/…) 판정은 위에서 이미 끝났고 여기서 바꾸지 않는다.
    const hou = p.landingMax === 2000, own = p.src || '규칙 제15조제2항';
    const META = {
      riser: ['dim', own], tread: ['dim', own], width: ['dim', own],
      'landing-gap': ['dim', hou ? '주택건설기준 규정 제16조제2항제1호' : '규칙 제15조제1항제1호'], 'landing-w': ['dim', hou ? '주택건설기준 규정 제16조제2항제1호' : '규칙 제15조제1항제1호'],
      rail: ['safety', '규칙 제15조제1항제2호'], 'rail-mid': ['safety', '규칙 제15조제1항제3호'], headroom: ['safety', '규칙 제15조제1항제4호'],
      hand: ['safety', '규칙 제15조제4항제2호 (제3항 용도의 주계단·피난계단 한정)'], '2rt': ['plan', '법정 기준 아님 · 건축계획 참고(출처·범위는 자료마다 다름)'],
    };
    out.forEach((c) => {
      const m = META[c.id]; if (m) { c.group = m[0]; c.cite = m[1]; }
      if (c.status === 'N/A' && !c.naKind) c.naKind = p.off ? 'off' : 'nolimit'; // 적용 제외 vs 기준값 없음
      if (c.kind !== '법규' || c.status !== 'CHECK') return;
      c.reasons = [];
      if (p.pending) c.reasons.push({ type: 'input', need: nt.pend, target: nt.target });
      if (c.id === 'width' && p.widthCand) c.reasons.push({ type: 'input', need: '거실 바닥면적 합계를 입력하면 유효너비 기준이 확정됩니다', target: 'floorArea' });
      if (c.id === 'headroom') c.reasons.push({ type: 'model', need: '상부 구조(보·슬래브) 하부 마감면까지의 높이 정보가 모델에 없습니다' });
      if (c.id === 'rail' || c.id === 'rail-mid') c.reasons.push({ type: 'manual', need: railOn ? '난간이 모델에 표시되지만 설치·구조 기준 충족은 모델이 검증하지 않습니다' : '난간 표시가 꺼져 있어 설치 여부를 직접 확인해야 합니다' });
      if (c.id === 'hand') { if (!p.pending && p.handUse == null) c.reasons.push({ type: 'input', need: '건축물 용도를 선택하면 제3항 용도 해당 여부를 판단합니다', target: 'useSearch' }); c.reasons.push({ type: 'manual', need: '주계단·피난계단·특별피난계단에 해당하는지 설계자가 판단합니다' }); }
      if (!p.pending && (p.soft || []).includes(c.id)) c.reasons.push({ type: 'law', need: nt.soft });
      if (!c.reasons.length) c.reasons.push({ type: 'manual', need: '설계자가 직접 확인해야 합니다' });
    });
    return out;
  }

  const api = { PROFILES, calc, checks, profile, rail, layout, overlaps, sliceProfile, toPlan, LANDING_MAX_H, LANDING_MIN_W };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Stair = api;
})(this);
