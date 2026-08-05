import { chunkPages } from "@/lib/chunking";
import type { NotionService } from "@/services/notion";
import type { NotionPageContent, NotionPageRef } from "@/types/notion";
import type {
  ChunkCategory,
  PortfolioChunk,
  PortfolioCorpusData,
  PortfolioProfile,
  PortfolioServerData,
  SuggestedQuestionMeta,
} from "@/types/portfolio";

/**
 * 노션 → 청크 파이프라인 코어 (ADR-037, FEAT-038).
 * scripts/sync-notion.ts(로컬)와 lambda/ingest/handler.ts(24h 자동)가 공유한다.
 * fs/프로세스 의존 없음 — 파일/캐시/S3 입출력은 호출자 몫.
 */

export const ALLOWED_PROJECT_CATEGORIES = ["자체프로젝트", "업무", "외부활동"] as const;
export const ALLOWED_PROJECT_STATUSES = new Set(["Done", "In progress"]);

const PROFILE_FALLBACK_NAME = "김윤수";
const PROFILE_FALLBACK_ONELINER = "프론트엔드 + 스마트컨트랙트 개발자";
const PROFILE_FALLBACK_EMAIL = "bbabi0901@gmail.com";
const PROFILE_FALLBACK_GITHUB = "https://github.com/YoonsooKim9";

export interface SyncSourceConfig {
  projectsDbId: string;
  profilePageIds: string[];
  troubleshootingDbId?: string;
  extraPageIds: string[];
  onWarn?: (msg: string) => void;
}

export interface CollectedRefs {
  refs: NotionPageRef[];
  profileIdSet: Set<string>;
  troubleshootingIdSet: Set<string>;
  extraPageIdSet: Set<string>;
}

export function nowIsoKst(d: Date = new Date()): string {
  const offsetMs = 9 * 60 * 60 * 1000;
  const local = new Date(d.getTime() + offsetMs);
  const yyyy = local.getUTCFullYear();
  const mm = String(local.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(local.getUTCDate()).padStart(2, "0");
  const hh = String(local.getUTCHours()).padStart(2, "0");
  const mi = String(local.getUTCMinutes()).padStart(2, "0");
  const ss = String(local.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}+09:00`;
}

export function parseIdList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function resolveCategory(
  page: NotionPageContent,
  profileIds: Set<string>,
  troubleshootingIds: Set<string>,
  extraPageIds: Set<string>,
): ChunkCategory {
  if (troubleshootingIds.has(page.ref.id)) return "트러블슈팅";
  if (extraPageIds.has(page.ref.id)) return "subpage";
  if (profileIds.has(page.ref.id)) {
    const title = page.ref.title.toLowerCase();
    if (title.includes("이력서") || title.includes("resume")) return "career";
    return "personal";
  }
  const c = page.ref.category;
  if (c === "자체프로젝트" || c === "업무" || c === "외부활동") return "project";
  if (c === "프로필" || c === "성격" || c === "취미") return "personal";
  return "subpage";
}

export function extractProfile(
  pages: NotionPageContent[],
  profileIds: Set<string>,
): PortfolioProfile {
  const profile: PortfolioProfile = {
    name: PROFILE_FALLBACK_NAME,
    oneLiner: PROFILE_FALLBACK_ONELINER,
    contact: {
      email: PROFILE_FALLBACK_EMAIL,
      github: PROFILE_FALLBACK_GITHUB,
    },
  };

  const resumeCandidates = pages.filter((p) => {
    if (!profileIds.has(p.ref.id)) return false;
    const title = p.ref.title.toLowerCase();
    return title.includes("이력서") || title.includes("resume");
  });
  const fallback = pages.find((p) => profileIds.has(p.ref.id));
  const target = resumeCandidates[0] ?? fallback;
  if (!target) return profile;

  const lines = target.markdown.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("```")) continue;
    profile.oneLiner = trimmed.replace(/^[-*>]\s*/, "");
    break;
  }
  return profile;
}

