export interface NotionPageRef {
  id: string;
  title: string;
  url: string;
  isPublic: boolean;
  category: string;
  tags?: string[];
  status?: string;
  period?: string;
  /** 프로젝트 DB "기간" date 속성 (ISO date) — 프로젝트 타임라인 정렬/표시용 */
  periodStart?: string;
  periodEnd?: string;
  /** Notion page last_edited_time (ISO) — sync:check 신선도 판단용 */
  lastEditedTime?: string;
}

export interface NotionPageContent {
  ref: NotionPageRef;
  markdown: string;
}
