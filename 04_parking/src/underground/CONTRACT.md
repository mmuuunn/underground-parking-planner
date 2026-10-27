# 지하주차 계획모델 — 단계 0 계약 문서

- 상태: **v1.1.9 (2026-10-24, 사용자 결정: 외곽 다각형 부분 겹침은 G01 입력 오류)**. 단계 1B 종료 전 마지막 입력 규칙 보완. 12-12 참조.
- 이전 상태: v1.1.8 (2026-10-24, outer 외곽 회전 반례 반영: G06 거리 경계를 inner·outer 같은 방식으로 계산).
- 이전 상태: v1.1.7 (2026-10-24, 54차 반례 반영: G06 간격 계산의 좌표 기준 통일).
- 이전 상태: v1.1.6 (2026-10-24, 52차 검토 반례 2건 반영). G06 abutting 1mm 경계 포함, G07 램프 입력 id 중복은 입력 오류. 12-9 참조.
- 이전 상태: v1.1.5 (2026-10-24, 50차 검토 후 사용자 결정 반영). G07 지상 도로 접속 구간 선언, candidate 모드 외곽 누락은 MISSING_INPUT(1A 시험 3개 기대값 정정), G06 걸침·abutting 범위. 12-8 참조.
- 이전 상태: v1.1.4 (2026-10-24, 사용자 결정 반영). v1.1.3 위에 12-6의 사용자 결정(지하 부설 8대 이하, 평행주차 치수, 판본 공백 제거, systemId 형식 오류)을 반영했다. 수치 변경은 평행주차 치수 수록뿐이다(ALRIS 조회와 사용자 확인 결정). 7-4는 이전 대조의 감사 기록이다.
- 현재 구현: Claude가 v1.1.3 단계 1A를 구현했고(리뷰용/01_클로드_작성/46차), Codex 읽기 전용 검토(리뷰용/02_GPT_작성/48차)는 **수정 후 재검토**(systemId 형식 오류 반례)였다. v1.1.4 반영 구현은 다시 검토를 받아야 한다.
- 다음 작업: v1.1.4 구현에 대한 다른 모델의 읽기 전용 재검토. 단계 1B 진입 조건은 11-6이다.
- 최초 작성: Claude (Sonnet 5.5). v1.1.3 정정: 1-5a·1-9·4-1 집계 규칙·5-5는 이전 상위 계약 세션(머리말 기록상 Codex 상위 계약 검토, 도중 중단), 나머지(5-2 정리, 6장 표, 7-5, 10장 시험, 11-6, 12-5)는 Claude Opus 5.5가 마무리, 2026-10-24. 마무리분은 다른 모델의 교차검토를 받지 못했다(12-5).
- 근거: 42차 모델 디자인 크리틱, 43차 인계서, 사용자 승인 지시(2026-10-24), v0.4 엔진 코드 직접 확인, 도면 3장 직접 열람
- 소유권: 구현·통합은 Codex. 상위 모델은 계약·독립 심사, Claude는 맥락·도면 독립 검토. 종전 Fable 시험 위임 계획은 현 작업 지시가 아니다(11장).
- 이 문서가 하지 않는 것: 코드 수정, 시험 추가, 커밋, 도면의 데이터 변환

## 0. 읽는 법과 용어

| 용어 | 뜻 |
|---|---|
| 후보 | 생성기가 만든 한 장의 배치안(주차칸·차로·램프·기둥 등 실제 도형) |
| 판정기 | 후보와 입력만 받아 항목별로 검사하는 별도 모듈. 생성기의 말을 믿지 않는다 |
| 항목 | 판정기가 보는 가장 작은 단위. 예: 램프 폭, 램프 경사 |
| 영역 | 항목 묶음. 도형(G) / 램프·단면(R) / 차량(V) / 구조(S) / 보행·코어(P) / 법규·종류(L) |
| 규칙 데이터 | 법규·조례·사업지침 수치를 출처와 함께 담은 데이터 파일. 코드 상수가 아니다 |
| 탐색 결과 | 여러 후보를 찾는 과정 전체의 결과. 후보 한 장의 판정과 구분한다 |

길이 단위는 모두 mm. 좌표계는 도면 좌표(원점·회전은 입력에 기록). 수치 비교의 허용오차는 제안값을 쓰되(8장) 항목별로 명시한다.

## 1. 입력 데이터와 필수·선택

표기: **R** 필수(없으면 입력 오류), **C** 조건부 필수(해당 기능을 쓸 때), **O** 선택(없으면 관련 항목이 확인 불가).

### 1-1. 층 기본 (PlanningInput.floor)

| 필드 | 구분 | 설명 |
|---|---|---|
| floor.id, floor.levelMm | R | 층 이름, 이 층 바닥 높이(상대) |
| floor.outline | R | 지하 구조물 안쪽 면 다각형 목록. 여러 영역과 내부 구멍 허용. **바깥면인지 안쪽 면인지 outline.kind에 명시**(inner/outer). outer이면 wallMm가 필요(C). 형식(v1.1.5): `{kind:'inner'|'outer', polygons:[[[x,y],…],…]}`, 겹친 다각형은 짝홀 규칙으로 구멍. (v1.1.9) 다각형끼리의 관계: 부분 겹침(겹친 면적이 100mm² 초과이면서 작은 쪽 면적 − 100mm²보다 작음)은 G01 입력 오류이며 두 다각형 경로를 모두 근거에 남긴다. 완전 포함(구멍), 경계선·꼭짓점 접촉(겹친 면적 ≤ 100mm²), 서로 떨어진 여러 영역은 허용. 입력 외곽을 합치거나 잘라 보정하지 않는다. candidate 모드에서 미입력이면 MISSING_INPUT(1-9), 잘못된 형식이면 INPUT_ERROR |
| floor.wallMm | C | 외벽 두께. outline.kind가 outer일 때 필수 |
| floor.heightMm | O | 층고(바닥에서 위층 바닥까지). 없으면 램프 경사·유효높이는 확인 불가 |
| floor.clearHeightMm | O | 보·설비 아래 실제 유효높이 |

### 1-2. 사업 조건 (PlanningInput.project) — 전부 선택, 없으면 해당 법규 항목은 확인 불가

| 필드 | 설명 |
|---|---|
| project.jurisdiction | 'KR' 또는 'KR+SEOUL'. 첫 지원 범위는 이 둘 |
| project.permitDate | 허가 기준일(법규 판본 선택용) |
| project.facilityUse | 시설 용도(부설 적용 여부 판단용) |
| project.parkingKind | 'noeoe'(노외) / 'buseol'(부설) / 'unknown' |
| project.totalRequiredStalls | 법정·사업 요구 총 산정대수(전 층 합). 종류별 요구량(L02)과 요구 대수 충족(L05)에 쓴다. **50대 기준(램프·출입구)에는 쓰지 않는다**(아래 두 필드). 생성된 칸 수에서 거꾸로 만들지 않는다 |
| project.parkingLots[] | {id, totalStalls, kind?} 주차장 단위와 그 주차장의 **전체 주차대수 합계**. 사용자가 명시적으로 입력한다. 생성 결과의 주차칸 수, 층별 대수로 역산하지 않는다 |
| project.rampSystems[] | {id, lotIds[]} **같은 경사로를 이용하는 주차장들의 묶음**. 50대 기준은 이 묶음에 속한 주차장들의 totalStalls 합계다(법제처 해석례 24-0568). 서로 독립된 주차장·램프 체계가 여럿이면 체계마다 따로 만들고 ID로 구분한다. 여러 체계가 한 주차장을 공유하는 경우도 lotIds로 표현한다 |
| project.requiredByType | 종류별 요구 대수(장애인 등). 없으면 규칙 데이터 비율×totalRequiredStalls로 계산(근거 대수가 있을 때만) |
| project.stallDefaultType | 종류 미지정 칸의 **명시적 기본값**. 없으면 미지정 칸은 종류 확인 불가 |
| project.guidelines | 적용 사업지침 목록(예: 발주처 공모지침). 법규와 별도 이름표로 평가 |

### 1-3. 고정 요소 (PlanningInput.fixed) — 이동·삭제 불가

| 필드 | 구분 | 설명 |
|---|---|---|
| fixed.columns[] | O | {id, polygon, source:'existing'/'upper'/'given'} 기존·상부 기둥·내력벽 |
| fixed.cores[] | O | {id, polygon, relation, doors[], hall} 코어. relation은 아래 1-3a |
| fixed.reservedZones[] | O | {id, polygon, role:'mep'/'da'/'escape'/'service'/'other'} 설비·DA·피난·서비스 예약영역 |
| fixed.entrances[] | O | 지상·도로로 직접 나가는 차량 출입구 {id, polyline, widthMm, separated?, systemId}. systemId는 제4호 50대 기준에 쓰는 램프 체계 ID |

**1-3a. 코어 관계(core.relation)**: 'inside'(이 층 계획영역 안), 'abutting'(영역과 접한 외부 코어), 'external-separate'(영역 밖 별도 코어), 미선언. 미선언이면 판정기가 위치만 보고 판단하되, 영역 밖이면 **입력 오류**로 돌려준다(법규 위반이 아님).

### 1-4. 램프 (PlanningInput.ramps[])

기존 v0.4 입력의 ramp(위치·각도·폭·길이/반경·회전각)는 평면 도형용으로 그대로 받는다. 아래는 계약에서 추가하는 필드.

| 필드 | 구분 | 설명 |
|---|---|---|
| ramp.id, ramp.shape | R | v0.4 형식(직선/곡선 + 기하값) |
| ramp.operation | O | 'oneWay' / 'twoWay'. 없으면 차로 수 분기가 갈린다(5장 분기 규칙) |
| ramp.lanes | O | 1 또는 2. operation에서 유도할 수 있으면 생략 가능 |
| ramp.separatedInOut | O | 진입·진출 분리 여부 |
| ramp.systemId | C | 이 램프가 속한 램프 체계 ID(project.rampSystems[].id). 50대 기준 판정에 필요. 없고 결과가 대수에 따라 갈리면 확인 불가(BRANCH_DIVERGES) |
| ramp.section | C | 램프 단면(폭·연석). 법령상 차로 너비 판정(R01)과 연석 판정(R09)에 필요. 아래 1-4a |
| ramp.segments[] | O | {id?, kind:'straight'/'curve'/'transition', lengthMm, startLevelMm, endLevelMm}. evidence의 구간 표시는 id가 있으면 id, 없으면 배열 순서 번호(0부터). 구간별 경사 판정의 근거 |
| ramp.connects | O | {upperLevelMm, lowerLevelMm, upperFloorId, lowerFloorId} 상하층 접속과 실제 고저차 |
| ramp.roadConnection | O | 도로 접속부 {distanceFromRoadMm, segment, outsidePolygon?}. outsidePolygon(v1.1.5)은 외곽 밖에 놓이는 지상 도로 접속 구간의 평면 다각형(도면 좌표). G07에서 램프 몸체의 외곽 밖 부분은 이 다각형 안에서만 허용한다 |
| ramp.measurement, ramp.assumptions | O | (곡선 램프 계약 v0.2 7장) 생성기가 선언한 측정 기준(radiusReference·widthReference·gradeReference 등)과 가정 목록. 판정기는 숫자 판정에 쓰지 않고 그 램프의 R01·R02·R03·R04·R09 evidence에 `measurement`, `rampAssumptions`로 옮겨 적기만 한다. 없으면 아무 것도 하지 않는다(기존 결과 불변) |

**범위(v1.1.3, 사용자 결정):** 이 모델의 램프는 모두 자동차 경사로다. 이륜자동차 전용 경사로는 다루지 않으며 입력 필드도 두지 않는다. 판정기는 이륜 전용 반경 규칙(`kr.rule6.p1.5.motorcycle-curve-inner-radius`, 3m)을 쓰지 않는다. 이 레코드는 원문 기록으로 남겨 두되 판정에 연결하지 않는다. 범위 밖은 **경사로만**이다. 이륜자동차 전용 주차칸(`kr.rule3.p1.2.motorcycle`)은 L01에서 계속 쓴다.

### 1-4a. 램프 단면: 법규 폭, 연석, 차량 통과 폭의 구분

법령상 차로 너비를 충족하는 것과 실제 차량이 곡선부를 통과하는 것은 **별도 판정**이다. 입력도 개념별로 나눈다.

| 필드 | 뜻 | 쓰이는 판정 |
|---|---|---|
| ramp.section.legalLaneWidthMm | **법령상 차로 너비.** 연석 부분을 포함한 너비(제6조제1항제5호 다목: 연석 부분은 차로의 너비에 포함) | 법규 R01 |
| ramp.section.wallToWallMm | 벽 사이 전체 너비 | R01 보조(하한 판단) |
| ramp.section.wallToCurbMm | {left, right} 각 벽면에서 연석 설치 지점까지의 거리. 법은 30cm 이상을 요구한다. **연석 자체의 폭이 아니다** | 법규 R09, R01 계산 |
| ramp.section.curb | {left:{heightMm, widthMm}, right:{heightMm, widthMm}} 연석 높이와 **연석 자체의 가로폭**. 법은 높이만 정하고 가로폭은 규정하지 않는다 | 높이는 R09, 가로폭은 V06 |
| ramp.section.vehiclePassableWidthMm | 연석 안쪽 실제 차량 통과 가능 폭. 직접 입력하거나, 법령상 차로 너비에서 좌우 연석 가로폭을 뺀 값으로 계산(가로폭이 둘 다 있을 때만) | 차량 V06 |

법령상 차로 너비를 정하는 순서(R01)
1. legalLaneWidthMm가 있으면 그 값을 쓴다.
2. 없고 wallToWallMm와 wallToCurbMm(좌우)가 있으면 wallToWallMm에서 좌우 wallToCurbMm를 뺀 값이다(연석 부분은 차로 너비에 포함되므로 연석 가로폭은 빼지 않는다).
3. wallToWallMm만 있으면 법령상 차로 너비를 정할 수 없다. 법령상 차로 너비는 벽 사이 전체 너비를 넘을 수 없으므로 전체 너비가 기준 미만이면 실패이고, 기준 이상이면 **확인 불가**(연석 위치·단면 입력 필요). 충족을 임의로 확정하지 않는다.
4. 연석 가로폭은 법규 상수가 아니다. 규칙 데이터에 넣지 않고 실제 표준상세나 프로젝트 기준에 따른 **설계 프리셋**(project.presets.curb)으로 둔다.
5. 판정기는 입력을 수정하거나 보정하지 않는다. 공간이 모자랄 때 연석 폭을 줄여 통과시키지 않고, 필요한 폭을 확보하지 못하면 실패 또는 확인 불가로 돌려준다.
6. wallToCurbMm의 기준점(연석의 어느 쪽 끝)은 도면 입력이 정한 값을 그대로 쓴다. 남은 정의는 12-4의 2번 참조.

### 1-5. 주차칸 요구(PlanningInput.stalls)

| 필드 | 설명 |
|---|---|
| stalls.orientation | 'perpendicular'(직각)/'parallel'/'angled'. 규칙 표 선택용. 후보에 칸별로 있으면 후보가 우선 |
| stalls.typeMix | 종류별 목표 구성 {general, expanded, compact, accessible, ev, ...}. 선택 |
| stalls.items | **단계 1A 수치 시험 전용** 배열. {id, widthMm?, depthMm?, declaredType?, orientation?}. 아래 1-5a의 명시적 시험 모드에서만 읽는다 |

### 1-5a. L01 수치 시험과 정규 후보의 경계 (v1.1.3)

- `options.mode`는 `candidate`(기본값) 또는 `numeric-test`다. stalls.items를 읽는 1A 시험(T1A-14–20·35·36·59(e)·61·62(b)(c))은 numeric-test를 명시한다. 그 밖의 1A 시험은 모드를 쓰지 않아도 된다(기본 candidate). 입력의 `stalls.items`가 있다는 이유로 자동 전환하지 않는다.
- numeric-test는 도형이 없는 비교 로직 단위시험이다. L01은 stalls.items의 수치를 비교하고 `evidence.measurementSource:'declared-test-values'` 및 `evidence.geometryVerified:false`를 기록한다. candidate.geometry.stalls는 읽지 않는다. 결과 `overall.mode`에 모드를 기록하며, 이 모드의 실제 evaluate 결과는 항상 grade:null이다(입력 오류·실패 집계는 그대로 유지).
- candidate 모드의 L01은 Candidate.geometry.stalls의 polygon에서 실제 폭·깊이를 측정해야 한다. 1A에서는 이 측정이 미구현이므로 L01은 NOT_IMPLEMENTED다. stalls.items나 generator의 폭으로 대체하지 않는다. 측정은 1B 작업이며 이번 수정 구현에는 넣지 않는다.
- 두 경로는 비교 함수만 공유할 수 있다. 숫자를 직접 받았다는 사실을 `independence.recomputed`에서 도형 재측정으로 표시하지 않는다.
- 방향 우선순위: 선택된 경로의 칸별 orientation → input.stalls.orientation. 둘 다 없으면 MISSING_INPUT(임의 직각주차 금지). parallel은 현 규칙 상태상 RULE_UNVERIFIED다. perpendicular/angled는 비평행 치수 표를 사용한다. 잘못된 열거값은 INPUT_ERROR다.
- 종류 우선순위: 선택된 경로의 declaredType → project.stallDefaultType. 둘 다 없으면 OPEN_BRANCH_SET. 폭·깊이 일부 누락은 MISSING_INPUT, 주어진 값의 형식 오류는 INPUT_ERROR다. 빈 칸 목록은 MISSING_INPUT이며 빈 목록의 치수 검사를 통과로 세지 않는다.

### 1-6. 생성 설정 (PlanningInput.generator) — 판정에 영향 없음

모듈 크기, 각도, 원점, 탐색 범위 등. v0.4의 grid 값이 여기에 들어간다. **판정기는 이 값을 근거로 쓰지 않는다**(실제 칸 도형에서 다시 측정한다).

### 1-7. 이동 가능한 제안 요소(PlanningInput.movable)

| 필드 | 설명 |
|---|---|
| movable.cores[] / movable.ramps[] | {id, allowedRegion 또는 allowedRange}. 허용 범위가 없으면 이동 불가(고정)로 취급 |
| movable.columns | 신규 기둥망 제안 {spacingRangeMm, alignment}. 제안 기둥은 후보에서 origin:'proposed'로 표시 |

### 1-8. v0.4 입력과의 대응(어댑터 규칙)

| v0.4 입력 | 계약 필드 | 비고 |
|---|---|---|
| mass | floor.outline(kind는 grid.wallMm 유무로 추정하지 않고 'inner'로 간주, 어댑터가 명시) | 어댑터가 가정을 결과에 기록 |
| cores[] | fixed.cores[] (relation 미선언) | 영역 밖이면 입력 오류 |
| ramp | ramps[0].shape | operation·systemId·section·segments 없음. v0.4 ramp.widthMm은 램프 몸체의 평면 폭이므로 어댑터가 wallToWallMm로 옮기되 가정을 결과에 기록한다. 연석 정보가 없으므로 R01은 하한 판단만 가능 |
| floorMm | floor.heightMm | |
| grid.stallW/stallD | generator 설정 | 판정 근거 아님 |
| grid.wallMm | floor.wallMm | |

v0.4 입력만으로 판정기를 돌리면 대부분의 법규·구조·보행 항목이 확인 불가로 나오는 것이 **정상**이다.

### 1-9. 단계 1A 입력 검사와 G01의 한계 (v1.1.3)

입력은 JSON 호환 객체이며 시험에서는 NaN·Infinity·undefined도 오류/누락 처리 경로를 검사한다. 정상 입력으로 고치는 자동 보정은 금지한다.

| 입력 | 처리 |
|---|---|
| levelMm, startLevelMm, endLevelMm, upperLevelMm, lowerLevelMm | 유한한 숫자이면 부호 허용. 지하층 음수 고도는 정상 |
| 길이·폭·반경·층고·연석 높이·오프셋 등 물리 치수 | 주어진 값은 유한한 숫자이며 0 이상. 나눗셈 분모 lengthMm은 0보다 커야 함. 숫자 문자열·NaN·Infinity·음수는 INPUT_ERROR. 0인 폭·높이는 관련 법규 비교에서 실패할 수 있음 |
| totalStalls | 주어진 값은 0 이상 안전한 정수. 합계도 안전한 정수 범위. 소수·음수·문자열은 INPUT_ERROR |
| 선택값/측정값의 undefined 또는 null | 미입력으로 취급. 필요한 항목은 MISSING_INPUT/분기 규칙. 연석 한쪽 높이만 빠졌다고 INPUT_ERROR로 바꾸지 않음 |
| 객체/배열 자리에 잘못된 타입, 배열 원소 null, null 램프·segment·주차장·체계·출입구·칸 | INPUT_ERROR. 예외로 중단하지 않음. input 자체가 없거나 객체가 아니어도 결과 틀은 반환 |
| 선언된 entity의 id | 비어 있지 않은 문자열. 같은 종류 배열 안에서 중복이면 INPUT_ERROR. 서로 다른 램프는 서로 다른 subjectId로 결과를 가짐 |
| parkingLots/rampSystems 배열 미입력 또는 빈 배열 | 대수 미상. 없는 값을 0으로 대체하지 않음 |
| 선언된 rampSystem.lotIds가 [] 또는 같은 ID 반복 | INPUT_ERROR. 중복을 조용히 제거하거나 반복 합산하지 않음 |
| lotIds 미입력, systemId 미입력, 참조 대상 주차장/체계 미입력, totalStalls 미입력 | 합계 미상. missingInputs에 실제 누락된 경로/ID를 기록. 일부 대수만 더하지 않음 |
| 동일 주차장이 서로 다른 체계에 연결됨 | 허용. 각 체계에서 한 번만 합산. 서로 다른 체계를 합치지 않음 |

