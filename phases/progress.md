# progress — 세션 핸드오프 로그 (append-only)

> /loop 사이클마다 한 줄. 형식: `- [YYYY-MM-DD] <스토리ID> <상태> — 요점`. 세션 컨텍스트가 길어지면 compact 대신 새 세션 시작 후 이 파일 + git log로 이어받는다.

- [2026-08-03] 하네스 v2 도입 (ADR-036) — 1세대 execute.py 폐지, /loop + reviewer 체계 시작. 초기 큐 S1(spec drift)~S5(AWS 정리).
- [2026-08-05] S0-error-surface 통과 — 스트림 개시 실패 503 표면화 검증: AC 전부 재실행 통과(626 tests), TS-89 뮤테이션 체크(구코드에서 실패 확인), SSoT(TS-89/0.7.1/FEAT-035 done) 동기화 확인
- [2026-08-05] S1 통과 — strict-tests AC 3건 재실행 통과, 재매핑 13건 샘플 8건 실체 확인, breakpoints e2e 18/18, 뮤테이션 체크(유령 파일→exit 1) 통과
