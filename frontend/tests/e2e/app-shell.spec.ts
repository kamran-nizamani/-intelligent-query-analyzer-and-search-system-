import { expect, test } from "@playwright/test";
import { VIEWS, gotoView, hasHorizontalScroll, isDrawerLayout, trackErrors } from "./helpers";

test.describe("app shell (all viewports)", () => {
  test("loads with no console errors or uncaught exceptions", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Intelligent Search Workspace/);
    await page.waitForTimeout(500);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("every view opens and none causes horizontal page scrolling", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/");
    const overflow: string[] = [];
    for (const v of VIEWS) {
      await gotoView(page, v.name);
      await page.waitForTimeout(250);
      if (await hasHorizontalScroll(page)) overflow.push(v.name);
    }
    expect(overflow, `horizontal scroll on: ${overflow.join(", ")}`).toEqual([]);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("navigation menu is reachable at this size (hamburger on small screens, sidebar otherwise)", async ({ page }) => {
    await page.goto("/");
    const drawer = await isDrawerLayout(page);
    const viewport = page.viewportSize()!;
    expect(drawer).toBe(viewport.width <= 900);

    if (drawer) {
      await expect(page.locator("#app-sidebar")).toBeHidden();
      await page.locator("#mobile-nav-trigger").click();
      await expect(page.locator("#app-sidebar")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator("#app-sidebar")).toBeHidden();
      // and choosing an item closes it
      await gotoView(page, "Settings");
      await expect(page.locator("#app-sidebar")).toBeHidden();
    } else {
      await expect(page.locator("#app-sidebar")).toBeVisible();
    }
  });

  test("desktop sidebar collapses and expands", async ({ page }) => {
    await page.goto("/");
    test.skip(await isDrawerLayout(page), "sidebar is a drawer at this size");
    const toggle = page.getByRole("button", { name: /Collapse sidebar/ });
    await toggle.click();
    await expect(page.locator("#app-sidebar")).toHaveClass(/collapsed/);
    await page.getByRole("button", { name: /Expand sidebar/ }).click();
    await expect(page.locator("#app-sidebar")).not.toHaveClass(/collapsed/);
  });

  test("theme toggle switches data-theme and the choice survives a reload", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("button", { name: /Switch to light theme/ }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.getByRole("button", { name: /Switch to dark theme/ }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("command palette: Ctrl+K opens, Escape closes and returns focus, page jump works", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Control+k");
    const dialog = page.getByRole("dialog", { name: /Quick search/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Search query or page name")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    // header button opens it too (keyboard-operable button, not a div)
    await page.getByRole("button", { name: /Search or jump to/ }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Search History Log" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Search History/);
  });

  test("modal dialogs trap Tab focus", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Control+k");
    const dialog = page.getByRole("dialog");
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      const inside = await dialog.evaluate((d) => d.contains(document.activeElement));
      expect(inside).toBe(true);
    }
  });

  test("skip link moves focus to main content", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
  });

  test("keyboard focus is always visible on interactive controls", async ({ page }) => {
    await page.goto("/");
    const missing: string[] = [];
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        const visible =
          (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none";
        // inputs inside .search-input-box show the ring on the wrapper
        const wrapper = el.closest(".search-input-box");
        const wrapperRing = wrapper ? getComputedStyle(wrapper).borderColor !== getComputedStyle(document.body).borderColor : false;
        return { label: el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 30) || el.tagName, visible: visible || wrapperRing };
      });
      if (info && !info.visible) missing.push(info.label);
    }
    expect(missing, `no visible focus indicator on: ${missing.join(", ")}`).toEqual([]);
  });

  test("Settings: compact density and persisted defaults apply", async ({ page }) => {
    await page.goto("/");
    await gotoView(page, "Settings");
    await page.getByLabel("Compact mode").check();
    await expect(page.locator(".app-container")).toHaveClass(/compact/);
    await page.getByLabel("Default search mode").selectOption("lexical");
    await page.reload();
    await gotoView(page, "Settings");
    await expect(page.getByLabel("Default search mode")).toHaveValue("lexical");
    await expect(page.getByLabel("Compact mode")).toBeChecked();
    await page.getByRole("button", { name: /Reset Defaults/ }).click();
    await expect(page.getByLabel("Default search mode")).toHaveValue("hybrid");
    await expect(page.getByLabel("Compact mode")).not.toBeChecked();
  });
});
