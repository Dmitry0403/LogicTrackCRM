import { describe, expect, it } from "vitest";

import {
  composeAwb,
  createManualCargoCheckAirportSet,
  getCustomsName,
  getCustomsSuggestions,
  isManualCargoCheckAirport,
  normalizeText,
  resolveCargoTerminalKey,
  splitAwb,
} from "./cargo";
import { RU } from "../i18n/ru";
import { CUSTOMS_CODE_MAP } from "../constants/domain";

describe("cargo helpers", () => {
  it("normalizes russian text for search", () => {
    expect(normalizeText("  \u0401\u043b\u043a\u0430  \u041b\u041e\u0413\u0418\u0421\u0422\u0418\u041a  ")).toBe(
      "\u0435\u043b\u043a\u0430 \u043b\u043e\u0433\u0438\u0441\u0442\u0438\u043a",
    );
  });

  it("composes AWB with optional HAWB", () => {
    expect(composeAwb("771", "11061551")).toBe("771-11061551");
    expect(composeAwb("", "AB12345")).toBe("AB12345");
    expect(composeAwb("771", "11061551", "HAWB/1")).toBe("771-11061551/HAWB1");
  });

  it("splits AWB into prefix, number, and HAWB", () => {
    expect(splitAwb("771-11061551/REF-1")).toEqual({
      awbPrefix: "771",
      awbNumber: "11061551",
      hasHawb: true,
      hawb: "REF-1",
    });

    expect(splitAwb("AB12345")).toEqual({
      awbPrefix: "",
      awbNumber: "AB12345",
      hasHawb: false,
      hawb: "",
    });
  });

  it("resolves cargo terminal keys by airport and terminal", () => {
    expect(
      resolveCargoTerminalKey({
        shipmentAirport: RU.domain.airports.sheremetyevo,
        shipmentTerminal: RU.domain.terminals.moscowCargo,
        ru: RU,
      }),
    ).toBe("svo_moscow");

    expect(
      resolveCargoTerminalKey({
        shipmentAirport: RU.domain.airports.domodedovo,
        shipmentTerminal: "",
        ru: RU,
      }),
    ).toBe("dme");
  });

  it("marks vnukovo and domodedovo as manual-check airports", () => {
    const manualAirports = createManualCargoCheckAirportSet(RU);

    expect(isManualCargoCheckAirport(RU.domain.airports.vnukovo, manualAirports)).toBe(true);
    expect(isManualCargoCheckAirport(RU.domain.airports.domodedovo, manualAirports)).toBe(true);
    expect(isManualCargoCheckAirport(RU.domain.airports.sheremetyevo, manualAirports)).toBe(false);
  });

  it("returns customs label and suggestions", () => {
    expect(getCustomsName("06536", CUSTOMS_CODE_MAP, RU.domain.invalidCustomsCode)).toBe(
      "\u041f\u0422\u041e \u0410\u044d\u0440\u043e\u043f\u043e\u0440\u0442 \u041c\u0438\u043d\u0441\u043a",
    );

    const suggestions = getCustomsSuggestions("\u0430\u044d\u0440\u043e\u043f\u043e\u0440\u0442", CUSTOMS_CODE_MAP);
    expect(suggestions.some((item) => item.value === "06536")).toBe(true);
  });
});
