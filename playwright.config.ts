import { defineConfig, devices } from "@playwright/test";
const externalServer = process.env.PLAYWRIGHT_BASE_URL;
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  use: {
    baseURL: externalServer ?? "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit-mobile", use: { ...devices["iPhone 13"] } },
  ],
  webServer: externalServer
    ? undefined
    : {
        command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
        url: "http://127.0.0.1:3100",
        reuseExistingServer: false,
        timeout: 120000,
      },
});
