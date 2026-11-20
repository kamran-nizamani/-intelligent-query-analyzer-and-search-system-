import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { VIEWS, gotoView } from "./helpers";

// Automated WCAG 2.x A/AA scan of every view in both themes at every viewport.
for (const theme of ["dark", "light"] as const) {
  test.describe(`axe (${theme} theme)`, () => {
    for (const v of VIEWS) {
      test(`${v.name} has no WCAG A/AA violations`, async ({ page }) => {
        await page.goto("/");
        if (theme === "light") await page.getByRole("button", { name: /Switch to light theme/ }).click();
        await gotoView(page, v.name);
        await page.waitForTimeout(400);

        const { violations } = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();

        const summary = violations.map(
          (x) => `${x.impact}: ${x.id} — ${x.help} (${x.nodes.length} nodes) e.g. ${x.nodes[0]?.target.join(" ")}`
        );
        expect(summary, summary.join("\n")).toEqual([]);
      });
    }
  });
}
