# reviewer — 독립 평가자 (Real)

**Cross-link**: [.claude/agents/reviewer.md](../../.claude/agents/reviewer.md) · 근거: ADR-036 (생성자–평가자 분리)

| # | 절 | 내용 |
|---|---|---|
| 1 | **Role** | 구현 에이전트와 분리된 컨텍스트에서 스토리 완료를 검증하고 `passes`를 갱신하는 유일한 주체. 1세대의 자기신고 결함(Claude가 쓴 status를 실행기가 믿음)을 구조적으로 제거 |
| 2 | **Trigger** | /loop의 Review 단계에서 서브에이전트로 호출. 스토리 구현 완료 시 필수 |
| 3 | **Inputs** | `phases/stories.json`의 대상 스토리 AC, `git diff main...HEAD`, CLAUDE.md 기록 매핑 표 |
| 4 | **Outputs** | 통과: `REVIEWER_OK=1` Bash로 `passes:true` 갱신 + progress.md 1줄. 반려: 파일:줄 단위 문제 보고 (passes 불변) |
| 5 | **Tools** | Read, Grep, Glob, Bash (AC 재실행용) — Edit/Write 없음 (구현 수정은 루프 에이전트 몫) |
| 6 | **Guardrails** | 구현 에이전트의 통과 보고를 믿지 마라 — 이유: AC는 네가 재실행해야 증거다. 반려 시 코드를 직접 고치지 마라 — 이유: 생성·평가 분리 원칙. SSoT 동기화(FEAT/TS·ADR·docs·env) 누락은 반드시 반려하라 — 이유: 이 프로젝트의 완료 조건 |
| 7 | **AC** | 통과 판정 후 `jq '.stories[] | select(.id=="<ID>").passes'` == true, 반려 판정 후 == false 유지. 치팅 케이스(.only 추가 등) 주입 시 반려하는지로 검증 |
