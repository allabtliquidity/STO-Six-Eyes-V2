import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import db from "../db.js";
import {
  fetchBars, fetchBars1m, fetchBars15m, getTradingDays, simulateSetup,
  aggregate1mBars, POINT_VALUE,
  type Candle, type SetupCandidate, type SimulatedTrade, type CompactCandle,
} from "../lib/marketData.js";

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VALID_GRADES = ["A++", "A+", "A", "B+", "B", "C", "D", "F"] as const;
type Grade = typeof VALID_GRADES[number];

function sanitizeGrade(raw: string | null | undefined): Grade {
  if (!raw) return "C";
  const g = raw.trim();
  if ((VALID_GRADES as readonly string[]).includes(g)) return g as Grade;
  if (g === "A-") return "B+"; if (g === "B-") return "B";
  if (g === "S" || g === "S+" || g === "S++") return "A++";
  if (g.startsWith("A")) return "A"; if (g.startsWith("B")) return "B";
  if (g.startsWith("C")) return "C"; return "C";
}

function toCompact(c: Candle): CompactCandle {
  return { t: c.datetime.slice(11, 16), o: c.open, h: c.high, l: c.low, c: c.close };
}

function buildStrategyContext(strategyId: number): { name: string; ctx: string } {
  const strategy = db.prepare("SELECT * FROM strategies WHERE id = ?").get(strategyId) as any;
  const sections = db.prepare("SELECT * FROM knowledge_sections WHERE strategy_id = ? ORDER BY section_number").all(strategyId) as any[];
  const name = strategy?.name ?? "Custom Strategy";
  const ctx = sections.length === 0 ? "No knowledge base sections found."
    : sections.map((s: any) => `=== ${s.section_name} ===\n${s.content}\n\nRULES:\n${s.rules ?? "N/A"}`).join("\n\n");
  return { name, ctx };
}

