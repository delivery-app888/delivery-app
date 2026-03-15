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
export const sv = async (d) => { try { const k = tk(); await storage.set(k, JSON.stringify(d)); try { const r = await storage.get(ik()); const ks = r ? JSON.parse(r.value) : []; if (!ks.includes(k)) { ks.push(k); await storage.set(ik(), JSON.stringify(ks)); } } catch { await storage.set(ik(), JSON.stringify([k])); } } catch {} };
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
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&current=precipitation`);
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
export const dc = (d) => (OT.find(o => o.id === d.orderType)?.c || 1);

// ─── Data helpers ───
export const newDay = () => ({ date: tds(), weather: null, sessions: [], breaks: [], deliveries: [], dailyIncentives: [], jizoSessions: [], currentSessionStart: null, currentBreakStart: null, currentOrderTime: null, currentJizoStart: null });
export const defaultSettings = () => ({ theme: "dark", incInGoal: true, incInReward: false, largeFont: false, workDays: [1, 2, 3, 4, 5] });

export const migrate = (d) => {
  if (!d.dailyIncentives) d.dailyIncentives = [];
  if (!d.jizoSessions) d.jizoSessions = [];
  if (d.onlineStart !== undefined) { d.sessions = d.sessions || []; if (d.onlineStart && d.onlineEnd) d.sessions.push({ start: d.onlineStart, end: d.onlineEnd }); else if (d.onlineStart) d.currentSessionStart = d.onlineStart; delete d.onlineStart; delete d.onlineEnd; }
  if (!d.sessions) d.sessions = []; if (d.currentSessionStart === undefined) d.currentSessionStart = null; if (d.currentJizoStart === undefined) d.currentJizoStart = null;
  d.deliveries.forEach(dl => { if (!dl.orderType) dl.orderType = "single"; if (dl.cancelled === undefined) dl.cancelled = false; if (dl.rating === undefined) dl.rating = null; if (dl.startLat === undefined) { dl.startLat = null; dl.startLng = null; dl.endLat = null; dl.endLng = null; } if (dl.apiWeather === undefined) dl.apiWeather = null; if (dl.areaName === undefined) dl.areaName = null; });
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
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=16&accept-language=ja`,
      { headers: { 'User-Agent': 'DeliveryLogApp/1.0' } }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const addr = json.address;
    return addr?.suburb || addr?.neighbourhood || addr?.city_district || addr?.city || addr?.town || addr?.village || null;
  } catch { return null; }
};

export const dayRev = (log, inc) => { const r = (log.deliveries || []).filter(d => !d.cancelled).reduce((s, d) => s + (d.reward || 0) + (inc ? (d.incentive || 0) : 0), 0); return r + (inc ? (log.dailyIncentives || []).reduce((s, d) => s + (d.amount || 0), 0) : 0); };
