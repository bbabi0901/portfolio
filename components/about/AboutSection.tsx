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
    if (/\d{4}/.test(raw)) { period = raw; break; }
  }

  // Skip separators
  while (i < lines.length && ((lines[i] ?? "").trim() === "" || (lines[i] ?? "").trim() === "---")) i++;

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
  while (introLines.length > 0 && (introLines[introLines.length - 1] ?? "").trim() === "") introLines.pop();

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
  blockquote({ children }: ComponentPropsWithoutRef<"blockquote">) {
    return (
      <div className="my-3 border-l-2 border-neutral-700 pl-3 not-italic text-neutral-300 [&>p]:my-0.5 [&>p]:leading-snug">
        {children}
      </div>
    );
  },
  hr() {
    return <hr className="my-5 border-neutral-800" />;
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
      <li className="text-neutral-300 leading-relaxed marker:text-neutral-600" {...props}>
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
          className="rounded border border-neutral-800 bg-neutral-900 px-1 py-0.5 font-mono text-[12px] text-neutral-200"
          {...props}
        >
          {children}
        </code>
      );
    }
    return <code className={codeClassName} {...props}>{children}</code>;
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

// ─── Career Timeline component ───────────────────────────────────────────────

function CareerTimeline({ intro, entries }: { intro: string; entries: CareerEntry[] }) {
  return (
    <div className="flex flex-col gap-8">
      {/* Intro prose (tags + paragraphs before first career entry) */}
      {intro && (
        <div className="prose prose-invert prose-sm max-w-none text-neutral-300">
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
            <div className="hidden sm:block w-[116px] shrink-0 text-right pr-5 pt-0.5 pb-8">
              <p className="text-[12px] font-medium text-neutral-200 leading-snug">{entry.company}</p>
              <p className="text-[11px] text-neutral-500 mt-0.5 leading-snug">{entry.role}</p>
              <p className="text-[11px] text-neutral-600 mt-2">{entry.period}</p>
            </div>

            {/* Dot + line column */}
            <div className="hidden sm:flex shrink-0 flex-col items-center">
              <div
                className={cn(
                  "mt-1.5 w-[7px] h-[7px] rounded-full shrink-0",
                  entry.isActive ? "bg-lime-300" : "bg-neutral-600",
                )}
              />
              {idx < entries.length - 1 && (
                <div className="mt-1.5 w-px flex-1 bg-neutral-800" />
              )}
            </div>

            {/* Content column */}
            <div className="flex-1 min-w-0 pl-5 pb-8">
              {/* Mobile header */}
              <div className="sm:hidden mb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-medium text-neutral-200 leading-snug">{entry.company}</p>
                    <p className="text-[11px] text-neutral-500 mt-0.5">{entry.role}</p>
                  </div>
                  <p className="text-[11px] text-neutral-600 shrink-0 mt-0.5">{entry.period}</p>
                </div>
              </div>

              {/* Bullet groups */}
              <div className="flex flex-col gap-4">
                {entry.bulletGroups.map((group, gIdx) => (
                  <ul key={gIdx} className="list-none pl-0 space-y-1.5 m-0">
                    {group.map((bullet, bIdx) => (
                      <li
                        key={bIdx}
                        className="flex gap-2 text-[13px] text-neutral-400 leading-relaxed"
                      >
                        <span className="mt-[6px] shrink-0 w-1 h-1 rounded-full bg-neutral-700" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

function isCareerSection(heading: string): boolean {
  return heading.includes("자기 소개") || heading.includes("About Me");
}

export function AboutSection({ heading, subSections, className }: AboutSectionProps) {
  return (
    <section className={cn("flex flex-col gap-5", className)}>
      <h2 className="text-[11px] font-medium tracking-widest text-neutral-500 uppercase">
        {heading}
      </h2>

      {isCareerSection(heading) ? (
        // Career sections: parse markdown into timeline
        <div className="flex flex-col gap-6">
          {subSections.map((sub, idx) => {
            const { intro, entries } = parseCareerMarkdown(sub.body);
            return (
              <div key={`${sub.heading ?? "body"}-${idx}`}>
                {sub.heading && (
                  <h3 className="text-sm font-medium text-neutral-300 mb-3">{sub.heading}</h3>
                )}
                {entries.length > 0 ? (
                  <CareerTimeline intro={intro} entries={entries} />
                ) : (
                  <div className="prose prose-invert prose-sm max-w-none text-neutral-300">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                      {sub.body}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        // Non-career sections: regular markdown
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
      )}
    </section>
  );
}
