| 목표 점검 | 현황·문제 | 결정할 것 |
|---|---|---|
| ○ 사례→코드→실제 호출→시험 대조 완료 / △ 일반 배치의 연결은 부분적 | 사례 분석·SGHS 입력·연속열·양면 정렬·기둥 보존·빈 섬 경고는 실제 존재한다. 자동 차로 구성과 일부 입력 전달·외벽 후보 생성에서 연결이 끊긴다. | 다음 한 단위: 고정 구조 아래 **외벽열–직선 차로–맞은편열을 함께 정하는 후보**를 일반 자동 생성에 연결한다. |

# 공모 사례 분석과 배치 엔진 연결 대조

2026-11-03 한국 시간 기준. 대상은 현재 미커밋 변경을 포함한 작업 폴더다. 비교 HEAD는 43da426d5a55e9a54218148b33c6b85334ed4259다. 이번 작업은 읽기 전용 조사와 보고 작성이며 제품·기존 시험·골든을 수정하지 않았다.

## 핵심 판단

**기존 성과는 재사용할 수 있다.** 불균일 고정 구조축, 교점 생략 기록, 실제 점유면에 따른 주차열 계산, 경쟁 연속열 선택, 세로 양면열의 공통 분할선 정렬, 기둥 충돌·미도달 검사가 공유 코드에 구현돼 있다. 연속열과 양면열 작업은 적용 범위·기본값 유지가 기록돼 있으며 모두 USER_GATE 상태다. 코드 존재와 사용자 승인 완료는 구별한다. [연속열 기록][WROW], [양면열 기록][WPAIR].

**핵심 단절은 차로를 자동으로 만드는 단계에 있다.** SGHS calibrated 입력을 일반 생성기에 직접 넘기면9칸·성립 불가, 추적 차로를 제공하면66칸을 만든다. 외곽·기둥·코어·램프는 같지만 차로의 출처와 판정 정책이 다르므로9→66을 자동 엔진의 개선으로 계산할 수 없다. 연속열 설정의 제품 전달 누락도 확인했지만, 그 설정을 직접 전달해도 일반 결과는9칸으로 같았다. 필드 이름 하나의 수정만으로 핵심 배치를 해결할 수 없다. [측정값][MEASURE].

## 근거의 층위와 확인 범위

- [U1-5 비교표][U]는11개 공모·48종을 기록한다. 격자 범위·분산 코어·층간 램프 반복·구획 유형 등14개 발견 중 일부는 [당시 SPEC][SPEC]에 반영됐다. 공모 내부 경쟁안은 독립적인 일반 통계 표본으로 취급하지 않는다.
- [10월23일 원도 교차검토][V]에는 P1–P6 착지·차로 패턴과 기둥·벽·램프 예외가 있다. “약60장 재독”은 기존 기록이며 이번에 재집계한 수치가 아니다. 그 문서도48종 전체의 개별 재검증을 주장하지 않는다.
- [SGHS 상세 입력][REF]은 치수열에서 얻은 축, 추정 외곽·주차열, 사용자 확인·가정을 구별한다. 연속열·275mm 양면열 보정은 이 후속 상세 추적과 피드백에서 발전했다. 48종 비교표에 이미 같은 정렬 알고리즘이 있었다고 소급하지 않는다.
- 이번에는 [SGHS 지하1층 원도 한 장][IMG](2,480×2,126px,848,627바이트)을 직접 열어 외벽 연속열, 남서측 등맞댄 열, 기둥·벽, 하역장 점선을 확인했다. 인쇄 치수열은 입력의 X2.6·9·6·3·8.4·8.4·8.4·3·6.85·5.35m / Y3.6·9·9·9·9·6.5m와 대응한다. 개별 기둥 단면·칸 치수·생략 교점의 구조 타당성은 확정하지 않았다.
- 기존 시험 재현, 실제 제품 자동/수동 화면, 독립 좌표 계산, 두 종류의441회 합성 입력 탐색, HEAD 별도 추출 비교를 수행했다. 48종 전체를 입력·정답 파일로 재현한 것은 아니다.

