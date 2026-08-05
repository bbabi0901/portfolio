#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { PortfolioAccessStack } from "../lib/access-stack";
import { PortfolioDataStack } from "../lib/data-stack";
import { PortfolioIngestStack } from "../lib/ingest-stack";
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

new PortfolioDataStack(app, "PortfolioDataStack", {
  env: { account, region },
  indexName: "portfolio-chunks",
});

// Phase 4 (ADR-037): Sync Lambda + EventBridge 24h + corpus 버킷.
// notion DB/페이지 ID 는 비밀 아님(토큰 없이는 무용) — cdk.json context 로 주입.
new PortfolioIngestStack(app, "PortfolioIngestStack", {
  env: { account, region },
  notionTokenParam: "/portfolio/notion-token",
  alertEmail: app.node.tryGetContext("portfolio:alertEmail"),
  notionEnv: {
    projectsDbId: app.node.tryGetContext("portfolio:notionProjectsDbId") ?? "",
    profilePageIds: app.node.tryGetContext("portfolio:notionProfilePageIds") ?? "",
    troubleshootingDbId: app.node.tryGetContext("portfolio:notionTroubleshootingDbId") ?? "",
    extraPageIds: app.node.tryGetContext("portfolio:notionExtraPageIds") ?? "",
  },
});
