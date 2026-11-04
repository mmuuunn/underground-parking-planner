| 목표 점검 | 현황·문제 | 다음 최소 실험 |
|---|---|---|
| ○ 반복 실패 두 사례의 입력·실행·검사 한계 재현 / △ E2 옛 검사 전체 성공은 재현하지 못함 | **입력 기둥을 보존한 사실을 구조 전제가 타당하다는 근거로 사용했다.** 불확실한 전제 위의 대수·충돌·외벽 틈 개선이 계획 개선으로 추천됐다. | 같은 입력과 생성기를 그대로 두고, 생성 전 전제 심사표와 생성 후 기하 점수를 분리하는 읽기 전용 실험 한 개. |

# 기둥·주차 모듈 전제 누락의 반복 실패 — 자기 점검

2026-11-03. 제품 코드·사용자 입력 파일·기존 시험·기존 합격 기준을 수정하지 않았다. 이번 결과는 **주 담당자의 자기 점검**이며 독립 검증·제품 합격·구조 설계 승인이 아니다. 대표 실패는 두 개만 사용한다. 원도·외부 대화 기록을 새로 대량 반입하지 않았다.

## 1. 선택한 반복 실패와 확인 범위

선택한 실패는 **“모듈·기둥의 존재/생략 근거를 확인하기 전에 입력을 고정하고, 그 입력의 보존과 주차 기하 개선으로 성공을 측정한 것”**이다.

사용자가 반복 지적한 내용은 다음 두 장면에서 구체적으로 확인된다.

### R1. E2 A53 기준안 — 누락 기둥을 계승한 고정 입력

| 구분 | 내용 |
|---|---|
| 사용자가 기대한 상태 | 기존 구조 격자에서 있어야 할 기둥과 생략 근거를 먼저 대조한 도면. 지적된 두 교점이 누락됐다면 존재·외곽 제외·근거 있는 생략·미확인을 구별하고, 확인 없이 정상 구조로 간주하지 않는 상태. |
| 실제 상태 | E2 A안은38개 입력 기둥을 그대로 보존했지만 (36,750,36,400), (44,850,36,400)mm가 입력·결과 모두에 없다. A53 추천은 거부·철회됐다. |
| 입력과 출처 | [fixed-input.json][EINPUT] ← [이전 E2 후보][ESRC]. provenance에 이미 “기본 격자에서 생성한 실험이며 실측·확정 구조가 아니고 동일 입력 비교를 위해서만 고정”이라고 쓰여 있다. 사용자가 제공한 확정 구조도가 아니다. |
| 화면 | [기존 E2 A 그림][EIMAGE]. X36.75m·44.85m / Y36.4m 교점에서 기둥이 빠져 있다. [사용자 거부 기록][EDECISION]과 대응한다. |
| 실행 결과 | 원본 후보→고정 입력→A안의 fixed 객체는 동일하고 기둥 수38도 동일하다. 두 지적 교점의 존재값은 모두 false다. 둘 다600×600mm 가정 기둥 윤곽이 층 내부에 들어가고 램프와는 겹치지 않는다. |
| 추가 측정 | (44,850,36,400)에 가정 기둥 윤곽만 대입해 기존 A 차로와 겹침을 측정하면 **207,104.1605mm² ≈0.2071㎡**다. 다른 지적 교점의 차로 겹침은0이다. 두 곳 모두 A 주차칸과의 겹침은 없다. |
| 재현 한계 | 위 수치는 “그 기둥이 실제로 있어야 한다면”이라는 조건부 간섭 계산이다. 구조적 존재·생략 정당성을 확정하거나 기둥을 복원한 새 도면을 만든 것이 아니다. 원래 검사 전체의 성공은 아래 §4에서 설명한 파일 보존 조건 때문에 재현하지 못했다. |

즉, “기둥 보존38/38”과 “필요한 기둥의 누락0”은 같은 검사값이 아니다. **누락 두 개가 곧 주차대수 두 개의 과대 산정이라는 주장도 하지 않는다.** 이번 측정에서 드러난 직접 영향은 그중 한 곳의 차로 간섭이다.

E2의 외벽 단독 끝 칸, 불필요 회차마당, 양면열 분할선 문제도 거부 기록에 있다. 이번에는 이들을 추가 대표 실패로 넓히지 않고 기둥 전제 문제만 추적했다.

### R2. 60×50m 정형 시험 — 일반형을 선택하고 X10m·Y16m 구조를 직접 지정

