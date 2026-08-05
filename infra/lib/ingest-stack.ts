import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cwActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import { Construct } from "constructs";

export interface PortfolioIngestStackProps extends cdk.StackProps {
  /** SSM SecureString 파라미터명 — 배포 전에 CLI 로 생성 (CFN 은 SecureString 생성 미지원) */
  notionTokenParam: string;
  /** Sync 실패 알람 수신 이메일 (OpsStack 토픽은 us-east-1 이라 서울 알람에서 못 씀) */
  alertEmail: string;
  notionEnv: {
    projectsDbId: string;
    profilePageIds: string;
    troubleshootingDbId: string;
    extraPageIds: string;
  };
}

/**
 * 자동 인제스천 스택 (ADR-037, FEAT-038, AWS Phase 4).
 * EventBridge rate(24h) -> Sync Lambda: freshness precheck -> stale 시
 * Notion fetch -> chunk -> Titan embed -> S3 Vectors upsert + corpus.json 갱신.
 * 노션 수정이 재배포 없이 최대 24h+10min(런타임 corpus TTL) 내 반영된다.
 */
export class PortfolioIngestStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PortfolioIngestStackProps) {
    super(scope, id, props);

    const repoRoot = path.join(__dirname, "..", "..");

    const corpusBucket = new s3.Bucket(this, "CorpusBucket", {
      bucketName: `portfolio-corpus-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const syncFn = new nodejs.NodejsFunction(this, "SyncFn", {
      functionName: "portfolio-ingest-sync",
      entry: path.join(repoRoot, "lambda", "ingest", "handler.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 1024,
      timeout: cdk.Duration.minutes(10),
      projectRoot: repoRoot,
      depsLockFilePath: path.join(repoRoot, "package-lock.json"),
      bundling: {
        tsconfig: path.join(repoRoot, "tsconfig.json"),
        target: "node22",
        // "server-only" 는 Next 전용 가드 모듈 — 일반 Node 에서는 import 자체가 throw 라 빈 스텁으로 치환
        esbuildArgs: {
          "--alias:server-only": path.join(repoRoot, "tests", "stubs", "server-only.ts"),
        },
        minify: false,
        sourcesContent: false,
      },
      environment: {
        NOTION_TOKEN_PARAM: props.notionTokenParam,
        NOTION_PROJECTS_DB_ID: props.notionEnv.projectsDbId,
        NOTION_PROFILE_PAGE_IDS: props.notionEnv.profilePageIds,
        NOTION_TROUBLESHOOTING_DB_ID: props.notionEnv.troubleshootingDbId,
        NOTION_EXTRA_PAGE_IDS: props.notionEnv.extraPageIds,
        S3_VECTORS_BUCKET: `portfolio-vectors-${this.account}`,
        S3_VECTORS_INDEX: "portfolio-chunks",
        CORPUS_BUCKET: corpusBucket.bucketName,
        CORPUS_KEY: "corpus.json",
      },
    });

    corpusBucket.grantReadWrite(syncFn);
    syncFn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "TitanEmbed",
        actions: ["bedrock:InvokeModel"],
        resources: ["arn:aws:bedrock:*::foundation-model/amazon.titan-embed-text-v2:0"],
      }),
    );
    syncFn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "S3VectorsWrite",
        actions: [
          "s3vectors:PutVectors",
          "s3vectors:DeleteVectors",
          "s3vectors:ListVectors",
          "s3vectors:QueryVectors",
          "s3vectors:GetIndex",
        ],
        resources: [
          `arn:aws:s3vectors:${this.region}:${this.account}:bucket/portfolio-vectors-${this.account}/index/*`,
        ],
      }),
    );
    syncFn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "NotionTokenRead",
        actions: ["ssm:GetParameter"],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter${props.notionTokenParam}`,
        ],
      }),
    );

    new events.Rule(this, "DailySync", {
      ruleName: "portfolio-ingest-daily",
      schedule: events.Schedule.rate(cdk.Duration.hours(24)),
      targets: [new targets.LambdaFunction(syncFn, { retryAttempts: 2 })],
    });

    // 실패 알람 — 빌링 토픽(us-east-1)은 서울 알람 액션으로 못 쓰므로 지역 토픽 별도
    const alertTopic = new sns.Topic(this, "IngestAlerts", {
      topicName: "portfolio-ingest-alerts",
    });
    alertTopic.addSubscription(new subscriptions.EmailSubscription(props.alertEmail));
    new cloudwatch.Alarm(this, "SyncErrors", {
      alarmName: "portfolio-ingest-sync-errors",
      metric: syncFn.metricErrors({ period: cdk.Duration.hours(24), statistic: "Sum" }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(new cwActions.SnsAction(alertTopic));

    new cdk.CfnOutput(this, "CorpusBucketName", {
      value: corpusBucket.bucketName,
      description: "Vercel env CORPUS_S3_BUCKET 에 설정",
      exportName: "PortfolioCorpusBucketName",
    });
    new cdk.CfnOutput(this, "SyncFunctionName", {
      value: syncFn.functionName,
      description: "수동 즉시 반영: aws lambda invoke --function-name <이 값>",
    });
  }
}
