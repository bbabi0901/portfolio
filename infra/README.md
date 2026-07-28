# portfolio-infra — AWS 인프라 (ADR-034)

RAG 스택 AWS 전환의 IaC. CDK(TypeScript) 독립 워크스페이스.
루트 앱과 의존성이 분리되어 있다 (`infra/`에서 별도 `npm install`).

## 스택 구성

| 스택 | 리전 | 내용 | 페이즈 |
|---|---|---|---|
| `PortfolioOpsStack` | us-east-1 (빌링 메트릭 고정) | SNS 알림 토픽 + 월 $5 billing alarm | 0 |
| `PortfolioAccessStack` | ap-northeast-2 | Vercel OIDC provider + `portfolio-vercel-runtime` 역할 (Bedrock 최소 권한) | 0 |
| `PortfolioDataStack` | ap-northeast-2 | S3 Vectors 버킷/인덱스(1024, cosine) + corpus 표준 S3 버킷 | 3 (예정) |
| `PortfolioIngestStack` | ap-northeast-2 | Sync Lambda + EventBridge Scheduler(24h) + SSM SecureString + DLQ | 4 (예정) |

## 최초 배포 절차 (1회)

```bash
# 0. 사전 준비
#    - AWS CLI 설치: brew install awscli
#    - 자격 증명 구성: aws configure sso (권장) 또는 aws configure
#    - 콘솔 Billing preferences 에서 "Receive CloudWatch billing alerts" 활성화 (billing alarm 전제)
#    - cdk.json 의 portfolio:vercelTeamSlug 를 실제 팀 슬러그로 교체

cd infra
npm install
npx cdk bootstrap aws://<ACCOUNT_ID>/ap-northeast-2 aws://<ACCOUNT_ID>/us-east-1
npx cdk deploy PortfolioOpsStack PortfolioAccessStack

# 1. SNS 구독 확인 메일(bbabi0901@gmail.com) 승인
# 2. Vercel: Project Settings → Security → OIDC Federation 활성화 (Team issuer)
# 3. Vercel env 설정:
#    PORTFOLIO_AWS_ROLE_ARN = (AccessStack output: RuntimeRoleArn)
#    PORTFOLIO_AWS_REGION   = ap-northeast-2
# 4. Bedrock 콘솔(서울) Model access 에서 Nova Lite/Micro, Claude Haiku, Titan Embed v2 활성화
```

## 일상 명령

```bash
npm run build   # 타입 체크
npm run synth   # CloudFormation 합성 (자격 증명 불필요)
npm run diff    # 배포 전 변경 비교
npm run deploy  # 배포
```

## Terraform 등가 매핑 (학습 노트 — ADR-034 결정 7)

CDK 는 CloudFormation 이 state 역할을 하고, Terraform 은 별도 state(S3 backend + lock)를 관리한다.

| 이 리포의 CDK 구성 | Terraform 등가물 |
|---|---|
| `sns.Topic` + `EmailSubscription` | `aws_sns_topic` + `aws_sns_topic_subscription` |
| `cloudwatch.Alarm` (billing) | `aws_cloudwatch_metric_alarm` (provider alias 로 us-east-1 지정) |
| `iam.OpenIdConnectProvider` | `aws_iam_openid_connect_provider` |
| `iam.Role` + `WebIdentityPrincipal` | `aws_iam_role` (assume_role_policy 에 `jsonencode` 조건) |
| (P3) S3 Vectors 버킷/인덱스 | `aws_s3vectors_vector_bucket` / `aws_s3vectors_index` (AWS provider 6.x) |
| (P3) `s3.Bucket` | `aws_s3_bucket` + `aws_s3_bucket_versioning` 등 분리 리소스 |
| (P4) `NodejsFunction` (esbuild 내장) | `aws_lambda_function` + 외부 esbuild 스텝 (또는 `terraform-aws-modules/lambda`) |
| (P4) EventBridge `Schedule` | `aws_scheduler_schedule` |
| (P4) SSM SecureString | `aws_ssm_parameter` (type = "SecureString") |
| `cdk deploy` / `cdk diff` | `terraform apply` / `terraform plan` |

개념 설명은 노션 "개선 (AWS 마이그레이션)" 섹션의 하위 페이지 참조.
