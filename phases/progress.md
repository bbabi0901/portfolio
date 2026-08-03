# progress — 세션 핸드오프 로그 (append-only)

> /loop 사이클마다 한 줄. 형식: `- [YYYY-MM-DD] <스토리ID> <상태> — 요점`. 세션 컨텍스트가 길어지면 compact 대신 새 세션 시작 후 이 파일 + git log로 이어받는다.

- [2026-08-03] 하네스 v2 도입 (ADR-036) — 1세대 execute.py 폐지, /loop + reviewer 체계 시작. 초기 큐 S1(spec drift)~S5(AWS 정리).
