import { useLocation, Link } from "wouter";
import { useEffect, useState, useRef } from "react";

// IndexedDB for full-quality image storage (no 5MB limit)
function openDB(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open("six_eyes_db", 1);
    req.onupgradeneeded = (e: any) => e.target.result.createObjectStore("images");
    req.onsuccess = (e: any) => res(e.target.result);
    req.onerror = () => rej(req.error);
  });
}
async function idbSet(key: string, value: string) {
  const db = await openDB();
  return new Promise<void>((res, rej) => {
    const tx = db.transaction("images", "readwrite");
    tx.objectStore("images").put(value, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
async function idbGet(key: string): Promise<string> {
  const db = await openDB();
  return new Promise((res, rej) => {
    const req = db.transaction("images").objectStore("images").get(key);
    req.onsuccess = (e: any) => res(e.target.result || "");
    req.onerror = () => rej(req.error);
  });
}
async function idbDelete(key: string) {
  const db = await openDB();
  return new Promise<void>((res, rej) => {
    const tx = db.transaction("images", "readwrite");
    tx.objectStore("images").delete(key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

const NAV = [
  { label: "Overview", items: [{ href: "/", icon: "◈", label: "Dashboard" }] },
  { label: "Trading", items: [
    { href: "/trades", icon: "✎", label: "Journal" },
    { href: "/pnl", icon: "▦", label: "PNL Calendar" },
    { href: "/backtest", icon: "⟳", label: "Backtester" },
  ]},
  { label: "Strategy", items: [
    { href: "/strategies", icon: "◆", label: "Strategies" },
    { href: "/ikb", icon: "◉", label: "IKB" },
  ]},
  { label: "AI Tools", items: [
    { href: "/analyze", icon: "🧠", label: "Analyze Trade" },
    { href: "/finder", icon: "🔍", label: "Find Setups" },
    { href: "/memory", icon: "💾", label: "AI Memory" },
  ]},
  { label: "Market", items: [
    { href: "/news", icon: "◎", label: "News & Calendar" },
  ]},
];

const TIMEZONES = [
  { value: "America/New_York", label: "New York (ET)" },
  { value: "America/Chicago", label: "Chicago (CT)" },
  { value: "America/Denver", label: "Denver (MT)" },
  { value: "America/Los_Angeles", label: "Los Angeles (PT)" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Paris", label: "Paris (CET)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "UTC", label: "UTC" },
];

const ACCENT_PRESETS = [
  { label: "Purple", hex: "#a855f7" },
  { label: "Blue", hex: "#3b82f6" },
  { label: "Cyan", hex: "#06b6d4" },
  { label: "Green", hex: "#22c55e" },
  { label: "Amber", hex: "#f59e0b" },
  { label: "Orange", hex: "#f97316" },
  { label: "Rose", hex: "#f43f5e" },
  { label: "Pink", hex: "#ec4899" },
];

function getSessionInfo() {
  const now = new Date();
  const etParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "short",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const weekday = etParts.find(p => p.type === "weekday")?.value ?? "";
  const etH = parseInt(etParts.find(p => p.type === "hour")?.value ?? "0", 10);
  const etM = parseInt(etParts.find(p => p.type === "minute")?.value ?? "0", 10);
  const etMin = etH * 60 + etM;
  if (weekday === "Sat") return { label: "○ MARKET CLOSED", cls: "closed" };
  if (weekday === "Fri" && etMin >= 18 * 60) return { label: "○ MARKET CLOSED", cls: "closed" };
  if (weekday === "Sun" && etMin < 18 * 60) return { label: "○ MARKET CLOSED", cls: "closed" };
  const utc = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (utc >= 0 && utc <= 235) return { label: "● ASIA SESSION", cls: "blue" };
  if (utc >= 360 && utc <= 535) return { label: "● LONDON SESSION", cls: "red" };
  if (utc >= 810 && utc <= 895) return { label: "● NY AM SESSION", cls: "green" };
  if (utc >= 960 && utc <= 1015) return { label: "● NY LUNCH", cls: "amber" };
  if (utc >= 1050 && utc <= 1195) return { label: "● NY PM SESSION", cls: "green" };
  return { label: "○ MARKET CLOSED", cls: "closed" };
}

function applyAccent(hex: string) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  document.documentElement.style.setProperty("--accent", hex);
  document.documentElement.style.setProperty("--accent-rgb", `${r},${g},${b}`);
}

function ls(key: string, fallback: string) {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}
function lsNum(key: string, fallback: number) {
  try { return Number(localStorage.getItem(key) ?? fallback); } catch { return fallback; }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [clock, setClock] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [session, setSession] = useState(getSessionInfo());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"general"|"appearance"|"background">("general");

  const [username, setUsername] = useState(() => ls("six_username", "Trader"));
  const [settingsUsername, setSettingsUsername] = useState(() => ls("six_username", "Trader"));
  const [timezone, setTimezone] = useState(() => ls("six_timezone", "America/New_York"));
  const [bgImage, setBgImage] = useState("");
  const [bgOpacity, setBgOpacity] = useState(() => lsNum("six_bg_opacity", 0.18));
  const [bgDragging, setBgDragging] = useState(false);
  const [avatar, setAvatar] = useState("");
  const [accentColor, setAccentColor] = useState(() => ls("six_accent_color", "#a855f7"));
  const [tempAccent, setTempAccent] = useState(() => ls("six_accent_color", "#a855f7"));
  const [cardOpacity, setCardOpacity] = useState(() => lsNum("six_card_opacity", 38));
  const [tempCardOpacity, setTempCardOpacity] = useState(() => lsNum("six_card_opacity", 38));

  const bgFileRef = useRef<HTMLInputElement>(null);
  const avatarFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    applyAccent(accentColor);
    // Load full-quality images from IndexedDB
    idbGet("six_bg_image").then(v => { if (v) setBgImage(v); });
    idbGet("six_avatar").then(v => { if (v) setAvatar(v); });
  }, []);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      try {
        const t = now.toLocaleTimeString("en-US", { timeZone: timezone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
        const tz = now.toLocaleTimeString("en-US", { timeZone: timezone, timeZoneName: "short" }).split(" ").pop() || "";
        setClock(`${t} ${tz}`);
        const d = now.toLocaleDateString("en-US", { timeZone: timezone, month: "short", day: "numeric", year: "numeric" });
        setDateStr(`Live · ${d}`);
      } catch {
        setClock(now.toLocaleTimeString());
        setDateStr(now.toLocaleDateString());
      }
      setSession(getSessionInfo());
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timezone]);

  function saveSettings() {
    const u = settingsUsername.trim() || "Trader";
    setUsername(u);
    localStorage.setItem("six_username", u);
    localStorage.setItem("six_timezone", timezone);
    localStorage.setItem("six_bg_opacity", String(bgOpacity));
    setAccentColor(tempAccent);
    localStorage.setItem("six_accent_color", tempAccent);
    applyAccent(tempAccent);
    setCardOpacity(tempCardOpacity);
    localStorage.setItem("six_card_opacity", String(tempCardOpacity));
    setSettingsOpen(false);
  }

  function handleBgFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = e => {
      const d = e.target?.result as string;
      setBgImage(d);
      idbSet("six_bg_image", d);
    };
    reader.readAsDataURL(file);
  }

  function handleAvatarFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = e => {
      const d = e.target?.result as string;
      setAvatar(d);
      idbSet("six_avatar", d);
    };
    reader.readAsDataURL(file);
  }

  const initials = (username[0] || "T").toUpperCase();

  const sessionColors: Record<string, { bg: string; color: string; border: string }> = {
    green: { bg: "rgba(34,197,94,0.08)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.18)" },
    blue: { bg: "rgba(59,130,246,0.08)", color: "#3b82f6", border: "1px solid rgba(59,130,246,0.18)" },
    red: { bg: "rgba(239,68,68,0.08)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.18)" },
    amber: { bg: "rgba(245,158,11,0.08)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.18)" },
    closed: { bg: "rgba(255,255,255,0.05)", color: "#707888", border: "1px solid rgba(255,255,255,0.094)" },
  };
  const sc = sessionColors[session.cls] ?? sessionColors.closed;

  const tabStyle = (tab: string) => ({
    fontSize: 11, fontWeight: 600 as const, padding: "6px 14px",
    borderRadius: "5px 5px 0 0" as const, border: "none",
    fontFamily: "monospace", letterSpacing: "0.06em", textTransform: "uppercase" as const,
    cursor: "pointer",
    background: settingsTab === tab ? "rgba(168,85,247,0.12)" : "transparent",
    color: settingsTab === tab ? "var(--accent, #a855f7)" : "#707888",
    borderBottom: settingsTab === tab ? "2px solid var(--accent, #a855f7)" : "2px solid transparent",
    transition: "color 0.15s, background 0.15s",
  });

  const inputStyle: React.CSSProperties = {
    fontSize: 12, padding: "7px 10px", border: "1px solid rgba(255,255,255,0.094)",
    borderRadius: 6, background: "rgba(24,27,34,0.8)", color: "#f0f2f8",
    outline: "none", width: "100%", fontFamily: "inherit",
  };

  return (
    <div style={{
      display: "flex", height: "100vh", overflow: "hidden",
      background: "#0a0c0f",
      ...(bgImage ? {
        backgroundImage: `linear-gradient(rgba(10,12,15,${bgOpacity}),rgba(10,12,15,${bgOpacity})), url(${bgImage})`,
        backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat",
      } : {}),
    }}>

      {/* Sidebar */}
      <aside style={{ width: 220, flexShrink: 0, background: "rgba(17,19,24,0.72)", backdropFilter: "blur(18px)", borderRight: "1px solid rgba(255,255,255,0.059)", display: "flex", flexDirection: "column", overflowY: "auto" }}>
        <div style={{ padding: "16px 18px 14px", borderBottom: "1px solid rgba(255,255,255,0.059)", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#a855f7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0, overflow: "hidden", cursor: "pointer" }} onClick={() => setSettingsOpen(true)}>
            {avatar ? <img src={avatar} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials}
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em", color: "#f0f2f8" }}>Six Eyes</div>
            <div style={{ fontSize: 9, color: "#b0b8cc", fontWeight: 700, fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 1 }}>Trading Software v2.0</div>
          </div>
        </div>

        <nav style={{ flex: 1 }}>
          {NAV.map(section => (
            <div key={section.label}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#707888", padding: "12px 18px 4px", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "monospace" }}>{section.label}</div>
              {section.items.map(item => {
                const active = item.href === "/" ? location === "/" : location.startsWith(item.href);
                return (
                  <Link key={item.href} href={item.href}>
                    <a style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 18px", fontSize: 13, cursor: "pointer", color: active ? "#f0f2f8" : "#b0b8cc", background: active ? "rgba(24,27,34,0.8)" : "transparent", borderLeft: `2px solid ${active ? "var(--accent, #a855f7)" : "transparent"}`, textDecoration: "none", transition: "all 0.15s" }}>
                      <span style={{ fontSize: 13, width: 16, textAlign: "center", opacity: active ? 1 : 0.65, flexShrink: 0 }}>{item.icon}</span>
                      {item.label}
                    </a>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div style={{ padding: "14px 18px", borderTop: "1px solid rgba(255,255,255,0.059)" }}>
          <div style={{ fontFamily: "monospace", fontSize: 12, color: "#f0f2f8", fontWeight: 500, marginBottom: 6 }}>{clock || "Loading..."}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e", display: "inline-block" }} />
            <span style={{ fontSize: 11, color: "#b0b8cc", fontWeight: 600, fontFamily: "monospace" }}>{dateStr}</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Topbar */}
        <div style={{ padding: "10px 20px", borderBottom: "1px solid rgba(255,255,255,0.059)", background: "rgba(17,19,24,0.72)", backdropFilter: "blur(18px)", display: "flex", alignItems: "center", flexShrink: 0, gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <button style={{ width: 32, height: 32, borderRadius: 7, border: "1px solid rgba(255,255,255,0.094)", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#b0b8cc", fontSize: 15 }}>🌙</button>
            <button onClick={() => setSettingsOpen(true)} style={{ width: 32, height: 32, borderRadius: 7, border: "1px solid rgba(255,255,255,0.094)", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#b0b8cc", fontSize: 15 }}>⚙</button>
          </div>
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, fontFamily: "monospace", fontWeight: 500, letterSpacing: "0.05em", display: "inline-flex", alignItems: "center", gap: 4, background: sc.bg, color: sc.color, border: sc.border }}>
              {session.label}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <div onClick={() => setSettingsOpen(true)} style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#a855f7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff", border: "2px solid rgba(255,255,255,0.094)", cursor: "pointer", overflow: "hidden" }}>
              {avatar ? <img src={avatar} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials}
            </div>
            <span onClick={() => setSettingsOpen(true)} style={{ fontSize: 12, fontWeight: 600, color: "#f0f2f8", cursor: "pointer" }}>{username}</span>
          </div>
        </div>

        {/* Page content */}
        <div style={{ flex: 1, overflowY: "auto" }}>{children}</div>
      </div>

      {/* Settings Modal */}
      {settingsOpen && (
        <div onClick={() => setSettingsOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "rgba(17,19,24,0.92)", backdropFilter: "blur(24px)", border: "1px solid rgba(255,255,255,0.094)", borderRadius: 12, width: 440, maxWidth: "95vw", maxHeight: "85vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {/* Modal header */}
            <div style={{ padding: "18px 20px", borderBottom: "1px solid rgba(255,255,255,0.059)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", color: "#f0f2f8" }}>Settings</span>
              <button onClick={() => setSettingsOpen(false)} style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid rgba(255,255,255,0.094)", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#b0b8cc", fontSize: 14 }}>✕</button>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 2, padding: "10px 20px 0", borderBottom: "1px solid rgba(255,255,255,0.059)" }}>
              {(["general","appearance","background"] as const).map(tab => (
                <button key={tab} onClick={() => setSettingsTab(tab)} style={tabStyle(tab)}>
                  {tab === "general" ? "General" : tab === "appearance" ? "Appearance" : "Background"}
                </button>
              ))}
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>

              {/* General tab */}
              {settingsTab === "general" && (
                <>
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 10, color: "#b0b8cc", fontWeight: 700, fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>Account Details</div>
                    <label style={{ fontSize: 10, color: "#707888", display: "block", marginBottom: 5, fontFamily: "monospace", letterSpacing: "0.07em", textTransform: "uppercase" }}>Display Name</label>
                    <input style={inputStyle} value={settingsUsername} onChange={e => setSettingsUsername(e.target.value)} placeholder="Your name" />
                  </div>
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 10, color: "#b0b8cc", fontWeight: 700, fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>Time Zone</div>
                    <label style={{ fontSize: 10, color: "#707888", display: "block", marginBottom: 5, fontFamily: "monospace", letterSpacing: "0.07em", textTransform: "uppercase" }}>Display Time Zone</label>
                    <select style={{ ...inputStyle, appearance: "none" as any, cursor: "pointer" }} value={timezone} onChange={e => setTimezone(e.target.value)}>
                      {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                    </select>
                  </div>
                </>
              )}

              {/* Appearance tab */}
              {settingsTab === "appearance" && (
                <>
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 10, color: "#b0b8cc", fontWeight: 700, fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>Profile Picture</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
                      <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--accent, #a855f7)", overflow: "hidden", border: "2px solid rgba(255,255,255,0.094)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                        {avatar ? <img src={avatar} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <button onClick={() => avatarFileRef.current?.click()} style={{ fontSize: 11, padding: "5px 12px", borderRadius: 6, cursor: "pointer", border: "1px solid rgba(168,85,247,0.4)", background: "transparent", color: "#f0f2f8", fontFamily: "monospace" }}>Upload Photo</button>
                        {avatar && <button onClick={() => { setAvatar(""); idbDelete("six_avatar"); }} style={{ fontSize: 11, padding: "5px 12px", borderRadius: 6, cursor: "pointer", border: "1px solid rgba(239,68,68,0.35)", background: "transparent", color: "#ef4444", fontFamily: "monospace" }}>Remove</button>}
                        <input ref={avatarFileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleAvatarFile(f); e.target.value = ""; }} />
                      </div>
                      <div style={{ fontSize: 10, color: "#707888", fontFamily: "monospace", lineHeight: 1.5 }}>PNG, JPG, WEBP<br />Stored locally</div>
                    </div>
                  </div>

                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 10, color: "#b0b8cc", fontWeight: 700, fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>Accent Colour</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                      {ACCENT_PRESETS.map(p => (
                        <button key={p.hex} title={p.label} onClick={() => { setTempAccent(p.hex); applyAccent(p.hex); }} style={{ width: 28, height: 28, borderRadius: "50%", background: p.hex, border: "none", cursor: "pointer", outline: tempAccent.toLowerCase() === p.hex.toLowerCase() ? "3px solid #fff" : "2px solid transparent", outlineOffset: 2, transition: "outline 0.1s" }} />
                      ))}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div>
                        <label style={{ fontSize: 10, color: "#707888", display: "block", marginBottom: 6, fontFamily: "monospace", letterSpacing: "0.07em", textTransform: "uppercase" }}>Custom Colour</label>
                        <input type="color" value={tempAccent} onChange={e => { setTempAccent(e.target.value); applyAccent(e.target.value); }} style={{ width: 44, height: 36, borderRadius: 6, cursor: "pointer", border: "1px solid rgba(255,255,255,0.094)", background: "rgba(24,27,34,0.8)", padding: 2 }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 10, color: "#707888", display: "block", marginBottom: 6, fontFamily: "monospace", letterSpacing: "0.07em", textTransform: "uppercase" }}>Hex Value</label>
                        <input style={{ ...inputStyle, textTransform: "uppercase" as any }} value={tempAccent} onChange={e => { setTempAccent(e.target.value); if (/^#[0-9a-f]{6}$/i.test(e.target.value)) applyAccent(e.target.value); }} maxLength={7} />
                      </div>
                      <div style={{ width: 36, height: 36, borderRadius: 6, marginTop: 18, background: tempAccent, border: "1px solid rgba(255,255,255,0.094)", flexShrink: 0 }} />
                    </div>
                  </div>

                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 10, color: "#b0b8cc", fontWeight: 700, fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>Card Opacity</div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <label style={{ fontSize: 10, color: "#707888", fontFamily: "monospace", letterSpacing: "0.07em", textTransform: "uppercase" }}>Glass Card Transparency</label>
                      <span style={{ fontSize: 10, color: "var(--accent, #a855f7)", fontFamily: "monospace" }}>{tempCardOpacity}%</span>
                    </div>
                    <input type="range" min={5} max={95} step={1} value={tempCardOpacity} onChange={e => { setTempCardOpacity(Number(e.target.value)); }} style={{ width: "100%", accentColor: "var(--accent, #a855f7)" } as any} />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#707888", fontFamily: "monospace", marginTop: 3 }}>
                      <span>More transparent</span><span>More solid</span>
                    </div>
                  </div>
                </>
              )}

              {/* Background tab */}
              {settingsTab === "background" && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 10, color: "#b0b8cc", fontWeight: 700, fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>Custom Background</div>
                  <div
                    onClick={() => bgFileRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setBgDragging(true); }}
                    onDragLeave={() => setBgDragging(false)}
                    onDrop={e => { e.preventDefault(); setBgDragging(false); const f = e.dataTransfer.files[0]; if (f) handleBgFile(f); }}
                    style={{ border: `2px dashed ${bgDragging ? "var(--accent, #a855f7)" : "rgba(168,85,247,0.3)"}`, borderRadius: 8, padding: "28px 20px", textAlign: "center", cursor: "pointer", background: bgDragging ? "rgba(168,85,247,0.08)" : "rgba(255,255,255,0.02)", transition: "border-color 0.15s", marginBottom: 14 }}
                  >
                    <div style={{ fontSize: 22, marginBottom: 8, opacity: 0.5 }}>🖼</div>
                    <div style={{ fontSize: 12, color: "#f0f2f8", fontWeight: 600, marginBottom: 4 }}>{bgImage ? "Click or drag to replace" : "Click or drag to upload"}</div>
                    <div style={{ fontSize: 10, color: "#707888", fontFamily: "monospace" }}>PNG, JPG, WEBP · Stored locally in your browser</div>
                    <input ref={bgFileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleBgFile(f); e.target.value = ""; }} />
                  </div>
                  {bgImage && (
                    <div style={{ marginBottom: 14 }}>
                      <label style={{ fontSize: 10, color: "#707888", fontFamily: "monospace", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6, display: "block" }}>Preview</label>
                      <div style={{ position: "relative", borderRadius: 8, overflow: "hidden", height: 100 }}>
                        <img src={bgImage} alt="bg" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        <button onClick={e => { e.stopPropagation(); setBgImage(""); idbDelete("six_bg_image"); }} style={{ position: "absolute", top: 6, right: 6, background: "rgba(10,12,15,0.8)", border: "1px solid rgba(239,68,68,0.4)", color: "#ef4444", borderRadius: 5, padding: "3px 8px", cursor: "pointer", fontSize: 10, fontWeight: 600, fontFamily: "monospace" }}>✕ Remove</button>
                      </div>
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <label style={{ fontSize: 10, color: "#707888", fontFamily: "monospace", letterSpacing: "0.07em", textTransform: "uppercase" }}>Darkness Overlay</label>
                    <span style={{ fontSize: 10, color: "var(--accent, #a855f7)", fontFamily: "monospace" }}>{Math.round(bgOpacity * 100)}%</span>
                  </div>
                  <input type="range" min={0} max={0.95} step={0.01} value={bgOpacity} onChange={e => { setBgOpacity(Number(e.target.value)); localStorage.setItem("six_bg_opacity", e.target.value); }} style={{ width: "100%", accentColor: "var(--accent, #a855f7)" } as any} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#707888", fontFamily: "monospace", marginTop: 3 }}>
                    <span>More visible</span><span>Darker</span>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: "14px 20px", borderTop: "1px solid rgba(255,255,255,0.059)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => { applyAccent(accentColor); setTempAccent(accentColor); setTempCardOpacity(cardOpacity); setSettingsOpen(false); }} style={{ fontSize: 11, padding: "5px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.094)", background: "transparent", color: "#b0b8cc", cursor: "pointer" }}>Cancel</button>
              <button onClick={saveSettings} style={{ fontSize: 11, padding: "5px 12px", borderRadius: 6, border: "none", background: "var(--accent, #a855f7)", color: "#fff", cursor: "pointer", fontWeight: 600 }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