판정의 **구현**은 확인한 조건에서 코드·호출·검사가 이어짐, **부분 구현**은 경로·형상·검사 범위 제한, **미연결**은 원칙이 해당 생성·선택에 적용되지 않음, **미확인**은 근거만으로 정당성을 결정할 수 없음을 뜻한다.

## 원칙별 연결 대조

| 항목 | 사례·원문 근거 | 원칙·조건·확신 | 코드·실제 호출 경로 | 시험·반례 | 판정 | 최소 후속 조치 |
|---|---|---|---|---|---|---|
| 불균일 격자·스팬 | [U1-5][U] 발견3·8·14, SPEC5-2. 좁은 구간·장스팬·전이구조 추정 반례. | 관측 치수를 균등 격자로 강제하지 않는다. 관측 범위는 구조 허용값이 아니다. | [columnAxes][GRID]→고정축 xBays→[기둥 배치][COL]. SGHS8×5축, [제품 입력][INPUT]도 전달. 자동 차로 lineY·midX는 여전히 gx·gy 주기 격자다. | [고정축 시험][TC]과 이번 기둥 보존 확인. 스팬을 스스로 탐색하거나 전이구조를 판단하는 검사는 확인하지 못했다. | **고정 입력 구현 / 자동 구조 제안 미연결** | 고정축·실제 기둥 면을 자동 차로 후보의 제약으로 사용한다. |
| 기둥 존재·생략 | 교차검토§4의 램프 개구 생략은 ⚠ 판독. SGHS는 [한 교점 생략][CAL] 기록. | 기둥 입력 보존과 그 입력의 완전성은 별개다. 현재 사유는 필수·출처는 선택이다. | [고정축 경로][COL]는 omitted만 제외, 차로 충돌 시 기둥 보존. 일반 격자 경로는 램프뿐 아니라 차로 면과 겹친 교점도 건너뛴다. | 사유 없는 생략 거부, 지정1곳만4→3개, 고정 기둥과 겹친 차로 차단 통과. 일반 생성에서 빠진 교점의 구조 근거 검사는 없다. | **고정 보존 구현 / 일반 생략 부분 구현 / 구조 정당성 미확인** | 교점별 존재·외곽 제외·생략·미확인을 대조한다. 실험38개 보존만으로 완전성을 승인하지 않는다. |
| 기둥·벽 통합 | 교차검토§4: 벽에 붙는 기둥·코어 안 기둥. [근거][V]. | 벽 통합 부재도 구조 실체와 충돌 검사를 유지해야 한다. | [wall-integrated][GRID]는 유일한 coreId 요구. omitted와 달리 기둥을 지우지 않는다. core-fit의 벽·기둥 분류와 연결. | [교점·코어 시험][TC]은 잘못된 참조 거부·기둥 보존 검사. 램프 개구의 전이보·벽 자동 설계는 없다. | **입력·보존 구현 / 구조 설계 미확인** | 벽 통합과 생략을 구별해 입력한다. |
| 연속열과 직교 칸 경쟁 | SGHS 서측 안쪽·남서 쌍열 추적, [후속 작업][WROW]. | 짧은 직교 칸의 선점보다 긴 열을 비교한다. 전체 최적의 증명은 아니다. | [selectRows][ROW]: 연속 칸 수 제곱→대수→기존 형상 유지, 경쟁구역당20,000회 한도. [기본값][STALL]은 sequential. [수동][MANUAL]은 continuous. 제품은 fixture의 stallRowSelection 대신 automaticRowSelection을 읽음. [전달][INPUT]. | [비SGHS T 시험][T]46→47칸. 500mm 단절17칸 미도달·코어 차단8칸 미도달 유지. 새 자동 화면도 fixture continuous를 전달하지 않음. | **공유 구현 / 자동 적용 부분 단절** | 일반 자동 경로에 명시적으로 연결하고 기존 입력·재열기 호환을 검사한다. 단독 수정으로 차로 문제가 해결되지는 않는다. |
| 양면열 공통 분할선 | SGHS 남서측4+4열, [양면열 작업][WPAIR], 이번 원도 확인. | 세로열·반대 앞면·같은 칸 폭·등 간격0~기둥 폭·양측 대수 보존이 조건. | [back-to-back][ALIGN], 기본 independent. calibrated가 켜고 새 제품 문서·수동 경로도 전달. 가로·사선열 전체의 공동 정렬은 아니다. | 기존 --paired:275→0mm·8칸·전체66 유지. 독립441조건: 가능388개 모두 정렬·불가능53개 기존 배치·대수 손실과 직사각 충돌0. | **조건 내 구현 / 전체 방향 확장 미연결** | 다음 후보가 공유 정렬을 재사용하게 한다. 잘린 열을 별도 가운데 정렬해 우회하지 않는다. |
| 외벽·모서리·끝 구간 | SGHS 외벽열·남단. U1-5에는 보편적 “외벽 연장 우선” 순위가 없다. 최근 [E2 거부][E2REJECT]에서 우선순위가 명시됨. | 놓을 수 있는 기하와 어떤 열을 우선할지는 다르다. 모든 단독 칸 금지로 확대하지 않는다. | [가로열][HOR]은 xBays 안만 생성, [고정축 xBays][BAYS]는 첫~마지막 축 사이만 열거. 세로열은 점유 띠, [사선벽][DIAG]은 벽 직각 후보. 선택기는 생성된 후보만 비교. | [기존 직사각·사선 시험][TW] 존재. 배치단계 반례: 차로X1~39m·축X10/20/30m이면 후보12칸이 모두X10~30m, 양 끝 후보0. 실제 도달 대수 인증은 아님. | **일부 형상 구현 / 후보 포괄성·우선순위 부분 구현** | 외곽·실제 점유물로 정한 구간에 외벽 끝 부분을 포함한다. 선택 가중치만으로 없는 후보를 회복할 수 없다. |
| 차로·주차열 공동 구성 | [P1~P6][V]: 홀·직결·코어 분기·섬 순환·곡선 안쪽·램프 양옆. | 처리 순서의 유효성과 특정 격자 차로 생성기의 한계를 구별한다. | [build][BUILD]→[Net.lanes][NET]→램프→코어·기둥→placeStalls. 주기 격자·외곽 축소로 차로를 먼저 만들며 열 결과를 받아 국소 방향·순폭을 공동 결정하지 않는다. [제공망][CONNECT]은 별도 입력. | calibrated 일반9칸·lost47, 제공망66칸·미도달0. 둘 다 순환 없음. 일반 생성은 외곽 순환 최소 폭을 요구해 소규모 홀형 일반화를 보장하지 않는다. | **제공망 처리 구현 / 자동 공동 구성 미연결** | 외벽열–직선 차로–맞은편열 한 종류를 고정 구조에서 함께 만들어 일반 경로에 연결한다. |
| 램프·코어·주차 금지 바닥 | P1~P3, SGHS 하행 접속부·하역장. | 차량 통과 가능한 주차 금지 바닥과 물리 장애물을 구별한다. | [조립][BUILD]은 occupants와 parkingReservations를 구별. calibrated의 [vehiclePassable 예약][PAIR] 연결. loading은 참고 데이터이며 planInput의 별도 예약으로 전달되지 않는다. | 현재 제공망66칸 중 하역 참고 상자와 겹친 직교 후보3개. 제약에 안 넣은 공간이며 새 회귀로 단정하지 않는다. 원도 판독59칸과 공식 총대수는 구별. | **접속 예약 구현 / 하역 연결 미완 / 전체 동작 미확인** | 고정할 용도 공간을 동일 비교 조건에 명시한다. 착지·회차·칸별 주행은 별도 검사한다. |
| 빈 기둥섬·불필요 순환 | P4 코어·주차 섬 관찰 및 사용자 피드백. 모든 원도에 빈 섬이 없다는 증명은 아니다. | 3칸·20㎡는 조사로 확정한 기준이 아닌 현재 휴리스틱이다. | [emptyIslands][ISLAND]: 구멍20㎡ 초과·3칸 미만 경고. 코어·점유물이0.01㎡ 초과 겹치면 섬 전체 제외. [planScore][SCORE]에 빈 섬·잔여 형태 직접 반영 없음. | [기존1칸/3칸 시험][TI]과 코어 예외 시험 존재. 1㎡코어를441위치에서 이동:324㎡섬에 걸친361곳 모두 경고 제외,80곳 경고. 전부 나쁜 계획이라는 뜻은 아니다. | **탐지 부분 구현 / 후보 선택 미연결** | 실제 코어 기능·접근과 섬 전체 이용을 구별하고 후보 평가에 연결한다. |
| 잔여공간·시험 범위 | U1-5 설비·비주차층, [완료 기준][BASELINE]. | 빈 면적의 분류는 실제 설비·피난 요구량이 아니다. | [S8·leftovers][LEFT]와 구역 분류 존재. [골든6개][GOLD]는 기준 형상·사용자snapshot 등. [다른 골든 README][GOLDREADME]는 준비 문서. | npm133/133·하네스110/110 통과. 시험이 없다는 주장은 반박됨. 48종별 코드·정답 도면 대응표는 이번 확인에서 찾지 못함. | **계산·회귀시험 구현 / 공모 전체 검증 미연결·미확인** | 다음 조건 하나를 원문 근거·성공/실패 입력·실제 제품 실행과 묶는다. 사례 재수집은 필요하지 않다. |

