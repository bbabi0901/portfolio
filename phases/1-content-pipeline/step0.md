# Step 0: types-tokenize-embeddings

## 읽어야 할 파일

- `/CLAUDE.md` — `types/`, `lib/` 위치 규칙. 시간은 KST.
- `/docs/ARCHITECTURE.md` — 디렉토리 구조 + `lib/tokenize.ts`, `lib/embeddings.ts` 역할
- `/docs/NOTION_SCHEMA.md` — `portfolio.server.json` 출력 schema (chunk 구조), 청킹 규칙
- `/docs/AI_CONTRACT.md` — retriever 입력/출력 형식
- `/spec.json` — `models[]`, retrieval 가중치 (있다면)
- `/lib/spec-schema.ts` — 이전 task에서 정의된 spec 타입

이전 task(`0-scaffold`) 산출물:

- `/lib/spec-schema.ts`, `/lib/spec-loader.ts`, `/lib/utils.ts`
- `/tsconfig.json` paths `@/*`
- `/vitest.config.ts`, `/tests/setup.ts`, `/tests/msw/handlers.ts`
- `/package.json` scripts (`test`, `lint`, `build`)

위 파일들을 읽고 type/utility 시그니처가 후속 step과 일관되도록 한다. 특히 `tests/msw/handlers.ts`의 빈 배열을 다음 step부터 채우게 되므로 export 형태 확인.

## 작업

순수 utility 4개를 만든다. 외부 API/Notion/네트워크 의존 없음. 전부 deterministic + 단위 테스트로 검증.

### 생성할 파일

#### 1. `types/portfolio.ts`

```ts
// portfolio.server.json의 chunk + 메타데이터 타입.
// NOTION_SCHEMA.md의 출력 schema와 100% 일치해야 함.

export type ChunkCategory =
  | "intro"        // 자기소개 / 한 줄 요약
  | "career"       // 이력서 회사·기간
  | "project"      // 프로젝트 DB 항목
  | "skill"        // 기술 스킬
  | "subpage"      // 재사용 패턴, 트러블슈팅
  | "personal";    // 취미, MBTI, 성격

export interface PortfolioChunk {
  id: string;                      // 안정적 hash (sourcePageId + headingPath)
  sourcePageId: string;
  sourceTitle: string;
  sourceUrl: string;               // 노션 공개 URL (비공개면 빈 문자열)
  category: ChunkCategory;
  headingPath: string[];           // ["프로젝트", "MFE 마이그레이션", "Module Federation"]
  text: string;                    // 청크 본문 (마크다운)
  tokens: number;                  // 추정 토큰 수
  embedding: number[];             // 1536차원 (text-embedding-3-small)
  tags?: string[];                 // 키워드 매칭 가속용 ("MFE", "Next.js", "Turbopack")
}

export interface SuggestedQuestionMeta {
  id: string;                      // Q-001
  category: string;
  text: string;
  expectedSourceTitles: string[];
}

export interface PortfolioProfile {
  name: string;
  oneLiner: string;                // "프론트엔드 + 스마트컨트랙트 개발자, ..."
  contact: { email: string; github?: string; linkedin?: string };
  socials?: Record<string, string>;
}

export interface PortfolioServerData {
  version: string;
  generatedAt: string;             // ISO with KST offset
  chunks: PortfolioChunk[];
  suggestedQuestions: SuggestedQuestionMeta[];
  profile: PortfolioProfile;
}

// 클라이언트 안전 슬림 (suggestions.json) — embedding 제외
export interface PortfolioClientData {
  version: string;
  generatedAt: string;
  suggestedQuestions: SuggestedQuestionMeta[];
  profile: PortfolioProfile;
  relatedQuestions?: Record<string, string[]>;  // chunkId -> [Q-id]
}
```

#### 2. `types/notion.ts`

```ts
// notion-to-md, @notionhq/client 응답을 우리 도메인으로 매핑하기 위한 협소한 타입.
// 노션 SDK 타입을 직접 노출하지 않는다 (라이브러리 락-인 회피).

export interface NotionPageRef {
  id: string;
  title: string;
  url: string;
  isPublic: boolean;       // 노션 공개 페이지면 true
  category: string;        // 프로젝트 DB 카테고리 ("자체프로젝트", "업무", "외부활동", "개인")
  tags?: string[];
  status?: string;         // "Done", "In progress", ...
  period?: string;         // "2025.11–12"
}

export interface NotionPageContent {
  ref: NotionPageRef;
  markdown: string;        // notion-to-md 결과 (front-matter 제거 후)
}
```

#### 3. `lib/tokenize.ts`

한글/영문 mix 토크나이저 + 단순 토큰 카운터.