검사는 해당 항목이 쓰는 입력 경로를 명시적으로 선택한다. `Mm` 접미사 재귀 검사로 generator·selfReport·미구현 V06 입력까지 판정에 끌어들이지 않는다. vehiclePassableWidthMm의 음수는 1A에서 그대로 보존하고 V06 NOT_IMPLEMENTED로 남긴다(T1A-44). 코드가 사용하는 치수·고도·날짜·ID·열거값만 검사한다.

G01은 계속 **전체 입력 도형 유효성** 항목이다. 1A에서 검사한 형식/수치에 오류가 있으면 G01 INPUT_ERROR와 evidence.fields를 반환한다. 오류가 없더라도 아직 도형 검사를 안 했으므로 G01은 UNDETERMINED/NOT_IMPLEMENTED이며 evidence.checked는 `input-format-and-numbers`, evidence.remaining은 `polygon-validity`다. G01을 PASS로 만들거나 별도의 합격 항목을 신설하지 않는다. 관련 항목에도 INPUT_ERROR를 표시하고 독립된 다른 항목은 계속 검사한다.

numeric-test는 floor.outline·candidate 도형을 요구하지 않는다. **1A에서는 candidate 모드에서도 도형 누락(floor.outline, candidate.geometry 등)을 검사하지 않는다.** 1A의 G01 INPUT_ERROR는 1-9 표의 형식·수치 오류뿐이다. 필수 도형 누락, 폐합·자기교차·도형 좌표 유한성은 1B부터 검사한다. 램프/출입구/칸 목록 자체가 없는 경우는 해당 항목 MISSING_INPUT이다. 1A에서 도형 관련 구현을 앞당기지 않는다.

**v1.1.5 (1B, 사용자 결정):** candidate 모드는 항상 도형 판정을 한다. floor.outline 또는 candidate.geometry가 미입력(undefined/null)이면 G01은 UNDETERMINED + MISSING_INPUT(missingInputs에 'floor.outline'/'candidate.geometry'), 외곽이 필요한 G02·G06·G07은 MISSING_INPUT(floor.outline)이다(G07은 코어·고정 요소와의 겹침이 확인되면 외곽 없이도 FAIL). 외곽이 필요 없는 G03–G05·L01은 후보 도형으로 계속 판정한다. 객체가 아닌 값 등 잘못된 형식은 INPUT_ERROR다. numeric-test 모드는 종전대로 도형을 요구하지 않으며 G01은 NOT_IMPLEMENTED(checked 'input-format-and-numbers')다. 1-1의 R 표기(없으면 입력 오류)보다 이 문단이 우선한다.

## 2. 고정 입력과 이동 가능한 제안 요소

| 구분 | 예 | 생성기가 할 수 있는 일 | 할 수 없는 일 |
|---|---|---|---|
| 고정 | 기존·상부 기둥, 내력벽, 코어(movable로 선언되지 않은 것), 예약영역, 외곽 | 피해서 배치, 막히면 막힘을 보고 | 삭제, 이동, 크기 변경, 차로 폭을 줄여 통과시키기 |
| 이동 가능 | movable로 선언된 코어·램프 | 허용 범위 안에서 위치 변경 | 범위 밖 이동 |
| 제안 | 신규 기둥, 신규 칸 배치, 차로 | 자유롭게 생성 | 제안 기둥을 차로에서 조용히 지우고 합격시키기. 지울 때는 **구조 예외**로 목록화 |

원칙: 고정 요소와 충돌하는 후보는 후보 자체가 실패이거나, 충돌을 "구조 협의 필요"로 명시한 후보여야 한다. 충돌을 지워서 없애지 않는다.

## 3. 후보 생성기 출력 (Candidate)

```
Candidate {
  schema: 'ug-candidate/0.1',
  candidateId, routeType,               // 'rect-loop' 등 동선 유형 이름
  generator: {name, version},
  frame: {originMm:[x,y], angleDeg},
  geometry: {
    stalls:  [{id, polygon, orientation?, declaredType?, rowId?}],
    lanes:   [{id, polygon, centerline?}],
    ramps:   [{id, bodyPolygon, landingPolygon?, segments?}],
    columns: [{id, polygon, origin:'fixed'|'proposed'}],
    reserved:[{id, polygon, role}],
    turnaround: [{id, polygon}],         // 명시적 회차공간(없을 수 있음)
    circulation?: {nodes, edges}          // 동선 골격. 참고용
  },
  omissions: {                           // 생성기가 뺀 것은 반드시 여기에 기록
    columns: [{id, reason, origin}],     // 특히 제안 기둥을 차로 때문에 뺀 경우
    stalls:  [{polygon, reason}],        // 제외된 칸과 이유(v0.4 excluded에 해당)
    areas:   [{polygon, reason}]         // 이격으로 갈라진 영역 중 사용하지 않은 부분 등
  },
  selfReport: {...}                      // valid/status/loopExists 등. 참고 표시용. 판정에 사용 금지
}
```

규칙
1. 도형은 모두 실제 치수의 다각형. 격자 칸 수나 모듈 값을 대신 넘기지 않는다.
2. omissions에 없는 요소가 입력에는 있고 후보에는 없다면, 판정기는 **소실**로 본다(G09 실패).
3. selfReport는 UI의 보조 표시에만 쓸 수 있고 어떤 판정 결과에도 영향을 주지 않는다.
4. 생성기는 판정 상태를 만들지 않는다(8장).
5. (v1.1.5) 후보 도형은 입력과 같은 도면 좌표로 적는다. frame은 생성기가 쓴 격자 원점·각도의 기록이며 판정기는 좌표 변환에 쓰지 않는다.

## 4. 독립 판정기의 입력과 출력

```
evaluate({ input: PlanningInput, candidate: Candidate, ruleSet: RuleSet, options? }) → Evaluation

Evaluation {
  schema: 'ug-evaluation/0.1',
  evaluator: {name, version},
  ruleSets: [{id, edition, editionAssumed:boolean}],
  items: [{
    id,                    // 예 'R01'
    domain,                // G R V S P L
    applicability,         // APPLICABLE | NOT_APPLICABLE  (5-4). 규칙 자체가 적용되지 않으면 NOT_APPLICABLE
    verdict,               // PASS | FAIL | UNDETERMINED | INPUT_ERROR. applicability가 NOT_APPLICABLE이면 null  (5장)
    reason,                // 코드. 예 MISSING_INPUT. NOT_APPLICABLE 항목은 'NOT_APPLICABLE'
    message,               // 사람이 읽는 한 줄(개발 용어 없이)
    missingInputs: [],     // UNDETERMINED일 때 필요한 입력 이름
    evidence: {...},       // 측정값, 위치 도형, 비교한 수치
    ruleRef?: {ruleId, edition, citation, namespace: 'law'|'ordinance'|'guideline'}
  }],
  domainSummary: {G:{pass,fail,undetermined,inputError,notApplicable}, ...},   // notApplicable은 앞의 네 값 어디에도 더하지 않는다(5-4)
  overall: {grade, scopeLabel, counts, notes, editionAssumed, mode},
  independence: {recomputed:[...], shared:[...]}   // 8장 표의 실행 기록
}
```

- 판정기는 입력을 수정·보정하지 않는다(예: 연석 폭을 줄여 통과시키지 않음). 판정기는 후보와 입력만 읽는다. 후보 안의 selfReport는 읽지 않는다(읽어도 값이 결과에 쓰이지 않음을 시험으로 확인).
- 판정기는 항목 목록을 **처음부터 전부 등록**한다. 아직 구현되지 않은 항목은 UNDETERMINED + reason NOT_IMPLEMENTED로 나온다. 그래서 단계가 진행되기 전에는 "검토 완료"가 나올 수 없다.
- **탐색 결과**는 판정기가 만들지 않는다. 6장 아래 SearchOutcome 참조.

### 4-1. 전체 결과 이름 (overall.grade)

| 이름 | 조건 (모두 충족) |
|---|---|
| **기하 초안** | 입력 오류 0, 실패 0, 도형(G) 영역이 **영역 전체 통과**(5-4), 그 밖의 영역에 확인 불가가 남아 있음 |
| **부분 검토** | 입력 오류 0, 실패 0, 도형(G) 영역 전체 통과, 도형 외 영역 중 1개 이상이 **영역 전체 통과**(5-4), 그리고 다른 영역에 확인 불가가 남았거나 판본 가정(editionAssumed)이 있음 |
| **검토 완료** | 입력 오류 0, 실패 0, 확인 불가 0(해당 없음 항목은 확인 불가가 아니다), 규칙 데이터 판본 가정 없음(editionAssumed 없음) |
| (등급 없음) | 입력 오류 또는 실패가 1건이라도 있음. 등급 대신 "입력 수정 필요(N건)" 또는 "부적합 항목 N건"과 항목 목록만 표시. **위 어느 행에도 맞지 않는 경우(예: G 영역 전체 통과가 아님)도 grade null**(v1.1.3) |

- scopeLabel은 항상 따라붙는다. 예: "계약 범위 한정 — 방화·피난 전체, 구조계산, 환기·설비 용량, 전기차 세부의무, 개별 인허가 조건은 이 판정에 포함되지 않음".
- 금지 표현: '사용 가능', '법규 충족', '최적안'. 단, **항목 단위**의 사실 서술("램프 폭 — 시행규칙 제6조 해당 목 기준 통과")은 허용한다. 영역·전체 단위로는 쓰지 않는다.
- '검토 완료'도 인허가 적합을 뜻하지 않는다는 문구를 scopeLabel에 고정한다.

v1.1.3 결정: **단계별로 검사 분모를 줄이지 않는다. G08–G10의 단계 3도 유지한다.** 1B에서 G01–G07을 검사해도 G08–G10이 미구현이면 G 영역 전체 통과가 아니고 overall.grade는 null이다. scopeLabel은 `기하 일부 검토 — G01–G07 검사, G08–G10 미검증`처럼 실제 범위를 표시한다. T1B-01의 종전 '기하 초안' 기대값을 정정한다. '기하 초안'·'부분 검토'·'검토 완료'의 의미를 단계마다 바꾸지 않는다.

집계는 다음 규칙을 추가로 지킨다.
- 고정 레지스트리는 G01–G10, R01–R09, V01–V06, S01–S04, P01–P05, L01–L05의 **39개 ID**다. 외부에서 레지스트리를 축소·변경해 합격시키지 못하게 한다.
- `summarize`/`computeOverall`은 전체 39개 ID의 존재를 검사한다. 누락 ID는 집계용 복사본에 UNDETERMINED/NOT_IMPLEMENTED로 보충하고 notes.missingItemIds에 남긴다. 원본 배열을 고치지 않는다. 단순 통과 건수는 영역 전체 통과가 아니다.
- 복수 대상은 같은 ID가 여러 행일 수 있다. `(id, subjectId)`가 같은 중복은 데이터 오류로 처리하며 PASS를 우선 선택하지 않는다. 표시 방법: 집계에서 그 키를 입력 오류 1건으로 세고, notes.duplicateItemKeys 배열에 "id|subjectId"를 남긴다. evaluate는 입력의 대상마다 필요한 행을 생성한다. 누락 대상 행이 전체 완료로 이어지지 않게 예상 대상과 결과를 대조한다.
- 빈 목록/일부 목록은 검토 완료가 될 수 없다. 합성 시험은 전체 레지스트리를 채운 후 일부 상태를 바꾼다. 아직 구현되지 않은 항목을 시험용 합성 목록에서 PASS로 둔 것은 집계 함수 검사일 뿐 실제 evaluate의 구현 완료를 뜻하지 않는다.
- domainSummary의 complete/domainPassed/notApplicableDomain은 모두 레지스트리 완전성을 전제로 한다. 전부 해당 없음인 영역은 기하 초안·부분 검토 조건에 세지 않는다.
- 판본 가정은 options의 editionAssumed뿐 아니라 항목들의 editionAssumed 중 하나라도 true면 true다. false 옵션으로 덮어쓸 수 없다. 실제 evaluate는 ruleSets의 가정도 포함한다. overall.editionAssumed는 항상 boolean으로 제공한다.
- 모든 항목 message는 비어 있지 않은 한국어 한 문장이다. UNDETERMINED에는 부족한 입력/근거/구현을, FAIL에는 측정값·기준값을, NOT_APPLICABLE에는 적용되지 않는 근거를 설명한다. G01·미구현에도 설명이 필요하다.
- 모든 overall.scopeLabel에는 `계약 범위 한정이며 인허가 적합을 뜻하지 않음`과 미검증 범위를 포함한다. notes는 객체이며 missingItemIds 배열, assumptions 배열, limitations 배열을 가진다. assumptions에는 판본/고저차 가정을, limitations에는 도형·차량·구조 등 남은 검사를 기록한다.

## 5. 판정 상태의 정의

| 상태 | 정의 | 만들 수 있는 곳 |
|---|---|---|
| **통과** (PASS) | 필요한 입력이 모두 있고, 적용되는 규칙 분기가 모두 확정되어 있으며, 측정값이 기준을 만족한다 | 판정기, 후보 한 장 |
| **실패** (FAIL) | 입력과 규칙이 충분하고 측정값이 기준을 위반한다. 실패는 "이 후보의 이 부분이 성립하지 않는다"이며, 어디가 문제인지 위치를 evidence에 둔다 | 판정기, 후보 한 장 |
| **확인 불가** (UNDETERMINED) | 입력·근거가 부족해 판단할 수 없다. **실패도 통과도 아니다.** reason을 반드시 단다 | 판정기 |
| **입력 오류** (INPUT_ERROR) | 입력 자체가 모순·불가능·형식 오류라 판정을 시작할 수 없다. 좌표 불일치, 닫히지 않은 다각형, NaN, 계획영역 밖 코어 등. **법규 위반으로 해석하지 않는다** | 판정기 |
| **미발견** (NOT_FOUND) | **후보의 상태가 아니라 탐색의 상태.** 정해진 탐색 범위 안에서 판정을 통과하는 후보를 찾지 못했다. 안이 존재하지 않는다는 뜻이 아니다 | 탐색 결과(SearchOutcome)만 |

### 5-1. 확인 불가의 이유 코드

| 코드 | 의미 |
|---|---|
| MISSING_INPUT | 필요한 입력이 없다(missingInputs에 이름을 나열) |
| BRANCH_DIVERGES | 규칙 분기가 갈리는데 어느 쪽인지 입력으로 정해지지 않았다 |
| OPEN_BRANCH_SET | 규칙 데이터가 모든 분기를 열거하지 못한다(종류가 열린 집합 등) |
| RULE_UNVERIFIED | 해당 규칙이 규칙 데이터에 없거나 verified가 아니다(예: 별표 완화구간) |
| RULE_EDITION_ASSUMED | 허가 기준일이 없어 현행 판본을 가정했다. 통과해도 '검토 완료' 불가 |
| EDITION_NOT_LOADED | 허가 기준일에 유효했던 판본이 규칙 데이터에 없다 |
| NOT_IMPLEMENTED | 항목은 계약에 있으나 판정기에 아직 구현되지 않았다 |
| STRUCT_EXCEPTION_UNRESOLVED | 구조 예외가 목록화되었으나 협의 전이다 |

### 5-2. 분기 규칙 (확인 불가와 통과·실패를 가르는 원칙)

1. 규칙이 입력에 따라 갈라질 때, **가능한 모든 분기에서 결과가 같으면** 입력이 없어도 그 결과로 확정한다.
   - 직선 **2차로가 명시된** 법령상 차로 너비 6.0m는 대수를 몰라도 R01의 모든 대수·분리 분기에서 통과한다. 1차로가 명시되면 50대 이상·미분리 분기는 차로 수 조건을 만족하지 못하므로 폭만으로 통과시킬 수 없다. 출입구 L04는 별도 판정이다.
2. 분기마다 결과가 갈리면 **확인 불가(BRANCH_DIVERGES)**. 추정해서 한쪽으로 확정하지 않는다.
3. 분기의 집합이 **닫혀 있을 때만** 1번을 적용한다. 닫힌 집합: 대수 구간(50대 미만/이상), 직선/곡선, 1차로/2차로. 열린 집합: 주차칸 종류(사업지침이 새 종류를 둘 수 있음), 사업지침 유형. 열린 집합은 입력이 없으면 확인 불가(OPEN_BRANCH_SET).
4. 측정값이 기준을 넘는 방향이 **모든 분기에서 동일**하면 실패로 확정한다(예: 평균 경사가 가장 관대한 기준보다도 큼).
5. 필요한 규칙이 RULE_UNVERIFIED이면 분기 계산과 무관하게 확인 불가. 상태·2차 확인·수치·판본 검사는 7-5의 공통 관문을 사용한다.
6. **50대 기준의 의미(확정, 법제처 해석례 24-0568).** 시행규칙 제6조제1항제5호 나목의 50대 기준은 특정 층의 대수, 엔진이 생성한 대수, 단순한 램프 담당 대수가 아니라 **같은 경사로를 이용하는 해당 주차장 전체 주차대수의 합계**다. 같은 문구("주차대수 규모")를 쓰는 제4호 출입구와 사목 경사로 기준에도 같은 입력을 쓴다(해석례의 직접 대상은 나목, 7-4의 13번 행).
   - 입력: ramp.systemId → project.rampSystems[].lotIds → project.parkingLots[].totalStalls의 합.
   - missingInputs 이름: 램프·출입구가 체계에 연결되지 않으면(systemId 없음, 또는 rampSystems에 그 ID가 없음) 'ramp.systemId'(출입구는 'entrance.systemId'), 대수가 빠지면 'project.parkingLots[].totalStalls'를 쓴다.
   - 후보의 주차칸 수, 층별 대수, 입력되지 않은 값은 쓰지 않는다. 필요한 값이 하나라도 없으면 합계는 미상이다.
   - 합계가 미상이고 "50 이하"와 "51 이상" 두 경우의 결과가 다르면 확인 불가(BRANCH_DIVERGES, missingInputs에 빠진 ID와 필드). 결과가 같으면 5-2의 1번으로 확정한다.
   - 경계: 나목은 "50대 이하"에서 완화(5m), 제4호·사목은 "50대 이상"에서 강화한다. 정확히 50대이면 두 조건이 모두 해당한다.
   - 서로 독립된 램프 체계는 각각 따로 판정한다.
   - 허가 기준일에 따른 판본 처리는 50대 기준 사용 여부와 상관없이 7-5의 규칙별 유효 시작일로 정한다. 2026-03-31 이전 허가 기준일은 단계 1A의 모든 판정 항목(R01·R02·R03·R04·R09·L01·L04)이 EDITION_NOT_LOADED다.
7. **법규 폭과 차량 폭의 분리.** 1-4a의 개념 구분을 따른다. 법규 판정(R01·R09)은 법령상 차로 너비와 연석 위치·높이만, 차량 판정(V06)은 연석 안쪽 통과 가능 폭과 회전궤적만 본다. 한쪽의 부족을 다른 쪽 값을 조정해 메우지 않는다.

### 5-3. '배치 불가'와 '미발견'

- 문서·화면·결과에서 **'배치 불가'**는 판정기가 **입력만으로** 불가능을 증명한 경우에만 쓴다(예: 외곽이 주차칸 한 개 깊이보다 작음, 고정 요소가 유일한 출입 경로를 막음). 이때도 근거 항목(FAIL 또는 INPUT_ERROR)을 같이 보여 준다.
- v0.4의 `INFEASIBLE`은 증명이 아니라 제한된 탐색의 결과이므로 **미발견**으로 번역한다. 번역 어댑터가 이를 보장한다.
- 미발견은 반드시 탐색 범위를 같이 보고한다.

```
SearchOutcome {
  status: 'FOUND' | 'NOT_FOUND',            // 후보 판정과 별개
  searched: {routeTypes:[...], angles:[...], originSamples:n, modules:[...], ...},
  candidates: [{candidateId, evaluationRef}],
  notFound?: {
    closestCandidates: [...],               // 가장 가까웠던 후보와 막힌 항목
    unsearched: ['중앙 주통로형', '가지형+회차', '여러 구역 결합'],  // 아직 시도하지 않은 유형
    suggestions: [...]                      // 입력을 어떻게 바꾸면 달라질 수 있는지
  }
}
```

### 5-4. 적용 여부(applicability)와 해당 없음

검사해서 기준을 충족한 **통과(PASS)**와 규칙 자체가 적용되지 않는 **해당 없음**은 결과 데이터에서 구분한다. 해당 없음은 판정 상태가 아니라 적용 여부다.