## 실제 실행 경로의 차이

| 실행 | 호출·설정 | 이번 값과 해석 |
|---|---|---|
| 제품 자동 / calibrated 새 문서 | [startPlan][LOAD]→[planInput][INPUT]→[solve][SOLVE]→generate. fixture selection=continuous, 전달값 없음. alignment는 back-to-back 정상 전달. | **9칸·38기둥·순환 없음·INFEASIBLE.** fixture continuous를 직접 전달한 generate도9칸·lost47. [화면 기록][UIAUTO]. |
| 참고 비교 화면·기존 --paired | [sghs-compare][COMPARE] 또는 fixture가 generateConnected에 추적 차로와 network·euclidean을 제공. | **66칸·전부 deadSide·순환 없음·INFEASIBLE.** 기존 보고 재현. 자동 생성 개선으로 집계하지 않는다. |
| 제품 수동 차로 / calibrated | [수동 calculate][MANUAL]가 continuous·network·euclidean·trafficMode=two-way 추가. | **66칸·38기둥·전부 deadSide·순환 없음·CONDITIONAL.** 회차·후진·교행 미검증 경고. 조건부는 주행 합격이 아니다. [화면 기록][UIMAN]. |
| 별도 E2 A/B/C 좌표 실험 | [검사 실행기][E2CHECK]는 외부 verify.py를 실행. 일반 엔진 경로가 아님. | A53 추천은 사용자 거부·철회. [작업표][E2], [재판정][E2REJECT]. 입력38개 보존과 누락 교점의 정당성은 다르다. 이 실패를 일반 엔진 전체로 전이하지 않는다. |

