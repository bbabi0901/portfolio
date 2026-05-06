# scripts/

## execute.py — Harness Step Executor

본 프로젝트 하네스의 핵심 실행기. `phases/<task>/step{N}.md` 파일들을 헤드리스 Claude 로 순차 실행한다.

### 설치

```bash
pip install -r requirements-dev.txt   # pytest, coverage
```

`claude` CLI 가 PATH 에 있어야 한다 (https://docs.anthropic.com/en/docs/claude-code).
`jq` 가 설치되어 있으면 hook 파싱이 더 정확해진다 (없어도 fallback 동작).

### 실행

```bash
python3 scripts/execute.py <phase>                       # 순차 실행
python3 scripts/execute.py <phase> --dry-run             # Claude 호출 없이 프롬프트만 검증
python3 scripts/execute.py <phase> --from-step 2         # step 2 부터 재실행 (이상 모두 pending 리셋)
python3 scripts/execute.py <phase> --push --verbose      # push 까지 + 디버그 출력
python3 scripts/execute.py <phase> --allow-dirty         # 작업트리 dirty 검사 우회 (위험)
python3 scripts/execute.py <phase> --max-retries 5 --timeout 3600   # 무거운 task 대응
```

### 테스트

```bash
python3 -m pytest scripts/ -x -v
python3 -m pytest scripts/test_execute.py --cov=scripts.execute --cov-report=term-missing --cov-fail-under=85
```

### 동작 자동화 요약

execute.py 가 매 phase 실행에서 처리:

- 작업트리 dirty 검사 (phase 디렉토리 + phases/index.json 예외)
- atomic lock (PID + started_at) + atexit 정리
- SIGINT/SIGTERM 핸들링 → lock 해제 후 130 exit
- `feat-<phase>` 브랜치 자동 생성/체크아웃
- 매 step 프롬프트에 CLAUDE.md + docs/*.md 가드레일 주입
- 이전 step `summary` 누적 컨텍스트 전달
- attempt 별 output JSON 보존 (`step{N}-output-attempt{K}.json`)
- run.log 자체 로깅 (시작/종료/retry/timeout/lock)
- `claude --output-format json` 의 session_id, total_cost_usd, is_error 파싱
- 실패 시 최대 N 회(기본 3) 재시도, 이전 에러를 다음 attempt 프롬프트에 피드백
- 2 단계 커밋 (feat: 코드 / chore: 메타데이터)
- lock·run.log·attempt JSON 모두 git 커밋에서 제외

### 워크플로우 상세

`.claude/commands/harness.md` 참조.
