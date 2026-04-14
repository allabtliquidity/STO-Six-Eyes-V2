// ─── Market data client ───────────────────────────────────────────────────────
// Primary: Twelve Data API — years of intraday history
// Fallback: Yahoo Finance — recent data only
// Deep history: Databento — back to 2010

export interface Candle {
  datetime: string; // YYYY-MM-DD HH:MM in America/New_York
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SetupCandidate {
  entryTime: string;
  direction: "long" | "short";
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  setupType: string;
  grade: string;
  reasoning: string;
}

export interface CompactCandle {
  t: string; // "HH:MM"
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface SimulatedTrade {
  symbol: string;
  direction: "long" | "short";
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  takeProfit: number;
  pnlDollars: number;
  pnlPoints: number;
  rr: number;
  slPoints: number;
  tpPoints: number;
  tradeDate: string;
  entryTime: string;
  exitTime: string;
  outcome: "win" | "loss";
  setupType: string;
  grade: string;
  reasoning: string;
  slCompliance: string;
  chartCandles?: CompactCandle[];
  smtChartCandles?: CompactCandle[];
}

const YAHOO_SYMBOL_MAP: Record<string, string> = { GC: "GC=F", SI: "SI=F", NQ: "NQ=F", ES: "ES=F" };
const TD_SYMBOL_MAP: Record<string, string> = { NQ: "NQ1!", ES: "ES1!", GC: "GC1!", SI: "SI1!" };
const DB_SYMBOL_MAP: Record<string, string> = { NQ: "NQ.c.0", ES: "ES.c.0", GC: "GC.c.0", SI: "SI.c.0" };

export const POINT_VALUE: Record<string, number> = { GC: 100, SI: 50, NQ: 20, ES: 50 };

function tsToET(ts: number): string {
  const d = new Date(ts * 1000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const p: Record<string, string> = {};
  for (const { type, value } of parts) p[type] = value;
  const h = p.hour === "24" ? "00" : p.hour;
  return `${p.year}-${p.month}-${p.day} ${h}:${p.minute}`;
}

function barsPerDay(interval: string): number {
  switch (interval) {
    case "1m": return 23 * 60;
    case "5m": return 23 * 12;
    case "15m": return 23 * 4;
    case "1h": return 23;
    default: return 300;
  }
}

function chunkDateRange(startDate: string, endDate: string, interval: string, maxBars = 4500) {
  const bpd = barsPerDay(interval);
  const chunkCalendarDays = Math.max(1, Math.floor(maxBars / bpd));
  const chunks: Array<{ start: string; end: string }> = [];
  const cur = new Date(startDate + "T12:00:00Z");
  const end = new Date(endDate + "T12:00:00Z");
  while (cur <= end) {
    const chunkStart = cur.toISOString().split("T")[0];
    const chunkEndDate = new Date(cur.getTime() + (chunkCalendarDays - 1) * 86_400_000);
    const actualEnd = chunkEndDate > end ? end : chunkEndDate;
    chunks.push({ start: chunkStart, end: actualEnd.toISOString().split("T")[0] });
    cur.setTime(actualEnd.getTime() + 86_400_000);
  }
  return chunks;
}

export function aggregate1mBars(candles1m: Candle[], minutes: number): Candle[] {
  const result: Candle[] = [];
  let i = 0;
  while (i < candles1m.length) {
    const group: Candle[] = [candles1m[i]];
    const baseMin = candles1m[i].datetime.slice(0, 16);
    const [datePart, timePart] = baseMin.split(" ");
    const [h, m] = timePart.split(":").map(Number);
    const baseMinutes = h * 60 + m;
    const groupEndMinutes = baseMinutes + minutes;
    i++;
    while (i < candles1m.length) {
      const [cd, ct] = candles1m[i].datetime.split(" ");
      if (cd !== datePart) break;
      const [ch, cm] = ct.split(":").map(Number);
      if (ch * 60 + cm >= groupEndMinutes) break;
      group.push(candles1m[i]);
      i++;
    }
    result.push({
      datetime: group[0].datetime,
      open: group[0].open,
      high: Math.max(...group.map(c => c.high)),
      low: Math.min(...group.map(c => c.low)),
      close: group[group.length - 1].close,
      volume: group.reduce((s, c) => s + c.volume, 0),
    });
  }
  return result;
}

// ─── Twelve Data ──────────────────────────────────────────────────────────────
async function fetchTwelveDataChunk(tdSymbol: string, interval: string, startDate: string, endDate: string): Promise<Candle[]> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) return [];
  const url = new URL("https://api.twelvedata.com/time_series");
  url.searchParams.set("symbol", tdSymbol);
  url.searchParams.set("interval", interval);
  url.searchParams.set("start_date", `${startDate} 00:00:00`);
  url.searchParams.set("end_date", `${endDate} 23:59:59`);
  url.searchParams.set("timezone", "America/New_York");
  url.searchParams.set("outputsize", "5000");
  url.searchParams.set("order", "ASC");
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("format", "JSON");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  let res: Response;
  try { res = await fetch(url.toString(), { signal: controller.signal }); }
  finally { clearTimeout(timer); }
  if (!res.ok) return [];
  const data = await res.json() as any;
  if (data.status !== "ok" || !Array.isArray(data.values)) return [];
  return data.values.map((v: any) => ({
    datetime: v.datetime.slice(0, 16),
    open: parseFloat(parseFloat(v.open).toFixed(4)),
    high: parseFloat(parseFloat(v.high).toFixed(4)),
    low: parseFloat(parseFloat(v.low).toFixed(4)),
    close: parseFloat(parseFloat(v.close).toFixed(4)),
    volume: parseInt(v.volume ?? "0") || 0,
  }));
}

async function fetchTwelveData(symbol: string, interval: string, startDate: string, endDate: string): Promise<Candle[]> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) return [];
  const tdSymbol = TD_SYMBOL_MAP[symbol] ?? symbol;
  const tdInterval = interval === "1m" ? "1min" : interval === "5m" ? "5min" : interval === "15m" ? "15min" : interval;
  const chunks = chunkDateRange(startDate, endDate, interval);
  const allCandles: Candle[] = [];
  for (const chunk of chunks) {
    try { allCandles.push(...await fetchTwelveDataChunk(tdSymbol, tdInterval, chunk.start, chunk.end)); } catch {}
    if (chunks.length > 1) await new Promise(r => setTimeout(r, 800));
  }
  const seen = new Set<string>();
  const deduped = allCandles.filter(c => { if (seen.has(c.datetime)) return false; seen.add(c.datetime); return true; });
  deduped.sort((a, b) => a.datetime.localeCompare(b.datetime));
  return deduped;
}

