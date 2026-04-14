import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getTrades, createTrade, deleteTrade, gradeTrade, getStrategies } from "../api";

const SYMBOLS = ["NQ","ES","GC","SI","YM","RTY","CL","EURUSD","GBPUSD"];
const SESSIONS = ["Asia","London","NY AM","NY PM","Evening"];
const PO3 = ["Accumulation","Manipulation","Distribution"];
const SETUP_TYPES = ["OTE","FVG","Order Block","Breaker Block","Liquidity Sweep","STDV","Wick Model","KO Model","Failed Auction","VP Breakout","Other"];
const TIMEFRAMES = ["1m","2m","3m","5m","15m","30m","1h","4h","Daily"];
const GRADES = ["A++","A+","A","B+","B","C","D","F"];

export default function Trades() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const [form, setForm] = useState<any>({ symbol: "NQ", direction: "long", trade_date: new Date().toISOString().split("T")[0], contracts: 1 });
  const [checklist, setChecklist] = useState<Record<string,boolean>>({});

  const CHECKLIST_ITEMS = [
    "PO3 is visible and valid on 5m",
    "Bias/DOL is clearly identified",
    "STDV levels are marked",
    "Entry is in OTE/FIB zone",
    "3m structure confirms direction",
    "2m entry trigger identified",
    "SL is ≤ 20 points (2m structure)",
    "R:R is at least 2:1",
    "Not trading during news event",
    "Session is London or NY AM",
  ];

  const checklistPassed = Object.values(checklist).filter(Boolean).length;

  const { data: trades = [], isLoading } = useQuery({ queryKey: ["trades"], queryFn: getTrades });
  const { data: strategies = [] } = useQuery({ queryKey: ["strategies"], queryFn: getStrategies });

  const addMut = useMutation({
    mutationFn: createTrade,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["trades"] }); setShowForm(false); setForm({ symbol: "NQ", direction: "long", trade_date: new Date().toISOString().split("T")[0], contracts: 1 }); },
  });
  const delMut = useMutation({ mutationFn: deleteTrade, onSuccess: () => qc.invalidateQueries({ queryKey: ["trades"] }) });
  const gradeMut = useMutation({ mutationFn: gradeTrade, onSuccess: () => qc.invalidateQueries({ queryKey: ["trades"] }) });

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: "#f0f2f8" }}>Trade Journal</h1>
          <p style={{ fontSize: 11, color: "#b0b8cc", marginTop: 2 }}>{trades.length} trades logged</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setShowChecklist(!showChecklist)}>✓ Pre-Trade Checklist</button>
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>+ Log Trade</button>
        </div>
      </div>

      {/* Pre-Trade Checklist */}
      {showChecklist && (
        <div className="card" style={{ padding: 16, marginBottom: 16, borderColor: checklistPassed >= 8 ? "rgba(34,197,94,0.3)" : checklistPassed >= 5 ? "rgba(245,158,11,0.3)" : "rgba(239,68,68,0.3)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#f0f2f8" }}>Pre-Trade Checklist</span>
            <span style={{ fontSize: 12, fontFamily: "monospace", color: checklistPassed >= 8 ? "#22c55e" : checklistPassed >= 5 ? "#f59e0b" : "#ef4444" }}>
              {checklistPassed}/{CHECKLIST_ITEMS.length} passed
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {CHECKLIST_ITEMS.map(item => (
              <label key={item} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "5px 8px", borderRadius: 6, background: checklist[item] ? "rgba(34,197,94,0.08)" : "transparent" }}>
                <input type="checkbox" checked={!!checklist[item]} onChange={e => setChecklist(c => ({ ...c, [item]: e.target.checked }))} style={{ width: 14, height: 14, accentColor: "#a855f7" }} />
                <span style={{ fontSize: 12, color: checklist[item] ? "#22c55e" : "#b0b8cc" }}>{item}</span>
              </label>
            ))}
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <button className="btn btn-ghost" style={{ fontSize: 10 }} onClick={() => setChecklist({})}>Reset</button>
            {checklistPassed < 8 && <span style={{ fontSize: 11, color: "#f59e0b", alignSelf: "center" }}>⚠ {10 - checklistPassed} items remaining before taking trade</span>}
            {checklistPassed >= 8 && <span style={{ fontSize: 11, color: "#22c55e", alignSelf: "center" }}>✓ Setup looks valid — proceed with caution</span>}
          </div>
        </div>
      )}

      {/* Log Trade Form */}
      {showForm && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#f0f2f8", marginBottom: 12 }}>New Trade Entry</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 10, color: "#707888", display: "block", marginBottom: 4, fontFamily: "monospace" }}>DATE</label>
              <input type="date" className="input" value={form.trade_date} onChange={e => set("trade_date", e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: "#707888", display: "block", marginBottom: 4, fontFamily: "monospace" }}>SYMBOL</label>
              <select className="input" value={form.symbol} onChange={e => set("symbol", e.target.value)}>
                {SYMBOLS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, color: "#707888", display: "block", marginBottom: 4, fontFamily: "monospace" }}>DIRECTION</label>
              <select className="input" value={form.direction} onChange={e => set("direction", e.target.value)}>
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, color: "#707888", display: "block", marginBottom: 4, fontFamily: "monospace" }}>CONTRACTS</label>
              <input type="number" className="input" value={form.contracts} onChange={e => set("contracts", Number(e.target.value))} min={1} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: "#707888", display: "block", marginBottom: 4, fontFamily: "monospace" }}>ENTRY PRICE</label>
              <input type="number" className="input" placeholder="0.00" value={form.entry_price ?? ""} onChange={e => set("entry_price", Number(e.target.value))} step="0.25" />
            </div>
            <div>
              <label style={{ fontSize: 10, color: "#707888", display: "block", marginBottom: 4, fontFamily: "monospace" }}>EXIT PRICE</label>
              <input type="number" className="input" placeholder="0.00" value={form.exit_price ?? ""} onChange={e => set("exit_price", Number(e.target.value))} step="0.25" />
            </div>
            <div>
              <label style={{ fontSize: 10, color: "#707888", display: "block", marginBottom: 4, fontFamily: "monospace" }}>STOP LOSS</label>
              <input type="number" className="input" placeholder="0.00" value={form.stop_loss ?? ""} onChange={e => set("stop_loss", Number(e.target.value))} step="0.25" />
            </div>
            <div>
              <label style={{ fontSize: 10, color: "#707888", display: "block", marginBottom: 4, fontFamily: "monospace" }}>TAKE PROFIT</label>
              <input type="number" className="input" placeholder="0.00" value={form.take_profit ?? ""} onChange={e => set("take_profit", Number(e.target.value))} step="0.25" />
            </div>
            <div>
              <label style={{ fontSize: 10, color: "#707888", display: "block", marginBottom: 4, fontFamily: "monospace" }}>P&L ($)</label>
              <input type="number" className="input" placeholder="0.00" value={form.pnl_dollars ?? ""} onChange={e => set("pnl_dollars", Number(e.target.value))} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: "#707888", display: "block", marginBottom: 4, fontFamily: "monospace" }}>SESSION</label>
              <select className="input" value={form.session ?? ""} onChange={e => set("session", e.target.value)}>
                <option value="">Select...</option>
                {SESSIONS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, color: "#707888", display: "block", marginBottom: 4, fontFamily: "monospace" }}>PO3 PHASE</label>
              <select className="input" value={form.po3_phase ?? ""} onChange={e => set("po3_phase", e.target.value)}>
                <option value="">Select...</option>
                {PO3.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, color: "#707888", display: "block", marginBottom: 4, fontFamily: "monospace" }}>SETUP TYPE</label>
              <select className="input" value={form.setup_type ?? ""} onChange={e => set("setup_type", e.target.value)}>
                <option value="">Select...</option>
                {SETUP_TYPES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, color: "#707888", display: "block", marginBottom: 4, fontFamily: "monospace" }}>ENTRY TIMEFRAME</label>
              <select className="input" value={form.entry_timeframe ?? ""} onChange={e => set("entry_timeframe", e.target.value)}>
                <option value="">Select...</option>
                {TIMEFRAMES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, color: "#707888", display: "block", marginBottom: 4, fontFamily: "monospace" }}>GRADE (manual)</label>
              <select className="input" value={form.grade ?? ""} onChange={e => set("grade", e.target.value)}>
                <option value="">None</option>
                {GRADES.map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, color: "#707888", display: "block", marginBottom: 4, fontFamily: "monospace" }}>STRATEGY</label>
              <select className="input" value={form.strategy_id ?? ""} onChange={e => set("strategy_id", Number(e.target.value))}>
                <option value="">None</option>
                {strategies.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10, color: "#707888", display: "block", marginBottom: 4, fontFamily: "monospace" }}>NOTES</label>
            <textarea className="input" rows={2} placeholder="Trade notes, observations..." value={form.notes ?? ""} onChange={e => set("notes", e.target.value)} style={{ resize: "none" }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" onClick={() => addMut.mutate(form)} disabled={addMut.isPending}>
              {addMut.isPending ? "Saving..." : "Save Trade"}
            </button>
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card" style={{ overflow: "auto" }}>
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", fontFamily: "monospace", minWidth: 900 }}>
          <thead>
            <tr>
              {["Date","Symbol","Dir","Entry","Exit","SL","TP","P&L","R:R","Setup","TF","Grade","Session","Actions"].map(h => (
                <th key={h} style={{ textAlign: "left", fontSize: 10, color: "#b0b8cc", padding: "9px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)", letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={14} style={{ padding: "20px 10px", textAlign: "center", color: "#707888" }}>Loading...</td></tr>
            ) : trades.length === 0 ? (
              <tr><td colSpan={14} style={{ padding: "20px 10px", textAlign: "center", color: "#707888" }}>No trades yet — click Log Trade to add one</td></tr>
            ) : trades.map((t: any) => {
              const rr = t.entry_price && t.stop_loss && t.take_profit
                ? (Math.abs(t.take_profit - t.entry_price) / Math.abs(t.entry_price - t.stop_loss)).toFixed(1)
                : null;
              return (
                <tr key={t.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <td style={{ padding: "9px 10px", color: "#b0b8cc", whiteSpace: "nowrap" }}>{t.trade_date}</td>
                  <td style={{ padding: "9px 10px", fontWeight: 600 }}>{t.symbol}</td>
                  <td style={{ padding: "9px 10px" }}><span className={t.direction === "long" ? "tag-long" : "tag-short"}>{t.direction}</span></td>
                  <td style={{ padding: "9px 10px" }}>{t.entry_price ?? "—"}</td>
                  <td style={{ padding: "9px 10px" }}>{t.exit_price ?? "—"}</td>
                  <td style={{ padding: "9px 10px" }}>{t.stop_loss ?? "—"}</td>
                  <td style={{ padding: "9px 10px" }}>{t.take_profit ?? "—"}</td>
                  <td style={{ padding: "9px 10px", color: (t.pnl_dollars ?? 0) >= 0 ? "#22c55e" : "#ef4444", fontWeight: 600 }}>
                    {t.pnl_dollars != null ? `${t.pnl_dollars >= 0 ? "+" : ""}$${Math.abs(t.pnl_dollars).toFixed(2)}` : "—"}
                  </td>
                  <td style={{ padding: "9px 10px", color: "#b0b8cc" }}>{rr ? `${rr}R` : "—"}</td>
                  <td style={{ padding: "9px 10px", color: "#b0b8cc" }}>{t.setup_type ?? "—"}</td>
                  <td style={{ padding: "9px 10px", color: "#b0b8cc" }}>{t.entry_timeframe ?? "—"}</td>
                  <td style={{ padding: "9px 10px", color: "#a855f7", fontWeight: 600 }}>{t.grade ?? "—"}</td>
                  <td style={{ padding: "9px 10px", color: "#b0b8cc" }}>{t.session ?? "—"}</td>
                  <td style={{ padding: "9px 10px" }}>
                    <div style={{ display: "flex", gap: 5 }}>
                      <button className="btn btn-ghost" style={{ padding: "2px 7px", fontSize: 10 }} onClick={() => gradeMut.mutate(t.id)}>Grade</button>
                      <button className="btn btn-ghost" style={{ padding: "2px 7px", fontSize: 10, color: "#ef4444" }} onClick={() => delMut.mutate(t.id)}>Del</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