| 구분 | applicability | verdict | reason | 통과 수 | 실패·확인 불가·입력 오류 수 | 화면 표시 |
|---|---|---|---|---|---|---|
| 검사해서 충족 | APPLICABLE | PASS | (없음 또는 근거 코드) | +1 | 불변 | 통과 |
| 검사해서 위반 | APPLICABLE | FAIL | 위반 코드 | 불변 | 실패 +1 | 실패 |
| 정보·근거 부족 | APPLICABLE | UNDETERMINED | MISSING_INPUT 등 | 불변 | 확인 불가 +1 | 확인 불가 |
| 규칙이 적용되지 않음 | NOT_APPLICABLE | **null** | NOT_APPLICABLE | **불변(포함하지 않음)** | **불변** | **해당 없음** |

- NOT_APPLICABLE 항목은 message에 적용되지 않는 이유(예: "직선 램프라서 곡선 내변반경 기준의 대상이 아님")를, evidence에 적용 조건과 판단에 쓴 입력값을 적는다.
- domainSummary.notApplicable에만 센다. pass, fail, undetermined, inputError 어느 값에도 더하지 않는다.
- **영역 완료**: 영역의 모든 항목이 PASS 또는 NOT_APPLICABLE이다. 미구현(NOT_IMPLEMENTED)이나 확인 불가가 하나라도 있으면 영역 완료가 아니다. 해당 없음은 "검사가 필요 없는 항목"이므로 영역 완료를 방해하지 않는다.
- **영역 전체 통과**: 영역 완료이면서 PASS가 1건 이상. 영역의 모든 항목이 해당 없음이면 "해당 없음 영역"으로 표시하고, 기하 초안·부분 검토의 조건을 채우는 것으로 세지 않는다.
- 해당 없음은 입력으로 적용 조건이 확정될 때만 쓴다. 분기 규칙(5-2)과 같다: 모든 분기가 해당 없음이면 해당 없음, 일부 분기만 해당 없음이고 나머지가 다른 결과면 확인 불가(BRANCH_DIVERGES). 적용 여부를 정할 입력이 없으면 해당 없음이 아니라 확인 불가(MISSING_INPUT). 램프 입력 자체가 없는 것도 해당 없음이 아니라 확인 불가(MISSING_INPUT ramps)다.
- 예: 직선 램프의 곡선 내변반경 검사 → 해당 없음. 곡선 램프의 반경을 측정해 기준 충족 → 통과. 곡선 램프인데 반경 입력 누락 → 확인 불가. 램프가 직선인지 곡선인지 알 수 없음(shape.type 없음) → 확인 불가.
- 단계 1A에서 해당 없음을 만들 수 있는 항목은 R03(곡선 부분이 없는 램프)와 R04(주차장 전체 50대 미만)뿐이다. 다른 항목은 해당 없음을 만들지 않는다.

### 5-5. 수치 판정의 실행 규칙 (v1.1.3, 구현 기대값)

**공통 우선순위:** 해당 대상의 잘못된 형식·모순은 INPUT_ERROR → 필요한 판본·규칙 관문 → 적용 범위 → 각 분기의 측정/누락 판정 → 결과 합성. 독립 항목의 오류는 다른 항목 결과를 덮지 않으며 overall은 오류를 집계한다. 데이터 누락은 값을 추측해서 복구하지 않는다. 같은 항목의 모든 필요한 규칙이 확인되기 전에는 다른 분기의 실패를 근거로 FAIL을 만들지 않는다.

**R01 차로와 운영**
1. shape.type은 straight/curve(혼합 구간은 아래 R02에서만 처리). 모르면 직선·곡선 분기를 고려하고, 잘못된 값은 INPUT_ERROR. lanes는 숫자 1/2, operation은 oneWay/twoWay, separatedInOut은 boolean이다. lanes=1과 operation=twoWay를 함께 선언하면 본 모델에서는 INPUT_ERROR다. oneWay는 2차로도 가능하므로 차로 수를 1로 추정하지 않는다. lanes가 없고 twoWay면 2, 그 밖에 lanes가 없으면 1/2를 모두 검토한다. 폭을 보고 차로 수를 역산하지 않는다.
2. 각 분기는 대수 구간, 차로 수, 직선/곡선, 분리 여부의 조합이다. separatedInOut 누락은 true/false 분기다. 명시 입력과 모순인 조합은 제외한다. 모든 가능한 분기가 PASS면 PASS, 모두 FAIL이면 FAIL, 결과가 다르면 BRANCH_DIVERGES다. 필요한 측정이 없으면 MISSING_INPUT이다.
3. 분기마다 해당 형상·차로 수의 다목 폭 기준을 적용한다. 대수가 강화 기준 이상이고 분리가 false면 **lanes=2 AND 너비가 사목 최소 이상 AND 다목 최소 이상**이어야 한다. 직선 2차로 6m, 곡선 2차로 6.5m가 되는 이유는 이 조건의 동시 적용이다. 분리 true는 사목의 추가 의무만 해소하며 다목의 기본 폭을 면제하지 않는다.
4. wallToWallMm만 있는 경우 각 분기에서 전체 폭으로도 기준 확보가 불가능하면 FAIL. 확보 가능성만 있으면 UNDETERMINED/MISSING_INPUT. 명시적인 1차로·대규모·미분리는 폭 미상이어도 차로 수 조건 위반으로 FAIL 가능하다. 단 규칙 관문과 적용 조건은 먼저 충족해야 한다.
5. 분기 결과 합성: 모두 PASS면 PASS, 모두 FAIL이면 FAIL, PASS와 FAIL이 섞이면 BRANCH_DIVERGES, 그 밖(측정 누락 분기가 있고 PASS·FAIL이 섞이지 않음)은 MISSING_INPUT이다. evidence에는 검토한 분기의 입력·결과·기준값·ruleId 목록을 `branches`로 담는다. ruleRef는 대표 근거이고 `evidence.ruleRefs`에 사용한 모든 규칙을 기록한다. missingInputs는 실제 부족한 필드만 기록한다.

**L04 출입구**
- 대수와 separated의 조합을 모두 검토한다. separated 누락은 true/false다. 기본 최소폭은 모든 분기에 적용, 강화 대수 이상·미분리일 때만 큰 최소폭을 적용한다. 따라서 노외·대수 미상이라도 폭 1m는 FAIL, 분리 true·폭 3.5m는 PASS다. 폭 3.5m·대수 80·분리 미상은 BRANCH_DIVERGES다. 램프의 separatedInOut을 출입구 separated로 복사하지 않는다.

**R02 경사**
- segments는 램프를 따라 순서대로 놓인 전체 구간 목록으로 해석한다. lengthMm는 경사를 계산할 수 있는 **수평 투영 중심선 길이**다. 경사면 실길이를 같은 필드로 사용하지 않는다. 곡선 평면 길이는 수평 투영 호 길이다.
- 구간의 kind가 straight/curve이면 해당 상한, kind가 누락 또는 transition이면 straight/curve 상한을 모두 비교한다. transition은 완화구간 검증 완료를 뜻하지 않는다(R04 별도). 알려지지 않은 문자열은 INPUT_ERROR다. 누락 kind에 램프 전체 shape.type을 자동 복사하지 않는다.
- 각 구간의 시작·끝 고도와 길이가 있으면 경사 = 절대 고저차/길이×100이다. **상한 비교는 부동소수점 나눗셈 없이 `절대 고저차 × 100 ≤ 상한 × 길이`로 한다**(정확히 14%·17%는 통과). evidence의 경사 표시값은 별도로 계산해도 된다. 구간 일부 값 누락은 MISSING_INPUT, 유한하지 않거나 길이 0인 값은 INPUT_ERROR다. 구간이 여러 개면 확인된 위반 구간이 하나라도 있을 때 FAIL, 모두 PASS일 때만 PASS, 그 밖은 UNDETERMINED다. UNDETERMINED의 이유는 값 누락이 하나라도 있으면 MISSING_INPUT(누락 필드 모두 기록), 누락 없이 kind 분기만 갈리면 BRANCH_DIVERGES다. 입력 오류가 있으면 항목은 INPUT_ERROR다.
- 고도 비교는 mm 정확 일치이며 허용오차를 쓰지 않는다. 인접 구간의 종료/시작 고도가 다르거나, 제공된 connects의 양 끝 고도와 전체 구간 양 끝이 서로 다른 경우 INPUT_ERROR다(방향은 정방향·역방향 모두 허용). 구간 합계 길이와 shape.lengthMm가 둘 다 제공되면 같은 전체 길이여야 한다. 임의 보정하지 않는다. 계산 잡음 비교에만 8-2의 길이 허용오차를 쓰고 법규 경사 비교에는 쓰지 않는다.
- "완전한 connects"는 upperLevelMm·lowerLevelMm 두 값이 모두 유한한 숫자인 것이다(upperFloorId·lowerFloorId는 R02에 필요 없음). 구간이 없을 때 고저차 우선순위는 **완전한 connects의 abs(upperLevelMm-lowerLevelMm) → connects 자체가 없을 때만 floor.heightMm**다. connects가 부분 입력이면 MISSING_INPUT, 잘못된 값이면 INPUT_ERROR이고 층고로 대체하지 않는다.
- 평균 경사가 가능한 모든 상한보다 크면 FAIL. 순수 curve는 곡선 상한, 순수 straight는 직선 상한. shape.type 미상인 평균은 가장 관대한 상한도 초과할 때만 FAIL이고 그 밖에는 UNDETERMINED다. 평균만으로 PASS는 없다. 층고 대체를 사용하면 성공/실패/확인 불가와 관계없이 evidence와 overall.notes.assumptions에 가정을 기록한다.

**R03 반경**
- shape.type 누락은 `APPLICABLE + UNDETERMINED + MISSING_INPUT`이며 missingInputs에 ramp.shape.type을 기록한다. 여기서 APPLICABLE은 **검사 대기 중**까지 포함하는 기존 두 값 체계의 표현이며, 적용이 확정됐다는 뜻으로 화면에 번역하지 않는다. T1A-46(c)는 이 조합으로 고정한다.
- 형상 모순(R01·R02·R03 공통 INPUT_ERROR): shape.type straight인데 kind curve 구간이 있음, 또는 shape.type curve인데 segments가 있고 그중 curve 구간이 하나도 없음(kind 누락 구간이 있으면 모순 아님). 직선이라는 선언과 curve 구간이 동시에 있으면 모순 입력이다. 곡선이 없는 직선이면 NOT_APPLICABLE/null. 곡선이면 대수별 일반 규칙(6m, 50대 이하 5m)만 쓴다. 이륜 전용 규칙은 범위 밖이다(1-4).
- 예: 4.5m·대수 미상은 FAIL, 5.5m·대수 미상은 BRANCH_DIVERGES, 6m 이상은 PASS다. 모든 수치는 규칙 데이터에서 읽는다.

**R04·R09**
- R04는 적용 판본과 임계 대수 규칙을 검증한 뒤 기존 6장 표대로 처리한다. 완화구간 계산은 1A에서 NOT_IMPLEMENTED였고, 2026-10-26 완화구간 계약 v0.1로 구현했다(규칙 레코드 4개 추가: transition-concave-threshold·break-straight·break-curve·max-slope-ratio).
- R09는 좌우 오프셋·높이 각각을 검사한다. 주어진 값 중 위반이 있으면 FAIL(다른 값이 빠져도 확인된 위반을 evidence로 남김), 위반 없고 일부 누락이면 MISSING_INPUT, 네 값이 모두 충족하면 PASS다. 잘못된 타입/음수는 INPUT_ERROR다. 필요한 세 규칙(오프셋·최소높이·최대높이) 중 하나라도 미확인이면 RULE_UNVERIFIED가 우선한다. 연석 가로폭은 R01/R09의 입력 검사·판정 근거에 넣지 않는다.

## 6. 판정 영역별 항목

"단계"는 판정기가 해당 항목을 실제로 계산하는 단계. 그 전에는 NOT_IMPLEMENTED. **굵은 글씨**는 단계 1 대상.

### G. 도형

| ID | 항목 | 통과 조건 | 실패 / 입력 오류 / 확인 불가 | 단계 |
|---|---|---|---|---|
| **G01** | 입력 도형 유효성 | 외곽·코어·램프·고정 요소가 닫힌 다각형, 자기교차 없음, 수치 유한. (v1.1.9) 외곽 다각형끼리 부분 겹침 없음(1-1) | 위반 시 입력 오류. 1A는 형식·수치만 검사하고 PASS를 만들지 않음(1-9). 다각형 검사는 1B | 1A 일부 / 1B |
| **G02** | 주차칸이 외곽 안 | 모든 칸이 (이격 반영된) 영역 안 | 벗어난 칸 위치와 함께 실패 | 1 |
| **G03** | 주차칸과 차로 겹침 | 교집합 면적이 허용오차 이하 | 실패(위치) | 1 |
| **G04** | 칸과 고정 요소·램프·예약영역·기둥 겹침 | 겹침 없음 | 실패(위치) | 1 |
| **G05** | 칸끼리 겹침 | 겹침 없음 | 실패(위치) | 1 |
| **G06** | 코어와 계획영역의 관계 | 코어가 relation 선언과 일치 | 영역 밖·걸침·미선언 → **입력 오류**(법규 위반이 아님). 아래 6-1 | 1 |
| **G07** | 램프 몸체 | 외곽 안, 코어·고정 요소와 겹침 없음. (v1.1.5) 외곽 밖 부분은 같은 id 램프 입력의 roadConnection.outsidePolygon(지상 도로 접속 구간) 안에 있으면 허용 | 겹침, 또는 선언되지 않은 외곽 밖 부분(100mm² 초과)은 실패(위치). (v1.1.6) 같은 id의 램프 입력이 둘 이상이면 어느 선언을 쓸지 정할 수 없으므로 입력 오류 | 1 |
| G08 | 이격으로 갈라진 영역 보존 | 모든 조각이 사용 또는 omissions.areas에 이유와 함께 기록 | 기록 없는 소실은 실패 | 3 |
| G09 | 고정 요소 보존 | 입력의 모든 고정 요소가 후보에 있음(삭제·이동 없음) | 소실·이동은 실패 | 3 |
| G10 | 면적 귀속 | 외곽 면적 = 칸+차로+예약+램프+코어+기록된 잔여 | 설명 안 되는 면적은 확인 불가 | 3 |

### R. 램프·단면

| ID | 항목 | 내용 | 단계 |
|---|---|---|---|
| **R01** | 램프 법령상 차로 너비 | 제6조제1항제5호 다목(직선 3.3m·2차로 6m, 곡선 3.6m·2차로 6.5m. 연석 부분은 차로 너비에 포함)과 사목 1)(주차장 전체 50대 이상이면 너비 6m 이상 2차로 또는 진입·진출 차로 분리). 법령상 차로 너비는 1-4a의 순서로 구한다. 벽 사이 전체 너비만 있고 연석 위치·단면이 없으면 충족을 확정하지 않는다(기준 미만이면 실패, 이상이면 확인 불가). 50대 기준은 5-2의 6번 | 1 |
| **R02** | 램프 경사 | (곡선 램프 계약 v0.2) 곡선 생성기가 낸 구간의 lengthMm는 그 생성기가 선언한 경사 측정선 위 실제 길이다. 판정기는 길이를 다시 재지 않으며 선언을 evidence에 옮긴다. 선언이 없는 기존 자료는 지금과 똑같이 판정한다. 제6조제1항제5호 라목: 직선 부분 17%, 곡선 부분 14%를 **초과하면 안 된다**(구간마다 적용되는 상한이며, 더 관대한 구간 한도는 없다. 바목 도로접속부는 더 엄격). segments가 있으면 구간별 비교. 없으면 평균 경사는 구간 최대의 하한이므로: 순수 직선 램프의 평균이 17%를 넘으면 실패, 순수 곡선 램프의 평균이 14%를 넘으면 실패, 직선·곡선이 섞여 평균이 14%와 17% 사이면 확인 불가, 한도 이하이면 확인 불가(구간 최대 미확인). 고저차는 ramp.connects의 실제 값, 없으면 floor.heightMm를 쓰되 "한 층 높이만큼 오르내린다는 가정"을 evidence에 표시. 둘 다 없고 segments도 없으면 확인 불가(MISSING_INPUT). **세부 실행 규칙(구간 kind 누락, connects 우선, 음수 고도)은 5-5가 이 칸보다 우선** | 1 |
| **R03** | 곡선 내변반경 | (곡선 램프 계약 v0.2) 내변반경 입력이 어느 선의 반경인지는 measurement.radiusReference로 선언한다. 없으면 기존과 같이 입력값을 그대로 쓴다. 제6조제1항제5호 나목(경사로의 곡선 부분): 6m, 주차대수 규모 50대 이하는 5m (이륜자동차전용 3m는 범위 밖, 1-4). **곡선 부분이 없는 직선 램프는 해당 없음**(5-4). 곡선 램프이면 적용: 내변반경 입력이 없으면 확인 불가(MISSING_INPUT). 50대 기준은 5-2의 6번(램프 체계 전체 합계). 반경이 5m 미만이면 모든 분기에서 실패, 6m 이상이면 모든 분기에서 통과, 5m 이상 6m 미만이면 합계가 50 이하일 때 통과, 51 이상일 때 실패, 미상이면 확인 불가 | 1 |
| **R04** | 완화구간 | 제6조제1항제5호 사목 2)와 별표 1(수치 확정, 7-4의 8번 행). 주차장 전체 50대 이상 경사로가 대상. 합계 50 미만이면 **해당 없음**(applicability NOT_APPLICABLE, verdict null). 50 이상이면 확인 불가(segments가 없으면 MISSING_INPUT, 있으면 2026-10-26부터 `04_docs/underground-ramp-transition-contract.md` v0.1대로 볼록·오목 부분과 완화구간 길이·경사를 판정해 PASS/FAIL, 구간 필드가 비면 MISSING_INPUT). 합계 미상이면 BRANCH_DIVERGES. 판본·규칙 관문(7-5)은 해당 없음 판단보다 먼저 적용한다 | 1 (확인 불가를 정확히 내는 것이 합격) |
| **R09** | 연석 위치·높이 | 제6조제1항제5호 다목: 양쪽 벽면으로부터 300mm 이상의 지점에 높이 100mm 이상 150mm 이하의 연석(현행 원문 "10센티미터 이상 15센티미터 이하"). 벽에서 연석 설치 지점까지가 300mm 미만이면 실패. 높이가 100mm 미만이면 실패, 100mm 이상 150mm 이하이면 통과(**정확히 150mm는 통과**), 150mm 초과이면 실패. 연석 입력이 없으면 확인 불가. **연석의 가로폭은 판정하지 않는다**(법에 규정 없음) | 1 |
| R05 | 상하층 접속 | 위·아래 층 접속점과 층 높이 차가 램프 시작·끝 고도와 일치 | 3 |
| R06 | 도로 접속부 경사 | 도로에서 일정 거리 이내 구간의 경사 기준. ramp.roadConnection이 있을 때만 | 3 |
| R07 | 유효높이 | 차로 2.3m, 주차 사용부분 2.1m(규칙 데이터). floor.clearHeightMm 입력이 있을 때만 | 3 |
| R08 | 램프 착지에서 차로까지의 접속 | 폭 있는 진입로가 외곽 안에서 차로까지 이어짐. 후보 도형에서 독립 재계산 | 3 |

### V. 차량 (전부 단계 5. 그 전에는 NOT_IMPLEMENTED)

V01 램프 진입·진출 회전 / V02 교차부 회전 / V03 막다른 끝 회차 / V04 대표 칸 입출차 / V05 곡선 2차로 교행 / V06 연석 안쪽 통과 가능 폭(법령상 차로 너비와 별개. 차량 궤적이 연석 안쪽 폭 안에 들어가는지. 연석 폭을 줄여 맞추지 않음).
설계 차량 제원·여유 조건은 project 입력에 출처와 함께 둔다(없으면 확인 불가). 기존 `CODEX_vehicle_swept_path.js` 등은 후보 자산일 뿐 판정에 연결된 것으로 취급하지 않는다.

### S. 구조

| ID | 항목 | 내용 | 단계 |
|---|---|---|---|
| S01 | 고정 기둥과 차로·칸 | 고정 기둥이 차로 유효 폭을 침범하거나 칸 안에 있으면 실패. 후보가 "협의 필요"로 선언했다면 확인 불가(STRUCT_EXCEPTION_UNRESOLVED) | 3 |
| S02 | 제안 기둥 제거(구조 예외) | omissions.columns에 제안 기둥 제거가 있으면 목록과 함께 확인 불가. **통과로 치지 않는다** | 3 |
| S03 | 상하층 기둥·코어 정렬 | 상부 기둥 입력이 있을 때만 | 3 |
| S04 | 허용 스팬 | 구조 입력(스팬 한계)이 있을 때만 | 3 |

### P. 보행·코어

| ID | 항목 | 내용 | 단계 |
|---|---|---|---|
| P01 | 코어 접근 가능 | relation이 external-separate/abutting이면 문·홀·보행 연결로 접근을 판단. 입력 없으면 확인 불가 | 5 |
| P02 | 코어 문 입력 | 문 위치가 없으면 확인 불가 | 5 |
| P03 | 문까지 보행 경로 | 차로와 분리된 보행 연결망이 문까지 닿고 폭이 기준 이상 | 5 |
| P04 | 장애인 칸에서 코어까지 | 무단차 연결, 통로 폭(규칙 데이터), 칸이 통로를 막지 않음 | 5 |
| P05 | 보행·차량 교차 | 교차 위치와 처리 방식 기록 | 5 |

