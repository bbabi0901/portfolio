#!/usr/bin/env bash
# PostToolUse(Edit|Write): 편집된 파일만 포맷 + 린트. 위반은 exit 2로 에이전트에 즉시 피드백. (ADR-036)
set -u
input=$(cat)
command -v jq >/dev/null 2>&1 || exit 0
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')

case "$file" in
  *.ts|*.tsx|*.js|*.jsx) ;;
  *) exit 0 ;;
esac

cd "$(dirname "$0")/../.." || exit 0
[ -f package.json ] || exit 0
[ -f "$file" ] || exit 0

# Stop 훅과 동일한 nvm PATH 주입 (비대화형 셸에서 구버전 Node가 잡히는 문제 회피)
if [ -f .nvmrc ]; then
  REQ_NODE="$(tr -d '[:space:]' < .nvmrc)"
  CANDIDATE="$HOME/.nvm/versions/node/v${REQ_NODE}/bin"
  [ -d "$CANDIDATE" ] && export PATH="$CANDIDATE:$PATH"
fi

npx prettier --write "$file" >/dev/null 2>&1 || true

# infra/ 는 루트 eslint ignore 대상 (자체 tsc 검증) — prettier만 적용
case "$file" in
  */infra/*|infra/*) exit 0 ;;
esac

if ! out=$(npx eslint --cache "$file" 2>&1); then
  echo "eslint 위반 — 지금 고쳐라:" >&2
  echo "$out" | head -30 >&2
  exit 2
fi
exit 0
