import { storage } from "./db";
import { OT } from "./constants";

// ─── Date/key helpers ───
export const tds = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
export const toLD = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
export const ms = () => tds().slice(0, 7);
const tk = () => `log:${tds()}`;
const ik = () => "all-logs-index";
const gk = () => "monthly-goal";
const sk = () => "app-settings";

// ─── Storage operations ───
export const sv = async (d) => { try { const k = d?.date ? `log:${d.date}` : tk(); await storage.set(k, JSON.stringify(d)); try { const r = await storage.get(ik()); const ks = r ? JSON.parse(r.value) : []; if (!ks.includes(k)) { ks.push(k); await storage.set(ik(), JSON.stringify(ks)); } } catch { await storage.set(ik(), JSON.stringify([k])); } } catch {} };
export const svByDate = async (date, d) => { try { const k = `log:${date}`; await storage.set(k, JSON.stringify(d)); } catch {} };
export const lt = async () => { try { const r = await storage.get(tk()); return r ? JSON.parse(r.value) : null; } catch { return null; } };
export const la = async () => { try { const r = await storage.get(ik()); const ks = r ? JSON.parse(r.value) : []; const o = []; for (const k of ks) { try { const d = await storage.get(k); if (d) o.push(JSON.parse(d.value)); } catch {} } return o; } catch { return []; } };
export const lg = async () => { try { const r = await storage.get(gk()); return r ? JSON.parse(r.value) : null; } catch { return null; } };
export const sg = async (g) => { try { await storage.set(gk(), JSON.stringify(g)); } catch {} };
export const ls = async () => { try { const r = await storage.get(sk()); return r ? JSON.parse(r.value) : null; } catch { return null; } };
export const ss = async (s) => { try { await storage.set(sk(), JSON.stringify(s)); } catch {} };

// ─── GPS helper ───
export const getPos = () => new Promise((resolve) => {
  if (!navigator.geolocation) { resolve(null); return; }
  navigator.geolocation.getCurrentPosition(
    (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
    () => resolve(null),
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
  );
});

// Keep exact GPS local; round coordinates before external API calls.
const publicCoord = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Number(n.toFixed(3)) : value;
};

