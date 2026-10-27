# CODEX 도메인 규칙–엔진 정합성 점검

검토일: 2026-10-20  
대상 규칙: `CODEX_DOMAIN_RULES.md`의 독립 규칙 44개  
코드 기준: `04_parking/01_src/` 현재본  
진행 단계 기준: `SPEC_지하주차_2026-10-19.md`의 **U1-4 완료, U1-5 대기** 상태

## 1. 판정 기준과 범위

- `FULLY_IMPLEMENTED`: 규칙의 적용 조건·핵심 데이터·검사 또는 산출이 현재 코드에 모두 있다.
- `PARTIAL`: 관련 데이터나 일부 기하·감사 로직은 있으나 적용 범위, 프로젝트 프로필, 연결 의미 또는 검증이 빠져 있다.
- `NOT_IMPLEMENTED`: 규칙을 수행하는 코드 근거를 찾지 못했다. 비슷한 화면·필드만으로 구현으로 보지 않았다.
- `NOT_APPLICABLE_YET`: 현재 U1-4 범위보다 뒤의 운영·구조·설비·연구 재현 단계에 속해 아직 적용할 실행 지점이 없다.

이 표는 실제 코드를 읽어 확인한 현재 상태다. 문서에 예정됐거나 데이터 필드만 열려 있는 것은 완전 구현으로 올리지 않았다. 또한 지상 엔진의 `VALID`는 지하 설계 유효성을 뜻하지 않는다. `CODEX_underground_ui.js:generateCandidate`와 `runValidate`는 지하 후보를 계속 `UNVERIFIED`로 표시한다.

## 2. 규칙 44개 대조표

