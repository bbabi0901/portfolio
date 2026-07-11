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

/** /experience 학력·자격증 행 아이템 (제목 · 부제 · 기간) */
export interface CredentialItem {
  title: string;
  subtitle?: string;
  period?: string;
}

export interface ProfileData {
  intro: string;
  contact: ProfileContact;
  sections: ProfileSection[];
  /** 이력서(career) 청크에서 재구성한 커리어 타임라인 마크다운 (/experience) */
  career?: ProfileSection;
  /** 학력 — 학사(대학) 항목만. 부트캠프 등은 제외 (/experience 분리 섹션) */
  education?: CredentialItem[];
  /** 자격증 (/experience 분리 섹션) */
  certifications?: CredentialItem[];
  imageUrl: string | null;
  totalReadingMinutes: number;
}

/** 이력서(career) 청크 중 경력 타임라인 섹션 heading 매칭 — 회사 경력 + 자체 프로젝트 */
const CAREER_TIMELINE_HEADING_RE = /직무|경력|experience|자체 프로젝트|personal project/i;
const CAREER_SECTION_LABEL = "커리어";
/** 학력 섹션: 대학(학사) 항목만 렌더 — 부트캠프 제외 (사용자 결정) */
const UNIVERSITY_TITLE_RE = /대학|university/i;
const CERTIFICATION_HEADING_RE = /자격증|certification/i;
const PERIOD_RANGE_RE = /\d{4}\.\d{2}\s*[-~–—]\s*(?:\d{4}\.\d{2}|현재)/;

/** 이력서(career) 청크 중 학력/교육 섹션을 식별하는 heading 키워드 */
const EDUCATION_HEADING_RE = /교육|education|학력/i;

const READING_WORDS_PER_MINUTE = 200;
const KOREAN_CHARS_PER_WORD = 2;

/**
 * 노션 자기소개 페이지의 히어로 이미지는 서명 만료되는 S3 URL 로 동기화되므로,
 * 빌드 산출물(oneLiner) 에 이미지 마크다운이 존재하면 커밋된 정적 asset 을 가리킨다.
 * (실제 이미지 파일: public/images/profile.jpg — scripts/sync 가 아닌 수동 갱신)
 */
const PROFILE_IMAGE_ASSET = "/images/profile.jpg";
const IMAGE_MARKDOWN_RE = /!\[[^\]]*\]\(https?:\/\/[^)]+\)/;

export function resolveProfileImageUrl(oneLiner: string | undefined | null): string | null {
  return oneLiner && IMAGE_MARKDOWN_RE.test(oneLiner) ? PROFILE_IMAGE_ASSET : null;
}

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
      heading.includes("자기 소개") || heading.includes("About Me") ? "커리어" : heading;
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

  const education = extractEducation(careerChunks);
  const certifications = extractCertifications(careerChunks);
  const career = extractCareer(careerChunks);

  return {
    intro,
    contact,
    sections,
    career,
    education,
    certifications,
    imageUrl: resolveProfileImageUrl(data.profile.oneLiner),
    totalReadingMinutes,
  };
}

/**
 * 이력서(career) 청크에서 경력 타임라인 마크다운을 재구성한다 (ADR-028 이후 구조).
 * - 청크 text 에는 자기 heading 라인이 없으므로 headingPath[1](프로젝트명)을 `###` 으로 재합성.
 * - sortChunks 는 headingPath 사전순이라 문서 순서가 소실됨 → `order` 필드로 원래 순서 복원.
 * - 회사 callout(`> | 회사명`)·기간 블록은 청크 body 에 살아있어 CareerTimelineSection 의
 *   parseCareerMarkdown 이 기존과 동일하게 타임라인으로 파싱한다.
 */
function extractCareer(
  careerChunks: ReturnType<typeof loadPortfolio>["chunks"],
): ProfileSection | undefined {
  const timelineChunks = careerChunks
    .filter(
      (c) => CAREER_TIMELINE_HEADING_RE.test(c.headingPath[0] ?? "") && hasReadableText(c.text),
    )
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (timelineChunks.length === 0) return undefined;

  const body = timelineChunks
    .map((c) => {
      const sub = c.headingPath[1];
      return sub ? `### ${sub}\n${c.text}` : c.text;
    })
    .join("\n\n");

  return { heading: CAREER_SECTION_LABEL, subSections: [{ body }] };
}

/** career 청크 하나를 학력/자격증 행 아이템으로 변환 (title=하위 heading, body에서 기간·부제 추출) */
function toCredentialItem(
  chunk: ReturnType<typeof loadPortfolio>["chunks"][number],
): CredentialItem {
  const title = (chunk.headingPath[chunk.headingPath.length - 1] ?? "").replace(/\*\*/g, "").trim();
  const item: CredentialItem = { title };

  for (const rawLine of chunk.text.split("\n")) {
    const line = rawLine
      .replace(/<[^>]+>/g, "")
      .replace(/^>\s*/, "")
      .replace(/\*\*/g, "")
      .trim();
    if (!line || line === "---") continue;
    const periodMatch = line.match(PERIOD_RANGE_RE);
    if (periodMatch && !item.period) {
      item.period = periodMatch[0].replace(/\s+/g, " ").trim();
      const rest = line.replace(periodMatch[0], "").replace(/^[·,\s]+|[·,\s]+$/g, "");
      if (rest && !item.subtitle) item.subtitle = rest;
      continue;
    }
    if (!item.subtitle) item.subtitle = line;
  }
  return item;
}

/**
 * 이력서(career) 청크의 "교육 기관 (Education)" 하위 항목 중 **대학(학사)만** 학력으로 추출.
 * 부트캠프 등 비학위 과정은 렌더하지 않는다 (기록 자체는 RAG 답변용으로 유지).
 */
function extractEducation(
  careerChunks: ReturnType<typeof loadPortfolio>["chunks"],
): CredentialItem[] | undefined {
  const items = careerChunks
    .filter(
      (c) =>
        EDUCATION_HEADING_RE.test(c.headingPath[0] ?? "") &&
        UNIVERSITY_TITLE_RE.test(c.headingPath[c.headingPath.length - 1] ?? ""),
    )
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map(toCredentialItem)
    .filter((i) => i.title.length > 0);
  return items.length > 0 ? items : undefined;
}

/** 이력서(career) 청크의 "자격증 (Certification)" 하위 항목 추출 */
function extractCertifications(
  careerChunks: ReturnType<typeof loadPortfolio>["chunks"],
): CredentialItem[] | undefined {
  const items = careerChunks
    .filter(
      (c) => CERTIFICATION_HEADING_RE.test(c.headingPath[0] ?? "") && c.headingPath.length > 1,
    )
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map(toCredentialItem)
    .filter((i) => i.title.length > 0);
  return items.length > 0 ? items : undefined;
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

function extractContact(chunks: ReturnType<typeof loadPortfolio>["chunks"]): ProfileContact {
  const contactChunk = chunks.find((c) => c.headingPath[0]?.includes("이름"));
  if (!contactChunk) return {};

  const text = contactChunk.text;
  const phoneMatch = text.match(/\*\*연락처\*\*[\s\S]*?>\s*([\d\-]+)/);
  const emailMatch = text.match(
    /\*\*이메일\*\*[\s\S]*?>\s*([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/,
  );
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
