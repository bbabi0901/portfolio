import { type ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

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
      <div className="flex flex-col gap-6">
        {subSections.map((sub, idx) => (
          <div key={`${sub.heading ?? "body"}-${idx}`} className="flex flex-col gap-2">
            {sub.heading ? (
              <h3 className="text-sm font-medium text-neutral-300">{sub.heading}</h3>
            ) : null}
            <div className="prose prose-invert prose-sm max-w-none text-neutral-300">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {sub.body}
              </ReactMarkdown>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
