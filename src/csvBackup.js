export const CSV_BACKUP_VERSION = "1";
export const MAX_CSV_IMPORT_BYTES = 20 * 1024 * 1024;

const MAX_CSV_ROWS = 250000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LEGACY_RECORD_TYPES = new Set([
  "day_summary",
  "weather_sample",
  "session",
  "session_current",
  "break",
  "break_current",
  "jizo",
  "jizo_current",
  "delivery",
  "delivery_stop",
  "daily_incentive",
]);

export class CsvImportError extends Error {
  constructor(message) {
    super(message);
    this.name = "CsvImportError";
  }
}

const isValidDateKey = (value) => {
  if (!DATE_RE.test(value || "")) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
};

const parseCsvRows = (source) => {
  const text = String(source || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  const finishRow = () => {
    row.push(cell);
    cell = "";
    if (row.some(value => value !== "")) rows.push(row);
    row = [];
    if (rows.length > MAX_CSV_ROWS) throw new CsvImportError("CSVの行数が多すぎます");
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"' && cell === "") quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n") finishRow();
    else if (char === "\r") {
      if (text[i + 1] === "\n") i += 1;
      finishRow();
    } else cell += char;
  }

  if (quoted) throw new CsvImportError("CSV内の引用符が閉じられていません");
  if (cell !== "" || row.length > 0) finishRow();
  if (rows.length < 2) throw new CsvImportError("復元できるデータがありません");
  return rows;
};

