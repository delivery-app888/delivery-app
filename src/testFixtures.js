import { tds } from "./utils";

const pad2 = (n) => String(n).padStart(2, "0");
const dateFromOffset = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const tsAt = (date, h, m = 0) => new Date(`${date}T${pad2(h)}:${pad2(m)}:00`).getTime();

const makeDelivery = ({
  date,
  h,
  m = 0,
  duration = 15,
  reward = 700,
  company = "rocket",
  orderType = "single",
  rating = "normal",
  areaName = "中区",
  wait = 0,
  cancelled = false,
  cancelType = null,
  idx = 0,
  lat = 34.39,
  lng = 132.46,
}) => {
  const orderTime = tsAt(date, h, m);
  const completeTime = orderTime + Math.round(duration * 60000);
  const storeArrivalTime = orderTime + Math.min(5, Math.max(1, Math.round(duration / 4))) * 60000;
  const storeDepartTime = wait == null ? null : storeArrivalTime + Math.round(wait * 60000);
  const count = orderType === "triple" ? 3 : orderType === "double" ? 2 : 1;
  const weather = { temperature: 20 + (h % 8), windspeed: 2 + (idx % 8), weathercode: 0, weatherId: "sunny", precipitation: 0 };
  const pickups = Array.from({ length: count }, (_, i) => ({
    id: `pickup-${i + 1}`,
    kind: "pickup",
    index: i + 1,
    label: count === 1 ? "店舗" : `受取${i + 1}`,
    arrivalTime: i === 0 ? storeArrivalTime : storeArrivalTime + i * 3 * 60000,
    departTime: i === 0 ? storeDepartTime : storeArrivalTime + (i * 3 + 1) * 60000,
    lat: lat + i * 0.002,
    lng: lng + i * 0.002,
    weather,
  }));
  const dropoffs = Array.from({ length: count }, (_, i) => ({
    id: `dropoff-${i + 1}`,
    kind: "dropoff",
    index: i + 1,
    label: count === 1 ? "配達" : `お届け${i + 1}`,
    completeTime: completeTime - (count - i - 1) * 4 * 60000,
    lat: lat + 0.01 + i * 0.004,
    lng: lng + 0.01 + i * 0.004,
  }));

  return {
    orderTime,
    storeArrivalTime,
    storeDepartTime,
    completeTime,
    company,
    reward: cancelled ? 0 : reward,
    incentive: 0,
    orderType,
    cancelled,
    cancelType,
    rating: cancelled ? null : rating,
    startLat: lat,
    startLng: lng,
    storeLat: lat + 0.004,
    storeLng: lng + 0.004,
    endLat: lat + 0.012,
    endLng: lng + 0.012,
    apiWeather: weather,
    storeWeather: weather,
    areaName,
    memo: "",
    stops: [...pickups, ...dropoffs],
  };
};

const makeLog = (date, deliveries = [], extra = {}) => {
  const fallbackStart = tsAt(date, 10, 0);
  const start = deliveries.length ? Math.min(...deliveries.map(d => d.orderTime || fallbackStart)) - 15 * 60000 : fallbackStart;
  const end = deliveries.length ? Math.max(...deliveries.map(d => d.completeTime || d.orderTime || fallbackStart)) + 20 * 60000 : tsAt(date, 11, 0);
  return {
    date,
    weather: extra.weather ?? "sunny",
    sessions: extra.sessions ?? [{ start, end }],
    breaks: extra.breaks ?? [],
    deliveries,
    dailyIncentives: extra.dailyIncentives ?? [],
    jizoSessions: extra.jizoSessions ?? [],
    weatherSamples: extra.weatherSamples ?? [],
    currentSessionStart: extra.currentSessionStart ?? null,
    currentBreakStart: extra.currentBreakStart ?? null,
    currentOrderTime: extra.currentOrderTime ?? null,
    currentJizoStart: extra.currentJizoStart ?? null,
    currentLastActivityAt: extra.currentLastActivityAt ?? null,
    currentStoreArrivalTime: null,
    currentStoreDepartTime: null,
    currentOrderPos: null,
    currentOrderWeather: null,
    currentStorePos: null,
    currentStoreWeather: null,
    currentOrderType: null,
    currentStops: [],
    currentAddedOrderCount: 0,
  };
};

