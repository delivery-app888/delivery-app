import assert from "node:assert/strict";
import { syncEditedDeliveryTimeToStops } from "../src/deliveryEdit.js";

const ts = (h, m) => new Date(2026, 5, 17, h, m, 0, 0).getTime();

const normalizedCompleteTime = (delivery) => {
  const dropoffs = Array.isArray(delivery.stops) ? delivery.stops.filter(s => s.kind === "dropoff") : [];
  const completedDropoffs = dropoffs.filter(s => s.completeTime);
  const lastDropoff = completedDropoffs[completedDropoffs.length - 1] || dropoffs[dropoffs.length - 1] || null;
  return lastDropoff?.completeTime || delivery.completeTime || null;
};

{
  const edited = syncEditedDeliveryTimeToStops({
    orderTime: ts(21, 0),
    completeTime: ts(21, 30),
    stops: [
      { id: "pickup-1", kind: "pickup", arrivalTime: ts(21, 5), departTime: ts(21, 8) },
      { id: "dropoff-1", kind: "dropoff", completeTime: ts(21, 18) },
    ],
  }, "completeTime");

  assert.equal(edited.stops[1].completeTime, ts(21, 30));
  assert.equal(normalizedCompleteTime(edited), ts(21, 30));
}

{
  const edited = syncEditedDeliveryTimeToStops({
    completeTime: ts(21, 45),
    stops: [
      { id: "pickup-1", kind: "pickup", arrivalTime: ts(21, 5), departTime: ts(21, 8) },
      { id: "dropoff-1", kind: "dropoff", completeTime: ts(21, 20) },
      { id: "dropoff-2", kind: "dropoff", completeTime: ts(21, 35) },
    ],
  }, "completeTime");

  assert.equal(edited.stops[1].completeTime, ts(21, 20));
  assert.equal(edited.stops[2].completeTime, ts(21, 45));
}

{
  const edited = syncEditedDeliveryTimeToStops({
    storeArrivalTime: ts(20, 10),
    storeDepartTime: ts(20, 17),
    stops: [
      { id: "pickup-1", kind: "pickup", arrivalTime: ts(20, 8), departTime: ts(20, 12) },
      { id: "dropoff-1", kind: "dropoff", completeTime: ts(20, 30) },
    ],
  }, "storeDepartTime");

  assert.equal(edited.stops[0].arrivalTime, ts(20, 10));
  assert.equal(edited.stops[0].departTime, ts(20, 17));
  assert.equal(edited.stops[1].completeTime, ts(20, 30));
}

console.log("complete-time sync regression passed");