```ts
/**
 * 한글 자모 + 영문 + 숫자만 남기고 단어 단위로 분리. 소문자 정규화.
 * 한글은 음절 단위 보존, 2글자 이상 자른다 ("의", "을" 등 단일 조사 제외).
 * 영문은 3글자 이상 보존.
 */
export function tokenize(text: string): string[];

/**
 * GPT-4 호환 추정 토큰 수. 정확도보다 일관성 우선.
 * 영어: 4 chars/token, 한국어: 1.5 chars/token 가중평균.
 * 정밀이 필요하면 후속 task에서 tiktoken으로 교체.
 */
export function estimateTokens(text: string): number;

/**
 * 텍스트에서 키워드 추출 (chunk.tags 후보).
 * 영문 PascalCase / camelCase / 숫자 포함 단어 / 한글 명사 후보.
 * 빈도 기반 top-N (기본 5).
 */
export function extractKeywords(text: string, topN?: number): string[];
```

핵심 규칙:
- 모든 출력은 deterministic. 같은 입력 → 같은 출력.
- 외부 라이브러리 의존 금지 (이 step에서). `tiktoken`/한국어 형태소 분석기 추가 금지 — 단순 정규식만.
- 빈 입력 → 빈 배열/0.

#### 4. `lib/embeddings.ts`

벡터 연산 유틸 + fixture 임베딩 생성기.

```ts
/**
 * 코사인 유사도. 차원 불일치 시 throw.
 * 0 벡터 시 0 반환 (NaN 방지).
 */
export function cosineSimilarity(a: number[], b: number[]): number;

/**
 * L2 정규화. 0 벡터 그대로 반환.
 */
export function normalize(v: number[]): number[];

/**
 * MOCK_LLM=1 환경에서 사용하는 deterministic embedding.
 * 입력 텍스트의 단순 hash → 1536차원 단위 벡터.
 * 품질은 무관 (테스트 결정성 + 0 cost).
 */
export function fixtureEmbedding(text: string, dimensions?: number): number[];

/**
 * 점수 머지: keywordScore ∈ [0,1], vectorScore ∈ [-1,1] → 정규화 + 가중평균.
 * weight 기본: keyword 0.4, vector 0.6.
 */
export function mergeScores(
  keyword: number,
  vector: number,
  weights?: { keyword: number; vector: number }
): number;
```

핵심 규칙:
- `fixtureEmbedding`은 deterministic이어야 함 (테스트 결정성). 단순 string hash → seed → pseudo-random sequence → 정규화.
- 차원은 1536이 기본 (text-embedding-3-small과 일치).
- `Math.random()` 사용 금지 (deterministic 깨짐).

### 5. 테스트 파일 (TDD: 먼저 작성 → 통과 시키기)

#### `specs/tokenize.spec.ts`

```ts
import { describe, it, expect } from "vitest";
import { tokenize, estimateTokens, extractKeywords } from "@/lib/tokenize";

describe("tokenize", () => {
  it("splits Korean syllables", () => {
    const t = tokenize("Module Federation 마이그레이션");
    expect(t).toContain("module");
    expect(t).toContain("federation");
    expect(t).toContain("마이그레이션");
  });

  it("normalizes case", () => {
    expect(tokenize("React.js")).toContain("react");
  });

  it("handles empty input", () => {
    expect(tokenize("")).toEqual([]);
  });

  it("filters single-char Korean particles", () => {
    expect(tokenize("을 를 는 의")).toEqual([]);
  });
});

describe("estimateTokens", () => {
  it("is deterministic", () => {
    expect(estimateTokens("Hello")).toBe(estimateTokens("Hello"));
  });

  it("scales with length", () => {
    expect(estimateTokens("a".repeat(400))).toBeGreaterThan(estimateTokens("a".repeat(100)));
  });

  it("returns 0 for empty", () => {
    expect(estimateTokens("")).toBe(0);
  });
});

describe("extractKeywords", () => {
  it("returns top-N", () => {
    const kw = extractKeywords(
      "Next.js Turbopack Turbopack Module Module Module Federation",
      3
    );
    expect(kw).toHaveLength(3);
    expect(kw[0].toLowerCase()).toBe("module");  // 빈도 1위
  });
});
```

#### `specs/embeddings.spec.ts`

