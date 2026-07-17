"use client";

import { useState, useEffect } from "react";
import { Upload, Play, Square, RefreshCw, Phone, Send, Plus, Trash2, QrCode, Activity, CheckCircle, XCircle, Clock, Zap } from "lucide-react";

interface NumberInfo {
  instance: string;
  displayName: string;
  phone: string;
  status: string;
  warmupStatus: string;
  warmupDay: number;
  warmupProgress: string;
  msgsToday: number;
  msgsTotal: number;
  replies: number;
  replyRate: string;
  effectiveLimit: number;
  hourlyLimit: number;
  capacityLeft: number;
  lastMessage: string | null;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  total: number;
  sent: number;
  replies: number;
}

export default function Dashboard() {
  const [tab, setTab] = useState<"overview" | "numbers" | "campaigns">("overview");
  const [numbers, setNumbers] = useState<NumberInfo[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [totalCapacity, setTotalCapacity] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showAddNumber, setShowAddNumber] = useState(false);
  const [newNumberName, setNewNumberName] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [addingNumber, setAddingNumber] = useState(false);

  // Campaign form
  const [campaignName, setCampaignName] = useState("");
  const [messageTemplate, setMessageTemplate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`/api/status${activeCampaign ? `?campaignId=${activeCampaign.id}` : ""}`);
      const data = await res.json();
      if (data.numbers) setNumbers(data.numbers);
      if (data.campaigns) setCampaigns(data.campaigns);
      if (data.totalCapacity !== undefined) setTotalCapacity(data.totalCapacity);
      if (data.campaign) setActiveCampaign(data.campaign);
    } catch {}
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [activeCampaign?.id]);

  const addNumber = async () => {
    if (!newNumberName) return;
    setAddingNumber(true);
    setError("");
    setQrCode("");
    try {
      const instance = "wa-" + Date.now().toString(36);
      const res = await fetch("/api/numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: newNumberName, instanceName: instance }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setAddingNumber(false);
        return;
      }
      // Poll for QR code from database (VPS generates it)
      const pollQR = async () => {
        for (let i = 0; i < 40; i++) {
          await new Promise(r => setTimeout(r, 2000));
          try {
            const r2 = await fetch(`/api/numbers?instance=${instance}`);
            const d2 = await r2.json();
            if (d2.qrCode) {
              let code = d2.qrCode;
              if (code.includes("wa.me")) code = code.split("#").pop() || code;
              const encoded = encodeURIComponent(code);
              setQrCode(`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encoded}`);
              setAddingNumber(false);
              fetchStatus();
              return;
            }
            if (d2.status === "error") {
              setError("Failed to generate QR. Make sure VPS is running.");
              setAddingNumber(false);
              return;
            }
          } catch {}
        }
        setError("QR generation timed out. Make sure VPS is running.");
        setAddingNumber(false);
      };
      pollQR();
    } catch (e: any) {
      setError(e.message);
      setAddingNumber(false);
    }
  };

  const deleteNumber = async (instance: string) => {
    if (!confirm("Delete this number?")) return;
    try {
      await fetch("/api/numbers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instance }),
      });
      fetchStatus();
    } catch {}
  };

  const uploadCampaign = async () => {
    if (!file || !campaignName || !messageTemplate) {
      setError("Fill all fields and select a CSV");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("campaignName", campaignName);
      formData.append("messageTemplate", messageTemplate);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setActiveCampaign({ id: data.campaignId, name: campaignName, status: "draft", total: data.count, sent: 0, replies: 0 });
        setCampaignName("");
        setMessageTemplate("");
        setFile(null);
        fetchStatus();
      }
    } catch (e: any) {
      setError(e.message);
    }
    setUploading(false);
  };

  const startCampaign = async () => {
    if (!activeCampaign) return;
    try {
      await fetch("/api/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: activeCampaign.id, action: "start" }),
      });
      fetchStatus();
    } catch {}
  };

  const stopCampaign = async () => {
    if (!activeCampaign) return;
    try {
      await fetch("/api/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: activeCampaign.id, action: "stop" }),
      });
      fetchStatus();
    } catch {}
  };

  // === Overview Tab ===
  const activeCount = numbers.filter(n => n.status === "active" && n.warmupStatus === "active").length;
  const warmupCount = numbers.filter(n => n.warmupStatus === "warmup").length;
  const bannedCount = numbers.filter(n => n.status === "restricted").length;
  const totalSentToday = numbers.reduce((sum, n) => sum + n.msgsToday, 0);
  const totalReplies = numbers.reduce((sum, n) => sum + n.replies, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="flex">
        <div className="w-16 md:w-56 bg-gray-900 text-white min-h-screen p-2 md:p-4 flex flex-col gap-1">
          <div className="px-2 py-3 mb-2 hidden md:block">
            <h1 className="text-lg font-bold">WhatsApp Sender</h1>
            <p className="text-xs text-gray-400">Smart messaging</p>
          </div>
          <button onClick={() => setTab("overview")} className={`flex items-center gap-2 px-3 py-2 rounded text-sm ${tab === "overview" ? "bg-blue-600" : "hover:bg-gray-800"}`}>
            <Activity className="h-4 w-4" /> <span className="hidden md:inline">Overview</span>
          </button>
          <button onClick={() => setTab("numbers")} className={`flex items-center gap-2 px-3 py-2 rounded text-sm ${tab === "numbers" ? "bg-blue-600" : "hover:bg-gray-800"}`}>
            <Phone className="h-4 w-4" /> <span className="hidden md:inline">Numbers</span>
          </button>
          <button onClick={() => setTab("campaigns")} className={`flex items-center gap-2 px-3 py-2 rounded text-sm ${tab === "campaigns" ? "bg-blue-600" : "hover:bg-gray-800"}`}>
            <Send className="h-4 w-4" /> <span className="hidden md:inline">Campaigns</span>
          </button>
        </div>

        {/* Main content */}
        <div className="flex-1 p-4 md:p-8 max-w-4xl">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm mb-4">{error}</div>}

          {/* === OVERVIEW === */}
          {tab === "overview" && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold">Overview</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-lg p-4 shadow">
                  <div className="text-3xl font-bold text-blue-600">{totalSentToday}</div>
                  <div className="text-sm text-gray-500">Messages Today</div>
                </div>
                <div className="bg-white rounded-lg p-4 shadow">
                  <div className="text-3xl font-bold text-green-600">{totalReplies}</div>
                  <div className="text-sm text-gray-500">Total Replies</div>
                </div>
                <div className="bg-white rounded-lg p-4 shadow">
                  <div className="text-3xl font-bold text-purple-600">{totalCapacity}</div>
                  <div className="text-sm text-gray-500">Capacity Left Today</div>
                </div>
                <div className="bg-white rounded-lg p-4 shadow">
                  <div className="text-3xl font-bold">{numbers.length}</div>
                  <div className="text-sm text-gray-500">Total Numbers</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <CheckCircle className="h-6 w-6 text-green-600 mx-auto mb-1" />
                  <div className="text-lg font-bold text-green-700">{activeCount}</div>
                  <div className="text-xs text-gray-500">Active</div>
                </div>
                <div className="bg-yellow-50 rounded-lg p-3 text-center">
                  <Clock className="h-6 w-6 text-yellow-600 mx-auto mb-1" />
                  <div className="text-lg font-bold text-yellow-700">{warmupCount}</div>
                  <div className="text-xs text-gray-500">In Warmup</div>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <XCircle className="h-6 w-6 text-red-600 mx-auto mb-1" />
                  <div className="text-lg font-bold text-red-700">{bannedCount}</div>
                  <div className="text-xs text-gray-500">Banned</div>
                </div>
              </div>

              {activeCampaign && (
                <div className="bg-white rounded-lg p-4 shadow">
                  <h3 className="font-semibold mb-3">Active Campaign: {activeCampaign.name}</h3>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="text-center"><div className="text-2xl font-bold">{activeCampaign.total}</div><div className="text-xs text-gray-500">Total</div></div>
                    <div className="text-center"><div className="text-2xl font-bold text-blue-600">{activeCampaign.sent}</div><div className="text-xs text-gray-500">Sent</div></div>
                    <div className="text-center"><div className="text-2xl font-bold text-green-600">{activeCampaign.replies}</div><div className="text-xs text-gray-500">Replies</div></div>
                    <div className="text-center"><div className="text-2xl font-bold">{activeCampaign.total > 0 ? Math.round((activeCampaign.sent / activeCampaign.total) * 100) : 0}%</div><div className="text-xs text-gray-500">Progress</div></div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* === NUMBERS === */}
          {tab === "numbers" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">WhatsApp Numbers</h2>
                <button onClick={() => setShowAddNumber(!showAddNumber)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded text-sm">
                  <Plus className="h-4 w-4" /> Add Number
                </button>
              </div>

              {showAddNumber && (
                <div className="bg-white rounded-lg p-4 shadow space-y-4">
                  <input className="w-full px-3 py-2 border rounded text-sm" placeholder="Number name (e.g. SIM 2 - IAM)" value={newNumberName} onChange={(e) => setNewNumberName(e.target.value)} />
                  <button onClick={addNumber} disabled={!newNumberName || addingNumber} className="px-4 py-2 bg-green-600 text-white rounded text-sm disabled:opacity-50">
                    {addingNumber ? "Generating QR... (VPS processing)" : "Generate QR Code"}
                  </button>
                  {qrCode && (
                    <div className="text-center">
                      <p className="text-sm text-gray-500 mb-2">Scan with WhatsApp → Settings → Linked Devices → Link a Device</p>
                      <img src={qrCode} alt="QR Code" className="mx-auto rounded border" width={300} height={300} />
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-3">
                {numbers.length === 0 ? (
                  <p className="text-gray-400 text-sm">No numbers yet. Click "Add Number" to link a WhatsApp number.</p>
                ) : (
                  numbers.map((n) => (
                    <div key={n.instance} className="bg-white rounded-lg p-4 shadow">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className={`h-3 w-3 rounded-full ${n.status === "active" ? "bg-green-500" : n.status === "restricted" ? "bg-red-500" : "bg-yellow-500"}`} />
                          <div>
                            <div className="font-semibold text-sm">{n.displayName}</div>
                            {n.phone && <div className="text-xs text-gray-400">{n.phone}</div>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {n.warmupStatus === "warmup" && (
                            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full">
                              <Clock className="inline h-3 w-3" /> Warmup Day {n.warmupDay}/3
                            </span>
                          )}
                          {n.status === "active" && n.warmupStatus === "active" && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Active</span>
                          )}
                          {n.status === "restricted" && (
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">Banned</span>
                          )}
                          <button onClick={() => deleteNumber(n.instance)} className="text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-sm">
                        <div className="text-center"><div className="font-bold">{n.msgsToday}/{n.effectiveLimit}</div><div className="text-xs text-gray-400">Today</div></div>
                        <div className="text-center"><div className="font-bold">{n.msgsTotal}</div><div className="text-xs text-gray-400">Total Sent</div></div>
                        <div className="text-center"><div className="font-bold text-green-600">{n.replies}</div><div className="text-xs text-gray-400">Replies</div></div>
                        <div className="text-center"><div className="font-bold text-purple-600">{n.replyRate}</div><div className="text-xs text-gray-400">Reply Rate</div></div>
                      </div>
                      {/* Progress bar */}
                      <div className="mt-2 bg-gray-100 rounded-full h-1.5">
                        <div className="bg-blue-500 rounded-full h-1.5" style={{ width: `${Math.min((n.msgsToday / n.effectiveLimit) * 100, 100)}%` }} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* === CAMPAIGNS === */}
          {tab === "campaigns" && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold">Campaigns</h2>

              {/* New campaign form */}
              <div className="bg-white rounded-lg p-4 shadow space-y-3">
                <h3 className="font-semibold text-sm">New Campaign</h3>
                <input className="w-full px-3 py-2 border rounded text-sm" placeholder="Campaign name (e.g. Lesson 1)" value={campaignName} onChange={(e) => setCampaignName(e.target.value)} />
                <textarea className="w-full px-3 py-2 border rounded text-sm font-mono" rows={3} placeholder="Message: {Hi|Hello} {name}, your lesson is ready! Reply 1 to confirm." value={messageTemplate} onChange={(e) => setMessageTemplate(e.target.value)} />
                <div className="flex items-center gap-4">
                  <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm" />
                  <button onClick={uploadCampaign} disabled={!file || !campaignName || !messageTemplate || uploading} className="px-4 py-2 bg-blue-600 text-white rounded text-sm disabled:opacity-50">
                    {uploading ? "Uploading..." : "Create Campaign"}
                  </button>
                </div>
                <p className="text-xs text-gray-400">CSV: phone,name (one per line). Use {`{Hi|Hello}`} for spintax, {`{name}`} for personalization.</p>
              </div>

              {/* Active campaign */}
              {activeCampaign && (
                <div className="bg-white rounded-lg p-4 shadow">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold">{activeCampaign.name}</h3>
                    <span className={`text-xs px-3 py-1 rounded-full ${activeCampaign.status === "sending" ? "bg-blue-100 text-blue-700" : activeCampaign.status === "completed" ? "bg-green-100 text-green-700" : "bg-gray-100"}`}>{activeCampaign.status}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-4 mb-3">
                    <div className="text-center"><div className="text-xl font-bold">{activeCampaign.total}</div><div className="text-xs text-gray-400">Total</div></div>
                    <div className="text-center"><div className="text-xl font-bold text-blue-600">{activeCampaign.sent}</div><div className="text-xs text-gray-400">Sent</div></div>
                    <div className="text-center"><div className="text-xl font-bold text-green-600">{activeCampaign.replies}</div><div className="text-xs text-gray-400">Replies</div></div>
                    <div className="text-center"><div className="text-xl font-bold">{activeCampaign.total > 0 ? Math.round((activeCampaign.sent / activeCampaign.total) * 100) : 0}%</div><div className="text-xs text-gray-400">Done</div></div>
                  </div>
                  {(activeCampaign.status === "draft" || activeCampaign.status === "paused") ? (
                    <button onClick={startCampaign} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded text-sm"><Play className="h-4 w-4" /> Start</button>
                  ) : activeCampaign.status === "sending" ? (
                    <button onClick={stopCampaign} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded text-sm"><Square className="h-4 w-4" /> Stop</button>
                  ) : null}
                </div>
              )}

              {/* Recent campaigns */}
              {campaigns.length > 0 && (
                <div className="bg-white rounded-lg p-4 shadow">
                  <h3 className="font-semibold text-sm mb-3">Recent Campaigns</h3>
                  {campaigns.map((c) => (
                    <div key={c.id} className="flex items-center justify-between border-b py-2 text-sm cursor-pointer hover:bg-gray-50" onClick={() => setActiveCampaign(c)}>
                      <span>{c.name}</span>
                      <span className="text-gray-400">{c.sent}/{c.total} · {c.replies} replies</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}