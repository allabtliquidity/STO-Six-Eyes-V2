import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getObservations, createObservation, deleteObservation, getStrategies } from "../api";

const CATS: Record<string, { label: string; color: string }> = {
  win_pattern: { label: "Win Pattern", color: "#22c55e" },
  loss_pattern: { label: "Loss Pattern", color: "#ef4444" },
  market_condition: { label: "Market Condition", color: "#f59e0b" },
  setup_quality: { label: "Setup Quality", color: "#a78bfa" },
  risk_management: { label: "Risk Management", color: "#38bdf8" },
  manual: { label: "Manual Note", color: "#e2e8f0" },
};

export default function Memory() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ category: "manual", content: "", symbol: "" });
  const [filterCat, setFilterCat] = useState("all");

  const { data: strategies = [] } = useQuery({ queryKey: ["strategies"], queryFn: getStrategies });
  const { data: obs = [], isLoading } = useQuery({ queryKey: ["observations"], queryFn: () => getObservations(), refetchInterval: 30000 });

  const addMut = useMutation({ mutationFn: createObservation, onSuccess: () => { qc.invalidateQueries({ queryKey: ["observations"] }); setShowForm(false); setForm({ category: "manual", content: "", symbol: "" }); } });
  const delMut = useMutation({ mutationFn: deleteObservation, onSuccess: () => qc.invalidateQueries({ queryKey: ["observations"] }) });

  const filtered = filterCat === "all" ? obs : obs.filter((o: any) => o.category === filterCat);

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: "#f0f2f8" }}>🧠 AI Memory</h1>
          <p style={{ fontSize: 11, color: "#b0b8cc", marginTop: 2 }}>{obs.length} observations stored</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>+ Add Note</button>
      </div>

      {showForm && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 10, color: "#707888", display: "block", marginBottom: 4, fontFamily: "monospace" }}>CATEGORY</label>
              <select className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, color: "#707888", display: "block", marginBottom: 4, fontFamily: "monospace" }}>SYMBOL (optional)</label>
              <input className="input" placeholder="NQ, ES, GC..." value={form.symbol} onChange={e => setForm(f => ({ ...f, symbol: e.target.value }))} />
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10, color: "#707888", display: "block", marginBottom: 4, fontFamily: "monospace" }}>OBSERVATION</label>
            <textarea className="input" rows={3} placeholder="Describe the pattern or note..." value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} style={{ resize: "none" }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" onClick={() => addMut.mutate({ category: form.category as any, content: form.content, symbol: form.symbol || undefined, source: "manual" })} disabled={!form.content.trim()}>Save</button>
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        <button className="btn btn-ghost" style={{ padding: "3px 10px", fontSize: 10, background: filterCat === "all" ? "rgba(255,255,255,0.08)" : "transparent" }} onClick={() => setFilterCat("all")}>All</button>
        {Object.entries(CATS).map(([k, v]) => (
          <button key={k} className="btn btn-ghost" style={{ padding: "3px 10px", fontSize: 10, color: filterCat === k ? v.color : undefined, background: filterCat === k ? "rgba(255,255,255,0.06)" : "transparent" }} onClick={() => setFilterCat(filterCat === k ? "all" : k)}>{v.label}</button>
        ))}
      </div>

      {isLoading ? <div style={{ textAlign: "center", padding: 40, color: "#707888" }}>Loading...</div> :
       filtered.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: "#707888" }}>No observations yet</div> :
       filtered.map((o: any) => {
        const cat = CATS[o.category] ?? CATS.manual;
        return (
          <div key={o.id} className="card" style={{ padding: "12px 16px", marginBottom: 8, display: "flex", gap: 12, alignItems: "flex-start", borderColor: `rgba(${cat.color},0.2)` }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: cat.color, flexShrink: 0, marginTop: 4, display: "inline-block" }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: cat.color, fontWeight: 600, marginBottom: 4 }}>
                {cat.label}
                {o.symbol && <span style={{ color: "#b0b8cc", fontWeight: 400, marginLeft: 6 }}>· {o.symbol}</span>}
                <span style={{ color: "#707888", fontWeight: 400, marginLeft: 6 }}>· {o.source}</span>
              </div>
              <div style={{ fontSize: 13, color: "#e2e8f0", lineHeight: 1.5 }}>{o.content}</div>
              <div style={{ fontSize: 10, color: "#707888", fontFamily: "monospace", marginTop: 4 }}>
                {new Date(o.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </div>
            </div>
            <button className="btn btn-ghost" style={{ padding: "2px 6px", fontSize: 10, color: "#ef4444", flexShrink: 0 }} onClick={() => delMut.mutate(o.id)}>×</button>
          </div>
        );
      })}
    </div>
  );
}
