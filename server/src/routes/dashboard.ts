import { Router } from "express";
import db from "../db.js";

const router = Router();

router.get("/dashboard/stats", (req, res) => {
  const period = (req.query.period as string) ?? "month";
  const now = new Date();
  let fromDate: string;
  if (period === "week") {
    const d = new Date(now); d.setDate(d.getDate() - 7);
    fromDate = d.toISOString().split("T")[0];
  } else if (period === "year") {
    fromDate = `${now.getFullYear()}-01-01`;
  } else {
    fromDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  }

  const trades = db.prepare("SELECT * FROM trades WHERE trade_date >= ?").all(fromDate) as any[];
  const closed = trades.filter(t => t.pnl_dollars != null);
  const wins = closed.filter(t => t.pnl_dollars > 0);
  const losses = closed.filter(t => t.pnl_dollars <= 0);
  const netPnl = closed.reduce((s, t) => s + t.pnl_dollars, 0);
  const winRate = closed.length > 0 ? wins.length / closed.length : 0;

  const rrValues = trades.filter(t => t.entry_price && t.stop_loss && t.take_profit).map(t => {
    const risk = Math.abs(t.entry_price - t.stop_loss);
    const reward = Math.abs(t.take_profit - t.entry_price);
    return risk > 0 ? reward / risk : 0;
  });
  const avgRR = rrValues.length > 0 ? rrValues.reduce((a, b) => a + b, 0) / rrValues.length : 0;

  const gradeCounts: Record<string, number> = {};
  for (const t of trades) { if (t.grade) gradeCounts[t.grade] = (gradeCounts[t.grade] ?? 0) + 1; }
  const topGrade = Object.keys(gradeCounts).length > 0 ? Object.entries(gradeCounts).sort((a, b) => b[1] - a[1])[0][0] : null;

  res.json({ netPnl, winRate, avgRR, totalTrades: trades.length, winningTrades: wins.length, losingTrades: losses.length, topGrade, period });
});

router.get("/dashboard/pnl-calendar", (req, res) => {
  const now = new Date();
  const month = req.query.month ? Number(req.query.month) : now.getMonth() + 1;
  const year = req.query.year ? Number(req.query.year) : now.getFullYear();
  const fromDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const toDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const trades = db.prepare("SELECT * FROM trades WHERE trade_date >= ? AND trade_date <= ?").all(fromDate, toDate) as any[];
  const byDate: Record<string, any> = {};
  for (const t of trades) {
    if (!byDate[t.trade_date]) byDate[t.trade_date] = { date: t.trade_date, pnl: 0, trades: 0, wins: 0, losses: 0, breakdown: [] };
    const pnl = t.pnl_dollars ?? 0;
    byDate[t.trade_date].pnl += pnl;
    byDate[t.trade_date].trades++;
    if (pnl > 0) byDate[t.trade_date].wins++;
    else if (pnl < 0) byDate[t.trade_date].losses++;
    byDate[t.trade_date].breakdown.push({ id: t.id, direction: t.direction, pnl, grade: t.grade, entryTime: t.entry_time, entryTimeframe: t.entry_timeframe, setupType: t.setup_type, symbol: t.symbol });
  }
  res.json(Object.values(byDate));
});

export default router;