function buildSetupSystemPrompt(opts: {
  strategyName: string; strategyCtx: string; symbol: string;
  barInterval: "5m" | "1h"; pointValue: number; learnedContext?: string;
}): string {
  const { strategyName, strategyCtx, symbol, barInterval, pointValue, learnedContext } = opts;
  const barLabel = barInterval === "5m" ? "5-minute" : "1-hour";

  const learnedBlock = learnedContext
    ? `\nLEARNED CONTEXT FROM PAST BACKTESTS:\n${learnedContext}\n- win_pattern = reinforce. loss_pattern = context only, NOT a filter. NEVER reduce setups found due to loss memories.\n`
    : "";

  const sharedRules = `
TRADE CONSTRAINTS (non-negotiable):
- Only identify setups whose entry zone has ALREADY been REACHED in the candles provided.
- Do NOT project future setups.
- STOP LOSS: ideal 15-30 pts, max 50 pts. HIGH VOLATILITY (avg bar range >25 pts): up to 60 pts. SL>60 = grade F always.
- Take profit: minimum 2:1 R:R.
- Maximum 2 setups per session. 1 contract. Point value: ${pointValue} USD/pt for ${symbol}.

MULTI-TIMEFRAME ENTRY PRECISION:
When 2-MINUTE BARS are provided — use them for:
1. Exact entry candle (first candle to close beyond PD array)
2. SL at 2m swing point (prior 2m swing low for longs, swing high for shorts) — typically 8-20 pts
3. Exact entry time from 2m candle datetime

When 3-MINUTE BARS are provided — use for swing structure confirmation.
When 1-MINUTE BARS are provided — finest granularity for exact entry tick and SL.

GRADING:
A++ = Textbook perfect, SL ≤ 25 pts, all TFs confirm
A+  = Nearly perfect, SL ≤ 30 pts
A   = Strong, all core rules met, SL ≤ 35 pts
B+  = Above average, most rules met, SL ≤ 40 pts
B   = Good, valid setup, SL ≤ 50 pts
C   = Average, barely qualifies or high-volatility SL 50-60 pts
D   = Weak, major rule violated
F   = Invalid — SL > 60 pts, wrong direction, no valid setup

RESPONSE FORMAT — ONLY valid JSON, no text before or after:
{"setups":[{"entryTime":"YYYY-MM-DD HH:MM","direction":"long"|"short","entryPrice":number,"stopLoss":number,"takeProfit":number,"setupType":string,"grade":"A++"||"A+"||"A"||"B+"||"B"||"C"||"D"||"F","reasoning":"one sentence"}]}
If no valid setups today: {"setups":[]}`;

  const isStdv = strategyName.toLowerCase().includes("stdv") && !strategyName.toLowerCase().includes("poliker");
  const isPoliker = strategyName.toLowerCase().includes("poliker");
  const isIcc = strategyName.toLowerCase().includes("icc");

  if (isStdv) {
    return `You are Six Eyes AI backtesting the STDV Model — Power of Three + Standard Deviation strategy.

You MUST ONLY identify setups rooted in STDV Model logic. STRICTLY FORBIDDEN:
- "9:30 Breakout", "NY Open Breakout", "Momentum Breakout", "Opening Range Breakout"
- "Liquidity Sweep" as standalone (only valid as part of PO3 Manipulation)
- Generic BOS/CHoCH labels with no STDV context
All setup type strings MUST contain "STDV" or "PO3".

CRITICAL TIME RULE — ENTRIES ONLY 02:00–05:00 ET. ANY entry outside = grade F, omit.

CORE STDV RULES:
1. PO3 STRUCTURE: Accumulation (00:00-02:00 ET tight range) → Manipulation (sweep ~02:00 ET) → Distribution (02:00-05:00 ET main move)
2. BIAS: Sweep high → short distribution. Sweep low → long distribution.
3. PD ARRAY ENTRY (any of): Order Block, FVG, IFVG, Rejection Block, Wick CE, Breaker Block, SMT Divergence, CISD, OTE

SESSION CONTEXT (${barLabel} bars):
- [Asia] 00:00-02:00 ET: PO3 Accumulation — map PD arrays
- [London] 02:00-05:00 ET: ENTRY WINDOW ONLY
- 05:00+ ET: Session CLOSED — no entries

TAKE PROFIT — STRUCTURAL TARGETS ONLY:
- Primary: PDH (if long) / PDL (if short)
- Also: FVG far edges, swing highs/lows, dealing range extremes
- NEVER set TP within 75 points of entry. R:R often 5:1 to 30:1 — correct.

SETUP TYPE: "STDV — [Bearish/Bullish] PO3 + [OB/FVG/Rejection Block/SMT/etc] Entry"

${barInterval === "1h" ? "⚠️ DATA LIMITATION — 1H BARS ONLY: Grade all setups maximum D. State in reasoning: 'NOTE: Only 1H bars — grade capped at D.'" : ""}

STRATEGY KNOWLEDGE BASE:
${strategyCtx}
${learnedBlock}${sharedRules}`;
  }

  if (isPoliker) {
    return `You are Six Eyes AI backtesting the Poliker STDV Model.

ENTRY WINDOW: 02:00–09:30 ET (London session). Entries outside = grade F.

POLIKER 4-CHECK SYSTEM (ALL must pass):
1. Asia Range sweep (London sweeps ASH or ASL)
2. Price reaches the 2.0-3.5 standard deviation zone
3. PD array present at the deviation zone (OB, FVG, Rejection Block)
4. SMT divergence confirmed

[Asia-Eve] bars (18:00-00:00 prior evening) + [Asia] bars (00:00-02:00) = Accumulation phase.
[London] bars (02:00-12:00) = Manipulation + Entry window.

SETUP TYPE must contain "Poliker".

STRATEGY KNOWLEDGE BASE:
${strategyCtx}
${learnedBlock}${sharedRules}`;
  }

  if (isIcc) {
    return `You are Six Eyes AI backtesting the ICC Model — Indication, Correction, Continuation.

STRICTLY FORBIDDEN: "Breakout", "NY Open Breakout", "Momentum break" as ICC setups.
All setup types MUST contain "ICC".

THE 3 NON-NEGOTIABLE PHASES:
1. INDICATION — price breaks a significant swing high or low. Do NOT enter here.
2. CORRECTION — price pulls back at least 38% of the swing range. Do NOT enter here.
3. CONTINUATION — price returns to the broken level a SECOND time. ONLY valid entry.
   (First return = NOT an entry. Only the SECOND return qualifies.)

38% RETRACEMENT RULE — mandatory: state swing range, calculate 38%, confirm price reached it.

SESSION RULES (strictly enforce):
- Valid: London (02:00-12:00 ET) and New York (09:30-16:15 ET)
- Asian session (18:00-02:00 ET): preparation only — no entries
- NO entries on Fridays
- NO entries Monday before 10:00 ET

STRATEGY KNOWLEDGE BASE:
${strategyCtx}
${learnedBlock}${sharedRules}`;
  }

  // General ICT / other strategies
  return `You are Six Eyes AI backtesting the ${strategyName} strategy.

STRATEGY KNOWLEDGE BASE:
${strategyCtx}

SESSION CONTEXT (${barLabel} bars):
- [Asia] 00:00-02:00 ET: Context only
- [London] 02:00-07:00 ET: Primary entry window
- [NY] 07:00-16:15 ET: Secondary entry window

${barInterval === "1h" ? "⚠️ DATA LIMITATION — 1H BARS ONLY: Grade all setups maximum B+." : ""}
${learnedBlock}${sharedRules}`;
}

function computeStats(trades: SimulatedTrade[], initialCapital: number) {
  let equity = initialCapital, peak = initialCapital, maxDrawdown = 0;
  let wins = 0, losses = 0, totalGain = 0, totalLoss = 0;
  const rrValues: number[] = [];
  const equityCurve: Array<{ date: string; equity: number }> = [];
  const tradeLog: Record<string, any[]> = {};
  for (const t of trades) {
    equity += t.pnlDollars;
    if (t.pnlDollars > 0) { wins++; totalGain += t.pnlDollars; }
    else if (t.pnlDollars < 0) { losses++; totalLoss += Math.abs(t.pnlDollars); }
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? (peak - equity) / peak : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
    if (t.rr > 0) rrValues.push(t.rr);
    equityCurve.push({ date: t.tradeDate, equity: Math.round(equity * 100) / 100 });
    if (!tradeLog[t.tradeDate]) tradeLog[t.tradeDate] = [];
    tradeLog[t.tradeDate].push({
      id: Date.now() + Math.random(), symbol: t.symbol, direction: t.direction,
      pnl: Math.round(t.pnlDollars * 100) / 100, rr: t.rr, slPoints: t.slPoints,
      tpPoints: t.tpPoints, grade: t.grade, gradeReason: t.reasoning,
      setupType: t.setupType, slCompliance: t.slCompliance,
    });
  }
  const totalClosed = wins + losses;
  return {
    equityCurve, tradeLog,
    net_pnl: equity - initialCapital, total_trades: trades.length,
    winning_trades: wins, losing_trades: losses,
    win_rate: totalClosed > 0 ? wins / totalClosed : 0,
    avg_rr: rrValues.length > 0 ? rrValues.reduce((a, b) => a + b, 0) / rrValues.length : 0,
    profit_factor: totalLoss > 0 ? totalGain / totalLoss : totalGain > 0 ? 999 : 0,
    max_drawdown: maxDrawdown,
  };
}

