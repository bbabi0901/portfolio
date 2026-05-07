import "server-only";

import { Client as NotionClient } from "@notionhq/client";
import { NotionToMarkdown } from "notion-to-md";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { NotionPageContent, NotionPageRef } from "@/types/notion";

export interface NotionServiceOptions {
  token: string;
  mock?: boolean;
  fixtureDir?: string;
  rateLimitBackoffMs?: number;
}

export interface QueryDatabaseOptions {
  categoryFilter?: string[];
}

export interface GetPagesContentOptions {
  concurrency?: number;
  onSkip?: (id: string, reason: string) => void;
}

export interface NotionService {
  queryDatabase(databaseId: string, opts?: QueryDatabaseOptions): Promise<NotionPageRef[]>;
  getPageRef(pageId: string): Promise<NotionPageRef | null>;
  getPageContent(pageId: string): Promise<NotionPageContent | null>;
  getPagesContent(pageIds: string[], opts?: GetPagesContentOptions): Promise<NotionPageContent[]>;
}

const NOTION_BASE = "https://api.notion.com";
const NOTION_VERSION = "2022-06-28";

const TITLE_KEYS = ["이름", "제목", "Name", "Title"];
const CATEGORY_KEYS = ["카테고리", "Category"];
const STATUS_KEYS = ["상태", "Status"];
const PERIOD_KEYS = ["기간", "Period"];

interface RichTextItem {
  plain_text?: string;
}

interface NotionProperty {
  type?: string;
  title?: RichTextItem[];
  rich_text?: RichTextItem[];
  select?: { name?: string } | null;
  status?: { name?: string } | null;
}

type Properties = Record<string, NotionProperty | undefined>;

interface NotionPageRaw {
  id: string;
  url?: string;
  public_url?: string | null;
  properties?: Properties;
}

interface QueryResponse {
  results: NotionPageRaw[];
  next_cursor?: string | null;
  has_more?: boolean;
}

function pickProperty(properties: Properties, keys: string[]): NotionProperty | undefined {
  for (const k of keys) {
    const v = properties[k];
    if (v !== undefined) return v;
  }
  return undefined;
}

function extractTitle(properties: Properties): string {
  const prop = pickProperty(properties, TITLE_KEYS);
  if (prop?.type === "title" && Array.isArray(prop.title)) {
    return prop.title.map((t) => t.plain_text ?? "").join("");
  }
  return "";
}

function extractSelectLike(properties: Properties, keys: string[]): string | undefined {
  const prop = pickProperty(properties, keys);
  if (!prop) return undefined;
  if (prop.type === "select" && prop.select && prop.select.name) return prop.select.name;
  if (prop.type === "status" && prop.status && prop.status.name) return prop.status.name;
  return undefined;
}

function extractRichText(properties: Properties, keys: string[]): string | undefined {
  const prop = pickProperty(properties, keys);
  if (prop?.type === "rich_text" && Array.isArray(prop.rich_text)) {
    const out = prop.rich_text.map((t) => t.plain_text ?? "").join("");
    return out || undefined;
  }
  return undefined;
}

function notionUrlFor(pageId: string, providedUrl?: string): string {
  if (providedUrl) return providedUrl;
  return `https://www.notion.so/${pageId.replace(/-/g, "")}`;
}

function pageToRef(page: NotionPageRaw): NotionPageRef {
  const properties = page.properties ?? {};
  const ref: NotionPageRef = {
    id: page.id,
    title: extractTitle(properties) || "(untitled)",
    url: notionUrlFor(page.id, page.url),
    isPublic: !!page.public_url,
    category: extractSelectLike(properties, CATEGORY_KEYS) ?? "",
  };
  const status = extractSelectLike(properties, STATUS_KEYS);
  if (status) ref.status = status;
  const period = extractRichText(properties, PERIOD_KEYS);
  if (period) ref.period = period;
  return ref;
}

class FixtureNotFound extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FixtureNotFound";
  }
}

class PermissionDenied extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionDenied";
  }
}

class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

