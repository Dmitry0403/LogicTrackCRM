import { expect, test } from "./fixtures";

const createOrderViaForm = async (page, uniqueRecipient) => {
  await page.getByTestId("orders-create-action").click();
  await expect(page.locator("form#order-form-panel")).toBeVisible();
  await page.locator("#shipmentAirport").selectOption({ index: 3 });
  await page.locator("#recipient").fill(uniqueRecipient);
  await page.locator("#quantity").fill("2");
  await page.locator("#weight").fill("317");
  await page.locator("#customsCode").fill("06536");
  await page.locator("#awb-prefix").fill("771");
  await page.locator("#awb-number").fill("11061551");
  await page.locator("#notes").fill("Created by Playwright e2e");
  await page.locator("form#order-form-panel button[type='submit']").click();
  await expect(page.getByTestId("orders-create-action")).toBeVisible();
  await expect(page.getByText(uniqueRecipient)).toBeVisible();
};

const createOrderViaAlternateForm = async (page, uniqueCustomer) => {
  const uniqueLoading = `Minsk ${Date.now()}`;
  const uniqueUnloading = `Domodedovo ${Date.now()}`;
  await page.getByTestId("orders-create-action").click();
  await expect(page.locator("form#order-form-panel")).toBeVisible();
  await page.locator(".section-header__actions button").click();
  await page.locator("#customer").fill(uniqueCustomer);
  await page.locator("#loadingPoint").fill(uniqueLoading);
  await page.locator("#unloadingPoint").fill(uniqueUnloading);
  await page.locator("#quantity-alt").fill("15");
  await page.locator("#weight-alt").fill("4000");
  await page.locator("#notes-alt").fill("Alternate order created by Playwright e2e");
  await page.locator("form#order-form-panel button[type='submit']").click();
  await expect(page.getByTestId("orders-create-action")).toBeVisible();
  return { uniqueLoading, uniqueUnloading };
};

test("workspace fixture opens orders view", async ({ page, gotoWorkspace }) => {
  await gotoWorkspace();
  await expect(page.getByTestId("orders-create-action")).toBeVisible();
});

test("orders create action opens order form", async ({ page, gotoWorkspace }) => {
  await gotoWorkspace();
  await page.getByTestId("orders-create-action").click();
  await expect(page.locator("form#order-form-panel")).toBeVisible();
});

test("user can fill and save an order in workspace fixture", async ({ page, gotoWorkspace }) => {
  await gotoWorkspace();
  await createOrderViaForm(page, `E2E Recipient ${Date.now()}`);
});

test("user can switch to alternate order form in workspace fixture", async ({ page, gotoWorkspace }) => {
  await gotoWorkspace();
  await page.getByTestId("orders-create-action").click();
  await expect(page.locator("form#order-form-panel")).toBeVisible();
  await page.locator(".section-header__actions button").click();
  await expect(page.locator("#customer")).toBeVisible();
  await expect(page.locator("#loadingPoint")).toBeVisible();
  await expect(page.locator("#unloadingPoint")).toBeVisible();
  await expect(page.locator("#quantity-alt")).toBeVisible();
  await expect(page.locator("#weight-alt")).toBeVisible();
  await expect(page.locator("#notes-alt")).toBeVisible();
});

test("user can create order via alternate form and card hides awb and warning state", async ({ page, gotoWorkspace }) => {
  await gotoWorkspace();
  const uniqueCustomer = `Logistics Projects ${Date.now()}`;
  const { uniqueLoading, uniqueUnloading } = await createOrderViaAlternateForm(page, uniqueCustomer);

  const orderCard = page.locator(".workflow-card", { hasText: uniqueCustomer }).first();
  await expect(orderCard).toBeVisible();
  await expect(orderCard).toContainText(`${uniqueLoading} - ${uniqueUnloading}`);
  await expect(orderCard).not.toContainText("AWB:");
  await expect(orderCard.locator(".workflow-card__title")).not.toHaveClass(/workflow-card__title--danger/);
});

test("user can delete an order in workspace fixture", async ({ page, gotoWorkspace }) => {
  await gotoWorkspace();
  const uniqueRecipient = `E2E Delete Order ${Date.now()}`;
  await createOrderViaForm(page, uniqueRecipient);

  const orderCard = page.locator(".workflow-card", { hasText: uniqueRecipient }).first();
  await expect(orderCard).toBeVisible();
  await orderCard.locator(".workflow-card__icon-btn--danger").click({ force: true });
  await expect(page.getByTestId("delete-card-modal")).toBeVisible();
  await page.getByTestId("delete-card-confirm").click();
  await expect(page.getByTestId("delete-card-modal")).toBeHidden();
  await expect(page.getByText(uniqueRecipient)).toHaveCount(0);
});

test("user can edit an order in workspace fixture", async ({ page, gotoWorkspace }) => {
  await gotoWorkspace();
  const uniqueRecipient = `E2E Edit Order ${Date.now()}`;
  const updatedRecipient = `Edited Recipient ${Date.now()}`;
  await createOrderViaForm(page, uniqueRecipient);

  const orderCard = page.locator(".workflow-card", { hasText: uniqueRecipient }).first();
  await expect(orderCard).toBeVisible();
  await orderCard.locator(".workflow-card__icon-btn").first().click({ force: true });
  await expect(page.locator("form#order-form-panel")).toBeVisible();
  await page.locator("#recipient").fill(updatedRecipient);
  await page.locator("form#order-form-panel button[type='submit']").click();
  await expect(page.getByTestId("orders-create-action")).toBeVisible();
  await expect(page.getByText(updatedRecipient)).toBeVisible();
  await expect(page.getByText(uniqueRecipient)).toHaveCount(0);
});


test("saved order persists after page reload in workspace fixture", async ({ page, gotoWorkspace }) => {
  await gotoWorkspace();
  const uniqueRecipient = `E2E Persist Order ${Date.now()}`;
  await createOrderViaForm(page, uniqueRecipient);

  await page.reload();
  await expect(page.getByTestId("orders-create-action")).toBeVisible();
  await expect(page.getByText(uniqueRecipient)).toBeVisible();
});
