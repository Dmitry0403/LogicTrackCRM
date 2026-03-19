import { describe, expect, it, vi } from "vitest";

import {
  DRIVE_OP_AUTORETRY_COUNT,
  createDriveOpKey,
  createDriveOpRunner,
  getDriveRetryDelayMs,
  isDriveTransientError,
} from "./driveSync";

describe("drive sync helpers", () => {
  it("builds stable queue keys", () => {
    expect(createDriveOpKey("create_order_folder", { orderId: "o-1" })).toBe("create_order_folder:o-1");
    expect(createDriveOpKey("move_folder", { folderId: "f-1", parentId: null })).toBe("move_folder:f-1:root");
    expect(createDriveOpKey("rename_folder", { folderId: "f-2" })).toBe("rename_folder:f-2");
  });

  it("detects transient drive errors", () => {
    expect(isDriveTransientError({ status: 503 })).toBe(true);
    expect(isDriveTransientError({ message: "backend_wake_timeout" })).toBe(true);
    expect(isDriveTransientError({ message: "Failed to fetch" })).toBe(true);
    expect(isDriveTransientError({ status: 403, message: "forbidden" })).toBe(false);
  });

  it("caps retry delay growth", () => {
    expect(getDriveRetryDelayMs(0)).toBe(1000);
    expect(getDriveRetryDelayMs(1)).toBe(2000);
    expect(getDriveRetryDelayMs(4)).toBe(5000);
  });

  it("retries transient errors once and then succeeds", async () => {
    const ensureBackendAwake = vi.fn().mockResolvedValue(true);
    const isDrivePermissionError = vi.fn().mockReturnValue(false);
    const operation = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("backend_wake_timeout"), { status: 503 }))
      .mockResolvedValueOnce("ok");

    const runDriveOp = createDriveOpRunner({
      ensureBackendAwake,
      isDrivePermissionError,
    });

    await expect(runDriveOp(operation)).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(DRIVE_OP_AUTORETRY_COUNT + 1);
    expect(ensureBackendAwake).toHaveBeenNthCalledWith(1, { force: false });
    expect(ensureBackendAwake).toHaveBeenNthCalledWith(2, { force: true });
  });

  it("does not retry permission errors", async () => {
    const error = Object.assign(new Error("permission_denied"), { status: 403 });
    const ensureBackendAwake = vi.fn().mockResolvedValue(true);
    const isDrivePermissionError = vi.fn().mockReturnValue(true);
    const operation = vi.fn().mockRejectedValue(error);

    const runDriveOp = createDriveOpRunner({
      ensureBackendAwake,
      isDrivePermissionError,
    });

    await expect(runDriveOp(operation)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
