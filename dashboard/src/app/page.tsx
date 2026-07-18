"use client";

import { useState, useEffect, useCallback } from "react";
import { useTheme } from "./theme-provider";

interface NumberInfo {
  instance: string; displayName: string; phone: string; status: string;
  warmupStatus: string; warmupDay: number; warmupProgress: string;
  msgsToday: number; msgsTotal: number; replies: number; replyRate: string;
  effectiveLimit: number; hourlyLimit: number; capacityLeft: number; lastMessage: string | null;
}
interface Campaign {
  id: string; name: string; status: string;
  total_recipients?: number; total?: number;
  sent_count?: number; sent?: number;
  reply_count?: number; replies?: number;
}

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

function StatusBadge({ status, warmup }: { status: string; warmup?: string }) {
  if (status === "restricted") return <span style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }} className="text-xs px-2 py-0.5 rounded-full">● Banned</span>;
  if (warmup === "warmup") return <span style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.2)" }} className="text-xs px-2 py-0.5 rounded-full">● Warmup</span>;
  if (status === "active" || status === "open") return <span style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.2)" }} className="text-xs px-2 py-0.5 rounded-full">● Active</span>;
  if (status === "connecting") return <span style={{ background: "rgba(59,130,246,0.1)", color: "#3b82f6", border: "1px solid rgba(59,130,246,0.2)" }} className="text-xs px-2 py-0.5 rounded-full">● Connecting</span>;
  return <span style={{ background: "rgba(156,163,175,0.1)", color: "#9ca3af", border: "1px solid rgba(156,163,175,0.2)" }} className="text-xs px-2 py-0.5 rounded-full">● {status}</span>;
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return <div style={{ background: "var(--border)" }} className="h-1.5 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} /></div>;
}