### L. 법규·종류

| ID | 항목 | 내용 | 단계 |
|---|---|---|---|
| **L01** | 주차칸 치수와 종류 | 칸별 실제 폭×깊이를 도형에서 측정해 종류별 최소 치수(규칙 데이터)와 비교. 종류 미지정이면 확인 불가(project.stallDefaultType이 명시되어 있으면 그 종류로). 아래 6-2. 1A는 numeric-test 모드의 비교 로직만, 정규 후보의 도형 측정은 1B(1-5a) | 1A 비교 / 1B 측정 |
| L02 | 종류별 수량 | 장애인·확장형 등 비율. 근거 대수(project.totalRequiredStalls 또는 requiredByType)가 있을 때만 | 3 |
| L03 | 확장형 비율 | 적용 대상(부설 여부 등) 판단 필요. 입력 없으면 확인 불가 | 3 |
| **L04** | 출입구 폭·분리 | 차량 출입구(fixed.entrances) 기준. 램프 폭(R01)과 **별개 항목** | 1 |
| L05 | 필요 대수 충족 | 후보 칸 수(종류별)와 요구 대수. 다층 분담은 project에 층별 배분이 있을 때만 | 6 |

### 6-1. 코어와 외곽의 관계 판정 (G06)

| 상황 | 결과 |
|---|---|
| 코어가 외곽 안, relation 'inside' 또는 미선언 | 통과 |
| 코어가 외곽 밖이고 relation 미선언 | **입력 오류** (reason ZONE_MISMATCH: 입력 좌표 오류 또는 계획영역 불일치. 법규 위반 아님) |
| 코어가 외곽에 걸침(안·밖 면적이 모두 100mm² 초과), relation과 상관없이 | 입력 오류 (reason ZONE_STRADDLE). (v1.1.5) abutting 선언으로 해소되지 않는다 |
| 코어가 외곽 밖이고 relation 'external-separate', 또는 외곽 밖이면서 경계에서 1mm 이내로 닿고(v1.1.6: 코어 변과 영역 경계 사이 최소 거리 ≤ 1mm, 정확히 1mm 포함) relation 'abutting' | G06은 통과(선언과 위치 일치). (v1.1.5) 닿지 않는 코어의 'abutting'과 영역 안 코어의 'abutting'·'external-separate'는 입력 오류(ZONE_MISMATCH). 접근 가능 여부는 P01–P04에서 별도 판단: 문·보행 연결 입력이 없으면 확인 불가 |
| relation 'inside'인데 위치가 밖 | 입력 오류 (선언과 위치 불일치) |
| 위 어느 경우도 "접근 불가능한 코어"를 이 단계에서 확정하지 않는다 | 접근 불가 확정은 P01 이후, 문·보행 연결 입력이 있을 때만 실패 |

### 6-2. 주차칸 종류와 치수 (L01)

규칙 데이터(7-4 대조 결과): 평행주차형식 외(제3조제1항제2호) 일반 2.5×5.0m, 확장 2.6×5.2m, 경형 2.0×3.6m, 장애인전용 3.3×5.0m, 이륜자동차전용 1.0×2.3m. 평행주차(제3조제1항제1호)의 수치는 단일 조회로만 확인되어 needs-recheck이며 사용하면 확인 불가다. 사업지침 유형은 guideline 규칙 데이터에 없으면 확인 불가.

| 입력 상황 | 결과 |
|---|---|
| 칸에 종류가 선언됨(declaredType) | 해당 종류의 치수와 비교. 미달이면 실패(어느 종류든 마찬가지), 충족이면 통과 |
| 종류 미지정 + project.stallDefaultType 명시 | 기본값 종류로 비교. 결과에 "기본값 적용"을 표시 |
| 종류 미지정 + 기본값 없음 | 확인 불가(OPEN_BRANCH_SET). 이륜자동차전용(1.0×2.3m)처럼 폭이 더 좁은 종류가 있어 폭만으로 종류를 특정할 수 없다는 점을 메시지에 표기 |
| 종류가 사업지침 유형 | guideline 규칙 데이터에 해당 유형이 있으면 그 치수로, 없으면 확인 불가 |

즉 폭 1.8m는 어느 상황에서도 **자동으로 실패 처리하지 않고**, 종류가 선언되어 비교 기준이 확정된 경우에만 실패로 만든다.

## 7. 법규 근거와 판본을 저장하는 방식

### 7-1. 구조

- 위치(제안): `04_parking/src/underground/rules/` 아래 JSON 파일. 판정기는 파일을 읽기만 하고, 수치를 코드에 박지 않는다.
- 파일 단위: 한 판본(법령·조례·지침 + 시행일) = 파일 하나. 예: `kr-parking-act-rule-2026-07-27.json`, `seoul-parking-ordinance-2026-10-01.json`, 사업지침은 `guideline-<발주처>-<일자>.json`.
- namespace: `law`(전국 법규) / `ordinance`(지자체) / `guideline`(사업지침). **섞어 쓰지 않는다.** 결과 항목의 ruleRef에 namespace가 표시되고, 화면도 구분해 보여 준다.

### 7-2. 규칙 레코드

```
{
  ruleId: 'kr.rule6.p1.5.ramp-straight-slope',
  namespace: 'law',
  citation: '주차장법 시행규칙 제6조제1항제5호 라목',     // 조·항·호·목까지
  edition: {name:'국토교통부령 제1604호', effectiveFrom:'2026-07-27', effectiveTo:null},
  source: {url:'...', checkedOn:'2026-10-24', checkedBy:'Claude Sonnet 5.5 (1차) / 상위 모델 (2차)', secondCheck:'done'|'pending'},
  status: 'verified' | 'needs-recheck' | 'unverified',
  appliesWhen: { conditions:[ {field:'ramp.shape.type', op:'==', value:'straight'} ] },
  basis: 'rampSystem.totalStalls' | null,   // 대수 구분 기준: 램프 체계 전체 주차대수 합계(해석례 24-0568)
  quantity: {name:'maxSlopePct', value:17, unit:'%'},
  comparator: '<=',
  notes: '완화구간은 별표 참조 — 별도 규칙(unverified)'
}
```

### 7-3. 판본 선택과 상태

- 판본 선택: project.permitDate가 있으면 그 날짜에 유효한 판본. 없으면 현행 판본을 쓰되 `editionAssumed:true`를 모든 관련 항목과 overall에 표시한다(통과해도 '검토 완료' 불가).
- 규칙 상태: verified만 PASS/FAIL 판정에 쓴다. needs-recheck와 unverified는 항목을 확인 불가(RULE_UNVERIFIED)로 만든다.
- 법규를 바꿀 때는 새 판본 파일을 추가한다. 기존 판본 파일은 수정하지 않는다.
- 예외(v1.1.3 한 번): 아직 커밋되지 않은 `kr-parking-rules-2026-07-27.json`에 7-5의 `edition.textValidFrom` 메타데이터를 추가하는 것은 허용한다. 수치·status·secondCheck·citation은 바꾸지 않는다.

### 7-4. 법규 원문 대조 결과 (1차 2026-10-24 Claude Sonnet 5.5 / 2차 상위 모델, 사용자 전달 2026-10-24)

**대조 방법과 한계**
- 근거는 국가법령정보센터(law.go.kr)의 공식 원문과 법제처 법령해석례뿐이다. 블로그·상업 사이트·공모 소개 서비스는 근거로 쓰지 않았다.
- 1차 대조는 웹 조회 도구(페이지를 요약해 돌려줌)로 했으므로 표(이미지)와 별표(PDF)의 글자 그대로 육안 대조는 하지 못했다. 2차 확인은 상위 모델이 했고, 아래 상태 열의 secondCheck는 사용자가 전달한 2차 확인 결과를 따른다. 2차 확인의 원자료는 이 문서 작성자(Claude)가 직접 보지 못했다.
- 기준일: 시행 2026-07-27, 국토교통부령 제1604호(2026-07-27 일부개정).
- 범위: 단계 1 항목(램프 폭, 경사, 곡선 반경, 주차칸 치수, 출입구 폭)과 적용 조건. 종류별 비율, 서울 조례, 보행 폭 등은 이번에 대조하지 않았고 규칙 데이터에 넣지 않는다.

**판본 이력 주의**: 제6조제1항제5호 나목·다목은 국토교통부령 제1527호(공포 2025-09-30, **시행 2026-03-31**)에서 개정되었다. 아래 수치는 현행(개정 후) 문언이다. 개정 전 문언은 규칙 데이터에 불러오지 않았으므로 허가 기준일이 2026-03-31 이전이면 해당 항목은 확인 불가(EDITION_NOT_LOADED)로 유지한다. 별표 1은 2024-09-20 개정 이후 본문 개정이 없다(제1604호는 참조 표기만 변경).

**secondCheck 정리**: 이 표의 확정 행은 모두 done이다(직선·곡선 램프 차로 너비, 사목 1) 50대 이상 경사로, 출입구 폭, 직선·곡선 경사, 도로접속부 경사, 곡선 내변반경 수치, 50대 기준의 의미, 별표 1 완화구간, 제3조 주차구획 치수, 부설주차장 준용 범위, 유효높이, 연석 규정). 확정하지 못해 needs-recheck로 남긴 것은 10번 행(평행주차 치수)뿐이며 단계 1A는 이를 "확인 불가"로만 사용한다.

| # | 판정 항목 | 적용 조건 | 확인한 수치 | 근거 조문 | 기준일·판본 | 상태 | v1.0에서 바뀐 내용 |
|---|---|---|---|---|---|---|---|
| 1 | R01 법령상 차로 너비(직선) | 지하식·건축물식 노외주차장의 차로(제5호 머리말). 부설은 제11조제1항이 제6조제1항제1호–제8호 등을 준용(8대 이하, 단독·다세대 단서 별도) | 1차로 3.3m 이상, 2차로 6m 이상. 연석 부분은 차로의 너비에 포함 | 시행규칙 제6조제1항제5호 다목 | 2026-07-27 시행, 제1604호 (다목은 제1527호 개정분, 시행 2026-03-31) | **확정**, secondCheck done | 연석 관련 입력을 분리(5-2의 7번, 1-4a) |
| 2 | R01 법령상 차로 너비(곡선) | 위와 같음 | 1차로 3.6m 이상, 2차로 6.5m 이상 | 같은 다목 | 위와 같음 | **확정**, done | 변경 없음 |
| 3 | R01 50대 이상 경사로 | 주차장 전체 50대 이상(5-2의 6번) | "주차대수 규모가 50대 이상인 경우"의 경사로: 너비 6m 이상인 2차로를 확보하거나 진입차로와 진출차로를 분리 | 제6조제1항제5호 사목 1) | 2026-07-27 시행, 제1604호 | **확정**, done | 대수 기준을 "램프 체계 전체 합계"로 확정 적용 |
| 4 | L04 출입구 폭 | 노외주차장 출입구(지하식 한정 아님). 부설은 제11조제1항 준용 | 3.5m 이상. "주차대수 규모가 50대 이상인 경우에는 출구와 입구를 분리하거나 너비 5.5미터 이상의 출입구" | 제6조제1항제4호 | 2026-07-27 시행, 제1604호 | **확정**, done | 50대 기준 입력을 entrances[].systemId로 연결 |
| 5 | R02 경사로 종단경사도 | 지하식·건축물식 경사로 | 직선 부분 17% 초과 금지, 곡선 부분 14% 초과 금지 | 제6조제1항제5호 라목 | 2026-07-27 시행, 제1604호 | **확정**, done | 변경 없음(평균 초과 실패 논리 유지) |
| 6 | R06 도로접속부 경사 | 오르막 경사로, 도로와 접하는 부분으로부터 3m 이내 | 직선 부분 8.5% 이하, 곡선 부분 7% 이하 | 제6조제1항제5호 바목 | 2026-07-27 시행, 제1604호 | **확정**(단계 3 항목), done | 변경 없음 |
| 7 | R03 곡선 내변반경 | 경사로의 곡선 부분 | 6m 이상. 주차대수 규모 50대 이하는 5m, 이륜자동차전용은 3m | 제6조제1항제5호 나목 | 2026-07-27 시행, 제1604호 (나목은 제1527호 개정분, 시행 2026-03-31) | 수치 **확정**, done | 50대 기준의 두 해석 병행 규칙 삭제. 아래 13번 행으로 확정 |
| 8 | R04 완화구간 | 제5호 사목 2): 주차장 전체 50대 이상 경사로. 완화구간 = 종단경사도가 최대 종단경사도의 2분의 1 이하인 구간 | 별표 1: 50대 이상 100대 미만 볼록형 1.7m, 100대 이상 볼록형 1.7m·오목형 2m. 볼록·오목 = 오르막 방향 종단경사도가 직선 8.5%포인트, 곡선 7%포인트 이상 변하는 부분 | 제6조제1항제5호 사목 2), 별표 1 | 별표 1은 2024-09-20 개정본(이후 본문 개정 없음) | **확정**, done | 규칙 상태는 verified로 변경. 단계 1에서 R04가 확인 불가인 이유는 "규칙 미확정"이 아니라 "구간 입력과 구간 계산 미구현"으로 바뀜 |
| 9 | L01 주차단위구획 치수 (평행주차형식 외) | 모든 주차장(제3조). 제11조는 제3조 준용 문구를 따로 두지 않음 | 경형 2.0×3.6m, 일반 2.5×5.0m, 확장 2.6×5.2m, 장애인전용 3.3×5.0m, 이륜자동차전용 1.0×2.3m | 제3조제1항제2호 | 2026-07-27 시행, 제1604호 | **확정**, done | 변경 없음 |
| 10 | L01 평행주차 구획 치수 | 평행주차형식 | 경형 1.7×4.5m, 일반 2.0×6.0m, 보도·차도 구분 없는 주거지역 도로 2.0×5.0m, 이륜 1.0×2.3m | 제3조제1항제1호 | 같음 | v1.1.4: 경형·일반형 **확정**(ALRIS 조회가 같은 값을 냄 + 사용자 확인 결정, 12-6). 이륜 1.0×2.3m는 ALRIS 답에 없어 needs-recheck 유지. 주거지역 도로 2.0×5.0m는 도로변 구획이라 지하주차에 쓰지 않음 | 평행주차 레코드를 종류별로 나눔 |
| 11 | 적용 범위: 부설주차장 | 부설주차장 | 제6조제1항제1호–제8호·제10·12·13·15호 및 제7항 준용. 단독주택·다세대주택으로서 시장·군수·구청장이 인정하면 제외. 총주차대수 8대 이하 자주식은 제5항 별도 기준 | 제11조제1항·제5항 | 2026-07-27 시행, 제1604호 | **확정**, done. v1.1.4: 제5항 8대 이하 별도 기준은 **자주식 중 지평식**에만 적용(ALRIS 조회, 12-6). 지하식인 이 모델에는 적용하지 않는다 | 8대 이하 확인 불가 규칙 삭제 |
| 12 | 유효높이 | 지하식 차로 | 차로 높이 2.3m 이상(제5호 가목), 주차 사용부분 2.1m 이상(제7호) | 제6조제1항제5호 가목, 제7호 | 같음 | **확정**(단계 3 항목), done | 변경 없음 |
| 13 | **50대 기준의 의미** | 곡선 경사로 내변반경 5m/6m 구분(나목). 같은 문구를 쓰는 제4호 출입구, 사목 경사로 기준에도 같은 입력을 쓴다(아래 주의) | "같은 경사로를 이용하는 해당 노외주차장 전체 주차대수의 합계가 50대 이하인 경우를 의미한다." 이유: 경사로를 이용하는 행위와 특정 층에 주차하는 행위는 별개 | 법제처 법령해석례 안건번호 24-0568 | 회신 2024-09-23 | **확정**, done | 두 해석 병행(해석 A·B), INTERPRETATION_OPEN, servedStalls 삭제. 입력은 project.parkingLots[].totalStalls와 rampSystems[] |
| 14 | R09 연석 위치·높이 | 경사로 | 양쪽 벽면으로부터 30cm 이상의 지점에 연석(경계석) 설치. 높이 10센티미터 이상 15센티미터 이하(100–150mm, 150mm 포함). 연석 부분은 차로의 너비에 포함. 연석 자체의 가로폭은 조문에 규정 없음 | 제6조제1항제5호 다목 | 2026-07-27 시행, 제1604호 | **확정**, done | v1.1의 150mm 확인 불가 규칙 폐기. 150mm 정확히는 통과. 30cm는 벽에서 연석 설치 지점까지의 거리이며 연석 자체의 크기가 아니다 |

**13번 행 주의 (감사 기록)**
- 해석례는 질의문에서 나목을 "같은 경사로를 이용하는 주차장의 총주차대수가 50대 이하인 경우"로 인용한다. 이번에 조회한 현행 문언은 "주차대수 규모가 50대 이하인 경우"다. 제1527호 개정(시행 2026-03-31) 전후 문언으로 보이나 신구조문 대조는 하지 않았다.
- 해석례가 직접 다룬 것은 나목이다. 제4호·사목은 같은 "주차대수 규모" 문구라서 같은 입력(램프 체계 전체 합계)을 쓰지만, 해석례의 직접 대상은 아니다. 이 확장은 사용자 결정에 따른 것이다.
- 이 때문에 허가 기준일이 2026-03-31 이전이면 50대 기준을 쓰는 항목은 EDITION_NOT_LOADED로 둔다.

공식 원문 링크
- 시행규칙 제6조: https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029242755
- 시행규칙 제3조·제11조 포함 페이지: https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lspttninfSeq=81561
- 시행규칙 제6조 인쇄판: https://www.law.go.kr/LSW//lsLawLinkInfo.do?lsJoLnkSeq=1000128034&lsId=008238&chrClsCd=010202&print=print
- 시행규칙 별표 1 (완화구간, 2024-09-20 개정본 PDF): https://www.law.go.kr/flDownload.do?gubun=&flSeq=144300695&bylClsCd=110201
- 시행규칙 개정 이력(제1527호·제1604호): https://law.go.kr/LSW/lsRvsDocListP.do?lsId=008238&chrClsCd=010202&lsRvsGubun=all
- 법제처 법령해석례 24-0568: https://www.law.go.kr/LSW/expcInfoP.do?expcSeq=340015&mode=2

**아직 확인하지 못한 것** (단계 1A를 막지 않음)
1. 별표 1 PDF 글자의 육안 대조와 제3조 이미지 표의 육안 대조는 2차 확인(상위 모델)에서 완료된 것으로 전달받았으나, 원자료는 이 문서 작성자가 직접 보지 못했다.
2. 제1527호 개정 전 문언과 해석례 질의문 문언의 관계. 허가 기준일 2026-03-31 이전은 EDITION_NOT_LOADED로 둔다.
3. 평행주차 치수(10번 행)의 법령정보센터 원문 육안 대조. v1.1.4에서 경형·일반형은 사용자 결정으로 확정, 이륜은 미확정.
4. (v1.1.4 해소) 제11조제5항은 지평식 한정이라 지하주차에는 적용하지 않는다.

**규칙 데이터 상태 부여 원칙(확정)**
- secondCheck가 done인 확정 행은 status verified로 규칙 데이터에 담는다.
- 확정 행은 모두 secondCheck done이다. 단계 1A가 쓰는 규칙(R01, R02, R03, R04, R09, L01, L04)은 전부 verified로 담는다.
- 확인 불가인 행(10번 행)은 status를 needs-recheck로 둔다. 판정에 쓰면 RULE_UNVERIFIED가 된다. 상태 값(status, secondCheck)은 이 표의 값을 그대로 옮기며 구현자가 바꾸지 않는다.
- 사업지침 수치(LH 대전소제의 직선램프 내부폭 7m, 곡선 내부반경 7.5m, 확장형 40% 등)는 guideline namespace에만 두며 이번에 원문을 다시 열지 않았으므로 규칙 데이터에 넣지 않는다.
- 지역 범위: 전국 공통 + 서울로 시작. 이번 대조는 전국 공통 법규만 다뤘다. 다른 지자체는 규칙 파일이 없으면 확인 불가.

### 7-5. 규칙 사용 공통 관문 (v1.1.3)

판정 항목이 규칙 레코드를 PASS/FAIL 근거로 쓰기 전에 아래를 **모두** 통과해야 한다. 하나라도 어기면 그 규칙에 의존하는 분기는 결과를 만들지 못하고, 항목은 아래 표의 결과가 된다. 예외로 중단하지 않는다.

| # | 검사 | 어기면 |
|---|---|---|
| 1 | ruleSet이 객체이고 rules가 배열 | 판정 항목 전부 UNDETERMINED + RULE_UNVERIFIED, evidence.ruleProblems에 'ruleSet' |
| 2 | 필요한 ruleId가 정확히 1개 존재(0개·중복 모두 문제) | UNDETERMINED + RULE_UNVERIFIED, evidence.ruleProblems에 {ruleId, problem:'missing'/'duplicate'} |
| 3 | status === 'verified' **그리고** 레코드의 source.secondCheck === 'done'. 레코드에 source가 없으면 파일 머리의 source를 쓰지 않고 미확인으로 본다 | UNDETERMINED + RULE_UNVERIFIED |
| 4 | namespace === 'law'(단계 1A는 전국 법규만 사용) | UNDETERMINED + RULE_UNVERIFIED |
| 5 | 수치: 해당 항목이 기대하는 quantity.name이 있고 값이 유한한 양수, unit이 기대 단위와 같음, comparator가 있으면 기대 방향과 같음. **예외**: 칸 치수 레코드(kr.rule3.*)는 quantity.widthMm·depthMm가 유한한 양수면 되고 unit은 mm, 비교는 이상(>=)으로 간주. 제11조 레코드(kr.rule11.*)는 quantity가 null이어도 정상이며 5번 검사 대상이 아니다(상태 3번만 검사). 50대 임계 레코드를 R03이 경계값으로 읽을 때는 값만 검사하고 comparator는 검사하지 않는다 | UNDETERMINED + RULE_UNVERIFIED, problem:'damaged' |
| 6 | 판본: 아래 판본 규칙 | UNDETERMINED + EDITION_NOT_LOADED |

