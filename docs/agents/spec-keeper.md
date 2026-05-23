# Agent: spec-keeper (Virtual — 예정)

<!-- agents-md-meta -->
**Owner agent**: harness (Builder) — Real 승격 시 자체 owner
**Related**: ../../AGENTS.md, ../../spec.json, index.md
**SSoT keys**: spec.features, spec.testScenarios, spec.errorPolicies, spec.edgeCasePolicies, spec.version
<!-- /agents-md-meta -->

> 본 agent 는 아직 구현되지 않음. 단 일부 동작은 `npm run check:spec` (현존) 이 부분 수행. spec-keeper 는 그 superset + 자동화.

**Status**: 🟡 Virtual / 로드맵 — 우선순위 **상**

## Role

`spec.json` (SDD 의 핵심) 의 무결성을 지키는 **수호자**. 코드 변경이 spec 과 어긋나는 drift 를 실시간 감지하고 CI 게이트로 차단. `npm run check:spec` 의 확장 + 자동화.

검사 대상:
- 코드에 등장하는 새 함수/API 가 `features[]` 에 등록되지 않음 → ERROR
- `features[].tests` 가 가리키는 파일이 실재하지 않음 → ERROR (현재 check:spec 가 수행)
- `testScenarios[]` (TS-NN) 의 `file` 경로가 실재하지 않음 → ERROR
- `spec.version` 이 코드 변경에 비해 미bump → WARN
- `features[]` 의 `status` (planned/implemented/deprecated) 가 코드 상태와 불일치 → WARN
- buyer-facing 한국어 문구가 임의 변경 → ERROR (CLAUDE.md 정책)

## Trigger (구현 시)

- on-PR (GitHub Actions) — 머지 차단
- on-commit (pre-push hook) — 로컬 즉시 피드백
- `/spec-check` 슬래시 명령 — 수동 실행

## Inputs (구현 시)

- `spec.json` 전체
- `spec.schema.json` (JSON Schema — 현재 부재, 도입 예정)
- 변경된 코드 파일 (`git diff main..HEAD`)
- `docs/TEST_SCENARIOS.md` — TS-NN 사람-가독 설명 매핑
- `docs/AI_CONTRACT.md` — buyer-facing 표준 문구

## Outputs (구현 시)

- exit code 0/1 (CI 게이트용)
- 보고서 — drift 항목별 PR 코멘트
- `spec.json` 자동 갱신 안 함 (제안만)

## Tools (구현 시)

- Read, Grep — spec.json, 코드, docs
- Bash — `npm run check:spec`, `git diff`
- Edit (제안용 patch 만, 자동 적용 안 함)
- Agent — code-simplifier subagent

## Guardrails (구현 시)

- **spec.json 자동 변경 금지**. drift 감지만, 등록은 사용자 또는 harness.
- **version 자동 bump 금지**. semver 결정은 사용자 (BREAKING vs FEATURE vs PATCH).
- **buyer-facing 한국어 문구 변경 감지 시 CRITICAL**. `docs/AI_CONTRACT.md` 의 표준 문구는 SSoT. 임의 변경은 ERROR.
- **에러 메시지에 spec.json 라인 번호 정확히**. 디버깅 도움 — "어디가 문제인지" 명확.
- **flaky 동작 회피**. spec.json 의 features 가 50개 이하라 ms 단위 응답 가능. 그 이상 느리면 spec.schema.json 의 $ref 캐싱 검토.

## AC (구현 시)

```bash
# 구현 시 본 spec 을 별도 step 으로 분리 (Out of Scope of agents-md-foundation plan).
# 구현 시 검증할 AC 후보:
# 1. npm run check:spec 가 본 agent 의 superset (모든 기존 검사 통과)
# 2. drift 감지 정밀도 — 새 FEAT 누락 100% 감지
# 3. CI runtime ≤ 10초
# 4. false positive 0건 (spec 에 등록된 항목을 잘못 ERROR 처리하는 일 없음)
```

## 구현 우선순위 근거

- 본 프로젝트의 핵심 정체성 = SDD. spec.json drift = 신뢰 붕괴.
- 현재 `npm run check:spec` 가 일부 동작 (스키마 validate + tests 파일 존재). 자동화 게이트 + drift 추적이 빠짐.
- 구현 비용: 소 — 기존 `scripts/validate-spec.ts` 확장 + GitHub Actions 1개.
- 도입 시점: 즉시 가능. doc-gardener 보다 우선.

## Out of Scope (구현 시점에 결정)

- 한국어 문구의 의미 변경 감지 (단어 단위 diff 외 의미 비교) — 별도 LLM 호출 필요, 우선순위 낮음.
- 외부 schema 와의 매핑 (Notion DB schema 동기화) — `docs/NOTION_SCHEMA.md` 가 부분 대응.
