import { Router } from "express";
import db from "../db.js";

const router = Router();

router.get("/discretion", (req, res) => {
  const { symbol, strategyId } = req.query;
  let query = "SELECT * FROM ai_observations WHERE 1=1";
  const params: any[] = [];
  if (symbol) { query += " AND symbol = ?"; params.push(symbol); }
  if (strategyId) { query += " AND strategy_id = ?"; params.push(strategyId); }
  query += " ORDER BY created_at DESC";
  res.json(db.prepare(query).all(...params));
});

router.post("/discretion", (req, res) => {
  const { symbol, strategyId, strategy_id, category, content, confidence, sampleSize, sample_size, source } = req.body;
  if (!content || !category) return res.status(400).json({ error: "content and category required" });
  const result = db.prepare("INSERT INTO ai_observations (symbol, strategy_id, category, content, confidence, sample_size, source) VALUES (?,?,?,?,?,?,?)")
    .run(symbol ?? null, strategyId ?? strategy_id ?? null, category, content.trim(), confidence ?? null, sampleSize ?? sample_size ?? null, source === "auto" ? "auto" : "manual");
  res.status(201).json(db.prepare("SELECT * FROM ai_observations WHERE id = ?").get(result.lastInsertRowid));
});

router.delete("/discretion", (_req, res) => {
  db.prepare("DELETE FROM ai_observations").run();
  res.status(204).end();
});

router.delete("/discretion/:id", (req, res) => {
  db.prepare("DELETE FROM ai_observations WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

export default router;
