/**
 * 커리어 마크다운 파서 — 이력서(career) 청크 재구성 본문을 회사 단위 타임라인 엔트리로 파싱.
 * 서버(lib/experience-timeline)와 클라이언트(AboutSection CareerTimeline)가 공용.
 */
export interface CareerEntry {
  company: string;
  role: string;
  period: string;
  isActive: boolean;
  bulletGroups: string[][];
}

// Lines that are labels/metadata, not achievements
const SKIP_PREFIXES = ["포지션:", "기술:"];

export function parseBulletGroups(lines: string[]): string[][] {
  const groups: string[][] = [];
  let current: string[] = [];
  let currentFromHeading = false;

  const flush = () => {
    if (current.length > 0) {
      groups.push(current);
      current = [];
    }
    currentFromHeading = false;
  };

  for (const line of lines) {
    const trimmed = line.trim();

    const headingMatch = trimmed.match(/^#{2,4}\s+(.+)$/);
    if (headingMatch) {
      // `### 프로젝트명` 헤딩 → 새 그룹의 타이틀 (career 청크 재구성 시 headingPath 재합성분)
      flush();
      current.push(headingMatch[1]!.replace(/\*\*/g, "").trim());
      currentFromHeading = true;
      continue;
    }

    if (trimmed.startsWith("- ")) {
      const text = trimmed.slice(2).trim();
      if (SKIP_PREFIXES.some((p) => text.startsWith(p))) continue;
      // Stop when we hit tech-stack category lines (e.g. "코어 - TypeScript")
      if (/^[가-힣\w\s]+ - [A-Z]/.test(text) && current.length === 0) break;
      current.push(text);
    } else if (trimmed === "" || trimmed === "---") {
      // 헤딩 타이틀만 있는 그룹은 첫 불릿을 기다린다 (빈 줄로 끊지 않음)
      if (!(currentFromHeading && current.length === 1)) flush();
    } else if (trimmed.startsWith(">")) {
      break; // hit an education blockquote – stop
    }
  }

  flush();
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

export function parseCareerMarkdown(text: string): { intro: string; entries: CareerEntry[] } {
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