| 규칙 ID | 분류 | 한 줄 설명 | 코드 반영 상태 | 근거 파일:함수 | 확인된 간극 |
|---|---|---|---|---|---|
| PARK-01 | PROJECT_REQUIREMENT | 사업별 확장형·경형·장애인 비율을 분리 적용 | PARTIAL | `CODEX_underground_model.js:create`, `level`, `validate`; `CODEX_rules.js:requiredWide`, `audit` | 시설/층별 `wide`·`accessible` 목표와 30% 감사만 있다. 사업별 30/40/50%, 장애인 3/4%, 경형 상한과 근거가 있는 `ruleProfile`은 없다. |
| PARK-02 | PROJECT_REQUIREMENT | 일반 2.5×5.0m, 확장 2.6×5.2m 구획 | FULLY_IMPLEMENTED | `CODEX_rules.js:catalog`, `dimensions`, `audit`; `parking.js:plan`, `repairWide`, `ringLayout` | 확인된 핵심 치수의 생성·최종 재보정·감사가 모두 있다. 단, 다른 프로젝트 값의 프로필화는 PARK-01 간극이다. |
| PARK-03 | PROJECT_REQUIREMENT | 임산부 2.7×5.2m, 동별 2–4대, 확장형 포함 | NOT_IMPLEMENTED | 해당 코드 없음 | 임산부 `kind`, 치수, 동별 배분, 확장형 포함 계산이 없다. |
| PARK-04 | PROJECT_REQUIREMENT | 대당 주차장 면적 35㎡/대 이하 | NOT_IMPLEMENTED | 해당 코드 없음 | 산정 면적 범위와 ㎡/대 지표·게이트가 없다. |
| PARK-05 | DESIGN_PRINCIPLE | 주동군별 주차 균등 배분 및 건물 통합 | NOT_IMPLEMENTED | 해당 코드 없음 | 주동군·서비스 대수·배분 편차 모델이 없다. |
| PARK-06 | REFERENCE | 주차장별 대수·㎡/대·지상/지하 관계 출력 | PARTIAL | `parking.js:toDxf`; `CODEX_underground_ui.js:generateCandidate` | 단층 대수와 일반/장애인 표시는 있으나 ㎡/대, 층별 표, 지상–지하 관계를 함께 내보내지 않는다. |
| AISLE-01 | PROJECT_REQUIREMENT | 해당 사업의 지하 주도로·램프 접속부 7m 이상 | NOT_IMPLEMENTED | 해당 코드 없음 (`parking.js` 기본 `aisle`은 6000mm) | 7m 사업 규칙과 적용 프로필이 없다. 사용자가 폭을 넘길 수 있다는 사실만으로 해당 요구를 구현한 것은 아니다. |
| AISLE-02 | DESIGN_PRINCIPLE | 막다른 차로 회피, 불가피하면 회차 공간 | PARTIAL | `parking.js:circulationCheck`, `plan` | 막다른 가지 수와 길이는 찾지만 회차 공간 형상·차량 궤적을 검사하지 않는다. |
| AISLE-03 | DESIGN_PRINCIPLE | 학교 프로젝트에서 순환형 우선 | PARTIAL | `parking.js:ringLayout`, `plan` | loop/face 후보와 막다름 지표는 있으나 용도별 학교 가중치가 없고 최종 순위는 주로 유효성·횡단·대수다. |
| AISLE-04 | DESIGN_PRINCIPLE | 보차 분리 및 교차부 명시 | PARTIAL | `CODEX_access.js:reserve`; `parking.js:finalizeCandidate`, `toDxf` | 1.2m 보행 후보와 차로 교차를 탐지·표시하지만 지하 코어 수요, 보호 횡단, 교차 횟수 최적화는 없다. |
| RAMP-01 | PROJECT_REQUIREMENT | 직선 램프 폭 7m 이상·경사 17% 이하 | PARTIAL | `CODEX_ramp_rules.js:audit`; `CODEX_underground_model.js:ramp` | 직선 17% 감사와 폭 필드는 있다. 폭 감사는 현행법 1차로 3.3m/2차로 6m이며 해당 LH 사업의 7m 프로필은 없다. |
| RAMP-02 | PROJECT_REQUIREMENT | 곡선 램프 내측반경 7.5m 이상·경사 14% 이하 | PARTIAL | `CODEX_ramp_rules.js:circumRadius`, `audit` | 곡선 14%와 3점 원호 반경 감사는 있으나 기준은 5/6m이고 사업별 7.5m가 아니다. 복곡선·실제 내측 선형도 미검증이다. |
| RAMP-03 | PROJECT_REQUIREMENT | 게이트–램프 10m, 차단기/출구 평탄부 각 5m | NOT_IMPLEMENTED | 해당 코드 없음 | 거리·차단기·평탄 대기 객체 및 사업 프로필 검사가 없다. `transitionZones`는 이 평탄 대기 규칙과 다르다. |
| RAMP-04 | DESIGN_PRINCIPLE | 램프 인지성 및 건물 이격·분리 | NOT_IMPLEMENTED | 해당 코드 없음 | 시야·인지성·건물 이격 점수나 검사가 없다. 현재 UI는 사용자가 그린 램프를 장애물로 차감할 뿐이다. |
| RAMP-05 | DESIGN_PRINCIPLE | 150–300대마다 출입구 1개소 분산 제안 | PARTIAL | `parking.js:connectEntrances`, `verifyLayout`, `ringLayout` | 복수 출입구를 차로에 기하 연결하지만 대수별 권장 개수 산정과 공간적 분산 평가는 없다. |
| STR-01 | PROJECT_REQUIREMENT | 사업별 라멘/무량판 구조 형식 입력 | NOT_IMPLEMENTED | 해당 코드 없음 | `spaces[].kind='structure'`만 허용할 뿐 `structuralSystem`과 사업별 선택·검증이 없다. |
| STR-02 | REFERENCE | PC 기둥·보 연결 슬래브 면적 산정 | NOT_APPLICABLE_YET | 해당 코드 없음 | 현재 U1-4는 PC 공법 가점·면적 산정 단계가 아니다. 출력 산정 로직도 없다. |
| STR-03 | UNVERIFIED | 근거 없는 기둥 스팬·단면 하드코딩 금지 | PARTIAL | `CODEX_underground_model.js:space`, `state`, `validate` | 구조를 일반 공간과 `UNVERIFIED` 상태로 보존하며 추정 스팬은 하드코딩하지 않았다. 그러나 축·기둥·확정도 전용 모델도 아직 없다. |
| CORE-01 | DESIGN_PRINCIPLE | 계단실 직선거리 50m 참고 검사 | NOT_IMPLEMENTED | 해당 코드 없음 | 계단실 간/주차영역에서 계단까지 50m 거리 검사가 없다. |
| CORE-02 | DESIGN_PRINCIPLE | 주동–지하주차 통합, 연결통로 길이·굴곡 최소화 | PARTIAL | `CODEX_underground_model.js:space`, `pedestrianEntry`, `validate`; `CODEX_underground_ui.js:runValidate` | 코어·계단·승강기·문 관계는 저장하지만 후보 생성·평가가 코어까지 최단거리나 굴곡을 계산하지 않는다. |
| CORE-03 | DESIGN_PRINCIPLE | 장애인 구획을 접근 가능한 코어 가까이 배치 | PARTIAL | `CODEX_underground_model.js:space`, `pedestrianEntry`; `CODEX_access.js:bestRoute`; `parking.js:ringLayout` | 접근 가능 코어 필드는 있으나 실제 배치기는 지상 `building door`를 목적지로 쓴다. 지하 코어 문과 장애인 구획 최적화가 연결되지 않았다. |
| SERV-01 | DESIGN_PRINCIPLE | 환기구 분산 및 선큰·톱라이트·D.A. 채광·통풍 | NOT_IMPLEMENTED | 해당 코드 없음 | 환기/외기 개구 객체, 분산·외기접촉 지표가 없다. |
| SERV-02 | DESIGN_PRINCIPLE | 집수정을 방해 없는 위치에 50m 이내 배치 | NOT_IMPLEMENTED | 해당 코드 없음 | 집수정 역할, 최저점, 50m 거리 검사가 없다. |
| SERV-03 | PROJECT_REQUIREMENT | 전기실·저수조 등 부속실을 계획에 포함 | PARTIAL | `CODEX_underground_model.js:space`, `validate`; `CODEX_underground_ui.js:generateCandidate` | `service`·`shaft` 종류를 저장하고 모든 `spaces` 외곽을 후보에서 차감할 수 있다. 전기실/저수조 세부 역할·면적·필수 존재 검사와 UI 생성은 없다. |
| SERV-04 | DESIGN_PRINCIPLE | 유입수 차단·매립 구조 외방수 | NOT_APPLICABLE_YET | 해당 코드 없음 | 현재 범위 밖인 지형·지하수·방수 공법 입력/평가 단계다. |
| SECT-01 | PROJECT_REQUIREMENT | 층별 유효높이 2.7m/2.3m 사업 조건 | PARTIAL | `CODEX_underground_model.js:level`, `addLevel`, `vehicleEntry`, `validate` | 층과 출입구의 유효높이를 저장하지만 B1/B2 사업 조건 감사와 바닥마감–설비 하단의 의미 검증은 없다. |
| SECT-02 | PROJECT_REQUIREMENT | 상부 토심 1m 이상 | NOT_IMPLEMENTED | 해당 코드 없음 | 토심·조경/구조/설비 단면 필드와 검사가 없다. |
| SAFE-01 | DESIGN_PRINCIPLE | 여유 있는 직선 램프 우선 및 출구 시야 확보 | PARTIAL | `CODEX_underground_model.js:ramp`; `CODEX_ramp_rules.js:audit` | 직선/곡선 형식과 수치 감사는 있으나 직선 우선 후보 생성, 출구 시야, 복잡도 평가는 없다. |
| SAFE-02 | DESIGN_PRINCIPLE | 학교 지하주차–출입구 보행통로 1.2m 이상 | PARTIAL | `CODEX_access.js:WIDTH`, `corridor`, `reserve` | 1.2m 평면 통로를 생성하지만 학교 프로필이 아닌 전역 상수이며 지하 코어·단차·문폭과 연결되지 않는다. |
| SAFE-03 | REFERENCE | 방향표지·기둥좌표·구역 식별 표현 | PARTIAL | `CODEX_plan_view.js:scene`; `parking.js:toDxf` | 차로축·구획번호·기본 DXF 레이어는 있으나 램프/갈림길 방향표지, 기둥 좌표, 구역 식별 체계가 없다. |
| SAFE-04 | DESIGN_PRINCIPLE | 학교 주차장 눈부심 방지·100 lux·동작감지 조명 | NOT_IMPLEMENTED | 해당 코드 없음 | 조명 객체·조도·제어 체크리스트가 없다. |
| EV-01 | PROJECT_REQUIREMENT | 해당 사업 친환경차 구획 10% 이상 | NOT_IMPLEMENTED | 해당 코드 없음 | EV/친환경차 `kind`, 목표, 비율 감사가 없다. |
| EV-02 | DESIGN_PRINCIPLE | 학교 EV 구획을 선큰·D.A.·램프 인근에서 평가 | NOT_IMPLEMENTED | 해당 코드 없음 | EV 구획과 환기/연기 위치 평가가 없다. |
| FIRE-01 | UNVERIFIED | 양방향 피난·방화구역·피난계단 연결 객체 | PARTIAL | `CODEX_underground_model.js:space`, `pedestrianEntry`, `validate` | `fireCompartmentId`, stair/elevator/vestibule 방, 코어 연결은 저장한다. 피난 그래프·양방향 경로·방화 경계 객체 검사는 없다. |
| FIRE-02 | UNVERIFIED | 근거 없는 방화·피난·제연 수치 판정 금지 | FULLY_IMPLEMENTED | `CODEX_underground_model.js:state`, `validate`; `parking.js:plan` (`designStatus`) | 관련 수치를 임의로 PASS 처리하지 않고 지하 모델과 최종 설계 상태를 `UNVERIFIED`로 제한한다. |
| LEGAL-01 | UNVERIFIED | 공모의 법규 인용을 2026 현행법 게이트로 오인 금지 | PARTIAL | `CODEX_rules.js:catalog`, `audit`; `CODEX_ramp_rules.js:catalog`, `audit` | 공식 원문 URL·시행일·지원 범위와 미검증 항목은 구분한다. 다만 프로젝트 요구와 현행법을 함께 주입하는 통합 `ruleProfile`/provenance 계약은 없다. |
| GEN-01 | DESIGN_PRINCIPLE | 외곽·접속점을 입력으로 분리하고 치수는 프로필 주입 | PARTIAL | `CODEX_underground_model.js:level`, `vehicleEntry`, `ramp`; `parking.js:plan`; `CODEX_underground_ui.js:generateCandidate` | 외곽·출입구·램프는 생성 전 입력이고 폭/구획 치수를 옵션으로 받을 수 있다. 사례·프로젝트별 근거를 묶는 프로필은 없다. |
| GEN-02 | DESIGN_PRINCIPLE | 외곽/내부 격자 방향 후보를 열거하고 선택·수정 가능하게 유지 | PARTIAL | `parking.js:candAngles`, `layout`, `ringLayout`, `plan`; `CODEX_editor_ui.js`; `CODEX_underground_ui.js` | 외곽 변 방향·오프셋·grid/ring 후보를 탐색하고 입력 편집은 가능하다. 그러나 후보군의 전체 기하·생성 이력을 보존해 사용자가 대안을 직접 선택·수정하는 계약은 없다. |
| NET-01 | DESIGN_PRINCIPLE | 역할 노드와 유향·가중 엣지의 차량망 | NOT_IMPLEMENTED | 해당 코드 없음 | 차로는 폴리곤이며 출입구 역할 일부만 있다. 주차구역 노드, 유향 엣지, 시간/거리 가중치 모델이 없다. |
| NET-02 | DESIGN_PRINCIPLE | 모든 출입구·주차구역의 진입/이탈 도달성 선행 게이트 | PARTIAL | `parking.js:verifyLayout`, `connectEntrances`, `circulationCheck`; `CODEX_underground_ui.js:generateCandidate`, `reachesGround` | 동일층 출입구–차로 연결과 지하 L1/L2는 검사한다. 모든 주차구역의 양방향 도달성, 유향 그래프, 최적화 전 독립 하드 게이트는 없다. |
| NET-03 | REFERENCE | 피크 수요·점유에 따른 가변 차로 방향 비교 | NOT_APPLICABLE_YET | 해당 코드 없음 | SPEC이 일방통행 방향·운영 시뮬레이션을 범위 밖으로 둔다. 현재는 초기 평면 생성 단계다. |
| MOD-01 | DESIGN_PRINCIPLE | 주차·차로·입구 모듈과 인접 제약의 CSP 표현 | NOT_IMPLEMENTED | 해당 코드 없음 | `ringLayout`의 내부 구현 변수 `modules`는 열 위치 묶음일 뿐 모듈 카탈로그·인접 허용관계·CSP가 아니다. |
| OPT-01 | DESIGN_PRINCIPLE | 하드 제약 후 대수·차로 품질의 Pareto 대안 보존 | PARTIAL | `parking.js:layout`, `plan` | 여러 grid/ring 대안 요약은 남기지만 단일 순위식과 대수 중심 선택이다. 목적 벡터, 비지배 전선, 선택 근거 보존이 없다. |
| EVID-01 | UNVERIFIED | 연구 실험값을 제품 기본값으로 승격하지 않고 provenance 보존 | NOT_APPLICABLE_YET | 해당 코드 없음 | 8.4m·20km/h·0.8 등 연구 실험값은 코드에 들어오지 않았다. 따라서 오용은 없지만 실험 파라미터와 provenance를 저장하는 기능도 아직 없다. |

