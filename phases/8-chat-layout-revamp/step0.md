# Step 0: spec-and-docs (이미 사람이 수동 완료)

## 상태

이 step 의 산출물은 **task 시작 전 사람이 수동으로 작성**했다 (spec.json + docs/* 갱신). execute.py 가 이 step 을 실행할 때는 다음을 확인하는 것이 작업의 전부:

1. spec.json 의 `features[]` 에 `FEAT-030` 존재.
2. spec.json 의 `testScenarios[]` 에 `TS-71`, `TS-72`, `TS-73` 존재.
3. spec.json 의 `version` 이 `0.2.0`.
4. `docs/PAGES.md` 의 `/` 채팅 와이어프레임이 갱신된 형태 (MessageList → Carousel → Composer 순서, Composer 가 둥근 박스, ModelSwitcher 가 Composer 안).
5. `docs/UI_GUIDE.md` 에 "Composer 외곽 박스 (FEAT-030)" 절 존재.
6. `docs/RESPONSIVE.md` 에 "Composer (FEAT-030 prominent box)" 표 존재.

## 작업

위 6개 항목을 grep / cat 으로 검증. 모두 존재하면 즉시 step completed. 누락된 항목 있을 시에만 보강.

```bash
grep -q '"FEAT-030"' spec.json && echo "FEAT-030 ok"
grep -q '"TS-71"' spec.json && echo "TS-71 ok"
grep -q '"TS-72"' spec.json && echo "TS-72 ok"
grep -q '"TS-73"' spec.json && echo "TS-73 ok"
grep -q '"version": "0.2.0"' spec.json && echo "version ok"
grep -q "FEAT-030" docs/PAGES.md && echo "PAGES.md ok"
grep -q "FEAT-030" docs/UI_GUIDE.md && echo "UI_GUIDE.md ok"
grep -q "FEAT-030 prominent box" docs/RESPONSIVE.md && echo "RESPONSIVE.md ok"
```

## Acceptance Criteria

```bash
npm run check:spec    # 30 features, 73 scenarios 출력
npm run lint
```

## 검증 절차

1. AC 실행.
2. 위 7개 grep 모두 ok 출력.
3. `phases/8-chat-layout-revamp/index.json` step 0 갱신.

## 금지사항

- **spec.json 의 다른 features/testScenarios 수정 금지** (FEAT-001~029, TS-01~70 그대로).
- **docs 의 다른 절 수정 금지** (Composer / Carousel 관련 절만).
- **새 FEAT/TS 추가 금지** (FEAT-030, TS-71~73 외).
