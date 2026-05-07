export type MessageRole = "user" | "assistant" | "greeting";
export type MessageStatus = "idle" | "typing" | "streaming" | "done" | "error";

export interface Citation {
  sourceTitle: string;
  sourceUrl: string | null;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  citations?: Citation[];
  createdAt: number;
  feedbackSent?: boolean;
}
