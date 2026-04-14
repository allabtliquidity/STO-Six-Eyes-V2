import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getKnowledge, createKnowledge, deleteKnowledge, getStrategies } from "../api";

export default function Knowledge() {
  const qc = useQueryClient();
  const [selectedStrategy, setSelectedStrategy] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [form, setForm] = useState({ sectionNumber: 1, sectionName: "", content: "", rules: "" });

  const { data: strategies = [] } = useQuery({ queryKey: ["strategies"], queryFn: getStrategies });
  const { data: sections = [], isLoading } = useQuery({ queryKey: ["knowledge", selectedStrategy], queryFn: () => getKnowledge(selectedStrategy) });
  const addMut = useMutation({ mutationFn: createKnowledge, onSuccess: () => { qc.invalidateQueries({ queryKey: ["knowledge"] }); setShowForm(false); } });
  const delMut = useMutation({ mutationFn: deleteKnowledge, onSuccess: () => qc.invalidateQueries({ queryKey: ["knowledge"] }) });

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: "#f0f2f8" }}>IKB — Intelligence Knowledge Base</h1>
          <p style={{ fontSize: 11, color: "#b0b8cc", marginTop: 2 }}>{sections.length} sections documented</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select className="input" style={{ width: "auto" }} value={selectedStrategy} onChange={e => setSelectedStrategy(Number(e.target.value))}>
            {strategies.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>+ Add Section</button>
        </div>
      </div>

      {showForm && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 10, color: "#707888", display: "block", marginBottom: 4, fontFamily: "monospace" }}>SECTION #</label>
              <input type="number" className="input" value={form.sectionNumber} onChange={e => setForm(f => ({ ...f, sectionNumber: Number(e.target.value) }))} min={1} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: "#707888", display: "block", marginBottom: 4, fontFamily: "monospace" }}>SECTION NAME</label>
              <input className="input" placeholder="e.g. Power of Three (PO3)" value={form.sectionName} onChange={e => setForm(f => ({ ...f, sectionName: e.target.value }))} />
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10, color: "#707888", display: "block", marginBottom: 4, fontFamily: "monospace" }}>RULES (one per line)</label>
            <textarea className="input" rows={4} placeholder="If no PO3, do not trade&#10;Always trade the Distribution leg&#10;..." value={form.rules} onChange={e => setForm(f => ({ ...f, rules: e.target.value }))} style={{ resize: "none" }} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10, color: "#707888", display: "block", marginBottom: 4, fontFamily: "monospace" }}>CONTENT / NOTES</label>
            <textarea className="input" rows={6} placeholder="Full notes, insights, transcript excerpts..." value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} style={{ resize: "none", fontFamily: "monospace", fontSize: 12 }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" onClick={() => addMut.mutate({ strategyId: selectedStrategy, sectionNumber: form.sectionNumber, sectionName: form.sectionName, content: form.content, rules: form.rules })} disabled={!form.sectionName.trim()}>Save Section</button>
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {isLoading ? <div style={{ textAlign: "center", padding: 40, color: "#707888" }}>Loading...</div> :
       sections.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: "#707888" }}>No sections yet — add strategy knowledge to power the AI</div> :
       [...sections].sort((a: any, b: any) => a.section_number - b.section_number).map((s: any) => (
        <div key={s.id} className="card" style={{ marginBottom: 8, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", cursor: "pointer" }} onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
            <span style={{ fontSize: 11, color: "#a855f7", fontFamily: "monospace", fontWeight: 600, marginRight: 10 }}>S{s.section_number}</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: "#f0f2f8", flex: 1 }}>{s.section_name}</span>
            <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 10, color: "#ef4444" }} onClick={e => { e.stopPropagation(); delMut.mutate(s.id); }}>Del</button>
            <span style={{ color: "#707888", marginLeft: 8 }}>{expanded === s.id ? "▲" : "▼"}</span>
          </div>
          {expanded === s.id && (
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              {s.rules && (
                <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)", background: "rgba(255,255,255,0.02)" }}>
                  <div style={{ fontSize: 10, color: "#b0b8cc", fontFamily: "monospace", letterSpacing: "0.08em", marginBottom: 8, textTransform: "uppercase" }}>Rules</div>
                  {s.rules.split("\n").filter(Boolean).map((r: string, i: number) => (
                    <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 10, color: "#a855f7", fontFamily: "monospace", flexShrink: 0 }}>{String(i+1).padStart(2,"0")}</span>
                      <span style={{ fontSize: 12, color: "#f0f2f8" }}>{r.replace(/^[-•\d.)\s]+/, "")}</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ padding: "12px 16px" }}>
                <div style={{ fontSize: 10, color: "#b0b8cc", fontFamily: "monospace", letterSpacing: "0.08em", marginBottom: 8, textTransform: "uppercase" }}>Notes</div>
                <pre style={{ fontSize: 12, color: "#d4d8e8", whiteSpace: "pre-wrap", fontFamily: "monospace", lineHeight: 1.6 }}>{s.content}</pre>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
