# 레거시 자료 보존 인덱스

정리 완료일: 2026-10-27

## 활성 개발

- 로컬: `C:\Users\seok2\OneDrive\바탕 화면\underground-parking-planner`
- GitHub: `https://github.com/mmuuunn/underground-parking-planner` (Private)
- 최초 이관 기준 커밋: `5e7bfc0f4caea9652278257f5dacf7a3dc4ad86a`
- 기준 검증: 57/57 통과

## 레거시 코드

- 로컬 읽기 전용 저장소: `C:\Users\seok2\OneDrive\바탕 화면\08 arch-automation`
- 최종 로컬 보존 커밋: `e3eb60edd351b2ce08e72f33515a6b37b3275846`
- 비공개 원격: `mmuuunn/arch-configurator-private`
- 원격 보존 이름공간: `archive/2026-10-27/*`
- 원격 보존 브랜치 수: 14

## 독립 백업

- 전체 이력 bundle과 미커밋 사본: `C:\Users\seok2\OneDrive\바탕 화면\underground-parking-preservation-20261027`
- bundle: `arch-automation-all-refs.bundle`
- bundle 검증: complete history / okay

## 조사 원문과 외부 도구

- 위치: `C:\Users\seok2\OneDrive\바탕 화면\underground-parking-research-vault`
- 파일 수: 41
- 전체 크기: 270,614,607 bytes
- 무결성 목록: `SHA256SUMS.csv`

## 정리한 항목

- 보조 Git worktree 5개 제거
- 원격 해시 검증 후 보조 로컬 브랜치 11개 제거
- 조사 원문과 ParkingSolver를 Git 밖으로 이동
- 에이전트 handoff 실행 캐시와 Playwright 임시 자료 약 31MB 제거
- 공개 저장소 `arch-configurator`의 `main`은 변경하지 않음

## 복구 원칙

구 자료를 활성 제품으로 바로 합치지 않는다. 필요한 커밋이나 파일을 별도 작업공간에서 먼저 비교하고, 현재 계약·골든 테스트·하네스 정책에 맞는지 검증한 뒤 선별 반영한다.
