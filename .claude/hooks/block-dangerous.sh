#!/usr/bin/env bash
# CC v2.x PreToolUse hook — stdin JSON 입력, exit 2 = 차단.
# 결함 회귀 방지: $CLAUDE_TOOL_INPUT 환경변수 사용 금지, exit 1 사용 금지.
set -u

input="$(cat)"

# tool_name 이 Bash 가 아니면 즉시 통과
tool_name="$(printf '%s' "$input" | jq -r '.tool_name // ""' 2>/dev/null || echo "")"
if [ "$tool_name" != "Bash" ]; then
  exit 0
fi

# command 추출
if command -v jq >/dev/null 2>&1; then
  command_str="$(printf '%s' "$input" | jq -r '.tool_input.command // ""' 2>/dev/null || echo "")"
else
  echo "[block-dangerous] WARN: jq not installed — using fallback regex on raw JSON" >&2
  command_str="$input"
fi

[ -z "$command_str" ] && exit 0

# 차단 패턴 (egrep -i 호환). false positive 회피 위해 정확한 컨텍스트 매칭.
declare -a patterns=(
  # 파일/디렉토리 파괴
  'rm[[:space:]]+(-[rRfF]+[[:space:]]+)+(/|~|\$HOME|\*)'
  'rm[[:space:]]+(-r|--recursive)[[:space:]]+(-f|--force)'
  'rm[[:space:]]+(-f|--force)[[:space:]]+(-r|--recursive)'
  'rm[[:space:]]+--recursive[[:space:]]+--force'
  'find[[:space:]].*[[:space:]]-delete([[:space:]]|$)'
  # 권한 위협
  'chmod[[:space:]]+(-R[[:space:]]+)?(0?777|a\+rwx)'
  # 디스크 파괴
  'mkfs(\.|[[:space:]])'
  'dd[[:space:]]+if=\S+[[:space:]]+of=/dev/'
  '(^|[[:space:]])shred[[:space:]]'
  '(^|[[:space:]])wipefs[[:space:]]'
  # 포크 폭탄
  ':\(\)[[:space:]]*\{[[:space:]]*:\|:&[[:space:]]*\};:'
  # 임의 코드 실행 (curl/wget | sh/bash/zsh/python)
  '(curl|wget)[^|]+\|[[:space:]]*(sh|bash|zsh|python[0-9]?)'
  'bash[[:space:]]+<\(curl'
  # 시크릿/dotfile 덮어쓰기
  '>[[:space:]]*\.env(\.local)?($|[[:space:]])'
  '>[[:space:]]*~?/?\.(zshrc|bashrc|profile|ssh/)'
  # Git 위협
  'git[[:space:]]+push[[:space:]]+(--force|-f|--force-with-lease)'
  'git[[:space:]]+push[[:space:]]+\S+[[:space:]]+:\S+'
  'git[[:space:]]+reset[[:space:]]+--hard'
  'git[[:space:]]+clean[[:space:]]+-[fdx]'
  'git[[:space:]]+filter-(branch|repo)'
  'git[[:space:]]+reflog[[:space:]]+expire'
  # 패키지 위협
  'npm[[:space:]]+(publish|unpublish|deprecate)'
  '(pnpm|yarn)[[:space:]]+publish'
  # 클라우드 위협
  'aws[[:space:]]+s3[[:space:]]+(rb|rm)'
  'aws[[:space:]]+iam[[:space:]]+delete-'
  'aws[[:space:]]+ec2[[:space:]]+terminate-instances'
  'kubectl[[:space:]]+delete[[:space:]]+(--all|namespace|ns)'
  'terraform[[:space:]]+destroy'
  # DB
  '(DROP|drop)[[:space:]]+(TABLE|DATABASE|SCHEMA|INDEX)'
  '(TRUNCATE|truncate)[[:space:]]+TABLE'
)

for p in "${patterns[@]}"; do
  if printf '%s' "$command_str" | grep -qiE "$p"; then
    echo "BLOCKED: 위험 패턴 일치: $p" >&2
    echo "BLOCKED: 입력: $command_str" >&2
    exit 2   # CC v2.x: exit 2 = 차단 + stderr 가 Claude 에 에러 메시지로 전달
  fi
done

exit 0
