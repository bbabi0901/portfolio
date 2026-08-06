/**
 * 자기지칭 질의 확장 (EC-51, TS-94).
 * "이 프로젝트/이 사이트" 류 질문은 이 포트폴리오 사이트 자체를 뜻하지만, 검색어에
 * 식별 키워드가 없어 타 프로젝트 청크("이 프로젝트는 …로 만들었다")에 매칭이 뺏긴다.
 * 검색(키워드+쿼리 임베딩) 입력에만 힌트를 덧붙이고, LLM 에 전달되는 사용자
 * 메시지는 건드리지 않는다. 멀티턴에서 직전 화제가 타 프로젝트인 경우까지는
 * 구분하지 않는다 — 검색이 대화 이력을 보지 않는 현 구조의 한계로 수용.
 */
const SELF_REF =
  /(이|본|현재)\s*(프로젝트|사이트|서비스|포트폴리오|챗봇)|this\s+(site|project|portfolio|chatbot)/i;

const PORTFOLIO_HINT = "대화형 포트폴리오 AI 포트폴리오 사이트";

export function expandSelfReferentialQuery(query: string): string {
  if (!SELF_REF.test(query)) return query;
  return `${query} ${PORTFOLIO_HINT}`;
}
