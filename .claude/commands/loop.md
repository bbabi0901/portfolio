---
description: phases/stories.json에서 다음 미완 스토리 하나를 골라 Plan→Execute→Verify→Commit→Review 사이클을 완주한다
---

`phases/stories.json`에서 `passes: false`인 첫 스토리를 하나만 골라 완주하라. 여러 개 동시 진행 금지. 무인 연속 실행 금지 — 한 스토리 완주 후 정지하고 사람에게 보고한다 (ADR-036).

1. **Plan**: 스토리와 AC를 읽고, 건드릴 파일과 접근을 3-6줄로 요약. `spec.json`·`docs/ADR.md`·CLAUDE.md CRITICAL 규칙과 충돌하면 멈추고 사용자에게 질문
2. **Branch**: main 기준 `feat/{scope}`(또는 fix/refactor/docs) 브랜치 생성 — CLAUDE.md Git 규칙 준수
3. **Execute**: TDD — spec.json에 FEAT/TS 등록(신규 기능인 경우) → 실패 테스트 먼저 → 최소 구현으로 통과 → 정리. 핵심 기능은 3-레벨 테스트(Unit+Integration+E2E) 규칙 적용
4. **Verify**: AC의 `cmd`를 전부 직접 실행해 통과 확인. LLM 통합 변경이면 `npm run test:smoke`(실 API)까지
5. **Commit**: 본문에 "왜 이 접근인지" 1-2줄 필수. SSoT 갱신(spec/ADR/docs)이 코드와 같은 커밋에 포함되어야 함
6. **Review**: reviewer 서브에이전트를 호출해 검증과 `passes` 갱신을 맡긴다. 반려되면 고치고 재호출 (최대 3회 — 그래도 안 되면 사용자에게 파일:줄 단위로 보고)
7. `phases/progress.md`에 진행 상황 한 줄 추가 → PR 생성 여부는 사용자에게 확인

주의: 스토리 범위 밖 파일을 건드리지 마라. 탐색이 필요하면 서브에이전트에 위임하라. `passes`는 절대 직접 갱신하지 마라 — 훅이 차단하며, 갱신 권한은 reviewer 전용이다.
