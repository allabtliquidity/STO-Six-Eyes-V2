import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getStrategies, createStrategy, deleteStrategy, activateStrategy, getStrategyStats } from "../api";

function StrategyCard({ s, onDelete, onActivate }: any) {
  const [showStats, setShowStats] = useState(false);
  const { data: stats } = useQuery({ queryKey: ["strategy-stats", s.id], queryFn: () => getStrategyStats(s.id), enabled: showStats });

  return (
    <div className="card" style={{ padding: 16, marginBottom: 10, borderColor: s.is_active ? "rgba(168,85,247,0.4)" : undefined }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: "#f0f2f8" }}>{s.name}</span>
            {s.is_active === 1 && <span style={{ fontSize: 9, padding: "2px 7px", background: "rgba(168,85,247,0.2)", color: "#a855f7", borderRadius: 4, fontFamily: "monospace", letterSpacing: "0.05em" }}>ACTIVE</span>}
          </div>
          {s.description && <p style={{ fontSize: 12, color: "#b0b8cc", marginTop: 4 }}>{s.description}</p>}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {!s.is_active && <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 10 }} onClick={onActivate}>Activate</button>}
          <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 10 }} onClick={() => setShowStats(!showStats)}>Stats</button>
          <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 10, color: "#ef4444" }} onClick={onDelete}>Del</button>
        </div>
      </div>
      {showStats && stats && (
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
          {[
            { label: "Win Rate", value: `${(stats.winRate * 100).toFixed(1)}%` },
            { label: "Net P&L", value: `$${stats.netPnl?.toFixed(0)}` },
            { label: "Profit Factor", value: stats.profitFactor?.toFixed(2) },
            { label: "Trades", value: stats.totalTrades },
          ].map(m => (
            <div key={m.label} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 6, padding: "8px 10px" }}>
              <div style={{ fontSize: 10, color: "#707888", fontFamily: "monospace" }}>{m.label}</div>
              <div style={{ fontSize: 16, fontWeight: 300, color: "#f0f2f8", marginTop: 2 }}>{m.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Strategies() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });
  const { data: strategies = [] } = useQuery({ queryKey: ["strategies"], queryFn: getStrategies });
  const addMut = useMutation({ mutationFn: createStrategy, onSuccess: () => { qc.invalidateQueries({ queryKey: ["strategies"] }); setShowForm(false); setForm({ name: "", description: "" }); } });
  const delMut = useMutation({ mutationFn: deleteStrategy, onSuccess: () => qc.invalidateQueries({ queryKey: ["strategies"] }) });
  const activateMut = useMutation({ mutationFn: activateStrategy, onSuccess: () => qc.invalidateQueries({ queryKey: ["strategies"] }) });

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: "#f0f2f8" }}>Strategies</h1>
          <p style={{ fontSize: 11, color: "#b0b8cc", marginTop: 2 }}>{strategies.length} strategies</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>+ New Strategy</button>
      </div>

      {showForm && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 10, color: "#707888", display: "block", marginBottom: 4, fontFamily: "monospace" }}>NAME</label>
              <input className="input" placeholder="Strategy name..." value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: "#707888", display: "block", marginBottom: 4, fontFamily: "monospace" }}>DESCRIPTION</label>
              <input className="input" placeholder="Brief description..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" onClick={() => addMut.mutate(form)} disabled={!form.name.trim()}>Create</button>
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {strategies.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#707888" }}>No strategies yet</div>
      ) : strategies.map((s: any) => (
        <StrategyCard key={s.id} s={s} onDelete={() => delMut.mutate(s.id)} onActivate={() => activateMut.mutate(s.id)} />
      ))}
    </div>
  );
}
