export type ChunkCategory =
  "intro" | "career" | "project" | "skill" | "subpage" | "personal" | "트러블슈팅";

export type ProjectNotionCategory = "자체프로젝트" | "업무" | "외부활동";

export interface ProjectMeta {
  notionCategory?: ProjectNotionCategory;
  company?: string;
  role?: string;
  period?: { start: string; end?: string; ongoing?: boolean };
}

export interface PortfolioChunk {
  id: string;
  sourcePageId: string;
  sourceTitle: string;
  sourceUrl: string;
  category: ChunkCategory;
  headingPath: string[];
  text: string;
  tokens: number;
  embedding: number[];
  tags?: string[];
  projectMeta?: ProjectMeta;
  /** 페이지 내 문서 순서 (0-base) — sortChunks 정렬로 소실되는 원본 순서 보존용 */
  order?: number;
}

export interface SuggestedQuestionMeta {
  id: string;
  category: string;
  text: string;
  expectedSourceTitles: string[];
}

export interface PortfolioProfile {
  name: string;
  oneLiner: string;
  contact: { email: string; github?: string; linkedin?: string };
  socials?: Record<string, string>;
}

export interface PortfolioServerData {
  version: string;
  generatedAt: string;
  chunks: PortfolioChunk[];
  suggestedQuestions: SuggestedQuestionMeta[];
  profile: PortfolioProfile;
}

/** S3 corpus.json — 서버 데이터에서 임베딩만 제거한 형태 (ADR-037, 벡터는 S3 Vectors 가 보유) */
export type PortfolioCorpusChunk = Omit<PortfolioChunk, "embedding">;

export interface PortfolioCorpusData {
  version: string;
  generatedAt: string;
  chunks: PortfolioCorpusChunk[];
  suggestedQuestions: SuggestedQuestionMeta[];
  profile: PortfolioProfile;
}

export interface PortfolioClientData {
  version: string;
  generatedAt: string;
  suggestedQuestions: SuggestedQuestionMeta[];
  profile: PortfolioProfile;
  relatedQuestions?: Record<string, string[]>;
}
