import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

const config = [
  {
    ignores: [".next", "node_modules", "out", "playwright-report", "coverage", "test-results"],
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