**적용 순서**: 입력 형식 오류(INPUT_ERROR) → 판본(6번) → 규칙 상태·손상(1–5번) → 적용 범위(해당 없음 포함) → 분기 계산(5-5). R04의 해당 없음은 50대 임계 규칙을 쓰므로 판본·규칙 관문을 통과한 뒤에만 낸다. R03의 직선 램프 해당 없음은 규칙 수치를 쓰지 않으므로 상태·수치 관문(3–5번)은 면제한다. 1번(ruleSet 형태)은 적용하고(ruleSet이 없으면 직선이라도 RULE_UNVERIFIED, T1A-50(e)), 판본(6번)은 `kr.rule6.p1.5.curve-inner-radius` 한 레코드의 존재(2번)와 textValidFrom으로 판단한다.

**제11조(부설) 단계의 위치**: 적용 범위 단계에서 판단하며 제6조 기준을 쓰는 항목(R01·R02·R03·R04·R09·L04)에 똑같이 적용한다. L01(제3조)은 영향 없다. 순서: (1) parkingKind 누락 또는 'unknown' → 해당 항목 UNDETERMINED + MISSING_INPUT(project.parkingKind). 단 모든 분기가 해당 없음인 경우(직선 R03, 50 미만 R04)는 해당 없음 유지. (2) (v1.1.4 삭제) 제11조제5항의 8대 이하 별도 기준은 자주식 중 지평식에만 적용되므로 지하식인 이 모델에는 적용하지 않는다. 부설은 대수와 상관없이 (3)으로 간다. (3) facilityUse가 정확히 '단독주택' 또는 '다세대주택'이면 UNDETERMINED + BRANCH_DIVERGES(지자체 인정 여부에 따라 준용·비준용이 갈리며 이 모델은 인정 여부를 입력으로 받지 않음, missingInputs '지자체 준용 제외 인정 여부'). facilityUse 누락이면 MISSING_INPUT(project.facilityUse). (4) 그 밖이면 제6조로 판정하고 evidence에 "제11조제1항 준용"을 기록한다. 'noeoe'는 바로 제6조로 판정한다. **제11조 레코드 사용법(v1.1.4)**: kr.rule11.p5.small-attached는 판정에 쓰지 않는다(원문 기록으로만 남긴다). kr.rule11.p1.attached-application은 부설일 때 상태·판본을 검사한다.

**필요한 규칙의 범위**: 명시 입력으로 배제되지 않은 **모든 분기**가 쓰는 규칙이다. 예: shape.type이 straight로 명시되면 곡선 규칙은 필요 없다. 대수가 확정돼 50 미만이면 R01의 사목 2차로 규칙은 필요 없지만 50대 임계 규칙은 필요하다. 대수가 미상이면 임계·대규모 규칙이 모두 필요하다. 한 분기의 규칙만 미확인이어도 다른 분기의 FAIL로 항목을 FAIL로 만들지 않는다(5-5 공통 우선순위). 부설 관련 분기(제11조)는 이 범위 계산에 넣지 않고 아래 "제11조 단계"로만 처리한다. **R03 곡선**은 대수 분기 때문에 6m·5m 반경 레코드와 50대 임계 레코드(`kr.rule6.p1.5.large-ramp-threshold`의 minStalls)를 항상 함께 쓴다(반경이 6m 이상이어도 마찬가지).

**판본 규칙(규칙별 유효 시작일)**
- 규칙 레코드마다 `edition.textValidFrom`(그 조문 문언이 유효해진 날, 확인된 날짜만)을 둔다. 값은 7-4 표의 기준일·판본 열에서만 옮긴다: 제6조제1항제5호 **나목·다목** 레코드(램프 차로 너비 4개, 곡선 내변반경 3개, 연석 3개)는 '2026-03-31'. 그 밖의 레코드(라목 경사, 사목 50대 임계·2차로, 제4호 출입구, 제3조 칸 치수, 별표 1, 제11조)는 7-4에 그 이전 유효성이 확인되어 있지 않으므로 edition.effectiveFrom('2026-07-27')과 같다. **v1.1.4 사용자 결정(12-6)으로 대체**: 제3조 레코드는 '2019-03-01'(제3조의 직전 개정 시행일, ALRIS 조회), 별표 1 레코드는 '2024-09-20'(7-4 판본 이력), 나머지는 모두 '2026-03-31'. 제1604호(2026-07-27) 전후로 라목·사목·제4호·제11조 문언이 같다고 간주한다(신구조문 미대조, 사용자가 판본 공백 제거를 우선함).
- 파일 전체에 붙은 `rampGeometryEffectiveFrom`은 판정에 쓰지 않는다(어느 레코드에 해당하는지 레코드 단위로 표현되지 않았다).
- permitDate가 있으면: 형식이 'YYYY-MM-DD'인 실제 날짜가 아니면 INPUT_ERROR. 날짜가 레코드의 textValidFrom 이상이고 effectiveTo가 null이거나 permitDate ≤ effectiveTo(같은 날 포함)이면 사용 가능, 아니면 그 규칙에 의존하는 항목은 EDITION_NOT_LOADED. 항목 단위로 적용하며 R01·R03만 따로 처리하지 않는다.
- 결과(v1.1.4): 2026-03-31 이후 허가일은 1A 판정 항목 전부 현행 규칙으로 계산된다(판본 공백 없음). 2026-03-31 이전은 제6조 항목(R01·R02·R03·R04·R09·L04)이 EDITION_NOT_LOADED이고, L01은 제3조 레코드(2019-03-01)로 계산된다.
- permitDate가 없으면 현행 판본을 쓰고 editionAssumed:true(7-3). 해당 없음 항목을 포함해 규칙 파일을 쓴 1A 판정 항목 모두에 표시한다. 이것은 통과·실패를 막지 않지만 '검토 완료'를 막는다.

**evidence**: 규칙을 쓴 항목은 evidence.ruleRefs에 사용한 모든 ruleId·edition·textValidFrom을 남긴다. 관문에서 막힌 항목은 evidence.ruleProblems에 막힌 규칙과 이유를 남기고 missingInputs는 비운다(입력 부족이 아니므로).

## 8. 생성기와 판정기의 책임 경계

### 8-1. 책임 표

| 구분 | 생성기 | 판정기 |
|---|---|---|
| 만드는 것 | 후보 도형, omissions, 탐색 기록 | 항목별 판정, 등급, 독립 기록 |
| 하는 일 | 고정 요소를 피해 배치. 막히면 막힘 보고 | 후보의 실제 도형에서 다시 측정 |
| 하지 않는 일 | 합격 판정, 상태 이름 붙이기, 고정 요소 삭제, 요구 대수 추정 | 후보 수정·보정, 후보 생성, 탐색 |
| 법규 수치 | 후보를 만들 때 규칙 데이터를 읽을 수 있음 | 규칙 데이터를 읽어 판정 |
| 상태 | selfReport는 참고용으로 남길 수 있음 | 어떤 selfReport도 판정에 사용하지 않음 |
| 탐색 결과 | SearchOutcome(미발견 포함)을 만듦 | 탐색 결과를 만들지 않음 |
| v0.4 | candidates/rectangular-loop-v04.js를 정형 순환형 생성기로 호출(어댑터가 출력을 Candidate로 변환) | v0.4 내부 함수를 가져다 쓰지 않음 |

### 8-2. 독립성 명세 (무엇을 다시 계산하나)

판정기는 생성기와 **다른 방법**으로 도형을 계산한다. v0.4의 겹침 검사는 꼭짓점 포함과 선분 교차 시험 위주이므로, 판정기는 `00_shared/lib/clipper.js`의 다각형 교집합 면적으로 겹침을 잰다. v0.4 `_internal`(rectInside, rectHits, polyHits, inside, cross 등)을 가져오지 않는다.

| 항목 | 판정기가 후보 도형에서 독립적으로 다시 계산하는 것 | 생성기와 공유하는 것 | 남는 위험 | 보완 |
|---|---|---|---|---|
| G02–G05, G07 | 교집합 면적(다각형 불리언), 포함 여부 | 입력 좌표, 후보 좌표계(회전·원점), Clipper 라이브러리 | 라이브러리 버그, 좌표 변환 오류가 양쪽에 같이 들어갈 수 있음 | 손으로 계산한 좌표의 기대값 시험, 회전 장면 시험 |
| L01 | 칸 도형의 실제 폭·깊이 측정 | 종류별 치수(규칙 데이터) | 규칙 데이터 오류가 양쪽에 같이 들어감 | 규칙 데이터 원문 대조를 사람이 별도로 수행(7-4) |
| R01–R04 | 입력의 폭·길이·고저차로 계산. 생성된 칸 수는 쓰지 않음 | 램프 입력값 | 입력 오류 | 입력 오류 항목(G01) 선행 |
| G06 | 코어와 외곽의 포함 관계 | 입력 좌표 | 입력 좌표계 불일치 | 입력 오류로 분리해 보고 |
| 연결·고리 | **판정하지 않는다.** 고리는 동선 유형의 속성이지 성립 조건이 아니다. 접근이 필요한 항목(R08, P0x, V0x)에서 도형으로 다시 확인 | — | — | — |
| 공통 | 허용오차 값 | 허용오차 값을 양쪽이 서로 다르게 정하면 판정이 어긋남 | 판정기가 허용오차 단일 출처가 된다 | 생성기는 판정기의 허용오차를 읽는다 |

허용오차 값(사용자 승인 2026-10-24, 제안값으로 시작): 겹침 면적 100 mm² 이하는 접촉으로 보아 통과, 길이 비교는 1 mm, 각도는 0.01도.

**허용오차는 법규 완화가 아니다.** 이 값은 좌표 계산의 잡음(선이 딱 붙은 도형이 미세하게 겹쳐 보이는 현상)을 지우기 위한 것이다. 법규 수치(램프 폭, 경사, 반경, 칸 치수 등)의 비교에는 적용하지 않는다. 법규 수치는 규칙 데이터의 값 그대로, 여유 없이 비교한다(기준값과 같으면 통과, 미달이면 실패). 입력 좌표는 mm 정수이므로 측정값은 mm로 반올림해 비교한다.

### 8-3. 판정기가 믿지 않는 것(시험 대상)

valid, status, circulation.hasLoop, hasPerimeterLoop, connected, cycleCount, stallCount, lostCount, columnCount, violations, warnings, rules 문구. 이 값을 바꿔도 판정이 달라지면 안 된다.

## 9. 크리틱 반례 대응표

| # | 반례(42차) | 현재 v0.4 동작 | 계약에서 잡는 항목 | 새 결과 |
|---|---|---|---|---|
| 1 | 램프 폭 3.3m → 80대 합격 | 폭 3.3 이상이면 통과, 대수 분기 없음 | R01 | 램프 체계 전체 80대(분리 없음) → 실패. 대수 없음 → 확인 불가(BRANCH_DIVERGES). 체계 전체 40대 직선 1차로 → 통과 |
| 2 | 층고 생략 → 경사 null인데 합격 | 경고 없음 | R02 | 확인 불가(MISSING_INPUT: floor.heightMm). 등급은 기하 초안 이하 |
| 3 | 직선 램프 20m → 18% | 유효 + 조건부, 대수 유지 | R02 | 실패(평균 18% > 가장 관대한 기준 17%). 등급 없음 |
| 4 | 주차폭 1.8m → 108대 합격 | 폭 방어 없음 | L01 | 종류 미지정 → 확인 불가. 종류 선언 시 → 실패 |
| 5 | 코어를 외곽 밖 (100,100)m → 합격 | 코어 위치 검사 없음 | G06 | 입력 오류(ZONE_MISMATCH). 법규 실패 아님 |
| 6 | 기둥 46개 중 10개를 차로 때문에 삭제 | 삭제 후 출력 | S02, G09 | 제안 기둥 → 구조 예외 확인 불가. 고정 기둥 삭제 → 소실 실패 |
| 7 | 가로 모듈 5.6m 오류(두 대 구간 배제) | 생성 전 거부 | (판정기 소관 아님) | 단계 4 이후 생성기·구조 모듈 계약에서 다룸. 현 단계 범위 밖으로 명시 |
| 8 | 좌우 고리 필수(회차형 불가) | 고리 없으면 INFEASIBLE | 5-3, SearchOutcome | 판정기는 고리를 조건으로 삼지 않음. 고리 없음은 동선 유형의 속성. v0.4 INFEASIBLE → 미발견 |
| 9 | 외곽 이격으로 영역 분리 → 작은 조각 누락 | 큰 조각만 남기고 말없이 버림 | G08 | 기록 없는 소실은 실패(단계 3) |
| 10 | FEASIBLE을 '사용 가능'으로 표시 | 상태 번역 | overall.grade | 기하 초안 등 4장 이름만 사용. 금지 표현 시험 |

## 10. 단계 1의 정확한 시험 목록

공통 기준 장면(기준 장면 B): 외곽 67.2m × 50.4m, 코어 좌하단 (25.2, 33.6)m 크기 8.4 × 8.4m, 램프 착지 (33.6, 4.2)m 방향 90도 길이 30m 폭 6m, 층고 3.6m, v0.4 모듈 8.1 × 8.0m. 아래 시험은 단계 1에서 **새 시험 파일**로 추가한다. 기존 14개 시험은 수정하지 않는다.

기대값은 **이 문서가 기준**이다. 구현 결과에 맞춰 기대값을 고치지 않는다(고쳐야 하면 계약 개정 후).

**합성 집계 시험(v1.1.3)**: T1A-22·23·24·47·48은 39개 레지스트리 전체를 먼저 채운 합성 목록으로 입력을 만든다(기대값 불변). 표에 적은 상태만 바꾸고 나머지는 시험 목적에 맞게 채운다(22·23·24는 언급 없는 영역을 확인 불가 또는 통과로, 표의 조건대로). T1A-47의 대상 영역은 P(5항목: 통과 1, 해당 없음 2, 확인 불가 2), T1A-48의 대상 영역은 S(4항목: (a) 통과 2 + 해당 없음 2 (b) 해당 없음 4 (c) 통과 1 + 미구현 1 + 해당 없음 2)다. domainSummary의 수는 보충된 항목까지 포함해 센다.

**10-1 공통 기본 입력(v1.1.3)**: 표에 따로 적지 않은 값은 아래와 같다. 표의 입력은 이 기본값을 바꾸는 부분만 적는다. project {permitDate '2026-10-24', parkingKind 'noeoe', parkingLots [A 40대], rampSystems [S: A]}, floor {levelMm 0, heightMm 3600}, 램프 1개 {systemId S, shape 직선 길이 30m, lanes 1, operation 'oneWay', separatedInOut false, 법령상 차로 너비 3.3m, wallToCurbMm 좌우 300, 연석 높이 좌우 100}, entrances 없음, stalls.items 없음. "대수 입력 없음"은 parkingLots와 rampSystems를 모두 지운 것이다. 곡선 시험은 shape {type curve, 길이 24m}, lanes 2, 법령상 너비 6.5m로 바꾼다. 연석 시험에서 한쪽만 적으면 다른 쪽은 기본값이다. missingInputs 기대값은 "포함" 검사다.

### 10-1. 단계 1A — 도형 계산이 필요 없는 부분 (Fable 시험 구현 대상)

