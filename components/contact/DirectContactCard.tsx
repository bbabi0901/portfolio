import { Github, Linkedin, Mail } from "lucide-react";

import { cn } from "@/lib/utils";

export interface DirectContactCardProps {
  email: string;
  github?: string;
  linkedin?: string;
  className?: string;
}

export function DirectContactCard({ email, github, linkedin, className }: DirectContactCardProps) {
  return (
    <section
      aria-label="직접 연락"
      className={cn("border-line bg-surface flex flex-col gap-3 rounded-lg border p-5", className)}
    >
      <h2 className="text-body text-sm font-medium">직접 연락</h2>
      <ul className="text-body flex flex-col gap-2 text-sm">
        <li>
          <a
            href={`mailto:${email}`}
            className="hover:text-foreground inline-flex items-center gap-2"
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
              className="hover:text-foreground inline-flex items-center gap-2"
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
              className="hover:text-foreground inline-flex items-center gap-2"
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
