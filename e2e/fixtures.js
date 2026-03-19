import { expect, test as base } from "@playwright/test";

export const test = base.extend({
  gotoWorkspace: async ({ page }, use) => {
    await use(async () => {
      await page.goto("/?e2e=workspace");
    });
  },
});

export { expect };
