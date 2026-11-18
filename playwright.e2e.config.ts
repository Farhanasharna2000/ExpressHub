import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Full-stack journeys against a production build and a real database. CI provides
// the environment; locally it comes from .env (existing variables always win).
try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: rely on the environment.
}

const port = Number(process.env.E2E_PORT ?? 3200);
export const e2eBaseUrl = `http://localhost:${port}`;
const upstashPort = Number(process.env.E2E_UPSTASH_PORT ?? 3299);
const e2eUpstashToken = "e2e-upstash-token";

// Local workaround for missing Chromium system libraries; absent in CI, where
// `playwright install --with-deps` provides them.
const localLibPath = "/home/farhana_sharna/.local/lib/playwright-deps/usr/lib/x86_64-linux-gnu";
const launchEnv = existsSync(localLibPath)
  ? { ...process.env, LD_LIBRARY_PATH: [localLibPath, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":") }
  : undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  // Journeys share seeded accounts and auth rate limits, so they run one at a time.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  forbidOnly: Boolean(process.env.CI),
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "playwright-report/e2e" }]] : "list",
  outputDir: "test-results/e2e",
  use: {
    baseURL: e2eBaseUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: launchEnv ? { env: launchEnv } : undefined,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run start -- --port ${port}`,
    url: `${e2eBaseUrl}/api/v1/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ALLOWED_ORIGIN: e2eBaseUrl,
      APP_URL: e2eBaseUrl,
      // Never reach real services from the suite. Production builds require Upstash for
      // rate limiting, so global setup starts an in-memory stand-in on this port.
      UPSTASH_REDIS_REST_URL: `http://127.0.0.1:${upstashPort}`,
      UPSTASH_REDIS_REST_TOKEN: e2eUpstashToken,
      RESEND_API_KEY: "",
      AI_ENABLED: "false",
    },
  },
});
