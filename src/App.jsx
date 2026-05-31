import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from "recharts";
import { storage, ensureDB } from "./db";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { DARK, LIGHT } from "./themes";
import { WEATHER, COS, OT, NP, FN, BH, BBH } from "./constants";
import { tds, toLD, ms, sv, svByDate, lt, la, lg, sg, ls, ss, getPos, fetchWeather, ft, fd, fm, dc, newDay, defaultSettings, migrate, dayRev, reverseGeocode } from "./utils";
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
  const [cancelType, setCancelType] = useState(null); // "before_store"|"store_wait"|null
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
  const [isPremium] = useState(() => (
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("premium") === "1"
  ));
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
  // store wait map
  const [swPeriod, setSwPeriod] = useState("today");
  const [swCenter, setSwCenter] = useState(null);
  const [swPinCount, setSwPinCount] = useState(0);
  const [swTimeSlot, setSwTimeSlot] = useState("all");
  const [swDow, setSwDow] = useState("all");
  const [swCompany, setSwCompany] = useState("all");
  const [swWeather, setSwWeather] = useState("all");
  const [swDropdown, setSwDropdown] = useState(null);
  const swMapRef = useRef(null);
  const swElRef = useRef(null);
  const swLayerRef = useRef(null);
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
  // high-value heatmap
  const [hvCenter, setHvCenter] = useState(null);
  const [hvPinCount, setHvPinCount] = useState(0);
  const hvMapRef = useRef(null);
  const hvElRef = useRef(null);
  const hvLayerRef = useRef(null);
  // hourly analysis
  const [hrPeriod, setHrPeriod] = useState("today");
  const [hrDow, setHrDow] = useState("all");
  const [hrCompany, setHrCompany] = useState("all");
  const [hrWeather, setHrWeather] = useState("all");
  const [hrDropdown, setHrDropdown] = useState(null);
  const [hwPeriod, setHwPeriod] = useState("month");
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
  const [salesMode, setSalesMode] = useState("month");
  const [salesMonth, setSalesMonth] = useState(ms());
  const [salesYear, setSalesYear] = useState(String(new Date().getFullYear()));
  const [dailyReportDate, setDailyReportDate] = useState(tds());
  const prevScreen = useRef(screen);
  useEffect(() => {
    if (screen !== prevScreen.current) {
      if (screen === "ana_daily") { setDailyReportDate(tds()); }
      if (screen === "ana_heatmap") { setHmCenter(null); getPos().then(p => { if (p) setHmCenter([p.lat, p.lng]); }); setHmPeriod("today"); setHmTimeSlot("all"); setHmDow("all"); setHmCompany("all"); setHmWeather("all"); setHmDropdown(null); }
      if (screen === "ana_storewait") { setSwCenter(null); getPos().then(p => { if (p) setSwCenter([p.lat, p.lng]); }); setSwPeriod("today"); setSwTimeSlot("all"); setSwDow("all"); setSwCompany("all"); setSwWeather("all"); setSwDropdown(null); }
      if (screen === "ana_area") { setAaCenter(null); getPos().then(p => { if (p) setAaCenter([p.lat, p.lng]); }); setAaPeriod("all"); setAaTimeSlot("all"); setAaDow("all"); setAaCompany("all"); setAaWeather("all"); setAaDropdown(null); }
      if (screen === "ana_highvalue") { setHvCenter(null); getPos().then(p => { if (p) setHvCenter([p.lat, p.lng]); }); }
      if (screen === "ana_hourly") { setHrPeriod("today"); setHrDow("all"); setHrCompany("all"); setHrWeather("all"); setHrDropdown(null); }
      if (screen === "ana_hourwage") { setHwPeriod("month"); }
      if (screen === "ana_weekday") { setWdPeriod("today"); setWdTimeSlot("all"); setWdCompany("all"); setWdWeather("all"); setWdDropdown(null); }
      if (screen === "ana_company") { setCoPeriod("today"); setCoTimeSlot("all"); setCoDow("all"); setCoWeather("all"); setCoDropdown(null); }
      if (screen === "ana_unitprice") { setUpPeriod("today"); setUpTimeSlot("all"); setUpDow("all"); setUpCompany("all"); setUpWeather("all"); setUpDropdown(null); }
      if (screen === "ana_sales") { setSalesMode("month"); setSalesMonth(ms()); setSalesYear(String(new Date().getFullYear())); }
      if (screen === "history") { setHistDetail(null); setHistExpanded({}); setHistWorkEdit(null); setHistIncEdit(null); }
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
  const [calMonth, setCalMonth] = useState(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() }; });
  // History
  const [histDetail, setHistDetail] = useState(null);
  const [histExpanded, setHistExpanded] = useState({});
  const [histWorkEdit, setHistWorkEdit] = useState(null);
  const [histIncEdit, setHistIncEdit] = useState(null);
  const [actionToast, setActionToast] = useState(null);
  const [pendingUndo, setPendingUndo] = useState(null);
  const [csvExport, setCsvExport] = useState(null);
  const undoTimerRef = useRef(null);
  const undoSeqRef = useRef(0);
  const pendingUndoRef = useRef(null);


  const T = settings.theme === "light" ? LIGHT : DARK;
  // Font scale: large mode bumps small text to minimum 13px
  const sz = (n) => settings.largeFont ? (n < 12 ? 13 : n < 18 ? n + 3 : n < 24 ? n + 2 : n + 1) : n;
  const closeActiveLogAt = (log, endTs) => {
    const next = {
      ...log,
      sessions: [...(log.sessions || [])],
      breaks: [...(log.breaks || [])],
      jizoSessions: [...(log.jizoSessions || [])],
      deliveries: [...(log.deliveries || [])],
      dailyIncentives: [...(log.dailyIncentives || [])],
      weatherSamples: [...(log.weatherSamples || [])],
      currentStops: (log.currentStops || []).map(s => ({ ...s })),
    };
    const end = Math.max(next.currentSessionStart || endTs, endTs);
    if (next.currentBreakStart && end > next.currentBreakStart) next.breaks.push({ start: next.currentBreakStart, end });
    if (next.currentJizoStart && end > next.currentJizoStart) next.jizoSessions.push({ start: next.currentJizoStart, end });
    if (next.currentSessionStart && end > next.currentSessionStart) next.sessions.push({ start: next.currentSessionStart, end });
    next.currentSessionStart = null;
    next.currentBreakStart = null;
    next.currentJizoStart = null;
    next.currentLastActivityAt = null;
    return next;
  };
  const autoOfflineMsFor = (s) => (s?.autoOfflineHours || 0) > 0 ? (s.autoOfflineHours * 3600000) : 0;

  const lastDateRef = useRef(tds());
  useEffect(() => {
    if (screen.startsWith("ana_")) return;
    const t = setInterval(() => {
      setNow(Date.now());
      // Day-crossing detection: auto-split sessions/breaks/jizo at midnight
      const today = tds();
      if (lastDateRef.current !== today) {
        lastDateRef.current = today;
        setData(prev => {
          const midnight = new Date(today + "T00:00:00").getTime();
          const updated = { ...prev, sessions: [...prev.sessions], breaks: [...prev.breaks], jizoSessions: [...prev.jizoSessions], deliveries: [...prev.deliveries], dailyIncentives: [...prev.dailyIncentives], weatherSamples: [...(prev.weatherSamples || [])] };
          // Close active session at 23:59:59.999 and save previous day
          if (updated.currentSessionStart) {
            updated.sessions.push({ start: updated.currentSessionStart, end: midnight - 1 });
            updated.currentSessionStart = null;
          }
          if (updated.currentBreakStart) {
            updated.breaks.push({ start: updated.currentBreakStart, end: midnight - 1 });
            updated.currentBreakStart = null;
          }
          if (updated.currentJizoStart) {
            updated.jizoSessions.push({ start: updated.currentJizoStart, end: midnight - 1 });
            updated.currentJizoStart = null;
          }
          // Save previous day's data (fire-and-forget but with error logging)
          svByDate(updated.date, updated).catch(err => console.error('[日跨ぎ] 前日データ保存失敗:', err));
          // Add previous day to allLogs
          setAllLogs(prevLogs => [updated, ...prevLogs.filter(l => l.date !== updated.date)]);
          // Create new day with active session/break/jizo continuing from midnight
          const newDayData = newDay();
          newDayData.currentSessionStart = prev.currentSessionStart ? midnight : null;
          newDayData.currentBreakStart = prev.currentBreakStart ? midnight : null;
          newDayData.currentJizoStart = prev.currentJizoStart ? midnight : null;
          newDayData.currentLastActivityAt = prev.currentSessionStart ? (prev.currentLastActivityAt || midnight) : null;
          // Carry over currentOrderTime if mid-delivery (will be saved to previous day on completion)
          newDayData.currentOrderTime = prev.currentOrderTime || null;
          newDayData.currentOrderPos = prev.currentOrderPos || null;
          newDayData.currentOrderWeather = prev.currentOrderWeather || null;
          newDayData.currentStoreArrivalTime = prev.currentStoreArrivalTime || null;
          newDayData.currentStoreDepartTime = prev.currentStoreDepartTime || null;
          newDayData.currentStorePos = prev.currentStorePos || null;
          newDayData.currentStoreWeather = prev.currentStoreWeather || null;
          newDayData.currentOrderType = prev.currentOrderType || null;
          newDayData.currentStops = (prev.currentStops || []).map(s => ({ ...s }));
          newDayData.currentAddedOrderCount = prev.currentAddedOrderCount || 0;
          return newDayData;
        });
      }
    }, 10000);
    return () => clearInterval(t);
  }, [screen]);
  useEffect(() => { (async () => {
    // データベースの準備完了を確実に待つ
    await ensureDB();
    const today = tds();
    const s = await ls();
    const loadedSettings = { ...defaultSettings(), ...(s || {}) };
    setSettings(loadedSettings);
    if (import.meta.env.DEV && typeof window !== "undefined") {
      const fixtureName = new URLSearchParams(window.location.search).get("fixture");
      if (fixtureName) {
        try {
          const { generateTestFixture } = await import("./testFixtures.js");
          const fixture = generateTestFixture(fixtureName);
          setData(migrate(fixture.todayLog));
          setAllLogs((fixture.logs || []).map(migrate).filter(l => l.date !== today));
          setTutorial(false);
          setLoading(false);
          return;
        } catch (err) {
          console.error("[testFixture] load failed:", err);
        }
      }
    }
    const autoLimitMs = autoOfflineMsFor(loadedSettings);
    const saved = await lt();
    let todayData = saved ? migrate(saved) : null;
    if (todayData?.currentSessionStart && autoLimitMs && todayData.currentLastActivityAt && !todayData.currentOrderTime) {
      const cutoff = todayData.currentLastActivityAt + autoLimitMs;
      if (Date.now() >= cutoff) todayData = closeActiveLogAt(todayData, cutoff);
    }
    if (todayData) setData(todayData);
    // Check for active session from a previous day and split it
    let all = (await la()).map(migrate);
    const activeLog = all.find(l => l.date && l.date !== today && l.currentSessionStart);
    if (activeLog) {
      const midnight = new Date(today + "T00:00:00").getTime();
      const cutoff = autoLimitMs && activeLog.currentLastActivityAt && !activeLog.currentOrderTime ? activeLog.currentLastActivityAt + autoLimitMs : null;
      const todaySaved = todayData || newDay();
      if (cutoff && cutoff < midnight) {
        const closed = closeActiveLogAt(activeLog, cutoff);
        await svByDate(activeLog.date, closed);
        setData(migrate(todaySaved));
      } else {
        const wasBreak = !!activeLog.currentBreakStart;
        const wasJizo = !!activeLog.currentJizoStart;
        // Close previous day's active states at midnight
        if (activeLog.currentSessionStart) { activeLog.sessions.push({ start: activeLog.currentSessionStart, end: midnight - 1 }); activeLog.currentSessionStart = null; }
        if (activeLog.currentBreakStart) { activeLog.breaks.push({ start: activeLog.currentBreakStart, end: midnight - 1 }); activeLog.currentBreakStart = null; }
        if (activeLog.currentJizoStart) { activeLog.jizoSessions.push({ start: activeLog.currentJizoStart, end: midnight - 1 }); activeLog.currentJizoStart = null; }
        await svByDate(activeLog.date, activeLog);
        // Start today with session continuing from midnight
        if (!todaySaved.currentSessionStart) todaySaved.currentSessionStart = midnight;
        if (wasBreak) todaySaved.currentBreakStart = midnight;
        if (wasJizo) todaySaved.currentJizoStart = midnight;
        todaySaved.currentLastActivityAt = activeLog.currentLastActivityAt || midnight;
        // Carry over mid-delivery state
        if (activeLog.currentOrderTime) {
          todaySaved.currentOrderTime = activeLog.currentOrderTime;
          todaySaved.currentOrderPos = activeLog.currentOrderPos;
          todaySaved.currentOrderWeather = activeLog.currentOrderWeather;
          todaySaved.currentStoreArrivalTime = activeLog.currentStoreArrivalTime || null;
          todaySaved.currentStoreDepartTime = activeLog.currentStoreDepartTime || null;
          todaySaved.currentStorePos = activeLog.currentStorePos || null;
          todaySaved.currentStoreWeather = activeLog.currentStoreWeather || null;
          todaySaved.currentOrderType = activeLog.currentOrderType || null;
          todaySaved.currentStops = (activeLog.currentStops || []).map(s => ({ ...s }));
          todaySaved.currentAddedOrderCount = activeLog.currentAddedOrderCount || 0;
        }
        if (cutoff && Date.now() >= cutoff && !todaySaved.currentOrderTime) setData(migrate(closeActiveLogAt(todaySaved, cutoff)));
        else setData(migrate(todaySaved));
      }
    }
    const g = await lg(); if (g?.amount) { const curMonth = ms(); if (!g.month || g.month === curMonth) setGoal(g.amount); }
    all = (await la()).map(migrate);
    setAllLogs(all.filter(l => l.date !== today));
    // Show tutorial on first launch
    try { const tutDone = await storage.get("tutorial-done"); if (!tutDone) setTutorial(true); } catch { setTutorial(true); }
    setLoading(false);
  })(); }, []);

  const saveRef = useRef(null);
  useEffect(() => { if (loading) return; if (saveRef.current) clearTimeout(saveRef.current); saveRef.current = setTimeout(() => sv(data), 300); }, [data, loading]);
  const update = useCallback((fn) => { setData(p => { const n = { ...p, sessions: [...p.sessions], breaks: [...p.breaks], deliveries: [...p.deliveries], dailyIncentives: [...p.dailyIncentives], jizoSessions: [...p.jizoSessions], weatherSamples: [...(p.weatherSamples || [])], currentStops: (p.currentStops || []).map(s => ({ ...s })) }; fn(n); return n; }); }, []);
  const cloneLog = (log) => JSON.parse(JSON.stringify(log));
  const clearPendingUndo = useCallback(() => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
    pendingUndoRef.current = null;
    setPendingUndo(null);
  }, []);
  const beginUndo = useCallback((label, restoreScreen = "main") => {
    const id = undoSeqRef.current + 1;
    undoSeqRef.current = id;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    const item = { id, label, restoreScreen, data: cloneLog(data), createdAt: Date.now() };
    pendingUndoRef.current = item;
    setPendingUndo(item);
    undoTimerRef.current = setTimeout(() => {
      if (pendingUndoRef.current?.id === id) pendingUndoRef.current = null;
      setPendingUndo(prev => prev?.id === id ? null : prev);
    }, 5000);
    return id;
  }, [data]);
  useEffect(() => () => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current); }, []);
  const doUndo = useCallback(() => {
    const item = pendingUndoRef.current || pendingUndo;
    if (!item) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
    pendingUndoRef.current = null;
    setPendingUndo(null);
    setData(cloneLog(item.data));
    setRwCo(null); setRwAmt(""); setRwInc(""); setRwField("reward"); setRwRating(null);
    setCancelType(null); setRwSaving(false);
    setScreen(item.restoreScreen || "main");
    setActionToast("↩ 操作を戻しました");
    setTimeout(() => setActionToast(null), 1400);
  }, [pendingUndo]);
  const updateSettings = (patch) => { const n = { ...settings, ...patch }; setSettings(n); ss(n); };
  const runAutoOfflineCheck = useCallback(() => {
    const limitMs = autoOfflineMsFor(settings);
    if (!limitMs) return;
    let closedAt = null;
    setData(prev => {
      if (!prev.currentSessionStart || !prev.currentLastActivityAt || prev.currentOrderTime) return prev;
      const cutoff = prev.currentLastActivityAt + limitMs;
      if (Date.now() < cutoff) return prev;
      closedAt = cutoff;
      return closeActiveLogAt(prev, cutoff);
    });
    if (closedAt) {
      setActionToast(`✓ ${ft(closedAt)}に自動オフライン`);
      setTimeout(() => setActionToast(null), 2200);
    }
  }, [settings.autoOfflineHours]);
  const markUserActivity = useCallback(() => {
    if (loading) return;
    const limitMs = autoOfflineMsFor(settings);
    let closedAt = null;
    const nowTs = Date.now();
    setData(prev => {
      if (!prev.currentSessionStart) return prev;
      if (limitMs && prev.currentLastActivityAt && !prev.currentOrderTime) {
        const cutoff = prev.currentLastActivityAt + limitMs;
        if (nowTs >= cutoff) {
          closedAt = cutoff;
          return closeActiveLogAt(prev, cutoff);
        }
      }
      if (prev.currentLastActivityAt && nowTs - prev.currentLastActivityAt < 15000) return prev;
      return { ...prev, currentLastActivityAt: nowTs };
    });
    if (closedAt) {
      setActionToast(`✓ ${ft(closedAt)}に自動オフライン`);
      setTimeout(() => setActionToast(null), 2200);
    }
  }, [loading, settings.autoOfflineHours]);
  useEffect(() => {
    if (loading || !settings.autoOfflineHours) return;
    const events = ["pointerdown", "keydown", "touchstart"];
    events.forEach(ev => window.addEventListener(ev, markUserActivity, { capture: true, passive: true }));
    return () => events.forEach(ev => window.removeEventListener(ev, markUserActivity, { capture: true }));
  }, [loading, settings.autoOfflineHours, markUserActivity]);
  useEffect(() => {
    if (loading || !settings.autoOfflineHours) return;
    const id = setInterval(runAutoOfflineCheck, 60000);
    const onWake = () => runAutoOfflineCheck();
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    runAutoOfflineCheck();
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, [loading, settings.autoOfflineHours, runAutoOfflineCheck]);
  useEffect(() => {
    if (!settings.autoOfflineHours || !data.currentSessionStart || data.currentLastActivityAt) return;
    update(d => { d.currentLastActivityAt = Date.now(); });
  }, [settings.autoOfflineHours, data.currentSessionStart, data.currentLastActivityAt, update]);
  const escHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

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
  }, [screen]);

  const hmLocRef = useRef(null);
  useEffect(() => {
    if (hmMapRef.current && hmCenter) {
      hmMapRef.current.setView(hmCenter, 14, { animate: true });
      setTimeout(() => { if (hmMapRef.current) hmMapRef.current.invalidateSize(); }, 200);
      if (!hmLocRef.current) {
        const locIcon = L.divIcon({ className: "", html: '<div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;"><div style="position:absolute;width:40px;height:40px;border-radius:50%;background:#4285F433;animation:loc-ripple 2s ease-out infinite;"></div><div style="position:absolute;width:28px;height:28px;border-radius:50%;background:#4285F422;animation:loc-ripple 2s ease-out 0.6s infinite;"></div><div style="position:relative;width:16px;height:16px;background:#4285F4;border:3px solid #fff;border-radius:50%;box-shadow:0 0 8px #4285F466;z-index:1;"></div></div><style>@keyframes loc-ripple{0%{transform:scale(0.5);opacity:1}100%{transform:scale(1.8);opacity:0}}</style>', iconSize: [40, 40], iconAnchor: [20, 20] });
        hmLocRef.current = L.marker(hmCenter, { icon: locIcon, zIndexOffset: 1000 }).bindPopup("現在地").addTo(hmMapRef.current);
      }
    }
    if (screen !== "ana_heatmap") hmLocRef.current = null;
  }, [hmCenter, screen]);

  useEffect(() => {
    if (screen !== "ana_heatmap" || !hmLayerRef.current) return;
    const RC = { good: "#EAB308", normal: "#9CA3AF", bad: "#3B82F6", cancelled: "#EF4444" };
    const todayStr2 = tds();
    const nowMs2 = Date.now();
    const msDay2 = 86400000;
    const awD = [
      ...allLogs.flatMap(l2 => (l2.deliveries || []).filter(d2 => d2.startLat).map(d2 => ({ ...d2, _date: l2.date }))),
      ...data.deliveries.filter(d2 => d2.startLat).map(d2 => ({ ...d2, _date: data.date })),
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
      const co2 = escHtml(d2.company || "不明");
      const rw2 = d2.cancelled ? (d2.cancelType === "before_store" ? "未到着キャンセル" : "調理待ちキャンセル") : `¥${(d2.reward || 0).toLocaleString()}`;
      const wInfo = d2.apiWeather ? `<br/>${escHtml(d2.apiWeather.temperature)}℃ 風${escHtml(d2.apiWeather.windspeed)}km/h${d2.apiWeather.precipitation != null ? ` 雨${escHtml(d2.apiWeather.precipitation)}mm` : ""}` : "";
      if (d2.startLat && d2.startLng) L.circleMarker([d2.startLat, d2.startLng], { radius: 6, color: c, fillColor: c, fillOpacity: 0.7, weight: 2 }).bindPopup(`<b>受注</b> ${fT(d2.orderTime)}<br/>${co2} ${rw2}${wInfo}`).addTo(hmLayerRef.current);
    });
    setHmPinCount(filt.length);
  }, [screen, hmPeriod, hmTimeSlot, hmDow, hmCompany, hmWeather, allLogs, data, isPremium]);

  // ─── Store wait map lifecycle ───
  useEffect(() => {
    const isSw = screen === "ana_storewait";
    if (!isSw) {
      if (swMapRef.current) { swMapRef.current.remove(); swMapRef.current = null; }
      return;
    }
    const el = swElRef.current;
    if (!el || swMapRef.current) return;
    const center = swCenter || [35.6812, 139.7671];
    const map = L.map(el, { zoomControl: false, attributionControl: false }).setView(center, 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
    swMapRef.current = map;
    swLayerRef.current = L.layerGroup().addTo(map);
    setTimeout(() => map.invalidateSize(), 200);
  }, [screen]);

  const swLocRef = useRef(null);
  useEffect(() => {
    if (swMapRef.current && swCenter) {
      swMapRef.current.setView(swCenter, 14, { animate: true });
      setTimeout(() => { if (swMapRef.current) swMapRef.current.invalidateSize(); }, 200);
      if (!swLocRef.current) {
        const locIcon = L.divIcon({ className: "", html: '<div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;"><div style="position:absolute;width:40px;height:40px;border-radius:50%;background:#4285F433;animation:loc-ripple 2s ease-out infinite;"></div><div style="position:absolute;width:28px;height:28px;border-radius:50%;background:#4285F422;animation:loc-ripple 2s ease-out 0.6s infinite;"></div><div style="position:relative;width:16px;height:16px;background:#4285F4;border:3px solid #fff;border-radius:50%;box-shadow:0 0 8px #4285F466;z-index:1;"></div></div><style>@keyframes loc-ripple{0%{transform:scale(0.5);opacity:1}100%{transform:scale(1.8);opacity:0}}</style>', iconSize: [40, 40], iconAnchor: [20, 20] });
        swLocRef.current = L.marker(swCenter, { icon: locIcon, zIndexOffset: 1000 }).bindPopup("現在地").addTo(swMapRef.current);
      }
    }
    if (screen !== "ana_storewait") swLocRef.current = null;
  }, [swCenter, screen]);

  useEffect(() => {
    if (screen !== "ana_storewait" || !swLayerRef.current) return;
    const todayStr2 = tds();
    const nowMs2 = Date.now();
    const msDay2 = 86400000;
    const storeWaitEntries = (d2, date) => {
      const pickupStops = (d2.stops || []).filter(s => s.kind === "pickup" && s.arrivalTime && (s.lat || d2.storeLat) && (s.lng || d2.storeLng));
      if (pickupStops.length > 0) {
        return pickupStops.map(s => ({
          ...d2,
          _date: date,
          _stopLabel: s.label || "店舗",
          storeArrivalTime: s.arrivalTime,
          storeDepartTime: s.departTime || null,
          storeLat: s.lat || d2.storeLat,
          storeLng: s.lng || d2.storeLng,
          storeWeather: s.weather || d2.storeWeather,
        }));
      }
      return d2.storeLat && d2.storeLng && d2.storeArrivalTime ? [{ ...d2, _date: date, _stopLabel: "店舗" }] : [];
    };
    const allWaits = [
      ...allLogs.flatMap(l2 => (l2.deliveries || []).flatMap(d2 => storeWaitEntries(d2, l2.date))),
      ...data.deliveries.flatMap(d2 => storeWaitEntries(d2, data.date)),
    ].map(d2 => {
      const waitMs = Math.max(0, (d2.storeDepartTime || d2.completeTime || nowMs2) - d2.storeArrivalTime);
      return { ...d2, _waitMs: waitMs, _waitMin: Math.round(waitMs / 60000) };
    }).filter(d2 => d2._waitMs >= 300000 || (d2.cancelled && d2.cancelType === "store_wait"));

    const per = swPeriod || "today";
    const pFree = per === "today";
    const canV = pFree || isPremium;
    let filt = [];
    if (canV) {
      if (per === "today") { filt = allWaits.filter(d2 => d2._date === todayStr2); }
      else {
        const cut = per === "week" ? 7 : per === "month" ? 30 : per === "half" ? 180 : per === "year" ? 365 : 99999;
        const mD = new Date(nowMs2 - cut * msDay2);
        const mS = `${mD.getFullYear()}-${String(mD.getMonth()+1).padStart(2,"0")}-${String(mD.getDate()).padStart(2,"0")}`;
        filt = allWaits.filter(d2 => d2._date >= mS);
      }
    }
    if (swTimeSlot !== "all") {
      const slots = { morning: [6, 10], lunch: [11, 14], afternoon: [15, 17], dinner: [18, 21], night: [22, 5] };
      const [sH, eH] = slots[swTimeSlot] || [0, 23];
      filt = filt.filter(d2 => {
        const h = new Date(d2.storeArrivalTime || d2.orderTime).getHours();
        return sH <= eH ? (h >= sH && h <= eH) : (h >= sH || h <= eH);
      });
    }
    if (swDow !== "all") {
      const dowMap = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };
      const target = dowMap[swDow];
      if (target !== undefined) filt = filt.filter(d2 => new Date(d2.storeArrivalTime || d2.orderTime).getDay() === target);
    }
    if (swCompany !== "all") filt = filt.filter(d2 => d2.company === swCompany);
    if (swWeather !== "all") {
      const wxDates = new Set([...allLogs, data].filter(l => l.weather === swWeather).map(l => l.date));
      filt = filt.filter(d2 => wxDates.has(d2._date));
    }

    swLayerRef.current.clearLayers();
    const fT = (t2) => { if (!t2) return ""; const dt2 = new Date(t2); return `${dt2.getHours()}:${String(dt2.getMinutes()).padStart(2, "0")}`; };
    const waitColor = (min, cancelled) => cancelled ? "#EF4444" : min >= 15 ? "#EF4444" : min >= 10 ? "#F59E0B" : "#A855F7";
    filt.forEach(d2 => {
      const color = waitColor(d2._waitMin, d2.cancelled);
      const co2 = escHtml(COS.find(c => c.id === d2.company)?.name || d2.company || "不明");
      const label = d2.cancelled ? "調理待ちキャンセル" : `${d2._stopLabel || "店舗"}待機 ${d2._waitMin}分`;
      const rw2 = d2.cancelled ? "" : `<br/>報酬 ¥${(d2.reward || 0).toLocaleString()}`;
      L.circleMarker([d2.storeLat, d2.storeLng], { radius: 9, color, fillColor: color, fillOpacity: 0.85, weight: 2 }).bindPopup(`<b>店舗</b> ${fT(d2.storeArrivalTime)}<br/>${co2}<br/>${label}${rw2}`).addTo(swLayerRef.current);
    });
    setSwPinCount(filt.length);
  }, [screen, swPeriod, swTimeSlot, swDow, swCompany, swWeather, allLogs, data, isPremium]);

  // ─── High-value heatmap lifecycle ───
  useEffect(() => {
    const isHv = screen === "ana_highvalue";
    if (!isHv) {
      if (hvMapRef.current) { hvMapRef.current.remove(); hvMapRef.current = null; }
      return;
    }
    const el = hvElRef.current;
    if (!el || hvMapRef.current) return;
    const center = hvCenter || [35.6812, 139.7671];
    const map = L.map(el, { zoomControl: false, attributionControl: false }).setView(center, 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
    hvMapRef.current = map;
    hvLayerRef.current = L.layerGroup().addTo(map);
    setTimeout(() => map.invalidateSize(), 200);
  }, [screen]);

  const hvLocRef = useRef(null);
  useEffect(() => {
    if (hvMapRef.current && hvCenter) {
      hvMapRef.current.setView(hvCenter, 13, { animate: true });
      setTimeout(() => { if (hvMapRef.current) hvMapRef.current.invalidateSize(); }, 200);
      if (!hvLocRef.current) {
        const locIcon = L.divIcon({ className: "", html: '<div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;"><div style="position:absolute;width:40px;height:40px;border-radius:50%;background:#4285F433;animation:loc-ripple 2s ease-out infinite;"></div><div style="position:absolute;width:28px;height:28px;border-radius:50%;background:#4285F422;animation:loc-ripple 2s ease-out 0.6s infinite;"></div><div style="position:relative;width:16px;height:16px;background:#4285F4;border:3px solid #fff;border-radius:50%;box-shadow:0 0 8px #4285F466;z-index:1;"></div></div><style>@keyframes loc-ripple{0%{transform:scale(0.5);opacity:1}100%{transform:scale(1.8);opacity:0}}</style>', iconSize: [40, 40], iconAnchor: [20, 20] });
        hvLocRef.current = L.marker(hvCenter, { icon: locIcon, zIndexOffset: 1000 }).bindPopup("現在地").addTo(hvMapRef.current);
      }
    }
    if (screen !== "ana_highvalue") hvLocRef.current = null;
  }, [hvCenter, screen]);

  useEffect(() => {
    if (screen !== "ana_highvalue" || !hvLayerRef.current) return;
    hvLayerRef.current.clearLayers();
    const allD = [
      ...allLogs.flatMap(l => (l.deliveries || []).filter(d2 => d2.startLat && !d2.cancelled && d2.company !== "pickgo" && (d2.reward || 0) >= 1000).map(d2 => ({ ...d2, _date: l.date, _delIdx: (l.deliveries || []).indexOf(d2) }))),
      ...data.deliveries.filter(d2 => d2.startLat && !d2.cancelled && d2.company !== "pickgo" && (d2.reward || 0) >= 1000).map(d2 => ({ ...d2, _date: data.date, _delIdx: data.deliveries.indexOf(d2) })),
    ];
    const fT = (t2) => { if (!t2) return ""; const dt2 = new Date(t2); return `${dt2.getHours()}:${String(dt2.getMinutes()).padStart(2, "0")}`; };
    let pinCount = 0;
    // Draw in order: 100+ first (bottom), then 200+, then 300+ (top)
    const tiers = [
      { min: 100, max: 200, color: "#3B82F6", radius: 6 },
      { min: 200, max: 300, color: "#F59E0B", radius: 7 },
      { min: 300, max: Infinity, color: "#EF4444", radius: 8 },
    ];
    tiers.forEach(tier => {
      allD.forEach(d2 => {
        if (!d2.orderTime || !d2.completeTime) return;
        const durMin = (d2.completeTime - d2.orderTime) / 60000;
        if (durMin <= 0) return;
        const perMin = (d2.reward || 0) / durMin;
        if (perMin >= tier.min && perMin < tier.max) {
          const co = COS.find(cc => cc.id === d2.company);
          const marker = L.circleMarker([d2.startLat, d2.startLng], { radius: tier.radius, color: tier.color, fillColor: tier.color, fillOpacity: 0.75, weight: 2 })
            .bindPopup(`<b>¥${Math.round(perMin)}/分</b><br/>${escHtml(co?.name || "不明")} ¥${(d2.reward || 0).toLocaleString()}<br/>${fT(d2.orderTime)} (${Math.round(durMin)}分)<br/>${escHtml(d2._date)}<br/><span style="color:#888">📝 ${d2.memo ? escHtml(d2.memo) : 'メモなし'}</span>`)
            .addTo(hvLayerRef.current);
          marker.on("click", () => {
            const isToday = d2._date === tds();
            if (isToday) {
              openEdit(d2._delIdx);
            } else {
              setScreen("history");
              setTimeout(() => {
                setHistExpanded({ [d2._date]: true });
                const log = allLogs.find(l => l.date === d2._date);
                if (log) setHistDetail({ delivery: d2, date: d2._date, delIdx: d2._delIdx });
              }, 50);
            }
          });
          pinCount++;
        }
      });
    });
    setHvPinCount(pinCount);
  }, [screen, allLogs, data]);

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
  }, [screen, aaBestCenter]);

  const aaLocRef = useRef(null);
  useEffect(() => {
    if (aaMapRef.current && aaCenter) {
      aaMapRef.current.setView(aaCenter, 14, { animate: true });
      setTimeout(() => { if (aaMapRef.current) aaMapRef.current.invalidateSize(); }, 200);
      if (!aaLocRef.current) {
        const locIcon = L.divIcon({ className: "", html: '<div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;"><div style="position:absolute;width:40px;height:40px;border-radius:50%;background:#4285F433;animation:loc-ripple 2s ease-out infinite;"></div><div style="position:absolute;width:28px;height:28px;border-radius:50%;background:#4285F422;animation:loc-ripple 2s ease-out 0.6s infinite;"></div><div style="position:relative;width:16px;height:16px;background:#4285F4;border:3px solid #fff;border-radius:50%;box-shadow:0 0 8px #4285F466;z-index:1;"></div></div><style>@keyframes loc-ripple{0%{transform:scale(0.5);opacity:1}100%{transform:scale(1.8);opacity:0}}</style>', iconSize: [40, 40], iconAnchor: [20, 20] });
        aaLocRef.current = L.marker(aaCenter, { icon: locIcon, zIndexOffset: 1000 }).bindPopup("現在地").addTo(aaMapRef.current);
      }
    }
    if (screen !== "ana_area") aaLocRef.current = null;
  }, [aaCenter, screen]);

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
      if (h >= 2000) return "#EF4444";
      if (h >= 1500) return "#F59E0B";
      if (h >= 1200) return "#EAB308";
      if (h >= 900)  return "#60A5FA";
      return "#3B82F6";
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
        (name ? `<div style="font-size:12px;font-weight:700;margin-bottom:2px;">${escHtml(name)}</div>` : "") +
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

  const orderTypeCount = (type) => type === "triple" ? 3 : type === "double" ? 2 : 1;
  const orderTypeFromCount = (count) => count >= 3 ? "triple" : count >= 2 ? "double" : "single";
  const pickupLabel = (count, index) => count === 1 ? "店舗" : `受取${index}`;
  const dropoffLabel = (count, index) => count === 1 ? "配達" : `お届け${index}`;
  const buildPickupStops = (count = 1) => {
    return [
      ...Array.from({ length: count }, (_, i) => ({
        id: `pickup-${i + 1}`, kind: "pickup", index: i + 1,
        label: pickupLabel(count, i + 1),
        arrivalTime: null, departTime: null, lat: null, lng: null, weather: null, source: i === 0 ? "initial" : "before_delivery",
      })),
    ];
  };
  const buildDropoffStops = (count = 1) => (
    Array.from({ length: count }, (_, i) => ({
        id: `dropoff-${i + 1}`, kind: "dropoff", index: i + 1,
        label: dropoffLabel(count, i + 1),
        completeTime: null, lat: null, lng: null, source: "planned",
      }))
  );
  const getNextOrderStep = (stops) => {
    const list = Array.isArray(stops) ? stops : [];
    for (const stop of list) {
      if (stop.kind === "pickup") {
        if (!stop.arrivalTime) return { action: "pickup_arrive", stop };
        if (!stop.departTime) return { action: "pickup_depart", stop };
      }
      if (stop.kind === "dropoff" && !stop.completeTime) return { action: "dropoff_complete", stop };
    }
    const pickupCount = list.filter(s => s.kind === "pickup").length;
    const dropoffCount = list.filter(s => s.kind === "dropoff").length;
    if (pickupCount > 0 && dropoffCount === 0) return { action: "choose_route", stop: null };
    return list.length > 0 ? { action: "reward", stop: null } : null;
  };
  const stepButtonLabel = (step, type) => {
    if (!step) return "";
    const multi = orderTypeCount(type) > 1;
    const label = step.stop?.label || "";
    if (step.action === "pickup_arrive") return multi ? `${label}到着` : "店舗到着";
    if (step.action === "pickup_depart") return multi ? `${label}出発` : "店舗出発";
    if (step.action === "dropoff_complete") return multi ? `${label}完了` : "配達完了";
    if (step.action === "choose_route") return "次の行き先を選択";
    return "報酬入力へ";
  };
  const stepStatusLabel = (step, type) => {
    if (!step) return "配達中";
    const multi = orderTypeCount(type) > 1;
    const label = step.stop?.label || "";
    if (step.action === "pickup_arrive") return multi ? `${label}へ移動中` : "店舗へ移動中";
    if (step.action === "pickup_depart") return multi ? `${label}待機中` : "店舗待機中";
    if (step.action === "dropoff_complete") return multi ? `${label}へ配達中` : "配達中";
    if (step.action === "choose_route") return "次の行き先を選択";
    return "報酬入力待ち";
  };
  const sanitizeStops = (stops) => (Array.isArray(stops) ? stops : []).map(s => ({ ...s }));
  const firstPickupStop = (stops) => sanitizeStops(stops).find(s => s.kind === "pickup") || null;
  const lastCompletedDropoffStop = (stops) => [...sanitizeStops(stops)].reverse().find(s => s.kind === "dropoff" && s.completeTime) || null;

  // ─── Computed ───
  const isOn = !!data.currentSessionStart; const isBrk = !!data.currentBreakStart; const hasOrd = !!data.currentOrderTime; const isJz = !!data.currentJizoStart;
  const currentOrderType = data.currentOrderType || "single";
  const currentOrderStops = sanitizeStops(data.currentStops);
  const currentOrderStep = hasOrd ? getNextOrderStep(currentOrderStops) : null;
  const hasStoreArrived = !!data.currentStoreArrivalTime;
  const hasStoreDeparted = !!data.currentStoreDepartTime;
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
  const hAll = wkMs > 0 ? Math.round(totAll / (wkMs / 3600000)) : 0; // 実質時給はインセンティブ込み
  const cm = ms();
  const pastRev = allLogs.filter(l => l.date?.startsWith(cm)).reduce((s, l) => s + dayRev(l, true), 0);
  const mRev = pastRev + totAll;
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

  // ─── Average unit price (delivery-count based, with past fallback) ───
  const medianCalc = (arr) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const pastAvgUnit = (() => { const allRews = []; allLogs.forEach(l => { (l.deliveries || []).filter(d => !d.cancelled).forEach(d => { if (d.reward > 0) allRews.push(d.reward); }); }); return allRews.length > 0 ? Math.round(medianCalc(allRews)) : 500; })();
  const avgUnitForGuide = actDels.length > 0 ? Math.round(medianCalc(actDels.map(d => d.reward || 0))) : pastAvgUnit;

  // ─── Action feedback toast ───
  const pulse = (name) => {
    const msgs = { online: "✓ オンライン開始", brkS: "☕ 休憩開始", brkE: "✓ 休憩終了", order: "📦 受注しました", storeArrive: "✓ 店舗到着", storeDepart: "✓ 店舗出発", complete: "✓ 報酬入力へ", cancel: "✓ キャンセル記録" };
    setActionToast(msgs[name] || "✓");
    setTimeout(() => setActionToast(null), 1200);
  };
  // Keep flashBtn as pass-through (no visual change on button itself)
  const flashBtn = (bg, dis, h, _name) => btn(bg, dis, h);

  const csvCell = (value) => {
    if (value === null || value === undefined) return "";
    const text = typeof value === "object" ? JSON.stringify(value) : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const fmtDateTime = (ts) => {
    if (!ts) return "";
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  };
  const roundMin = (v) => v > 0 ? Math.round((v / 60000) * 10) / 10 : 0;
  const makeWeatherSample = (source, pos, weather) => ({
    time: Date.now(),
    source,
    lat: pos?.lat ?? null,
    lng: pos?.lng ?? null,
    temperature: weather?.temperature ?? null,
    windspeed: weather?.windspeed ?? null,
    weathercode: weather?.weathercode ?? null,
    weatherId: weather?.weatherId ?? null,
    precipitation: weather?.precipitation ?? null,
  });
  const weatherSamplesForLog = (log) => {
    if (!log) return [];
    const stored = (log.weatherSamples || []).filter(s => s && (s.precipitation !== undefined || s.temperature !== undefined || s.windspeed !== undefined));
    if (stored.length > 0) return stored;
    return (log.deliveries || []).flatMap(d => {
      const rows = [];
      if (d.apiWeather) rows.push({ time: d.orderTime || d.completeTime || null, source: "order", lat: d.startLat ?? null, lng: d.startLng ?? null, ...d.apiWeather });
      if (d.storeWeather) rows.push({ time: d.storeArrivalTime || d.orderTime || null, source: "store", lat: d.storeLat ?? null, lng: d.storeLng ?? null, ...d.storeWeather });
      return rows;
    });
  };
  const rainStatsForLog = (log) => {
    const samples = weatherSamplesForLog(log).filter(s => s.precipitation !== null && s.precipitation !== undefined && !Number.isNaN(Number(s.precipitation)));
    const vals = samples.map(s => Number(s.precipitation));
    const max = vals.length ? Math.max(...vals) : null;
    const avg = vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : null;
    const rainy = vals.filter(v => v > 0).length;
    const level = max == null ? "未取得" : max === 0 ? "雨なし" : max <= 2 ? "小雨" : max <= 5 ? "雨" : "大雨";
    return { samples: samples.length, rainy, max, avg, level };
  };
  const downloadCsvText = async () => {
    const logsByDate = new Map();
    allLogs.forEach(l => { if (l?.date) logsByDate.set(l.date, l); });
    if (data?.date) logsByDate.set(data.date, data);
    const logs = [...logsByDate.values()].filter(l => l?.date).sort((a, b) => a.date.localeCompare(b.date));
    if (logs.length === 0) {
      setPopup({ msg: "出力できるデータがありません", onConfirm: () => setPopup(null) });
      return;
    }
    const columns = [
      "record_type", "date", "index", "stop_index", "stop_type", "stop_label", "stop_sequence_note", "company", "company_name", "order_type", "cancelled", "cancel_type", "rating", "manual_weather",
      "start_time", "end_time", "order_time", "store_arrival_time", "store_depart_time", "complete_time",
      "duration_minutes", "online_minutes", "break_minutes", "jizo_minutes", "work_minutes", "delivery_count", "pickup_count", "dropoff_count", "pickup_wait_minutes_total", "pickup_wait_minutes_max", "added_order_count",
      "raw_reward", "reward", "incentive", "total_amount", "per_min", "rocket_bonus_rate",
      "start_lat", "start_lng", "store_lat", "store_lng", "end_lat", "end_lng",
      "weather_source", "api_weather_id", "temperature", "windspeed", "precipitation", "precipitation_avg", "precipitation_max", "precipitation_samples", "rain_level", "area_name", "memo"
    ];
    const rows = [];
    const pushRow = (patch) => rows.push(Object.fromEntries(columns.map(c => [c, patch[c] ?? ""])));
    const companyName = (id) => COS.find(c => c.id === id)?.name || "";
    const currentExportTime = Date.now();

    logs.forEach(log => {
      const deliveries = log.deliveries || [];
      const dailyIncentives = log.dailyIncentives || [];
      const sessions = log.sessions || [];
      const breaks = log.breaks || [];
      const jizoSessions = log.jizoSessions || [];
      const weatherSamples = weatherSamplesForLog(log);
      const rainStats = rainStatsForLog(log);
      const sessionMs = sessions.reduce((s, x) => s + ((x.end || currentExportTime) - x.start), 0) + (log.currentSessionStart ? currentExportTime - log.currentSessionStart : 0);
      const breakMs = breaks.reduce((s, b) => s + ((b.end || currentExportTime) - b.start), 0) + (log.currentBreakStart ? currentExportTime - log.currentBreakStart : 0);
      const jizoMs = jizoSessions.reduce((s, j) => s + ((j.end || currentExportTime) - j.start), 0) + (log.currentJizoStart ? currentExportTime - log.currentJizoStart : 0);
      const activeDeliveries = deliveries.filter(d => !d.cancelled);
      const reward = activeDeliveries.reduce((s, d) => s + (d.reward || 0), 0);
      const deliveryIncentive = activeDeliveries.reduce((s, d) => s + (d.incentive || 0), 0);
      const dailyIncentive = dailyIncentives.reduce((s, d) => s + (d.amount || 0), 0);
      const totalIncentive = deliveryIncentive + dailyIncentive;
      const workMs = Math.max(0, sessionMs - breakMs);
      pushRow({
        record_type: "day_summary", date: log.date, manual_weather: log.weather,
        online_minutes: roundMin(sessionMs), break_minutes: roundMin(breakMs), jizo_minutes: roundMin(jizoMs), work_minutes: roundMin(workMs),
        delivery_count: activeDeliveries.reduce((s, d) => s + dc(d), 0),
        reward, incentive: totalIncentive, total_amount: reward + totalIncentive,
        precipitation_avg: rainStats.avg ?? "", precipitation_max: rainStats.max ?? "", precipitation_samples: rainStats.samples, rain_level: rainStats.level,
      });
      weatherSamples.forEach((w, i) => pushRow({
        record_type: "weather_sample", date: log.date, index: i + 1, weather_source: w.source || "",
        start_time: fmtDateTime(w.time), start_lat: w.lat, start_lng: w.lng,
        api_weather_id: w.weatherId || "", temperature: w.temperature ?? "", windspeed: w.windspeed ?? "",
        precipitation: w.precipitation ?? "",
      }));
      sessions.forEach((s, i) => pushRow({
        record_type: "session", date: log.date, index: i + 1, start_time: fmtDateTime(s.start), end_time: fmtDateTime(s.end),
        duration_minutes: roundMin((s.end || currentExportTime) - s.start),
      }));
      if (log.currentSessionStart) pushRow({
        record_type: "session_current", date: log.date, index: sessions.length + 1, start_time: fmtDateTime(log.currentSessionStart),
        duration_minutes: roundMin(currentExportTime - log.currentSessionStart),
      });
      breaks.forEach((b, i) => pushRow({
        record_type: "break", date: log.date, index: i + 1, start_time: fmtDateTime(b.start), end_time: fmtDateTime(b.end),
        duration_minutes: roundMin((b.end || currentExportTime) - b.start),
      }));
      if (log.currentBreakStart) pushRow({
        record_type: "break_current", date: log.date, index: breaks.length + 1, start_time: fmtDateTime(log.currentBreakStart),
        duration_minutes: roundMin(currentExportTime - log.currentBreakStart),
      });
      jizoSessions.forEach((j, i) => pushRow({
        record_type: "jizo", date: log.date, index: i + 1, start_time: fmtDateTime(j.start), end_time: fmtDateTime(j.end),
        duration_minutes: roundMin((j.end || currentExportTime) - j.start),
      }));
      if (log.currentJizoStart) pushRow({
        record_type: "jizo_current", date: log.date, index: jizoSessions.length + 1, start_time: fmtDateTime(log.currentJizoStart),
        duration_minutes: roundMin(currentExportTime - log.currentJizoStart),
      });
      deliveries.forEach((d, i) => {
        const duration = d.orderTime && d.completeTime ? d.completeTime - d.orderTime : 0;
        const durationMinutes = roundMin(duration);
        const pickupStops = (d.stops || []).filter(stop => stop.kind === "pickup");
        const dropoffStops = (d.stops || []).filter(stop => stop.kind === "dropoff");
        const pickupWaits = pickupStops
          .map(stop => stop.arrivalTime && stop.departTime ? Math.max(0, stop.departTime - stop.arrivalTime) : 0)
          .filter(Boolean);
        const pickupWaitTotal = pickupWaits.reduce((sum, value) => sum + value, 0);
        const pickupWaitMax = pickupWaits.length ? Math.max(...pickupWaits) : 0;
        pushRow({
          record_type: "delivery", date: log.date, index: i + 1, company: d.company, company_name: companyName(d.company),
          order_type: d.orderType || "single", cancelled: d.cancelled ? 1 : 0, cancel_type: d.cancelType || "", rating: d.rating || "", manual_weather: log.weather,
          order_time: fmtDateTime(d.orderTime), store_arrival_time: fmtDateTime(d.storeArrivalTime), store_depart_time: fmtDateTime(d.storeDepartTime), complete_time: fmtDateTime(d.completeTime),
          duration_minutes: durationMinutes, delivery_count: dc(d),
          pickup_count: pickupStops.length || "", dropoff_count: dropoffStops.length || "",
          pickup_wait_minutes_total: pickupWaitTotal ? roundMin(pickupWaitTotal) : "",
          pickup_wait_minutes_max: pickupWaitMax ? roundMin(pickupWaitMax) : "",
          added_order_count: d.addedOrderCount || "",
          raw_reward: d.rawReward || "", reward: d.reward || 0, incentive: d.incentive || 0, total_amount: (d.reward || 0) + (d.incentive || 0),
          rocket_bonus_rate: d.rocketBonusRate || "",
          per_min: durationMinutes > 0 && !d.cancelled ? Math.round(((d.reward || 0) / durationMinutes) * 10) / 10 : "",
          start_lat: d.startLat, start_lng: d.startLng, store_lat: d.storeLat, store_lng: d.storeLng, end_lat: d.endLat, end_lng: d.endLng,
          weather_source: d.apiWeather ? "order" : "", api_weather_id: d.apiWeather?.weatherId || "", temperature: d.apiWeather?.temperature ?? "", windspeed: d.apiWeather?.windspeed ?? "",
          precipitation: d.apiWeather?.precipitation ?? "", area_name: d.areaName || "", memo: d.memo || "",
        });
        (d.stops || []).forEach((stop, stopIdx) => {
          const stopStart = stop.kind === "pickup" ? stop.arrivalTime : null;
          const stopEnd = stop.kind === "pickup" ? stop.departTime : stop.completeTime;
          pushRow({
            record_type: "delivery_stop", date: log.date, index: i + 1, stop_index: stopIdx + 1,
            stop_type: stop.kind || "", stop_label: stop.label || "",
            stop_sequence_note: "番号は順番のみ_受取とお届けの対応ではない",
            company: d.company, company_name: companyName(d.company), order_type: d.orderType || "single",
            start_time: fmtDateTime(stopStart), end_time: fmtDateTime(stopEnd),
            duration_minutes: stop.kind === "pickup" && stopStart && stopEnd ? roundMin(stopEnd - stopStart) : "",
            store_lat: stop.kind === "pickup" ? stop.lat : "", store_lng: stop.kind === "pickup" ? stop.lng : "",
            end_lat: stop.kind === "dropoff" ? stop.lat : "", end_lng: stop.kind === "dropoff" ? stop.lng : "",
            weather_source: stop.kind === "pickup" && stop.weather ? "store" : "",
            api_weather_id: stop.weather?.weatherId || "", temperature: stop.weather?.temperature ?? "", windspeed: stop.weather?.windspeed ?? "",
            precipitation: stop.weather?.precipitation ?? "",
          });
        });
      });
      dailyIncentives.forEach((di, i) => pushRow({
        record_type: "daily_incentive", date: log.date, index: i + 1, company: di.company, company_name: companyName(di.company),
        start_time: fmtDateTime(di.time), incentive: di.amount || 0, total_amount: di.amount || 0,
      }));
    });

    const csv = [columns.join(","), ...rows.map(row => columns.map(c => csvCell(row[c])).join(","))].join("\n");
    const stamp = fmtDateTime(Date.now()).replace(/[-: ]/g, "");
    const filename = `delivery-log-${stamp}.csv`;
    const csvText = "\uFEFF" + csv;
    setCsvExport({ filename, csv });

    try {
      const file = new File([csvText], filename, { type: "text/csv;charset=utf-8" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "配達ログCSV" });
        setActionToast("✓ CSV共有を開きました");
        setTimeout(() => setActionToast(null), 1600);
        return;
      }
    } catch {}

    try {
      const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setActionToast("✓ CSVを保存しました");
      setTimeout(() => setActionToast(null), 1600);
    } catch {
      setPopup({ msg: "CSVの自動保存に失敗しました。\n設定画面下部のCSVテキストからコピーしてください。", onConfirm: () => setPopup(null) });
    }
  };

  const timeInputValue = (ts) => {
    if (!ts) return "";
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const logTimeToTs = (dateStr, value) => {
    if (!dateStr || !/^\d{2}:\d{2}$/.test(value || "")) return null;
    const [h, m] = value.split(":").map(Number);
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    const d = new Date(`${dateStr}T00:00:00`);
    d.setHours(h, m, 0, 0);
    return d.getTime();
  };
  const canEditWorkTimes = (dateStr) => {
    if (!dateStr) return false;
    const d = new Date(`${dateStr}T00:00:00`);
    d.setDate(d.getDate() + 2);
    return Date.now() < d.getTime();
  };
  const calcSessionMs = (log, refNow = now) => {
    const closed = (log.sessions || []).reduce((s, x) => s + (x.start ? Math.max(0, (x.end || refNow) - x.start) : 0), 0);
    return closed + (log.currentSessionStart ? Math.max(0, refNow - log.currentSessionStart) : 0);
  };
  const calcBreakMs = (log, refNow = now) => {
    const closed = (log.breaks || []).reduce((s, b) => s + (b.start ? Math.max(0, (b.end || refNow) - b.start) : 0), 0);
    return closed + (log.currentBreakStart ? Math.max(0, refNow - log.currentBreakStart) : 0);
  };
  const sessionBounds = (log) => {
    const entries = [
      ...(log.sessions || []).filter(s => s.start).map(s => ({ start: s.start, end: s.end || null })),
      ...(log.currentSessionStart ? [{ start: log.currentSessionStart, end: null }] : []),
    ];
    if (entries.length === 0) return { start: null, end: null, active: false };
    const starts = entries.map(s => s.start);
    const ends = entries.map(s => s.end).filter(Boolean);
    const active = !!log.currentSessionStart;
    return { start: Math.min(...starts), end: active ? null : (ends.length ? Math.max(...ends) : null), active };
  };
  const applyWorkTimesToLog = (log, startTs, endTs) => {
    const next = {
      ...log,
      sessions: [...(log.sessions || [])],
      breaks: [...(log.breaks || [])],
      deliveries: [...(log.deliveries || [])],
      dailyIncentives: [...(log.dailyIncentives || [])],
      jizoSessions: [...(log.jizoSessions || [])],
      weatherSamples: [...(log.weatherSamples || [])],
    };
    const sessions = next.sessions.filter(s => s.start && s.end && s.end > s.start).map(s => ({ ...s }));
    if (next.currentSessionStart && endTs) sessions.push({ start: next.currentSessionStart, end: endTs });
    if (sessions.length === 0) {
      if (endTs) {
        next.sessions = [{ start: startTs, end: endTs }];
        next.currentSessionStart = null;
      } else {
        next.sessions = [];
        next.currentSessionStart = startTs;
      }
      return next;
    }
    let firstIdx = 0;
    let lastIdx = 0;
    sessions.forEach((s, i) => {
      if (s.start < sessions[firstIdx].start) firstIdx = i;
      if ((s.end || 0) > (sessions[lastIdx].end || 0)) lastIdx = i;
    });
    sessions[firstIdx] = { ...sessions[firstIdx], start: startTs };
    if (endTs) {
      sessions[lastIdx] = { ...sessions[lastIdx], end: endTs };
      next.currentSessionStart = null;
    }
    next.sessions = sessions.filter(s => s.start && s.end && s.end > s.start).sort((a, b) => a.start - b.start);
    if (!endTs) next.currentSessionStart = next.currentSessionStart || startTs;
    return next;
  };
  const openHistWorkEdit = (log) => {
    const b = sessionBounds(log);
    setHistWorkEdit({
      date: log.date,
      start: timeInputValue(b.start),
      end: b.active ? "" : timeInputValue(b.end),
      error: null,
    });
  };
  const saveHistWorkEdit = async () => {
    if (!histWorkEdit) return;
    const startTs = logTimeToTs(histWorkEdit.date, histWorkEdit.start);
    const endTs = histWorkEdit.end ? logTimeToTs(histWorkEdit.date, histWorkEdit.end) : null;
    const isToday = histWorkEdit.date === tds();
    const target = isToday ? data : allLogs.find(l => l.date === histWorkEdit.date);
    if (!target) {
      setHistWorkEdit(e => ({ ...e, error: "対象日のデータが見つかりません" }));
      return;
    }
    if (!canEditWorkTimes(histWorkEdit.date)) {
      setHistWorkEdit(e => ({ ...e, error: "修正期限を過ぎています" }));
      return;
    }
    if (!startTs) {
      setHistWorkEdit(e => ({ ...e, error: "オンライン時刻を入力してください" }));
      return;
    }
    if (!endTs && !target.currentSessionStart) {
      setHistWorkEdit(e => ({ ...e, error: "オフライン時刻を入力してください" }));
      return;
    }
    if (endTs && endTs <= startTs) {
      setHistWorkEdit(e => ({ ...e, error: "オフライン時刻はオンライン時刻より後にしてください" }));
      return;
    }
    if (isToday) {
      setData(prev => applyWorkTimesToLog(prev, startTs, endTs));
    } else {
      const next = applyWorkTimesToLog(target, startTs, endTs);
      await svByDate(histWorkEdit.date, next);
      setAllLogs(prev => prev.map(l => l.date === histWorkEdit.date ? next : l));
    }
    setHistWorkEdit(null);
    setActionToast("✓ 稼働時間を保存しました");
    setTimeout(() => setActionToast(null), 1400);
  };
  const saveHistDeliveryDetail = async () => {
    if (!histDetail || histDetail.delIdx == null) return;
    const nextDelivery = { ...histDetail.delivery };
    const isToday = histDetail.date === tds();
    if (isToday) {
      update(dd => {
        if (dd.deliveries[histDetail.delIdx]) dd.deliveries[histDetail.delIdx] = nextDelivery;
      });
    } else {
      const log = allLogs.find(l => l.date === histDetail.date);
      if (!log) return;
      const nextLog = { ...log, deliveries: [...(log.deliveries || [])] };
      nextLog.deliveries[histDetail.delIdx] = nextDelivery;
      await svByDate(histDetail.date, nextLog);
      setAllLogs(prev => prev.map(l => l.date === histDetail.date ? nextLog : l));
    }
    setHistDetail(prev => ({ ...prev, saved: true }));
    setTimeout(() => setHistDetail(prev => prev ? ({ ...prev, saved: false }) : null), 1500);
  };
  const saveHistIncEdit = async () => {
    if (!histIncEdit) return;
    if (!canEditWorkTimes(histIncEdit.date)) {
      setHistIncEdit(e => ({ ...e, error: "修正期限を過ぎています" }));
      return;
    }
    const amount = parseInt(histIncEdit.amount, 10) || 0;
    if (!histIncEdit.company || amount <= 0) {
      setHistIncEdit(e => ({ ...e, error: "会社と金額を入力してください" }));
      return;
    }
    const apply = (log) => {
      const next = { ...log, dailyIncentives: [...(log.dailyIncentives || [])] };
      const row = { company: histIncEdit.company, amount, time: histIncEdit.time || Date.now() };
      if (histIncEdit.index == null) next.dailyIncentives.push(row);
      else next.dailyIncentives[histIncEdit.index] = { ...(next.dailyIncentives[histIncEdit.index] || {}), ...row };
      return next;
    };
    if (histIncEdit.date === tds()) {
      setData(prev => apply(prev));
    } else {
      const log = allLogs.find(l => l.date === histIncEdit.date);
      if (!log) return;
      const next = apply(log);
      await svByDate(histIncEdit.date, next);
      setAllLogs(prev => prev.map(l => l.date === histIncEdit.date ? next : l));
    }
    setHistIncEdit(null);
    setActionToast("✓ インセンティブを保存しました");
    setTimeout(() => setActionToast(null), 1400);
  };
  const deleteHistIncEdit = async () => {
    if (!histIncEdit || histIncEdit.index == null || !canEditWorkTimes(histIncEdit.date)) return;
    const apply = (log) => {
      const next = { ...log, dailyIncentives: [...(log.dailyIncentives || [])] };
      next.dailyIncentives.splice(histIncEdit.index, 1);
      return next;
    };
    if (histIncEdit.date === tds()) {
      setData(prev => apply(prev));
    } else {
      const log = allLogs.find(l => l.date === histIncEdit.date);
      if (!log) return;
      const next = apply(log);
      await svByDate(histIncEdit.date, next);
      setAllLogs(prev => prev.map(l => l.date === histIncEdit.date ? next : l));
    }
    setHistIncEdit(null);
    setActionToast("✓ インセンティブを削除しました");
    setTimeout(() => setActionToast(null), 1400);
  };

  // ─── Daily target for guide ───
  const dailyTarget = goal > 0 ? (() => {
    const today = new Date();
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const wd = settings.workDays || [1, 2, 3, 4, 5];
    let workDaysLeft = 0;
    for (let d = today.getDate(); d <= lastDay; d++) {
      const dow = new Date(today.getFullYear(), today.getMonth(), d).getDay();
      if (wd.includes(dow)) workDaysLeft++;
    }
    if (workDaysLeft <= 0) workDaysLeft = 1;
    const remainingGoal = Math.max(0, goal - pastRev);
    return Math.round(remainingGoal / workDaysLeft);
  })() : 0;
  const todayRemaining = Math.max(0, dailyTarget - totRew);

  // ─── 1. Golden Time indicator (historical hourly earnings) ───
  const goldenTime = (() => {
    if (!isOn) return null;
    const now = new Date();
    const curH = now.getHours();
    const curDow = now.getDay();
    // Collect per-hour revenue grouped by date, with day-of-week
    const hourByDate = {}; // { "YYYY-MM-DD": { hour: rev } }
    const dateDows = {};   // { "YYYY-MM-DD": dayOfWeek }
    allLogs.forEach(l => {
      if (!l.date) return;
      const dels = (l.deliveries || []).filter(d => !d.cancelled && d.orderTime);
      if (dels.length === 0) return;
      const dow = new Date(l.date + "T00:00:00").getDay();
      dateDows[l.date] = dow;
      if (!hourByDate[l.date]) hourByDate[l.date] = {};
      dels.forEach(d => {
        const h = new Date(d.orderTime).getHours();
        hourByDate[l.date][h] = (hourByDate[l.date][h] || 0) + (d.reward || 0);
      });
    });
    // Calculate hourly rate: revenue sum / day count (prefer same weekday)
    const calcHourRate = (hour, dowFilter) => {
      let rev = 0, days = 0;
      Object.entries(hourByDate).forEach(([date, hours]) => {
        if (dowFilter !== null && dateDows[date] !== dowFilter) return;
        if (hours[hour] !== undefined) { rev += hours[hour]; days++; }
      });
      return days > 0 ? { rate: Math.round(rev / days), days } : null;
    };
    // Try same weekday first, fallback to all days
    let curData = calcHourRate(curH, curDow);
    let useDow = true;
    if (!curData || curData.days < 3) { curData = calcHourRate(curH, null); useDow = false; }
    if (!curData || curData.days < 3) return null;
    const curHr = curData.rate;
    // Average across all hours (same filter)
    const allHours = new Set();
    Object.values(hourByDate).forEach(hours => Object.keys(hours).forEach(h => allHours.add(Number(h))));
    let totalRev = 0, totalCount = 0;
    allHours.forEach(h => {
      const d = calcHourRate(h, useDow ? curDow : null);
      if (d) { totalRev += d.rate; totalCount++; }
    });
    const avgHr = totalCount > 0 ? Math.round(totalRev / totalCount) : 0;
    if (avgHr <= 0) return null;
    const ratio = curHr / avgHr;
    const dowLabel = useDow ? ["日","月","火","水","木","金","土"][curDow] + "曜" : "";
    if (ratio >= 1.15) return { type: "golden", hr: curHr, label: dowLabel ? `${dowLabel}のゴールデンタイム` : "ゴールデンタイム" };
    if (ratio <= 0.85) return { type: "slow", hr: curHr, label: dowLabel ? `${dowLabel}のまったりタイム` : "まったりタイム" };
    return { type: "normal", hr: curHr, label: dowLabel ? `${dowLabel}の平均ペース` : "平均ペース" };
  })();

  // ─── 2. "あと少し" nudge (80%+ of daily goal) ───
  const nudge = (() => {
    if (dailyTarget <= 0 || !isOn) return null;
    const pct = totRew / dailyTarget;
    if (pct >= 1) return { type: "done" };
    if (pct >= 0.8) {
      const rem = dailyTarget - totRew;
      const avgUnit = delCnt > 0 ? Math.round(totRew / delCnt) : 500;
      const estDels = Math.ceil(rem / avgUnit);
      return { type: "close", remaining: rem, estDels };
    }
    return null;
  })();

  // ─── 3. Today's pace prediction ───
  const pacePredict = (() => {
    if (!isOn || sesMs < 1800000 || !data.currentSessionStart) return null; // need at least 30min online
    const hrWorked = sesMs / 3600000;
    // Predict end time from average online duration, not past clock-out time.
    const today = new Date();
    const todayDow = today.getDay();
    const pastDurations = [];
    allLogs.forEach(l => {
      if (!l.sessions || l.sessions.length === 0) return;
      const total = l.sessions.reduce((s, x) => s + (x.start && x.end ? Math.max(0, x.end - x.start) : 0), 0);
      if (total < 1800000) return;
      const dayDate = new Date((l.date || toLD(l.sessions[0].start)) + "T00:00:00");
      const dow = dayDate.getDay();
      const daysAgo = Math.max(1, Math.round((today - dayDate) / 86400000));
      const weight = (dow === todayDow ? 2 : 1) / daysAgo;
      pastDurations.push({ ms: total, weight });
    });
    if (pastDurations.length < 3) return null; // not enough data to predict
    const totalWeight = pastDurations.reduce((s, e) => s + e.weight, 0);
    const avgDurationMs = Math.round(pastDurations.reduce((s, e) => s + e.ms * e.weight, 0) / totalWeight);
    const predictedEndTs = data.currentSessionStart + avgDurationMs;
    const remainH = Math.max(0, predictedEndTs - Date.now()) / 3600000;
    const pace = totRew / hrWorked;
    const predicted = Math.round(totRew + pace * remainH);
    const pctOfGoal = dailyTarget > 0 ? Math.round(predicted / dailyTarget * 100) : 0;
    return { predicted, pace: Math.round(pace), pctOfGoal, endLabel: ft(predictedEndTs), avgDuration: avgDurationMs };
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
    update(d => { const ts = Date.now(); d.currentSessionStart = ts; d.currentLastActivityAt = ts; });
    pulse("online");
    // Show weather chance then today's guide
    if (weatherChanceMsg) {
      setWeatherChance(weatherChanceMsg);
      setTimeout(() => { setWeatherChance(null); }, 4500);
      // Show today's guide after weather chance
      if (dailyTarget > 0) {
        setTimeout(() => {
          const estDels2 = Math.ceil(todayRemaining / avgUnitForGuide);
          setTodayGuide({ target: dailyTarget, remaining: todayRemaining, estDels: estDels2 });
          setTimeout(() => setTodayGuide(null), 4000);
        }, 5000);
      }
    } else if (dailyTarget > 0) {
      const estDels = Math.ceil(todayRemaining / avgUnitForGuide);
      setTodayGuide({ target: dailyTarget, remaining: todayRemaining, estDels });
      setTimeout(() => setTodayGuide(null), 4000);
    }
  };
  const doOffline = () => {
    if (!isOn) return;
    if (hasOrd) {
      setPopup({ msg: "配達中です。\n先に配達完了またはキャンセルを記録してください。", onConfirm: () => setPopup(null) });
      return;
    }
    setPopup({
      msg: "本日の稼働を終了しますか？\n\n休憩の場合は「休憩開始」を\n使ってください。",
      onConfirm: () => {
        // Capture stats before ending — recalculate with real-time now
        const realNow = Date.now();
        const endSesMs = data.sessions.reduce((s, x) => s + (x.end - x.start), 0) + (data.currentSessionStart ? realNow - data.currentSessionStart : 0);
        const endBrkMs = data.breaks.reduce((s, b) => (b.start && b.end) ? s + (b.end - b.start) : s, 0) + (data.currentBreakStart ? realNow - data.currentBreakStart : 0);
        const endWkMs = Math.max(0, endSesMs - endBrkMs);
        const endDelCnt = delCnt;
        const endRew = totRew;
        const endInc = totInc;
        const endAll = endRew + endInc;
        const endHrBase = endWkMs > 0 ? Math.round(endRew / (endWkMs / 3600000)) : 0;
        const endHrAll = endWkMs > 0 ? Math.round(endAll / (endWkMs / 3600000)) : 0;
        // Find personal best
        const pastBest = allLogs.reduce((best, l) => {
          const r = (l.deliveries || []).filter(d2 => !d2.cancelled).reduce((s, d2) => s + (d2.reward || 0) + (d2.incentive || 0), 0) + (l.dailyIncentives || []).reduce((s, d2) => s + (d2.amount || 0), 0);
          return r > best ? r : best;
        }, 0);
        const isNewBest = endAll > pastBest && pastBest > 0;

        update(d => {
          d.sessions.push({ start: d.currentSessionStart, end: Date.now() }); d.currentSessionStart = null; d.currentLastActivityAt = null;
          if (d.currentJizoStart) { d.jizoSessions.push({ start: d.currentJizoStart, end: Date.now() }); d.currentJizoStart = null; }
          if (d.currentBreakStart) { d.breaks.push({ start: d.currentBreakStart, end: Date.now() }); d.currentBreakStart = null; }
        });
        setPopup(null);
        // Show otsukare card
        // Count efficiency rule hits for today
        const efDels = data.deliveries.filter(d2 => !d2.cancelled && d2.orderTime && d2.completeTime).map(d2 => {
          const dur = (d2.completeTime - d2.orderTime) / 60000;
          return { ...d2, perMin: dur > 0 ? (d2.reward || 0) / dur : 0, durMin: dur };
        }).filter(d2 => d2.durMin >= 3 && !(d2.company !== "pickgo" && d2.perMin >= 100));
        const efPMs = efDels.map(d2 => d2.perMin);
        const efAvg = efPMs.length > 0 ? (() => { const s = [...efPMs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2; })() : 0;
        const efLowCount = efAvg > 0 ? efDels.filter(d2 => d2.perMin < efAvg * 0.85).length : 0;
        setOtsukareData({ delCnt: endDelCnt, revenue: endRew, incentive: endInc, total: endAll, hrBase: endHrBase, hrAll: endHrAll, workTime: endWkMs, isNewBest, streak: streak, efLowCount });
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
  const clearCurrentOrder = (d) => {
    d.currentOrderTime = null; d.currentOrderPos = null; d.currentOrderWeather = null;
    d.currentStoreArrivalTime = null; d.currentStoreDepartTime = null; d.currentStorePos = null; d.currentStoreWeather = null;
    d.currentOrderType = null; d.currentStops = []; d.currentAddedOrderCount = 0;
  };
  const openRewardInput = ({ skipUndo = false } = {}) => {
    if (!skipUndo) beginUndo("報酬入力へ");
    setRwCo(null); setRwAmt(""); setRwInc(""); setRwField("reward"); setRwType(data.currentOrderType || "single"); setRwRating(null); setScreen("reward"); pulse("complete");
  };
  const doOrd = () => {
    if (!isOn || isBrk || hasOrd) return;
    const nowOrder = Date.now();
    beginUndo("受注");
    if (isJz) update(d => { d.jizoSessions.push({ start: d.currentJizoStart, end: Date.now() }); d.currentJizoStart = null; });
    update(d => {
      d.currentOrderTime = nowOrder;
      d.currentOrderPos = null; d.currentOrderWeather = null;
      d.currentStoreArrivalTime = null; d.currentStoreDepartTime = null; d.currentStorePos = null; d.currentStoreWeather = null;
      d.currentOrderType = "single";
      d.currentStops = buildPickupStops(1);
      d.currentAddedOrderCount = 0;
    });
    getPos().then(p => {
      if (p) {
        update(d => { if (d.currentOrderTime === nowOrder) d.currentOrderPos = p; });
        fetchWeather(p.lat, p.lng).then(w => {
          if (w) update(d => {
            if (d.currentOrderTime !== nowOrder) return;
            d.currentOrderWeather = w;
            d.weatherSamples.push(makeWeatherSample("order", p, w));
          });
        });
      }
    });
    pulse("order");
  };
  const doStoreArrive = () => {
    const step = getNextOrderStep(data.currentStops || []);
    if (!hasOrd || (step && step.action !== "pickup_arrive") || (!step && hasStoreArrived)) return;
    const orderTime = data.currentOrderTime;
    const targetId = step?.stop?.id || "pickup-1";
    const isFirst = !step || step.stop?.index === 1;
    const nowArrive = Date.now();
    beginUndo(stepButtonLabel(step, data.currentOrderType || "single") || "店舗到着");
    update(d => {
      d.currentStops = (d.currentStops || []).map(s => s.id === targetId ? { ...s, arrivalTime: nowArrive } : s);
      if (isFirst) d.currentStoreArrivalTime = nowArrive;
    });
    getPos().then(p => {
      if (p) {
        update(d => {
          if (d.currentOrderTime !== orderTime) return;
          let matched = false;
          d.currentStops = (d.currentStops || []).map(s => {
            if (s.id === targetId && s.arrivalTime === nowArrive) { matched = true; return { ...s, lat: p.lat, lng: p.lng }; }
            return s;
          });
          if (matched && isFirst) d.currentStorePos = p;
        });
        fetchWeather(p.lat, p.lng).then(w => {
          if (w) update(d => {
            if (d.currentOrderTime !== orderTime) return;
            let matched = false;
            d.currentStops = (d.currentStops || []).map(s => {
              if (s.id === targetId && s.arrivalTime === nowArrive) { matched = true; return { ...s, weather: w }; }
              return s;
            });
            if (!matched) return;
            if (isFirst) d.currentStoreWeather = w;
            d.weatherSamples.push(makeWeatherSample(`store_${step?.stop?.index || 1}`, p, w));
          });
        });
      }
    });
    pulse("storeArrive");
  };
  const doStoreDepart = () => {
    const step = getNextOrderStep(data.currentStops || []);
    if (!hasOrd || (step && step.action !== "pickup_depart") || (!step && (!hasStoreArrived || hasStoreDeparted))) return;
    const orderTime = data.currentOrderTime;
    const targetId = step?.stop?.id || "pickup-1";
    const isFirst = !step || step.stop?.index === 1;
    const nowDepart = Date.now();
    beginUndo(stepButtonLabel(step, data.currentOrderType || "single") || "店舗出発");
    update(d => {
      d.currentStops = (d.currentStops || []).map(s => s.id === targetId ? { ...s, departTime: nowDepart } : s);
      if (isFirst) d.currentStoreDepartTime = nowDepart;
    });
    if (!step?.stop?.lat && (!isFirst || !data.currentStorePos)) {
      getPos().then(p => { if (p) { update(d => { if (d.currentOrderTime !== orderTime) return; let matched = false; d.currentStops = (d.currentStops || []).map(s => { if (s.id === targetId && s.departTime === nowDepart) { matched = true; return { ...s, lat: s.lat || p.lat, lng: s.lng || p.lng }; } return s; }); if (matched && isFirst) d.currentStorePos = d.currentStorePos || p; }); fetchWeather(p.lat, p.lng).then(w => { if (w) update(d => { if (d.currentOrderTime !== orderTime) return; let matched = false; d.currentStops = (d.currentStops || []).map(s => { if (s.id === targetId && s.departTime === nowDepart) { matched = true; return { ...s, weather: s.weather || w }; } return s; }); if (!matched) return; if (isFirst) d.currentStoreWeather = d.currentStoreWeather || w; d.weatherSamples.push(makeWeatherSample(`store_depart_${step?.stop?.index || 1}`, p, w)); }); }); } });
    }
    pulse("storeDepart");
  };
  const doNextStore = () => {
    const step = getNextOrderStep(data.currentStops || []);
    if (!hasOrd || step?.action !== "choose_route") return;
    const pickups = (data.currentStops || []).filter(s => s.kind === "pickup");
    if (pickups.length >= 3) return;
    const nextCount = pickups.length + 1;
    beginUndo(`${pickupLabel(nextCount, nextCount)}へ`);
    update(d => {
      const relabeled = (d.currentStops || []).filter(s => s.kind === "pickup").map((s, i) => ({
        ...s,
        index: i + 1,
        label: pickupLabel(nextCount, i + 1),
      }));
      relabeled.push({ id: `pickup-${nextCount}`, kind: "pickup", index: nextCount, label: pickupLabel(nextCount, nextCount), arrivalTime: null, departTime: null, lat: null, lng: null, weather: null, source: "before_delivery" });
      d.currentStops = relabeled;
      d.currentOrderType = orderTypeFromCount(nextCount);
    });
    setActionToast(`✓ ${pickupLabel(nextCount, nextCount)}へ`);
    setTimeout(() => setActionToast(null), 1200);
  };
  const doAddOrderDuringDelivery = () => {
    const step = getNextOrderStep(data.currentStops || []);
    if (!hasOrd || step?.action !== "dropoff_complete") return;
    const stops = sanitizeStops(data.currentStops);
    const pickups = stops.filter(s => s.kind === "pickup");
    const dropoffs = stops.filter(s => s.kind === "dropoff");
    const nextCount = Math.max(pickups.length, dropoffs.length) + 1;
    if (nextCount > 3) return;
    beginUndo(`${pickupLabel(nextCount, nextCount)}を追加`);
    update(d => {
      const current = sanitizeStops(d.currentStops);
      const currentPickups = current.filter(s => s.kind === "pickup");
      const currentDropoffs = current.filter(s => s.kind === "dropoff");
      const relabeledPickups = currentPickups.map((s, i) => ({ ...s, index: i + 1, label: pickupLabel(nextCount, i + 1) }));
      const relabeledDropoffs = currentDropoffs.map((s, i) => ({ ...s, index: i + 1, label: dropoffLabel(nextCount, i + 1) }));
      const addedPickup = {
        id: `pickup-${nextCount}`, kind: "pickup", index: nextCount, label: pickupLabel(nextCount, nextCount),
        arrivalTime: null, departTime: null, lat: null, lng: null, weather: null, source: "added_during_delivery",
      };
      const addedDropoff = {
        id: `dropoff-${nextCount}`, kind: "dropoff", index: nextCount, label: dropoffLabel(nextCount, nextCount),
        completeTime: null, lat: null, lng: null, source: "added_during_delivery",
      };
      d.currentStops = [...relabeledPickups, addedPickup, ...relabeledDropoffs, addedDropoff];
      d.currentOrderType = orderTypeFromCount(nextCount);
      d.currentAddedOrderCount = (d.currentAddedOrderCount || 0) + 1;
    });
    setActionToast(`✓ ${pickupLabel(nextCount, nextCount)}を追加`);
    setTimeout(() => setActionToast(null), 1200);
  };
  const doStartDeliveryRoute = () => {
    const step = getNextOrderStep(data.currentStops || []);
    if (!hasOrd || step?.action !== "choose_route") return;
    const pickups = (data.currentStops || []).filter(s => s.kind === "pickup");
    const count = Math.max(1, Math.min(3, pickups.length));
    beginUndo("配達へ");
    update(d => {
      const relabeledPickups = (d.currentStops || []).filter(s => s.kind === "pickup").map((s, i) => ({
        ...s,
        index: i + 1,
        label: pickupLabel(count, i + 1),
      }));
      d.currentStops = [...relabeledPickups, ...buildDropoffStops(count)];
      d.currentOrderType = orderTypeFromCount(count);
    });
    setActionToast("✓ 配達へ");
    setTimeout(() => setActionToast(null), 1200);
  };
  const doDropoffComplete = () => {
    const step = getNextOrderStep(data.currentStops || []);
    if (!hasOrd || !step || step.action !== "dropoff_complete") return;
    const orderTime = data.currentOrderTime;
    const targetId = step.stop.id;
    const isLastDropoff = (data.currentStops || []).filter(s => s.kind === "dropoff").every(s => s.id === targetId || s.completeTime);
    const nowComplete = Date.now();
    beginUndo(stepButtonLabel(step, data.currentOrderType || "single") || "配達完了");
    update(d => {
      d.currentStops = (d.currentStops || []).map(s => s.id === targetId ? { ...s, completeTime: nowComplete } : s);
    });
    getPos().then(p => {
      if (p) update(d => {
        if (d.currentOrderTime !== orderTime) return;
        d.currentStops = (d.currentStops || []).map(s => s.id === targetId && s.completeTime === nowComplete ? { ...s, lat: p.lat, lng: p.lng } : s);
      });
    });
    if (isLastDropoff) openRewardInput({ skipUndo: true });
    else pulse("complete");
  };
  const doCmp = () => {
    if (!hasOrd) return;
    if (currentOrderStep?.action === "dropoff_complete") {
      doDropoffComplete();
      return;
    }
    if (currentOrderStep?.action === "reward") {
      openRewardInput();
      return;
    }
    if (!hasStoreDeparted) {
      setPopup({ msg: "店舗出発を記録してから\n配達完了に進んでください。", onConfirm: () => setPopup(null) });
      return;
    }
    openRewardInput();
  };
  const [rwSaving, setRwSaving] = useState(false);
  const openCancel = (type) => {
    if (!hasOrd) return;
    setCancelType(type);
    setRwCo(null);
    setScreen("cancel");
  };
  const doCancelOk = async () => {
    if (!rwCo || !cancelType || rwSaving) return;
    setRwSaving(true);
    try {
      const endPos = await getPos();
      const nowCancel = Date.now();
      const sp = data.currentOrderPos || null;
      const stops = sanitizeStops(data.currentStops);
      const firstPickup = firstPickupStop(stops);
      const storePos = data.currentStorePos || (cancelType === "store_wait" ? endPos : null);
      const orderDate = data.currentOrderTime ? toLD(data.currentOrderTime) : tds();
      const isCrossDay = orderDate !== data.date;
      const deliveryObj = {
        orderTime: data.currentOrderTime, completeTime: nowCancel, company: rwCo,
        reward: 0, incentive: 0, orderType: data.currentOrderType || "single", cancelled: true, cancelType, rating: null,
        storeArrivalTime: cancelType === "store_wait" ? (data.currentStoreArrivalTime || firstPickup?.arrivalTime || null) : null,
        storeDepartTime: null,
        startLat: sp?.lat || null, startLng: sp?.lng || null,
        storeLat: storePos?.lat || firstPickup?.lat || null, storeLng: storePos?.lng || firstPickup?.lng || null,
        endLat: endPos?.lat || null, endLng: endPos?.lng || null,
        apiWeather: data.currentOrderWeather || null,
        storeWeather: data.currentStoreWeather || firstPickup?.weather || null,
        stops,
        addedOrderCount: data.currentAddedOrderCount || 0,
        areaName: null, memo: "",
      };
      if (isCrossDay) {
        const prevLog = allLogs.find(l => l.date === orderDate);
        if (prevLog) {
          prevLog.deliveries.push(deliveryObj);
          svByDate(orderDate, prevLog);
          setAllLogs(prev => prev.map(l => l.date === orderDate ? { ...prevLog } : l));
        }
        update(d => {
          clearCurrentOrder(d);
        });
      } else {
        update(d => {
          d.deliveries.push(deliveryObj);
          clearCurrentOrder(d);
        });
      }
      setScreen("main");
      clearPendingUndo();
      pulse("cancel");
    } finally {
      setRwSaving(false);
      setCancelType(null);
    }
  };
  const doRwOk = async () => {
    if (!rwCo || !rwAmt || rwSaving) return;
    setRwSaving(true);
    const rawRew = parseInt(rwAmt, 10) || 0;
    const inc = parseInt(rwInc, 10) || 0;
    // PickGo fee deduction
    const isPickgo = rwCo === "pickgo";
    const isRocket = rwCo === "rocket";
    const feeRate = isPickgo ? (settings.pickgoFeeRate || 15) : 0;
    const rocketBonusRate = isRocket ? (settings.rocketBonusRate || 0) : 0;
    const rew = isPickgo ? Math.round(rawRew * (1 - feeRate / 100)) : isRocket ? Math.round(rawRew * (1 + rocketBonusRate / 100)) : rawRew;
    // Auto-rating: compare reward to rolling average
    const avgUnit = delCnt > 0 ? Math.round(totRew / delCnt) : 500;
    let autoRating = "normal";
    if (rew >= avgUnit * 1.2) autoRating = "good";
    else if (rew <= avgUnit * 0.8) autoRating = "bad";
    const finalRating = rwRating || autoRating; // manual override or auto
    const endPos = await getPos();
    const stops = sanitizeStops(data.currentStops);
    const firstPickup = firstPickupStop(stops);
    const lastDropoff = lastCompletedDropoffStop(stops);
    const finalEndLat = lastDropoff?.lat || endPos?.lat || null;
    const finalEndLng = lastDropoff?.lng || endPos?.lng || null;
    const completeTs = lastDropoff?.completeTime || Date.now();
    const orderDate = data.currentOrderTime ? toLD(data.currentOrderTime) : tds();
    const isCrossDay = orderDate !== data.date;
    const deliveryObj = {
      orderTime: data.currentOrderTime, completeTime: completeTs, company: rwCo,
      reward: rew, rawReward: isPickgo || (isRocket && rocketBonusRate > 0) ? rawRew : undefined, rocketBonusRate: isRocket ? rocketBonusRate : 0, incentive: inc, orderType: data.currentOrderType || rwType, cancelled: false,
      rating: finalRating,
      storeArrivalTime: data.currentStoreArrivalTime || firstPickup?.arrivalTime || null,
      storeDepartTime: data.currentStoreDepartTime || firstPickup?.departTime || null,
      startLat: data.currentOrderPos?.lat || null, startLng: data.currentOrderPos?.lng || null,
      storeLat: data.currentStorePos?.lat || firstPickup?.lat || null, storeLng: data.currentStorePos?.lng || firstPickup?.lng || null,
      endLat: finalEndLat, endLng: finalEndLng,
      apiWeather: data.currentOrderWeather || null,
      storeWeather: data.currentStoreWeather || firstPickup?.weather || null,
      stops,
      addedOrderCount: data.currentAddedOrderCount || 0,
      areaName: null,
    };
    if (isCrossDay) {
      // Save delivery to the previous day's log (order date)
      const prevLog = allLogs.find(l => l.date === orderDate);
      if (prevLog) {
        prevLog.deliveries.push(deliveryObj);
        svByDate(orderDate, prevLog);
        setAllLogs(prev => prev.map(l => l.date === orderDate ? { ...prevLog } : l));
      }
      update(d => {
        clearCurrentOrder(d);
      });
    } else {
      update(d => {
        d.deliveries.push(deliveryObj);
        clearCurrentOrder(d);
      });
    }
    // Background geocode for area name
    if (finalEndLat && finalEndLng) {
      reverseGeocode(finalEndLat, finalEndLng).then(name => {
        if (name) update(d => { const last = d.deliveries[d.deliveries.length - 1]; if (last && !last.areaName) last.areaName = name; });
      });
    }
    setScreen("main");
    clearPendingUndo();
    setRwSaving(false);

    // ─── Delivery feedback toast ───
    const newDelCnt = delCnt + (rwType === "double" ? 2 : rwType === "triple" ? 3 : 1);
    const elapsed = data.currentOrderTime ? Date.now() - data.currentOrderTime : 0;
    const elMin = Math.round(elapsed / 60000);
    const avgUnit2 = avgUnitForGuide;
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
    if (fb) { setDeliveryFeedback(fb); setTimeout(() => setDeliveryFeedback(null), 4000); }

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
  const npF = (k, s) => { if (k === "⌫") s(p => p.slice(0, -1)); else s(p => (p + k).length > 7 ? p : p + k); };
  const openDI = () => { setDiCo(null); setDiAmt(""); setScreen("di"); };
  const doDIOk = () => { if (!diCo || !diAmt) return; update(d => { d.dailyIncentives.push({ company: diCo, amount: parseInt(diAmt, 10) || 0, time: Date.now() }); }); setScreen("main"); };
  const doReset = () => { setMenu(false); setPopup({ msg: "本日のデータをリセットしますか？", onConfirm: () => { setData(newDay()); setPopup(null); } }); };
  const wSel = (w) => {
    update(d => { const ts = Date.now(); d.weather = w; d.currentSessionStart = ts; d.currentLastActivityAt = ts; });
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
            const estDels2 = Math.ceil(todayRemaining / avgUnitForGuide);
            setTodayGuide({ target: dailyTarget, remaining: todayRemaining, estDels: estDels2 });
            setTimeout(() => setTodayGuide(null), 4000);
          }, 5000);
        }
        return;
      }
    }
    if (dailyTarget > 0) {
      const estDels = dailyTarget > 0 ? Math.ceil(todayRemaining / avgUnitForGuide) : 0;
      setTodayGuide({ target: dailyTarget, remaining: todayRemaining, estDels });
      setTimeout(() => setTodayGuide(null), 4000);
    }
  };
  const normalizeDeliverySteps = (delivery) => {
    const base = { ...delivery };
    let stops = sanitizeStops(base.stops);
    if (stops.length === 0) {
      const count = Math.max(1, orderTypeCount(base.orderType));
      const pickup = {
        id: "pickup-1", kind: "pickup", index: 1, label: pickupLabel(count, 1),
        arrivalTime: base.storeArrivalTime || null,
        departTime: base.storeDepartTime || null,
        lat: base.storeLat || null,
        lng: base.storeLng || null,
        weather: base.storeWeather || null,
      };
      const dropoffs = buildDropoffStops(count).map((s, i) => ({
        ...s,
        completeTime: i === count - 1 ? base.completeTime || null : null,
        lat: i === count - 1 ? base.endLat || null : null,
        lng: i === count - 1 ? base.endLng || null : null,
      }));
      stops = [pickup, ...dropoffs];
    }
    const pickups = stops.filter(s => s.kind === "pickup");
    const dropoffs = stops.filter(s => s.kind === "dropoff");
    const count = Math.max(1, Math.min(3, Math.max(pickups.length, dropoffs.length)));
    const relabeledPickups = pickups.slice(0, 3).map((s, i) => ({ ...s, index: i + 1, label: pickupLabel(count, i + 1) }));
    let relabeledDropoffs = dropoffs.slice(0, 3).map((s, i) => ({ ...s, index: i + 1, label: dropoffLabel(count, i + 1) }));
    while (relabeledDropoffs.length < count) {
      const i = relabeledDropoffs.length;
      relabeledDropoffs.push({ id: `dropoff-${i + 1}`, kind: "dropoff", index: i + 1, label: dropoffLabel(count, i + 1), completeTime: null, lat: null, lng: null });
    }
    const nextStops = [...relabeledPickups, ...relabeledDropoffs];
    const firstPickup = relabeledPickups[0] || null;
    const completedDropoffs = relabeledDropoffs.filter(s => s.completeTime);
    const lastDropoff = completedDropoffs[completedDropoffs.length - 1] || relabeledDropoffs[relabeledDropoffs.length - 1] || null;
    return {
      ...base,
      orderType: orderTypeFromCount(count),
      stops: nextStops,
      storeArrivalTime: firstPickup?.arrivalTime || null,
      storeDepartTime: firstPickup?.departTime || null,
      storeLat: firstPickup?.lat || base.storeLat || null,
      storeLng: firstPickup?.lng || base.storeLng || null,
      storeWeather: firstPickup?.weather || base.storeWeather || null,
      completeTime: lastDropoff?.completeTime || base.completeTime || null,
      endLat: lastDropoff?.lat || base.endLat || null,
      endLng: lastDropoff?.lng || base.endLng || null,
    };
  };
  const openEdit = (i) => { setEditIdx(i); setEditData(normalizeDeliverySteps(data.deliveries[i])); setEditField(null); setScreen("edit"); };
  const svEdit = () => { if (editIdx === null) return; const nextEdit = normalizeDeliverySteps(editData); update(d => { d.deliveries[editIdx] = nextEdit; }); setScreen("main"); };
  const delEdit = () => { setPopup({ msg: "この記録を削除？", onConfirm: () => { update(d => { d.deliveries.splice(editIdx, 1); }); setPopup(null); setScreen("main"); } }); };
  const doGoalSave = () => { const a = parseInt(goalInput, 10) || 0; setGoal(a); sg({ amount: a, month: ms() }); setGoalModal(false); };

  if (loading) return (
    <div style={{ fontFamily: FN, background: T.bg, color: T.text, height: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <div style={{ width: 36, height: 36, border: `3px solid ${T.borderLight}`, borderTop: `3px solid ${T.accent}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <div style={{ fontSize: 15, fontWeight: 600, color: T.textSub }}>データ準備中...</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  // ─── Shared ───
  const ov = { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: T.overlay, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", zIndex: 100, paddingTop: 14, overflowY: "auto", fontFamily: FN, color: T.text };
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
          <button style={{ flex: 1, height: 44, borderRadius: 9, border: "none", background: rwSaving ? T.borderLight : T.accent, color: "#000", fontSize: sz(14), fontWeight: 700, cursor: rwSaving ? "default" : "pointer", fontFamily: FN, opacity: rwSaving ? 0.6 : 1 }} onClick={popup.onConfirm} disabled={rwSaving}>{rwSaving ? "保存中..." : "はい"}</button>
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
    { key: "daily", label: "📋 今日どう動く", free: true },
    { key: "efficiency", label: "🎯 案件判断", free: true },
    { key: "heatmap", label: "📍 受注エリア", free: true },
    { key: "storewait", label: "🏪 店舗待機リスク", free: true },
    { key: "hourwage", label: "🧭 稼働時間", free: false },
    { key: "company", label: "🏢 会社別", free: true },
    { key: "sales", label: "💴 売上集計", free: true },
    { key: "highvalue", label: "💎 高単価マップ", free: true },
    { key: "area", label: "🗺️ エリア別", free: false },
    { key: "condition", label: "🌡️ 気象条件", free: false },
    { key: "trends", label: "📈 推移・季節", free: false },
    { key: "hourly", label: "⏰ 時間帯詳細", free: true },
    { key: "weekday", label: "📅 曜日詳細", free: true },
    { key: "weather", label: "🌤️ 天候詳細", free: false },
    { key: "unitprice", label: "💰 単価詳細", free: true },
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
          { label: "📋  配達履歴", fn: () => { setMenu(false); setScreen("history"); } },
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
    { title: "③ 受注 → 店舗 → 配達完了", desc: "注文が入ったら「受注」を押します。\n店舗到着・店舗出発を記録してから\n配達完了で報酬を入力します。" },
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
    const rewardTypeLocked = hasOrd && !!data.currentOrderType;
    return (<div style={ov}>{PopupEl}
      <div style={{ fontSize: sz(14), color: T.textMuted, marginBottom: 8, letterSpacing: 2, fontWeight: 600 }}>報酬入力</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, maxWidth: 320, width: "100%", padding: "0 10px" }}>
        {OT.map(t => (<button key={t.id} disabled={rewardTypeLocked} onClick={() => setRwType(t.id)} style={{ flex: 1, height: 40, borderRadius: 9, border: rwType === t.id ? `2px solid ${T.accent}` : `1.5px solid ${T.borderLight}`, background: rwType === t.id ? `${T.accent}20` : T.card, color: rwType === t.id ? T.accent : T.textMuted, fontSize: sz(13), fontWeight: 600, cursor: rewardTypeLocked ? "default" : "pointer", fontFamily: FN, opacity: rewardTypeLocked && rwType !== t.id ? 0.5 : 1 }}>{t.label}</button>))}
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 6 }}>{COS.map(c => <button key={c.id} style={cB(c.bg, rwCo === c.id)} onClick={() => setRwCo(c.id)}>{c.letter}</button>)}</div>
      <div style={{ fontSize: sz(11), color: T.textMuted, marginBottom: 10, height: 14 }}>{rwCo ? COS.find(c => c.id === rwCo)?.name : "会社を選択"}</div>
      <div style={{ display: "flex", gap: 0, marginBottom: 8, maxWidth: 320, width: "100%", padding: "0 10px" }}>
        {[{ k: "reward", l: "配達報酬" }, { k: "incentive", l: "インセンティブ" }].map(f => (
          <button key={f.k} onClick={() => setRwField(f.k)} style={{ flex: 1, padding: "9px 0", border: "none", cursor: "pointer", background: rwField === f.k ? (f.k === "reward" ? T.accent : "#7C3AED") : T.inputBg, color: rwField === f.k ? "#FFF" : T.textDim, fontWeight: rwField === f.k ? 700 : 400, fontSize: sz(13), fontFamily: FN, borderRadius: f.k === "reward" ? "9px 0 0 9px" : "0 9px 9px 0" }}>{f.l}</button>
        ))}
      </div>
      <div style={{ fontSize: sz(36), fontWeight: 800, color: rwField === "incentive" ? T.purple : T.text, textAlign: "center", marginBottom: 2, minHeight: 42 }}>{av ? `¥${Number(av).toLocaleString()}` : <span style={{ color: T.textFaint }}>例：650</span>}</div>
      {rwCo === "rocket" && rwAmt && (settings.rocketBonusRate || 0) > 0 && (
        <div style={{ fontSize: sz(11), color: T.textMuted, marginBottom: 6 }}>
          Rocket Now +{settings.rocketBonusRate}% → <span style={{ color: T.accent, fontWeight: 800 }}>¥{Math.round((parseInt(rwAmt, 10) || 0) * (1 + (settings.rocketBonusRate || 0) / 100)).toLocaleString()}</span>
        </div>
      )}
      <div style={{ display: "flex", gap: 20, marginBottom: 8 }}>
        <div style={{ textAlign: "center" }}><div style={{ fontSize: sz(9), color: T.textDim }}>報酬</div><div style={{ fontSize: sz(14), fontWeight: 700, color: rwAmt ? T.text : T.textFaint }}>¥{rwAmt ? Number(rwAmt).toLocaleString() : "0"}</div></div>
        <div style={{ textAlign: "center" }}><div style={{ fontSize: sz(9), color: T.textDim }}>インセンティブ</div><div style={{ fontSize: sz(14), fontWeight: 700, color: rwInc ? T.purple : T.textFaint }}>¥{rwInc ? Number(rwInc).toLocaleString() : "0"}</div></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, width: "100%", maxWidth: 320, marginBottom: 8, padding: "0 10px" }}>{NP.map(k => <button key={k} style={{ height: 48, borderRadius: 10, border: `1px solid ${T.borderLight}`, background: T.card, color: T.text, fontSize: sz(20), fontWeight: 600, cursor: "pointer", fontFamily: FN }} onClick={() => npF(k, st)}>{k}</button>)}</div>

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
          <div style={{ width: "100%", maxWidth: 320, marginBottom: 8, padding: "0 10px" }}>
            <div style={{ fontSize: sz(10), color: T.textDim, marginBottom: 5, textAlign: "center" }}>
              配達評価{!rwRating && rwAmt ? "（自動判定）" : rwRating ? "（手動）" : ""}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {ratings.map(r => {
                const isActive = displayR === r.id;
                const isAuto = !rwRating && rwAmt && autoR === r.id;
                return (
                  <button key={r.id} onClick={() => setRwRating(rwRating === r.id ? null : r.id)} style={{
                    flex: 1, padding: "9px 0", borderRadius: 10,
                    border: isActive ? `2px solid ${r.color}` : `1.5px solid ${T.borderLight}`,
                    background: isActive ? `${r.color}18` : T.card,
                    color: isActive ? r.color : T.textDim,
                    fontSize: sz(13), fontWeight: isActive ? 700 : 500,
                    cursor: "pointer", fontFamily: FN, textAlign: "center",
                    opacity: isAuto && !rwRating ? 0.7 : 1,
                  }}>
                    {r.icon} {r.label}
                  </button>
                );
              })}
            </div>
            {!rwRating && rwAmt && <div style={{ fontSize: sz(9), color: T.textFaint, textAlign: "center", marginTop: 3 }}>タップで手動変更できます</div>}
          </div>
        );
      })()}

      <div style={{ width: "100%", maxWidth: 320, padding: "0 10px" }}>
        <button style={{ ...okBt(!rwCo || !rwAmt || rwSaving), maxWidth: "100%", height: 52, fontSize: sz(17) }} onClick={doRwOk} disabled={!rwCo || !rwAmt || rwSaving}>{rwSaving ? "保存中..." : "OK"}</button>
        <button onClick={() => setScreen("main")} style={{ width: "100%", height: 40, borderRadius: 10, border: `1.5px solid ${T.borderLight}`, background: "none", color: T.textMuted, fontSize: sz(14), fontWeight: 600, cursor: "pointer", fontFamily: FN, marginTop: 4 }}>戻る</button>
      </div>
    </div>);
  }

  // ═══ CANCEL ORDER ═══
  if (screen === "cancel") {
    const isStoreWaitCancel = cancelType === "store_wait";
    const title = isStoreWaitCancel ? "調理待ちキャンセル" : "店舗未到着キャンセル";
    const desc = isStoreWaitCancel
      ? "店舗到着後のキャンセルとして記録します。店舗待機マップの対象になります。"
      : "店舗に着く前のキャンセルとして記録します。店舗待機マップには載せません。";
    return (<div style={ov}>
      <div style={{ fontSize: sz(14), color: isStoreWaitCancel ? "#EF4444" : T.textMuted, marginBottom: 6, letterSpacing: 2, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: sz(12), color: T.textMuted, lineHeight: 1.6, textAlign: "center", maxWidth: 320, marginBottom: 16, padding: "0 14px" }}>{desc}</div>
      <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>{COS.map(c => <button key={c.id} style={cB(c.bg, rwCo === c.id)} onClick={() => setRwCo(c.id)}>{c.letter}</button>)}</div>
      <div style={{ fontSize: sz(11), color: T.textMuted, marginBottom: 18, height: 14 }}>{rwCo ? COS.find(c => c.id === rwCo)?.name : "会社を選択"}</div>
      {isStoreWaitCancel && data.currentStoreArrivalTime && (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 16px", width: "100%", maxWidth: 300, marginBottom: 16, textAlign: "center" }}>
          <div style={{ fontSize: sz(10), color: T.textDim, marginBottom: 4 }}>店舗待機時間</div>
          <div style={{ fontSize: sz(22), fontWeight: 800, color: "#EF4444" }}>{fm(Date.now() - data.currentStoreArrivalTime)}</div>
        </div>
      )}
      <button style={okBt(!rwCo || rwSaving)} onClick={doCancelOk} disabled={!rwCo || rwSaving}>{rwSaving ? "保存中..." : "キャンセルを記録"}</button>
      <button style={canB} onClick={() => { setCancelType(null); setScreen("main"); }}>戻る</button>
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
    const setEditTime = (field, value, fallbackTs) => {
      const withSyncedFirstStop = (next) => {
        if (!Array.isArray(next.stops) || !["storeArrivalTime", "storeDepartTime"].includes(field)) return next;
        let synced = false;
        return {
          ...next,
          stops: next.stops.map(s => {
            if (synced || s.kind !== "pickup") return s;
            synced = true;
            return { ...s, arrivalTime: next.storeArrivalTime || null, departTime: next.storeDepartTime || null };
          }),
        };
      };
      if (!value) {
        setEditData(withSyncedFirstStop({ ...editData, [field]: null }));
        return;
      }
      const [h, m] = value.split(":").map(Number);
      const base = new Date(editData[field] || fallbackTs || editData.orderTime || editData.completeTime || Date.now());
      base.setHours(h, m, 0, 0);
      setEditData(withSyncedFirstStop({ ...editData, [field]: base.getTime() }));
    };
    const storeWaitMsForEdit = () => editData.storeArrivalTime ? Math.max(0, (editData.storeDepartTime || editData.completeTime || Date.now()) - editData.storeArrivalTime) : 0;
    const applyStoreWaitMinutes = (mins) => {
      const safeMin = Math.max(0, Math.min(999, parseInt(mins, 10) || 0));
      if (safeMin === 0) {
        let synced = false;
        const stops = Array.isArray(editData.stops) ? editData.stops.map(s => {
          if (synced || s.kind !== "pickup") return s;
          synced = true;
          return { ...s, arrivalTime: null, departTime: null };
        }) : editData.stops;
        setEditData({ ...editData, storeArrivalTime: null, storeDepartTime: null, stops });
        return;
      }
      const waitMs = safeMin * 60000;
      let arrival = editData.storeArrivalTime || null;
      let depart = editData.storeDepartTime || null;
      if (arrival && !depart) depart = arrival + waitMs;
      else if (!arrival && depart) arrival = depart - waitMs;
      else if (arrival && depart) depart = arrival + waitMs;
      else {
        arrival = editData.orderTime || Date.now();
        depart = arrival + waitMs;
      }
      if (editData.completeTime && depart > editData.completeTime) {
        depart = editData.completeTime;
        arrival = depart - waitMs;
      }
      if (editData.orderTime && arrival < editData.orderTime) {
        arrival = editData.orderTime;
        depart = arrival + waitMs;
      }
      let synced = false;
      const stops = Array.isArray(editData.stops) ? editData.stops.map(s => {
        if (synced || s.kind !== "pickup") return s;
        synced = true;
        return { ...s, arrivalTime: arrival, departTime: depart };
      }) : editData.stops;
      setEditData({ ...editData, storeArrivalTime: arrival, storeDepartTime: depart, stops });
    };
    const setEditStopTime = (stopId, field, value) => {
      const stops = sanitizeStops(editData.stops);
      const current = stops.find(s => s.id === stopId);
      let ts = null;
      if (value) {
        const [h, m] = value.split(":").map(Number);
        const base = new Date(current?.[field] || editData.orderTime || editData.completeTime || Date.now());
        base.setHours(h, m, 0, 0);
        ts = base.getTime();
      }
      const nextStops = stops.map(s => s.id === stopId ? { ...s, [field]: ts } : s);
      setEditData(normalizeDeliverySteps({ ...editData, stops: nextStops }));
    };
    const setEditOrderType = (type) => {
      const count = orderTypeCount(type);
      let stops = sanitizeStops(editData.stops);
      if (stops.length === 0) stops = normalizeDeliverySteps(editData).stops;
      let pickups = stops.filter(s => s.kind === "pickup").slice(0, count);
      let dropoffs = stops.filter(s => s.kind === "dropoff").slice(0, count);
      while (pickups.length < count) {
        const i = pickups.length;
        pickups.push({ id: `pickup-${i + 1}`, kind: "pickup", index: i + 1, label: pickupLabel(count, i + 1), arrivalTime: null, departTime: null, lat: null, lng: null, weather: null });
      }
      while (dropoffs.length < count) {
        const i = dropoffs.length;
        dropoffs.push({ id: `dropoff-${i + 1}`, kind: "dropoff", index: i + 1, label: dropoffLabel(count, i + 1), completeTime: null, lat: null, lng: null });
      }
      setEditData(normalizeDeliverySteps({ ...editData, orderType: type, stops: [...pickups, ...dropoffs] }));
    };
    const addEditPickup = () => {
      const normalized = normalizeDeliverySteps(editData);
      const stops = sanitizeStops(normalized.stops);
      const pickups = stops.filter(s => s.kind === "pickup");
      if (pickups.length >= 3) return;
      const nextCount = pickups.length + 1;
      const dropoffs = stops.filter(s => s.kind === "dropoff");
      const nextStops = [
        ...pickups,
        { id: `pickup-${nextCount}`, kind: "pickup", index: nextCount, label: pickupLabel(nextCount, nextCount), arrivalTime: null, departTime: null, lat: null, lng: null, weather: null },
        ...dropoffs,
      ];
      setEditData(normalizeDeliverySteps({ ...normalized, stops: nextStops }));
    };
    const addEditDropoff = () => {
      const normalized = normalizeDeliverySteps(editData);
      const stops = sanitizeStops(normalized.stops);
      const dropoffs = stops.filter(s => s.kind === "dropoff");
      if (dropoffs.length >= 3) return;
      const nextCount = dropoffs.length + 1;
      setEditData(normalizeDeliverySteps({
        ...normalized,
        stops: [...stops, { id: `dropoff-${nextCount}`, kind: "dropoff", index: nextCount, label: dropoffLabel(nextCount, nextCount), completeTime: null, lat: null, lng: null }],
      }));
    };
    const deleteEditStop = (stopId) => {
      const stops = sanitizeStops(editData.stops);
      if (stops.length <= 2) return;
      setEditData(normalizeDeliverySteps({ ...editData, stops: stops.filter(s => s.id !== stopId) }));
    };
    if (editField === "reward" || editField === "incentive") {
      const ev = editField === "reward" ? String(editData.reward || "") : String(editData.incentive || "");
      const enp = (k) => { const cur = ev; if (k === "⌫") { const nv = cur.slice(0, -1); editField === "reward" ? setEditData({ ...editData, reward: parseInt(nv, 10) || 0 }) : setEditData({ ...editData, incentive: parseInt(nv, 10) || 0 }); } else { const nv = cur === "0" ? k : cur + k; if (nv.length <= 7) editField === "reward" ? setEditData({ ...editData, reward: parseInt(nv, 10) || 0 }) : setEditData({ ...editData, incentive: parseInt(nv, 10) || 0 }); } };
      return (<div style={ov}><div style={{ fontSize: sz(12), color: T.textMuted, marginBottom: 12 }}>{editField === "reward" ? "配達報酬を編集" : "インセンティブを編集"}</div>
        <div style={{ fontSize: sz(38), fontWeight: 800, color: editField === "incentive" ? T.purple : T.accent, textAlign: "center", marginBottom: 14 }}>¥{(editField === "reward" ? editData.reward : editData.incentive || 0).toLocaleString()}</div>
        <div style={npG}>{NP.map(k => <button key={k} style={npK} onClick={() => enp(k)}>{k}</button>)}</div>
        <button style={okBt(false)} onClick={() => setEditField(null)}>決定</button></div>);
    }
    if (editField === "storeWait") {
      const currentMin = Math.round(storeWaitMsForEdit() / 60000);
      const enp = (k) => {
        const cur = String(currentMin || "");
        if (k === "⌫") applyStoreWaitMinutes(cur.slice(0, -1));
        else {
          const nv = cur === "0" ? k : cur + k;
          if (nv.length <= 3) applyStoreWaitMinutes(nv);
        }
      };
      return (<div style={ov}>
        <div style={{ fontSize: sz(12), color: T.textMuted, marginBottom: 8 }}>店舗待機時間を編集</div>
        <div style={{ fontSize: sz(11), color: T.textDim, lineHeight: 1.6, textAlign: "center", marginBottom: 10 }}>ボタンを押し忘れた場合は、待った分数だけ入力してください。</div>
        <div style={{ fontSize: sz(38), fontWeight: 800, color: "#F59E0B", textAlign: "center", marginBottom: 14 }}>{currentMin ? `${currentMin}分` : <span style={{ color: T.textFaint }}>0分</span>}</div>
        <div style={npG}>{NP.map(k => <button key={k} style={npK} onClick={() => enp(k)}>{k}</button>)}</div>
        <button style={okBt(false)} onClick={() => setEditField(null)}>決定</button>
        <button style={canB} onClick={() => { applyStoreWaitMinutes(0); setEditField(null); }}>待機なしに戻す</button>
      </div>);
    }
    return (<div style={ov}>{PopupEl}
      <div style={{ fontSize: sz(14), color: T.textMuted, marginBottom: 8, letterSpacing: 2, fontWeight: 600 }}>配達詳細・編集</div>
      <div style={{ width: "100%", maxWidth: 340, padding: "0 10px" }}>
        <div style={{ background: T.card, borderRadius: 14, padding: "14px 16px", marginBottom: 8, border: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: c?.bg || "#333", color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: sz(19), fontWeight: 800 }}>{c?.letter}</div>
            <div><div style={{ fontSize: sz(15), fontWeight: 700, color: T.text }}>{c?.name}</div><div style={{ fontSize: sz(12), color: T.textMuted }}>{OT.find(o => o.id === editData.orderType)?.label}{editData.cancelled && <span style={{ color: "#EF4444" }}> キャンセル</span>}</div></div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: sz(12), color: T.textMuted }}>時間</span>
            {editField === "orderTime" || editField === "completeTime" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input type="time" value={timeInputValue(editData.orderTime)} onChange={(e) => setEditTime("orderTime", e.target.value, editData.completeTime)} style={{ background: T.inputBg, border: `1px solid ${T.accent}`, borderRadius: 6, color: T.text, fontSize: sz(13), padding: "4px 6px", fontFamily: FN, width: 80 }} />
                <span style={{ color: T.textMuted }}>〜</span>
                <input type="time" value={timeInputValue(editData.completeTime)} onChange={(e) => setEditTime("completeTime", e.target.value, editData.orderTime)} style={{ background: T.inputBg, border: `1px solid ${T.accent}`, borderRadius: 6, color: T.text, fontSize: sz(13), padding: "4px 6px", fontFamily: FN, width: 80 }} />
                <button onClick={() => setEditField(null)} style={{ background: T.accent, color: "#000", border: "none", borderRadius: 6, fontSize: sz(11), fontWeight: 700, padding: "4px 8px", cursor: "pointer", fontFamily: FN }}>OK</button>
              </div>
            ) : (
              <span onClick={() => setEditField("orderTime")} style={{ fontSize: sz(14), fontWeight: 600, color: T.text, cursor: "pointer" }}>{ft(editData.orderTime)}〜{ft(editData.completeTime)} ✎</span>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: sz(12), color: T.textMuted }}>店舗到着/出発</span>
            {editField === "storeTime" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input type="time" value={timeInputValue(editData.storeArrivalTime)} onChange={(e) => setEditTime("storeArrivalTime", e.target.value, editData.orderTime)} style={{ background: T.inputBg, border: `1px solid ${T.accent}`, borderRadius: 6, color: T.text, fontSize: sz(13), padding: "4px 6px", fontFamily: FN, width: 80 }} />
                <span style={{ color: T.textMuted }}>〜</span>
                <input type="time" value={timeInputValue(editData.storeDepartTime)} onChange={(e) => setEditTime("storeDepartTime", e.target.value, editData.storeArrivalTime || editData.completeTime)} style={{ background: T.inputBg, border: `1px solid ${T.accent}`, borderRadius: 6, color: T.text, fontSize: sz(13), padding: "4px 6px", fontFamily: FN, width: 80 }} />
                <button onClick={() => setEditField(null)} style={{ background: T.accent, color: "#000", border: "none", borderRadius: 6, fontSize: sz(11), fontWeight: 700, padding: "4px 8px", cursor: "pointer", fontFamily: FN }}>OK</button>
              </div>
            ) : (
              <span onClick={() => setEditField("storeTime")} style={{ fontSize: sz(14), fontWeight: 600, color: T.text, cursor: "pointer" }}>{editData.storeArrivalTime || editData.storeDepartTime ? `${ft(editData.storeArrivalTime)}〜${ft(editData.storeDepartTime)}` : "未記録"} ✎</span>
            )}
          </div>
          {(() => { const dur = editData.completeTime && editData.orderTime ? editData.completeTime - editData.orderTime : 0; const wait = editData.storeArrivalTime ? (editData.storeDepartTime || editData.completeTime || Date.now()) - editData.storeArrivalTime : 0; const durMin = dur > 0 ? dur / 60000 : 0; const perMin = durMin > 0 ? Math.round((editData.reward || 0) / durMin) : 0; return (<>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ fontSize: sz(12), color: T.textMuted }}>所要時間</span><span style={{ fontSize: sz(14), fontWeight: 600, color: T.text }}>{fm(dur)}</span></div>
            <div onClick={() => setEditField("storeWait")} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, cursor: "pointer" }}><span style={{ fontSize: sz(12), color: T.textMuted }}>店舗待機</span><span style={{ fontSize: sz(14), fontWeight: 600, color: wait >= 300000 || editData.cancelType === "store_wait" ? "#EF4444" : T.text }}>{fm(wait)} ✎</span></div>
            {perMin > 0 && !editData.cancelled && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ fontSize: sz(12), color: T.textMuted }}>分給</span><span style={{ fontSize: sz(15), fontWeight: 700, color: "#0EA5E9" }}>¥{perMin.toLocaleString()}/分</span></div>}
          </>); })()}
          {Array.isArray(editData.stops) && editData.stops.length > 0 && (() => {
            const stops = sanitizeStops(editData.stops);
            const pickupCount = stops.filter(s => s.kind === "pickup").length;
            const dropoffCount = stops.filter(s => s.kind === "dropoff").length;
            return (
              <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 8, marginTop: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ fontSize: sz(12), color: T.textMuted }}>詳細ステップ</div>
                  <div style={{ fontSize: sz(10), color: T.textDim }}>押し忘れ補正</div>
                </div>
                <div style={{ fontSize: sz(10), color: T.textDim, lineHeight: 1.5, marginBottom: 6 }}>
                  受取番号とお届け番号は対応ではなく、操作順・配達順です。分析では個別ペアとして使いません。
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  {stops.map((s) => (
                    <div key={s.id} style={{ background: T.barBg, borderRadius: 8, padding: "7px 8px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                        <span style={{ fontSize: sz(11), color: T.textSub, fontWeight: 800 }}>{s.label || (s.kind === "pickup" ? "店舗" : "配達")}</span>
                        {((s.kind === "pickup" && pickupCount > 1) || (s.kind === "dropoff" && dropoffCount > 1)) && (
                          <button onClick={() => deleteEditStop(s.id)} style={{ background: "none", border: `1px solid #EF444466`, borderRadius: 6, color: "#EF4444", padding: "2px 6px", fontSize: sz(10), cursor: "pointer", fontFamily: FN }}>削除</button>
                        )}
                      </div>
                      {s.kind === "pickup" ? (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                          <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            <span style={{ fontSize: sz(9), color: T.textDim }}>到着</span>
                            <input type="time" value={timeInputValue(s.arrivalTime)} onChange={(e) => setEditStopTime(s.id, "arrivalTime", e.target.value)} style={{ background: T.inputBg, border: `1px solid ${T.borderLight}`, borderRadius: 7, color: T.text, fontSize: sz(12), padding: "5px 6px", fontFamily: FN }} />
                          </label>
                          <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            <span style={{ fontSize: sz(9), color: T.textDim }}>出発</span>
                            <input type="time" value={timeInputValue(s.departTime)} onChange={(e) => setEditStopTime(s.id, "departTime", e.target.value)} style={{ background: T.inputBg, border: `1px solid ${T.borderLight}`, borderRadius: 7, color: T.text, fontSize: sz(12), padding: "5px 6px", fontFamily: FN }} />
                          </label>
                        </div>
                      ) : (
                        <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          <span style={{ fontSize: sz(9), color: T.textDim }}>完了</span>
                          <input type="time" value={timeInputValue(s.completeTime)} onChange={(e) => setEditStopTime(s.id, "completeTime", e.target.value)} style={{ background: T.inputBg, border: `1px solid ${T.borderLight}`, borderRadius: 7, color: T.text, fontSize: sz(12), padding: "5px 6px", fontFamily: FN }} />
                        </label>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8 }}>
                  <button disabled={pickupCount >= 3} onClick={addEditPickup} style={{ height: 34, borderRadius: 8, border: `1px solid ${T.borderLight}`, background: pickupCount >= 3 ? T.barBg : T.inputBg, color: pickupCount >= 3 ? T.textFaint : T.text, fontSize: sz(11), fontWeight: 700, cursor: pickupCount >= 3 ? "default" : "pointer", fontFamily: FN }}>店舗を追加</button>
                  <button disabled={dropoffCount >= 3} onClick={addEditDropoff} style={{ height: 34, borderRadius: 8, border: `1px solid ${T.borderLight}`, background: dropoffCount >= 3 ? T.barBg : T.inputBg, color: dropoffCount >= 3 ? T.textFaint : T.text, fontSize: sz(11), fontWeight: 700, cursor: dropoffCount >= 3 ? "default" : "pointer", fontFamily: FN }}>配達先を追加</button>
                </div>
              </div>
            );
          })()}
          <div onClick={() => setEditField("reward")} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderTop: `1px solid ${T.border}`, cursor: "pointer" }}><span style={{ fontSize: sz(13), color: T.textMuted }}>配達報酬</span><span style={{ fontSize: sz(17), fontWeight: 700, color: T.accent }}>¥{(editData.reward || 0).toLocaleString()} ✎</span></div>
          {editData.rawReward && editData.company === "pickgo" && <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0 7px" }}><span style={{ fontSize: sz(11), color: T.textDim }}>PickGo 入力金額</span><span style={{ fontSize: sz(13), color: T.textMuted }}>¥{editData.rawReward.toLocaleString()}（手数料{Math.round((1 - editData.reward / editData.rawReward) * 100)}%引き）</span></div>}
          {editData.rawReward && editData.company === "rocket" && editData.rocketBonusRate > 0 && <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0 7px" }}><span style={{ fontSize: sz(11), color: T.textDim }}>Rocket Now 基本金額</span><span style={{ fontSize: sz(13), color: T.textMuted }}>¥{editData.rawReward.toLocaleString()}（+{editData.rocketBonusRate}%反映）</span></div>}
          <div onClick={() => setEditField("incentive")} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderTop: `1px solid ${T.border}`, cursor: "pointer" }}><span style={{ fontSize: sz(13), color: T.textMuted }}>インセンティブ</span><span style={{ fontSize: sz(17), fontWeight: 700, color: T.purple }}>¥{(editData.incentive || 0).toLocaleString()} ✎</span></div>
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 8 }}><div style={{ fontSize: sz(12), color: T.textMuted, marginBottom: 5 }}>会社</div><div style={{ display: "flex", gap: 7 }}>{COS.map(cc => (<button key={cc.id} onClick={() => setEditData({ ...editData, company: cc.id })} style={{ width: 40, height: 40, borderRadius: 10, border: editData.company === cc.id ? `2px solid ${T.text}` : `1.5px solid ${T.borderLight}`, background: editData.company === cc.id ? T.inputBg : cc.bg, color: "#FFF", fontSize: sz(16), fontWeight: 800, cursor: "pointer", fontFamily: FN }}>{cc.letter}</button>))}</div></div>
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 8, marginTop: 8 }}><div style={{ fontSize: sz(12), color: T.textMuted, marginBottom: 5 }}>タイプ</div><div style={{ display: "flex", gap: 6 }}>{OT.map(ot => (<button key={ot.id} onClick={() => setEditOrderType(ot.id)} style={{ flex: 1, padding: "6px 0", borderRadius: 7, border: editData.orderType === ot.id ? `2px solid ${T.accent}` : `1.5px solid ${T.borderLight}`, background: editData.orderType === ot.id ? `${T.accent}20` : T.card, color: editData.orderType === ot.id ? T.accent : T.textMuted, fontSize: sz(12), fontWeight: 600, cursor: "pointer", fontFamily: FN }}>{ot.label}</button>))}</div></div>
          {/* Rating */}
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 8, marginTop: 8 }}>
            <div style={{ fontSize: sz(12), color: T.textMuted, marginBottom: 5 }}>配達評価</div>
            <div style={{ display: "flex", gap: 6 }}>
              {[{ id: "good", label: "🟡 良い", color: "#EAB308" }, { id: "normal", label: "⚪ 普通", color: T.textMuted }, { id: "bad", label: "🔵 悪い", color: "#3B82F6" }].map(r => (
                <button key={r.id} onClick={() => setEditData({ ...editData, rating: r.id })} style={{ flex: 1, padding: "6px 0", borderRadius: 7, border: editData.rating === r.id ? `2px solid ${r.color}` : `1.5px solid ${T.borderLight}`, background: editData.rating === r.id ? `${r.color}18` : T.card, color: editData.rating === r.id ? r.color : T.textDim, fontSize: sz(12), fontWeight: 600, cursor: "pointer", fontFamily: FN }}>{r.label}</button>
              ))}
            </div>
          </div>
          {/* Memo */}
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 8, marginTop: 8 }}>
            <div style={{ fontSize: sz(12), color: T.textMuted, marginBottom: 5 }}>📝 メモ</div>
            <textarea
              value={editData.memo || ""}
              onChange={(e) => setEditData({ ...editData, memo: e.target.value })}
              placeholder="配達に関するメモを入力..."
              style={{
                width: "100%", minHeight: 60, maxHeight: 120, borderRadius: 8,
                border: `1px solid ${T.borderLight}`, background: T.inputBg,
                color: T.text, fontSize: sz(13), padding: "8px 10px",
                fontFamily: FN, resize: "vertical", lineHeight: 1.5,
                boxSizing: "border-box",
              }}
            />
          </div>
          {/* API Weather */}
          {editData.apiWeather && (
            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 8, marginTop: 8 }}>
              <div style={{ fontSize: sz(12), color: T.textMuted, marginBottom: 5 }}>取得天候データ</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 5 }}>
                <div style={{ background: T.barBg, borderRadius: 7, padding: "6px 4px", textAlign: "center" }}>
                  <div style={{ fontSize: sz(9), color: T.textDim }}>天候</div>
                  <div style={{ fontSize: sz(15), fontWeight: 700, color: T.text }}>{WEATHER.find(w => w.id === editData.apiWeather.weatherId)?.icon || "?"}</div>
                </div>
                <div style={{ background: T.barBg, borderRadius: 7, padding: "6px 4px", textAlign: "center" }}>
                  <div style={{ fontSize: sz(9), color: T.textDim }}>気温</div>
                  <div style={{ fontSize: sz(13), fontWeight: 700, color: T.text }}>{editData.apiWeather.temperature}℃</div>
                </div>
                <div style={{ background: T.barBg, borderRadius: 7, padding: "6px 4px", textAlign: "center" }}>
                  <div style={{ fontSize: sz(9), color: T.textDim }}>風速</div>
                  <div style={{ fontSize: sz(13), fontWeight: 700, color: T.text }}>{editData.apiWeather.windspeed}<span style={{ fontSize: sz(8) }}>km/h</span></div>
                </div>
                <div style={{ background: T.barBg, borderRadius: 7, padding: "6px 4px", textAlign: "center" }}>
                  <div style={{ fontSize: sz(9), color: T.textDim }}>雨量</div>
                  <div style={{ fontSize: sz(13), fontWeight: 700, color: T.text }}>{editData.apiWeather.precipitation != null ? editData.apiWeather.precipitation : "-"}<span style={{ fontSize: sz(8) }}>mm</span></div>
                </div>
              </div>
            </div>
          )}
        </div>
        <button onClick={svEdit} style={{ ...okBt(false), maxWidth: "100%", height: 46, marginBottom: 5 }}>保存</button>
        <button onClick={delEdit} style={{ width: "100%", height: 40, borderRadius: 10, border: "1.5px solid #EF444444", background: T.card, color: "#EF4444", fontSize: sz(13), fontWeight: 600, cursor: "pointer", fontFamily: FN }}>削除</button>
        <button onClick={() => setScreen("main")} style={{ width: "100%", height: 36, borderRadius: 10, border: `1.5px solid ${T.borderLight}`, background: "none", color: T.textMuted, fontSize: sz(13), fontWeight: 600, cursor: "pointer", fontFamily: FN, marginTop: 3 }}>戻る</button>
      </div>
    </div>);
  }

  // ═══ SETTINGS ═══
  if (screen === "settings") {
    const row = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: `1px solid ${T.border}` };
    const rowLast = { ...row, borderBottom: "none" };
    return (
      <div style={{ fontFamily: FN, background: T.bg, minHeight: "100dvh", height: "100dvh", maxWidth: 430, margin: "0 auto", color: T.text, padding: "16px 20px 34px", overflowY: "auto", WebkitOverflowScrolling: "touch", boxSizing: "border-box" }}>
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
        {/* Rocket Now追加報酬設定 */}
        <div style={{ background: T.card, borderRadius: 14, padding: "4px 18px 14px", border: `1px solid ${T.border}`, marginBottom: 16 }}>
          <div style={{ fontSize: sz(12), color: T.textDim, fontWeight: 600, padding: "12px 0 4px", letterSpacing: 1 }}>報酬補正</div>
          <div style={{ fontSize: sz(14), fontWeight: 700, marginBottom: 4, color: T.text }}>Rocket Now 追加報酬</div>
          <div style={{ fontSize: sz(11), color: T.textMuted, lineHeight: 1.6, marginBottom: 8 }}>配達完了時にRocket Nowを選択すると、入力金額に選択中の追加報酬率を上乗せして記録します。</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
            {[
              { rate: 0, label: "追加報酬なし", sub: "0%" },
              { rate: 10, label: "グリーン", sub: "10%" },
              { rate: 15, label: "ブルー", sub: "15%" },
              { rate: 20, label: "パープル", sub: "20%" },
              { rate: 25, label: "ゴールド", sub: "25%" },
              { rate: 30, label: "ゴールドプラス", sub: "30%" },
            ].map(opt => {
              const sel = (settings.rocketBonusRate || 0) === opt.rate;
              return (
                <button key={opt.rate} onClick={() => updateSettings({ rocketBonusRate: opt.rate })} style={{
                  padding: "9px 6px", borderRadius: 10,
                  border: sel ? `2px solid ${T.accent}` : `1px solid ${T.borderLight}`,
                  background: sel ? `${T.accent}22` : T.inputBg,
                  color: sel ? T.accent : T.textMuted,
                  cursor: "pointer", fontFamily: FN,
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                }}>
                  <span style={{ fontSize: sz(12), fontWeight: 800 }}>{opt.label}</span>
                  <span style={{ fontSize: sz(11), fontWeight: 600, color: sel ? T.accent : T.textDim }}>{opt.sub}</span>
                </button>
              );
            })}
          </div>
        </div>
        {/* 稼働曜日設定 */}
        <div style={{ background: T.card, borderRadius: 14, padding: "4px 18px 14px", border: `1px solid ${T.border}`, marginBottom: 16 }}>
          <div style={{ fontSize: sz(12), color: T.textDim, fontWeight: 600, padding: "12px 0 4px", letterSpacing: 1 }}>稼働予定</div>
          <div style={{ fontSize: sz(14), fontWeight: 600, marginBottom: 4 }}>稼働する曜日</div>
          <div style={{ fontSize: sz(11), color: T.textDim, marginBottom: 12, lineHeight: 1.4 }}>日次目標の計算に使用します</div>
          <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
            {[
              { day: 1, label: "月" }, { day: 2, label: "火" }, { day: 3, label: "水" },
              { day: 4, label: "木" }, { day: 5, label: "金" }, { day: 6, label: "土" }, { day: 0, label: "日" }
            ].map(({ day, label }) => {
              const wd = settings.workDays || [1, 2, 3, 4, 5];
              const sel = wd.includes(day);
              return (
                <button key={day} onClick={() => {
                  const next = sel ? wd.filter(d => d !== day) : [...wd, day];
                  if (next.length > 0) updateSettings({ workDays: next });
                }} style={{
                  width: 42, height: 42, borderRadius: 10,
                  border: sel ? `2px solid ${T.accent}` : `1px solid ${T.borderLight}`,
                  background: sel ? (T.accent + "22") : T.inputBg,
                  color: sel ? T.accent : T.textMuted,
                  fontSize: sz(14), fontWeight: sel ? 700 : 500,
                  cursor: "pointer", fontFamily: FN,
                  display: "flex", alignItems: "center", justifyContent: "center"
                }}>{label}</button>
              );
            })}
          </div>
          <div style={{ fontSize: sz(11), color: T.textMuted, textAlign: "center", marginTop: 8 }}>
            週{(settings.workDays || [1, 2, 3, 4, 5]).length}日稼働
          </div>
        </div>
        {/* 自動オフライン設定 */}
        <div style={{ background: T.card, borderRadius: 14, padding: "4px 18px 14px", border: `1px solid ${T.border}`, marginBottom: 16 }}>
          <div style={{ fontSize: sz(12), color: T.textDim, fontWeight: 600, padding: "12px 0 4px", letterSpacing: 1 }}>稼働補正</div>
          <div style={{ fontSize: sz(14), fontWeight: 600, marginBottom: 4 }}>自動オフライン</div>
          <div style={{ fontSize: sz(11), color: T.textDim, lineHeight: 1.6, marginBottom: 10 }}>オンライン中に操作がない場合、最後の操作時刻から指定時間で稼働を終了します。受注中は記録保護のため自動終了しません。</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
            {[
              { value: 0, label: "OFF" },
              { value: 1, label: "1時間" },
              { value: 2, label: "2時間" },
              { value: 3, label: "3時間" },
            ].map(opt => {
              const sel = (settings.autoOfflineHours || 0) === opt.value;
              return (
                <button key={opt.value} onClick={() => {
                  updateSettings({ autoOfflineHours: opt.value });
                  if (opt.value > 0 && data.currentSessionStart && !data.currentLastActivityAt) update(d => { d.currentLastActivityAt = Date.now(); });
                }} style={{
                  height: 38, borderRadius: 9,
                  border: sel ? `2px solid ${T.accent}` : `1px solid ${T.borderLight}`,
                  background: sel ? `${T.accent}20` : T.inputBg,
                  color: sel ? T.accent : T.textMuted,
                  fontSize: sz(12), fontWeight: sel ? 800 : 600,
                  cursor: "pointer", fontFamily: FN,
                }}>{opt.label}</button>
              );
            })}
          </div>
          {settings.autoOfflineHours > 0 && (
            <div style={{ fontSize: sz(10), color: T.textMuted, marginTop: 8, lineHeight: 1.5 }}>
              現在: 最後の操作から{settings.autoOfflineHours}時間で自動オフライン
            </div>
          )}
        </div>
        {/* PickGo手数料設定 */}
        <div style={{ background: T.card, borderRadius: 14, padding: "4px 18px", border: `1px solid ${T.border}`, marginTop: 16 }}>
          <div style={{ fontSize: sz(12), color: T.textDim, fontWeight: 600, padding: "12px 0 4px", letterSpacing: 1 }}>PickGo 手数料</div>
          <div style={{ fontSize: sz(11), color: T.textMuted, lineHeight: 1.6, marginBottom: 8 }}>配達完了時にPickGoを選択すると、入力金額から手数料を自動で差し引いて記録します。</div>
          <div style={{ display: "flex", gap: 8, paddingBottom: 12 }}>
            {[{ rate: 15, label: "15%", sub: "25万円未満" }, { rate: 10, label: "10%", sub: "25万円以上" }].map(opt => {
              const sel = (settings.pickgoFeeRate || 15) === opt.rate;
              return (
                <button key={opt.rate} onClick={() => updateSettings({ pickgoFeeRate: opt.rate })} style={{
                  flex: 1, padding: "10px 0", borderRadius: 10,
                  border: sel ? `2px solid ${T.accent}` : `1px solid ${T.borderLight}`,
                  background: sel ? (T.accent + "22") : T.inputBg,
                  color: sel ? T.accent : T.textMuted,
                  fontSize: sz(16), fontWeight: 700,
                  cursor: "pointer", fontFamily: FN,
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                }}>
                  <span>{opt.label}</span>
                  <span style={{ fontSize: sz(10), fontWeight: 500, color: sel ? T.accent : T.textDim }}>{opt.sub}</span>
                </button>
              );
            })}
          </div>
        </div>
        {/* データ出力 */}
        <div style={{ background: T.card, borderRadius: 14, padding: "14px 18px", border: `1px solid ${T.border}`, marginTop: 16 }}>
          <div style={{ fontSize: sz(12), color: T.textDim, fontWeight: 600, marginBottom: 4, letterSpacing: 1 }}>データ出力</div>
          <div style={{ fontSize: sz(14), fontWeight: 600, color: T.text, marginBottom: 4 }}>CSVテキストを保存</div>
          <div style={{ fontSize: sz(11), color: T.textMuted, lineHeight: 1.6, marginBottom: 10 }}>配達・稼働・休憩・地蔵・インセンティブを1つのCSVにまとめます。GPS座標とメモも含まれます。</div>
          <button onClick={downloadCsvText} style={{ width: "100%", height: 44, borderRadius: 10, border: "none", background: T.accent, color: "#000", fontSize: sz(14), fontWeight: 700, cursor: "pointer", fontFamily: FN }}>CSVを保存/共有</button>
          {csvExport && (
            <div style={{ marginTop: 12, borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
              <div style={{ fontSize: sz(11), color: T.textMuted, lineHeight: 1.5, marginBottom: 8 }}>
                保存できない場合は下のCSVテキストをコピーして渡してください。ファイル名: {csvExport.filename}
              </div>
              <textarea
                readOnly
                value={csvExport.csv}
                style={{
                  width: "100%", height: 120, borderRadius: 8,
                  border: `1px solid ${T.borderLight}`, background: T.inputBg,
                  color: T.text, fontSize: sz(10), padding: "8px",
                  fontFamily: "monospace", boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(csvExport.csv);
                    setActionToast("✓ CSVをコピーしました");
                    setTimeout(() => setActionToast(null), 1600);
                  } catch {
                    setPopup({ msg: "自動コピーに失敗しました。\nCSVテキスト欄を長押ししてコピーしてください。", onConfirm: () => setPopup(null) });
                  }
                }} style={{ flex: 1, height: 38, borderRadius: 9, border: "none", background: T.purple, color: "#FFF", fontSize: sz(12), fontWeight: 700, cursor: "pointer", fontFamily: FN }}>コピー</button>
                <button onClick={() => setCsvExport(null)} style={{ width: 82, height: 38, borderRadius: 9, border: `1px solid ${T.borderLight}`, background: "none", color: T.textMuted, fontSize: sz(12), fontWeight: 700, cursor: "pointer", fontFamily: FN }}>閉じる</button>
              </div>
            </div>
          )}
        </div>
        <div style={{ background: T.card, borderRadius: 14, padding: "12px 18px", border: `1px solid ${T.border}`, marginTop: 16 }}>
          <div style={{ fontSize: sz(12), color: "#EF4444", fontWeight: 600, marginBottom: 6 }}>データについて</div>
          <div style={{ fontSize: sz(11), color: T.textDim, lineHeight: 1.6 }}>配達データは端末のブラウザ内に保存されています。以下の操作でデータが消失します：</div>
          <div style={{ fontSize: sz(11), color: T.textDim, lineHeight: 1.8, marginTop: 4, paddingLeft: 8 }}>
            ・ブラウザの「Webサイトデータ」を削除<br/>
            ・ホーム画面からアプリを削除<br/>
            ・ブラウザの全データ消去
          </div>
          <div style={{ fontSize: sz(11), color: T.textDim, lineHeight: 1.6, marginTop: 6 }}>通常のアプリ更新ではデータは消えません。</div>
        </div>
        <div style={{ fontSize: sz(11), color: T.textFaint, textAlign: "center", marginTop: 20 }}>配達ログ v1.0</div>
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
    <div onClick={onClick} style={{ background: T.bg, minHeight: "100dvh", padding: "14px 16px", maxWidth: 430, margin: "0 auto", fontFamily: FN, color: T.text, overflowY: "auto", height: "100dvh" }}>
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

  if (anaScreen === "sales") {
    const moveMonth = (delta) => {
      const [y, m] = salesMonth.split("-").map(Number);
      const d = new Date(y, m - 1 + delta, 1);
      setSalesMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    };
    const salesLogs = (() => {
      const map = new Map();
      anaAll.forEach(l => { if (l?.date) map.set(l.date, l); });
      return [...map.values()].filter(l => salesMode === "month" ? l.date?.startsWith(salesMonth) : l.date?.startsWith(salesYear));
    })();
    const rowsMap = new Map(COS.map(c => [c.id, { id: c.id, letter: c.letter, name: c.name, bg: c.bg, reward: 0, deliveryInc: 0, dailyInc: 0, total: 0, count: 0 }]));
    salesLogs.forEach(log => {
      (log.deliveries || []).filter(d => !d.cancelled).forEach(d => {
        const id = d.company || "unknown";
        if (!rowsMap.has(id)) rowsMap.set(id, { id, letter: "?", name: "不明", bg: "#6B7280", reward: 0, deliveryInc: 0, dailyInc: 0, total: 0, count: 0 });
        const r = rowsMap.get(id);
        r.reward += d.reward || 0;
        r.deliveryInc += d.incentive || 0;
        r.total += (d.reward || 0) + (d.incentive || 0);
        r.count += dc(d);
      });
      (log.dailyIncentives || []).forEach(di => {
        const id = di.company || "unknown";
        if (!rowsMap.has(id)) rowsMap.set(id, { id, letter: "?", name: "不明", bg: "#6B7280", reward: 0, deliveryInc: 0, dailyInc: 0, total: 0, count: 0 });
        const r = rowsMap.get(id);
        r.dailyInc += di.amount || 0;
        r.total += di.amount || 0;
      });
    });
    const rows = [...rowsMap.values()];
    const totalRow = rows.reduce((a, r) => ({
      id: "all", letter: "全", name: "全社合計", bg: T.accent,
      reward: a.reward + r.reward,
      deliveryInc: a.deliveryInc + r.deliveryInc,
      dailyInc: a.dailyInc + r.dailyInc,
      total: a.total + r.total,
      count: a.count + r.count,
    }), { reward: 0, deliveryInc: 0, dailyInc: 0, total: 0, count: 0 });
    const [sy, sm] = salesMonth.split("-").map(Number);
    const lastDay = new Date(sy, sm, 0).getDate();
    const rangeLabel = salesMode === "month" ? `${sy}/${sm}/1〜${sy}/${sm}/${lastDay}` : `${salesYear}/1/1〜${salesYear}/12/31`;
    const activeRows = rows.sort((a, b) => b.total - a.total);
    const rowEl = (r, isAll = false) => (
      <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: isAll ? "12px 0" : "10px 0", borderTop: isAll ? "none" : `1px solid ${T.border}` }}>
        <div style={{ width: isAll ? 38 : 32, height: isAll ? 38 : 32, borderRadius: 9, background: r.bg, color: r.id === "all" ? "#000" : "#FFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: sz(isAll ? 14 : 12), fontWeight: 900, flexShrink: 0 }}>{r.letter}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
            <div style={{ fontSize: sz(isAll ? 14 : 13), fontWeight: 800, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
            <div style={{ fontSize: sz(isAll ? 18 : 15), fontWeight: 900, color: isAll ? T.accent : T.text }}>¥{r.total.toLocaleString()}</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 3 }}>
            <span style={{ fontSize: sz(10), color: T.textMuted }}>{r.count}件</span>
            <span style={{ fontSize: sz(10), color: T.textMuted }}>配達 ¥{r.reward.toLocaleString()}</span>
            {(r.deliveryInc + r.dailyInc) > 0 && <span style={{ fontSize: sz(10), color: T.purple }}>インセ ¥{(r.deliveryInc + r.dailyInc).toLocaleString()}</span>}
          </div>
        </div>
      </div>
    );
    return (
      <AnaPage title="💴 売上集計">
        <div style={aC}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 12 }}>
            {[{ id: "month", label: "月間" }, { id: "year", label: "年間" }].map(m => (
              <button key={m.id} onClick={() => setSalesMode(m.id)} style={{ height: 38, borderRadius: 9, border: salesMode === m.id ? `2px solid ${T.accent}` : `1px solid ${T.borderLight}`, background: salesMode === m.id ? `${T.accent}20` : T.inputBg, color: salesMode === m.id ? T.accent : T.textMuted, fontSize: sz(13), fontWeight: 800, cursor: "pointer", fontFamily: FN }}>{m.label}</button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <button onClick={() => salesMode === "month" ? moveMonth(-1) : setSalesYear(String(Number(salesYear) - 1))} style={{ width: 38, height: 34, borderRadius: 9, border: `1px solid ${T.borderLight}`, background: T.inputBg, color: T.text, fontSize: sz(15), fontWeight: 800, cursor: "pointer", fontFamily: FN }}>‹</button>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: sz(16), fontWeight: 900, color: T.text }}>{salesMode === "month" ? `${sy}年${sm}月` : `${salesYear}年`}</div>
              <div style={{ fontSize: sz(10), color: T.textDim, marginTop: 2 }}>{rangeLabel}</div>
            </div>
            <button onClick={() => salesMode === "month" ? moveMonth(1) : setSalesYear(String(Number(salesYear) + 1))} style={{ width: 38, height: 34, borderRadius: 9, border: `1px solid ${T.borderLight}`, background: T.inputBg, color: T.text, fontSize: sz(15), fontWeight: 800, cursor: "pointer", fontFamily: FN }}>›</button>
          </div>
          <div style={{ background: T.barBg, borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
            <div style={{ fontSize: sz(11), color: T.textDim, marginBottom: 3 }}>{salesMode === "month" ? "月間売上" : "年間売上"}</div>
            <div style={{ fontSize: sz(28), fontWeight: 900, color: T.accent }}>¥{totalRow.total.toLocaleString()}</div>
          </div>
        </div>
        <div style={aC}>
          <div style={aT2}>会社別内訳</div>
          {rowEl(totalRow, true)}
          {activeRows.map(r => rowEl(r))}
          {salesLogs.length === 0 && <div style={{ fontSize: sz(12), color: T.textDim, textAlign: "center", padding: "12px 0" }}>この期間の記録はありません</div>}
        </div>
      </AnaPage>
    );
  }

  // ═══ DAILY REPORT (FREE) ═══
  if (anaScreen === "daily") {
    const drDate = dailyReportDate;
    const drIsToday = drDate === tds();
    const drLog = drIsToday ? data : allLogs.find(l => l.date === drDate);
    const drPrev = () => { const d = new Date(drDate + "T00:00:00"); d.setDate(d.getDate() - 1); setDailyReportDate(toLD(d.getTime())); };
    const drNext = () => { if (drIsToday) return; const d = new Date(drDate + "T00:00:00"); d.setDate(d.getDate() + 1); setDailyReportDate(toLD(d.getTime())); };
    const drDateObj = new Date(drDate + "T00:00:00");
    const drLabel = `${drDateObj.getFullYear()}年${drDateObj.getMonth() + 1}月${drDateObj.getDate()}日`;
    const DOW_NAMES = ["日","月","火","水","木","金","土"];
    const drDow = DOW_NAMES[drDateObj.getDay()];

    const drDels = drLog ? (drLog.deliveries || []).filter(d => !d.cancelled) : [];
    const drCnt = drDels.reduce((s, d) => s + dc(d), 0);
    const drRev = drDels.reduce((s, d) => s + (d.reward || 0), 0);
    const drInc = drDels.reduce((s, d) => s + (d.incentive || 0), 0) + (drLog?.dailyIncentives || []).reduce((s, d) => s + (d.amount || 0), 0);
    const drSesMs = drLog ? (drLog.sessions || []).reduce((s, x) => s + ((x.end || (drIsToday ? Date.now() : 0)) - x.start), 0) + (drIsToday && drLog.currentSessionStart ? Date.now() - drLog.currentSessionStart : 0) : 0;
    const drBrkMs = drLog ? (drLog.breaks || []).reduce((s, b) => (b.start && b.end) ? s + (b.end - b.start) : s, 0) + (drIsToday && drLog.currentBreakStart ? Date.now() - drLog.currentBreakStart : 0) : 0;
    const drJzMs = drLog ? (drLog.jizoSessions || []).reduce((s, j) => (j.start && j.end) ? s + (j.end - j.start) : s, 0) : 0;
    const drWkMs = Math.max(0, drSesMs - drBrkMs);
    const drHB = drWkMs > 0 ? Math.round(drRev / (drWkMs / 3600000)) : 0;
    const drHA = drWkMs > 0 ? Math.round((drRev + drInc) / (drWkMs / 3600000)) : 0;
    const drRain = rainStatsForLog(drLog);
    const drHourly = Array.from({ length: 24 }, (_, h) => {
      const ds = drDels.filter(d => d.orderTime && new Date(d.orderTime).getHours() === h);
      return { name: `${h}`, 件数: ds.reduce((s, d) => s + dc(d), 0) };
    });
    const drPie = COS.map(c => {
      const rev = drDels.filter(d => d.company === c.id).reduce((s, d) => s + (d.reward || 0), 0);
      return { name: c.letter, value: rev };
    }).filter(d => d.value > 0);
    const bestBracket = drHourly.filter(h => h.件数 > 0).sort((a, b) => b.件数 - a.件数)[0];

    return (
      <AnaPage title="📋 デイリーレポート">
        {/* Date navigation */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <button onClick={drPrev} style={{ background: "none", border: "none", cursor: "pointer", fontSize: sz(16), color: T.textSub, padding: "4px 8px" }}>◀</button>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: sz(14), fontWeight: 700, color: T.text }}>{drLabel}（{drDow}）</div>
            {drIsToday && <div style={{ fontSize: sz(10), color: T.accent, fontWeight: 600 }}>TODAY</div>}
          </div>
          <button onClick={drNext} style={{ background: "none", border: "none", cursor: drIsToday ? "default" : "pointer", fontSize: sz(16), color: drIsToday ? T.textFaint : T.textSub, padding: "4px 8px" }}>▶</button>
        </div>

        {!drLog || drDels.length === 0 ? (
          <div style={{ ...aC, textAlign: "center", padding: "24px 14px" }}>
            <div style={{ fontSize: sz(13), color: T.textDim }}>この日の配達データはありません</div>
          </div>
        ) : (<>
          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <div style={aC}><div style={{ fontSize: sz(10), color: T.textMuted }}>配達件数</div><div style={{ fontSize: sz(24), fontWeight: 800, color: T.accent, marginTop: 2 }}>{drCnt}件</div></div>
            <div style={aC}><div style={{ fontSize: sz(10), color: T.textMuted }}>売上合計</div><div style={{ fontSize: sz(24), fontWeight: 800, color: T.accent, marginTop: 2 }}>¥{(drRev + drInc).toLocaleString()}</div></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <div style={aC}><div style={{ fontSize: sz(10), color: T.textMuted }}>基本時給</div><div style={{ fontSize: sz(22), fontWeight: 800, color: T.accent, marginTop: 2 }}>¥{drHB.toLocaleString()}</div></div>
            <div style={aC}><div style={{ fontSize: sz(10), color: T.purple }}>実質時給</div><div style={{ fontSize: sz(22), fontWeight: 800, color: T.purple, marginTop: 2 }}>¥{drHA.toLocaleString()}</div></div>
          </div>
          <div style={aC}>
            <div style={aT2}>実測雨量</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <div><div style={{ fontSize: sz(10), color: T.textDim }}>状態</div><div style={{ fontSize: sz(14), fontWeight: 800, color: drRain.max && drRain.max > 0 ? "#3B82F6" : T.text }}>{drRain.level}</div></div>
              <div><div style={{ fontSize: sz(10), color: T.textDim }}>最大</div><div style={{ fontSize: sz(14), fontWeight: 800, color: T.text }}>{drRain.max != null ? `${drRain.max}mm` : "-"}</div></div>
              <div><div style={{ fontSize: sz(10), color: T.textDim }}>取得</div><div style={{ fontSize: sz(14), fontWeight: 800, color: T.text }}>{drRain.samples}回</div></div>
            </div>
          </div>

          {/* Hourly bar chart */}
          <div style={aC}>
            <div style={aT2}>時間帯別 配達件数</div>
            <div style={{ display: "flex" }}>
              <div style={{ width: 36, flexShrink: 0, height: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={drHourly} margin={{ top: 4, right: 0, bottom: 0, left: -10 }}>
                    <XAxis dataKey="name" tick={false} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: sz(10), fill: T.textDim }} axisLine={false} tickLine={false} allowDecimals={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                <div style={{ width: 660, height: 160 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={drHourly} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                      <XAxis dataKey="name" tick={{ fontSize: sz(10), fill: T.textDim }} axisLine={false} tickLine={false} interval={0} />
                      <YAxis hide />
                      <Tooltip content={(p) => <ChartTip {...p} theme={T} />} cursor={{ fill: `${T.accent}11` }} />
                      <Bar isAnimationActive={false} dataKey="件数" fill={T.accent} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

          {/* Company pie chart */}
          {drPie.length > 0 && (
            <div style={aC}>
              <div style={aT2}>会社別売上</div>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <ResponsiveContainer width={120} height={120}>
                  <PieChart style={{ pointerEvents: "none" }}>
                    <Pie isAnimationActive={false} data={drPie} dataKey="value" cx="50%" cy="50%" outerRadius={50} innerRadius={25} paddingAngle={2} activeIndex={-1} activeShape={null}>
                      {drPie.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div>
                  {drPie.map((d, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span style={{ fontSize: sz(12), color: T.text }}>{d.name}</span>
                      <span style={{ fontSize: sz(12), fontWeight: 700, color: T.text }}>¥{d.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Insight */}
          {bestBracket && bestBracket.件数 > 0 && (
            <div style={{ ...aC, background: T === LIGHT ? "#FFFBEB" : "#1A1810", border: `1px solid ${T === LIGHT ? "#FDE68A" : "#42381A"}` }}>
              <div style={{ fontSize: sz(13), fontWeight: 700, color: T.accent, marginBottom: 6 }}>💡 ポイント</div>
              <div style={{ fontSize: sz(13), color: T.text, lineHeight: 1.5 }}>⏰ {bestBracket.name}時の配達が最も多い（{bestBracket.件数}件）</div>
            </div>
          )}

          {/* Work info */}
          <div style={aC}>
            <div style={aT2}>稼働情報</div>
            {(() => {
              const actualDelMs = drDels.reduce((s, d) => s + (d.completeTime && d.orderTime ? d.completeTime - d.orderTime : 0), 0);
              const wasteMs = Math.max(0, drSesMs - actualDelMs - drBrkMs);
              return [
                { l: "稼働時間", v: fd(drSesMs), c: T.text, desc: null },
                { l: "実配達時間", v: fd(actualDelMs), c: "#22C55E", desc: null },
                { l: "待機時間", v: fd(wasteMs), c: "#EF4444", desc: `うち地蔵 ${fd(drJzMs)}` },
                { l: "休憩時間", v: fd(drBrkMs), c: T.textMuted, desc: null },
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
        </>)}
      </AnaPage>
    );
  }

  // ═══ WEEKDAY x HOUR WAGE TABLE ═══
  if (anaScreen === "hourwage") {
    const HW_PERIODS = [
      { key: "week", label: "1週間", free: false },
      { key: "month", label: "1ヶ月", free: false },
      { key: "half", label: "半年", free: false },
      { key: "all", label: "全期間", free: false },
    ];
    const hwPeriodItem = HW_PERIODS.find(p => p.key === hwPeriod) || HW_PERIODS[1];
    const hwCanView = hwPeriodItem.free || isPremium;
    const nowMsHw = Date.now();
    const msDayHw = 86400000;
    const hwLogs = anaAll.filter(l => {
      if (!l?.date) return false;
      if (hwPeriod === "week") return l.date >= toLD(nowMsHw - 6 * msDayHw);
      if (hwPeriod === "month") return l.date?.startsWith(todayDate.slice(0, 7));
      if (hwPeriod === "half") return l.date >= toLD(nowMsHw - 180 * msDayHw);
      return true;
    });
    const overlapMs = (aStart, aEnd, bStart, bEnd) => Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
    const cells = Array.from({ length: 24 }, () => Array.from({ length: 7 }, () => ({ rev: 0, workMs: 0, cnt: 0, days: new Set() })));
    hwLogs.forEach(log => {
      const dayStart = new Date(`${log.date}T00:00:00`).getTime();
      const dow = new Date(`${log.date}T00:00:00`).getDay();
      for (let h = 0; h < 24; h++) {
        const hs = dayStart + h * 3600000;
        const he = hs + 3600000;
        const ses = (log.sessions || []).reduce((s, x) => s + (x.start ? overlapMs(x.start, x.end || nowMsHw, hs, he) : 0), 0) + (log.currentSessionStart ? overlapMs(log.currentSessionStart, nowMsHw, hs, he) : 0);
        const brk = (log.breaks || []).reduce((s, b) => s + (b.start ? overlapMs(b.start, b.end || nowMsHw, hs, he) : 0), 0) + (log.currentBreakStart ? overlapMs(log.currentBreakStart, nowMsHw, hs, he) : 0);
        const work = Math.max(0, ses - brk);
        if (work > 0) {
          cells[h][dow].workMs += work;
          cells[h][dow].days.add(log.date);
        }
      }
      (log.deliveries || []).filter(d => !d.cancelled && d.orderTime).forEach(d => {
        const dt = new Date(d.orderTime);
        const h = dt.getHours();
        const dDow = dt.getDay();
        cells[h][dDow].rev += (d.reward || 0) + (d.incentive || 0);
        cells[h][dDow].cnt += dc(d);
      });
    });
    const matrix = cells.map((row, h) => row.map((c, dow) => {
      const wage = c.workMs >= 900000 && c.rev > 0 ? Math.round(c.rev / (c.workMs / 3600000)) : 0;
      return { ...c, hour: h, dow, wage, dayCount: c.days.size };
    }));
    const values = matrix.flat().filter(c => c.wage > 0).map(c => c.wage);
    const maxWage = Math.max(...values, 1);
    const bestCell = matrix.flat().filter(c => c.cnt >= 3 && c.dayCount >= 2).sort((a, b) => b.wage - a.wage)[0];
    const nowCell = matrix[new Date().getHours()]?.[new Date().getDay()];
    const dowLabels = ["日", "月", "火", "水", "木", "金", "土"];
    const cellBg = (c) => {
      if (!c.wage) return T.barBg;
      const strength = Math.min(0.85, Math.max(0.18, c.wage / maxWage));
      if (c.cnt < 3 || c.dayCount < 2) return `rgba(156, 163, 175, ${strength})`;
      return `rgba(34, 197, 94, ${strength})`;
    };
    return (
      <AnaPage title="🧭 稼働時間">
        <div style={{ display: "flex", gap: 3, marginBottom: 10, background: T.barBg, borderRadius: 10, padding: 3 }}>
          {HW_PERIODS.map(p => {
            const active = hwPeriod === p.key;
            const locked = !p.free && !isPremium;
            return (
              <button key={p.key} onClick={() => setHwPeriod(p.key)}
                style={{ padding: "7px 0", flex: 1, borderRadius: 8, border: "none", cursor: "pointer", fontFamily: FN, fontSize: sz(10), fontWeight: active ? 800 : 500, background: active ? T.accent : "transparent", color: active ? "#000" : locked ? T.textDim : T.text }}>
                {p.label}{locked ? "🔒" : ""}
              </button>
            );
          })}
        </div>
        {hwCanView ? (<>
          <div style={aC}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={{ fontSize: sz(10), color: T.textDim }}>今の時間</div>
                <div style={{ fontSize: sz(18), fontWeight: 900, color: nowCell?.wage ? T.accent : T.textDim }}>{nowCell?.wage ? `¥${nowCell.wage.toLocaleString()}/h` : "-"}</div>
                <div style={{ fontSize: sz(10), color: T.textMuted }}>{nowCell?.cnt || 0}件 / {nowCell?.dayCount || 0}日</div>
              </div>
              <div>
                <div style={{ fontSize: sz(10), color: T.textDim }}>最高実績</div>
                <div style={{ fontSize: sz(18), fontWeight: 900, color: bestCell ? "#22C55E" : T.textDim }}>{bestCell ? `¥${bestCell.wage.toLocaleString()}/h` : "-"}</div>
                <div style={{ fontSize: sz(10), color: T.textMuted }}>{bestCell ? `${dowLabels[bestCell.dow]}曜 ${bestCell.hour}時台` : "データ不足"}</div>
              </div>
            </div>
          </div>
          <div style={{ ...aC, padding: 10 }}>
            <div style={aT2}>時給表</div>
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <div style={{ minWidth: 560 }}>
                <div style={{ display: "grid", gridTemplateColumns: "42px repeat(7, 1fr)", gap: 3, marginBottom: 4 }}>
                  <div />
                  {dowLabels.map(d => <div key={d} style={{ fontSize: sz(11), color: T.textMuted, textAlign: "center", fontWeight: 700 }}>{d}</div>)}
                </div>
                {matrix.map((row, h) => (
                  <div key={h} style={{ display: "grid", gridTemplateColumns: "42px repeat(7, 1fr)", gap: 3, marginBottom: 3 }}>
                    <div style={{ fontSize: sz(10), color: T.textDim, display: "flex", alignItems: "center" }}>{h}時</div>
                    {row.map(c => (
                      <div key={`${h}-${c.dow}`} style={{ height: 34, borderRadius: 6, background: cellBg(c), border: `1px solid ${T.border}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", opacity: c.wage ? 1 : 0.45 }}>
                        <div style={{ fontSize: sz(10), fontWeight: 900, color: c.wage ? "#FFF" : T.textDim, lineHeight: 1 }}>{c.wage ? Math.round(c.wage / 100) / 10 : "-"}</div>
                        {c.cnt > 0 && <div style={{ fontSize: sz(8), color: c.wage ? "#FFFFFFCC" : T.textDim, lineHeight: 1.1 }}>{c.cnt}件</div>}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 8, fontSize: sz(10), color: T.textDim }}>
              <span>表示値: 千円/h</span>
              <span>灰色: 件数少</span>
            </div>
          </div>
        </>) : (
          <PremiumBlur>
            <div style={aC}><div style={{ height: 420 }} /></div>
          </PremiumBlur>
        )}
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
    if (hrPeriod === "today") hrFiltered = hrFiltered.filter(d => d.orderTime && toLD(d.orderTime) === todayDate);
    else if (hrPeriod === "week") { const s = toLD(nowMs7 - 6 * msDay7); hrFiltered = hrFiltered.filter(d => d.orderTime && toLD(d.orderTime) >= s); }
    else if (hrPeriod === "month") { const pf = todayDate.slice(0,7); hrFiltered = hrFiltered.filter(d => d.orderTime && toLD(d.orderTime).startsWith(pf)); }
    else if (hrPeriod === "half") { const s = toLD(nowMs7 - 180 * msDay7); hrFiltered = hrFiltered.filter(d => d.orderTime && toLD(d.orderTime) >= s); }
    if (hrDow !== "all") hrFiltered = hrFiltered.filter(d => d.orderTime && new Date(d.orderTime).getDay() === dowMap7[hrDow]);
    if (hrCompany !== "all") hrFiltered = hrFiltered.filter(d => d.company === hrCompany);
    if (hrWeather !== "all") {
      const wxLogs3 = new Set(anaAll.filter(l => l.weather === hrWeather).map(l => l.date));
      hrFiltered = hrFiltered.filter(d => d.orderTime && wxLogs3.has(toLD(d.orderTime)));
    }

    const hData = Array.from({ length: 24 }, (_, h) => {
      const ds = hrFiltered.filter(d => d.orderTime && new Date(d.orderTime).getHours() === h);
      const cnt = ds.reduce((s, d) => s + dc(d), 0);
      const rev = ds.reduce((s, d) => s + (d.reward || 0), 0);
      return { name: `${h}`, 売上: rev, 件数: cnt, 単価: cnt > 0 ? Math.round(rev / cnt) : 0 };
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
      <AnaPage title="⏰ 時間帯詳細" onClick={() => setHrDropdown(null)}>
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
            <div style={{ display: "flex" }}>
              <div style={{ width: 40, flexShrink: 0, height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hData} margin={{ top: 4, right: 0, bottom: 0, left: -10 }}>
                    <XAxis dataKey="name" tick={false} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: sz(9), fill: T.textDim }} axisLine={false} tickLine={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                <div style={{ width: 660, height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                      <XAxis dataKey="name" tick={{ fontSize: sz(10), fill: T.textDim }} axisLine={false} tickLine={false} interval={0} />
                      <YAxis hide />
                      <Tooltip content={(p) => <ChartTip {...p} theme={T} />} cursor={{ fill: `${T.accent}11` }} />
                      <Bar isAnimationActive={false} dataKey="売上" fill={T.accent} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
          <div style={aC}>
            <div style={aT2}>時間帯別 平均単価</div>
            <div style={{ display: "flex" }}>
              <div style={{ width: 40, flexShrink: 0, height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hData} margin={{ top: 4, right: 0, bottom: 0, left: -10 }}>
                    <XAxis dataKey="name" tick={false} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: sz(9), fill: T.textDim }} axisLine={false} tickLine={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                <div style={{ width: 660, height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                      <XAxis dataKey="name" tick={{ fontSize: sz(10), fill: T.textDim }} axisLine={false} tickLine={false} interval={0} />
                      <YAxis hide />
                      <Tooltip content={(p) => <ChartTip {...p} theme={T} />} cursor={{ fill: `${T.accent}11` }} />
                      <Bar isAnimationActive={false} dataKey="単価" fill="#22C55E" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
          <div style={aC}>
            {hData.map((h, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: i < 23 ? `1px solid ${T.border}` : "none", opacity: h.件数 === 0 ? 0.35 : 1 }}>
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
    else if (wdPeriod === "week") { const s = toLD(nowMs8 - 6 * msDay8); wdLogs = wdLogs.filter(l => l.date >= s); }
    else if (wdPeriod === "month") { const pf = todayDate.slice(0,7); wdLogs = wdLogs.filter(l => l.date?.startsWith(pf)); }
    else if (wdPeriod === "half") { const s = toLD(nowMs8 - 180 * msDay8); wdLogs = wdLogs.filter(l => l.date >= s); }
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
      <AnaPage title="📅 曜日詳細" onClick={() => setWdDropdown(null)}>
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
                <Bar isAnimationActive={false} dataKey="平均売上" radius={[4, 4, 0, 0]}>
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
    if (coPeriod === "today") coFiltered = coFiltered.filter(d => d.orderTime && toLD(d.orderTime) === todayDate);
    else if (coPeriod === "week") { const s = toLD(nowMs5 - 6 * msDay5); coFiltered = coFiltered.filter(d => d.orderTime && toLD(d.orderTime) >= s); }
    else if (coPeriod === "month") { const pf = todayDate.slice(0,7); coFiltered = coFiltered.filter(d => d.orderTime && toLD(d.orderTime).startsWith(pf)); }
    else if (coPeriod === "half") { const s = toLD(nowMs5 - 180 * msDay5); coFiltered = coFiltered.filter(d => d.orderTime && toLD(d.orderTime) >= s); }
    // time slot filter
    if (coTimeSlot !== "all") coFiltered = coFiltered.filter(d => d.orderTime && timeMatch5(new Date(d.orderTime).getHours()));
    // dow filter
    if (coDow !== "all") coFiltered = coFiltered.filter(d => d.orderTime && new Date(d.orderTime).getDay() === dowMap5[coDow]);
    // weather filter
    if (coWeather !== "all") {
      const wxLogs = new Set(anaAll.filter(l => l.weather === coWeather).map(l => l.date));
      coFiltered = coFiltered.filter(d => d.orderTime && wxLogs.has(toLD(d.orderTime)));
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
      <AnaPage title="🏢 会社別" onClick={() => setCoDropdown(null)}>
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
                  <Pie isAnimationActive={false} data={coPie.filter(c => c.value > 0)} dataKey="value" cx="50%" cy="50%" outerRadius={60} innerRadius={30} paddingAngle={2} activeIndex={-1} activeShape={null}>
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
                <Bar isAnimationActive={false} dataKey="平均単価" radius={[4, 4, 0, 0]}>
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
      <AnaPage title="🌤️ 天候詳細">
        <PremiumBlur>
          <div style={aC}>
            <div style={aT2}>天候別 時給</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={wxData} layout="vertical" margin={{ top: 4, right: 4, bottom: 0, left: 30 }}>
                <XAxis type="number" tick={{ fontSize: sz(9), fill: T.textDim }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: sz(11), fill: T.textDim }} axisLine={false} tickLine={false} width={50} />
                <Tooltip content={(p) => <ChartTip {...p} theme={T} />} cursor={{ fill: `${T.accent}11` }} />
                <Bar isAnimationActive={false} dataKey="時給" fill={T.accent} radius={[0, 4, 4, 0]} />
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
      const dels = (l.deliveries || []).filter(d => !d.cancelled && (d.apiWeather || d.storeWeather));
      const cnt = dels.length || 1;
      return dels.map(d => ({ ...d, apiWeather: d.apiWeather || d.storeWeather, _weatherSource: d.apiWeather ? "order" : "store", _workShare: workMs / cnt }));
    });
    const cwSamples = anaAll.flatMap(l => weatherSamplesForLog(l).map(s => ({ ...s, _date: l.date })));
    const rainSummary = (() => {
      const vals = cwSamples.map(s => s.precipitation).filter(v => v !== null && v !== undefined && !Number.isNaN(Number(v))).map(Number);
      const max = vals.length ? Math.max(...vals) : null;
      const avg = vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : null;
      const rainy = vals.filter(v => v > 0).length;
      const rainyDays = new Set(cwSamples.filter(s => Number(s.precipitation || 0) > 0).map(s => s._date)).size;
      return { samples: vals.length, max, avg, rainy, rainyDays };
    })();

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
      <AnaPage title="🌡️ 気象条件">
        <PremiumBlur>
          <div style={aC}>
            <div style={aT2}>実測雨量データ</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <div><div style={{ fontSize: sz(10), color: T.textDim }}>取得数</div><div style={{ fontSize: sz(17), fontWeight: 900, color: T.text }}>{rainSummary.samples}回</div></div>
              <div><div style={{ fontSize: sz(10), color: T.textDim }}>最大雨量</div><div style={{ fontSize: sz(17), fontWeight: 900, color: rainSummary.max && rainSummary.max > 0 ? "#3B82F6" : T.text }}>{rainSummary.max != null ? `${rainSummary.max}mm` : "-"}</div></div>
              <div><div style={{ fontSize: sz(10), color: T.textDim }}>雨あり日</div><div style={{ fontSize: sz(17), fontWeight: 900, color: T.text }}>{rainSummary.rainyDays}日</div></div>
            </div>
            <div style={{ fontSize: sz(10), color: T.textDim, marginTop: 8 }}>受注時・店舗到着時に取得した雨量を日別ログに保存して集計しています</div>
          </div>
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
      const sStr = toLD(start.getTime()); const eStr = toLD(end.getTime());
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
      <AnaPage title="📈 推移・季節">
        <PremiumBlur>
          <div style={aC}>
            <div style={aT2}>週別 売上推移</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={weeklyLine} margin={{ top: 4, right: 10, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                <XAxis dataKey="name" tick={{ fontSize: sz(9), fill: T.textDim }} axisLine={false} />
                <YAxis tick={{ fontSize: sz(9), fill: T.textDim }} axisLine={false} />
                <Tooltip content={(p) => <ChartTip {...p} theme={T} />} cursor={{ fill: `${T.accent}11` }} />
                <Line isAnimationActive={false} type="monotone" dataKey="売上" stroke={T.accent} strokeWidth={2} dot={{ r: 4, fill: T.accent }} />
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
                <Line isAnimationActive={false} type="monotone" dataKey="売上" stroke={T.purple} strokeWidth={2} dot={{ r: 4, fill: T.purple }} />
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
    if (upPeriod === "today") upFiltered = upFiltered.filter(d => d.orderTime && toLD(d.orderTime) === todayDate);
    else if (upPeriod === "week") { const s = toLD(nowMs6 - 6 * msDay6); upFiltered = upFiltered.filter(d => d.orderTime && toLD(d.orderTime) >= s); }
    else if (upPeriod === "month") { const pf = todayDate.slice(0,7); upFiltered = upFiltered.filter(d => d.orderTime && toLD(d.orderTime).startsWith(pf)); }
    else if (upPeriod === "half") { const s = toLD(nowMs6 - 180 * msDay6); upFiltered = upFiltered.filter(d => d.orderTime && toLD(d.orderTime) >= s); }
    // time slot
    if (upTimeSlot !== "all") upFiltered = upFiltered.filter(d => d.orderTime && timeMatch6(new Date(d.orderTime).getHours()));
    // dow
    if (upDow !== "all") upFiltered = upFiltered.filter(d => d.orderTime && new Date(d.orderTime).getDay() === dowMap6[upDow]);
    // company
    if (upCompany !== "all") upFiltered = upFiltered.filter(d => d.company === upCompany);
    // weather
    if (upWeather !== "all") {
      const wxLogs2 = new Set(anaAll.filter(l => l.weather === upWeather).map(l => l.date));
      upFiltered = upFiltered.filter(d => d.orderTime && wxLogs2.has(toLD(d.orderTime)));
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
      <AnaPage title="💰 単価詳細" onClick={() => setUpDropdown(null)}>
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
                <Bar isAnimationActive={false} dataKey="平均単価" radius={[4, 4, 0, 0]}>
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

  // ═══ EFFICIENCY ANALYSIS ═══
  if (anaScreen === "efficiency") {
    const todayDate2 = tds();
    const isHoliday = (dateStr) => { const d = new Date(dateStr + "T00:00:00"); const dow = d.getDay(); return dow === 0 || dow === 6; };
    const PEAK_SLOTS_EF = [
      { key: "lunch", label: "昼ピーク", shortLabel: "昼", min: 11, max: 13 },
      { key: "dinner", label: "夜ピーク", shortLabel: "夜", min: 18, max: 21 },
      { key: "late", label: "深夜ピーク", shortLabel: "深夜", min: 1, max: 4 },
    ];
    const TIME_SLOTS_EF = [
      ...PEAK_SLOTS_EF,
      { key: "offpeak", label: "オフピーク", shortLabel: "オフ" },
    ];
    const getSlot = (ts) => { if (!ts) return null; const h = new Date(ts).getHours(); return PEAK_SLOTS_EF.find(s => h >= s.min && h <= s.max)?.key || "offpeak"; };
    const getDayType = (dateStr) => isHoliday(dateStr) ? "holiday" : "weekday";

    // Median helper
    const median = (arr) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
    // Build delivery data with context (exclude: <3min duration, non-PickGo with perMin>=100)
    const buildDels = (dels, dateStr) => dels.filter(d => !d.cancelled && d.orderTime && d.completeTime).map(d => {
      const durMin = (d.completeTime - d.orderTime) / 60000;
      const perMin = durMin > 0 ? (d.reward || 0) / durMin : 0;
      return { ...d, durMin, perMin, _date: dateStr, _dayType: getDayType(dateStr), _slot: getSlot(d.orderTime) };
    }).filter(d => d.durMin >= 3 && !(d.company !== "pickgo" && d.perMin >= 100));

    const todayDels2 = buildDels(data.deliveries, todayDate2);
    // Recent 3 days (free tier)
    const threeDaysAgo = toLD(Date.now() - 2 * 86400000);
    const recentDels = [
      ...allLogs.filter(l => l.date >= threeDaysAgo).flatMap(l => buildDels(l.deliveries || [], l.date)),
      ...todayDels2,
    ];
    // All data (premium tier)
    const allDels2 = [
      ...allLogs.flatMap(l => buildDels(l.deliveries || [], l.date)),
      ...todayDels2,
    ];
    const totalCount = allDels2.length;
    const workDaysCount = new Set([...allLogs.map(l => l.date), ...(data.deliveries.length > 0 ? [data.date] : [])].filter(Boolean)).size;
    // Tiered analysis levels
    const anaLevel = (totalCount >= 200 && workDaysCount >= 21) ? 3 : (totalCount >= 100 && workDaysCount >= 14) ? 2 : (totalCount >= 30 && workDaysCount >= 7) ? 1 : 0;
    const hasEnoughData = anaLevel >= 1;
    const avgPerMin = allDels2.length > 0 ? median(allDels2.map(d => d.perMin)) : 0;
    // Monthly work hours for impact calculation
    const monthlyWorkMs = (() => { let total = 0, days = 0; allLogs.forEach(l => { const ses = (l.sessions || []).reduce((s, x) => s + ((x.end || 0) - x.start), 0); const brk = (l.breaks || []).reduce((s, b) => s + ((b.end || 0) - (b.start || 0)), 0); if (ses > 0) { total += ses - brk; days++; } }); return days > 0 ? total / days * 30 : 0; })();
    const monthlyWorkH = monthlyWorkMs / 3600000;
    const roundUp5 = (v) => Math.max(1, Math.ceil((v || 0) / 5) * 5);
    const longMinThreshold = 45;
    const remoteMinThreshold = 60;
    const decisionDels = isPremium ? allDels2 : recentDels;
    const decisionScopeLabel = isPremium ? "全期間" : "直近3日";
    const lockedDecisionCount = Math.max(0, totalCount - decisionDels.length);
    const allMedianPerMin = decisionDels.length ? median(decisionDels.map(d => d.perMin)) : 0;
    const currentSlotKey = getSlot(Date.now()) || "offpeak";
    const currentSlotLabel = TIME_SLOTS_EF.find(s => s.key === currentSlotKey)?.label || "現在";
    const slotDecisionStats = TIME_SLOTS_EF.map(slot => {
      const dels = decisionDels.filter(d => d._slot === slot.key);
      const shortDels = dels.filter(d => d.durMin < longMinThreshold);
      const longDels = dels.filter(d => d.durMin >= longMinThreshold);
      const remoteDels = dels.filter(d => d.durMin >= remoteMinThreshold);
      const med = dels.length ? median(dels.map(d => d.perMin)) : 0;
      const shortMed = shortDels.length ? median(shortDels.map(d => d.perMin)) : 0;
      const longMed = longDels.length ? median(longDels.map(d => d.perMin)) : 0;
      const targetBase = slot.key === "offpeak" ? med : Math.max(med, shortMed || med);
      return {
        ...slot,
        count: dels.length,
        med,
        shortMed,
        longMed,
        longCount: longDels.length,
        remoteCount: remoteDels.length,
        target: roundUp5(targetBase),
        longTarget: roundUp5(slot.key === "offpeak" ? Math.max(targetBase, med * 1.05) : Math.max(targetBase * 1.25, targetBase + 10)),
      };
    });
    const currentSlotStats = slotDecisionStats.find(s => s.key === currentSlotKey) || slotDecisionStats[0];
    const slotComment = (s) => {
      if (!s || s.count < 8) return "まだ傾向を見るには件数が少なめです。";
      if (s.key === "offpeak") return `ロング候補は¥${s.longTarget}/分以上なら検討。`;
      if (s.longCount >= 3 && s.longMed > 0 && s.longMed < s.shortMed) return `ロングは短距離より¥${Math.round(s.shortMed - s.longMed)}/分低め。高単価だけ残す。`;
      return `ピークは短距離回転を優先。ロングは¥${s.longTarget}/分以上が目安。`;
    };
    const storeWaitEntriesFor = (d2, date) => {
      const pickupStops = (d2.stops || []).filter(s => s.kind === "pickup" && s.arrivalTime);
      if (pickupStops.length > 0) {
        return pickupStops.map(s => ({
          _date: date,
          company: d2.company,
          orderTime: d2.orderTime,
          arrivalTime: s.arrivalTime,
          departTime: s.departTime || null,
          completeTime: d2.completeTime || null,
        }));
      }
      if (d2.storeArrivalTime) {
        return [{
          _date: date,
          company: d2.company,
          orderTime: d2.orderTime,
          arrivalTime: d2.storeArrivalTime,
          departTime: d2.storeDepartTime || null,
          completeTime: d2.completeTime || null,
        }];
      }
      return [];
    };
    const allWaitEntries2 = [
      ...allLogs.flatMap(l => (l.deliveries || []).flatMap(d => storeWaitEntriesFor(d, l.date))),
      ...data.deliveries.flatMap(d => storeWaitEntriesFor(d, data.date)),
    ].map(e => {
      const waitMs = Math.max(0, ((e.departTime || e.completeTime || Date.now()) - e.arrivalTime));
      return { ...e, waitMin: waitMs / 60000 };
    }).filter(e => Number.isFinite(e.waitMin) && e.waitMin >= 0);
    const decisionWaitEntries2 = isPremium ? allWaitEntries2 : allWaitEntries2.filter(e => e._date >= threeDaysAgo);
    const waitTotal2 = decisionWaitEntries2.length;
    const wait5Count = decisionWaitEntries2.filter(e => e.waitMin >= 5).length;
    const wait10Count = decisionWaitEntries2.filter(e => e.waitMin >= 10).length;
    const waitMedian2 = waitTotal2 ? median(decisionWaitEntries2.map(e => e.waitMin)) : 0;
    const waitRiskLabel = waitTotal2 === 0 ? "未記録" : wait10Count / waitTotal2 >= 0.2 ? "強め" : wait5Count / waitTotal2 >= 0.25 ? "注意" : "低め";
    const companySlotStats = TIME_SLOTS_EF.map(slot => {
      const dels = decisionDels.filter(d => d._slot === slot.key);
      const rows = COS.map(co => {
        const coDels = dels.filter(d => d.company === co.id);
        return {
          id: co.id,
          name: co.name,
          count: coDels.length,
          med: coDels.length ? median(coDels.map(d => d.perMin)) : 0,
          share: dels.length ? coDels.length / dels.length : 0,
        };
      }).filter(r => r.count > 0).sort((a, b) => b.count - a.count);
      return { ...slot, total: dels.length, rows };
    });
    const companyBiasTargets = companySlotStats.filter(s => s.total >= 8).slice(0, 3);

    // ─── Rule detection function ───
    // useDayType: true=平日/土日祝で分ける(PRO), false=分けない(無料)
    const detectRules = (dels, useDayType = true) => {
      const rules = [];
      const avg = dels.length > 0 ? median(dels.map(d => d.perMin)) : 0;
      if (avg <= 0 || dels.length < 15) return rules;

      // Rule 1: Company × Time (optionally within same dayType)
      const coTimeMap = {};
      dels.forEach(d => {
        if (!d._slot || !d.company) return;
        const key = useDayType ? `${d.company}|${d._slot}|${d._dayType}` : `${d.company}|${d._slot}`;
        if (!coTimeMap[key]) coTimeMap[key] = { perMins: [], company: d.company, slot: d._slot, dayType: d._dayType };
        coTimeMap[key].perMins.push(d.perMin);
      });
      Object.values(coTimeMap).forEach(g => {
        if (g.perMins.length < 15) return;
        const gAvg = median(g.perMins);
        const diff = (gAvg - avg) / avg;
        if (diff < -0.15) {
          const coName = COS.find(c => c.id === g.company)?.name || g.company;
          const slotLabel = TIME_SLOTS_EF.find(s => s.key === g.slot)?.label || g.slot;
          const dayLabel = useDayType ? (g.dayType === "holiday" ? "土日祝" : "平日") : "";
          const totalMin = g.perMins.length * (dels.reduce((s, d) => s + d.durMin, 0) / dels.length);
          const monthImpact = Math.round((avg - gAvg) * totalMin * (30 / Math.max(1, new Set(dels.map(d => d._date)).size)));
          rules.push({ type: "company_time", label: `${coName} × ${dayLabel}${slotLabel}`, gAvg: Math.round(gAvg), avg: Math.round(avg), diff: Math.round(diff * 100), count: g.perMins.length, monthImpact, icon: "🏢" });
        }
      });

      // Rule 2: Double/Triple trap (same slot + dayType)
      const slotDayGroups = {};
      dels.forEach(d => {
        if (!d._slot) return;
        const key = `${d._slot}|${d._dayType}`;
        if (!slotDayGroups[key]) slotDayGroups[key] = { single: [], multi: [] };
        if (d.orderType === "single") slotDayGroups[key].single.push(d.perMin);
        else slotDayGroups[key].multi.push(d.perMin);
      });
      let allMultiPMs = [], allSinglePMs = [];
      Object.values(slotDayGroups).forEach(g => {
        if (g.single.length >= 3 && g.multi.length >= 3) {
          allMultiPMs.push(...g.multi);
          allSinglePMs.push(...g.single);
        }
      });
      const multiTotal = allMultiPMs.length;
      if (multiTotal >= 15 && allSinglePMs.length >= 15) {
        const mAvg = median(allMultiPMs);
        const sAvg = median(allSinglePMs);
        const diff = (mAvg - sAvg) / sAvg;
        if (diff < -0.15) {
          const totalMin = multiTotal * (dels.reduce((s, d) => s + d.durMin, 0) / dels.length);
          const monthImpact = Math.round((sAvg - mAvg) * totalMin * (30 / Math.max(1, new Set(dels.map(d => d._date)).size)));
          rules.push({ type: "multi_trap", label: "ダブル・トリプル案件", gAvg: Math.round(mAvg), avg: Math.round(sAvg), diff: Math.round(diff * 100), count: multiTotal, monthImpact, icon: "📦" });
        }
      }

      // Rule 3: Overtime cliff (compare first half vs second half of session)
      const daySessionDels = {};
      dels.forEach(d => {
        if (!daySessionDels[d._date]) daySessionDels[d._date] = [];
        daySessionDels[d._date].push(d);
      });
      let firstHalfPMs = [], secondHalfPMs = [];
      Object.values(daySessionDels).forEach(dayDels => {
        if (dayDels.length < 4) return;
        const sorted = [...dayDels].sort((a, b) => a.orderTime - b.orderTime);
        const mid = Math.floor(sorted.length / 2);
        sorted.slice(0, mid).forEach(d => firstHalfPMs.push(d.perMin));
        sorted.slice(mid).forEach(d => secondHalfPMs.push(d.perMin));
      });
      if (firstHalfPMs.length >= 15 && secondHalfPMs.length >= 15) {
        const fAvg = median(firstHalfPMs);
        const sAvg2 = median(secondHalfPMs);
        const diff = (sAvg2 - fAvg) / fAvg;
        if (diff < -0.15) {
          rules.push({ type: "overtime", label: "稼働後半の効率低下", gAvg: Math.round(sAvg2), avg: Math.round(fAvg), diff: Math.round(diff * 100), count: secondHalfPMs.length, monthImpact: Math.round((fAvg - sAvg2) * secondHalfPMs.length * (30 / Math.max(1, Object.keys(daySessionDels).length))), icon: "⏰" });
        }
      }

      // Rule 4: Low reward trap
      const rewardThresholds = [300, 400, 500];
      for (const thresh of rewardThresholds) {
        const lowDels = dels.filter(d => (d.reward || 0) <= thresh);
        const highDels = dels.filter(d => (d.reward || 0) > thresh);
        if (lowDels.length >= 15 && highDels.length >= 15) {
          const lowAvg = median(lowDels.map(d => d.perMin));
          const highAvg = median(highDels.map(d => d.perMin));
          const diff = (lowAvg - highAvg) / highAvg;
          if (diff < -0.15) {
            const totalMin = lowDels.reduce((s, d) => s + d.durMin, 0);
            const monthImpact = Math.round((highAvg - lowAvg) * totalMin * (30 / Math.max(1, new Set(dels.map(d => d._date)).size)));
            rules.push({ type: "low_reward", label: `報酬¥${thresh}以下の配達`, gAvg: Math.round(lowAvg), avg: Math.round(highAvg), diff: Math.round(diff * 100), count: lowDels.length, monthImpact, icon: "💸" });
            break;
          }
        }
      }

      // Rule 5: Area inefficiency
      const areaMap = {};
      dels.forEach(d => {
        if (!d.areaName) return;
        if (!areaMap[d.areaName]) areaMap[d.areaName] = [];
        areaMap[d.areaName].push(d.perMin);
      });
      Object.entries(areaMap).forEach(([area, pms]) => {
        if (pms.length < 15) return;
        const aAvg = median(pms);
        const diff = (aAvg - avg) / avg;
        if (diff < -0.15) {
          const totalMin = pms.length * (dels.reduce((s, d) => s + d.durMin, 0) / dels.length);
          const monthImpact = Math.round((avg - aAvg) * totalMin * (30 / Math.max(1, new Set(dels.map(d => d._date)).size)));
          rules.push({ type: "area", label: `${area}エリア`, gAvg: Math.round(aAvg), avg: Math.round(avg), diff: Math.round(diff * 100), count: pms.length, monthImpact, icon: "📍" });
        }
      });

      return rules.filter(r => r.monthImpact > 0).sort((a, b) => b.monthImpact - a.monthImpact);
    };

    const recentRules = detectRules(recentDels, false); // 無料: 直近3日、平日/土日祝区別なし
    const allRules = hasEnoughData ? detectRules(allDels2, true) : []; // PRO: 全期間、平日/土日祝区別あり
    const totalMonthImpact = allRules.reduce((s, r) => s + r.monthImpact, 0);

    // Count today's deliveries that match all-time rules
    const todayRuleHits = allRules.reduce((count, rule) => {
      return count + todayDels2.filter(d => {
        if (rule.type === "company_time") {
          const [co, slot, dayType] = rule.label.split(" × ");
          const coId = COS.find(c => c.name === co.replace(/ × .*/, ""))?.id;
          return d.company === coId && d._slot === slot && d._dayType === dayType;
        }
        if (rule.type === "multi_trap") return d.orderType !== "single";
        if (rule.type === "low_reward") {
          const thresh = parseInt(rule.label.match(/\d+/)?.[0] || "0", 10);
          return (d.reward || 0) <= thresh;
        }
        if (rule.type === "area") return d.areaName === rule.label.replace("エリア", "");
        return false;
      }).length;
    }, 0);

    const ruleAction = (rule) => {
      const targetPM = Math.max(1, Math.ceil((rule.avg || avgPerMin || 0) / 5) * 5);
      const rewardNum = parseInt(rule.label.match(/\d+/)?.[0] || "0", 10);
      if (rule.type === "low_reward") return `報酬¥${rewardNum + 100}以上、または¥${targetPM}/分以上を基準にする`;
      if (rule.type === "multi_trap") return `複数案件は¥${targetPM}/分以上だけ取る`;
      if (rule.type === "overtime") return `後半に¥${targetPM}/分を下回るなら休憩を挟む`;
      return `この条件では¥${targetPM}/分以上の案件だけ取る`;
    };
    const RuleCard = ({ rule }) => {
      const targetPM = Math.max(1, Math.ceil((rule.avg || avgPerMin || 0) / 5) * 5);
      return (
        <div style={{ ...aC, padding: "14px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: sz(14), fontWeight: 700, color: T.text }}>{rule.icon} {rule.label}</div>
            <div style={{ fontSize: sz(11), color: T.textDim }}>{rule.count}件</div>
          </div>
          <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
            <div style={{ flex: 1, background: "#EF444418", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
              <div style={{ fontSize: sz(9), color: "#EF4444", marginBottom: 2 }}>この条件</div>
              <div style={{ fontSize: sz(16), fontWeight: 800, color: "#EF4444" }}>¥{rule.gAvg}<span style={{ fontSize: sz(9) }}>/分</span></div>
            </div>
            <div style={{ flex: 1, background: "#22C55E18", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
              <div style={{ fontSize: sz(9), color: "#22C55E", marginBottom: 2 }}>取る基準</div>
              <div style={{ fontSize: sz(16), fontWeight: 800, color: "#22C55E" }}>¥{targetPM}<span style={{ fontSize: sz(9) }}>/分</span></div>
            </div>
          </div>
          <div style={{ background: T.barBg, borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>
            <div style={{ fontSize: sz(12), color: T.text, fontWeight: 700 }}>{ruleAction(rule)}</div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: sz(12), color: "#EF4444", fontWeight: 700 }}>{rule.diff}%</div>
            <div style={{ fontSize: sz(12), color: T.textMuted }}>改善で月 <span style={{ fontWeight: 700, color: "#22C55E" }}>+¥{rule.monthImpact.toLocaleString()}</span></div>
          </div>
        </div>
      );
    };

    return (
      <AnaPage title="🎯 案件判断">
        <div style={aC}>
          <div style={{ fontSize: sz(14), fontWeight: 800, color: T.text, marginBottom: 6 }}>受注前に見る目安</div>
          <div style={{ fontSize: sz(11), color: T.textDim, lineHeight: 1.6, marginBottom: 10 }}>
            評価の中心は分単価です。ピークは短距離回転、オフピークはボーダー以上ならロングも検討する前提で見ます。
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ background: T.barBg, borderRadius: 8, padding: "10px 8px", textAlign: "center" }}>
              <div style={{ fontSize: sz(10), color: T.textDim }}>現在の時間帯</div>
              <div style={{ fontSize: sz(17), fontWeight: 800, color: T.accent }}>{currentSlotLabel}</div>
              <div style={{ fontSize: sz(10), color: T.textMuted }}>{currentSlotStats?.count || 0}件の履歴</div>
            </div>
            <div style={{ background: T.barBg, borderRadius: 8, padding: "10px 8px", textAlign: "center" }}>
              <div style={{ fontSize: sz(10), color: T.textDim }}>{decisionScopeLabel}の中央分給</div>
              <div style={{ fontSize: sz(17), fontWeight: 800, color: "#22C55E" }}>¥{Math.round(allMedianPerMin)}<span style={{ fontSize: sz(10) }}>/分</span></div>
              <div style={{ fontSize: sz(10), color: T.textMuted }}>{decisionDels.length}件</div>
            </div>
          </div>
          <div style={{ marginTop: 10, background: T.inputBg, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 10px", fontSize: sz(11), color: T.textSub, lineHeight: 1.55 }}>
            暫定ルール: 45分以上をロング候補、60分以上を戻りコストが重い案件として扱います。
          </div>
          {!isPremium && lockedDecisionCount > 0 && (
            <div style={{ marginTop: 10, background: `${T.purple}12`, border: `1px solid ${T.purple}44`, borderRadius: 9, padding: "10px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 4 }}>
                <div style={{ fontSize: sz(12), fontWeight: 800, color: T.text }}>PROで全期間の案件判断</div>
                <div style={{ fontSize: sz(10), fontWeight: 700, color: T.purple }}>+{lockedDecisionCount}件</div>
              </div>
              <div style={{ fontSize: sz(11), color: T.textSub, lineHeight: 1.55 }}>
                無料版は直近3日で今日の判断。PROでは全期間を使って、曜日差・季節差・会社別の癖まで含めた自分専用ボーダーを表示します。
              </div>
            </div>
          )}
        </div>

        <div style={aC}>
          <div style={aT2}>時間帯別の受注ボーダー</div>
          {slotDecisionStats.map((s, i) => (
            <div key={s.key} style={{ padding: "9px 0", borderTop: i > 0 ? `1px solid ${T.border}` : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 4 }}>
                <div style={{ fontSize: sz(13), fontWeight: 700, color: T.text }}>{s.label}</div>
                <div style={{ fontSize: sz(11), color: T.textDim }}>{s.count}件</div>
              </div>
              {s.count > 0 ? (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 6 }}>
                    <div style={{ background: T.barBg, borderRadius: 7, padding: "7px 6px", textAlign: "center" }}>
                      <div style={{ fontSize: sz(9), color: T.textDim }}>中央値</div>
                      <div style={{ fontSize: sz(13), fontWeight: 800, color: T.text }}>¥{Math.round(s.med)}</div>
                    </div>
                    <div style={{ background: "#22C55E18", borderRadius: 7, padding: "7px 6px", textAlign: "center" }}>
                      <div style={{ fontSize: sz(9), color: "#22C55E" }}>基本</div>
                      <div style={{ fontSize: sz(13), fontWeight: 800, color: "#22C55E" }}>¥{s.target}/分</div>
                    </div>
                    <div style={{ background: "#F59E0B18", borderRadius: 7, padding: "7px 6px", textAlign: "center" }}>
                      <div style={{ fontSize: sz(9), color: "#F59E0B" }}>ロング</div>
                      <div style={{ fontSize: sz(13), fontWeight: 800, color: "#F59E0B" }}>¥{s.longTarget}/分</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                    <div style={{ fontSize: sz(11), color: T.textSub, lineHeight: 1.5 }}>{slotComment(s)}</div>
                    <div style={{ fontSize: sz(10), color: T.textDim, whiteSpace: "nowrap" }}>45分+ {s.longCount}件 / 60分+ {s.remoteCount}件</div>
                  </div>
                </>
              ) : (
                <div style={{ fontSize: sz(11), color: T.textDim }}>この時間帯の履歴がまだありません</div>
              )}
            </div>
          ))}
        </div>

        <div style={aC}>
          <div style={aT2}>店舗待機リスク</div>
          {waitTotal2 === 0 ? (
            <div style={{ fontSize: sz(12), color: T.textDim, lineHeight: 1.6 }}>店舗到着・出発の記録が増えると、待ちやすい案件を避ける判断に使えます。</div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                <div style={{ background: T.barBg, borderRadius: 8, padding: "9px 6px", textAlign: "center" }}>
                  <div style={{ fontSize: sz(9), color: T.textDim }}>リスク</div>
                  <div style={{ fontSize: sz(15), fontWeight: 800, color: waitRiskLabel === "強め" ? "#EF4444" : waitRiskLabel === "注意" ? "#F59E0B" : "#22C55E" }}>{waitRiskLabel}</div>
                </div>
                <div style={{ background: T.barBg, borderRadius: 8, padding: "9px 6px", textAlign: "center" }}>
                  <div style={{ fontSize: sz(9), color: T.textDim }}>5分以上</div>
                  <div style={{ fontSize: sz(15), fontWeight: 800, color: T.text }}>{Math.round(wait5Count / waitTotal2 * 100)}%</div>
                </div>
                <div style={{ background: T.barBg, borderRadius: 8, padding: "9px 6px", textAlign: "center" }}>
                  <div style={{ fontSize: sz(9), color: T.textDim }}>10分以上</div>
                  <div style={{ fontSize: sz(15), fontWeight: 800, color: T.text }}>{Math.round(wait10Count / waitTotal2 * 100)}%</div>
                </div>
              </div>
              <div style={{ fontSize: sz(11), color: T.textSub, lineHeight: 1.55 }}>
                待機中央値は{Math.round(waitMedian2 * 10) / 10}分。ピーク中は5分待ちでも回転率を削るので、店舗待機マップとセットで見てください。
              </div>
            </>
          )}
        </div>

        <div style={aC}>
          <div style={aT2}>会社の使い分け</div>
          {companyBiasTargets.length === 0 ? (
            <div style={{ fontSize: sz(12), color: T.textDim, lineHeight: 1.6 }}>時間帯ごとの会社比較は、各ピークで8件以上の履歴があると見え始めます。</div>
          ) : (
            <>
              {companyBiasTargets.map((s, i) => (
                <div key={s.key} style={{ padding: "8px 0", borderTop: i > 0 ? `1px solid ${T.border}` : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                    <div style={{ fontSize: sz(12), color: T.text, fontWeight: 700 }}>{s.label}</div>
                    <div style={{ fontSize: sz(10), color: T.textDim }}>{s.total}件</div>
                  </div>
                  {s.rows.slice(0, 3).map(r => (
                    <div key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: sz(11), color: T.textSub, padding: "2px 0" }}>
                      <span>{r.name} {Math.round(r.share * 100)}%</span>
                      <span style={{ color: T.text }}>¥{Math.round(r.med)}/分</span>
                    </div>
                  ))}
                </div>
              ))}
              <div style={{ fontSize: sz(10), color: T.textFaint, lineHeight: 1.5, marginTop: 4 }}>
                受注済みデータなので、未受注の機会損失は断定しません。偏りを見つけるための入口です。
              </div>
            </>
          )}
        </div>

        {/* Data collection progress */}
        {anaLevel < 3 && (
          <div style={aC}>
            <div style={{ fontSize: sz(13), fontWeight: 700, color: T.text, marginBottom: 8 }}>📊 分析データの蓄積状況</div>
            {[
              { level: 1, label: "基本分析", need: "30件 & 7日稼働", delTarget: 30, dayTarget: 7 },
              { level: 2, label: "標準分析", need: "100件 & 14日稼働", delTarget: 100, dayTarget: 14 },
              { level: 3, label: "詳細分析", need: "200件 & 21日稼働", delTarget: 200, dayTarget: 21 },
            ].map(tier => {
              const delPct = Math.min(100, Math.round(totalCount / tier.delTarget * 100));
              const dayPct = Math.min(100, Math.round(workDaysCount / tier.dayTarget * 100));
              const pct = Math.min(delPct, dayPct);
              const unlocked = anaLevel >= tier.level;
              return (
                <div key={tier.level} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                    <span style={{ fontSize: sz(11), fontWeight: 600, color: unlocked ? "#22C55E" : T.textSub }}>{unlocked ? "✓ " : ""}{tier.label}</span>
                    <span style={{ fontSize: sz(10), color: T.textDim }}>{totalCount}件 / {workDaysCount}日</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: T.barBg, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 3, background: unlocked ? "#22C55E" : T.accent, width: `${pct}%`, transition: "width 0.3s" }} />
                  </div>
                  {!unlocked && <div style={{ fontSize: sz(9), color: T.textDim, marginTop: 2 }}>必要: {tier.need}</div>}
                </div>
              );
            })}
          </div>
        )}
        {/* Free: Recent 3 days summary */}
        <div style={aC}>
          <div style={aT2}>直近3日の判断メモ</div>
          {recentDels.length === 0 ? (
            <div style={{ fontSize: sz(12), color: T.textDim, textAlign: "center", padding: "12px 0" }}>配達データがありません</div>
          ) : recentDels.length < 15 ? (
            <div style={{ fontSize: sz(12), color: T.textDim, textAlign: "center", padding: "12px 0" }}>あと{15 - recentDels.length}件で分析を開始します</div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-around", marginBottom: 8 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: sz(10), color: T.textDim }}>中央分給</div>
                  <div style={{ fontSize: sz(20), fontWeight: 800, color: T.accent }}>¥{Math.round(median(recentDels.map(d => d.perMin)))}<span style={{ fontSize: sz(10) }}>/分</span></div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: sz(10), color: T.textDim }}>配達件数</div>
                  <div style={{ fontSize: sz(20), fontWeight: 800, color: T.text }}>{recentDels.length}件</div>
                </div>
              </div>
              {recentRules.length > 0 ? (
                <>
                  <div style={{ fontSize: sz(11), color: "#F59E0B", fontWeight: 600, marginBottom: 6 }}>⚠ 受注で注意する条件</div>
                  {recentRules.slice(0, 3).map((r, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 0", borderTop: i > 0 ? `1px solid ${T.border}` : "none" }}>
                      <span style={{ fontSize: sz(12), color: T.text }}>{r.icon} {ruleAction(r)}</span>
                      <span style={{ fontSize: sz(12), color: "#EF4444", fontWeight: 600 }}>{r.diff}%</span>
                    </div>
                  ))}
                </>
              ) : (
                <div style={{ fontSize: sz(12), color: "#22C55E", textAlign: "center", fontWeight: 600 }}>効率的に配達できています</div>
              )}
              <div style={{ fontSize: sz(9), color: T.textFaint, textAlign: "center", marginTop: 8, lineHeight: 1.5 }}>📊 直近3日のデータに基づく判断メモです（平日/土日祝の区別なし）</div>
            </>
          )}
        </div>

        {/* Premium: All-time rules with weekday/holiday separation */}
        {hasEnoughData ? (
          isPremium ? (<>
            {/* My Rules */}
            {allRules.length > 0 && (
              <div style={{ ...aC, background: T === LIGHT ? "#FFFBEB" : "#1A1810", border: `1px solid ${T === LIGHT ? "#FDE68A" : "#42381A"}` }}>
                <div style={{ fontSize: sz(14), fontWeight: 700, color: "#F59E0B", marginBottom: 8 }}>📋 あなたの案件判断ルール</div>
                {allRules.slice(0, 5).map((r, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: i > 0 ? `1px solid ${T === LIGHT ? "#FDE68A44" : "#42381A"}` : "none" }}>
                    <div>
                      <span style={{ fontSize: sz(12), color: T.text, fontWeight: 600 }}>{i + 1}. {r.icon} {ruleAction(r)}</span>
                    </div>
                    <span style={{ fontSize: sz(12), fontWeight: 700, color: "#22C55E" }}>+¥{r.monthImpact.toLocaleString()}/月</span>
                  </div>
                ))}
                <div style={{ borderTop: `1px solid ${T === LIGHT ? "#FDE68A" : "#42381A"}`, paddingTop: 10, marginTop: 4, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: sz(13), fontWeight: 700, color: T.text }}>全ルール適用で</span>
                  <span style={{ fontSize: sz(15), fontWeight: 800, color: "#22C55E" }}>+¥{totalMonthImpact.toLocaleString()}/月</span>
                </div>
              </div>
            )}

            {/* Detailed cards */}
            <div style={{ fontSize: sz(12), color: T.textDim, fontWeight: 600, marginBottom: 6, marginTop: 4 }}>詳細ルール</div>
            {allRules.length > 0 ? allRules.map((r, i) => <RuleCard key={i} rule={r} />) : (
              <div style={{ ...aC, textAlign: "center" }}>
                <div style={{ fontSize: sz(13), color: "#22C55E", fontWeight: 700 }}>大きな非効率パターンは検出されませんでした</div>
                <div style={{ fontSize: sz(11), color: T.textDim, marginTop: 4 }}>効率的に配達できています</div>
              </div>
            )}
            <div style={{ fontSize: sz(10), color: T.textFaint, textAlign: "center", marginTop: 8 }}>平日/土日祝 × 時間帯で補正して比較（{totalCount}件）</div>
          </>) : (<>
            {/* Free: Concrete advice from detected rules */}
            {allRules.length > 0 && (
              <div style={aC}>
                <div style={{ fontSize: sz(13), fontWeight: 700, color: T.text, marginBottom: 8 }}>💡 受注アドバイス</div>
                {allRules.slice(0, 2).map((r, i) => {
                  return (
                    <div key={i} style={{ padding: "8px 0", borderTop: i > 0 ? `1px solid ${T.border}` : "none" }}>
                      <div style={{ fontSize: sz(12), color: T.text, lineHeight: 1.6 }}>{r.icon} {ruleAction(r)}</div>
                    </div>
                  );
                })}
              </div>
            )}
            {/* Hook: Show rule count + total impact, blur the details */}
            {allRules.length > 0 && (
              <div style={{ position: "relative", marginBottom: 8 }}>
                <PremiumBlur>
                  <div style={{ ...aC, background: T === LIGHT ? "#FFFBEB" : "#1A1810" }}>
                    <div style={{ fontSize: sz(14), fontWeight: 700, color: "#F59E0B", marginBottom: 8 }}>📋 あなたの案件判断ルール</div>
                    {allRules.slice(0, 3).map((_, i) => (
                      <div key={i} style={{ padding: "10px 0", borderTop: i > 0 ? `1px solid ${T === LIGHT ? "#FDE68A44" : "#42381A"}` : "none" }}>
                        <div style={{ height: 14, background: T.barBg, borderRadius: 4, width: "70%" }} />
                      </div>
                    ))}
                  </div>
                </PremiumBlur>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
                  <div style={{ background: T.card, borderRadius: 12, padding: "12px 20px", border: `1px solid ${T.purple}44`, textAlign: "center", boxShadow: "0 4px 16px #0004" }}>
                    <div style={{ fontSize: sz(13), fontWeight: 700, color: T.text, marginBottom: 4 }}>{allRules.length}つの改善ポイントを検出</div>
                    <div style={{ fontSize: sz(16), fontWeight: 800, color: "#22C55E", marginBottom: 6 }}>全適用で月+¥{totalMonthImpact.toLocaleString()}</div>
                    <div style={{ fontSize: sz(11), color: T.purple, fontWeight: 600 }}>PROで詳細を確認 →</div>
                  </div>
                </div>
              </div>
            )}
            {allRules.length === 0 && (
              <PremiumBlur>
                <div style={{ ...aC, background: T === LIGHT ? "#FFFBEB" : "#1A1810" }}>
                  <div style={{ fontSize: sz(14), fontWeight: 700, color: "#F59E0B", marginBottom: 8 }}>📋 あなたの案件判断ルール</div>
                  <div style={{ padding: "20px 0" }} />
                </div>
              </PremiumBlur>
            )}
            <div style={{ textAlign: "center", marginTop: 4 }}>
              <div style={{ fontSize: sz(11), color: T.purple, fontWeight: 600 }}>平日/土日祝を分けた高精度分析 → PRO</div>
            </div>
          </>)
        ) : (
          <div style={{ ...aC, textAlign: "center" }}>
            <div style={{ fontSize: sz(13), color: T.textDim, marginBottom: 4 }}>📊 分析データを収集中...</div>
            <div style={{ fontSize: sz(12), color: T.textMuted, lineHeight: 1.6 }}>
              基本分析の開始まで: <span style={{ fontWeight: 700, color: T.accent }}>{Math.max(0, 30 - totalCount)}件</span> & <span style={{ fontWeight: 700, color: T.accent }}>{Math.max(0, 7 - workDaysCount)}日</span>
            </div>
          </div>
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
      if (h >= 2000) return "#EF4444";
      if (h >= 1500) return "#F59E0B";
      if (h >= 1200) return "#EAB308";
      if (h >= 900)  return "#60A5FA";
      return "#3B82F6";
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
      <div style={{ background: T.bg, height: "100dvh", maxWidth: 430, margin: "0 auto", fontFamily: FN, color: T.text, display: "flex", flexDirection: "column" }}
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
              {["#3B82F6","#60A5FA","#EAB308","#F59E0B","#EF4444"].map((c,i) => <div key={i} style={{ flex: 1, background: c }} />)}
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

  if (anaScreen === "highvalue") {
    return (
      <div style={{ background: T.bg, height: "100dvh", maxWidth: 430, margin: "0 auto", fontFamily: FN, color: T.text }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px 8px", height: 48 }}>
          <div style={{ fontSize: sz(17), fontWeight: 700 }}>💎 高単価マップ</div>
          <button style={{ background: "none", border: `1px solid ${T.borderLight}`, borderRadius: 7, color: T.textSub, padding: "4px 10px", fontSize: sz(12), cursor: "pointer", fontFamily: FN }} onClick={() => setScreen("main")}>戻る</button>
        </div>
        <div style={{ height: "calc(100dvh - 48px)", position: "relative", borderTop: `1px solid ${T.border}` }}>
          <div ref={hvElRef} style={{ height: "100%", width: "100%" }} />
          {/* Legend (top) */}
          <div style={{ position: "absolute", top: 10, left: 10, right: 10, zIndex: 1000 }}>
            <div style={{ display: "flex", gap: 4 }}>
              {[
                { label: "¥100〜199/分", color: "#3B82F6" },
                { label: "¥200〜299/分", color: "#F59E0B" },
                { label: "¥300+/分", color: "#EF4444" },
              ].map(opt => (
                <div key={opt.label} style={{
                  flex: 1, padding: "7px 0", borderRadius: 8,
                  background: `${opt.color}44`, border: `2px solid ${opt.color}`,
                  fontFamily: FN, fontSize: sz(11), fontWeight: 700,
                  color: opt.color, textAlign: "center",
                  boxShadow: "0 2px 6px #0003",
                }}>
                  {opt.label}
                </div>
              ))}
            </div>
          </div>
          {/* Pin count (bottom) */}
          <div style={{ position: "absolute", bottom: 10, left: 10, right: 10, zIndex: 1000, display: "flex", justifyContent: "space-between", alignItems: "center", background: `${T.card}DD`, borderRadius: 10, padding: "8px 12px", boxShadow: "0 2px 8px #0003" }}>
            <div style={{ fontSize: sz(11), color: T.textMuted }}>全期間の高単価配達</div>
            <div style={{ fontSize: sz(13), fontWeight: 700, color: T.accent }}>{hvPinCount}<span style={{ fontSize: sz(10), color: T.textMuted, fontWeight: 500 }}> 件</span></div>
          </div>
        </div>
      </div>
    );
  }

  if (anaScreen === "storewait") {
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
    const SW_WX_OPTS = [{ key: "all", label: "全天候" }, ...WEATHER.map(w => ({ key: w.id, label: `${w.icon} ${w.label}` }))];
    const SW_WX_LABELS = { all: "天候", ...Object.fromEntries(WEATHER.map(w => [w.id, w.icon])) };
    const periodItem = PERIODS.find(p => p.key === (swPeriod || "today")) || PERIODS[0];
    const canView = periodItem.free || isPremium;
    const hasFilter = swTimeSlot !== "all" || swDow !== "all" || swCompany !== "all" || swWeather !== "all";

    const filterBtn = (label, ddKey, isActive) => (
      <button onClick={(e) => { e.stopPropagation(); setSwDropdown(swDropdown === ddKey ? null : ddKey); }}
        style={{
          padding: "5px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: FN,
          fontSize: sz(11), fontWeight: isActive ? 700 : 500,
          background: isActive ? T.accent : `${T.card}EE`,
          color: isActive ? "#000" : T.text,
          boxShadow: "0 2px 6px #0003", display: "flex", alignItems: "center", gap: 4,
        }}>
        {label}<span style={{ fontSize: sz(8), opacity: 0.6 }}>{swDropdown === ddKey ? "▲" : "▼"}</span>
      </button>
    );
    const ddPanel = (items, current, setter) => (
      <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, boxShadow: "0 8px 24px #0006", padding: 4, minWidth: 130, zIndex: 1002 }}>
        {items.map(item => (
          <button key={item.key} onClick={(e) => { e.stopPropagation(); setter(item.key); setSwDropdown(null); }}
            style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", border: "none", borderRadius: 7, cursor: "pointer", fontFamily: FN, fontSize: sz(12), fontWeight: current === item.key ? 700 : 400, background: current === item.key ? `${T.accent}22` : "transparent", color: current === item.key ? T.accent : T.text }}>
            {current === item.key ? "✓ " : "   "}{item.label}
          </button>
        ))}
      </div>
    );

    return (
      <div style={{ background: T.bg, height: "100dvh", maxWidth: 430, margin: "0 auto", fontFamily: FN, color: T.text }}
        onClick={() => setSwDropdown(null)}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px 8px", height: 48 }}>
          <div style={{ fontSize: sz(17), fontWeight: 700 }}>🏪 店舗待機リスク</div>
          <button style={{ background: "none", border: `1px solid ${T.borderLight}`, borderRadius: 7, color: T.textSub, padding: "4px 10px", fontSize: sz(12), cursor: "pointer", fontFamily: FN }} onClick={() => setScreen("main")}>戻る</button>
        </div>
        <div style={{ height: "calc(100dvh - 48px)", position: "relative", borderTop: `1px solid ${T.border}` }}>
          <div ref={swElRef} style={{ height: "100%", width: "100%" }} />

          <div style={{ position: "absolute", top: 10, left: 10, right: 10, zIndex: 1000 }}>
            <div style={{ display: "flex", gap: 3, marginBottom: 6 }}>
              {PERIODS.map(p => {
                const active = (swPeriod || "today") === p.key;
                const locked = !p.free && !isPremium;
                return (
                  <button key={p.key} onClick={(e) => { e.stopPropagation(); setSwPeriod(p.key); setSwDropdown(null); }}
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
            <div style={{ display: "flex", gap: 6 }}>
              <div style={{ position: "relative" }}>
                {filterBtn(TIME_LABELS[swTimeSlot], "time", swTimeSlot !== "all")}
                {swDropdown === "time" && ddPanel(TIME_SLOTS, swTimeSlot, setSwTimeSlot)}
              </div>
              <div style={{ position: "relative" }}>
                {filterBtn(DOW_LABELS[swDow], "dow", swDow !== "all")}
                {swDropdown === "dow" && ddPanel(DOW_OPTS, swDow, setSwDow)}
              </div>
              <div style={{ position: "relative" }}>
                {filterBtn(CO_LABELS[swCompany], "company", swCompany !== "all")}
                {swDropdown === "company" && ddPanel(COMPANY_OPTS, swCompany, setSwCompany)}
              </div>
              <div style={{ position: "relative" }}>
                {filterBtn(SW_WX_LABELS[swWeather], "weather", swWeather !== "all")}
                {swDropdown === "weather" && ddPanel(SW_WX_OPTS, swWeather, setSwWeather)}
              </div>
              {hasFilter && (
                <button onClick={(e) => { e.stopPropagation(); setSwTimeSlot("all"); setSwDow("all"); setSwCompany("all"); setSwWeather("all"); setSwDropdown(null); }}
                  style={{ padding: "5px 8px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: FN, fontSize: sz(10), background: `${T.card}EE`, color: T.textDim, boxShadow: "0 2px 6px #0003" }}>
                  ✕
                </button>
              )}
            </div>
          </div>

          {!canView && (
            <div style={{ position: "absolute", inset: 0, zIndex: 999, background: `${T.bg}88`, backdropFilter: "blur(3px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontSize: sz(14), fontWeight: 700, color: T.purple, marginBottom: 4 }}>プレミアムで解放</div>
              <div style={{ fontSize: sz(11), color: T.textDim }}>過去データの店舗待機マップが利用できます</div>
            </div>
          )}

          <div style={{ position: "absolute", bottom: 10, left: 10, right: 10, zIndex: 1000, background: `${T.card}DD`, borderRadius: 10, padding: "8px 12px", boxShadow: "0 2px 8px #0003" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontSize: sz(11), color: T.textMuted }}>待機5分以上 / 調理待ちキャンセル</div>
              <div style={{ fontSize: sz(13), fontWeight: 700, color: T.accent }}>{swPinCount}<span style={{ fontSize: sz(10), color: T.textMuted, fontWeight: 500 }}> 件</span></div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { label: "5分+", color: "#A855F7" },
                { label: "10分+", color: "#F59E0B" },
                { label: "15分+ / ｷｬﾝｾﾙ", color: "#EF4444" },
              ].map(item => (
                <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.color }} />
                  <span style={{ fontSize: sz(9), color: T.textMuted }}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ position: "absolute", bottom: 72, right: 10, zIndex: 1000, fontSize: 9, color: T.textDim, opacity: 0.7 }}>© OpenStreetMap</div>
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
      <div style={{ background: T.bg, height: "100dvh", maxWidth: 430, margin: "0 auto", fontFamily: FN, color: T.text }}
        onClick={() => setHmDropdown(null)}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px 8px", height: 48 }}>
          <div style={{ fontSize: sz(17), fontWeight: 700 }}>📍 受注エリア</div>
          <button style={{ background: "none", border: `1px solid ${T.borderLight}`, borderRadius: 7, color: T.textSub, padding: "4px 10px", fontSize: sz(12), cursor: "pointer", fontFamily: FN }} onClick={() => setScreen("main")}>戻る</button>
        </div>
        <div style={{ height: "calc(100dvh - 48px)", position: "relative", borderTop: `1px solid ${T.border}` }}>
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

  // ═══ HISTORY ═══
  if (screen === "history") {
    // Build sorted logs (including today)
    const today = tds();
    const todayLog = { ...data, date: today };
    const todayHasActivity = todayLog.deliveries.length > 0 || todayLog.sessions.length > 0 || !!todayLog.currentSessionStart || todayLog.breaks.length > 0 || todayLog.dailyIncentives.length > 0;
    const allWithToday = todayHasActivity ? [todayLog, ...allLogs.filter(l => l.date && l.date !== today)] : allLogs.filter(l => l.date && l.date !== today);
    const pastLogs = allWithToday.sort((a, b) => b.date.localeCompare(a.date));
    // Group by month
    const months = {};
    pastLogs.forEach(log => {
      const m = log.date.slice(0, 7);
      if (!months[m]) months[m] = [];
      months[m].push(log);
    });
    const monthKeys = Object.keys(months).sort((a, b) => b.localeCompare(a));
    if (histDetail) {
      const d = histDetail.delivery;
      const c = COS.find(cc => cc.id === d.company);
      const ot = OT.find(o => o.id === d.orderType);
      const dur = d.completeTime && d.orderTime ? d.completeTime - d.orderTime : 0;
      const storeWait = d.storeArrivalTime ? (d.storeDepartTime || d.completeTime || Date.now()) - d.storeArrivalTime : 0;
      const durMin = dur > 0 ? dur / 60000 : 0;
      const perMin = durMin > 0 ? Math.round((d.reward || 0) / durMin) : 0;
      const histDetailEditable = canEditWorkTimes(histDetail.date);
      return (
        <div style={{ fontFamily: FN, background: T.bg, minHeight: "100dvh", height: "100dvh", maxWidth: 430, margin: "0 auto", color: T.text, padding: "14px 16px", overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: sz(16), fontWeight: 700 }}>配達詳細</div>
            <button onClick={() => setHistDetail(null)} style={{ background: "none", border: `1px solid ${T.borderLight}`, borderRadius: 7, color: T.textSub, padding: "4px 12px", fontSize: sz(12), cursor: "pointer", fontFamily: FN }}>戻る</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ width: "100%", maxWidth: 340 }}>
            <div style={{ background: T.card, borderRadius: 14, padding: "14px 16px", border: `1px solid ${T.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: c?.bg || "#333", color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: sz(19), fontWeight: 800 }}>{c?.letter || "?"}</div>
                <div>
                  <div style={{ fontSize: sz(15), fontWeight: 700, color: T.text }}>{c?.name || "不明"}</div>
                  <div style={{ fontSize: sz(12), color: T.textMuted }}>{ot?.label || "シングル"}{d.cancelled && <span style={{ color: "#EF4444" }}> {d.cancelType === "before_store" ? "未到着キャンセル" : "調理待ちキャンセル"}</span>}</div>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ fontSize: sz(12), color: T.textMuted }}>日付</span><span style={{ fontSize: sz(14), fontWeight: 600, color: T.text }}>{histDetail.date}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ fontSize: sz(12), color: T.textMuted }}>時間</span><span style={{ fontSize: sz(14), fontWeight: 600, color: T.text }}>{ft(d.orderTime)}〜{ft(d.completeTime)}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ fontSize: sz(12), color: T.textMuted }}>所要時間</span><span style={{ fontSize: sz(14), fontWeight: 600, color: T.text }}>{fm(dur)}</span></div>
              {storeWait > 0 && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ fontSize: sz(12), color: T.textMuted }}>店舗待機</span><span style={{ fontSize: sz(14), fontWeight: 600, color: storeWait >= 300000 || d.cancelType === "store_wait" ? "#EF4444" : T.text }}>{fm(storeWait)}</span></div>}
              {perMin > 0 && !d.cancelled && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ fontSize: sz(12), color: T.textMuted }}>分給</span><span style={{ fontSize: sz(15), fontWeight: 700, color: "#0EA5E9" }}>¥{perMin.toLocaleString()}/分</span></div>}
              {Array.isArray(d.stops) && d.stops.length > 0 && (
                <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 8, marginTop: 8, marginBottom: 4 }}>
                  <div style={{ fontSize: sz(12), color: T.textMuted, marginBottom: 6 }}>詳細ステップ</div>
                  <div style={{ fontSize: sz(10), color: T.textDim, lineHeight: 1.5, marginBottom: 6 }}>受取番号とお届け番号は対応ではなく、順番の記録です。</div>
                  <div style={{ display: "grid", gap: 5 }}>
                    {d.stops.map((s, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: T.barBg, borderRadius: 7, padding: "6px 8px" }}>
                        <span style={{ fontSize: sz(11), color: T.textSub, fontWeight: 700 }}>{s.label || (s.kind === "pickup" ? "店舗" : "配達")}</span>
                        <span style={{ fontSize: sz(11), color: T.textMuted }}>{s.kind === "pickup" ? `${ft(s.arrivalTime)}〜${ft(s.departTime)}` : ft(s.completeTime)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderTop: `1px solid ${T.border}` }}><span style={{ fontSize: sz(13), color: T.textMuted }}>配達報酬</span><span style={{ fontSize: sz(17), fontWeight: 700, color: T.accent }}>¥{(d.reward || 0).toLocaleString()}</span></div>
              {d.rawReward && d.company === "pickgo" && <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0 7px" }}><span style={{ fontSize: sz(11), color: T.textDim }}>PickGo 入力金額</span><span style={{ fontSize: sz(13), color: T.textMuted }}>¥{d.rawReward.toLocaleString()}（手数料{Math.round((1 - d.reward / d.rawReward) * 100)}%引き）</span></div>}
              {d.rawReward && d.company === "rocket" && d.rocketBonusRate > 0 && <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0 7px" }}><span style={{ fontSize: sz(11), color: T.textDim }}>Rocket Now 基本金額</span><span style={{ fontSize: sz(13), color: T.textMuted }}>¥{d.rawReward.toLocaleString()}（+{d.rocketBonusRate}%反映）</span></div>}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "7px 0", borderTop: `1px solid ${T.border}` }}>
                <span style={{ fontSize: sz(13), color: T.textMuted }}>インセンティブ</span>
                {histDetailEditable ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: sz(13), color: T.purple, fontWeight: 700 }}>¥</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={d.incentive || 0}
                      onChange={(e) => setHistDetail(prev => ({ ...prev, delivery: { ...prev.delivery, incentive: parseInt(e.target.value, 10) || 0 } }))}
                      style={{ width: 86, background: T.inputBg, border: `1px solid ${T.borderLight}`, borderRadius: 7, color: T.text, fontSize: sz(14), fontWeight: 700, padding: "5px 7px", fontFamily: FN, textAlign: "right" }}
                    />
                    <button onClick={saveHistDeliveryDetail} style={{ background: T.purple, border: "none", borderRadius: 7, color: "#FFF", padding: "5px 9px", fontSize: sz(11), fontWeight: 700, cursor: "pointer", fontFamily: FN }}>保存</button>
                  </div>
                ) : (
                  <span style={{ fontSize: sz(17), fontWeight: 700, color: T.purple }}>¥{(d.incentive || 0).toLocaleString()}</span>
                )}
              </div>
              {d.rating && !d.cancelled && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderTop: `1px solid ${T.border}` }}>
                  <span style={{ fontSize: sz(13), color: T.textMuted }}>評価</span>
                  <span style={{ fontSize: sz(14), fontWeight: 600, color: d.rating === "good" ? "#EAB308" : d.rating === "bad" ? "#3B82F6" : T.textMuted }}>{d.rating === "good" ? "🟡 良い" : d.rating === "bad" ? "🔵 悪い" : "⚪ 普通"}</span>
                </div>
              )}
              {d.areaName && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderTop: `1px solid ${T.border}` }}>
                  <span style={{ fontSize: sz(13), color: T.textMuted }}>エリア</span>
                  <span style={{ fontSize: sz(14), fontWeight: 600, color: T.text }}>{d.areaName}</span>
                </div>
              )}
              {d.apiWeather && (
                <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 8, marginTop: 4 }}>
                  <div style={{ fontSize: sz(12), color: T.textMuted, marginBottom: 5 }}>天候データ</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 5 }}>
                    <div style={{ background: T.barBg, borderRadius: 7, padding: "6px 4px", textAlign: "center" }}>
                      <div style={{ fontSize: sz(9), color: T.textDim }}>天候</div>
                      <div style={{ fontSize: sz(15), fontWeight: 700, color: T.text }}>{WEATHER.find(w => w.id === d.apiWeather.weatherId)?.icon || "?"}</div>
                    </div>
                    <div style={{ background: T.barBg, borderRadius: 7, padding: "6px 4px", textAlign: "center" }}>
                      <div style={{ fontSize: sz(9), color: T.textDim }}>気温</div>
                      <div style={{ fontSize: sz(13), fontWeight: 700, color: T.text }}>{d.apiWeather.temperature}℃</div>
                    </div>
                    <div style={{ background: T.barBg, borderRadius: 7, padding: "6px 4px", textAlign: "center" }}>
                      <div style={{ fontSize: sz(9), color: T.textDim }}>風速</div>
                      <div style={{ fontSize: sz(13), fontWeight: 700, color: T.text }}>{d.apiWeather.windspeed}<span style={{ fontSize: sz(8) }}>km/h</span></div>
                    </div>
                    <div style={{ background: T.barBg, borderRadius: 7, padding: "6px 4px", textAlign: "center" }}>
                      <div style={{ fontSize: sz(9), color: T.textDim }}>雨量</div>
                      <div style={{ fontSize: sz(13), fontWeight: 700, color: T.text }}>{d.apiWeather.precipitation != null ? d.apiWeather.precipitation : "-"}<span style={{ fontSize: sz(8) }}>mm</span></div>
                    </div>
                  </div>
                </div>
              )}
              {/* Memo - editable for past deliveries */}
              <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 8, marginTop: 4 }}>
                <div style={{ fontSize: sz(12), color: T.textMuted, marginBottom: 5 }}>📝 メモ</div>
                <textarea
                  value={d.memo || ""}
                  onChange={(e) => {
                    const newMemo = e.target.value;
                    setHistDetail(prev => ({ ...prev, delivery: { ...prev.delivery, memo: newMemo } }));
                  }}
                  placeholder="配達に関するメモを入力..."
                  style={{
                    width: "100%", minHeight: 60, maxHeight: 120, borderRadius: 8,
                    border: `1px solid ${T.borderLight}`, background: T.inputBg,
                    color: T.text, fontSize: sz(13), padding: "8px 10px",
                    fontFamily: FN, resize: "vertical", lineHeight: 1.5,
                    boxSizing: "border-box",
                  }}
                />
                <button onClick={saveHistDeliveryDetail} style={{ width: "100%", height: 40, borderRadius: 10, border: "none", background: T.accent, color: "#000", fontSize: sz(14), fontWeight: 700, cursor: "pointer", fontFamily: FN, marginTop: 6, letterSpacing: 1 }}>
                  {histDetail.saved ? "✓ 保存しました" : "メモを保存"}
                </button>
              </div>
            </div>
          </div>
          </div>
        </div>
      );
    }

    // Day label helper
    const dayLabel = (dateStr) => {
      const d = new Date(dateStr + "T00:00:00");
      const dow = ["日","月","火","水","木","金","土"][d.getDay()];
      return `${parseInt(dateStr.slice(8))}日（${dow}）`;
    };
    const monthLabel = (m) => `${parseInt(m.slice(0, 4))}年${parseInt(m.slice(5))}月`;

    return (
      <div style={{ fontFamily: FN, background: T.bg, minHeight: "100dvh", height: "100dvh", maxWidth: 430, margin: "0 auto", color: T.text, padding: "14px 16px", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: sz(18), fontWeight: 700 }}>📋 配達履歴</div>
          <button onClick={() => setScreen("main")} style={{ background: "none", border: `1px solid ${T.borderLight}`, borderRadius: 7, color: T.textSub, padding: "4px 12px", fontSize: sz(12), cursor: "pointer", fontFamily: FN }}>戻る</button>
        </div>

        {pastLogs.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: T.textDim }}>
            <div style={{ fontSize: sz(40), marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: sz(14) }}>過去の配達記録はありません</div>
          </div>
        ) : (
          monthKeys.map(m => {
            const mLogs = months[m];
            const mDels = mLogs.reduce((s, l) => s + (l.deliveries || []).filter(d => !d.cancelled).reduce((ss, d) => ss + dc(d), 0), 0);
            const mRev = mLogs.reduce((s, l) => s + dayRev(l, true), 0);
            return (
              <div key={m} style={{ marginBottom: 20 }}>
                {/* Month header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, padding: "0 2px" }}>
                  <div style={{ fontSize: sz(15), fontWeight: 700, color: T.text }}>{monthLabel(m)}</div>
                  <div style={{ fontSize: sz(12), color: T.textMuted }}>{mDels}件 / ¥{mRev.toLocaleString()}</div>
                </div>
                {/* Day cards */}
                {mLogs.map(log => {
                  const dels = (log.deliveries || []);
                  const actD = dels.filter(d => !d.cancelled);
                  const dCnt = actD.reduce((s, d) => s + dc(d), 0);
                  const dRev = dayRev(log, true);
                  const expanded = !!histExpanded[log.date];
                  const sesTotal = calcSessionMs(log);
                  const brkTotal = calcBreakMs(log);
                  const workTotal = Math.max(0, sesTotal - brkTotal);
                  const hrRate = workTotal > 0 ? Math.round(dRev / (workTotal / 3600000)) : 0;
                  const workBounds = sessionBounds(log);
                  const workEditable = canEditWorkTimes(log.date);
                  const workEditing = histWorkEdit?.date === log.date;
                  return (
                    <div key={log.date} style={{ background: T.card, borderRadius: 12, border: `1px solid ${T.border}`, marginBottom: 6, overflow: "hidden" }}>
                      {/* Day summary - tap to expand */}
                      <div onClick={() => setHistExpanded(prev => ({ ...prev, [log.date]: !prev[log.date] }))} style={{ display: "flex", alignItems: "center", padding: "10px 14px", cursor: "pointer", gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                            <span style={{ fontSize: sz(14), fontWeight: 700, color: T.text }}>{dayLabel(log.date)}</span>
                            <span style={{ fontSize: sz(11), color: T.textMuted }}>{dCnt}件</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 }}>
                            <span style={{ fontSize: sz(16), fontWeight: 800, color: T.accent }}>¥{dRev.toLocaleString()}</span>
                            {workTotal > 0 && <span style={{ fontSize: sz(11), color: T.textMuted }}>{fd(workTotal)}</span>}
                            {hrRate > 0 && <span style={{ fontSize: sz(11), color: "#0EA5E9" }}>¥{hrRate.toLocaleString()}/h</span>}
                          </div>
                        </div>
                        <div style={{ fontSize: sz(12), color: T.textDim, transition: "transform 0.2s", transform: expanded ? "rotate(180deg)" : "rotate(0)" }}>▼</div>
                      </div>
                      {/* Expanded delivery list */}
                      {expanded && (
                        <div style={{ borderTop: `1px solid ${T.border}`, padding: "4px 12px 8px" }}>
                          <div style={{ background: T.barBg, borderRadius: 10, padding: "9px 10px", margin: "6px 0 8px", border: `1px solid ${T.border}` }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                              <div style={{ fontSize: sz(12), color: T.textSub, fontWeight: 700 }}>オンライン / オフライン</div>
                              {workEditable ? (
                                workEditing ? (
                                  <button onClick={() => setHistWorkEdit(null)} style={{ background: "none", border: `1px solid ${T.borderLight}`, borderRadius: 7, color: T.textMuted, padding: "3px 8px", fontSize: sz(11), cursor: "pointer", fontFamily: FN }}>閉じる</button>
                                ) : (
                                  <button onClick={() => openHistWorkEdit(log)} style={{ background: T.inputBg, border: `1px solid ${T.borderLight}`, borderRadius: 7, color: T.text, padding: "3px 9px", fontSize: sz(11), fontWeight: 700, cursor: "pointer", fontFamily: FN }}>修正</button>
                                )
                              ) : (
                                <span style={{ fontSize: sz(10), color: T.textDim }}>修正期限終了</span>
                              )}
                            </div>
                            {workEditing ? (
                              <>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                                  <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                    <span style={{ fontSize: sz(10), color: T.textDim }}>オンライン</span>
                                    <input type="time" value={histWorkEdit.start} onChange={(e) => setHistWorkEdit(v => ({ ...v, start: e.target.value, error: null }))} style={{ background: T.inputBg, border: `1px solid ${T.accent}`, borderRadius: 7, color: T.text, fontSize: sz(14), padding: "6px 7px", fontFamily: FN }} />
                                  </label>
                                  <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                    <span style={{ fontSize: sz(10), color: T.textDim }}>オフライン</span>
                                    <input type="time" value={histWorkEdit.end} onChange={(e) => setHistWorkEdit(v => ({ ...v, end: e.target.value, error: null }))} placeholder={workBounds.active ? "稼働中" : ""} style={{ background: T.inputBg, border: `1px solid ${T.accent}`, borderRadius: 7, color: T.text, fontSize: sz(14), padding: "6px 7px", fontFamily: FN }} />
                                  </label>
                                </div>
                                {histWorkEdit.error && <div style={{ fontSize: sz(11), color: "#EF4444", marginBottom: 7 }}>{histWorkEdit.error}</div>}
                                <button onClick={saveHistWorkEdit} style={{ width: "100%", height: 36, borderRadius: 9, border: "none", background: T.accent, color: "#000", fontSize: sz(13), fontWeight: 800, cursor: "pointer", fontFamily: FN }}>稼働時間を保存</button>
                                <div style={{ fontSize: sz(10), color: T.textDim, marginTop: 6 }}>修正できるのは翌日23:59までです</div>
                              </>
                            ) : (
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                                <div>
                                  <div style={{ fontSize: sz(10), color: T.textDim }}>オンライン</div>
                                  <div style={{ fontSize: sz(14), fontWeight: 800, color: T.text }}>{ft(workBounds.start)}</div>
                                </div>
                                <div>
                                  <div style={{ fontSize: sz(10), color: T.textDim }}>オフライン</div>
                                  <div style={{ fontSize: sz(14), fontWeight: 800, color: workBounds.active ? "#22C55E" : T.text }}>{workBounds.active ? "稼働中" : ft(workBounds.end)}</div>
                                </div>
                                <div>
                                  <div style={{ fontSize: sz(10), color: T.textDim }}>稼働</div>
                                  <div style={{ fontSize: sz(14), fontWeight: 800, color: T.accent }}>{fd(workTotal)}</div>
                                </div>
                              </div>
                            )}
                          </div>
                          {dels.length === 0 ? (
                            <div style={{ padding: "8px 0", fontSize: sz(12), color: T.textDim, textAlign: "center" }}>配達なし</div>
                          ) : [...dels].reverse().map((d, i) => {
                            const c = COS.find(cc => cc.id === d.company);
                            const ot = OT.find(t => t.id === d.orderType);
                            const dur = d.completeTime && d.orderTime ? d.completeTime - d.orderTime : 0;
                            const durMin = dur > 0 ? dur / 60000 : 0;
                            const perMin = durMin > 0 ? Math.round((d.reward || 0) / durMin) : 0;
                            return (
                              <div key={i} onClick={() => setHistDetail({ delivery: d, date: log.date, delIdx: dels.length - 1 - i })} style={{ display: "flex", alignItems: "center", gap: 0, padding: "7px 0", borderBottom: i < dels.length - 1 ? `1px solid ${T.border}` : "none", cursor: "pointer" }}>
                                <div style={{ width: 28, height: 28, borderRadius: 7, background: d.cancelled ? T.textFaint : (c?.bg || "#333"), color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: sz(14), fontWeight: 700, flexShrink: 0, marginRight: 8 }}>{c?.letter || "?"}</div>
                                <div style={{ flex: 1, minWidth: 0, marginRight: 6 }}>
                                  {d.cancelled ? <div style={{ fontSize: sz(12), color: "#EF4444", fontWeight: 600 }}>キャンセル</div> : (
                                    <>
                                      <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                                        <span style={{ fontSize: sz(14), fontWeight: 700, color: T.text }}>¥{(d.reward || 0).toLocaleString()}</span>
                                        {(d.incentive || 0) > 0 && <span style={{ fontSize: sz(9), color: T.purple }}>+¥{d.incentive.toLocaleString()}</span>}
                                      </div>
                                      {perMin > 0 && <div style={{ fontSize: sz(11), fontWeight: 600, color: "#0EA5E9", marginTop: 1 }}>¥{perMin.toLocaleString()}/分</div>}
                                    </>
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
                          {/* Daily incentives */}
                          {((log.dailyIncentives || []).length > 0 || workEditable) && (
                            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 7, marginTop: 4 }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                                <div style={{ fontSize: sz(10), color: T.textDim }}>日次インセンティブ</div>
                                {workEditable && (
                                  <button onClick={() => setHistIncEdit({ date: log.date, index: null, company: COS[0]?.id || "", amount: "", time: Date.now(), error: null })} style={{ background: T.inputBg, border: `1px solid ${T.borderLight}`, borderRadius: 7, color: T.text, padding: "3px 8px", fontSize: sz(10), fontWeight: 700, cursor: "pointer", fontFamily: FN }}>追加</button>
                                )}
                              </div>
                              {(log.dailyIncentives || []).length === 0 && histIncEdit?.date !== log.date && (
                                <div style={{ fontSize: sz(11), color: T.textDim, padding: "3px 0 5px" }}>未登録</div>
                              )}
                              {log.dailyIncentives.map((di, j) => {
                                const dic = COS.find(cc => cc.id === di.company);
                                return (
                                  <div key={j} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0" }}>
                                    <div style={{ width: 22, height: 22, borderRadius: 5, background: dic?.bg || "#333", color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: sz(10), fontWeight: 700, flexShrink: 0 }}>{dic?.letter || "?"}</div>
                                    <span style={{ fontSize: sz(12), color: T.purple, fontWeight: 700 }}>+¥{(di.amount || 0).toLocaleString()}</span>
                                    {workEditable && (
                                      <button onClick={() => setHistIncEdit({ date: log.date, index: j, company: di.company, amount: String(di.amount || ""), time: di.time || Date.now(), error: null })} style={{ marginLeft: "auto", background: "none", border: `1px solid ${T.borderLight}`, borderRadius: 6, color: T.textMuted, padding: "2px 7px", fontSize: sz(10), cursor: "pointer", fontFamily: FN }}>修正</button>
                                    )}
                                  </div>
                                );
                              })}
                              {histIncEdit?.date === log.date && (
                                <div style={{ background: T.barBg, borderRadius: 9, padding: "8px 9px", marginTop: 6, border: `1px solid ${T.border}` }}>
                                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 7 }}>
                                    {COS.map(cc => (
                                      <button key={cc.id} onClick={() => setHistIncEdit(v => ({ ...v, company: cc.id, error: null }))} style={{ width: 31, height: 31, borderRadius: 8, border: histIncEdit.company === cc.id ? `2px solid ${T.text}` : `1px solid ${T.borderLight}`, background: cc.bg, color: "#FFF", fontSize: sz(12), fontWeight: 800, cursor: "pointer", fontFamily: FN }}>{cc.letter}</button>
                                    ))}
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <span style={{ fontSize: sz(13), color: T.purple, fontWeight: 800 }}>¥</span>
                                    <input type="number" inputMode="numeric" min="0" value={histIncEdit.amount} onChange={(e) => setHistIncEdit(v => ({ ...v, amount: e.target.value, error: null }))} style={{ flex: 1, minWidth: 0, background: T.inputBg, border: `1px solid ${T.borderLight}`, borderRadius: 7, color: T.text, fontSize: sz(14), fontWeight: 700, padding: "6px 8px", fontFamily: FN, textAlign: "right" }} />
                                    <button onClick={saveHistIncEdit} style={{ background: T.purple, border: "none", borderRadius: 7, color: "#FFF", padding: "6px 10px", fontSize: sz(11), fontWeight: 700, cursor: "pointer", fontFamily: FN }}>保存</button>
                                  </div>
                                  {histIncEdit.error && <div style={{ fontSize: sz(10), color: "#EF4444", marginTop: 5 }}>{histIncEdit.error}</div>}
                                  <div style={{ display: "flex", gap: 8, marginTop: 7 }}>
                                    {histIncEdit.index != null && <button onClick={deleteHistIncEdit} style={{ background: "none", border: `1px solid #EF444466`, borderRadius: 7, color: "#EF4444", padding: "4px 9px", fontSize: sz(10), cursor: "pointer", fontFamily: FN }}>削除</button>}
                                    <button onClick={() => setHistIncEdit(null)} style={{ background: "none", border: `1px solid ${T.borderLight}`, borderRadius: 7, color: T.textMuted, padding: "4px 9px", fontSize: sz(10), cursor: "pointer", fontFamily: FN }}>キャンセル</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    );
  }

  // ═══ MAIN ═══
  const orderStatus = hasOrd ? (currentOrderStep ? stepStatusLabel(currentOrderStep, currentOrderType) : (!hasStoreArrived ? "店舗へ移動中" : !hasStoreDeparted ? "店舗待機中" : "配達中")) : null;
  const stTx = isOn ? (isBrk ? "休憩中" : isJz ? "地蔵中" : orderStatus || "待機中") : hasWrk ? "オフライン" : "未開始";
  const stCo = isOn ? (isJz ? "#F59E0B" : "#22C55E") : hasWrk ? "#F59E0B" : T.textDim;

  return (
    <div style={{ fontFamily: FN, background: T.bg, color: T.text, height: "100dvh", maxWidth: 430, margin: "0 auto", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
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

            {otsukareData.efLowCount > 0 && (
              <div style={{ background: "#F59E0B18", borderRadius: 10, padding: "8px 12px", marginBottom: 12, textAlign: "left" }}>
                <div style={{ fontSize: sz(11), color: "#F59E0B", fontWeight: 600 }}>🎯 効率化ポイント</div>
                <div style={{ fontSize: sz(11), color: T.textMuted, marginTop: 2 }}>今日の配達で平均より低効率な配達が<span style={{ fontWeight: 700, color: "#F59E0B" }}>{otsukareData.efLowCount}件</span>ありました</div>
              </div>
            )}
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

      {/* ─── Undo Snackbar ─── */}
      {pendingUndo && (
        <div style={{
          position: "fixed",
          bottom: `calc(${BBH + 48}px + env(safe-area-inset-bottom))`,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 380,
          maxWidth: 398,
          width: "calc(100% - 32px)",
          background: T.card,
          color: T.text,
          border: `1px solid ${T.accent}55`,
          borderRadius: 14,
          padding: "10px 12px",
          boxShadow: "0 8px 28px #0008",
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontFamily: FN,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: sz(11), color: T.textDim, marginBottom: 2 }}>直前操作</div>
            <div style={{ fontSize: sz(13), fontWeight: 800, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pendingUndo.label}</div>
          </div>
          <button onClick={doUndo} style={{ height: 38, minWidth: 74, borderRadius: 10, border: "none", background: T.accent, color: "#000", fontSize: sz(13), fontWeight: 800, cursor: "pointer", fontFamily: FN }}>戻す</button>
        </div>
      )}

      {/* ─── Action Toast (button feedback) ─── */}
      {actionToast && (
        <div style={{
          position: "fixed", bottom: pendingUndo ? `calc(${BBH + 108}px + env(safe-area-inset-bottom))` : `calc(${BBH + 50}px + env(safe-area-inset-bottom))`, left: "50%", transform: "translateX(-50%)",
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
          <div style={{ background: T.card, border: `2px solid ${deliveryFeedback.color}`, borderRadius: 14, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, boxShadow: `0 8px 30px #000A` }}>
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

      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", paddingBottom: BBH + 84 }}>

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
                {/* Today's income */}
                <div style={{ background: T.inputBg, borderRadius: 10, padding: "10px 14px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: sz(11), color: T.textMuted, fontWeight: 600 }}>本日の収入</div>
                  <div style={{ fontSize: sz(20), fontWeight: 800, color: T.accent }}>¥{totAll.toLocaleString()}</div>
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
                  const yr = calMonth.year, mn = calMonth.month;
                  const isCurrentMonth = yr === now2.getFullYear() && mn === now2.getMonth();
                  const firstDay = new Date(yr, mn, 1).getDay();
                  const daysInMonth = new Date(yr, mn + 1, 0).getDate();
                  const todayD = isCurrentMonth ? now2.getDate() : -1;
                  const mPrefix = `${yr}-${String(mn+1).padStart(2,"0")}`;
                  const revMap = {};
                  allLogs.filter(l => l.date?.startsWith(mPrefix)).forEach(l => { revMap[parseInt(l.date.slice(8,10),10)] = dayRev(l, true); });
                  if (isCurrentMonth && data.date?.startsWith(mPrefix)) revMap[todayD] = totAll;
                  const revColor = (r) => {
                    if (!r) return "transparent";
                    if (r >= 8000) return "#EF4444CC";
                    if (r >= 5000) return "#F59E0BBB";
                    if (r >= 3000) return "#60A5FAAA";
                    return "#3B82F677";
                  };
                  const DOW_H = ["日","月","火","水","木","金","土"];
                  const cells = [];
                  for (let i = 0; i < firstDay; i++) cells.push(null);
                  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
                  while (cells.length % 7 !== 0) cells.push(null);
                  const workDays = Object.keys(revMap).length;
                  const prevMonth = () => { const m = mn === 0 ? 11 : mn - 1; const y = mn === 0 ? yr - 1 : yr; setCalMonth({ year: y, month: m }); };
                  const nextMonth = () => { if (isCurrentMonth) return; const m = mn === 11 ? 0 : mn + 1; const y = mn === 11 ? yr + 1 : yr; setCalMonth({ year: y, month: m }); };
                  return (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <button onClick={prevMonth} style={{ background: "none", border: "none", cursor: "pointer", fontSize: sz(16), color: T.textSub, padding: "4px 8px" }}>◀</button>
                        <div style={{ fontSize: sz(13), fontWeight: 700, color: T.text }}>{yr}年{mn + 1}月</div>
                        <button onClick={nextMonth} style={{ background: "none", border: "none", cursor: isCurrentMonth ? "default" : "pointer", fontSize: sz(16), color: isCurrentMonth ? T.textFaint : T.textSub, padding: "4px 8px" }}>▶</button>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
                        {DOW_H.map((dh, i) => (
                          <div key={`h${i}`} style={{ textAlign: "center", fontSize: sz(9), color: i === 0 ? "#EF4444" : i === 6 ? "#3B82F6" : T.textMuted, padding: "2px 0" }}>{dh}</div>
                        ))}
                        {cells.map((d, i) => {
                          if (d === null) return <div key={i} />;
                          const rv = revMap[d];
                          const isToday = d === todayD;
                          const isFuture = isCurrentMonth && d > todayD;
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
                        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                          {[
                            { color: "#3B82F677", label: "~3k" },
                            { color: "#60A5FAAA", label: "~5k" },
                            { color: "#F59E0BBB", label: "~8k" },
                            { color: "#EF4444CC", label: "8k+" },
                          ].map((c, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 1 }}>
                              <div style={{ width: 10, height: 10, borderRadius: 2, background: c.color }} />
                              <span style={{ fontSize: sz(7), color: T.textMuted }}>{c.label}</span>
                            </div>
                          ))}
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
                  <div style={{ fontSize: sz(10), color: T.textDim }}>平均オンライン{fd(pacePredict.avgDuration)}想定、{pacePredict.endLabel}まで</div>
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
              <div style={{ fontSize: sz(11), color: T.textMuted, marginBottom: 2 }}>配達報酬</div>
              <AutoFitText value={`¥${totRew.toLocaleString()}`} maxSize={sz(26)} color={T.accent} />
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
              <span style={{ fontSize: sz(12), color: "#EF4444" }}>待機{fd(wasteMs2)}</span>
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
                  const durMin = dur > 0 ? dur / 60000 : 0;
                  const perMin = durMin > 0 ? Math.round((d.reward || 0) / durMin) : 0;
                  return (
                    <div key={i} onClick={() => { const canEdit = d.completeTime && (Date.now() - d.completeTime) <= 7200000 && new Date(d.completeTime).toDateString() === new Date().toDateString(); if (canEdit) openEdit(ri); }} style={{ display: "flex", alignItems: "center", gap: 0, padding: "7px 0", borderBottom: i < data.deliveries.length - 1 ? `1px solid ${T.border}` : "none", cursor: "pointer", opacity: d.completeTime && ((Date.now() - d.completeTime) > 7200000 || new Date(d.completeTime).toDateString() !== new Date().toDateString()) ? 0.6 : 1 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: d.cancelled ? T.textFaint : (c?.bg || "#333"), color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: sz(15), fontWeight: 700, flexShrink: 0, marginRight: 8 }}>{c?.letter || "?"}</div>
                      <div style={{ flex: 1, minWidth: 0, marginRight: 6 }}>
                        {d.cancelled ? <div style={{ fontSize: sz(12), color: "#EF4444", fontWeight: 600 }}>キャンセル</div> : (
                          <>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                              <span style={{ fontSize: sz(14), fontWeight: 700, color: T.text }}>¥{(d.reward || 0).toLocaleString()}</span>
                              {(d.incentive || 0) > 0 && <span style={{ fontSize: sz(9), color: T.purple }}>+¥{d.incentive.toLocaleString()}</span>}
                            </div>
                            {perMin > 0 && <div style={{ fontSize: sz(12), fontWeight: 600, color: "#0EA5E9", marginTop: 1 }}>¥{perMin.toLocaleString()}/分</div>}
                          </>
                        )}
                      </div>
                      {ot && ot.c > 1 && <div style={{ fontSize: sz(10), fontWeight: 700, color: "#F59E0B", background: "#F59E0B22", padding: "2px 5px", borderRadius: 4, flexShrink: 0, marginRight: 4 }}>{ot.short}</div>}
                      {d.rating && !d.cancelled && <div style={{ width: 8, height: 8, borderRadius: 4, background: d.rating === "good" ? "#EAB308" : d.rating === "bad" ? "#3B82F6" : T.textDim, flexShrink: 0, marginRight: 4 }} />}
                      {d.memo && <span style={{ fontSize: sz(10), flexShrink: 0, marginRight: 4 }}>📝</span>}
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
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, maxWidth: 430, margin: "0 auto", padding: "10px 16px calc(34px + env(safe-area-inset-bottom))", background: `linear-gradient(transparent, ${T.bg} 30%)`, display: "flex", gap: 8, zIndex: 50 }}>
        {!hasOrd ? (
          <button style={flashBtn("#0EA5E9", !isOn || isBrk, BBH, "order")} onClick={doOrd} disabled={!isOn || isBrk}>受注</button>
        ) : currentOrderStep ? (() => {
          const label = stepButtonLabel(currentOrderStep, currentOrderType);
          if (currentOrderStep.action === "pickup_arrive") return (<>
            <button style={flashBtn("#0EA5E9", false, BBH, "storeArrive")} onClick={doStoreArrive}>{label}</button>
            <button style={btn("#EF4444", false, BBH)} onClick={() => openCancel("before_store")}>未到着キャンセル</button>
          </>);
          if (currentOrderStep.action === "pickup_depart") return (<>
            <button style={flashBtn("#F59E0B", false, BBH, "storeDepart")} onClick={doStoreDepart}>{label}</button>
            <button style={btn("#EF4444", false, BBH)} onClick={() => openCancel("store_wait")}>調理待ちキャンセル</button>
          </>);
          if (currentOrderStep.action === "dropoff_complete") {
            const canAddOrder = (data.currentStops || []).filter(s => s.kind === "pickup").length < 3;
            return (<>
              {canAddOrder && <button style={flashBtn("#0EA5E9", false, BBH, "order")} onClick={doAddOrderDuringDelivery}>受注追加</button>}
              <button style={flashBtn("#F59E0B", false, BBH, "complete")} onClick={doDropoffComplete}>{label}</button>
            </>);
          }
          if (currentOrderStep.action === "choose_route") return (<>
            {(data.currentStops || []).filter(s => s.kind === "pickup").length < 3 && (
              <button style={flashBtn("#0EA5E9", false, BBH, "order")} onClick={doNextStore}>次の店舗へ</button>
            )}
            <button style={flashBtn("#F59E0B", false, BBH, "complete")} onClick={doStartDeliveryRoute}>配達へ</button>
          </>);
          return (
            <button style={flashBtn("#F59E0B", false, BBH, "complete")} onClick={openRewardInput}>{label}</button>
          );
        })() : !hasStoreArrived ? (<>
          <button style={flashBtn("#0EA5E9", false, BBH, "storeArrive")} onClick={doStoreArrive}>店舗到着</button>
          <button style={btn("#EF4444", false, BBH)} onClick={() => openCancel("before_store")}>未到着キャンセル</button>
        </>) : !hasStoreDeparted ? (<>
          <button style={flashBtn("#F59E0B", false, BBH, "storeDepart")} onClick={doStoreDepart}>店舗出発</button>
          <button style={btn("#EF4444", false, BBH)} onClick={() => openCancel("store_wait")}>調理待ちキャンセル</button>
        </>) : (
          <button style={flashBtn("#F59E0B", false, BBH, "complete")} onClick={doCmp}>配達完了</button>
        )}
      </div>
    </div>
  );
}
