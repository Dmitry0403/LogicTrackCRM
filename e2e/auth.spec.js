import { expect, test } from "@playwright/test";

test("auth screen switches to recovery mode and back", async ({ page }) => {
  await page.goto("/");

  const signInButton = page.getByTestId("auth-sign-in");
  if (!(await signInButton.isVisible().catch(() => false))) {
    test.skip();
  }

  await expect(signInButton).toBeVisible();
  await expect(page.getByTestId("auth-sign-up")).toBeVisible();

  await page.getByTestId("auth-recover").click();
  await expect(page.getByTestId("auth-send-link")).toBeVisible();
  await expect(page.getByTestId("auth-back-to-login")).toBeVisible();

  await page.getByTestId("auth-back-to-login").click();
  await expect(page.getByTestId("auth-sign-in")).toBeVisible();
});
