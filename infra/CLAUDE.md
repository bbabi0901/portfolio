# infra/ — AWS CDK 워크스페이스 (도메인 스코프 규칙)

> 이 파일은 infra/ 를 수정할 때만 로드된다. 배포 절차·Terraform 매핑은 README.md 참조.

## 워크스페이스
- 루트와 **독립** — 자체 `npm install`, 루트 tsconfig/eslint/prettier 대상에서 제외됨 (`cdk.out` 산출물 오탐 방지). 루트 도구를 infra에 적용하지 말 것.
- 검증: `npm run build`(tsc) + `npx cdk synth` 가 경고 없이 통과해야 커밋. 배포 전 `cdk diff` 확인.

## 리전 규칙 (ADR-034)
- 기본 리전 **ap-northeast-2 (서울)**. 예외: `PortfolioOpsStack`은 **us-east-1 고정** — AWS/Billing 메트릭이 버지니아에만 게시되기 때문. 스택 추가 시 리전을 명시적으로 지정.

## 원칙
- **최소 권한**: IAM 정책은 액션·리소스 ARN을 사용 대상으로 한정. `*` 리소스는 교차 리전 inference profile처럼 라우팅이 가변인 경우만, 주석으로 사유 명시.
- **비용 최소화**: Secrets Manager 대신 SSM SecureString, AWS Budgets 대신 CloudWatch billing alarm, 로그 retention 7일, Lambda는 VPC 밖(NAT 회피).
- CloudFormation 리소스 설명(description)은 **ASCII만** — 한글은 CFN 패턴 검증에 걸린다 (주석은 한글 OK).
- 문자열 리소스 참조 대신 CfnOutput/exportName으로 스택 간 연결.

## 배포
- 배포는 로컬 `aws login` 세션 필요 (만료 시 재로그인). 스택 변경은 코드 리뷰(PR) 후 배포가 원칙 — 콘솔 수동 변경 금지 (drift).
