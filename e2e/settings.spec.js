import { expect, test } from "./fixtures";

test("settings modal opens Google Drive section and returns back", async ({ page, gotoWorkspace }) => {
  await gotoWorkspace();

  await page.getByTestId("nav-settings").click();
  await expect(page.getByTestId("settings-modal")).toBeVisible();

  await page.getByTestId("settings-section-google-drive").click();
  await expect(page.getByTestId("drive-settings-modal")).toBeVisible();
  await expect(page.getByTestId("drive-hint")).toBeVisible();
  await expect(page.getByTestId("drive-select-folder")).toBeDisabled();

  await page.getByTestId("drive-settings-close").click();
  await expect(page.getByTestId("settings-modal")).toBeVisible();
});

test("signature settings save and persist after reload", async ({ page, gotoWorkspace }) => {
  const suffix = Date.now();
  const signerRole = `QA Role ${suffix}`;
  const signerName = `QA Name ${suffix}`;

  await gotoWorkspace();

  await page.getByTestId("nav-settings").click();
  await expect(page.getByTestId("settings-modal")).toBeVisible();

  await page.getByTestId("settings-section-print-signature").click();
  await expect(page.getByTestId("signature-settings-modal")).toBeVisible();

  await page.getByTestId("signature-role-input").fill(signerRole);
  await page.getByTestId("signature-name-input").fill(signerName);
  await page.getByTestId("signature-save").click();

  await expect(page.getByTestId("settings-modal")).toBeVisible();
  await expect(page.getByTestId("settings-section-print-signature")).toContainText(signerRole);
  await expect(page.getByTestId("settings-section-print-signature")).toContainText(signerName);

  await page.reload();

  await page.getByTestId("nav-settings").click();
  await page.getByTestId("settings-section-print-signature").click();
  await expect(page.getByTestId("signature-role-input")).toHaveValue(signerRole);
  await expect(page.getByTestId("signature-name-input")).toHaveValue(signerName);
});

test("account settings open change password screen and save in e2e workspace mode", async ({ page, gotoWorkspace }) => {
  await gotoWorkspace();

  await page.getByTestId("nav-settings").click();
  await expect(page.getByTestId("settings-modal")).toBeVisible();

  await page.getByTestId("settings-section-account").click();
  await expect(page.getByTestId("account-settings-modal")).toBeVisible();

  await page.getByTestId("account-change-password").click();
  await expect(page.getByTestId("change-password-input")).toBeVisible();

  await page.getByTestId("change-password-input").fill("secret1");
  await page.getByTestId("change-password-confirm-input").fill("secret1");
  await page.getByTestId("change-password-submit").click();

  await expect(page.getByTestId("change-password-info")).toBeVisible();
  await page.getByTestId("change-password-back").click();
  await expect(page.getByTestId("nav-settings")).toBeVisible();
});

test("google drive can disconnect and reconnect in e2e workspace mode", async ({ page, gotoWorkspace }) => {
  await gotoWorkspace();

  await page.getByTestId("nav-settings").click();
  await expect(page.getByTestId("settings-modal")).toBeVisible();

  await page.getByTestId("settings-section-google-drive").click();
  await expect(page.getByTestId("drive-settings-modal")).toBeVisible();

  await page.getByTestId("drive-connect").click();
  await expect(page.getByTestId("drive-hint")).toContainText("Google Drive");
  await expect(page.getByTestId("drive-select-folder")).toBeEnabled();

  await page.getByTestId("drive-settings-close").click();
  await expect(page.getByTestId("settings-section-google-drive")).toContainText("e2e-drive@logictrack.test");

  await page.getByTestId("settings-section-google-drive").click();
  await page.getByTestId("drive-disconnect").click();
  await expect(page.getByTestId("drive-select-folder")).toBeDisabled();
  await page.getByTestId("drive-settings-close").click();
  await expect(page.getByTestId("settings-section-google-drive")).not.toContainText("e2e-drive@logictrack.test");

  await page.getByTestId("settings-section-google-drive").click();
  await page.getByTestId("drive-connect").click();
  await expect(page.getByTestId("drive-hint")).toContainText("Google Drive");
  await expect(page.getByTestId("drive-select-folder")).toBeEnabled();

  await page.getByTestId("drive-settings-close").click();
  await expect(page.getByTestId("settings-section-google-drive")).toContainText("e2e-drive@logictrack.test");
});
