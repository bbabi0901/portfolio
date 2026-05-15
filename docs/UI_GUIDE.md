# UI 디자인 가이드

## 디자인 원칙
1. **도구처럼 보여야 한다**. 마케팅 페이지 아님. 매일 쓰는 대시보드 같은 느낌.
2. **콘텐츠가 주인공**. 장식은 최소. 무채색 + 포인트 1색.
3. **AI 색깔 안 입힘**. 보라/네온/glow 안 씀. 안티패턴 표 절대 위반 금지.

## AI 슬롭 안티패턴 — 하지 마라
| 금지 사항 | 이유 |
|-----------|------|
| backdrop-filter: blur() | glass morphism은 AI 템플릿의 가장 흔한 징후 |
| gradient-text (배경 그라데이션 텍스트) | AI가 만든 SaaS 랜딩의 1번 특징 |
| "Powered by AI" 배지 | 기능이 아니라 장식. 사용자에게 가치 없음 |
| box-shadow 글로우 애니메이션 | 네온 글로우 = AI 슬롭 |
| 보라/인디고 브랜드 색상 | "AI = 보라색" 클리셰 |
| 모든 카드에 동일한 rounded-2xl | 균일한 둥근 모서리는 템플릿 느낌 |
| 배경 gradient orb (blur-3xl 원형) | 모든 AI 랜딩 페이지에 있는 장식 |
| 의미 없는 fade-in stagger 애니메이션 | 첫 인상 호도, INP 악화 |
| "magic" emoji 다용 | 진지함 결여 |

## 색상 (다크 고정)

### 배경
| 용도 | Tailwind / 값 |
|------|------|
| 페이지 | `bg-[#0a0a0a]` |
| 카드/패널 | `bg-[#141414]` |
| 입력/Composer | `bg-neutral-900` |
| 메뉴 overlay | `bg-black/60` |

### 텍스트
| 용도 | Tailwind |
|------|------|
| 주 텍스트 | `text-white` |
| 본문 | `text-neutral-300` |
| 보조 | `text-neutral-400` |
| 비활성 | `text-neutral-500` |
| 코드 | `text-neutral-200 font-mono` |

### 보더
| 용도 | Tailwind |
|------|------|
| 카드/패널 | `border border-neutral-800` |
| 입력 | `border border-neutral-800` (focus: `border-neutral-600`) |
| 활성 메뉴 항목 | `border-l-2 border-lime-300` |

### 데이터/시맨틱 색상
| 용도 | Tailwind |
|------|------|
| 포인트 (사용자 메시지 강조, 활성 메뉴 표시) | `text-lime-300` (배경 사용 자제) |
| 성공 토스트 | `text-emerald-300 border-emerald-900/50 bg-emerald-950/50` |
| 에러 토스트 | `text-red-300 border-red-900/50 bg-red-950/50` |
| 경고 토스트 | `text-amber-300 border-amber-900/50 bg-amber-950/50` |
| 중립 토스트 | `text-neutral-300 border-neutral-800 bg-neutral-900` |

## 컴포넌트
### 카드
```
rounded-lg bg-[#141414] border border-neutral-800 p-6
```

### 버튼
```
Primary:   rounded-lg bg-white text-black hover:bg-neutral-200 px-4 py-2 text-sm font-medium disabled:opacity-50
Secondary: rounded-lg border border-neutral-800 text-neutral-200 hover:bg-neutral-900 px-4 py-2 text-sm
Ghost:     text-neutral-500 hover:text-neutral-300 px-2 py-1 text-sm
IconBtn:   rounded-md p-2 text-neutral-400 hover:text-white hover:bg-neutral-900
Destruct:  rounded-lg border border-red-900/50 text-red-300 hover:bg-red-950/50 px-4 py-2
```

### 입력 필드
```
rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-3 text-sm text-white
placeholder:text-neutral-500 focus:outline-none focus:border-neutral-600
```

### Composer 외곽 박스 (FEAT-030, ChatGPT/Claude 류 prominent)
```
form: rounded-3xl border border-neutral-700 bg-neutral-900/40 px-4 py-3
      shadow-[0_0_0_1px_rgba(255,255,255,0.04)] transition-colors
      focus-within:border-neutral-500 focus-within:bg-neutral-900/60
      pb-[env(safe-area-inset-bottom)]
```

### Composer textarea (FEAT-021 IME, FEAT-030)
```
w-full resize-none bg-transparent text-[15px] md:text-sm text-white
placeholder:text-neutral-500 outline-none
min-h-[24px] max-h-[160px] leading-relaxed
```

### Composer 하단 액션 row (FEAT-030)
```
flex items-center justify-between gap-2 pt-2
  좌: ModelSwitcher 인라인 (lib children prop). Button ghost size-sm + lucide ChevronDown.
  우: Send Button — rounded-full size-9. 우선순위 시각적 단일 primary.
```

### Suggestion Carousel wrapper (FEAT-003, FEAT-030 위치 변경)
```
border-t border-neutral-900 py-3   # 이제 Composer 직상단, 위쪽 경계
```

### 메시지 버블
```
User:      max-w-[85%] md:max-w-[75%] ml-auto rounded-2xl rounded-br-md
           bg-neutral-100 text-neutral-900 px-4 py-2 text-sm
Assistant: max-w-[85%] md:max-w-[75%] mr-auto
           text-neutral-200 text-sm leading-relaxed
           prose prose-invert prose-sm prose-pre:bg-neutral-950 prose-pre:border prose-pre:border-neutral-800
```

