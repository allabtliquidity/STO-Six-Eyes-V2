import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getNews } from "../api";

export default function News() {
  const [impact, setImpact] = useState<"all"|"high"|"medium"|"low">("all");
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["news", impact],
    queryFn: () => getNews(impact !== "all" ? { impact } : undefined),
    refetchInterval: 300000,
  });

  const today = new Date().toISOString().split("T")[0];

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: "#f0f2f8" }}>Economic Calendar</h1>
          <p style={{ fontSize: 11, color: "#b0b8cc", marginTop: 2 }}>High-impact events for GC, SI, NQ, ES</p>
        </div>
        <div style={{ display: "flex", gap: 4, background: "rgba(17,19,24,0.65)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 6, padding: 3 }}>
          {(["all","high","medium","low"] as const).map(i => (
            <button key={i} onClick={() => setImpact(i)} style={{ padding: "3px 12px", fontSize: 11, borderRadius: 4, border: "none", cursor: "pointer", background: impact === i ? "#a855f7" : "transparent", color: impact === i ? "#fff" : "#b0b8cc", fontFamily: "monospace", textTransform: "capitalize" }}>{i}</button>
          ))}
        </div>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["Impact","Date","Time","Event","Currency","Forecast","Previous","Actual"].map(h => (
                <th key={h} style={{ textAlign: "left", fontSize: 10, color: "#b0b8cc", padding: "10px 12px", letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: "monospace", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} style={{ padding: 30, textAlign: "center", color: "#707888" }}>Loading...</td></tr>
            ) : events.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 30, textAlign: "center", color: "#707888" }}>No events found</td></tr>
            ) : events.map((e: any) => {
              const isHigh = e.impact === "high";
              const isMed = e.impact === "medium";
              const isToday = e.date === today;
              const beat = e.actual && e.forecast && parseFloat(e.actual) > parseFloat(e.forecast);
              const miss = e.actual && e.forecast && parseFloat(e.actual) < parseFloat(e.forecast);
              return (
                <tr key={e.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", background: isToday ? "rgba(168,85,247,0.04)" : "transparent" }}>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: isHigh ? "#ef4444" : isMed ? "#f59e0b" : "#707888", fontFamily: "monospace", textTransform: "uppercase" }}>
                      {isHigh ? "🔴" : isMed ? "🟡" : "⚪"} {e.impact}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px", color: "#b0b8cc", fontFamily: "monospace", fontSize: 11 }}>{e.date}</td>
                  <td style={{ padding: "10px 12px", color: "#b0b8cc", fontFamily: "monospace", fontSize: 11 }}>{e.time ?? "—"}</td>
                  <td style={{ padding: "10px 12px", color: "#f0f2f8" }}>{e.title}</td>
                  <td style={{ padding: "10px 12px", color: "#b0b8cc", fontFamily: "monospace", fontSize: 11, fontWeight: 600 }}>{e.currency}</td>
                  <td style={{ padding: "10px 12px", color: "#b0b8cc", fontFamily: "monospace", fontSize: 11 }}>{e.forecast ?? "—"}</td>
                  <td style={{ padding: "10px 12px", color: "#b0b8cc", fontFamily: "monospace", fontSize: 11 }}>{e.previous ?? "—"}</td>
                  <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 11, fontWeight: 600, color: beat ? "#22c55e" : miss ? "#ef4444" : "#f0f2f8" }}>{e.actual ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
