# lib/ — RAG 코어 (도메인 스코프 규칙)

> 이 파일은 `lib/` 하위 파일을 수정할 때만 로드된다. 전역 규칙은 루트 CLAUDE.md가 우선.

## 불변 계약 (테스트가 지키는 것들)
- **retriever** (`retriever.ts`): merged = 0.4×keyword + 0.6×vector, topK 8, 컨텍스트 ≤6000 tokens, minVectorScore 0.3. 차원 불일치는 throw. 파라미터 변경은 spec.json `retrieval` 절과 동기화.
- **빈 검색** → NO_RECORD 정적 응답, LLM 호출 없음 (ERR-08). **임베딩/벡터 경로 장애** → keyword-only 강등 + `X-Retrieval-Mode` 헤더 (ERR-14). 이 두 계약은 어떤 리팩토링에서도 깨지 말 것.
- **청킹** (`chunking.ts`): chunk ID = FNV-1a `stableHash(pageId::headingPath::idx)` — 결정적. ID 체계 변경 = S3 Vectors/캐시 전체 무효화이므로 ADR 없이 금지.
- **MOCK_LLM=1**: 외부 API(LLM·임베딩·AWS) 호출 0회. mock 경로에 네트워크 의존을 추가하면 CI/E2E 결정성이 깨진다.

## models.ts
- 모델 추가/교체는 REGISTRY + LEGACY_ID_MAP + spec.json `models[]` + ModelSwitcher 라벨 4곳 동시 갱신.
- 구 모델 ID는 삭제하지 말고 LEGACY_ID_MAP으로 흡수 — localStorage 저장분이 `X-Model-Substitution` 없이 매핑되어야 함.
- AWS 전환(ADR-034/035) 후: Bedrock 모델 ID는 inference profile 형식(`apac.`/`global.` prefix), `@ai-sdk/amazon-bedrock`은 **^4 고정** (5.x는 provider spec v4 — `ai@6`과 비호환).

## env
- 새 환경변수는 반드시 `env.ts`의 zod 스키마에 추가 (직접 `process.env` 접근 금지). AWS 계열은 `PORTFOLIO_AWS_*` prefix (Vercel이 `AWS_` 예약).

## 테스트
- 이 디렉토리의 변경은 `specs/*.spec.ts` (Vitest) 대응 필수. LLM 호출 방식 변경 시 `npm run test:smoke` 실 API 수동 검증 후 머지 (루트 CLAUDE.md CRITICAL).
