import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-config-prettier";

const config = [
  {
    ignores: [
      ".next",
      "node_modules",
      "out",
      "playwright-report",
      "coverage",
      "test-results",
      ".claude/**", // ad-hoc worktrees, session state, plugin state — not project source
      "infra/**", // CDK 독립 워크스페이스 (자체 tsc/vitest) — cdk.out 산출물 포함 제외
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // jsx-a11y 강화: next 기본 6개 warn → recommended 전체 (FEAT-013, 사용자 승인 하 게이트 파일 수정)
    // 플러그인 자체는 eslint-config-next 가 이미 등록 — rules 만 얹어 재정의 충돌 회피
    rules: { ...jsxA11y.flatConfigs.recommended.rules },
  },
  {
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
  },
  {
    files: ["components/ui/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
  prettier,
];

export default config;
