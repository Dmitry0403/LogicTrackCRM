import { normalizeAirport, normalizeTerminal, normalizeText } from "./cargo";

const hasPlusMark = (value) => {
  if (typeof value === "boolean") return value;
  if (value == null) return false;
  return String(value).includes("+");
};

export const parseDate = (rawDate) => {
  if (!rawDate) return null;
  const value = String(rawDate).trim();
  if (!value) return null;

  const dotMatch = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dotMatch) {
    const [, d, m, y] = dotMatch;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

export const formatRuDate = (date) =>
  `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;

export const getPowerOfAttorneyStatus = ({ shipmentAirport, shipmentTerminal, recipient, registry, ru, airportAliases, terminalAliases }) => {
  const normalizedRecipient = normalizeText(recipient);
  if (!normalizedRecipient) return null;

  const airportKey = normalizeAirport(shipmentAirport, airportAliases);
  const airportRegistry = registry[airportKey];
  if (!airportRegistry) {
    return { type: "danger", message: ru.domain.poa.missing };
  }

  let records = [];
  if (airportKey === ru.domain.airports.sheremetyevo) {
    const terminalKey = normalizeTerminal(shipmentTerminal, terminalAliases) || ru.domain.terminals.moscowCargo;
    records = airportRegistry[terminalKey] || [];
  } else if (Array.isArray(airportRegistry)) {
    records = airportRegistry;
  }

  const matchedRecords = records.filter(
    (record) => normalizeText(record.recipient) === normalizedRecipient && hasPlusMark(record.hasAttorney),
  );
  if (matchedRecords.length === 0) {
    return { type: "danger", message: ru.domain.poa.missing };
  }

  const validUntilDates = matchedRecords
    .map((record) => parseDate(record.validUntil))
    .filter(Boolean);

  if (validUntilDates.length > 0) {
    const latestValidUntil = validUntilDates.reduce((latest, current) => (current > latest ? current : latest));
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (latestValidUntil < todayStart) {
      return {
        type: "danger",
        message: `${ru.domain.poa.expiredPrefix} ${formatRuDate(latestValidUntil)}.`,
      };
    }
    return {
      type: "success",
      message: `${ru.domain.poa.validUntilPrefix} ${formatRuDate(latestValidUntil)}.`,
    };
  }

  return { type: "success", message: ru.domain.poa.validUntilUnknown };
};

export const getRecipientSuggestions = ({ shipmentAirport, shipmentTerminal, recipient, registry, ru, airportAliases, terminalAliases }) => {
  const airportKey = normalizeAirport(shipmentAirport, airportAliases);
  const airportRegistry = registry[airportKey];
  if (!airportRegistry) return [];

  let records = [];
  if (airportKey === ru.domain.airports.sheremetyevo) {
    const terminalKey = normalizeTerminal(shipmentTerminal, terminalAliases) || ru.domain.terminals.moscowCargo;
    records = airportRegistry[terminalKey] || [];
  } else if (Array.isArray(airportRegistry)) {
    records = airportRegistry;
  }

  const typed = normalizeText(recipient);
  const uniq = new Set();
  const nameCounts = new Map();
  const suggestions = [];

  records.forEach((record) => {
    const name = String(record?.recipient || "").trim();
    if (!name) return;
    const normalizedName = normalizeText(name);
    nameCounts.set(normalizedName, (nameCounts.get(normalizedName) || 0) + 1);
  });

  records.forEach((record) => {
    const name = String(record?.recipient || "").trim();
    if (!name) return;
    const normalizedName = normalizeText(name);
    if (typed && !normalizedName.includes(typed)) return;

    const validUntilRaw = String(record?.validUntil || "").trim();
    const dedupeKey = `${normalizedName}::${validUntilRaw}`;
    if (uniq.has(dedupeKey)) return;
    uniq.add(dedupeKey);

    const hasMultipleByName = (nameCounts.get(normalizedName) || 0) > 1;
    const label = hasMultipleByName
      ? (validUntilRaw ? `${name} - ${ru.domain.poa.labelUntil} ${validUntilRaw}` : `${name} - ${ru.domain.poa.labelUnknown}`)
      : name;

    suggestions.push({ value: name, label });
  });

  return suggestions;
};
