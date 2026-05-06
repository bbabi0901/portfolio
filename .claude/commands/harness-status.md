프로젝트의 모든 phase 진행 상황을 한 표로 보여주라. 본 명령은 read-only — 어떤 파일도 수정하지 않는다. 자동 복구를 시도하지 마라.

수행 절차:

1. `phases/index.json` 을 읽어 task 디렉토리 목록을 얻는다. 파일 부재 시 "no phases registered" 출력 후 종료.

2. 각 task 의 `phases/<dir>/index.json` 을 읽어 다음 정보를 수집:
   - 전체 step 수, completed/pending/error/blocked 별 수
   - 가장 최근 timestamp (started_at / completed_at / failed_at / blocked_at 중)
   - retry 누적 (각 step 의 `attempts` 배열 길이 합산)

3. 다음 표를 출력 (Phase 단위):

| Phase | Status | Steps (✓/▶/!/⏸) | Last Update | Retries |
|---|---|---|---|---|
| harness-refinement | pending | 3/4/0/0 | 2026-05-06 14:23 | 2 |

   - `Status` 는 `phases/index.json` 의 phase 항목 status.
   - `Steps` 는 completed/pending/error/blocked 카운트.
   - `Retries` 는 모든 step 의 `attempts` 배열 길이 합. 0 이면 빈칸.
   - `Last Update` 는 KST iso 의 날짜·시간 부분.

4. 진행 중 항목이 있으면 (status="pending" 이고 started_at 있음, 또는 error/blocked) 다음 후속 표로 강조:

| Phase | Step | Name | Status | Attempts | Started | Notes |

   - `Notes` 는 error_message 또는 blocked_reason (truncate to 60 chars).

5. 잔재 lock 파일 (`phases/*/.lock`) 이 있으면 "⚠ stale lock files: ..." 한 줄 추가.

6. 마지막에 다음 행동 안내:
   - 모두 completed 면: "All phases complete. New phase 작성: .claude/commands/harness.md 참조."
   - error 가 있으면: "수동 복구: status 를 'pending' 으로 바꾸고 error_message 를 삭제, 그 후 재실행."
   - blocked 가 있으면: "차단 사유 해결 후 status 를 'pending' 으로 바꾸고 blocked_reason 삭제, 재실행."

이 명령은 정보 출력만 한다. 자동 복구·정리를 시도하지 마라. 사용자가 결정할 수 있도록 안내만.