const buildDiverseLogs = (days = 14, perDay = 22) => {
  const logs = [];
  const companies = ["rocket", "uber", "demaecan", "pickgo", "menu"];
  const areas = ["中区", "西区", "南区", "安佐南区", "佐伯区", "東区"];
  const slots = [11, 12, 18, 19, 20, 1, 2, 14, 16, 22];
  for (let off = days - 1; off >= 0; off -= 1) {
    const date = dateFromOffset(off);
    const deliveries = Array.from({ length: perDay }, (_, i) => {
      const h = slots[(i + off) % slots.length];
      const orderType = i % 9 === 0 ? "triple" : i % 4 === 0 ? "double" : "single";
      const duration = i % 7 === 0 ? 52 + (i % 3) * 10 : 8 + ((i * 3 + off) % 24);
      const peakRate = h >= 18 && h <= 21 ? 42 : h >= 1 && h <= 4 ? 48 : h >= 11 && h <= 13 ? 38 : 31;
      const reward = Math.round(360 + duration * peakRate + (orderType === "double" ? 250 : orderType === "triple" ? 520 : 0));
      return makeDelivery({
        date,
        h,
        m: (i * 7) % 55,
        duration,
        reward,
        company: companies[(i + off) % companies.length],
        orderType,
        rating: reward / duration >= 55 ? "good" : reward / duration >= 35 ? "normal" : "bad",
        areaName: areas[(i + off) % areas.length],
        wait: i % 6 === 0 ? 12 : i % 5 === 0 ? 6 : i % 4,
        idx: i,
        lat: 34.37 + (i % 7) * 0.006,
        lng: 132.40 + (i % 9) * 0.007,
      });
    });
    logs.push(makeLog(date, deliveries, {
      dailyIncentives: off % 3 === 0 ? [{ company: "uber", amount: 1200, time: deliveries[deliveries.length - 1].completeTime + 60000 }] : [],
    }));
  }
  return logs;
};

const buildEdgeLogs = () => {
  const today = tds();
  const yesterday = dateFromOffset(1);
  const shortDelivery = makeDelivery({ date: today, h: 18, duration: 0.5, reward: 900, company: "rocket", wait: 0, idx: 1 });
  const cancelledWait = makeDelivery({ date: today, h: 19, duration: 18, reward: 0, company: "uber", cancelled: true, cancelType: "store_wait", wait: null, idx: 2 });
  const unknownCompany = makeDelivery({ date: today, h: 20, duration: 14, reward: 320, company: "unknown_co", wait: 16, idx: 3 });
  const missingTimes = { company: "rocket", reward: 700, orderType: "single", cancelled: false, rating: "normal", areaName: "欠損エリア" };
  const reversedTime = makeDelivery({ date: today, h: 21, duration: 18, reward: 800, company: "pickgo", wait: 3, idx: 5 });
  reversedTime.completeTime = reversedTime.orderTime - 60000;
  const oldLog = {
    date: yesterday,
    weather: "rain",
    onlineStart: tsAt(yesterday, 10),
    onlineEnd: tsAt(yesterday, 13),
    deliveries: [makeDelivery({ date: yesterday, h: 11, duration: 16, reward: 680, company: "rocket", wait: 5, idx: 6 })],
  };
  return [oldLog, makeLog(today, [shortDelivery, cancelledWait, unknownCompany, missingTimes, reversedTime], { weather: "cloudy", sessions: [{ start: tsAt(today, 17), end: tsAt(today, 22) }] })];
};

export const generateTestFixture = (kind) => {
  const today = tds();
  if (kind === "empty") return { logs: [], todayLog: makeLog(today, []) };
  if (kind === "edge") {
    const logs = buildEdgeLogs();
    return { logs: logs.filter(l => l.date !== today), todayLog: logs.find(l => l.date === today) || makeLog(today, []) };
  }
  if (kind === "large") {
    const logs = buildDiverseLogs(130, 14);
    return { logs: logs.filter(l => l.date !== today), todayLog: logs.find(l => l.date === today) || makeLog(today, []) };
  }
  const logs = buildDiverseLogs(14, 22);
  return { logs: logs.filter(l => l.date !== today), todayLog: logs.find(l => l.date === today) || makeLog(today, []) };
};
