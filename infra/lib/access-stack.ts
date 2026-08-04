import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export interface PortfolioAccessStackProps extends cdk.StackProps {
  /** Vercel 팀 슬러그 (예: "yoonsoo-kims-projects") — Vercel 대시보드 URL 에서 확인 */
  vercelTeamSlug: string;
  /** Vercel 프로젝트명 (기본 "portfolio") */
  vercelProjectName: string;
}

/**
 * Vercel → AWS 무키(keyless) 접근 스택 (ADR-034 결정 6).
 * Vercel OIDC federation: Vercel 함수가 발급받는 OIDC 토큰으로
 * AssumeRoleWithWebIdentity → 단기 자격 증명. 장기 액세스 키 미발급.
 *
 * Vercel 측 설정: Project Settings → Security → OIDC Federation 활성화(Team issuer).
 * Vercel env: PORTFOLIO_AWS_ROLE_ARN = (본 스택 output), PORTFOLIO_AWS_REGION = ap-northeast-2
 */
export class PortfolioAccessStack extends cdk.Stack {
  readonly runtimeRole: iam.Role;

  constructor(scope: Construct, id: string, props: PortfolioAccessStackProps) {
    super(scope, id, props);

    const issuer = `oidc.vercel.com/${props.vercelTeamSlug}`;

    const oidcProvider = new iam.OpenIdConnectProvider(this, "VercelOidc", {
      url: `https://${issuer}`,
      clientIds: [`https://vercel.com/${props.vercelTeamSlug}`],
    });

    // production 환경의 이 프로젝트 함수만 assume 허용 (preview 는 필요 시 sub 조건 추가)
    this.runtimeRole = new iam.Role(this, "VercelRuntimeRole", {
      roleName: "portfolio-vercel-runtime",
      assumedBy: new iam.WebIdentityPrincipal(oidcProvider.openIdConnectProviderArn, {
        StringEquals: {
          [`${issuer}:aud`]: `https://vercel.com/${props.vercelTeamSlug}`,
          [`${issuer}:sub`]: `owner:${props.vercelTeamSlug}:project:${props.vercelProjectName}:environment:production`,
        },
      }),
      description:
        "Vercel /api/chat runtime - least-privilege Bedrock invoke (+S3 Vectors query in Phase 3)",
      maxSessionDuration: cdk.Duration.hours(1),
    });

    // Phase 1: 챗(Nova/Claude) + 질의 임베딩(Titan v2) 호출 권한.
    // 서울 리전 미지원 모델 대비 APAC 교차 리전 inference profile ARN 포함.
    this.runtimeRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "BedrockInvoke",
        actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
        resources: [
          // 교차 리전 inference profile 이 임의 APAC 리전으로 라우팅하므로 리전은 와일드카드,
          // 모델 패밀리는 사용 대상으로 한정 (최소 권한)
          "arn:aws:bedrock:*::foundation-model/amazon.titan-embed-text-v2:0",
          "arn:aws:bedrock:*::foundation-model/amazon.nova-lite-v1:0",
          "arn:aws:bedrock:*::foundation-model/amazon.nova-micro-v1:0",
          "arn:aws:bedrock:*::foundation-model/anthropic.claude-*",
          `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/apac.*`,
          // Haiku 4.5 는 apac 프로필이 없어 global 프로필 사용 (라우팅 리전이 가변이라 리전 와일드카드)
          `arn:aws:bedrock:*:${this.account}:inference-profile/global.*`,
        ],
      }),
    );
    // Phase 3 에서 추가: s3vectors:QueryVectors/GetVectors (DataStack 인덱스 ARN),
    //                    s3:GetObject (corpus.json/manifest.json)

    new cdk.CfnOutput(this, "RuntimeRoleArn", {
      value: this.runtimeRole.roleArn,
      description: "Vercel env PORTFOLIO_AWS_ROLE_ARN 에 설정",
      exportName: "PortfolioVercelRuntimeRoleArn",
    });
  }
}
