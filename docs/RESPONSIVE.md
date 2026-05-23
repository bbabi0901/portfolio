# Responsive Design Policy

<!-- agents-md-meta -->
**Owner agent**: harness (Builder) — 본 문서는 Plan/Design phase 에서 갱신됨
**Related**: AGENTS.md, UI_GUIDE.md, PAGES.md
**SSoT keys**: spec.responsive.breakpoints, spec.responsive.maxW, spec.responsive.deviceMatrix
**Last verified**: 2026-05-23 — 사용자 (김윤수)
<!-- /agents-md-meta -->

## Breakpoints (Tailwind 기본)
| 토큰 | min-width | 의도 |
|---|---|---|
| `sm` | 640px | 큰 폰 (가로 모드 포함) |
| `md` | 768px | 태블릿 |
| `lg` | 1024px | 노트북 |
| `xl` | 1280px | 데스크톱 |
| `2xl` | 1536px | 큰 모니터 |

기본 모바일 first. 사이즈 클래스 prefix 없음 = 모든 폭. `md:`, `lg:` prefix로 폭 별 override.

## 페이지별 max-w / padding

| 페이지 | sm 미만 | md | lg+ |
|---|---|---|---|
| `/` 채팅 | full px-4 | max-w-3xl px-6 | max-w-3xl px-8 |
| `/about` | full px-4 | max-w-2xl px-6 | max-w-2xl px-8 |
| `/experience` | full px-4 | max-w-3xl px-6 | max-w-4xl px-8 |
| `/contact` | full px-4 | max-w-2xl px-6 | max-w-2xl px-8 |
| `/not-found` | full px-4 | max-w-md px-6 | max-w-md px-8 |

모든 페이지 wrapper는 `mx-auto`.

## 컴포넌트별 변형

### Header
| 항목 | sm | md+ |
|---|---|---|
| 높이 | `h-14` (56px) | `h-16` (64px) |
| 좌측 brand | `text-base font-medium` | `text-lg font-medium` |
| 우측 햄버거 | `p-2` | `p-2.5` |

### SideSheet
| 항목 | sm | md+ |
|---|---|---|
| 폭 | `w-screen` | `w-[320px]` |
| overlay | `bg-black/60` | `bg-black/40` |
| close | 우상단 X 버튼 | 우상단 X 버튼 |

### SuggestionCarousel (Embla)
| 항목 | sm | md | lg+ |
|---|---|---|---|
| 슬라이드 basis | `basis-[80%]` (~1.2개 보임) | `basis-1/2` | `basis-1/3` |
| gap | `gap-2` | `gap-3` | `gap-3` |
| 화살표 버튼 | 숨김 (스와이프만) | 표시 | 표시 |

### MessageBubble
| 항목 | sm | md+ |
|---|---|---|
| max-w | `max-w-[85%]` | `max-w-[75%]` |
| 패딩 | `px-3 py-2` | `px-4 py-2.5` |

### Composer (FEAT-030 prominent box)
| 항목 | sm | md | lg+ |
|---|---|---|---|
| 외곽 박스 | `rounded-3xl border border-neutral-700 bg-neutral-900/40 px-3 py-2` | `px-4 py-3` | 동일 |
| 최대 행수 | 4 | 5 | 6 |
| 폰트 | `text-[15px]` (iOS zoom 방지) | `text-sm` | `text-sm` |
| 안전영역 | `pb-[env(safe-area-inset-bottom)]` | 동일 | 동일 |
| ModelSwitcher 라벨 | `"4.7"` 짧은 형태 (또는 아이콘 only) | `"Opus 4.7"` 풀 라벨 | 동일 |
| Send 버튼 | `size-8 rounded-full` | `size-9 rounded-full` | 동일 |

### Footer
| 항목 | sm | md+ |
|---|---|---|
| 레이아웃 | flex-col stack 3행, gap-3 | flex-row 1행, justify-between |
| 폰트 | `text-[11px]` | `text-xs` |

### Experience Timeline
| 항목 | sm | md+ |
|---|---|---|
| 방향 | 상단 horizontal indicator (점) | 좌측 vertical sticky |
| 회사 카드 | full width | `flex-1` (좌측 timeline 옆) |

### About 프로필 이미지
| 항목 | sm | md | lg+ |
|---|---|---|---|
| 크기 | 96px | 112px | 128px |

### Contact Form
| 항목 | sm | md+ |
|---|---|---|
| 폼 폭 | full | max-w-2xl |
| 라벨 | input 위 | input 위 동일 |
| 버튼 | full width | auto width 우측 정렬 |

### Toast
- 모든 폭: `fixed bottom-4 left-1/2 -translate-x-1/2 max-w-md`
- 모바일은 `bottom-[calc(env(safe-area-inset-bottom)+1rem)]`

## 폰트 사이즈
| 폭 | base |
|---|---|
| sm | 14px |
| md | 14.5px |
| lg+ | 15px |

`html { font-size: 14px } md:{font-size: 14.5px} lg:{font-size: 15px}` 또는 Tailwind `text-[14px] md:text-[14.5px] lg:text-[15px]` 적용.

## 화면 회전 / IME
- 가상키보드 등장 시 `visualViewport.height` 변화 → Composer offsetTop을 viewport 하단에 붙임.
- 가로 회전 → 시트는 너비 100vw 재계산, 채팅은 max-h-[100dvh] 사용 (dvh가 가상키보드 가림 보정).

## 검증 디바이스 매트릭스 (Playwright Visual)

| 디바이스 | 뷰포트 | 비고 |
|---|---|---|
| iPhone SE | 375×667 | 320~375 가장 좁은 사례 검증 |
| iPhone 14 Pro | 393×852 | 노치 + safe-area |
| Galaxy S23 | 360×780 | 안드로이드 표준 |
| iPad Mini | 768×1024 | 태블릿 경계 |
| MacBook 13" | 1280×800 | 노트북 표준 |
| 4K Desktop | 2560×1440 | 큰 모니터 검증 |

각 디바이스 × 4 페이지 = 24개 스냅샷 (`tests/visual/breakpoints.spec.ts`).

## 자주 놓치는 케이스
| 케이스 | 처리 |
|---|---|
| 320px 폰에서 carousel 화살표가 콘텐츠 가림 | sm 미만은 화살표 숨김, 스와이프만 |
| 모바일 가상키보드 등장 시 토스트가 안 보임 | dvh + safe-area 패딩 |
| 4K에서 좌우 여백 너무 큼 | max-w와 mx-auto로 자연 정렬 |
| Composer가 키보드에 가림 | sticky bottom + visualViewport |
| iPad에서 사이드 메뉴 폭 320px이 좁음 | md+에서 320 고정 (메뉴 항목 4개라 충분) |
| 가로 회전한 폰에서 채팅 메시지가 너무 옆으로 늘어남 | max-w 75%로 제한 |
| 폰트 사이즈 13px 이하 | iOS Safari 자동 zoom 방지 위해 입력은 ≥ 16px (Composer는 15px+) |

## 모바일 가속도/네트워크 고려
- 이미지: `next/image` 자동 responsive `srcset`. priority는 about 프로필 이미지만.
- 폰트: `display: swap`, subset(latin + KR).
- 클라이언트 JS: 250KB gzipped 이내, dynamic import는 carousel 등 무거운 컴포넌트만.

## 검증 (CI)
- `npm run e2e -- --grep responsive` → 24 visual 스냅샷.
- `npm run lhci` → 모바일/데스크톱 분리 측정.
- `npm run test specs/responsive.spec.tsx` → matchMedia mock 단위 테스트.
