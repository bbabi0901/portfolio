import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// 라우트는 corpus 로더(폴백=커밋 데이터, ADR-037)로 RAG 데이터를 읽는다. 로컬(실데이터)과
// CI(fixture 교체) 어디서 돌아도 retrieval 단언이 결정적이도록 sample 데이터로 고정.
vi.mock("@/lib/portfolio-data", async (importOriginal) => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const raw = fs.readFileSync(path.join(process.cwd(), "data", "portfolio.sample.json"), "utf8");
  const mod = await importOriginal<typeof import("@/lib/portfolio-data")>();
  return { ...mod, loadPortfolio: () => JSON.parse(raw) };
});

import { app } from "@/app/api/[[...route]]/route";
import { clearEnvCache } from "@/lib/env";
import { NO_RECORD_RESPONSE_KO, NO_RECORD_RESPONSE_EN } from "@/lib/prompts";
import { clearRateLimitMemory } from "@/lib/rate-limit";

const ENV_KEYS = ["MOCK_LLM", "ANTHROPIC_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"] as const;

const original: Record<string, string | undefined> = {};

function setMockEnv(): void {
  process.env.MOCK_LLM = "1";
  clearEnvCache();
}

beforeEach(() => {
  for (const k of ENV_KEYS) original[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  clearEnvCache();
  clearRateLimitMemory();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
  clearEnvCache();
});

async function postChat(body: unknown, asString?: string): Promise<Response> {
  return app.request("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof asString === "string" ? asString : JSON.stringify(body),
  });
}

