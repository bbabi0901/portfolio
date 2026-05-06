# Step 6: generate-suggestions

## 읽어야 할 파일

- `/CLAUDE.md` — `public/data/suggestions.json`은 클라이언트 안전 슬림, 미커밋
- `/docs/NOTION_SCHEMA.md` — chunks 구조
- `/docs/ARCHITECTURE.md` — 빌드시 추천 질문 생성 데이터 흐름 (FEAT-009)
- `/docs/ADR.md` — 휴리스틱 only, LLM 미사용 (빌드 결정성)
- `/spec.json` — `suggestedQuestions[]` 18개 핵심 (반드시 포함), 30개 상한
- `/.gitignore` — `public/data/suggestions.json` 무시

이전 step 산출물:

- `/types/portfolio.ts` — `PortfolioServerData`, `PortfolioClientData`, `SuggestedQuestionMeta`
- `/lib/portfolio-data.ts` — `loadPortfolio`, `toClientData`
- `/lib/tokenize.ts` — `extractKeywords` (관련 질문 매핑용)
- `/data/portfolio.server.json` — 입력 (mock 모드라도 존재)

위 파일들을 읽고 `lib/portfolio-data.toClientData`의 출력 schema와 일치하는 JSON을 쓰는지 확인.

## 작업

`scripts/generate-suggestions.ts`. 입력 `data/portfolio.server.json` → 출력 `public/data/suggestions.json` (slim, 클라이언트 안전).

**핵심**: LLM 호출 금지. 빌드 결정성을 위해 휴리스틱만.

### 휴리스틱 정책

1. **핵심 18개는 항상 포함** (spec.json `suggestedQuestions[]` 그대로 복사).
2. **자동 추가 질문** (chunks 분석 → 새 카테고리 발견 시):
   - `chunks` 중 category="personal" 발견 + 헤딩 path에 "MBTI"/"성격"/"취미" 단어 → 해당 질문 후보 1개씩.
     - 예: "MBTI가 어떻게 돼요?", "취미가 뭐예요?".
   - 새 프로젝트 chunk (category="project", status="Done") 중 핵심 18에 없는 것 → "{프로젝트명} 어떻게 만들었어요?" 1개씩.
3. **상한 30개**. 핵심 18 + 자동 12 슬롯.
4. **중복 제거**: string normalize (공백 trim + 구두점 제거 + 소문자) 후 unique.
5. **순서**: 카테고리 그룹 (intro → recent-project → architecture → web3 → realtime → pwa → testing → collab → contact). spec.json의 카테고리 ID 사용.
6. **새 ID 부여**: 자동 추가 질문은 `Q-100` 이상 (핵심은 Q-001~Q-018 보존).

### 관련 질문 매핑 (`relatedQuestions`)

각 chunk가 어떤 질문에 답할 수 있는지 휴리스틱 매핑:
- chunks의 `tags` 또는 `headingPath` 단어와 question.text의 토큰 교집합 → score.
- 각 chunk마다 score top 3 question id 저장.
- 출력: `relatedQuestions: { [chunkId]: ["Q-005", "Q-007"] }`.
- 클라이언트는 어시스턴트 응답 후 인용된 chunkId로 lookup → "관련 질문 칩" 표시 (FEAT-022).

### 생성/수정할 파일

#### `scripts/generate-suggestions.ts`

```ts
import "server-only";

import fs from "node:fs";
import path from "node:path";

import type { PortfolioServerData, PortfolioClientData, SuggestedQuestionMeta } from "@/types/portfolio";
import { loadPortfolio, toClientData } from "@/lib/portfolio-data";
import { extractKeywords, tokenize } from "@/lib/tokenize";

interface GenerateOptions {
  /** 입력 JSON 경로. 기본 data/portfolio.server.json (loadPortfolio 사용) */
  inFile?: string;
  /** 출력 경로. 기본 public/data/suggestions.json */
  outFile?: string;
  /** 자동 추가 질문 상한 (default 12, 총 30 = 핵심 18 + 자동 12) */
  maxAuto?: number;
  /** 핵심 질문 상한 (default 18) */
  coreLimit?: number;
}

/**
 * 1. loadPortfolio()
 * 2. core questions = data.suggestedQuestions (spec.json에서 sync-notion이 복사함)
 * 3. auto questions = generateAuto(data.chunks, coreSet)
 * 4. dedupe → 최대 30개
 * 5. relatedQuestions 매핑 생성
 * 6. PortfolioClientData에 부착 → JSON 출력
 */
export async function main(opts?: GenerateOptions): Promise<void>;

main().catch((err) => {
  console.error("[generate-suggestions] failed:", err.message);
  process.exit(1);
});
```

