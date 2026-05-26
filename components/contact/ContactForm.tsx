"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ContactSchema, type ContactInput } from "@/lib/contact-schema";
import { cn } from "@/lib/utils";

const MIN_SUBMIT_DELAY_MS = 1500;

export type ContactSubmitResult = { ok: true } | { ok: false; reason: string };

export interface ContactFormProps {
  onSubmit: (data: ContactInput) => Promise<ContactSubmitResult>;
  className?: string;
}

export function ContactForm({ onSubmit, className }: ContactFormProps) {
  const form = useForm<ContactInput>({
    resolver: zodResolver(ContactSchema),
    defaultValues: { name: "", email: "", message: "", website: "" },
    mode: "onBlur",
  });

  const [mountedAt] = React.useState<number>(() => Date.now());
  const [showCaptcha, setShowCaptcha] = React.useState(false);

  // 렌더 단계에서 읽어 RHF formState 프록시가 변경을 구독하게 한다.
  const { isDirty, isSubmitting, isSubmitSuccessful } = form.formState;

  React.useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (isDirty && !isSubmitting && !isSubmitSuccessful) {
        e.preventDefault();
      }
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty, isSubmitting, isSubmitSuccessful]);

  const submit = React.useCallback(
    async (values: ContactInput) => {
      // 봇 1차: honeypot. 정상 200 흉내 — 봇 학습 방지를 위해 silent.
      if (values.website) {
        form.reset();
        return;
      }
      // 봇 2차: mount 후 1.5s 미만 → captcha 노출.
      if (Date.now() - mountedAt < MIN_SUBMIT_DELAY_MS) {
        setShowCaptcha(true);
        return;
      }

      const res = await onSubmit(values);
      if (res.ok) {
        form.reset();
        toast.success("메시지를 받았어요. 빠르게 회신할게요.");
      } else {
        toast.error(`전송 실패: ${res.reason}`);
      }
    },
    [form, onSubmit, mountedAt],
  );

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(submit)}
        className={cn("flex flex-col gap-5", className)}
        noValidate
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>이름</FormLabel>
              <FormControl>
                <Input type="text" autoComplete="name" maxLength={40} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>이메일</FormLabel>
              <FormControl>
                <Input type="email" inputMode="email" autoComplete="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="message"
          render={({ field }) => (
            <FormItem>
              <FormLabel>메시지</FormLabel>
              <FormControl>
                <Textarea
                  rows={6}
                  maxLength={2000}
                  placeholder="협업·채용 문의 내용을 자유롭게 적어 주세요. (10–2000자)"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* honeypot: 사람에게 안 보이는 필드. 봇이 채우면 silent 거부. */}
        <input
          type="text"
          tabIndex={-1}
          aria-hidden="true"
          autoComplete="off"
          className="pointer-events-none absolute left-[-9999px] h-0 w-0 opacity-0"
          {...form.register("website")}
        />

        {showCaptcha ? (
          <p role="alert" className="text-sm text-amber-300">
            잠시만요 — 봇이 아닌지 확인이 필요해요. 잠시 후 다시 전송해 주세요.
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" /> 전송 중
              </>
            ) : (
              "전송"
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
