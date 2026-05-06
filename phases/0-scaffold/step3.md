# Step 3: hono-mount

## 읽어야 할 파일

- `/CLAUDE.md` — "/api/chat은 Edge runtime, /api/feedback·/api/contact은 Node runtime"
- `/docs/ARCHITECTURE.md` — 데이터 흐름, Edge runtime vs Node runtime 분리
- `/docs/ADR.md` — ADR-002 Hono on Route Handler, ADR-014 Edge/Node split

이전 step 산출물:

- `/package.json` — 의존성 목록
- `/app/layout.tsx` — root layout
- `/components/ui/*` — shadcn 컴포넌트 (이 step에선 사용 안 함)

이전 step의 `app/layout.tsx`와 `package.json`을 확인하라. 이 step에서 `hono`, `@hono/node-server` 같은 의존성을 추가한다.

## 작업

Next.js Route Handler 위에 Hono 앱을 마운트. **Edge용**과 **Node용** 두 개의 라우트 파일을 분리해서 만든다. 실제 비즈니스 로직(LLM, Notion)은 후속 task에서. 이 step은 health placeholder + 라우트 placeholder만.

### 라우트 분리 결정

- **Edge runtime**: `/api/*` (chat, health-edge)
- **Node runtime**: `/api/node/*` (feedback, contact, health-node)
- 클라이언트는 후속 task에서 services 레이어를 통해 분기 호출. 이 step은 서버 셸만.

### 생성할 파일

1. **`app/api/[[...route]]/route.ts`** (Edge runtime)
   ```ts
   import { Hono } from "hono";
   import { handle } from "hono/vercel";

   export const runtime = "edge";

   const app = new Hono().basePath("/api");

   app.get("/health", (c) =>
     c.json({ ok: true, runtime: "edge", ts: new Date().toISOString() })
   );

   // chat placeholder — 후속 task에서 streamText로 교체
   app.post("/chat", (c) =>
     c.json({ error: "not_implemented", message: "Chat route is not yet implemented." }, 501)
   );

   app.notFound((c) => c.json({ error: "not_found" }, 404));
   app.onError((err, c) => {
     console.error("[edge api error]", err);
     return c.json({ error: "internal_error", message: err.message }, 500);
   });

   export const GET = handle(app);
   export const POST = handle(app);
   export const PATCH = handle(app);
   export const DELETE = handle(app);
   ```

2. **`app/api/node/[[...route]]/route.ts`** (Node runtime)
   ```ts
   import { Hono } from "hono";
   import { handle } from "hono/vercel";

   export const runtime = "nodejs";

   const app = new Hono().basePath("/api/node");

   app.get("/health", (c) =>
     c.json({ ok: true, runtime: "node", ts: new Date().toISOString() })
   );

   // feedback placeholder
   app.post("/feedback", (c) =>
     c.json({ error: "not_implemented" }, 501)
   );

   // contact placeholder
   app.post("/contact", (c) =>
     c.json({ error: "not_implemented" }, 501)
   );

   app.notFound((c) => c.json({ error: "not_found" }, 404));
   app.onError((err, c) => {
     console.error("[node api error]", err);
     return c.json({ error: "internal_error", message: err.message }, 500);
   });

   export const GET = handle(app);
   export const POST = handle(app);
   export const PATCH = handle(app);
   export const DELETE = handle(app);
   ```

3. **의존성 추가** (`package.json`):
   - dependencies: `hono@^4.12`.
   - 별도 `@hono/node-server`는 불필요 (Vercel adapter 사용).

4. **`lib/api-error.ts`** (옵션, 후속 step에서 확장):
   - 이 step에서는 미생성. 다음 task부터 도입.

### 핵심 규칙 (위반 금지)

- **Edge 라우트에서 Node-only 모듈 import 금지** (`fs`, `path`, `crypto.randomUUID`는 OK이지만 `node:fs` 등은 금지).
- **API 키 관련 환경변수 직접 참조 금지** (`process.env.OPENAI_API_KEY`). 이 step은 셸만이라 무관하지만 후속 step에서 `lib/env.ts`를 통한다.
- **응답은 항상 JSON.** Hono의 `c.json()` 사용.
- **501 응답에 stack trace 노출 금지.** 단순 `{ error, message }` 형태.

## Acceptance Criteria

```bash
npm run build                                              # 성공
npm run dev &
sleep 5

# Edge runtime
curl -sS http://localhost:3000/api/health \
  | grep -q '"runtime":"edge"'

# Node runtime
curl -sS http://localhost:3000/api/node/health \
  | grep -q '"runtime":"node"'

# Placeholder 501 응답
curl -sS -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/chat \
  | grep -q "501"
curl -sS -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/node/feedback \
  | grep -q "501"
curl -sS -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/node/contact \
  | grep -q "501"

# 404
curl -sS -o /dev/null -w "%{http_code}" http://localhost:3000/api/unknown-path \
  | grep -q "404"

kill %1
npx tsc --noEmit
npm run lint
```

## 검증 절차

1. AC 실행 (자동 + 수동 dev 서버 검증).
2. 체크리스트:
   - `/api/health` 응답에 `"runtime":"edge"` 포함?
   - `/api/node/health` 응답에 `"runtime":"node"` 포함?
   - 501 placeholder 모두 정상 응답?
   - Edge runtime 라우트에 Node-only import 없음? (grep `import.*node:` 결과 0)
   - 다음 명령으로 import 검증: `grep -nE "from ['\"](node:|fs|path|child_process)['\"]" app/api/\\[\\[...route\\]\\]/route.ts | head -1` → 결과 없어야 함.
3. `phases/0-scaffold/index.json` step 3 갱신.

## 금지사항

- **같은 라우트 파일에서 Edge와 Node를 동시에 export 금지.** 이유: Next 16 runtime 충돌 + 둘 중 하나만 적용됨.
- **LLM SDK (`@ai-sdk/openai` 등) import 금지.** 이유: 다음 task(2-chat-backend)에서 다룬다.
- **Notion SDK (`@notionhq/client`) import 금지.** 이유: 다음 task(1-content-pipeline, 5-feedback-contact-api)에서 다룬다.
- **환경변수 `process.env.*` 직접 참조 금지.** 이유: 후속 task에서 `lib/env.ts`로 zod-wrap.
- **rate-limit 코드 작성 금지.** 이유: 후속 task(6-guards-seo)에서 다룬다.
- **`@hono/node-server`로 별도 서버 띄우기 금지.** 이유: Vercel adapter (`hono/vercel`)만 사용.
- **`crypto.subtle.*` 외 Node `crypto` 모듈 직접 import 금지** (Edge 라우트 한정). 이유: Edge 호환성.