| ID | 입력 | 기대 결과 |
|---|---|---|
| T1A-01 | 램프 직선, 법령상 차로 너비 3.3m, 램프 체계 전체 80대, 분리 없음, 1차로 | R01 실패 (사목 1) 위반, evidence에 합계 80과 규칙 ID) |
| T1A-02 | 직선, 법령상 차로 너비 3.3m, 램프 체계 대수 입력 없음 | R01 확인 불가(BRANCH_DIVERGES), missingInputs에 ramp.systemId, project.parkingLots[].totalStalls |
| T1A-03 | 직선, 3.3m, 램프 체계 전체 40대, 1차로·진입출 분리 없음 | R01 통과 (출입구 L04는 별도로 확인 불가) |
| T1A-04 | 직선, 법령상 차로 너비 6.0m, 대수 입력 없음, **lanes 2 명시**(v1.1.3 입력 보강: 1차로가 명시되면 50대 이상·미분리 분기가 실패하므로 5-2의 1번에 따라 2차로 명시가 전제) | R01 통과 (모든 분기 통과, 5-2의 1번). 곡선이면 6.0m < 6.5m이므로 직선 한정 |
| T1A-05 | 직선, 3.3m, 램프 체계 전체 40대, operation 'twoWay' | R01 실패 (2차로 6m 미달) |
| T1A-06 | 층고 입력 없음, segments 없음 | R02 확인 불가(MISSING_INPUT floor.heightMm) |
| T1A-07 | 직선, 층고 3.6m, 길이 20m (평균 18%) | R02 실패 (evidence 18%, 비교 기준 17%) |
| T1A-08 | 직선, 층고 3.6m, 길이 30m (평균 12%), segments 없음 | R02 확인 불가(구간 최대 미확인). 실패 아님 |
| T1A-09 | 직선, segments 3개 중 하나가 18% | R02 실패, 실패 구간 id가 evidence에 |
| T1A-10 | 곡선, 평균 15%, segments 없음 | R02 실패(곡선 기준 14% 초과) |
| T1A-11 | 곡선, 내변반경 4.5m, 대수 입력 없음 | R03 실패 (5m 미만이라 모든 분기에서 실패) |
| T1A-12 | 곡선, 내변반경 5.5m, 대수 입력 없음 | R03 확인 불가(BRANCH_DIVERGES) |
| T1A-13 | segments 없음. (a) 램프 체계 전체 40대 (b) 80대 (c) 대수 없음 | (a) R04 **해당 없음**(applicability NOT_APPLICABLE, verdict null, reason NOT_APPLICABLE, 통과 수에 포함되지 않음) (b) 확인 불가(MISSING_INPUT ramp.segments) (c) 확인 불가(BRANCH_DIVERGES) |
| T1A-14 | 칸 폭 1.8m, 종류 미지정, 기본값 없음. **T1A-14–20·35·36의 L01 시험은 options.mode 'numeric-test'와 칸별 또는 stalls.orientation을 명시**(v1.1.3 입력 보강, 기대값 불변) | L01 확인 불가(OPEN_BRANCH_SET) |
| T1A-15 | 칸 폭 1.8m, declaredType 'general' | L01 실패 |
| T1A-16 | 칸 폭 1.8m, declaredType 'compact' | L01 실패(경형 2.0m 미달) |
| T1A-17 | 칸 2.0 × 3.6m, declaredType 'compact' | L01 통과 |
| T1A-18 | 칸 2.5 × 5.0m, 종류 미지정, project.stallDefaultType 'general' | L01 통과(기본값 적용 표시) |
| T1A-19 | 칸 2.5 × 5.0m, declaredType 'accessible' | L01 실패(장애인형 3.3m 미달) |
| T1A-20 | 규칙 상태가 needs-recheck 또는 unverified인 규칙에 의존하는 항목 | 확인 불가(RULE_UNVERIFIED). 통과 불가 |
| T1A-21 | permitDate 있음 / 없음 | 있음: 해당 일자 판본 선택. 없음: 현행 판본 + editionAssumed 표시, overall이 '검토 완료'가 될 수 없음 |
| T1A-22 | 합성 항목 목록: 도형 전부 통과 + 나머지 확인 불가 | overall '기하 초안' |
| T1A-23 | 합성 항목 목록: 도형 통과 + 한 영역 전체 통과 + 다른 영역 확인 불가 | overall '부분 검토' |
| T1A-24 | 합성 항목 목록: 전부 통과. 같은 목록에 해당 없음 항목이 섞인 경우도 | 두 경우 모두 overall '검토 완료'. 단 editionAssumed가 있으면 '부분 검토'. 해당 없음은 통과 수에 더해지지 않음 |
| T1A-25 | 합성 항목 목록: 실패 1건 이상 / 입력 오류 1건 이상 | 등급 없음. 문구에 '기하 초안·부분 검토·검토 완료'가 나오지 않음 |
| T1A-26 | 모든 출력 문자열 검사 | '사용 가능', '법규 충족', '최적안', '배치 불가'가 후보 한 장 판정 결과에 나타나지 않음 |
| T1A-27 | 판정기가 SearchOutcome 외에서 NOT_FOUND를 만들 수 있는지 | 항목 verdict에 NOT_FOUND가 없음 |
| T1A-28 | 전체 항목 레지스트리 | G·R·V·S·P·L 전 항목 ID가 결과에 존재하며 미구현은 NOT_IMPLEMENTED로 나온다. 모든 항목이 applicability 필드를 가진다 |
| T1A-29 | 수치에 NaN·음수·문자열 | INPUT_ERROR(G01 또는 해당 필드), 예외로 죽지 않음 |
| T1A-30 | 규칙 데이터의 수치를 바꿨을 때(예: 경사 한도 17→16) | 경계값 입력의 결과가 바뀜(수치가 코드가 아니라 데이터에서 온다는 증거) |
| T1A-31 | 곡선 내변반경 5.5m. 같은 램프 체계에 주차장 A 20대 + 주차장 B 30대(합계 50) / B가 31대(합계 51) | 합계 50: R03 통과(50대 이하 5m). 합계 51: R03 실패(6m 필요). 정확히 50대에서 R01의 50대 이상 기준과 R03의 50대 이하 기준이 동시에 해당함도 evidence로 확인 |
| T1A-32 | 서로 독립된 램프 체계 S1(주차장 40대)과 S2(주차장 80대), 두 곡선 램프 모두 내변반경 5.5m | S1의 램프는 통과, S2의 램프는 실패. 서로 영향 없음 |
| T1A-33 | 같은 입력에서 후보의 주차칸 수만 40, 80, 200으로 바꿔 판정 | 판정 결과가 모두 같다(후보 칸 수와 층별 대수는 50대 기준에 쓰이지 않음) |
| T1A-34 | 직선 램프, 램프 체계 전체 40대. (a) 벽 사이 3.0m만 (b) 벽 사이 3.3m만 (c) 벽 사이 4.0m + 좌우 벽에서 연석 300mm (d) 벽 사이 3.8m + 좌우 300mm (e) 법령상 차로 너비 직접 3.3m | (a) 실패 (b) 확인 불가(연석 위치·단면 없음) (c) 통과(4.0 − 0.6 = 3.4m) (d) 실패(3.2m) (e) 통과 |
| T1A-35 | 비평행, declaredType 'motorcycle', 1.0 × 2.3m | L01 통과 |
| T1A-36 | declaredType 'compact', orientation 'parallel', 1.7 × 4.5m | (v1.1.4) L01 통과(평행 경형 1.7×4.5m 확정). 평행 이륜은 needs-recheck라 RULE_UNVERIFIED |
| T1A-37 | permitDate 2026-03-30, 램프 폭·반경 항목 | R01·R03 확인 불가(EDITION_NOT_LOADED: 제1527호 시행일 2026-03-31 이전 판본은 규칙 데이터에 없음). 같은 판본 규칙이 R02·R04·R09·L01·L04에도 적용됨은 T1A-58 |
| T1A-38 | 곡선, 내변반경 5.5m, 램프 체계 전체 80대 / 40대 | 80대는 R03 실패(6m 필요), 40대는 통과(5m 필요) |
| T1A-39 | parkingKind 'buseol', 해당 주차장 총 대수 8 이하, facilityUse '업무시설' | (v1.1.4) R01·R03·L04를 제6조로 판정(RULE_UNVERIFIED 아님), evidence에 "제11조제1항 준용". 제11조제5항은 지평식 한정이라 지하에 적용하지 않음 |
| T1A-40 | parkingKind 'buseol', facilityUse '단독주택' 또는 '다세대주택', **곡선 램프**(v1.1.3 입력 보강: 직선 램프면 R03은 준용 여부와 상관없이 모든 분기가 해당 없음이라 NOT_APPLICABLE이 맞다) | R01·R03·L04 확인 불가(BRANCH_DIVERGES, 제11조제1항 단서: 시장·군수·구청장 인정 시 준용 제외. 7-5 제11조 단계 (3)) |
| T1A-41 | parkingKind 'buseol', 해당 주차장 총 대수 9 이상, 그 밖의 용도 | R01·L04(곡선 램프면 R03도)를 제6조 기준으로 판정하되 evidence에 "제11조제1항 준용" 표시 |
| T1A-42 | 연석 위치·높이. (a) 벽에서 연석까지 250mm (b) 300mm (c) 높이 99mm (d) 100mm (e) 149mm (f) 150mm (g) 151mm (h) 연석 입력 없음 | (a) R09 실패 (b) 통과 (c) 실패 (d) 통과 (e) 통과 (f) **통과** (g) 실패 (h) 확인 불가 |
| T1A-43 | 연석 가로폭을 0, 150, 300mm로 바꿔 R01·R09 판정 | R01·R09 결과가 동일(연석 부분은 법령상 차로 너비에 포함, 가로폭은 법규 상수가 아님). 규칙 데이터와 판정기 소스에 연석 가로폭 수치가 없음(소스 검색 시험) |
| T1A-44 | 입력 비수정. 연석 가로폭이 커서 연석 안쪽 통과 폭(vehiclePassableWidthMm)이 음수가 되는 입력 | 판정 전후로 입력 객체가 동일(deep-equal). R01은 법규 기준만으로 판정하고, V06은 확인 불가(NOT_IMPLEMENTED). 연석 폭을 줄여 통과시키는 경로가 없음 |
| T1A-45 | 직선 램프(곡선 부분 없음), 내변반경 입력 없음, 램프 체계 대수 입력 없음 | R03 applicability NOT_APPLICABLE, verdict null, reason NOT_APPLICABLE. 대수가 없어도 모든 분기가 해당 없음이므로 확정(BRANCH_DIVERGES 아님). 통과·실패·확인 불가 집계 불변, notApplicable +1 |
| T1A-46 | 곡선 램프. (a) 내변반경 6.0m, 램프 체계 전체 80대 (b) 내변반경 입력 누락, 체계 80대 (c) shape.type 입력 없음 | (a) R03 APPLICABLE, verdict PASS (b) APPLICABLE, 확인 불가(MISSING_INPUT 내변반경) (c) **applicability APPLICABLE(검사 대기 포함 의미), verdict UNDETERMINED, reason MISSING_INPUT, missingInputs에 ramp.shape.type**. 해당 없음 아님(v1.1.3 확정, 5-5 R03) |
| T1A-47 | 집계: 한 영역에 통과 1, 해당 없음 2, 확인 불가 2인 항목 목록 | domainSummary가 pass 1, notApplicable 2, undetermined 2, fail 0, inputError 0. 해당 없음이 다른 네 값 어디에도 더해지지 않음. 영역 전체 통과 아님 |
| T1A-48 | 영역 완료 계산. (a) 통과 2 + 해당 없음 1 (b) 해당 없음만 3 (c) 통과 1 + 미구현 1 + 해당 없음 1 (d) 램프 입력 자체가 없음 | (a) 영역 전체 통과 (b) '해당 없음 영역', 기하 초안·부분 검토 조건에 세지 않음 (c) 영역 전체 통과 아님(미구현 때문) (d) R 항목 확인 불가(MISSING_INPUT ramps), 해당 없음 아님 |

**v1.1.3 추가 회귀시험 (T1A-49 – T1A-66).** 상위 검토가 찾은 오류마다 1개 이상. 규칙 데이터를 바꾸는 시험은 메모리 안의 복사본을 고치고 파일은 건드리지 않는다.

| ID | 입력 | 기대 결과 |
|---|---|---|
| T1A-49 | 규칙 상태 관문. 각 정상 입력(R01·R02·R03·R09·L01·L04가 PASS 또는 FAIL을 내는 입력)에서 그 항목이 쓰는 규칙 하나를 (a) status 'needs-recheck' (b) secondCheck 'pending' (c) 레코드 source 삭제로 바꿈 | 여섯 항목 모두 UNDETERMINED + RULE_UNVERIFIED. PASS·FAIL 없음. evidence.ruleProblems에 해당 ruleId |
| T1A-50 | 규칙 손상·누락. (a) 필요한 ruleId 삭제 (b) 같은 ruleId 두 개 (c) quantity.value NaN·문자열·음수 (d) unit 변경(L01 제외, 칸 치수 레코드는 unit이 없음) (e) ruleSet null, rules 아님 | 예외 없음. 관련 항목 UNDETERMINED + RULE_UNVERIFIED. (e)는 직선 R03을 포함해 1A 판정 항목 전부 |
| T1A-51 | R01 차로 수 미입력. 직선, 법령상 너비 3.3m, 체계 40대, operation·lanes 없음 | BRANCH_DIVERGES(1차로 통과, 2차로 실패). evidence.branches에 두 분기 |
| T1A-52 | R01 50대 이상 곡선. (a) 곡선 2차로 6.0m, 80대, 분리 false (b) 곡선 2차로 6.5m, 80대, 분리 false (c) 직선 1차로 3.3m, 80대, 분리 true (d) 직선 1차로 3.3m, 80대, 분리 미입력 (e) lanes 1 + operation twoWay | (a) FAIL(다목 곡선 2차로 6.5m) (b) PASS (c) PASS(분리로 사목 추가 의무 해소, 다목 기본 폭은 충족) (d) BRANCH_DIVERGES (e) INPUT_ERROR |
| T1A-53 | R01 대수 미상이지만 모든 분기 실패. 직선, 법령상 너비 3.0m, 대수·차로 수·분리 모두 미입력 | FAIL(어느 분기든 3.3m 미달). BRANCH_DIVERGES 아님 |
| T1A-54 | L04 분기. (a) 노외, 대수 미상, 출입구 폭 1.0m (b) 대수 미상, separated true, 3.5m (c) 80대, 3.5m, separated 미입력 (d) 80대, 3.5m, separated 미입력, 연결 램프 separatedInOut true | (a) FAIL (b) PASS (c) BRANCH_DIVERGES (d) BRANCH_DIVERGES(램프 값 복사 금지) |
| T1A-55 | R02 고저차 출처. 직선 길이 20m, segments 없음, floor.heightMm 3600. (a) connects upper 0 / lower -3000 (b) connects lower만 있음 (c) connects 없음 | (a) UNDETERMINED(평균 15%, 층고로 계산했다면 18%였을 값이 쓰이지 않음, evidence 고저차 3000) (b) MISSING_INPUT, 층고로 대체하지 않음 (c) FAIL(18%) + overall.notes.assumptions와 evidence에 층고 가정 기록 |
| T1A-56 | R02 구간 종류. (a) kind 누락 구간 15% (b) kind 누락 18% (c) kind 'ramp' 같은 모르는 값 (d) 인접 구간 고도 불연속 (e) 전체 shape.type 'straight'인데 kind 누락 15% (f) shape curve, curve 구간 2800/20000 (g) 같은 구간 2801/20000 | (a) BRANCH_DIVERGES(곡선이면 실패, 직선이면 통과) (b) FAIL (c) INPUT_ERROR (d) INPUT_ERROR (e) (a)와 같음(전체 형상을 구간에 복사하지 않음) (f) PASS(정확히 14%, 정수 비교) (g) FAIL |
| T1A-57 | 음수 고도와 음수 치수. (a) floor.levelMm -7200, segments 고도 -3600→-7200, 길이 30m (b) segment.lengthMm -30000 (c) 법령상 너비 -3300 | (a) INPUT_ERROR 없음, R02는 12% 기준 계산(구간 kind 명시 시 PASS) (b) R02 INPUT_ERROR, G01 INPUT_ERROR (c) R01 INPUT_ERROR |
| T1A-58 | 판본 일관성. (a) permitDate 2026-03-30 (b) 2026-05-01, 연석 정상 (c) '2026-13-01' | (v1.1.4) (a) R01·R02·R03·R04·R09·L04 모두 EDITION_NOT_LOADED(R04는 대수 40이어도 해당 없음보다 판본이 우선), L01은 제3조 판본(2019-03-01)으로 판정 (b) 판본 공백 없음: R01·R09·L01·L04 PASS, 직선 R03 NOT_APPLICABLE, R04 NOT_APPLICABLE(40대), R02는 평소대로 (c) 관련 항목 INPUT_ERROR |
| T1A-59 | 잘못된 형태의 입력. (a) ramps [null] (b) segments [null] (c) parkingLots [null] (d) entrances [null] (e) numeric-test, stalls.items [null] (f) input 자체 undefined (g) ramps가 객체 | 예외 없음. 해당 항목 INPUT_ERROR, G01 INPUT_ERROR(evidence.fields). (f)도 39개 ID가 있는 결과 틀 반환. 다른 독립 항목은 계속 판정 |
| T1A-60 | 램프 체계 검사. (a) lotIds [] (b) lotIds ['A','A'] (c) rampSystems id 중복 (d) parkingLots id 중복 (e) totalStalls 20.5 / '20' / -1 (f) 주차장 A가 체계 S1·S2에 모두 속함 | (a)–(e) 해당 대수를 쓰는 항목 INPUT_ERROR, 조용히 보정·중복 제거 없음 (f) 허용, 각 체계에서 A를 한 번씩 합산 |
| T1A-61 | L01 방향 상속. numeric-test. (a) stalls.orientation 'parallel', 칸 orientation 없음, 경형 1.7×4.5 (b) 둘 다 없음 (c) 칸 'perpendicular', stalls 'parallel', 경형 2.0×3.6 (d) orientation 'diagonal' | (v1.1.4) (a) PASS(평행 경형 기준을 상속) (b) MISSING_INPUT (c) PASS(칸 값 우선) (d) INPUT_ERROR |
| T1A-62 | L01 모드 경계. (a) options.mode 없음(candidate), stalls.items 있음 (b) numeric-test (c) numeric-test, items [] | (a) (v1.1.5 정정) G01 입력 오류 없음. L01은 stalls.items를 읽지 않고 후보 도형을 쓴다: 후보 칸 목록이 비면 UNDETERMINED + MISSING_INPUT(candidate.geometry.stalls), 칸 polygon이 잘못되면 INPUT_ERROR. overall.mode 'candidate' (b) L01 판정, evidence.measurementSource 'declared-test-values', geometryVerified false, overall.grade null, overall.mode 'numeric-test' (c) MISSING_INPUT |
| T1A-63 | R03 범위와 모순. (a) 곡선 3.5m, 대수 40 (b) (a)에서 메모리 복사본의 이륜 반경 레코드를 삭제 (c) shape.type 'straight' + curve 구간 | (a) FAIL(이륜 3m 규칙을 쓰지 않음) (b) (a)와 동일(이륜 레코드에 의존하지 않음) (c) INPUT_ERROR |
| T1A-64 | G01 1A 한계. (a) 모든 입력 정상, numeric-test (b) 램프 폭 문자열 (c) vehiclePassableWidthMm 음수만 있음 | (a) G01 UNDETERMINED + NOT_IMPLEMENTED, evidence.checked 'input-format-and-numbers', evidence.remaining 'polygon-validity', PASS 아님 (b) G01 INPUT_ERROR + evidence.fields에 경로 (c) G01 INPUT_ERROR 아님(T1A-44와 같음). (v1.1.5 정정) candidate 모드이고 외곽이 없으므로 G01은 UNDETERMINED + MISSING_INPUT(floor.outline). T1A-28의 G02도 같은 이유로 MISSING_INPUT |
| T1A-65 | 집계 방어(computeOverall·summarize). (a) 빈 목록 (b) 7개 항목만 전부 PASS (c) 같은 (id, subjectId) PASS·FAIL 두 행 (d) 항목 하나 editionAssumed true + options editionAssumed false (e) 입력 배열 | (a)(b) grade null 또는 '검토 완료' 아님, notes.missingItemIds에 누락 ID (c) 데이터 오류로 처리, PASS 선택 안 함 (d) overall.editionAssumed true (e) 원본 배열·항목 객체 불변 |
| T1A-67 | (v1.1.4, 48차 반례) ramps[0].systemId가 숫자 123 등 잘못된 형식. 직선 램프와 곡선 반경 4.5m·6.5m | 그 램프의 R01·R02·R03·R04·R09 모두 INPUT_ERROR(직선 R03 해당 없음·곡선 R03 통과/실패로 확정하지 않음), G01 INPUT_ERROR. ramp.systemId는 램프 자신의 필드이므로 형식 오류는 그 램프 항목 전부의 입력 오류다 |
| T1A-66 | 설명 문구. 1A 정상·실패·확인 불가·해당 없음·미구현이 섞인 evaluate 결과 | 모든 항목 message가 비어 있지 않은 한국어. FAIL은 측정값·기준값, UNDETERMINED는 부족한 입력/근거/구현, NOT_APPLICABLE은 적용되지 않는 근거 포함. scopeLabel에 '계약 범위 한정이며 인허가 적합을 뜻하지 않음'과 미검증 범위. notes가 객체이고 missingItemIds·assumptions·limitations 배열을 가짐 |

이 표는 상위 검토 오류 10건에 다음과 같이 대응한다: 1 규칙 관문 → 49·50, 2 분기 → 51–54, 3 고저차·구간 → 55·56, 4 음수 고도 → 57, 5 잘못된 형태 → 59, 6 방향 상속 → 61, 7 판본 → 58·37, 8 체계 검사 → 60, 9 집계 → 65, 10 문구 → 66. 모호함 결정은 62(L01 모드), 63(이륜 램프 범위 밖), 64(G01), 46(c)·66(R03 표기), T1B-01(G 영역)로 고정한다.

### 10-2. 단계 1B — 도형 계산이 필요한 부분 (Codex 구현 대상)

| ID | 입력 | 기대 결과 |
|---|---|---|
| T1B-01 | 기준 장면 B + v0.4 후보를 어댑터로 변환. (v1.1.5 입력 보강) 램프 몸체의 외곽 밖 부분(y<0)을 ramps[0].roadConnection.outsidePolygon으로 선언 | G01–G05, G07 통과. 선언이 없거나 일부만 덮으면 G07 실패. R01·R02는 어댑터 입력의 실제 판정 결과(v0.4 입력은 연석·대수가 없어 R01 확인 불가 예상, R02 확인 불가). G08–G10 NOT_IMPLEMENTED. **overall.grade null**(G 영역이 영역 전체 통과가 아님, 4-1 v1.1.3 결정), scopeLabel에 'G01–G07 검사, G08–G10 미검증' 표시. v1.1.3에서 종전 '기하 초안' 기대값 정정 |
| T1B-02 | 후보에서 칸 하나를 차로 안으로 20cm 이동(손으로 만든 후보) | G03 실패, 위치가 evidence에 |
| T1B-03 | 두 칸을 겹치게 | G05 실패 |
| T1B-04 | 칸 하나를 코어 안으로 | G04 실패 |
| T1B-05 | 칸 하나를 외곽 밖으로 | G02 실패 |
| T1B-06 | 칸 변이 차로 변과 정확히 접함 | 통과(접촉은 겹침이 아님) |
| T1B-07 | 코어를 (100,100)m에 두고 relation 미선언 | G06 입력 오류(ZONE_MISMATCH). overall 등급 없음, 법규 실패 0건 |
| T1B-08 | 같은 코어에 relation 'external-separate', 문 입력 없음 | G06 통과, P02 확인 불가. 실패 0건 |
| T1B-09 | 코어가 외곽 경계에 걸침, 미선언 | G06 입력 오류(ZONE_STRADDLE) |
| T1B-10 | 램프 몸체와 코어가 겹침 | G07 실패 |
| T1B-11 | **독립성**: 정상 후보의 selfReport를 valid:true·status 'FEASIBLE'로 두고 칸 하나를 겹치게 | G03/G05 실패 (selfReport 무시) |
| T1B-12 | **독립성**: 도형은 정상인데 selfReport를 valid:false·hasLoop:false로 변조 | 판정 결과가 변조 전과 동일 |
| T1B-13 | **회전**: 기준 장면 전체를 30도·90도 회전 | 항목별 판정이 같음 |
| T1B-14 | **손계산 장면**: 외곽 20m × 20m, 칸 2.5 × 5.0m 4개를 직접 배치 | 각 항목 기대값이 손계산과 일치(라이브러리·좌표 오류 방어) |
| T1B-15 | v0.4 INFEASIBLE 결과를 어댑터에 통과 | SearchOutcome NOT_FOUND + 탐색 범위 기록. '배치 불가' 문구 없음 |
| T1B-16 | 기존 v0.4 시험 14개 | 변경 없이 모두 통과(회귀) |
| T1B-17 | (v1.1.5, 50차 반례) 외곽 20m 경계에서 코어가 2m 안·3m 밖(안 10,000,000mm², 밖 15,000,000mm²), relation 미선언·abutting·inside·external-separate | 모두 G06 INPUT_ERROR(ZONE_STRADDLE) |
| T1B-19 | (v1.1.6, 52차 반례) 외곽 밖 abutting 코어, 경계와의 간격 0·0.5·0.999·1·1.001·2mm | 1mm 이하 G06 통과, 1mm 초과 INPUT_ERROR(ZONE_MISMATCH) |
| T1B-20 | (v1.1.6, 52차 반례) 기준 장면 B에서 같은 id 램프 입력 두 개, 하나에만 roadConnection 선언 | G07 INPUT_ERROR(evidence.fields에 두 id 경로). 선언 하나를 골라 통과시키지 않음 |
| T1B-21 | (v1.1.7, 54차 반례) T1B-19 장면(안쪽 면 외곽)의 외곽과 코어를 함께 30도·90도 회전, 간격 0·1·1.01·2mm | 회전 전과 같음: 1mm 이하 G06 통과, 초과 INPUT_ERROR(ZONE_MISMATCH) |
| T1B-22 | (v1.1.8) inner 외곽(20×20m)과 outer 외곽(20.6×20.6m, 벽 300mm)에서 판정 경계로부터 간격 0·1·1.01·2mm인 abutting 코어, 외곽과 함께 0·30·90도 회전 | 모든 경우 1mm 이하 G06 통과, 초과 INPUT_ERROR(ZONE_MISMATCH). 간격은 벽 두께를 반영한 판정 경계와 코어 사이 거리 |
| T1B-23 | (v1.1.9) 20×20m 외곽에 둘째 외곽 다각형: (a) 5m×20m 부분 겹침 (b) 경계선 접촉 (c) 꼭짓점 접촉 (d) 서로 떨어짐 (e) 완전 포함(구멍) | (a) G01 INPUT_ERROR, 근거에 floor.outline.polygons[0]·[1], G02·G06·G07도 INPUT_ERROR (b)–(e) G01·G06 통과 |
| T1B-18 | (v1.1.5) candidate 모드에서 floor.outline 누락 | G01·G02·G06·G07 UNDETERMINED + MISSING_INPUT(floor.outline). G03–G05·L01은 계속 판정. 코어와 겹친 램프는 G07 FAIL |