| 구분 | 내용 |
|---|---|
| 사용자가 기대한 상태 | 이미 정리한 주차 모듈의 칸 묶음·기둥 반복·차로 위치 관계가 성립하는 시험 도면. 기존 일반형과 다른 고정 구조를 쓰면 그 근거·예외를 먼저 확인한 상태. |
| 실제 상태 | 제가 만든 시험 입력은 module=normal이면서 X축20·30·40·50m, Y축4·20·36m였다. X 간격은10m 세 구간, Y 간격은16m 두 구간이다. 이를 기둥12개 보존·외벽 틈0·54칸이라는 개선으로 제시했다. 사용자는 구조 전제를 지적했고 구현은 회수됐다. |
| 기존 입력 | [UG-WALL-ROW-CANDIDATE-001의 보존된 scene][SCENE]. 해당 장면은 제가 만든 검증용 입력이며 사용자 실무 프로젝트의 확정 구조가 아니다. [거부된 시험][OLDTEST]에도 같은 축이 있다. |
| 기존 모듈 | [제품 MODULES][MODULE]: 일반형8.1×8.0m, 확장형8.4×8.2m. [격자 코드][FRAME]는 gy와 차로 반복 P=2gy를 별도로 둔다. 일반형에서는 각각8m와16m다. 한 칸의 치수 목록은 구조 모듈 전체가 아니다. |
| 현재 실행 | 현재 제품 경로에서 **53칸·기둥12개·순환 있음·CONDITIONAL·RAMP_OFFGRID**, 충돌/앞면 없음/미도달=0/0/0. [현재 화면][NOWIMAGE]. 이는 “유효한 정상안”이라는 뜻이 아니다. |
| 회수 코드 실행 | 보관된 세 JS 파일을 별도 프로세스 메모리와 임시 브라우저 응답에만 올리면 **54칸·기둥12개·같은 상태와 램프 문제**, 충돌/앞면 없음/미도달=0/0/0을 재현한다. [회수 코드 재현 화면][ARCHIMAGE]. 현재 제품 코드에는 복원하지 않았다. |
| 동일 조건 확인 | 실제 제품의 planInput으로 만든 입력 SHA-256은 현재/회수 코드 모두 **607f4193…e3e8ba4c**다. 입력 사본 불변, 기둥 중심12개 동일, 브라우저 재열기 동일을 확인했다. [전체 측정][MEASURE], [화면 실행 기록][UIDATA]. |
| 반복 관계 진단 | Y축 첫4m에서8m 간격을 가정하면 내부12·28m 축이 비어 있다. 이것은 중간 축 누락을 드러내는 진단이며 정답 축을 자동 확정한 것이 아니다. 원점·외벽·고정 구조 근거는 별도로 확인해야 한다. |

53→54칸과 외벽 틈 감소는 **불확실한 구조 전제는 그대로 두고 공간 배치만 바꾼 결과**다. 따라서 이번 자기 점검에서도53칸을 올바른 대안으로 추천하지 않는다.

### 이미 있었는데 적용하지 못한 근거

[공모 비교표][SURVEY]와 [기둥·주차열 관찰][DOMAIN]에는 주차 구획 경계·3칸 묶음·격자 관계가 있다. [후속 구조 조사][STRUCTURE]는6-Bay8.1×8m와8-Bay10.7×8m 등 논문 사례를 구별한다. [SGHS][SGHS]는 불균일 X축과9m Y축, 추정·확인·생략 근거를 담고 있다.

이 자료가 없어서 실패한 것이 아니다. 다만 위 자료만으로 모든 기둥 스팬을 구조 계산상 승인할 수도 없다. **모든 실제 사례를8.1×8m로 강제하는 반대 오류 역시 피해야 한다.**

## 2. 결과가 만들어지는 순서와 바꾸기 어려운 선택

### 현재 일반 생성 경로 — 코드로 확인한 사실

| 순서 | 먼저 정해지는 것 | 다음 단계가 바꾸는 범위 / 고정되는 것 | 근거 |
|---|---|---|---|
| 1 | 화면의 모듈·고정 구조축·코어·램프를 엔진 입력으로 전달 | 고정축과 모듈은 함께 전달되지만 서로의 근거·반복 관계를 확인하는 검사는 여기 없다. | [planInput][PAGE]→[solve][SOLVE] |
| 2 | 입력 형식·양수 치수·축 좌표 순서/간격을 확인하고 실내 면을 만든다. | 명시적 구조축은 UCS 절대 좌표로 받는다. 축 배열의 유한성·정렬·최소 이격 검사는 실제 구조 승인이나 누락 축 검사와 다르다. | [Grid.normalize/columnAxes][GRID] |
| 3 | 주차 모듈 위상을 정한다. | 유효한 input.phase가 있으면 탐색하지 않는다. 자동 위상 탐색도 주기 gx·gy에 대한 원점 후보 비교이며, 고정 구조축을 새로 추가하는 탐색이 아니다. | [generate][PLAN], [rankPhases/planScore][PHASE] |
| 4 | 외곽 축소·주기 격자로 순환 차로·가지·내부 줄을 만든다. | 구조축의 중간 누락을 복구하거나 주차열과 함께 구조 타입을 다시 고르지 않는다. | [Net.lanes][NETWORK] |
| 5 | 램프 몸체를 반영해 차로를 다시 만들고 접속선을 찾는다. | 램프 후보의 이동·접속 판단은 있지만 이것이 구조 전제 재검토는 아니다. R2는 기존 램프 합류 문제를 계속 남긴다. | [램프 처리][RAMP] |
| 6 | 코어·점유물로 중심선을 자르고 기둥을 배치한다. | 고정축이면 주어진 교점과 omitted만 따른다. 구조축 배열에 없던 중간 축을 새로 요구하지 않는다. 비고정 경로는 차로·램프와 겹치는 기둥을 건너뛰므로 별도 전제다. | [build][BUILD], [placeColumns][COLUMN] |
| 7 | 차로·기둥·코어를 장애물로 놓고 주차칸을 생성·선택한다. | continuous는 생성된 열들 간 경쟁, back-to-back은 조건에 맞는 세로 양면열의 분할선 정렬이다. 이 단계에서 고정 기둥 집합·차로 구성·모듈 타입을 공동 재결정하지 않는다. | [placeStalls][ROWS] |
| 8 | 최종 형상의 충돌·전면·도달·순환을 검사하고 칸을 배정·제외한다. | 주어진 기둥의 충돌과 주차 기하를 검사한다. 출처로부터 있어야 할 기둥 집합을 재구성해 비교하는 코드는 확인하지 못했다. | [형상 검사][VERIFY], [상태 계산][VSTATUS] |

