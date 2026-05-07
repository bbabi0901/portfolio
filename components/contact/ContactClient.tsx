"use client";

import { ContactForm, type ContactSubmitResult } from "./ContactForm";
import { DirectContactCard } from "./DirectContactCard";

export interface ContactClientProps {
  email: string;
  github?: string;
  linkedin?: string;
}

// `/api/contact` 백엔드 통합은 후속 task `5-feedback-contact-api` 에서 처리.
async function mockSubmit(): Promise<ContactSubmitResult> {
  await new Promise((r) => setTimeout(r, 600));
  return { ok: true };
}

export function ContactClient({ email, github, linkedin }: ContactClientProps) {
  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-12 md:px-6 lg:px-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
          연락하기
        </h1>
        <p className="text-sm text-neutral-400">
          협업·채용 문의는 폼 또는 직접 메일로 보내주세요.
        </p>
      </header>

      <DirectContactCard email={email} github={github} linkedin={linkedin} />

      <ContactForm onSubmit={mockSubmit} />
    </main>
  );
}
