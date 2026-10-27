# 지하주차 계획 계산 결과 연결 명세

2026-10-26 · Codex 99차. 기존 `ug-plan/0.5`에 선택 입력과 결과 필드를 추가했다. 좌표·치수는 mm, 면적 결과는 ㎡다. 브라우저는 `UGPlan`, Node는 `01_src/plan/CLAUDE_ugp_plan.js`를 사용한다.

## 1. 입력과 처리 순서

기존 `mass`, `ucs`, `cores`, `ramp`, `grid`, `phase`, `floorMm` 계약을 유지한다. 주차 본체로 격자·차로를 만들고, 점유물과 직접 지정 영역을 제외한 뒤 칸을 배치한다. 검사에서 유효한 칸을 대상으로 종류별 할당 → 실제 치수 변경 시 재검사 → 잔여영역 분할 → 영역 충돌 검사를 거친다. 새 기능 때문에 전체 배치 방식을 교체하지 않는다.

| 입력 | 의미 |
|---|---|
| `parkingMass` 또는 기존 `mass` | 구조격자와 주차열의 기준 본체. 단일 단순 다각형. |
| `massHoles` | 본체 안 구멍의 다각형 목록. 주차 실내 계산에서는 구멍 주위의 외벽 두께도 제외한다. |
| `allowExternalRamp` | 기본은 곡선램프만 외부 돌출 허용. 직선 외부 램프는 명시적으로 `true`를 주어야 한다. |
| `floorBoundary` | 선택적인 실제 층 외곽. 주면 램프를 자동으로 합친 외곽 대신 이것을 사용한다. |
| `allowedBoundary` | 별도로 주어진 대지·굴착 등 허용 경계. 램프를 합친 전체 층 외곽을 이 안에서 검사한다. |
| `nonParkingZones` | 직접 지정한 `{id, kind:'da'|'pit'|'keep', paths}` 목록. 경로의 바깥선은 양의 방향, 구멍은 음의 방향이다. `da/pit`는 배치 제외, `keep`은 자동 분류만 막고 바닥을 유지한다. |
| `zoneAssignments` | 자동 제안의 용도 변경 `{id,kind,paths}` 목록. 최종 칸 배치 뒤 같은 ID·같은 형상의 제안에만 적용한다. 칸 배치 전의 직접 예약영역과 구분한다. |
| `autoZones` | 기본 `true`. `false`면 직접 지정 영역만 사용한다. |
| `zoneSettings` | `{daDepthMm:3000, minAreaM2:0.5}` 기본. 외벽 접촉 길이 2m 이상인 띠를 DA, 남은 4㎡ 이상·폭 여유가 있는 조각을 PIT 제안으로 분리한다. |
| `parkingOptions` | 아래 종류별 최소 목표. 기본 해제이며 기존 장애인 설정은 호환한다. |

`planningBoundary` 출력의 `parkingPaths`는 본체와 구멍, `floorPaths`는 램프까지 합친 실제 층 외곽이다. `floorMass`는 기존 단일 외곽 화면용이다. 구멍·분리 여부를 검사할 때는 반드시 `floorPaths`를 사용한다. `joined`는 램프 몸체가 본체 밖으로 확장된 경우의 표시용 값이며, 접속 합격을 뜻하지 않는다. 접속은 `disconnected`, 최종 `graph.rootId/hasLoop`와 위반 목록으로 판단한다. 단순 합집합이나 볼록 외곽만으로 연결 성립을 보장하지 않는다.

`UGPlan.planningBoundary(input,ramp)`를 독립 호출할 수 있다. 방향을 정규화하고 구멍을 유지한다. 본체와 떨어진 램프는 별도 바깥 조각으로 검출한다. 본체 밖 램프를 허용해도 기둥·코어 충돌과 착지 연결 검사는 유지한다.

101차부터 사용자 화면은 직선·곡선 모두 `allowExternalRamp:true`를 명시해 전달한다. 기존 계산 API의 생략 시 동작은 호환을 위해 유지한다. 원시 직선 입력도 외곽 표시 시 공통 직선 생성기로 몸체를 만들고, 최종 외곽은 실제 배치 결과를 사용한다. 외부 금지 `false`와 별도 `allowedBoundary`는 계속 적용한다. 화면 맞춤에도 직선 몸체를 포함한다.

