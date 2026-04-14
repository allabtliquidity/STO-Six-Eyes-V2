import { useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { getStrategies } from "../api";

interface Message { role: "user" | "assistant"; content: string; images?: string[]; }

export default function Analyze() {
  const { data: strategies = [] } = useQuery({ queryKey: ["strategies"], queryFn: getStrategies });
  const [strategyId, setStrategyId] = useState(1);
  const [images, setImages] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [followUp, setFollowUp] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const toBase64 = (file: File): Promise<string> => new Promise(res => { const r = new FileReader(); r.onload = e => res(e.target?.result as string); r.readAsDataURL(file); });

  const addImages = async (files: FileList | null) => {
    if (!files) return;
    const b64s = await Promise.all(Array.from(files).map(toBase64));
    setImages(p => [...p, ...b64s].slice(0, 6));
  };

  const stream = useCallback(async (imgs: string[], text: string, history: Message[]) => {
    setStreaming(true);
    setStreamContent("");
    const userMsg: Message = { role: "user", content: text, images: imgs.length > 0 ? imgs : undefined };
    const next = [...history, userMsg];
    setMessages(next);

    try {
      const res = await fetch("/api/setup/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: imgs, strategyId, messages: history.map(m => ({ role: m.role, content: m.content })) }),
      });
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (d.content) { full += d.content; setStreamContent(full); }
            if (d.done) { setMessages([...next, { role: "assistant", content: full }]); setStreamContent(""); }
          } catch {}
        }
      }
    } catch { setMessages([...next, { role: "assistant", content: "Error — please try again." }]); setStreamContent(""); }
    setStreaming(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, [strategyId]);

  const hasConvo = messages.length > 0 || streamContent;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: "#f0f2f8" }}>Setup Analyzer</h1>
          <p style={{ fontSize: 11, color: "#b0b8cc", marginTop: 2 }}>Upload charts — AI reviews against strategy rules</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select className="input" style={{ width: "auto" }} value={strategyId} onChange={e => setStrategyId(Number(e.target.value))}>
            {strategies.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {hasConvo && <button className="btn btn-ghost" onClick={() => { setMessages([]); setImages([]); setStreamContent(""); }}>New Analysis</button>}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {!hasConvo ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: 40 }}>
            <div
              style={{ width: "100%", maxWidth: 500, borderRadius: 12, border: "2px dashed rgba(255,255,255,0.1)", padding: 40, textAlign: "center", cursor: "pointer" }}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); addImages(e.dataTransfer.files); }}
            >
              <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
              <p style={{ fontSize: 14, fontWeight: 500, color: "#f0f2f8" }}>Drop your charts here</p>
              <p style={{ fontSize: 12, color: "#707888", marginTop: 6 }}>Up to 6 screenshots · PNG, JPG, WebP</p>
            </div>
            <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => addImages(e.target.files)} />
            {images.length > 0 && (
              <div style={{ width: "100%", maxWidth: 500, marginTop: 16 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                  {images.map((src, i) => (
                    <div key={i} style={{ position: "relative", width: 80, height: 80 }}>
                      <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)" }} />
                      <button onClick={() => setImages(p => p.filter((_,idx) => idx !== i))} style={{ position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,0.7)", border: "none", borderRadius: "50%", color: "#fff", width: 18, height: 18, cursor: "pointer", fontSize: 10 }}>×</button>
                    </div>
                  ))}
                </div>
                <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => { stream(images, "Analyze this setup.", []); setImages([]); }}>🧠 Analyze Setup</button>
              </div>
            )}
          </div>
        ) : (
          <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 20px" }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", gap: 10, marginBottom: 16, flexDirection: m.role === "user" ? "row-reverse" : "row" }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: m.role === "user" ? "rgba(168,85,247,0.2)" : "rgba(34,197,94,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flexShrink: 0 }}>
                  {m.role === "user" ? "T" : "AI"}
                </div>
                <div style={{ maxWidth: "82%" }}>
                  {m.images && <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>{m.images.map((src, i) => <img key={i} src={src} alt="" style={{ width: 100, height: 75, objectFit: "cover", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)" }} />)}</div>}
                  <div style={{ background: m.role === "user" ? "rgba(168,85,247,0.1)" : "rgba(255,255,255,0.04)", border: `1px solid ${m.role === "user" ? "rgba(168,85,247,0.2)" : "rgba(255,255,255,0.07)"}`, borderRadius: 10, padding: "10px 14px", fontSize: 13, lineHeight: 1.6, color: "#d4d8e8", whiteSpace: "pre-wrap" }}>
                    {m.content}
                  </div>
                </div>
              </div>
            ))}
            {streamContent && (
              <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(34,197,94,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>AI</div>
                <div style={{ maxWidth: "82%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "10px 14px", fontSize: 13, lineHeight: 1.6, color: "#d4d8e8", whiteSpace: "pre-wrap" }}>
                  {streamContent}<span style={{ display: "inline-block", width: 6, height: 14, background: "rgba(168,85,247,0.7)", marginLeft: 2, animation: "blink 1s step-end infinite" }} />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Follow-up */}
      {hasConvo && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "12px 20px", flexShrink: 0 }}>
          <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", gap: 8 }}>
            <button className="btn btn-ghost" style={{ padding: "0 10px", flexShrink: 0 }} onClick={() => fileRef.current?.click()}>📎</button>
            <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => addImages(e.target.files)} />
            <input className="input" value={followUp} onChange={e => setFollowUp(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !streaming) { stream([], followUp, messages); setFollowUp(""); } }} placeholder="Ask a follow-up or upload more charts..." disabled={streaming} />
            <button className="btn btn-primary" style={{ flexShrink: 0 }} onClick={() => { stream([], followUp, messages); setFollowUp(""); }} disabled={streaming || !followUp.trim()}>↑</button>
          </div>
        </div>
      )}
    </div>
  );
}
