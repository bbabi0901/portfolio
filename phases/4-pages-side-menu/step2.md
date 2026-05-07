# Step 2: experience-page

## 읽어야 할 파일

- `/CLAUDE.md` — 콘텐츠는 portfolio.server.json 기반.
- `/docs/PAGES.md` — `/experience` 와이어프레임 (timeline + company groups + project cards + skills grid + category filter).
- `/docs/RESPONSIVE.md` — `/experience` max-w-3xl/4xl, 모바일 horizontal timeline / 데스크톱 vertical sticky.
- `/docs/NOTION_SCHEMA.md` — 프로젝트 DB schema (회사, 기간, 카테고리, 스택, 임팩트).
- `/spec.json` — `pages[]` 의 `/experience`, `features[]` FEAT-025 (기술 이력 페이지).
- `/lib/portfolio-data.ts` — chunks/projects loader.
- `/types/portfolio.ts` — Project / Skill types.
- `/components/layout/LayoutClient.tsx` — 이전.

## 작업

`/experience` SSG 페이지. 회사 그룹 → 프로젝트 카드들. 스킬 그리드. 카테고리 필터 (URL `?category=` 동기화).

### TDD 순서

1. `specs/experience-data.spec.ts` + `specs/components/experience-page.spec.tsx` 작성 (실패).
2. 데이터 helper + 컴포넌트 구현 (통과).

### 생성할 파일

#### 1. `lib/experience-data.ts` (server-only)

```ts
import { loadPortfolio } from "./portfolio-data";

export type ProjectCategory = "자체프로젝트" | "업무" | "외부활동";

export interface ProjectSummary {
  id: string;
  title: string;
  company?: string;
  period?: { start: string; end?: string; ongoing?: boolean };
  role?: string;
  techKeywords: string[];
  impact: string;            // 한 줄
  category: ProjectCategory;
  notionUrl?: string;
}

export interface CompanyGroup {
  company: string;
  period: string;            // "2025.01 — 현재"
  projects: ProjectSummary[];
}

export interface SkillsData {
  frontend: string[];
  smartContract: string[];
  // 향후 확장
}

export interface ExperienceData {
  groups: CompanyGroup[];
  others: ProjectSummary[];   // 회사 없는 자체프로젝트
  skills: SkillsData;
}

export function loadExperienceData(): ExperienceData;
```

#### 2. `components/experience/Timeline.tsx`

```tsx
"use client";
import type { CompanyGroup } from "@/lib/experience-data";

export interface TimelineProps {
  groups: CompanyGroup[];
  activeCompany?: string;       // 사용자가 좌측 timeline 클릭 시 강조
  onSelectCompany?: (company: string) => void;
  className?: string;
}
export function Timeline(props: TimelineProps): JSX.Element;
```

- 모바일 (`<lg`): 상단 horizontal scroll-snap timeline (`flex overflow-x-auto`).
- 데스크톱 (`lg+`): 좌측 vertical sticky timeline (`sticky top-0 max-h-[100dvh] flex flex-col`).
- 각 회사 dot + label + 기간.
- 클릭 시 `onSelectCompany` 호출 + scrollIntoView.

#### 3. `components/experience/CompanyGroup.tsx`

```tsx
"use client";
import type { CompanyGroup as Group } from "@/lib/experience-data";
import { ProjectCard } from "./ProjectCard";

export interface CompanyGroupProps {
  group: Group;
  expanded?: boolean;          // collapsible. 기본 true.
  onToggle?: () => void;
  className?: string;
}
export function CompanyGroup(props: CompanyGroupProps): JSX.Element;
```

#### 4. `components/experience/ProjectCard.tsx`

```tsx
"use client";
import type { ProjectSummary } from "@/lib/experience-data";

export interface ProjectCardProps {
  project: ProjectSummary;
  onOpenNotion?: (url: string) => void;
  className?: string;
}
export function ProjectCard(props: ProjectCardProps): JSX.Element;
```

- 카드: 제목 + 기간 + 역할 + tech chips + 한 줄 임팩트 + 노션 링크 button.
- chips: neutral-800 border, text-xs.
- "노션에서 자세히" → target=_blank rel=noopener noreferrer.
- notionUrl 비공개 (null) → button disabled + tooltip.

#### 5. `components/experience/SkillsGrid.tsx`

```tsx
import type { SkillsData } from "@/lib/experience-data";

export interface SkillsGridProps {
  skills: SkillsData;
  className?: string;
}
export function SkillsGrid(props: SkillsGridProps): JSX.Element;
```

- "Frontend", "Smart Contract" 두 컬럼 (모바일 1 컬럼, 태블릿+ 2 컬럼).
- 각 스킬 chip (neutral-800 border).
- server component.

#### 6. `components/experience/CategoryFilter.tsx`

```tsx
"use client";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

export interface CategoryFilterProps {
  options: ProjectCategory[];   // 동적 (실제 데이터에 있는 카테고리만)
  className?: string;
}
export function CategoryFilter(props: CategoryFilterProps): JSX.Element;
```

- "전체" + 각 카테고리 button.
- URL `?category=업무` 동기화. router.push() with shallow scroll restore.
- active 상태 button neutral-100 bg.

