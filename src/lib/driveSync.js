export const DRIVE_BACKEND_READY_TTL_MS = 14 * 60 * 1000;
export const DRIVE_BACKEND_WAKE_TIMEOUT_MS = 45 * 1000;
export const DRIVE_BACKEND_WAKE_REQUEST_TIMEOUT_MS = 8 * 1000;
export const DRIVE_BACKEND_WAKE_POLL_MS = 1500;
export const DRIVE_OP_RETRY_BASE_MS = 1000;
export const DRIVE_OP_RETRY_MAX_MS = 5000;
export const DRIVE_OP_AUTORETRY_COUNT = 1;

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const getDriveRetryDelayMs = (attempt) =>
  Math.min(DRIVE_OP_RETRY_MAX_MS, DRIVE_OP_RETRY_BASE_MS * (2 ** attempt));

export const isDriveTransientError = (error) => {
  const message = String(error?.message || "").toLowerCase();
  return (
    [408, 409, 425, 429, 500, 502, 503, 504].includes(Number(error?.status)) ||
    /network|fetch|timeout|timed out|failed to fetch|backend_wake_timeout|backend_unavailable|backend_health_/i.test(message)
  );
};

export const createDriveOpKey = (type, payload) => {
  if (!payload || typeof payload !== "object") return type;
  if (type === "create_order_folder") return `${type}:${payload.orderId || ""}`;
  if (type === "create_trip_folder") return `${type}:${payload.tripId || ""}`;
  if (type === "move_folder") return `${type}:${payload.folderId || ""}:${payload.parentId || "root"}`;
  if (type === "rename_folder") return `${type}:${payload.folderId || ""}`;
  if (type === "delete_folder") return `${type}:${payload.folderId || ""}`;
  return `${type}:${JSON.stringify(payload)}`;
};

export const createEnsureBackendAwake = ({
  apiBaseUrl,
  pingBackendHealth,
  backendReadyAtRef,
  backendWakePromiseRef,
}) => {
  return async ({ force = false, timeoutMs = DRIVE_BACKEND_WAKE_TIMEOUT_MS } = {}) => {
    if (!apiBaseUrl || typeof window === "undefined") return true;

    const now = Date.now();
    if (!force && now - backendReadyAtRef.current < DRIVE_BACKEND_READY_TTL_MS) return true;
    if (backendWakePromiseRef.current) return backendWakePromiseRef.current;

    const wakePromise = (async () => {
      const startedAt = Date.now();
      let lastError = null;

      while (Date.now() - startedAt < timeoutMs) {
        try {
          await pingBackendHealth({
            timeoutMs: Math.min(
              DRIVE_BACKEND_WAKE_REQUEST_TIMEOUT_MS,
              Math.max(1500, timeoutMs - (Date.now() - startedAt)),
            ),
          });
          return true;
        } catch (error) {
          lastError = error;
          if (Date.now() - startedAt >= timeoutMs) break;
          await sleep(DRIVE_BACKEND_WAKE_POLL_MS);
        }
      }

      throw lastError || new Error("backend_wake_timeout");
    })().finally(() => {
      if (backendWakePromiseRef.current === wakePromise) {
        backendWakePromiseRef.current = null;
      }
    });

    backendWakePromiseRef.current = wakePromise;
    return wakePromise;
  };
};

export const createDriveOpRunner = ({
  ensureBackendAwake,
  isDrivePermissionError,
}) => {
  return async (operation) => {
    let lastError = null;

    for (let attempt = 0; attempt <= DRIVE_OP_AUTORETRY_COUNT; attempt += 1) {
      try {
        await ensureBackendAwake({ force: attempt > 0 });
        return await operation();
      } catch (error) {
        lastError = error;
        if (
          attempt >= DRIVE_OP_AUTORETRY_COUNT ||
          isDrivePermissionError(error) ||
          !isDriveTransientError(error)
        ) {
          throw error;
        }
        await sleep(getDriveRetryDelayMs(attempt));
      }
    }

    throw lastError || new Error("drive_operation_failed");
  };
};