export default function Dashboard() {
  const { theme, toggle } = useTheme();
  const [tab, setTab] = useState<"overview" | "numbers" | "campaigns">("overview");
  const [numbers, setNumbers] = useState<NumberInfo[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [totalCapacity, setTotalCapacity] = useState(0);
  const [error, setError] = useState("");
  const [showAddNumber, setShowAddNumber] = useState(false);
  const [newNumberName, setNewNumberName] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [addingNumber, setAddingNumber] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [messageTemplate, setMessageTemplate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/status${activeCampaign ? `?campaignId=${activeCampaign.id}` : ""}`);
      const data = await res.json();
      if (data.numbers) setNumbers(data.numbers);
      if (data.campaigns) setCampaigns(data.campaigns);
      if (data.totalCapacity !== undefined) setTotalCapacity(data.totalCapacity);
      if (data.campaign) setActiveCampaign(data.campaign);
    } catch {}
  }, [activeCampaign?.id]);

  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, 5000);
    return () => clearInterval(t);
  }, [fetchStatus]);

  const addNumber = async () => {
    if (!newNumberName) return;
    setAddingNumber(true); setError(""); setQrCode("");
    try {
      const instance = "wa-" + Date.now().toString(36);
      await fetch("/api/numbers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: newNumberName, instanceName: instance }) });
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 2000));
        try {
          const r2 = await fetch(`/api/numbers?instance=${instance}`);
          const d2 = await r2.json();
          if (d2.qrCode) {
            let code = d2.qrCode;
            if (code.includes("wa.me")) code = code.split("#").pop() || code;
            setQrCode(`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(code)}`);
            setAddingNumber(false); fetchStatus(); return;
          }
          if (d2.status === "error") { setError("VPS not responding"); setAddingNumber(false); return; }
        } catch {}
      }
      setError("QR timeout — VPS not running"); setAddingNumber(false);
    } catch (e: any) { setError(e.message); setAddingNumber(false); }
  };

  const deleteNumber = async (instance: string) => {
    if (!confirm("Delete this number?")) return;
    await fetch("/api/numbers", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instance }) });
    fetchStatus();
  };

  const uploadCampaign = async () => {
    if (!file || !campaignName || !messageTemplate) { setError("Fill all fields and select a CSV"); return; }
    setUploading(true); setError("");
    try {
      const fd = new FormData();
      fd.append("file", file); fd.append("campaignName", campaignName); fd.append("messageTemplate", messageTemplate);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (data.error) { setError(data.error); } else {
        setActiveCampaign({ id: data.campaignId, name: campaignName, status: "draft", total_recipients: data.count, sent_count: 0, reply_count: 0 });
        setCampaignName(""); setMessageTemplate(""); setFile(null); fetchStatus();
      }
    } catch (e: any) { setError(e.message); }
    setUploading(false);
  };

  const startCampaign = async () => {
    if (!activeCampaign) return;
    await fetch("/api/campaign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaignId: activeCampaign.id, action: "start" }) });
    fetchStatus();
  };
  const stopCampaign = async () => {
    if (!activeCampaign) return;
    await fetch("/api/campaign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaignId: activeCampaign.id, action: "stop" }) });
    fetchStatus();
  };

  const activeCount = numbers.filter(n => n.status === "active" && n.warmupStatus === "active").length;
  const warmupCount = numbers.filter(n => n.warmupStatus === "warmup").length;
  const bannedCount = numbers.filter(n => n.status === "restricted").length;
  const totalSentToday = numbers.reduce((s, n) => s + n.msgsToday, 0);
  const totalReplies = numbers.reduce((s, n) => s + n.replies, 0);
  const replyRate = totalSentToday > 0 ? ((totalReplies / totalSentToday) * 100).toFixed(1) : "0";

  const navItem = (id: typeof tab, label: string, icon: string) => (
    <button onClick={() => setTab(id)} className={cx("flex items-center gap-3 px-3 py-2 rounded-md text-sm w-full font-medium", tab === id ? "text-[#3ecf8e]" : "")} style={{ background: tab === id ? "var(--surface)" : "transparent", color: tab === id ? "#3ecf8e" : "var(--text-muted)" }}>
      <span className="text-base">{icon}</span> {label}
    </button>
  );

  const inputStyle = { background: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--text)" };
  const cardStyle = { background: "var(--card)", border: "1px solid var(--border)" };

  return (
    <div className="flex min-h-screen" style={{ background: "var(--bg)" }}>
      {/* SIDEBAR */}
      <aside className="w-56 flex flex-col p-3 gap-1" style={{ background: "var(--sidebar-bg)", borderRight: "1px solid var(--border)" }}>
        <div className="px-3 py-4 mb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-[#3ecf8e] flex items-center justify-center text-white font-bold text-sm">W</div>
            <span className="font-semibold text-sm" style={{ color: "var(--text)" }}>WhatsApp Sender</span>
          </div>
        </div>
        {navItem("overview", "Overview", "📊")}
        {navItem("numbers", "Numbers", "📱")}
        {navItem("campaigns", "Campaigns", "📨")}
        <div className="mt-auto px-3 py-2 flex items-center justify-between">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>VPS {totalCapacity > 0 ? "🟢" : "🔴"}</span>
          <button onClick={toggle} className="px-3 py-1.5 rounded-md text-xs font-medium" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
            {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 p-6 md:p-8 max-w-5xl">
        {error && <div className="mb-4 px-4 py-3 rounded-md text-sm" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444" }}>{error}</div>}

        {/* OVERVIEW */}
        {tab === "overview" && (
          <div className="space-y-6">
            <div><h1 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>Overview</h1><p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Real-time messaging stats across all numbers</p></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { l: "Sent Today", v: totalSentToday, c: "#3ecf8e" },
                { l: "Replies", v: totalReplies, c: "#3b82f6" },
                { l: "Reply Rate", v: `${replyRate}%`, c: "#a855f7" },
                { l: "Capacity Left", v: totalCapacity, c: "var(--text)" },
              ].map(s => (
                <div key={s.l} className="rounded-lg p-4" style={cardStyle}>
                  <div className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>{s.l}</div>
                  <div className="text-2xl font-semibold" style={{ color: s.c }}>{s.v}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[
                { i: "✅", l: "Active", v: activeCount, c: "#22c55e", bg: "rgba(34,197,94,0.1)" },
                { i: "⏳", l: "In Warmup", v: warmupCount, c: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
                { i: "🚫", l: "Banned", v: bannedCount, c: "#ef4444", bg: "rgba(239,68,68,0.1)" },
              ].map(s => (
                <div key={s.l} className="rounded-lg p-4 flex items-center gap-3" style={cardStyle}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg" style={{ background: s.bg }}>{s.i}</div>
                  <div><div className="text-xl font-semibold" style={{ color: s.c }}>{s.v}</div><div className="text-xs" style={{ color: "var(--text-muted)" }}>{s.l}</div></div>
                </div>
              ))}
            </div>
            {activeCampaign && (
              <div className="rounded-lg p-5" style={cardStyle}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-sm" style={{ color: "var(--text)" }}>Active Campaign: {activeCampaign.name}</h3>
                  <span className="text-xs px-3 py-1 rounded-full" style={{ background: activeCampaign.status === "sending" ? "rgba(59,130,246,0.1)" : "rgba(34,197,94,0.1)", color: activeCampaign.status === "sending" ? "#3b82f6" : "#22c55e" }}>{activeCampaign.status}</span>
                </div>
                <div className="grid grid-cols-4 gap-4 mb-3">
                  <div><div className="text-xl font-semibold" style={{ color: "var(--text)" }}>{activeCampaign.total_recipients || activeCampaign.total || 0}</div><div className="text-xs" style={{ color: "var(--text-muted)" }}>Total</div></div>
                  <div><div className="text-xl font-semibold text-[#3ecf8e]">{activeCampaign.sent_count || activeCampaign.sent || 0}</div><div className="text-xs" style={{ color: "var(--text-muted)" }}>Sent</div></div>
                  <div><div className="text-xl font-semibold text-[#3b82f6]">{activeCampaign.reply_count || activeCampaign.replies || 0}</div><div className="text-xs" style={{ color: "var(--text-muted)" }}>Replies</div></div>
                  <div><div className="text-xl font-semibold text-[#a855f7]">{activeCampaign.total_recipients || activeCampaign.total ? Math.round(((activeCampaign.sent_count || activeCampaign.sent || 0) / (activeCampaign.total_recipients || activeCampaign.total || 1)) * 100) : 0}%</div><div className="text-xs" style={{ color: "var(--text-muted)" }}>Progress</div></div>
                </div>
                <ProgressBar value={activeCampaign.sent_count || activeCampaign.sent || 0} max={activeCampaign.total_recipients || activeCampaign.total || 1} color="#3ecf8e" />
              </div>
            )}
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Your Numbers</h3>
              <div className="space-y-2">
                {numbers.length === 0 ? <p className="text-sm" style={{ color: "var(--text-muted)" }}>No numbers yet. Go to Numbers tab to add one.</p> : numbers.map(n => (
                  <div key={n.instance} className="rounded-lg p-3 flex items-center justify-between" style={cardStyle}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm" style={{ background: n.status === "restricted" ? "rgba(239,68,68,0.1)" : n.warmupStatus === "warmup" ? "rgba(245,158,11,0.1)" : "rgba(34,197,94,0.1)" }}>{n.status === "restricted" ? "🚫" : n.warmupStatus === "warmup" ? "⏳" : "📱"}</div>
                      <div><div className="text-sm font-medium" style={{ color: "var(--text)" }}>{n.displayName}</div><div className="text-xs" style={{ color: "var(--text-muted)" }}>{n.msgsToday}/{n.effectiveLimit} sent today</div></div>
                    </div>
                    <StatusBadge status={n.status} warmup={n.warmupStatus} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* NUMBERS */}
        {tab === "numbers" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div><h1 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>Numbers</h1><p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Manage your WhatsApp numbers</p></div>
              <button onClick={() => { setShowAddNumber(!showAddNumber); setQrCode(""); setError(""); }} className="px-4 py-2 bg-[#3ecf8e] text-white rounded-md text-sm font-medium hover:bg-[#00c573]">+ Add Number</button>
            </div>
            {showAddNumber && (
              <div className="rounded-lg p-5 space-y-4" style={cardStyle}>
                <div><label className="text-xs uppercase tracking-wider mb-2 block" style={{ color: "var(--text-muted)" }}>Number Name</label>
                  <input className="w-full px-3 py-2 rounded-md text-sm focus:outline-none focus:border-[#3ecf8e]" style={inputStyle} placeholder="e.g. SIM 2 - IAM" value={newNumberName} onChange={e => setNewNumberName(e.target.value)} /></div>
                <button onClick={addNumber} disabled={!newNumberName || addingNumber} className="px-4 py-2 bg-[#3ecf8e] text-white rounded-md text-sm font-medium disabled:opacity-50 hover:bg-[#00c573]">{addingNumber ? "Generating QR..." : "Generate QR Code"}</button>
                {addingNumber && <p className="text-xs" style={{ color: "var(--text-muted)" }}>Waiting for VPS to generate QR code...</p>}
                {qrCode && <div className="text-center pt-2"><p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>📱 Open WhatsApp → Settings → Linked Devices → Link a Device</p><div className="inline-block p-3 bg-white rounded-lg"><img src={qrCode} alt="QR Code" width={250} height={250} /></div></div>}
              </div>
            )}
            <div className="space-y-3">
              {numbers.length === 0 ? <div className="rounded-lg p-8 text-center" style={cardStyle}><p className="text-sm" style={{ color: "var(--text-muted)" }}>No numbers yet. Click "Add Number" to link your first WhatsApp number.</p></div> : numbers.map(n => (
                <div key={n.instance} className="rounded-lg p-4" style={cardStyle}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: n.status === "restricted" ? "rgba(239,68,68,0.1)" : n.warmupStatus === "warmup" ? "rgba(245,158,11,0.1)" : "rgba(34,197,94,0.1)" }}><span className="text-lg">{n.status === "restricted" ? "🚫" : n.warmupStatus === "warmup" ? "⏳" : "📱"}</span></div>
                      <div><div className="font-medium text-sm" style={{ color: "var(--text)" }}>{n.displayName}</div>{n.phone && <div className="text-xs" style={{ color: "var(--text-muted)" }}>{n.phone}</div>}</div>
                    </div>
                    <div className="flex items-center gap-2"><StatusBadge status={n.status} warmup={n.warmupStatus} />{n.warmupStatus === "warmup" && <span className="text-xs" style={{ color: "var(--text-muted)" }}>Day {n.warmupDay}/3</span>}<button onClick={() => deleteNumber(n.instance)} className="ml-2" style={{ color: "var(--text-muted)" }}><span className="text-sm">🗑</span></button></div>
                  </div>
                  <div className="grid grid-cols-4 gap-3 mb-3">
                    <div className="text-center"><div className="text-sm font-semibold" style={{ color: "var(--text)" }}>{n.msgsToday}/{n.effectiveLimit}</div><div className="text-xs" style={{ color: "var(--text-muted)" }}>Today</div></div>
                    <div className="text-center"><div className="text-sm font-semibold" style={{ color: "var(--text)" }}>{n.msgsTotal}</div><div className="text-xs" style={{ color: "var(--text-muted)" }}>Total</div></div>
                    <div className="text-center"><div className="text-sm font-semibold text-[#3b82f6]">{n.replies}</div><div className="text-xs" style={{ color: "var(--text-muted)" }}>Replies</div></div>
                    <div className="text-center"><div className="text-sm font-semibold text-[#a855f7]">{n.replyRate}</div><div className="text-xs" style={{ color: "var(--text-muted)" }}>Reply Rate</div></div>
                  </div>
                  <ProgressBar value={n.msgsToday} max={n.effectiveLimit} color={n.warmupStatus === "warmup" ? "#f59e0b" : "#3ecf8e"} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CAMPAIGNS */}
        {tab === "campaigns" && (
          <div className="space-y-6">
            <div><h1 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>Campaigns</h1><p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Create and manage messaging campaigns</p></div>
            <div className="rounded-lg p-5 space-y-4" style={cardStyle}>
              <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>New Campaign</h3>
              <div><label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>Campaign Name</label><input className="w-full px-3 py-2 rounded-md text-sm focus:outline-none focus:border-[#3ecf8e]" style={inputStyle} placeholder="e.g. Lesson 1 - Introduction" value={campaignName} onChange={e => setCampaignName(e.target.value)} /></div>
              <div><label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>Message Template</label><textarea className="w-full px-3 py-2 rounded-md text-sm font-mono focus:outline-none focus:border-[#3ecf8e]" style={inputStyle} rows={3} placeholder="{Hi|Hello|Salam} {name}, your Lesson 1 is ready! Reply 1 to confirm." value={messageTemplate} onChange={e => setMessageTemplate(e.target.value)} /><p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Use {`{Hi|Hello|Salam}`} for spintax and {`{name}`} for personalization.</p></div>
              <div><label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>CSV File (phone,name)</label><div className="flex items-center gap-3"><input type="file" accept=".csv" onChange={e => setFile(e.target.files?.[0] || null)} className="text-sm" style={{ color: "var(--text-muted)" }} /><button onClick={uploadCampaign} disabled={!file || !campaignName || !messageTemplate || uploading} className="px-4 py-2 bg-[#3ecf8e] text-white rounded-md text-sm font-medium disabled:opacity-50 hover:bg-[#00c573]">{uploading ? "Creating..." : "Create Campaign"}</button></div></div>
            </div>
            {activeCampaign && (
              <div className="rounded-lg p-5" style={cardStyle}>
                <div className="flex items-center justify-between mb-4"><h3 className="font-semibold" style={{ color: "var(--text)" }}>{activeCampaign.name}</h3><span className="text-xs px-3 py-1 rounded-full" style={{ background: activeCampaign.status === "sending" ? "rgba(59,130,246,0.1)" : "rgba(34,197,94,0.1)", color: activeCampaign.status === "sending" ? "#3b82f6" : "#22c55e" }}>{activeCampaign.status}</span></div>
                <div className="grid grid-cols-4 gap-4 mb-4">
                  <div><div className="text-xl font-semibold" style={{ color: "var(--text)" }}>{activeCampaign.total_recipients || activeCampaign.total || 0}</div><div className="text-xs" style={{ color: "var(--text-muted)" }}>Total</div></div>
                  <div><div className="text-xl font-semibold text-[#3ecf8e]">{activeCampaign.sent_count || activeCampaign.sent || 0}</div><div className="text-xs" style={{ color: "var(--text-muted)" }}>Sent</div></div>
                  <div><div className="text-xl font-semibold text-[#3b82f6]">{activeCampaign.reply_count || activeCampaign.replies || 0}</div><div className="text-xs" style={{ color: "var(--text-muted)" }}>Replies</div></div>
                  <div><div className="text-xl font-semibold text-[#a855f7]">{activeCampaign.total_recipients || activeCampaign.total ? Math.round(((activeCampaign.sent_count || activeCampaign.sent || 0) / (activeCampaign.total_recipients || activeCampaign.total || 1)) * 100) : 0}%</div><div className="text-xs" style={{ color: "var(--text-muted)" }}>Progress</div></div>
                </div>
                <ProgressBar value={activeCampaign.sent_count || activeCampaign.sent || 0} max={activeCampaign.total_recipients || activeCampaign.total || 1} color="#3ecf8e" />
                <div className="mt-4">{(activeCampaign.status === "draft" || activeCampaign.status === "paused") ? <button onClick={startCampaign} className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-500">▶ Start Campaign</button> : activeCampaign.status === "sending" ? <button onClick={stopCampaign} className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-500">⏸ Stop Campaign</button> : null}</div>
              </div>
            )}
            {campaigns.length > 0 && (
              <div><h3 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Recent Campaigns</h3>
                <div className="rounded-lg divide-y" style={{ ...cardStyle, borderColor: "var(--border)" }}>{campaigns.map(c => <div key={c.id} onClick={() => setActiveCampaign(c)} className="flex items-center justify-between px-4 py-3 cursor-pointer hover:opacity-80" style={{ borderColor: "var(--border)" }}><span className="text-sm" style={{ color: "var(--text)" }}>{c.name}</span><span className="text-xs" style={{ color: "var(--text-muted)" }}>{c.sent_count || c.sent || 0}/{c.total_recipients || c.total || 0} sent · {c.reply_count || c.replies || 0} replies</span></div>)}</div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}