#### 7. `app/experience/page.tsx` (server component, SSG)

```tsx
import type { Metadata } from "next";
import { Suspense } from "react";
import { loadExperienceData } from "@/lib/experience-data";
import { Timeline } from "@/components/experience/Timeline";
import { CompanyGroup } from "@/components/experience/CompanyGroup";
import { SkillsGrid } from "@/components/experience/SkillsGrid";
import { CategoryFilter } from "@/components/experience/CategoryFilter";
import { ExperienceClient } from "@/components/experience/ExperienceClient";

export const metadata: Metadata = {
  title: "기술 이력",
  description: "김윤수의 회사·프로젝트 타임라인 + 보유 스킬.",
};

export default function ExperiencePage() {
  const data = loadExperienceData();
  return (
    <main className="mx-auto max-w-3xl lg:max-w-4xl px-4 md:px-6 lg:px-8 py-12">
      <Suspense fallback={null}>
        <CategoryFilter options={[...]} />
      </Suspense>
      <ExperienceClient data={data} />
      <SkillsGrid skills={data.skills} />
    </main>
  );
}
```

- `ExperienceClient` 가 useSearchParams 로 카테고리 필터 적용 + Timeline + CompanyGroup 렌더 (client component).
- Suspense 는 useSearchParams CSR boundary 강제 (Next 16+).

#### 8. `components/experience/ExperienceClient.tsx`

```tsx
"use client";
import type { ExperienceData } from "@/lib/experience-data";
import { useSearchParams } from "next/navigation";

export interface ExperienceClientProps {
  data: ExperienceData;
}
export function ExperienceClient(props: ExperienceClientProps): JSX.Element;
```

- useSearchParams `category` 파라미터로 필터링.
- 결과 0개 시 "이 카테고리에 해당하는 프로젝트가 없어요" 빈 상태.
- Timeline + CompanyGroup 렌더.

### Specs (TDD red)

```ts
// specs/experience-data.spec.ts
describe("loadExperienceData", () => {
  it("회사별 그룹화", () => { /* … */ });
  it("회사 없는 자체프로젝트 → others", () => { /* … */ });
  it("기간 텍스트 포맷 'YYYY.MM — 현재'", () => { /* … */ });
  it("스킬 데이터 분리 (frontend / smartContract)", () => { /* … */ });
});
```

```tsx
// specs/components/experience-page.spec.tsx
describe("CategoryFilter", () => {
  it("active=전체 시 button 강조", () => { /* … */ });
  it("category=업무 클릭 → URL ?category=업무", async () => { /* router.push mock */ });
});

describe("ProjectCard", () => {
  it("notionUrl null → '노션에서 자세히' disabled", () => { /* … */ });
  it("tech chips 렌더", () => { /* … */ });
});

describe("ExperienceClient", () => {
  it("카테고리 필터 결과 0 → 빈 상태", () => { /* … */ });
  it("category 미지정 → 모든 그룹 렌더", () => { /* … */ });
});

describe("SkillsGrid", () => {
  it("frontend / smartContract 두 컬럼", () => { /* … */ });
});

describe("Timeline", () => {
  it("회사 dot 클릭 → onSelectCompany", () => { /* … */ });
});
```

### 핵심 규칙 (위반 금지)

- **`useSearchParams` 는 Suspense boundary 안에서만.** Next 16 강제.
- **Timeline / CategoryFilter / ExperienceClient 만 client component.** Page + ProjectCard + SkillsGrid + CompanyGroup 은 server (ProjectCard 내 onOpenNotion handler 도 client; 단순한 안전책으로 ProjectCard 는 client component 로 둬도 됨).
- **외부 link target=_blank rel=noopener noreferrer**.
- **데이터 0건 (loadExperienceData 반환 groups + others 빈) 시 placeholder**. 빌드 실패 X.
- **카테고리 enum 변경 시 spec.json 동기화** (이미 `자체프로젝트 / 업무 / 외부활동` 3종 등록).

## Acceptance Criteria

```bash
npm run check:spec
npm run lint
npm run test
npx tsc --noEmit
SKIP_NOTION_SYNC=1 MOCK_LLM=1 MOCK_NOTION=1 npm run build
```

수동:
```bash
npm run dev &
sleep 5
curl -sS -o /dev/null -w "%{http_code}" http://localhost:3000/experience          # 200
curl -sS -o /dev/null -w "%{http_code}" http://localhost:3000/experience?category=업무   # 200
kill %1
```

## 검증 절차

1. AC 실행.
2. 체크:
   - `app/experience/page.tsx`, `lib/experience-data.ts`, `components/experience/*` 존재.
   - 모든 spec 통과.
   - URL `?category=` 동기화 동작.
3. `phases/4-pages-side-menu/index.json` step 2 갱신.

## 금지사항

- **`/api/*` 호출 금지.** SSG.
- **노션 SDK 직접 호출 금지.** portfolio.server.json 만.
- **외부 chart/timeline 라이브러리 추가 금지.** 단순 div + flex 로 충분.
- **react-virtual 등 가상화 추가 금지.** 데이터량이 작아 불필요.
- **scroll listener 직접 추가 금지** (이 step). 단순 정적 렌더.
