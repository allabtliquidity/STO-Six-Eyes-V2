import { Router } from "express";
import db from "../db.js";

const router = Router();

router.get("/knowledge", (req, res) => {
  const { strategy_id } = req.query;
  if (strategy_id) {
    res.json(db.prepare("SELECT * FROM knowledge_sections WHERE strategy_id = ? ORDER BY section_number").all(strategy_id));
  } else {
    res.json(db.prepare("SELECT * FROM knowledge_sections ORDER BY section_number").all());
  }
});

router.post("/knowledge", (req, res) => {
  const { strategyId, strategy_id, sectionNumber, section_number, sectionName, section_name, content, rules } = req.body;
  const result = db.prepare("INSERT INTO knowledge_sections (strategy_id, section_number, section_name, content, rules) VALUES (?,?,?,?,?)")
    .run(strategyId ?? strategy_id, sectionNumber ?? section_number, sectionName ?? section_name, content, rules ?? null);
  res.status(201).json(db.prepare("SELECT * FROM knowledge_sections WHERE id = ?").get(result.lastInsertRowid));
});

router.patch("/knowledge/:id", (req, res) => {
  const { sectionName, section_name, content, rules } = req.body;
  db.prepare("UPDATE knowledge_sections SET section_name = COALESCE(?,section_name), content = COALESCE(?,content), rules = COALESCE(?,rules), updated_at = datetime('now') WHERE id = ?")
    .run(sectionName ?? section_name ?? null, content ?? null, rules ?? null, req.params.id);
  res.json(db.prepare("SELECT * FROM knowledge_sections WHERE id = ?").get(req.params.id));
});

router.delete("/knowledge/:id", (req, res) => {
  db.prepare("DELETE FROM knowledge_sections WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

export default router;
