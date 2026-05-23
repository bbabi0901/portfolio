# AGENTS.md — AI Portfolio

> README **for agents**. 인간이 읽어도 좋지만 1차 독자는 코딩 에이전트.
> 본 파일은 **table of contents** — 백과사전 아님. 깊은 내용은 `docs/`·`spec.json`·`.claude/commands/` 의 SSoT 에서.
> 충돌 시 우선순위: `CLAUDE.md` > `AGENTS.md` > `docs/`.

## 한 줄 정의

채용 담당자/동료 개발자가 자연어로 김윤수의 커리어·프로젝트·기술을 물어보면 노션 기록 기반으로 답하는 사이트.
**Next.js 16 (App Router) + Hono + Vercel AI SDK + Notion + Vercel**.

## Agents 디렉토리

| Agent | 역할 | 정의 | 트리거 |
|---|---|---|---|
| **harness** (Builder) | 큰 작업 → `phases/{task}/step{N}.md` 분해 → `execute.py` 자동 실행 | [docs/agents/harness.md](docs/agents/harness.md) | `/harness`, 자연어 "큰 작업" |
| **harness-status** (Inspector) | phase 진행 일람 (read-only) | [docs/agents/harness-status.md](docs/agents/harness-status.md) | `/harness-status` |
| **harness-doctor** (Doctor) | 환경 진단 10항목 (read-only) | [docs/agents/harness-doctor.md](docs/agents/harness-doctor.md) | `/harness-doctor` |
| **review** (Reviewer) | 변경사항 + `spec.json`/`docs` 정렬 검증 | [docs/agents/review.md](docs/agents/review.md) | `/review` |
| _doc-gardener_ (예정) | stale `docs/*` 자동 PR | [docs/agents/doc-gardener.md](docs/agents/doc-gardener.md) | 미구현 |
| _qa-runner_ (예정) | `spec.json testScenarios[]` 자동 실행 + 회귀 보고 | [docs/agents/qa-runner.md](docs/agents/qa-runner.md) | 미구현 |
| _spec-keeper_ (예정) | `features[]`/`tests[]`/version drift 감지 | [docs/agents/spec-keeper.md](docs/agents/spec-keeper.md) | 미구현 |
| _refactor-bot_ (예정) | 골든 원칙 위반 자동 PR | [docs/agents/refactor-bot.md](docs/agents/refactor-bot.md) | 미구현 |

자세한 정의·입출력·도구·가드레일·AC: [docs/agents/index.md](docs/agents/index.md).

## 핵심 SSoT (system of record)

| 영역 | 파일 |
|---|---|
| 프로젝트 규칙 (최우선) | [CLAUDE.md](CLAUDE.md) |
| 기능 명세 + 테스트 매핑 | [spec.json](spec.json) — `features[]`, `testScenarios[]`, `errorPolicies[]`, `edgeCasePolicies[]` |
| 제품 비전 | [docs/PRD.md](docs/PRD.md) |
| 아키텍처 | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| 의사결정 로그 | [docs/ADR.md](docs/ADR.md) |
| 페이지 와이어 | [docs/PAGES.md](docs/PAGES.md) |
| 디자인 토큰 + 안티패턴 | [docs/UI_GUIDE.md](docs/UI_GUIDE.md) |
| 반응형 | [docs/RESPONSIVE.md](docs/RESPONSIVE.md) |
| 노션 스키마 | [docs/NOTION_SCHEMA.md](docs/NOTION_SCHEMA.md) |
| AI 시스템 프롬프트 | [docs/AI_CONTRACT.md](docs/AI_CONTRACT.md) |
| 테스트 시나리오 (TS-NN) | [docs/TEST_SCENARIOS.md](docs/TEST_SCENARIOS.md) |
| 테스트 가이드 (TDD) | [docs/TESTING.md](docs/TESTING.md) |
| SEO/OG | [docs/SEO_POLICY.md](docs/SEO_POLICY.md) |
| 배포 | [docs/DEPLOY.md](docs/DEPLOY.md) |
| 콘텐츠 정책 | [docs/CONTENT_GUIDE.md](docs/CONTENT_GUIDE.md) |

## 작업 흐름 (한 줄 요약)

1. **새 기능** → `spec.json features[]` 에 `FEAT-XXX` 등록 → 실패 테스트 작성 → 통과 구현. (SDD + TDD)
2. **사용자에게 보이는 변경** → `docs/TEST_SCENARIOS.md TS-XX` 매핑 필수.
3. **큰 작업** → `/harness` → `phases/{task}/` 생성 → `python3 scripts/execute.py {task}` 자동 실행.
4. **PR 게이트**: `npm run check:spec && npm run lint && npm run test`.

## 명령어 (Exact)

```bash
npm run dev                # 개발 서버 (localhost:3000)
npm run build              # prebuild(sync:notion + gen:suggestions) → next build
npm run lint
npm run test               # vitest 단발
npm run test:watch
npm run e2e                # Playwright
npm run sync:notion        # 노션 → data/portfolio.server.json + public/data/suggestions.json
npm run gen:suggestions    # portfolio.server.json → 추천 질문 후보 + 관련 질문 매핑
npm run check:spec         # spec.json 유효성 + 모든 FEAT 의 tests 파일 존재 검증
python3 scripts/execute.py <phase>            # 하네스 자동 실행
python3 scripts/execute.py <phase> --dry-run  # 프롬프트만 확인 (Claude 호출 X)
python3 scripts/execute.py <phase> --from-step N  # step N 부터 재실행
```

## 변경 추적 (필수)

기능/디자인/규칙/UX/SDD step/하네스 변경 시 **즉시** 아래 SSoT 동기화:
- `spec.json` — `features[]` (FEAT-XXX), `testScenarios[]` (TS-NN), `errorPolicies[]`/`edgeCasePolicies[]`, version bump
- `docs/*` — 해당 영역 파일
- `phases/{task}/index.json` — 진행 중인 경우 step 의 summary/status
- `CLAUDE.md` — 규칙/스택 변경 시
- **AGENTS.md** — agent 정의/워크플로우 추가 시 본 표 갱신

매 코드 변경 응답 끝에 `─── Change tracking ───` 한 줄 보고 의무. 자세한 형식·매핑은 user memory `feedback_change_tracking.md`.

## 추가 자료

- 하네스 워크플로우 전체 (A–E 5단계) — [.claude/commands/harness.md](.claude/commands/harness.md)
- 실행 엔진 사용법 — [scripts/README.md](scripts/README.md)
- Phase 인덱스 (모든 진행/완료 task) — [phases/index.json](phases/index.json)
- Git workflow — main 기준 type-prefix 슬래시 브랜치 (`feat/...`, `docs/...`, `fix/...`), worktree 격리, PR 으로만 main 갱신. 자세히는 CLAUDE.md.

---

본 파일은 ~120줄 entry point 다. 모든 깊이 있는 정의는 위 SSoT 들에 있다. 새로운 agent 또는 SSoT 카테고리가 추가되면 이 표만 갱신하라.