첫127.0.0.1 화면에는 과거 저장 문서가 있어 양면 정렬 필드가 없었다. 저장 입력을 덮어쓰지 않고 localhost의 별도 저장공간에서 새 문서를 확인하자 정상 전달됐다. 따라서 “양면 정렬이 항상 제품에서 빠진다”는 결론은 내리지 않았다. 연속열 필드 누락은 새 문서에서도 재현됐다.

## 확인·반박·보완

**확인:** SGHS 구조축·주차열·접속 예약, 공유 연속열·양면 정렬, 기둥·칸·차로 독립 검사가 존재하고 작동한다. 양면열441조건은 재사용할 근거다.

**반박:** “사례를 다시 모아야 시작할 수 있다”, “연속열·양면열 코드와 시험이 없다”, “66칸이 일반 자동 생성 성과다”, “A53 기하 검사 통과가 계획 승인이다”는 현재 근거와 맞지 않는다.

**보완:** 기존 양면열 보고의66칸·INFEASIBLE은 현재도 기본 정책에서 재현된다. 미커밋 제품 수동 경로는 two-way로 CONDITIONAL을 낸다. 이 상태 차이는 회차 시험 통과가 아닌 정책 분기다. 외벽·모서리 우선순위나 빈 섬 수치가48종 조사에서 완성된 범용 규칙으로 나왔다고 말할 수 없다.

