import { expect, test, type Page } from "@playwright/test";
import { gotoView } from "./helpers";

/**
 * Simulates the API server being down by aborting every request to :8000.
 * Verifies the UI says so plainly instead of showing empty or invented data.
 */
async function blockBackend(page: Page) {
  await page.route("**://localhost:8000/**", (route) => route.abort("connectionrefused"));
}

test.describe("backend unavailable", () => {
  test("shows a banner and an Offline status; nothing looks like real data", async ({ page }) => {
    await blockBackend(page);
    await page.goto("/");
    await expect(page.getByTestId("backend-banner")).toBeVisible();
    await expect(page.getByTestId("backend-status")).toHaveAttribute("data-status", "offline");
    await expect(page.getByTestId("engine-status")).toContainText("Backend offline");
    // the initial page no longer fires a hidden search or shows invented results
    await expect(page.getByTestId("search-initial")).toBeVisible();
    await expect(page.getByTestId("result-card")).toHaveCount(0);
  });

  test("search reports the failure with a retry", async ({ page }) => {
    await blockBackend(page);
    await page.goto("/");
    await page.getByLabel("Search query").fill("Find Python functions that process CSV files");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByTestId("search-error")).toContainText(/Cannot reach the backend/);
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  test("Analyzer and Pipeline label the local approximation instead of passing it off as the real compiler", async ({ page }) => {
    await blockBackend(page);
    await page.goto("/");
    await gotoView(page, "Query Analyzer");
    await expect(page.getByTestId("trace-fallback-notice")).toContainText(/local TypeScript approximation/);
    await expect(page.getByText("Local approximation")).toBeVisible();
    await expect(page.getByText("Compiled by backend")).toHaveCount(0);

    await gotoView(page, "Compiler Pipeline");
    await expect(page.getByTestId("trace-fallback-notice")).toBeVisible();
  });

  test("Library, History, Analytics and Overview say 'unavailable' rather than 'empty' or fake numbers", async ({ page }) => {
    await blockBackend(page);
    await page.goto("/");

    await gotoView(page, "Document Library");
    await expect(page.getByText(/File list unavailable/)).toBeVisible();

    await gotoView(page, "Search History");
    await expect(page.getByTestId("history-empty")).toHaveText(/History unavailable/);

    await gotoView(page, "Analytics");
    await expect(page.getByTestId("analytics-unavailable")).toBeVisible();
    await expect(page.getByText(/94%|0\.92|16\.4 ?ms/)).toHaveCount(0);

    await gotoView(page, "Overview");
    await expect(page.getByTestId("overview-no-files")).toContainText(/unavailable/);
  });

  test("Retry reconnects once the server comes back", async ({ page }) => {
    let blocked = true;
    await page.route("**://localhost:8000/**", (route) => (blocked ? route.abort("connectionrefused") : route.continue()));
    await page.goto("/");
    await expect(page.getByTestId("backend-banner")).toBeVisible();
    blocked = false;
    await page.getByTestId("backend-banner").getByRole("button", { name: "Retry" }).click();
    // Only meaningful if the real server is up; otherwise the banner correctly stays.
    const up = await page.request.get("http://localhost:8000/api/health").then((r) => r.ok()).catch(() => false);
    test.skip(!up, "live backend not running");
    await expect(page.getByTestId("backend-banner")).toBeHidden();
    await expect(page.getByTestId("backend-status")).toHaveAttribute("data-status", "online");
  });
});
