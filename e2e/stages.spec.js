import { expect, test } from "./fixtures";

const renameStage = async (page, boardPrefix, stageId, nextName) => {
  await page.getByTestId(`${boardPrefix}-stage-${stageId}`).hover();
  await page.getByTestId(`${boardPrefix}-stage-edit-${stageId}`).click({ force: true });
  const input = page.getByTestId(`${boardPrefix}-stage-rename-input`);
  await expect(input).toBeVisible();
  await input.fill(nextName);
  await input.press("Enter");
  await expect(page.getByText(nextName)).toBeVisible();
};

const addRenameDeleteStage = async ({ page, boardPrefix, afterStageId, stageName, renamedStageName }) => {
  await page.getByTestId(`${boardPrefix}-stage-${afterStageId}`).hover();
  await page.getByTestId(`${boardPrefix}-stage-add-after-${afterStageId}`).click({ force: true });
  const input = page.getByTestId(`${boardPrefix}-stage-rename-input`);
  await expect(input).toBeVisible();
  await input.fill(stageName);
  await input.press("Enter");
  await expect(page.getByText(stageName)).toBeVisible();

  const stageSection = page.locator(String.raw`[data-testid^="${boardPrefix}-stage-"]`, { hasText: stageName }).first();
  await expect(stageSection).toBeVisible();
  const stageId = await stageSection.getAttribute("data-testid");
  const actualStageId = String(stageId || "").replace(`${boardPrefix}-stage-`, "");

  await renameStage(page, boardPrefix, actualStageId, renamedStageName);

  await page.getByTestId(`${boardPrefix}-stage-${actualStageId}`).hover();
  await page.getByTestId(`${boardPrefix}-stage-edit-${actualStageId}`).click({ force: true });
  await page.getByTestId(`${boardPrefix}-stage-delete-${actualStageId}`).click({ force: true });
  await expect(page.getByTestId(`${boardPrefix}-delete-stage-modal`)).toBeVisible();
  await page.getByTestId(`${boardPrefix}-delete-stage-confirm`).click();
  await expect(page.getByTestId(`${boardPrefix}-delete-stage-modal`)).toBeHidden();
  await expect(page.getByText(renamedStageName)).toHaveCount(0);
};

test("user can add, rename, and delete an order stage", async ({ page, gotoWorkspace }) => {
  await gotoWorkspace();
  await addRenameDeleteStage({
    page,
    boardPrefix: "orders-workflow",
    afterStageId: "order-stage-plan",
    stageName: `E2E Order Stage ${Date.now()}`,
    renamedStageName: `E2E Order Stage Renamed ${Date.now()}`,
  });
});

test("user can add, rename, and delete a trip stage", async ({ page, gotoWorkspace }) => {
  await gotoWorkspace();
  await page.getByTestId("nav-trips").click();
  await expect(page.getByTestId("trips-create-action")).toBeVisible();
  await addRenameDeleteStage({
    page,
    boardPrefix: "trips-workflow",
    afterStageId: "trip-stage-plan",
    stageName: `E2E Trip Stage ${Date.now()}`,
    renamedStageName: `E2E Trip Stage Renamed ${Date.now()}`,
  });
});
