#!/usr/bin/env bash
# CC Stop hook — 세션 종료 시 PR 게이트 실행.
# package.json/node_modules 부재 시 silent skip 으로 ENOENT 노이즈 제거.
# 실패 시 exit 2 = "Stop 차단" — Claude 가 보강 응답 가능.
set -u

cat >/dev/null   # stdin JSON 무시

if [ ! -f package.json ]; then
  echo "[stop-hook] skip: no package.json yet"
  exit 0
fi
if [ ! -d node_modules ]; then
  echo "[stop-hook] skip: run 'npm ci' first" >&2
  exit 0
fi

# PR 게이트 (PRD/CLAUDE.md 정렬): check:spec → lint → test (build 제외 — prebuild 가 sync:notion 트리거하기 때문)
npm run check:spec 2>&1 || { echo "[stop-hook] check:spec failed" >&2; exit 2; }
npm run lint       2>&1 || { echo "[stop-hook] lint failed" >&2; exit 2; }
npm run test       2>&1 || { echo "[stop-hook] test failed" >&2; exit 2; }

exit 0