## 2. 주차 종류와 수량

```js
parkingOptions: {
  accessible: {mode:'ratio', value:0.03, rounding:'ceil'},
  compact:    {mode:'count', value:3},
  expanded:   {mode:'count', value:2},
  electric:   {mode:'ratio', value:0.05, rounding:'round'},
  charging:   {mode:'count', value:2},
  family:     {mode:'count', value:2},
  women:      {mode:'off'}
}
```

`ratio`의 값은 0–1, `count`는 0 이상 정수다. 전부 **최소 목표**다. 치수가 바뀌는 종류는 구조 한 구간의 칸을 함께 바꾸므로 목표보다 많아질 수 있으며 `excess`로 전달한다. 변경 가능한 자리가 없으면 부족 수량을 그대로 남긴다.

- 치수: `stallType:'normal'|'expanded'|'compact'|'accessible'`. 기본 일반 2500×5000, 확장 2600×5200, 경형 2000×3600, 장애인 3300×5000mm. 특수 치수 변경은 `stallModules`로 주되 할당기에서 기본 최소 치수보다 작게 만들지 않는다.
- 목적: `uses:['electric','charging','family','women']`. 충전은 친환경차 전용에도 포함된다. 한 칸의 목적이 여러 개여도 물리 대수는 한 번 센다.
- 목적 기본 대상은 일반·확장형이며 `allowedTypes`로 조정한다. 충전/친환경차 이외의 목적 중복은 기본 허용하지 않고 항목의 `allowOverlapWith`로 명시한다.
- `rounding:'ceil'|'round'|'floor'`를 항목별로 적용한다. 기본 친환경차 전용은 반올림, 나머지는 올림이다. 충전 등 사업별 기준이 다른 항목은 실제 기준을 `rounding`과 비율에 명시한다. 전국 공통 적용비율을 자동 추정하지 않는다.
- 기본 산정 모수는 최종 물리 대수다. `basisTotal`로 사업 전체 모수, `minTotal`로 적용 시작 대수, `minimum`으로 하한을 지정할 수 있다.
- 장애인 **비율** 목표의 기본 적용 시작은 10대, 직접 **대수** 목표는 0대다. 기존 `accessibleRate`, `accessible:false`를 호환한다. `parkingOptions.accessible`를 명시하면 새 규칙이 우선한다. 기존 기본 3%는 실제 맞춰 넣은 코어 출입구가 있는 경우에만 이어받는다.
- 장애인 칸은 출입구 근접·차로 교차 적은 위치를 우선한다. 출입구가 없으면 배치했다고 꾸미지 않고 부족 수량을 보고한다. `accessStatus:'proximity-only'`는 접근 적합성 검증 완료가 아니다.

칸 크기 초기값 근거는 [주차장법 시행규칙 제3조](https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0003&lsiSeq=288421&urlMode=lsScJoRltInfoR), 친환경차 전용의 끝수 처리 구분은 [친환경자동차법 시행령 제18조의6](https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029889757)을 참고했다. 자동 적용 여부까지 판정하는 기능은 아니다.

## 3. 결과 필드

