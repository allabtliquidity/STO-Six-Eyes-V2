import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import db from "../db.js";

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildStrategyContext(strategyId: number): string {
  const sections = db.prepare("SELECT * FROM knowledge_sections WHERE strategy_id = ? ORDER BY section_number").all(strategyId) as any[];
  if (!sections.length) return "No strategy knowledge available yet.";
  return sections.map(s => `=== S${s.section_number}: ${s.section_name} ===\n${s.content}\n\nRULES:\n${s.rules ?? "N/A"}`).join("\n\n");
}

const ANALYZER_SYSTEM = (ctx: string) => `You are Six Eyes AI — a professional futures trading analyst.

Analyze chart screenshots and give structured feedback on whether a setup is valid per the strategy rules below.

STRATEGY KNOWLEDGE BASE:
${ctx}

GRADING SCALE:
A++ — 5m + 3m + 2m all confirm. Textbook. SL ≤ 20 pts.
A+  — 5m + 3m confirm. SL ≤ 25 pts.
A   — 5m confirms. SL ≤ 30 pts.
B+  — 5m confirms. 3m ambiguous. SL ≤ 40 pts.
B   — Partial confirmation. SL ≤ 50 pts.
C   — Marginal setup.
D   — Weak or forced.
F   — Invalid. Rule violation.

Evaluate: timeframes shown, PO3 phase, bias/DOL, STDV alignment, FIB/OTE, 3m structure, 2m entry, verdict with grade.`;

const FINDER_SYSTEM = (ctx: string) => `You are Six Eyes AI — a professional futures trading setup finder for NQ, ES, GC, and SI.

STRATEGY KNOWLEDGE BASE:
${ctx}

Drive the conversation. Request charts systematically:
1. Ask for instrument, session, date/time. Request daily or 1hr chart.
2. Request 5m chart for PO3, DOL, STDV structure.
3. Request 3m to confirm BOS/CHOCH.
4. Request 2m for precision entry trigger and SL.
5. Give final verdict: SETUP FOUND or NO SETUP with specific conditions needed.`;

router.post("/setup/analyze", async (req, res) => {
  try {
    const { images, strategyId, messages } = req.body;
    const ctx = buildStrategyContext(strategyId ?? 1);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const hb = setInterval(() => res.write(": heartbeat\n\n"), 20000);
    res.on("close", () => clearInterval(hb));

    const claudeMessages: Anthropic.MessageParam[] = [];
    if (messages?.length) {
      for (const m of messages) claudeMessages.push({ role: m.role, content: m.content });
    }

    const userContent: Anthropic.ContentBlockParam[] = [];
    if (images?.length) {
      for (const img of images) {
        const base64 = img.replace(/^data:image\/\w+;base64,/, "");
        const mediaType = img.startsWith("data:image/png") ? "image/png" : img.startsWith("data:image/webp") ? "image/webp" : "image/jpeg";
        userContent.push({ type: "image", source: { type: "base64", media_type: mediaType, data: base64 } });
      }
    }
    userContent.push({ type: "text", text: "Analyze these charts against the strategy rules." });
    claudeMessages.push({ role: "user", content: userContent });

    const stream = anthropic.messages.stream({ model: "claude-sonnet-4-5", max_tokens: 8192, system: ANALYZER_SYSTEM(ctx), messages: claudeMessages });
    stream.on("text", t => res.write(`data: ${JSON.stringify({ content: t })}\n\n`));
    stream.on("finalMessage", () => { res.write(`data: ${JSON.stringify({ done: true })}\n\n`); res.end(); });
    stream.on("error", e => { res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`); res.end(); });
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

router.post("/setup/finder", async (req, res) => {
  try {
    const { messages, strategyId } = req.body;
    const ctx = buildStrategyContext(strategyId ?? 1);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const hb = setInterval(() => res.write(": heartbeat\n\n"), 20000);
    res.on("close", () => clearInterval(hb));

    const claudeMessages: Anthropic.MessageParam[] = [];
    for (const m of messages) {
      if (m.images?.length) {
        const content: Anthropic.ContentBlockParam[] = [];
        for (const img of m.images) {
          const base64 = img.replace(/^data:image\/\w+;base64,/, "");
          const mediaType = img.startsWith("data:image/png") ? "image/png" : "image/jpeg";
          content.push({ type: "image", source: { type: "base64", media_type: mediaType, data: base64 } });
        }
        if (m.content) content.push({ type: "text", text: m.content });
        claudeMessages.push({ role: m.role, content });
      } else {
        claudeMessages.push({ role: m.role, content: m.content });
      }
    }

    const stream = anthropic.messages.stream({ model: "claude-sonnet-4-5", max_tokens: 8192, system: FINDER_SYSTEM(ctx), messages: claudeMessages });
    stream.on("text", t => res.write(`data: ${JSON.stringify({ content: t })}\n\n`));
    stream.on("finalMessage", () => { res.write(`data: ${JSON.stringify({ done: true })}\n\n`); res.end(); });
    stream.on("error", e => { res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`); res.end(); });
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

export default router;
