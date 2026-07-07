#!/usr/bin/env tsx
/**
 * LLM 연동 smoke test — 실제 OpenRouter API를 호출해 multi-turn 동작 검증.
 *
 * 용도:
 *   - @ai-sdk/* 버전 업그레이드 후
 *   - lib/models.ts LLM 호출 방식 변경 후
 *   - 배포 전 최종 검증
 *
 * 실행: npm run test:smoke
 * 필요: .env.local 에 OPENROUTER_API_KEY 설정
 */

import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { readFileSync } from "fs";
import { resolve } from "path";

// .env.local 직접 파싱 (dotenv 의존성 없음)
try {
  const envFile = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
  for (const line of envFile.split("\n")) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    const key = m?.[1];
    const val = m?.[2];
    if (key && val !== undefined && !process.env[key]) {
      process.env[key] = val.replace(/^["']|["']$/g, "");
    }
  }
} catch {
  // .env.local 없으면 환경변수 직접 주입 가정
}

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
  console.error("❌ OPENROUTER_API_KEY 가 설정되지 않았습니다. .env.local 을 확인하세요.");
  process.exit(1);
}

const or = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: OPENROUTER_API_KEY,
  headers: {
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": "Yoonsoo Kim Portfolio (smoke test)",
  },
});

// or.chat() 이 아닌 or() 를 쓰면 Responses API 로 실패한다 — 이 테스트로 감지
const model = or.chat("openai/gpt-4o-mini");

async function readStream(stream: AsyncIterable<string>): Promise<string> {
  let text = "";
  for await (const chunk of stream) {
    text += chunk;
  }
  return text;
}

async function runSmoke() {
  let passed = 0;
  let failed = 0;

  // 테스트 1: 단일 turn
  process.stdout.write("  Turn 1 (single)... ");
  try {
    const r1 = streamText({
      model,
      messages: [{ role: "user", content: "Say 'hello' in one word." }],
      maxOutputTokens: 20,
    });
    const t1 = await readStream(r1.textStream);
    if (t1.trim().length > 0) {
      console.log(`✓ (${t1.trim().slice(0, 30)})`);
      passed++;
    } else {
      console.log("✗ 빈 응답");
      failed++;
    }
  } catch (e) {
    console.log(`✗ 에러: ${e instanceof Error ? e.message : String(e)}`);
    failed++;
  }

  // 테스트 2: multi-turn (Turn 2 는 항상 실패했던 케이스)
  process.stdout.write("  Turn 2 (multi)... ");
  try {
    const r2 = streamText({
      model,
      messages: [
        { role: "user", content: "Say 'hello' in one word." },
        { role: "assistant", content: "Hello." },
        { role: "user", content: "Now say 'bye' in one word." },
      ],
      maxOutputTokens: 20,
    });
    const t2 = await readStream(r2.textStream);
    if (t2.trim().length > 0) {
      console.log(`✓ (${t2.trim().slice(0, 30)})`);
      passed++;
    } else {
      console.log("✗ 빈 응답 — multi-turn 버그 재발!");
      failed++;
    }
  } catch (e) {
    console.log(`✗ 에러: ${e instanceof Error ? e.message : String(e)}`);
    failed++;
  }

  // 테스트 3: 3-turn
  process.stdout.write("  Turn 3 (3-turn)... ");
  try {
    const r3 = streamText({
      model,
      messages: [
        { role: "user", content: "Say 'one'." },
        { role: "assistant", content: "One." },
        { role: "user", content: "Say 'two'." },
        { role: "assistant", content: "Two." },
        { role: "user", content: "Say 'three'." },
      ],
      maxOutputTokens: 20,
    });
    const t3 = await readStream(r3.textStream);
    if (t3.trim().length > 0) {
      console.log(`✓ (${t3.trim().slice(0, 30)})`);
      passed++;
    } else {
      console.log("✗ 빈 응답");
      failed++;
    }
  } catch (e) {
    console.log(`✗ 에러: ${e instanceof Error ? e.message : String(e)}`);
    failed++;
  }

  console.log(`\n결과: ${passed}/${passed + failed} 통과`);
  if (failed > 0) {
    console.error("❌ smoke test 실패 — 배포 전 원인 파악 필요");
    process.exit(1);
  } else {
    console.log("✅ 모든 smoke test 통과");
  }
}

console.log("LLM smoke test (실제 OpenRouter API 호출)\n");
runSmoke().catch((e) => {
  console.error("smoke test 실행 실패:", e);
  process.exit(1);
});
