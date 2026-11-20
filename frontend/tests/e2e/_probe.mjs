import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } }); const page = await ctx.newPage();
const errs = [];
page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
page.on("pageerror", (e) => errs.push("PAGEERR " + e.message));
await page.goto("http://localhost:3100/");
await page.waitForTimeout(1500);
console.log("CONSOLE ERRORS:", JSON.stringify(errs, null, 1));

const seen = new Map();
const views = ["Overview", "Intelligent Search", "Query Analyzer", "Compiler Pipeline", "Document Library", "Search History", "Analytics", "Settings"];
for (const theme of ["dark", "light"]) {
  if (theme === "light") await page.getByRole("button", { name: /Switch to light theme/ }).click();
  for (const v of views) {
    await page.locator("#app-sidebar").getByRole("button", { name: new RegExp("^" + v) }).click();
    await page.waitForTimeout(400);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    for (const viol of r.violations)
      for (const n of viol.nodes) {
        const d = n.any?.[0]?.data;
        const key = `${theme}|${viol.id}|${n.target.join(" ")}|${d?.fgColor ?? ""}|${d?.bgColor ?? ""}|${d?.contrastRatio ?? ""}`;
        if (!seen.has(key)) seen.set(key, v);
      }
  }
}
for (const [k, v] of seen) console.log(v, "::", k);

// horizontal overflow culprit
for (const v of views) {
  await page.locator("#app-sidebar").getByRole("button", { name: new RegExp("^" + v) }).click();
  await page.waitForTimeout(300);
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  if (o.sw > o.cw + 1) console.log("OVERFLOW", v, o);
}
await browser.close();
