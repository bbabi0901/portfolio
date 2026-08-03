#!/usr/bin/env bash
# PreToolUse(Edit|Write|Bash): 검증 체계 자기보호 게이트. (ADR-036)
# 1) stories.json 의 passes 갱신은 reviewer 전용 — Edit/Write 하드 차단, Bash 는 REVIEWER_OK=1 프리픽스만 허용
# 2) 검증 게이트 자체(훅·settings·lint/ts/vitest 설정) 수정 차단
# ponytail: 문자열 휴리스틱이라 우회 가능(변수 조립, base64 등) — 완전 방어가 아니라 울타리.
#           최종 신뢰 경계는 reviewer 재실행 + 사람 PR 리뷰.
set -u
input=$(cat)
command -v jq >/dev/null 2>&1 || exit 0
tool=$(printf '%s' "$input" | jq -r '.tool_name // empty')

deny() { echo "reviewer-gate 차단: $1" >&2; exit 2; }

PROTECTED='(\.claude/hooks/|\.claude/settings\.json|eslint\.config\.mjs|tsconfig\.json|vitest\.config|playwright\.config)'

if [ "$tool" = "Edit" ] || [ "$tool" = "Write" ]; then
  file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
  case "$file" in
    *phases/stories.json)
      deny "stories.json 은 Edit/Write 금지 — passes 갱신은 reviewer 가 REVIEWER_OK=1 Bash 로만 수행" ;;
  esac
  if printf '%s' "$file" | grep -qE "$PROTECTED"; then
    deny "검증 게이트 파일($file) 수정 금지 — 변경이 필요하면 사용자에게 요청하라"
  fi
  exit 0
fi

if [ "$tool" = "Bash" ]; then
  cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
  if printf '%s' "$cmd" | grep -q 'stories\.json'; then
    # 읽기(cat/grep/jq 조회)는 허용, 쓰기 형태만 검사
    if printf '%s' "$cmd" | grep -qE '(>|>>|tee |sed +-i|python3? |node +-e|jq .*--arg.*passes|mv |cp ).*stories\.json|stories\.json.*(<<|> )'; then
      case "$cmd" in
        REVIEWER_OK=1*) ;;
        *) deny "stories.json 쓰기는 reviewer 전용 (REVIEWER_OK=1 프리픽스 필요)" ;;
      esac
    fi
  fi
  if printf '%s' "$cmd" | grep -qE "(>|>>|tee |sed +-i|rm +).*$PROTECTED"; then
    deny "검증 게이트 파일 변경 명령 금지"
  fi
fi
exit 0
