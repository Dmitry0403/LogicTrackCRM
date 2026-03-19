export const parseTripCarNumber = (rawValue) => {
  const value = String(rawValue || "").trim();
  if (!value) {
    return { carNumber: "", hasTrailer: false, trailerNumber: "" };
  }
  const parts = value.split("/");
  if (parts.length < 2) {
    return { carNumber: value, hasTrailer: false, trailerNumber: "" };
  }
  return {
    carNumber: String(parts[0] || "").trim(),
    hasTrailer: true,
    trailerNumber: String(parts.slice(1).join("/") || "").trim(),
  };
};

export const extractDriverSurname = (driverName) => {
  const value = String(driverName || "").trim();
  if (!value) return "";
  return value.split(/\s+/)[0] || "";
};

export const buildTripDriveFolderName = ({ carNumber, driverName, tripFallbackName }) => {
  const car = String(carNumber || "").trim();
  const surname = extractDriverSurname(driverName);
  return [car, surname].filter(Boolean).join(" ").trim() || tripFallbackName;
};

export const buildTripOrdersSummary = (orderIds, sourceOrders) => {
  const selectedOrders = sourceOrders.filter((order) => orderIds.includes(order.id));
  const summaryHead = selectedOrders
    .slice(0, 3)
    .map((order) => order.name || order.recipient || order.id)
    .join(", ");
  return selectedOrders.length > 3
    ? `${summaryHead} (+${selectedOrders.length - 3})`
    : summaryHead;
};

export const getTripsWithoutOrderIds = (sourceTrips, orderIdsToRemove, sourceOrders, excludedTripId = "") => {
  const idsToRemove = new Set(orderIdsToRemove);
  if (idsToRemove.size === 0) return sourceTrips;
  return sourceTrips.map((trip) => {
    if (excludedTripId && trip.id === excludedTripId) return trip;
    const currentOrderIds = Array.isArray(trip.orderIds) ? trip.orderIds : [];
    const nextOrderIds = currentOrderIds.filter((tripOrderId) => !idsToRemove.has(tripOrderId));
    if (nextOrderIds.length === currentOrderIds.length) return trip;
    return {
      ...trip,
      orderIds: nextOrderIds,
      ordersSummary: buildTripOrdersSummary(nextOrderIds, sourceOrders),
    };
  });
};