단계 1의 합격: 위 T1A 67개(v1.1.4, T1A-28·62·64는 v1.1.5 정정값)와 T1B 23개(v1.1.9, T1B-23은 (a)–(e) 다섯 사례. 1B 시험 파일 기준 32개, 보조 포함) 전부 통과, 기존 14개 통과, v0.4 생성기·underground.html·기존 시험 파일 변경 0.

## 11. Fable 시험 구현 범위와 상위 모델 검토 기준

> **v1.1.3 현재 작업 지시**: 11-1–11-5는 종전 Fable 시험 위임의 기록이다. 지금의 단계 1A 수정 구현은 **사용자 승인(2026-10-24, 이번 단위 한정)으로 Claude 새 세션**이 맡고, Codex 또는 Astra가 읽기 전용으로 검토한다. 통합 소유권은 Codex에 남고, 1B 담당은 다시 정한다. 허용 파일은 11-2의 세 파일 그대로이며, 규칙 JSON은 7-5의 textValidFrom 메타데이터 추가만 허용한다. 시험 파일은 10-1의 입력 보강(T1A-04·14–20·22·23·24·35·36·40·47·48)과 T1A-46(c) 기대값 정정, T1A-49–66 추가만 허용한다. 그 밖의 기대값은 바꾸지 않는다. 다음 단계 진입 조건은 11-6. 11-2의 범위·착수 전제는 이 상자로 대체한다(범위 T1A-01–66). 11-3의 규칙과 11-4의 검토 기준은 "Fable"을 "Codex(구현자)"로 바꿔 그대로 적용한다.

### 11-1. 소유권 (사용자 결정 2026-10-24)

- 전체 구현·통합: **Codex 유지**. Fable에 엔진 소유권을 이전하지 않는다.
- Claude 상위 모델: 원칙·계약·골든케이스 기준 설계.
- Fable: 계약 확정 뒤 **작은 단위를 시험적으로** 구현.
- Fable 첫 결과: **다른 상위 모델 + Codex**가 검증한 뒤 후속 범위 결정.

### 11-2. Fable 시험 단위: "단계 1A"

**착수 전제(사용자 결정):** 계약 확정과 법규 원문 대조(상위 모델 2차 확인 포함)는 v1.1.1로 끝났다. 남은 전제는 사용자가 단계 1A 시험 구현을 **다시 승인**하는 것이다. 이 문서의 승인과 단계 1A 구현 승인은 별개다. 구현 소유권은 Codex에 있고 Fable은 이 단위만 시험적으로 맡는다.

범위: 10-1의 T1A-01 – T1A-48에 해당하는 코드만.
- 판정 결과 형식(4장), 항목 레지스트리(전 항목, 미구현은 NOT_IMPLEMENTED)
- 분기 판정 규칙(5-2), 규칙 데이터 읽기·판본 선택(7장)
- 항목 R01–R04, R09, L01, L04 (도형 계산 없이 입력 수치만 사용)
- overall 등급 함수와 금지 표현 검사
- 적용 여부(applicability) 필드와 해당 없음 집계, 영역 완료·영역 전체 통과 계산(5-4)

범위 밖(건드리지 않음): 도형 계산(G 항목), v0.4 어댑터, 기존 파일 전부, underground.html, 규칙 데이터의 status·secondCheck 값 변경(7-4 표의 값을 그대로 옮긴다), 동선 유형 생성기.

허용 파일(확정): `04_parking/src/underground/evaluators/evaluator-core.js`(브라우저 전역 UGEvaluator + Node module.exports 공용), `04_parking/src/underground/rules/kr-parking-rules-2026-07-27.json`, `04_parking/tests/underground/evaluators/evaluator-stage1a.test.cjs`. 그 밖의 파일 수정 금지. 보조 파일이 필요하면 먼저 보고한다.

### 11-3. Fable에 주는 규칙

1. 시험을 먼저 쓰고, 실패하는 것을 확인한 뒤 구현한다(실패 로그를 보고에 첨부).
2. 기대값은 이 계약(10-1)에서 가져온다. 구현에 맞춰 기대값을 고치지 않는다. 계약과 충돌하거나 모호하면 멈추고 질문한다.
3. 법규 수치를 코드에 쓰지 않는다. 규칙 JSON에서만 읽는다.
4. 계약에 없는 항목·상태·필드를 만들지 않는다. 필요하면 제안으로 보고한다.
5. 자기 결과를 '완료'로 승인하지 않는다. 보고는 "시험 N개 통과, 계약과 다르게 해석한 곳 목록, 막힌 곳, 모호했던 곳" 형식.
6. 기존 14개 시험을 실행해 그대로 통과함을 보고에 첨부한다.

### 11-4. 상위 모델·Codex 검토 기준

검토자는 구현자(Fable)와 다른 모델이어야 한다. 아래 모두를 확인한다.

| # | 검토 항목 | 방법 |
|---|---|---|
| 1 | 시험이 계약 기대값과 같은가 | 10-1 표와 시험 파일을 항목별로 대조. 기대값이 구현에 맞춰 바뀌었는지 diff로 확인 |
| 2 | 변경 범위가 허용 파일 안인가 | git diff --stat. 기존 파일 변경 0 |
| 3 | 법규 수치가 코드에 있는가 | 코드 전체에서 17, 14, 3300, 6000 같은 수치 검색 |
| 4 | 변이 시험 | 규칙 JSON 수치를 바꾸거나 분기 조건을 뒤집었을 때 시험이 **실패**하는가. 통과하면 시험이 약한 것 |
| 5 | 분기 규칙을 지키는가 | 입력을 지웠을 때 추정으로 통과·실패를 내지 않는가(T1A-02, 04, 06, 08, 14) |
| 6 | 금지 표현·상태 | 출력 전체에 금지 문구 없음, NOT_FOUND가 후보 판정에 없음 |
| 7 | 정직성 | 미구현 항목이 통과로 나오지 않음. '검토 완료'가 도달 불가능함을 확인 |
| 8 | 크기 | 작은 단위인가. 계약에 없는 기능이 섞였는가 |
| 9 | Codex 통합 | Codex가 1B(도형 판정)와 연결해 T1B 시험이 통과하는가. 결과 형식이 그대로 맞물리는가 |
| 10 | 검토 결과 | 합격 / 수정 후 재검토 / 불합격(원인). Fable 후속 범위(1B 일부, 단계 3 일부) 결정은 사용자 |

### 11-5. 상위 모델이 맡는 것과 Fable이 맡는 것 (요약)

| 일 | 맡을 모델 |
|---|---|
| 건축계획 원칙, 동선 유형 정의, 계약 개정, 골든케이스 채점 기준 | 상위 모델 |
| 규칙 데이터 원문 대조와 verified 부여 | 상위 모델 또는 사용자(사람 확인 포함) |
| 계약이 확정된 작은 단위 구현, 시험 구현 | Fable(시험적), 통합은 Codex |
| 도면 읽기 | 보조. 직접 읽은 사실과 해석을 분리해 기록, 확정은 사용자·상위 모델 |
| 단계 종료 심사 | 구현자와 다른 상위 모델 |

### 11-6. 단계 1B 진입 조건 (v1.1.3)

아래가 **모두** 충족되기 전에는 1B(도형 판정, 어댑터, L01 도형 측정, G01 다각형 검사)를 시작하지 않는다.

1. 수정 구현 후 T1A-01–T1A-67 전부 통과, 기존 v0.4 회귀 14개 통과. 실행 기록을 보고서에 첨부.
2. 변이 확인: 종전 5개(법규 수치, 50대 분기, 150mm 경계, 해당 없음 집계, 통과→해당 없음)에 더해 (a) 규칙 status 관문 제거 (b) connects 우선순위 뒤집기 (c) 음수 고도 거부 (d) orientation 상속 제거 (e) computeOverall 레지스트리 검사 제거를 각각 넣었을 때 관련 시험이 실패하고, 복구 후 전부 통과.
3. 변경 파일이 11장 머리 상자의 세 파일 안이고, 규칙 JSON의 수치·status·secondCheck·citation 변경 0(diff로 확인).
4. 구현자(Codex)와 다른 모델이 이 계약 v1.1.3 대비 읽기 전용 검토를 하고 '합격' 판정. 이번 v1.1.3 마무리 작성자(Claude)가 검토하면 계약 작성자와 검토자가 겹치므로 Astra 또는 사용자 지정 모델을 우선한다.
5. 12-4의 6번(Codex가 `00_shared/lib/clipper.js` 경로와 불러오기 가능 여부를 확인)이 끝남.
6. 사용자가 1B 착수를 명시적으로 승인(12-4의 5번).

1B에서 처음 하는 일: T1B-01–16(T1B-01은 v1.1.3 정정값), G01 다각형 검사, G02–G07, L01 candidate 모드 측정, v0.4 → Candidate 어댑터. 1B 종료 후에도 G08–G10이 미구현이면 overall.grade는 null이다(4-1).

## 12. 결정 기록

### 12-1. 사용자 승인 2026-10-24 (v1.0)

| # | 결정 | 내용 | 반영 |
|---|---|---|---|
| 1 | 법규 원문 대조 담당 | 상위 모델이 담당. 공식 원문만 근거. 단계 1 항목만 먼저. 확정하지 못한 값은 확인 불가 유지 | 7-4 |
| 2 | 허용오차 | 제안값으로 시작. 법규 완화가 아니라 계산 잡음 제거용 | 8-2 |
| 3 | 평균 경사 | 원문 대조 전에는 명백한 초과만 실패. 불명확하면 확인 불가 | R02 (대조 후 안전함 확인, 유지) |
| 4 | 곡선 반경 기준 대수 | 원문 확인 전 확정하지 않음 | v1.1에서 확정(12-2의 1번) |
| 5 | 판정기 파일 형식 | v0.4와 같은 브라우저·Node 공용 방식 | 구현 시 적용 |
| 6 | 영역 전체 통과 | 구현하지 않은 검사가 있는 영역은 영역 전체 통과로 표시하지 않음 | 4-1, T1A-28 |
| 7 | 소유권 | 전체 구현·통합은 Codex 유지. Fable 단계 1A는 계약 확정과 법규 대조 후 다시 승인 | 11-1, 11-2 |

### 12-2. v1.1 변경 (사용자 승인 2026-10-24, 상위 모델 2차 확인 반영)

| # | 변경 | 내용 | 반영 |
|---|---|---|---|
| 1 | 50대 기준 확정 | 법제처 해석례 24-0568: 같은 경사로를 이용하는 해당 주차장 전체 주차대수의 합계. 해석 A/B 병행, INTERPRETATION_OPEN, 두 값이 다르면 확인 불가 규칙, ramp.servedStalls 삭제. project.parkingLots[]와 rampSystems[]를 명시 입력으로 신설. 생성된 칸 수로 역산 금지. 독립된 램프 체계는 ID로 구분 | 1-2, 1-4, 5-2의 6번, R01·R03·R04, T1A |
| 2 | 연석 규정 정정 | 30cm는 벽면에서 연석 설치 지점까지의 거리이지 연석 폭이 아니다. 연석 높이 100mm 이상. 연석 부분은 법령상 차로 너비에 포함. 연석 가로폭은 법규 상수가 아님(설계 프리셋) | 1-4a, 5-2의 7번, R09, 7-4의 14번 행 |
| 3 | 법규와 차량 분리 | 법규: 법령상 차로 너비, 연석 위치·높이. 차량: 연석 안쪽 통과 가능 폭과 회전궤적(V06). 연석 폭을 줄여 합격시키지 않음 | 1-4a, V06, 4장, T1A-43·44 |
| 4 | secondCheck done | 램프 차로 너비, 출입구 폭, 경사, 곡선 반경 수치, 50대 기준의 의미, 별표 1, 제3조 치수, 부설 준용, 유효높이. EDITION_NOT_LOADED(2026-03-31 이전)는 유지 | 7-4 |
| 5 | 시험 목록 | T1A 41개 → 44개(대수 기준 확정 시험으로 교체, 연석 시험 추가) | 10-1 |

### 12-3. v1.1.1 변경 (사용자 승인 2026-10-24, 상위 모델 2차 확인 완료)

| # | 변경 | 내용 | 반영 |
|---|---|---|---|
| 1 | 연석 높이 | 현행 제6조제1항제5호 다목은 "높이 10센티미터 이상 15센티미터 이하". 100mm 미만 실패, 100–150mm 통과, 150mm 초과 실패. 정확히 150mm는 통과. v1.1의 150mm 확인 불가 규칙과 그 표현은 폐기 | R09, T1A-42, 7-4의 14번 행 |
| 2 | 사목 1) | "주차대수 규모가 50대 이상인 경우"의 경사로는 너비 6m 이상인 2차로 확보 또는 진입·진출 차로 분리. secondCheck done | 7-4의 3번 행 |
| 3 | 바목 | 오르막 경사로, 도로와 접하는 부분에서 3m 이내, 직선 8.5% 이하, 곡선 7% 이하. secondCheck done(단계 3 항목) | 7-4의 6번 행 |
| 4 | 50대 입력 구조 유지 | project.parkingLots[], project.rampSystems[], 램프·출입구 systemId 유지. 생성 칸 수·특정 층 대수·후보 대수로 법규 기준 대수를 대체하지 않음 | 1-2, 5-2의 6번 |
| 5 | 해당 없음의 취급 | (v1.1.2에서 대체됨) 해당 없음을 "통과 + NOT_APPLICABLE"로 처리하던 방식은 폐기. 12-3b 참조 | 5-4 |

### 12-3b. v1.1.2 변경 (사용자 승인 2026-10-24)

| # | 변경 | 내용 | 반영 |
|---|---|---|---|
| 1 | 통과와 해당 없음의 분리 | 모든 항목에 applicability(APPLICABLE / NOT_APPLICABLE). NOT_APPLICABLE이면 verdict는 null, reason은 NOT_APPLICABLE. 통과 수와 실패·확인 불가·입력 오류 수에 포함하지 않고 notApplicable으로만 센다. 영역 완료 계산에서는 "검사가 필요 없는 항목"으로 완료 처리. 화면에는 "해당 없음"으로 표시 | 4장 스키마, 4-1, 5-4, R03·R04, T1A-13·24·28 |
| 2 | 영역 전체 통과 정의 | 영역 완료 + PASS 1건 이상. 전부 해당 없음인 영역은 "해당 없음 영역"이며 기하 초안·부분 검토 조건에 세지 않는다 | 5-4, T1A-47·48 |
| 3 | 시험 | T1A 44개 → 48개 | 10-1 |

### 12-5. v1.1.3 변경 (사용자 요청 2026-10-24, 상위 검토 반영. 코드·시험 미수정)

| # | 변경 | 내용 | 반영 |
|---|---|---|---|
| 1 | 규칙 관문 | verified + 레코드 secondCheck done + 수치 정상일 때만 PASS/FAIL. 누락·중복·손상·ruleSet 없음은 예외 없이 RULE_UNVERIFIED. 관문은 해당 없음 판단보다 먼저 | 7-5, 5-2의 5번, T1A-49·50 |
| 2 | 분기 전체 비교 | R01은 대수·차로 수·형상·분리 조합 전부, L04는 대수·분리 조합 전부. 모두 같을 때만 확정 | 5-5, T1A-51–54 |
| 3 | R02 고저차 | 구간 → 완전한 connects → (connects 없을 때만) 층고. kind 누락은 두 상한 모두 비교, 전체 형상 복사 금지 | 5-5, 6장 R02, T1A-55·56 |
| 4 | 음수 고도 | 고도 5종은 부호 허용, 물리 치수만 0 이상 | 1-9, T1A-57 |
| 5 | 잘못된 형태 입력 | null 원소·잘못된 타입은 INPUT_ERROR, 예외 금지, 결과 틀 반환 | 1-9, T1A-59 |
| 6 | L01 방향 상속 | 칸 orientation → stalls.orientation → MISSING_INPUT | 1-5a, T1A-61 |
| 7 | 판본 일관성 | 규칙 레코드별 textValidFrom. 나목·다목 2026-03-31, 그 밖 2026-07-27. 항목 단위로 R01–R09·L01·L04에 동일 적용 | 7-5, 5-2의 6번, T1A-37·58 |
| 8 | 체계 검사 | 빈·중복 lotIds, 중복 ID, 정수 아닌 totalStalls는 INPUT_ERROR | 1-9, T1A-60 |
| 9 | 집계 방어 | 39개 ID 레지스트리 고정, 누락 보충, (id, subjectId) 중복 오류, editionAssumed 덮어쓰기 금지 | 4-1, T1A-65 |
| 10 | 문구 | message·scopeLabel·notes 필수 내용 | 4-1, T1A-66 |
| 11 | 모호함 1: L01 입력 | stalls.items는 numeric-test 모드 전용 시험 입력. 정규 후보 모드에서 L01은 1B 측정 전까지 NOT_IMPLEMENTED | 1-5, 1-5a, 6장 L01, T1A-62 |
| 11b | 기존 시험 입력 보강 | T1A-04에 lanes 2 명시, T1A-40을 곡선 램프로. 기대값은 그대로이고 입력이 계약 분기 규칙과 맞지 않던 것을 고침 | 10-1 |
| 12 | 모호함 2: 이륜 전용 | 사용자 결정으로 이륜 전용 경사로는 범위 밖. 입력 필드를 두지 않고 R03은 일반 규칙만 사용. 기존 T1A-11·31·32·38은 그대로 | 1-4, 5-5, 6장 R03, T1A-63 |
| 13 | 모호함 3: G01 | 1A는 형식·수치만, PASS 없음(UNDETERMINED/NOT_IMPLEMENTED 또는 INPUT_ERROR). 다각형 검사는 1B | 1-9, 6장 G01, T1A-64 |
| 14 | 모호함 4: 1B 기하 초안 | 단계별 분모 축소 안 함, G08–G10 단계 3 유지. T1B-01 기대값을 grade null로 정정 | 4-1, 10-2, 11-6 |
| 15 | 모호함 5: T1A-46(c) | APPLICABLE + UNDETERMINED + MISSING_INPUT(ramp.shape.type) | 5-5, 10-1 |
| 16 | 시험 수 | T1A 48개 → 66개 | 10-1 |
| 17 | 1B 진입 조건 | 신설 | 11-6 |
| 19 | 1A 구현 보고(리뷰용/01_클로드_작성/46차) 반영 | 합성 집계 시험 5개는 39개 레지스트리를 채운 입력으로 보강(기대값 불변), 제11조 p5 레코드는 값만 읽음, 부설은 제11조 판본도 따름, R01 분기 합성 규칙, missingInputs 이름. R03의 50대 임계 판본(2026-03-31–07-26 곡선 R03 판본 없음)은 그대로 두고 12-4의 4번 결정에 맡김 | 5-2, 5-5, 7-5, 10-1 |
| 18 | Sonnet 사전검토 반영(리뷰용/02_GPT_작성/45차) | parkingKind 누락·제11조 처리 순서, R03의 50대 임계 레코드와 판본, 직선 R03 관문, 칸 치수·제11조 레코드 수치 검사 예외, 1A는 도형 누락 검사 안 함, 4-1 등급 없음 기본값과 부분 검토 조건, 10-1 공통 기본 입력, R02 정수 비교와 경계 시험(T1A-56 f·g), 고도 정확 일치, 완전한 connects 정의, 형상 모순 공통화, 구간 id, 중복 표시 필드, effectiveTo 같은 날 포함 | 1-4, 1-5a, 1-9, 4-1, 5-5, 7-5, 10-1, 11장, 11-6 |

### 12-6. v1.1.4 변경 (사용자 결정 2026-10-24)

