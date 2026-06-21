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

export const removeEditedDeliveryStop = (stops, stopId) => {
  const list = (Array.isArray(stops) ? stops : []).map(s => ({ ...s }));
  const target = list.find(s => s.id === stopId);
  if (!target || !["pickup", "dropoff"].includes(target.kind)) {
    return { changed: false, stops: list, deliveryCount: null };
  }

  const sameKindCount = list.filter(s => s.kind === target.kind).length;
  if (sameKindCount <= 1) {
    return { changed: false, stops: list, deliveryCount: sameKindCount || null };
  }

  const remaining = list.filter(s => s.id !== stopId);
  const deliveryCount = Math.max(1, remaining.filter(s => s.kind === target.kind).length);
  const pickups = remaining.filter(s => s.kind === "pickup").slice(0, deliveryCount);
  const dropoffs = remaining.filter(s => s.kind === "dropoff").slice(0, deliveryCount);

  return {
    changed: true,
    stops: [...pickups, ...dropoffs],
    deliveryCount,
  };
};
