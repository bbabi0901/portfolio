export type ChunkCategory =
  | "intro"
  | "career"
  | "project"
  | "skill"
  | "subpage"
  | "personal";

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

export interface PortfolioClientData {
  version: string;
  generatedAt: string;
  suggestedQuestions: SuggestedQuestionMeta[];
  profile: PortfolioProfile;
  relatedQuestions?: Record<string, string[]>;
}
