import { defineConfig } from "@playwright/test";

const PORT = 3100;

/**
 * Browser tests run against a production build served locally, and (for the
 * "live backend" specs) the real FastAPI server on :8000. Those specs skip,
 * and say so, when the server is not reachable.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "test-results/e2e.json" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: "chrome", // uses the installed Google Chrome; no browser download needed
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop-1920", use: { viewport: { width: 1920, height: 1080 } } },
    { name: "laptop-1366", use: { viewport: { width: 1366, height: 768 } } },
    { name: "tablet-820", use: { viewport: { width: 820, height: 1180 }, hasTouch: true } },
    { name: "mobile-390", use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
