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
  /** 이력서(career) 청크에서 재구성한 커리어 타임라인 마크다운 (/experience) */
  career?: ProfileSection;
  education?: ProfileSection;
  imageUrl: string | null;
  totalReadingMinutes: number;
}

/** 이력서(career) 청크 중 경력 타임라인 섹션 heading 매칭 */
const CAREER_TIMELINE_HEADING_RE = /직무|경력|experience/i;
const CAREER_SECTION_LABEL = "커리어";

/** 이력서(career) 청크 중 학력/교육 섹션을 식별하는 heading 키워드 */
const EDUCATION_HEADING_RE = /교육|education|학력/i;
/** /about 하단에 노출할 학력 섹션 라벨 */
const EDUCATION_SECTION_HEADING = "학력";

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
  const career = extractCareer(careerChunks);

  return {
    intro,
    contact,
    sections,
    career,
    education,
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

/**
 * 이력서(career) 청크에서 학력/교육 섹션을 뽑아 /about 하단 "학력" 섹션으로 렌더한다.
 * heading(headingPath[0]) 이 교육/education/학력 을 포함하는 career 청크를 모은다.
 * 노션 이력서의 "교육 기관 (Education)" 섹션(대학 학사 등)이 여기에 해당.
 */
function extractEducation(
  careerChunks: ReturnType<typeof loadPortfolio>["chunks"],
): ProfileSection | undefined {
  const eduChunks = careerChunks.filter(
    (c) => EDUCATION_HEADING_RE.test(c.headingPath[0] ?? "") && hasReadableText(c.text),
  );
  if (eduChunks.length === 0) return undefined;

  const subSections: ProfileSubSection[] = eduChunks.map((c) => ({
    heading: c.headingPath.slice(1).join(" → ") || undefined,
    body: c.text,
  }));
  return { heading: EDUCATION_SECTION_HEADING, subSections };
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