## 3. 집계

| 상태 | 수 |
|---|---:|
| `FULLY_IMPLEMENTED` | 2 |
| `PARTIAL` | 22 |
| `NOT_IMPLEMENTED` | 16 |
| `NOT_APPLICABLE_YET` | 4 |
| **합계** | **44** |

분류 원장의 구성은 `PROJECT_REQUIREMENT` 13개, `DESIGN_PRINCIPLE` 22개, `REFERENCE` 4개, `UNVERIFIED` 5개, `LEGAL` 0개다. 코드의 공식 법령 감사 항목은 별도 법규 검토 결과를 사용하지만, 이번 44개 원장의 분류를 바꾸지는 않았다.

## 4. 간극 우선순위 제안

아래 순서는 **검토 제안**이다. 실제 구현 순서는 사용자와 세션 05가 결정하며, 이 문서는 엔진 코드나 SPEC을 변경하지 않는다.

### P0 — 거짓 PASS와 사업 간 수치 혼합 방지

1. `ruleProfile`과 provenance 계약: PARK-01, AISLE-01, RAMP-01~03, STR-01, SECT-01~02, EV-01, LEGAL-01, GEN-01을 프로젝트·용도·시행일·출처·강제 수준과 함께 주입한다.
2. 지하 전용 유효성 관문 유지·명료화: U1 후보의 `UNVERIFIED`를 유지하면서 L1/L2와 NET-02를 엔진 레벨의 명시적 탈락 사유로 만든다.
3. 역할 있는 연결 모델: NET-01의 차량 노드/유향 엣지와 코어 보행·피난 그래프를 분리한다. 단순 폴리곤 접촉을 도달성으로 승격하지 않는다.

