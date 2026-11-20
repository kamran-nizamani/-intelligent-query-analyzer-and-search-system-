import { expect, test } from "@playwright/test";
import { backendIsUp, gotoView, isDesktopProject } from "./helpers";

/**
 * These tests drive the real FastAPI server on :8000 and therefore have real
 * side effects (a few rows in search history; one temporary uploaded file that
 * the test deletes again). They run on the desktop project only, and are
 * skipped, with the reason shown, when the server is not running.
 */
const QUERY = "Find documents about defence script slides";

test.describe("live backend integration", () => {
  test.beforeEach(async ({}, info) => {
    test.skip(!isDesktopProject(info), "live-backend specs run once, on the desktop project");
    test.skip(!(await backendIsUp()), "live backend not reachable on :8000");
  });

  test("header and sidebar show the real connection state", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("backend-status")).toHaveAttribute("data-status", "online");
    await expect(page.getByTestId("backend-banner")).toHaveCount(0);
    await page.getByTestId("backend-status").click();
    await expect(page.getByText("Embedding model")).toBeVisible();
    await expect(page.getByText(/all-MiniLM-L6-v2/)).toBeVisible();
  });

  test("page load does not fire a hidden search (no history pollution)", async ({ page }) => {
    const searches: string[] = [];
    page.on("request", (r) => r.url().endsWith("/api/search") && searches.push(r.url()));
    await page.goto("/");
    await expect(page.getByTestId("search-initial")).toBeVisible();
    await page.waitForTimeout(1500);
    expect(searches).toEqual([]);
  });

  test("search returns real results with the raw RRF score (not a percentage)", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Search query").fill(QUERY);
    await page.getByRole("button", { name: "Search", exact: true }).click();

    const cards = page.getByTestId("result-card");
    await expect(cards.first()).toBeVisible({ timeout: 60_000 });
    expect(await cards.count()).toBeGreaterThan(0);

    const first = cards.first();
    await expect(first).toContainText(/Score 0\.0\d{3}/);
    await expect(first).toContainText(/Keyword #\d+/);
    await expect(first).toContainText(/Semantic #\d+/);
    await expect(first).not.toContainText("% match");
    await expect(page.getByTestId("result-summary")).toContainText(QUERY);
    await expect(page.locator("mark.hl").first()).toBeVisible(); // highlighting is applied

    // preview dialog
    await first.getByRole("button", { name: /Quick preview/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/RRF score 0\.0\d{3}/);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(first.getByRole("button", { name: /Quick preview/ })).toBeFocused(); // focus returns
  });

  test("retrieval mode toggle re-runs the search in that mode", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Search query").fill(QUERY);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByTestId("result-card").first()).toBeVisible({ timeout: 60_000 });

    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().endsWith("/api/search") && r.method() === "POST"),
      page.getByRole("button", { name: /Keyword Only/ }).click(),
    ]);
    expect(JSON.parse(req.postData()!).mode).toBe("lexical");
    await expect(page.getByTestId("result-summary")).toContainText(/Mode:\s*lexical/i);
  });

  test("Settings 'results per query' is really sent to the backend", async ({ page }) => {
    await page.goto("/");
    await gotoView(page, "Settings");
    await page.getByLabel("Default results per query").selectOption("5");
    await gotoView(page, "Intelligent Search");
    await page.getByLabel("Search query").fill(QUERY);
    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().endsWith("/api/search")),
      page.getByRole("button", { name: "Search", exact: true }).click(),
    ]);
    expect(JSON.parse(req.postData()!).limit).toBe(5);
    expect(await page.getByTestId("result-card").count()).toBeLessThanOrEqual(5);
    await gotoView(page, "Settings");
    await page.getByRole("button", { name: /Reset Defaults/ }).click();
  });

  test("backend validation errors are shown verbatim, not as a generic failure", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Search query").fill("Find Java classes"); // too few descriptive terms: backend rejects
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByTestId("search-error")).toContainText(/descriptive search terms/i);
    await expect(page.getByTestId("backend-banner")).toHaveCount(0); // a 400 is not "offline"
  });

  test("Analyzer and Pipeline show the real Python compiler's output", async ({ page }) => {
    await page.goto("/");
    await gotoView(page, "Query Analyzer");
    await expect(page.getByText("Compiled by backend")).toBeVisible();
    await expect(page.getByTestId("trace-fallback-notice")).toHaveCount(0);
    const tokens = page.locator('#panel-tokens button[aria-pressed]');
    expect(await tokens.count()).toBeGreaterThan(3);
    await tokens.nth(1).click();
    await expect(tokens.nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Selected Token Metadata")).toBeVisible();

    await page.getByRole("tab", { name: /Abstract Syntax Tree/ }).click();
    await expect(page.getByText("QueryAST [Root]")).toBeVisible();

    await gotoView(page, "Compiler Pipeline");
    const stages = page.getByRole("button", { name: /^\d\s/ });
    await expect(stages).toHaveCount(7);
    await stages.nth(4).click();
    await expect(stages.nth(4)).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(/Measured total/)).toBeVisible();
    await expect(page.getByText(/Nominal: ~/)).toBeVisible();
  });

  test("a rejected query is reported by the compiler, not silently faked locally", async ({ page }) => {
    await page.goto("/");
    await gotoView(page, "Query Analyzer");
    await page.getByLabel("Query to analyze").fill("find");
    await page.getByRole("button", { name: /Compile & Analyze/ }).click();
    await expect(page.getByTestId("analyzer-error")).toContainText(/Query rejected by the compiler/);
    await expect(page.getByTestId("trace-fallback-notice")).toHaveCount(0);
  });

  test("history lists the real searches and re-run works", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Search query").fill(QUERY);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByTestId("result-card").first()).toBeVisible({ timeout: 60_000 });

    await gotoView(page, "Search History");
    const row = page.getByText(`"${QUERY}"`).first();
    await expect(row).toBeVisible();
    await page.getByRole("button", { name: "Re-run Search" }).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Intelligent Search Workspace/);
  });

  test("library: upload a temporary file, see it indexed, then delete it", async ({ page }) => {
    const name = `pw-temp-${Date.now()}.txt`;
    await page.goto("/");
    await gotoView(page, "Document Library");
    await page.getByTestId("file-input").setInputFiles({
      name,
      mimeType: "text/plain",
      buffer: Buffer.from("Temporary Playwright fixture about zebra quantum widgets and nothing else.\n"),
    });

    const row = page.getByRole("row", { name: new RegExp(name) });
    await expect(row).toBeVisible({ timeout: 120_000 });
    await expect(row).toContainText("Indexed");
    await expect(page.getByTestId("toast")).toContainText(/Indexed 1 file/);

    await row.getByRole("button", { name: `Delete ${name}` }).click();
    await row.getByRole("button", { name: `Confirm deleting ${name}` }).click();
    await expect(page.getByRole("row", { name: new RegExp(name) })).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId("toast")).toContainText(/removed/i);
  });

  test("analytics shows real counts and refuses to show the backend's constant quality scores", async ({ page }) => {
    await page.goto("/");
    await gotoView(page, "Analytics");
    await expect(page.getByText("Searchable chunks")).toBeVisible();
    await expect(page.getByTestId("quality-not-measured")).toContainText("Not measured yet");
    await expect(page.getByText(/94%|0\.92|0\.88|0\.86/)).toHaveCount(0);
  });
});
