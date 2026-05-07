# Step 2: output-filter

## 읽어야 할 파일

- `/CLAUDE.md` — 답변 후처리: 외부 URL 화이트리스트, 시스템 프롬프트 누출 방지.
- `/docs/ADR.md` — ADR-012 인젝션 방어 = system prompt + 후처리 마스킹 (이중 방어).
- `/docs/AI_CONTRACT.md` — 출력 통제 절: 화이트리스트 외 URL 마스킹, 시스템 프롬프트 시그니처 누출 검출.
- `/lib/prompts.ts` — 이전 step (step 1). NO_RECORD 표준 문구.
- `/types/portfolio.ts` — Chunk 타입 (sourceUrl 필드).

## 작업

`lib/output-filter.ts` — LLM 응답 후처리. URL 화이트리스트 검증 + 프롬프트 누출 검출 + 마스킹.

### TDD 순서

1. `specs/output-filter.spec.ts` 작성 (실패).
2. `lib/output-filter.ts` 구현 (통과).

### 생성할 파일

#### 1. `lib/output-filter.ts`

```ts
import type { Chunk } from "@/types/portfolio";

export interface FilterInput {
  text: string;
  allowedSourceUrls: string[];   // retriever 가 사용한 chunk 의 sourceUrl 목록
}

export interface FilterResult {
  text: string;                  // 마스킹 적용된 출력
  maskedUrlCount: number;        // 마스킹된 외부 URL 개수
  promptLeakDetected: boolean;   // system prompt 키워드 검출 여부
}

/**
 * 후처리 파이프라인:
 * 1. URL 화이트리스트 검사 — markdown 링크 [text](url) 또는 raw URL 패턴.
 *    - allowedSourceUrls 에 없는 URL → "[link removed]" 로 치환.
 *    - notion.so, www.notion.so 도메인 outlier 도 검증 (사용자 화이트리스트 외 노션 페이지).
 * 2. 시스템 프롬프트 누출 검출 — 다음 시그니처 키워드 포함 시:
 *    - "당신은 김윤수의 포트폴리오 비서" / "You are Yoonsoo Kim's portfolio assistant"
 *    - "===== 컨텍스트 =====" / "===== Context ====="
 *    - "이전 지시 무시" / "Ignore previous instructions"
 *    - 그 외 sentinel: "system prompt", "system role", "you are programmed to"
 *    검출 시 해당 줄 마스킹: "[redacted]" 로 치환 + promptLeakDetected: true.
 * 3. 응답 길이 cap — 실제로는 cap 안 함 (LLM maxOutputTokens 로 이미 제한). 이 함수는 텍스트 변경 외 truncate 안 함.
 *
 * 결정성: 동일 input → 동일 output. 외부 의존성 없음.
 */
export function filterOutput(input: FilterInput): FilterResult;

/**
 * URL 추출 (markdown + raw). 테스트 가독성용.
 */
export function extractUrls(text: string): string[];

/**
 * URL 이 화이트리스트에 있는지. exact match (origin + path 까지).
 * Query string, fragment 는 무시.
 */
export function isAllowedUrl(url: string, allowed: string[]): boolean;

export const PROMPT_LEAK_PATTERNS: readonly RegExp[];
```

### URL 화이트리스트 정책

- **공개 도메인 안전 목록** (마스킹 면제, 항상 통과):
  - `https://github.com/YoonsooKim9/*`
  - `mailto:bbabi0901@gmail.com`
  - `https://www.linkedin.com/in/<handle>` (사용자 LinkedIn 핸들이 spec/CLAUDE.md 에 적혀있다면 여기에. 아니면 미적용)
  - 기타 외부 URL 은 모두 **차단 + 마스킹**.
- **Notion sourceUrl 은 chunk 단위 검증.** retriever 가 반환한 chunks 의 sourceUrl 만 통과.

```ts
const PUBLIC_ALLOWLIST = [
  /^https:\/\/github\.com\/YoonsooKim9(\/|$)/,
  /^mailto:bbabi0901@gmail\.com$/,
];
```