플로우:
1. `loadPortfolio()` (Node only, fs).
2. `clientData = toClientData(serverData)` → embedding 제외, suggestedQuestions/profile만.
3. `autoQs = generateAutoQuestions(serverData.chunks, coreSet, maxAuto)`.
4. `merged = dedupeAndMerge(serverData.suggestedQuestions, autoQs)` (최대 30).
5. `relatedQuestions = buildRelatedMap(serverData.chunks, merged)`.
6. 출력:
   ```ts
   const output: PortfolioClientData = {
     version: serverData.version,
     generatedAt: serverData.generatedAt,
     suggestedQuestions: merged,
     profile: serverData.profile,
     relatedQuestions,
   };
   fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
   ```
7. 통계 출력: `✓ ${merged.length} questions (${core} core + ${auto} auto), ${chunks} chunks mapped`.

#### `package.json` scripts 갱신

```json
{
  "scripts": {
    "gen:suggestions": "tsx scripts/generate-suggestions.ts",
    "prebuild": "npm run check:spec && npm run sync:notion && npm run gen:suggestions"
  }
}
```

#### `specs/generate-suggestions.spec.ts`

```ts
import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { main as generateMain } from "@/scripts/generate-suggestions";
import { clearPortfolioCache } from "@/lib/portfolio-data";

const FIXTURE_SAMPLE = "data/portfolio.sample.json";

describe("generate-suggestions", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gen-sug-"));
    clearPortfolioCache();
  });

  it("writes public/data/suggestions.json with required fields", async () => {
    const out = path.join(tmpDir, "suggestions.json");
    await generateMain({ inFile: FIXTURE_SAMPLE, outFile: out });
    const data = JSON.parse(fs.readFileSync(out, "utf-8"));
    expect(data.suggestedQuestions).toBeDefined();
    expect(data.profile).toBeDefined();
    expect(data.generatedAt).toBeDefined();
    expect(data.relatedQuestions).toBeDefined();
    // 클라이언트로 chunks/embeddings 누출 없음
    expect("chunks" in data).toBe(false);
  });

  it("preserves core 18 questions from spec.json", async () => {
    const out = path.join(tmpDir, "suggestions.json");
    await generateMain({ inFile: FIXTURE_SAMPLE, outFile: out });
    const data = JSON.parse(fs.readFileSync(out, "utf-8"));
    const coreIds = data.suggestedQuestions.filter((q: any) => /^Q-0(0[1-9]|1[0-8])$/.test(q.id));
    expect(coreIds.length).toBe(18);
  });

  it("caps total at 30", async () => {
    const out = path.join(tmpDir, "suggestions.json");
    await generateMain({ inFile: FIXTURE_SAMPLE, outFile: out });
    const data = JSON.parse(fs.readFileSync(out, "utf-8"));
    expect(data.suggestedQuestions.length).toBeLessThanOrEqual(30);
  });

  it("dedupes by normalized text", async () => {
    /* fixture에 동일 텍스트(공백/구두점 다름) 추가 후 검증 */
  });

  it("relatedQuestions maps chunk id to question ids", async () => {
    const out = path.join(tmpDir, "suggestions.json");
    await generateMain({ inFile: FIXTURE_SAMPLE, outFile: out });
    const data = JSON.parse(fs.readFileSync(out, "utf-8"));
    const someChunkId = Object.keys(data.relatedQuestions)[0];
    expect(Array.isArray(data.relatedQuestions[someChunkId])).toBe(true);
    expect(data.relatedQuestions[someChunkId].length).toBeLessThanOrEqual(3);
  });

  it("is deterministic (same input → same output)", async () => {
    const out1 = path.join(tmpDir, "a.json");
    const out2 = path.join(tmpDir, "b.json");
    await generateMain({ inFile: FIXTURE_SAMPLE, outFile: out1 });
    clearPortfolioCache();
    await generateMain({ inFile: FIXTURE_SAMPLE, outFile: out2 });
    const a = JSON.parse(fs.readFileSync(out1, "utf-8"));
    const b = JSON.parse(fs.readFileSync(out2, "utf-8"));
    // generatedAt만 다를 수 있음
    delete a.generatedAt;
    delete b.generatedAt;
    expect(a).toEqual(b);
  });
});
```

