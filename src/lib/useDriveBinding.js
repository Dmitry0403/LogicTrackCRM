import React from "react";
import { supabase } from "./supabase";
import { bindingBlocked, folderFromSettings, readDriveSettings, saveDriveSettings } from "./driveBinding";

export function useDriveBinding(userId, enabled) {
  const [state, setState] = React.useState({ userId: null, ready: false, row: null, error: "" });
  const identity = React.useRef(userId);
  identity.current = userId;
  const sequence = React.useRef(0);

  const refresh = React.useCallback(async () => {
    if (!enabled || !userId) return null;
    const request = ++sequence.current;
    try {
      const row = await readDriveSettings(supabase, userId);
      if (identity.current === userId && request === sequence.current) setState({ userId, ready: true, row, error: "" });
      return row;
    } catch (error) {
      if (identity.current === userId && request === sequence.current) setState((previous) => ({ ...previous, userId, ready: false, error: error.message }));
      throw error;
    }
  }, [enabled, userId]);

  React.useEffect(() => {
    let stopped = false;
    const load = () => { if (!stopped) void refresh().catch(() => {}); };
    load();
    const interval = window.setInterval(load, 30000);
    window.addEventListener("focus", load);
    return () => { stopped = true; ++sequence.current; clearInterval(interval); window.removeEventListener("focus", load); };
  }, [refresh]);

  const row = state.userId === userId ? state.row : null;
  const ready = !enabled || (state.userId === userId && state.ready);
  const assertCurrent = React.useCallback(async (expectedFolderId) => {
    if (!userId || identity.current !== userId) throw bindingBlocked("Сначала войдите в аккаунт CRM.");
    const latest = await refresh();
    if (identity.current !== userId || !latest?.folder_id || latest.folder_id !== expectedFolderId) {
      throw bindingBlocked("Рабочая папка изменилась или ещё не выбрана. Проверьте привязку в настройках Drive.");
    }
    return latest;
  }, [userId, refresh]);

  const save = React.useCallback(async (folder, expected) => {
    if (!userId || identity.current !== userId) throw bindingBlocked("Сначала войдите в аккаунт CRM.");
    ++sequence.current;
    const result = await saveDriveSettings(supabase, userId, folder, expected);
    if (identity.current !== userId) throw bindingBlocked("Аккаунт CRM изменился. Обновите страницу.");
    ++sequence.current;
    setState({ userId, ready: true, row: result, error: "" });
    return result;
  }, [userId]);

  return { row, folder: folderFromSettings(row), ready, error: state.userId === userId ? state.error : "", refresh, assertCurrent, save };
}