// ─── Yahoo Finance ────────────────────────────────────────────────────────────
async function fetchYahooCandles(yhSym: string, interval: string, startDate: string, endDate: string): Promise<Candle[]> {
  const period1 = Math.floor(new Date(startDate + "T00:00:00-05:00").getTime() / 1000);
  const period2 = Math.floor(new Date(endDate + "T23:59:59-04:00").getTime() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yhSym)}?interval=${interval}&period1=${period1}&period2=${period2}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
      signal: controller.signal,
    });
  } finally { clearTimeout(timer); }
  if (!res.ok) throw new Error(`Yahoo ${res.status}`);
  const data = await res.json() as any;
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error("No data");
  const timestamps: number[] = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const candles: Candle[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
    if (o == null || h == null || l == null || c == null) continue;
    candles.push({ datetime: tsToET(timestamps[i]), open: parseFloat(o.toFixed(4)), high: parseFloat(h.toFixed(4)), low: parseFloat(l.toFixed(4)), close: parseFloat(c.toFixed(4)), volume: q.volume?.[i] ?? 0 });
  }
  return candles;
}

// ─── Databento ────────────────────────────────────────────────────────────────
interface DatabentoBar { hd: { ts_event: string }; open: string; high: string; low: string; close: string; volume: string; }

async function fetchDatabentoChunk(dbSymbol: string, schema: "ohlcv-1m" | "ohlcv-1h", startISO: string, endISO: string): Promise<Candle[]> {
  const apiKey = process.env.DATABENTO_API_KEY;
  if (!apiKey) return [];
  const url = new URL("https://hist.databento.com/v0/timeseries.get_range");
  url.searchParams.set("dataset", "GLBX.MDP3");
  url.searchParams.set("symbols", dbSymbol);
  url.searchParams.set("schema", schema);
  url.searchParams.set("start", startISO);
  url.searchParams.set("end", endISO);
  url.searchParams.set("stype_in", "continuous");
  url.searchParams.set("encoding", "json");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { Authorization: "Basic " + Buffer.from(`${apiKey}:`).toString("base64") },
    });
  } finally { clearTimeout(timer); }
  if (!res.ok) return [];
  const text = await res.text();
  const candles: Candle[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('{"detail"')) continue;
    try {
      const bar = JSON.parse(trimmed) as DatabentoBar;
      const tsSeconds = Math.floor(parseInt(bar.hd.ts_event, 10) / 1_000_000_000);
      candles.push({
        datetime: tsToET(tsSeconds),
        open: parseFloat((parseInt(bar.open, 10) / 1e9).toFixed(4)),
        high: parseFloat((parseInt(bar.high, 10) / 1e9).toFixed(4)),
        low: parseFloat((parseInt(bar.low, 10) / 1e9).toFixed(4)),
        close: parseFloat((parseInt(bar.close, 10) / 1e9).toFixed(4)),
        volume: parseInt(bar.volume, 10) || 0,
      });
    } catch { continue; }
  }
  return candles;
}

