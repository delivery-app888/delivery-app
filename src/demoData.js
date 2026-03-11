import { tds } from "./utils";

// ─── Demo data generator (6 months) - returns {logs[], todayLog} ───
export const generateDemoLogs = () => {
  const coIds = ["uber", "demaecan", "menu", "rocket"];
  const coWeights = [0.4, 0.3, 0.2, 0.1];
  const wxIds = ["sunny", "cloudy", "rain", "heavy_rain", "snow"];
  const wxWeights = [0.35, 0.30, 0.20, 0.10, 0.05];
  const pick = (arr, w) => { const r = Math.random(); let c = 0; for (let i = 0; i < arr.length; i++) { c += w[i]; if (r < c) return arr[i]; } return arr[arr.length - 1]; };
  const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const HIR_LAT = 34.3853, HIR_LNG = 132.4553, HIR_R = 0.015;
  const rndGps = () => [HIR_LAT + (Math.random() - 0.5) * 2 * HIR_R, HIR_LNG + (Math.random() - 0.5) * 2 * HIR_R];

  const today = new Date();
  const todayStr2 = tds();
  const logs = [];

  const makeDayLog = (d, dateStr) => {
    const dow = d.getDay();
    const wx = pick(wxIds, wxWeights);
    const isWeekend = dow === 0 || dow === 6;
    const isRain = wx === "rain" || wx === "heavy_rain";

    let dailyCount = rnd(25, 38);
    if (isWeekend) dailyCount += rnd(3, 8);
    if (isRain) dailyCount += rnd(2, 6);

    const startHour = rnd(8, 11);
    const startTime = new Date(d); startTime.setHours(startHour, rnd(0, 30), 0, 0);
    let cur = startTime.getTime();

    const deliveries = [], breaks2 = [], jizoSessions = [], dailyIncentives = [];
    const lunchStart = new Date(d); lunchStart.setHours(14, rnd(0, 30), 0, 0);
    const lunchEnd = new Date(lunchStart.getTime() + rnd(20, 40) * 60000);
    breaks2.push({ start: lunchStart.getTime(), end: lunchEnd.getTime() });

    for (let i = 0; i < dailyCount; i++) {
      const co = pick(coIds, coWeights);
      const otR = Math.random();
      const orderType = otR < 0.80 ? "single" : otR < 0.95 ? "double" : "triple";
      const hour = new Date(cur).getHours();
      let rew = rnd(350, 650);
      if (co === "demaecan") rew += rnd(50, 150);
      if (co === "uber" && hour >= 17 && hour <= 21) rew += rnd(50, 200);
      if (isRain) rew += rnd(50, 150);
      if (isWeekend && hour >= 11 && hour <= 14) rew += rnd(30, 100);
      if (orderType === "double") rew = Math.round(rew * 1.6);
      if (orderType === "triple") rew = Math.round(rew * 2.2);
      const inc = Math.random() < 0.30 ? rnd(50, 200) : 0;
      const cancelled = Math.random() < 0.03;
      const oTime = cur;
      const cTime = cur + rnd(8, 25) * 60000;
      const avgDemo = 550;
      const rating = cancelled ? null : rew >= avgDemo * 1.2 ? "good" : rew <= avgDemo * 0.8 ? "bad" : "normal";
      const [sLat, sLng] = rndGps(); const [eLat, eLng] = rndGps();
      const demoWCode = wx === "sunny" ? rnd(0,1) : wx === "cloudy" ? rnd(2,3) : wx === "rain" ? rnd(51,55) : wx === "heavy_rain" ? rnd(80,82) : rnd(71,75);
      const demoPrecip = (wx === "rain" || wx === "heavy_rain") ? +(Math.random() * 8 + 0.2).toFixed(1) : wx === "snow" ? +(Math.random() * 3 + 0.1).toFixed(1) : 0;
      const demoApiW = { temperature: rnd(5, 35), windspeed: rnd(2, 30), weathercode: demoWCode, weatherId: wx, precipitation: demoPrecip };
      // Assign demo area name based on GPS position
      const demoAreas = ["紙屋町", "八丁堀", "本通", "袋町", "中町", "大手町", "幟町", "銀山町", "胡町", "立町"];
      const aIdx = Math.floor(((eLat - (HIR_LAT - HIR_R)) / (HIR_R * 2)) * demoAreas.length) % demoAreas.length;
      const demoArea = demoAreas[Math.abs(aIdx)] || "中区";
      deliveries.push({ orderTime: oTime, completeTime: cTime, company: co, reward: cancelled ? 0 : rew, incentive: cancelled ? 0 : inc, orderType, cancelled, rating, startLat: sLat, startLng: sLng, endLat: eLat, endLng: eLng, apiWeather: demoApiW, areaName: demoArea });
      cur = cTime + rnd(2, 15) * 60000;
      if (Math.random() < 0.20 && !cancelled) jizoSessions.push({ start: cTime + rnd(1, 3) * 60000, end: cTime + rnd(6, 22) * 60000 });
      if (new Date(cur).getHours() === 14 && new Date(cur).getMinutes() < 30) cur = lunchEnd.getTime() + rnd(5, 15) * 60000;
    }

    const endTime = cur + rnd(5, 15) * 60000;
    const usedCos = [...new Set(deliveries.map(dl => dl.company))];
    usedCos.forEach(co => { if (Math.random() < 0.40) dailyIncentives.push({ company: co, amount: rnd(200, 1500), time: endTime }); });

    return {
      date: dateStr, weather: wx,
      sessions: [{ start: startTime.getTime(), end: endTime }],
      breaks: breaks2, deliveries, dailyIncentives, jizoSessions,
      currentSessionStart: null, currentBreakStart: null, currentOrderTime: null, currentJizoStart: null,
    };
  };

  let todayLog = null;
  for (let off = 180; off >= 0; off--) {
    const d = new Date(today); d.setDate(d.getDate() - off);
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    if (off > 0 && Math.random() < 0.2) continue;
    const log = makeDayLog(d, ds);
    if (ds === todayStr2) todayLog = log;
    else logs.push(log);
  }
  if (!todayLog) todayLog = makeDayLog(today, todayStr2);
  return { logs, todayLog };
};