R2에서는 시작부터 고정축과 위상이 입력돼 있다. 후속 주차열 선택이 좋아져도16m 축 간격의 근거나 빠진 중간 축의 존재를 해결할 수 없다. 이는 코드 순서로 확인한 범위다. 이 순서 자체를 폐기해야 한다거나 순서를 바꾸기만 하면 모든 실패가 해결된다는 주장은 **가설**이다.

### 별도 E2 실험과 회수 코드의 경로

- E2 A는 현재 일반 생성기의 결과가 아니다. [build.py][EBUILD]는 저장된 fixed를 읽고 명시적인 차로 사각형·곡선·회차마당을 먼저 구성한 뒤 주차열을 만든다. 그 구조 집합 안에서 충돌을 피하고, [verify.py][EVER]도 같은 fixed와 비교한다. 공유 JS의 모듈·열 선택 구현을 거쳐 만들어진 안으로 취급할 수 없다.
- 회수된 R2 코드는 일반 generate 뒤에 [외벽 후보 선택][OLDPLAN]을 붙여 기존 안과 비교했다. [후보 생성][OLDNET]의 전체 폭·주차 깊이·충돌 조건은 있었으나 구조 전제의 근거·중간 축 정합은 비교 항목이 아니었다. 현재 generate에는 이 선택기가 없다.
- 현재 제품의 연속열 설정 전달 문제는 별도로 존재한다. 하지만 **R2는 automaticRowSelection=continuous를 명시했고 현재·회수 코드 모두 실제 입력에 continuous가 전달됐다.** 이번16m 실패를 그 설정 누락 하나로 설명하는 것은 반박된다.
- [수동 경로][MANUAL]는 제공된 차로와 continuous·network·two-way를 사용한다. 이 경로의 대수를 일반 자동 생성의 개선으로 바꾸어 집계해서는 안 된다.

## 3. 기존 접근의 반박 — 세 원인 가설

세 가설은 배타적이지 않다. 정보가 입력되는 단계, 호출되는 경로, 성공을 판단하는 단계에서 함께 작동했을 수 있다.

| 가설 | 뒷받침하는 관찰 | 그 가설이 틀렸음을 보여줄 반례 | 가설을 구별하는 가장 작은 실험 |
|---|---|---|---|
| H1. 읽은 지적·불확실성을 생성 전 필수 조건으로 고정하지 않았다. | R1 provenance가 이미 미확정 구조라고 했지만38개 보존을 강한 근거로 사용했다. 그 뒤 R2에서 기존 일반형과 다른10×16m 축을 근거 없이 정상 시험으로 만들었다. | 지적된 생략·장스팬·축 위치가 실제 자료와 사례별 예외로 설명되고, 생성 전에 이를 확인·기록한 입력에서도 같은 실패가 나온다면 H1은 그 실패의 충분한 원인이 아니다. | 기존 두 입력에서 기둥/축별 ‘주장한 근거·실제 존재·생략 근거·미확인’을 나란히 표시한다. 출처가 없는데도 정상 구조로 분류되는지 본다. 배치 수정은 하지 않는다. |
| H2. 구현된 규칙을 실제 경로가 우회했다. | E2 Python 실험은 공유 JS 생성기를 사용하지 않는다. 현재 fixed-column 경로는 입력 축의 카르테시안 교점을 따르므로 기존8m 주기 생성식으로 중간 축을 채우지 않는다. | R2에서는 현재·회수 코드의 입력 지문이 같고 continuous도 실제 호출됐다. 그런데 둘 다 같은 잘못된 축 전제를 유지한다. 즉 ‘설정이 안 켜졌다’만으로는 이 실패를 설명할 수 없다. | 같은 보존 scene으로 실제 planInput→generate를 현재 코드와 회수 코드에서 각각 호출해 전달값·진입점·기둥 집합을 비교한다. 이번 재현은 이 부분을 수행했다. |
| H3. 후단의 기하 검사와 개선 점수가 전제 타당성을 측정하지 않아, 국소 개선을 계획 개선으로 오인했다. | 원래 작업 기준은 외벽 틈0·대수≥53·순환을 측정했다. R1 검사는 같은38개 기둥에 대한 보존·충돌을 본다. R2 출력 사본에서 기둥 한 개를 빼도 형상 검사에 누락 지적이 없다. | 당시 성공 채점이 출처 기반 예상 기둥·모듈 정합을 포함해 이 입력을 먼저 보류했는데도 사람이 추천했다면, 채점 누락보다는 판정 결과를 무시한 보고·운영 문제가 원인이다. | 생성 결과와 기존 점수는 그대로 두고, 전제 미확인인 후보의 ‘계획 개선 추천 가능 여부’만 별도 표에서 가린다. 53→54가 추천 불가로 바뀌는지 확인한다. 기존 합격 기준은 수정하지 않는다. |

