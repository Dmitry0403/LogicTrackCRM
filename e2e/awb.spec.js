import { expect, test } from "./fixtures";

const openOrderFormForManualAwb = async (page, airportIndex, awb = {}) => {
  await page.getByTestId("orders-create-action").click();
  await expect(page.locator("form#order-form-panel")).toBeVisible();
  await page.locator("#shipmentAirport").selectOption({ index: airportIndex });
  await page.locator("#recipient").fill(`AWB E2E ${Date.now()}`);
  await page.locator("#quantity").fill("1");
  await page.locator("#weight").fill("10");
  await page.locator("#customsCode").fill("06536");
  await page.locator("#awb-prefix").fill(awb.prefix ?? "771");
  await page.locator("#awb-number").fill(awb.number ?? "11061551");
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

  await page.evaluate(() => {
    window.__e2eOpenedUrl = "";
    window.open = (url) => {
      window.__e2eOpenedUrl = String(url || "");
      return { closed: false, close() {} };
    };
  });

  await page.getByTestId("awb-check-action").click();
  await expect(page.getByTestId("manual-cargo-modal")).toBeVisible();
  await expect(page.getByTestId("manual-cargo-awb-number")).toHaveText("11061551");

  await page.getByTestId("manual-cargo-confirm").click();

  await expect(page.getByTestId("manual-cargo-modal")).toBeHidden();
  await expect.poll(async () => await page.evaluate(() => navigator.clipboard.readText())).toBe("11061551");
  await expect.poll(async () => await page.evaluate(() => window.__e2eOpenedUrl)).not.toBe("");
});

test("manual AWB modal supports empty prefix and alphanumeric main number", async ({ page, gotoWorkspace }) => {
  await gotoWorkspace();
  await openOrderFormForManualAwb(page, 2, {
    prefix: "",
    number: "AB12CD34",
  });

  await expect(page.getByTestId("awb-check-action")).toBeEnabled();
  await page.getByTestId("awb-check-action").click();
  await expect(page.getByTestId("manual-cargo-modal")).toBeVisible();
  await expect(page.getByTestId("manual-cargo-awb-number")).toHaveText("AB12CD34");
});