### TDD 순서

1. `specs/generate-suggestions.spec.ts` 작성 → 실패.
2. `scripts/generate-suggestions.ts` 작성 → 통과.
3. `package.json` `gen:suggestions` script + prebuild 체인 갱신.
4. lint/tsc/build 통과.

### 핵심 규칙

- LLM 호출 금지. 휴리스틱만.
- 빌드 결정성: 같은 입력 → 같은 출력 (generatedAt 제외).
- 핵심 18개 보존 + 자동 추가 ID는 Q-100 이상.
- 중복 제거 (normalize 후).
- 클라이언트 안전: chunks/embedding 절대 출력 금지.

## Acceptance Criteria

```bash
# 사전: data/portfolio.sample.json 또는 data/portfolio.server.json 존재
ls data/portfolio.sample.json || (
  echo "ERROR: sample 미생성. step 4의 sync-notion이 mock 모드로 한번 실행되어야 함."
  exit 1
)

npm run gen:suggestions
test -f public/data/suggestions.json

node -e "
const d = JSON.parse(require('fs').readFileSync('public/data/suggestions.json'));
if (!d.suggestedQuestions || d.suggestedQuestions.length === 0) process.exit(1);
if (d.suggestedQuestions.length > 30) process.exit(1);
if ('chunks' in d) process.exit(1);
if (!d.profile) process.exit(1);
console.log('OK', d.suggestedQuestions.length, 'questions');
"

# 단위 테스트
npm run test
npx tsc --noEmit
npm run lint
SKIP_NOTION_SYNC=1 MOCK_LLM=1 npm run build  # prebuild 체인 통과 (sync는 SKIP, gen은 sample 사용)
```

## 검증 절차

1. AC 실행.
2. 체크리스트:
   - 출력에 chunks/embeddings 미포함?
   - 핵심 18 보존?
   - 30개 상한?
   - relatedQuestions 매핑?
   - prebuild 체인이 check:spec → sync:notion → gen:suggestions 순서?
3. `phases/1-content-pipeline/index.json` step 6 갱신 (이 task의 마지막 step).

## 금지사항

- **LLM 호출 금지.** 이유: ADR-009 빌드 결정성 + 비용. 휴리스틱만.
- **`public/data/suggestions.json`에 chunks/embedding 출력 금지.** 이유: 클라이언트 누출 + 번들 사이즈.
- **`public/data/suggestions.json`을 git 커밋 금지.** 이유: .gitignore 정책.
- **자동 추가 질문에 핵심 ID 범위(Q-001~Q-018) 사용 금지.** 이유: ID 충돌. Q-100 이상.
- **30개 초과 출력 금지.** 이유: UI 캐러셀 부담.
- **`Math.random()` 사용 금지.** 이유: 빌드 결정성.
- **PII (사용자 이메일, IP 등) 출력 금지.** 이유: 클라이언트 안전.
- **API 키 또는 시스템 프롬프트 텍스트 출력 금지.** 이유: 동일.
- **chunks 텍스트 raw 출력 금지.** 이유: client 누출.
- **prebuild 체인에 `|| true` 추가 금지.** 이유: 실패 silent 무시.
