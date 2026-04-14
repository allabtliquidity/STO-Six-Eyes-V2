import { Router } from "express";

const router = Router();

const ALIAS_MAP: Record<string, string> = {
  NQ: "NQ=F", ES: "ES=F", GC: "GC=F", SI: "SI=F",
  YM: "YM=F", RTY: "RTY=F", CL: "CL=F",
  EURUSD: "EURUSD=X", GBPUSD: "GBPUSD=X", USDJPY: "JPY=X",
  BTC: "BTC-USD", ETH: "ETH-USD",
};

async function fetchQuote(symbol: string) {
  const yahoo = ALIAS_MAP[symbol.toUpperCase()] ?? symbol;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo)}?interval=1d&range=2d`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Yahoo error: ${res.status}`);
  const data: any = await res.json();
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta) throw new Error("No meta");
  const price = meta.regularMarketPrice ?? 0;
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price;
  return {
    symbol, price, change: price - prevClose,
    changePct: prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0,
    high: meta.regularMarketDayHigh ?? price,
    low: meta.regularMarketDayLow ?? price,
    prevClose, updatedAt: new Date().toISOString(),
  };
}

router.get("/market/prices", async (req, res) => {
  const syms = typeof req.query.symbols === "string"
    ? req.query.symbols.split(",").map(s => s.trim())
    : ["NQ", "ES", "GC", "SI"];

  const results = await Promise.allSettled(syms.map(fetchQuote));
  const prices = results.map((r, i) =>
    r.status === "fulfilled" ? r.value : { symbol: syms[i], price: 0, change: 0, changePct: 0, high: 0, low: 0, prevClose: 0, updatedAt: new Date().toISOString() }
  );
  res.json(prices);
});

export default router;
