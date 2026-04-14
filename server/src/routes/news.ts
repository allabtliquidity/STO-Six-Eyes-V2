import { Router } from "express";

const router = Router();

router.get("/news", async (req, res) => {
  try {
    const response = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json", {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    if (!response.ok) throw new Error("Calendar fetch failed");
    const data: any[] = await response.json();
    let events = data.map(e => ({
      id: `${e.date}-${e.title}-${e.country}`.replace(/\s+/g, "-").toLowerCase(),
      title: e.title ?? "Unknown",
      currency: e.country ?? "USD",
      impact: e.impact?.toLowerCase().includes("high") ? "high" : e.impact?.toLowerCase().includes("medium") ? "medium" : "low",
      date: e.date ?? new Date().toISOString().split("T")[0],
      time: e.time ?? null,
      forecast: e.forecast ?? null,
      previous: e.previous ?? null,
      actual: e.actual ?? null,
    }));

    const { impact, from, to } = req.query as Record<string, string>;
    if (impact) events = events.filter(e => e.impact === impact);
    if (from) events = events.filter(e => e.date >= from);
    if (to) events = events.filter(e => e.date <= to);

    res.json(events);
  } catch {
    res.json([]);
  }
});

export default router;
