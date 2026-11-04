// 브이월드(국토교통부) 오픈API로 주소·지번 → 필지 경계를 불러온다. 순수 로직(URL 조립·응답 파싱·좌표 변환)과 브라우저 전용 통신(JSONP)을 나눈다 — 순수 로직은 키 없이 Node에서 시험한다.
// 확인한 사실(2026-10-18, 실제 키로 호출): 검색/데이터 API 모두 JSONP(callback 파라미터)를 지원하고 Referer가 등록한 서비스URL과 맞으면 동작한다(브라우저 fetch의 CORS 헤더는 없음 — JSONP로 우회).
// 배경 지도·항공사진(req/image, basemap=GRAPHIC/PHOTO/PHOTO_HYBRID 등)은 CORS가 열려 있어 <image>로 바로 쓸 수 있다. zoom 허용 범위는 7~18(19는 거부당함, 실제 호출로 확인), size는 1~1024.
// 좌표계는 요청마다 crs=EPSG:4326(경위도)로 고정해 쓴다. 연속지적도(LP_PA_CBND_BUBUN)에는 지목 필드가 없다 — jibun 끝 글자(대/도 등)가 지목처럼 보이지만 법적 접도 판정에 쓰지 않는다(화면에는 참고로만 보여준다).
// 한계(ponytail): 좌표 변환은 선택 필지 중심을 기준으로 한 평면 근사(등장방형)다. 대지 규모(수십~수백m)에서는 오차가 무시할 만하지만, 진짜 측지 투영(TM 등)은 아니다 — 필요해지면 proj4 같은 라이브러리로 바꾼다.
(function (root) {
  const C = typeof module !== 'undefined' ? require('../../00_shared/lib/clipper.js') : root.ClipperLib;
  // ── 기하: MultiPolygon/Polygon → 가장 큰 바깥 고리 하나(구멍·추가 폴리곤은 버리고 경고) ──
  const ringArea = (ring) => { let a = 0; for (let i = 0; i < ring.length; i++) { const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length]; a += x1 * y2 - x2 * y1; } return Math.abs(a) / 2; };
  const signedArea = (ring) => { let a = 0; for (let i = 0; i < ring.length; i++) { const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length]; a += x1 * y2 - x2 * y1; } return a / 2; };
  const ccw = (pts) => (signedArea(pts) < 0 ? pts.slice().reverse() : pts);
  // ── 인접 필지 합치기: 로컬 mm 폴리곤 여러 개를 Clipper union으로 합친다(투영은 호출하는 쪽이 이미 끝냄). 서로 안 붙어 있으면 실패로 보고한다(임의로 가장 큰 조각을 고르지 않음) ──
  // tolMm(기본 150mm): 실제 필지는 두 feature가 "같은 경계선"이라도 각자 독립적으로 투영·반올림되어 공유 꼭짓점이 1mm 단위로 완벽히 일치하지 않는다(지적도 좌표 자체의 오차가 아니라 이 변환 과정의 수치 잡음) —
  // 이 틈을 흡수하려고 먼저 바깥으로 부풀려 union한 뒤 다시 안으로 줄인다(buffer-union-unbuffer). tolMm보다 큰 진짜 틈은 여전히 "안 붙음"으로 잡아낸다.
  function mergeRings(ringsInMm, tolMm = 150) {
    if (!ringsInMm || !ringsInMm.length) return { ok: false, reason: '합칠 필지가 없습니다', parts: 0 };
    if (ringsInMm.length === 1) return { ok: true, outline: ringsInMm[0].slice() };
    const toC = (pts) => pts.map(([x, y]) => ({ X: Math.round(x), Y: Math.round(y) })), fromC = (path) => path.map((p) => [p.X, p.Y]);
    const offsetPaths = (paths, delta) => { const co = new C.ClipperOffset(2, 50), out = new C.Paths(); co.AddPaths(paths, C.JoinType.jtMiter, C.EndType.etClosedPolygon); co.Execute(out, delta); return out; };
    const subject = ringsInMm.map((r) => toC(ccw(r)));
    const expanded = subject.flatMap((p) => offsetPaths([p], tolMm));
    const clipper = new C.Clipper(), unioned = new C.Paths();
    clipper.AddPaths(expanded, C.PolyType.ptSubject, true);
    clipper.Execute(C.ClipType.ctUnion, unioned, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
    const outerExpanded = unioned.filter((p) => C.Clipper.Orientation(p));
    if (outerExpanded.length !== 1) return { ok: false, reason: '필지가 서로 붙어있지 않습니다', parts: outerExpanded.length };
    const shrunk = offsetPaths(outerExpanded, -tolMm).filter((p) => C.Clipper.Orientation(p));
    if (shrunk.length !== 1) return { ok: false, reason: '필지 경계가 복잡해 하나의 모양으로 정리되지 않습니다', parts: shrunk.length };
    return { ok: true, outline: fromC(shrunk[0]) };
  }
  function flattenGeometry(geom) {
    const warnings = [];
    if (!geom || !geom.type || !geom.coordinates) return { ring: null, warnings: ['도형이 없습니다'] };
    const polys = geom.type === 'MultiPolygon' ? geom.coordinates : geom.type === 'Polygon' ? [geom.coordinates] : null;
    if (!polys) return { ring: null, warnings: [`지원하지 않는 도형 종류(${geom.type})입니다`] };
    if (polys.length > 1) warnings.push(`필지가 ${polys.length}개 조각(MultiPolygon)으로 나뉘어 있어 가장 넓은 조각만 가져왔습니다`);
    let best = null, bestA = -1;
    polys.forEach((rings) => { const a = ringArea(rings[0] || []); if (a > bestA) { bestA = a; best = rings; } });
    if (!best || !best[0] || best[0].length < 3) return { ring: null, warnings: [...warnings, '바깥 고리를 찾지 못했습니다'] };
    if (best.length > 1) warnings.push(`필지 안에 구멍(홀)이 ${best.length - 1}개 있어 바깥 경계만 가져왔습니다`);
    return { ring: best[0], warnings };
  }

  // ── 좌표 변환: 경위도 → 로컬 평면 mm(등장방형 근사, 기준점 중심) ──
  function makeProjector(lon0, lat0) {
    const R = 6371008.8, c = Math.cos((lat0 * Math.PI) / 180);
    return {
      lon0, lat0,
      toMm: (lon, lat) => [Math.round(((lon - lon0) * Math.PI) / 180 * c * R * 1000), Math.round(((lat - lat0) * Math.PI) / 180 * R * 1000)],
      fromMm: (x, y) => [lon0 + (x / 1000 / R / c) * (180 / Math.PI), lat0 + (y / 1000 / R) * (180 / Math.PI)],
    };
  }
  const ringCentroid = (ring) => ring.reduce((a, [x, y]) => [a[0] + x / ring.length, a[1] + y / ring.length], [0, 0]);
  // 도로 등 선형 지오메트리: LineString/MultiLineString → 선분들의 배열. Polygon류가 섞여 들어오면 바깥 고리로 대신 처리한다.
  function flattenLines(geom) {
    if (!geom || !geom.type) return { lines: [], warnings: ['도형이 없습니다'] };
    if (geom.type === 'LineString') return { lines: [geom.coordinates], warnings: [] };
    if (geom.type === 'MultiLineString') return { lines: geom.coordinates, warnings: [] };
    if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') { const f = flattenGeometry(geom); return { lines: f.ring ? [f.ring] : [], warnings: f.warnings }; }
    return { lines: [], warnings: [`지원하지 않는 도형 종류(${geom.type})입니다`] };
  }

  // ── 브이월드 URL 조립(순수 함수, 네트워크 없음). callback 자리에는 '__CB__'를 넣어 두고 jsonpCall이 실제 콜백명으로 바꿔 끼운다 ──
  const BASE = 'https://api.vworld.kr/req';
  const qs = (o) => Object.entries(o).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const searchUrl = (key, query, category) => `${BASE}/search?${qs({ service: 'search', request: 'search', version: '2.0', crs: 'epsg:4326', query, type: 'address', category, format: 'json', key, callback: '__CB__' })}`;
  const parcelAtPointUrl = (key, lon, lat) => `${BASE}/data?${qs({ service: 'data', request: 'GetFeature', data: 'LP_PA_CBND_BUBUN', format: 'json', size: 1, page: 1, geometry: true, attribute: true, crs: 'EPSG:4326', key, callback: '__CB__' })}&geomFilter=${encodeURIComponent(`POINT(${lon} ${lat})`)}`;
  // dataId별 주변 조회(실제 호출로 확인한 레이어): LP_PA_CBND_BUBUN=연속지적도(필지), LT_C_SPBD=건물통합정보(건물 외곽, MultiPolygon),
  // LT_C_UPISUQ151=도시계획시설(도로) — 실제 폭이 있는 면형(MultiPolygon, dgm_ar/dgm_lt로 평균폭 계산 가능, 도시계획도로로 지정된 것만). LT_L_SPRD=연속지적 도로 중심선(MultiLineString, 폭 없음, UPISUQ151이 없는 구간의 대체용)
  const featureLayerUrl = (dataId, key, bbox, size) => `${BASE}/data?${qs({ service: 'data', request: 'GetFeature', data: dataId, format: 'json', size: size || 60, page: 1, geometry: true, attribute: true, crs: 'EPSG:4326', key, callback: '__CB__' })}&geomFilter=${encodeURIComponent(`BOX(${bbox.join(',')})`)}`;
  const neighborsUrl = (key, bbox, size) => featureLayerUrl('LP_PA_CBND_BUBUN', key, bbox, size);
  const buildingsUrl = (key, bbox, size) => featureLayerUrl('LT_C_SPBD', key, bbox, size);
  const roadAreasUrl = (key, bbox, size) => featureLayerUrl('LT_C_UPISUQ151', key, bbox, size);
  const roadsUrl = (key, bbox, size) => featureLayerUrl('LT_L_SPRD', key, bbox, size);

  // ── 응답 파싱(순수 함수) ──
  function parseSearchResponse(json) {
    const r = json && json.response; if (!r) return { ok: false, reason: '응답을 읽지 못했습니다' };
    if (r.status === 'ERROR') return { ok: false, reason: (r.error && r.error.text) || '검색 오류', code: r.error && r.error.code };
    const items = (r.result && r.result.items) || [];
    return { ok: true, items: items.map((it) => ({ id: it.id, addr: (it.address && (it.address.parcel || it.address.road)) || '', road: it.address && it.address.road, parcel: it.address && it.address.parcel, bldnm: it.address && it.address.bldnm, lon: +it.point.x, lat: +it.point.y })) };
  }
  // 범용 feature 파싱: ERROR(NOT_FOUND는 빈 결과) / features[].{properties, geometry}. 레이어마다 속성 이름이 달라 가공하지 않고 그대로 둔다.
  function parseFeatures(json) {
    const r = json && json.response; if (!r) return { ok: false, reason: '응답을 읽지 못했습니다' };
    if (r.status === 'ERROR') { if (r.error && r.error.code === 'NOT_FOUND') return { ok: true, features: [] }; return { ok: false, reason: (r.error && r.error.text) || '조회 오류', code: r.error && r.error.code }; }
    const feats = (r.result && r.result.featureCollection && r.result.featureCollection.features) || [];
    return { ok: true, features: feats.map((f) => ({ properties: f.properties || {}, geometry: f.geometry })) };
  }
  function parseParcelResponse(json) { // 필지(점 조회): pnu/jibun/addr을 꺼내 둔다. 내부적으로 parseFeatures와 같은 응답 모양을 쓴다.
    const r = parseFeatures(json); if (!r.ok) return r;
    return { ok: true, features: r.features.map((f) => ({ pnu: f.properties.pnu, jibun: f.properties.jibun, addr: f.properties.addr, geometry: f.geometry })) };
  }

  // ── JSONP 통신(브라우저 전용, <script> 태그 — fetch의 CORS 제한을 받지 않는다) ──
  function jsonpCall(buildUrlWithPlaceholder, timeoutMs) {
    if (typeof document === 'undefined') return Promise.reject(new Error('브라우저에서만 호출할 수 있습니다'));
    return new Promise((resolve, reject) => {
      const cb = `__vwcb${Date.now()}_${Math.floor(Math.random() * 1e6)}`, url = buildUrlWithPlaceholder(cb).replace('__CB__', cb);
      const cleanup = () => { delete window[cb]; if (sc.parentNode) sc.remove(); clearTimeout(t); };
      const t = setTimeout(() => { cleanup(); reject(new Error('응답 시간이 초과됐습니다(브이월드)')); }, timeoutMs || 8000);
      window[cb] = (data) => { cleanup(); resolve(data); };
      const sc = document.createElement('script'); sc.src = url;
      sc.onerror = () => { cleanup(); reject(new Error('브이월드 호출에 실패했습니다(키·네트워크를 확인하세요)')); };
      document.head.appendChild(sc);
    });
  }

  // ── 클라이언트: provider 인터페이스. 시험에서는 jsonpCall을 fixture 함수로 바꿔 끼운다 ──
  function VWorldClient(key, opt = {}) {
    const call = opt.jsonpCall || jsonpCall;
    return {
      searchAddress: (query, category = 'road') => call(() => searchUrl(key, query, category)).then(parseSearchResponse),
      getParcelAtPoint: (lon, lat) => call(() => parcelAtPointUrl(key, lon, lat)).then(parseParcelResponse),
      getParcelsInBbox: (bbox, size) => call(() => neighborsUrl(key, bbox, size)).then(parseParcelResponse),
      getBuildingsInBbox: (bbox, size) => call(() => buildingsUrl(key, bbox, size)).then(parseFeatures),
      getRoadAreasInBbox: (bbox, size) => call(() => roadAreasUrl(key, bbox, size)).then(parseFeatures),
      getRoadsInBbox: (bbox, size) => call(() => roadsUrl(key, bbox, size)).then(parseFeatures),
    };
  }

  const api = { flattenGeometry, flattenLines, makeProjector, ringCentroid, ringArea, mergeRings, searchUrl, parcelAtPointUrl, neighborsUrl, buildingsUrl, roadAreasUrl, roadsUrl, parseSearchResponse, parseParcelResponse, parseFeatures, VWorldClient, jsonpCall };
  if (typeof module !== 'undefined') module.exports = api; else root.SiteProvider = api;
})(this);
