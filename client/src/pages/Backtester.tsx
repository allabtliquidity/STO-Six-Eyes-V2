import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const GRADES = [
  { grade: "A++", color: "#06b6d4", desc: "Legendary setup" },
  { grade: "A+",  color: "#22c55e", desc: "Perfect setup" },
  { grade: "A",   color: "#4ade80", desc: "Strong setup" },
  { grade: "B+",  color: "#bef264", desc: "Above average" },
  { grade: "B",   color: "#a3e635", desc: "Good setup" },
  { grade: "C",   color: "#facc15", desc: "Average setup" },
  { grade: "D",   color: "#f97316", desc: "Weak setup" },
  { grade: "F",   color: "#ef4444", desc: "No trade / violation" },
];

const DEFAULT_RISK: Record<string, string> = {
  "A++": "750", "A+": "500", "A": "400", "B+": "350", "B": "300", "C": "150", "D": "75", "F": "0",
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function gradeColor(grade: string) {
  const g = GRADES.find(x => x.grade === grade);
  return g?.color ?? "#707888";
}

function MiniChart({ data }: { data: Array<{ date: string; equity: number }> }) {
  if (!data || data.length < 2) return <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", color: "#707888", fontSize: 11 }}>Not enough data</div>;
  const min = Math.min(...data.map(d => d.equity));
  const max = Math.max(...data.map(d => d.equity));
  const range = max - min || 1;
  const W = 400, H = 80;
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * W},${H - ((d.equity - min) / range) * (H - 8) - 4}`).join(" ");
  const color = data[data.length - 1].equity >= data[0].equity ? "#22c55e" : "#ef4444";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 80 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function BacktestCalendar({ tradeLog, fromDate, isLive = false }: { tradeLog: Record<string, any[]>; fromDate: string; isLive?: boolean }) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const first = fromDate ? new Date(fromDate + "T12:00:00Z") : new Date();
  const [viewYear, setViewYear] = useState(first.getFullYear());
  const [viewMonth, setViewMonth] = useState(first.getMonth());

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const cells: Array<number | null> = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const dayKey = (day: number) => `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const dayPnl = (day: number) => { const ts = tradeLog[dayKey(day)]; return ts?.length ? ts.reduce((s, t) => s + t.pnl, 0) : null; };

  const monthTrades = Object.entries(tradeLog).filter(([k]) => k.startsWith(`${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`));
  const monthPnl = monthTrades.flatMap(([, ts]) => ts).reduce((s, t) => s + t.pnl, 0);
  const monthWins = monthTrades.flatMap(([, ts]) => ts).filter(t => t.pnl > 0).length;
  const monthLosses = monthTrades.flatMap(([, ts]) => ts).filter(t => t.pnl < 0).length;

  return (
    <>
      {selectedDay && tradeLog[selectedDay] && (
        <div onClick={() => setSelectedDay(null)} style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(10,12,15,0.72)", backdropFilter: "blur(8px)" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "rgba(17,19,24,0.92)", border: "1px solid rgba(168,85,247,0.25)", borderRadius: 10, padding: 24, width: 480, maxWidth: "92vw", maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#f0f2f8" }}>{new Date(selectedDay + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
                <div style={{ fontSize: 12, color: tradeLog[selectedDay].reduce((s, t) => s + t.pnl, 0) >= 0 ? "#22c55e" : "#ef4444", fontFamily: "monospace", marginTop: 3 }}>
                  {tradeLog[selectedDay].reduce((s, t) => s + t.pnl, 0) >= 0 ? "+" : ""}${Math.abs(tradeLog[selectedDay].reduce((s, t) => s + t.pnl, 0)).toFixed(2)} day P&L
                </div>
              </div>
              <button onClick={() => setSelectedDay(null)} style={{ background: "rgba(255,255,255,0.06)", border: "none", color: "#b0b8cc", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 14 }}>✕</button>
            </div>
            {tradeLog[selectedDay].map((t, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: "12px 14px", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: t.direction === "long" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", color: t.direction === "long" ? "#22c55e" : "#ef4444", border: `1px solid ${t.direction === "long" ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}` }}>{t.direction?.toUpperCase()}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: gradeColor(t.grade), fontFamily: "monospace" }}>{t.grade ?? "—"}</span>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, fontFamily: "monospace", color: (t.pnl ?? 0) >= 0 ? "#22c55e" : "#ef4444" }}>{(t.pnl ?? 0) >= 0 ? "+" : ""}${Math.abs(t.pnl ?? 0).toFixed(2)}</span>
                </div>
                {t.setupType && <div style={{ fontSize: 11, color: "#b0b8cc", marginBottom: 4 }}>{t.setupType}</div>}
                {t.gradeReason && <div style={{ fontSize: 11, color: "#b0b8cc", fontStyle: "italic", background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.15)", borderRadius: 5, padding: "6px 8px" }}><span style={{ color: "#a855f7", fontStyle: "normal", fontFamily: "monospace", fontSize: 9 }}>AI · </span>{t.gradeReason}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => { if (viewMonth === 0) { setViewYear(y => y-1); setViewMonth(11); } else setViewMonth(m => m-1); }} style={{ background: "rgba(255,255,255,0.07)", border: "none", color: "#f0f2f8", borderRadius: 4, padding: "3px 8px", cursor: "pointer" }}>‹</button>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#f0f2f8", minWidth: 110, textAlign: "center" }}>{MONTHS[viewMonth]} {viewYear}</span>
          <button onClick={() => { if (viewMonth === 11) { setViewYear(y => y+1); setViewMonth(0); } else setViewMonth(m => m+1); }} style={{ background: "rgba(255,255,255,0.07)", border: "none", color: "#f0f2f8", borderRadius: 4, padding: "3px 8px", cursor: "pointer" }}>›</button>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {isLive && <span style={{ fontSize: 9, color: "#a855f7", fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.08em" }}>● LIVE</span>}
          <span style={{ fontSize: 10, fontFamily: "monospace", color: "#707888" }}>W: <span style={{ color: "#22c55e" }}>{monthWins}</span> &nbsp; L: <span style={{ color: "#ef4444" }}>{monthLosses}</span></span>
          <span style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 600, color: monthPnl >= 0 ? "#22c55e" : "#ef4444" }}>{monthPnl >= 0 ? "+" : ""}${Math.abs(monthPnl).toFixed(2)}</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 2 }}>
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => <div key={d} style={{ fontSize: 8, textAlign: "center", color: "#707888", fontFamily: "monospace", padding: "2px 0" }}>{d}</div>)}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
        {cells.map((day, idx) => {
          if (!day) return <div key={`e${idx}`} style={{ height: 44 }} />;
          const pnl = dayPnl(day);
          const key = dayKey(day);
          const hasData = pnl !== null;
          return (
            <div key={key} onClick={() => hasData && setSelectedDay(key)}
              style={{ height: 44, borderRadius: 4, background: hasData ? (pnl > 0 ? "rgba(34,197,94,0.13)" : pnl < 0 ? "rgba(239,68,68,0.13)" : "rgba(255,255,255,0.04)") : "rgba(255,255,255,0.02)", border: hasData ? (pnl > 0 ? "1px solid rgba(34,197,94,0.3)" : pnl < 0 ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(255,255,255,0.06)") : "1px solid rgba(255,255,255,0.04)", cursor: hasData ? "pointer" : "default", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 }}
              onMouseEnter={e => { if (hasData) (e.currentTarget as HTMLDivElement).style.background = pnl > 0 ? "rgba(34,197,94,0.22)" : "rgba(239,68,68,0.22)"; }}
              onMouseLeave={e => { if (hasData) (e.currentTarget as HTMLDivElement).style.background = pnl > 0 ? "rgba(34,197,94,0.13)" : "rgba(239,68,68,0.13)"; }}
            >
              <span style={{ fontSize: 10, fontWeight: 600, color: hasData ? "#f0f2f8" : "#3a4255", lineHeight: 1 }}>{day}</span>
              {hasData && <span style={{ fontSize: 8, fontFamily: "monospace", fontWeight: 700, color: pnl > 0 ? "#22c55e" : "#ef4444", lineHeight: 1 }}>{pnl >= 0 ? "+" : ""}${Math.abs(pnl).toFixed(0)}</span>}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 6, fontSize: 9, color: "#4a5263", fontFamily: "monospace" }}>Click a highlighted day to view AI trade analysis</div>
    </>
  );
}

function AiDebrief({ backtest, onClose }: { backtest: any; onClose: () => void }) {
  const [messages, setMessages] = useState([{ role: "assistant", content: "Session loaded. Ask me anything — patterns, mistakes, improvements, what to work on next." }]);
  const [input, setInput] = useState(""), [streaming, setStreaming] = useState(false), [streamContent, setStreamContent] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const send = async () => {
    if (!input.trim() || streaming) return;
    const userMsg = { role: "user", content: input };
    const next = [...messages, userMsg];
    setMessages(next); setInput(""); setStreaming(true); setStreamContent("");
    try {
      const res = await fetch("/api/backtests/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next, summary: backtest, tradeLog: backtest.trade_log }) });
      const reader = res.body!.getReader(); const dec = new TextDecoder(); let full = "";
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        for (const line of dec.decode(value).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try { const d = JSON.parse(line.slice(6)); if (d.content) { full += d.content; setStreamContent(full); } if (d.done) { setMessages([...next, { role: "assistant", content: full }]); setStreamContent(""); } } catch {}
        }
      }
    } catch { setMessages(m => [...m, { role: "assistant", content: "Error — try again." }]); setStreamContent(""); }
    setStreaming(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 680, height: "80vh", display: "flex", flexDirection: "column", background: "#0e1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#f0f2f8" }}>🧠 AI Session Debrief</div>
            <div style={{ fontSize: 11, color: "#b0b8cc", marginTop: 2 }}>{backtest.strategy_name} · {backtest.symbol} · {backtest.total_trades} trades</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.06)", border: "none", color: "#b0b8cc", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>✕ Close</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 14, flexDirection: m.role === "user" ? "row-reverse" : "row" }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: m.role === "user" ? "rgba(168,85,247,0.2)" : "rgba(34,197,94,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flexShrink: 0 }}>{m.role === "user" ? "T" : "AI"}</div>
              <div style={{ maxWidth: "80%", background: m.role === "user" ? "rgba(168,85,247,0.1)" : "rgba(255,255,255,0.04)", border: `1px solid ${m.role === "user" ? "rgba(168,85,247,0.2)" : "rgba(255,255,255,0.07)"}`, borderRadius: 10, padding: "10px 14px", fontSize: 13, lineHeight: 1.6, color: "#d4d8e8", whiteSpace: "pre-wrap" }}>{m.content}</div>
            </div>
          ))}
          {streamContent && <div style={{ display: "flex", gap: 8, marginBottom: 14 }}><div style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(34,197,94,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>AI</div><div style={{ maxWidth: "80%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "10px 14px", fontSize: 13, lineHeight: 1.6, color: "#d4d8e8", whiteSpace: "pre-wrap" }}>{streamContent}</div></div>}
          <div ref={bottomRef} />
        </div>
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: 12, display: "flex", gap: 8 }}>
          <input className="input" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !streaming) send(); }} placeholder="Ask about this session..." disabled={streaming} />
          <button className="btn btn-primary" onClick={send} disabled={streaming || !input.trim()}>↑</button>
        </div>
      </div>
    </div>
  );
}

export default function Backtester() {
  const qc = useQueryClient();
  const [view, setView] = useState<"form"|"running"|"done">("form");
  const [form, setForm] = useState({ strategyId: "", symbol: "NQ", from: "", to: "", initialCapital: "100000" });
  const [riskSettings, setRiskSettings] = useState<Record<string, string>>({ ...DEFAULT_RISK });
  const [liveTradeLog, setLiveTradeLog] = useState<Record<string, any[]>>({});
  const [liveSymbol, setLiveSymbol] = useState("NQ");
  const [liveStrategyId, setLiveStrategyId] = useState<number|undefined>();
  const [liveDates, setLiveDates] = useState({ from: "", to: "" });
  const [finalResult, setFinalResult] = useState<any>(null);
  const [progress, setProgress] = useState({ phase: "", progress: 0, dayNum: 0, totalDays: 0, setupsFound: 0 });
  const [dataWarning, setDataWarning] = useState<string|null>(null);
  const [debrief, setDebrief] = useState<any>(null);
  const [jobId, setJobId] = useState<string|null>(null);
  const [error, setError] = useState<string|null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>|null>(null);

  const { data: strategies = [] } = useQuery({ queryKey: ["strategies"], queryFn: () => fetch("/api/strategies").then(r => r.json()) });
  const { data: backtests = [], isLoading } = useQuery({ queryKey: ["backtests"], queryFn: () => fetch("/api/backtests").then(r => r.json()) });

  const setRisk = (grade: string, value: string) => setRiskSettings(prev => ({ ...prev, [grade]: value }));
  const sf = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const cancel = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setJobId(null); setView("form"); setProgress({ phase: "", progress: 0, dayNum: 0, totalDays: 0, setupsFound: 0 }); setLiveTradeLog({}); setDataWarning(null); setError(null);
  };

  useEffect(() => {
    if (!jobId) return;
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/backtests/jobs/${jobId}`);
        if (r.status === 404) { cancel(); setError("Job expired — please try again."); return; }
        const job = await r.json();
        setProgress({ phase: job.phase ?? "", progress: job.progress ?? 0, dayNum: job.dayNum ?? 0, totalDays: job.totalDays ?? 0, setupsFound: job.setupsFound ?? 0 });
        if (job.dataWarning) setDataWarning(job.dataWarning);
        if (job.liveTrades?.length) {
          const newLog: Record<string, any[]> = {};
          for (const t of job.liveTrades as any[]) {
            const day = t.day; if (!day) continue;
            if (!newLog[day]) newLog[day] = [];
            newLog[day].push({ pnl: t.pnl ?? 0, direction: t.direction, setupType: t.setupType, grade: t.grade, outcome: t.outcome });
          }
          setLiveTradeLog(newLog);
        }
        if (job.error) { clearInterval(pollRef.current!); pollRef.current = null; setJobId(null); setError(job.error); setView("form"); }
        if (job.complete && job.result) {
          clearInterval(pollRef.current!); pollRef.current = null; setJobId(null);
          const bt = (job.result as any).backtest;
          setFinalResult(bt);
          if (bt?.trade_log) setLiveTradeLog(bt.trade_log);
          setView("done");
          qc.invalidateQueries({ queryKey: ["backtests"] });
        }
      } catch {}
    }, 1500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [jobId]);

  const submit = async () => {
    if (!form.symbol || !form.from || !form.to) { setError("Symbol, From Date, and To Date are required."); return; }
    setError(null); setLiveTradeLog({}); setFinalResult(null); setDataWarning(null);
    setLiveSymbol(form.symbol); setLiveStrategyId(form.strategyId ? Number(form.strategyId) : undefined);
    setLiveDates({ from: form.from, to: form.to }); setView("running");
    setProgress({ phase: "Starting scan...", progress: 1, dayNum: 0, totalDays: 0, setupsFound: 0 });
    try {
      const res = await fetch("/api/backtests/auto-run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ strategyId: form.strategyId ? Number(form.strategyId) : undefined, symbol: form.symbol, fromDate: form.from, toDate: form.to, initialCapital: Number(form.initialCapital) || 100000, riskSettings: Object.fromEntries(Object.entries(riskSettings).map(([k, v]) => [k, Number(v) || 0])) }) });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` })); throw new Error(err.error ?? `HTTP ${res.status}`); }
      const { jobId: jid } = await res.json();
      setJobId(jid);
    } catch (err: any) { setError(err.message); setView("form"); }
  };

  const viewPast = (bt: any) => { setLiveTradeLog(bt.trade_log ?? {}); setLiveSymbol(bt.symbol ?? "NQ"); setLiveStrategyId(bt.strategy_id ?? undefined); setLiveDates({ from: bt.from_date ?? "", to: bt.to_date ?? "" }); setFinalResult(bt); setView("done"); };

  const deleteBt = async (id: number) => { await fetch(`/api/backtests/${id}`, { method: "DELETE" }); qc.invalidateQueries({ queryKey: ["backtests"] }); if (finalResult?.id === id) { setView("form"); setFinalResult(null); } };
  const clearAll = async () => { if (!confirm("Delete all past backtest sessions?")) return; await fetch("/api/backtests", { method: "DELETE" }); qc.invalidateQueries({ queryKey: ["backtests"] }); setView("form"); setFinalResult(null); };

  if (view === "form") return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: "#f0f2f8" }}>Backtester</div>
        <div style={{ fontSize: 11, color: "#b0b8cc", fontFamily: "monospace", marginTop: 3 }}>Fetches real futures data, scans each trading day for ICT/SMC setups using AI, then simulates outcomes</div>
      </div>
      {error && <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#ef4444" }}>⚠ {error}</div>}

      {/* Risk Settings */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#f0f2f8" }}>Risk Settings</div>
            <div style={{ fontSize: 10, color: "#707888", fontFamily: "monospace", marginTop: 2 }}>Dollar amount to risk per setup, by AI grade</div>
          </div>
          <button onClick={() => setRiskSettings({ ...DEFAULT_RISK })} style={{ background: "none", border: "1px solid rgba(255,255,255,0.1)", color: "#707888", borderRadius: 5, padding: "4px 10px", cursor: "pointer", fontSize: 10, fontFamily: "monospace" }}>Reset defaults</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
          {GRADES.map(({ grade, color, desc }) => (
            <div key={grade} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.059)", borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 10, gap: 4 }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: `${color}22`, border: `2px solid ${color}66`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color, fontFamily: "monospace" }}>{grade}</div>
                <div style={{ fontSize: 9, color: "#707888", fontFamily: "monospace", textAlign: "center" }}>{desc}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 10, color: "#707888" }}>$</span>
                <input type="number" min="0" max="10000" value={riskSettings[grade] ?? "0"} onChange={e => setRisk(grade, e.target.value)} style={{ flex: 1, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "5px 8px", color, fontSize: 13, fontFamily: "monospace", fontWeight: 600, width: "100%", textAlign: "right", outline: "none" }} />
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 10, color: "#707888", fontFamily: "monospace", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 10 }}>
          {GRADES.map(({ grade, color }) => <span key={grade} style={{ marginRight: 12 }}><span style={{ color, fontWeight: 700 }}>{grade}</span> ${riskSettings[grade] ?? "0"}</span>)}
        </div>
      </div>

      {/* Run Form */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 10, color: "#707888", display: "block", marginBottom: 5, fontFamily: "monospace", letterSpacing: "0.07em", textTransform: "uppercase" }}>Strategy</label>
            <select className="input" value={form.strategyId} onChange={e => sf("strategyId", e.target.value)}>
              <option value="">Any / General ICT</option>
              {strategies.map((s: any) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10, color: "#707888", display: "block", marginBottom: 5, fontFamily: "monospace", letterSpacing: "0.07em", textTransform: "uppercase" }}>Symbol *</label>
            <select className="input" value={form.symbol} onChange={e => sf("symbol", e.target.value)}>
              {["NQ","ES","GC","SI"].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10, color: "#707888", display: "block", marginBottom: 5, fontFamily: "monospace", letterSpacing: "0.07em", textTransform: "uppercase" }}>Initial Capital ($)</label>
            <input type="number" className="input" value={form.initialCapital} onChange={e => sf("initialCapital", e.target.value)} placeholder="100000" />
          </div>
          <div>
            <label style={{ fontSize: 10, color: "#707888", display: "block", marginBottom: 5, fontFamily: "monospace", letterSpacing: "0.07em", textTransform: "uppercase" }}>From Date *</label>
            <input type="date" className="input" value={form.from} onChange={e => sf("from", e.target.value)} max={new Date().toISOString().split("T")[0]} />
          </div>
          <div>
            <label style={{ fontSize: 10, color: "#707888", display: "block", marginBottom: 5, fontFamily: "monospace", letterSpacing: "0.07em", textTransform: "uppercase" }}>To Date *</label>
            <input type="date" className="input" value={form.to} onChange={e => sf("to", e.target.value)} max={new Date().toISOString().split("T")[0]} />
          </div>
        </div>
        <div style={{ fontSize: 10, color: "#707888", fontFamily: "monospace", marginBottom: 12 }}>NQ $20/pt · ES $50/pt · GC $100/pt · SI $50/pt &nbsp;·&nbsp; 1 contract · NY session</div>
        <button onClick={submit} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 5, border: "1px solid rgba(168,85,247,0.3)", background: "#000", color: "#d4b8f0", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "monospace", letterSpacing: "0.04em" }}>
          <span style={{ fontSize: 9 }}>▶</span> Run Backtest
        </button>
      </div>

      {/* Past Backtests */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: "#b0b8cc", fontWeight: 700, fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase" }}>Past Backtests ({backtests.length})</div>
          {backtests.length > 0 && <button onClick={clearAll} style={{ background: "none", border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444", borderRadius: 5, padding: "4px 10px", cursor: "pointer", fontSize: 10, fontFamily: "monospace" }}>Clear All</button>}
        </div>
        {isLoading ? <div style={{ padding: "40px 0", textAlign: "center", color: "#707888", fontSize: 12 }}>Loading…</div>
         : backtests.length === 0 ? <div className="card" style={{ padding: "40px 0", textAlign: "center" }}><div style={{ fontSize: 30, marginBottom: 12, opacity: 0.3 }}>↺</div><div style={{ fontSize: 13, color: "#707888" }}>No backtests run yet</div></div>
         : backtests.map((bt: any) => (
          <div key={bt.id} className="card" style={{ marginBottom: 8, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }} onClick={() => viewPast(bt)}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#f0f2f8" }}>{bt.symbol ?? "ALL"} &nbsp;·&nbsp; <span style={{ fontWeight: 300, color: "#b0b8cc" }}>{bt.from_date ?? "—"} → {bt.to_date ?? "—"}</span></div>
              <div style={{ fontSize: 11, color: "#707888", marginTop: 2, fontFamily: "monospace" }}>{bt.total_trades} trades · WR {((Number(bt.win_rate ?? 0)) * 100).toFixed(1)}% · {new Date(bt.created_at).toLocaleDateString()}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "monospace", color: (bt.net_pnl ?? 0) >= 0 ? "#22c55e" : "#ef4444" }}>{(bt.net_pnl ?? 0) >= 0 ? "+" : ""}${Math.abs(bt.net_pnl ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              <button onClick={e => { e.stopPropagation(); deleteBt(bt.id); }} style={{ background: "none", border: "none", color: "#707888", cursor: "pointer", fontSize: 14, padding: "2px 4px" }}>🗑</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const isRunning = view === "running";
  const totalSetups = Object.values(liveTradeLog).flat().length;
  const totalPnl = Object.values(liveTradeLog).flat().reduce((s, t) => s + (t.pnl ?? 0), 0);

  return (
    <div style={{ padding: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={cancel} style={{ background: "rgba(255,255,255,0.06)", border: "none", color: "#b0b8cc", borderRadius: 5, padding: "4px 10px", cursor: "pointer", fontSize: 11 }}>← Back</button>
          {!isRunning && <button onClick={() => { setView("form"); submit(); }} style={{ background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.35)", color: "#c084fc", borderRadius: 5, padding: "4px 12px", cursor: "pointer", fontSize: 11, fontFamily: "monospace", fontWeight: 600 }}>↺ Run Again</button>}
          <div style={{ fontSize: 15, fontWeight: 600, color: "#f0f2f8" }}>{liveSymbol} <span style={{ color: "#4a5263", fontWeight: 300 }}>·</span> <span style={{ fontWeight: 300, color: "#b0b8cc", fontSize: 13 }}>{liveDates.from} → {liveDates.to}</span></div>
          {isRunning && <span style={{ fontSize: 9, color: "#a855f7", fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.08em" }}>● SCANNING</span>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {totalSetups > 0 && <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 18, fontWeight: 600, fontFamily: "monospace", color: totalPnl >= 0 ? "#22c55e" : "#ef4444" }}>{totalPnl >= 0 ? "+" : ""}${Math.abs(totalPnl).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            <div style={{ fontSize: 10, color: "#707888", fontFamily: "monospace" }}>{totalSetups} setup{totalSetups !== 1 ? "s" : ""} found</div>
          </div>}
          {!isRunning && finalResult && <button onClick={() => setDebrief(finalResult)} style={{ background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.35)", color: "#c084fc", borderRadius: 5, padding: "4px 12px", cursor: "pointer", fontSize: 11, fontFamily: "monospace", fontWeight: 600 }}>🧠 AI Debrief</button>}
        </div>
      </div>

      {/* Data Warning */}
      {dataWarning && <div style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.35)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#eab308" }}>⚠️ {dataWarning}</div>}

      {/* Progress bar */}
      {isRunning && <div className="card" style={{ padding: "12px 16px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: "#b0b8cc", fontFamily: "monospace" }}><span style={{ color: "#f0f2f8", fontWeight: 600 }}>{progress.progress}%</span> · {progress.phase}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {progress.totalDays > 0 && <span style={{ fontSize: 10, color: "#707888", fontFamily: "monospace" }}>Day {progress.dayNum}/{progress.totalDays}</span>}
            <button onClick={cancel} style={{ background: "none", border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444", borderRadius: 4, padding: "3px 8px", cursor: "pointer", fontSize: 10, fontFamily: "monospace" }}>Cancel</button>
          </div>
        </div>
        <div style={{ height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${progress.progress}%`, background: "linear-gradient(90deg,#7c3aed,#a855f7)", borderRadius: 2, transition: "width 0.4s ease" }} />
        </div>
      </div>}

      {/* Stats */}
      {!isRunning && finalResult && (() => {
        const pnl = Number(finalResult.net_pnl ?? 0);
        const wr = finalResult.win_rate != null ? (Number(finalResult.win_rate) * 100).toFixed(1) : "—";
        const pf = Number(finalResult.profit_factor ?? 0).toFixed(2);
        const rr = Number(finalResult.avg_rr ?? 0).toFixed(2);
        const dd = (Number(finalResult.max_drawdown ?? 0) * 100).toFixed(1);
        return (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 16 }}>
            {[
              { label: "Net P&L", value: `${pnl >= 0 ? "+" : ""}$${Math.abs(pnl).toFixed(2)}`, color: pnl > 0 ? "#22c55e" : pnl < 0 ? "#ef4444" : undefined },
              { label: "Win Rate", value: `${wr}%`, color: Number(wr) >= 50 ? "#22c55e" : "#ef4444" },
              { label: "Avg R:R", value: `${rr}R`, color: Number(rr) >= 2 ? "#22c55e" : undefined },
              { label: "Profit Factor", value: pf, color: Number(pf) >= 1.5 ? "#22c55e" : "#ef4444" },
              { label: "Max Drawdown", value: `${dd}%`, color: Number(dd) > 20 ? "#ef4444" : undefined },
              { label: "Total Trades", value: String(finalResult.total_trades) },
              { label: "Winners", value: String(finalResult.winning_trades), color: "#22c55e" },
              { label: "Losers", value: String(finalResult.losing_trades), color: "#ef4444" },
            ].map(m => (
              <div key={m.label} style={{ background: "rgba(24,27,34,0.7)", border: "1px solid rgba(255,255,255,0.059)", borderRadius: 6, padding: "10px 14px" }}>
                <div style={{ fontSize: 9, color: "#b0b8cc", fontWeight: 700, fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>{m.label}</div>
                <div style={{ fontSize: 17, fontWeight: 300, color: m.color || "#f0f2f8", fontFamily: "monospace" }}>{m.value}</div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Equity Curve */}
      {!isRunning && finalResult?.equity_curve?.length > 1 && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: "#b0b8cc", fontWeight: 700, fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>Equity Curve</div>
          <MiniChart data={finalResult.equity_curve} />
        </div>
      )}

      {/* Grade Breakdown */}
      {!isRunning && finalResult && (() => {
        const allTrades = Object.values(liveTradeLog).flat() as any[];
        const gradeCounts: Record<string, number> = {}, gradeWins: Record<string, number> = {};
        for (const t of allTrades) { if (t.grade) { gradeCounts[t.grade] = (gradeCounts[t.grade] ?? 0) + 1; if ((t.pnl ?? 0) > 0) gradeWins[t.grade] = (gradeWins[t.grade] ?? 0) + 1; } }
        if (Object.keys(gradeCounts).length === 0) return null;
        return (
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: "#b0b8cc", fontWeight: 700, fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>Grade Breakdown</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(8,1fr)", gap: 8 }}>
              {GRADES.map(({ grade, color }) => {
                const count = gradeCounts[grade] ?? 0, wins = gradeWins[grade] ?? 0;
                const wr = count > 0 ? (wins / count * 100).toFixed(0) : "—";
                return (
                  <div key={grade} style={{ background: count > 0 ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)", borderRadius: 6, padding: "10px 8px", textAlign: "center", border: `1px solid ${count > 0 ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)"}` }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: count > 0 ? color : "#4a5060", fontFamily: "monospace", marginBottom: 4 }}>{grade}</div>
                    <div style={{ fontSize: 18, fontWeight: 300, color: count > 0 ? "#f0f2f8" : "#4a5060" }}>{count}</div>
                    <div style={{ fontSize: 9, color: count > 0 ? "#b0b8cc" : "#4a5060", fontFamily: "monospace", marginTop: 3 }}>{count > 0 ? `${wr}% WR` : "—"}</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* P&L Calendar */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 10, color: "#b0b8cc", fontWeight: 700, fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>P&L Calendar</div>
        <BacktestCalendar tradeLog={liveTradeLog} fromDate={liveDates.from} isLive={isRunning} />
      </div>

      {debrief && <AiDebrief backtest={debrief} onClose={() => setDebrief(null)} />}
    </div>
  );
}
