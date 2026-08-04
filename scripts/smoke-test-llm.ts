#!/usr/bin/env tsx
/**
 * LLM 연동 smoke test — 실제 Amazon Bedrock API를 호출해 모델별 multi-turn 동작 검증. (ADR-034)
 *
 * 용도:
 *   - @ai-sdk/* 버전 업그레이드 후
 *   - lib/models.ts LLM 호출 방식 변경 후
 *   - Bedrock 모델 ID / inference profile 가용성 검증 (서울 리전)
 *   - 배포 전 최종 검증
 *
 * 실행: npm run test:smoke
 * 필요: .env.local 에 PORTFOLIO_AWS_PROFILE (로컬 AWS 프로필, aws login 결과)
 *       + Bedrock 콘솔(ap-northeast-2)에서 Nova Lite/Micro, Claude Haiku model access 활성화
 */

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

if (!process.env.PORTFOLIO_AWS_PROFILE && !process.env.PORTFOLIO_AWS_ROLE_ARN) {
  console.error(
    "❌ PORTFOLIO_AWS_PROFILE 이 설정되지 않았습니다. aws login 후 .env.local 에 프로필명을 추가하세요.",
  );
  process.exit(1);
}
if (process.env.MOCK_LLM === "1") {
  console.error("❌ MOCK_LLM=1 상태 — smoke test 는 실제 API 검증용입니다. 해제 후 실행하세요.");
  process.exit(1);
}

async function readStream(stream: AsyncIterable<string>): Promise<string> {
  let text = "";
  for await (const chunk of stream) {
    text += chunk;
  }
  return text;
}

async function runSmoke() {
  // lib/models.ts 의 실제 경로를 그대로 사용 — 레지스트리/자격 증명 체인까지 검증
  const { resolveModel, createModel, listAvailableModels } = await import("../lib/models");

  const available = listAvailableModels();
  console.log(`  사용 가능 모델: ${available.map((m) => m.id).join(", ")}\n`);

  let passed = 0;
  let failed = 0;

  for (const spec of available) {
    // 모델별 2-turn — inference profile ID 오류·리전 미지원을 여기서 감지
    process.stdout.write(`  ${spec.id} (2-turn)... `);
    try {
      const model = createModel(spec);
      const r = streamText({
        model,
        messages: [
          { role: "user", content: "Say 'hello' in one word." },
          { role: "assistant", content: "Hello." },
          { role: "user", content: "Now say 'bye' in one word." },
        ],
        maxOutputTokens: 20,
      });
      const t = await readStream(r.textStream);
      if (t.trim().length > 0) {
        console.log(`✓ (${t.trim().slice(0, 30)})`);
        passed++;
      } else {
        console.log("✗ 빈 응답");
        failed++;
      }
    } catch (e) {
      console.log(`✗ 에러: ${e instanceof Error ? e.message : String(e)}`);
      failed++;
    }
  }

  // 기본 모델 3-turn (스트리밍 파이프라인 회귀 검증)
  process.stdout.write("  default 3-turn... ");
  try {
    const model = createModel(resolveModel(null));
    const r = streamText({
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
    const t = await readStream(r.textStream);
    if (t.trim().length > 0) {
      console.log(`✓ (${t.trim().slice(0, 30)})`);
      passed++;
    } else {
      console.log("✗ 빈 응답 — multi-turn 버그 재발!");
      failed++;
    }
  } catch (e) {
    console.log(`✗ 에러: ${e instanceof Error ? e.message : String(e)}`);
    failed++;
  }

  console.log(`\n결과: ${passed}/${passed + failed} 통과`);
  if (failed > 0) {
    console.error(
      "❌ smoke test 실패 — 배포 전 원인 파악 필요 (model access / inference profile 확인)",
    );
    process.exit(1);
  } else {
    console.log("✅ 모든 smoke test 통과");
  }
}

console.log("LLM smoke test (실제 Amazon Bedrock API 호출, ADR-034)\n");
runSmoke().catch((e) => {
  console.error("smoke test 실행 실패:", e);
  process.exit(1);
});
