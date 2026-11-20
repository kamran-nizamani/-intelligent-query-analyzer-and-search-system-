import { expect, type Page, type TestInfo } from "@playwright/test";

export const API = "http://localhost:8000";

export const VIEWS = [
  { name: "Overview", heading: /Intelligent Query Analyzer & Search System/ },
  { name: "Intelligent Search", heading: /Intelligent Search Workspace/ },
  { name: "Query Analyzer", heading: /^Query Analyzer$/ },
  { name: "Compiler Pipeline", heading: /Compiler Pipeline Visualization/ },
  { name: "Document Library", heading: /Document & Code Library/ },
  { name: "Search History", heading: /Search History & Query Logs/ },
  { name: "Analytics", heading: /^Analytics$/ },
  { name: "Settings", heading: /Settings & System Preferences/ },
] as const;

export type ViewName = (typeof VIEWS)[number]["name"];

/** True when the sidebar is an off-canvas drawer (≤ 900px). */
export async function isDrawerLayout(page: Page) {
  return page.locator("#mobile-nav-trigger").isVisible();
}

export async function gotoView(page: Page, name: ViewName) {
  if (await isDrawerLayout(page)) {
    await page.locator("#mobile-nav-trigger").click();
    await expect(page.locator("#app-sidebar")).toBeVisible();
  }
  await page.locator("#app-sidebar").getByRole("button", { name: new RegExp(`^${name}`) }).click();
  const view = VIEWS.find((v) => v.name === name)!;
  await expect(page.getByRole("heading", { level: 1 }).first()).toHaveText(view.heading);
}

export async function backendIsUp(): Promise<boolean> {
  try {
    const r = await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(4000) });
    return r.ok;
  } catch {
    return false;
  }
}

export function isDesktopProject(info: TestInfo) {
  return info.project.name === "desktop-1920";
}

/** Collect console errors / uncaught exceptions, ignoring third-party font fetches. */
export function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    if (/fonts\.(googleapis|gstatic)\.com/.test(text) || /favicon/.test(text)) return;
    errors.push(`console.error: ${text}`);
  });
  return errors;
}

export async function hasHorizontalScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}
