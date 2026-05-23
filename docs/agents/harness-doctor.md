# Agent: harness-doctor (Doctor)

<!-- agents-md-meta -->
**Owner agent**: harness (Builder) — 진단 항목 추가/변경 시 본 spec 갱신
**Related**: ../../AGENTS.md, ../../.claude/commands/harness-doctor.md, ../../.claude/hooks/, harness.md, index.md
**SSoT keys**: (없음 — 환경/툴 상태만 진단)
**Last verified**: 2026-05-23 — 사용자 (김윤수)
<!-- /agents-md-meta -->

> 실제 슬래시 명령 prompt: [.claude/commands/harness-doctor.md](../../.claude/commands/harness-doctor.md).

## Role

하네스가 정상 동작할 수 있는 **환경 (CLI, 의존성, 잔재 상태)** 을 10항목으로 진단하고 PASS/WARN/FAIL/INFO 출력. **read-only + 진단만** — 자동 복구·설치를 시도하지 않는다.

## Trigger

- `/harness-doctor` 슬래시 명령

수동 호출만. 자동 호출 없음. (단 `.claude/hooks/session-start-check.sh` 가 일부 항목을 SessionStart 시 자동 검사 — 본 agent 는 그 superset.)

## Inputs

다음 환경을 진단:
1. `claude --version` 실행 가능 여부
2. `python3 --version`
3. `node --version`, `npm --version`
4. `command -v jq` (block-dangerous.sh fallback 영향)
5. `pytest` 설치 (또는 `pip show pytest`)
6. 잔재 lock — `phases/*/.lock` glob → PID 살아있는지 `ps -p`
7. error/blocked step — `phases/*/index.json` 의 step status
8. `.claude/settings.json` 유효 JSON 여부
9. hook 스크립트 — `.claude/hooks/{block-dangerous,post-session-check,session-start-check}.sh` 존재 + shebang
10. `node_modules` (package.json 있는데 부재면 WARN)

추가로 (확장 후보, Virtual): docker / git remote / 환경변수 (`OPENAI_API_KEY`/`NOTION_TOKEN` presence — 값은 출력 금지).

## Outputs

각 항목당 한 줄:
```
PASS  claude CLI         (Claude Code 1.x.x)
PASS  python3            (3.13.2)
WARN  jq not installed   → fallback 동작 중. 'brew install jq' 권장
FAIL  pytest             → pip install -r requirements-dev.txt
INFO  lock present       phases/harness-refinement/.lock (pid 12345 alive)
```

마지막에 FAIL/WARN 개수 요약.

파일 변경 0. 환경변수 값 노출 0.

## Tools

- **Read** — `.claude/settings.json`, `phases/*/index.json`
- **Bash** — `which`, `command -v`, `--version`, `ps -p`, `glob`. **read-only 명령만**.

❌ 사용 금지: Edit, Write, `npm install`, `pip install`, `brew install`, lock 파일 삭제, status 자동 fix.

## Guardrails

- **자동 복구 절대 금지**. 본 agent 의 목적은 *진단* 만. "ext 가 없어서 자동 설치하겠습니다" 같은 동작 금지. 사용자가 직접 결정해야 한다.
- **환경변수 값 노출 금지**. presence 만 확인 (`[ -n "$VAR" ]`). 값 출력 또는 stderr 누출 금지. 이유: 토큰 누출.
- **분기 결정 회피**. 항목이 모호하면 "unknown" 또는 "manual check needed" 로 출력. "아마 OK" 같은 추측 금지.
- **차단 동작 금지**. exit code 는 항상 0 (정보 출력만). FAIL 항목이 있어도 사용자 흐름을 막지 마라.
- **`/harness-status` 와 역할 분리**. harness-status 는 *진행 상태*, harness-doctor 는 *환경 진단*. 두 영역 섞지 마라.

## AC

```bash
# 1. 출력에 10항목 모두 등장
/harness-doctor | grep -cE "^(PASS|WARN|FAIL|INFO)" 2>&1 | awk '$1 >= 10'

# 2. 환경변수 값 누출 0
/harness-doctor 2>&1 | grep -qE "(sk-|gho_|gsk_|ntn_)" && echo "FAIL: token leak detected" || echo "OK: no token leak"

# 3. 변경 0
before=$(git status --porcelain | wc -l)
/harness-doctor >/dev/null
after=$(git status --porcelain | wc -l)
[ "$before" -eq "$after" ]
```

## 관련

- 진행 현황: `/harness-status`
- 큰 작업 시작: `/harness`