describe("/api/chat", () => {
  describe("validation", () => {
    it("400: messages 배열이 비어 있음", async () => {
      setMockEnv();
      const res = await postChat({ messages: [] });
      expect(res.status).toBe(400);
    });

    it("400: messages 필드 누락", async () => {
      setMockEnv();
      const res = await postChat({});
      expect(res.status).toBe(400);
    });

    it("400: 메시지 content 길이 4001자 초과", async () => {
      setMockEnv();
      const longContent = "a".repeat(4001);
      const res = await postChat({
        messages: [{ role: "user", content: longContent }],
      });
      expect(res.status).toBe(400);
    });

    it("400: 잘못된 JSON body", async () => {
      setMockEnv();
      const res = await postChat(null, "{not json");
      expect(res.status).toBe(400);
    });

    it("400: 알 수 없는 role", async () => {
      setMockEnv();
      const res = await postChat({
        messages: [{ role: "system", content: "hi" }],
      });
      expect(res.status).toBe(400);
    });

    it("400: 마지막 user 메시지가 공백만", async () => {
      setMockEnv();
      const res = await postChat({
        messages: [
          { role: "user", content: "안녕" },
          { role: "assistant", content: "네" },
          { role: "user", content: "   " },
        ],
      });
      // content "   " has length 3 → passes zod min(1), but trim is empty.
      expect(res.status).toBe(400);
    });
  });

  describe("model resolution", () => {
    it("503: API 키 모두 부재 + MOCK_LLM 미설정", async () => {
      // env 비우기 (beforeEach 가 이미 모두 삭제했으므로 추가 작업 불필요)
      const res = await postChat({
        messages: [{ role: "user", content: "Module Federation" }],
      });
      expect(res.status).toBe(503);
    });

    it("정상: 모델 ID 미지정 → DEFAULT (nova-lite) 사용", async () => {
      setMockEnv();
      const res = await postChat({
        messages: [{ role: "user", content: "샘플 프로젝트" }],
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("X-Model-Id")).toBe("nova-lite");
      // 명시되지 않았으므로 substitution 헤더 없음
      expect(res.headers.get("X-Model-Substitution")).toBeNull();
    });

    it("정상: 화이트리스트 외 모델 ID → DEFAULT 강등 + X-Model-Substitution: true", async () => {
      setMockEnv();
      const res = await postChat({
        modelId: "gpt-not-real",
        messages: [{ role: "user", content: "샘플 프로젝트" }],
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("X-Model-Id")).toBe("nova-lite");
      expect(res.headers.get("X-Model-Substitution")).toBe("true");
    });

    it("정상: 알려진 모델 ID 그대로 사용 + substitution 헤더 없음", async () => {
      setMockEnv();
      process.env.ANTHROPIC_API_KEY = "sk-ant-test";
      clearEnvCache();
      const res = await postChat({
        modelId: "claude-haiku",
        messages: [{ role: "user", content: "샘플 프로젝트" }],
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("X-Model-Id")).toBe("claude-haiku");
      expect(res.headers.get("X-Model-Substitution")).toBeNull();
    });
  });

  describe("retrieval", () => {
    it("retriever 0건 (한국어) → NO_RECORD 응답, LLM 호출 X", async () => {
      setMockEnv();
      // 샘플 청크와 키워드/벡터 모두 매칭되지 않도록 골라낸 쿼리.
      const res = await postChat({
        messages: [{ role: "user", content: "qqq xxx yyy zzz 파파파" }],
      });
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toBe(NO_RECORD_RESPONSE_KO);
      // mock LLM 의 "[mock-llm]" 프리픽스가 포함되면 LLM 이 호출된 것
      expect(text).not.toContain("[mock-llm]");
    });

    it("retriever 0건 (영어) → 영문 NO_RECORD", async () => {
      setMockEnv();
      const res = await postChat({
        messages: [{ role: "user", content: "asdfqwer tottenham zzzqqq" }],
      });
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toBe(NO_RECORD_RESPONSE_EN);
    });

    it("X-Retrieval-Mode 헤더 포함 (hybrid in MOCK_LLM)", async () => {
      setMockEnv();
      const res = await postChat({
        messages: [{ role: "user", content: "샘플 프로젝트" }],
      });
      expect(res.status).toBe(200);
      const mode = res.headers.get("X-Retrieval-Mode");
      expect(mode === "hybrid" || mode === "keyword-only").toBe(true);
    });
  });

  describe("streaming response", () => {
    it("정상 응답: mock LLM 이 마지막 user 메시지를 echo", async () => {
      setMockEnv();
      const res = await postChat({
        messages: [{ role: "user", content: "샘플 프로젝트가 뭐예요?" }],
      });
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("[mock-llm]");
      expect(text).toContain("샘플 프로젝트가 뭐예요?");
    });

    it("X-Model-Id 헤더 포함", async () => {
      setMockEnv();
      const res = await postChat({
        messages: [{ role: "user", content: "샘플 프로젝트" }],
      });
      expect(res.headers.get("X-Model-Id")).toBe("nova-lite");
    });

    // TS-89: 스트림 개시 실패는 503으로 표면화 — NO_RECORD 위장 금지 (ERR-05, S0-error-surface)
    it("TS-89: 모델 스트림 개시 실패 → 503 no_models_available (가짜 NO_RECORD 200 금지)", async () => {
      setMockEnv();
      process.env.MOCK_LLM = "error"; // doStream 즉시 실패하는 mock (프로덕션 자격 증명 장애 재현)
      clearEnvCache();
      const res = await postChat({
        messages: [{ role: "user", content: "샘플 프로젝트가 뭐예요?" }],
      });
      expect(res.status).toBe(503);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("no_models_available");
    });
  });

  describe("output filter", () => {
    it("응답 본문에 외부 URL 포함 시 [link removed] 로 마스킹", async () => {
      setMockEnv();
      const res = await postChat({
        messages: [
          {
            role: "user",
            content: "샘플 프로젝트 https://evil.example.com 어떤가요",
          },
        ],
      });
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).not.toContain("evil.example.com");
      expect(text).toContain("[link removed]");
    });

    it("응답 본문에 컨텍스트 sourceUrl 은 보존", async () => {
      // mock 은 컨텍스트 sourceUrl 을 직접 출력하지 않으므로,
      // 사용자 메시지에 합법 URL 을 포함시켜 echo 가 보존하는지 확인.
      setMockEnv();
      const res = await postChat({
        messages: [
          {
            role: "user",
            content: "GitHub https://github.com/YoonsooKim9 profile",
          },
        ],
      });
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("https://github.com/YoonsooKim9");
    });
  });

  describe("HTTP method", () => {
    it("GET /api/chat 은 405 또는 404", async () => {
      setMockEnv();
      const res = await app.request("/api/chat", { method: "GET" });
      expect([404, 405]).toContain(res.status);
    });
  });

  describe("multi-turn", () => {
    it("200: user + assistant + user history 정상 처리 (응답 비어있지 않음)", async () => {
      setMockEnv();
      const res = await postChat({
        messages: [
          { role: "user", content: "안녕하세요" },
          { role: "assistant", content: "[mock-llm] 안녕하세요" },
          { role: "user", content: "더 알려줘요" },
        ],
      });
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text.trim().length).toBeGreaterThan(0);
    });

    it("400: history 에 content 빈 문자열 assistant 메시지 — API 레벨 거부", async () => {
      setMockEnv();
      const res = await postChat({
        messages: [
          { role: "user", content: "안녕" },
          { role: "assistant", content: "" },
          { role: "user", content: "두 번째 질문" },
        ],
      });
      expect(res.status).toBe(400);
    });

    it("200: 3-turn 연속 대화 — 매 응답 비어있지 않음", async () => {
      setMockEnv();
      const turn1 = await postChat({
        messages: [{ role: "user", content: "첫 번째" }],
      });
      expect(turn1.status).toBe(200);
      const t1Text = await turn1.text();
      expect(t1Text.trim().length).toBeGreaterThan(0);

      const turn2 = await postChat({
        messages: [
          { role: "user", content: "첫 번째" },
          { role: "assistant", content: t1Text },
          { role: "user", content: "두 번째" },
        ],
      });
      expect(turn2.status).toBe(200);
      const t2Text = await turn2.text();
      expect(t2Text.trim().length).toBeGreaterThan(0);

      const turn3 = await postChat({
        messages: [
          { role: "user", content: "첫 번째" },
          { role: "assistant", content: t1Text },
          { role: "user", content: "두 번째" },
          { role: "assistant", content: t2Text },
          { role: "user", content: "세 번째" },
        ],
      });
      expect(turn3.status).toBe(200);
      const t3Text = await turn3.text();
      expect(t3Text.trim().length).toBeGreaterThan(0);
    });
  });
});