### Suggestion Badge (Carousel)
```
shrink-0 rounded-full border border-neutral-800
px-3 py-1.5 text-xs text-neutral-300
hover:border-neutral-600 hover:text-white
data-[visited=true]:opacity-50
focus-visible:ring-1 focus-visible:ring-neutral-400
```

### Source Citation (출처 칩)
```
inline-flex items-center gap-1 rounded-md
border border-neutral-800 bg-neutral-900 px-2 py-0.5
text-[11px] text-neutral-400 hover:text-white hover:border-neutral-600
```

### 사이드 메뉴 항목
```
flex items-center gap-3 rounded-md px-3 py-2.5
text-sm text-neutral-300 hover:text-white hover:bg-neutral-900
data-[active=true]:text-white data-[active=true]:border-l-2 data-[active=true]:border-lime-300
```

### Typing Dots
```
inline-flex gap-1
each dot: w-1 h-1 rounded-full bg-neutral-400 animate-typing-dot
keyframes 'typing-dot':
  0%, 100% { opacity: 0.3 }
  50%      { opacity: 1.0 }
delay: 1번째 0ms, 2번째 150ms, 3번째 300ms
duration: 0.4s, infinite
```

### Toast
```
fixed bottom-4 left-1/2 -translate-x-1/2 z-50
rounded-lg border px-4 py-3 text-sm
max-w-md shadow-lg
animate-fade-in (0.2s)
auto-dismiss 5s, 수동 close 안 함 (한 번에 1개만)
```

## 레이아웃
- 페이지 전체 너비 컨테이너: 채팅 `max-w-3xl`, About/Contact `max-w-2xl`, Experience `max-w-4xl` (lg 이상). 모두 `mx-auto`.
- 좌우 padding: 모바일 `px-4`, 태블릿 `md:px-6`, 데스크톱 `lg:px-8`.
- 정렬: 좌측 정렬 기본. 중앙 정렬 사용처 → 페이지 wrapper만.
- 간격: 메시지 사이 `space-y-4`, 섹션 사이 `space-y-8`.

## 타이포그래피
| 용도 | 스타일 |
|------|--------|
| 페이지 제목 (about hero 등) | `text-3xl md:text-4xl font-semibold text-white tracking-tight` |
| 섹션 제목 | `text-lg font-medium text-white` |
| 카드 제목 | `text-sm font-medium text-neutral-300` |
| 본문 | `text-sm text-neutral-300 leading-relaxed` |
| 보조 본문 | `text-xs text-neutral-500` |
| 코드 인라인 | `font-mono text-[13px] px-1 py-0.5 rounded bg-neutral-900 border border-neutral-800` |
| 코드 블록 | `font-mono text-[13px] bg-neutral-950 border border-neutral-800 rounded-md p-3 overflow-x-auto` |

## 폰트
- Pretendard Variable (next/font/local). variable: `--font-pretendard`.
- mono: JetBrains Mono (옵션, 시스템 mono 폴백).
- fallback: `system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif`.

## 애니메이션 (화이트리스트)
| 이름 | duration | ease | 사용처 |
|------|---|---|---|
| fade-in | 0.25s | ease-out | 메시지 등장, 토스트 |
| typing-dot | 0.4s loop | ease-in-out | TypingDots |
| sheet-in | 0.28s | ease-out | 사이드 메뉴 슬라이드 (translate-x) |
| overlay-in | 0.2s | ease-out | overlay opacity 0→0.6 |
| jump-fade-in | 0.2s | ease-out | "↓ 최신으로" 버튼 |
| pulse-once | 0.6s | ease-out | carousel 첫 인사 직후 1회 |

prefers-reduced-motion=reduce → 모든 애니메이션 duration 0, transition 0.

## 아이콘
- lucide-react.
- strokeWidth 1.5.
- 인터랙티브 아이콘은 컨테이너 박스로 감싸지 않는다 (배경 박스 금지).
- 클릭 가능한 아이콘은 hit-area 32×32 이상 (`p-2`로 확보).

## 포커스 / a11y
- focus-visible outline: `focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 focus-visible:ring-offset-0`.
- 모든 인터랙티브 요소에 aria-label 또는 가시 텍스트.
- 메시지 영역: `role="log" aria-live="polite"`.
- TypingDots 컨테이너: `aria-live="polite" aria-label="응답 작성 중"`.
- 색 대비 WCAG AA.

## 모바일 / 안전영역
- `<html lang="ko">`, `<meta name="theme-color" content="#0a0a0a">`, `<meta name="color-scheme" content="dark">`.
- Composer 컨테이너 `pb-[env(safe-area-inset-bottom)]`.
- `viewport`: `width=device-width, initial-scale=1, viewport-fit=cover`.

## 푸터
- 단일 row (md+) / 3행 stack (sm)
- 좌: "마지막 업데이트: 2026-05-06" (KST, portfolio.server.json `generatedAt`)
- 중: GitHub · Mail · LinkedIn 아이콘 링크
- 우: "이 사이트는 익명으로 메시지를 처리해요. 학습 데이터로 쓰이지 않습니다." (호버 popover로 자세히)
- 색: `text-[12px] text-neutral-500`

## 에러/빈 상태
- 빈 상태 컴포넌트: lucide 아이콘 (`Inbox`, `SearchX`) + 보조 문구 + 작은 행동 버튼.
- 에러 상태: `text-red-300` 한 줄 + "다시 시도" 버튼.
