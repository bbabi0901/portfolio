import * as cdk from "aws-cdk-lib";
import * as s3vectors from "aws-cdk-lib/aws-s3vectors";
import { Construct } from "constructs";

export interface PortfolioDataStackProps extends cdk.StackProps {
  /** 벡터 인덱스 이름 (env S3_VECTORS_INDEX 와 일치) */
  indexName: string;
}

/**
 * RAG 벡터 스토어 (ADR-034 결정 2, Phase 3).
 * S3 Vectors 벡터 버킷 + 인덱스 — Titan v2 1024차원, cosine.
 * 벡터 key = 결정적 chunk.id, filterable metadata {category, sourcePageId}.
 * 청크 원문은 넣지 않는다 — keyword 검색용 corpus 는 별도(Phase 4 에서 S3 이전).
 */
export class PortfolioDataStack extends cdk.Stack {
  readonly vectorBucketName: string;
  readonly indexName: string;
  readonly indexArn: string;

  constructor(scope: Construct, id: string, props: PortfolioDataStackProps) {
    super(scope, id, props);

    this.vectorBucketName = `portfolio-vectors-${this.account}`;
    this.indexName = props.indexName;

    const bucket = new s3vectors.CfnVectorBucket(this, "VectorBucket", {
      vectorBucketName: this.vectorBucketName,
    });

    const index = new s3vectors.CfnIndex(this, "ChunkIndex", {
      vectorBucketName: this.vectorBucketName,
      indexName: this.indexName,
      dataType: "float32",
      dimension: 1024, // Titan v2 (ADR-034) — 차원 변경 = 인덱스 재생성 필요
      distanceMetric: "cosine",
    });
    index.addDependency(bucket);

    this.indexArn = `arn:aws:s3vectors:${this.region}:${this.account}:bucket/${this.vectorBucketName}/index/${this.indexName}`;

    new cdk.CfnOutput(this, "VectorBucketName", {
      value: this.vectorBucketName,
      description: "env S3_VECTORS_BUCKET",
      exportName: "PortfolioVectorBucketName",
    });
    new cdk.CfnOutput(this, "IndexName", {
      value: this.indexName,
      description: "env S3_VECTORS_INDEX",
      exportName: "PortfolioVectorIndexName",
    });
    new cdk.CfnOutput(this, "IndexArn", {
      value: this.indexArn,
      exportName: "PortfolioVectorIndexArn",
    });
  }
}
