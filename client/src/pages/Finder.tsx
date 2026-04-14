import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getStrategies } from "../api";

interface Message { role: "user" | "assistant"; content: string; images?: string[]; }

const INITIAL: Message = { role: "assistant", content: "Six Eyes Finder active. Tell me: what instrument (NQ, ES, GC, SI), what session, and current date/time. Then drop me a daily or 1-hour chart to start." };

export default function Finder() {
  const { data: strategies = [] } = useQuery({ queryKey: ["strategies"], queryFn: getStrategies });
  const [strategyId, setStrategyId] = useState(1);
  const [messages, setMessages] = useState<Message[]>([INITIAL]);
  const [input, setInput] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streamContent]);

  const toBase64 = (file: File): Promise<string> => new Promise(res => { const r = new FileReader(); r.onload = e => res(e.target?.result as string); r.readAsDataURL(file); });

  const addImages = async (files: FileList | null) => {
    if (!files) return;
    const b64s = await Promise.all(Array.from(files).map(toBase64));
    setImages(p => [...p, ...b64s].slice(0, 4));
  };

  const send = useCallback(async () => {
    if (!input.trim() && images.length === 0) return;
    if (streaming) return;
    const userMsg: Message = { role: "user", content: input, images: images.length > 0 ? images : undefined };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setImages([]);
    setStreaming(true);
    setStreamContent("");

    try {
      const res = await fetch("/api/setup/finder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, strategyId }),
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
    } catch { setMessages(m => [...m, { role: "assistant", content: "Connection error." }]); setStreamContent(""); }
    setStreaming(false);
  }, [input, images, messages, strategyId, streaming]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: "#f0f2f8" }}>Setup Finder</h1>
          <p style={{ fontSize: 11, color: "#b0b8cc", marginTop: 2 }}>AI-driven — follows your charts and hunts for setups</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select className="input" style={{ width: "auto" }} value={strategyId} onChange={e => { setStrategyId(Number(e.target.value)); setMessages([INITIAL]); }}>
            {strategies.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button className="btn btn-ghost" onClick={() => setMessages([INITIAL])}>↺ Reset</button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px" }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: "flex", gap: 10, marginBottom: 16, flexDirection: m.role === "user" ? "row-reverse" : "row" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: m.role === "user" ? "rgba(168,85,247,0.2)" : "rgba(99,102,241,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flexShrink: 0 }}>
                {m.role === "user" ? "T" : "🔍"}
              </div>
              <div style={{ maxWidth: "82%" }}>
                {m.images && <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>{m.images.map((src, i) => <img key={i} src={src} alt="" style={{ width: 100, height: 75, objectFit: "cover", borderRadius: 6 }} />)}</div>}
                <div style={{ background: m.role === "user" ? "rgba(168,85,247,0.1)" : "rgba(255,255,255,0.04)", border: `1px solid ${m.role === "user" ? "rgba(168,85,247,0.2)" : "rgba(255,255,255,0.07)"}`, borderRadius: 10, padding: "10px 14px", fontSize: 13, lineHeight: 1.6, color: "#d4d8e8", whiteSpace: "pre-wrap" }}>
                  {m.content}
                </div>
              </div>
            </div>
          ))}
          {streamContent && (
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(99,102,241,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>🔍</div>
              <div style={{ maxWidth: "82%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "10px 14px", fontSize: 13, lineHeight: 1.6, color: "#d4d8e8", whiteSpace: "pre-wrap" }}>
                {streamContent}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "12px 20px", flexShrink: 0 }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          {images.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {images.map((src, i) => (
                <div key={i} style={{ position: "relative", width: 60, height: 50 }}>
                  <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 4 }} />
                  <button onClick={() => setImages(p => p.filter((_,idx) => idx !== i))} style={{ position: "absolute", top: 1, right: 1, background: "rgba(0,0,0,0.8)", border: "none", borderRadius: "50%", color: "#fff", width: 14, height: 14, cursor: "pointer", fontSize: 9 }}>×</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost" style={{ padding: "0 10px", flexShrink: 0 }} onClick={() => fileRef.current?.click()}>📎</button>
            <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => addImages(e.target.files)} />
            <input className="input" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !streaming) send(); }} placeholder="Reply to AI or upload charts..." disabled={streaming} />
            <button className="btn btn-primary" style={{ flexShrink: 0 }} onClick={send} disabled={streaming || (!input.trim() && images.length === 0)}>↑</button>
          </div>
        </div>
      </div>
    </div>
  );
}
