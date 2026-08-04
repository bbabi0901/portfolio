import type { AwsCredentialIdentity } from "@aws-sdk/types";

export interface AwsCredentialOptions {
  /** Vercel OIDC federation 으로 assume 할 IAM 역할 ARN (프로덕션) */
  roleArn?: string;
  /** 로컬 dev/smoke 용 AWS 프로필명 — fromNodeProviderChain 에 전달 */
  profile?: string;
}

/**
 * Bedrock 호출용 AWS 자격 증명 공급자 (ADR-034 결정 6).
 * - Vercel 런타임: OIDC → AssumeRoleWithWebIdentity. 장기 키 없음.
 * - 로컬: AWS 프로필 체인 (aws login / configure 결과 재사용).
 * 반환 함수는 호출 시점에 lazy 로 SDK 를 로드한다 — MOCK_LLM 경로에서 AWS 모듈 로드 0회 보장.
 *
 * 주의: OIDC 분기를 env(VERCEL_OIDC_TOKEN) 존재로 판단하지 말 것 — Vercel 런타임에서
 * 토큰은 env 가 아니라 요청 컨텍스트(x-vercel-oidc-token)로 전달되며,
 * awsCredentialsProvider 가 내부에서 컨텍스트를 읽는다. roleArn 설정 여부가 유일한 스위치.
 */
export function createAwsCredentialProvider(
  opts: AwsCredentialOptions,
): () => Promise<AwsCredentialIdentity> {
  return async () => {
    if (opts.roleArn) {
      const { awsCredentialsProvider } = await import("@vercel/functions/oidc");
      return awsCredentialsProvider({ roleArn: opts.roleArn })();
    }
    const { fromNodeProviderChain } = await import("@aws-sdk/credential-providers");
    return fromNodeProviderChain(opts.profile ? { profile: opts.profile } : {})();
  };
}
