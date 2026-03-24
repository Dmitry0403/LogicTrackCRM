export const normalizeText = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/\u0451/g, "\u0435")
    .replace(/\s+/g, " ")
    .trim();
export const normalizeAirport = (airport, airportAliases) => airportAliases.get(airport) || airport;

export const normalizeTerminal = (terminal, terminalAliases) => terminalAliases.get(terminal) || terminal;

export const resolveCargoTerminalKey = ({ shipmentAirport, shipmentTerminal, ru }) => {
  if (shipmentAirport === ru.domain.airports.sheremetyevo) {
    if (shipmentTerminal === ru.domain.terminals.moscowCargo) return "svo_moscow";
    if (shipmentTerminal === ru.domain.terminals.sheremetyevoCargo) return "svo_sher";
    return "";
  }
  if (shipmentAirport === ru.domain.airports.vnukovo) return "vko";
  if (shipmentAirport === ru.domain.airports.domodedovo) return "dme";
  if (shipmentAirport === ru.domain.airports.zhukovsky) return "zia";
  return "";
};

export const composeAwb = (prefix, number, hawb = "") => {
  const p = String(prefix || "").replace(/\D/g, "").slice(0, 3);
  const n = String(number || "").trim().replace(/\s+/g, "").slice(0, 32);
  const hawbPart = String(hawb || "").trim().replace(/\//g, "");
  if (p && n) {
    return hawbPart ? `${p}-${n}/${hawbPart}` : `${p}-${n}`;
  }
  if (p) return p;
  if (n) return n;
  return "";
};

export const splitAwb = (awb) => {
  const clean = String(awb || "").trim();
  const slashIndex = clean.indexOf("/");
  const baseAwb = slashIndex >= 0 ? clean.slice(0, slashIndex).trim() : clean;
  const hawb = slashIndex >= 0 ? clean.slice(slashIndex + 1).trim() : "";
  const match = baseAwb.match(/^(\d{3})-(.+)$/);
  if (match) {
    return {
      awbPrefix: match[1],
      awbNumber: String(match[2] || "").trim().replace(/\s+/g, "").slice(0, 32),
      hasHawb: Boolean(hawb),
      hawb,
    };
  }
  return {
    awbPrefix: "",
    awbNumber: baseAwb.replace(/\s+/g, "").slice(0, 32),
    hasHawb: Boolean(hawb),
    hawb,
  };
};

export const createManualCargoCheckAirportSet = (ru) =>
  new Set([
    ru.domain.airports.vnukovo,
    ru.domain.airports.domodedovo,
  ]);

export const isManualCargoCheckAirport = (airport, manualCargoCheckAirports) =>
  manualCargoCheckAirports.has(String(airport || "").trim());

export const getCustomsName = (code, customsCodeMap, invalidCustomsCodeLabel) => customsCodeMap[code] || invalidCustomsCodeLabel;

export const getCustomsSuggestions = (typedValue, customsCodeMap) => {
  const typed = normalizeText(typedValue);

  return Object.entries(customsCodeMap)
    .filter(([code, name]) => {
      if (!typed) return true;
      return code.includes(typed) || normalizeText(name).includes(typed);
    })
    .map(([code, name]) => ({
      value: code,
      label: `${code} - ${name}`,
    }));
};