| 결과 | 화면에서 사용할 때 |
|---|---|
| `stalls`, `stallCount` | 최종 물리 칸과 대수. `stallType`으로 칸 크기 기호, `uses`로 목적 기호를 그린다. |
| `report.stallState` | 최종 `stalls`와 같은 순서·길이. 최종 치수로 검사한 상태다. |
| `placementReport` | 할당 전 후보 검사. 배치에서 버린 칸의 원인을 조사할 때만 사용한다. |
| `lost`, `lostCount` | 검사에서 제외한 후보의 도형·대수. 크기 변경에 따른 대수 증감은 `allocationDelta`로 별도 전달한다. |
| `parkingSummary` | `total`, `dimensions`, `uses`, `requirements`. 항목별 `need/placed/short/excess/rounding/basisTotal/source`를 같이 표시한다. |
| `allocationChanges` | 치수를 바꾼 구조 구간과 전·후 대수. |
| `nonParkingZones` | `{id,kind,paths,areaM2,source,status}`. 직접 지정 `source:'input',status:'planning'`, 자동 제안 `source:'auto',status:'proposal'`. |
| `parkingInnerPaths` | 구멍 주위 벽까지 제외한 주차 본체의 실내 영역. |
| `parkingSurface` | 위 영역에서 DA·PIT를 제외한 바닥. 칸·차로·코어를 포함하며 순수 주차칸 면적이 아니다. |
| `unassignedFree` | 자동 DA·PIT로 쓰지 않은 남은 공간. |
| `keptZones`, `unmatchedZoneAssignments` | 자동 제안을 바닥 유지로 바꾼 영역, 형상이 달라져 적용하지 못한 분류 ID. 오래된 ID로 새 영역의 용도를 바꾸지 않는다. |
| `areas` | `floorEnvelopeM2`, `innerM2`, `parkingSurfaceM2`, `nonParkingM2`, `daM2`, `pitM2`, `keptFreeM2`, `unassignedFreeM2`. `parkingSurfaceM2 + nonParkingM2 = innerM2`. `keptFreeM2`는 유지로 지정한 잔여이며 미분류와 구분한다. |
| 기존 `dry`, `leftover` | 기존 화면 호환용, 분류 전 잔여. 새 DA·PIT를 그릴 때 이것을 다시 전부 해칭하지 않는다. |
| 기존 `innerAreaM2`, `perStallM2` | DA·PIT를 분류하기 전 본체 실내 면적 기준을 유지한다. 분류만으로 대당 효율이 좋아 보이게 바꾸지 않는다. |

영역 입력의 중복 ID·DA/PIT 상호 겹침은 입력 오류다. 배치와 겹치거나 본체 밖인 영역은 `ZONE_CONFLICT/ZONE_OUTSIDE`로 남긴다. 자동 영역은 실제 남는 공간에서 계산하며, 회전·mm 반올림 시 기둥 구멍이 사라지지 않게 여러 꼭짓점으로 부모 영역을 찾는다.

자동 DA↔PIT↔유지 분류는 `zoneAssignments`로 변경한다. 장애인 등 넓은 칸으로 바꾼 뒤 생긴 빈 영역을 다음 계산의 일반 칸 배치부터 잘라내면 불필요한 대수 감소가 생길 수 있기 때문이다. 용도 변경은 최종 칸 도형과 대수를 그대로 보존하며, 바닥 유지 선택은 비주차 면적에서 제외한다. 형상의 대칭차가 0.01㎡를 넘으면 새 영역에 옛 분류를 적용하지 않고 `unmatchedZoneAssignments`에 남긴다. 화면은 재지정 또는 해당 분류 해제를 제공한다. 위상 후보 점수 비교에는 분류를 넣지 않는다.

## 4. 코어 구성 변경

`UGPlan.configureCore(core,ev,layouts)`는 기존 상자를 줄이지 않고, 선택 구성에서 법규 실패가 아닌 안이 들어가도록 최소한 커진 상자를 반환한다. `ev`는 `'auto'|1|2|3|4`, `layouts`는 기존 코어 생성기의 요약 목록이다. 가능한 크기가 없으면 `configurationFits:false`다. 실제 위치·안 선택은 `generate`가 수행한다. 결과에 코어 `plan`이 없을 때 임의의 다른 승강기 도면을 그리면 안 된다.

코어 바깥선은 접하는 기둥 바깥면을 기준으로 잡고, 돌출 수를 우선 줄인다. 완전히 맞지 않는 경우 `CORE_COLUMN_PROTRUDES`를 남긴다. 주어진 작은 상자에서 선택 구성 자체를 못 넣으면 `CORE_CONFIG_MISSING`이다. 벽과 기둥 정렬이 계단이나 승강로 내부를 임의로 늘리는 방식이 되지 않게 기존 홀 확장 방식은 유지한다.

화면의 구성 변경 두 경로가 이 함수를 사용한다. 저장되는 도면에는 코어 안 목록을 복사하지 않는다. 목록은 `ev:층고`별로 캐시하며 곡선램프의 `upperLevelMm-lowerLevelMm`를 코어 계단에도 사용한다. 새 격자 키는 본체·UCS·모듈이며 예전 5개 항목 키의 앞 세 값이 같으면 저장 위상을 이어받는다.

## 5. 램프 검토와 차량 동선