### 누락·호출·규칙·측정의 구별

| 구분 | 이번 판단 |
|---|---|
| 사용자의 지적을 누락했는가 | **확인된 운영상 누락.** 모듈·기둥 전제의 지적과 미확정 provenance를 읽고도 다음 시험의 필수 조건으로 옮기지 않았다. |
| 코드에 있지만 제품에서 호출되지 않는가 | **일부 확인되지만 이 실패의 전부는 아님.** E2 실험은 공유 생성기를 우회했다. R2의 continuous 전달은 정상 호출됐다. 존재하지 않는 구조 전제 검사를 “호출만 빠진 기능”으로 묘사할 수 없다. |
| 규칙 자체가 부족한가 | **확인한 범위에서 부족.** 형식 검증·기둥 보존·충돌 검사와 별개로, 출처 기반 구조축 완전성과 모듈 정합을 확인해 상태로 연결하는 규칙은 확인하지 못했다. 고정축을 임의로 수정하지 않는 동작 자체는 의도된 동작이다. |
| 성공을 잘못 측정했는가 | **확인.** 53→54와 외벽 틈 감소가 성립해도 구조 전제의 타당성을 입증하지 못했다. [기존 productVerdict][GATE]는 선언된 기대값·동일 입력·재열기 개선을 검사할 뿐 기대값의 건축적 충분성을 판독하지 않는다. |

## 4. 실패 재현 절차와 실제 결과

### A. 데이터·현재 엔진·회수 코드 재현

PowerShell에서 아래 명령을 실행한다. Node·Python·기존 설치된 Shapely가 필요하다. 설치·기존 코드 변경은 하지 않는다.

```powershell
Set-Location -LiteralPath 'C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner'
node 'C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/docs/evidence/20261103-input-basis/replay.cjs' --check
```

[replay.cjs][SCRIPT]는 다음만 수행한다.

1. 기존 E2 fixed·후보·A안의 기둥 집합을 비교하고 두 지적 교점의 부재를 계산한다.
2. 기존 E2 검사기와 입력 사본을 새 임시 폴더에 복사한다. 검사기 바이트가 원본과 같음을 확인한 뒤 실행한다. 원본의 검사 조건·snapshot·verification.json을 고치지 않는다.
3. 보존된 R2 scene을 실제 planInput 함수와 일반 generate로 전달한다.
4. 별도 자식 프로세스에서 보관된 JS 세 파일을 메모리에만 덧씌워 같은 입력으로54칸을 재현한다. 제품 파일을 회수 코드로 바꾸지 않는다.
5. 최종 출력 사본 하나에서 기둥 한 개를 제외해 현재 형상 검사의 범위를 확인한다. 사용자 입력·원래 출력 파일은 바꾸지 않는다.
6. 사실 측정값을 [measurements.json][MEASURE]과 대조한다. 이 명령의 정상 종료는 자기 재현 값의 일치를 뜻하며 제품 합격이 아니다.

| 재현 항목 | 실제 결과 |
|---|---|
| E2 A의 고정 입력 보존 | source→fixed→A 동일·기둥38개·지적 교점2개 부재 확인 |
| E2 가정 기둥과 A 차로의 겹침 | 두 곳 중 한 곳207,104.1605mm², 다른 곳0 |
| E2 원래 검사기 전체 | **재현 미완료. 종료 코드1.** 기하 검사와 치수 예시는 마지막 파일 보존 검사까지 도달했으나, 현재 underground-compare.html이 당시 지문과 달라 보존 assertion에서 중단. [실행 로그][EREPLAY]. 기존 성공 JSON을 새 성공으로 재사용하지 않았다. |
| R2 현재 일반 생성 | 53칸·12기둥·CONDITIONAL·RAMP_OFFGRID |
| R2 회수 코드 | 같은 입력 지문으로54칸·12기둥·같은 조건부·램프 문제 |
| 기둥 하나를 뺀 출력 사본 | 12→11개. 형상 검사 함수의 원래 출력/사본 모두 violations=[]·FEASIBLE. **전체 생성 결과는 RAMP_OFFGRID를 포함해 여전히 CONDITIONAL**이므로 둘의 상태를 혼동하지 않는다. |
| 불균일 축 제어 자료 | 기존 SGHS의9m Y축·불균일 X축·한 교점 생략 사유/출처가 형식상 받아들여짐. 이를 실제 구조 합격이나 생략 승인으로 계산하지 않는다. |

기둥 하나 제거 검사는 별도의 정상 도면이나 세 번째 대표 사례가 아니라, R2의 메모리 출력 사본을 이용한 검사 범위 확인이다.

