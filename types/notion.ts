export interface NotionPageRef {
  id: string;
  title: string;
  url: string;
  isPublic: boolean;
  category: string;
  tags?: string[];
  status?: string;
  period?: string;
}

export interface NotionPageContent {
  ref: NotionPageRef;
  markdown: string;
}
