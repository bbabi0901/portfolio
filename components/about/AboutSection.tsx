import { type ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

// ─── Career timeline types & parser ─────────────────────────────────────────

interface CareerEntry {
  company: string;
  role: string;
  period: string;
  isActive: boolean;
  bulletGroups: string[][];
}

// Lines that are labels/metadata, not achievements
const SKIP_PREFIXES = ["포지션:", "기술:"];

function parseBulletGroups(lines: string[]): string[][] {
  const groups: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("- ")) {
      const text = trimmed.slice(2).trim();
      if (SKIP_PREFIXES.some((p) => text.startsWith(p))) continue;
      // Stop when we hit tech-stack category lines (e.g. "코어 - TypeScript")
      if (/^[가-힣\w\s]+ - [A-Z]/.test(text) && current.length === 0) break;
      current.push(text);
    } else if (trimmed === "" || trimmed === "---") {
      if (current.length > 0) {
        groups.push(current);
        current = [];
      }
    } else if (trimmed.startsWith(">")) {
      break; // hit an education blockquote – stop
    }
  }

  if (current.length > 0) groups.push(current);
  return groups.filter((g) => g.length > 0);
}

function parseCareerEntry(lines: string[]): CareerEntry {
  let role = "";
  let company = "";
  let period = "";
  let i = 0;

  // First blockquote block → role + company
  const firstBlock: string[] = [];
  while (i < lines.length) {
    const currentLine = lines[i] ?? "";
    if (currentLine.startsWith(">")) {
      firstBlock.push(currentLine);
    } else if (currentLine.trim() === "" && firstBlock.length > 0) {
      i++;
      break;
    }
    i++;
  }

  for (const bl of firstBlock) {
    const raw = bl.replace(/^>\s*/, "").replace(/\*\*/g, "").replace(/\*/g, "").trim();
    if (/^\|/.test(raw)) {
      company = raw.replace(/^\|\s*/, "").trim();
    } else if (raw && !company) {
      role = raw;
    }
  }

  // Skip blanks, then second blockquote block → date
  while (i < lines.length && (lines[i] ?? "").trim() === "") i++;
  const dateBlock: string[] = [];
  while (i < lines.length && (lines[i] ?? "").startsWith(">")) {
    dateBlock.push(lines[i] ?? "");
    i++;
  }
  for (const dl of dateBlock) {
    const raw = dl.replace(/^>\s*/, "").replace(/\*\*/g, "").replace(/\*/g, "").trim();
    if (/\d{4}/.test(raw)) {
      period = raw;
      break;
    }
  }

  // Skip separators
  while (i < lines.length && ((lines[i] ?? "").trim() === "" || (lines[i] ?? "").trim() === "---"))
    i++;

  const bulletGroups = parseBulletGroups(lines.slice(i));

  return {
    role: role || "소프트웨어 엔지니어",
    company,
    period,
    isActive: period.includes("현재"),
    bulletGroups,
  };
}

function parseCareerMarkdown(text: string): { intro: string; entries: CareerEntry[] } {
  const lines = text.split("\n");
  const careerStarts: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    // A line like `> | Company` or `> **| Company**`
    if (/^> (?:\*\*)?\|/.test(lines[i] ?? "")) {
      let blockStart = i;
      while (blockStart > 0 && (lines[blockStart - 1] ?? "").startsWith(">")) blockStart--;
      const last = careerStarts[careerStarts.length - 1];
      if (last === undefined || last !== blockStart) careerStarts.push(blockStart);
    }
  }

  if (careerStarts.length === 0) return { intro: text, entries: [] };

  const firstStart = careerStarts[0] ?? 0;
  const introLines = lines.slice(0, firstStart);
  while (introLines.length > 0 && (introLines[introLines.length - 1] ?? "").trim() === "")
    introLines.pop();

  const entries: CareerEntry[] = careerStarts.map((start, e) => {
    const nextStart = careerStarts[e + 1];
    const end = nextStart !== undefined ? nextStart : lines.length;
    return parseCareerEntry(lines.slice(start, end));
  });

  return { intro: introLines.join("\n"), entries };
}

// ─── ReactMarkdown helpers (used by non-career sections) ────────────────────

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
      className="text-foreground decoration-subtle hover:decoration-body underline underline-offset-2"
      {...rest}
    >
      {children}
    </a>
  );
}

