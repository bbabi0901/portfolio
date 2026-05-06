# Step 6: ci-pipeline

## 읽어야 할 파일

- `/docs/TESTING.md` — CI 파이프라인 정책
- `/docs/ADR.md` — ADR-011 Vitest, ADR-010 spec.json
- `/CLAUDE.md` — "PR은 npm run check:spec, lint, test가 통과해야 머지"
- `/package.json` — 모든 scripts (이전 step들)
- `/.nvmrc` — Node 버전

이전 step 산출물:

- `/package.json` — `check:spec`, `lint`, `test`, `e2e`, `build` scripts 모두 준비됨
- `/vitest.config.ts`, `/playwright.config.ts` — 테스트 환경
- `/tsconfig.json` — strict 타입체크

이전 step의 `package.json` scripts를 확인하고, 모든 명령이 CI에서 정상 동작하는지 검증하라.

## 작업

GitHub Actions로 PR + main push 시 lint + test + check:spec + build 자동 실행. 외부 API 키 없이 통과하도록 mock + SKIP 플래그 사용.

### 생성할 파일

1. **`.github/workflows/ci.yml`**
   ```yaml
   name: CI

   on:
     pull_request:
       branches: [main]
     push:
       branches: [main]

   jobs:
     build-test:
       runs-on: ubuntu-latest
       timeout-minutes: 15
       env:
         NEXT_TELEMETRY_DISABLED: "1"
         SKIP_NOTION_SYNC: "1"
         MOCK_LLM: "1"
         MOCK_NOTION: "1"
       steps:
         - uses: actions/checkout@v4

         - uses: actions/setup-node@v4
           with:
             node-version-file: ".nvmrc"
             cache: "npm"

         - name: Install dependencies
           run: npm ci

         - name: Validate spec.json
           run: npm run check:spec

         - name: Lint
           run: npm run lint

         - name: Format check
           run: npm run format:check

         - name: Type check
           run: npx tsc --noEmit

         - name: Unit + component tests
           run: npm run test

         - name: Build
           run: npm run build

     e2e:
       runs-on: ubuntu-latest
       needs: build-test
       timeout-minutes: 20
       if: false  # TODO(post-mvp): enable when content pipeline is in place
       env:
         NEXT_TELEMETRY_DISABLED: "1"
         SKIP_NOTION_SYNC: "1"
         MOCK_LLM: "1"
         MOCK_NOTION: "1"
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version-file: ".nvmrc"
             cache: "npm"
         - run: npm ci
         - run: npx playwright install --with-deps chromium
         - run: npm run e2e
         - if: always()
           uses: actions/upload-artifact@v4
           with:
             name: playwright-report
             path: playwright-report/
             retention-days: 7
   ```

2. **`.github/dependabot.yml`** (옵션, 권장)
   ```yaml
   version: 2
   updates:
     - package-ecosystem: "npm"
       directory: "/"
       schedule:
         interval: "weekly"
       open-pull-requests-limit: 5
     - package-ecosystem: "github-actions"
       directory: "/"
       schedule:
         interval: "monthly"
   ```

3. **`package.json`** 정리:
   - `format:check` script 존재 확인 (step 0에서 추가됐어야 함). 없으면 추가:
     - `"format:check": "prettier --check ."`
   - 모든 script 일관성 점검.

### 핵심 규칙

- **CI는 외부 API 키를 절대 요구하지 않는다.** `SKIP_NOTION_SYNC=1`, `MOCK_LLM=1`, `MOCK_NOTION=1` 환경변수로 우회.
- **secrets** (NOTION_TOKEN, OPENAI_API_KEY 등) 미사용. 후속 task에서도 CI에는 추가하지 않음 (테스트는 mock).
- **prebuild에서 sync:notion이 자동 실행되더라도 SKIP_NOTION_SYNC=1로 차단.** 이 step에서는 prebuild가 `npm run check:spec`만 실행하므로 무관하지만, 후속 task 대비 환경변수 미리 설정.
- Node 버전은 `.nvmrc` 단일 SSoT.
- e2e job은 콘텐츠 파이프라인 부재 상태에서는 의미가 적으므로 `if: false`로 disable. 후속 task에서 활성화.

## Acceptance Criteria

```bash
# 로컬에서 CI 시뮬레이션
npm ci
npm run check:spec
npm run lint
npm run format:check
npx tsc --noEmit
npm run test
SKIP_NOTION_SYNC=1 MOCK_LLM=1 MOCK_NOTION=1 npm run build

# YAML 문법 검사
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"

test -f .github/workflows/ci.yml
```

## 검증 절차

1. AC 실행 (모든 명령 0 exit).
2. 체크리스트:
   - `ci.yml` YAML 문법 OK?
   - `build-test` job이 check:spec → lint → format:check → tsc → test → build 순서로 실행?
   - secrets 미요구?
   - `.nvmrc` 사용 (`node-version-file`)?
   - `npm ci` 사용 (npm install 아님, lock 일치 강제)?
   - timeout-minutes 설정?
   - `e2e` job은 `if: false`로 disable?
3. `phases/0-scaffold/index.json` step 6 갱신 (이 task의 마지막 step → task index의 status는 execute.py가 자동 갱신).
4. `phases/index.json`의 `0-scaffold` 항목도 status가 `completed`로 자동 전이되는지 확인.

## 금지사항

- **secrets 요구하는 job 추가 금지.** 이유: 0-scaffold task는 외부 API 무관.
- **`pnpm`, `yarn` 사용 금지.** 이유: lock 파일 단일성 (CLAUDE.md).
- **`node-version`을 ci.yml에 hardcode 금지** (`node-version: 22.12.0` 같은). 이유: `.nvmrc`로 단일 SSoT.
- **`coverage` upload (codecov, coveralls 등) 추가 금지.** 이유: MVP 외 범위. 후속 task에서 검토.
- **`actions/cache@v3` 같은 deprecated action 사용 금지.** 이유: 보안. v4 이상.
- **`continue-on-error: true` 남용 금지.** 이유: 실패가 silent하게 통과되어 신뢰도 저하.
- **lint/test 단계에 `|| true` 추가 금지.** 이유: 위와 동일.
- **`workflow_dispatch` trigger 추가 금지** (이 step에서). 이유: MVP 외. 후속 task에서 deploy workflow에 사용 가능.
- **deploy job 추가 금지.** 이유: Vercel은 GitHub 연동으로 자동 배포 (별도 workflow 불필요). 이는 7-e2e-deploy task에서 가이드.
