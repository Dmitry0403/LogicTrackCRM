import { describe, expect, it } from "vitest";

import { AIRPORT_ALIASES, TERMINAL_ALIASES } from "../constants/domain";
import { RU } from "../i18n/ru";
import { getPowerOfAttorneyStatus, getRecipientSuggestions } from "./powerOfAttorney";

describe("power of attorney helpers", () => {
  const registry = {
    [RU.domain.airports.sheremetyevo]: {
      [RU.domain.terminals.moscowCargo]: [
        { recipient: "\u041b\u0438\u0441\u043a\u043e\u043d-\u0411\u0435\u043b", hasAttorney: "+", validUntil: "31.12.2099" },
        { recipient: "\u041b\u0438\u0441\u043a\u043e\u043d-\u0411\u0435\u043b", hasAttorney: "+", validUntil: "01.01.2099" },
        { recipient: "\u0411\u0435\u043b\u0412\u042d\u041c", hasAttorney: "+", validUntil: "" },
      ],
      [RU.domain.terminals.sheremetyevoCargo]: [],
    },
    [RU.domain.airports.domodedovo]: [
      { recipient: "\u041b\u043e\u0433\u0438\u0441\u0442\u0438\u043a \u041f\u0440\u043e", hasAttorney: "+", validUntil: "31.12.2099" },
      { recipient: "\u041b\u043e\u0433\u0438\u0441\u0442\u0438\u043a \u041f\u0440\u043e", hasAttorney: "+", validUntil: "" },
      { recipient: "\u0411\u0435\u0437 \u0434\u043e\u0432\u0435\u0440\u0435\u043d\u043d\u043e\u0441\u0442\u0438", hasAttorney: "-", validUntil: "31.12.2099" },
    ],
  };

  it("returns valid status with latest expiration date", () => {
    const status = getPowerOfAttorneyStatus({
      shipmentAirport: RU.domain.airports.sheremetyevo,
      shipmentTerminal: RU.domain.terminals.moscowCargo,
      recipient: "\u041b\u0438\u0441\u043a\u043e\u043d-\u0411\u0435\u043b",
      registry,
      ru: RU,
      airportAliases: AIRPORT_ALIASES,
      terminalAliases: TERMINAL_ALIASES,
    });

    expect(status).toEqual({
      type: "success",
      message: "\u0414\u043e\u0432\u0435\u0440\u0435\u043d\u043d\u043e\u0441\u0442\u044c \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043b\u044c\u043d\u0430 \u0434\u043e 31.12.2099.",
    });
  });

  it("returns missing status when there is no matching power of attorney", () => {
    const status = getPowerOfAttorneyStatus({
      shipmentAirport: RU.domain.airports.domodedovo,
      shipmentTerminal: "",
      recipient: "\u041d\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043d\u044b\u0439 \u043f\u043e\u043b\u0443\u0447\u0430\u0442\u0435\u043b\u044c",
      registry,
      ru: RU,
      airportAliases: AIRPORT_ALIASES,
      terminalAliases: TERMINAL_ALIASES,
    });

    expect(status).toEqual({
      type: "danger",
      message: RU.domain.poa.missing,
    });
  });

  it("returns valid status with unknown expiry when there is no date", () => {
    const status = getPowerOfAttorneyStatus({
      shipmentAirport: RU.domain.airports.sheremetyevo,
      shipmentTerminal: RU.domain.terminals.moscowCargo,
      recipient: "\u0411\u0435\u043b\u0412\u042d\u041c",
      registry,
      ru: RU,
      airportAliases: AIRPORT_ALIASES,
      terminalAliases: TERMINAL_ALIASES,
    });

    expect(status).toEqual({
      type: "success",
      message: RU.domain.poa.validUntilUnknown,
    });
  });

  it("builds recipient suggestions with date labels for duplicates", () => {
    const suggestions = getRecipientSuggestions({
      shipmentAirport: RU.domain.airports.domodedovo,
      shipmentTerminal: "",
      recipient: "\u043b\u043e\u0433\u0438\u0441\u0442\u0438\u043a",
      registry,
      ru: RU,
      airportAliases: AIRPORT_ALIASES,
      terminalAliases: TERMINAL_ALIASES,
    });

    expect(suggestions).toEqual([
      {
        value: "\u041b\u043e\u0433\u0438\u0441\u0442\u0438\u043a \u041f\u0440\u043e",
        label: "\u041b\u043e\u0433\u0438\u0441\u0442\u0438\u043a \u041f\u0440\u043e - \u0434\u043e 31.12.2099",
      },
      {
        value: "\u041b\u043e\u0433\u0438\u0441\u0442\u0438\u043a \u041f\u0440\u043e",
        label: "\u041b\u043e\u0433\u0438\u0441\u0442\u0438\u043a \u041f\u0440\u043e - \u0441\u0440\u043e\u043a \u043d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d",
      },
    ]);
  });
});
