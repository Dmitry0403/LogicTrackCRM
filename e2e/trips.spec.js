import { expect, test } from "./fixtures";

const seedWorkspaceForTrips = async (page, orderId) => {
  await page.addInitScript(({ orderId }) => {
    const seededOrder = {
      id: orderId,
      stageId: "order-stage-warehouse",
      shipmentAirport: "",
      shipmentTerminal: "",
      name: "Seed Order for Trip",
      recipient: "Seed Order for Trip",
      awb: "771-11061551",
      quantity: "1",
      weight: "25",
      customsCode: "06536",
      customsName: "",
      notes: "",
      driveFolder: null,
      driveFolderId: null,
    };
    if (!localStorage.getItem("logictrack_orders")) {
      localStorage.setItem("logictrack_orders", JSON.stringify([seededOrder]));
    }
    if (!localStorage.getItem("logictrack_trips")) {
      localStorage.setItem("logictrack_trips", JSON.stringify([]));
    }
  }, { orderId });
};

const openTripsView = async (page) => {
  await page.getByTestId("nav-trips").click();
  await expect(page.getByTestId("trips-create-action")).toBeVisible();
};

const createTripViaForm = async (page, tripNumber, orderId) => {
  const suffix = Date.now();
  await page.getByTestId("trips-create-action").click();
  await expect(page.locator("form#trip-form-panel")).toBeVisible();
  await page.locator("#trip-number").fill(tripNumber);
  await page.locator("#car-number").fill(`E2E-CAR-${suffix}`);
  await page.locator("#driver-name").fill(`E2E Driver ${suffix}`);
  await page.getByTestId(`trip-order-option-${orderId}`).click();
  await page.locator("form#trip-form-panel button[type='submit']").click();
  await expect(page.getByTestId("trips-create-action")).toBeVisible();
  await expect(page.getByText(tripNumber)).toBeVisible();
};

test("user can create a trip in workspace fixture", async ({ page, gotoWorkspace }) => {
  const orderId = `seed-order-${Date.now()}`;
  await seedWorkspaceForTrips(page, orderId);
  await gotoWorkspace();
  await openTripsView(page);
  await createTripViaForm(page, `E2E Trip ${Date.now()}`, orderId);
});

test("user can delete a trip in workspace fixture", async ({ page, gotoWorkspace }) => {
  const orderId = `seed-order-${Date.now()}`;
  const tripNumber = `E2E Trip Delete ${Date.now()}`;
  await seedWorkspaceForTrips(page, orderId);
  await gotoWorkspace();
  await openTripsView(page);
  await createTripViaForm(page, tripNumber, orderId);

  const tripCard = page.locator(".workflow-card", { hasText: tripNumber }).first();
  await expect(tripCard).toBeVisible();
  await tripCard.locator(".workflow-card__icon-btn--danger").click({ force: true });
  await expect(page.getByTestId("delete-card-modal")).toBeVisible();
  await page.getByTestId("delete-card-confirm").click();
  await expect(page.getByTestId("delete-card-modal")).toBeHidden();
  await expect(page.getByText(tripNumber)).toHaveCount(0);
});

test("user can edit a trip in workspace fixture", async ({ page, gotoWorkspace }) => {
  const orderId = `seed-order-${Date.now()}`;
  const tripNumber = `E2E Trip Edit ${Date.now()}`;
  const updatedTripNumber = `Edited Trip ${Date.now()}`;
  await seedWorkspaceForTrips(page, orderId);
  await gotoWorkspace();
  await openTripsView(page);
  await createTripViaForm(page, tripNumber, orderId);

  const tripCard = page.locator(".workflow-card", { hasText: tripNumber }).first();
  await expect(tripCard).toBeVisible();
  await tripCard.locator(".workflow-card__icon-btn").first().click({ force: true });
  await expect(page.locator("form#trip-form-panel")).toBeVisible();
  await page.locator("#trip-number").fill(updatedTripNumber);
  await page.locator("form#trip-form-panel button[type='submit']").click();
  await expect(page.getByTestId("trips-create-action")).toBeVisible();
  await expect(page.getByText(updatedTripNumber)).toBeVisible();
  await expect(page.getByText(tripNumber)).toHaveCount(0);
});


test("saved trip persists after page reload in workspace fixture", async ({ page, gotoWorkspace }) => {
  const orderId = `seed-order-${Date.now()}`;
  const tripNumber = `E2E Persist Trip ${Date.now()}`;
  await seedWorkspaceForTrips(page, orderId);
  await gotoWorkspace();
  await openTripsView(page);
  await createTripViaForm(page, tripNumber, orderId);

  await page.reload();
  await page.getByTestId("nav-trips").click();
  await expect(page.getByTestId("trips-create-action")).toBeVisible();
  await expect(page.getByText(tripNumber)).toBeVisible();
});