### B. 실제 제품 화면에서53/54칸 재현

로컬 서버8874가 실행돼 있다면 다음 명령을 사용한다.

```powershell
node 'C:/Users/seok2/.codex/visualizations/2026/11/02/01a19ced-e76b-7a61-89cf-c9cc7fc092ef/input-basis-replay/ui-replay.cjs'
```

[화면 재현 스크립트][UI]는 두 개의 임시 브라우저 문맥을 만든다. 같은 기존 scene 사본을 넣고 현재 코드와 회수된 세 JS 응답만 각각 사용한다. 사용자 브라우저 저장소와 원본 입력 파일을 변경하지 않는다.

이번 실제 화면 결과는 현재53 / 회수54칸, 입력 지문 동일, 두 문맥 모두 저장 후 재열기 동일, 페이지 오류0이다. [실행 JSON][UIDATA], [현재53 화면][NOWIMAGE], [회수54 화면][ARCHIMAGE]. 기존에 열려 있던 브라우저 캐시를 근거로 삼지 않았다.

다른 환경에서 보관된 파일·Python/Shapely·Playwright 설치·로컬 서버가 없으면 해당 단계는 재현하지 못한 것으로 기록해야 한다. 새 대수나 이미지를 만들어 대신하지 않는다. 재현 스크립트가 임시 폴더 경로를 출력한다.

## 5. 다음 실험의 채점 — 기존 합격 기준과 별개인 제안

아래는 **다음 읽기 전용 실험을 위한 채점안**이다. 기존 제품 상태·시험·작업 합격 기준은 변경하지 않았다.

### 먼저 보여야 하는 도면·데이터 상태

- 기준 기둥축과 출력 기둥을 겹쳐 볼 때, 각 문제 교점이 ‘존재 / 근거 있는 생략 / 외곽 제외 / 미확인’ 중 하나로 식별돼야 한다.
- R1의 두 지적 교점이 설명 없이 빈 상태로 남았는데도 ‘구조 보존 완료·계획 개선’으로 요약하면 실패다.38개를 그대로 그린다는 이유로 이 관문을 통과하면 안 된다.
- R2는 선택한 타입과 실제 고정축·주차열·차로의 관계를 함께 보여야 한다. 근거 없는10×16m 고정축을 일반형 정상 사례로 제시하면 실패다.
- 배열 깊이16m와 구조 간격8m의 관계를 구별해야 한다. 정답을 만들려고 이번 입력에 중간 기둥을 임의로 추가하지 않는다.
- 이후 실제 배치가 해결됐다는 판단에는 **확인된 구조 위에서** 기둥과 열 분할선·주차칸·차로가 성립하는 도면이 필요하다. 이번 전제 심사만으로 그 도면까지 해결됐다고 할 수 없다.

### 측정값과 판정 경계

| 측정 | 다음 실험에서의 기대 | 의미·주의 |
|---|---|---|
| 입력 기둥 유지율 | 별도 수치로 그대로 기록 | 100%여도 전제 타당성은 통과가 아님 |
| 출처상 있어야 하는 기둥의 출력 누락 수 | 0 / 사본에서 한 개를 빼면1로 탐지 | 현재 단순 기하 검사와 구별해야 함 |
| 설명되지 않은 문제 교점 수 | R1에서2곳을 식별하고 추천 보류 | 생략 정당성이 밝혀지기 전 구조 오류로 확정해 기둥을 복원하는 것은 금지 |
| 선언 타입과 축 관계의 미설명 불일치 | R2의X10m·Y16m와 일반형 설정의 차이를 기록하고 추천 보류 | 실제 비정형·장스팬 사례를 일괄 탈락시키는 상한 규칙으로 만들지 않음 |
| 주차 배열 반복과 기둥 반복 | 두 값을 분리해 기록 | 16m를 무조건 불법·불가능 경간이라고 선언하는 규칙이 아님 |
| 칸 충돌·앞면·도달·순환·램프 문제 | 원래 계산값 보존 | 전제 심사로 기존 실패를 지우거나 FEASIBLE로 승격하지 않음 |
| 대수·외벽 틈 | 전제 심사 이후의 보조 비교값 | 53→54나 틈0만으로 추천하지 않음 |

### 계속 실패하거나 보류돼야 하는 입력

- **F1:** R1의 두 교점을 근거 없이 생략한 채 입력 보존만 검사한 결과 → 구조 전제 미확인·개선 추천 보류.
- **F2:** R2의 근거 없는16m 간격을 일반형 정상 구조로 취급한 결과 → 모듈 근거 미확인·추천 보류.
- **F3:** 출력 사본의 기둥을 한 개 빼고 검사 → 기하 충돌이 없어도 입력/근거 기둥과의 불일치를 탐지해야 함.
- **F4:** 기존 시험의500mm 차로 단절·코어 차단·고정 기둥 차단 → 기존 미도달·차단 판정을 유지해야 함. [기존 반례][TFAIL].
- **F5:** ‘불확실’ 경고를 작은 글씨로만 남기고 후보를 정상 개선으로 추천 → 실패. 경고 존재와 추천 차단의 연결까지 봐야 함.

