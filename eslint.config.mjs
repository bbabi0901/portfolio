import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";
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
