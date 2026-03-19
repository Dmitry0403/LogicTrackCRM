import { expect, test } from "@playwright/test";

test("app shell renders main layout", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("main")).toBeVisible();
});