export function sortChunks(chunks: PortfolioChunk[]): PortfolioChunk[] {
  return [...chunks].sort((a, b) => {
    if (a.sourcePageId !== b.sourcePageId) {
      return a.sourcePageId < b.sourcePageId ? -1 : 1;
    }
    const ah = a.headingPath.join("→");
    const bh = b.headingPath.join("→");
    if (ah !== bh) return ah < bh ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** 소스 ref 수집 — freshness 판단(저렴)과 본 fetch 가 같은 ref 셋을 공유한다. */
export async function collectSourceRefs(
  notion: NotionService,
  cfg: SyncSourceConfig,
): Promise<CollectedRefs> {
  const warn = cfg.onWarn ?? (() => {});

  const projectRefs = await notion.queryDatabase(cfg.projectsDbId, {
    categoryFilter: [...ALLOWED_PROJECT_CATEGORIES],
  });
  const filteredProjects = projectRefs.filter(
    (r) => !r.status || ALLOWED_PROJECT_STATUSES.has(r.status),
  );

  const profileRefs: NotionPageRef[] = [];
  for (const id of cfg.profilePageIds) {
    const ref = await notion.getPageRef(id);
    if (ref) profileRefs.push(ref);
    else warn(`profile page skipped (not found / no access): ${id}`);
  }

  const troubleshootingRefs: NotionPageRef[] = [];
  if (cfg.troubleshootingDbId) {
    const allTs = await notion.queryDatabase(cfg.troubleshootingDbId, {});
    troubleshootingRefs.push(...allTs.filter((r) => r.status === "완료" || r.status === "Done"));
  }

  const extraRefs: NotionPageRef[] = [];
  for (const id of cfg.extraPageIds) {
    const ref = await notion.getPageRef(id);
    if (ref) extraRefs.push(ref);
    else warn(`extra page skipped (not found): ${id}`);
  }

  return {
    refs: [...filteredProjects, ...profileRefs, ...troubleshootingRefs, ...extraRefs],
    profileIdSet: new Set(cfg.profilePageIds),
    troubleshootingIdSet: new Set(troubleshootingRefs.map((r) => r.id)),
    extraPageIdSet: new Set(extraRefs.map((r) => r.id)),
  };
}

/** ref 셋 → 페이지 콘텐츠 fetch → 청킹 (임베딩 없음 — 호출자가 채운다). */
export async function fetchChunksFromRefs(
  notion: NotionService,
  collected: CollectedRefs,
  onWarn?: (msg: string) => void,
): Promise<{ pages: NotionPageContent[]; chunks: PortfolioChunk[] }> {
  const warn = onWarn ?? (() => {});
  const pages = await notion.getPagesContent(
    collected.refs.map((r) => r.id),
    {
      // 동시성이 높으면 notion-to-md 의 중첩 블록(columns/callout) 자식 fetch 가
      // Notion rate-limit 로 조용히 부분 수신되어 이력서 등 큰 페이지가 잘리는 사례가 있어 2 로 낮춤.
      concurrency: 2,
      onSkip: (id, reason) => warn(`page skipped (${reason}): ${id}`),
    },
  );

  const chunks = chunkPages(
    pages,
    (p) =>
      resolveCategory(
        p,
        collected.profileIdSet,
        collected.troubleshootingIdSet,
        collected.extraPageIdSet,
      ),
    { onWarn: warn },
  );
  return { pages, chunks };
}

export interface BuildServerDataInput {
  chunks: PortfolioChunk[];
  pages: NotionPageContent[];
  profileIdSet: Set<string>;
  suggestedQuestions: SuggestedQuestionMeta[];
  version: string;
  generatedAt: string;
}

export function buildServerData(input: BuildServerDataInput): PortfolioServerData {
  return {
    version: input.version,
    generatedAt: input.generatedAt,
    chunks: sortChunks(input.chunks),
    suggestedQuestions: input.suggestedQuestions,
    profile: extractProfile(input.pages, input.profileIdSet),
  };
}

/** 런타임 corpus — 임베딩만 제거 (벡터는 S3 Vectors 가 단일 소스, ADR-037). */
export function toCorpus(data: PortfolioServerData): PortfolioCorpusData {
  return {
    version: data.version,
    generatedAt: data.generatedAt,
    chunks: data.chunks.map((c) => {
      const rest = { ...c } as Partial<PortfolioChunk>;
      delete rest.embedding;
      return rest as PortfolioCorpusData["chunks"][number];
    }),
    suggestedQuestions: data.suggestedQuestions,
    profile: data.profile,
  };
}
