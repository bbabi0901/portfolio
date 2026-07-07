import "server-only";

import { loadPortfolio } from "./portfolio-data";

export interface ProfileSubSection {
  heading?: string;
  body: string;
}

export interface ProfileSection {
  heading: string;
  subSections: ProfileSubSection[];
  reading?: { minutes: number; words: number };
}

export interface ProfileContact {
  phone?: string;
  email?: string;
  notionUrl?: string;
}

export interface ProfileData {
  intro: string;
  contact: ProfileContact;
  sections: ProfileSection[];
  imageUrl: string | null;
  totalReadingMinutes: number;
}

const READING_WORDS_PER_MINUTE = 200;
const KOREAN_CHARS_PER_WORD = 2;

export function calculateReadingMinutes(body: string): {
  minutes: number;
  words: number;
} {
  if (!body || !body.trim()) return { minutes: 0, words: 0 };

  const stripped = body.replace(/[#*`>_~\[\]()|]/g, " ");

  const koreanChars = (stripped.match(/[\uAC00-\uD7AF]/g) ?? []).length;
  const englishWords = (stripped.match(/[A-Za-z][A-Za-z'-]*/g) ?? []).length;
  const numericWords = (stripped.match(/\b\d+\b/g) ?? []).length;

  const koreanWords = Math.ceil(koreanChars / KOREAN_CHARS_PER_WORD);
  const totalWords = koreanWords + englishWords + numericWords;
  if (totalWords === 0) return { minutes: 0, words: 0 };

  const minutes = Math.ceil(totalWords / READING_WORDS_PER_MINUTE);
  return { minutes, words: totalWords };
}

export function loadProfileData(): ProfileData | null {
  let data;
  try {
    data = loadPortfolio();
  } catch {
    return null;
  }

  const personalChunks = data.chunks.filter((c) => c.category === "personal");
  if (personalChunks.length === 0) return null;

  const careerChunks = data.chunks.filter((c) => c.category === "career");
  const intro = extractIntro(careerChunks, data.profile.oneLiner);

  const CONTACT_HEADINGS = ["이름", "연락처", "이메일"];

  const grouped = new Map<string, ProfileSection>();
  for (const chunk of personalChunks) {
    if (!hasReadableText(chunk.text)) continue;
    const headingPath = chunk.headingPath;
    const heading = headingPath[0] ?? "기타";
    if (CONTACT_HEADINGS.some((h) => heading.includes(h))) continue;
    const normalizedHeading =
      heading.includes("자기 소개") || heading.includes("About Me") ? "기술 이력" : heading;
    const subHeading = headingPath.slice(1).join(" → ") || undefined;

    let section = grouped.get(normalizedHeading);
    if (!section) {
      section = { heading: normalizedHeading, subSections: [] };
      grouped.set(normalizedHeading, section);
    }
    section.subSections.push({
      heading: subHeading,
      body: chunk.text,
    });
  }

  const contact = extractContact(personalChunks);

  const sections = Array.from(grouped.values());
  sections.sort((a, b) => {
    const aIsIntj = a.heading.includes("INTJ");
    const bIsIntj = b.heading.includes("INTJ");
    if (aIsIntj && !bIsIntj) return -1;
    if (!aIsIntj && bIsIntj) return 1;
    return 0;
  });

  let totalWords = 0;
  for (const section of sections) {
    const text = section.subSections.map((s) => s.body).join(" ");
    const reading = calculateReadingMinutes(text);
    section.reading = reading;
    totalWords += reading.words;
  }

  const totalReadingMinutes =
    totalWords === 0 ? 0 : Math.ceil(totalWords / READING_WORDS_PER_MINUTE);

  return {
    intro,
    contact,
    sections,
    imageUrl: null,
    totalReadingMinutes,
  };
}

function hasReadableText(body: string): boolean {
  const stripped = body
    .replace(/!\[.*?\]\(.*?\)/gs, "")
    .replace(/\[.*?\]\(.*?\)/gs, "")
    .replace(/^-{3,}$/gm, "")
    .replace(/[#*`>_~|]/g, " ")
    .trim();
  return stripped.length > 0;
}

function extractContact(
  chunks: ReturnType<typeof loadPortfolio>["chunks"],
): ProfileContact {
  const contactChunk = chunks.find((c) => c.headingPath[0]?.includes("이름"));
  if (!contactChunk) return {};

  const text = contactChunk.text;
  const phoneMatch = text.match(/\*\*연락처\*\*[\s\S]*?>\s*([\d\-]+)/);
  const emailMatch = text.match(/\*\*이메일\*\*[\s\S]*?>\s*([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/);
  const notionMatch = text.match(/\((https:\/\/app\.notion\.com\/[^)]+)\)/);

  return {
    phone: phoneMatch?.[1]?.trim(),
    email: emailMatch?.[1]?.trim(),
    notionUrl: notionMatch?.[1]?.trim(),
  };
}

function extractIntro(
  careerChunks: ReturnType<typeof loadPortfolio>["chunks"],
  fallback: string,
): string {
  for (const chunk of careerChunks) {
    const firstLine = chunk.text
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0 && !l.startsWith("#"));
    if (firstLine) return firstLine;
  }
  return fallback;
}
