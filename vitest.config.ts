import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["specs/**/*.{spec,test}.{ts,tsx}"],
    exclude: ["node_modules", ".next", "tests/e2e/**", "tests/visual/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["lib/**/*.ts", "services/**/*.ts", "components/**/*.tsx"],
      exclude: ["**/*.d.ts", "**/*.config.*", "components/ui/**"],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