```ts
import { describe, it, expect } from "vitest";
import {
  cosineSimilarity,
  normalize,
  fixtureEmbedding,
  mergeScores,
} from "@/lib/embeddings";

describe("cosineSimilarity", () => {
  it("returns 1 for identical", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  it("returns 0 for orthogonal", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns -1 for opposite", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it("returns 0 when either is zero vector", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it("throws on dimension mismatch", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow();
  });
});

describe("normalize", () => {
  it("preserves direction", () => {
    const n = normalize([3, 4]);
    expect(n[0]).toBeCloseTo(0.6);
    expect(n[1]).toBeCloseTo(0.8);
  });

  it("returns zero vector unchanged", () => {
    expect(normalize([0, 0])).toEqual([0, 0]);
  });
});

describe("fixtureEmbedding", () => {
  it("is deterministic", () => {
    const a = fixtureEmbedding("hello");
    const b = fixtureEmbedding("hello");
    expect(a).toEqual(b);
  });

  it("differs for different inputs", () => {
    const a = fixtureEmbedding("hello");
    const b = fixtureEmbedding("world");
    expect(cosineSimilarity(a, b)).not.toBeCloseTo(1);
  });

  it("returns unit vector of requested dim", () => {
    const v = fixtureEmbedding("test", 1536);
    expect(v).toHaveLength(1536);
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 3);
  });
});

describe("mergeScores", () => {
  it("uses default weights 0.4/0.6", () => {
    expect(mergeScores(1, 1)).toBeCloseTo(1);
    expect(mergeScores(0, 0)).toBeCloseTo(0);
  });

  it("normalizes vector score from [-1,1] to [0,1]", () => {
    // vector = -1 → 0, vector = 1 → 1
    expect(mergeScores(0, -1)).toBeCloseTo(0);
    expect(mergeScores(0, 1)).toBeCloseTo(0.6);
  });
});
```

### TDD 순서

1. `specs/tokenize.spec.ts`, `specs/embeddings.spec.ts` 먼저 작성 → `npm run test` 실패 확인.
2. `types/portfolio.ts`, `types/notion.ts` 작성.
3. `lib/tokenize.ts`, `lib/embeddings.ts` 작성 → 테스트 통과.
4. `npm run lint` + `npx tsc --noEmit` + `npm run build` 통과 확인.

### 핵심 규칙

- 모든 함수는 **pure function** (외부 상태 없음).
- 외부 라이브러리 추가 금지 (이 step). 기존 의존성만 사용.
- 타입 export는 `interface` 우선 (재선언 가능). `type` alias는 union/utility에만.
- `Math.random()`, `Date.now()`, 환경변수 참조 금지 (deterministic 깨짐).

## Acceptance Criteria

```bash
npm run test                                    # 신규 spec 모두 통과
npx tsc --noEmit                                # 0 exit
npm run lint                                    # 통과
npm run build                                   # 성공

test -f types/portfolio.ts
test -f types/notion.ts
test -f lib/tokenize.ts
test -f lib/embeddings.ts
test -f specs/tokenize.spec.ts
test -f specs/embeddings.spec.ts

# fixture embedding 차원 검증
node -e "const {fixtureEmbedding} = require('./lib/tokenize.ts'); /* via tsx */" 2>/dev/null || true
npx tsx -e "import('./lib/embeddings.ts').then(m => console.log(m.fixtureEmbedding('hello').length))" \
  | grep -q "1536"
```

## 검증 절차

1. AC 실행 (test, tsc, lint, build 모두 0 exit).
2. 체크리스트:
   - `types/portfolio.ts`의 `PortfolioChunk` 필드가 NOTION_SCHEMA.md의 출력 schema와 일치?
   - `lib/tokenize.ts` 4개 함수, `lib/embeddings.ts` 4개 함수 모두 export?
   - 한국어 입력 처리 정상 (빈 배열 아님)?
   - `fixtureEmbedding`이 deterministic + unit vector?
   - 모든 함수가 pure (외부 상태 없음)?
3. `phases/1-content-pipeline/index.json` step 0 갱신:
   - 성공 → `"completed"`, `"summary": "types/{portfolio,notion}.ts + lib/{tokenize,embeddings}.ts 4개 utility (tokenize/estimateTokens/extractKeywords + cosineSimilarity/normalize/fixtureEmbedding/mergeScores) + 2 spec 파일 작성, 모두 통과"`.
   - 실패 → `"error"` + `error_message`.

## 금지사항

- **외부 라이브러리 추가 금지** (`tiktoken`, `js-tokens`, `hangul-js` 등). 이유: 이 step은 dependency-free utility. 정밀 토크나이저는 후속 task로 미룸.
- **`Math.random()` 사용 금지.** 이유: deterministic 깨짐 → 테스트 flaky.
- **`Date.now()`, `new Date()` 사용 금지** (이 step의 utility). 이유: 동일.
- **`process.env` 참조 금지.** 이유: utility는 환경 비의존.
- **노션/OpenAI/외부 API 호출 코드 작성 금지.** 이유: 다음 step(2-notion-service, 3-embeddings-service).
- **chunking 로직 작성 금지.** 이유: 다음 step(1-chunking).
- **`portfolio.server.json` 읽기/쓰기 코드 작성 금지.** 이유: step 4-5 범위.
- **`any` 타입 사용 금지.** 이유: TypeScript strict.
- **`as any`, `// @ts-ignore`, `// @ts-expect-error` 사용 금지.** 이유: 동일.
- **Node-only 모듈 import 금지** (`fs`, `path`, `node:crypto` 등). 이유: 이 utility들은 Edge runtime에서도 사용 가능해야 함.