// ─── Open-Meteo weather API ───
export const wmoToWeather = (code) => {
  if (code <= 1) return "sunny";
  if (code <= 3) return "cloudy";
  if (code <= 49) return "cloudy";
  if (code <= 55) return "rain";
  if (code <= 65) return "rain";
  if (code <= 67) return "rain";
  if (code <= 77) return "snow";
  if (code <= 82) return "heavy_rain";
  if (code <= 86) return "snow";
  if (code >= 95) return "heavy_rain";
  return "cloudy";
};
export const fetchWeather = async (lat, lng) => {
  try {
    const safeLat = publicCoord(lat);
    const safeLng = publicCoord(lng);
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${safeLat}&longitude=${safeLng}&current_weather=true&current=precipitation`,
      { cache: "no-store", referrerPolicy: "no-referrer" }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const cw = json.current_weather;
    if (!cw) return null;
    const precipitation = json.current?.precipitation ?? null;
    return { temperature: cw.temperature, windspeed: cw.windspeed, weathercode: cw.weathercode, weatherId: wmoToWeather(cw.weathercode), precipitation };
  } catch { return null; }
};

// ─── Format helpers ───
export const ft = (ts) => { if (!ts) return "--:--"; const d = new Date(ts); return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; };
export const fd = (m) => { if (!m || m <= 0) return "0分"; const h = Math.floor(m / 3600000); const mn = Math.floor((m % 3600000) / 60000); return h > 0 ? `${h}h${mn}m` : `${mn}分`; };
export const fm = (m) => { if (!m || m <= 0) return "0分"; return `${Math.round(m / 60000)}分`; };
export const dc = (d) => {
  const savedCount = Number(d?.deliveryCount);
  if (Number.isFinite(savedCount) && savedCount > 0) return Math.floor(savedCount);
  const stops = Array.isArray(d?.stops) ? d.stops : [];
  const pickupCount = stops.filter(s => s.kind === "pickup").length;
  const dropoffCount = stops.filter(s => s.kind === "dropoff").length;
  const stopCount = Math.max(pickupCount, dropoffCount);
  return stopCount > 0 ? stopCount : (OT.find(o => o.id === d?.orderType)?.c || 1);
};

// ─── Data helpers ───
export const newDay = () => ({
  date: tds(), weather: null, sessions: [], breaks: [], deliveries: [], dailyIncentives: [], jizoSessions: [], weatherSamples: [],
  currentSessionStart: null, currentBreakStart: null, currentOrderTime: null, currentJizoStart: null, currentLastActivityAt: null,
  currentStoreArrivalTime: null, currentStoreDepartTime: null, currentOrderPos: null, currentOrderWeather: null, currentStorePos: null, currentStoreWeather: null,
  currentOrderType: null, currentStops: [], currentAddedOrderCount: 0,
});
export const defaultSettings = () => ({ theme: "dark", incInGoal: true, incInReward: false, largeFont: false, workDays: [1, 2, 3, 4, 5], pickgoFeeRate: 15, rocketBonusRate: 0, autoOfflineHours: 0 });

export const ROCKET_BONUS_OPTIONS = [
  { rate: 0, label: "追加報酬なし", sub: "0%" },
  { rate: 10, label: "グリーン", sub: "10%" },
  { rate: 15, label: "ブルー", sub: "15%" },
  { rate: 20, label: "パープル", sub: "20%" },
  { rate: 25, label: "ゴールド", sub: "25%" },
  { rate: 30, label: "ゴールドプラス", sub: "30%" },
];

export const calcRocketBaseReward = (totalReward, rate) => {
  const total = Number(totalReward) || 0;
  const bonusRate = Number(rate) || 0;
  if (total <= 0 || bonusRate <= 0) return Math.max(0, total);
  return Math.max(0, Math.round(total / (1 + bonusRate / 100)));
};
export const calcRocketBonus = (totalReward, rate) => {
  const total = Number(totalReward) || 0;
  return Math.max(0, total - calcRocketBaseReward(total, rate));
};

export const rocketEnteredTotal = (delivery) => {
  const rawReward = Number(delivery?.rawReward);
  if (Number.isFinite(rawReward) && rawReward > 0) return rawReward;
  return Number(delivery?.reward) || 0;
};

export const rocketManualIncentive = (delivery) => {
  const incentive = Number(delivery?.incentive) || 0;
  const rate = Number(delivery?.rocketBonusRate) || 0;
  const enteredTotal = Number(delivery?.rawReward) || 0;
  if (delivery?.company !== "rocket" || rate <= 0 || enteredTotal <= 0) return incentive;

  const bonus = calcRocketBonus(enteredTotal, rate);
  const oldTotalPercentBonus = Math.round(enteredTotal * (rate / 100));
  const reward = Number(delivery?.reward) || 0;
  const baseReward = calcRocketBaseReward(enteredTotal, rate);
  if (oldTotalPercentBonus > 0 && reward === enteredTotal + oldTotalPercentBonus) return incentive;
  if (oldTotalPercentBonus > 0 && reward === enteredTotal) return Math.max(0, incentive - oldTotalPercentBonus);
  if (bonus > 0 && (reward === enteredTotal || reward === baseReward)) return Math.max(0, incentive - bonus);
  if (reward < enteredTotal) return Math.max(0, incentive - (enteredTotal - reward));
  return Math.max(0, incentive - bonus);
};

export const applyRocketBonusRate = (delivery, rate) => {
  const nextRate = Math.max(0, Number(rate) || 0);
  const enteredTotal = rocketEnteredTotal(delivery);
  const manualIncentive = rocketManualIncentive(delivery);
  const bonus = calcRocketBonus(enteredTotal, nextRate);
  return {
    ...delivery,
    reward: nextRate > 0 ? calcRocketBaseReward(enteredTotal, nextRate) : enteredTotal,
    rawReward: nextRate > 0 && enteredTotal > 0 ? enteredTotal : undefined,
    rocketBonusRate: nextRate,
    incentive: manualIncentive + bonus,
  };
};

export const migrate = (d) => {
  if (!d.deliveries) d.deliveries = [];
  if (!d.breaks) d.breaks = [];
  if (!d.dailyIncentives) d.dailyIncentives = [];
  if (!d.jizoSessions) d.jizoSessions = [];
  if (!Array.isArray(d.weatherSamples)) d.weatherSamples = [];
  if (d.onlineStart !== undefined) { d.sessions = d.sessions || []; if (d.onlineStart && d.onlineEnd) d.sessions.push({ start: d.onlineStart, end: d.onlineEnd }); else if (d.onlineStart) d.currentSessionStart = d.onlineStart; delete d.onlineStart; delete d.onlineEnd; }
  if (!d.sessions) d.sessions = []; if (d.currentSessionStart === undefined) d.currentSessionStart = null; if (d.currentJizoStart === undefined) d.currentJizoStart = null; if (d.currentLastActivityAt === undefined) d.currentLastActivityAt = d.currentSessionStart || null;
  if (d.currentStoreArrivalTime === undefined) d.currentStoreArrivalTime = null;
  if (d.currentStoreDepartTime === undefined) d.currentStoreDepartTime = null;
  if (d.currentOrderPos === undefined) d.currentOrderPos = null;
  if (d.currentOrderWeather === undefined) d.currentOrderWeather = null;
  if (d.currentStorePos === undefined) d.currentStorePos = null;
  if (d.currentStoreWeather === undefined) d.currentStoreWeather = null;
  if (d.currentOrderType === undefined) d.currentOrderType = null;
  if (!Array.isArray(d.currentStops)) d.currentStops = [];
  if (d.currentAddedOrderCount === undefined) d.currentAddedOrderCount = 0;
  d.deliveries.forEach(dl => {
    if (!dl.orderType) dl.orderType = "single"; if (dl.cancelled === undefined) dl.cancelled = false; if (dl.cancelType === undefined) dl.cancelType = null; if (dl.rating === undefined) dl.rating = null;
    if (dl.startLat === undefined) { dl.startLat = null; dl.startLng = null; dl.endLat = null; dl.endLng = null; }
    if (dl.storeArrivalTime === undefined) dl.storeArrivalTime = null; if (dl.storeDepartTime === undefined) dl.storeDepartTime = null;
    if (dl.storeLat === undefined) { dl.storeLat = null; dl.storeLng = null; }
    if (!Array.isArray(dl.stops)) dl.stops = [];
    if (dl.stops.length > 0) {
      const pickups = dl.stops.filter(s => s.kind === "pickup");
      const dropoffs = dl.stops.filter(s => s.kind === "dropoff");
      const count = Math.max(1, Math.max(pickups.length, dropoffs.length));
      let pi = 0, di = 0;
      dl.stops = dl.stops.map(s => {
        if (s.kind === "pickup") {
          pi += 1;
          return { ...s, index: pi, label: count === 1 ? "店舗" : `受取${pi}` };
        }
        if (s.kind === "dropoff") {
          di += 1;
          return { ...s, index: di, label: count === 1 ? "配達" : `お届け${di}` };
        }
        return s;
      });
    }
    if (dl.addedOrderCount === undefined) dl.addedOrderCount = 0;
    const savedDeliveryCount = Number(dl.deliveryCount);
    const inferredDeliveryCount = dc({ ...dl, deliveryCount: undefined });
    dl.deliveryCount = Number.isFinite(savedDeliveryCount) && savedDeliveryCount > inferredDeliveryCount
      ? Math.floor(savedDeliveryCount)
      : inferredDeliveryCount;
    if (dl.rocketBonusRate === undefined) dl.rocketBonusRate = 0;
    if (dl.apiWeather === undefined) dl.apiWeather = null; if (dl.storeWeather === undefined) dl.storeWeather = null; if (dl.areaName === undefined) dl.areaName = null; if (dl.memo === undefined) dl.memo = "";
  });
  if (d.currentOrderTime && d.currentStops.length === 0) {
    const type = d.currentOrderType || "single";
    const count = type === "triple" ? 3 : type === "double" ? 2 : 1;
    d.currentStops = [
      ...Array.from({ length: count }, (_, i) => ({ id: `pickup-${i + 1}`, kind: "pickup", index: i + 1, label: count === 1 ? "店舗" : `受取${i + 1}`, arrivalTime: i === 0 ? d.currentStoreArrivalTime : null, departTime: i === 0 ? d.currentStoreDepartTime : null, lat: i === 0 ? d.currentStorePos?.lat ?? null : null, lng: i === 0 ? d.currentStorePos?.lng ?? null : null, weather: i === 0 ? d.currentStoreWeather || null : null })),
      ...Array.from({ length: count }, (_, i) => ({ id: `dropoff-${i + 1}`, kind: "dropoff", index: i + 1, label: count === 1 ? "配達" : `お届け${i + 1}`, completeTime: null, lat: null, lng: null })),
    ];
  }
  if (d.currentStops.length > 0) {
    const pickups = d.currentStops.filter(s => s.kind === "pickup");
    const dropoffs = d.currentStops.filter(s => s.kind === "dropoff");
    const count = Math.max(1, Math.max(pickups.length, dropoffs.length));
    let pi = 0, di = 0;
    d.currentStops = d.currentStops.map(s => {
      if (s.kind === "pickup") {
        pi += 1;
        return { ...s, index: pi, label: count === 1 ? "店舗" : `受取${pi}` };
      }
      if (s.kind === "dropoff") {
        di += 1;
        return { ...s, index: di, label: count === 1 ? "配達" : `お届け${di}` };
      }
      return s;
    });
  }
  if (d.weatherSamples.length === 0) {
    d.deliveries.forEach(dl => {
      if (dl.apiWeather) d.weatherSamples.push({ time: dl.orderTime || dl.completeTime || null, source: "order", lat: dl.startLat ?? null, lng: dl.startLng ?? null, ...dl.apiWeather });
      if (dl.storeWeather) d.weatherSamples.push({ time: dl.storeArrivalTime || dl.orderTime || null, source: "store", lat: dl.storeLat ?? null, lng: dl.storeLng ?? null, ...dl.storeWeather });
    });
  }
  return d;
};

// ─── Reverse geocoding (Nominatim, 1req/sec) ───
let lastGeoReq = 0;
export const reverseGeocode = async (lat, lng) => {
  const now = Date.now();
  const wait = Math.max(0, 1100 - (now - lastGeoReq));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastGeoReq = Date.now();
  try {
    const safeLat = publicCoord(lat);
    const safeLng = publicCoord(lng);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${safeLat}&lon=${safeLng}&format=json&zoom=16&accept-language=ja`,
      { cache: "no-store", referrerPolicy: "no-referrer", headers: { 'User-Agent': 'DeliveryLogApp/1.0' } }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const addr = json.address;
    return addr?.suburb || addr?.neighbourhood || addr?.city_district || addr?.city || addr?.town || addr?.village || null;
  } catch { return null; }
};

export const dayRev = (log, inc) => { const r = (log.deliveries || []).filter(d => !d.cancelled).reduce((s, d) => s + (d.reward || 0) + (inc ? (d.incentive || 0) : 0), 0); return r + (inc ? (log.dailyIncentives || []).reduce((s, d) => s + (d.amount || 0), 0) : 0); };
