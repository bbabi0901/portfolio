# Vercel 배포 가이드

<!-- agents-md-meta -->
**Owner agent**: harness (Builder) — 본 문서는 Plan/Design phase 에서 갱신됨
**Related**: AGENTS.md, CLAUDE.md, ADR.md, NOTION_SCHEMA.md
**SSoT keys**: (없음 — 배포 정책 자체)
**Last verified**: 2026-05-23 — 사용자 (김윤수)
<!-- /agents-md-meta -->

> 본 문서는 김윤수 AI Portfolio 의 Vercel 배포 절차와 환경변수 설정을 한 화면에 모은 운영자용 SSoT.

## 1. GitHub 연결

1. [Vercel 대시보드](https://vercel.com/) → **New Project**.
2. `bbabi0901/portfolio` 저장소 선택.
3. Framework Preset: **Next.js** (자동 감지).
4. Root Directory: `/` (default).

## 2. 환경변수 (Production / Preview)

### 필수
| 변수 | 설명 |
|------|------|
| `OPENAI_API_KEY` | GPT-4o-mini + 임베딩. 미설정 시 채팅 503. |
| `NOTION_TOKEN` | 콘텐츠 sync + 피드백/Contact DB. |
| `NOTION_PROJECTS_DB_ID` | 프로젝트 DB ID. |

### 권장
| 변수 | 미설정 시 동작 |
|------|------|
| `ANTHROPIC_API_KEY` | Claude 모델 비활성, GPT/Gemini 만 노출. |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini 비활성. |
| `NOTION_PROFILE_PAGE_IDS` | 콤마 구분 페이지 ID. 자기소개 sync 비활성. |
| `NOTION_FEEDBACK_DB_ID` | 피드백 UI 비활성. |
| `NOTION_CONTACT_DB_ID` | Contact 폼 503 + mailto fallback. |
| `RESEND_API_KEY` | Contact 알림 메일 silent. |
| `RESEND_TO_EMAIL` | 운영자 이메일. 기본 `bbabi0901@gmail.com`. |
| `MAX_TOKENS_PER_DAY` | 기본 200000. |
| `UPSTASH_REDIS_REST_URL` | rate limit + token cap 영속화. 미설정 시 인스턴스 메모리. |
| `UPSTASH_REDIS_REST_TOKEN` | 위와 한 쌍. |
| `NEXT_PUBLIC_SITE_URL` | OG image / sitemap base. 예: `https://yoonsoo.dev`. |

### 운영 가드
| 변수 | 값 |
|------|------|
| `RATE_LIMIT_BYPASS` | dev 만 `1`. production 미설정. |
| `MOCK_LLM` | dev/CI 만 `1`. production 미설정. |
| `MOCK_NOTION` | dev/CI 만 `1`. production 미설정. |
| `SKIP_NOTION_SYNC` | CI 만 `1`. production 미설정. |
| `FORCE_NOTION_SYNC` | 평소 미설정. 빌드에서 노션 sync 를 강제하고 싶을 때만 `1` (ADR-030 — 기본은 커밋된 `data/portfolio.server.json` 사용, sync 생략). |

## 3. Build settings

| 항목 | 값 |
|------|------|
| Build command | `npm run build` (prebuild = check:spec + **sync:if-needed**(기본 생략, ADR-030) + gen:suggestions) |
| Output directory | `.next` (default) |
| Install command | `npm ci` |
| Node 버전 | `.nvmrc` 의 22.12.0 (Vercel 자동 감지) |

## 4. 배포 후 첫 검증

```bash
curl https://<your-domain>/api/health         # { ok: true, runtime: "nodejs" } (전 라우트 Node, ADR-031)
curl https://<your-domain>/api/node/health    # { ok: true, runtime: "node" }
curl -I https://<your-domain>/opengraph-image # 200 + image/png
curl https://<your-domain>/sitemap.xml | head -10
curl https://<your-domain>/robots.txt
```

## 5. (옵션) 매일 자동 재배포 — Notion 콘텐츠 변경 반영

Notion 콘텐츠는 빌드 시점에 정적 JSON 으로 추출되므로, 새 페이지/수정사항을 반영하려면 재배포 필요.

### 옵션 A — Vercel Cron Job
Vercel 대시보드 → Cron → 매일 1회 `/api/internal/redeploy` 호출 (별도 라우트 추가 필요).

### 옵션 B — GitHub Actions
```yaml
# .github/workflows/redeploy-daily.yml (예시 — 별도 task 로 도입)
on:
  schedule:
    - cron: "0 16 * * *"   # KST 01:00
jobs:
  redeploy:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -X POST "${{ secrets.VERCEL_DEPLOY_HOOK_URL }}"
```

## 6. CI matrix

| Workflow | 트리거 | 검증 |
|----------|--------|------|
| `.github/workflows/ci.yml` | PR + push to main | check:spec → lint → format:check → tsc → test → build (MOCK env) |
| `.github/workflows/lhci.yml` | PR (post-mvp 활성화) | Lighthouse Performance ≥0.90, A11y/BP/SEO ≥0.95 |

## 7. 트러블슈팅

| 증상 | 원인 / 해결 |
|------|--------|
| 채팅 503 `feedback_unavailable` | `NOTION_TOKEN`/`NOTION_FEEDBACK_DB_ID` 미설정. Vercel env 확인. |
| Contact 폼 503 + mailto 토스트 | `NOTION_CONTACT_DB_ID` 미설정. |
| 모든 채팅 model 미노출 | LLM API 키 모두 미설정. 최소 OPENAI 권장. |
| `prebuild` 단계에서 sync:notion 실패 | NOTION_TOKEN 만료 / DB 봇 권한 누락. |
| OG image 404 | `NEXT_PUBLIC_SITE_URL` 미설정 또는 잘못된 도메인. |
| Lighthouse Score 미달 | 외부 자산 (이미지/폰트) latency, RSC streaming 검토. |

## 8. 도메인 설정 (선택)

Vercel 대시보드 → Domains → 추가. `NEXT_PUBLIC_SITE_URL` 를 도메인으로 갱신 후 재배포.

## 9. 비밀 키 회전

- LLM 키: 새 키 발급 → Vercel env 갱신 → 자동 재배포.
- NOTION_TOKEN: 동일 절차. 봇 통합 페이지 권한 확인.
- 회전 후 첫 dev 호출로 정상 응답 확인.

## 10. 모니터링

Vercel Logs 가 `lib/log.ts` 의 JSON line 자동 수집. `route`, `status`, `latencyMs`, `ipHash`, `model` 검색 가능. 정확 IP / token 은 절대 로그에 들어가지 않음.

## 11. AWS 인프라 (ADR-034)

RAG 스택 AWS 전환용 IaC 는 `infra/` 의 CDK(TypeScript) 독립 워크스페이스에 있다 (Phase 0 부트스트랩 완료, **AWS 배포는 아직 미수행**). 스택 구성·Terraform 등가 매핑·일상 명령은 [infra/README.md](../infra/README.md) 참조.

### 최초 배포 전제 조건 (1회)

1. AWS CLI 설치 + 자격 증명 구성 (`aws configure sso` 권장).
2. 콘솔 Billing preferences 에서 "Receive CloudWatch billing alerts" 활성화 (billing alarm 전제).
3. `infra/cdk.json` 의 `portfolio:vercelTeamSlug` 를 실제 Vercel 팀 슬러그로 교체.
4. `cdk bootstrap` — ap-northeast-2 + us-east-1 두 리전.
5. `cdk deploy PortfolioOpsStack PortfolioAccessStack` (Ops = us-east-1 월 $5 billing alarm + SNS, Access = 서울 Vercel OIDC provider + `portfolio-vercel-runtime` IAM Role).
6. SNS 구독 확인 메일 승인.
7. Vercel: Project Settings → Security → **OIDC Federation 활성화** (Team issuer).
8. Vercel env 설정: `PORTFOLIO_AWS_ROLE_ARN`(AccessStack output), `PORTFOLIO_AWS_REGION`=`ap-northeast-2`.
9. Bedrock 콘솔(서울) Model access 신청: Nova Lite/Micro, Claude Haiku, Titan Embed v2.

> `PORTFOLIO_AWS_ROLE_ARN` / `PORTFOLIO_AWS_REGION` / `S3_VECTORS_BUCKET` / `CORPUS_S3_BUCKET` 이 프로덕션 런타임에서 소비된다 (Bedrock 챗·Titan 쿼리 임베딩·S3 Vectors·corpus 로딩). 구 OPENROUTER/VOYAGE 키는 제거됨 (FEAT-039).

## 11. 노션 콘텐츠 반영

(CLAUDE.md 개발 프로세스 절에서 이관 — 2026-08-20)

- **기본 자동 (ADR-037)**: Lambda `portfolio-ingest-sync` 가 24h 주기(EventBridge)로 stale 감지 시 S3 corpus/벡터를 갱신하고, 런타임이 corpus.json 을 10분 TTL 로 읽는다.
- **즉시 반영 (수동)**: `aws lambda invoke --function-name portfolio-ingest-sync --region ap-northeast-2 out.json`
- **로컬 sync 플로우 (ADR-030, 커밋 폴백 데이터 갱신·로컬 dev 용)**: 빌드는 기본적으로 sync 를 생략하고 커밋된 `data/portfolio.fallback.json`(로컬에 server.json 있으면 그것)을 사용한다. 노션 변경 반영 절차 = `npm run sync:check`(신선도 판단, STALE 시 exit 1) → `npm run sync:notion` → `data/portfolio.fallback.json` 커밋 → 푸시(=배포).
- **prebuild 게이트 우선순위**: `SKIP_NOTION_SYNC=1`(생략) > `FORCE_NOTION_SYNC=1`(강제) > 데이터 부재(안전망 sync) > 생략.