| # | 결정 | 내용 | 반영 |
|---|---|---|---|
| 1 | 지하 부설 8대 이하 | 제11조제5항은 자주식 중 지평식에만 적용(ALRIS 조회). 지하주차에는 적용하지 않고 대수와 상관없이 제11조제1항 준용으로 판정. p5 레코드는 판정에 쓰지 않음 | 7-4 11번 행, 7-5, T1A-39 |
| 2 | 평행주차 치수 | ALRIS가 7-4 10번 행과 같은 값(경형 1.7×4.5m, 일반 2.0×6.0m)을 냄. 사용자 결정으로 경형·일반형 verified(secondCheck done). 이륜 평행은 needs-recheck. 레코드는 kr.rule3.p1.1.{compact,general,motorcycle} | 7-4 10번 행, 규칙 JSON, T1A-20·36·61 |
| 3 | 판본 공백 제거 | 제3조 '2019-03-01', 별표 1 '2024-09-20', 그 밖 '2026-03-31'. 2026-03-31–07-26 공백 없음 | 7-5 판본 규칙, T1A-58 |
| 4 | 곡선 내변반경 | 법규대로 유지. "항상 6m"는 사업지침 설계 기준으로 후속 추가 | 12-4의 8번 |
| 5 | systemId 형식 오류 | Codex 48차 반례. 잘못된 형식이면 그 램프의 R 항목 전부 INPUT_ERROR | 10-1 T1A-67 |
| 6 | 규칙 JSON 수정 허용 | 위 2·3번에 한해 kr-parking-rules-2026-07-27.json 수정 허용(7-3 예외) | 7-3 |

### 12-4. 남은 열린 질문 (단계 1A를 막지 않음)

1. 제1527호 개정 전 문언. 확인하지 않으면 허가 기준일 2026-03-31 이전 사업은 계속 확인 불가.
2. wallToCurbMm의 기준점(연석의 어느 쪽 끝). 현재는 도면 입력이 정한 값을 그대로 쓰고, 법령상 차로 너비 = 벽 사이 전체 너비 − 좌우 벽에서 연석 설치 지점까지의 거리로 계산한다. 연석 입력을 실제로 받는 단계에서 입력 정의서에 확정한다.
3. 평행주차 치수 원문 육안 대조(10번 행). v1.1.4에서 경형·일반형은 사용자 결정으로 확정, 이륜은 미확정.
4. (v1.1.4 해소) 허가 기준일 2026-03-31–2026-07-26 구간의 판본 공백은 사용자 결정으로 없앴다(7-5, 12-6). 제1604호 신구조문은 대조하지 않았다.
8. (v1.1.4 기록) 곡선 내변반경은 법규대로 둔다(6m, 50대 이하 5m). 사용자가 원하는 "항상 6m"는 법보다 엄격하므로 법규 판정이 아니라 사업지침(guideline) 설계 기준으로 나중에 추가한다.
5. (v1.1.3, 사용자 결정, 1B를 막음) 1A 수정 구현 검토 결과를 보고 1B 착수 승인.
6. (v1.1.3, 1B를 막음) 8-2가 지정한 `00_shared/lib/clipper.js`가 실제로 있고 판정기에서 불러올 수 있는지 Codex가 1B 착수 전에 확인.
7. (v1.1.3) 이 마무리분(7-5, 10장 추가 시험, 11-6)은 다른 모델의 교차검토를 받지 못했다. Codex 수정 구현 중 계약과 맞지 않는 곳을 찾으면 구현을 보류하고 보고한다.

### 12-7. 단계 1B 작업 기록 (2026-10-24, 기록만. 이 절은 기존 조항·기대값을 바꾸지 않는다)

- 구현: Claude Opus 5.5(사용자 승인 2026-10-24). 검토: Codex 읽기 전용, 이후 Astra 단계 1 종료 심사.
- 파일: `evaluators/evaluator-core.js` 수정, `adapters/rectangular-loop-v04-adapter.js`·`tests/underground/evaluators/evaluator-stage1b.test.cjs` 신설. 겹침·포함은 `00_shared/lib/clipper.js` 교집합 면적.
- 시험: 1A 69/69, 1B 22개 중 21 통과 + 1 보류(todo), v0.4 14/14. 보고: 리뷰용/01_클로드_작성/47_지하주차_1B구현_인계_2026-10-24/00_작업결과.md
- 보류 1(T1B-01 G07): 기준 장면 B의 v0.4 램프 몸체가 착지 뒤로 외곽 밖 25.8m까지 나가므로 6장 G07 "외곽 안"과 T1B-01 "G07 통과"가 동시에 성립하지 않는다. 구현은 코어·고정 요소 겹침은 실패, 외곽 밖 부분은 확인 불가(BRANCH_DIVERGES)로 둔다. 결정 필요.
- 보류 2(1-9 도형 누락): "필수 도형 누락은 1B부터 입력 오류"를 그대로 적용하면 1A 기준선 시험 T1A-28·57(a)·62(a)·64(c)(외곽 없는 candidate 입력)가 깨진다. 구현은 candidate 모드에서 floor.outline이 있을 때만 도형 판정을 하고, 없으면 1A 결과를 유지한다. 결정 필요.
- 계약에 형식이 없어 정한 것: floor.outline = {kind:'inner'|'outer', polygons:[다각형…]}(짝홀 규칙으로 구멍), 후보 도형은 입력과 같은 도면 좌표, 칸 폭은 측정한 짧은 변.
- (v1.1.5) 보류 1·2와 G06 abutting 해석은 12-8로 해소했다.

### 12-8. v1.1.5 변경 (사용자 결정 2026-10-24, Codex 50차 검토 반영)

| # | 결정 | 내용 | 반영 |
|---|---|---|---|
| 1 | G07 외곽 밖 램프 | 수정안 A. 기존 ramp.roadConnection에 outsidePolygon(지상 도로 접속 구간)을 두고, 선언된 구간 안의 외곽 밖 부분만 허용. 선언 밖은 실패 | 1-4, 6장 G07, T1B-01 |
| 2 | 외곽 누락 | 수정안 A. candidate 모드에서 floor.outline·candidate.geometry 미입력은 MISSING_INPUT. 1A 시험 T1A-28·62·64의 해당 기대값 정정(사용자 승인) | 1-1, 1-9, 10-1, T1B-18 |
| 3 | G06 abutting | 외곽 밖에서 경계에 닿는 코어에만 허용. 안·밖 면적이 모두 유의미한 걸침은 선언과 상관없이 ZONE_STRADDLE | 6-1, T1B-17 |
| 4 | 형식 명문화 | floor.outline 형식, 후보 좌표계와 frame(50차 '정한 것' 1·2) | 1-1, 3장 규칙 5 |

### 12-9. v1.1.6 변경 (Codex 52차 좁은 재검토 반례 반영, 2026-10-24)

| # | 변경 | 내용 | 반영 |
|---|---|---|---|
| 1 | G06 abutting 경계 | "1mm 이내"는 정확히 1mm를 포함한다. 면적 대신 코어 변과 영역 경계 사이 최소 거리로 판단 | 6-1, T1B-19 |
| 2 | G07 램프 id 중복 | 같은 id의 램프 입력이 둘 이상이면 roadConnection 선언을 고르지 않고 G07 입력 오류 | 6장 G07, T1B-20 |

### 12-10. v1.1.7 계산 일관성 기록 (Codex 54차 반례, 2026-10-24)

| # | 내용 | 반영 |
|---|---|---|
| 1 | G06 abutting 간격은 외곽과 코어를 같은 좌표 기준으로 잰다. 안쪽 면(inner) 외곽은 입력 좌표 그대로, 바깥면(outer) 외곽은 벽 두께만큼 줄인 영역(0.001mm 격자)과 같은 격자로 맞춘 코어로 잰다. 비교는 '간격 ≤ 1mm'이며 실수 계산 잡음(1e-9mm)만 무시한다. 1mm 기준과 판정 범위는 바꾸지 않는다 | 6-1, T1B-21 |
| 2 | 남은 문제: 바깥면 외곽을 회전한 장면에서는 정확히 1mm가 약 1.0012mm로 재어진다. (v1.1.8에서 해소, 12-11) | 리뷰용/01_클로드_작성/55_지하주차_1B_54차반영_2026-10-24 |

### 12-11. v1.1.8 계산 일관성 기록 (outer 외곽 회전 반례, 2026-10-24)

| # | 내용 | 반영 |
|---|---|---|
| 1 | G06 abutting 간격은 "벽 두께를 반영한 실제 판정 경계와 코어 사이의 거리"다. 판정 경계는 inner·outer 모두 둥글리기 전 원래 좌표에서 외곽 꼭짓점을 벽 두께 w(inner는 0)만큼 안쪽 마이터 방향으로 옮겨 만든다. 코어도 원래 좌표 그대로 잰다 | 6-1, T1B-21·22 |
| 2 | 이 거리 경계가 면적 판정 경계(clipper 0.001mm 격자)와 같은 영역인지 확인한다: 두 영역의 대칭차 면적 ≤ 둘레 × 0.002mm. 어긋나면(예: 외곽 다각형끼리 겹친 입력) 거리도 격자 경계와 같은 격자에 맞춘 코어로 재고 evidence.distanceBoundary를 'grid'로 남긴다 | 6-1 |
| 3 | 비교는 간격 ≤ 1mm + 1e-9mm. 1e-9mm는 실수 계산 잡음만 지우는 값이다(좌표 수십만 mm에서 실제 오차 약 1e-12mm, 좌표 해상도 0.001mm보다 백만 배 작음). 1mm 기준·G06 뜻은 바꾸지 않는다 | 6-1, T1B-22 |

### 12-12. v1.1.9 변경 (사용자 결정 2026-10-24, 57차 보고의 수정안 A)

| # | 결정 | 내용 | 반영 |
|---|---|---|---|
| 1 | 외곽 부분 겹침 | floor.outline.polygons의 서로 다른 다각형이 유의미한 면적(100mm² 초과)으로 부분 겹치면 G01 입력 오류. 두 경로를 모두 근거에 남기고, 외곽이 필요한 G02·G06·G07도 입력 오류로 막는다. 애매한 겹침 입력을 G06 격자 경계로 판정하지 않는다 | 1-1, 6장 G01, T1B-23 |
| 2 | 허용하는 관계 | 완전 포함(짝홀 규칙의 구멍), 경계선·꼭짓점 접촉, 서로 떨어진 여러 영역 | 1-1, T1B-23(b)–(e) |
| 3 | 유지 | 유효한 외곽의 G06 거리 계산(12-11), G07과 다른 항목의 뜻은 그대로 | — |

---

## 부록 A. 골든케이스 관계 카드 (G1–G3)

이 부록은 **데이터가 아니라 관계 카드**다. 도면에서 치수를 읽어 좌표로 옮기지 않았다. 주차대수는 정답이 아니라 참고 표기로만 적었다. 구분 기준:

- **직접 확인**: 도면 위 글자·기호·그림에서 그대로 읽은 것
- **치수 확인**: 도면에 적힌 치수 숫자(어느 면 기준인지 불명이면 그렇게 표시)
- **계획상 해석**: 읽은 사실에서 도출한 해석. 틀릴 수 있음
- **확인 불가**: 이 도면 한 장만으로는 알 수 없는 것

열람: 2026-10-24, 도면 이미지 직접 열람(Claude). 지하4층 설비 도면(UV-08805_plan_01)과 광장동 plan_02·03은 이번에 직접 열지 않았고, 42차 크리틱의 기록으로만 언급한다.

### G1. 번3동 주민센터 — 지하1층 (건담건축사사무소)

파일: `05_domain search/04_plan sample/07_번3동 주민센터 청사 건립 설계공모 (소규모건물, 전층평면)/02_건담건축사사무소/PW-60395_지하1층평면도.jpg`

| 구분 | 내용 |
|---|---|
| 직접 확인 | 외곽은 닫힌 직사각형 하나. 건축한계선(5,000)과 도로편입 예정선(3,000) 표기. 글자: "지하주차장 9대 406.65㎡ (일반주차 7대, 장애인주차 1대, 친환경 자동차주차 1대)". 기계실 72.32㎡, 전기실 46.51㎡, 창고 6.02㎡가 서쪽에 모여 있고, 홀·승강기·계단 둘도 서쪽. 경사로(UP 표기)가 북동쪽에 있다. 북쪽 가운데에 장애인 칸과 충전스테이션이 벽으로 둘러싸인 구획으로 홀·승강기 옆에 있다. '회차' 글자와 "회차공간 확보" 주석이 남서쪽 하단에 있다. 남쪽 벽을 따라 직각 주차 한 줄. 칸 사이 벽 쪽에 기둥 표시. 우측 설명 글에 "일방향 동선 체계", "전기차 진입·진출 경사로 인접 배치", "장애인 주차 홀과 인접 배치", 전기·기계실 이격 배치 |
| 치수 확인 | 상단 구간 4,500 / 8,100 / 8,100. 좌측 구간 4,200 / 9,000 / 1,800. 우측 도식에 주차 영역 층고 3,300과 설비 구획 5,500 표기. 어느 벽면 기준 치수인지는 확인 불가 |
| 계획상 해석 | 닫힌 순환 없이 넓은 열린 바닥 한 덩어리가 차로와 회차 역할을 겸한다. 설비·홀·코어를 서쪽에 몰고 주차를 동쪽·남쪽에 둔다. 장애인 칸은 홀 최단, 충전 칸은 램프 인접이라는 배치 원칙. 소규모는 순환 대신 회차 공간으로 해결 |
| 확인 불가 | 램프 폭·길이·경사·고저차, 차로 폭, 개별 칸 치수와 칸 수, 회차 영역 크기와 차량 회전 성립, 일방향 화살표의 구체 방향, 기둥 크기, 위층 구조와의 연속, 도로 접속 방식 |

관계 카드

| 항목 | 이 사례가 요구하는 관계 |
|---|---|
| 동선 형식 | 개방형 한 덩어리 + 가지(순환 없음). 폐쇄순환을 조건으로 삼으면 이 사례는 탈락한다 |
| 회차 | 명시적 회차 공간이 있고 주차칸으로 채워지지 않는다 |
| 코어 접근 | 장애인 칸에서 홀·승강기까지 짧고 막히지 않는 경로. 홀이 서쪽 코어 묶음의 입구 |
| 구조 연속 | 확인 불가(상부 정보 없음). 판정기는 확인 불가로 남겨야 한다 |
| 램프 접속 | 램프가 열린 바닥의 한쪽 모서리에서 접속. 충전 칸이 램프 가까이 |
| 판정이 잡아야 할 나쁜 변형 | 회차 공간에 주차칸을 채움 / 장애인 칸 앞을 다른 칸이 막음 / 홀 문 앞 차로를 닫음 / 설비실에 주차칸 침범 |

### G2. 부암동 공영주차장 — 지하3층 (종합건축사사무소 이림)

파일: `05_domain search/04_plan sample/11_부암동 공영주차장 및 주민복합시설 건설 설계공모/01_주식회사 종합건축사사무소이림/UV-08805_plan_02.jpg`

| 구분 | 내용 |
|---|---|
| 직접 확인 | 지하3층 평면도 축척 1/300. 구조 축선 X1–X7, Y1–Y9. 글자: "주차장 52대 (일반형 13대, 장애인주차 2대, 환경친화적자동차 6대, 가족배려 4대, 확장형 20대, 경형 7대 포함) 1,818.87㎡". 남쪽 도로에서 들어오는 "차량진출입구" 화살표와 24시간 개방 출입구, 홀·승강기·계단이 남서쪽. 주차관제실·개방형 화장실·분리수거장·자전거주차(24대)가 남동쪽. 북쪽에 반원형 곡선 램프("내려옴/올라감"). 가운데에 양면 주차 블록 두 줄, 서쪽과 동쪽에 단면 주차열, 남동쪽에 충전 칸 한 줄. 장애인 표시 칸이 홀 가까이(남서)와 서쪽 계단 가까이(북서). 차로에 방향 화살표 다수. 승강기·계단이 여러 곳에 흩어져 있음. 외곽선이 대지 형상을 따라 곡선·꺾임 |
| 치수 확인 | X 구간 표기 3,000 / 9,300 / 9,300 / 6,900 / 8,100 / 8,100. Y 구간 표기(아래에서 위) 3,900 / 5,100 / 9,600 / 8,400 / 6,000 / 5,700 / 9,600 / 6,000. 기둥 간격이 균일하지 않음 |
| 계획상 해석 | 중앙 주통로 + 양쪽 단면열이 섞인 형식. 이 층에서 차량 진출입이 지상(외부)으로 직접 나가고, 곡선 램프는 다른 층과의 연결로 공존한다고 읽힌다. 종류별 칸(확장 20, 경형 7 등)이 중앙 블록에 섞여 있다. 구역마다 기둥 간격이 달라 구조 구간이 혼합되어 있다. 외곽이 비직사각 |
| 확인 불가 | 램프 폭·반경·경사, 차로 폭, 개별 칸 치수와 종류별 위치, 층고, 곡선 램프가 연결하는 상·하층의 실제 높이, 일방통행의 법적·운영 지정 여부, 지하4층과의 관계(42차 크리틱은 지하4층이 설비 중심 층이라고 기록했으나 이번에 직접 열지 않음) |

관계 카드

| 항목 | 이 사례가 요구하는 관계 |
|---|---|
| 동선 형식 | 중앙 주통로형 + 외곽 단면열(혼합). 단일 직사각 순환 한 가지로는 표현 불가 |
| 회차 | 명시 회차 공간 여부 확인 불가 |
| 코어 접근 | 장애인 칸이 홀·계단 코어 가까이. 코어가 여러 곳이므로 어느 코어가 어느 칸을 맡는지는 확인 불가 |
| 구조 연속 | 구간별로 다른 기둥 간격이 한 층 안에 공존. 판정기는 균일 격자를 가정하면 안 됨(단계 3 이후) |
| 램프 접속 | 곡선 램프가 북단에서 중앙 통로 상단에 접속. 남단에 지상 직접 출입구가 별도로 있음 |
| 판정이 잡아야 할 나쁜 변형 | 구조 간격을 무시하고 기둥을 옮김 / 곡선 램프 반경을 줄임 / 지상 직접 출입구를 막음 / 중앙 블록을 기둥 위로 이동 |

### G3. 광장동 복합체육시설 — 지하2층 (에이텍)

파일: `05_domain search/04_plan sample/01_광장동 복합체육시설 건립사업/04 에이텍/XF-60031-plan_01.jpg`

| 구분 | 내용 |
|---|---|
| 직접 확인 | 지하2층 평면도. 축척 막대 0/10/25/50M. 구조 축선 X1–X11. 글자: "공영 주차장 118대 (장애인 4, 전기차 6, 가족배려 11, 국가유공자 2)", "부설 주차장 200대 (지하2층 36대, 지하3층 164대)". 공영·부설 각각의 산적표에 종류별 대수와 "법적: 총 주차대수 3% 이상" 등의 비고. 북쪽에 우수조·창고·홀·기계실·전기실·발전기실. 남쪽에 자전거주차장·창고·에스컬레이터·코어 여러 곳. 가운데에 세로 방향 양면 주차 블록 세 줄, 북·서·남쪽 가장자리에 단면 주차열. 동쪽에 곡선 끝을 가진 긴 램프 띠("내려옴/올라감"). 남쪽 열에 장애인 표시 칸. 대지경계선은 사선·불규칙이고 지하 외곽은 직각 계단 형태 |
| 치수 확인 | X 구간 표기가 9,000과 11,000. 램프 폭·차로 폭은 도면에 치수 표기 없음 |
| 계획상 해석 | 중앙 세 줄 + 외곽 세 면 구성. 설비를 북쪽 한 덩어리로 예약. 램프를 동쪽 한 변에 몰고 코어는 남쪽에 둠(램프와 코어가 분리). 공영과 부설을 구분해 산정하며, 요구 대수는 층별 합(36+164)으로 충족. 산적표의 비율 표기는 도면 작성자의 표기일 뿐 현행 법규 근거로 쓰지 않는다 |
| 확인 불가 | 램프 폭·반경·경사, 차로 폭, 개별 칸 치수와 종류 위치, 공영·부설 구역의 경계선, 코어 문 방향, 지하3층 배치, 층고, 위·아래층(42차는 지하1층이 경기장이라고 기록, 이번에 직접 열지 않음) 구조와의 관계 |

관계 카드

| 항목 | 이 사례가 요구하는 관계 |
|---|---|
| 동선 형식 | 중앙 다열 주통로 + 외곽 단면열. 구역 운영 구분(공영·부설) |
| 회차 | 확인 불가 |
| 코어 접근 | 남쪽 코어 여럿과 장애인 칸. 코어별 담당 구역은 확인 불가 |
| 구조 연속 | 북쪽 설비 예약 구역과 하부 구조의 일치는 확인 불가. 격자 간격은 비교적 균일 |
| 램프 접속 | 동쪽 변의 램프가 중앙 통로 끝과 만남. 램프 상·하 접속은 이 도면만으로 확인 불가 |
| 대수 | 다층 분담(36+164)이 있어 이 층의 칸 수는 전체 요구 충족의 일부. 이 층 칸 수를 정답으로 삼지 않는다 |
| 판정이 잡아야 할 나쁜 변형 | 설비 예약영역에 주차칸 채움 / 램프 접속부를 중앙 블록으로 막음 / 장애인 칸 앞 통로 폐쇄 / 코어 문 앞 차로 폐쇄 |

### 부록 A 공통 주의

- 도면의 대수·산적표는 **채점 정답이 아니다**. 채점은 동선 형식, 회차, 코어 접근, 구조 연속, 램프 접속 관계를 먼저 본다.
- 확인 불가 항목은 골든케이스에서 "판정기가 확인 불가로 남겨야 하는 것"으로 사용한다. 도면에서 추정한 값으로 채워 통과시키지 않는다.
- 데이터 변환(좌표 입력)은 단계 2에서 사용자 승인 후에 한다.
