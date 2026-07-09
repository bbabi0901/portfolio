export interface NotionPageRef {
  id: string;
  title: string;
  url: string;
  isPublic: boolean;
  category: string;
  tags?: string[];
  status?: string;
  period?: string;
  /** Notion page last_edited_time (ISO) — sync:check 신선도 판단용 */
  lastEditedTime?: string;
}

export interface NotionPageContent {
  ref: NotionPageRef;
  markdown: string;
}
