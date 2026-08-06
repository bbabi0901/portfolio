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
| **loop** (Driver) | `phases/stories.json`에서 미완 스토리 1개를 Plan→Execute→Verify→Commit→Review로 완주 (ADR-036) | [docs/agents/loop.md](docs/agents/loop.md) | `/loop` |
| **reviewer** (Evaluator) | 독립 컨텍스트에서 AC 재실행·치팅 스캔·SSoT 동기화 검증 후 `passes` 갱신 (유일 권한) | [docs/agents/reviewer.md](docs/agents/reviewer.md) | /loop Review 단계에서 서브에이전트 호출 |
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
| 인프라 IaC (`infra/` CDK 워크스페이스, ADR-034) | [infra/README.md](infra/README.md) |
| 콘텐츠 정책 | [docs/CONTENT_GUIDE.md](docs/CONTENT_GUIDE.md) |

## 작업 흐름 (한 줄 요약)

1. **새 기능** → `spec.json features[]` 에 `FEAT-XXX` 등록 → 실패 테스트 작성 → 통과 구현. (SDD + TDD)
2. **사용자에게 보이는 변경** → `docs/TEST_SCENARIOS.md TS-XX` 매핑 필수.
3. **큐 작업** → `phases/stories.json` 에 스토리 등록(AC는 실행 가능 커맨드만) → `/loop` 1회 = 스토리 1개 완주 → reviewer 승인으로만 `passes:true`. (ADR-036)
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
```

## 변경 추적 (필수)

기능/디자인/규칙/UX/SDD step/하네스 변경 시 **즉시** 아래 SSoT 동기화:
- `spec.json` — `features[]` (FEAT-XXX), `testScenarios[]` (TS-NN), `errorPolicies[]`/`edgeCasePolicies[]`, version bump
- `docs/*` — 해당 영역 파일
- `phases/{task}/index.json` — 진행 중인 경우 step 의 summary/status
- `CLAUDE.md` — 규칙/스택 변경 시
- **AGENTS.md** — agent 정의/워크플로우 추가 시 본 표 갱신

매 코드 변경 응답 끝에 `─── Change tracking ───` 한 줄 보고 의무. 자세한 형식·매핑은 user memory `feedback_change_tracking.md`.

## 실패 지식 (상한 20건 — 초과 시 가장 오래된 항목 삭제)

> reviewer 가 버그를 잡을 때마다 일반화 가능한 교훈 1줄 추가. 형식: `- [영역] 교훈 (근거 ADR/PR)`

- [LLM SDK] (역사) OpenRouter 시절 `or(id)` 는 Responses API 로 무음 실패했음 — 현재는 Bedrock 단일 (`@ai-sdk/amazon-bedrock` ^4 고정, 5.x 는 ai@6 비호환)
- [LLM SDK] `@ai-sdk/amazon-bedrock` 5.x 는 provider spec v4 — `ai@6`(v3) 과 타입 비호환, ^4 고정 (ADR-035)
- [Bedrock] Haiku 4.5 는 apac 교차리전 프로필 부재 — `global.` 프로필 사용, IAM 도 global.* 허용 필요 (PR #49)
- [훅] 비대화형 셸은 nvm 미적용 → 구버전 Node 가 잡혀 ESLint v9 실패 — .nvmrc 버전을 PATH 앞에 주입
- [훅] 차단은 exit 2 (exit 1 은 non-blocking) — 회귀 주의
- [CFN] CloudFormation description 은 ASCII 만 — 한글은 패턴 검증 실패 (infra/CLAUDE 참고, PR #48)
- [노션] 캘아웃은 built-in 아이콘만 — 이모지는 notion-to-md 에서 텍스트로 노출돼 파서 깨짐 (ADR-032)
- [spec] 테스트 파일 이동 시 spec.json tests[] 경로 동기화 필수 — drift 16건 발견 (S1 스토리)
- [하네스] 검증 자기신고는 반드시 무너진다 — status 를 쓰는 주체와 검증하는 주체를 분리하라 (ADR-036, 1세대 부검)

## 추가 자료

- 루프 워크플로우 — [.claude/commands/loop.md](.claude/commands/loop.md) · [docs/agents/loop.md](docs/agents/loop.md)
- 작업 큐 — [phases/stories.json](phases/stories.json) · 핸드오프 로그 [phases/progress.md](phases/progress.md)
- 1세대 하네스(execute.py, phases/{task}/) — ADR-036 으로 폐지, git 이력 참조. 기존 `phases/{task}/` 디렉토리는 완료 기록으로 보존
- Git workflow — main 기준 type-prefix 슬래시 브랜치 (`feat/...`, `docs/...`, `fix/...`), worktree 격리, PR 으로만 main 갱신. 자세히는 CLAUDE.md.

---

본 파일은 ~120줄 entry point 다. 모든 깊이 있는 정의는 위 SSoT 들에 있다. 새로운 agent 또는 SSoT 카테고리가 추가되면 이 표만 갱신하라.
