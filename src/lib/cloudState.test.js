import { describe, expect, it, vi } from "vitest";

import {
  buildCloudPayload,
  normalizeCloudSnapshot,
  normalizePrintSignerSettings,
  parseCloudUpdatedAt,
  reassignItemsToValidStage,
  shouldApplyRemoteSnapshot,
} from "./cloudState";

describe("cloud state helpers", () => {
  it("parses cloud timestamps safely", () => {
    expect(parseCloudUpdatedAt("2026-03-18T12:00:00.000Z")).toBeGreaterThan(0);
    expect(parseCloudUpdatedAt("not-a-date")).toBe(0);
    expect(parseCloudUpdatedAt("")).toBe(0);
  });

  it("normalizes signer settings with defaults", () => {
    expect(
      normalizePrintSignerSettings(
        { signerRole: "  test  ", signerName: "" },
        { signerRole: "default role", signerName: "default name" },
      ),
    ).toEqual({
      signerRole: "test",
      signerName: "default name",
    });
  });

  it("normalizes cloud snapshot structure", () => {
    const normalizeOrderStages = vi.fn((items) => items.map((item) => ({ ...item, normalized: true })));
    const normalizeTripStages = vi.fn((items) => items.map((item) => ({ ...item, normalized: true })));

    const result = normalizeCloudSnapshot(
      {
        orders: [{ id: "o-1" }],
        trips: [{ id: "t-1" }],
        order_stages: [{ id: "s-1" }],
        trip_stages: [{ id: "ts-1" }],
        print_signer: { signerRole: " role ", signerName: " name " },
      },
      {
        normalizeOrderStages,
        normalizeTripStages,
        defaultOrderStages: [{ id: "fallback-order" }],
        defaultTripStages: [{ id: "fallback-trip" }],
        defaultPrintSignerSettings: { signerRole: "default role", signerName: "default name" },
      },
    );

    expect(result).toEqual({
      orders: [{ id: "o-1" }],
      trips: [{ id: "t-1" }],
      orderStages: [{ id: "s-1", normalized: true }],
      tripStages: [{ id: "ts-1", normalized: true }],
      printSignerSettings: { signerRole: "role", signerName: "name" },
    });
  });

  it("detects newer remote snapshots with tolerance", () => {
    expect(
      shouldApplyRemoteSnapshot({
        remoteUpdatedAt: 2000,
        lastCloudUpdatedAt: 1000,
      }),
    ).toBe(true);

    expect(
      shouldApplyRemoteSnapshot({
        remoteUpdatedAt: 1300,
        lastCloudUpdatedAt: 1000,
      }),
    ).toBe(false);
  });

  it("builds Supabase payload from snapshot", () => {
    expect(
      buildCloudPayload({
        currentUserId: "user-1",
        snapshot: {
          orders: [{ id: "o-1" }],
          trips: [{ id: "t-1" }],
          orderStages: [{ id: "os-1" }],
          tripStages: [{ id: "ts-1" }],
          printSignerSettings: { signerRole: "role", signerName: "name" },
        },
      }),
    ).toEqual({
      owner_user_id: "user-1",
      orders: [{ id: "o-1" }],
      trips: [{ id: "t-1" }],
      order_stages: [{ id: "os-1" }],
      trip_stages: [{ id: "ts-1" }],
      print_signer: { signerRole: "role", signerName: "name" },
    });
  });

  it("reassigns items with invalid stage ids to fallback stage", () => {
    const items = [
      { id: "1", stageId: "valid-stage" },
      { id: "2", stageId: "missing-stage" },
    ];
    const stages = [{ id: "valid-stage" }, { id: "other-stage" }];

    expect(reassignItemsToValidStage(items, stages, "valid-stage")).toEqual([
      { id: "1", stageId: "valid-stage" },
      { id: "2", stageId: "valid-stage" },
    ]);
  });
});
