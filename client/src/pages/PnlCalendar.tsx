import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPnlCalendar } from "../api";

const WEEKDAYS = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function fmt(n: number) {
  const abs = Math.abs(n);
  return `${n < 0 ? "-" : "+"}$${abs >= 1000 ? (abs/1000).toFixed(1)+"k" : abs.toFixed(0)}`;
}

export default function PnlCalendar() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data = [] } = useQuery({ queryKey: ["pnl-calendar", month, year], queryFn: () => getPnlCalendar(month, year) });

  const byDate: Record<string, any> = {};
  for (const d of data) byDate[d.date] = d;

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = new Date(year, month - 1, 1).getDay();
  const today = now.toISOString().split("T")[0];

  const cells: any[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    cells.push({ day: d, dateStr, data: byDate[dateStr] });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: any[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i+7));

  const totalPnl = data.reduce((s: number, d: any) => s + d.pnl, 0);
  const totalTrades = data.reduce((s: number, d: any) => s + d.trades, 0);

  function prevMonth() { if (month === 1) { setMonth(12); setYear(y => y-1); } else setMonth(m => m-1); }
  function nextMonth() { if (month === 12) { setMonth(1); setYear(y => y+1); } else setMonth(m => m+1); }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: "#f0f2f8" }}>PNL Calendar</h1>
          <p style={{ fontSize: 11, color: "#b0b8cc", marginTop: 2 }}>{MONTHS[month-1]} {year}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={prevMonth}>← {MONTHS[(month-2+12)%12].slice(0,3)}</button>
          <button className="btn btn-ghost" onClick={nextMonth}>{MONTHS[month%12].slice(0,3)} →</button>
        </div>
      </div>

      <div className="card" style={{ overflow: "hidden", marginBottom: 16 }}>
        {/* Day headers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {WEEKDAYS.map(w => (
            <div key={w} style={{ padding: "8px 4px", textAlign: "center", fontSize: 10, color: "#707888", fontFamily: "monospace", fontWeight: 700 }}>{w}</div>
          ))}
        </div>

        {/* Weeks */}
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
            {week.map((cell, ci) => {
              if (!cell) return <div key={ci} style={{ minHeight: 80, borderRight: "1px solid rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.04)" }} />;
              const pnl = cell.data?.pnl;
              const isToday = cell.dateStr === today;
              const isWin = pnl != null && pnl > 0;
              const isLoss = pnl != null && pnl < 0;
              return (
                <div key={ci} style={{
                  minHeight: 80, padding: "8px 6px",
                  borderRight: "1px solid rgba(255,255,255,0.04)",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  background: isWin ? "rgba(34,197,94,0.08)" : isLoss ? "rgba(239,68,68,0.08)" : "transparent",
                  outline: isToday ? "1px solid #a855f7" : "none",
                  outlineOffset: -1,
                }}>
                  <div style={{ fontSize: 10, color: "#b0b8cc", marginBottom: 4 }}>{cell.day}</div>
                  {pnl != null && (
                    <div style={{ fontSize: 11, fontWeight: 600, color: isWin ? "#22c55e" : "#ef4444" }}>{fmt(pnl)}</div>
                  )}
                  {cell.data?.trades > 0 && (
                    <div style={{ fontSize: 9, color: "#707888", fontFamily: "monospace", marginTop: 2 }}>{cell.data.trades}t</div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {/* Footer */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 13, fontWeight: 300, color: "#f0f2f8" }}>
            Total: <span style={{ fontWeight: 700, color: totalPnl >= 0 ? "#22c55e" : "#ef4444" }}>{fmt(totalPnl)}</span>
          </div>
          <div style={{ fontSize: 11, color: "#b0b8cc", fontFamily: "monospace" }}>{totalTrades} trades</div>
        </div>
      </div>
    </div>
  );
}