#### 2. `specs/output-filter.spec.ts` (TDD red)

```ts
import { describe, it, expect } from "vitest";
import { filterOutput, extractUrls, isAllowedUrl } from "@/lib/output-filter";

describe("extractUrls", () => {
  it("markdown link [text](url) 추출", () => { /* … */ });
  it("raw https:// URL 추출", () => { /* … */ });
  it("mailto: 추출", () => { /* … */ });
  it("코드블록 내 URL 도 추출 (보수적 마스킹)", () => { /* … */ });
});

describe("isAllowedUrl", () => {
  it("화이트리스트 정확 매칭 시 true", () => { /* … */ });
  it("query string/fragment 무시", () => { /* … */ });
  it("github.com/YoonsooKim9 prefix → true", () => { /* … */ });
  it("github.com/other-user → false", () => { /* … */ });
  it("mailto:bbabi0901@gmail.com → true", () => { /* … */ });
});

describe("filterOutput", () => {
  it("화이트리스트 외 URL 을 [link removed] 로 치환", () => { /* … */ });
  it("allowedSourceUrls 의 URL 은 보존", () => { /* … */ });
  it("system prompt 시그니처 누출 검출 + 줄 마스킹", () => {
    const text = "여기는 정상\n당신은 김윤수의 포트폴리오 비서입니다.\n다른 정상 문장";
    const r = filterOutput({ text, allowedSourceUrls: [] });
    expect(r.promptLeakDetected).toBe(true);
    expect(r.text).toContain("[redacted]");
    expect(r.text).not.toContain("포트폴리오 비서");
  });
  it("Ignore previous instructions 누출 → 마스킹", () => { /* … */ });
  it("===== 컨텍스트 ===== 누출 → 마스킹", () => { /* … */ });
  it("정상 응답 통과 (변경 없음, maskedUrlCount=0, leak=false)", () => { /* … */ });
  it("결정성: 동일 input → 동일 output", () => { /* … */ });
});
```

### 핵심 규칙 (위반 금지)

- **결정적 함수.** 같은 input → 같은 output. 시간/random/외부 호출 X.
- **URL 매칭은 origin + path 까지만.** query/fragment 무시 (그러나 절대 strip 후 비교).
- **마스킹은 line-level 기본**, URL 만 inline 치환.
- **PROMPT_LEAK_PATTERNS 는 readonly + frozen.** 런타임 mutation 금지.
- **mock LLM 테스트와 일관성 유지.** mock 응답에 `[mock-llm]` prefix 가 있으니 그것은 통과시켜야.

## Acceptance Criteria

```bash
npm run check:spec
npm run lint
npm run test -- specs/output-filter.spec.ts
npx tsc --noEmit
```

## 검증 절차

1. AC 실행.
2. 체크:
   - `lib/output-filter.ts`, `specs/output-filter.spec.ts` 존재.
   - 모든 spec 통과.
   - 결정성 테스트 통과 (동일 input 2회 → 동일 output).
   - `PROMPT_LEAK_PATTERNS` Object.isFrozen 검증 (선택).
3. `phases/2-chat-backend/index.json` step 2 갱신.

## 금지사항

- **외부 sanitization lib (DOMPurify, sanitize-html 등) 추가 금지.** 이유: Edge runtime + 번들 사이즈. 정규식 + string 조작으로 충분.
- **HTML escape 추가 금지.** 이유: react-markdown 이 클라이언트에서 처리.
- **사용자 입력 마스킹 금지** (이 모듈은 LLM **출력** 만 처리).
- **시스템 프롬프트 본문을 import 해서 비교 금지.** 이유: 그러면 prompts.ts 변경 시 false negative. 시그니처 키워드만 매칭.
- **마스킹 후 "ㅋㅋㅋ" 같은 user-friendly 코멘트 추가 금지.** 이유: 응답 신뢰도 저하.
