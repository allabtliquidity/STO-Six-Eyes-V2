import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDashboardStats, getMarketPrices, getTrades, getNews } from "../api";

export default function Dashboard() {
  const [period, setPeriod] = useState("month");
  const { data: stats } = useQuery({ queryKey: ["dashboard-stats", period], queryFn: () => getDashboardStats(period), refetchInterval: 60000 });
  const { data: prices = [] } = useQuery({ queryKey: ["prices"], queryFn: () => getMarketPrices("NQ,ES,GC,SI"), refetchInterval: 30000 });
  const { data: trades = [] } = useQuery({ queryKey: ["trades-recent"], queryFn: () => getTrades(), select: d => d.slice(0, 10) });
  const { data: news = [] } = useQuery({ queryKey: ["news-high"], queryFn: () => getNews({ impact: "high" }), select: d => d.slice(0, 6) });

  const pnl = stats?.netPnl ?? 0;
  const wr = stats?.winRate ?? 0;
  const rr = stats?.avgRR ?? 0;

  return (
    <div style={{ padding: 20 }}>
      {/* Period selector */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 4, background: "rgba(17,19,24,0.65)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 6, padding: 3 }}>
          {["week","month","year"].map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              padding: "3px 12px", fontSize: 11, borderRadius: 4, border: "none", cursor: "pointer",
              background: period === p ? "#a855f7" : "transparent",
              color: period === p ? "#fff" : "#b0b8cc",
              fontFamily: "monospace", textTransform: "capitalize",
            }}>{p}</button>
          ))}
        </div>
      </div>

      {/* Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
        {[
          { label: "Net P&L", value: `${pnl >= 0 ? "+" : ""}$${Math.abs(pnl).toFixed(2)}`, color: pnl >= 0 ? "#22c55e" : "#ef4444", sub: `${stats?.totalTrades ?? 0} trades` },
          { label: "Win Rate", value: `${(wr * 100).toFixed(1)}%`, color: "#3b82f6", sub: `${stats?.winningTrades ?? 0}W / ${stats?.losingTrades ?? 0}L` },
          { label: "Avg R:R", value: `${rr.toFixed(2)}R`, color: "#f0f2f8", sub: "Risk / Reward ratio" },
          { label: "Top Grade", value: stats?.topGrade ?? "—", color: "#a855f7", sub: "Most frequent grade" },
        ].map(m => (
          <div key={m.label} className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 10, color: "#b0b8cc", fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>{m.label}</div>
            <div style={{ fontSize: 26, fontWeight: 300, color: m.color, lineHeight: 1 }}>{m.value}</div>
            <div style={{ fontSize: 11, color: "#b0b8cc", marginTop: 6, fontFamily: "monospace" }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Live Prices */}
      <div className="card" style={{ marginBottom: 16, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 10, color: "#b0b8cc", fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase" }}>Live Prices</span>
          <span style={{ fontSize: 9, color: "#22c55e", fontFamily: "monospace", display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />LIVE
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap" }}>
          {prices.map((p: any) => (
            <div key={p.symbol} style={{ flex: "1 1 150px", padding: "16px 18px", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#b0b8cc", fontFamily: "monospace", marginBottom: 8 }}>{p.symbol}</div>
              <div style={{ fontSize: 22, fontWeight: 300, color: "#f0f2f8", lineHeight: 1, marginBottom: 5 }}>{p.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div style={{ fontSize: 11, color: (p.change ?? 0) >= 0 ? "#22c55e" : "#ef4444" }}>
                {(p.change ?? 0) >= 0 ? "+" : ""}{(p.change ?? 0).toFixed(2)} ({(p.changePct ?? 0).toFixed(2)}%)
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Trades + News */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Recent Trades */}
        <div className="card">
          <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <span style={{ fontSize: 10, color: "#b0b8cc", fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase" }}>Recent Trades</span>
          </div>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", fontFamily: "monospace" }}>
            <thead>
              <tr>
                {["DATE","SYM","DIR","PNL","GRADE"].map(h => (
                  <th key={h} style={{ textAlign: "left", fontSize: 10, color: "#b0b8cc", padding: "9px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)", letterSpacing: "0.06em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trades.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: "20px 10px", textAlign: "center", color: "#707888", fontSize: 12 }}>No trades yet</td></tr>
              ) : trades.map((t: any) => (
                <tr key={t.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <td style={{ padding: "10px 10px", color: "#b0b8cc" }}>{t.trade_date}</td>
                  <td style={{ padding: "10px 10px" }}>{t.symbol}</td>
                  <td style={{ padding: "10px 10px" }}><span className={t.direction === "long" ? "tag-long" : "tag-short"}>{t.direction}</span></td>
                  <td style={{ padding: "10px 10px", color: (t.pnl_dollars ?? 0) >= 0 ? "#22c55e" : "#ef4444" }}>
                    {t.pnl_dollars != null ? `${t.pnl_dollars >= 0 ? "+" : ""}$${Math.abs(t.pnl_dollars).toFixed(2)}` : "—"}
                  </td>
                  <td style={{ padding: "10px 10px", color: "#a855f7" }}>{t.grade ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* High Impact News */}
        <div className="card">
          <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <span style={{ fontSize: 10, color: "#b0b8cc", fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase" }}>High Impact Events</span>
          </div>
          {news.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "#707888", fontSize: 12 }}>No events</div>
          ) : news.map((e: any) => (
            <div key={e.id} style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)", display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 6px #ef4444", flexShrink: 0, marginTop: 4, display: "inline-block" }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: "#f0f2f8", marginBottom: 3 }}>{e.title}</div>
                <div style={{ fontSize: 10, color: "#b0b8cc", fontFamily: "monospace" }}>{e.currency} · {e.date} {e.time ?? ""}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