## 독립 성공·실패 입력

[측정 스크립트][AUDIT]는 제품을 수정하지 않고 공개 진입점을 호출한다. 직사각 겹침·주기 정렬 가능성은 별도 수식으로 계산했다. SGHS13행 방향표는 기존 auditB1의 진단 재현이며 독립 실측으로 표시하지 않았다. [전체 값][MEASURE].

| 입력 | 결과와 유지할 조건 |
|---|---|
| P1 기준 직사각형 | 130칸·순환 있음. 정상 입력의 과잉 차단 방지. |
| P2 비SGHS T 경쟁열 | 46→47칸. 기본 정책 NO_LOOP 실패 유지. |
| P3 양면열441조합 | 좌우 시작1,000~3,500mm·125mm 간격, 끝점 차이0~500mm·칸 폭2,500mm. 가능388개 정렬·불가능53개 기존 배치·전441개 대수 유지·충돌0. 다른 모든 형상·장애물을 보장하지 않음. |
| P4 지정 교점 생략 | 사유 있는1곳만4→3기둥. 다른 고정 조건 보존. |
| F1 500mm 단절 | 미도달17칸·끊긴 그래프 유지. |
| F2 코어 차로 차단 | 미도달8칸·CORE_IN_AISLE 유지. |
| F3 고정 기둥 차단 | 기둥4개 보존·FIXED_COLUMN_BLOCKS_ROUTE. 차로를 위해 기둥을 지우지 않음. |
| F4 사유 없는 생략 | RangeError 거부. 실제 구조 타당성까지 검사한 것은 아님. |
| 진단A 가로 외벽 끝 구간 | 첫~마지막 고정축 밖 후보가 열거되지 않음. 배치단계 분리 측정이며 정답 대수 인증 아님. |
| 진단B 빈 섬441위치 | 코어 중심X·Y5~25m·1m 간격. 324㎡ 구멍에1㎡ 코어가 겹친361곳은 전체 제외,80곳은 경고. 현행 코어 예외 범위를 측정. |

진단A/B는 현행 한계를 드러내는 입력이다. 다음 구현에서 바꿀 기대값을 골든으로 미리 승인하지 않았다.

## HEAD와 현재 비교

HEAD를 별도 폴더에 git archive로 추출해 같은 스크립트를 실행했다. 작업 폴더 reset·미커밋 변경 이동은 하지 않았다. [HEAD 값][HEAD], [현재 값][MEASURE].

| 항목 | HEAD | 현재 |
|---|---|---|
| 연속열 전달 누락 | 있음 | 있음 |
| calibrated 일반 생성 | 9칸·INFEASIBLE | 동일 |
| 제공망 기본 정책 | 66칸·INFEASIBLE | 동일 |
| 제공망 two-way 입력 | 66칸·INFEASIBLE / NO_LOOP | 66칸·CONDITIONAL / RETURN_MANEUVER_UNVERIFIED |
| 양면441·외벽 진단·섬441·기둥 보존·T46/47 | 같은 결과 | 같은 결과 |

최초 HEAD 실행은 현재 정책의 “two-way는 CONDITIONAL” 기대에서 멈췄다. 정책 지원 여부를 결과로 기록하도록 감사 스크립트를 보완한 뒤 두 버전에 동일하게 실행했다. 제품 시험·골든값은 바꾸지 않았고 HEAD의 미지원은 INFEASIBLE로 보고했다. 이 비교는 위 입력에 한정하며 미커밋 전체 변경의 무결함을 뜻하지 않는다.

## 다음 최소 구현 단위 하나

**고정 구조에서 ‘외벽 주차열–직선 차로–맞은편 주차열’을 함께 정하는 후보 한 종류를 일반 자동 생성에 연결한다.**

자동 차로망과 제공망 사이가 현재 가장 큰 단절이다. 기존 주차열 규칙이 사용할 수 있는 차로 구간을 구조와 함께 만드는 연결을 먼저 시험해야 한다.

