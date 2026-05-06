# Step 0: harness-rules-update

## 읽어야 할 파일

먼저 아래 파일을 정독하라. 본 step 의 변경은 단 한 파일이지만, 이 파일은 다음 step 부터 모든 step.md 작성의 기준이 된다.

- `.claude/commands/harness.md` (전체 152줄, 변경 대상)
- `CLAUDE.md` (프로젝트 규칙)
- `docs/PRD.md` (프로젝트 정의 — PR 게이트 명령 확인용)

## 작업

`.claude/commands/harness.md` 한 파일만 수정한다. 다음 6개 변경을 모두 적용하라.

### 1) AC 예시 갱신 (원칙 5)

현재 (라인 25 부근):
```
5. **AC는 실행 가능한 커맨드** — "~가 동작해야 한다" 같은 추상적 서술이 아닌 `npm run build && npm test` 같은 실제 실행 가능한 검증 커맨드를 포함한다.
```

이 한 줄의 코드 예시를 본 프로젝트의 PR 게이트(`npm run check:spec && npm run lint && npm run test`)에 맞게 갱신하라. 단순 문자열 교체로 충분.

### 2) SDD+TDD 흐름 명시 (원칙 4)

원칙 4(시그니처 수준 지시)의 끝에 한 문장 추가:

> 사용자에게 보이는 새 기능 step 은 (1) `spec.json` 의 `features[]` 에 FEAT-XXX 등록 → (2) 실패 테스트 작성(파일 경로는 spec 의 `tests[]`) → (3) 통과 구현 순서를 강제한다. 이 순서를 깨뜨리지 마라. 이유: SDD+TDD 워크플로우.

### 3) D-3 step 템플릿 AC 코드블록 갱신

D-3 의 `## Acceptance Criteria` 섹션의 코드블록(`npm run build` / `npm test`) 두 줄을 다음으로 교체:

```bash
npm run check:spec   # spec.json 유효성 + FEAT 의 tests 파일 존재 검증
npm run lint
npm run test
```

### 4) D-3 검증 절차 체크리스트 보강

`## 검증 절차` 의 "아키텍처 체크리스트" 항목들 끝에 한 줄 추가:

> - `spec.json` 의 `features[]` FEAT 등록과 `tests[]` 파일 매핑이 유지되는가?

### 5) 에러 복구 절차 보강 (E절 끝)

E절 "에러 복구" 의 두 항목(error / blocked) 다음에 한 항목 추가:

> - **status 가 `pending` 인 채로 종료된 경우**: execute.py 의 retry 카운터는 0 으로 리셋되니 그대로 재실행하면 처음부터 attempt 1. `started_at` 은 보존되어 첫 시작 시각이 유지된다.

### 6) Multi-task 가이드 (E절 끝)

위 항목 바로 다음에 한 단락 추가:

> 여러 task 를 동시에 진행할 때: phase 디렉토리만 다르면 `feat-{task-name}` 브랜치, `phases/{task}/.lock`, `phases/{task}/index.json` 모두 분리된다. 두 task 를 별도 터미널에서 동시 실행해도 안전.

## Acceptance Criteria

```bash
git diff --stat HEAD .claude/commands/harness.md   # 1 file changed (+ 추가)
grep -q "npm run check:spec" .claude/commands/harness.md
grep -q "spec\\.json" .claude/commands/harness.md
grep -q "FEAT-" .claude/commands/harness.md
grep -q "started_at" .claude/commands/harness.md
grep -q "phase 디렉토리만 다르면" .claude/commands/harness.md
```

위 6 개 명령이 모두 성공해야 한다.

## 검증 절차

1. 위 AC 명령을 실행해 0/non-zero 를 확인한다.
2. 변경 후 `.claude/commands/harness.md` 를 처음부터 끝까지 다시 읽고, 다음을 확인:
   - 한국어 톤(직설·명령형) 일관 유지
   - D-3 템플릿의 섹션 순서 변경 없음
   - 새 줄들이 어색한 위치에 끼어들지 않음
3. 결과에 따라 `phases/harness-refinement/index.json` 의 step 0 을 업데이트:
   - 성공 → `"status": "completed"`, `"summary": "harness.md 6 변경 적용 — PR 게이트 정렬, SDD/TDD, multi-task 가이드"`
   - 3 회 시도 실패 → `"status": "error"` + `"error_message"`
   - 사용자 개입 필요 → `"status": "blocked"` + `"blocked_reason"` 후 즉시 중단

## 금지사항

- `.claude/commands/harness.md` 외 다른 파일을 수정하지 마라. 이유: 자기완결성 위반 및 다음 step 의 컨텍스트 오염.
- D-3 템플릿의 `## 금지사항` 섹션 위치를 옮기지 마라. 이유: 사용자/리뷰어 친숙도.
- 한국어 본문을 영어로 번역하지 마라. 이유: 기존 문서 스타일 일관성.
- 새 섹션 "AC 변형" 같은 헤딩을 추가하지 마라. 이유: 인라인 갱신만으로 충분 — 중복은 가독성을 해친다.
- 기존 테스트(scripts/test_execute.py)를 깨뜨리지 마라.
