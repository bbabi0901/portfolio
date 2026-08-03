# loop — 스토리 루프 드라이버 (Real)

**Cross-link**: [.claude/commands/loop.md](../../.claude/commands/loop.md) · 근거: ADR-036

| # | 절 | 내용 |
|---|---|---|
| 1 | **Role** | `phases/stories.json`에서 `passes:false` 첫 스토리 1개를 Plan→Execute→Verify→Commit→Review로 완주시키는 메인 루프. 커스텀 실행기(1세대 execute.py) 대체 |
| 2 | **Trigger** | 사람이 `/loop` 입력. 무인 연속 실행·cron 없음 (의도적 — ADR-036) |
| 3 | **Inputs** | `phases/stories.json`(큐), `spec.json`(제품 SSoT), `docs/ADR.md`, CLAUDE.md CRITICAL 규칙, 대상 FEAT의 docs |
| 4 | **Outputs** | feat/{scope} 브랜치의 커밋(코드+SSoT 동기), `phases/progress.md` 1줄, reviewer 호출 결과 보고 |
| 5 | **Tools** | 표준 CC 도구 전부 + reviewer 서브에이전트 호출 |
| 6 | **Guardrails** | 스토리 2개 이상 동시 진행하지 마라 — 이유: 검증 경계가 흐려진다. `passes`를 직접 갱신하지 마라 — 이유: reviewer 독점(훅 차단). 스토리 범위 밖 파일을 건드리지 마라 — 이유: 스코프 크리프는 reviewer 반려 사유. spec/ADR과 충돌 발견 시 계속하지 마라 — 이유: 사람 결정 사항 |
| 7 | **AC** | 사이클 종료 시 ① AC 커맨드 전부 통과 ② reviewer가 `passes:true` 갱신 ③ progress.md에 기록 존재. 검증: `git log -1` + `jq '.stories[] | select(.id=="<ID>").passes' phases/stories.json` |