범위는 직교 직선 구간 한 종류다. 외벽 내측선·주차 깊이·고정 기둥의 실제 면·차로 순폭으로 후보를 만들고 기존 연속열·양면 정렬·최종 검사를 재사용한다. 원도 추적선을 답으로 주거나 E2 특정 좌표를 넣지 않는다. 전체 순환·교차·램프 조건은 기존 검사에 남긴다.

1. 같은 고정 조건에서 기둥을 삭제하지 않고 외벽 끝 구간을 포함한 가능한 연속열과 맞은편 공통 분할선을 만든다.
2. 실제 일반 generate 호출이 새 후보를 사용해야 한다. 참고 화면·별도 그림만으로 완료 처리하지 않는다. 제품 입력의 연속열 전달도 이 경로에서 확인한다.
3. 충분한 공간은 후보를 내고, 기둥 충돌·순폭 부족·단절·코어 차단은 계속 실패해야 한다. 정상 골든과 불가능한 양면 정렬의 안전 배치를 보존한다.
4. 같은 입력의 채택된 열 연속성·앞면·도달·빈 섬 변화를 비교한다. 66칸이나 최대 대수 자체를 목표로 정하지 않는다. 자동/제공망 구분과 회차 미검증을 보고한다.
5. 제품 결과가 달라지면 독립 검토와 사용자 화면 확인을 거친다. 이번 조사에서는 구현·단계 종료·다음 작업 승인을 기록하지 않는다.

외벽 후보 범위·입력 전달·양면열 재사용은 이 한 후보를 끝까지 연결하는 조건이다. 홀형·곡선 내부 주차·모든 모서리·다층·구조 설계까지 완료 조건을 넓히지 않는다.

## 재현·보존 기록

- npm test **133/133**. [로그][NPM].
- 하네스 공통 **110/110**. npm7개 파일과 하네스5개 파일의 범위가 달라133+110개의 독립 시험으로 합산하지 않는다.
- node sghs-reference.js --paired:66칸·275→0mm 및 실패 상태 재현.
- node docs/evidence/20261103-case-engine/audit.cjs --check:독립 측정 재현. [스크립트][AUDIT], [측정JSON][MEASURE].
- [지원 작업표][WORK]와 [최종 하네스 영수증][HARNESS]. 제품 진척으로 집계하지 않는다. 이번 읽기 전용 자기 검증은 제3자의 독립 승인이 아니다.
- 시작 시 기존204개 파일의 SHA-256을 [보존 목록][BEFORE]에 기록했다. 마지막 비교는 [보존 검사][PRESERVE]에 남긴다.
- 새 저장소 파일은 보고서1개·감사 스크립트·측정JSON·지원 작업표의4개다. 제품·기존 시험·골든·원도·기존 사용자 문서를 덮어쓰지 않았다. 커밋·push·정리·새 E2 그림·추가 사례 수집·다른 모델 호출은 하지 않았다.

48종 전체의 좌표·구조·법규·차량 주행 및 건축계획 합격은 확인하지 않았다.