### 과잉 차단을 막는 제어 조건

- 기존 일반형의 구조 반복gy와 차로 반복2gy를 구별하는 정상 산술 관계는 수용해야 한다.
- 기존 SGHS의9m·불균일 축은 근거가 있는 별도 조건으로 취급한다. 기본8m와 다르다는 이유만으로 ‘잘못된 구조’로 단정하면 실패다. 추정·미확인 부분은 그대로 남긴다.
- 생략 사유와 출처가 있는 교점은 ‘무근거 누락’과 다르게 표시해야 한다. 사유 문자열이 있다는 사실을 구조 승인으로 승격하면 역시 실패다.

### 사람이 판단해야 하는 부분

원도에서 해당 교점의 부재가 의도된 생략인지, 벽·전이구조로 지지되는지, 주차 모듈의 어떤 사례 타입을 선택할지, 특수 스팬을 사용할 근거가 충분한지는 설계 판단이 필요하다. “이 축은 무조건8m여야 한다”는 자동 규칙으로 대신할 수 없다. 이런 판단과 자동차 입출차·보행·법규 적합성은 이번 자기 점검에서 확정하지 않았다.

## 6. 추천하는 다음 최소 실험 하나

**‘동일 입력·동일 생성 결과에 전제 심사표만 앞에 붙이는 읽기 전용 분리 실험’**을 추천한다.

- 고정 자료는 R1 E2 A, R2 정형 scene, 기존 SGHS의 불균일 축/생략 근거를 가진 제어 자료뿐이다. 새 사례를 모으거나 새 주차 배치를 만들지 않는다.
- 제품 외부의 작은 측정기에 자료의 출처, 주장하는 타입·반복 관계, 문제 교점, 확인된 생략 근거를 별도 대조표로 준다. 원본 입력 파일은 그대로 둔다.
- 제품의 원래 대수·상태·기하 검사값은 바꾸지 않는다. 새 표는 ‘계획 개선 비교를 시작할 수 있음 / 전제 미확인으로 보류’만 구별한다.
- R1의 두 교점과 R2의 타입 불일치를 보류로 분리하면서, SGHS의 불균일 축 자체를 오류로 오판하지 않는지를 본다. F3 출력 기둥 삭제도 별도 집합 비교로 드러나야 한다.
- 이 결과가 나오면 H1/H3의 관문·측정 누락을 먼저 다뤄야 한다는 근거가 된다. 반대로 기존 근거로 전제가 모두 해명됐는데도 도면 문제가 남으면, 이번 선택 실패와 별개인 주차열·차로 공동 생성 규칙을 다음 대상으로 좁힌다.

이 실험은 생성 순서 전체를 갈아엎거나 새 후보를 그리는 실험이 아니다. **잘못된 전제의 후보가 좋은 점수로 추천되는 경로를 먼저 구별**하는 최소 단위다. 이 실험이 성공해도 제품·도면 해결 완료는 아니다.

## 7. 미확인 사항과 보존

### 미확인

1. E2 두 교점의 최종 구조적 존재·생략 근거. 현재 자료로는 입력에서 빠졌고 사용자에게 문제로 지적됐다는 점까지만 확인했다.
2. R2의10×16m 구조를 실제로 정당화할 설계 자료. 이 세션에서 제가 만든 시험에 그런 근거가 없었다.
3. 기존 공모의 모든 모듈 타입을 빠짐없이 구조화한 단일 카탈로그의 완성 여부. 이번에는 확인한 제품 타입·공모 비교표·SGHS 입력을 사용했으며 전수 재분류하지 않았다.
4. E2 원래 검사기 전체 성공. 기하 구간은 도달했으나 보존 지문이 달라 마지막 assertion은 실패했다. 당시 HTML의 정확한 작업 폴더 버전을 복원하지 않았고, 기준을 완화하지 않았다.
5. 회수 코드의 완전한 역사적 브라우저 환경. 세 JS와 해당 엔진 의존 파일은 재현했으나 HTML은 당시 지문과 다르다. 이번 화면은 현재 HTML 위에서 회수 JS만 임시 응답으로 제공한 결과다.
6. E2 원천 후보가 처음 만들어질 때 두 교점이 빠진 정확한 생성 분기. 이번에는 보존된 E2-candidate.json부터 입력이 계승되는 경로를 추적했다. 현재 비고정 기둥 배치가 차로·램프에 걸린 교점을 건너뛰는 동작은 확인했지만, 그것이 당시 두 교점 누락의 실제 원인이었다고 확정하지 않는다.

### 보존·실행 기록

작업 시작에 기존 저장소 파일과 선택한 원본 증거249개를 [지문 목록][BEFORE]으로 기록했다. 이번 작업의 저장소 쓰기 대상은 **이 보고서·새 재현 스크립트·측정JSON·새 지원 작업표 네 파일**뿐이다. 제품·입력·기존 시험·기존 합격 기준은 수정하지 않았다.

전역 지문 비교에서는 작업 도중 아래 세 파일의 변경이 관측됐다. 제가 쓰기 명령을 보낸 파일은 아니며, 주체·목적은 확인하지 않았다. 덮어쓰기·복구·삭제하지 않았다.

