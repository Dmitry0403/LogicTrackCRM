export const bindingBlocked = (message) => Object.assign(new Error(message), { driveBindingBlocked: true });

export const folderFromSettings = (row) => row?.folder_id ? ({
  id: row.folder_id,
  name: row.folder_name || row.folder_id,
  url: `https://drive.google.com/drive/folders/${encodeURIComponent(row.folder_id)}`,
}) : null;

export async function readDriveSettings(client, userId) {
  const { data, error } = await client.from("account_drive_settings").select("*")
    .eq("owner_user_id", userId).maybeSingle();
  if (error) throw bindingBlocked("Не удалось загрузить рабочую папку. Проверьте связь и выполнение SQL drive-settings.sql в Supabase.");
  return data;
}

export async function saveDriveSettings(client, userId, folder, expected) {
  const values = { folder_id: folder.id, folder_name: folder.name || folder.id };
  const query = expected
    ? client.from("account_drive_settings").update(values).eq("owner_user_id", userId).eq("updated_at", expected.updated_at)
    : client.from("account_drive_settings").insert({ ...values, owner_user_id: userId });
  const { data, error } = await query.select("*").maybeSingle();
  if (error || !data) throw bindingBlocked("Не удалось закрепить папку. Возможно, её уже изменили на другом компьютере. Обновите привязку и повторите выбор.");
  return data;
}

export async function verifyDriveFolder(folderId, accessToken, fetcher = fetch) {
  const response = await fetcher(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType,trashed,capabilities(canAddChildren)&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw bindingBlocked("Нет доступа к рабочей папке Drive. Подключите нужный Google-аккаунт или запросите доступ редактора к этой папке.");
  const data = await response.json();
  if (data.id !== folderId || data.trashed || data.mimeType !== "application/vnd.google-apps.folder" || !data.capabilities?.canAddChildren) {
    throw bindingBlocked("Рабочая папка удалена или недоступна для записи. Восстановите папку или запросите права редактора.");
  }
  return { id: data.id, name: data.name, url: `https://drive.google.com/drive/folders/${encodeURIComponent(data.id)}` };
}
