import { useState, useEffect, useCallback, useRef } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from "recharts";
import { storage } from "./db";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { DARK, LIGHT } from "./themes";
import { WEATHER, COS, OT, NP, FN, BH, BBH } from "./constants";
import { tds, ms, sv, lt, la, lg, sg, ls, ss, getPos, fetchWeather, ft, fd, fm, dc, newDay, defaultSettings, migrate, dayRev, reverseGeocode } from "./utils";
import { generateDemoLogs } from "./demoData";

// ─── AutoFitText ───
function AutoFitText({ value, maxSize = 20, color = "#FFF" }) {
  const ref = useRef(null);
  const [fs, setFs] = useState(maxSize);
  useEffect(() => { if (!ref.current) return; let s = maxSize; ref.current.style.fontSize = s + "px"; while (ref.current.scrollWidth > ref.current.clientWidth && s > 10) { s--; ref.current.style.fontSize = s + "px"; } setFs(s); }, [value, maxSize]);
  return <div ref={ref} style={{ fontSize: fs, fontWeight: 800, color, lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden" }}>{value}</div>;
}

// ─── Custom chart tooltip ───
const ChartTip = ({ active, payload, label, theme }) => {
  if (!active || !payload?.length) return null;
  const T2 = theme || DARK;
  return (
    <div style={{ background: T2.card, border: `1px solid ${T2.border}`, borderRadius: 10, padding: "8px 12px", boxShadow: "0 4px 16px #0004", minWidth: 100 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T2.textSub, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => {
        const isYen = ["売上","単価","時給","平均売上","平均単価"].some(k => p.name?.includes(k));
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: p.color || T2.accent, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: T2.textMuted }}>{p.name}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: T2.text, marginLeft: "auto" }}>
              {isYen ? `¥${p.value.toLocaleString()}` : typeof p.value === "number" ? p.value.toLocaleString() : p.value}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ═══ Toggle component ═══
function Toggle({ on, onToggle, T }) {
  return (
    <div onClick={onToggle} style={{ width: 48, height: 28, borderRadius: 14, background: on ? "#22C55E" : T.barBg, cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
      <div style={{ width: 22, height: 22, borderRadius: 11, background: "#FFF", position: "absolute", top: 3, left: on ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 3px #0003" }} />
    </div>
  );
}

// ═══ APP ═══
export default function App() {
  const [screen, setScreen] = useState("main");
  const [data, setData] = useState(newDay());
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [allLogs, setAllLogs] = useState([]);
  const [goal, setGoal] = useState(0);
  const [settings, setSettings] = useState(defaultSettings());
  const [menu, setMenu] = useState(false);
  // reward
  const [rwCo, setRwCo] = useState(null); const [rwAmt, setRwAmt] = useState(""); const [rwInc, setRwInc] = useState(""); const [rwField, setRwField] = useState("reward"); const [rwType, setRwType] = useState("single");
  const [rwRating, setRwRating] = useState(null); // "good"|"normal"|"bad"|null (auto)
  // daily inc
  const [diCo, setDiCo] = useState(null); const [diAmt, setDiAmt] = useState("");
  // edit
  const [editIdx, setEditIdx] = useState(null); const [editData, setEditData] = useState(null); const [editField, setEditField] = useState(null);
  // modals
  const [popup, setPopup] = useState(null); const [weatherPop, setWeatherPop] = useState(false);
  const [tutorial, setTutorial] = useState(false); const [tutStep, setTutStep] = useState(0);
  const [goalModal, setGoalModal] = useState(false); const [goalInput, setGoalInput] = useState("");
  const [avgPeriod, setAvgPeriod] = useState("all"); // today | week | month | all
  const [anaOpen, setAnaOpen] = useState(false);
  const [isPremium] = useState(false);
  // heatmap
  const [hmPeriod, setHmPeriod] = useState("today");
  const [hmCenter, setHmCenter] = useState(null);
  const [hmPinCount, setHmPinCount] = useState(0);
  const [hmTimeSlot, setHmTimeSlot] = useState("all");
  const [hmDow, setHmDow] = useState("all");
  const [hmCompany, setHmCompany] = useState("all");
  const [hmWeather, setHmWeather] = useState("all");
  const [hmDropdown, setHmDropdown] = useState(null); // "time"|"dow"|"company"|"weather"|null
  const hmMapRef = useRef(null);
  const hmElRef = useRef(null);
  const hmLayerRef = useRef(null);
  // area analysis
  const [aaCenter, setAaCenter] = useState(null);
  const [aaGeoProgress, setAaGeoProgress] = useState(null);
  const [aaPeriod, setAaPeriod] = useState("all");
  const [aaTimeSlot, setAaTimeSlot] = useState("all");
  const [aaDow, setAaDow] = useState("all");
  const [aaCompany, setAaCompany] = useState("all");
  const [aaWeather, setAaWeather] = useState("all");
  const [aaDropdown, setAaDropdown] = useState(null);
  const aaMapRef = useRef(null);
  const aaElRef = useRef(null);
  const aaLayerRef = useRef(null);
  // hourly analysis
  const [hrPeriod, setHrPeriod] = useState("today");
  const [hrDow, setHrDow] = useState("all");
  const [hrCompany, setHrCompany] = useState("all");
  const [hrWeather, setHrWeather] = useState("all");
  const [hrDropdown, setHrDropdown] = useState(null);
  // weekday analysis
  const [wdPeriod, setWdPeriod] = useState("today");
  const [wdTimeSlot, setWdTimeSlot] = useState("all");
  const [wdCompany, setWdCompany] = useState("all");
  const [wdWeather, setWdWeather] = useState("all");
  const [wdDropdown, setWdDropdown] = useState(null);
  // company analysis
  const [coPeriod, setCoPeriod] = useState("today");
  const [coTimeSlot, setCoTimeSlot] = useState("all");
  const [coDow, setCoDow] = useState("all");
  const [coWeather, setCoWeather] = useState("all");
  const [coDropdown, setCoDropdown] = useState(null);
  // unit price analysis
  const [upPeriod, setUpPeriod] = useState("today");
  const [upTimeSlot, setUpTimeSlot] = useState("all");
  const [upDow, setUpDow] = useState("all");
  const [upCompany, setUpCompany] = useState("all");
  const [upWeather, setUpWeather] = useState("all");
  const [upDropdown, setUpDropdown] = useState(null);
  const [chartAnim, setChartAnim] = useState(true);
  const prevScreen = useRef(screen);
  useEffect(() => {
    if (screen !== prevScreen.current) {
      if (screen === "ana_heatmap") { getPos().then(p => { if (p) setHmCenter([p.lat, p.lng]); }); setHmPeriod("today"); setHmTimeSlot("all"); setHmDow("all"); setHmCompany("all"); setHmWeather("all"); setHmDropdown(null); }
      if (screen === "ana_area") { getPos().then(p => { if (p) setAaCenter([p.lat, p.lng]); }); setAaPeriod("all"); setAaTimeSlot("all"); setAaDow("all"); setAaCompany("all"); setAaWeather("all"); setAaDropdown(null); }
      if (screen === "ana_hourly") { setHrPeriod("today"); setHrDow("all"); setHrCompany("all"); setHrWeather("all"); setHrDropdown(null); }
      if (screen === "ana_weekday") { setWdPeriod("today"); setWdTimeSlot("all"); setWdCompany("all"); setWdWeather("all"); setWdDropdown(null); }
      if (screen === "ana_company") { setCoPeriod("today"); setCoTimeSlot("all"); setCoDow("all"); setCoWeather("all"); setCoDropdown(null); }
      if (screen === "ana_unitprice") { setUpPeriod("today"); setUpTimeSlot("all"); setUpDow("all"); setUpCompany("all"); setUpWeather("all"); setUpDropdown(null); }
      if (screen.startsWith("ana_")) { setChartAnim(true); const t = setTimeout(() => setChartAnim(false), 1500); prevScreen.current = screen; return () => clearTimeout(t); }
      prevScreen.current = screen;
    }
  }, [screen]);
  // UX features
  const [otsukareData, setOtsukareData] = useState(null);
  const [todayGuide, setTodayGuide] = useState(null);
  const [weeklyReview, setWeeklyReview] = useState(null);
  const [weatherChance, setWeatherChance] = useState(null);
  // Milestone / feedback / streak / calendar
  const [milestone, setMilestone] = useState(null);
  const [deliveryFeedback, setDeliveryFeedback] = useState(null);
  const [calOpen, setCalOpen] = useState(false);


  const T = settings.theme === "light" ? LIGHT : DARK;
  // Font scale: large mode bumps small text to minimum 13px
  const sz = (n) => settings.largeFont ? (n < 12 ? 13 : n < 18 ? n + 3 : n < 24 ? n + 2 : n + 1) : n;

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 10000); return () => clearInterval(t); }, []);
  useEffect(() => { (async () => {
    const saved = await lt(); if (saved) setData(migrate(saved));
    const g = await lg(); if (g?.amount) setGoal(g.amount);
    const s = await ls(); if (s) setSettings({ ...defaultSettings(), ...s });
    let all = await la();
    // Auto-generate demo data if empty - set directly to state
    if (all.length === 0) {
      try {
        const demo = generateDemoLogs();
        all = demo.logs;
        setData(demo.todayLog);
        setGoal(300000);
        setJizoExplained(true);
        // Skip tutorial for demo
        setLoading(false);
        setAllLogs(all);
        return;
      } catch (e) { console.error("Demo gen:", e); }
    }
    setAllLogs(all.filter(l => l.date !== tds()));
    // Show tutorial on first launch
    try { const tutDone = await storage.get("tutorial-done"); if (!tutDone) setTutorial(true); } catch { setTutorial(true); }
    setLoading(false);
  })(); }, []);

  const saveRef = useRef(null);
  useEffect(() => { if (loading) return; if (saveRef.current) clearTimeout(saveRef.current); saveRef.current = setTimeout(() => sv(data), 300); }, [data, loading]);
  const update = useCallback((fn) => { setData(p => { const n = { ...p, sessions: [...p.sessions], breaks: [...p.breaks], deliveries: [...p.deliveries], dailyIncentives: [...p.dailyIncentives], jizoSessions: [...p.jizoSessions] }; fn(n); return n; }); }, []);
  const updateSettings = (patch) => { const n = { ...settings, ...patch }; setSettings(n); ss(n); };

  // ─── Heatmap map lifecycle ───
  useEffect(() => {
    const isHm = screen === "ana_heatmap";
    if (!isHm) {
      if (hmMapRef.current) { hmMapRef.current.remove(); hmMapRef.current = null; }
      return;
    }
    const el = hmElRef.current;
    if (!el || hmMapRef.current) return;
    const center = hmCenter || [35.6812, 139.7671];
    const map = L.map(el, { zoomControl: false, attributionControl: false }).setView(center, 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
    hmMapRef.current = map;
    hmLayerRef.current = L.layerGroup().addTo(map);
    setTimeout(() => map.invalidateSize(), 200);
  }, [screen, hmCenter]);

  useEffect(() => {
    if (hmMapRef.current && hmCenter) {
      hmMapRef.current.setView(hmCenter, 14);
      setTimeout(() => hmMapRef.current.invalidateSize(), 100);
    }
  }, [hmCenter]);

  useEffect(() => {
    if (screen !== "ana_heatmap" || !hmLayerRef.current) return;
    const RC = { good: "#EAB308", normal: "#9CA3AF", bad: "#3B82F6", cancelled: "#EF4444" };
    const todayStr2 = tds();
    const nowMs2 = Date.now();
    const msDay2 = 86400000;
    const awD = [
      ...allLogs.flatMap(l2 => (l2.deliveries || []).filter(d2 => d2.startLat || d2.endLat).map(d2 => ({ ...d2, _date: l2.date }))),
      ...data.deliveries.filter(d2 => d2.startLat || d2.endLat).map(d2 => ({ ...d2, _date: data.date })),
    ];
    // Period filter
    const per = hmPeriod || "today";
    const pFree = per === "today";
    const canV = pFree || isPremium;
    let filt = [];
    if (canV) {
      if (per === "today") { filt = awD.filter(d2 => d2._date === todayStr2); }
      else {
        const cut = per === "week" ? 7 : per === "month" ? 30 : per === "half" ? 180 : per === "year" ? 365 : 99999;
        const mD = new Date(nowMs2 - cut * msDay2);
        const mS = `${mD.getFullYear()}-${String(mD.getMonth()+1).padStart(2,"0")}-${String(mD.getDate()).padStart(2,"0")}`;
        filt = awD.filter(d2 => d2._date >= mS);
      }
    }
    // Time slot filter
    if (hmTimeSlot !== "all") {
      const slots = { morning: [6, 10], lunch: [11, 14], afternoon: [15, 17], dinner: [18, 21], night: [22, 5] };
      const [sH, eH] = slots[hmTimeSlot] || [0, 23];
      filt = filt.filter(d2 => {
        const h = new Date(d2.orderTime).getHours();
        return sH <= eH ? (h >= sH && h <= eH) : (h >= sH || h <= eH);
      });
    }
    // Day of week filter (0=Sun,1=Mon,...6=Sat)
    if (hmDow !== "all") {
      const dowMap = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };
      const target = dowMap[hmDow];
      if (target !== undefined) {
        filt = filt.filter(d2 => new Date(d2.orderTime).getDay() === target);
      }
    }
    // Company filter
    if (hmCompany !== "all") {
      filt = filt.filter(d2 => d2.company === hmCompany);
    }
    // Weather filter
    if (hmWeather !== "all") {
      const wxDates = new Set([...allLogs, data].filter(l => l.weather === hmWeather).map(l => l.date));
      filt = filt.filter(d2 => wxDates.has(d2._date));
    }
    hmLayerRef.current.clearLayers();
    const fT = (t2) => { if (!t2) return ""; const dt2 = new Date(t2); return `${dt2.getHours()}:${String(dt2.getMinutes()).padStart(2, "0")}`; };
    filt.forEach(d2 => {
      const c = d2.cancelled ? RC.cancelled : RC[d2.rating] || RC.normal;
      const co2 = d2.company || "不明";
      const rw2 = d2.cancelled ? "キャンセル" : `¥${(d2.reward || 0).toLocaleString()}`;
      const wInfo = d2.apiWeather ? `<br/>${d2.apiWeather.temperature}℃ 風${d2.apiWeather.windspeed}km/h${d2.apiWeather.precipitation != null ? ` 雨${d2.apiWeather.precipitation}mm` : ""}` : "";
      if (d2.startLat && d2.startLng) L.circleMarker([d2.startLat, d2.startLng], { radius: 6, color: c, fillColor: c, fillOpacity: 0.6, weight: 2 }).bindPopup(`<b>受注</b> ${fT(d2.orderTime)}<br/>${co2} ${rw2}${wInfo}`).addTo(hmLayerRef.current);
      if (d2.endLat && d2.endLng) L.circleMarker([d2.endLat, d2.endLng], { radius: 6, color: c, fillColor: c, fillOpacity: 1, weight: 2 }).bindPopup(`<b>完了</b> ${fT(d2.completeTime)}<br/>${co2} ${rw2}${wInfo}`).addTo(hmLayerRef.current);
    });
    setHmPinCount(filt.length);
  }, [screen, hmPeriod, hmTimeSlot, hmDow, hmCompany, hmWeather, allLogs, data, isPremium]);

  // ─── Area analysis: compute best area center from data ───
  const aaBestCenter = (() => {
    const allD = [...allLogs.flatMap(l => l.deliveries || []), ...data.deliveries];
    const withGps = allD.filter(d2 => !d2.cancelled && (d2.endLat || d2.startLat));
    if (withGps.length === 0) return null;
    // Find the grid cell with highest hourly rate
    const G = 0.005, cells3 = {};
    withGps.forEach(d2 => {
      const lat = d2.endLat || d2.startLat, lng = d2.endLng || d2.startLng;
      if (!lat || !lng) return;
      const gL = Math.floor(lat / G) * G, gN = Math.floor(lng / G) * G;
      const k = `${gL}_${gN}`;
      if (!cells3[k]) cells3[k] = { lat: gL + G/2, lng: gN + G/2, rev: 0, ms: 0, cnt: 0 };
      cells3[k].rev += (d2.reward || 0);
      cells3[k].cnt++;
      cells3[k].ms += (d2.completeTime && d2.orderTime ? d2.completeTime - d2.orderTime : 0);
    });
    const best = Object.values(cells3).filter(c => c.cnt >= 2 && c.ms > 0).sort((a, b) => (b.rev / b.ms) - (a.rev / a.ms))[0];
    return best ? [best.lat, best.lng] : [withGps[0].endLat || withGps[0].startLat, withGps[0].endLng || withGps[0].startLng];
  })();

  // ─── Area analysis map lifecycle ───
  useEffect(() => {
    const isAa = screen === "ana_area";
    if (!isAa) {
      if (aaMapRef.current) { aaMapRef.current.remove(); aaMapRef.current = null; }
      return;
    }
    const el = aaElRef.current;
    if (!el || aaMapRef.current) return;
    const center = aaCenter || aaBestCenter || [35.6812, 139.7671];
    const map = L.map(el, { zoomControl: false, attributionControl: false }).setView(center, 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
    aaMapRef.current = map;
    aaLayerRef.current = L.layerGroup().addTo(map);
    setTimeout(() => map.invalidateSize(), 300);
    setTimeout(() => map.invalidateSize(), 600);
  }, [screen, aaCenter, aaBestCenter]);

  useEffect(() => {
    if (aaMapRef.current && aaCenter) {
      aaMapRef.current.setView(aaCenter, 14);
      setTimeout(() => aaMapRef.current.invalidateSize(), 100);
    }
  }, [aaCenter]);

  // Area grid rendering (with filters)
  useEffect(() => {
    if (screen !== "ana_area" || !aaLayerRef.current) return;
    const GRID = 0.005;
    const todayStr3 = tds();
    const nowMs3 = Date.now();
    const msDay3 = 86400000;
    let allDels = [
      ...allLogs.flatMap(l => (l.deliveries || []).filter(d2 => !d2.cancelled && (d2.startLat || d2.endLat)).map(d2 => ({ ...d2, _date: l.date }))),
      ...data.deliveries.filter(d2 => !d2.cancelled && (d2.startLat || d2.endLat)).map(d2 => ({ ...d2, _date: data.date })),
    ];
    // Period filter
    const per = aaPeriod || "all";
    if (per === "today") { allDels = allDels.filter(d2 => d2._date === todayStr3); }
    else if (per !== "all") {
      const cut = per === "week" ? 7 : per === "month" ? 30 : per === "half" ? 180 : 365;
      const mD = new Date(nowMs3 - cut * msDay3);
      const mS = `${mD.getFullYear()}-${String(mD.getMonth()+1).padStart(2,"0")}-${String(mD.getDate()).padStart(2,"0")}`;
      allDels = allDels.filter(d2 => d2._date >= mS);
    }
    // Time slot filter
    if (aaTimeSlot !== "all") {
      const slots = { morning: [6, 10], lunch: [11, 14], afternoon: [15, 17], dinner: [18, 21], night: [22, 5] };
      const [sH, eH] = slots[aaTimeSlot] || [0, 23];
      allDels = allDels.filter(d2 => { const h = new Date(d2.orderTime).getHours(); return sH <= eH ? (h >= sH && h <= eH) : (h >= sH || h <= eH); });
    }
    // DOW filter
    if (aaDow !== "all") {
      const dowMap = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };
      const target = dowMap[aaDow];
      if (target !== undefined) allDels = allDels.filter(d2 => new Date(d2.orderTime).getDay() === target);
    }
    // Company filter
    if (aaCompany !== "all") allDels = allDels.filter(d2 => d2.company === aaCompany);
    // Weather filter
    if (aaWeather !== "all") {
      const wxDates2 = new Set([...allLogs, data].filter(l => l.weather === aaWeather).map(l => l.date));
      allDels = allDels.filter(d2 => wxDates2.has(d2._date));
    }

    const cells = {};
    allDels.forEach(d2 => {
      const lat = d2.endLat || d2.startLat;
      const lng = d2.endLng || d2.startLng;
      if (!lat || !lng) return;
      const gLat = Math.floor(lat / GRID) * GRID;
      const gLng = Math.floor(lng / GRID) * GRID;
      const key = `${gLat.toFixed(4)}_${gLng.toFixed(4)}`;
      if (!cells[key]) cells[key] = { lat: gLat, lng: gLng, totalRev: 0, count: 0, totalMs: 0, names: [] };
      cells[key].totalRev += (d2.reward || 0);
      cells[key].count++;
      cells[key].totalMs += (d2.completeTime && d2.orderTime) ? d2.completeTime - d2.orderTime : 0;
      if (d2.areaName && !cells[key].names.includes(d2.areaName)) cells[key].names.push(d2.areaName);
    });
    const hourlyToColor = (h) => {
      if (h >= 2000) return "#16A34A";
      if (h >= 1500) return "#22C55E";
      if (h >= 1200) return "#EAB308";
      if (h >= 900)  return "#F59E0B";
      return "#EF4444";
    };
    aaLayerRef.current.clearLayers();
    Object.values(cells).forEach(c => {
      const hourly = c.totalMs > 0 ? Math.round(c.totalRev / (c.totalMs / 3600000)) : 0;
      if (c.count < 2) return;
      const color = hourlyToColor(hourly);
      const opacity = c.count >= 30 ? 0.5 : c.count >= 10 ? 0.4 : 0.3;
      const name = c.names[0] || "";
      L.rectangle([[c.lat, c.lng], [c.lat + GRID, c.lng + GRID]], {
        color, fillColor: color, fillOpacity: opacity, weight: 1, opacity: 0.4,
      }).bindPopup(
        `<div style="font-family:'Hiragino Sans',sans-serif;text-align:center;min-width:110px;">` +
        (name ? `<div style="font-size:12px;font-weight:700;margin-bottom:2px;">${name}</div>` : "") +
        `<div style="font-size:20px;font-weight:800;color:${color};">¥${hourly.toLocaleString()}/h</div>` +
        `<div style="font-size:11px;color:#999;margin-top:2px;">${c.count}件の配達</div></div>`
      ).addTo(aaLayerRef.current);
    });
  }, [screen, aaPeriod, aaTimeSlot, aaDow, aaCompany, aaWeather, allLogs, data]);

  // Background geocoding for area names
  useEffect(() => {
    if (screen !== "ana_area") return;
    let cancelled = false;
    (async () => {
      const todayDels = data.deliveries.filter(d2 => (d2.endLat || d2.startLat) && !d2.areaName);
      const pastDels = allLogs.flatMap((l, li) => (l.deliveries || []).filter(d2 => (d2.endLat || d2.startLat) && !d2.areaName).map(d2 => ({ d: d2, li })));
      const total = todayDels.length + pastDels.length;
      if (total === 0) return;
      const maxBatch = 30; // limit per session
      let done = 0;
      setAaGeoProgress({ done: 0, total: Math.min(total, maxBatch) });
      // Geocode today's deliveries first
      for (const d2 of todayDels) {
        if (cancelled || done >= maxBatch) break;
        const lat = d2.endLat || d2.startLat;
        const lng = d2.endLng || d2.startLng;
        const name = await reverseGeocode(lat, lng);
        if (name && !cancelled) {
          d2.areaName = name;
          update(d => {
            const match = d.deliveries.find(dl => dl.orderTime === d2.orderTime && !dl.areaName);
            if (match) match.areaName = name;
          });
        }
        done++;
        if (!cancelled) setAaGeoProgress({ done, total: Math.min(total, maxBatch) });
      }
      // Geocode past deliveries
      for (const { d: d2 } of pastDels) {
        if (cancelled || done >= maxBatch) break;
        const lat = d2.endLat || d2.startLat;
        const lng = d2.endLng || d2.startLng;
        const name = await reverseGeocode(lat, lng);
        if (name && !cancelled) d2.areaName = name;
        done++;
        if (!cancelled) setAaGeoProgress({ done, total: Math.min(total, maxBatch) });
      }
      if (!cancelled) setAaGeoProgress(null);
    })();
    return () => { cancelled = true; setAaGeoProgress(null); };
  }, [screen]);

  // ─── Computed ───
  const isOn = !!data.currentSessionStart; const isBrk = !!data.currentBreakStart; const hasOrd = !!data.currentOrderTime; const isJz = !!data.currentJizoStart;
  const hasWrk = data.sessions.length > 0 || isOn;
  const actDels = data.deliveries.filter(d => !d.cancelled);
  const canCnt = data.deliveries.filter(d => d.cancelled).length;
  const delCnt = actDels.reduce((s, d) => s + dc(d), 0);
  const totRew = actDels.reduce((s, d) => s + (d.reward || 0), 0);
  const totDlI = actDels.reduce((s, d) => s + (d.incentive || 0), 0);
  const totDyI = data.dailyIncentives.reduce((s, d) => s + (d.amount || 0), 0);
  const totInc = totDlI + totDyI;
  const totAll = totRew + totInc;
  const rewardDisplay = settings.incInReward ? totAll : totRew;
  const tBrkMs = data.breaks.reduce((s, b) => (b.start && b.end) ? s + (b.end - b.start) : s, 0) + (isBrk ? now - data.currentBreakStart : 0);
  const tJzMs = data.jizoSessions.reduce((s, j) => (j.start && j.end) ? s + (j.end - j.start) : s, 0) + (isJz ? now - data.currentJizoStart : 0);
  const sesMs = data.sessions.reduce((s, x) => s + (x.end - x.start), 0) + (isOn ? now - data.currentSessionStart : 0);
  const wkMs = Math.max(0, sesMs - tBrkMs);
  const hBase = wkMs > 0 ? Math.round(totRew / (wkMs / 3600000)) : 0;
  const hAll = wkMs > 0 ? Math.round(totAll / (wkMs / 3600000)) : 0;
  const cm = ms();
  const pastRev = allLogs.filter(l => l.date?.startsWith(cm)).reduce((s, l) => s + dayRev(l, settings.incInGoal), 0);
  const mRev = pastRev + (settings.incInGoal ? totAll : totRew);
  const gPct = goal > 0 ? Math.round(mRev / goal * 100) : 0;

  // ─── Streak (consecutive work days) + best streak ───
  const streakInfo = (() => {
    const workDates = new Set([
      ...allLogs.filter(l => l.sessions?.length > 0 || l.currentSessionStart).map(l => l.date),
      ...((hasWrk || data.sessions.length > 0) ? [tds()] : []),
    ]);
    // Current streak
    let count = 0;
    const d2 = new Date();
    for (let i = 0; i < 365; i++) {
      const ds = `${d2.getFullYear()}-${String(d2.getMonth()+1).padStart(2,"0")}-${String(d2.getDate()).padStart(2,"0")}`;
      if (workDates.has(ds)) count++;
      else if (i > 0) break;
      d2.setDate(d2.getDate() - 1);
    }
    // Best streak from all dates
    const allDates = [...workDates].sort();
    let best = 0, cur = 0;
    for (let i = 0; i < allDates.length; i++) {
      if (i === 0) { cur = 1; }
      else {
        const prev = new Date(allDates[i-1] + "T00:00:00");
        const now2 = new Date(allDates[i] + "T00:00:00");
        cur = (now2 - prev === 86400000) ? cur + 1 : 1;
      }
      if (cur > best) best = cur;
    }
    // Week dots (Mon-Sun)
    const weekDots = [];
    const today2 = new Date();
    const dayOfWeek = today2.getDay() || 7; // Mon=1...Sun=7
    for (let i = 1; i <= 7; i++) {
      const dd = new Date(today2);
      dd.setDate(dd.getDate() - (dayOfWeek - i));
      const ds = `${dd.getFullYear()}-${String(dd.getMonth()+1).padStart(2,"0")}-${String(dd.getDate()).padStart(2,"0")}`;
      weekDots.push({ day: ["","月","火","水","木","金","土","日"][i], active: workDates.has(ds), isToday: ds === tds() });
    }
    return { count, best, weekDots };
  })();
  const streak = streakInfo.count;

  // ─── Cumulative stats (for milestones) ───
  const cumDels = allLogs.reduce((s, l) => s + (l.deliveries || []).filter(d => !d.cancelled).reduce((s2, d) => s2 + dc(d), 0), 0) + delCnt;
  const cumRev = allLogs.reduce((s, l) => s + dayRev(l, false), 0) + totRew;

  // ─── Action feedback toast ───
  const [actionToast, setActionToast] = useState(null);
  const pulse = (name) => {
    const msgs = { online: "✓ オンライン開始", brkS: "☕ 休憩開始", brkE: "✓ 休憩終了", order: "📦 受注しました", complete: "✓ 報酬入力へ" };
    setActionToast(msgs[name] || "✓");
    setTimeout(() => setActionToast(null), 1200);
  };
  // Keep flashBtn as pass-through (no visual change on button itself)
  const flashBtn = (bg, dis, h, _name) => btn(bg, dis, h);

  // ─── Daily target for guide ───
  const dailyTarget = goal > 0 ? Math.round(goal / 22) : 0; // assume ~22 work days
  const todayRemaining = Math.max(0, dailyTarget - totAll);

  // ─── 1. Golden Time indicator (historical hourly earnings) ───
  const goldenTime = (() => {
    if (!isOn) return null;
    const curH = new Date().getHours();
    const hourMap = {};
    allLogs.forEach(l => {
      const wk = (l.sessions || []).reduce((s, x) => s + ((x.end || 0) - x.start), 0) - (l.breaks || []).reduce((s, b) => s + ((b.end || 0) - (b.start || 0)), 0);
      if (wk <= 0) return;
      const dels = (l.deliveries || []).filter(d => !d.cancelled);
      dels.forEach(d => {
        const h = new Date(d.orderTime).getHours();
        if (!hourMap[h]) hourMap[h] = { rev: 0, ms: 0 };
        hourMap[h].rev += (d.reward || 0);
        hourMap[h].ms += (d.completeTime && d.orderTime ? d.completeTime - d.orderTime : 0);
      });
    });
    const cur = hourMap[curH];
    if (!cur || cur.ms <= 0) return null;
    const curHr = Math.round(cur.rev / (cur.ms / 3600000));
    // Calculate average hourly rate across all hours
    let totalRev = 0, totalMs = 0;
    Object.values(hourMap).forEach(v => { totalRev += v.rev; totalMs += v.ms; });
    const avgHr = totalMs > 0 ? Math.round(totalRev / (totalMs / 3600000)) : 0;
    if (avgHr <= 0) return null;
    const ratio = curHr / avgHr;
    if (ratio >= 1.15) return { type: "golden", hr: curHr, label: "ゴールデンタイム" };
    if (ratio <= 0.85) return { type: "slow", hr: curHr, label: "まったりタイム" };
    return { type: "normal", hr: curHr, label: "平均ペース" };
  })();

  // ─── 2. "あと少し" nudge (80%+ of daily goal) ───
  const nudge = (() => {
    if (dailyTarget <= 0 || !isOn) return null;
    const pct = totAll / dailyTarget;
    if (pct >= 1) return { type: "done" };
    if (pct >= 0.8) {
      const rem = dailyTarget - totAll;
      const avgUnit = delCnt > 0 ? Math.round(totRew / delCnt) : 500;
      const estDels = Math.ceil(rem / avgUnit);
      return { type: "close", remaining: rem, estDels };
    }
    return null;
  })();

  // ─── 3. Today's pace prediction ───
  const pacePredict = (() => {
    if (!isOn || wkMs < 1800000) return null; // need at least 30min of work
    const hrWorked = wkMs / 3600000;
    // Estimate remaining work hours (assume typical 8-10hr day, or use sessions)
    const startH = data.sessions[0]?.start || data.currentSessionStart;
    if (!startH) return null;
    const typicalEndH = 10; // assume ~10 hours typical workday
    const elapsedH = (Date.now() - startH) / 3600000;
    const remainH = Math.max(0, typicalEndH - elapsedH);
    const pace = totAll / hrWorked;
    const predicted = Math.round(totAll + pace * remainH);
    const pctOfGoal = dailyTarget > 0 ? Math.round(predicted / dailyTarget * 100) : 0;
    return { predicted, pace: Math.round(pace), pctOfGoal };
  })();

  // ─── 4. Personal bests ───
  const personalBests = (() => {
    const records = { maxRevDay: 0, maxDelDay: 0, maxHrRate: 0, maxStreak: streak };
    allLogs.forEach(l => {
      const dels = (l.deliveries || []).filter(d => !d.cancelled);
      const rev = dels.reduce((s, d) => s + (d.reward || 0) + (d.incentive || 0), 0) + (l.dailyIncentives || []).reduce((s, d) => s + (d.amount || 0), 0);
      const cnt = dels.reduce((s, d) => s + dc(d), 0);
      const wk2 = (l.sessions || []).reduce((s, x) => s + ((x.end || 0) - x.start), 0) - (l.breaks || []).reduce((s, b) => s + ((b.end || 0) - (b.start || 0)), 0);
      const hr2 = wk2 > 0 ? Math.round(rev / (wk2 / 3600000)) : 0;
      if (rev > records.maxRevDay) records.maxRevDay = rev;
      if (cnt > records.maxDelDay) records.maxDelDay = cnt;
      if (hr2 > records.maxHrRate && wk2 > 3600000) records.maxHrRate = hr2; // min 1hr worked
    });
    // Check today
    const todayNewBestRev = totAll > records.maxRevDay && records.maxRevDay > 0;
    const todayNewBestDel = delCnt > records.maxDelDay && records.maxDelDay > 0;
    const todayNewBestHr = hAll > records.maxHrRate && records.maxHrRate > 0 && wkMs > 3600000;
    return { ...records, todayNewBestRev, todayNewBestDel, todayNewBestHr };
  })();

  // ─── 5. Weather chance message (on doOnline) ───
  const weatherChanceMsg = (() => {
    if (!data.weather) return null;
    const wxId = data.weather;
    const wxDays = allLogs.filter(l => l.weather === wxId);
    const otherDays = allLogs.filter(l => l.weather && l.weather !== wxId);
    if (wxDays.length < 3 || otherDays.length < 3) return null;
    const calcAvgHr = (logs) => {
      let rev = 0, ms2 = 0;
      logs.forEach(l => {
        const dels = (l.deliveries || []).filter(d => !d.cancelled);
        rev += dels.reduce((s, d) => s + (d.reward || 0), 0);
        ms2 += (l.sessions || []).reduce((s, x) => s + ((x.end || 0) - x.start), 0) - (l.breaks || []).reduce((s, b) => s + ((b.end || 0) - (b.start || 0)), 0);
      });
      return ms2 > 0 ? Math.round(rev / (ms2 / 3600000)) : 0;
    };
    const wxHr = calcAvgHr(wxDays);
    const otherHr = calcAvgHr(otherDays);
    if (wxHr <= 0 || otherHr <= 0) return null;
    const diff = wxHr - otherHr;
    const wxInfo = WEATHER.find(w => w.id === wxId);
    if (Math.abs(diff) < 50) return null;
    return { icon: wxInfo?.icon || "", label: wxInfo?.label || "", diff, wxHr };
  })();

  // ─── 6. Weekly review data ───
  const weeklyReviewData = (() => {
    const now2 = new Date();
    const dow2 = now2.getDay();
    // this week: Mon-Sun
    const thisMonday = new Date(now2); thisMonday.setDate(now2.getDate() - ((dow2 + 6) % 7)); thisMonday.setHours(0,0,0,0);
    const lastMonday = new Date(thisMonday); lastMonday.setDate(lastMonday.getDate() - 7);
    const fmtD = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    const thisMon = fmtD(thisMonday);
    const lastMon = fmtD(lastMonday);
    const thisWeekLogs = [...allLogs, data].filter(l => l.date >= thisMon);
    const lastWeekLogs = allLogs.filter(l => l.date >= lastMon && l.date < thisMon);
    if (lastWeekLogs.length < 2) return null;
    const calcWeek = (logs) => {
      let rev = 0, ms2 = 0, cnt = 0, bestDay = "", bestRev = 0;
      const dowNames = ["日","月","火","水","木","金","土"];
      logs.forEach(l => {
        const dels = (l.deliveries || []).filter(d => !d.cancelled);
        const r = dels.reduce((s, d) => s + (d.reward || 0), 0);
        rev += r;
        cnt += dels.reduce((s, d) => s + dc(d), 0);
        ms2 += (l.sessions || []).reduce((s, x) => s + ((x.end || 0) - x.start), 0) - (l.breaks || []).reduce((s, b) => s + ((b.end || 0) - (b.start || 0)), 0);
        if (r > bestRev) { bestRev = r; const dd = new Date(l.date + "T00:00:00"); bestDay = dowNames[dd.getDay()] + "曜日"; }
      });
      const hr = ms2 > 0 ? Math.round(rev / (ms2 / 3600000)) : 0;
      const avgDel = cnt > 0 && ms2 > 0 ? Math.round(ms2 / cnt / 60000) : 0;
      return { rev, hr, cnt, ms: ms2, avgDel, bestDay, bestRev, days: logs.length };
    };
    const tw = calcWeek(thisWeekLogs);
    const lw = calcWeek(lastWeekLogs);
    return { tw, lw, hrDiff: tw.hr - lw.hr, delDiff: tw.avgDel > 0 && lw.avgDel > 0 ? lw.avgDel - tw.avgDel : 0 };
  })();

  // ─── Actions ───
  const doOnline = () => {
    if (isOn) return;
    if (!data.weather) { setWeatherPop(true); return; }
    update(d => { d.currentSessionStart = Date.now(); });
    pulse("online");
    // Show weather chance then today's guide
    if (weatherChanceMsg) {
      setWeatherChance(weatherChanceMsg);
      setTimeout(() => { setWeatherChance(null); }, 4500);
      // Show today's guide after weather chance
      if (dailyTarget > 0) {
        setTimeout(() => {
          const estDels2 = dailyTarget > 0 ? Math.ceil(todayRemaining / (totRew > 0 && delCnt > 0 ? Math.round(totRew / delCnt) : 500)) : 0;
          setTodayGuide({ target: dailyTarget, remaining: todayRemaining, estDels: estDels2 });
          setTimeout(() => setTodayGuide(null), 4000);
        }, 5000);
      }
    } else if (dailyTarget > 0) {
      const estDels = dailyTarget > 0 ? Math.ceil(todayRemaining / (totRew > 0 && delCnt > 0 ? Math.round(totRew / delCnt) : 500)) : 0;
      setTodayGuide({ target: dailyTarget, remaining: todayRemaining, estDels });
      setTimeout(() => setTodayGuide(null), 4000);
    }
  };
  const doOffline = () => {
    if (!isOn) return;
    setPopup({
      msg: "本日の稼働を終了しますか？\n\n休憩の場合は「休憩開始」を\n使ってください。",
      onConfirm: () => {
        // Capture stats before ending
        const endSesMs = sesMs + (Date.now() - (data.currentSessionStart || Date.now()));
        const endDelCnt = delCnt;
        const endRew = totRew;
        const endInc = totInc;
        const endAll = totAll;
        const endHrBase = endSesMs > 0 ? Math.round(endRew / (endSesMs / 3600000)) : 0;
        const endHrAll = endSesMs > 0 ? Math.round(endAll / (endSesMs / 3600000)) : 0;
        // Find personal best
        const pastBest = allLogs.reduce((best, l) => {
          const r = (l.deliveries || []).filter(d2 => !d2.cancelled).reduce((s, d2) => s + (d2.reward || 0) + (d2.incentive || 0), 0) + (l.dailyIncentives || []).reduce((s, d2) => s + (d2.amount || 0), 0);
          return r > best ? r : best;
        }, 0);
        const isNewBest = endAll > pastBest && pastBest > 0;

        update(d => {
          d.sessions.push({ start: d.currentSessionStart, end: Date.now() }); d.currentSessionStart = null;
          if (d.currentJizoStart) { d.jizoSessions.push({ start: d.currentJizoStart, end: Date.now() }); d.currentJizoStart = null; }
          if (d.currentBreakStart) { d.breaks.push({ start: d.currentBreakStart, end: Date.now() }); d.currentBreakStart = null; }
        });
        setPopup(null);
        // Show otsukare card
        setOtsukareData({ delCnt: endDelCnt, revenue: endRew, incentive: endInc, total: endAll, hrBase: endHrBase, hrAll: endHrAll, workTime: endSesMs, isNewBest, streak: streak });
      }
    });
  };
  const doBrkS = () => { if (!isOn || isBrk || hasOrd) return; if (isJz) update(d => { d.jizoSessions.push({ start: d.currentJizoStart, end: Date.now() }); d.currentJizoStart = null; }); update(d => { d.currentBreakStart = Date.now(); }); pulse("brkS"); };
  const doBrkE = () => { if (isBrk) { update(d => { d.breaks.push({ start: d.currentBreakStart, end: Date.now() }); d.currentBreakStart = null; }); pulse("brkE"); } };
  const [jizoExplained, setJizoExplained] = useState(false);
  useEffect(() => { (async () => { try { const r = await storage.get("jizo-explained"); if (r) setJizoExplained(true); } catch {} })(); }, []);
  const doJz = () => {
    if (!isOn || isBrk || hasOrd) return;
    if (!jizoExplained && !isJz) {
      setPopup({
        msg: "「地蔵」とは？\n\n現在の場所に停車して\n注文を待っている時間を記録します。\n\n受注が入ると自動で解除されます。",
        onConfirm: () => {
          setJizoExplained(true);
          try { storage.set("jizo-explained", "1"); } catch {}
          update(d => { d.currentJizoStart = Date.now(); });
          setPopup(null);
        }
      });
      return;
    }
    if (isJz) update(d => { d.jizoSessions.push({ start: d.currentJizoStart, end: Date.now() }); d.currentJizoStart = null; });
    else update(d => { d.currentJizoStart = Date.now(); });
  };
  const doOrd = () => { if (!isOn || isBrk || hasOrd) return; if (isJz) update(d => { d.jizoSessions.push({ start: d.currentJizoStart, end: Date.now() }); d.currentJizoStart = null; }); update(d => { d.currentOrderTime = Date.now(); }); getPos().then(p => { if (p) { update(d => { d.currentOrderPos = p; }); fetchWeather(p.lat, p.lng).then(w => { if (w) update(d => { d.currentOrderWeather = w; }); }); } }); pulse("order"); };
  const doCmp = () => { if (!hasOrd) return; setRwCo(null); setRwAmt(""); setRwInc(""); setRwField("reward"); setRwType("single"); setRwRating(null); setScreen("reward"); pulse("complete"); };
  const doRwOk = async () => {
    if (!rwCo || !rwAmt) return;
    const rew = parseInt(rwAmt, 10) || 0;
    const inc = parseInt(rwInc, 10) || 0;
    // Auto-rating: compare reward to rolling average
    const avgUnit = delCnt > 0 ? Math.round(totRew / delCnt) : 500;
    let autoRating = "normal";
    if (rew >= avgUnit * 1.2) autoRating = "good";
    else if (rew <= avgUnit * 0.8) autoRating = "bad";
    const finalRating = rwRating || autoRating; // manual override or auto
    const endPos = await getPos();
    update(d => {
      const sp = d.currentOrderPos || null;
      const aw = d.currentOrderWeather || null;
      d.deliveries.push({
        orderTime: d.currentOrderTime, completeTime: Date.now(), company: rwCo,
        reward: rew, incentive: inc, orderType: rwType, cancelled: false,
        rating: finalRating,
        startLat: sp?.lat || null, startLng: sp?.lng || null,
        endLat: endPos?.lat || null, endLng: endPos?.lng || null,
        apiWeather: aw,
        areaName: null,
      });
      d.currentOrderTime = null;
      d.currentOrderPos = null;
      d.currentOrderWeather = null;
    });
    // Background geocode for area name
    if (endPos?.lat && endPos?.lng) {
      reverseGeocode(endPos.lat, endPos.lng).then(name => {
        if (name) update(d => { const last = d.deliveries[d.deliveries.length - 1]; if (last && !last.areaName) last.areaName = name; });
      });
    }
    setScreen("main");

    // ─── Delivery feedback toast ───
    const newDelCnt = delCnt + (rwType === "double" ? 2 : rwType === "triple" ? 3 : 1);
    const elapsed = data.currentOrderTime ? Date.now() - data.currentOrderTime : 0;
    const elMin = Math.round(elapsed / 60000);
    const avgUnit2 = delCnt > 0 ? Math.round(totRew / delCnt) : 500;
    const diff = rew - avgUnit2;
    // Choose feedback type
    let fb = null;
    if (rwType === "double" || rwType === "triple") {
      fb = { icon: "💰", msg: `${rwType === "double" ? "ダブル" : "トリプル"}成功！ +¥${rew.toLocaleString()}`, detail: `${elMin}分で完了`, color: "#A78BFA" };
    } else if (elMin > 0 && elMin <= 10) {
      fb = { icon: "⚡", msg: `高速配達！ ${elMin}分`, detail: `+¥${rew.toLocaleString()}`, color: "#FACC15" };
    } else if (diff > 0 && avgUnit2 > 0) {
      fb = { icon: "🎯", msg: `いいペース！ +¥${rew.toLocaleString()}`, detail: `平均より ¥${diff.toLocaleString()} 高い配達`, color: "#22C55E" };
    }
    // Consecutive deliveries without break
    const recentDels = data.deliveries.filter(d => !d.cancelled);
    if (recentDels.length >= 2) {
      const lastComplete = recentDels[recentDels.length - 1]?.completeTime;
      const lastBreak = data.breaks.length > 0 ? data.breaks[data.breaks.length - 1].end : 0;
      const consec = recentDels.filter(d => d.completeTime > (lastBreak || 0)).length + 1;
      if (consec >= 5 && !fb) fb = { icon: "🔥", msg: `連続${consec}件！`, detail: "集中力が続いています", color: "#F59E0B" };
    }
    if (fb) { setDeliveryFeedback(fb); setTimeout(() => setDeliveryFeedback(null), 2500); }

    // ─── Milestone check ───
    const cumAfter = cumDels + (rwType === "double" ? 2 : rwType === "triple" ? 3 : 1);
    const cumRevAfter = cumRev + rew;
    const todayRevAfter = totRew + rew;
    const milestones = [
      { check: cumAfter, thresholds: [50, 100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000], icon: "🎉", prefix: "累計", suffix: "件達成！" },
    ];
    const revMilestones = [100000, 200000, 300000, 500000, 1000000];
    const dailyRevMilestones = [5000, 10000, 15000, 20000, 30000];
    let ms2 = null;
    // Delivery count milestones
    for (const t of [50, 100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000]) {
      if (cumAfter >= t && cumDels < t) { ms2 = { icon: "🎉", title: `${t}件 達成！`, sub: `累計配達件数が${t}件を突破しました`, stat: `累計売上 ¥${cumRevAfter.toLocaleString()}` }; break; }
    }
    // Cumulative revenue milestones
    if (!ms2) {
      for (const t of revMilestones) {
        if (cumRevAfter >= t && cumRev < t) { ms2 = { icon: "💰", title: `累計¥${(t/10000).toLocaleString()}万 突破！`, sub: `累計売上が¥${t.toLocaleString()}を超えました`, stat: `累計${cumAfter}件の配達` }; break; }
      }
    }
    // Daily revenue milestones
    if (!ms2) {
      for (const t of dailyRevMilestones) {
        if (todayRevAfter >= t && totRew < t) { ms2 = { icon: "🏅", title: `本日¥${t.toLocaleString()} 突破！`, sub: `今日の売上が¥${t.toLocaleString()}を超えました`, stat: `${newDelCnt}件の配達` }; break; }
      }
    }
    if (ms2) setTimeout(() => setMilestone(ms2), 600); // delay to let screen transition
  };
  const doCkCan = () => { if (!rwCo) { setPopup({ msg: "会社を選択してください", onConfirm: () => setPopup(null) }); return; } setPopup({ msg: "調理待ちキャンセルとして記録？", onConfirm: async () => { const endPos = await getPos(); update(d => { const sp = d.currentOrderPos || null; const aw = d.currentOrderWeather || null; d.deliveries.push({ orderTime: d.currentOrderTime, completeTime: Date.now(), company: rwCo, reward: 0, incentive: 0, orderType: "single", cancelled: true, rating: null, startLat: sp?.lat || null, startLng: sp?.lng || null, endLat: endPos?.lat || null, endLng: endPos?.lng || null, apiWeather: aw }); d.currentOrderTime = null; d.currentOrderPos = null; d.currentOrderWeather = null; }); setPopup(null); setScreen("main"); } }); };
  const npF = (k, s) => { if (k === "⌫") s(p => p.slice(0, -1)); else s(p => (p + k).length > 7 ? p : p + k); };
  const openDI = () => { setDiCo(null); setDiAmt(""); setScreen("di"); };
  const doDIOk = () => { if (!diCo || !diAmt) return; update(d => { d.dailyIncentives.push({ company: diCo, amount: parseInt(diAmt, 10) || 0, time: Date.now() }); }); setScreen("main"); };
  const doReset = () => { setMenu(false); setPopup({ msg: "本日のデータをリセットしますか？", onConfirm: () => { setData(newDay()); setPopup(null); } }); };
  const wSel = (w) => {
    update(d => { d.weather = w; d.currentSessionStart = Date.now(); });
    setWeatherPop(false);
    pulse("online");
    // Weather chance for the selected weather
    const wxDaysW = allLogs.filter(l => l.weather === w);
    const otherDaysW = allLogs.filter(l => l.weather && l.weather !== w);
    if (wxDaysW.length >= 3 && otherDaysW.length >= 3) {
      const calcHr = (logs) => { let r2 = 0, m2 = 0; logs.forEach(l => { r2 += (l.deliveries || []).filter(d2 => !d2.cancelled).reduce((s, d2) => s + (d2.reward || 0), 0); m2 += (l.sessions || []).reduce((s, x) => s + ((x.end || 0) - x.start), 0) - (l.breaks || []).reduce((s, b) => s + ((b.end || 0) - (b.start || 0)), 0); }); return m2 > 0 ? Math.round(r2 / (m2 / 3600000)) : 0; };
      const wHr = calcHr(wxDaysW), oHr = calcHr(otherDaysW), df = wHr - oHr;
      const wInfo = WEATHER.find(wx2 => wx2.id === w);
      if (Math.abs(df) >= 50 && wHr > 0) {
        setWeatherChance({ icon: wInfo?.icon || "", label: wInfo?.label || "", diff: df, wxHr: wHr });
        setTimeout(() => setWeatherChance(null), 4500);
        if (dailyTarget > 0) {
          setTimeout(() => {
            const estDels2 = Math.ceil(todayRemaining / (totRew > 0 && delCnt > 0 ? Math.round(totRew / delCnt) : 500));
            setTodayGuide({ target: dailyTarget, remaining: todayRemaining, estDels: estDels2 });
            setTimeout(() => setTodayGuide(null), 4000);
          }, 5000);
        }
        return;
      }
    }
    if (dailyTarget > 0) {
      const estDels = dailyTarget > 0 ? Math.ceil(todayRemaining / (totRew > 0 && delCnt > 0 ? Math.round(totRew / delCnt) : 500)) : 0;
      setTodayGuide({ target: dailyTarget, remaining: todayRemaining, estDels });
      setTimeout(() => setTodayGuide(null), 4000);
    }
  };
  const openEdit = (i) => { setEditIdx(i); setEditData({ ...data.deliveries[i] }); setEditField(null); setScreen("edit"); };
  const svEdit = () => { if (editIdx === null) return; update(d => { d.deliveries[editIdx] = { ...editData }; }); setScreen("main"); };
  const delEdit = () => { setPopup({ msg: "この記録を削除？", onConfirm: () => { update(d => { d.deliveries.splice(editIdx, 1); }); setPopup(null); setScreen("main"); } }); };
  const doGoalSave = () => { const a = parseInt(goalInput, 10) || 0; setGoal(a); sg({ amount: a }); setGoalModal(false); };

  if (loading) return <div style={{ fontFamily: FN, background: T.bg, color: T.textDim, height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>読み込み中...</div>;

  // ─── Shared ───
  const ov = { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: T.overlay, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", zIndex: 100, paddingTop: 32, overflowY: "auto", fontFamily: FN, color: T.text };
  const canB = { background: "none", border: "none", color: T.textMuted, fontSize: sz(13), cursor: "pointer", marginTop: 10, fontFamily: FN };
  const cB = (bg, sel) => ({ width: 58, height: 58, borderRadius: 13, border: sel ? `3px solid ${T.text}` : "2px solid transparent", background: sel ? (T === LIGHT ? "#F0F0F0" : "#111") : bg, color: "#FFF", fontSize: sz(24), fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontFamily: FN, boxShadow: sel ? `0 0 12px ${bg}66` : "none" });
  const npG = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, width: "100%", maxWidth: 270, marginBottom: 12 };
  const npK = { height: 50, borderRadius: 10, border: `1px solid ${T.borderLight}`, background: T.card, color: T.text, fontSize: sz(20), fontWeight: 600, cursor: "pointer", fontFamily: FN };
  const okBt = (dis) => ({ width: "100%", maxWidth: 270, height: 50, borderRadius: 12, border: "none", background: dis ? T.barBg : T.accent, color: dis ? T.textDim : "#000", fontSize: sz(16), fontWeight: 800, cursor: dis ? "default" : "pointer", fontFamily: FN, letterSpacing: 2 });
  const btn = (bg, dis, h = BH) => ({ flex: 1, height: h, borderRadius: 12, border: "none", background: dis ? T.card : bg, color: dis ? T.textFaint : "#FFF", fontSize: h > BH ? 18 : 15, fontWeight: 700, cursor: dis ? "default" : "pointer", fontFamily: FN, opacity: dis ? 0.4 : 1, letterSpacing: h > BH ? 2 : 0.5 });

  // ─── Popups ───
  const PopupEl = popup && (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: T.overlayHard, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, fontFamily: FN }}>
      <div style={{ background: T.card, borderRadius: 14, padding: "20px 24px", textAlign: "center", maxWidth: 300, width: "85%", border: `1px solid ${T.border}` }}>
        <div style={{ fontSize: sz(14), fontWeight: 600, marginBottom: 16, color: T.text, whiteSpace: "pre-line", lineHeight: 1.6 }}>{popup.msg}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ flex: 1, height: 44, borderRadius: 9, border: `1px solid ${T.borderLight}`, background: T.inputBg, color: T.textSub, fontSize: sz(14), cursor: "pointer", fontFamily: FN }} onClick={() => setPopup(null)}>いいえ</button>
          <button style={{ flex: 1, height: 44, borderRadius: 9, border: "none", background: T.accent, color: "#000", fontSize: sz(14), fontWeight: 700, cursor: "pointer", fontFamily: FN }} onClick={popup.onConfirm}>はい</button>
        </div>
      </div>
    </div>
  );
  const WeatherEl = weatherPop && (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: T.overlayHard, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, fontFamily: FN }}>
      <div style={{ background: T.card, borderRadius: 16, padding: "24px 20px", textAlign: "center", maxWidth: 320, width: "90%", border: `1px solid ${T.border}` }}>
        <div style={{ fontSize: sz(15), fontWeight: 600, marginBottom: 6, color: T.accent }}>天候が選択されていません</div>
        <div style={{ fontSize: sz(12), color: T.textMuted, marginBottom: 18 }}>選択するとオンラインを開始します</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          {WEATHER.map(w => (<button key={w.id} onClick={() => wSel(w.id)} style={{ width: 56, height: 56, borderRadius: 12, border: `2px solid ${T.borderLight}`, background: T.inputBg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><span style={{ fontSize: sz(20) }}>{w.icon}</span><span style={{ fontSize: sz(8), color: T.textMuted, fontFamily: FN }}>{w.label}</span></button>))}
        </div>
        <button onClick={() => setWeatherPop(false)} style={{ ...canB, marginTop: 16 }}>キャンセル</button>
      </div>
    </div>
  );
  const GoalEl = goalModal && (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: T.overlayHard, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, fontFamily: FN }}>
      <div style={{ background: T.card, borderRadius: 16, padding: "24px 20px", textAlign: "center", maxWidth: 320, width: "90%", border: `1px solid ${T.border}` }}>
        <div style={{ fontSize: sz(14), fontWeight: 600, marginBottom: 4, color: T.text }}>月収目標を設定</div>
        <div style={{ fontSize: sz(11), color: T.textMuted, marginBottom: 16 }}>今月の目標金額を入力</div>
        <div style={{ fontSize: sz(32), fontWeight: 800, color: T.accent, marginBottom: 16, minHeight: 40 }}>{goalInput ? `¥${Number(goalInput).toLocaleString()}` : <span style={{ color: T.textFaint }}>¥0</span>}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, maxWidth: 240, margin: "0 auto 14px" }}>
          {NP.map(k => <button key={k} onClick={() => npF(k, setGoalInput)} style={{ height: 44, borderRadius: 9, border: `1px solid ${T.borderLight}`, background: T.inputBg, color: T.text, fontSize: sz(18), fontWeight: 600, cursor: "pointer", fontFamily: FN }}>{k}</button>)}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => { setGoalModal(false); setGoalInput(""); }} style={{ flex: 1, height: 44, borderRadius: 9, border: `1px solid ${T.borderLight}`, background: T.inputBg, color: T.textSub, fontSize: sz(14), cursor: "pointer", fontFamily: FN }}>キャンセル</button>
          <button onClick={doGoalSave} style={{ flex: 1, height: 44, borderRadius: 9, border: "none", background: T.accent, color: "#000", fontSize: sz(14), fontWeight: 700, cursor: "pointer", fontFamily: FN }}>保存</button>
        </div>
      </div>
    </div>
  );

  // ─── Menu overlay ───
  const anaItems = [
    { key: "daily", label: "📋 デイリーレポート", free: true },
    { key: "heatmap", label: "📍 注文ヒートマップ", free: true },
    { key: "hourly", label: "⏰ 時間帯分析", free: true },
    { key: "area", label: "🗺️ エリア別分析", free: false },
    { key: "condition", label: "🌡️ 気象コンディション分析", free: false },
    { key: "weekday", label: "📅 曜日分析", free: true },
    { key: "company", label: "🏢 会社別分析", free: true },
    { key: "weather", label: "🌤️ 天候分析", free: false },
    { key: "trends", label: "📈 推移（週次/月次）", free: false },
    { key: "unitprice", label: "💰 平均単価", free: true },
  ];
  const MenuEl = menu && (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 200 }} onClick={() => { setMenu(false); setAnaOpen(false); }}>
      <div onClick={e => e.stopPropagation()} style={{ position: "absolute", top: 0, right: 0, width: 240, height: "100%", background: T.menuBg, borderLeft: `1px solid ${T.border}`, padding: "60px 0 20px", boxShadow: "-4px 0 24px #0004", overflowY: "auto" }}>
        {/* Analysis accordion */}
        <button onClick={() => setAnaOpen(!anaOpen)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "16px 24px", background: "none", border: "none", borderBottom: `1px solid ${T.border}`, color: T.text, fontSize: sz(15), fontWeight: 600, textAlign: "left", cursor: "pointer", fontFamily: FN }}>
          <span>📊  分析</span><span style={{ fontSize: sz(12), color: T.textDim, transition: "transform 0.2s", transform: anaOpen ? "rotate(180deg)" : "rotate(0)" }}>▼</span>
        </button>
        {anaOpen && anaItems.map(item => (
          <button key={item.key} onClick={() => { setMenu(false); setAnaOpen(false); setScreen(`ana_${item.key}`); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "12px 24px 12px 40px", background: "none", border: "none", borderBottom: `1px solid ${T.border}`, color: T.text, fontSize: sz(13), fontWeight: 500, textAlign: "left", cursor: "pointer", fontFamily: FN }}>
            <span>{item.label}</span>
            {!item.free && !isPremium && <span style={{ fontSize: sz(9), color: T.purple, background: `${T.purple}18`, padding: "1px 6px", borderRadius: 4, marginLeft: "auto" }}>PRO</span>}
          </button>
        ))}
        {/* Other menu items */}
        {[
          { label: "🎯  月間目標", fn: () => { setMenu(false); setGoalInput(goal ? String(goal) : ""); setGoalModal(true); } },
          { label: "⚙️  設定", fn: () => { setMenu(false); setScreen("settings"); } },
          { label: "🔄  リセット", fn: doReset, danger: true },
        ].map((item, i) => (
          <button key={i} onClick={item.fn} style={{ display: "block", width: "100%", padding: "16px 24px", background: "none", border: "none", borderBottom: `1px solid ${T.border}`, color: item.danger ? "#EF4444" : T.text, fontSize: sz(15), fontWeight: 600, textAlign: "left", cursor: "pointer", fontFamily: FN }}>{item.label}</button>
        ))}
      </div>
    </div>
  );

  // ─── Tutorial ───
  const tutSteps = [
    { title: "ようこそ！", desc: "配達ログは、配達の稼働状況を\n記録・分析するアプリです。\n\n簡単な操作で毎日の記録を残せます。" },
    { title: "① 天候を選ぶ", desc: "まず今日の天候を選びます。\n天候別の売上分析に使われます。" },
    { title: "② オンラインを押す", desc: "配達アプリをオンにしたら\nこのボタンを押します。\n稼働時間の記録が始まります。" },
    { title: "③ 受注 → 配達完了", desc: "注文が入ったら「受注」を押します。\n配達が終わったら「配達完了」を押して\n報酬を入力します。" },
    { title: "④ 分析を見る", desc: "右上の ☰ メニューから「分析」で\n時給・会社別・時間帯別の\n成績が確認できます。" },
  ];
  const TutorialEl = tutorial && (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: T.overlayHard, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 400, fontFamily: FN }}>
      <div style={{ background: T.card, borderRadius: 18, padding: "28px 24px", textAlign: "center", maxWidth: 320, width: "88%", border: `1px solid ${T.border}` }}>
        <div style={{ fontSize: sz(10), color: T.textDim, marginBottom: 6 }}>{tutStep + 1} / {tutSteps.length}</div>
        <div style={{ fontSize: sz(18), fontWeight: 700, color: T.accent, marginBottom: 12 }}>{tutSteps[tutStep].title}</div>
        <div style={{ fontSize: sz(13), color: T.textSub, lineHeight: 1.7, whiteSpace: "pre-line", marginBottom: 20 }}>{tutSteps[tutStep].desc}</div>
        {/* Progress dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 16 }}>
          {tutSteps.map((_, i) => (
            <div key={i} style={{ width: 8, height: 8, borderRadius: 4, background: i === tutStep ? T.accent : T.barBg }} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {tutStep > 0 && (
            <button onClick={() => setTutStep(tutStep - 1)} style={{ flex: 1, height: 44, borderRadius: 9, border: `1px solid ${T.borderLight}`, background: T.inputBg, color: T.textSub, fontSize: sz(14), cursor: "pointer", fontFamily: FN }}>戻る</button>
          )}
          {tutStep < tutSteps.length - 1 ? (
            <button onClick={() => setTutStep(tutStep + 1)} style={{ flex: 1, height: 44, borderRadius: 9, border: "none", background: T.accent, color: "#000", fontSize: sz(14), fontWeight: 700, cursor: "pointer", fontFamily: FN }}>次へ</button>
          ) : (
            <button onClick={() => { setTutorial(false); try { storage.set("tutorial-done", "1"); } catch {} }} style={{ flex: 1, height: 44, borderRadius: 9, border: "none", background: T.accent, color: "#000", fontSize: sz(14), fontWeight: 700, cursor: "pointer", fontFamily: FN }}>はじめる</button>
          )}
        </div>
        {tutStep === 0 && (
          <button onClick={() => { setTutorial(false); try { storage.set("tutorial-done", "1"); } catch {} }} style={{ background: "none", border: "none", color: T.textDim, fontSize: sz(12), cursor: "pointer", marginTop: 12, fontFamily: FN }}>スキップ</button>
        )}
      </div>
    </div>
  );

  // ═══ REWARD ═══
  if (screen === "reward") {
    const av = rwField === "reward" ? rwAmt : rwInc;
    const st = rwField === "reward" ? setRwAmt : setRwInc;
    return (<div style={ov}>{PopupEl}
      <div style={{ fontSize: sz(13), color: T.textMuted, marginBottom: 12, letterSpacing: 2, fontWeight: 600 }}>報酬入力</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, maxWidth: 270, width: "100%" }}>
        {OT.map(t => (<button key={t.id} onClick={() => setRwType(t.id)} style={{ flex: 1, height: 36, borderRadius: 8, border: rwType === t.id ? `2px solid ${T.accent}` : `1.5px solid ${T.borderLight}`, background: rwType === t.id ? `${T.accent}20` : T.card, color: rwType === t.id ? T.accent : T.textMuted, fontSize: sz(12), fontWeight: 600, cursor: "pointer", fontFamily: FN }}>{t.label}</button>))}
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>{COS.map(c => <button key={c.id} style={cB(c.bg, rwCo === c.id)} onClick={() => setRwCo(c.id)}>{c.letter}</button>)}</div>
      <div style={{ fontSize: sz(11), color: T.textMuted, marginBottom: 14, height: 14 }}>{rwCo ? COS.find(c => c.id === rwCo)?.name : "会社を選択"}</div>
      <div style={{ display: "flex", gap: 0, marginBottom: 10, maxWidth: 270, width: "100%" }}>
        {[{ k: "reward", l: "配達報酬" }, { k: "incentive", l: "インセンティブ" }].map(f => (
          <button key={f.k} onClick={() => setRwField(f.k)} style={{ flex: 1, padding: "7px 0", border: "none", cursor: "pointer", background: rwField === f.k ? (f.k === "reward" ? T.accent : "#7C3AED") : T.inputBg, color: rwField === f.k ? "#FFF" : T.textDim, fontWeight: rwField === f.k ? 700 : 400, fontSize: sz(12), fontFamily: FN, borderRadius: f.k === "reward" ? "9px 0 0 9px" : "0 9px 9px 0" }}>{f.l}</button>
        ))}
      </div>
      <div style={{ fontSize: sz(38), fontWeight: 800, color: rwField === "incentive" ? T.purple : T.text, textAlign: "center", marginBottom: 2, minHeight: 46 }}>{av ? `¥${Number(av).toLocaleString()}` : <span style={{ color: T.textFaint }}>例：650</span>}</div>
      <div style={{ display: "flex", gap: 20, marginBottom: 10 }}>
        <div style={{ textAlign: "center" }}><div style={{ fontSize: sz(9), color: T.textDim }}>報酬</div><div style={{ fontSize: sz(14), fontWeight: 700, color: rwAmt ? T.text : T.textFaint }}>¥{rwAmt ? Number(rwAmt).toLocaleString() : "0"}</div></div>
        <div style={{ textAlign: "center" }}><div style={{ fontSize: sz(9), color: T.textDim }}>インセンティブ</div><div style={{ fontSize: sz(14), fontWeight: 700, color: rwInc ? T.purple : T.textFaint }}>¥{rwInc ? Number(rwInc).toLocaleString() : "0"}</div></div>
      </div>
      <div style={npG}>{NP.map(k => <button key={k} style={npK} onClick={() => npF(k, st)}>{k}</button>)}</div>

      {/* Rating buttons */}
      {(() => {
        const avgU = delCnt > 0 ? Math.round(totRew / delCnt) : 500;
        const curRew = parseInt(rwAmt, 10) || 0;
        const autoR = curRew >= avgU * 1.2 ? "good" : curRew <= avgU * 0.8 ? "bad" : "normal";
        const displayR = rwRating || (rwAmt ? autoR : null);
        const ratings = [
          { id: "good", label: "良い", icon: "🟡", color: "#EAB308" },
          { id: "normal", label: "普通", icon: "⚪", color: T.textMuted },
          { id: "bad", label: "悪い", icon: "🔵", color: "#3B82F6" },
        ];
        return (
          <div style={{ width: "100%", maxWidth: 270, marginBottom: 12 }}>
            <div style={{ fontSize: sz(10), color: T.textDim, marginBottom: 6, textAlign: "center" }}>
              配達評価{!rwRating && rwAmt ? "（自動判定）" : rwRating ? "（手動）" : ""}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {ratings.map(r => {
                const isActive = displayR === r.id;
                const isAuto = !rwRating && rwAmt && autoR === r.id;
                return (
                  <button key={r.id} onClick={() => setRwRating(rwRating === r.id ? null : r.id)} style={{
                    flex: 1, padding: "8px 0", borderRadius: 10,
                    border: isActive ? `2px solid ${r.color}` : `1.5px solid ${T.borderLight}`,
                    background: isActive ? `${r.color}18` : T.card,
                    color: isActive ? r.color : T.textDim,
                    fontSize: sz(12), fontWeight: isActive ? 700 : 400,
                    cursor: "pointer", fontFamily: FN, textAlign: "center",
                    opacity: isAuto && !rwRating ? 0.7 : 1,
                  }}>
                    {r.icon} {r.label}
                  </button>
                );
              })}
            </div>
            {!rwRating && rwAmt && <div style={{ fontSize: sz(9), color: T.textFaint, textAlign: "center", marginTop: 4 }}>タップで手動変更できます</div>}
          </div>
        );
      })()}

      <button style={okBt(!rwCo || !rwAmt)} onClick={doRwOk} disabled={!rwCo || !rwAmt}>OK</button>
      <button onClick={doCkCan} style={{ width: "100%", maxWidth: 270, height: 42, borderRadius: 10, border: "1.5px solid #EF444444", background: T.card, color: "#EF4444", fontSize: sz(13), fontWeight: 600, cursor: "pointer", fontFamily: FN, marginTop: 10 }}>調理待ちキャンセル</button>
      <button style={canB} onClick={() => setScreen("main")}>戻る</button>
    </div>);
  }

  // ═══ DAILY INC ═══
  if (screen === "di") return (<div style={ov}>
    <div style={{ fontSize: sz(13), color: T.textMuted, marginBottom: 10, letterSpacing: 2, fontWeight: 600 }}>日次インセンティブ</div>
    <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>{COS.map(c => <button key={c.id} style={cB(c.bg, diCo === c.id)} onClick={() => setDiCo(c.id)}>{c.letter}</button>)}</div>
    <div style={{ fontSize: sz(38), fontWeight: 800, color: T.purple, textAlign: "center", marginBottom: 14, minHeight: 46 }}>{diAmt ? `¥${Number(diAmt).toLocaleString()}` : <span style={{ color: T.textFaint }}>金額を入力</span>}</div>
    <div style={npG}>{NP.map(k => <button key={k} style={npK} onClick={() => npF(k, setDiAmt)}>{k}</button>)}</div>
    <button style={okBt(!diCo || !diAmt)} onClick={doDIOk} disabled={!diCo || !diAmt}>OK</button>
    <button style={canB} onClick={() => setScreen("main")}>戻る</button>
  </div>);

  // ═══ EDIT ═══
  if (screen === "edit" && editData) {
    const c = COS.find(cc => cc.id === editData.company);
    if (editField) {
      const ev = editField === "reward" ? String(editData.reward || "") : String(editData.incentive || "");
      const enp = (k) => { const cur = ev; if (k === "⌫") { const nv = cur.slice(0, -1); editField === "reward" ? setEditData({ ...editData, reward: parseInt(nv, 10) || 0 }) : setEditData({ ...editData, incentive: parseInt(nv, 10) || 0 }); } else { const nv = cur === "0" ? k : cur + k; if (nv.length <= 7) editField === "reward" ? setEditData({ ...editData, reward: parseInt(nv, 10) || 0 }) : setEditData({ ...editData, incentive: parseInt(nv, 10) || 0 }); } };
      return (<div style={ov}><div style={{ fontSize: sz(12), color: T.textMuted, marginBottom: 12 }}>{editField === "reward" ? "配達報酬を編集" : "インセンティブを編集"}</div>
        <div style={{ fontSize: sz(38), fontWeight: 800, color: editField === "incentive" ? T.purple : T.accent, textAlign: "center", marginBottom: 14 }}>¥{(editField === "reward" ? editData.reward : editData.incentive || 0).toLocaleString()}</div>
        <div style={npG}>{NP.map(k => <button key={k} style={npK} onClick={() => enp(k)}>{k}</button>)}</div>
        <button style={okBt(false)} onClick={() => setEditField(null)}>決定</button></div>);
    }
    return (<div style={ov}>{PopupEl}
      <div style={{ fontSize: sz(13), color: T.textMuted, marginBottom: 16, letterSpacing: 2, fontWeight: 600 }}>配達詳細・編集</div>
      <div style={{ width: "100%", maxWidth: 300, padding: "0 10px" }}>
        <div style={{ background: T.card, borderRadius: 12, padding: 16, marginBottom: 12, border: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: c?.bg || "#333", color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: sz(20), fontWeight: 800 }}>{c?.letter}</div>
            <div><div style={{ fontSize: sz(14), fontWeight: 700, color: T.text }}>{c?.name}</div><div style={{ fontSize: sz(11), color: T.textMuted }}>{OT.find(o => o.id === editData.orderType)?.label}{editData.cancelled && <span style={{ color: "#EF4444" }}> キャンセル</span>}</div></div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={{ fontSize: sz(11), color: T.textMuted }}>時間</span><span style={{ fontSize: sz(13), fontWeight: 600, color: T.text }}>{ft(editData.orderTime)}〜{ft(editData.completeTime)}</span></div>
          <div onClick={() => setEditField("reward")} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: `1px solid ${T.border}`, cursor: "pointer" }}><span style={{ fontSize: sz(12), color: T.textMuted }}>配達報酬</span><span style={{ fontSize: sz(16), fontWeight: 700, color: T.accent }}>¥{(editData.reward || 0).toLocaleString()} ✎</span></div>
          <div onClick={() => setEditField("incentive")} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: `1px solid ${T.border}`, cursor: "pointer" }}><span style={{ fontSize: sz(12), color: T.textMuted }}>インセンティブ</span><span style={{ fontSize: sz(16), fontWeight: 700, color: T.purple }}>¥{(editData.incentive || 0).toLocaleString()} ✎</span></div>
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10 }}><div style={{ fontSize: sz(11), color: T.textMuted, marginBottom: 6 }}>会社</div><div style={{ display: "flex", gap: 8 }}>{COS.map(cc => (<button key={cc.id} onClick={() => setEditData({ ...editData, company: cc.id })} style={{ width: 40, height: 40, borderRadius: 10, border: editData.company === cc.id ? `2px solid ${T.text}` : `1.5px solid ${T.borderLight}`, background: editData.company === cc.id ? T.inputBg : cc.bg, color: "#FFF", fontSize: sz(16), fontWeight: 800, cursor: "pointer", fontFamily: FN }}>{cc.letter}</button>))}</div></div>
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10, marginTop: 10 }}><div style={{ fontSize: sz(11), color: T.textMuted, marginBottom: 6 }}>タイプ</div><div style={{ display: "flex", gap: 6 }}>{OT.map(ot => (<button key={ot.id} onClick={() => setEditData({ ...editData, orderType: ot.id })} style={{ flex: 1, padding: "6px 0", borderRadius: 7, border: editData.orderType === ot.id ? `2px solid ${T.accent}` : `1.5px solid ${T.borderLight}`, background: editData.orderType === ot.id ? `${T.accent}20` : T.card, color: editData.orderType === ot.id ? T.accent : T.textMuted, fontSize: sz(11), fontWeight: 600, cursor: "pointer", fontFamily: FN }}>{ot.label}</button>))}</div></div>
          {/* Rating */}
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10, marginTop: 10 }}>
            <div style={{ fontSize: sz(11), color: T.textMuted, marginBottom: 6 }}>配達評価</div>
            <div style={{ display: "flex", gap: 6 }}>
              {[{ id: "good", label: "🟡 良い", color: "#EAB308" }, { id: "normal", label: "⚪ 普通", color: T.textMuted }, { id: "bad", label: "🔵 悪い", color: "#3B82F6" }].map(r => (
                <button key={r.id} onClick={() => setEditData({ ...editData, rating: r.id })} style={{ flex: 1, padding: "6px 0", borderRadius: 7, border: editData.rating === r.id ? `2px solid ${r.color}` : `1.5px solid ${T.borderLight}`, background: editData.rating === r.id ? `${r.color}18` : T.card, color: editData.rating === r.id ? r.color : T.textDim, fontSize: sz(11), fontWeight: 600, cursor: "pointer", fontFamily: FN }}>{r.label}</button>
              ))}
            </div>
          </div>
          {/* API Weather */}
          {editData.apiWeather && (
            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10, marginTop: 10 }}>
              <div style={{ fontSize: sz(11), color: T.textMuted, marginBottom: 6 }}>取得天候データ</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
                <div style={{ background: T.barBg, borderRadius: 8, padding: "8px 4px", textAlign: "center" }}>
                  <div style={{ fontSize: sz(9), color: T.textDim }}>天候</div>
                  <div style={{ fontSize: sz(15), fontWeight: 700, color: T.text }}>{WEATHER.find(w => w.id === editData.apiWeather.weatherId)?.icon || "?"}</div>
                </div>
                <div style={{ background: T.barBg, borderRadius: 8, padding: "8px 4px", textAlign: "center" }}>
                  <div style={{ fontSize: sz(9), color: T.textDim }}>気温</div>
                  <div style={{ fontSize: sz(14), fontWeight: 700, color: T.text }}>{editData.apiWeather.temperature}℃</div>
                </div>
                <div style={{ background: T.barBg, borderRadius: 8, padding: "8px 4px", textAlign: "center" }}>
                  <div style={{ fontSize: sz(9), color: T.textDim }}>風速</div>
                  <div style={{ fontSize: sz(14), fontWeight: 700, color: T.text }}>{editData.apiWeather.windspeed}<span style={{ fontSize: sz(8) }}>km/h</span></div>
                </div>
                <div style={{ background: T.barBg, borderRadius: 8, padding: "8px 4px", textAlign: "center" }}>
                  <div style={{ fontSize: sz(9), color: T.textDim }}>雨量</div>
                  <div style={{ fontSize: sz(14), fontWeight: 700, color: T.text }}>{editData.apiWeather.precipitation != null ? editData.apiWeather.precipitation : "-"}<span style={{ fontSize: sz(8) }}>mm</span></div>
                </div>
              </div>
              <div style={{ fontSize: sz(9), color: T.textFaint, marginTop: 4, textAlign: "right" }}>WMOコード: {editData.apiWeather.weathercode}</div>
            </div>
          )}
        </div>
        <button onClick={svEdit} style={{ ...okBt(false), marginBottom: 8 }}>保存</button>
        <button onClick={delEdit} style={{ width: "100%", maxWidth: 270, height: 42, borderRadius: 10, border: "1.5px solid #EF444444", background: T.card, color: "#EF4444", fontSize: sz(13), fontWeight: 600, cursor: "pointer", fontFamily: FN }}>削除</button>
        <button style={canB} onClick={() => setScreen("main")}>戻る</button>
      </div>
    </div>);
  }

  // ═══ SETTINGS ═══
  if (screen === "settings") {
    const row = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: `1px solid ${T.border}` };
    const rowLast = { ...row, borderBottom: "none" };
    return (
      <div style={{ fontFamily: FN, background: T.bg, minHeight: "100vh", maxWidth: 430, margin: "0 auto", color: T.text, padding: "16px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: sz(18), fontWeight: 700 }}>⚙️ 設定</div>
          <button onClick={() => setScreen("main")} style={{ background: "none", border: `1px solid ${T.borderLight}`, borderRadius: 7, color: T.textSub, padding: "4px 12px", fontSize: sz(12), cursor: "pointer", fontFamily: FN }}>戻る</button>
        </div>
        {/* 表示設定 */}
        <div style={{ background: T.card, borderRadius: 14, padding: "4px 18px", border: `1px solid ${T.border}`, marginBottom: 16 }}>
          <div style={{ fontSize: sz(12), color: T.textDim, fontWeight: 600, padding: "12px 0 4px", letterSpacing: 1 }}>表示</div>
          <div style={row}>
            <div><div style={{ fontSize: sz(14), fontWeight: 600 }}>ダークモード</div><div style={{ fontSize: sz(11), color: T.textDim }}>画面の配色を切り替え</div></div>
            <Toggle on={settings.theme === "dark"} onToggle={() => updateSettings({ theme: settings.theme === "dark" ? "light" : "dark" })} T={T} />
          </div>
          <div style={rowLast}>
            <div><div style={{ fontSize: sz(14), fontWeight: 600 }}>文字サイズ（大きめ）</div><div style={{ fontSize: sz(11), color: T.textDim }}>全体の文字を大きく表示</div></div>
            <Toggle on={settings.largeFont} onToggle={() => updateSettings({ largeFont: !settings.largeFont })} T={T} />
          </div>
        </div>
        {/* インセンティブ設定 */}
        <div style={{ background: T.card, borderRadius: 14, padding: "4px 18px", border: `1px solid ${T.border}`, marginBottom: 16 }}>
          <div style={{ fontSize: sz(12), color: T.textDim, fontWeight: 600, padding: "12px 0 4px", letterSpacing: 1 }}>インセンティブ</div>
          <div style={row}>
            <div style={{ flex: 1, marginRight: 12 }}><div style={{ fontSize: sz(14), fontWeight: 600 }}>配達報酬に含める</div><div style={{ fontSize: sz(11), color: T.textDim, lineHeight: 1.4 }}>メイン画面の「配達報酬」の金額に<br/>インセンティブを合算して表示</div></div>
            <Toggle on={settings.incInReward} onToggle={() => updateSettings({ incInReward: !settings.incInReward })} T={T} />
          </div>
          <div style={rowLast}>
            <div style={{ flex: 1, marginRight: 12 }}><div style={{ fontSize: sz(14), fontWeight: 600 }}>月間目標に含める</div><div style={{ fontSize: sz(11), color: T.textDim, lineHeight: 1.4 }}>月間目標の達成度の計算に<br/>インセンティブを含める</div></div>
            <Toggle on={settings.incInGoal} onToggle={() => updateSettings({ incInGoal: !settings.incInGoal })} T={T} />
          </div>
        </div>
        {/* Dev tools */}
        <div style={{ background: T.card, borderRadius: 14, padding: "4px 18px", border: `1px solid ${T.border}`, marginBottom: 16 }}>
          <div style={{ fontSize: sz(12), color: T.textDim, fontWeight: 600, padding: "12px 0 4px", letterSpacing: 1 }}>データ</div>
          <div style={{ padding: "10px 0" }}>
            <button onClick={async (e) => {
              const btn = e.currentTarget;
              btn.textContent = "生成中...";
              btn.disabled = true;
              try {
                const demo = generateDemoLogs();
                setAllLogs(demo.logs);
                setData(demo.todayLog);
                setGoal(300000);
                setPopup({ msg: "6ヶ月分のデモデータを\n生成しました\n\nメニュー → 分析で確認できます", onConfirm: () => setPopup(null) });
              } catch (err) { console.error(err); }
              btn.textContent = "デモデータを生成（6ヶ月分）";
              btn.disabled = false;
            }} style={{ width: "100%", height: 48, borderRadius: 10, border: "none", background: "#2563EB", color: "#FFF", fontSize: sz(14), fontWeight: 700, cursor: "pointer", fontFamily: FN, letterSpacing: 1 }}>
              デモデータを生成（6ヶ月分）
            </button>
          </div>
        </div>
        <div style={{ fontSize: sz(11), color: T.textFaint, textAlign: "center", marginTop: 30 }}>配達ログ v1.0</div>
      </div>
    );
  }

  // ═══ ANALYSIS SHARED DATA ═══
  const anaScreen = screen.startsWith("ana_") ? screen.replace("ana_", "") : null;
  const anaAll = [...allLogs, data];
  const anaAD = anaAll.flatMap(l => (l.deliveries || []).filter(d => !d.cancelled));
  const anaADI = anaAll.flatMap(l => l.dailyIncentives || []);
  const anaTD = anaAll.filter(l => l.sessions?.length > 0 || l.currentSessionStart || l.onlineStart).length || 1;
  const anaTR = anaAD.reduce((s, d) => s + (d.reward || 0), 0);
  const anaTI = anaAD.reduce((s, d) => s + (d.incentive || 0), 0) + anaADI.reduce((s, d) => s + (d.amount || 0), 0);
  const anaTW = anaAll.reduce((sum, l) => { const ses = (l.sessions || []).reduce((s, x) => s + ((x.end || Date.now()) - x.start), 0) + (l.currentSessionStart ? Date.now() - l.currentSessionStart : 0); const old = l.onlineStart ? ((l.onlineEnd || Date.now()) - l.onlineStart) : 0; const brk = (l.breaks || []).reduce((bs, b) => bs + (b.end && b.start ? b.end - b.start : 0), 0); return sum + Math.max(0, (ses || old) - brk); }, 0);

  // ─── Premium blur overlay ───
  const PremiumBlur = ({ children }) => (
    <div style={{ position: "relative" }}>
      <div style={{ filter: isPremium ? "none" : "blur(3px)", pointerEvents: isPremium ? "auto" : "none" }}>{children}</div>
      {!isPremium && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: `${T.bg}88`, borderRadius: 12 }}>
          <div style={{ fontSize: sz(14), fontWeight: 700, color: T.purple, marginBottom: 4 }}>プレミアムで解放</div>
          <div style={{ fontSize: sz(11), color: T.textDim }}>詳細分析が利用できます</div>
        </div>
      )}
    </div>
  );

  // Analysis page wrapper
  const AnaPage = ({ title, children, onClick }) => (
    <div onClick={onClick} style={{ background: T.bg, minHeight: "100vh", padding: "14px 16px", maxWidth: 430, margin: "0 auto", fontFamily: FN, color: T.text, overflowY: "auto", height: "100vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: sz(17), fontWeight: 700 }}>{title}</div>
        <button style={{ background: "none", border: `1px solid ${T.borderLight}`, borderRadius: 7, color: T.textSub, padding: "4px 10px", fontSize: sz(12), cursor: "pointer", fontFamily: FN }} onClick={() => setScreen("main")}>戻る</button>
      </div>
      {children}
    </div>
  );
  const aC = { background: T.card, borderRadius: 12, padding: 14, marginBottom: 10, border: `1px solid ${T.border}` };
  const aT2 = { fontSize: sz(12), color: T.textMuted, marginBottom: 8, fontWeight: 600 };
  const CHART_COLORS = ["#16A34A", "#DC2626", "#EA580C", "#2563EB"];
  const todayDate = tds();

  // ═══ DAILY REPORT (FREE) ═══
  if (anaScreen === "daily") {
    const todayDels = data.deliveries.filter(d => !d.cancelled);
    const todayCnt = todayDels.reduce((s, d) => s + dc(d), 0);
    const todayRev = todayDels.reduce((s, d) => s + (d.reward || 0), 0);
    const todayInc = todayDels.reduce((s, d) => s + (d.incentive || 0), 0) + data.dailyIncentives.reduce((s, d) => s + (d.amount || 0), 0);
    const todayHB = wkMs > 0 ? Math.round(todayRev / (wkMs / 3600000)) : 0;
    const todayHA = wkMs > 0 ? Math.round((todayRev + todayInc) / (wkMs / 3600000)) : 0;
    // Today hourly bar data
    const todayHourly = [
      { name: "0-3", min: 0, max: 3 }, { name: "3-6", min: 3, max: 6 }, { name: "6-9", min: 6, max: 9 }, { name: "9-12", min: 9, max: 12 },
      { name: "12-15", min: 12, max: 15 }, { name: "15-18", min: 15, max: 18 }, { name: "18-21", min: 18, max: 21 }, { name: "21-24", min: 21, max: 24 },
    ].map(b => {
      const ds = todayDels.filter(d => { if (!d.orderTime) return false; const h = new Date(d.orderTime).getHours(); return h >= b.min && h < b.max; });
      return { name: b.name, 件数: ds.reduce((s, d) => s + dc(d), 0) };
    });
    // Today company pie data
    const todayPie = COS.map(c => {
      const rev = todayDels.filter(d => d.company === c.id).reduce((s, d) => s + (d.reward || 0), 0);
      return { name: c.letter, value: rev };
    }).filter(d => d.value > 0);

    // Today insight (1 free)
    const bestBracket = todayHourly.filter(h => h.件数 > 0).sort((a, b) => b.件数 - a.件数)[0];

    return (
      <AnaPage title="📋 デイリーレポート">
        {/* Summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <div style={aC}><div style={{ fontSize: sz(10), color: T.textMuted }}>配達件数</div><div style={{ fontSize: sz(24), fontWeight: 800, color: T.accent, marginTop: 2 }}>{todayCnt}件</div></div>
          <div style={aC}><div style={{ fontSize: sz(10), color: T.textMuted }}>売上合計</div><div style={{ fontSize: sz(24), fontWeight: 800, color: T.accent, marginTop: 2 }}>¥{(todayRev + todayInc).toLocaleString()}</div></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <div style={aC}><div style={{ fontSize: sz(10), color: T.textMuted }}>基本時給</div><div style={{ fontSize: sz(22), fontWeight: 800, color: T.accent, marginTop: 2 }}>¥{todayHB.toLocaleString()}</div></div>
          <div style={aC}><div style={{ fontSize: sz(10), color: T.purple }}>実質時給</div><div style={{ fontSize: sz(22), fontWeight: 800, color: T.purple, marginTop: 2 }}>¥{todayHA.toLocaleString()}</div></div>
        </div>

        {/* Today hourly bar chart */}
        <div style={aC}>
          <div style={aT2}>今日の時間帯別 配達件数</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={todayHourly} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <XAxis dataKey="name" tick={{ fontSize: sz(10), fill: T.textDim }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: sz(10), fill: T.textDim }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={(p) => <ChartTip {...p} theme={T} />} cursor={{ fill: `${T.accent}11` }} />
              <Bar isAnimationActive={chartAnim} dataKey="件数" fill={T.accent} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          {/* Premium tease */}
          <div onClick={() => !isPremium && setScreen("ana_hourly")} style={{ fontSize: sz(11), color: T.purple, marginTop: 8, cursor: "pointer" }}>
            過去30日の時間帯傾向と比較 →
          </div>
        </div>

        {/* Today company pie chart */}
        {todayPie.length > 0 && (
          <div style={aC}>
            <div style={aT2}>今日の会社別売上</div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <ResponsiveContainer width={120} height={120}>
                <PieChart style={{ pointerEvents: "none" }}>
                  <Pie isAnimationActive={chartAnim} data={todayPie} dataKey="value" cx="50%" cy="50%" outerRadius={50} innerRadius={25} paddingAngle={2} activeIndex={-1} activeShape={null}>
                    {todayPie.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div>
                {todayPie.map((d, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span style={{ fontSize: sz(12), color: T.text }}>{d.name}</span>
                    <span style={{ fontSize: sz(12), fontWeight: 700, color: T.text }}>¥{d.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
            <div onClick={() => !isPremium && setScreen("ana_company")} style={{ fontSize: sz(11), color: T.purple, marginTop: 8, cursor: "pointer" }}>
              会社別の平均単価推移を見る →
            </div>
          </div>
        )}

        {/* Free insight (1 only) */}
        {bestBracket && bestBracket.件数 > 0 && (
          <div style={{ ...aC, background: T === LIGHT ? "#FFFBEB" : "#1A1810", border: `1px solid ${T === LIGHT ? "#FDE68A" : "#42381A"}` }}>
            <div style={{ fontSize: sz(13), fontWeight: 700, color: T.accent, marginBottom: 6 }}>💡 今日のポイント</div>
            <div style={{ fontSize: sz(13), color: T.text, lineHeight: 1.5 }}>⏰ {bestBracket.name}時の配達が最も多い（{bestBracket.件数}件）</div>
            <div onClick={() => setScreen("ana_hourly")} style={{ fontSize: sz(11), color: T.purple, marginTop: 8, cursor: "pointer" }}>
              全期間の稼ぎ方ポイントを見る →
            </div>
          </div>
        )}

        {/*稼働info */}
        <div style={aC}>
          <div style={aT2}>稼働情報</div>
          {(() => {
            const actualDelMs = todayDels.reduce((s, d) => s + (d.completeTime && d.orderTime ? d.completeTime - d.orderTime : 0), 0);
            const wasteMs = Math.max(0, sesMs - actualDelMs - tBrkMs);
            return [
              { l: "稼働時間", v: fd(sesMs), c: T.text, desc: null },
              { l: "実配達時間", v: fd(actualDelMs), c: "#22C55E", desc: null },
              { l: "無職時間", v: fd(wasteMs), c: "#EF4444", desc: `うち地蔵 ${fd(tJzMs)}` },
              { l: "休憩時間", v: fd(tBrkMs), c: T.textMuted, desc: null },
            ].map((r, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: i < 3 ? `1px solid ${T.border}` : "none" }}>
                <div>
                  <span style={{ fontSize: sz(12), color: T.textMuted }}>{r.l}</span>
                  {r.desc && <span style={{ fontSize: sz(10), color: "#F59E0B", marginLeft: 8 }}>{r.desc}</span>}
                </div>
                <span style={{ fontSize: sz(14), fontWeight: 700, color: r.c }}>{r.v}</span>
              </div>
            ));
          })()}
        </div>
      </AnaPage>
    );
  }

  // ═══ HOURLY ANALYSIS ═══
  if (anaScreen === "hourly") {
    const HR_PERIODS = [
      { key: "today", label: "今日", free: true },
      { key: "week", label: "1週間", free: false },
      { key: "month", label: "1ヶ月", free: false },
      { key: "half", label: "半年", free: false },
      { key: "all", label: "全期間", free: false },
    ];
    const HR_DOW_OPTS = [{ key: "all", label: "全曜日" },{ key: "mon", label: "月曜日" },{ key: "tue", label: "火曜日" },{ key: "wed", label: "水曜日" },{ key: "thu", label: "木曜日" },{ key: "fri", label: "金曜日" },{ key: "sat", label: "土曜日" },{ key: "sun", label: "日曜日" }];
    const HR_DOW_LABELS = { all: "曜日", mon: "月", tue: "火", wed: "水", thu: "木", fri: "金", sat: "土", sun: "日" };
    const HR_CO_OPTS = [{ key: "all", label: "全会社" }, ...COS.map(c => ({ key: c.id, label: c.name }))];
    const HR_CO_LABELS = { all: "会社", ...Object.fromEntries(COS.map(c => [c.id, c.letter])) };
    const HR_WX_OPTS = [{ key: "all", label: "全天候" }, ...WEATHER.map(w => ({ key: w.id, label: `${w.icon} ${w.label}` }))];
    const HR_WX_LABELS = { all: "天候", ...Object.fromEntries(WEATHER.map(w => [w.id, w.icon])) };

    const hrPeriodItem = HR_PERIODS.find(p => p.key === hrPeriod) || HR_PERIODS[0];
    const hrCanView = hrPeriodItem.free || isPremium;
    const hrHasFilter = hrDow !== "all" || hrCompany !== "all" || hrWeather !== "all";

    const nowMs7 = Date.now(); const msDay7 = 86400000;
    const dowMap7 = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };

    let hrFiltered = anaAD;
    if (hrPeriod === "today") hrFiltered = hrFiltered.filter(d => d.orderTime && new Date(d.orderTime).toISOString().slice(0,10) === todayDate);
    else if (hrPeriod === "week") { const s = new Date(nowMs7 - 6 * msDay7).toISOString().slice(0,10); hrFiltered = hrFiltered.filter(d => d.orderTime && new Date(d.orderTime).toISOString().slice(0,10) >= s); }
    else if (hrPeriod === "month") { const pf = todayDate.slice(0,7); hrFiltered = hrFiltered.filter(d => d.orderTime && new Date(d.orderTime).toISOString().slice(0,10).startsWith(pf)); }
    else if (hrPeriod === "half") { const s = new Date(nowMs7 - 180 * msDay7).toISOString().slice(0,10); hrFiltered = hrFiltered.filter(d => d.orderTime && new Date(d.orderTime).toISOString().slice(0,10) >= s); }
    if (hrDow !== "all") hrFiltered = hrFiltered.filter(d => d.orderTime && new Date(d.orderTime).getDay() === dowMap7[hrDow]);
    if (hrCompany !== "all") hrFiltered = hrFiltered.filter(d => d.company === hrCompany);
    if (hrWeather !== "all") {
      const wxLogs3 = new Set(anaAll.filter(l => l.weather === hrWeather).map(l => l.date));
      hrFiltered = hrFiltered.filter(d => d.orderTime && wxLogs3.has(new Date(d.orderTime).toISOString().slice(0,10)));
    }

    const brackets = [
      { name: "0-3", min: 0, max: 3 }, { name: "3-6", min: 3, max: 6 }, { name: "6-9", min: 6, max: 9 }, { name: "9-12", min: 9, max: 12 },
      { name: "12-15", min: 12, max: 15 }, { name: "15-18", min: 15, max: 18 }, { name: "18-21", min: 18, max: 21 }, { name: "21-24", min: 21, max: 24 },
    ];
    const hData = brackets.map(b => {
      const ds = hrFiltered.filter(d => { if (!d.orderTime) return false; const h = new Date(d.orderTime).getHours(); return h >= b.min && h < b.max; });
      const cnt = ds.reduce((s, d) => s + dc(d), 0);
      const rev = ds.reduce((s, d) => s + (d.reward || 0), 0);
      return { name: b.name, 売上: rev, 件数: cnt, 単価: cnt > 0 ? Math.round(rev / cnt) : 0 };
    });

    const hrFilterBtn = (label, ddKey, isActive) => (
      <button onClick={(e) => { e.stopPropagation(); setHrDropdown(hrDropdown === ddKey ? null : ddKey); }}
        style={{ padding: "5px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: FN, fontSize: sz(11), fontWeight: isActive ? 700 : 500, background: isActive ? T.accent : T.barBg, color: isActive ? "#000" : T.text, display: "flex", alignItems: "center", gap: 4 }}>
        {label}<span style={{ fontSize: sz(8), opacity: 0.6 }}>{hrDropdown === ddKey ? "▲" : "▼"}</span>
      </button>
    );
    const hrDdPanel = (items, current, setter) => (
      <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, boxShadow: "0 8px 24px #0006", padding: 4, minWidth: 130, zIndex: 1002 }}>
        {items.map(item => (
          <button key={item.key} onClick={(e) => { e.stopPropagation(); setter(item.key); setHrDropdown(null); }}
            style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", border: "none", borderRadius: 7, cursor: "pointer", fontFamily: FN, fontSize: sz(12), fontWeight: current === item.key ? 700 : 400, background: current === item.key ? `${T.accent}22` : "transparent", color: current === item.key ? T.accent : T.text }}>
            {current === item.key ? "✓ " : "   "}{item.label}
          </button>
        ))}
      </div>
    );

    return (
      <AnaPage title="⏰ 時間帯分析" onClick={() => setHrDropdown(null)}>
        <div style={{ display: "flex", gap: 3, marginBottom: 8, background: T.barBg, borderRadius: 10, padding: 3 }}>
          {HR_PERIODS.map(p => {
            const active = hrPeriod === p.key;
            const locked = !p.free && !isPremium;
            return (
              <button key={p.key} onClick={(e) => { e.stopPropagation(); setHrPeriod(p.key); setHrDropdown(null); }}
                style={{ padding: "6px 0", flex: 1, borderRadius: 8, border: "none", cursor: "pointer", fontFamily: FN, fontSize: sz(10), fontWeight: active ? 700 : 500, background: active ? T.accent : "transparent", color: active ? "#000" : locked ? T.textDim : T.text }}>
                {p.label}{locked ? "🔒" : ""}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ position: "relative" }}>
            {hrFilterBtn(HR_DOW_LABELS[hrDow], "dow", hrDow !== "all")}
            {hrDropdown === "dow" && hrDdPanel(HR_DOW_OPTS, hrDow, setHrDow)}
          </div>
          <div style={{ position: "relative" }}>
            {hrFilterBtn(HR_CO_LABELS[hrCompany], "company", hrCompany !== "all")}
            {hrDropdown === "company" && hrDdPanel(HR_CO_OPTS, hrCompany, setHrCompany)}
          </div>
          <div style={{ position: "relative" }}>
            {hrFilterBtn(HR_WX_LABELS[hrWeather], "weather", hrWeather !== "all")}
            {hrDropdown === "weather" && hrDdPanel(HR_WX_OPTS, hrWeather, setHrWeather)}
          </div>
          {hrHasFilter && (
            <button onClick={(e) => { e.stopPropagation(); setHrDow("all"); setHrCompany("all"); setHrWeather("all"); setHrDropdown(null); }}
              style={{ padding: "5px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: FN, fontSize: sz(11), background: "#EF444433", color: "#EF4444" }}>
              ✕ リセット
            </button>
          )}
        </div>
        {hrCanView ? (<>
          <div style={{ fontSize: sz(10), color: T.textDim, marginBottom: 8, textAlign: "right" }}>{hrFiltered.length}件のデータ</div>
          <div style={aC}>
            <div style={aT2}>時間帯別 売上</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={hData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                <XAxis dataKey="name" tick={{ fontSize: sz(10), fill: T.textDim }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: sz(9), fill: T.textDim }} axisLine={false} tickLine={false} />
                <Tooltip content={(p) => <ChartTip {...p} theme={T} />} cursor={{ fill: `${T.accent}11` }} />
                <Bar isAnimationActive={chartAnim} dataKey="売上" fill={T.accent} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={aC}>
            <div style={aT2}>時間帯別 平均単価</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={hData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                <XAxis dataKey="name" tick={{ fontSize: sz(10), fill: T.textDim }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: sz(9), fill: T.textDim }} axisLine={false} tickLine={false} />
                <Tooltip content={(p) => <ChartTip {...p} theme={T} />} cursor={{ fill: `${T.accent}11` }} />
                <Bar isAnimationActive={chartAnim} dataKey="単価" fill="#22C55E" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={aC}>
            {hData.map((h, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: i < 7 ? `1px solid ${T.border}` : "none", opacity: h.件数 === 0 ? 0.35 : 1 }}>
                <span style={{ fontSize: sz(12), color: T.textSub, width: 50 }}>{h.name}時</span>
                <span style={{ fontSize: sz(12), color: T.text }}>{h.件数}件</span>
                <span style={{ fontSize: sz(12), fontWeight: 600, color: T.accent }}>¥{h.単価.toLocaleString()}/件</span>
                <span style={{ fontSize: sz(12), color: T.textMuted }}>¥{h.売上.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </>) : (
          <PremiumBlur>
            <div style={aC}><div style={aT2}>時間帯別 売上</div><div style={{ height: 200 }} /></div>
            <div style={aC}><div style={aT2}>時間帯別 平均単価</div><div style={{ height: 200 }} /></div>
          </PremiumBlur>
        )}
      </AnaPage>
    );
  }

  // ═══ WEEKDAY ANALYSIS ═══
  if (anaScreen === "weekday") {
    const WD_PERIODS = [
      { key: "today", label: "今日", free: true },
      { key: "week", label: "1週間", free: false },
      { key: "month", label: "1ヶ月", free: false },
      { key: "half", label: "半年", free: false },
      { key: "all", label: "全期間", free: false },
    ];
    const WD_TIME_SLOTS = [{ key: "all", label: "全時間帯" },{ key: "morning", label: "朝 (6-10)" },{ key: "lunch", label: "昼 (11-14)" },{ key: "afternoon", label: "午後 (15-17)" },{ key: "dinner", label: "夜 (18-21)" },{ key: "night", label: "深夜 (22-5)" }];
    const WD_TIME_LABELS = { all: "時間帯", morning: "朝", lunch: "昼", afternoon: "午後", dinner: "夜", night: "深夜" };
    const WD_CO_OPTS = [{ key: "all", label: "全会社" }, ...COS.map(c => ({ key: c.id, label: c.name }))];
    const WD_CO_LABELS = { all: "会社", ...Object.fromEntries(COS.map(c => [c.id, c.letter])) };
    const WD_WX_OPTS = [{ key: "all", label: "全天候" }, ...WEATHER.map(w => ({ key: w.id, label: `${w.icon} ${w.label}` }))];
    const WD_WX_LABELS = { all: "天候", ...Object.fromEntries(WEATHER.map(w => [w.id, w.icon])) };

    const wdPeriodItem = WD_PERIODS.find(p => p.key === wdPeriod) || WD_PERIODS[0];
    const wdCanView = wdPeriodItem.free || isPremium;
    const wdHasFilter = wdTimeSlot !== "all" || wdCompany !== "all" || wdWeather !== "all";

    const nowMs8 = Date.now(); const msDay8 = 86400000;
    const timeMatch8 = (h) => {
      if (wdTimeSlot === "all") return true;
      if (wdTimeSlot === "morning") return h >= 6 && h < 10;
      if (wdTimeSlot === "lunch") return h >= 11 && h < 15;
      if (wdTimeSlot === "afternoon") return h >= 15 && h < 18;
      if (wdTimeSlot === "dinner") return h >= 18 && h < 22;
      if (wdTimeSlot === "night") return h >= 22 || h < 6;
      return true;
    };

    // Filter anaAll logs by period and weather
    let wdLogs = [...anaAll];
    if (wdPeriod === "today") wdLogs = wdLogs.filter(l => l.date === todayDate);
    else if (wdPeriod === "week") { const s = new Date(nowMs8 - 6 * msDay8).toISOString().slice(0,10); wdLogs = wdLogs.filter(l => l.date >= s); }
    else if (wdPeriod === "month") { const pf = todayDate.slice(0,7); wdLogs = wdLogs.filter(l => l.date?.startsWith(pf)); }
    else if (wdPeriod === "half") { const s = new Date(nowMs8 - 180 * msDay8).toISOString().slice(0,10); wdLogs = wdLogs.filter(l => l.date >= s); }
    if (wdWeather !== "all") wdLogs = wdLogs.filter(l => l.weather === wdWeather);

    const DAYS = ["日", "月", "火", "水", "木", "金", "土"];
    const wdData = DAYS.map((name, idx) => {
      const logs = wdLogs.filter(l => l.date && new Date(l.date + "T00:00:00").getDay() === idx);
      let ds = logs.flatMap(l => (l.deliveries || []).filter(d => !d.cancelled));
      if (wdTimeSlot !== "all") ds = ds.filter(d => d.orderTime && timeMatch8(new Date(d.orderTime).getHours()));
      if (wdCompany !== "all") ds = ds.filter(d => d.company === wdCompany);
      const rev = ds.reduce((s, d) => s + (d.reward || 0), 0);
      const days = logs.filter(l => l.sessions?.length > 0 || l.currentSessionStart).length || 1;
      return { name, 平均売上: Math.round(rev / days), 日数: days, 件数: ds.reduce((s, d) => s + dc(d), 0) };
    });
    const DAYCOLORS = ["#EF4444", T.accent, T.accent, T.accent, T.accent, T.accent, "#3B82F6"];

    const wdFilterBtn = (label, ddKey, isActive) => (
      <button onClick={(e) => { e.stopPropagation(); setWdDropdown(wdDropdown === ddKey ? null : ddKey); }}
        style={{ padding: "5px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: FN, fontSize: sz(11), fontWeight: isActive ? 700 : 500, background: isActive ? T.accent : T.barBg, color: isActive ? "#000" : T.text, display: "flex", alignItems: "center", gap: 4 }}>
        {label}<span style={{ fontSize: sz(8), opacity: 0.6 }}>{wdDropdown === ddKey ? "▲" : "▼"}</span>
      </button>
    );
    const wdDdPanel = (items, current, setter) => (
      <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, boxShadow: "0 8px 24px #0006", padding: 4, minWidth: 130, zIndex: 1002 }}>
        {items.map(item => (
          <button key={item.key} onClick={(e) => { e.stopPropagation(); setter(item.key); setWdDropdown(null); }}
            style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", border: "none", borderRadius: 7, cursor: "pointer", fontFamily: FN, fontSize: sz(12), fontWeight: current === item.key ? 700 : 400, background: current === item.key ? `${T.accent}22` : "transparent", color: current === item.key ? T.accent : T.text }}>
            {current === item.key ? "✓ " : "   "}{item.label}
          </button>
        ))}
      </div>
    );

    return (
      <AnaPage title="📅 曜日分析" onClick={() => setWdDropdown(null)}>
        <div style={{ display: "flex", gap: 3, marginBottom: 8, background: T.barBg, borderRadius: 10, padding: 3 }}>
          {WD_PERIODS.map(p => {
            const active = wdPeriod === p.key;
            const locked = !p.free && !isPremium;
            return (
              <button key={p.key} onClick={(e) => { e.stopPropagation(); setWdPeriod(p.key); setWdDropdown(null); }}
                style={{ padding: "6px 0", flex: 1, borderRadius: 8, border: "none", cursor: "pointer", fontFamily: FN, fontSize: sz(10), fontWeight: active ? 700 : 500, background: active ? T.accent : "transparent", color: active ? "#000" : locked ? T.textDim : T.text }}>
                {p.label}{locked ? "🔒" : ""}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ position: "relative" }}>
            {wdFilterBtn(WD_TIME_LABELS[wdTimeSlot], "time", wdTimeSlot !== "all")}
            {wdDropdown === "time" && wdDdPanel(WD_TIME_SLOTS, wdTimeSlot, setWdTimeSlot)}
          </div>
          <div style={{ position: "relative" }}>
            {wdFilterBtn(WD_CO_LABELS[wdCompany], "company", wdCompany !== "all")}
            {wdDropdown === "company" && wdDdPanel(WD_CO_OPTS, wdCompany, setWdCompany)}
          </div>
          <div style={{ position: "relative" }}>
            {wdFilterBtn(WD_WX_LABELS[wdWeather], "weather", wdWeather !== "all")}
            {wdDropdown === "weather" && wdDdPanel(WD_WX_OPTS, wdWeather, setWdWeather)}
          </div>
          {wdHasFilter && (
            <button onClick={(e) => { e.stopPropagation(); setWdTimeSlot("all"); setWdCompany("all"); setWdWeather("all"); setWdDropdown(null); }}
              style={{ padding: "5px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: FN, fontSize: sz(11), background: "#EF444433", color: "#EF4444" }}>
              ✕ リセット
            </button>
          )}
        </div>
        {wdCanView ? (<>
          <div style={{ fontSize: sz(10), color: T.textDim, marginBottom: 8, textAlign: "right" }}>{wdData.reduce((s, w) => s + w.件数, 0)}件のデータ</div>
          <div style={aC}>
            <div style={aT2}>曜日別 1日あたり平均売上</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={wdData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                <XAxis dataKey="name" tick={{ fontSize: sz(12), fill: T.textDim }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: sz(9), fill: T.textDim }} axisLine={false} tickLine={false} />
                <Tooltip content={(p) => <ChartTip {...p} theme={T} />} cursor={{ fill: `${T.accent}11` }} />
                <Bar isAnimationActive={chartAnim} dataKey="平均売上" radius={[4, 4, 0, 0]}>
                  {wdData.map((_, i) => <Cell key={i} fill={DAYCOLORS[i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={aC}>
            {wdData.map((w, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: i < 6 ? `1px solid ${T.border}` : "none" }}>
                <span style={{ fontSize: sz(13), fontWeight: (i === 0 || i === 6) ? 700 : 400, color: i === 0 ? "#EF4444" : i === 6 ? "#3B82F6" : T.text }}>{w.name}曜日</span>
                <span style={{ fontSize: sz(12), color: T.textMuted }}>{w.日数}日稼働</span>
                <span style={{ fontSize: sz(13), fontWeight: 700, color: T.accent }}>¥{w.平均売上.toLocaleString()}/日</span>
              </div>
            ))}
          </div>
        </>) : (
          <PremiumBlur>
            <div style={aC}><div style={aT2}>曜日別 1日あたり平均売上</div><div style={{ height: 200 }} /></div>
            <div style={aC}><div style={{ height: 150 }} /></div>
          </PremiumBlur>
        )}
      </AnaPage>
    );
  }

  // ═══ COMPANY ANALYSIS ═══
  if (anaScreen === "company") {
    const CO_PERIODS = [
      { key: "today", label: "今日", free: true },
      { key: "week", label: "1週間", free: false },
      { key: "month", label: "1ヶ月", free: false },
      { key: "half", label: "半年", free: false },
      { key: "all", label: "全期間", free: false },
    ];
    const CO_TIME_SLOTS = [{ key: "all", label: "全時間帯" },{ key: "morning", label: "朝 (6-10)" },{ key: "lunch", label: "昼 (11-14)" },{ key: "afternoon", label: "午後 (15-17)" },{ key: "dinner", label: "夜 (18-21)" },{ key: "night", label: "深夜 (22-5)" }];
    const CO_TIME_LABELS = { all: "時間帯", morning: "朝", lunch: "昼", afternoon: "午後", dinner: "夜", night: "深夜" };
    const CO_DOW_OPTS = [{ key: "all", label: "全曜日" },{ key: "mon", label: "月曜日" },{ key: "tue", label: "火曜日" },{ key: "wed", label: "水曜日" },{ key: "thu", label: "木曜日" },{ key: "fri", label: "金曜日" },{ key: "sat", label: "土曜日" },{ key: "sun", label: "日曜日" }];
    const CO_DOW_LABELS = { all: "曜日", mon: "月", tue: "火", wed: "水", thu: "木", fri: "金", sat: "土", sun: "日" };
    const CO_WX_OPTS = [{ key: "all", label: "全天候" }, ...WEATHER.map(w => ({ key: w.id, label: `${w.icon} ${w.label}` }))];
    const CO_WX_LABELS = { all: "天候", ...Object.fromEntries(WEATHER.map(w => [w.id, w.icon])) };

    const coPeriodItem = CO_PERIODS.find(p => p.key === coPeriod) || CO_PERIODS[0];
    const coCanView = coPeriodItem.free || isPremium;
    const coHasFilter = coTimeSlot !== "all" || coDow !== "all" || coWeather !== "all";

    // Filter data
    const nowMs5 = Date.now(); const msDay5 = 86400000;
    const dowMap5 = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };
    const timeMatch5 = (h) => {
      if (coTimeSlot === "all") return true;
      if (coTimeSlot === "morning") return h >= 6 && h < 10;
      if (coTimeSlot === "lunch") return h >= 11 && h < 15;
      if (coTimeSlot === "afternoon") return h >= 15 && h < 18;
      if (coTimeSlot === "dinner") return h >= 18 && h < 22;
      if (coTimeSlot === "night") return h >= 22 || h < 6;
      return true;
    };

    let coFiltered = anaAD;
    // period filter
    if (coPeriod === "today") coFiltered = coFiltered.filter(d => d.orderTime && new Date(d.orderTime).toISOString().slice(0,10) === todayDate);
    else if (coPeriod === "week") { const s = new Date(nowMs5 - 6 * msDay5).toISOString().slice(0,10); coFiltered = coFiltered.filter(d => d.orderTime && new Date(d.orderTime).toISOString().slice(0,10) >= s); }
    else if (coPeriod === "month") { const pf = todayDate.slice(0,7); coFiltered = coFiltered.filter(d => d.orderTime && new Date(d.orderTime).toISOString().slice(0,10).startsWith(pf)); }
    else if (coPeriod === "half") { const s = new Date(nowMs5 - 180 * msDay5).toISOString().slice(0,10); coFiltered = coFiltered.filter(d => d.orderTime && new Date(d.orderTime).toISOString().slice(0,10) >= s); }
    // time slot filter
    if (coTimeSlot !== "all") coFiltered = coFiltered.filter(d => d.orderTime && timeMatch5(new Date(d.orderTime).getHours()));
    // dow filter
    if (coDow !== "all") coFiltered = coFiltered.filter(d => d.orderTime && new Date(d.orderTime).getDay() === dowMap5[coDow]);
    // weather filter
    if (coWeather !== "all") {
      const wxLogs = new Set(anaAll.filter(l => l.weather === coWeather).map(l => l.date));
      coFiltered = coFiltered.filter(d => d.orderTime && wxLogs.has(new Date(d.orderTime).toISOString().slice(0,10)));
    }

    const coPie = COS.map(c => {
      const ds = coFiltered.filter(d => d.company === c.id);
      return { name: c.name, value: ds.reduce((s, d) => s + (d.reward || 0), 0), cnt: ds.reduce((s, d) => s + dc(d), 0), letter: c.letter, bg: c.bg };
    });
    const coAvg = COS.map(c => {
      const ds = coFiltered.filter(d => d.company === c.id);
      const cnt = ds.reduce((s, d) => s + dc(d), 0);
      return { name: c.letter, 平均単価: cnt > 0 ? Math.round(ds.reduce((s, d) => s + (d.reward || 0), 0) / cnt) : 0, cnt, bg: c.bg };
    });

    const coFilterBtn = (label, ddKey, isActive) => (
      <button onClick={(e) => { e.stopPropagation(); setCoDropdown(coDropdown === ddKey ? null : ddKey); }}
        style={{ padding: "5px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: FN, fontSize: sz(11), fontWeight: isActive ? 700 : 500, background: isActive ? T.accent : T.barBg, color: isActive ? "#000" : T.text, display: "flex", alignItems: "center", gap: 4 }}>
        {label}<span style={{ fontSize: sz(8), opacity: 0.6 }}>{coDropdown === ddKey ? "▲" : "▼"}</span>
      </button>
    );
    const coDdPanel = (items, current, setter) => (
      <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, boxShadow: "0 8px 24px #0006", padding: 4, minWidth: 130, zIndex: 1002 }}>
        {items.map(item => (
          <button key={item.key} onClick={(e) => { e.stopPropagation(); setter(item.key); setCoDropdown(null); }}
            style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", border: "none", borderRadius: 7, cursor: "pointer", fontFamily: FN, fontSize: sz(12), fontWeight: current === item.key ? 700 : 400, background: current === item.key ? `${T.accent}22` : "transparent", color: current === item.key ? T.accent : T.text }}>
            {current === item.key ? "✓ " : "   "}{item.label}
          </button>
        ))}
      </div>
    );

    return (
      <AnaPage title="🏢 会社別分析" onClick={() => setCoDropdown(null)}>
        {/* Period pills */}
        <div style={{ display: "flex", gap: 3, marginBottom: 8, background: T.barBg, borderRadius: 10, padding: 3 }}>
          {CO_PERIODS.map(p => {
            const active = coPeriod === p.key;
            const locked = !p.free && !isPremium;
            return (
              <button key={p.key} onClick={(e) => { e.stopPropagation(); setCoPeriod(p.key); setCoDropdown(null); }}
                style={{ padding: "6px 0", flex: 1, borderRadius: 8, border: "none", cursor: "pointer", fontFamily: FN, fontSize: sz(10), fontWeight: active ? 700 : 500, background: active ? T.accent : "transparent", color: active ? "#000" : locked ? T.textDim : T.text }}>
                {p.label}{locked ? "🔒" : ""}
              </button>
            );
          })}
        </div>
        {/* Dropdown filters */}
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ position: "relative" }}>
            {coFilterBtn(CO_TIME_LABELS[coTimeSlot], "time", coTimeSlot !== "all")}
            {coDropdown === "time" && coDdPanel(CO_TIME_SLOTS, coTimeSlot, setCoTimeSlot)}
          </div>
          <div style={{ position: "relative" }}>
            {coFilterBtn(CO_DOW_LABELS[coDow], "dow", coDow !== "all")}
            {coDropdown === "dow" && coDdPanel(CO_DOW_OPTS, coDow, setCoDow)}
          </div>
          <div style={{ position: "relative" }}>
            {coFilterBtn(CO_WX_LABELS[coWeather], "weather", coWeather !== "all")}
            {coDropdown === "weather" && coDdPanel(CO_WX_OPTS, coWeather, setCoWeather)}
          </div>
          {coHasFilter && (
            <button onClick={(e) => { e.stopPropagation(); setCoTimeSlot("all"); setCoDow("all"); setCoWeather("all"); setCoDropdown(null); }}
              style={{ padding: "5px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: FN, fontSize: sz(11), background: "#EF444433", color: "#EF4444" }}>
              ✕ リセット
            </button>
          )}
        </div>
        {coCanView ? (<>
          <div style={{ fontSize: sz(10), color: T.textDim, marginBottom: 8, textAlign: "right" }}>{coFiltered.length}件のデータ</div>
          <div style={aC}>
            <div style={aT2}>売上シェア</div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <ResponsiveContainer width={140} height={140}>
                <PieChart style={{ pointerEvents: "none" }}>
                  <Pie isAnimationActive={chartAnim} data={coPie.filter(c => c.value > 0)} dataKey="value" cx="50%" cy="50%" outerRadius={60} innerRadius={30} paddingAngle={2} activeIndex={-1} activeShape={null}>
                    {coPie.filter(c => c.value > 0).map((c, i) => <Cell key={i} fill={c.bg} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div>
                {coPie.map((c, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: c.bg }} />
                    <span style={{ fontSize: sz(12), color: T.text }}>{c.letter}</span>
                    <span style={{ fontSize: sz(12), fontWeight: 600, color: T.text }}>¥{c.value.toLocaleString()}</span>
                    <span style={{ fontSize: sz(10), color: T.textDim }}>{c.cnt}件</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div style={aC}>
            <div style={aT2}>平均単価比較</div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={coAvg} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                <XAxis dataKey="name" tick={{ fontSize: sz(12), fill: T.textDim }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: sz(9), fill: T.textDim }} axisLine={false} tickLine={false} />
                <Tooltip content={(p) => <ChartTip {...p} theme={T} />} cursor={{ fill: `${T.accent}11` }} />
                <Bar isAnimationActive={chartAnim} dataKey="平均単価" radius={[4, 4, 0, 0]}>
                  {coAvg.map((c, i) => <Cell key={i} fill={c.bg} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>) : (
          <PremiumBlur>
            <div style={aC}>
              <div style={aT2}>売上シェア</div>
              <div style={{ height: 140 }} />
            </div>
            <div style={aC}>
              <div style={aT2}>平均単価比較</div>
              <div style={{ height: 160 }} />
            </div>
          </PremiumBlur>
        )}
      </AnaPage>
    );
  }

  // ═══ WEATHER ANALYSIS (PREMIUM) ═══
  if (anaScreen === "weather") {
    const wxData = WEATHER.map(w => {
      const ls = anaAll.filter(l => l.weather === w.id);
      const ds = ls.flatMap(l => (l.deliveries || []).filter(d => !d.cancelled));
      const rev = ds.reduce((s, d) => s + (d.reward || 0), 0);
      const wkM = ls.reduce((sum, l) => { const ses = (l.sessions || []).reduce((s, x) => s + ((x.end || Date.now()) - x.start), 0) + (l.currentSessionStart ? Date.now() - l.currentSessionStart : 0); const old = l.onlineStart ? ((l.onlineEnd || Date.now()) - l.onlineStart) : 0; const brk = (l.breaks || []).reduce((bs, b) => bs + (b.end && b.start ? b.end - b.start : 0), 0); return sum + Math.max(0, (ses || old) - brk); }, 0);
      return { name: `${w.icon}${w.label}`, 売上: rev, 時給: wkM > 0 ? Math.round(rev / (wkM / 3600000)) : 0, 件数: ds.reduce((s, d) => s + dc(d), 0) };
    });
    return (
      <AnaPage title="🌤️ 天候分析">
        <PremiumBlur>
          <div style={aC}>
            <div style={aT2}>天候別 時給</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={wxData} layout="vertical" margin={{ top: 4, right: 4, bottom: 0, left: 30 }}>
                <XAxis type="number" tick={{ fontSize: sz(9), fill: T.textDim }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: sz(11), fill: T.textDim }} axisLine={false} tickLine={false} width={50} />
                <Tooltip content={(p) => <ChartTip {...p} theme={T} />} cursor={{ fill: `${T.accent}11` }} />
                <Bar isAnimationActive={chartAnim} dataKey="時給" fill={T.accent} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={aC}>
            {wxData.map((w, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: i < 4 ? `1px solid ${T.border}` : "none", opacity: w.件数 === 0 ? 0.35 : 1 }}>
                <span style={{ fontSize: sz(13) }}>{w.name}</span>
                <span style={{ fontSize: sz(12), color: T.textMuted }}>{w.件数}件</span>
                <span style={{ fontSize: sz(13), fontWeight: 700, color: T.accent }}>¥{w.時給.toLocaleString()}/h</span>
              </div>
            ))}
          </div>
        </PremiumBlur>
      </AnaPage>
    );
  }

  // ═══ WEATHER CONDITION ANALYSIS (PREMIUM) ═══
  if (anaScreen === "condition") {
    // Collect all deliveries with apiWeather data
    const cwDels = anaAll.flatMap(l => {
      const ses = (l.sessions || []).reduce((s, x) => s + ((x.end || Date.now()) - x.start), 0) + (l.currentSessionStart ? Date.now() - l.currentSessionStart : 0);
      const old = l.onlineStart ? ((l.onlineEnd || Date.now()) - l.onlineStart) : 0;
      const brk = (l.breaks || []).reduce((bs, b) => bs + (b.end && b.start ? b.end - b.start : 0), 0);
      const workMs = Math.max(0, (ses || old) - brk);
      const dels = (l.deliveries || []).filter(d => !d.cancelled && d.apiWeather);
      const cnt = dels.length || 1;
      return dels.map(d => ({ ...d, _workShare: workMs / cnt }));
    });

    const calcGroup = (filtered) => {
      const rev = filtered.reduce((s, d) => s + (d.reward || 0), 0);
      const wk = filtered.reduce((s, d) => s + (d._workShare || 0), 0);
      const hr = wk > 0 ? Math.round(rev / (wk / 3600000)) : 0;
      const avg = filtered.length > 0 ? Math.round(rev / filtered.length) : 0;
      return { cnt: filtered.length, rev, hr, avg };
    };

    // Temperature bands
    const tempBands = [
      { label: "極寒", range: "〜0℃", filter: d => d.apiWeather.temperature < 0, color: "#60A5FA" },
      { label: "寒い", range: "0〜10℃", filter: d => d.apiWeather.temperature >= 0 && d.apiWeather.temperature < 10, color: "#93C5FD" },
      { label: "快適", range: "10〜25℃", filter: d => d.apiWeather.temperature >= 10 && d.apiWeather.temperature < 25, color: "#22C55E" },
      { label: "暑い", range: "25〜30℃", filter: d => d.apiWeather.temperature >= 25 && d.apiWeather.temperature < 30, color: "#FACC15" },
      { label: "猛暑", range: "30〜35℃", filter: d => d.apiWeather.temperature >= 30 && d.apiWeather.temperature < 35, color: "#F97316" },
      { label: "酷暑", range: "35℃〜", filter: d => d.apiWeather.temperature >= 35, color: "#EF4444" },
    ];
    const tempData = tempBands.map(b => ({ ...b, ...calcGroup(cwDels.filter(b.filter)) }));

    // Precipitation bands
    const rainBands = [
      { label: "なし", range: "0mm", filter: d => (d.apiWeather.precipitation ?? 0) === 0, color: "#9CA3AF" },
      { label: "小雨", range: "〜2mm", filter: d => { const p = d.apiWeather.precipitation ?? 0; return p > 0 && p <= 2; }, color: "#60A5FA" },
      { label: "雨", range: "2〜5mm", filter: d => { const p = d.apiWeather.precipitation ?? 0; return p > 2 && p <= 5; }, color: "#3B82F6" },
      { label: "大雨", range: "5mm〜", filter: d => (d.apiWeather.precipitation ?? 0) > 5, color: "#1D4ED8" },
    ];
    const rainData = rainBands.map(b => ({ ...b, ...calcGroup(cwDels.filter(b.filter)) }));

    // Wind bands
    const windBands = [
      { label: "弱風", range: "〜10km/h", filter: d => d.apiWeather.windspeed < 10, color: "#86EFAC" },
      { label: "普通", range: "10〜20km/h", filter: d => d.apiWeather.windspeed >= 10 && d.apiWeather.windspeed < 20, color: "#FACC15" },
      { label: "強風", range: "20km/h〜", filter: d => d.apiWeather.windspeed >= 20, color: "#F97316" },
    ];
    const windData = windBands.map(b => ({ ...b, ...calcGroup(cwDels.filter(b.filter)) }));

    // Summary insight
    const findBest = (data) => data.filter(d => d.cnt >= 3).sort((a, b) => b.hr - a.hr)[0];
    const findWorst = (data) => data.filter(d => d.cnt >= 3).sort((a, b) => a.hr - b.hr)[0];
    const bestTemp = findBest(tempData);
    const bestRain = findBest(rainData);
    const worstRain = findWorst(rainData);
    const rainDiff = bestRain && worstRain && bestRain !== worstRain ? bestRain.hr - worstRain.hr : 0;

    const maxHr = Math.max(...[...tempData, ...rainData, ...windData].map(d => d.hr), 1);

    const CondBar = ({ items, title }) => (
      <div style={aC}>
        <div style={aT2}>{title}</div>
        {items.map((item, i) => (
          <div key={i} style={{ marginBottom: i < items.length - 1 ? 10 : 0, opacity: item.cnt === 0 ? 0.3 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: sz(13), fontWeight: 700, color: T.text }}>{item.label}</span>
                <span style={{ fontSize: sz(9), color: T.textDim }}>{item.range}</span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: sz(9), color: T.textDim }}>{item.cnt}件</span>
                <span style={{ fontSize: sz(15), fontWeight: 800, color: item.color }}>¥{item.hr.toLocaleString()}<span style={{ fontSize: sz(9), fontWeight: 500 }}>/h</span></span>
              </div>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: T.barBg, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 4, background: item.color, width: `${maxHr > 0 ? (item.hr / maxHr) * 100 : 0}%`, transition: "width 0.6s ease" }} />
            </div>
          </div>
        ))}
      </div>
    );

    return (
      <AnaPage title="🌡️ 気象コンディション分析">
        <PremiumBlur>
          {/* Summary insight card */}
          {(bestTemp || rainDiff > 0) && (
            <div style={{ background: `${T.purple}15`, border: `1px solid ${T.purpleBorder}`, borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
              <div style={{ fontSize: sz(11), fontWeight: 700, color: T.purple, marginBottom: 4 }}>発見</div>
              {bestTemp && <div style={{ fontSize: sz(12), color: T.text, marginBottom: 2 }}>気温 <b style={{ color: bestTemp.color }}>{bestTemp.label}({bestTemp.range})</b> の時が最も時給が高い</div>}
              {rainDiff > 0 && bestRain && worstRain && <div style={{ fontSize: sz(12), color: T.text }}><b style={{ color: bestRain.color }}>{bestRain.label}</b>は<b style={{ color: worstRain.color }}>{worstRain.label}</b>より時給 <b style={{ color: "#22C55E" }}>+¥{rainDiff.toLocaleString()}</b> 高い</div>}
            </div>
          )}
          <CondBar items={tempData} title="気温帯別 時給" />
          <CondBar items={rainData} title="雨量別 時給" />
          <CondBar items={windData} title="風速別 時給" />
          {cwDels.length === 0 && (
            <div style={{ textAlign: "center", padding: 20, color: T.textDim, fontSize: sz(12) }}>
              天候APIデータのある配達がまだありません。<br />配達を記録すると自動で天候データが蓄積されます。
            </div>
          )}
        </PremiumBlur>
      </AnaPage>
    );
  }

  // ═══ TRENDS (PREMIUM) ═══
  if (anaScreen === "trends") {
    const today3 = new Date();
    const weeklyLine = [0,1,2,3,4,5,6,7].reverse().map(w => {
      const end = new Date(today3); end.setDate(end.getDate() - w * 7);
      const start = new Date(end); start.setDate(start.getDate() - 6);
      const sStr = start.toISOString().slice(0,10); const eStr = end.toISOString().slice(0,10);
      const logs = anaAll.filter(l => l.date >= sStr && l.date <= eStr);
      const ds = logs.flatMap(l => (l.deliveries || []).filter(d => !d.cancelled));
      const rev = ds.reduce((s, d) => s + (d.reward || 0), 0);
      return { name: w === 0 ? "今週" : `${w}w前`, 売上: rev };
    });
    const monthlyLine = [0,1,2,3,4,5].reverse().map(m => {
      const d2 = new Date(today3.getFullYear(), today3.getMonth() - m, 1);
      const prefix = `${d2.getFullYear()}-${String(d2.getMonth()+1).padStart(2,"0")}`;
      const logs = anaAll.filter(l => l.date?.startsWith(prefix));
      const ds = logs.flatMap(l => (l.deliveries || []).filter(d3 => !d3.cancelled));
      return { name: `${d2.getMonth()+1}月`, 売上: ds.reduce((s, d3) => s + (d3.reward || 0), 0) };
    });
    return (
      <AnaPage title="📈 売上推移">
        <PremiumBlur>
          <div style={aC}>
            <div style={aT2}>週別 売上推移</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={weeklyLine} margin={{ top: 4, right: 10, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                <XAxis dataKey="name" tick={{ fontSize: sz(9), fill: T.textDim }} axisLine={false} />
                <YAxis tick={{ fontSize: sz(9), fill: T.textDim }} axisLine={false} />
                <Tooltip content={(p) => <ChartTip {...p} theme={T} />} cursor={{ fill: `${T.accent}11` }} />
                <Line isAnimationActive={chartAnim} type="monotone" dataKey="売上" stroke={T.accent} strokeWidth={2} dot={{ r: 4, fill: T.accent }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={aC}>
            <div style={aT2}>月別 売上推移</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={monthlyLine} margin={{ top: 4, right: 10, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                <XAxis dataKey="name" tick={{ fontSize: sz(10), fill: T.textDim }} axisLine={false} />
                <YAxis tick={{ fontSize: sz(9), fill: T.textDim }} axisLine={false} />
                <Tooltip content={(p) => <ChartTip {...p} theme={T} />} cursor={{ fill: `${T.accent}11` }} />
                <Line isAnimationActive={chartAnim} type="monotone" dataKey="売上" stroke={T.purple} strokeWidth={2} dot={{ r: 4, fill: T.purple }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </PremiumBlur>
      </AnaPage>
    );
  }

  // ═══ UNIT PRICE ═══
  if (anaScreen === "unitprice") {
    const UP_PERIODS = [
      { key: "today", label: "今日", free: true },
      { key: "week", label: "1週間", free: false },
      { key: "month", label: "1ヶ月", free: false },
      { key: "half", label: "半年", free: false },
      { key: "all", label: "全期間", free: false },
    ];
    const UP_TIME_SLOTS = [{ key: "all", label: "全時間帯" },{ key: "morning", label: "朝 (6-10)" },{ key: "lunch", label: "昼 (11-14)" },{ key: "afternoon", label: "午後 (15-17)" },{ key: "dinner", label: "夜 (18-21)" },{ key: "night", label: "深夜 (22-5)" }];
    const UP_TIME_LABELS = { all: "時間帯", morning: "朝", lunch: "昼", afternoon: "午後", dinner: "夜", night: "深夜" };
    const UP_DOW_OPTS = [{ key: "all", label: "全曜日" },{ key: "mon", label: "月曜日" },{ key: "tue", label: "火曜日" },{ key: "wed", label: "水曜日" },{ key: "thu", label: "木曜日" },{ key: "fri", label: "金曜日" },{ key: "sat", label: "土曜日" },{ key: "sun", label: "日曜日" }];
    const UP_DOW_LABELS = { all: "曜日", mon: "月", tue: "火", wed: "水", thu: "木", fri: "金", sat: "土", sun: "日" };
    const UP_CO_OPTS = [{ key: "all", label: "全会社" }, ...COS.map(c => ({ key: c.id, label: c.name }))];
    const UP_CO_LABELS = { all: "会社", ...Object.fromEntries(COS.map(c => [c.id, c.letter])) };
    const UP_WX_OPTS = [{ key: "all", label: "全天候" }, ...WEATHER.map(w => ({ key: w.id, label: `${w.icon} ${w.label}` }))];
    const UP_WX_LABELS = { all: "天候", ...Object.fromEntries(WEATHER.map(w => [w.id, w.icon])) };

    const upPeriodItem = UP_PERIODS.find(p => p.key === upPeriod) || UP_PERIODS[0];
    const upCanView = upPeriodItem.free || isPremium;
    const upHasFilter = upTimeSlot !== "all" || upDow !== "all" || upCompany !== "all" || upWeather !== "all";

    // Filter data
    const nowMs6 = Date.now(); const msDay6 = 86400000;
    const dowMap6 = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };
    const timeMatch6 = (h) => {
      if (upTimeSlot === "all") return true;
      if (upTimeSlot === "morning") return h >= 6 && h < 10;
      if (upTimeSlot === "lunch") return h >= 11 && h < 15;
      if (upTimeSlot === "afternoon") return h >= 15 && h < 18;
      if (upTimeSlot === "dinner") return h >= 18 && h < 22;
      if (upTimeSlot === "night") return h >= 22 || h < 6;
      return true;
    };

    let upFiltered = anaAD;
    // period
    if (upPeriod === "today") upFiltered = upFiltered.filter(d => d.orderTime && new Date(d.orderTime).toISOString().slice(0,10) === todayDate);
    else if (upPeriod === "week") { const s = new Date(nowMs6 - 6 * msDay6).toISOString().slice(0,10); upFiltered = upFiltered.filter(d => d.orderTime && new Date(d.orderTime).toISOString().slice(0,10) >= s); }
    else if (upPeriod === "month") { const pf = todayDate.slice(0,7); upFiltered = upFiltered.filter(d => d.orderTime && new Date(d.orderTime).toISOString().slice(0,10).startsWith(pf)); }
    else if (upPeriod === "half") { const s = new Date(nowMs6 - 180 * msDay6).toISOString().slice(0,10); upFiltered = upFiltered.filter(d => d.orderTime && new Date(d.orderTime).toISOString().slice(0,10) >= s); }
    // time slot
    if (upTimeSlot !== "all") upFiltered = upFiltered.filter(d => d.orderTime && timeMatch6(new Date(d.orderTime).getHours()));
    // dow
    if (upDow !== "all") upFiltered = upFiltered.filter(d => d.orderTime && new Date(d.orderTime).getDay() === dowMap6[upDow]);
    // company
    if (upCompany !== "all") upFiltered = upFiltered.filter(d => d.company === upCompany);
    // weather
    if (upWeather !== "all") {
      const wxLogs2 = new Set(anaAll.filter(l => l.weather === upWeather).map(l => l.date));
      upFiltered = upFiltered.filter(d => d.orderTime && wxLogs2.has(new Date(d.orderTime).toISOString().slice(0,10)));
    }

    const pAvgs = COS.map(c => { const ds = upFiltered.filter(d => d.company === c.id); const cnt = ds.reduce((s,d) => s+dc(d),0); return { name: c.letter, bg: c.bg, 平均単価: cnt > 0 ? Math.round(ds.reduce((s,d)=>s+(d.reward||0),0)/cnt) : 0, cnt }; });
    const pTot = upFiltered.reduce((s,d)=>s+dc(d),0);
    const pAvgAll = pTot > 0 ? Math.round(upFiltered.reduce((s,d)=>s+(d.reward||0),0)/pTot) : 0;

    const upFilterBtn = (label, ddKey, isActive) => (
      <button onClick={(e) => { e.stopPropagation(); setUpDropdown(upDropdown === ddKey ? null : ddKey); }}
        style={{ padding: "5px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: FN, fontSize: sz(11), fontWeight: isActive ? 700 : 500, background: isActive ? T.accent : T.barBg, color: isActive ? "#000" : T.text, display: "flex", alignItems: "center", gap: 4 }}>
        {label}<span style={{ fontSize: sz(8), opacity: 0.6 }}>{upDropdown === ddKey ? "▲" : "▼"}</span>
      </button>
    );
    const upDdPanel = (items, current, setter) => (
      <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, boxShadow: "0 8px 24px #0006", padding: 4, minWidth: 130, zIndex: 1002 }}>
        {items.map(item => (
          <button key={item.key} onClick={(e) => { e.stopPropagation(); setter(item.key); setUpDropdown(null); }}
            style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", border: "none", borderRadius: 7, cursor: "pointer", fontFamily: FN, fontSize: sz(12), fontWeight: current === item.key ? 700 : 400, background: current === item.key ? `${T.accent}22` : "transparent", color: current === item.key ? T.accent : T.text }}>
            {current === item.key ? "✓ " : "   "}{item.label}
          </button>
        ))}
      </div>
    );

    return (
      <AnaPage title="💰 平均単価" onClick={() => setUpDropdown(null)}>
        {/* Period pills */}
        <div style={{ display: "flex", gap: 3, marginBottom: 8, background: T.barBg, borderRadius: 10, padding: 3 }}>
          {UP_PERIODS.map(p => {
            const active = upPeriod === p.key;
            const locked = !p.free && !isPremium;
            return (
              <button key={p.key} onClick={(e) => { e.stopPropagation(); setUpPeriod(p.key); setUpDropdown(null); }}
                style={{ padding: "6px 0", flex: 1, borderRadius: 8, border: "none", cursor: "pointer", fontFamily: FN, fontSize: sz(10), fontWeight: active ? 700 : 500, background: active ? T.accent : "transparent", color: active ? "#000" : locked ? T.textDim : T.text }}>
                {p.label}{locked ? "🔒" : ""}
              </button>
            );
          })}
        </div>
        {/* Dropdown filters */}
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ position: "relative" }}>
            {upFilterBtn(UP_TIME_LABELS[upTimeSlot], "time", upTimeSlot !== "all")}
            {upDropdown === "time" && upDdPanel(UP_TIME_SLOTS, upTimeSlot, setUpTimeSlot)}
          </div>
          <div style={{ position: "relative" }}>
            {upFilterBtn(UP_DOW_LABELS[upDow], "dow", upDow !== "all")}
            {upDropdown === "dow" && upDdPanel(UP_DOW_OPTS, upDow, setUpDow)}
          </div>
          <div style={{ position: "relative" }}>
            {upFilterBtn(UP_CO_LABELS[upCompany], "company", upCompany !== "all")}
            {upDropdown === "company" && upDdPanel(UP_CO_OPTS, upCompany, setUpCompany)}
          </div>
          <div style={{ position: "relative" }}>
            {upFilterBtn(UP_WX_LABELS[upWeather], "weather", upWeather !== "all")}
            {upDropdown === "weather" && upDdPanel(UP_WX_OPTS, upWeather, setUpWeather)}
          </div>
          {upHasFilter && (
            <button onClick={(e) => { e.stopPropagation(); setUpTimeSlot("all"); setUpDow("all"); setUpCompany("all"); setUpWeather("all"); setUpDropdown(null); }}
              style={{ padding: "5px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: FN, fontSize: sz(11), background: "#EF444433", color: "#EF4444" }}>
              ✕ リセット
            </button>
          )}
        </div>
        {upCanView ? (<>
          <div style={{ fontSize: sz(10), color: T.textDim, marginBottom: 8, textAlign: "right" }}>{upFiltered.length}件のデータ</div>
          <div style={aC}>
            <div style={{ textAlign: "center", marginBottom: 14 }}>
              <div style={{ fontSize: sz(30), fontWeight: 800, color: T.accent }}>¥{pAvgAll.toLocaleString()}</div>
              <div style={{ fontSize: sz(11), color: T.textDim }}>{pTot}件の平均</div>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={pAvgs} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                <XAxis dataKey="name" tick={{ fontSize: sz(13), fill: T.textDim }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: sz(9), fill: T.textDim }} axisLine={false} tickLine={false} />
                <Tooltip content={(p) => <ChartTip {...p} theme={T} />} cursor={{ fill: `${T.accent}11` }} />
                <Bar isAnimationActive={chartAnim} dataKey="平均単価" radius={[4, 4, 0, 0]}>
                  {pAvgs.map((c, i) => <Cell key={i} fill={c.bg} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div style={{ marginTop: 12 }}>
              {pAvgs.map((c, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: i < 3 ? `1px solid ${T.border}` : "none" }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: c.bg, color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: sz(14), fontWeight: 700 }}>{c.name}</div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: sz(15), fontWeight: 700, color: c.cnt > 0 ? T.text : T.textFaint }}>¥{c.平均単価.toLocaleString()}</span>
                  </div>
                  <span style={{ fontSize: sz(12), color: T.textDim }}>{c.cnt}件</span>
                </div>
              ))}
            </div>
          </div>
        </>) : (
          <PremiumBlur>
            <div style={aC}>
              <div style={{ textAlign: "center", marginBottom: 14 }}>
                <div style={{ fontSize: sz(30), fontWeight: 800, color: T.textDim }}>¥---</div>
                <div style={{ fontSize: sz(11), color: T.textDim }}>---件の平均</div>
              </div>
              <div style={{ height: 160 }} />
              <div style={{ height: 120 }} />
            </div>
          </PremiumBlur>
        )}
      </AnaPage>
    );
  }

  // ═══ AREA ANALYSIS (PREMIUM) ═══
  if (anaScreen === "area") {
    // Filter constants (same as heatmap)
    const AA_PERIODS = [
      { key: "today", label: "今日", free: true },
      { key: "week", label: "1週間", free: false },
      { key: "month", label: "1ヶ月", free: false },
      { key: "half", label: "半年", free: false },
      { key: "all", label: "全期間", free: false },
    ];
    const AA_TIME_SLOTS = [{ key: "all", label: "全時間帯" },{ key: "morning", label: "朝 (6-10)" },{ key: "lunch", label: "昼 (11-14)" },{ key: "afternoon", label: "午後 (15-17)" },{ key: "dinner", label: "夜 (18-21)" },{ key: "night", label: "深夜 (22-5)" }];
    const AA_TIME_LABELS = { all: "時間帯", morning: "朝", lunch: "昼", afternoon: "午後", dinner: "夜", night: "深夜" };
    const AA_DOW_OPTS = [{ key: "all", label: "全曜日" },{ key: "mon", label: "月曜日" },{ key: "tue", label: "火曜日" },{ key: "wed", label: "水曜日" },{ key: "thu", label: "木曜日" },{ key: "fri", label: "金曜日" },{ key: "sat", label: "土曜日" },{ key: "sun", label: "日曜日" }];
    const AA_DOW_LABELS = { all: "曜日", mon: "月", tue: "火", wed: "水", thu: "木", fri: "金", sat: "土", sun: "日" };
    const AA_CO_OPTS = [{ key: "all", label: "全会社" }, ...COS.map(c => ({ key: c.id, label: c.name }))];
    const AA_CO_LABELS = { all: "会社", ...Object.fromEntries(COS.map(c => [c.id, c.letter])) };
    const AA_WX_OPTS = [{ key: "all", label: "全天候" }, ...WEATHER.map(w => ({ key: w.id, label: `${w.icon} ${w.label}` }))];
    const AA_WX_LABELS = { all: "天候", ...Object.fromEntries(WEATHER.map(w => [w.id, w.icon])) };
    const aaHasFilter = aaTimeSlot !== "all" || aaDow !== "all" || aaCompany !== "all" || aaWeather !== "all";

    // Build filtered data for ranking (same logic as useEffect)
    const todayStr4 = tds();
    const nowMs4 = Date.now();
    const msDay4 = 86400000;
    let allDels2 = [
      ...allLogs.flatMap(l => (l.deliveries || []).filter(d2 => !d2.cancelled && (d2.startLat || d2.endLat)).map(d2 => ({ ...d2, _date: l.date }))),
      ...data.deliveries.filter(d2 => !d2.cancelled && (d2.startLat || d2.endLat)).map(d2 => ({ ...d2, _date: data.date })),
    ];
    const aaPer = aaPeriod || "all";
    if (aaPer === "today") { allDels2 = allDels2.filter(d2 => d2._date === todayStr4); }
    else if (aaPer !== "all") {
      const cut = aaPer === "week" ? 7 : aaPer === "month" ? 30 : aaPer === "half" ? 180 : 365;
      const mD2 = new Date(nowMs4 - cut * msDay4);
      const mS2 = `${mD2.getFullYear()}-${String(mD2.getMonth()+1).padStart(2,"0")}-${String(mD2.getDate()).padStart(2,"0")}`;
      allDels2 = allDels2.filter(d2 => d2._date >= mS2);
    }
    if (aaTimeSlot !== "all") {
      const slots = { morning: [6, 10], lunch: [11, 14], afternoon: [15, 17], dinner: [18, 21], night: [22, 5] };
      const [sH, eH] = slots[aaTimeSlot] || [0, 23];
      allDels2 = allDels2.filter(d2 => { const h = new Date(d2.orderTime).getHours(); return sH <= eH ? (h >= sH && h <= eH) : (h >= sH || h <= eH); });
    }
    if (aaDow !== "all") {
      const dowMap = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };
      const target = dowMap[aaDow];
      if (target !== undefined) allDels2 = allDels2.filter(d2 => new Date(d2.orderTime).getDay() === target);
    }
    if (aaCompany !== "all") allDels2 = allDels2.filter(d2 => d2.company === aaCompany);
    if (aaWeather !== "all") {
      const wxDates3 = new Set([...allLogs, data].filter(l => l.weather === aaWeather).map(l => l.date));
      allDels2 = allDels2.filter(d2 => wxDates3.has(d2._date));
    }

    const GRID2 = 0.005;
    const cells2 = {};
    allDels2.forEach(d2 => {
      const lat = d2.endLat || d2.startLat;
      const lng = d2.endLng || d2.startLng;
      if (!lat || !lng) return;
      const gLat = Math.floor(lat / GRID2) * GRID2;
      const gLng = Math.floor(lng / GRID2) * GRID2;
      const key = `${gLat.toFixed(4)}_${gLng.toFixed(4)}`;
      if (!cells2[key]) cells2[key] = { lat: gLat, lng: gLng, totalRev: 0, count: 0, totalMs: 0, names: [] };
      cells2[key].totalRev += (d2.reward || 0);
      cells2[key].count++;
      cells2[key].totalMs += (d2.completeTime && d2.orderTime) ? d2.completeTime - d2.orderTime : 0;
      if (d2.areaName && !cells2[key].names.includes(d2.areaName)) cells2[key].names.push(d2.areaName);
    });
    const ranked = Object.values(cells2)
      .filter(c => c.count >= 2 && c.totalMs > 0)
      .map(c => ({ ...c, hourly: Math.round(c.totalRev / (c.totalMs / 3600000)) }))
      .sort((a, b) => b.hourly - a.hourly);
    const hourlyToColor2 = (h) => {
      if (h >= 2000) return "#16A34A";
      if (h >= 1500) return "#22C55E";
      if (h >= 1200) return "#EAB308";
      if (h >= 900)  return "#F59E0B";
      return "#EF4444";
    };

    // Dropdown helpers
    const aaFilterBtn = (label, ddKey, isActive) => (
      <button onClick={(e) => { e.stopPropagation(); setAaDropdown(aaDropdown === ddKey ? null : ddKey); }}
        style={{ padding: "5px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: FN, fontSize: sz(11), fontWeight: isActive ? 700 : 500, background: isActive ? T.accent : `${T.card}EE`, color: isActive ? "#000" : T.text, boxShadow: "0 2px 6px #0003", display: "flex", alignItems: "center", gap: 4 }}>
        {label}<span style={{ fontSize: sz(8), opacity: 0.6 }}>{aaDropdown === ddKey ? "▲" : "▼"}</span>
      </button>
    );
    const aaDdPanel = (items, current, setter) => (
      <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, boxShadow: "0 8px 24px #0006", padding: 4, minWidth: 130, zIndex: 1002 }}>
        {items.map(item => (
          <button key={item.key} onClick={(e) => { e.stopPropagation(); setter(item.key); setAaDropdown(null); }}
            style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", border: "none", borderRadius: 7, cursor: "pointer", fontFamily: FN, fontSize: sz(12), fontWeight: current === item.key ? 700 : 400, background: current === item.key ? `${T.accent}22` : "transparent", color: current === item.key ? T.accent : T.text }}>
            {current === item.key ? "✓ " : "   "}{item.label}
          </button>
        ))}
      </div>
    );

    return (
      <div style={{ background: T.bg, height: "100vh", maxWidth: 430, margin: "0 auto", fontFamily: FN, color: T.text, display: "flex", flexDirection: "column" }}
        onClick={() => setAaDropdown(null)}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px 8px", flexShrink: 0 }}>
          <div style={{ fontSize: sz(17), fontWeight: 700 }}>🗺️ エリア別分析</div>
          <button style={{ background: "none", border: `1px solid ${T.borderLight}`, borderRadius: 7, color: T.textSub, padding: "4px 10px", fontSize: sz(12), cursor: "pointer", fontFamily: FN }} onClick={() => setScreen("main")}>戻る</button>
        </div>
        {/* Map section */}
        <div style={{ position: "relative", borderTop: `1px solid ${T.border}`, height: "45vh", flexShrink: 0 }}>
          <div ref={aaElRef} style={{ height: "100%", width: "100%" }} />

          {/* Filter overlay */}
          <div style={{ position: "absolute", top: 10, left: 10, right: 10, zIndex: 1000 }}>
            {/* Row 1: Period pills */}
            <div style={{ display: "flex", gap: 3, marginBottom: 6 }}>
              {AA_PERIODS.map(p => {
                const active = (aaPeriod || "all") === p.key;
                const locked = !p.free && !isPremium;
                return (
                  <button key={p.key} onClick={(e) => { e.stopPropagation(); setAaPeriod(p.key); setAaDropdown(null); }}
                    style={{ padding: "5px 0", flex: 1, borderRadius: 8, border: "none", cursor: "pointer", fontFamily: FN, fontSize: sz(10), fontWeight: active ? 700 : 500, background: active ? T.accent : `${T.card}EE`, color: active ? "#000" : locked ? T.textDim : T.text, boxShadow: "0 2px 6px #0003" }}>
                    {p.label}{locked ? "🔒" : ""}
                  </button>
                );
              })}
            </div>
            {/* Row 2: Dropdown filters */}
            <div style={{ display: "flex", gap: 6 }}>
              <div style={{ position: "relative" }}>
                {aaFilterBtn(AA_TIME_LABELS[aaTimeSlot], "time", aaTimeSlot !== "all")}
                {aaDropdown === "time" && aaDdPanel(AA_TIME_SLOTS, aaTimeSlot, setAaTimeSlot)}
              </div>
              <div style={{ position: "relative" }}>
                {aaFilterBtn(AA_DOW_LABELS[aaDow], "dow", aaDow !== "all")}
                {aaDropdown === "dow" && aaDdPanel(AA_DOW_OPTS, aaDow, setAaDow)}
              </div>
              <div style={{ position: "relative" }}>
                {aaFilterBtn(AA_CO_LABELS[aaCompany], "company", aaCompany !== "all")}
                {aaDropdown === "company" && aaDdPanel(AA_CO_OPTS, aaCompany, setAaCompany)}
              </div>
              <div style={{ position: "relative" }}>
                {aaFilterBtn(AA_WX_LABELS[aaWeather], "weather", aaWeather !== "all")}
                {aaDropdown === "weather" && aaDdPanel(AA_WX_OPTS, aaWeather, setAaWeather)}
              </div>
              {aaHasFilter && (
                <button onClick={(e) => { e.stopPropagation(); setAaTimeSlot("all"); setAaDow("all"); setAaCompany("all"); setAaWeather("all"); setAaDropdown(null); }}
                  style={{ padding: "5px 8px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: FN, fontSize: sz(10), background: `${T.card}EE`, color: T.textDim, boxShadow: "0 2px 6px #0003" }}>
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Geocoding progress */}
          {aaGeoProgress && (
            <div style={{ position: "absolute", top: 80, left: 10, zIndex: 1000, background: `${T.card}EE`, borderRadius: 8, padding: "6px 12px", boxShadow: "0 2px 8px #0004", fontSize: sz(10), color: T.textMuted }}>
              エリア名を取得中... ({aaGeoProgress.done}/{aaGeoProgress.total})
            </div>
          )}
          {/* Legend */}
          <div style={{ position: "absolute", bottom: 10, left: 10, right: 10, zIndex: 1000, background: `${T.card}DD`, borderRadius: 10, padding: "8px 12px", boxShadow: "0 2px 8px #0003" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div style={{ fontSize: sz(10), color: T.textDim }}>エリア別 平均時給</div>
              <div style={{ fontSize: sz(12), fontWeight: 700, color: T.accent }}>{allDels2.length}<span style={{ fontSize: sz(9), color: T.textMuted, fontWeight: 500 }}> 件</span></div>
            </div>
            <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", marginBottom: 4 }}>
              {["#EF4444","#F59E0B","#EAB308","#22C55E","#16A34A"].map((c,i) => <div key={i} style={{ flex: 1, background: c }} />)}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: sz(9), color: T.textDim }}>
              <span>〜¥900</span><span>¥1,200</span><span>¥1,500</span><span>¥2,000+</span>
            </div>
          </div>
          <div style={{ position: "absolute", bottom: 60, right: 10, zIndex: 1000, fontSize: 9, color: T.textDim, opacity: 0.7 }}>© OpenStreetMap</div>
          {/* Premium blur overlay on map */}
          {!isPremium && aaPeriod !== "today" && (
            <div style={{ position: "absolute", inset: 0, zIndex: 999, background: `${T.bg}88`, backdropFilter: "blur(3px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontSize: sz(14), fontWeight: 700, color: T.purple, marginBottom: 4 }}>プレミアムで解放</div>
              <div style={{ fontSize: sz(11), color: T.textDim }}>過去データのエリア分析が利用できます</div>
            </div>
          )}
        </div>
        {/* Ranking */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", borderTop: `1px solid ${T.border}` }}>
          <div style={{ fontSize: sz(13), fontWeight: 700, marginBottom: 10 }}>稼げるエリア ランキング</div>
          {!isPremium ? (
            <div style={{ position: "relative" }}>
              <div style={{ filter: "blur(3px)", pointerEvents: "none" }}>
                {ranked.slice(0, 5).map((area, i) => {
                  const color = hourlyToColor2(area.hourly);
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                      <div style={{ fontSize: sz(14), fontWeight: 800, color: T.accent, width: 22, textAlign: "center" }}>{i + 1}</div>
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}><div style={{ fontSize: sz(13), fontWeight: 600, color: T.text }}>{area.names[0] || `エリア${i+1}`}</div></div>
                      <div style={{ fontSize: sz(15), fontWeight: 800, color }}>¥{area.hourly.toLocaleString()}/h</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ fontSize: sz(13), fontWeight: 700, color: T.purple }}>プレミアムで解放</div>
              </div>
            </div>
          ) : (
            <>
              {ranked.length === 0 && (
                <div style={{ textAlign: "center", padding: 20, color: T.textDim, fontSize: sz(12) }}>GPS付きの配達データが不足しています</div>
              )}
              {ranked.slice(0, 10).map((area, i) => {
                const color = hourlyToColor2(area.hourly);
                const name = area.names[0] || `エリア${i + 1}`;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < Math.min(ranked.length, 10) - 1 ? `1px solid ${T.border}` : "none" }}>
                    <div style={{ fontSize: sz(14), fontWeight: 800, color: i < 3 ? T.accent : T.textDim, width: 22, textAlign: "center" }}>{i + 1}</div>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: sz(13), fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                      <div style={{ fontSize: sz(10), color: T.textDim }}>{area.count}件の配達</div>
                    </div>
                    <div style={{ fontSize: sz(15), fontWeight: 800, color, flexShrink: 0 }}>¥{area.hourly.toLocaleString()}<span style={{ fontSize: sz(9), fontWeight: 500 }}>/h</span></div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    );
  }

  if (anaScreen === "heatmap") {
    const RATING_COLORS2 = { good: "#EAB308", normal: "#9CA3AF", bad: "#3B82F6", cancelled: "#EF4444" };
    const PERIODS = [
      { key: "today", label: "本日", free: true },
      { key: "week", label: "1週間", free: false },
      { key: "month", label: "1ヶ月", free: false },
      { key: "half", label: "半年", free: false },
      { key: "year", label: "1年", free: false },
      { key: "all", label: "全期間", free: false },
    ];
    const TIME_SLOTS = [
      { key: "all", label: "全時間" },
      { key: "morning", label: "朝 6-10時" },
      { key: "lunch", label: "昼 11-14時" },
      { key: "afternoon", label: "午後 15-17時" },
      { key: "dinner", label: "夜 18-21時" },
      { key: "night", label: "深夜 22-5時" },
    ];
    const TIME_LABELS = { all: "時間帯", morning: "朝", lunch: "昼", afternoon: "午後", dinner: "夜", night: "深夜" };
    const DOW_OPTS = [
      { key: "all", label: "全曜日" },
      { key: "mon", label: "月曜日" }, { key: "tue", label: "火曜日" }, { key: "wed", label: "水曜日" },
      { key: "thu", label: "木曜日" }, { key: "fri", label: "金曜日" }, { key: "sat", label: "土曜日" }, { key: "sun", label: "日曜日" },
    ];
    const DOW_LABELS = { all: "曜日", mon: "月", tue: "火", wed: "水", thu: "木", fri: "金", sat: "土", sun: "日" };
    const COMPANY_OPTS = [{ key: "all", label: "全会社" }, ...COS.map(c => ({ key: c.id, label: c.name }))];
    const CO_LABELS = { all: "会社", ...Object.fromEntries(COS.map(c => [c.id, c.letter])) };
    const HM_WX_OPTS = [{ key: "all", label: "全天候" }, ...WEATHER.map(w => ({ key: w.id, label: `${w.icon} ${w.label}` }))];
    const HM_WX_LABELS = { all: "天候", ...Object.fromEntries(WEATHER.map(w => [w.id, w.icon])) };

    const periodItem = PERIODS.find(p => p.key === (hmPeriod || "today")) || PERIODS[0];
    const canView = periodItem.free || isPremium;
    const hasFilter = hmTimeSlot !== "all" || hmDow !== "all" || hmCompany !== "all" || hmWeather !== "all";

    // Dropdown trigger button
    const filterBtn = (label, ddKey, isActive) => (
      <button onClick={(e) => { e.stopPropagation(); setHmDropdown(hmDropdown === ddKey ? null : ddKey); }}
        style={{
          padding: "5px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: FN,
          fontSize: sz(11), fontWeight: isActive ? 700 : 500,
          background: isActive ? T.accent : `${T.card}EE`,
          color: isActive ? "#000" : T.text,
          boxShadow: "0 2px 6px #0003", display: "flex", alignItems: "center", gap: 4,
        }}>
        {label}<span style={{ fontSize: sz(8), opacity: 0.6 }}>{hmDropdown === ddKey ? "▲" : "▼"}</span>
      </button>
    );

    // Dropdown panel
    const ddPanel = (items, current, setter) => (
      <div style={{
        position: "absolute", top: "100%", left: 0, marginTop: 4,
        background: T.card, border: `1px solid ${T.border}`, borderRadius: 10,
        boxShadow: "0 8px 24px #0006", padding: 4, minWidth: 130, zIndex: 1002,
      }}>
        {items.map(item => (
          <button key={item.key}
            onClick={(e) => { e.stopPropagation(); setter(item.key); setHmDropdown(null); }}
            style={{
              display: "block", width: "100%", textAlign: "left", padding: "8px 12px",
              border: "none", borderRadius: 7, cursor: "pointer", fontFamily: FN,
              fontSize: sz(12), fontWeight: current === item.key ? 700 : 400,
              background: current === item.key ? `${T.accent}22` : "transparent",
              color: current === item.key ? T.accent : T.text,
            }}>
            {current === item.key ? "✓ " : "   "}{item.label}
          </button>
        ))}
      </div>
    );

    return (
      <div style={{ background: T.bg, height: "100vh", maxWidth: 430, margin: "0 auto", fontFamily: FN, color: T.text }}
        onClick={() => setHmDropdown(null)}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px 8px", height: 48 }}>
          <div style={{ fontSize: sz(17), fontWeight: 700 }}>📍 注文ヒートマップ</div>
          <button style={{ background: "none", border: `1px solid ${T.borderLight}`, borderRadius: 7, color: T.textSub, padding: "4px 10px", fontSize: sz(12), cursor: "pointer", fontFamily: FN }} onClick={() => setScreen("main")}>戻る</button>
        </div>
        <div style={{ height: "calc(100vh - 48px)", position: "relative", borderTop: `1px solid ${T.border}` }}>
          <div ref={hmElRef} style={{ height: "100%", width: "100%" }} />

          {/* Filter overlay */}
          <div style={{ position: "absolute", top: 10, left: 10, right: 10, zIndex: 1000 }}>
            {/* Row 1: Period pills */}
            <div style={{ display: "flex", gap: 3, marginBottom: 6 }}>
              {PERIODS.map(p => {
                const active = (hmPeriod || "today") === p.key;
                const locked = !p.free && !isPremium;
                return (
                  <button key={p.key} onClick={(e) => { e.stopPropagation(); setHmPeriod(p.key); setHmDropdown(null); }}
                    style={{
                      padding: "5px 0", flex: 1, borderRadius: 8, border: "none", cursor: "pointer", fontFamily: FN,
                      fontSize: sz(10), fontWeight: active ? 700 : 500,
                      background: active ? T.accent : `${T.card}EE`,
                      color: active ? "#000" : locked ? T.textDim : T.text,
                      boxShadow: "0 2px 6px #0003",
                    }}>
                    {p.label}{locked ? "🔒" : ""}
                  </button>
                );
              })}
            </div>
            {/* Row 2: Dropdown filter triggers */}
            <div style={{ display: "flex", gap: 6 }}>
              <div style={{ position: "relative" }}>
                {filterBtn(TIME_LABELS[hmTimeSlot], "time", hmTimeSlot !== "all")}
                {hmDropdown === "time" && ddPanel(TIME_SLOTS, hmTimeSlot, setHmTimeSlot)}
              </div>
              <div style={{ position: "relative" }}>
                {filterBtn(DOW_LABELS[hmDow], "dow", hmDow !== "all")}
                {hmDropdown === "dow" && ddPanel(DOW_OPTS, hmDow, setHmDow)}
              </div>
              <div style={{ position: "relative" }}>
                {filterBtn(CO_LABELS[hmCompany], "company", hmCompany !== "all")}
                {hmDropdown === "company" && ddPanel(COMPANY_OPTS, hmCompany, setHmCompany)}
              </div>
              <div style={{ position: "relative" }}>
                {filterBtn(HM_WX_LABELS[hmWeather], "weather", hmWeather !== "all")}
                {hmDropdown === "weather" && ddPanel(HM_WX_OPTS, hmWeather, setHmWeather)}
              </div>
              {hasFilter && (
                <button onClick={(e) => { e.stopPropagation(); setHmTimeSlot("all"); setHmDow("all"); setHmCompany("all"); setHmWeather("all"); setHmDropdown(null); }}
                  style={{ padding: "5px 8px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: FN, fontSize: sz(10), background: `${T.card}EE`, color: T.textDim, boxShadow: "0 2px 6px #0003" }}>
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Premium blur overlay */}
          {!canView && (
            <div style={{ position: "absolute", inset: 0, zIndex: 999, background: `${T.bg}88`, backdropFilter: "blur(3px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontSize: sz(14), fontWeight: 700, color: T.purple, marginBottom: 4 }}>プレミアムで解放</div>
              <div style={{ fontSize: sz(11), color: T.textDim }}>過去データの地図表示が利用できます</div>
            </div>
          )}

          {/* Legend + count */}
          <div style={{ position: "absolute", bottom: 10, left: 10, right: 10, zIndex: 1000, display: "flex", justifyContent: "space-between", alignItems: "center", background: `${T.card}DD`, borderRadius: 10, padding: "8px 12px", boxShadow: "0 2px 8px #0003" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[["good", "高評価"], ["normal", "普通"], ["bad", "低評価"], ["cancelled", "ｷｬﾝｾﾙ"]].map(([k, label]) => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: RATING_COLORS2[k] }} />
                  <span style={{ fontSize: sz(9), color: T.textMuted }}>{label}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: sz(13), fontWeight: 700, color: T.accent }}>{hmPinCount}<span style={{ fontSize: sz(10), color: T.textMuted, fontWeight: 500 }}> 件</span></div>
          </div>

          {/* OSM attribution */}
          <div style={{ position: "absolute", bottom: 52, right: 10, zIndex: 1000, fontSize: 9, color: T.textDim, opacity: 0.7 }}>© OpenStreetMap</div>
        </div>
      </div>
    );
  }

  // ═══ MAIN ═══
  const stTx = isOn ? (isBrk ? "休憩中" : isJz ? "地蔵中" : hasOrd ? "配達中" : "待機中") : hasWrk ? "オフライン" : "未開始";
  const stCo = isOn ? (isJz ? "#F59E0B" : "#22C55E") : hasWrk ? "#F59E0B" : T.textDim;

  return (
    <div style={{ fontFamily: FN, background: T.bg, color: T.text, height: "100vh", maxWidth: 430, margin: "0 auto", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
      {PopupEl}{WeatherEl}{GoalEl}{MenuEl}{TutorialEl}

      {/* Flash feedback handled via inline styles */}

      {/* ─── Otsukare Card ─── */}
      {otsukareData && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: T.overlayHard, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 400, fontFamily: FN }}>
          <div style={{ background: T.card, borderRadius: 20, padding: "28px 24px", textAlign: "center", maxWidth: 320, width: "88%", border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: sz(28), marginBottom: 8 }}>🎉</div>
            <div style={{ fontSize: sz(18), fontWeight: 800, color: T.text, marginBottom: 4 }}>おつかれさまでした！</div>
            {otsukareData.isNewBest && <div style={{ fontSize: sz(13), fontWeight: 700, color: "#EF4444", marginBottom: 8 }}>🏆 自己ベスト更新！</div>}
            <div style={{ fontSize: sz(12), color: T.textDim, marginBottom: 16 }}>本日の成績</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              <div style={{ background: T.barBg, borderRadius: 10, padding: "10px 8px" }}>
                <div style={{ fontSize: sz(10), color: T.textDim }}>配達件数</div>
                <div style={{ fontSize: sz(22), fontWeight: 800, color: T.accent }}>{otsukareData.delCnt}件</div>
              </div>
              <div style={{ background: T.barBg, borderRadius: 10, padding: "10px 8px" }}>
                <div style={{ fontSize: sz(10), color: T.textDim }}>売上合計</div>
                <div style={{ fontSize: sz(22), fontWeight: 800, color: T.accent }}>¥{otsukareData.total.toLocaleString()}</div>
              </div>
              <div style={{ background: T.barBg, borderRadius: 10, padding: "10px 8px" }}>
                <div style={{ fontSize: sz(10), color: T.textDim }}>基本時給</div>
                <div style={{ fontSize: sz(18), fontWeight: 800, color: T.accent }}>¥{otsukareData.hrBase.toLocaleString()}</div>
              </div>
              <div style={{ background: T.barBg, borderRadius: 10, padding: "10px 8px" }}>
                <div style={{ fontSize: sz(10), color: T.purple }}>実質時給</div>
                <div style={{ fontSize: sz(18), fontWeight: 800, color: T.purple }}>¥{otsukareData.hrAll.toLocaleString()}</div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "center", gap: 16, marginBottom: 16 }}>
              <div><div style={{ fontSize: sz(10), color: T.textDim }}>稼働時間</div><div style={{ fontSize: sz(14), fontWeight: 700, color: T.text }}>{fd(otsukareData.workTime)}</div></div>
              <div><div style={{ fontSize: sz(10), color: T.textDim }}>連続稼働</div><div style={{ fontSize: sz(14), fontWeight: 700, color: "#F59E0B" }}>{otsukareData.streak}日</div></div>
            </div>

            <button onClick={() => { setOtsukareData(null); if (weeklyReviewData) setWeeklyReview(weeklyReviewData); }} style={{ width: "100%", height: 48, borderRadius: 12, border: "none", background: T.accent, color: "#000", fontSize: sz(15), fontWeight: 700, cursor: "pointer", fontFamily: FN }}>閉じる</button>
          </div>
        </div>
      )}

      {/* ─── Today Guide Toast ─── */}
      {todayGuide && (
        <div style={{ position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)", zIndex: 350, background: T.card, border: `1px solid ${T.accent}44`, borderRadius: 14, padding: "12px 20px", boxShadow: "0 4px 20px #0004", maxWidth: 320, width: "85%", textAlign: "center", fontFamily: FN }}>
          <div style={{ fontSize: sz(13), fontWeight: 700, color: T.accent, marginBottom: 4 }}>💪 今日の目安</div>
          <div style={{ fontSize: sz(12), color: T.text, lineHeight: 1.6 }}>
            目標まで <span style={{ fontWeight: 700, color: T.accent }}>¥{todayGuide.remaining.toLocaleString()}</span>
            {todayGuide.estDels > 0 && <span>（約{todayGuide.estDels}件）</span>}
          </div>
        </div>
      )}

      {/* ─── Action Toast (button feedback) ─── */}
      {actionToast && (
        <div style={{
          position: "fixed", bottom: BBH + 50, left: "50%", transform: "translateX(-50%)",
          zIndex: 350, background: T.text, color: T.bg, borderRadius: 12,
          padding: "10px 24px", boxShadow: "0 4px 20px #0006",
          fontSize: sz(15), fontWeight: 700, fontFamily: FN,
          whiteSpace: "nowrap",
        }}>
          {actionToast}
        </div>
      )}

      {/* ─── Weather Chance Toast ─── */}
      {weatherChance && (
        <div style={{ position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)", zIndex: 350, background: T.card, border: `1px solid ${weatherChance.diff > 0 ? "#22C55E44" : "#EF444444"}`, borderRadius: 14, padding: "12px 20px", boxShadow: "0 4px 20px #0004", maxWidth: 320, width: "85%", textAlign: "center", fontFamily: FN }}>
          <div style={{ fontSize: sz(20), marginBottom: 4 }}>{weatherChance.icon}</div>
          <div style={{ fontSize: sz(12), color: T.text, lineHeight: 1.6 }}>
            {weatherChance.label}の日はあなたの時給が平均
            <span style={{ fontWeight: 800, color: weatherChance.diff > 0 ? "#22C55E" : "#EF4444" }}>
              {weatherChance.diff > 0 ? "+" : ""}¥{weatherChance.diff.toLocaleString()}
            </span>
            {weatherChance.diff > 0 ? " 高い" : " 低い"}実績があります
          </div>
        </div>
      )}

      {/* ─── Delivery Feedback Toast ─── */}
      {deliveryFeedback && (
        <div style={{ position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)", zIndex: 360, maxWidth: 340, width: "85%", fontFamily: FN, animation: "none" }}>
          <div style={{ background: `${deliveryFeedback.color}18`, border: `1.5px solid ${deliveryFeedback.color}55`, borderRadius: 14, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, boxShadow: `0 8px 24px ${deliveryFeedback.color}22` }}>
            <span style={{ fontSize: sz(28) }}>{deliveryFeedback.icon}</span>
            <div>
              <div style={{ fontSize: sz(14), fontWeight: 700, color: deliveryFeedback.color }}>{deliveryFeedback.msg}</div>
              <div style={{ fontSize: sz(10), color: T.textMuted, marginTop: 1 }}>{deliveryFeedback.detail}</div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Milestone Modal ─── */}
      {milestone && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: T.overlayHard, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, fontFamily: FN }}
          onClick={() => setMilestone(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: `linear-gradient(135deg, ${T.card}, ${T.purpleBg})`, border: `2px solid ${T.accent}`, borderRadius: 20, padding: "28px 32px", textAlign: "center", maxWidth: 300, width: "82%", boxShadow: `0 0 50px ${T.accent}22` }}>
            <div style={{ fontSize: 52, marginBottom: 6 }}>{milestone.icon}</div>
            <div style={{ fontSize: sz(24), fontWeight: 800, color: T.accent, marginBottom: 4 }}>{milestone.title}</div>
            <div style={{ fontSize: sz(12), color: T.textSub, marginBottom: 14 }}>{milestone.sub}</div>
            <div style={{ fontSize: sz(11), color: T.textMuted, marginBottom: 18 }}>{milestone.stat}</div>
            <button onClick={() => setMilestone(null)} style={{ background: T.accent, color: "#000", border: "none", borderRadius: 12, padding: "12px 36px", fontSize: sz(14), fontWeight: 700, cursor: "pointer", fontFamily: FN }}>すごい！</button>
          </div>
        </div>
      )}

      {/* ─── Weekly Review Modal ─── */}
      {weeklyReview && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: T.overlayHard, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 400, fontFamily: FN }}>
          <div style={{ background: T.card, borderRadius: 20, padding: "24px 20px", textAlign: "center", maxWidth: 320, width: "88%", border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: sz(16), fontWeight: 800, color: T.accent, marginBottom: 12 }}>📊 今週のふりかえり</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              <div style={{ background: T.barBg, borderRadius: 10, padding: "10px 8px" }}>
                <div style={{ fontSize: sz(9), color: T.textDim }}>今週の時給</div>
                <div style={{ fontSize: sz(20), fontWeight: 800, color: T.accent }}>¥{weeklyReview.tw.hr.toLocaleString()}</div>
                {weeklyReview.hrDiff !== 0 && <div style={{ fontSize: sz(10), fontWeight: 700, color: weeklyReview.hrDiff > 0 ? "#22C55E" : "#EF4444" }}>{weeklyReview.hrDiff > 0 ? "↑" : "↓"}¥{Math.abs(weeklyReview.hrDiff).toLocaleString()} vs先週</div>}
              </div>
              <div style={{ background: T.barBg, borderRadius: 10, padding: "10px 8px" }}>
                <div style={{ fontSize: sz(9), color: T.textDim }}>今週の売上</div>
                <div style={{ fontSize: sz(20), fontWeight: 800, color: T.text }}>¥{weeklyReview.tw.rev.toLocaleString()}</div>
                <div style={{ fontSize: sz(10), color: T.textDim }}>{weeklyReview.tw.cnt}件配達</div>
              </div>
            </div>
            {weeklyReview.delDiff > 0 && (
              <div style={{ background: "#22C55E15", borderRadius: 10, padding: "8px 12px", marginBottom: 10, border: "1px solid #22C55E33" }}>
                <div style={{ fontSize: sz(11), color: "#22C55E", fontWeight: 600 }}>配達効率が先週より{weeklyReview.delDiff}分短縮</div>
              </div>
            )}
            {weeklyReview.tw.bestDay && (
              <div style={{ fontSize: sz(12), color: T.textMuted, marginBottom: 12 }}>
                ベスト曜日: <span style={{ fontWeight: 700, color: T.accent }}>{weeklyReview.tw.bestDay}</span>（¥{weeklyReview.tw.bestRev.toLocaleString()}）
              </div>
            )}
            <button onClick={() => setWeeklyReview(null)} style={{ width: "100%", height: 44, borderRadius: 12, border: "none", background: T.accent, color: "#000", fontSize: sz(14), fontWeight: 700, cursor: "pointer", fontFamily: FN }}>閉じる</button>
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", paddingBottom: BBH + 28 }}>

        {/* Header */}
        <div style={{ padding: "10px 16px 4px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: sz(17), fontWeight: 700 }}>配達ログ</div>
            <div style={{ fontSize: sz(11), color: T.textDim }}>{new Date().toLocaleDateString("ja-JP", { month: "short", day: "numeric", weekday: "short" })}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {streak >= 2 && <div style={{ fontSize: sz(10), fontWeight: 700, color: "#F59E0B", background: "#F59E0B18", padding: "2px 8px", borderRadius: 6 }}>🔥{streak}日連続</div>}
            <button onClick={() => setMenu(true)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, fontSize: sz(22), color: T.textSub, lineHeight: 1 }}>☰</button>
          </div>
        </div>

        {/* Monthly goal - clean gauge */}
        {goal > 0 && (() => {
          const done = gPct >= 100;
          const barColor = done
            ? (T === LIGHT ? "linear-gradient(90deg, #16A34A, #22C55E)" : "linear-gradient(90deg, #16A34A, #4ADE80)")
            : (T === LIGHT ? "linear-gradient(90deg, #D97706, #F59E0B)" : "linear-gradient(90deg, #F59E0B, #FACC15)");
          const pctColor = done ? "#22C55E" : T.accent;
          const remaining = Math.max(0, goal - mRev);
          return (
            <div style={{ padding: "4px 16px 4px" }}>
              <div style={{ background: T.card, borderRadius: 14, padding: "14px 16px", border: `1px solid ${T.border}` }}>
                {/* Header: label + percentage */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: sz(10), color: T.textDim, letterSpacing: 1, marginBottom: 2 }}>月間目標</div>
                    <div style={{ fontSize: sz(11), color: T.textMuted }}>¥{goal.toLocaleString()}</div>
                  </div>
                  <div style={{ fontSize: sz(28), fontWeight: 800, color: pctColor, lineHeight: 1 }}>
                    {gPct}%
                  </div>
                </div>
                {/* Progress bar */}
                <div style={{ height: 10, background: T.barBg, borderRadius: 5, overflow: "hidden", marginBottom: 8 }}>
                  <div style={{ height: "100%", width: `${Math.min(gPct, 100)}%`, borderRadius: 5, background: barColor, transition: "width 0.5s ease-out" }} />
                </div>
                {/* Bottom: current revenue + remaining */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontSize: sz(15), fontWeight: 700, color: T.text }}>¥{mRev.toLocaleString()}</div>
                  {done
                    ? <div style={{ fontSize: sz(11), fontWeight: 600, color: "#22C55E" }}>目標達成</div>
                    : <div style={{ fontSize: sz(11), color: T.textMuted }}>残り ¥{remaining.toLocaleString()}</div>
                  }
                </div>
                {/* Calendar toggle */}
                <div onClick={() => setCalOpen(!calOpen)} style={{ marginTop: 8, textAlign: "center", cursor: "pointer", padding: "4px 0" }}>
                  <span style={{ fontSize: sz(10), color: T.textDim }}>{calOpen ? "▲ カレンダーを閉じる" : "▼ 稼働カレンダー"}</span>
                </div>
                {/* Calendar (expandable) */}
                {calOpen && (() => {
                  const now2 = new Date();
                  const yr = now2.getFullYear(), mn = now2.getMonth();
                  const firstDay = new Date(yr, mn, 1).getDay(); // 0=Sun
                  const daysInMonth = new Date(yr, mn + 1, 0).getDate();
                  const todayD = now2.getDate();
                  // Build revenue map for this month
                  const mPrefix = `${yr}-${String(mn+1).padStart(2,"0")}`;
                  const revMap = {};
                  allLogs.filter(l => l.date?.startsWith(mPrefix)).forEach(l => { revMap[parseInt(l.date.slice(8,10),10)] = dayRev(l, false); });
                  if (data.date?.startsWith(mPrefix)) revMap[todayD] = totRew;
                  const maxRev = Math.max(1, ...Object.values(revMap));
                  const revColor = (r) => {
                    if (!r) return "transparent";
                    const ratio = r / maxRev;
                    if (ratio >= 0.8) return "#16A34AAA";
                    if (ratio >= 0.5) return "#16A34A66";
                    if (ratio >= 0.25) return "#16A34A44";
                    return "#16A34A22";
                  };
                  const DOW_H = ["日","月","火","水","木","金","土"];
                  const cells = [];
                  for (let i = 0; i < firstDay; i++) cells.push(null);
                  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
                  while (cells.length % 7 !== 0) cells.push(null);
                  const workDays = Object.keys(revMap).length;
                  return (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
                        {DOW_H.map((dh, i) => (
                          <div key={`h${i}`} style={{ textAlign: "center", fontSize: sz(9), color: i === 0 ? "#EF4444" : i === 6 ? "#3B82F6" : T.textMuted, padding: "2px 0" }}>{dh}</div>
                        ))}
                        {cells.map((d, i) => {
                          if (d === null) return <div key={i} />;
                          const rv = revMap[d];
                          const isToday = d === todayD;
                          const isFuture = d > todayD;
                          return (
                            <div key={i} style={{ aspectRatio: "1", borderRadius: 5, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: isFuture ? "transparent" : revColor(rv), border: isToday ? `1.5px solid ${T.accent}` : "none" }}>
                              <div style={{ fontSize: sz(9), color: isFuture ? T.textFaint : isToday ? T.accent : rv ? "#F5F5F5" : T.textMuted, fontWeight: isToday ? 700 : 400 }}>{d}</div>
                              {rv > 0 && <div style={{ fontSize: sz(7), color: "#FACC15", fontWeight: 700 }}>¥{rv >= 10000 ? `${Math.round(rv/1000)}k` : rv >= 1000 ? `${(rv/1000).toFixed(1)}k` : rv}</div>}
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                        <span style={{ fontSize: sz(9), color: T.textMuted }}>{workDays}日稼働 / {daysInMonth}日</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                          <span style={{ fontSize: sz(8), color: T.textMuted }}>少</span>
                          {["#16A34A33","#16A34A55","#16A34A88","#16A34ABB"].map((c,i) => <div key={i} style={{ width: 10, height: 10, borderRadius: 2, background: c }} />)}
                          <span style={{ fontSize: sz(8), color: T.textMuted }}>多</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          );
        })()}

        {/* ─── Smart Indicators ─── */}
        {isOn && (goldenTime || nudge || pacePredict || personalBests.todayNewBestRev || personalBests.todayNewBestDel || personalBests.todayNewBestHr) && (
          <div style={{ padding: "4px 16px 2px", display: "flex", flexDirection: "column", gap: 4 }}>
            {/* Golden Time */}
            {goldenTime && (
              <div style={{ background: goldenTime.type === "golden" ? "#F59E0B15" : goldenTime.type === "slow" ? `${T.card}` : `${T.card}`, borderRadius: 10, padding: "8px 12px", border: `1px solid ${goldenTime.type === "golden" ? "#F59E0B44" : T.border}`, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: sz(16) }}>{goldenTime.type === "golden" ? "🔥" : goldenTime.type === "slow" ? "😌" : "📊"}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: sz(11), fontWeight: 700, color: goldenTime.type === "golden" ? "#F59E0B" : T.textSub }}>{goldenTime.label}</div>
                  <div style={{ fontSize: sz(10), color: T.textDim }}>この時間帯の平均時給 ¥{goldenTime.hr.toLocaleString()}</div>
                </div>
              </div>
            )}
            {/* Nudge - あと少し */}
            {nudge && nudge.type === "close" && (
              <div style={{ background: "#22C55E12", borderRadius: 10, padding: "8px 12px", border: "1px solid #22C55E33", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: sz(16) }}>🎯</span>
                <div style={{ fontSize: sz(12), color: T.text }}>
                  あと <span style={{ fontWeight: 800, color: "#22C55E" }}>¥{nudge.remaining.toLocaleString()}</span> で日次目標達成！
                  <span style={{ color: T.textDim, fontSize: sz(10) }}>（約{nudge.estDels}件）</span>
                </div>
              </div>
            )}
            {nudge && nudge.type === "done" && (
              <div style={{ background: "#22C55E15", borderRadius: 10, padding: "8px 12px", border: "1px solid #22C55E44", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: sz(16) }}>🏅</span>
                <div style={{ fontSize: sz(12), fontWeight: 700, color: "#22C55E" }}>日次目標達成！おめでとうございます</div>
              </div>
            )}
            {/* Pace Prediction */}
            {pacePredict && !nudge && (
              <div style={{ background: T.card, borderRadius: 10, padding: "8px 12px", border: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: sz(16) }}>📈</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: sz(11), color: T.textSub }}>このペースの着地予測</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontSize: sz(16), fontWeight: 800, color: T.accent }}>¥{pacePredict.predicted.toLocaleString()}</span>
                    {pacePredict.pctOfGoal > 0 && <span style={{ fontSize: sz(10), color: pacePredict.pctOfGoal >= 100 ? "#22C55E" : T.textDim }}>目標比{pacePredict.pctOfGoal}%</span>}
                  </div>
                </div>
              </div>
            )}
            {/* Personal Best celebration */}
            {personalBests.todayNewBestRev && (
              <div style={{ background: "#EF444412", borderRadius: 10, padding: "8px 12px", border: "1px solid #EF444433", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: sz(16) }}>🏆</span>
                <div style={{ fontSize: sz(12), fontWeight: 700, color: "#EF4444" }}>自己ベスト更新中！ 1日売上 ¥{totAll.toLocaleString()}</div>
              </div>
            )}
            {personalBests.todayNewBestHr && !personalBests.todayNewBestRev && (
              <div style={{ background: "#F59E0B12", borderRadius: 10, padding: "8px 12px", border: "1px solid #F59E0B33", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: sz(16) }}>⚡</span>
                <div style={{ fontSize: sz(12), fontWeight: 700, color: "#F59E0B" }}>時給自己ベスト更新中！ ¥{hAll.toLocaleString()}/h</div>
              </div>
            )}
          </div>
        )}

        {/* Weather */}
        <div style={{ padding: "8px 16px 6px", display: "flex", gap: 8 }}>
          {WEATHER.map(w => { const sel = data.weather === w.id; return (
            <button key={w.id} onClick={() => update(d => { d.weather = w.id; })} style={{ flex: 1, height: 52, borderRadius: 12, border: sel ? `2.5px solid ${T.accent}` : `1.5px solid ${T.borderLight}`, background: sel ? `${T.accent}18` : T.card, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: sel ? `0 0 10px ${T.accent}30` : "none" }}>
              <span style={{ fontSize: sz(20) }}>{w.icon}</span><span style={{ fontSize: sz(9), marginTop: 3, color: sel ? T.accent : T.textMuted, fontFamily: FN, fontWeight: sel ? 600 : 400 }}>{w.label}</span>
            </button>); })}
        </div>

        {/* Summary */}
        <div style={{ padding: "6px 16px 0" }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
            <div style={{ flex: 1, background: T.card, borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: sz(32), fontWeight: 800, color: T.accent, lineHeight: 1 }}>{delCnt}</div>
              <div><div style={{ fontSize: sz(11), color: T.textMuted }}>配達</div>{canCnt > 0 && <div style={{ fontSize: sz(9), color: "#EF4444" }}>ｷｬﾝｾﾙ{canCnt}</div>}</div>
            </div>
            <div style={{ flex: 2, background: T.card, borderRadius: 12, padding: "12px 14px", border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: sz(11), color: T.textMuted, marginBottom: 2 }}>{settings.incInReward ? "配達報酬+ｲﾝｾﾝﾃｨﾌﾞ" : "配達報酬"}</div>
              <AutoFitText value={`¥${rewardDisplay.toLocaleString()}`} maxSize={sz(26)} color={T.accent} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 6 }}>
            <div style={{ flex: 1, background: T.card, borderRadius: 12, padding: "10px 10px", textAlign: "center", overflow: "hidden", border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: sz(10), color: T.purple, marginBottom: 3 }}>インセンティブ</div>
              <AutoFitText value={`¥${totInc.toLocaleString()}`} maxSize={sz(20)} color={T.purple} />
            </div>
            <div style={{ flex: 1, background: T.card, borderRadius: 12, padding: "10px 10px", textAlign: "center", overflow: "hidden", border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: sz(10), color: T.textMuted, marginBottom: 3 }}>基本時給</div>
              <AutoFitText value={`¥${hBase.toLocaleString()}`} maxSize={sz(20)} color={T.accent} />
            </div>
            <div style={{ flex: 1, background: T === LIGHT ? T.purpleBg : "#2D1B6944", borderRadius: 12, padding: "10px 10px", textAlign: "center", border: `1px solid ${T.purpleBorder}`, overflow: "hidden" }}>
              <div style={{ fontSize: sz(10), color: T.purple, marginBottom: 3 }}>実質時給</div>
              <AutoFitText value={`¥${hAll.toLocaleString()}`} maxSize={sz(20)} color={T.purple} />
            </div>
          </div>
        </div>

        {/* Status */}
        {(() => {
          const actDelMs = actDels.reduce((s, d) => s + (d.completeTime && d.orderTime ? d.completeTime - d.orderTime : 0), 0);
          const wasteMs2 = Math.max(0, sesMs - actDelMs - tBrkMs);
          return (
            <div style={{ display: "flex", gap: 8, padding: "2px 16px 6px", alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: sz(12), color: stCo, fontWeight: 700 }}>{stTx}</span>
              <span style={{ color: T.borderLight }}>│</span>
              <span style={{ fontSize: sz(12), color: T.textSub }}>{fd(sesMs)}</span>
              <span style={{ color: T.borderLight }}>│</span>
              <span style={{ fontSize: sz(12), color: "#22C55E" }}>配達{fd(actDelMs)}</span>
              <span style={{ color: T.borderLight }}>│</span>
              <span style={{ fontSize: sz(12), color: "#EF4444" }}>無職{fd(wasteMs2)}</span>
              <span style={{ color: T.borderLight }}>│</span>
              <span style={{ fontSize: sz(12), color: T.textMuted }}>休憩{fd(tBrkMs)}</span>
              {(isOn || hasWrk) && <><span style={{ color: T.borderLight }}>│</span><span style={{ fontSize: sz(12), color: T.textMuted }}>{ft(data.sessions[0]?.start || data.currentSessionStart)}〜</span></>}
            </div>
          );
        })()}

        {/* Buttons */}
        <div style={{ padding: "0 16px" }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <button style={flashBtn("#22C55E", isOn, BH, "online")} onClick={doOnline} disabled={isOn}>{isOn ? "● オンライン" : "オンライン"}</button>
            <button style={btn("#EF4444", !isOn)} onClick={doOffline} disabled={!isOn}>オフライン</button>
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <button style={flashBtn("#6366F1", !isOn || isBrk || hasOrd, BH, "brkS")} onClick={doBrkS} disabled={!isOn || isBrk || hasOrd}>休憩開始</button>
            <button style={flashBtn("#8B5CF6", !isBrk, BH, "brkE")} onClick={doBrkE} disabled={!isBrk}>休憩終了</button>
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <button onClick={doJz} disabled={!isOn || isBrk || hasOrd} style={{ flex: 1, height: 42, borderRadius: 10, border: isJz ? "2px solid #F59E0B" : `1.5px solid #F59E0B33`, background: isJz ? "#F59E0B22" : T.card, color: (!isOn || isBrk || hasOrd) ? T.textFaint : isJz ? "#F59E0B" : "#F59E0B99", fontSize: sz(13), fontWeight: 600, fontFamily: FN, opacity: (!isOn || isBrk || hasOrd) ? 0.4 : 1, cursor: (!isOn || isBrk || hasOrd) ? "default" : "pointer" }}>{isJz ? "● 地蔵中..." : "地蔵"}</button>
            <button onClick={openDI} style={{ flex: 1, height: 42, borderRadius: 10, border: `1.5px solid ${T.purpleBorder}`, background: T.card, color: T.purple, fontSize: sz(13), fontWeight: 600, fontFamily: FN, cursor: "pointer" }}>+ 日次ｲﾝｾﾝﾃｨﾌﾞ</button>
          </div>
        </div>

        {/* Delivery list */}
        {data.deliveries.length > 0 && (
          <div style={{ padding: "6px 16px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <div style={{ fontSize: sz(10), color: T.textDim, letterSpacing: 1, fontWeight: 600 }}>本日の配達（タップで編集）</div>
              <div style={{ fontSize: sz(10), color: T.textDim }}>{delCnt}件</div>
            </div>
            <div style={{ background: T.cardAlt, borderRadius: 12, border: `1px solid ${T.border}`, overflow: "hidden" }}>
              <style>{`.dlb::-webkit-scrollbar{width:4px}.dlb::-webkit-scrollbar-track{background:transparent}.dlb::-webkit-scrollbar-thumb{background:${T.borderLight};border-radius:2px}`}</style>
              <div className="dlb" style={{ maxHeight: 230, overflowY: "auto", padding: "4px 12px", scrollbarWidth: "thin", scrollbarColor: `${T.borderLight} transparent` }}>
                {[...data.deliveries].reverse().map((d, i) => {
                  const ri = data.deliveries.length - 1 - i;
                  const c = COS.find(cc => cc.id === d.company);
                  const ot = OT.find(t => t.id === d.orderType);
                  const dur = d.completeTime && d.orderTime ? d.completeTime - d.orderTime : 0;
                  return (
                    <div key={i} onClick={() => openEdit(ri)} style={{ display: "flex", alignItems: "center", gap: 0, padding: "7px 0", borderBottom: i < data.deliveries.length - 1 ? `1px solid ${T.border}` : "none", cursor: "pointer" }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: d.cancelled ? T.textFaint : (c?.bg || "#333"), color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: sz(15), fontWeight: 700, flexShrink: 0, marginRight: 8 }}>{c?.letter || "?"}</div>
                      <div style={{ flex: 1, minWidth: 0, marginRight: 6 }}>
                        {d.cancelled ? <div style={{ fontSize: sz(12), color: "#EF4444", fontWeight: 600 }}>キャンセル</div> : (
                          <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                            <span style={{ fontSize: sz(14), fontWeight: 700, color: T.text }}>¥{(d.reward || 0).toLocaleString()}</span>
                            {(d.incentive || 0) > 0 && <span style={{ fontSize: sz(9), color: T.purple }}>+¥{d.incentive.toLocaleString()}</span>}
                          </div>
                        )}
                      </div>
                      {ot && ot.c > 1 && <div style={{ fontSize: sz(10), fontWeight: 700, color: "#F59E0B", background: "#F59E0B22", padding: "2px 5px", borderRadius: 4, flexShrink: 0, marginRight: 4 }}>{ot.short}</div>}
                      {d.rating && !d.cancelled && <div style={{ width: 8, height: 8, borderRadius: 4, background: d.rating === "good" ? "#EAB308" : d.rating === "bad" ? "#3B82F6" : T.textDim, flexShrink: 0, marginRight: 6 }} />}
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: sz(11), color: T.textSub, whiteSpace: "nowrap" }}>{ft(d.orderTime)}〜{ft(d.completeTime)}</div>
                        <div style={{ fontSize: sz(10), color: T.textMuted }}>{fm(dur)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        <div style={{ height: 16 }} />
      </div>

      {/* Fixed bottom */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "10px 16px 18px", background: `linear-gradient(transparent, ${T.bg} 30%)`, display: "flex", gap: 8, zIndex: 50 }}>
        <button style={flashBtn("#0EA5E9", !isOn || isBrk || hasOrd, BBH, "order")} onClick={doOrd} disabled={!isOn || isBrk || hasOrd}>受注</button>
        <button style={flashBtn("#F59E0B", !hasOrd, BBH, "complete")} onClick={doCmp} disabled={!hasOrd}>配達完了</button>
      </div>
    </div>
  );
}
