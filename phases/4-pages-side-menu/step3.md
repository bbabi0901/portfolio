# Step 3: contact-form-ui

## 읽어야 할 파일

- `/CLAUDE.md` — react-hook-form + zod resolver, /api/contact 은 Node runtime (이 step 은 UI 만).
- `/docs/PAGES.md` — `/contact` 와이어프레임 (폼 + 직접 연락 카드).
- `/spec.json` — `pages[]` 의 `/contact`, `forms[]` (이름 1-40, 이메일 RFC, 메시지 10-2000), `features[]` FEAT-026 (Contact 페이지/폼) + FEAT-027 (봇 보호).
- `/components/ui/form.tsx`, `input.tsx`, `textarea.tsx`, `label.tsx` — shadcn.

## 작업

`/contact` 페이지. ContactForm (rhf+zod) + DirectContactCard. honeypot + 1.5초 임계 + beforeunload 경고. 백엔드 호출은 placeholder mock (실제 `/api/contact` 은 후속 task `5-feedback-contact-api`).

### TDD 순서

1. `specs/components/contact-form.spec.tsx` 작성 (실패).
2. 컴포넌트 구현 (통과).

### 생성할 파일

#### 1. `lib/contact-schema.ts` (zod)

```ts
import { z } from "zod";

export const ContactSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력해 주세요").max(40, "이름은 40자 이하"),
  email: z.string().trim().email("올바른 이메일 형식이 아니에요"),
  message: z.string().trim()
    .min(10, "메시지는 10자 이상")
    .max(2000, "메시지는 2000자 이하"),
  // honeypot — 보이지 않는 필드. 봇이 채우면 기각.
  website: z.string().max(0, "비워두세요").optional().or(z.literal("")),
});
export type ContactInput = z.infer<typeof ContactSchema>;
```

- zod 메시지는 한국어 (UI 그대로 표시).

#### 2. `components/contact/ContactForm.tsx`

```tsx
"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ContactSchema, type ContactInput } from "@/lib/contact-schema";

export interface ContactFormProps {
  /** 부모/페이지가 실제 호출 처리. 이 step 에서는 mock fetch 또는 setTimeout. */
  onSubmit: (data: ContactInput) => Promise<{ ok: true } | { ok: false; reason: string }>;
  className?: string;
}
export function ContactForm(props: ContactFormProps): JSX.Element;
```

#### 핵심 동작

```tsx
const form = useForm<ContactInput>({
  resolver: zodResolver(ContactSchema),
  defaultValues: { name: "", email: "", message: "", website: "" },
  mode: "onBlur",
});

const mountedAtRef = useRef<number>(Date.now());

async function submit(values: ContactInput) {
  // 봇 1차: honeypot
  if (values.website) {
    // 정상 200 응답 흉내 (봇 학습 방지) — 실제 저장 없이 false success.
    return;
  }
  // 봇 2차: mount 후 1.5초 미만 제출 → 임의 captcha 또는 거부.
  if (Date.now() - mountedAtRef.current < 1500) {
    setShowCaptcha(true);
    return;
  }
  const res = await props.onSubmit(values);
  if (res.ok) {
    form.reset();
    toast.success("메시지를 받았어요. 빠르게 회신할게요.");
  } else {
    toast.error(`전송 실패: ${res.reason}`);
  }
}

// beforeunload 경고: 폼 dirty + 제출 중 아니면 경고.
useEffect(() => {
  function handler(e: BeforeUnloadEvent) {
    if (form.formState.isDirty && !form.formState.isSubmitting && !form.formState.isSubmitSuccessful) {
      e.preventDefault();
      e.returnValue = "";
    }
  }
  window.addEventListener("beforeunload", handler);
  return () => window.removeEventListener("beforeunload", handler);
}, [form.formState.isDirty, form.formState.isSubmitting, form.formState.isSubmitSuccessful]);
```

#### 폼 레이아웃

```tsx
<form onSubmit={form.handleSubmit(submit)} className={cn("flex flex-col gap-4", className)}>
  {/* 이름 */}
  <FormField label="이름" autoComplete="name" {...form.register("name")} />

  {/* 이메일 */}
  <FormField type="email" label="이메일" autoComplete="email" {...form.register("email")} />

  {/* 메시지 */}
  <FormField as="textarea" label="메시지" {...form.register("message")} maxLength={2000} />

  {/* honeypot */}
  <input type="text" tabIndex={-1} aria-hidden
         className="absolute -left-[9999px] h-0 w-0 opacity-0"
         autoComplete="off"
         {...form.register("website")} />

  <Button type="submit" disabled={form.formState.isSubmitting} aria-busy={form.formState.isSubmitting}>
    {form.formState.isSubmitting ? <Spinner /> : "전송"}
  </Button>
</form>
```

- `FormField` 는 shadcn `form.tsx` 의 `<FormField>` + `<FormItem>` + `<FormLabel>` + `<FormControl>` + `<FormMessage>` 조합 또는 자체 단순 wrapper.
- 인라인 에러 메시지 (FormMessage).
- `autoComplete` attribute 적절히.

#### 3. `components/contact/DirectContactCard.tsx`

```tsx
import Link from "next/link";

export interface DirectContactCardProps {
  email: string;
  github?: string;
  linkedin?: string;
  className?: string;
}
export function DirectContactCard(props: DirectContactCardProps): JSX.Element;
```

- 단순 카드. mailto: + GitHub/LinkedIn link.
- target=_blank rel=noopener noreferrer (외부 링크).

#### 4. `app/contact/page.tsx`