const rowsToObjects = (rows) => {
  const headers = rows[0].map((value, index) => index === 0 ? value.replace(/^\uFEFF/, "").trim() : value.trim());
  if (!headers.includes("record_type") || !headers.includes("date")) {
    throw new CsvImportError("このアプリから保存したCSVではありません");
  }
  if (headers.some((header, index) => !header || headers.indexOf(header) !== index)) {
    throw new CsvImportError("CSVの見出しが正しくありません");
  }

  return rows.slice(1).map((values, rowIndex) => {
    if (values.length > headers.length && values.slice(headers.length).some(Boolean)) {
      throw new CsvImportError(`${rowIndex + 2}行目の列数が正しくありません`);
    }
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
};

const numberValue = (value, field, { integer = false, fallback = null } = {}) => {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (integer && !Number.isInteger(parsed))) {
    throw new CsvImportError(`${field}に正しくない数値があります`);
  }
  return parsed;
};

const positiveIndex = (value, field) => {
  const parsed = numberValue(value, field, { integer: true });
  if (parsed === null || parsed < 1) throw new CsvImportError(`${field}が正しくありません`);
  return parsed;
};

const timestampValue = (value, field) => {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new CsvImportError(`${field}の日時形式が正しくありません`);
  const [, y, mo, d, h, mi, s] = match.map(Number);
  const date = new Date(y, mo - 1, d, h, mi, s);
  if (
    date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d ||
    date.getHours() !== h || date.getMinutes() !== mi || date.getSeconds() !== s
  ) throw new CsvImportError(`${field}に存在しない日時があります`);
  return date.getTime();
};

const booleanValue = (value) => ["1", "true", "TRUE"].includes(String(value || ""));

const weatherValue = (row) => {
  const weatherId = row.api_weather_id || null;
  const temperature = numberValue(row.temperature, "temperature");
  const windspeed = numberValue(row.windspeed, "windspeed");
  const precipitation = numberValue(row.precipitation, "precipitation");
  if (weatherId === null && temperature === null && windspeed === null && precipitation === null) return null;
  return { weatherId, weathercode: null, temperature, windspeed, precipitation };
};

const emptyLog = (date) => ({
  date,
  weather: null,
  sessions: [],
  breaks: [],
  deliveries: [],
  dailyIncentives: [],
  jizoSessions: [],
  weatherSamples: [],
  currentSessionStart: null,
  currentBreakStart: null,
  currentOrderTime: null,
  currentJizoStart: null,
  currentLastActivityAt: null,
  currentStoreArrivalTime: null,
  currentStoreDepartTime: null,
  currentOrderPos: null,
  currentOrderWeather: null,
  currentStorePos: null,
  currentStoreWeather: null,
  currentOrderType: null,
  currentStops: [],
  currentAddedOrderCount: 0,
});

const assertLogShape = (log, csvDate) => {
  if (!log || typeof log !== "object" || Array.isArray(log)) throw new CsvImportError(`${csvDate}のバックアップ情報が正しくありません`);
  if (!isValidDateKey(log.date) || log.date !== csvDate) throw new CsvImportError(`${csvDate}の日付とバックアップ情報が一致しません`);
  ["sessions", "breaks", "deliveries", "dailyIncentives", "jizoSessions", "weatherSamples", "currentStops"].forEach(field => {
    if (log[field] !== undefined && !Array.isArray(log[field])) throw new CsvImportError(`${csvDate}の${field}が正しくありません`);
  });
  return log;
};

const readExactBackups = (rows) => {
  const backups = new Map();
  rows.filter(row => row.record_type === "backup_log").forEach(row => {
    if (!isValidDateKey(row.date)) throw new CsvImportError("バックアップ情報に正しくない日付があります");
    if (row.backup_version !== CSV_BACKUP_VERSION) throw new CsvImportError("このCSVは現在のアプリでは復元できないバージョンです");
    if (!row.backup_json) throw new CsvImportError(`${row.date}のバックアップ情報が空です`);
    if (backups.has(row.date)) throw new CsvImportError(`${row.date}のバックアップ情報が重複しています`);
    try {
      backups.set(row.date, assertLogShape(JSON.parse(row.backup_json), row.date));
    } catch (error) {
      if (error instanceof CsvImportError) throw error;
      throw new CsvImportError(`${row.date}のバックアップ情報が壊れています`);
    }
  });
  return backups;
};

const legacyState = (date) => ({
  log: emptyLog(date),
  sessions: [],
  breaks: [],
  jizoSessions: [],
  weatherSamples: [],
  dailyIncentives: [],
  deliveries: new Map(),
  stops: [],
});

const stateForDate = (states, date) => {
  if (!states.has(date)) states.set(date, legacyState(date));
  return states.get(date);
};

const indexedValue = (row, value) => ({ index: positiveIndex(row.index, `${row.record_type}のindex`), value });

const deliveryFromRow = (row) => {
  const rawReward = numberValue(row.raw_reward, "raw_reward");
  const deliveryCount = numberValue(row.delivery_count, "delivery_count", { integer: true });
  return {
    company: row.company || null,
    orderType: row.order_type || "single",
    cancelled: booleanValue(row.cancelled),
    cancelType: row.cancel_type || null,
    rating: row.rating || null,
    orderTime: timestampValue(row.order_time, "order_time"),
    storeArrivalTime: timestampValue(row.store_arrival_time, "store_arrival_time"),
    storeDepartTime: timestampValue(row.store_depart_time, "store_depart_time"),
    completeTime: timestampValue(row.complete_time, "complete_time"),
    deliveryCount: deliveryCount && deliveryCount > 0 ? deliveryCount : undefined,
    addedOrderCount: numberValue(row.added_order_count, "added_order_count", { integer: true, fallback: 0 }),
    rawReward: rawReward === null ? undefined : rawReward,
    reward: numberValue(row.reward, "reward", { fallback: 0 }),
    incentive: numberValue(row.incentive, "incentive", { fallback: 0 }),
    rocketBonusRate: numberValue(row.rocket_bonus_rate, "rocket_bonus_rate", { fallback: 0 }),
    startLat: numberValue(row.start_lat, "start_lat"),
    startLng: numberValue(row.start_lng, "start_lng"),
    storeLat: numberValue(row.store_lat, "store_lat"),
    storeLng: numberValue(row.store_lng, "store_lng"),
    endLat: numberValue(row.end_lat, "end_lat"),
    endLng: numberValue(row.end_lng, "end_lng"),
    apiWeather: weatherValue(row),
    storeWeather: null,
    areaName: row.area_name || null,
    memo: row.memo || "",
    stops: [],
  };
};

const addLegacyRow = (states, row) => {
  if (!LEGACY_RECORD_TYPES.has(row.record_type)) return;
  if (!isValidDateKey(row.date)) throw new CsvImportError(`${row.record_type}に正しくない日付があります`);
  const state = stateForDate(states, row.date);
  const { log } = state;

  switch (row.record_type) {
    case "day_summary":
      log.weather = row.manual_weather || null;
      break;
    case "weather_sample":
      state.weatherSamples.push(indexedValue(row, {
        time: timestampValue(row.start_time, "weather_sampleのstart_time"),
        source: row.weather_source || "",
        lat: numberValue(row.start_lat, "weather_sampleのstart_lat"),
        lng: numberValue(row.start_lng, "weather_sampleのstart_lng"),
        ...weatherValue(row),
      }));
      break;
    case "session":
      state.sessions.push(indexedValue(row, { start: timestampValue(row.start_time, "sessionのstart_time"), end: timestampValue(row.end_time, "sessionのend_time") }));
      break;
    case "session_current":
      log.currentSessionStart = timestampValue(row.start_time, "session_currentのstart_time");
      break;
    case "break":
      state.breaks.push(indexedValue(row, { start: timestampValue(row.start_time, "breakのstart_time"), end: timestampValue(row.end_time, "breakのend_time") }));
      break;
    case "break_current":
      log.currentBreakStart = timestampValue(row.start_time, "break_currentのstart_time");
      break;
    case "jizo":
      state.jizoSessions.push(indexedValue(row, { start: timestampValue(row.start_time, "jizoのstart_time"), end: timestampValue(row.end_time, "jizoのend_time") }));
      break;
    case "jizo_current":
      log.currentJizoStart = timestampValue(row.start_time, "jizo_currentのstart_time");
      break;
    case "delivery": {
      const index = positiveIndex(row.index, "deliveryのindex");
      if (state.deliveries.has(index)) throw new CsvImportError(`${row.date}の配達番号${index}が重複しています`);
      if (!log.weather && row.manual_weather) log.weather = row.manual_weather;
      state.deliveries.set(index, deliveryFromRow(row));
      break;
    }
    case "delivery_stop":
      state.stops.push({
        deliveryIndex: positiveIndex(row.index, "delivery_stopのindex"),
        stopIndex: positiveIndex(row.stop_index, "delivery_stopのstop_index"),
        row,
      });
      break;
    case "daily_incentive":
      state.dailyIncentives.push(indexedValue(row, {
        company: row.company || null,
        amount: numberValue(row.incentive, "daily_incentiveのincentive", { fallback: 0 }),
        time: timestampValue(row.start_time, "daily_incentiveのstart_time"),
      }));
      break;
    default:
      break;
  }
};

const sortedValues = (items) => items.sort((a, b) => a.index - b.index).map(item => item.value);

const finalizeLegacyState = (state) => {
  const { log } = state;
  log.sessions = sortedValues(state.sessions);
  log.breaks = sortedValues(state.breaks);
  log.jizoSessions = sortedValues(state.jizoSessions);
  log.weatherSamples = sortedValues(state.weatherSamples);
  log.dailyIncentives = sortedValues(state.dailyIncentives);

  state.stops.sort((a, b) => a.deliveryIndex - b.deliveryIndex || a.stopIndex - b.stopIndex).forEach(item => {
    const delivery = state.deliveries.get(item.deliveryIndex);
    if (!delivery) throw new CsvImportError(`${log.date}の立寄り先に対応する配達データがありません`);
    const kind = item.row.stop_type;
    if (kind !== "pickup" && kind !== "dropoff") throw new CsvImportError(`${log.date}の立寄り先種別が正しくありません`);
    const sameKindIndex = delivery.stops.filter(stop => stop.kind === kind).length + 1;
    const weather = weatherValue(item.row);
    delivery.stops.push({
      id: `${kind}-${sameKindIndex}`,
      kind,
      index: sameKindIndex,
      label: item.row.stop_label || (kind === "pickup" ? `受取${sameKindIndex}` : `お届け${sameKindIndex}`),
      arrivalTime: kind === "pickup" ? timestampValue(item.row.start_time, "delivery_stopのstart_time") : null,
      departTime: kind === "pickup" ? timestampValue(item.row.end_time, "delivery_stopのend_time") : null,
      completeTime: kind === "dropoff" ? timestampValue(item.row.end_time, "delivery_stopのend_time") : null,
      lat: numberValue(kind === "pickup" ? item.row.store_lat : item.row.end_lat, "delivery_stopのlat"),
      lng: numberValue(kind === "pickup" ? item.row.store_lng : item.row.end_lng, "delivery_stopのlng"),
      weather,
    });
    if (kind === "pickup" && weather && !delivery.storeWeather) delivery.storeWeather = weather;
  });

  log.deliveries = [...state.deliveries.entries()].sort(([a], [b]) => a - b).map(([, delivery]) => delivery);
  log.currentLastActivityAt = Math.max(log.currentSessionStart || 0, log.currentBreakStart || 0, log.currentJizoStart || 0) || null;
  return log;
};

export const parseDeliveryCsv = (text) => {
  const objects = rowsToObjects(parseCsvRows(text));
  const backups = readExactBackups(objects);
  const legacyStates = new Map();

  objects.forEach(row => {
    if (backups.has(row.date)) return;
    addLegacyRow(legacyStates, row);
  });

  const legacyLogs = [...legacyStates.values()].map(finalizeLegacyState);
  const logs = [...backups.values(), ...legacyLogs].sort((a, b) => a.date.localeCompare(b.date));
  if (logs.length === 0) throw new CsvImportError("復元できる配達データがありません");

  return {
    logs,
    exactDates: [...backups.keys()].sort(),
    legacyDates: legacyLogs.map(log => log.date).sort(),
    format: legacyLogs.length === 0 ? "exact" : backups.size === 0 ? "legacy" : "mixed",
  };
};
