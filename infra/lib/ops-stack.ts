import * as cdk from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cwActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import { Construct } from "constructs";

export interface PortfolioOpsStackProps extends cdk.StackProps {
  /** 알람 수신 이메일 (SNS 구독 — 최초 배포 후 확인 메일 승인 필요) */
  alertEmail: string;
  /** 월 추정 요금 임계값 (USD). 초과 시 이메일 알림 */
  billingAlarmUsd: number;
}

/**
 * 운영 알람 스택 (us-east-1 고정 — AWS/Billing 메트릭은 버지니아에만 게시).
 * 비용 최소화: AWS Budgets(62 budget-days 이후 유료) 대신
 * CloudWatch billing alarm(프리티어 알람 10개 내 무료) 사용. (ADR-034)
 *
 * 사전 조건: 콘솔 Billing preferences 에서
 * "Receive CloudWatch billing alerts" 활성화 필요 (1회, 수동).
 */
export class PortfolioOpsStack extends cdk.Stack {
  readonly alertTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: PortfolioOpsStackProps) {
    super(scope, id, props);

    this.alertTopic = new sns.Topic(this, "AlertTopic", {
      topicName: "portfolio-ops-alerts",
    });
    this.alertTopic.addSubscription(new subscriptions.EmailSubscription(props.alertEmail));

    const estimatedCharges = new cloudwatch.Metric({
      namespace: "AWS/Billing",
      metricName: "EstimatedCharges",
      dimensionsMap: { Currency: "USD" },
      statistic: "Maximum",
      period: cdk.Duration.hours(6),
    });

    const billingAlarm = new cloudwatch.Alarm(this, "BillingAlarm", {
      alarmName: "portfolio-billing-over-threshold",
      alarmDescription: `월 추정 요금이 $${props.billingAlarmUsd} 초과 (ADR-034 비용 가드)`,
      metric: estimatedCharges,
      threshold: props.billingAlarmUsd,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    billingAlarm.addAlarmAction(new cwActions.SnsAction(this.alertTopic));

    new cdk.CfnOutput(this, "AlertTopicArn", {
      value: this.alertTopic.topicArn,
      description: "운영 알람 SNS 토픽 (Phase 4 IngestStack 이 재사용)",
      exportName: "PortfolioAlertTopicArn",
    });
  }
}