- C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/plan/aisle-depth-hypothesis.js
- C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/tools/harness/work-items/UG-AISLE-DEPTH-HYPOTHESIS-001.yaml
- C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/tools/test-aisle-depth.cjs

따라서 “전체 작업 폴더가 바이트 동일”이라고 보고하지 않는다. 이번 두 재현에 직접 쓰인 엔진·제품 호출부·입력·보관 코드·기존 시험의 지문 변경은 관측되지 않았다. 전역 환경 차이는 측정 JSON에 남기고, 사례의 재현값과 별도로 비교했다. [측정][MEASURE], [재실행 로그][RECHECK].

기존 npm 시험과 하네스 공통 시험은 환경·회귀 확인을 위해 실행했으며 제품 합격의 근거로 계산하지 않는다. [npm 로그][NPM], [이번 지원 작업 기록][WORK], [하네스 기록][HARNESS]. 새 지원 작업의 완료와 제품 진척을 구분한다. 다른 모델·서브에이전트 호출·커밋·push·자료 정리는 하지 않았다.

## 8. 다른 세션에 넘길 요약 — 다섯 항목만

**목표**  
기둥·주차 모듈의 미확인 전제를 입력 보존·기하 점수로 덮은 반복 실패를 구별한다. 다음 일은 제품 수정이 아닌 전제 심사와 기존 생성 점수의 읽기 전용 분리 실험이다.

**관련 파일**  
[본 재현기][SCRIPT], [측정JSON][MEASURE], [E2 고정 입력][EINPUT], [E2 A와 원래 검사][ESCHEMES]·[검사기][EVER], [R2 보존 scene과 거부 기록][SCENE], [현재 조립부][BUILD]·[격자][GRID]·[기둥 배치][COLUMN]·[형상 검사][VERIFY], [공모 기준][SURVEY]·[SGHS][SGHS]. 회수 코드는 [별도 보관본][OLDPLAN]이며 현재 엔진이 아니다.

**재현 절차**  
§4의 replay.cjs --check를 실행한다. R1은38개 동일 보존과 두 교점 부재, R2는 같은 입력 지문의 현재53/회수54칸을 확인한다. UI는 ui-replay.cjs를 사용한다. E2 원래 검사 전체는 HTML 지문 차이로 실패하는 상태를 그대로 기록한다. 제품·입력·기존 시험·기준을 고치지 않는다.

**판정 기준**  
대수·외벽 틈 전에 문제 교점·모듈/축 관계·근거·미확인을 분리한다. R1/R2는 근거 미확인 상태에서 개선 추천 보류, 출력 기둥 삭제는 탐지, 기존 차로 단절·기둥/코어 차단은 실패 유지. SGHS의 불균일 축을 단순히8m와 다르다는 이유로 오류 처리하지 않는다. 새 채점은 제품 상태나 기존 합격 기준을 바꾸는 것이 아니다.

**남은 질문**  
E2 두 교점의 실제 구조 근거는 무엇인가? 타입·기둥/열/차로 관계를 대조할 기존 자료를 어떤 최소 항목으로 묶을 것인가? 생략/장스팬의 근거 충분성과 보류 해제는 누가 판단할 것인가? 전제를 분리한 뒤에도 남는 도면 실패는 무엇인가?

