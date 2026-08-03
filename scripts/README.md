# scripts/

빌드·동기화 스크립트 모음 (각 스크립트 역할은 루트 CLAUDE.md 명령어 절 참조).

> 1세대 하네스 실행기(`execute.py`)는 **ADR-036으로 폐지** — git 이력에서 열람 가능.
> 현행 루프 체계는 [.claude/commands/loop.md](../.claude/commands/loop.md) + [phases/stories.json](../phases/stories.json).

## test_settings.py — 훅 계약 테스트

`.claude/settings.json` 배선과 훅 5종(block-dangerous / reviewer-gate / post-edit-check / post-session-check / session-start-check)의 stdin JSON 계약·exit code·차단/통과 매트릭스를 검증한다.

```bash
python3 -m pytest scripts/test_settings.py -q   # pytest 필요 (venv 권장)
```

훅을 수정하면 반드시 이 테스트를 함께 갱신하라 — 훅과 테스트의 drift는 게이트 무력화로 이어진다.
