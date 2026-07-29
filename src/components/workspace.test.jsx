import { describe, expect, it } from "vitest";
import {
  calculateAirportDelivery,
  calculateSvoMsqDelivery,
} from "./workspace";

describe("calculateSvoMsqDelivery", () => {
  it("uses the base rate for weight up to 100 kg", () => {
    expect(calculateSvoMsqDelivery(100, Number.NaN, false)).toBe(190);
  });

  it("adds weight and distance charges and rounds up to five", () => {
    expect(calculateSvoMsqDelivery(125, 10, false)).toBe(215);
  });

  it("adds the other warehouse surcharge after rounding", () => {
    expect(calculateSvoMsqDelivery(100, 1, true)).toBe(245);
  });

  it("uses current assembly weight brackets", () => {
    expect(calculateSvoMsqDelivery(750, 0, false)).toBe(700);
    expect(calculateSvoMsqDelivery(1000, 0, false)).toBe(700);
    expect(calculateSvoMsqDelivery(1001, 0, false)).toBe(750);
    expect(calculateSvoMsqDelivery(1500, 0, false)).toBe(750);
    expect(calculateSvoMsqDelivery(1501, 0, false)).toBe(900);
  });

  it("adds distance and another warehouse to a current bracket", () => {
    expect(calculateSvoMsqDelivery(800, 11, true)).toBe(760);
  });

  it("adds the delivery surcharge to an assembly rate", () => {
    expect(calculateSvoMsqDelivery(800, 0, false, true)).toBe(750);
  });
});

describe("calculateAirportDelivery", () => {
  it("uses weight brackets through 5000 kg", () => {
    expect(calculateAirportDelivery(500, Number.NaN, false, 1)).toBe(900);
    expect(calculateAirportDelivery(1000, Number.NaN, false, 1)).toBe(950);
    expect(calculateAirportDelivery(2000, Number.NaN, false, 1)).toBe(1000);
    expect(calculateAirportDelivery(3000, Number.NaN, false, 1)).toBe(1050);
    expect(calculateAirportDelivery(3400, Number.NaN, false, 1)).toBe(1100);
    expect(calculateAirportDelivery(5000, Number.NaN, false, 1)).toBe(1200);
  });

  it("adds distance and rounds up to five", () => {
    expect(calculateAirportDelivery(1000, 11, false, 1)).toBe(960);
  });

  it("adds 100 dollars for Zhukovsky", () => {
    expect(calculateAirportDelivery(500, 0, true, 1)).toBe(1050);
    expect(calculateAirportDelivery(1000, 0, true, 1)).toBe(1050);
  });

  it("adds 50 dollars for each home AWB after the first", () => {
    expect(calculateAirportDelivery(500, 0, false, 1)).toBe(900);
    expect(calculateAirportDelivery(500, 0, false, 2)).toBe(950);
    expect(calculateAirportDelivery(500, 0, false, 3)).toBe(1000);
  });

  it("adds the delivery surcharge to a regular airport rate", () => {
    expect(calculateAirportDelivery(500, 0, false, 1, true)).toBe(950);
  });
});
