# Agent: review (Reviewer)

<!-- agents-md-meta -->
**Owner agent**: harness (Builder) — review 체크리스트 변경 시 본 spec 갱신
**Related**: ../../AGENTS.md, ../../CLAUDE.md, ../../.claude/commands/review.md, ../../spec.json, index.md
**SSoT keys**: (없음 — 모든 SSoT 를 read-only 로 참조)
**Last verified**: 2026-05-23 — 사용자 (김윤수)
<!-- /agents-md-meta -->

> 실제 슬래시 명령 prompt: [.claude/commands/review.md](../../.claude/commands/review.md).

## Role

현재 브랜치의 변경사항(`git diff main..HEAD`) 을 `spec.json`·`docs/*`·`CLAUDE.md` 와 정렬 검증하고 등급별 (CRITICAL/MAJOR/MINOR/NOTE) 리뷰 코멘트를 생성. **코드 수정 없음** — 코멘트만.

## Trigger

- `/review` 슬래시 명령 (PR 작성 직전 권장)
- (예정) on-PR cron — qa-runner 와 함께 자동 호출

## Inputs

- `git diff main..HEAD` (또는 `--staged` 옵션 시 staged)
- 변경된 파일 전체 (Read tool 로)
- `CLAUDE.md` — 최우선 규칙 위반 검사
- `spec.json` — features[]/testScenarios[]/errorPolicies[]/edgeCasePolicies[] drift
- `docs/ARCHITECTURE.md` — 디렉토리/레이어 규칙
- `docs/ADR.md` — 기술 스택 결정 위반
- `docs/UI_GUIDE.md` — AI 슬롭 안티패턴 (gradient-text, glow, blur-3xl 등)
- `docs/TEST_SCENARIOS.md` — 사용자에게 보이는 변경의 TS-XX 매핑 누락 검출

## Outputs

리뷰 코멘트 (markdown):
```
## Review — feat/<branch>

### CRITICAL (머지 차단)
- [ ] components/ChatBubble.tsx:42 — 클라이언트에서 `process.env.NOTION_TOKEN` 참조. CLAUDE.md CRITICAL 위반.

### MAJOR
- [ ] spec.json drift — 새 함수 `summarizeProjects` 가 docs/AI_CONTRACT.md 에 안 잡혀 있음.

### MINOR
- [ ] lib/notion.ts — 함수명 `getProjects` 가 ARCHITECTURE.md 의 services/ 명명 규칙(`fetchX`)과 불일치.

### NOTE
- 변경 라인 수: +1,243 / -89 (PR 크기 평균 이상 — 분할 권장)
- TS-XX 매핑: TS-23 (Contact form 검증) 새로 커버됨
- spec.json version: 0.1.0 → 0.2.0 bump 필요 (FEAT-031 추가)
```

파일 변경 0. PR 코멘트는 사용자가 직접 PR 에 붙여넣거나 `gh pr review` 로 게시.

## Tools

- **Read** — 변경 파일, SSoT 모두
- **Grep** — 안티패턴/시크릿 패턴 스캔
- **Bash** — `git diff`, `git log`, `git show` (read-only)
- **Agent** (선택) — code-simplifier subagent 로 의견 보강

❌ 사용 금지: Edit, Write, `git commit`, `git push`, `gh pr merge`, 자동 수정.

## Guardrails

- **자동 수정 금지**. CRITICAL 발견 시에도 직접 고치지 마라. 사용자가 fix 요청해야 수정 phase 진입.
- **추측 코멘트 금지**. "아마 이래야 할 듯" 같은 모호한 코멘트는 NOTE 등급 또는 생략. CRITICAL/MAJOR 는 SSoT 근거 명시.
- **CRITICAL 등급 보수적 사용**. CLAUDE.md 의 명시적 CRITICAL 규칙 위반 + 시크릿 노출 + 데이터 손실 위험 외엔 MAJOR 이하로.
- **변경 외부 파일 코멘트 금지**. PR 의 diff 에 없는 파일은 코멘트 대상 아님. 단 SSoT drift (spec.json 미갱신) 는 예외.
- **시크릿 패턴 검출 시 값 표시 금지**. `sk-***`, `ntn_***` 처럼 마스킹. 이유: 리뷰 코멘트 자체가 누출 채널이 되면 안 됨.

## 체크리스트 (CLAUDE.md + spec.json 기반)

| 등급 | 항목 |
|---|---|
| CRITICAL | API 키/토큰 클라이언트 노출 (`process.env.*` in `app/(client)/...`) |
| CRITICAL | LLM·Notion 호출이 Hono 라우트 밖에서 실행 |
| CRITICAL | 답변 컨텍스트가 `data/portfolio.server.json` 외 외부 지식 차단 누락 |
| CRITICAL | `spec.json` 위반 (등록 안 된 FEAT 의 코드/테스트) |
| MAJOR | 사용자에게 보이는 변경에 TS-XX 매핑 누락 |
| MAJOR | SDD+TDD 순서 위반 (테스트 없이 구현만) |
| MAJOR | ARCHITECTURE.md 디렉토리 규칙 위반 |
| MAJOR | AI 슬롭 안티패턴 (gradient-text, blur-3xl, "Powered by AI" 배지 등) |
| MINOR | conventional commits 미준수 |
| MINOR | 함수/타입 명명 규칙 (camelCase/PascalCase) 위반 |
| NOTE | PR 크기 (+1000 라인 이상 — 분할 권장) |
| NOTE | spec.json version bump 필요성 |

## AC

```bash
# 1. 출력에 등급 4종이 등장 (해당 항목 있을 때만)
/review 2>&1 | grep -qE "(CRITICAL|MAJOR|MINOR|NOTE)"

# 2. 코드 수정 0
before=$(git status --porcelain | wc -l)
/review >/dev/null
after=$(git status --porcelain | wc -l)
[ "$before" -eq "$after" ]

# 3. 시크릿 마스킹
echo 'OPENAI_API_KEY=sk-test123' > /tmp/x  # 가상
/review 2>&1 | grep -qE "sk-test123" && echo "FAIL: secret leak" || echo "OK"
rm /tmp/x

# 4. CRITICAL 코멘트가 있으면 PR 머지 차단 안내
/review 2>&1 | grep "CRITICAL" && /review 2>&1 | grep -qi "머지 차단\|block\|do not merge"
```

## 관련

- review 직전: `/harness-doctor` 로 환경 확인
- review 후 fix 필요: `/harness` 로 fix phase 시작
- PR 게이트 (CI): `npm run check:spec && npm run lint && npm run test`