async function fetchDatabento(symbol: string, interval: "1m" | "1h", startDate: string, endDate: string): Promise<Candle[]> {
  const apiKey = process.env.DATABENTO_API_KEY;
  if (!apiKey) return [];
  const dbSymbol = DB_SYMBOL_MAP[symbol];
  if (!dbSymbol) return [];
  const schema = interval === "1h" ? "ohlcv-1h" : "ohlcv-1m";
  const startUTC = new Date(startDate + "T00:00:00Z");
  startUTC.setUTCDate(startUTC.getUTCDate() - 1);
  const endUTC = new Date(endDate + "T00:00:00Z");
  endUTC.setUTCDate(endUTC.getUTCDate() + 1);
  const CHUNK_DAYS = 7;
  const allCandles: Candle[] = [];
  const cur = new Date(startUTC);
  while (cur < endUTC) {
    const chunkEnd = new Date(cur);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + CHUNK_DAYS);
    if (chunkEnd > endUTC) chunkEnd.setTime(endUTC.getTime());
    try { allCandles.push(...await fetchDatabentoChunk(dbSymbol, schema, cur.toISOString().replace(/\.\d+Z$/, "Z"), chunkEnd.toISOString().replace(/\.\d+Z$/, "Z"))); } catch {}
    cur.setTime(chunkEnd.getTime());
  }
  const seen = new Set<string>();
  const deduped = allCandles.filter(c => { if (seen.has(c.datetime)) return false; seen.add(c.datetime); return true; });
  deduped.sort((a, b) => a.datetime.localeCompare(b.datetime));
  return deduped;
}

// ─── Public fetch functions ───────────────────────────────────────────────────
// TwelveData free plan returns 1h bars for old dates instead of failing — so
// we check if bars returned are actually 5m by verifying consecutive candle
// spacing. If spacing > 10 minutes, it's not 5m data.
function is5mData(candles: Candle[]): boolean {
  if (candles.length < 4) return false;
  // Check spacing between first few candles
  let spacings = 0;
  for (let i = 1; i < Math.min(5, candles.length); i++) {
    const a = new Date(candles[i-1].datetime.replace(" ", "T") + ":00").getTime();
    const b = new Date(candles[i].datetime.replace(" ", "T") + ":00").getTime();
    spacings += (b - a) / 60000; // minutes
  }
  const avgSpacing = spacings / Math.min(4, candles.length - 1);
  return avgSpacing <= 10; // 5m or less = genuine intraday
}

export async function fetchBars(symbol: string, startDate: string, endDate: string): Promise<{ candles: Candle[]; interval: "5m" | "1h" }> {
  const daysAgo = (Date.now() - new Date(startDate + "T12:00:00Z").getTime()) / 86_400_000;

  // For recent data (≤60 days): try TwelveData 5m first
  if (daysAgo <= 60) {
    try { const c = await fetchTwelveData(symbol, "5m", startDate, endDate); if (c.length > 10 && is5mData(c)) return { candles: c, interval: "5m" }; } catch {}
  }

  // Recent data: try Yahoo 5m
  if (daysAgo <= 58) {
    try { const c = await fetchYahooCandles(YAHOO_SYMBOL_MAP[symbol] ?? symbol, "5m", startDate, endDate); if (c.length > 10 && is5mData(c)) return { candles: c, interval: "5m" }; } catch {}
  }

  // Always try Databento 1m → aggregate to 5m (works for all dates back to 2010)
  try {
    console.log(`[fetchBars] Trying Databento for ${symbol} ${startDate}->${endDate}`);
    const c = await fetchDatabento(symbol, "1m", startDate, endDate);
    console.log(`[fetchBars] Databento returned ${c.length} 1m candles for ${symbol}`);
    if (c.length > 10) return { candles: aggregate1mBars(c, 5), interval: "5m" };
  } catch (e) { console.log(`[fetchBars] Databento error: ${e}`); }

  // Fallback: TwelveData for whatever it can give (may be 1h for old dates)
  try { const c = await fetchTwelveData(symbol, "5m", startDate, endDate); if (c.length > 10) return { candles: c, interval: is5mData(c) ? "5m" : "1h" }; } catch {}
  try { const c = await fetchYahooCandles(YAHOO_SYMBOL_MAP[symbol] ?? symbol, "1h", startDate, endDate); if (c.length > 0) return { candles: c, interval: "1h" }; } catch {}
  try { const c = await fetchDatabento(symbol, "1h", startDate, endDate); if (c.length > 0) return { candles: c, interval: "1h" }; } catch {}
  return { candles: [], interval: "1h" };
}

