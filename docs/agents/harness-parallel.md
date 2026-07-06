# Agent: harness-parallel (Design Spec — 미구현)

<!-- agents-md-meta -->
**Owner agent**: harness (Builder) — 본 문서는 execute.py 병렬 스텝 디스패치 설계 명세
**Related**: ../../AGENTS.md, harness.md, index.md, ../../scripts/execute.py
**SSoT keys**: phases/{phase}/index.json (step 정의), scripts/execute.py (실행 엔진)
**Last verified**: 2026-07-06 — 사용자 (김윤수)
**Status**: 🔵 Planned / Design Complete — execute.py 확장 전 설계 명세
<!-- /agents-md-meta -->

> 본 문서는 구현 전 설계 명세다. `scripts/execute.py` 는 **수정하지 않는다**. 구현 시 본 spec 을 별도 phase 의 step 으로 분리할 것.

## 1. Overview

현재 harness 는 `phases/{task}/step{N}.md` 를 순차(sequential) 실행한다. 독립적인 스텝(예: 테스트 작성 + 문서 갱신)이 직렬 대기열에 묶여 불필요한 지연이 발생한다.

**병렬 디스패치의 효과:**

- `depends_on` 필드가 없거나 빈 스텝은 동시에 실행 → **2-3x 처리량 향상**
- 대형 task (10+ 스텝) 에서 효과 극대화
- 독립 스텝끼리 충돌 없이 실행 보장 (파일 단위 잠금)

예시: 5개 스텝 중 step 1-2-3 이 독립이면 3개를 동시에 실행, step 4-5 가 1-2-3 에 의존하면 완료 후 진행. 전체 소요 시간이 순차 대비 약 2.4x 단축.

## 2. Schema Extension

`phases/{task}/index.json` 의 각 step 객체에 `depends_on` 필드를 추가한다.

```json
{
  "task": "example-task",
  "steps": [
    {
      "step": 1,
      "name": "setup-types",
      "depends_on": [],
      "status": "pending"
    },
    {
      "step": 2,
      "name": "write-tests",
      "depends_on": [],
      "status": "pending"
    },
    {
      "step": 3,
      "name": "write-docs",
      "depends_on": [],
      "status": "pending"
    },
    {
      "step": 4,
      "name": "implement",
      "depends_on": [1, 2],
      "status": "pending"
    },
    {
      "step": 5,
      "name": "integrate",
      "depends_on": [3, 4],
      "status": "pending"
    }
  ]
}
```

**필드 정의:**

| 필드 | 타입 | 의미 |
|---|---|---|
| `depends_on` | `number[]` | 선행 완료되어야 하는 step 번호 목록 |
| `depends_on: []` | 빈 배열 | 독립 스텝 — 즉시 실행 가능 |
| `depends_on` 없음 | (absent) | 독립으로 간주 — 기존 파일과 호환 |

## 3. Dependency Graph Rules

1. **독립 스텝**: `depends_on` 이 없거나 빈 배열 (`[]`) → 같은 그룹의 다른 독립 스텝과 동시에 실행 가능.
2. **순환 의존 금지**: 시작 시 의존 그래프를 위상 정렬(topological sort)하여 순환 감지. 순환 발견 시 즉시 종료 (exit code 1), 실행하지 않음.
3. **선행 완료 보장**: 스텝 N 이 `depends_on: [3, 4]` 이면 step 3 AND step 4 가 모두 `status: "done"` 이 된 후에만 N 을 시작.
4. **실패 전파**: 의존 스텝이 `status: "failed"` 면 후속 스텝은 `status: "blocked"` 로 마크하고 건너뜀.
5. **부분 실패 허용 (옵션)**: `--ignore-failed-deps` 플래그로 blocked 스텝을 강제 실행 가능 (디버그 전용).

## 4. Execution Model

```
Worker Pool (N = max(2, cpu_count - 1))
┌─────────────────────────────────────────┐
│  Worker 1 ──► step 1 (claude CLI)       │
│  Worker 2 ──► step 2 (claude CLI)       │
│  Worker 3 ──► step 3 (claude CLI)       │
│  [step 4 대기: depends_on [1, 2]]        │
│  [step 5 대기: depends_on [3, 4]]        │
└─────────────────────────────────────────┘
```

**구현 세부:**

- **Thread Pool**: `concurrent.futures.ThreadPoolExecutor(max_workers=N)` 사용. N = `max(2, os.cpu_count() - 1)`.
- **각 Worker**: 별도 `claude` CLI 프로세스를 `subprocess.run()` 으로 호출. 각 프로세스는 완전히 독립.
- **Shared state**: `phases/{task}/index.json` 의 `status` 필드가 공유 상태. 갱신 시 파일 잠금 필수 (5절 참조).
- **스케줄러 루프**: 메인 스레드가 100ms 간격으로 ready 스텝(의존 스텝 모두 done)을 확인하고 Worker 에 submit.
- **완료 감지**: `Future.done()` 또는 `as_completed()` 로 완료 이벤트 수신 → 즉시 다음 ready 스텝 계산.

## 5. Conflict Prevention

**핵심 규칙**: 같은 병렬 그룹(동시 실행 가능한 스텝 집합)의 스텝들은 **동일한 출력 파일에 쓰지 않아야 한다**.

**시작 시 정적 검증 (execute.py 가 담당):**

