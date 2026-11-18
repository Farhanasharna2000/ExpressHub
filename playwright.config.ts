import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { browserTestSecret } from "./tests/browser/session";

// Local workaround for missing Chromium system libraries; absent in CI, where
// `playwright install --with-deps` provides them.
const localLibPath = "/home/farhana_sharna/.local/lib/playwright-deps/usr/lib/x86_64-linux-gnu";
const launchEnv = existsSync(localLibPath)
  ? { ...process.env, LD_LIBRARY_PATH: [localLibPath, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":") }
  : undefined;

// Browser tests with a mocked API. Full-stack journeys live in playwright.e2e.config.ts.
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  // More workers overload a single production server on small machines and CI runners.
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "playwright-report/browser" }]] : "list",
  outputDir: "test-results/browser",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
      ...(launchEnv ? { env: launchEnv } : {}),
    },
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }, { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } }],
  webServer: { command: "npm run start -- --port 3100", url: "http://127.0.0.1:3100", reuseExistingServer: false, env: { JWT_ACCESS_SECRET: browserTestSecret } },
});
