export type FeedbackReason = "inaccurate" | "off-topic" | "incomplete" | "other";
export type FeedbackKind = "up" | "down";

export interface FeedbackInput {
  messageId: string;
  question: string;
  answer: string;
  reason: FeedbackReason;
  reasonDetail?: string;
  model: string;
  retrievalChunkTitles: string[];
  uaHash: string;
}

export interface FeedbackResult {
  ok: true;
  notionPageId: string;
}

export interface FeedbackError {
  ok: false;
  reason: "auth" | "schema" | "unknown";
  message: string;
}
