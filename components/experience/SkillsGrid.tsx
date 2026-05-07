import type { SkillsData } from "@/lib/experience-data";
import { cn } from "@/lib/utils";

export interface SkillsGridProps {
  skills: SkillsData;
  className?: string;
}

export function SkillsGrid({ skills, className }: SkillsGridProps) {
  const hasFrontend = skills.frontend.length > 0;
  const hasSmartContract = skills.smartContract.length > 0;
  if (!hasFrontend && !hasSmartContract) return null;

  return (
    <section className={cn("flex flex-col gap-4", className)} aria-label="Skills">
      <h2 className="text-lg font-medium text-white">Skills</h2>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {hasFrontend ? (
          <SkillColumn title="Frontend" skills={skills.frontend} />
        ) : null}
        {hasSmartContract ? (
          <SkillColumn title="Smart Contract" skills={skills.smartContract} />
        ) : null}
      </div>
    </section>
  );
}

function SkillColumn({ title, skills }: { title: string; skills: string[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-neutral-300">{title}</h3>
      <ul className="flex flex-wrap gap-1.5">
        {skills.map((s) => (
          <li
            key={s}
            className="rounded-md border border-neutral-800 px-2 py-0.5 text-xs text-neutral-400"
          >
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}
