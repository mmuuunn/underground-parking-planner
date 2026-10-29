# 지하주차 개발 하네스

하네스는 **시작 조건 → 실제 검증 → 검토·승인**을 확인한다. 공통 시험 통과와 작업 완료를 구분하며, 다른 모델을 자동 호출하지 않는다.

| 단계 | 확인하는 것 | 막는 상황 |
|---|---|---|
| 시작 | 목표, 현재 단계, 실행 경로, 작업별 검사, 선행작업 | 조건 누락, 미완료 선행작업, 참고 실험을 제품 작업으로 지정 |
| 검증 | 공통 시험 + 실행형 작업 검사 + 제품 전후 측정 | 시험만 통과, 참고 연결망 대체, 동일 입력에서 개선 없음, 재열기 불일치 |
| 종료 | 필요한 독립 검토와 사용자 승인 | 승인 누락, 다른 실행이나 변경 전 코드의 승인 재사용 |

## 실행

저장소 루트에서 작업표를 만든 뒤 다음 순서로 실행한다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/harness/scripts/preflight.ps1 -WorkItem tools/harness/work-items/UG-HARNESS-005.yaml
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/harness/scripts/verify.ps1 -WorkItem tools/harness/work-items/UG-HARNESS-005.yaml -RunId <첫 명령에서 출력한 run_id>
```

계산 시험만 실행할 때는 `npm test`를 쓴다. 작업 검증에는 시작 기록의 RunId가 필요하다. 시작 후 목표·실행 경로·기대값·검사·허용 파일을 바꾸면 기존 RunId로 통과할 수 없다. 수정된 범위로 새로 시작한다.

공통 시험 결과도 검사 당시 코드 지문에 묶는다. 코드가 바뀌면 예전 시험 통과와 검토·승인을 재사용할 수 없다.

## 작업표에 고정할 것

기존 작업표에 `completion_contract: |`와 들여쓴 JSON을 추가한다. 실제 예시는 `work-items/UG-HARNESS-005.yaml`에 있다.

- `kind`: `product`는 실제 제품 개선, `experiment`는 참고 실험, `support`는 하네스·정리 같은 지원 작업이다. 뒤의 두 종류는 제품 진척으로 집계하지 않는다.
- `goal`, `stage_goal`, `target`: 이번 결과, 현재 단계의 목표 문장, 실제 실행 대상을 적는다. stage_goal은 현재 단계 파일의 문장과 일치해야 한다.
- `depends_on`: 완료가 필요한 작업표의 저장소 상대 경로다. 선행작업은 ACCEPTED 상태와 유효한 완료 영수증이 있어야 한다.
- `checks`: `{ "id":"검사명", "script":"저장소 안의 검사.cjs", "args":[] }` 목록이다. 각 Node 스크립트를 실제 실행하며 실패·시간 초과는 작업 실패다. 자연어 합격 조건 전체의 의미를 자동 판독하는 기능은 아니다.
- `review_required`, `user_required`: 필요한 검토와 승인을 명시한다. 제품 작업은 사용자 승인이 필수다. 제품 코드·화면을 바꾸면서 사용자 확인을 끌 수 없다. 계산 코드 변경이나 활성 코드 5개 이상은 독립 검토를 자동 요구한다. 다른 위험 조건은 policy.yaml에 따라 선언한다.

제품 작업은 `target`을 `04_parking/underground-compare.html`로 지정하고 다음 항목을 추가한다.

```json
"product": {
  "url": "http://127.0.0.1:8874/04_parking/underground-compare.html?reference=sghs&floor=B1&revision=calibrated",
  "expect": {
    "result.stallCount": {"gte": 60},
    "result.graph.hasLoop": {"eq": true},
    "routes.entry.state": {"eq": "clear"},
    "routes.exit.state": {"eq": "clear"}
  }
}
```

이 수치는 형식 예시이며 SGHS의 승인된 대수·완성 기준이 아니다. 작업마다 기대값을 먼저 정한다. `eq`, `gte`, `lte`로 실제 결과를 검사하고, 적어도 하나의 미달 조건이 충족으로 바뀌어야 제품 개선으로 본다.

제품 검증은 새 브라우저 저장공간에서 **실제 제품 페이지**를 열고 `sghsScene.snapshot()`을 읽는다. 중심선을 제공한 연결망은 거부하고, 전후 입력 지문과 재열기 결과도 비교한다. 현재 관찰 어댑터는 SGHS 화면용이다. 다음 사례에 다른 관찰 API가 필요하면 먼저 어댑터를 추가한다. 기존 Playwright 설치가 필요하며 자동 설치하지 않는다. 저장소에서 모듈을 찾지 못하면 해당 설치의 `node_modules`를 `NODE_PATH`에 지정한다.

## 결과 읽기

`runs/<run_id>/completion.json`에 공통 시험·작업 검사·제품 측정·독립 검토·사용자 승인이 각각 기록된다. 전후 제품 화면과 측정 JSON도 같은 실행 폴더에 저장한다.

| 실행 상태 | 의미 |
|---|---|
| BASELINED | 변경 전 공통 시험 통과. 완료 아님 |
| TASK_FAILED | 필수 검사 실패 또는 유효하지 않은 승인 |
| REVIEW_PENDING | 기계 검사는 통과했지만 독립 검토 대기 |
| USER_GATE | 필요한 검사·검토 통과, 사용자 승인 대기 |
| TASK_VERIFIED | 이번 작업에 필요한 모든 관문 충족 |

필수 관문이 남아 있으면 verify는 종료 코드 1을 반환한다. 성공한 지원 작업의 `productProgress`는 false다. 작업표 상태는 자동 변경하지 않는다. 완료 기록을 확인한 뒤 작업표를 ACCEPTED로 바꾸고 최상위 `completion_run: <run_id>`를 적는다. 단계 종료와 제품 방향의 최종 판단은 사용자에게 있다.

예전 실행의 VERIFIED는 당시 공통 시험 통과 기록이다. 새 완료 관문을 통과했다는 뜻으로 소급하지 않는다. 예전 작업표도 새 작업을 시작하려면 계약을 보완해야 한다. 이전의 실패·실험 결과나 기준값은 덮어쓰지 않는다.

## 검토·승인 기록

독립 검토가 필요하면 실행 폴더의 `review.json`에 다음을 기록한다. `sourceDigest`는 completion.json의 코드 지문을 사용한다.

```json
{"workItem":"작업ID","runId":"실행ID","sourceDigest":"코드 지문","status":"passed","role":"independent","actor":"구현자와 다른 검토자","evidence":"검토 보고서 경로"}
```

사용자가 승인하면 **실제 승인 내용을 확인한 후** `user-approval.json`에 기록한다. 형식은 workItem/runId/sourceDigest/status/actor/evidence이며 status는 `approved`, actor는 `user`, evidence에는 승인 발언이나 근거를 적는다. 기록을 만든 사람의 신원이나 실제 승인 발언을 기계가 증명하지는 못한다. 구현자의 자기 확인을 독립 검토나 사용자 승인으로 기록하면 안 된다.

승인 대상 실행과 코드 지문이 다르면 거부한다. 새로 코드를 고쳤다면 새 검토·승인이 필요하다. 모델 호출이나 승인 기록을 자동 생성하지 않는다.

## 보존 원칙

기존 골든·안전 판정·사용자 입력은 작업 지침대로 보존한다. `progress.json`의 제품 점수는 실제 결과와 사용자 확인 근거에 따라 별도로 관리한다. 하네스 개선이나 공통 시험 수 증가만으로 제품 점수를 올리지 않는다. 대시보드는 기존 작업표와 실행 기록을 읽으며, 새 관문의 상세 결과는 completion.json에서 확인한다.
