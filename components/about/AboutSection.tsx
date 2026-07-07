import { type ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

// 빈 줄로 구분된 bullet 그룹 사이에 --- 삽입 (프로젝트 단위 구분)
// remark-gfm은 blank-separated bullets를 하나의 loose <ul>로 합치므로 전처리 필요
function injectProjectSeparators(body: string): string {
  return body.replace(/(^- [^\n]+)\n\n(?!---)(?=- )/gm, "$1\n\n---\n\n");
}

export interface AboutSubSectionData {
  heading?: string;
  body: string;
}

export interface AboutSectionProps {
  heading: string;
  subSections: AboutSubSectionData[];
  className?: string;
}

function ExternalLink({ href, children, ...rest }: ComponentPropsWithoutRef<"a">) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-neutral-200 underline decoration-neutral-600 underline-offset-2 hover:decoration-neutral-300"
      {...rest}
    >
      {children}
    </a>
  );
}

const markdownComponents = {
  a: ExternalLink,
  img: () => null,

  // 회사명·역할·날짜 등 노션 blockquote → 경력 헤더 스타일
  blockquote({ children }: ComponentPropsWithoutRef<"blockquote">) {
    return (
      <div className="my-3 border-l-2 border-neutral-600 pl-3 not-italic text-neutral-200 [&>p]:my-0.5 [&>p]:leading-snug">
        {children}
      </div>
    );
  },

  // 경력 항목 구분선 / 프로젝트 그룹 구분선
  hr() {
    return <hr className="my-5 border-neutral-800" />;
  },

  // 프로젝트 bullet 그룹 — 빈 줄로 분리된 각 <ul>이 하나의 프로젝트 묶음
  ul({ children, ...props }: ComponentPropsWithoutRef<"ul">) {
    return (
      <ul
        className="my-0 mb-5 list-disc space-y-1 pl-5 last:mb-0"
        {...props}
      >
        {children}
      </ul>
    );
  },

  li({ children, ...props }: ComponentPropsWithoutRef<"li">) {
    return (
      <li className="text-neutral-300 leading-relaxed marker:text-neutral-600" {...props}>
        {children}
      </li>
    );
  },

  // ol (요즘 빠져있는 거 등 번호 목록)
  ol({ children, ...props }: ComponentPropsWithoutRef<"ol">) {
    return (
      <ol className="my-0 mb-5 list-decimal space-y-1 pl-5 last:mb-0" {...props}>
        {children}
      </ol>
    );
  },

  code({ className: codeClassName, children, ...props }: ComponentPropsWithoutRef<"code">) {
    const isInline = !codeClassName;
    if (isInline) {
      return (
        <code
          className="rounded border border-neutral-800 bg-neutral-900 px-1 py-0.5 font-mono text-[12px] text-neutral-200"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code className={codeClassName} {...props}>
        {children}
      </code>
    );
  },

  pre({ children, ...props }: ComponentPropsWithoutRef<"pre">) {
    return (
      <pre
        className="overflow-x-auto rounded-md border border-neutral-800 bg-zinc-950 p-3 font-mono text-[12px] text-zinc-200"
        {...props}
      >
        {children}
      </pre>
    );
  },
};

export function AboutSection({ heading, subSections, className }: AboutSectionProps) {
  return (
    <section className={cn("flex flex-col gap-4", className)}>
      <h2 className="text-lg font-medium text-white">{heading}</h2>
      <div className="flex flex-col">
        {subSections.map((sub, idx) => (
          <div
            key={`${sub.heading ?? "body"}-${idx}`}
            className={cn("flex flex-col gap-2 py-4", idx > 0 && "border-t border-neutral-800/60")}
          >
            {sub.heading ? (
              <h3 className="text-sm font-medium text-neutral-300">{sub.heading}</h3>
            ) : null}
            <div className="prose prose-invert prose-sm max-w-none text-neutral-300">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {injectProjectSeparators(sub.body)}
              </ReactMarkdown>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
