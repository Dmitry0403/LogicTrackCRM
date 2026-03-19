import { describe, expect, it } from "vitest";

import {
  buildTripDriveFolderName,
  buildTripOrdersSummary,
  getTripsWithoutOrderIds,
  parseTripCarNumber,
} from "./trips";

describe("trip helpers", () => {
  it("parses truck and trailer numbers", () => {
    expect(parseTripCarNumber("AT 2762-5/A 1482 Е-5")).toEqual({
      carNumber: "AT 2762-5",
      hasTrailer: true,
      trailerNumber: "A 1482 Е-5",
    });

    expect(parseTripCarNumber("AT 2762-5")).toEqual({
      carNumber: "AT 2762-5",
      hasTrailer: false,
      trailerNumber: "",
    });
  });

  it("builds trip drive folder name from car number and driver surname", () => {
    expect(
      buildTripDriveFolderName({
        carNumber: "AT 2762-5",
        driverName: "\u041c\u0435\u0434\u0432\u0435\u0434\u044c \u0412\u0430\u0434\u0438\u043c",
        tripFallbackName: "\u0420\u0435\u0439\u0441",
      }),
    ).toBe("AT 2762-5 \u041c\u0435\u0434\u0432\u0435\u0434\u044c");
  });

  it("builds compact trip order summary", () => {
    const orders = [
      { id: "1", name: "\u041b\u0438\u0441\u043a\u043e\u043d-\u0411\u0435\u043b" },
      { id: "2", recipient: "\u0411\u0435\u043b\u0412\u042d\u041c" },
      { id: "3", name: "\u041b\u043e\u0433\u0438\u0441\u0442\u0438\u043a \u041f\u0440\u043e" },
      { id: "4", name: "\u042d\u0439\u0431\u043b" },
    ];

    expect(buildTripOrdersSummary(["1", "2", "3", "4"], orders)).toBe(
      "\u041b\u0438\u0441\u043a\u043e\u043d-\u0411\u0435\u043b, \u0411\u0435\u043b\u0412\u042d\u041c, \u041b\u043e\u0433\u0438\u0441\u0442\u0438\u043a \u041f\u0440\u043e (+1)",
    );
  });

  it("removes orders from trips and rebuilds summary", () => {
    const orders = [
      { id: "1", name: "\u041b\u0438\u0441\u043a\u043e\u043d-\u0411\u0435\u043b" },
      { id: "2", name: "\u0411\u0435\u043b\u0412\u042d\u041c" },
      { id: "3", name: "\u041b\u043e\u0433\u0438\u0441\u0442\u0438\u043a \u041f\u0440\u043e" },
    ];
    const trips = [
      { id: "trip-1", orderIds: ["1", "2", "3"], ordersSummary: "old" },
      { id: "trip-2", orderIds: ["2"], ordersSummary: "old" },
    ];

    expect(getTripsWithoutOrderIds(trips, ["2"], orders)).toEqual([
      {
        id: "trip-1",
        orderIds: ["1", "3"],
        ordersSummary: "\u041b\u0438\u0441\u043a\u043e\u043d-\u0411\u0435\u043b, \u041b\u043e\u0433\u0438\u0441\u0442\u0438\u043a \u041f\u0440\u043e",
      },
      {
        id: "trip-2",
        orderIds: [],
        ordersSummary: "",
      },
    ]);
  });
});
