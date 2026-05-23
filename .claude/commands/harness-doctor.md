하네스 환경을 진단하라. 본 명령은 read-only + 진단만 — 자동 복구를 시도하지 마라.

수행 절차: 각 항목을 PASS / WARN / FAIL 로 표시하고, FAIL 인 경우 다음 행동을 한 줄로 안내한다.

1. **claude CLI** — `claude --version` 실행 가능 여부.
   - FAIL 시: "https://docs.anthropic.com/en/docs/claude-code 에서 설치 후 PATH 확인."

2. **python3** — `python3 --version`.

3. **node / npm** — `node --version`, `npm --version`.

4. **jq** — `command -v jq`.
   - WARN 시: "block-dangerous.sh 가 fallback 모드(전체 JSON 매칭)로 동작. 정확도 위해 'brew install jq' 권장."

5. **pytest 설치** — `python3 -c "import pytest"` 또는 `pip show pytest`.
   - FAIL 시: "pip install -r requirements-dev.txt"

6. **잔재 lock 파일** — `phases/*/.lock` glob.
   - 각 lock 파일의 PID 를 읽고 살아있는지 확인 (`ps -p <pid>` 시도).
   - 죽은 PID → WARN + "rm phases/<phase>/.lock"
   - 살아있는 PID → INFO (정상 동작 중일 수 있음).

7. **error/blocked step** — `phases/index.json` + 각 task index.json 의 step status 검사.
   - 발견 시: 해당 step 의 phase / step 번호 / name / error_message·blocked_reason 표시 + 복구 안내.

8. **settings.json valid JSON** — `python3 -c "import json; json.loads(open('.claude/settings.json').read())"`.

9. **hook 스크립트 존재** — `.claude/hooks/{block-dangerous,post-session-check,session-start-check}.sh` 모두 존재하고 shebang 으로 시작하는지.

10. **node_modules** — package.json 이 있고 node_modules 가 없으면 WARN + "npm ci".

각 항목 출력 형식 예:
```
PASS  claude CLI         (Claude Code 1.x.x)
PASS  python3            (3.13.2)
WARN  jq not installed   → fallback 동작 중. 'brew install jq' 권장
FAIL  pytest             → pip install -r requirements-dev.txt
INFO  lock present       phases/harness-refinement/.lock (pid 12345 alive)
```

마지막에 FAIL/WARN 개수 요약. 자동 복구 금지 — 사용자가 직접 결정.

---
Agent profile: see [`docs/agents/harness-doctor.md`](../../docs/agents/harness-doctor.md) for inputs/outputs/tools/guardrails/AC.