export async function fetchBars1m(symbol: string, startDate: string, endDate: string): Promise<Candle[]> {
  const daysAgo = (Date.now() - new Date(startDate + "T12:00:00Z").getTime()) / 86_400_000;
  // TwelveData 1m only works for recent data
  if (daysAgo <= 60) {
    try { const c = await fetchTwelveData(symbol, "1m", startDate, endDate); if (c.length > 0 && is5mData(c)) return c; } catch {}
  }
  if (daysAgo <= 30) {
    try { const c = await fetchYahooCandles(YAHOO_SYMBOL_MAP[symbol] ?? symbol, "1m", startDate, endDate); if (c.length > 0) return c; } catch {}
  }
  // Databento is the definitive source for older 1m data
  try { const c = await fetchDatabento(symbol, "1m", startDate, endDate); if (c.length > 0) return c; } catch {}
  return [];
}

export async function fetchBars15m(symbol: string, startDate: string, endDate: string): Promise<Candle[]> {
  const daysAgo = (Date.now() - new Date(startDate + "T12:00:00Z").getTime()) / 86_400_000;
  if (daysAgo <= 60) {
    try { const c = await fetchTwelveData(symbol, "15m", startDate, endDate); if (c.length > 0 && is5mData(c)) return c; } catch {}
  }
  // Databento 1m → aggregate to 15m for older dates
  try { const c = await fetchDatabento(symbol, "1m", startDate, endDate); if (c.length > 0) return aggregate1mBars(c, 15); } catch {}
  // Last resort: TwelveData regardless of age
  try { const c = await fetchTwelveData(symbol, "15m", startDate, endDate); if (c.length > 0) return c; } catch {}
  return [];
}

export function getTradingDays(fromDate: string, toDate: string): string[] {
  const days: string[] = [];
  const cur = new Date(fromDate + "T12:00:00Z");
  const end = new Date(toDate + "T12:00:00Z");
  while (cur <= end) {
    const dow = cur.getUTCDay();
    if (dow !== 0 && dow !== 6) days.push(cur.toISOString().split("T")[0]);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

export function simulateSetup(setup: SetupCandidate, symbol: string, allCandles: Candle[]): SimulatedTrade | null {
  const entryMinute = setup.entryTime.slice(0, 16);
  const entryIdx = allCandles.findIndex(c => c.datetime.slice(0, 16) >= entryMinute);
  if (entryIdx === -1) return null;
  const { entryPrice, stopLoss, takeProfit, direction } = setup;
  const slPoints = parseFloat(Math.abs(entryPrice - stopLoss).toFixed(4));
  const tpPoints = parseFloat(Math.abs(takeProfit - entryPrice).toFixed(4));
  const rr = slPoints > 0 ? parseFloat((tpPoints / slPoints).toFixed(2)) : 0;
  const slCompliance = slPoints > 60 ? "violation" : slPoints > 50 ? "elevated" : slPoints <= 30 ? "good" : "warning";
  let outcome: "win" | "loss" | null = null;
  let exitPrice = entryPrice;
  let exitTime = "";
  const limit = Math.min(allCandles.length, entryIdx + 500);
  for (let i = entryIdx; i < limit; i++) {
    const c = allCandles[i];
    if (direction === "long") {
      const hitSL = c.low <= stopLoss, hitTP = c.high >= takeProfit;
      if (hitSL && hitTP) { outcome = Math.abs(c.open - stopLoss) <= Math.abs(c.open - takeProfit) ? "loss" : "win"; }
      else if (hitSL) outcome = "loss";
      else if (hitTP) outcome = "win";
    } else {
      const hitSL = c.high >= stopLoss, hitTP = c.low <= takeProfit;
      if (hitSL && hitTP) { outcome = Math.abs(c.open - stopLoss) <= Math.abs(c.open - takeProfit) ? "loss" : "win"; }
      else if (hitSL) outcome = "loss";
      else if (hitTP) outcome = "win";
    }
    if (outcome) { exitPrice = outcome === "win" ? takeProfit : stopLoss; exitTime = c.datetime; break; }
  }
  if (!outcome) return null;
  const pv = POINT_VALUE[symbol] ?? 20;
  const pnlPoints = outcome === "win" ? tpPoints : -slPoints;
  let grade = setup.grade ?? "C";
  if (slCompliance === "violation") grade = "F";
  if (slCompliance === "elevated" && ["A++", "A+", "A"].includes(grade)) grade = "B+";
  return {
    symbol, direction, entryPrice, exitPrice: parseFloat(exitPrice.toFixed(4)),
    stopLoss, takeProfit, pnlDollars: parseFloat((pnlPoints * pv).toFixed(2)),
    pnlPoints: parseFloat(pnlPoints.toFixed(4)), rr, slPoints, tpPoints,
    tradeDate: setup.entryTime.split(" ")[0], entryTime: setup.entryTime,
    exitTime, outcome, setupType: setup.setupType, grade, reasoning: setup.reasoning, slCompliance,
  };
}