1. 각 step.md 에서 `## Outputs` 섹션 파싱 → 기록할 파일 목록 추출.
2. 동일 병렬 그룹 내에서 출력 파일 중복 탐지.
3. 중복 발견 시 → 두 스텝 중 하나에 `depends_on` 추가 권고 후 종료.

**런타임 파일 잠금:**

- 각 스텝이 파일 쓰기 전 `phases/{task}/step{N}.lock` 파일 생성 (fcntl 또는 threading.Lock).
- 쓰기 완료 후 잠금 해제.
- 잠금 타임아웃: 30초. 초과 시 deadlock 경고 후 해당 스텝 `status: "failed"`.

## 6. Implementation Roadmap

`scripts/execute.py` 에 추가/수정이 필요한 항목:

### 신규 메서드

```python
def _build_dependency_graph(self, steps: list[dict]) -> dict[int, set[int]]:
    """
    steps 의 depends_on 필드로 의존 그래프 생성.
    순환 감지: DFS + visited/in-stack. 순환 시 ValueError raise.
    반환: {step_num: set(deps)} 형태의 adjacency map.
    """

def _topological_sort(self, graph: dict) -> list[list[int]]:
    """
    Kahn's algorithm 으로 위상 정렬.
    반환: 실행 단계별 그룹 [[1,2,3], [4], [5]] — 같은 리스트 내 항목은 동시 실행 가능.
    """

def _execute_parallel_group(self, step_nums: list[int]) -> dict[int, bool]:
    """
    ThreadPoolExecutor 로 step_nums 동시 실행.
    반환: {step_num: success(bool)}.
    """

def _acquire_step_lock(self, step_num: int) -> None:
    """phases/{task}/step{N}.lock 파일 생성으로 잠금."""

def _release_step_lock(self, step_num: int) -> None:
    """잠금 파일 삭제."""

def _validate_output_conflicts(self, parallel_group: list[int]) -> None:
    """동일 그룹 내 출력 파일 중복 탐지. 충돌 시 RuntimeError."""
```

### 수정할 기존 메서드

```python
def _execute_all_steps(self):
    # Before:  for step in steps: self._execute_step(step)
    # After:
    graph = self._build_dependency_graph(self.index["steps"])
    groups = self._topological_sort(graph)  # [[1,2,3], [4], [5]]
    for group in groups:
        if len(group) == 1 or self.no_parallel:
            for step_num in group:
                self._execute_step(step_num)
        else:
            self._validate_output_conflicts(group)
            results = self._execute_parallel_group(group)
            # results 에서 실패한 step 의 후속을 blocked 처리
```

### 새 파일

- `phases/{task}/step{N}.lock` — 런타임 잠금 파일 (자동 생성/삭제, git 미추적)
- `phases/{task}/parallel-log-{timestamp}.jsonl` — 병렬 실행 로그 (각 스텝의 시작/종료 시각, exit code)

## 7. CLI Usage Example

```bash
# 기본 실행 — depends_on 있으면 자동으로 병렬 그룹 감지
python3 scripts/execute.py my-task

# 병렬 비활성화 — 순차 강제 (디버그 / 로컬 자원 부족 시)
python3 scripts/execute.py my-task --no-parallel

# 특정 스텝부터 재시작 (기존 기능, 병렬과 호환)
python3 scripts/execute.py my-task --from-step 3

# 실패한 의존 스텝 무시하고 강제 실행 (디버그 전용)
python3 scripts/execute.py my-task --ignore-failed-deps
```

**로그 출력 예시 (병렬 실행 시):**

```
[harness] Parallel groups: [[1, 2, 3], [4], [5]]
[harness] Group 1: running steps 1, 2, 3 concurrently (3 workers)
[harness] step 2 done (12.3s)
[harness] step 1 done (18.7s)
[harness] step 3 done (21.1s)
[harness] Group 2: running step 4
[harness] step 4 done (34.5s)
[harness] Group 3: running step 5
[harness] step 5 done (8.2s)
[harness] Total: 94.8s (estimated sequential: ~220s)
```

## 8. Migration Guide

**기존 phase 파일은 변경 불필요.**

- `depends_on` 필드가 없는 기존 index.json → 모든 스텝을 단일 순차 그룹으로 취급.
- 즉, 기존 동작 100% 유지. 병렬화는 opt-in.

**병렬화 적용 절차 (새 task 또는 기존 task 최적화 시):**

1. `phases/{task}/index.json` 의 각 step 에 `depends_on: []` 또는 `depends_on: [N, M]` 추가.
2. `python3 scripts/execute.py {task} --dry-run` 으로 의존 그래프 + 병렬 그룹 미리 확인.
3. 출력 파일 충돌 경고가 없으면 실행.

**권장 패턴:**

```json
// 독립적으로 작성 가능한 스텝 → 모두 depends_on: []
{ "step": 1, "name": "write-types",    "depends_on": [] }
{ "step": 2, "name": "write-tests",    "depends_on": [] }
{ "step": 3, "name": "update-docs",    "depends_on": [] }

// 위 세 스텝 결과가 모두 필요한 구현 스텝
{ "step": 4, "name": "implement",      "depends_on": [1, 2] }

// 구현 + 문서가 완료된 후 통합 검증
{ "step": 5, "name": "verify",         "depends_on": [3, 4] }
```
