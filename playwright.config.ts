import { defineConfig, devices } from "@playwright/test";

const liveBase = process.env.BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
  projects: [
    {
      name: "mock",
      grepInvert: /@live/,
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3100" },
    },
    { name: "live", grep: /@live/, use: { ...devices["Desktop Chrome"], baseURL: liveBase } },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "pnpm build && pnpm start -p 3100",
        url: "http://localhost:3100",
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
        env: {
          TUTOR_TEST_PROVIDERS: "1",
          NARRATION_TOKEN_SECRET: "test-secret-test-secret-test-secret-0000",
          RATE_LIMIT_LESSON_PER_10MIN: "1000",
          RATE_LIMIT_NARRATION_PER_10MIN: "1000",
          RATE_LIMIT_FOLLOWUP_PER_10MIN: "1000",
          DAILY_LESSON_CAP: "10000",
        },
      },
});
