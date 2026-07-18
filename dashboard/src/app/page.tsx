"use client";

import { useState, useEffect, useCallback } from "react";

// ====== TYPES ======
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

// ====== HELPERS ======
const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

function StatusBadge({ status, warmup }: { status: string; warmup?: string }) {
  if (status === "restricted") return <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">● Banned</span>;
  if (warmup === "warmup") return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">● Warmup</span>;
  if (status === "active" || status === "open") return <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">● Active</span>;
  if (status === "connecting") return <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">● Connecting</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-500/10 text-gray-400 border border-gray-500/20">● {status}</span>;
}

function ProgressBar({ value, max, color = "bg-[#3ecf8e]" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return <div className="h-1 bg-[#2e2e2e] rounded-full overflow-hidden"><div className={cx("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} /></div>;
}

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="bg-[#1a1a1a] border border-[#2e2e2e] rounded-lg p-4">
      <div className="text-xs text-[#898989] uppercase tracking-wider mb-1">{label}</div>
      <div className={cx("text-2xl font-semibold", accent || "text-[#fafafa]")}>{value}</div>
      {sub && <div className="text-xs text-[#898989] mt-0.5">{sub}</div>}
    </div>
  );
}

// ====== MAIN ======
export default function Dashboard() {
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

  // === ADD NUMBER ===
  const addNumber = async () => {
    if (!newNumberName) return;
    setAddingNumber(true); setError(""); setQrCode("");
    try {
      const instance = "wa-" + Date.now().toString(36);
      const res = await fetch("/api/numbers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: newNumberName, instanceName: instance }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); setAddingNumber(false); return; }
      // Poll for QR
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

  // === CAMPAIGN ===
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

  // === COMPUTED ===
  const activeCount = numbers.filter(n => n.status === "active" && n.warmupStatus === "active").length;
  const warmupCount = numbers.filter(n => n.warmupStatus === "warmup").length;
  const bannedCount = numbers.filter(n => n.status === "restricted").length;
  const totalSentToday = numbers.reduce((s, n) => s + n.msgsToday, 0);
  const totalReplies = numbers.reduce((s, n) => s + n.replies, 0);
  const replyRate = totalSentToday > 0 ? ((totalReplies / totalSentToday) * 100).toFixed(1) : "0";

  const navItem = (id: typeof tab, label: string, icon: string) => (
    <button onClick={() => setTab(id)} className={cx("flex items-center gap-3 px-3 py-2 rounded-md text-sm w-full", tab === id ? "bg-[#2e2e2e] text-[#fafafa]" : "text-[#898989] hover:text-[#fafafa] hover:bg-[#1a1a1a]")}>
      <span className="text-base">{icon}</span> {label}
    </button>
  );

  return (
    <div className="flex min-h-screen bg-[#171717]">
      {/* SIDEBAR */}
      <aside className="w-56 bg-[#1a1a1a] border-r border-[#2e2e2e] flex flex-col p-3 gap-1">
        <div className="px-3 py-4 mb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-[#3ecf8e] flex items-center justify-center text-[#171717] font-bold text-sm">W</div>
            <span className="font-semibold text-sm">WhatsApp Sender</span>
          </div>
        </div>
        {navItem("overview", "Overview", "📊")}
        {navItem("numbers", "Numbers", "📱")}
        {navItem("campaigns", "Campaigns", "📨")}
        <div className="mt-auto px-3 py-2 text-xs text-[#898989]">
          <div className="flex items-center gap-2"><span className={cx("w-1.5 h-1.5 rounded-full", totalCapacity > 0 ? "bg-green-500" : "bg-red-500")} /> VPS {totalCapacity > 0 ? "Connected" : "Offline"}</div>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 p-6 md:p-8 max-w-5xl">
        {error && <div className="mb-4 px-4 py-3 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

        {/* === OVERVIEW === */}
        {tab === "overview" && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold">Overview</h1>
              <p className="text-sm text-[#898989] mt-1">Real-time messaging stats across all numbers</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Sent Today" value={totalSentToday} accent="text-[#3ecf8e]" />
              <StatCard label="Replies" value={totalReplies} accent="text-[#3b82f6]" />
              <StatCard label="Reply Rate" value={`${replyRate}%`} accent="text-[#a855f7]" />
              <StatCard label="Capacity Left" value={totalCapacity} sub="messages remaining today" />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-[#1a1a1a] border border-[#2e2e2e] rounded-lg p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center text-lg">✅</div>
                <div><div className="text-xl font-semibold text-green-400">{activeCount}</div><div className="text-xs text-[#898989]">Active Numbers</div></div>
              </div>
              <div className="bg-[#1a1a1a] border border-[#2e2e2e] rounded-lg p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center text-lg">⏳</div>
                <div><div className="text-xl font-semibold text-yellow-400">{warmupCount}</div><div className="text-xs text-[#898989]">In Warmup</div></div>
              </div>
              <div className="bg-[#1a1a1a] border border-[#2e2e2e] rounded-lg p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-lg">🚫</div>
                <div><div className="text-xl font-semibold text-red-400">{bannedCount}</div><div className="text-xs text-[#898989]">Banned</div></div>
              </div>
            </div>

            {activeCampaign && (
              <div className="bg-[#1a1a1a] border border-[#2e2e2e] rounded-lg p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-sm">Active Campaign: {activeCampaign.name}</h3>
                  <span className={cx("text-xs px-3 py-1 rounded-full", activeCampaign.status === "sending" ? "bg-blue-500/10 text-blue-400" : activeCampaign.status === "completed" ? "bg-green-500/10 text-green-400" : "bg-gray-500/10 text-gray-400")}>{activeCampaign.status}</span>
                </div>
                <div className="grid grid-cols-4 gap-4 mb-3">
                  <div><div className="text-xl font-semibold">{(activeCampaign.total_recipients || activeCampaign.total || 0)}</div><div className="text-xs text-[#898989]">Total</div></div>
                  <div><div className="text-xl font-semibold text-[#3ecf8e]">{(activeCampaign.sent_count || activeCampaign.sent || 0)}</div><div className="text-xs text-[#898989]">Sent</div></div>
                  <div><div className="text-xl font-semibold text-[#3b82f6]">{(activeCampaign.reply_count || activeCampaign.replies || 0)}</div><div className="text-xs text-[#898989]">Replies</div></div>
                  <div><div className="text-xl font-semibold">{activeCampaign.total_recipients || activeCampaign.total ? Math.round(((activeCampaign.sent_count || activeCampaign.sent || 0) / (activeCampaign.total_recipients || activeCampaign.total || 1)) * 100) : 0}%</div><div className="text-xs text-[#898989]">Progress</div></div>
                </div>
                <ProgressBar value={(activeCampaign.sent_count || activeCampaign.sent || 0)} max={(activeCampaign.total_recipients || activeCampaign.total || 1)} />
              </div>
            )}

            {/* Recent numbers */}
            <div>
              <h3 className="text-sm font-semibold text-[#898989] uppercase tracking-wider mb-3">Your Numbers</h3>
              <div className="space-y-2">
                {numbers.length === 0 ? <p className="text-sm text-[#898989]">No numbers yet. Go to Numbers tab to add one.</p> : numbers.map(n => (
                  <div key={n.instance} className="bg-[#1a1a1a] border border-[#2e2e2e] rounded-lg p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cx("w-8 h-8 rounded-full flex items-center justify-center text-sm", n.status === "restricted" ? "bg-red-500/10" : n.warmupStatus === "warmup" ? "bg-yellow-500/10" : "bg-green-500/10")}>{n.status === "restricted" ? "🚫" : n.warmupStatus === "warmup" ? "⏳" : "📱"}</div>
                      <div><div className="text-sm font-medium">{n.displayName}</div><div className="text-xs text-[#898989]">{n.msgsToday}/{n.effectiveLimit} sent today</div></div>
                    </div>
                    <StatusBadge status={n.status} warmup={n.warmupStatus} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* === NUMBERS === */}
        {tab === "numbers" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div><h1 className="text-2xl font-semibold">Numbers</h1><p className="text-sm text-[#898989] mt-1">Manage your WhatsApp numbers</p></div>
              <button onClick={() => { setShowAddNumber(!showAddNumber); setQrCode(""); setError(""); }} className="px-4 py-2 bg-[#3ecf8e] text-[#171717] rounded-md text-sm font-medium hover:bg-[#00c573]">+ Add Number</button>
            </div>

            {showAddNumber && (
              <div className="bg-[#1a1a1a] border border-[#2e2e2e] rounded-lg p-5 space-y-4">
                <div>
                  <label className="text-xs text-[#898989] uppercase tracking-wider mb-2 block">Number Name</label>
                  <input className="w-full px-3 py-2 bg-[#171717] border border-[#2e2e2e] rounded-md text-sm text-[#fafafa] focus:border-[#3ecf8e] focus:outline-none" placeholder="e.g. SIM 2 - IAM" value={newNumberName} onChange={e => setNewNumberName(e.target.value)} />
                </div>
                <button onClick={addNumber} disabled={!newNumberName || addingNumber} className="px-4 py-2 bg-[#3ecf8e] text-[#171717] rounded-md text-sm font-medium disabled:opacity-50 hover:bg-[#00c573]">
                  {addingNumber ? "Generating QR..." : "Generate QR Code"}
                </button>
                {addingNumber && <p className="text-xs text-[#898989]">Waiting for VPS to generate QR code...</p>}
                {qrCode && (
                  <div className="text-center pt-2">
                    <p className="text-sm text-[#898989] mb-3">📱 Open WhatsApp → Settings → Linked Devices → Link a Device</p>
                    <div className="inline-block p-3 bg-white rounded-lg"><img src={qrCode} alt="QR Code" width={250} height={250} /></div>
                    <p className="text-xs text-[#898989] mt-2">Scan with your phone to link this number</p>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-3">
              {numbers.length === 0 ? <div className="bg-[#1a1a1a] border border-[#2e2e2e] rounded-lg p-8 text-center"><p className="text-sm text-[#898989]">No numbers yet. Click "Add Number" to link your first WhatsApp number.</p></div> : numbers.map(n => (
                <div key={n.instance} className="bg-[#1a1a1a] border border-[#2e2e2e] rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={cx("w-10 h-10 rounded-full flex items-center justify-center", n.status === "restricted" ? "bg-red-500/10" : n.warmupStatus === "warmup" ? "bg-yellow-500/10" : "bg-green-500/10")}>
                        <span className="text-lg">{n.status === "restricted" ? "🚫" : n.warmupStatus === "warmup" ? "⏳" : "📱"}</span>
                      </div>
                      <div>
                        <div className="font-medium text-sm">{n.displayName}</div>
                        {n.phone && <div className="text-xs text-[#898989]">{n.phone}</div>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={n.status} warmup={n.warmupStatus} />
                      {n.warmupStatus === "warmup" && <span className="text-xs text-[#898989]">Day {n.warmupDay}/3</span>}
                      <button onClick={() => deleteNumber(n.instance)} className="text-[#898989] hover:text-red-400 ml-2"><span className="text-sm">🗑</span></button>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-3 mb-3">
                    <div className="text-center"><div className="text-sm font-semibold">{n.msgsToday}/{n.effectiveLimit}</div><div className="text-xs text-[#898989]">Today</div></div>
                    <div className="text-center"><div className="text-sm font-semibold">{n.msgsTotal}</div><div className="text-xs text-[#898989]">Total</div></div>
                    <div className="text-center"><div className="text-sm font-semibold text-[#3b82f6]">{n.replies}</div><div className="text-xs text-[#898989]">Replies</div></div>
                    <div className="text-center"><div className="text-sm font-semibold text-[#a855f7]">{n.replyRate}</div><div className="text-xs text-[#898989]">Reply Rate</div></div>
                  </div>
                  <ProgressBar value={n.msgsToday} max={n.effectiveLimit} color={n.warmupStatus === "warmup" ? "bg-yellow-500" : "bg-[#3ecf8e]"} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* === CAMPAIGNS === */}
        {tab === "campaigns" && (
          <div className="space-y-6">
            <div><h1 className="text-2xl font-semibold">Campaigns</h1><p className="text-sm text-[#898989] mt-1">Create and manage messaging campaigns</p></div>

            {/* New Campaign */}
            <div className="bg-[#1a1a1a] border border-[#2e2e2e] rounded-lg p-5 space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-[#898989]">New Campaign</h3>
              <div>
                <label className="text-xs text-[#898989] mb-1 block">Campaign Name</label>
                <input className="w-full px-3 py-2 bg-[#171717] border border-[#2e2e2e] rounded-md text-sm focus:border-[#3ecf8e] focus:outline-none" placeholder="e.g. Lesson 1 - Introduction" value={campaignName} onChange={e => setCampaignName(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-[#898989] mb-1 block">Message Template</label>
                <textarea className="w-full px-3 py-2 bg-[#171717] border border-[#2e2e2e] rounded-md text-sm font-mono focus:border-[#3ecf8e] focus:outline-none" rows={3} placeholder="{Hi|Hello|Salam} {name}, your Lesson 1 is ready! Reply 1 to confirm." value={messageTemplate} onChange={e => setMessageTemplate(e.target.value)} />
                <p className="text-xs text-[#898989] mt-1">Use {`{Hi|Hello|Salam}`} for spintax (random greeting each time) and {`{name}`} for personalization.</p>
              </div>
              <div>
                <label className="text-xs text-[#898989] mb-1 block">CSV File (phone,name)</label>
                <div className="flex items-center gap-3">
                  <input type="file" accept=".csv" onChange={e => setFile(e.target.files?.[0] || null)} className="text-sm text-[#898989] file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border-0 file:bg-[#2e2e2e] file:text-[#fafafa] file:text-sm hover:file:bg-[#363636]" />
                  <button onClick={uploadCampaign} disabled={!file || !campaignName || !messageTemplate || uploading} className="px-4 py-2 bg-[#3ecf8e] text-[#171717] rounded-md text-sm font-medium disabled:opacity-50 hover:bg-[#00c573]">{uploading ? "Creating..." : "Create Campaign"}</button>
                </div>
              </div>
            </div>

            {/* Active Campaign */}
            {activeCampaign && (
              <div className="bg-[#1a1a1a] border border-[#2e2e2e] rounded-lg p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">{activeCampaign.name}</h3>
                  <span className={cx("text-xs px-3 py-1 rounded-full", activeCampaign.status === "sending" ? "bg-blue-500/10 text-blue-400" : activeCampaign.status === "completed" ? "bg-green-500/10 text-green-400" : "bg-gray-500/10 text-gray-400")}>{activeCampaign.status}</span>
                </div>
                <div className="grid grid-cols-4 gap-4 mb-4">
                  <div><div className="text-xl font-semibold">{(activeCampaign.total_recipients || activeCampaign.total || 0)}</div><div className="text-xs text-[#898989]">Total Recipients</div></div>
                  <div><div className="text-xl font-semibold text-[#3ecf8e]">{(activeCampaign.sent_count || activeCampaign.sent || 0)}</div><div className="text-xs text-[#898989]">Sent</div></div>
                  <div><div className="text-xl font-semibold text-[#3b82f6]">{(activeCampaign.reply_count || activeCampaign.replies || 0)}</div><div className="text-xs text-[#898989]">Replies</div></div>
                  <div><div className="text-xl font-semibold text-[#a855f7]">{activeCampaign.total_recipients || activeCampaign.total ? Math.round(((activeCampaign.sent_count || activeCampaign.sent || 0) / (activeCampaign.total_recipients || activeCampaign.total || 1)) * 100) : 0}%</div><div className="text-xs text-[#898989]">Progress</div></div>
                </div>
                <ProgressBar value={(activeCampaign.sent_count || activeCampaign.sent || 0)} max={(activeCampaign.total_recipients || activeCampaign.total || 1)} />
                <div className="mt-4">
                  {(activeCampaign.status === "draft" || activeCampaign.status === "paused") ? (
                    <button onClick={startCampaign} className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-500">▶ Start Campaign</button>
                  ) : activeCampaign.status === "sending" ? (
                    <button onClick={stopCampaign} className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-500">⏸ Stop Campaign</button>
                  ) : null}
                </div>
              </div>
            )}

            {/* Recent Campaigns */}
            {campaigns.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-[#898989] mb-3">Recent Campaigns</h3>
                <div className="bg-[#1a1a1a] border border-[#2e2e2e] rounded-lg divide-y divide-[#2e2e2e]">
                  {campaigns.map(c => (
                    <div key={c.id} onClick={() => setActiveCampaign(c)} className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[#1c1c1c]">
                      <span className="text-sm">{c.name}</span>
                      <span className="text-xs text-[#898989]">{c.sent_count || c.sent || 0}/{c.total_recipients || c.total || 0} sent · {c.reply_count || c.replies || 0} replies</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}