function isPermissionDenied(err: unknown): boolean {
  if (err instanceof PermissionDenied) return true;
  const code = (err as { code?: string; status?: number })?.code;
  const status = (err as { status?: number })?.status;
  if (code === "unauthorized" || code === "restricted_resource") return true;
  if (status === 401 || status === 403) return true;
  return false;
}

function isNotFound(err: unknown): boolean {
  if (err instanceof NotFoundError) return true;
  const code = (err as { code?: string; status?: number })?.code;
  const status = (err as { status?: number })?.status;
  if (code === "object_not_found") return true;
  if (status === 404) return true;
  return false;
}

class Service implements NotionService {
  private readonly token: string;
  private readonly mock: boolean;
  private readonly fixtureDir: string;
  private readonly backoffMs: number;
  private readonly client: NotionClient | null;
  private readonly n2m: NotionToMarkdown | null;

  constructor(options: NotionServiceOptions) {
    this.token = options.token;
    this.mock = !!options.mock;
    this.fixtureDir = options.fixtureDir ?? path.join(process.cwd(), "tests/fixtures/notion");
    this.backoffMs = options.rateLimitBackoffMs ?? 250;
    if (this.mock) {
      this.client = null;
      this.n2m = null;
    } else {
      this.client = new NotionClient({ auth: this.token });
      this.n2m = new NotionToMarkdown({ notionClient: this.client });
    }
  }

  async queryDatabase(
    databaseId: string,
    opts?: QueryDatabaseOptions,
  ): Promise<NotionPageRef[]> {
    const refs = this.mock
      ? await this.queryFromFixture(databaseId)
      : await this.queryFromApi(databaseId);
    if (opts?.categoryFilter && opts.categoryFilter.length > 0) {
      const allowed = new Set(opts.categoryFilter);
      return refs.filter((r) => allowed.has(r.category));
    }
    return refs;
  }

  async getPageRef(pageId: string): Promise<NotionPageRef | null> {
    if (this.mock) return this.getPageRefFromFixture(pageId);
    try {
      return await this.getPageRefFromApi(pageId);
    } catch (err) {
      if (isPermissionDenied(err) || isNotFound(err)) return null;
      throw err;
    }
  }

  async getPageContent(pageId: string): Promise<NotionPageContent | null> {
    if (this.mock) return this.getPageContentFromFixture(pageId);
    try {
      const ref = await this.getPageRefFromApi(pageId);
      if (!ref) return null;
      const blocks = await this.n2m!.pageToMarkdown(pageId);
      const markdownObj = this.n2m!.toMarkdownString(blocks);
      const markdown = (markdownObj.parent ?? "").trim();
      return { ref, markdown };
    } catch (err) {
      if (isPermissionDenied(err) || isNotFound(err)) return null;
      throw err;
    }
  }

