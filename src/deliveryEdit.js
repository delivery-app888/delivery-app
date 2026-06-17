export const syncEditedDeliveryTimeToStops = (delivery, field) => {
  const next = { ...delivery };
  if (!Array.isArray(next.stops)) return next;

  if (["storeArrivalTime", "storeDepartTime"].includes(field)) {
    let synced = false;
    return {
      ...next,
      stops: next.stops.map(s => {
        if (synced || s.kind !== "pickup") return s;
        synced = true;
        return { ...s, arrivalTime: next.storeArrivalTime || null, departTime: next.storeDepartTime || null };
      }),
    };
  }

  if (field === "completeTime") {
    let targetIndex = -1;
    for (let i = next.stops.length - 1; i >= 0; i--) {
      const stop = next.stops[i];
      if (stop.kind !== "dropoff") continue;
      if (targetIndex === -1) targetIndex = i;
      if (stop.completeTime) {
        targetIndex = i;
        break;
      }
    }
    if (targetIndex === -1) return next;
    return {
      ...next,
      stops: next.stops.map((s, i) => i === targetIndex ? { ...s, completeTime: next.completeTime || null } : s),
    };
  }

  return next;
};
