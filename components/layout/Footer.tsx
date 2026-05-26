"use client";

import { Github, Info, Linkedin, Mail } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface FooterProps {
  lastUpdated?: string;
  socials?: { github?: string; linkedin?: string; email?: string };
  className?: string;
}

const PRIVACY_DETAIL =
  "이 사이트는 익명으로 메시지를 처리해요. 채팅 내용은 학습 데이터로 쓰이지 않으며 서버에 저장되지도 않습니다. 개인정보는 Contact 폼에서 제출한 경우에만 노션 DB에 보관됩니다.";

export function Footer({ lastUpdated, socials, className }: FooterProps) {
  return (
    <footer
      className={cn(
        "border-t border-neutral-900 bg-[#0a0a0a] text-[12px] text-neutral-500",
        className,
      )}
    >
      <div className="mx-auto flex max-w-3xl flex-col items-start gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6 lg:px-8">
        <p>
          마지막 업데이트: <time dateTime={lastUpdated ?? ""}>{lastUpdated ?? "—"}</time>
        </p>

        <div className="flex items-center gap-3">
          {socials?.github ? (
            <a
              href={socials.github}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
              className="rounded-md p-1 text-neutral-500 transition-colors hover:text-white"
            >
              <Github size={14} strokeWidth={1.5} aria-hidden="true" />
            </a>
          ) : null}
          {socials?.email ? (
            <a
              href={socials.email}
              aria-label="Email"
              className="rounded-md p-1 text-neutral-500 transition-colors hover:text-white"
            >
              <Mail size={14} strokeWidth={1.5} aria-hidden="true" />
            </a>
          ) : null}
          {socials?.linkedin ? (
            <a
              href={socials.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LinkedIn"
              className="rounded-md p-1 text-neutral-500 transition-colors hover:text-white"
            >
              <Linkedin size={14} strokeWidth={1.5} aria-hidden="true" />
            </a>
          ) : null}
        </div>

        <Popover>
          <PopoverTrigger
            type="button"
            aria-label="privacy"
            className="inline-flex items-center gap-1 rounded-md p-1 text-neutral-500 transition-colors hover:text-neutral-300 focus-visible:ring-1 focus-visible:ring-neutral-400 focus-visible:outline-none"
          >
            <Info size={12} strokeWidth={1.5} aria-hidden="true" />
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="max-w-xs border border-neutral-800 bg-[#141414] text-xs leading-relaxed text-neutral-300"
          >
            {PRIVACY_DETAIL}
          </PopoverContent>
        </Popover>
      </div>
    </footer>
  );
}
