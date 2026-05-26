import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.e2e\.ts$/,
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "iPhone SE",
      use: {
        ...devices["iPhone SE (3rd generation)"],
        viewport: { width: 375, height: 667 },
      },
    },
    {
      name: "iPhone 14 Pro",
      use: {
        ...devices["iPhone 14 Pro"],
        viewport: { width: 393, height: 852 },
      },
    },
    {
      name: "Galaxy S23",
      use: {
        ...devices["Galaxy S9+"],
        viewport: { width: 360, height: 780 },
      },
    },
    {
      name: "iPad Mini",
      use: {
        ...devices["iPad Mini"],
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: "MacBook 13",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "4K",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 2560, height: 1440 },
      },
    },
  ],
  webServer: {
    command:
      "MOCK_LLM=1 MOCK_NOTION=1 SKIP_NOTION_SYNC=1 RATE_LIMIT_BYPASS=1 npm run dev -- -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SITE_URL: "http://localhost:3100",
    },
  },
});
