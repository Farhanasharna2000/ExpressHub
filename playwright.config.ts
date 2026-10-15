import { defineConfig, devices } from "@playwright/test";
import { browserTestSecret } from "./tests/browser/session";
const localLibPath = "/home/farhana_sharna/.local/lib/playwright-deps/usr/lib/x86_64-linux-gnu";
const ldLibraryPath = process.env.LD_LIBRARY_PATH
  ? `${localLibPath}:${process.env.LD_LIBRARY_PATH}`
  : localLibPath;

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
      env: {
        ...process.env,
        LD_LIBRARY_PATH: ldLibraryPath,
      },
    },
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }, { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } }],
  webServer: { command: "npm run start -- --port 3100", url: "http://127.0.0.1:3100", reuseExistingServer: false, env: { JWT_ACCESS_SECRET: browserTestSecret } },
});