`rampReview` 또는 `UGPlan.rampReview(evaluation,rampId)`는 각 항목의 `title`, `state`, `explanation`, `evidence`, `reason`을 준다. 상태는 `ok/change-needed/input-needed/not-required`다. 표시 제목에 검사 코드를 쓰지 않아도 되며 상세에는 코드와 근거를 남길 수 있다. 이 요약을 성립 판정 대신 사용하지 않는다. 성립은 같은 램프·고정 요소로 얻은 검사 결과가 모두 있고 통과했는지 확인하는 기존 증거 비교를 유지한다.

곡선 생성기의 검사 후보 `candidateRamp.bodyReference:'outer'`는 벽 바깥선을 포함한 몸체임을 명시한다. G07은 이 경우 벽 두께를 빼기 전 물리적 층 외곽과 비교한다. 값이 없거나 `'inner'`인 기존 후보는 종전 실내 경계를 사용한다. 생성기 후보 도형은 다른 계획 도형과 같은 정수 mm 좌표로 전달한다. 일반 판정의 허용오차를 넓히지 않는다.

```js
const routes = UGPlan.inspectVehicleRoutes(plan);
// routes.entry / routes.exit:
// points, colorKey, state, stopDistanceMm, firstIssue, samples, vehicle
const custom = UGPlan.checkVehiclePath(plan, points, {
  lengthMm:4600, widthMm:1900, sampleMm:500
});
```

계산은 호출할 때만 실행한다. 진입·진출은 곡선램프의 서로 다른 차로와 제안된 일방 순환 경로를 잇는다. `colorKey:'entry'|'exit'`를 기존 키컬러에 대응시킨다. 상태는 `clear/blocked/unconnected`, 첫 문제에 위치·차체 도형·이유가 있다. `blocked`는 `stopDistanceMm`에서 멈추고 문제 위치를 강조할 수 있다.

검사 범위는 `scope/verification:'planar-body-samples'`다. 500mm 간격으로 차체 사각형을 실제 차로·램프 안에 놓고 기둥·코어·점유물과 비교하며, 램프 밖에서는 도달한 그래프 구간인지도 확인한다. 차체가 경로에 완전히 들어오는 중심 위치, 즉 시작·끝에서 차체 반 길이를 뺀 구간을 검사한다. 연속 조향 궤적·후진·교행 검사 결과로 표시하지 않는다. 도면의 자동차 기호와 점선 애니메이션 자체는 별도 화면 작업이다.

102차 보완: `scope/verification`은 `planar-body-samples-and-turn-window`다. 4,712mm 안의 진행 방향 변화도 검사하며 `VEHICLE_SHARP_TURN`에 위치·각도·거리·정지 위치를 준다. 계획 기준은 90°이며 반올림된 좌표의 판정 여유 0.5°를 둔다. 각 꼭짓점만 따로 검사하거나 곡선램프 전체 누적 회전을 제한하지 않는다. 합류가 불합격이면 `RAMP_APPROACH`로 정지시킨다. 남은 급한 순환 골격은 `RING_SHARP_TURN`이며 반경만 작은 표시와 구분한다. 안전한 연결 형상 생성까지 모두 완료된 상태는 아니다. 후속 구현 담당은 Claude다.

## 6. 연결 파일과 확인

브라우저에서는 `geom` 다음에 경계·영역 계산을, `stall-modules` 다음에 할당기를 로드한다. `verify`는 경계 계산 뒤에, `plan`은 모든 계산 모듈 뒤에 로드한다. 실제 순서는 `underground-compare.html`을 따른다. `planInput`은 본체를 그대로 넘기고, 검사기에만 램프를 포함한 층 외곽을 전달한다.

새 회귀 시험은 `02_tests/planning-backend.test.cjs`다. 계산 수정 기록은 [99차 보고](../../리뷰용/02_GPT_작성/99_지하주차_계산배치수정_2026-10-26/00_보고.md), 화면 연결과 실제 조작·캡처는 [100차 보고](../../리뷰용/02_GPT_작성/100_지하주차_화면연결완료_2026-10-26/00_보고.md)에 있다. `zoneSettings/floorBoundary/stallModules`는 선택적인 직접 계산 입력이며 현재 화면에서 별도 편집창을 노출하지 않는다.