[U]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/90_이전건축도구_legacy/04_parking/04_docs/U1-5_실제평면_비교표_2026-10-20.md:76>
[V]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/90_이전건축도구_legacy/04_parking/04_docs/CLAUDE_V2_도메인교차검토_2026-10-23.md:103>
[SPEC]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/90_이전건축도구_legacy/04_parking/04_docs/SPEC_지하주차_2026-10-19.md:73>
[IMG]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/90_이전건축도구_legacy/08_ Pilot test/01 동대문구 구민회관 부지 복합개발(문화시설)사업 설계공모/01 당선작_SGHS/DG-80514_plan_06.jpg>
[REF]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/sghs-reference.js:8>
[TRACE]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/sghs-reference.js:89>
[CAL]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/sghs-reference.js:128>
[PAIR]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/sghs-reference.js:156>
[GRID]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/plan/CLAUDE_ugp_grid.js:13>
[BAYS]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/plan/CLAUDE_ugp_grid.js:87>
[COL]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/plan/CLAUDE_ugp_layout.js:81>
[ROW]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/plan/CLAUDE_ugp_layout.js:101>
[STALL]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/plan/CLAUDE_ugp_layout.js:150>
[HOR]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/plan/CLAUDE_ugp_layout.js:176>
[ALIGN]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/plan/CLAUDE_ugp_layout.js:222>
[DIAG]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/plan/CLAUDE_ugp_layout.js:267>
[NET]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/plan/CLAUDE_ugp_network.js:55>
[BUILD]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/plan/CLAUDE_ugp_plan.js:57>
[OPTIONS]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/plan/CLAUDE_ugp_plan.js:130>
[SCORE]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/plan/CLAUDE_ugp_plan.js:290>
[ISLAND]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/plan/CLAUDE_ugp_plan.js:198>
[LEFT]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/plan/CLAUDE_ugp_plan.js:223>
[CONNECT]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/plan/CLAUDE_ugp_plan.js:337>
[VER]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/plan/CLAUDE_ugp_verify.js:69>
[FRONT]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/plan/CLAUDE_ugp_verify.js:114>
[INPUT]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/CODEX_ug_compare_page.js:246>
[SOLVE]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/CODEX_ug_compare_page.js:285>
[LOAD]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/CODEX_ug_compare_page.js:896>
[MANUAL]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/manual-lane-editor.js:158>
[COMPARE]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/sghs-compare.html:26>
[T]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/02_tests/CLAUDE_ug_plan_engine.test.cjs:681>
[TC]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/02_tests/CLAUDE_ug_plan_engine.test.cjs:351>
[TI]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/02_tests/CLAUDE_ug_plan_engine.test.cjs:341>
[TW]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/02_tests/CLAUDE_ug_plan_engine.test.cjs:10>
[GOLD]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/02_tests/fixtures/underground-golden-cases.json:1>
[GOLDREADME]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/tests/underground/golden/README.md:1>
[BASELINE]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/docs/COMPLETION_BASELINE.md:9>
[WROW]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/tools/harness/work-items/UG-SGHS-ROW-SELECTION-001.yaml:44>
[WPAIR]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/tools/harness/work-items/UG-SGHS-PAIRED-ROWS-001.yaml:43>
[E2]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/tools/harness/work-items/UG-E2-REFERENCE-LAYOUT-001.yaml:39>
[E2CHECK]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/tools/check-e2-reference-layouts.cjs:4>
[E2REJECT]: <C:/Users/seok2/.codex/visualizations/2026/11/02/01a19c45-577f-7672-823f-da810977b649/e2-reference-layouts/review_2.md:1>
[AUDIT]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/docs/evidence/20261103-case-engine/audit.cjs:1>
[MEASURE]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/docs/evidence/20261103-case-engine/measurements.json:1>
[HEAD]: <C:/Users/seok2/.codex/visualizations/2026/11/02/01a19ced-e76b-7a61-89cf-c9cc7fc092ef/case-engine-audit/head-measurements.json:1>
[UIAUTO]: <C:/Users/seok2/.codex/visualizations/2026/11/02/01a19ced-e76b-7a61-89cf-c9cc7fc092ef/case-engine-audit/ui-fresh-auto.json:1>
[UIMAN]: <C:/Users/seok2/.codex/visualizations/2026/11/02/01a19ced-e76b-7a61-89cf-c9cc7fc092ef/case-engine-audit/ui-manual.json:1>
[NPM]: <C:/Users/seok2/.codex/visualizations/2026/11/02/01a19ced-e76b-7a61-89cf-c9cc7fc092ef/case-engine-audit/npm-test.log:1>
[BEFORE]: <C:/Users/seok2/.codex/visualizations/2026/11/02/01a19ced-e76b-7a61-89cf-c9cc7fc092ef/case-engine-audit/files-before.json:1>
[PRESERVE]: <C:/Users/seok2/.codex/visualizations/2026/11/02/01a19ced-e76b-7a61-89cf-c9cc7fc092ef/case-engine-audit/preservation.json:1>
[HARNESS]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/tools/harness/runs/20261103-004515-UG-CASE-ENGINE-CROSSWALK-001-549f67e1/completion.json:1>
[WORK]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/tools/harness/work-items/UG-CASE-ENGINE-CROSSWALK-001.yaml:1>
