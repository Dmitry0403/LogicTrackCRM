export const parseCloudUpdatedAt = (value) => {
  const ts = Date.parse(String(value || ""));
  return Number.isFinite(ts) ? ts : 0;
};

export const normalizePrintSignerSettings = (rawValue, defaultPrintSignerSettings) => {
  if (!rawValue || typeof rawValue !== "object") {
    return defaultPrintSignerSettings;
  }

  return {
    signerRole: String(rawValue.signerRole || defaultPrintSignerSettings.signerRole).trim(),
    signerName: String(rawValue.signerName || defaultPrintSignerSettings.signerName).trim(),
  };
};

export const normalizeCloudSnapshot = (
  data,
  {
    normalizeOrderStages,
    normalizeTripStages,
    defaultOrderStages,
    defaultTripStages,
    defaultPrintSignerSettings,
  },
) => ({
  orders: Array.isArray(data?.orders) ? data.orders : [],
  trips: Array.isArray(data?.trips) ? data.trips : [],
  orderStages:
    Array.isArray(data?.order_stages) && data.order_stages.length > 0
      ? normalizeOrderStages(data.order_stages)
      : defaultOrderStages,
  tripStages:
    Array.isArray(data?.trip_stages) && data.trip_stages.length > 0
      ? normalizeTripStages(data.trip_stages)
      : defaultTripStages,
  printSignerSettings: normalizePrintSignerSettings(data?.print_signer, defaultPrintSignerSettings),
});

export const shouldApplyRemoteSnapshot = ({
  remoteUpdatedAt,
  lastCloudUpdatedAt,
  toleranceMs = 500,
}) => {
  return Boolean(
    remoteUpdatedAt > 0 &&
      lastCloudUpdatedAt > 0 &&
      remoteUpdatedAt > lastCloudUpdatedAt + toleranceMs,
  );
};

export const buildCloudPayload = ({ currentUserId, snapshot }) => ({
  owner_user_id: currentUserId,
  orders: snapshot.orders,
  trips: snapshot.trips,
  order_stages: snapshot.orderStages,
  trip_stages: snapshot.tripStages,
  print_signer: snapshot.printSignerSettings,
});

export const reassignItemsToValidStage = (items, stages, fallbackStageId) => {
  if (!fallbackStageId) return items;
  const validStageIds = new Set(stages.map((stage) => stage.id));

  return items.map((item) => ({
    ...item,
    stageId: validStageIds.has(item.stageId) ? item.stageId : fallbackStageId,
  }));
};