### P1 — U1-5 이후 배치 품질에 직접 영향

1. 코어 목적지 연결: CORE-02~03, AISLE-04, SAFE-02를 지하 `pedestrianEntry/coreId/accessible`와 실제 배치기에 연결한다.
2. 특수구획 모델 확장: PARK-03, EV-01과 경형을 독립 `kind`로 만들고 시설 전체 요구량과 층/동별 배분을 분리한다.
3. 램프 프로젝트 조건: RAMP-01~05의 사업별 폭·반경·평탄 대기·출입구 수를 기존 `CODEX_ramp_rules.js` 감사와 연결한다. 시야와 실제 궤적은 계속 별도 미검증으로 둔다.
4. 서비스·피난 예약 객체: SERV-03과 FIRE-01의 최소 역할·연결 필드를 확정하고 필수 공간 존재를 후보 하드 게이트로 둔다.

### P2 — 후보 비교와 산출물

1. AISLE-02~03의 회차 공간·막다른 길이, 순환 품질을 용도별 지표로 분리한다.
2. PARK-04·PARK-06의 ㎡/대와 층별/시설 전체 결과표를 추가한다.
3. GEN-02·OPT-01의 후보 계보, seed/규칙 버전, 목적 벡터와 Pareto 비지배 대안군을 보존한다.
4. SAFE-03의 램프·갈림길 표지, 기둥 좌표, 구역 식별 출력은 기하 검증과 분리해 구현한다.

