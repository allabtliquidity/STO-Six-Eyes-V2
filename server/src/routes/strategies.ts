import { Router } from "express";
import db from "../db.js";

const router = Router();

router.get("/strategies", (_req, res) => {
  res.json(db.prepare("SELECT * FROM strategies ORDER BY created_at").all());
});

router.post("/strategies", (req, res) => {
  const { name, description, is_active, isActive } = req.body;
  const result = db.prepare("INSERT INTO strategies (name, description, is_active) VALUES (?,?,?)").run(name, description ?? null, is_active ?? isActive ?? 0);
  res.status(201).json(db.prepare("SELECT * FROM strategies WHERE id = ?").get(result.lastInsertRowid));
});

router.patch("/strategies/:id", (req, res) => {
  const { name, description, is_active, isActive } = req.body;
  db.prepare("UPDATE strategies SET name = COALESCE(?,name), description = COALESCE(?,description), is_active = COALESCE(?,is_active), updated_at = datetime('now') WHERE id = ?")
    .run(name ?? null, description ?? null, is_active ?? isActive ?? null, req.params.id);
  res.json(db.prepare("SELECT * FROM strategies WHERE id = ?").get(req.params.id));
});

router.delete("/strategies/:id", (req, res) => {
  db.prepare("DELETE FROM strategies WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

router.post("/strategies/:id/activate", (req, res) => {
  db.prepare("UPDATE strategies SET is_active = 0").run();
  db.prepare("UPDATE strategies SET is_active = 1 WHERE id = ?").run(req.params.id);
  res.json(db.prepare("SELECT * FROM strategies WHERE id = ?").get(req.params.id));
});

router.get("/strategies/:id/stats", (req, res) => {
  const trades = db.prepare("SELECT * FROM trades WHERE strategy_id = ?").all(req.params.id) as any[];
  const closed = trades.filter(t => t.pnl_dollars != null);
  const wins = closed.filter(t => t.pnl_dollars > 0);
  const losses = closed.filter(t => t.pnl_dollars <= 0);
  const netPnl = closed.reduce((s, t) => s + t.pnl_dollars, 0);
  const winRate = closed.length > 0 ? wins.length / closed.length : 0;
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl_dollars, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl_dollars, 0) / losses.length) : 0;
  const profitFactor = avgLoss > 0 ? (avgWin * wins.length) / (avgLoss * losses.length) : 0;
  const gradeBreakdown: Record<string, number> = { "A++": 0, "A+": 0, A: 0, "B+": 0, B: 0, C: 0, D: 0, F: 0 };
  for (const t of trades) { if (t.grade && gradeBreakdown[t.grade] !== undefined) gradeBreakdown[t.grade]++; }
  res.json({ winRate, netPnl, totalTrades: trades.length, winningTrades: wins.length, losingTrades: losses.length, avgWin, avgLoss, profitFactor, gradeBreakdown });
});

export default router;