  async getPagesContent(
    pageIds: string[],
    opts?: GetPagesContentOptions,
  ): Promise<NotionPageContent[]> {
    const concurrency = Math.max(1, Math.min(opts?.concurrency ?? 4, pageIds.length || 1));
    const onSkip = opts?.onSkip;
    const out: NotionPageContent[] = [];
    let cursor = 0;

    const next = async (): Promise<void> => {
      while (cursor < pageIds.length) {
        const idx = cursor++;
        const id = pageIds[idx]!;
        try {
          const content = await this.getPageContent(id);
          if (content) out.push(content);
          else onSkip?.(id, "not-found");
        } catch (err) {
          if (isPermissionDenied(err)) onSkip?.(id, "permission-denied");
          else throw err;
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => next()));
    return out;
  }

  // --- API path ---

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    };
  }

  private async requestWithRetry(url: string, init: RequestInit): Promise<Response> {
    let lastRes: Response | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(url, init);
      lastRes = res;
      if (res.status === 429) {
        await sleep(this.backoffMs * 2 ** attempt);
        continue;
      }
      return res;
    }
    return lastRes!;
  }

  private async queryFromApi(databaseId: string): Promise<NotionPageRef[]> {
    const refs: NotionPageRef[] = [];
    let cursor: string | undefined;
    do {
      const body: Record<string, unknown> = {};
      if (cursor) body.start_cursor = cursor;
      const res = await this.requestWithRetry(
        `${NOTION_BASE}/v1/databases/${databaseId}/query`,
        {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify(body),
        },
      );
      if (res.status === 401 || res.status === 403) {
        throw new PermissionDenied(`queryDatabase ${databaseId}: ${res.status}`);
      }
      if (res.status === 404) {
        throw new NotFoundError(`queryDatabase ${databaseId}: 404`);
      }
      if (res.status >= 500) {
        throw new Error(`queryDatabase ${databaseId} server error: ${res.status}`);
      }
      if (!res.ok) {
        throw new Error(`queryDatabase ${databaseId} failed: ${res.status}`);
      }
      const json = (await res.json()) as QueryResponse;
      for (const page of json.results || []) {
        refs.push(pageToRef(page));
      }
      cursor = json.next_cursor || undefined;
    } while (cursor);
    return refs;
  }

  private async getPageRefFromApi(pageId: string): Promise<NotionPageRef | null> {
    const res = await this.requestWithRetry(`${NOTION_BASE}/v1/pages/${pageId}`, {
      method: "GET",
      headers: this.headers(),
    });
    if (res.status === 401 || res.status === 403) {
      throw new PermissionDenied(`getPageRef ${pageId}: ${res.status}`);
    }
    if (res.status === 404) {
      throw new NotFoundError(`getPageRef ${pageId}: 404`);
    }
    if (res.status >= 500) {
      throw new Error(`getPageRef ${pageId} server error: ${res.status}`);
    }
    if (!res.ok) {
      throw new Error(`getPageRef ${pageId} failed: ${res.status}`);
    }
    const page = (await res.json()) as NotionPageRaw;
    return pageToRef(page);
  }

  // --- Fixture path ---

  private async readFixture<T>(filename: string): Promise<T | null> {
    const file = path.join(this.fixtureDir, filename);
    try {
      const text = await fs.readFile(file, "utf8");
      return JSON.parse(text) as T;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return null;
      throw err;
    }
  }

  private async readFixtureText(filename: string): Promise<string | null> {
    const file = path.join(this.fixtureDir, filename);
    try {
      return await fs.readFile(file, "utf8");
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return null;
      throw err;
    }
  }

  private async loadFixtureDb(databaseId: string): Promise<QueryResponse | null> {
    const candidates = [`db-${databaseId}.json`, "db-projects.json"];
    for (const name of candidates) {
      const json = await this.readFixture<QueryResponse>(name);
      if (json) return json;
    }
    return null;
  }

  private async queryFromFixture(databaseId: string): Promise<NotionPageRef[]> {
    const json = await this.loadFixtureDb(databaseId);
    if (!json) {
      throw new FixtureNotFound(
        `fixture for database ${databaseId} not found in ${this.fixtureDir}`,
      );
    }
    return (json.results ?? []).map(pageToRef);
  }

  private async getPageRefFromFixture(pageId: string): Promise<NotionPageRef | null> {
    const json = await this.loadFixtureDb("default");
    if (json) {
      const match = (json.results ?? []).find((p) => p.id === pageId);
      if (match) return pageToRef(match);
    }
    const sidecar = await this.readFixture<NotionPageRaw>(`page-${pageId}.json`);
    if (sidecar) return pageToRef(sidecar);
    const md = await this.readFixtureText(`page-${pageId}.md`);
    if (md !== null) {
      return {
        id: pageId,
        title: pageId,
        url: notionUrlFor(pageId),
        isPublic: true,
        category: "",
      };
    }
    return null;
  }

  private async getPageContentFromFixture(
    pageId: string,
  ): Promise<NotionPageContent | null> {
    const md = await this.readFixtureText(`page-${pageId}.md`);
    if (md === null) return null;
    const ref = (await this.getPageRefFromFixture(pageId)) ?? {
      id: pageId,
      title: pageId,
      url: notionUrlFor(pageId),
      isPublic: true,
      category: "",
    };
    return { ref, markdown: md.trim() };
  }
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((r) => setTimeout(r, ms));
}

export function createNotionService(options: NotionServiceOptions): NotionService {
  if (!options.token) {
    throw new Error("createNotionService: token is required");
  }
  return new Service(options);
}