[SCRIPT]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/docs/evidence/20261103-input-basis/replay.cjs:1>
[MEASURE]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/docs/evidence/20261103-input-basis/measurements.json:1>
[SCENE]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/tools/harness/work-items/UG-WALL-ROW-CANDIDATE-001.yaml:46>
[EINPUT]: <C:/Users/seok2/.codex/visualizations/2026/11/02/01a19c45-577f-7672-823f-da810977b649/e2-reference-layouts/fixed-input.json:1>
[ESRC]: <C:/Users/seok2/.codex/visualizations/2026/11/02/01a19b07-a42d-7cc2-bf9e-2e7d37dcae9c/low-manoeuvre-implementation/E2-candidate.json:1>
[ESCHEMES]: <C:/Users/seok2/.codex/visualizations/2026/11/02/01a19c45-577f-7672-823f-da810977b649/e2-reference-layouts/schemes.json:1>
[EIMAGE]: <C:/Users/seok2/.codex/visualizations/2026/11/02/01a19c45-577f-7672-823f-da810977b649/e2-reference-layouts/E2-reference-A.png>
[EDECISION]: <C:/Users/seok2/.codex/visualizations/2026/11/02/01a19c45-577f-7672-823f-da810977b649/e2-reference-layouts/review_2.md:1>
[EBUILD]: <C:/Users/seok2/.codex/visualizations/2026/11/02/01a19c45-577f-7672-823f-da810977b649/e2-reference-layouts/build.py:6>
[EVER]: <C:/Users/seok2/.codex/visualizations/2026/11/02/01a19c45-577f-7672-823f-da810977b649/e2-reference-layouts/verify.py:6>
[EVER2]: <C:/Users/seok2/.codex/visualizations/2026/11/02/01a19c45-577f-7672-823f-da810977b649/e2-reference-layouts/verify.py:64>
[EREPORT]: <C:/Users/seok2/.codex/visualizations/2026/11/02/01a19c45-577f-7672-823f-da810977b649/e2-reference-layouts/verification.json:1>
[EREPLAY]: <C:/Users/seok2/.codex/visualizations/2026/11/02/01a19ced-e76b-7a61-89cf-c9cc7fc092ef/input-basis-replay/run-2/e2-original-verifier/execution.log:1>
[OLDREPORT]: <C:/Users/seok2/.codex/visualizations/2026/11/02/01a19ced-e76b-7a61-89cf-c9cc7fc092ef/wall-row-build/review_2.md:1>
[OLDTEST]: <C:/Users/seok2/.codex/visualizations/2026/11/02/01a19ced-e76b-7a61-89cf-c9cc7fc092ef/wall-row-build/wall-row-candidate.rejected.cjs:5>
[OLDPLAN]: <C:/Users/seok2/.codex/visualizations/2026/11/02/01a19ced-e76b-7a61-89cf-c9cc7fc092ef/wall-row-build/CLAUDE_ugp_plan.js.rejected:335>
[OLDNET]: <C:/Users/seok2/.codex/visualizations/2026/11/02/01a19ced-e76b-7a61-89cf-c9cc7fc092ef/wall-row-build/CLAUDE_ugp_network.js.rejected:62>
[PAGE]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/CODEX_ug_compare_page.js:246>
[MODULE]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/CODEX_ug_compare_page.js:67>
[SOLVE]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/CODEX_ug_compare_page.js:286>
[MANUAL]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/manual-lane-editor.js:158>
[GRID]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/plan/CLAUDE_ugp_grid.js:13>
[FRAME]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/plan/CLAUDE_ugp_grid.js:63>
[BUILD]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/plan/CLAUDE_ugp_plan.js:57>
[PLAN]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/plan/CLAUDE_ugp_plan.js:329>
[PHASE]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/plan/CLAUDE_ugp_plan.js:290>
[NETWORK]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/plan/CLAUDE_ugp_network.js:61>
[RAMP]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/plan/CLAUDE_ugp_ramp.js:40>
[COLUMN]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/plan/CLAUDE_ugp_layout.js:83>
[ROWS]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/plan/CLAUDE_ugp_layout.js:150>
[VERIFY]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/plan/CLAUDE_ugp_verify.js:69>
[VSTATUS]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/plan/CLAUDE_ugp_verify.js:154>
[GATE]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/tools/harness/scripts/completion-gate.cjs:62>
[WORK]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/tools/harness/work-items/UG-INPUT-BASIS-REPLAY-001.yaml:1>
[SURVEY]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/90_이전건축도구_legacy/04_parking/04_docs/U1-5_실제평면_비교표_2026-10-20.md:80>
[DOMAIN]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/90_이전건축도구_legacy/04_parking/04_docs/CLAUDE_V2_도메인교차검토_2026-10-23.md:118>
[STRUCTURE]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/90_이전건축도구_legacy/04_parking/04_docs/CLAUDE_V2_도메인추가조사_2026-10-23.md:108>
[SGHS]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/sghs-reference.js:8>
[OMIT]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/01_src/sghs-reference.js:130>
[TEST]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/02_tests/CLAUDE_ug_plan_engine.test.cjs:351>
[TFAIL]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/04_parking/02_tests/CLAUDE_ug_plan_engine.test.cjs:701>
[UI]: <C:/Users/seok2/.codex/visualizations/2026/11/02/01a19ced-e76b-7a61-89cf-c9cc7fc092ef/input-basis-replay/ui-replay.cjs:1>
[UIDATA]: <C:/Users/seok2/.codex/visualizations/2026/11/02/01a19ced-e76b-7a61-89cf-c9cc7fc092ef/input-basis-replay/ui-results.json:1>
[NOWIMAGE]: <C:/Users/seok2/.codex/visualizations/2026/11/02/01a19ced-e76b-7a61-89cf-c9cc7fc092ef/input-basis-replay/wall-current.png>
[ARCHIMAGE]: <C:/Users/seok2/.codex/visualizations/2026/11/02/01a19ced-e76b-7a61-89cf-c9cc7fc092ef/input-basis-replay/wall-rejected.png>
[BEFORE]: <C:/Users/seok2/.codex/visualizations/2026/11/02/01a19ced-e76b-7a61-89cf-c9cc7fc092ef/input-basis-replay/protected-before.json:1>
[NPM]: <C:/Users/seok2/.codex/visualizations/2026/11/02/01a19ced-e76b-7a61-89cf-c9cc7fc092ef/input-basis-replay/npm-existing.log:1>
[RECHECK]: <C:/Users/seok2/.codex/visualizations/2026/11/02/01a19ced-e76b-7a61-89cf-c9cc7fc092ef/input-basis-replay/replay-check.log:1>
[HARNESS]: <C:/Users/seok2/OneDrive/바탕 화면/08 arch-automation/01_현재개발_planner/tools/harness/runs/20261103-015912-UG-INPUT-BASIS-REPLAY-001-0c99e23a/completion.json:1>