### P3 — 선행 전문자료 또는 후속 단계 필요

1. U1-5 실제 평면 12종으로 STR-03, CORE-01, SERV-01~02의 관계와 필요한 필드를 먼저 검증한다.
2. U2 특허·구조 관문 뒤 STR-01~03과 MOD-01을 검토한다.
3. 환기·배수·방수·조명·EV 화재·방화/제연은 전문 설계자료와 공식 현행 기준을 확보한 뒤 구현한다.
4. NET-03 운영 시뮬레이션과 EVID-01 연구 재현 파라미터 저장은 건축 평면 생성·검증과 분리한다.

## 5. 결론

현재 엔진은 일반/확장 구획 치수와 “근거 없는 방화·피난 판정을 하지 않는다”는 안전장치를 완전 반영한다. 또한 U1-4까지 외곽·코어/램프 면적 차감, 램프 수치 일부 감사, 동일층 차로 연결, L1/L2, 막다른 차로 진단, 1.2m 평면 보행 후보 같은 기반을 갖췄다. 그러나 44개 규칙 대부분은 프로젝트 프로필, 역할 있는 그래프, 지하 코어 목적지, 구조·설비·피난 의미 또는 다목적 대안 보존이 빠져 `PARTIAL` 또는 `NOT_IMPLEMENTED`다. 다음 단계는 규칙 수를 바로 늘리기보다 U1-5 실제 평면 증거와 `ruleProfile`/연결 데이터 계약을 먼저 고정하는 편이 안전하다.