```tsx
"use client";   // ContactForm 이 client 라 page 도 client. 또는 page 는 server + ContactForm 만 client (선호).

import { ContactForm } from "@/components/contact/ContactForm";
import { DirectContactCard } from "@/components/contact/DirectContactCard";

// metadata 는 server 측에서만 export 가능. page 를 client 로 두면 별도 layout.tsx 또는 server-component split.
// 추천: app/contact/page.tsx 는 server, ContactClient 안에 폼.

export default function ContactPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 md:px-6 lg:px-8 py-12 space-y-8">
      <h1 className="text-2xl font-medium">연락하기</h1>
      <DirectContactCard email="bbabi0901@gmail.com" github="https://github.com/YoonsooKim9" />
      <ContactForm onSubmit={mockSubmit} />
    </main>
  );
}

async function mockSubmit(data) {
  // 실제 백엔드는 후속 task `5-feedback-contact-api`. 이 step 은 흐름만 검증.
  await new Promise((r) => setTimeout(r, 600));
  return { ok: true };
}
```

- 별도 server `page.tsx` + client `ContactClient.tsx` 분리도 OK. metadata export 위해 분리 권장.

```tsx
// app/contact/page.tsx (server)
import type { Metadata } from "next";
import { ContactClient } from "@/components/contact/ContactClient";

export const metadata: Metadata = {
  title: "연락하기",
  description: "김윤수에게 메시지를 남겨주세요.",
};

export default function ContactPage() {
  return <ContactClient email="bbabi0901@gmail.com" github="https://github.com/YoonsooKim9" />;
}
```

```tsx
// components/contact/ContactClient.tsx
"use client";
import { ContactForm } from "./ContactForm";
import { DirectContactCard } from "./DirectContactCard";

export interface ContactClientProps { email: string; github?: string; linkedin?: string }
export function ContactClient({ email, github, linkedin }: ContactClientProps): JSX.Element;
```

### Specs (TDD red)

```tsx
// specs/components/contact-form.spec.tsx
describe("ContactSchema", () => {
  it("이름 빈 문자열 → 실패", () => { /* … */ });
  it("이름 41자 → 실패", () => { /* … */ });
  it("한국어 이름 + 공백 통과", () => { /* '김 윤수' */ });
  it("이메일 'abc' → 실패", () => { /* … */ });
  it("이메일 + alias me+a@gmail.com → 통과", () => { /* … */ });
  it("메시지 9자 → 실패", () => { /* … */ });
  it("메시지 2001자 → 실패", () => { /* … */ });
  it("honeypot 'website' 채워짐 → 실패", () => { /* … */ });
});

describe("ContactForm", () => {
  it("빈 폼 제출 → 인라인 에러", async () => { /* … */ });
  it("정상 제출 → onSubmit 호출 + 폼 reset", async () => { /* … */ });
  it("honeypot 채워짐 → onSubmit 미호출 (silent 200)", async () => { /* … */ });
  it("mount 후 1.5초 미만 제출 → captcha 노출 (또는 차단)", async () => {
    vi.useFakeTimers();
    /* … */
  });
  it("dirty 상태에서 beforeunload → preventDefault", async () => { /* … */ });
  it("제출 중 button disabled + aria-busy", async () => { /* … */ });
  it("autoComplete attribute 정상", () => { /* … */ });
});

describe("DirectContactCard", () => {
  it("email mailto: link", () => { /* … */ });
  it("github 외부 link target=_blank", () => { /* … */ });
});
```

### 핵심 규칙 (위반 금지)

- **honeypot 필드 절대 화면에 보이지 않게.** opacity-0 + position absolute + tabIndex=-1 + aria-hidden + autoComplete=off.
- **honeypot 채워졌을 때 정상 200 응답 흉내**. 봇 학습 방지.
- **email 검증은 zod `.email()` 만**. 추가 typo 검사 (gmial→gmail) 금지 — false positive.
- **mock onSubmit 외 실제 fetch 추가 금지.** 이유: 백엔드는 후속 task.
- **beforeunload 는 isDirty 일 때만**. 제출 직후 reset 후에도 트리거되면 UX 나쁨.
- **폼 reset 은 server 응답 ok 후에만.** error 시 입력 보존.

## Acceptance Criteria

```bash
npm install @hookform/resolvers   # 이미 shadcn 설치됐을 수도. 부재 시 추가.
npm run check:spec
npm run lint
npm run test
npx tsc --noEmit
SKIP_NOTION_SYNC=1 MOCK_LLM=1 MOCK_NOTION=1 npm run build
```

## 검증 절차

1. AC 실행.
2. 체크:
   - `app/contact/page.tsx`, `components/contact/{ContactClient,ContactForm,DirectContactCard}.tsx`, `lib/contact-schema.ts`, spec 파일.
   - 모든 spec 통과.
   - honeypot 필드 DOM 에 존재하지만 화면에 안 보임 (CSS check).
3. `phases/4-pages-side-menu/index.json` step 3 갱신.

## 금지사항

- **`/api/contact` POST 호출 금지** (이 step). 이유: 백엔드 후속 task.
- **email confirm field (이메일 두 번 입력) 추가 금지.** 이유: spec 외.
- **CAPTCHA 라이브러리 (recaptcha 등) 추가 금지** (이 step). MVP P2.
- **외부 form lib (Formik, React Final Form) 추가 금지.** rhf 만.
- **저장된 입력 → localStorage 자동 복원 금지.** 이유: 사용자 의도 외.
- **이메일 도메인 typo hint 추가 금지.** false positive.
