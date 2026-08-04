#!/usr/bin/env bash
# CC Stop hook — 세션 종료 시 PR 게이트 실행.
# package.json/node_modules 부재 시 silent skip 으로 ENOENT 노이즈 제거.
# 실패 시 exit 2 = "Stop 차단" — Claude 가 보강 응답 가능.
set -u

input=$(cat)

# 무한루프 방지: 이미 이 훅 때문에 재개된 세션이면 통과 (ADR-036)
if command -v jq >/dev/null 2>&1; then
  active=$(printf '%s' "$input" | jq -r '.stop_hook_active // false')
  [ "$active" = "true" ] && exit 0
fi

# CC stop hook 은 비대화형 셸 → ~/.zshrc 의 nvm init 미적용 → 시스템 default Node(v16) 가 먼저 잡혀 ESLint v9 의 structuredClone 사용에서 ConfigError 발생.
# .nvmrc 의 Node 버전을 PATH 앞에 강제 주입해 회피.
if [ -f .nvmrc ]; then
  REQ_NODE="$(tr -d '[:space:]' < .nvmrc)"
  CANDIDATE="$HOME/.nvm/versions/node/v${REQ_NODE}/bin"
  if [ -d "$CANDIDATE" ]; then
    export PATH="$CANDIDATE:$PATH"
  fi
fi

if [ ! -f package.json ]; then
  echo "[stop-hook] skip: no package.json yet"
  exit 0
fi
if [ ! -d node_modules ]; then
  echo "[stop-hook] skip: run 'npm ci' first" >&2
  exit 0
fi

# 코드 변경 없는 세션(질문만 한 세션 등)은 게이트 스킵
changed=$(git status --porcelain -- '*.ts' '*.tsx' '*.js' '*.jsx' 2>/dev/null)
committed=$(git log --oneline @{u}..HEAD 2>/dev/null | head -1)
if [ -z "$changed" ] && [ -z "$committed" ]; then
  echo "[stop-hook] skip: no code changes this session"
  exit 0
fi

# 테스트 약화 탐지 — 편집은 허용, 약화만 차단 (ADR-036 치팅 스캔)
weak=$(git diff HEAD -- 'specs/*' 'tests/*' 2>/dev/null | grep -E '^\+.*(\.only\(|\.skip\(|xit\(|xdescribe\()' || true)
if [ -n "$weak" ]; then
  echo "[stop-hook] 테스트 약화 감지(.only/.skip/xit/xdescribe 추가) — 제거 후 종료하라:" >&2
  echo "$weak" >&2
  exit 2
fi
deleted=$(git status --porcelain 2>/dev/null | grep -E '^.?D .*(\.spec\.|\.test\.|\.e2e\.)' || true)
if [ -n "$deleted" ]; then
  echo "[stop-hook] 테스트 파일 삭제 감지 — 의도라면 사용자 승인 후 진행:" >&2
  echo "$deleted" >&2
  exit 2
fi

# PR 게이트 (PRD/CLAUDE.md 정렬): check:spec → lint → test (build 제외 — prebuild 가 sync:notion 트리거하기 때문)
npm run check:spec 2>&1 || { echo "[stop-hook] check:spec failed" >&2; exit 2; }
npm run lint       2>&1 || { echo "[stop-hook] lint failed" >&2; exit 2; }
npm run test       2>&1 || { echo "[stop-hook] test failed" >&2; exit 2; }

exit 0
