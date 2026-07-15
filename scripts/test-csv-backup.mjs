import assert from "node:assert/strict";
import { CSV_BACKUP_VERSION, CsvImportError, parseDeliveryCsv } from "../src/csvBackup.js";

const csvCell = (value) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const makeCsv = (headers, rows) => [
  headers.join(","),
  ...rows.map(row => headers.map(header => csvCell(row[header])).join(",")),
].join("\n");

const exactLog = {
  date: "2026-07-14",
  weather: "rain",
  sessions: [{ start: 1783990800123, end: 1783998000456 }],
  breaks: [],
  deliveries: [{
    company: "uber",
    orderType: "single",
    orderTime: 1783992000123,
    completeTime: 1783993800456,
    reward: 680,
    incentive: 120,
    memo: "玄関前, 左側\n\"置き配\"",
    startLat: 34.3853,
    startLng: 132.4553,
    stops: [],
  }],
  dailyIncentives: [],
  jizoSessions: [],
  weatherSamples: [],
  currentSessionStart: 1783999000000,
  currentBreakStart: null,
  currentOrderTime: 1783999500000,
  currentJizoStart: null,
  currentLastActivityAt: 1783999500000,
  currentStoreArrivalTime: null,
  currentStoreDepartTime: null,
  currentOrderPos: { lat: 34.38, lng: 132.45 },
  currentOrderWeather: null,
  currentStorePos: null,
  currentStoreWeather: null,
  currentOrderType: "single",
  currentStops: [],
  currentAddedOrderCount: 0,
};

const exactCsv = makeCsv(
  ["record_type", "date", "backup_version", "backup_json"],
  [{ record_type: "backup_log", date: exactLog.date, backup_version: CSV_BACKUP_VERSION, backup_json: JSON.stringify(exactLog) }],
);
const exactResult = parseDeliveryCsv(`\uFEFF${exactCsv}`);
assert.equal(exactResult.format, "exact");
assert.deepEqual(exactResult.logs, [exactLog]);

const legacyHeaders = [
  "record_type", "date", "index", "stop_index", "stop_type", "stop_label", "company", "order_type", "cancelled", "rating", "manual_weather",
  "start_time", "end_time", "order_time", "store_arrival_time", "store_depart_time", "complete_time", "delivery_count", "added_order_count",
  "raw_reward", "reward", "incentive", "rocket_bonus_rate", "start_lat", "start_lng", "store_lat", "store_lng", "end_lat", "end_lng",
  "weather_source", "api_weather_id", "temperature", "windspeed", "precipitation", "area_name", "memo",
];
const legacyCsv = makeCsv(legacyHeaders, [
  { record_type: "day_summary", date: "2026-07-01", manual_weather: "sunny" },
  { record_type: "session", date: "2026-07-01", index: 1, start_time: "2026-07-01 10:00:00", end_time: "2026-07-01 12:00:00" },
  {
    record_type: "delivery", date: "2026-07-01", index: 1, company: "uber", order_type: "single", cancelled: 0, rating: "good",
    order_time: "2026-07-01 10:15:00", store_arrival_time: "2026-07-01 10:25:00", store_depart_time: "2026-07-01 10:30:00", complete_time: "2026-07-01 10:45:00",
    delivery_count: 1, reward: 700, incentive: 100, start_lat: 34.1, start_lng: 132.1, end_lat: 34.2, end_lng: 132.2,
    api_weather_id: "sunny", temperature: 27.5, windspeed: 2.1, precipitation: 0, area_name: "中区", memo: "カンマ,改行\n引用符\"あり\"",
  },
  { record_type: "delivery_stop", date: "2026-07-01", index: 1, stop_index: 1, stop_type: "pickup", stop_label: "店舗", start_time: "2026-07-01 10:25:00", end_time: "2026-07-01 10:30:00", store_lat: 34.15, store_lng: 132.15 },
  { record_type: "delivery_stop", date: "2026-07-01", index: 1, stop_index: 2, stop_type: "dropoff", stop_label: "配達", end_time: "2026-07-01 10:45:00", end_lat: 34.2, end_lng: 132.2 },
  { record_type: "daily_incentive", date: "2026-07-01", index: 1, company: "uber", start_time: "2026-07-01 12:00:00", incentive: 500 },
]);
const legacyResult = parseDeliveryCsv(legacyCsv);
assert.equal(legacyResult.format, "legacy");
assert.equal(legacyResult.logs.length, 1);
assert.equal(legacyResult.logs[0].deliveries.length, 1);
assert.equal(legacyResult.logs[0].deliveries[0].memo, "カンマ,改行\n引用符\"あり\"");
assert.equal(legacyResult.logs[0].deliveries[0].stops.length, 2);
assert.equal(legacyResult.logs[0].dailyIncentives[0].amount, 500);
assert.equal(legacyResult.logs[0].sessions[0].start, new Date(2026, 6, 1, 10, 0, 0).getTime());

assert.throws(
  () => parseDeliveryCsv("record_type,date\ndelivery,2026-02-30"),
  error => error instanceof CsvImportError && error.message.includes("日付"),
);
assert.throws(
  () => parseDeliveryCsv("foo,bar\na,b"),
  error => error instanceof CsvImportError && error.message.includes("このアプリ"),
);
assert.throws(
  () => parseDeliveryCsv('record_type,date\ndelivery,"2026-07-01'),
  error => error instanceof CsvImportError && error.message.includes("引用符"),
);

console.log("CSVバックアップのテスト: OK");
