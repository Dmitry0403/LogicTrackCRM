import { expect, test } from "@playwright/test";

const user = { id: "00000000-0000-4000-8000-000000000001", email: "owner@example.com", aud: "authenticated", role: "authenticated" };
const saved = { owner_user_id: user.id, folder_id: "company-root", folder_name: "Рабочая папка", updated_at: "2026-11-05T10:00:00+00:00" };

async function setup(page, { denied = false, conflict = false } = {}) {
  const writes = [];
  await page.addInitScript(() => {
    localStorage.setItem("gdrive_tokens", JSON.stringify({ access_token: "google-token", expires_at: Date.now() + 3600000 }));
    localStorage.setItem("gdrive_selected_folder", JSON.stringify({ id: "wrong-local-folder", name: "Ошибочная локальная папка" }));
    const picker = {
      Action: { PICKED: "picked", CANCEL: "cancel" }, ViewId: { FOLDERS: "folders" },
      DocsView: class { setIncludeFolders() { return this; } setSelectFolderEnabled() { return this; } },
      PickerBuilder: class {
        addView() { return this; } setDeveloperKey() { return this; } setOAuthToken() { return this; }
        setCallback(callback) { this.callback = callback; return this; } build() { return this; }
        setVisible() { this.callback({ action: "picked", docs: [{ id: "new-root", name: "Новая папка" }] }); }
      },
    };
    window.google = { picker };
  });
  await page.route("**/*.supabase.co/**", async (route) => {
    const url = new URL(route.request().url());
    let data;
    if (url.pathname.endsWith("/token")) data = { access_token: "crm-token", refresh_token: "refresh", expires_in: 3600, token_type: "bearer", user };
    else if (url.pathname.endsWith("/user")) data = user;
    else if (url.pathname.endsWith("/account_drive_settings")) {
      data = saved;
      if (route.request().method() === "PATCH") {
        writes.push(route.request().postDataJSON());
        data = conflict ? null : { ...saved, ...route.request().postDataJSON() };
      }
    } else if (url.pathname.endsWith("/app_state")) {
      data = { id: "state", orders: [], trips: [], order_stages: [], trip_stages: [], print_signer: {}, updated_at: "2026-11-05T10:00:00+00:00" };
    } else throw new Error(`Unexpected request: ${url.pathname}`);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  });
  await page.route("https://www.googleapis.com/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/about")) return route.fulfill({ json: { user: { emailAddress: "assistant@google.test", displayName: "Assistant" } } });
    const id = url.pathname.split("/").pop();
    await route.fulfill({ status: denied ? 403 : 200, json: denied ? { error: { message: "Forbidden" } } : {
      id, name: "Папка Google", mimeType: "application/vnd.google-apps.folder", capabilities: { canAddChildren: true },
    } });
  });
  return writes;
}

async function openDrive(page) {
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Пароль", { exact: true }).fill("secret123");
  await page.getByTestId("auth-sign-in").click();
  await page.getByTestId("nav-settings").click();
  await page.getByTestId("settings-section-google-drive").click();
}

test("another computer uses the cloud folder, not its local selection; disconnect preserves binding", async ({ page }) => {
  const writes = await setup(page);
  await openDrive(page);
  await expect(page.getByTestId("drive-binding-status")).toContainText("Рабочая папка доступна");
  const link = page.getByRole("link", { name: "Рабочая папка" });
  await expect(link).toHaveAttribute("href", "https://drive.google.com/drive/folders/company-root");
  await page.getByTestId("drive-disconnect").click();
  await expect(link).toBeVisible();
  await expect(page.getByTestId("drive-binding-status")).toContainText("Рабочая папка сохранена");
  expect(writes).toEqual([]);
});

test("missing access keeps the saved folder and reports the required Google access", async ({ page }) => {
  const writes = await setup(page, { denied: true });
  await openDrive(page);
  await expect(page.getByTestId("drive-binding-status")).toContainText("Нет доступа к рабочей папке");
  await expect(page.getByRole("link", { name: "Рабочая папка" })).toBeVisible();
  expect(writes).toEqual([]);
});

test("folder change requires confirmation and uses versioned update", async ({ page }) => {
  const writes = await setup(page, { conflict: true });
  await openDrive(page);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByTestId("drive-select-folder").click();
  expect(writes).toEqual([]);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("drive-select-folder").click();
  await expect(page.getByTestId("drive-hint")).toContainText("Возможно, её уже изменили");
  await expect(page.getByRole("link", { name: "Рабочая папка" })).toBeVisible();
  expect(writes).toHaveLength(1);
});

test("Google script failure recovers on the next click without reloading CRM", async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => { delete window.google; delete window.gapi; });
  let requests = 0;
  await page.route("https://apis.google.com/js/api.js", async (route) => {
    requests += 1;
    if (requests <= 2) return route.abort("connectionreset");
    await route.fulfill({ contentType: "application/javascript", body: `
      window.gapi = { load: function(name, options) {
        window.google = { picker: {
          Action: { PICKED: 'picked', CANCEL: 'cancel' }, ViewId: { FOLDERS: 'folders' },
          DocsView: class { setIncludeFolders() { return this; } setSelectFolderEnabled() { return this; } },
          PickerBuilder: class {
            addView() { return this; } setDeveloperKey() { return this; } setOAuthToken() { return this; }
            setCallback() { return this; } build() { return this; }
            setVisible() { window.pickerOpened = true; }
          }
        } };
        options.callback();
      } };
    ` });
  });
  await openDrive(page);
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByTestId("drive-select-folder").click();
  await expect(page.getByTestId("drive-hint")).toContainText("обновлять страницу не нужно");
  expect(requests).toBe(2);
  await expect(page.getByTestId("drive-select-folder")).toBeEnabled();
  await page.getByTestId("drive-select-folder").click();
  await page.waitForFunction(() => window.pickerOpened === true);
  expect(requests).toBe(3);
});
