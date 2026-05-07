## 개요

샘플 프로젝트 설명. Next.js 16 + TypeScript로 만든 대화형 포트폴리오 사이트의 한 화면.

## 기술 스택

- Next.js 16 (App Router)
- TypeScript strict
- Tailwind CSS
- Hono on Route Handler

## 트러블슈팅

### Module Federation 충돌

런타임 의존성 중복 문제는 singleton shared dependencies 옵션으로 해결.

```ts
shared: {
  react: { singleton: true, requiredVersion: "^19" }
}
```