interface AutoRunJob {
  phase: string; progress: number; dayNum?: number; totalDays?: number;
  setupsFound: number; complete: boolean; error?: string;
  result?: object; liveTrades?: object[]; dataWarning?: string; createdAt: number;
}
const autoRunJobs = new Map<string, AutoRunJob>();
setInterval(() => { const c = Date.now() - 30 * 60_000; for (const [id, j] of autoRunJobs) if (j.createdAt < c) autoRunJobs.delete(id); }, 10 * 60_000);

router.get("/backtests", (_req, res) => {
  const rows = db.prepare("SELECT * FROM backtests ORDER BY created_at DESC").all() as any[];
  res.json(rows.map((b: any) => ({ ...b, net_pnl: Number(b.net_pnl ?? 0), win_rate: Number(b.win_rate ?? 0), avg_rr: Number(b.avg_rr ?? 0), profit_factor: Number(b.profit_factor ?? 0), max_drawdown: Number(b.max_drawdown ?? 0), trade_log: b.trade_log ? JSON.parse(b.trade_log) : {}, equity_curve: b.equity_curve ? JSON.parse(b.equity_curve) : [] })));
});

router.get("/backtests/jobs/:jobId", (req, res) => {
  const job = autoRunJobs.get(req.params.jobId);
  if (!job) { res.status(404).json({ error: "Job not found or expired." }); return; }
  res.json(job);
});

router.delete("/backtests/:id", (req, res) => { db.prepare("DELETE FROM backtests WHERE id = ?").run(req.params.id); res.status(204).end(); });
router.delete("/backtests", (_req, res) => { db.prepare("DELETE FROM backtests").run(); res.status(204).end(); });

