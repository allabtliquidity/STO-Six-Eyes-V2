import { Router } from "express";
import db from "../db.js";

const router = Router();

router.get("/trades", (req, res) => {
  const { symbol, direction, grade, from, to } = req.query as Record<string, string>;
  let query = "SELECT * FROM trades WHERE 1=1";
  const params: any[] = [];
  if (symbol) { query += " AND symbol = ?"; params.push(symbol); }
  if (direction) { query += " AND direction = ?"; params.push(direction); }
  if (grade) { query += " AND grade = ?"; params.push(grade); }
  if (from) { query += " AND trade_date >= ?"; params.push(from); }
  if (to) { query += " AND trade_date <= ?"; params.push(to); }
  query += " ORDER BY trade_date DESC";
  const trades = db.prepare(query).all(...params);
  res.json(trades);
});

router.post("/trades", (req, res) => {
  const t = req.body;
  const result = db.prepare(`
    INSERT INTO trades (symbol, direction, entry_price, exit_price, stop_loss, take_profit,
    contracts, pnl, pnl_dollars, grade, grade_reason, strategy_id, trade_date, entry_time,
    exit_time, session, po3_phase, setup_type, entry_timeframe, notes, tags)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    t.symbol, t.direction, t.entry_price ?? t.entryPrice,
    t.exit_price ?? t.exitPrice ?? null,
    t.stop_loss ?? t.stopLoss ?? null,
    t.take_profit ?? t.takeProfit ?? null,
    t.contracts ?? 1,
    t.pnl ?? null, t.pnl_dollars ?? t.pnlDollars ?? null,
    t.grade ?? null, t.grade_reason ?? t.gradeReason ?? null,
    t.strategy_id ?? t.strategyId ?? null,
    t.trade_date ?? t.tradeDate,
    t.entry_time ?? t.entryTime ?? null,
    t.exit_time ?? t.exitTime ?? null,
    t.session ?? null, t.po3_phase ?? t.po3Phase ?? null,
    t.setup_type ?? t.setupType ?? null,
    t.entry_timeframe ?? t.entryTimeframe ?? null,
    t.notes ?? null, t.tags ?? null
  );
  const trade = db.prepare("SELECT * FROM trades WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(trade);
});

router.get("/trades/:id", (req, res) => {
  const trade = db.prepare("SELECT * FROM trades WHERE id = ?").get(req.params.id);
  if (!trade) return res.status(404).json({ error: "Not found" });
  res.json(trade);
});

router.patch("/trades/:id", (req, res) => {
  const t = req.body;
  const fields = Object.keys(t).map(k => `${k} = ?`).join(", ");
  const values = Object.values(t);
  db.prepare(`UPDATE trades SET ${fields}, updated_at = datetime('now') WHERE id = ?`).run(...values, req.params.id);
  const trade = db.prepare("SELECT * FROM trades WHERE id = ?").get(req.params.id);
  res.json(trade);
});

router.delete("/trades/:id", (req, res) => {
  db.prepare("DELETE FROM trades WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

router.post("/trades/:id/grade", (req, res) => {
  const trade = db.prepare("SELECT * FROM trades WHERE id = ?").get(req.params.id) as any;
  if (!trade) return res.status(404).json({ error: "Not found" });

  const breakdown = {
    po3Valid: !!trade.po3_phase,
    biasAligned: trade.session === "NY AM" || trade.session === "London",
    entryTriggerValid: !!trade.entry_price && !!trade.stop_loss,
    sessionCorrect: trade.session === "NY AM",
    riskRewardValid: false as boolean,
  };

  if (trade.entry_price && trade.stop_loss && trade.take_profit) {
    const risk = Math.abs(trade.entry_price - trade.stop_loss);
    const reward = Math.abs(trade.take_profit - trade.entry_price);
    breakdown.riskRewardValid = risk > 0 && reward / risk >= 2;
  }

  const passed = Object.values(breakdown).filter(Boolean).length;
  const score = (passed / Object.keys(breakdown).length) * 100;
  let grade = "D";
  if (score >= 90) grade = "A";
  else if (score >= 70) grade = "B";
  else if (score >= 50) grade = "C";

  const feedback = [
    !breakdown.po3Valid && "No PO3 phase tagged.",
    !breakdown.biasAligned && "Session not aligned — trade during London or NY AM only.",
    !breakdown.entryTriggerValid && "Missing entry or stop loss.",
    !breakdown.riskRewardValid && "R:R below 2:1.",
  ].filter(Boolean).join(" ") || "Strong execution — all criteria met.";

  db.prepare("UPDATE trades SET grade = ?, grade_reason = ? WHERE id = ?").run(grade, feedback, req.params.id);
  res.json({ grade, score, breakdown, feedback });
});

export default router;
