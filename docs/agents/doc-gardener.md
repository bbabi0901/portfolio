# Agent: doc-gardener (Virtual — 예정)

<!-- agents-md-meta -->
**Owner agent**: harness (Builder) — 본 spec 의 변경은 Plan/Design phase 에서
**Related**: ../../AGENTS.md, ../../docs/, index.md
**SSoT keys**: (없음 — docs/* 정합성 자체를 검사)
**Last verified**: 2026-05-23 — 사용자 (김윤수)
**Status**: 🟡 Virtual / 로드맵 — 우선순위 **중**
<!-- /agents-md-meta -->

> 본 agent 는 아직 구현되지 않음. 실제 구현 시 `.claude/commands/doc-gardener.md` + `.github/workflows/doc-gardening.yml` + 자동화 스크립트를 별도 phase 로.

## Role

`docs/*` 가 코드 동작·실제 spec.json·CLAUDE.md 와 어긋난 부분을 자동 감지하고 fix-up PR 을 생성하는 **자동 정원사** (OpenAI 의 "doc-gardening" 패턴).

예시 감지 대상:
- `docs/UI_GUIDE.md` 의 색상 토큰이 `tailwind.config.ts` 의 실제 토큰과 불일치
- `docs/ARCHITECTURE.md` 의 디렉토리 구조가 실제 트리와 다름
- `docs/PRD.md` 의 명령어가 `package.json scripts` 와 어긋남
- `agents-md-meta` 의 `Last verified` 가 90일 이상 경과
- `AGENTS.md` 의 cross-link 이 broken

## Trigger (구현 시)

- weekly cron — GitHub Actions schedule
- on-push 이벤트 (main) — drift 즉시 감지
- 수동 호출: `/doc-gardener` 슬래시 명령 (예정)

## Inputs (구현 시)

- 전체 `docs/*.md`
- `CLAUDE.md`, `AGENTS.md`
- `spec.json`
- 실제 코드 (`app/`, `components/`, `lib/`, `services/`)
- `package.json` scripts
- `tailwind.config.*`
- `git log --since=90.days` (Last verified 검사)

## Outputs (구현 시)

- 자동 PR `chore/doc-gardening-{date}` 브랜치
- PR body — 발견된 drift 항목별 before/after diff + 근거
- 사용자 1 클릭 머지 또는 reject
- 절대 force-push 하지 않음

## Tools (구현 시)

- Read, Grep, WebFetch (외부 docs)
- Bash — `gh pr create`, `git diff`
- Edit (PR 안에서만)
- Agent — code-simplifier subagent 로 diff 정리

## Guardrails (구현 시)

- **CRITICAL 규칙 변경 금지**. `CLAUDE.md` 의 CRITICAL 절은 절대 자동 수정하지 마라. 이유: 인간 의도가 들어간 영역. 자동 변경 시 신뢰 붕괴.
- **spec.json features[]/testScenarios[] 자동 추가 금지**. drift 감지만, 추가는 spec-keeper 책임.
- **PR 크기 제한**. 단일 PR 에 5개 이상 docs 변경 금지. 큰 drift 는 여러 PR 로 분할 — 리뷰 비용 관리.
- **본문 변경 금지**. 메타 헤더(`agents-md-meta`) 의 `Last verified` 갱신만 자동. 본문 의도 변경은 사용자 결정.
- **시크릿 검출 시 PR 대신 issue 생성**. 시크릿이 docs 에 누출되어 있으면 자동 PR 로 노출 확대. issue 로 사용자에게 알림.

## AC (구현 시)

```bash
# 구현 시 본 spec 을 별도 step 으로 분리 (Out of Scope of agents-md-foundation plan).
# 구현 시 검증할 AC 후보:
# 1. drift 감지 정밀도 ≥ 80% (false positive 20% 이하)
# 2. PR 생성 1주 1개 미만 (스팸 방지)
# 3. CRITICAL 규칙 자동 변경 0건
# 4. weekly cron 가 GitHub Actions 에서 안정 실행
```

## 우선순위 근거

- 본 프로젝트는 1인 개발자 + 13개 docs — 수동 관리 가능 범위.
- 단 phase 8/9 deployment 후 운영 단계에서 코드 변경 속도가 docs 갱신 속도를 추월하면 도입 가치 ↑.
- 도입 시점: docs 가 코드 대비 2개월 이상 stale 인 항목이 누적되면.

## Out of Scope (구현 시점에 결정)

- 한국어 NLP 기반 의미 비교 (영어 docs 외 한국어 본문) — 현재 LLM 호출 비용 고려해 제외 검토
- 외부 라이브러리 docs (Next.js 등) 의 changelog drift — 본 agent 범위 외
