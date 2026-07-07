"use client";

import { useRef, useEffect } from "react";
import { toast } from "sonner";
import { ContactForm, type ContactSubmitResult } from "./ContactForm";
import { DirectContactCard } from "./DirectContactCard";
import type { ContactInput } from "@/lib/contact-schema";

export interface ContactClientProps {
  email: string;
  github?: string;
  linkedin?: string;
}

export function ContactClient({ email, github, linkedin }: ContactClientProps) {
  const mountedAt = useRef(0);
  useEffect(() => {
    mountedAt.current = Date.now();
  }, []);

  async function handleSubmit(data: ContactInput): Promise<ContactSubmitResult> {
    const elapsedMs = Date.now() - mountedAt.current;

    let res: Response;
    try {
      res = await fetch("/api/node/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, elapsedMs }),
      });
    } catch {
      toast.error("인터넷 연결을 확인해 주세요");
      return { ok: false, reason: "network" };
    }

    if (res.ok) {
      toast.success("메시지를 받았어요. 빠르게 회신할게요.");
      return { ok: true };
    }

    let json: { error?: string; mailto?: string } = {};
    try {
      json = (await res.json()) as { error?: string; mailto?: string };
    } catch {
      // ignore
    }

    if ((res.status === 503 || res.status === 502) && json.mailto) {
      toast.error("전송 실패. 직접 이메일로 연락해 주세요.", {
        description: json.mailto,
      });
      return { ok: false, reason: "network" };
    }

    if (res.status === 422) {
      toast.error("입력값을 확인해 주세요");
      return { ok: false, reason: "network" };
    }

    if (res.status === 429) {
      toast.error("잠시 후 다시 시도해 주세요");
      return { ok: false, reason: "network" };
    }

    toast.error("전송 실패. 잠시 후 다시 시도해 주세요");
    return { ok: false, reason: "server_error" };
  }

  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-12 md:px-6 lg:px-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-foreground text-2xl font-semibold tracking-tight md:text-3xl">
          연락하기
        </h1>
        <p className="text-muted text-sm">협업·채용 문의는 폼 또는 직접 메일로 보내주세요.</p>
      </header>

      <DirectContactCard email={email} github={github} linkedin={linkedin} />

      <ContactForm onSubmit={handleSubmit} />
    </main>
  );
}
