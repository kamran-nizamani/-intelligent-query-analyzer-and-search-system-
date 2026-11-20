import { expect, test } from "@playwright/test";
import { gotoView } from "./helpers";

test.describe("upload validation (no data is sent to the backend)", () => {
  test("rejects unsupported, empty and oversize files before any upload request", async ({ page }) => {
    const uploads: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/files/upload")) uploads.push(r.url());
    });

    await page.goto("/");
    await gotoView(page, "Document Library");

    await page.getByTestId("file-input").setInputFiles([
      { name: "virus.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") },
      { name: "empty.txt", mimeType: "text/plain", buffer: Buffer.alloc(0) },
      { name: "big.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(20 * 1024 * 1024 + 1) },
    ]);

    const toast = page.getByTestId("toast");
    await expect(toast).toHaveAttribute("data-tone", "error");
    await expect(toast).toContainText("virus.exe (unsupported file type)");
    await expect(toast).toContainText("empty.txt (file is empty)");
    await expect(toast).toContainText("big.pdf (larger than 20 MB)");
    expect(uploads).toEqual([]);
  });

  test("the Upload New Files button is a keyboard-reachable path to the file chooser", async ({ page }) => {
    await page.goto("/");
    await gotoView(page, "Document Library");
    const btn = page.getByRole("button", { name: /Upload New Files/ });
    await btn.focus();
    await expect(btn).toBeFocused();
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.keyboard.press("Enter")]);
    expect(chooser.isMultiple()).toBe(true);
  });
});
