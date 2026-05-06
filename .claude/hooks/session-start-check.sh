#!/usr/bin/env bash
# CC SessionStart hook — 세션 시작 시 환경 진단. 절대 차단하지 않음.
# 모든 경로에서 exit 0 — 세션 시작을 막으면 복구 불가.
set -u

cat >/dev/null   # stdin JSON 무시

warn() { echo "[session-start] WARN: $1" >&2; }

command -v claude  >/dev/null 2>&1 || warn "'claude' CLI not in PATH (needed for scripts/execute.py)"
command -v python3 >/dev/null 2>&1 || warn "'python3' not in PATH"
command -v node    >/dev/null 2>&1 || warn "'node' not in PATH"
command -v jq      >/dev/null 2>&1 || warn "'jq' not in PATH (block-dangerous.sh fallback 모드로 동작)"

if [ -f package.json ] && [ ! -d node_modules ]; then
  warn "node_modules missing — run 'npm ci'"
fi

# 잔재 lock 검출
shopt -s nullglob
locks=(phases/*/.lock)
if [ ${#locks[@]} -gt 0 ]; then
  warn "stale lock files detected: ${locks[*]} — /harness-doctor 로 점검하세요"
fi

exit 0
