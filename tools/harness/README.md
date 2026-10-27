# 지하주차 개발 하네스

이 폴더는 AI를 계속 자동 호출하는 장치가 아니라, 한 번의 작업 범위를 고정하고 결과를 같은 기준으로 확인하는 최소 안전장치다.

## 구성

- `policy.yaml`: 모든 작업에 공통으로 적용하는 운영 규칙
- `stages/`: 제품 단계별 합격 조건
- `work-items/`: 한 번에 처리할 작업지시서
- `scripts/preflight.ps1`: AI 작업을 시작하기 전 준비 상태 확인
- `scripts/verify.ps1`: 지정된 계산 시험 실행 및 결과 기록
- `runs/`: 실행별 작업 영수증과 시험 결과. Git에는 `.gitignore`만 보관한다.

상시 감시, 자동 모델 호출, Claude-Codex 간 무한 왕복은 하지 않는다.

## 처음 사용하는 방법

저장소 루트에서 다음을 실행한다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\harness\scripts\preflight.ps1 `
  -WorkItem .\tools\harness\work-items\UG-VEHICLE-001.yaml
```

점검이 성공하면 `run_id`와 `tools/harness/runs/<run_id>/manifest.json`이 생긴다. 계산 시험만 다시 실행하려면:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\harness\scripts\verify.ps1 `
  -WorkItem .\tools\harness\work-items\UG-VEHICLE-001.yaml
```

특정 작업 영수증에 시험 결과를 연결하려면 위 명령에 `-RunId <run_id>`를 추가한다.

## 상태

- `DRAFT`: 작성 중, 구현 금지
- `SCOPED`: 범위와 합격 조건 확정, 기준 재현 전
- `BASELINED`: 변경 전 결과 재현 완료
- `IMPLEMENTING`: 구현 담당 한 명이 작업 중
- `VERIFYING`: 기계 시험 중
- `USER_GATE`: 사용자가 결과 화면을 판단할 차례
- `ACCEPTED`: 종료
- `RESCOPE_REQUIRED`: 추가 패치 대신 범위를 다시 정해야 함

`preflight.ps1`은 `SCOPED` 또는 `BASELINED`만 시작한다.

## 운영 원칙

1. 한 작업에는 구현 담당 한 명만 둔다.
2. 허용 파일 밖 변경은 별도 작업으로 분리한다.
3. 시험 통과를 건축계획 합격으로 표현하지 않는다.
4. 대수·램프 자리·판정 변경은 사용자 확인을 거친다.
5. 같은 원인의 세 번째 수정은 금지한다.
6. 독립검토는 위험 조건에 해당할 때만 한 번 요청한다.

## 권한 구조

- 사용자: 제품 방향과 화면 결과의 최종 승인
- Codex: 하네스 운영, 단계 설계, 작업지시서 발행, 담당 배정, 독립검토 판단, 단계 종료 제안의 상위 책임
- Claude: Codex가 정한 범위 안의 구현 또는 반례 검토. 목표·정책·골든값·다음 단계를 임의로 바꾸지 않음
- 시험 스크립트: 어느 모델도 우회할 수 없는 기계 증거

상위 판단이 필요한 경우 Claude가 사용자에게 직접 범위를 넓히지 않고 Codex에 `NEEDS_AUTHORITY_DECISION`으로 돌려보낸다. Codex도 사용자 화면 합격과 법규·골든값 결정을 대신하지 않는다.

첫 작업 `UG-VEHICLE-001`은 새 기능 지시가 아니라 다음 개발 단위를 고정하는 문서다. L자·전변사선·오각형 안쪽의 차량 정지 이유를 정확히 만들고 이미 통과하는 기준 도면을 보존한다. 코어·보행·다층·화면 장식은 포함하지 않는다.
