import { describe, expect, it } from "vitest";
import {
  calculateAirportDelivery,
  calculateSvoMsqDelivery,
  calculateSvoMsqDeliveryFromJuly31,
} from "./workspace";

describe("calculateSvoMsqDelivery", () => {
  it("uses the base rate for weight up to 100 kg", () => {
    expect(calculateSvoMsqDelivery(100, Number.NaN, false)).toBe(120);
  });

  it("adds weight and distance charges and rounds up to five", () => {
    expect(calculateSvoMsqDelivery(125, 10, false)).toBe(140);
  });

  it("adds the other warehouse surcharge after rounding", () => {
    expect(calculateSvoMsqDelivery(100, 1, true)).toBe(175);
  });

  it("uses assembly weight brackets from 750 kg", () => {
    expect(calculateSvoMsqDelivery(750, 0, false)).toBe(450);
    expect(calculateSvoMsqDelivery(1000, 0, false)).toBe(450);
    expect(calculateSvoMsqDelivery(1001, 0, false)).toBe(500);
    expect(calculateSvoMsqDelivery(1500, 0, false)).toBe(500);
    expect(calculateSvoMsqDelivery(1501, 0, false)).toBe(600);
  });

  it("adds distance and another warehouse to an assembly bracket", () => {
    expect(calculateSvoMsqDelivery(800, 11, true)).toBe(510);
  });
});

describe("calculateSvoMsqDeliveryFromJuly31", () => {
  it("uses the new base rate for weight up to 100 kg", () => {
    expect(calculateSvoMsqDeliveryFromJuly31(100, Number.NaN, false)).toBe(190);
  });

  it("uses the new weight rate and rounds up to five", () => {
    expect(calculateSvoMsqDeliveryFromJuly31(125, 10, false)).toBe(215);
  });

  it("adds the other warehouse surcharge after rounding", () => {
    expect(calculateSvoMsqDeliveryFromJuly31(100, 1, true)).toBe(245);
  });

  it("uses new assembly rates from July 31", () => {
    expect(calculateSvoMsqDeliveryFromJuly31(750, 0, false)).toBe(700);
    expect(calculateSvoMsqDeliveryFromJuly31(1000, 0, false)).toBe(700);
    expect(calculateSvoMsqDeliveryFromJuly31(1001, 0, false)).toBe(750);
    expect(calculateSvoMsqDeliveryFromJuly31(1500, 0, false)).toBe(750);
    expect(calculateSvoMsqDeliveryFromJuly31(1501, 0, false)).toBe(900);
  });

  it("adds distance and another warehouse to a July 31 bracket", () => {
    expect(calculateSvoMsqDeliveryFromJuly31(800, 11, true)).toBe(760);
  });
});

describe("calculateAirportDelivery", () => {
  it("uses weight brackets through 5000 kg", () => {
    expect(calculateAirportDelivery(500, Number.NaN, false, false)).toBe(550);
    expect(calculateAirportDelivery(1000, Number.NaN, false, false)).toBe(600);
    expect(calculateAirportDelivery(2000, Number.NaN, false, false)).toBe(650);
    expect(calculateAirportDelivery(3000, Number.NaN, false, false)).toBe(750);
    expect(calculateAirportDelivery(3400, Number.NaN, false, false)).toBe(800);
    expect(calculateAirportDelivery(5000, Number.NaN, false, false)).toBe(850);
  });

  it("adds distance and rounds up to five", () => {
    expect(calculateAirportDelivery(1000, 11, false, false)).toBe(610);
  });

  it("adds the July 31 surcharge", () => {
    expect(calculateAirportDelivery(1000, 0, false, true)).toBe(950);
  });

  it("adds 100 dollars for Zhukovsky", () => {
    expect(calculateAirportDelivery(500, 0, true, false)).toBe(700);
    expect(calculateAirportDelivery(1000, 0, true, false)).toBe(700);
  });

  it("adds 50 dollars for each home AWB", () => {
    expect(calculateAirportDelivery(500, 0, false, false, 3)).toBe(700);
    expect(calculateAirportDelivery(500, 0, false, true, 3)).toBe(1050);
  });
});
