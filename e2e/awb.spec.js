import { expect, test } from "./fixtures";

const openOrderFormForManualAwb = async (page, airportIndex) => {
  await page.getByTestId("orders-create-action").click();
  await expect(page.locator("form#order-form-panel")).toBeVisible();
  await page.locator("#shipmentAirport").selectOption({ index: airportIndex });
  await page.locator("#recipient").fill(`AWB E2E ${Date.now()}`);
  await page.locator("#quantity").fill("1");
  await page.locator("#weight").fill("10");
  await page.locator("#customsCode").fill("06536");
  await page.locator("#awb-prefix").fill("771");
  await page.locator("#awb-number").fill("11061551");
};

test("manual AWB modal opens for Vnukovo and can be cancelled", async ({ page, gotoWorkspace }) => {
  await gotoWorkspace();
  await openOrderFormForManualAwb(page, 2);

  await page.getByTestId("awb-check-action").click();
  await expect(page.getByTestId("manual-cargo-modal")).toBeVisible();
  await expect(page.getByTestId("manual-cargo-awb-number")).toHaveText("11061551");
  await page.getByTestId("manual-cargo-cancel").click();
  await expect(page.getByTestId("manual-cargo-modal")).toBeHidden();
});

test("manual AWB modal opens for Domodedovo and confirm opens terminal site", async ({ page, context, gotoWorkspace }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:4173" });
  await gotoWorkspace();
  await openOrderFormForManualAwb(page, 3);

  await page.getByTestId("awb-check-action").click();
  await expect(page.getByTestId("manual-cargo-modal")).toBeVisible();
  await expect(page.getByTestId("manual-cargo-awb-number")).toHaveText("11061551");

  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByTestId("manual-cargo-confirm").click(),
  ]);

  await expect(page.getByTestId("manual-cargo-modal")).toBeHidden();
  await popup.waitForLoadState("domcontentloaded");
  await expect.poll(async () => await page.evaluate(() => navigator.clipboard.readText())).toBe("11061551");
  await expect.poll(async () => popup.url()).not.toBe("");
  await popup.close();
});
