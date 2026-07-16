import { describe, expect, it } from "vitest";
import {
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
});
