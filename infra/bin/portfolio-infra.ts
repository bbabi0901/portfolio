#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { PortfolioAccessStack } from "../lib/access-stack";
import { PortfolioOpsStack } from "../lib/ops-stack";

const app = new cdk.App();

const region = app.node.tryGetContext("portfolio:region") ?? "ap-northeast-2";
const account = process.env.CDK_DEFAULT_ACCOUNT;

// 빌링 메트릭(AWS/Billing EstimatedCharges)은 us-east-1 에만 게시되므로
// OpsStack(빌링 알람)은 리전 고정. 나머지 스택은 portfolio:region (서울).
new PortfolioOpsStack(app, "PortfolioOpsStack", {
  env: { account, region: "us-east-1" },
  alertEmail: app.node.tryGetContext("portfolio:alertEmail"),
  billingAlarmUsd: Number(app.node.tryGetContext("portfolio:billingAlarmUsd") ?? 5),
});

new PortfolioAccessStack(app, "PortfolioAccessStack", {
  env: { account, region },
  vercelTeamSlug: app.node.tryGetContext("portfolio:vercelTeamSlug"),
  vercelProjectName: app.node.tryGetContext("portfolio:vercelProjectName"),
});

// Phase 3 에서 추가: PortfolioDataStack (S3 Vectors 버킷/인덱스 + corpus 버킷)
// Phase 4 에서 추가: PortfolioIngestStack (Sync Lambda + EventBridge Scheduler + SSM)