const markdownComponents = {
  a: ExternalLink,
  img: () => null,
  blockquote({ children }: ComponentPropsWithoutRef<"blockquote">) {
    return (
      <div className="border-line-strong text-body my-3 border-l-2 pl-3 not-italic [&>p]:my-0.5 [&>p]:leading-snug">
        {children}
      </div>
    );
  },
  hr() {
    return <hr className="border-line my-5" />;
  },
  ul({ children, ...props }: ComponentPropsWithoutRef<"ul">) {
    return (
      <ul className="my-0 mb-5 list-disc space-y-1 pl-5 last:mb-0" {...props}>
        {children}
      </ul>
    );
  },
  li({ children, ...props }: ComponentPropsWithoutRef<"li">) {
    return (
      <li className="text-body marker:text-faint leading-relaxed" {...props}>
        {children}
      </li>
    );
  },
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
          className="border-line bg-elevated text-foreground rounded border px-1 py-0.5 font-mono text-[12px]"
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
        className="border-line bg-elevated text-body overflow-x-auto rounded-md border p-3 font-mono text-[12px]"
        {...props}
      >
        {children}
      </pre>
    );
  },
};

// ─── Career Timeline component ───────────────────────────────────────────────

function CareerTimeline({ intro, entries }: { intro: string; entries: CareerEntry[] }) {
  return (
    <div className="flex flex-col gap-8">
      {/* Intro prose (tags + paragraphs before first career entry) */}
      {intro && (
        <div className="prose dark:prose-invert prose-sm text-body max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {intro}
          </ReactMarkdown>
        </div>
      )}

      {/* Timeline */}
      <div className="flex flex-col">
        {entries.map((entry, idx) => (
          <div key={`${entry.company}-${idx}`} className="flex">
            {/* Left column: company / role / period — hidden on mobile */}
            <div className="hidden w-[116px] shrink-0 pt-0.5 pr-5 pb-8 text-right sm:block">
              <p className="text-foreground text-[12px] leading-snug font-medium">
                {entry.company}
              </p>
              <p className="text-subtle mt-0.5 text-[11px] leading-snug">{entry.role}</p>
              <p className="text-faint mt-2 text-[11px]">{entry.period}</p>
            </div>

            {/* Dot + line column */}
            <div className="hidden shrink-0 flex-col items-center sm:flex">
              <div
                className={cn(
                  "mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full",
                  entry.isActive ? "bg-brand" : "bg-faint",
                )}
              />
              {idx < entries.length - 1 && <div className="bg-line mt-1.5 w-px flex-1" />}
            </div>

            {/* Content column */}
            <div className="min-w-0 flex-1 pb-8 pl-5">
              {/* Mobile header */}
              <div className="mb-3 sm:hidden">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-foreground text-[13px] leading-snug font-medium">
                      {entry.company}
                    </p>
                    <p className="text-subtle mt-0.5 text-[11px]">{entry.role}</p>
                  </div>
                  <p className="text-faint mt-0.5 shrink-0 text-[11px]">{entry.period}</p>
                </div>
              </div>

              {/* Bullet groups */}
              <div className="flex flex-col gap-4">
                {entry.bulletGroups.map((group, gIdx) => (
                  <div key={gIdx} className="flex flex-col gap-1">
                    {/* group[0]: project name (중분류) */}
                    {group[0] && (
                      <p className="text-body text-[12px] leading-snug font-medium">{group[0]}</p>
                    )}
                    {/* group[1+]: achievements (소분류) */}
                    {group.length > 1 && (
                      <ul className="border-line/60 m-0 ml-2 list-none space-y-1 border-l pl-3">
                        {group.slice(1).map((bullet, bIdx) => (
                          <li key={bIdx} className="text-subtle text-[11px] leading-relaxed">
                            {bullet}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Career timeline section (reusable, no h2 heading) ──────────────────────

export function CareerTimelineSection({
  subSections,
  className,
}: {
  subSections: AboutSubSectionData[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-6", className)}>
      {subSections.map((sub, idx) => {
        const { entries } = parseCareerMarkdown(sub.body);
        return (
          <div key={`${sub.heading ?? "body"}-${idx}`}>
            {sub.heading && <h3 className="text-body mb-3 text-sm font-medium">{sub.heading}</h3>}
            {entries.length > 0 ? (
              <CareerTimeline intro="" entries={entries} />
            ) : (
              <div className="prose dark:prose-invert prose-sm text-body max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {sub.body}
                </ReactMarkdown>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component (non-career sections) ───────────────────────────────────

export function AboutSection({ heading, subSections, className }: AboutSectionProps) {
  return (
    <section className={cn("flex flex-col gap-5", className)}>
      <h2 className="text-foreground text-[15px] font-medium">{heading}</h2>

      <div className="flex flex-col">
        {subSections.map((sub, idx) => (
          <div
            key={`${sub.heading ?? "body"}-${idx}`}
            className={cn("flex flex-col gap-2 py-4", idx > 0 && "border-line/60 border-t")}
          >
            {sub.heading ? <h3 className="text-body text-sm font-medium">{sub.heading}</h3> : null}
            <div className="prose dark:prose-invert prose-sm text-body max-w-none">
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