router.post("/backtests/auto-run", async (req, res) => {
  const { strategyId, symbol, fromDate, toDate, initialCapital = 100000, riskSettings } = req.body;
  if (!symbol || !fromDate || !toDate) { res.status(400).json({ error: "symbol, fromDate, and toDate are required" }); return; }
  const daysAgo = (Date.now() - new Date(fromDate + "T12:00:00Z").getTime()) / 86_400_000;
  if (daysAgo > 729) { res.status(400).json({ error: `Data only available ~2 years back.` }); return; }

  const jobId = crypto.randomUUID();
  const job: AutoRunJob = { phase: "Loading strategy...", progress: 3, setupsFound: 0, complete: false, createdAt: Date.now() };
  autoRunJobs.set(jobId, job);
  res.json({ jobId });

  const send = (payload: Record<string, unknown>) => {
    if (payload.type === "phase") { job.phase = String(payload.message ?? ""); job.progress = Number(payload.progress ?? job.progress); }
    else if (payload.type === "scanDay") { job.phase = String(payload.message ?? ""); job.progress = Number(payload.progress ?? job.progress); job.dayNum = Number(payload.dayNum); job.totalDays = Number(payload.totalDays); job.setupsFound = Number(payload.setupsFound ?? job.setupsFound); }
    else if (payload.type === "setupFound") { job.setupsFound = (job.setupsFound ?? 0) + 1; if (!job.liveTrades) job.liveTrades = []; job.liveTrades.push(payload); }
    else if (payload.type === "warning") { job.dataWarning = String(payload.message ?? ""); }
    else if (payload.type === "complete") { job.result = payload; job.phase = "Complete"; job.progress = 100; job.complete = true; }
    else if (payload.type === "error") { job.error = String(payload.message ?? "Unknown error"); job.complete = true; }
  };

  (async () => {
    try {
      // ── Phase 1: Load strategy ──────────────────────────────────────────────
      send({ type: "phase", message: "Loading strategy knowledge base...", progress: 3 });
      let strategyName = "ICT / General";
      let strategyCtx = "Apply general ICT/SMC futures trading principles.";
      if (strategyId) { const built = buildStrategyContext(strategyId); strategyName = built.name; strategyCtx = built.ctx; }

      const pointValue = POINT_VALUE[symbol] ?? 20;
      const isStdvStrategy = strategyName.toLowerCase().includes("stdv");
      const isStdvOrWick = isStdvStrategy || strategyName.toLowerCase().includes("wick");
      const isIcc = strategyName.toLowerCase().includes("icc");
      const isPoliker = strategyName.toLowerCase().includes("poliker");

      // SMT pair only for STDV strategies
      const smtPair: string | null = isStdvStrategy
        ? (symbol === "NQ" ? "ES" : symbol === "ES" ? "NQ" : symbol === "GC" ? "SI" : symbol === "SI" ? "GC" : null)
        : null;

      // ── Phase 2: Fetch market data ──────────────────────────────────────────
      const totalFetches = smtPair ? 6 : 3;
      let fs = 0;
      const fp = (s: number) => Math.round(8 + (s / totalFetches) * 6);

      const hasTD = !!process.env.TWELVE_DATA_API_KEY;
      const hasDB = !!process.env.DATABENTO_API_KEY;
      console.log(`[Backtest] Keys: TwelveData=${hasTD} Databento=${hasDB} | ${symbol} ${fromDate}->${toDate}`);

      send({ type: "phase", message: `[1/${totalFetches}] Fetching ${symbol} 5m bars...`, progress: fp(fs++) });
      const fetched = await fetchBars(symbol, fromDate, toDate);
      const allCandles = fetched.candles;
      const barInterval = fetched.interval;
      console.log(`[Backtest] ${symbol} primary bars: ${allCandles.length} candles, interval=${barInterval}`);

      send({ type: "phase", message: `[2/${totalFetches}] Fetching ${symbol} 1m bars...`, progress: fp(fs++) });
      const allCandles1m = await fetchBars1m(symbol, fromDate, toDate);
      console.log(`[Backtest] ${symbol} 1m bars: ${allCandles1m.length} candles`);
      const allCandles2m = allCandles1m.length > 0 ? aggregate1mBars(allCandles1m, 2) : [];
      const allCandles3m = allCandles1m.length > 0 ? aggregate1mBars(allCandles1m, 3) : [];

      send({ type: "phase", message: `[3/${totalFetches}] Fetching ${symbol} 15m bars...`, progress: fp(fs++) });
      const allCandles15m = await fetchBars15m(symbol, fromDate, toDate);
      console.log(`[Backtest] ${symbol} 15m bars: ${allCandles15m.length} candles`);

      let smtCandles5m: Candle[] = [], smtCandles1m: Candle[] = [], smtCandles2m: Candle[] = [], smtCandles3m: Candle[] = [], smtCandles15m: Candle[] = [];
      if (smtPair) {
        send({ type: "phase", message: `[4/${totalFetches}] Fetching ${smtPair} 5m (SMT)...`, progress: fp(fs++) });
        smtCandles5m = (await fetchBars(smtPair, fromDate, toDate)).candles;
        send({ type: "phase", message: `[5/${totalFetches}] Fetching ${smtPair} 1m (SMT)...`, progress: fp(fs++) });
        smtCandles1m = await fetchBars1m(smtPair, fromDate, toDate);
        smtCandles2m = smtCandles1m.length > 0 ? aggregate1mBars(smtCandles1m, 2) : [];
        smtCandles3m = smtCandles1m.length > 0 ? aggregate1mBars(smtCandles1m, 3) : [];
        send({ type: "phase", message: `[6/${totalFetches}] Fetching ${smtPair} 15m (SMT)...`, progress: fp(fs++) });
        smtCandles15m = await fetchBars15m(smtPair, fromDate, toDate);
      }

      if (allCandles.length < 10) { send({ type: "error", message: `No market data for ${symbol} in the selected range.` }); return; }
      if (barInterval === "1h" && allCandles1m.length === 0) {
        send({ type: "warning", message: "⚠️ DATA LIMITATION: Only 1-hour bars available for this date range. Granular intraday data (5m/1m/2m) requires dates within the last ~60 days. STDV setups will be low-confidence (grade D at best). For accurate backtesting use dates within the last 60 days." });
      }

      const tradingDays = getTradingDays(fromDate, toDate);
      if (tradingDays.length === 0) { send({ type: "error", message: "No trading days in the selected range." }); return; }

      const extraBarsMsg = [allCandles1m.length > 0 ? `${allCandles1m.length.toLocaleString()} 1m` : "", allCandles2m.length > 0 ? `${allCandles2m.length.toLocaleString()} 2m` : "", allCandles15m.length > 0 ? `${allCandles15m.length.toLocaleString()} 15m` : ""].filter(Boolean).join(" + ");
      send({ type: "phase", message: `Fetched ${allCandles.length.toLocaleString()} ${barInterval} bars${extraBarsMsg ? ` + ${extraBarsMsg}` : ""}. Scanning ${tradingDays.length} trading days...`, progress: 14 });

      // ── Phase 3: AI memory ──────────────────────────────────────────────────
      let learnedContext: string | undefined;
      try {
        const obs = db.prepare("SELECT * FROM ai_observations ORDER BY created_at DESC LIMIT 50").all() as any[];
        const rel = obs.filter((o: any) => (!o.symbol || o.symbol === symbol) && (!o.strategy_id || o.strategy_id === (strategyId ?? 0))).slice(0, 15);
        if (rel.length > 0) learnedContext = rel.map((o: any) => `• [${o.category}] ${o.content}`).join("\n");
      } catch {}

      const SETUP_SYSTEM = buildSetupSystemPrompt({ strategyName, strategyCtx, symbol, barInterval, pointValue, learnedContext });
      const minCandlesPerDay = barInterval === "5m" ? 20 : 5;
      const HIGH_CONVICTION = new Set(["A++", "A+", "A", "B+"]);
      const simulatedTrades: SimulatedTrade[] = [];
      const totalDays = tradingDays.length;

      // ── Phase 4: Scan each day ──────────────────────────────────────────────
      for (let i = 0; i < totalDays; i++) {
        const day = tradingDays[i];
        const prevDay = i > 0 ? tradingDays[i - 1] : null;
        const progress = Math.round(15 + (i / totalDays) * 70);

        // ICC: skip Fridays and Monday before 10:00 (enforced server-side too)
        if (isIcc) {
          const dow = new Date(day + "T12:00:00Z").getUTCDay(); // 0=Sun, 5=Fri
          if (dow === 5) { send({ type: "scanDay", day, dayNum: i + 1, totalDays, candleCount: 0, setupsFound: simulatedTrades.length, progress, message: `Skipping ${day} — Friday (ICC rule)` }); continue; }
        }

        const dayCandlesNY = allCandles.filter((c: Candle) => c.datetime.startsWith(day) && c.datetime.slice(11,16) >= "07:00" && c.datetime.slice(11,16) <= "16:15");
        const dayCandlesFull = allCandles.filter((c: Candle) => c.datetime.startsWith(day) && c.datetime.slice(11,16) >= "00:00" && c.datetime.slice(11,16) <= "16:15");
        const candlesForAI = dayCandlesFull.length > 0 ? dayCandlesFull : dayCandlesNY;

        send({ type: "scanDay", day, dayNum: i + 1, totalDays, candleCount: dayCandlesNY.length, setupsFound: simulatedTrades.length, progress, message: `Scanning ${day} — ${dayCandlesNY.length} ${barInterval} bars...` });
        if (dayCandlesNY.length < minCandlesPerDay) continue;

        // ── Previous day reference (PDH/PDL for TP targeting) ──────────────
        let prevDayRef = "";
        if (prevDay) {
          const pc = allCandles.filter((c: Candle) => c.datetime.startsWith(prevDay) && c.datetime.slice(11,16) >= "07:00" && c.datetime.slice(11,16) <= "16:15");
          if (pc.length > 0) {
            const pdh = Math.max(...pc.map((c: Candle) => c.high));
            const pdl = Math.min(...pc.map((c: Candle) => c.low));
            const pdc = pc[pc.length - 1].close;
            prevDayRef = `PREVIOUS DAY REFERENCE (${prevDay} NY session — use for PDH/PDL TP targeting):\nPDH (Previous Day High): ${pdh}\nPDL (Previous Day Low):  ${pdl}\nPDC (Previous Day Close): ${pdc}\n→ If distributing LONG today, primary TP = PDH (${pdh})\n→ If distributing SHORT today, primary TP = PDL (${pdl})\n\n`;
          }
        }

        // ── Prior evening bars (Poliker: Asia-Eve 18:00–00:00 of prevDay) ──
        let prevEveningText = "";
        if (isPoliker && prevDay) {
          const eve = allCandles.filter((c: Candle) => c.datetime.startsWith(prevDay) && c.datetime.slice(11,16) >= "18:00");
          if (eve.length > 0) {
            prevEveningText = `\n--- PRIOR EVENING (${prevDay} 18:00-00:00 ET — Asia Accumulation Phase Start) ---\n${eve.map((c: Candle) => `${c.datetime.slice(0,16)} [Asia-Eve] O:${c.open} H:${c.high} L:${c.low} C:${c.close}`).join("\n")}\n\n`;
          }
        }

        // ── Format main candles for AI ──────────────────────────────────────
        const sl = (t: string) => t < "02:00" ? "[Asia]" : t < "07:00" ? "[London]" : "[NY]";
        const candleText = candlesForAI.map((c: Candle) => `${c.datetime.slice(11,16)} ${sl(c.datetime.slice(11,16))} O:${c.open} H:${c.high} L:${c.low} C:${c.close}`).join("\n");

        // ── 15m bars — strategy-specific window ────────────────────────────
        // STDV/Wick: 00:00-07:00 ET (London + pre-London for manipulation context)
        // ICC/General: 07:00-16:15 ET (NY session HTF structure)
        const d15m = allCandles15m.filter((c: Candle) => {
          if (!c.datetime.startsWith(day)) return false;
          const t = c.datetime.slice(11,16);
          return isStdvOrWick ? (t >= "00:00" && t <= "07:00") : (t >= "07:00" && t <= "16:15");
        });
        const ct15m = d15m.length > 0
          ? `\n\n--- HTF STRUCTURE: 15-MINUTE BARS (${isStdvOrWick ? "00:00-07:00" : "07:00-16:15"} ET, ${d15m.length} bars) ---\nUse for: (1) macro swing high/low swept (manipulation leg), (2) HTF rejection block or OTE zone, (3) 15m SMT divergence = highest quality.\n${d15m.map((c: Candle) => `${c.datetime.slice(11,16)} ${sl(c.datetime.slice(11,16))} O:${c.open} H:${c.high} L:${c.low} C:${c.close}`).join("\n")}`
          : "";

        // ── 2m bars — strategy-specific entry window ────────────────────────
        // STDV/Wick: 01:30-05:30 ET (London entry window)
        // ICC/KO/General: 09:00-11:30 ET (NY open window)
        const entryWindow2m = isStdvOrWick ? { start: "01:30", end: "05:30" } : { start: "09:00", end: "11:30" };
        const d2m = allCandles2m.filter((c: Candle) => c.datetime.startsWith(day) && c.datetime.slice(11,16) >= entryWindow2m.start && c.datetime.slice(11,16) <= entryWindow2m.end);
        const ct2m = d2m.length > 0
          ? `\n\n--- ENTRY PRECISION: 2-MINUTE BARS (${entryWindow2m.start}-${entryWindow2m.end} ET, ${d2m.length} bars) ---\nUse for: (1) precise entry candle (first candle to close beyond PD array), (2) 2m swing SL (typically 8-20 pts tighter than 5m SL), (3) BOS/displacement confirmation.\n${d2m.map((c: Candle) => `${c.datetime.slice(11,16)} ${sl(c.datetime.slice(11,16))} O:${c.open} H:${c.high} L:${c.low} C:${c.close} R:${parseFloat((c.high-c.low).toFixed(2))}`).join("\n")}`
          : "";

        // ── 3m bars — same window as 2m ────────────────────────────────────
        const d3m = allCandles3m.filter((c: Candle) => c.datetime.startsWith(day) && c.datetime.slice(11,16) >= entryWindow2m.start && c.datetime.slice(11,16) <= entryWindow2m.end);
        const ct3m = d3m.length > 0
          ? `\n\n--- SWING STRUCTURE: 3-MINUTE BARS (${entryWindow2m.start}-${entryWindow2m.end} ET, ${d3m.length} bars) ---\nUse for: (1) swing highs/lows confirming manipulation leg, (2) cross-reference 2m entry trigger against 3m structure, (3) 2m entry confirmed on 3m = highest quality.\n${d3m.map((c: Candle) => `${c.datetime.slice(11,16)} ${sl(c.datetime.slice(11,16))} O:${c.open} H:${c.high} L:${c.low} C:${c.close} R:${parseFloat((c.high-c.low).toFixed(2))}`).join("\n")}`
          : "";

        // ── 1m bars — same window as 2m ────────────────────────────────────
        const d1m = allCandles1m.filter((c: Candle) => c.datetime.startsWith(day) && c.datetime.slice(11,16) >= entryWindow2m.start && c.datetime.slice(11,16) <= entryWindow2m.end);
        const ct1m = d1m.length > 0
          ? `\n\n--- ENTRY PRECISION: 1-MINUTE BARS (${entryWindow2m.start}-${entryWindow2m.end} ET, ${d1m.length} bars) ---\nFinest granularity — use for: (1) exact entry candle and SL tick, (2) confirming manipulation wick CLOSED before calling entry, (3) SMT divergence at exact candle level.\n${d1m.map((c: Candle) => `${c.datetime.slice(11,16)} ${sl(c.datetime.slice(11,16))} O:${c.open} H:${c.high} L:${c.low} C:${c.close} R:${parseFloat((c.high-c.low).toFixed(2))}`).join("\n")}`
          : "";

        // ── SMT pair (STDV strategies only) ────────────────────────────────
        let ctSmt = "";
        if (smtPair) {
          const isPolikerScan = isPoliker;
          const smtEnd5m = isPolikerScan ? "09:45" : "07:00";
          const smtEnd1m = isPolikerScan ? "09:45" : "05:30";

          const smt15m = smtCandles15m.filter((c: Candle) => c.datetime.startsWith(day) && c.datetime.slice(11,16) >= "00:00" && c.datetime.slice(11,16) <= smtEnd5m);
          const smt5m  = smtCandles5m.filter((c: Candle) => c.datetime.startsWith(day) && c.datetime.slice(11,16) >= "00:00" && c.datetime.slice(11,16) <= smtEnd5m);
          const smt3m  = smtCandles3m.filter((c: Candle) => c.datetime.startsWith(day) && c.datetime.slice(11,16) >= "01:30" && c.datetime.slice(11,16) <= smtEnd1m);
          const smt2m  = smtCandles2m.filter((c: Candle) => c.datetime.startsWith(day) && c.datetime.slice(11,16) >= "01:30" && c.datetime.slice(11,16) <= smtEnd1m);
          const smt1m  = smtCandles1m.filter((c: Candle) => c.datetime.startsWith(day) && c.datetime.slice(11,16) >= "01:30" && c.datetime.slice(11,16) <= smtEnd1m);

          if (smt15m.length > 0 || smt5m.length > 0 || smt2m.length > 0 || smt1m.length > 0) {
            ctSmt = `\n\n═══════════════════════════════════════\nSMT PAIR — ${smtPair} BARS (SMT divergence confirmation ONLY — all trades execute on ${symbol}, never ${smtPair})\n═══════════════════════════════════════\nSMT Divergence: ${smtPair} sweeps a swing high/low that ${symbol} does NOT (or vice versa) = SMT confirmed.\nCheck EVERY timeframe from 15m down to 1m — 15m SMT = highest quality (A++ candidate); 1m SMT = entry precision.\nThe divergence candle MUST fully CLOSE before SMT is called. Never act on an open wick.\n`;
            if (smt15m.length > 0) ctSmt += `\n${smtPair} 15m (00:00-${smtEnd5m} ET, ${smt15m.length} bars — highest quality SMT):\n${smt15m.map((c: Candle) => `${c.datetime.slice(11,16)} ${sl(c.datetime.slice(11,16))} O:${c.open} H:${c.high} L:${c.low} C:${c.close}`).join("\n")}`;
            if (smt5m.length > 0) ctSmt += `\n\n${smtPair} 5m (00:00-${smtEnd5m} ET, ${smt5m.length} bars — macro swing SMT):\n${smt5m.map((c: Candle) => `${c.datetime.slice(11,16)} ${sl(c.datetime.slice(11,16))} O:${c.open} H:${c.high} L:${c.low} C:${c.close}`).join("\n")}`;
            if (smt3m.length > 0) ctSmt += `\n\n${smtPair} 3m (01:30-${smtEnd1m} ET, ${smt3m.length} bars — swing confirmation SMT):\n${smt3m.map((c: Candle) => `${c.datetime.slice(11,16)} ${sl(c.datetime.slice(11,16))} O:${c.open} H:${c.high} L:${c.low} C:${c.close} R:${parseFloat((c.high-c.low).toFixed(2))}`).join("\n")}`;
            if (smt2m.length > 0) ctSmt += `\n\n${smtPair} 2m (01:30-${smtEnd1m} ET, ${smt2m.length} bars — entry-level SMT):\n${smt2m.map((c: Candle) => `${c.datetime.slice(11,16)} ${sl(c.datetime.slice(11,16))} O:${c.open} H:${c.high} L:${c.low} C:${c.close} R:${parseFloat((c.high-c.low).toFixed(2))}`).join("\n")}`;
            if (smt1m.length > 0) ctSmt += `\n\n${smtPair} 1m (01:30-${smtEnd1m} ET, ${smt1m.length} bars — precise SMT candle):\n${smt1m.map((c: Candle) => `${c.datetime.slice(11,16)} ${sl(c.datetime.slice(11,16))} O:${c.open} H:${c.high} L:${c.low} C:${c.close} R:${parseFloat((c.high-c.low).toFixed(2))}`).join("\n")}`;
          }
        }

        // ── Build session note for user message ─────────────────────────────
        const sessionNote = isStdvOrWick && !isPoliker
          ? "IMPORTANT: Entry times MUST be between 02:00 and 05:00 ET. [Asia] bars (00:00-02:00) = accumulation context only. [NY] bars (07:00+) = context only — NO STDV entries there."
          : isPoliker
          ? "IMPORTANT (Poliker): [Asia-Eve]+[Asia] = Accumulation. [London] 02:00-09:30 ET = Manipulation + ENTRY WINDOW. Entries ONLY 02:00-09:30 ET where all 4 checks pass."
          : isIcc
          ? "IMPORTANT (ICC): Valid entries in [London] (02:00-12:00 ET) and [NY] (09:30-16:15 ET) only. [Asia] = context. NO Friday entries. NO Monday entries before 10:00 ET."
          : "Note: Entries during [London] (02:00-07:00 ET) or [NY] (07:00-16:15 ET).";

        const userMsg = `${symbol} — ${day} (${barInterval === "5m" ? "5-minute" : "1-hour"} bars, 00:00-16:15 ET)\n\n${prevDayRef}${sessionNote}${prevEveningText ? "\n" + prevEveningText : ""}\n\n--- MAIN BARS (${candlesForAI.length} candles) ---\n${candleText}${ct15m}${ct2m}${ct3m}${ct1m}${ctSmt}\n\nIdentify setups following the strategy rules. JSON only.`;

        // ── Call Claude AI ──────────────────────────────────────────────────
        let setups: SetupCandidate[] = [];
        try {
          const msg = await anthropic.messages.create({
            model: "claude-sonnet-4-5",
            max_tokens: 4096,
            system: SETUP_SYSTEM,
            messages: [{ role: "user", content: userMsg }],
          });
          const raw = msg.content.map((b: any) => b.type === "text" ? b.text : "").join("");
          const jm = raw.match(/\{[\s\S]*\}/);
          if (jm) {
            try {
              const p = JSON.parse(jm[0]) as { setups?: SetupCandidate[] };
              setups = (Array.isArray(p.setups) ? p.setups : []).map((s: SetupCandidate) => ({ ...s, grade: sanitizeGrade(s.grade) }));
            } catch {}
          }

          // ── Server-side strategy type validation ──────────────────────────
          if (strategyId && strategyName !== "ICT / General") {
            const nl = strategyName.toLowerCase();
            setups = setups.filter((s: SetupCandidate) => {
              const tl = (s.setupType ?? "").toLowerCase();
              if (nl.includes("stdv") && !nl.includes("poliker")) return tl.includes("stdv") || tl.includes("po3");
              if (nl.includes("poliker")) return tl.includes("poliker");
              if (nl.includes("wick")) return tl.includes("wick");
              if (nl.includes("icc")) return tl.includes("icc");
              return true;
            });
          }

          // ── STDV (non-Poliker): enforce 02:00-05:00 ET + 75pt TP minimum ──
          if (isStdvOrWick && !isPoliker) {
            setups = setups.filter((s: SetupCandidate) => {
              const t = (s.entryTime ?? "").slice(11, 16);
              if (t < "02:00" || t >= "05:00") return false;
              const tpDist = Math.abs((s.takeProfit ?? 0) - (s.entryPrice ?? 0));
              if (tpDist < 50) return false;
              if (tpDist < Math.abs((s.stopLoss ?? 0) - (s.entryPrice ?? 0))) return false;
              return true;
            });
          }

          // ── Poliker: enforce 02:00-09:30 ET ────────────────────────────────
          if (isPoliker) {
            setups = setups.filter((s: SetupCandidate) => {
              const t = (s.entryTime ?? "").slice(11, 16);
              return t >= "02:00" && t < "09:30";
            });
          }

          // ── ICC: enforce session windows + Friday/Monday ────────────────────
          if (isIcc) {
            const date = new Date(day + "T12:00:00Z");
            const dow = date.getUTCDay();
            const isMonday = dow === 1;
            setups = setups.filter((s: SetupCandidate) => {
              const t = (s.entryTime ?? "").slice(11, 16);
              if (isMonday && t < "10:00") return false;
              if (t < "02:00" || t >= "16:15") return false;
              return true;
            });
          }

          // Sort by entry time, cap at 2
          setups.sort((a: SetupCandidate, b: SetupCandidate) => (a.entryTime ?? "").localeCompare(b.entryTime ?? ""));
          setups = setups.slice(0, 2);

        } catch (aiErr) {
          console.warn(`AI failed for ${day}:`, aiErr);
          continue;
        }

        // ── Apply risk settings + trade management rules ─────────────────────
        const applyRisk = (t: SimulatedTrade, mult = 1): SimulatedTrade => {
          if (!riskSettings) return t;
          const rd = (riskSettings[t.grade] ?? riskSettings["C"] ?? 150) * mult;
          return { ...t, pnlDollars: parseFloat((t.outcome === "win" ? rd * t.rr : -rd).toFixed(2)) };
        };

        const chartWindow = dayCandlesFull.filter((c: Candle) => c.datetime.slice(11,16) >= "01:00" && c.datetime.slice(11,16) <= "09:00");
        const smtChartCandles = smtPair ? smtCandles5m.filter((c: Candle) => c.datetime.startsWith(day) && c.datetime.slice(11,16) >= "01:00" && c.datetime.slice(11,16) <= "09:00").map(toCompact) : [];

        const [s1, s2] = setups;
        if (s1) {
          const t1raw = simulateSetup(s1, symbol, allCandles);
          if (t1raw) {
            t1raw.chartCandles = chartWindow.map(toCompact);
            t1raw.smtChartCandles = smtChartCandles;
            const t1 = applyRisk(t1raw, 1);
            simulatedTrades.push(t1);
            send({ type: "setupFound", day, direction: t1.direction, setupType: t1.setupType, outcome: t1.outcome, pnl: t1.pnlDollars, grade: t1.grade, progress });

            // Rule: if first loses + second is B+ or above → take at 50% risk
            if (t1.outcome === "loss" && s2 && HIGH_CONVICTION.has(sanitizeGrade(s2.grade))) {
              const t2raw = simulateSetup(s2, symbol, allCandles);
              if (t2raw) {
                t2raw.chartCandles = chartWindow.map(toCompact);
                t2raw.smtChartCandles = smtChartCandles;
                const t2 = applyRisk(t2raw, 0.5);
                simulatedTrades.push(t2);
                send({ type: "setupFound", day, direction: t2.direction, setupType: t2.setupType, outcome: t2.outcome, pnl: t2.pnlDollars, grade: t2.grade, progress });
              }
            }
          }
        }
      }

      // ── Phase 5: Save results ───────────────────────────────────────────────
      send({ type: "phase", message: `Scan complete — ${simulatedTrades.length} setups found. Saving...`, progress: 88 });
      const stats = computeStats(simulatedTrades, initialCapital);
      const strategyRow = strategyId ? db.prepare("SELECT * FROM strategies WHERE id = ?").get(strategyId) as any : null;
      const ins = db.prepare(`INSERT INTO backtests (strategy_id, strategy_name, symbol, from_date, to_date, initial_capital, net_pnl, total_trades, winning_trades, losing_trades, win_rate, avg_rr, profit_factor, max_drawdown, equity_curve, trade_log) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        strategyId ?? 0, strategyRow?.name ?? strategyName, symbol, fromDate, toDate, initialCapital,
        stats.net_pnl, stats.total_trades, stats.winning_trades, stats.losing_trades,
        stats.win_rate, stats.avg_rr, stats.profit_factor, stats.max_drawdown,
        JSON.stringify(stats.equityCurve), JSON.stringify(stats.tradeLog)
      );
      const backtest = db.prepare("SELECT * FROM backtests WHERE id = ?").get(ins.lastInsertRowid) as any;
      send({ type: "complete", backtest: { ...backtest, net_pnl: Number(backtest.net_pnl ?? 0), win_rate: Number(backtest.win_rate ?? 0), avg_rr: Number(backtest.avg_rr ?? 0), profit_factor: Number(backtest.profit_factor ?? 0), max_drawdown: Number(backtest.max_drawdown ?? 0), equity_curve: stats.equityCurve, trade_log: stats.tradeLog } });

    } catch (err) {
      console.error("Auto-run error:", err);
      send({ type: "error", message: err instanceof Error ? err.message : "Unknown error" });
    }
  })();
});

router.post("/backtests/chat", async (req, res) => {
  try {
    const { messages, summary, tradeLog } = req.body;
    res.setHeader("Content-Type", "text/event-stream"); res.setHeader("Cache-Control", "no-cache"); res.setHeader("Connection", "keep-alive"); res.flushHeaders();
    const hb = setInterval(() => res.write(": heartbeat\n\n"), 20000); res.on("close", () => clearInterval(hb));
    const pnl = Number(summary?.net_pnl ?? 0);
    const wr = summary?.win_rate != null ? (Number(summary.win_rate) * 100).toFixed(1) : "--";
    const tradeLines: string[] = [];
    for (const [date, trades] of Object.entries(tradeLog ?? {})) {
      for (const t of trades as any[]) tradeLines.push(`  [${date}] ${t.symbol ?? ""} ${(t.direction ?? "").toUpperCase()} | Grade: ${t.grade ?? "?"} | P&L: ${(t.pnl ?? 0) >= 0 ? "+" : ""}$${Math.abs(t.pnl ?? 0).toFixed(2)}${t.setupType ? ` | ${t.setupType}` : ""}${t.gradeReason ? `\n    AI Note: ${t.gradeReason}` : ""}`);
    }
    const systemPrompt = `You are Six Eyes AI — a professional futures trading performance coach.\n\nBACKTEST: ${summary?.symbol ?? "--"} | ${summary?.from_date ?? "--"} → ${summary?.to_date ?? "--"} | Strategy: ${summary?.strategy_name ?? "General ICT"}\nNet P&L: ${pnl >= 0 ? "+" : ""}$${Math.abs(pnl).toFixed(2)} | Win Rate: ${wr}% | Trades: ${Number(summary?.total_trades ?? 0)} (${Number(summary?.winning_trades ?? 0)}W / ${Number(summary?.losing_trades ?? 0)}L)\n\nTRADE LOG:\n${tradeLines.join("\n") || "No trades."}\n\nGive honest, direct feedback. Reference specific trades by date. Identify grade/pattern trends. Target benchmarks: min 2R avg, min 55% win rate.`;
    const stream = anthropic.messages.stream({ model: "claude-sonnet-4-5", max_tokens: 1024, system: systemPrompt, messages: messages.map((m: any) => ({ role: m.role, content: m.content })) });
    stream.on("text", (t: string) => res.write(`data: ${JSON.stringify({ content: t })}\n\n`));
    stream.on("finalMessage", () => { res.write(`data: ${JSON.stringify({ done: true })}\n\n`); res.end(); });
    stream.on("error", (e: Error) => { res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`); res.end(); });
  } catch (err: any) { res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`); res.end(); }
});

export default router;
