import { Github, Linkedin, Mail } from "lucide-react";

import { cn } from "@/lib/utils";

export interface DirectContactCardProps {
  email: string;
  github?: string;
  linkedin?: string;
  className?: string;
}

export function DirectContactCard({
  email,
  github,
  linkedin,
  className,
}: DirectContactCardProps) {
  return (
    <section
      aria-label="직접 연락"
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-neutral-800 bg-[#141414] p-5",
        className,
      )}
    >
      <h2 className="text-sm font-medium text-neutral-300">직접 연락</h2>
      <ul className="flex flex-col gap-2 text-sm text-neutral-300">
        <li>
          <a
            href={`mailto:${email}`}
            className="inline-flex items-center gap-2 hover:text-white"
          >
            <Mail className="size-4" strokeWidth={1.5} aria-hidden="true" />
            <span>{email}</span>
          </a>
        </li>
        {github ? (
          <li>
            <a
              href={github}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 hover:text-white"
            >
              <Github className="size-4" strokeWidth={1.5} aria-hidden="true" />
              <span>GitHub</span>
            </a>
          </li>
        ) : null}
        {linkedin ? (
          <li>
            <a
              href={linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 hover:text-white"
            >
              <Linkedin className="size-4" strokeWidth={1.5} aria-hidden="true" />
              <span>LinkedIn</span>
            </a>
          </li>
        ) : null}
      </ul>
    </section>
  );
}
