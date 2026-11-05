import { describe, expect, it, vi } from "vitest";
import { folderFromSettings, readDriveSettings, saveDriveSettings, verifyDriveFolder } from "./driveBinding";

function clientReturning(result) {
  const query = {};
  for (const method of ["select", "eq", "insert", "update"]) query[method] = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => result);
  return { client: { from: vi.fn(() => query) }, query };
}

describe("account Drive binding", () => {
  it("uses the cloud folder ID and a canonical link", () => {
    expect(folderFromSettings(null)).toBeNull();
    expect(folderFromSettings({ folder_id: "root", folder_name: "Company" })).toEqual({ id: "root", name: "Company", url: "https://drive.google.com/drive/folders/root" });
  });
  it("reads only the signed in CRM user's setting", async () => {
    const { client, query } = clientReturning({ data: { folder_id: "root" } });
    await expect(readDriveSettings(client, "user-1")).resolves.toEqual({ folder_id: "root" });
    expect(query.eq).toHaveBeenCalledWith("owner_user_id", "user-1");
  });
  it("blocks file operations when settings cannot be loaded", async () => {
    const { client } = clientReturning({ error: { message: "missing table" } });
    await expect(readDriveSettings(client, "user-1")).rejects.toMatchObject({ driveBindingBlocked: true });
  });
  it("creates initial binding without overwriting an existing row", async () => {
    const { client, query } = clientReturning({ data: { folder_id: "root" } });
    await saveDriveSettings(client, "user-1", { id: "root", name: "Company" }, null);
    expect(query.insert).toHaveBeenCalledWith({ owner_user_id: "user-1", folder_id: "root", folder_name: "Company" });
    expect(query.update).not.toHaveBeenCalled();
  });
  it("uses exact version for folder changes and rejects races", async () => {
    const { client, query } = clientReturning({ data: null });
    await expect(saveDriveSettings(client, "user-1", { id: "new" }, { updated_at: "version-1" })).rejects.toMatchObject({ driveBindingBlocked: true });
    expect(query.eq).toHaveBeenCalledWith("updated_at", "version-1");
  });
  it("checks that the folder is accessible and writable", async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ id: "root", name: "Company", mimeType: "application/vnd.google-apps.folder", capabilities: { canAddChildren: true } }) }));
    await expect(verifyDriveFolder("root", "token", fetcher)).resolves.toMatchObject({ id: "root" });
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe("Bearer token");
  });
  it.each([
    { ok: false },
    { ok: true, json: async () => ({ id: "root", mimeType: "application/pdf" }) },
    { ok: true, json: async () => ({ id: "root", trashed: true, mimeType: "application/vnd.google-apps.folder", capabilities: { canAddChildren: true } }) },
    { ok: true, json: async () => ({ id: "root", mimeType: "application/vnd.google-apps.folder", capabilities: { canAddChildren: false } }) },
  ])("rejects missing, non-folder, deleted and read-only targets", async (response) => {
    await expect(verifyDriveFolder("root", "token", async () => response)).rejects.toMatchObject({ driveBindingBlocked: true });
  });
});
