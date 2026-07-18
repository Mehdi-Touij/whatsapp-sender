"use client";

import { useState, useEffect, useCallback } from "react";
import { Moon, Sun, Plus, Trash2, Play, Square, Upload, Phone, Send, Activity, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface NumberInfo {
  instance: string; displayName: string; phone: string; status: string;
  warmupStatus: string; warmupDay: number; msgsToday: number; msgsTotal: number;
  replies: number; replyRate: string; effectiveLimit: number; capacityLeft: number;
}
interface Campaign { id: string; name: string; status: string; total_recipients?: number; total?: number; sent_count?: number; sent?: number; reply_count?: number; replies?: number; }

export default function Dashboard() {
  const [theme, setTheme] = useState("light");
  const [tab, setTab] = useState<"overview" | "numbers" | "campaigns">("overview");
  const [numbers, setNumbers] = useState<NumberInfo[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [totalCapacity, setTotalCapacity] = useState(0);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [adding, setAdding] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [msgTemplate, setMsgTemplate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("theme") || "light";
    setTheme(saved);
    if (saved === "dark") document.documentElement.classList.add("dark");
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    if (next === "dark") document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  };

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

  useEffect(() => { fetchStatus(); const t = setInterval(fetchStatus, 5000); return () => clearInterval(t); }, [fetchStatus]);

  const addNumber = async () => {
    if (!newName) return;
    setAdding(true); setError(""); setQrCode("");
    try {
      const instance = "wa-" + Date.now().toString(36);
      await fetch("/api/numbers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: newName, instanceName: instance }) });
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 2000));
        try {
          const r2 = await fetch(`/api/numbers?instance=${instance}`);
          const d2 = await r2.json();
          if (d2.qrCode) {
            let code = d2.qrCode;
            if (code.includes("wa.me")) code = code.split("#").pop() || code;
            setQrCode(`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(code)}`);
            setAdding(false); fetchStatus(); return;
          }
          if (d2.status === "error") { setError("VPS not responding"); setAdding(false); return; }
        } catch {}
      }
      setError("QR timeout"); setAdding(false);
    } catch (e: any) { setError(e.message); setAdding(false); }
  };

  const deleteNumber = async (instance: string) => {
    if (!confirm("Delete this number?")) return;
    await fetch("/api/numbers", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instance }) });
    fetchStatus();
  };

  const uploadCampaign = async () => {
    if (!file || !campaignName || !msgTemplate) { setError("Fill all fields and select a CSV"); return; }
    setUploading(true); setError("");
    try {
      const fd = new FormData();
      fd.append("file", file); fd.append("campaignName", campaignName); fd.append("messageTemplate", msgTemplate);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (data.error) { setError(data.error); } else {
        setActiveCampaign({ id: data.campaignId, name: campaignName, status: "draft", total_recipients: data.count, sent_count: 0, reply_count: 0 });
        setCampaignName(""); setMsgTemplate(""); setFile(null); fetchStatus();
      }
    } catch (e: any) { setError(e.message); }
    setUploading(false);
  };

  const startCampaign = async () => { if (activeCampaign) { await fetch("/api/campaign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaignId: activeCampaign.id, action: "start" }) }); fetchStatus(); } };
  const stopCampaign = async () => { if (activeCampaign) { await fetch("/api/campaign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaignId: activeCampaign.id, action: "stop" }) }); fetchStatus(); } };

  const activeCount = numbers.filter(n => n.status === "active" && n.warmupStatus === "active").length;
  const warmupCount = numbers.filter(n => n.warmupStatus === "warmup").length;
  const bannedCount = numbers.filter(n => n.status === "restricted").length;
  const totalSentToday = numbers.reduce((s, n) => s + n.msgsToday, 0);
  const totalReplies = numbers.reduce((s, n) => s + n.replies, 0);
  const replyRate = totalSentToday > 0 ? ((totalReplies / totalSentToday) * 100).toFixed(1) : "0";

  const stats = [
    { label: "Sent Today", value: totalSentToday, color: "text-primary" },
    { label: "Replies", value: totalReplies, color: "text-blue-500" },
    { label: "Reply Rate", value: `${replyRate}%`, color: "text-purple-500" },
    { label: "Capacity Left", value: totalCapacity, color: "text-foreground" },
  ];

  const navItems = [
    { id: "overview" as const, label: "Overview", icon: Activity },
    { id: "numbers" as const, label: "Numbers", icon: Phone },
    { id: "campaigns" as const, label: "Campaigns", icon: Send },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-60 border-r bg-card flex flex-col p-3 gap-1">
        <div className="px-3 py-4 mb-2 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">W</div>
          <span className="font-semibold text-sm">WhatsApp Sender</span>
        </div>
        {navItems.map(item => (
          <button key={item.id} onClick={() => setTab(item.id)} className={cn("flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors w-full", tab === item.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
            <item.icon className="w-4 h-4" /> {item.label}
          </button>
        ))}
        <div className="mt-auto flex items-center justify-between px-2">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <span className={cn("w-1.5 h-1.5 rounded-full", totalCapacity > 0 ? "bg-green-500" : "bg-red-500")} /> VPS
          </span>
          <Button variant="outline" size="sm" onClick={toggleTheme} className="gap-2">
            {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            {theme === "dark" ? "Light" : "Dark"}
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-6 md:p-8 max-w-5xl">
        {error && <div className="mb-4 px-4 py-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm">{error}</div>}

        {tab === "overview" && (
          <div className="space-y-6 animate-fade-in">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
              <p className="text-sm text-muted-foreground mt-1">Real-time messaging stats across all numbers</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {stats.map(s => (
                <Card key={s.label}><CardContent className="p-4">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{s.label}</div>
                  <div className={cn("text-2xl font-semibold", s.color)}>{s.value}</div>
                </CardContent></Card>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Card><CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">✅</div>
                <div><div className="text-xl font-semibold text-green-600 dark:text-green-400">{activeCount}</div><div className="text-xs text-muted-foreground">Active</div></div>
              </CardContent></Card>
              <Card><CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center">⏳</div>
                <div><div className="text-xl font-semibold text-yellow-600 dark:text-yellow-400">{warmupCount}</div><div className="text-xs text-muted-foreground">Warmup</div></div>
              </CardContent></Card>
              <Card><CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">🚫</div>
                <div><div className="text-xl font-semibold text-red-600 dark:text-red-400">{bannedCount}</div><div className="text-xs text-muted-foreground">Banned</div></div>
              </CardContent></Card>
            </div>
            {activeCampaign && (
              <Card><CardHeader><div className="flex items-center justify-between"><CardTitle className="text-sm">{activeCampaign.name}</CardTitle><Badge variant={activeCampaign.status === "sending" ? "default" : "secondary"}>{activeCampaign.status}</Badge></div></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-4 mb-3">
                    <div><div className="text-xl font-semibold">{activeCampaign.total_recipients || activeCampaign.total || 0}</div><div className="text-xs text-muted-foreground">Total</div></div>
                    <div><div className="text-xl font-semibold text-primary">{activeCampaign.sent_count || activeCampaign.sent || 0}</div><div className="text-xs text-muted-foreground">Sent</div></div>
                    <div><div className="text-xl font-semibold text-blue-500">{activeCampaign.reply_count || activeCampaign.replies || 0}</div><div className="text-xs text-muted-foreground">Replies</div></div>
                    <div><div className="text-xl font-semibold text-purple-500">{activeCampaign.total_recipients || activeCampaign.total ? Math.round(((activeCampaign.sent_count || activeCampaign.sent || 0) / (activeCampaign.total_recipients || activeCampaign.total || 1)) * 100) : 0}%</div><div className="text-xs text-muted-foreground">Progress</div></div>
                  </div>
                  <Progress value={activeCampaign.total_recipients || activeCampaign.total ? ((activeCampaign.sent_count || activeCampaign.sent || 0) / (activeCampaign.total_recipients || activeCampaign.total || 1)) * 100 : 0} />
                </CardContent>
              </Card>
            )}
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Your Numbers</h3>
              <div className="space-y-2">
                {numbers.length === 0 ? <p className="text-sm text-muted-foreground">No numbers yet. Go to Numbers tab to add one.</p> : numbers.map(n => (
                  <Card key={n.instance}><CardContent className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn("w-8 h-8 rounded-full flex items-center justify-center", n.status === "restricted" ? "bg-red-500/10" : n.warmupStatus === "warmup" ? "bg-yellow-500/10" : "bg-green-500/10")}>{n.status === "restricted" ? "🚫" : n.warmupStatus === "warmup" ? "⏳" : "📱"}</div>
                      <div><div className="text-sm font-medium">{n.displayName}</div><div className="text-xs text-muted-foreground">{n.msgsToday}/{n.effectiveLimit} today</div></div>
                    </div>
                    {n.status === "restricted" ? <Badge variant="destructive">Banned</Badge> : n.warmupStatus === "warmup" ? <Badge variant="warning">Warmup D{n.warmupDay}</Badge> : <Badge variant="success">Active</Badge>}
                  </CardContent></Card>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "numbers" && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
              <div><h1 className="text-2xl font-semibold tracking-tight">Numbers</h1><p className="text-sm text-muted-foreground mt-1">Manage your WhatsApp numbers</p></div>
              <Button onClick={() => { setShowAdd(!showAdd); setQrCode(""); setError(""); }}><Plus className="w-4 h-4" /> Add Number</Button>
            </div>
            {showAdd && (
              <Card><CardContent className="p-5 space-y-4">
                <div><Label htmlFor="name">Number Name</Label><Input id="name" className="mt-1.5" placeholder="e.g. SIM 2 - IAM" value={newName} onChange={e => setNewName(e.target.value)} /></div>
                <Button onClick={addNumber} disabled={!newName || adding}>{adding ? "Generating..." : "Generate QR Code"}</Button>
                {adding && <p className="text-xs text-muted-foreground">Waiting for VPS...</p>}
                {qrCode && <div className="text-center pt-2"><p className="text-sm text-muted-foreground mb-3">📱 WhatsApp → Settings → Linked Devices → Link a Device</p><div className="inline-block p-3 bg-white rounded-lg"><img src={qrCode} alt="QR" width={250} height={250} /></div></div>}
              </CardContent></Card>
            )}
            <div className="space-y-3">
              {numbers.length === 0 ? <Card><CardContent className="p-8 text-center"><p className="text-sm text-muted-foreground">No numbers yet. Click "Add Number" to link your first WhatsApp number.</p></CardContent></Card> : numbers.map(n => (
                <Card key={n.instance}><CardContent className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", n.status === "restricted" ? "bg-red-500/10" : n.warmupStatus === "warmup" ? "bg-yellow-500/10" : "bg-green-500/10")}><span className="text-lg">{n.status === "restricted" ? "🚫" : n.warmupStatus === "warmup" ? "⏳" : "📱"}</span></div>
                      <div><div className="font-medium text-sm">{n.displayName}</div>{n.phone && <div className="text-xs text-muted-foreground">{n.phone}</div>}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {n.status === "restricted" ? <Badge variant="destructive">Banned</Badge> : n.warmupStatus === "warmup" ? <Badge variant="warning">Warmup D{n.warmupDay}/3</Badge> : <Badge variant="success">Active</Badge>}
                      <Button variant="ghost" size="icon" onClick={() => deleteNumber(n.instance)}><Trash2 className="w-4 h-4 text-muted-foreground" /></Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-3 mb-3">
                    <div className="text-center"><div className="text-sm font-semibold">{n.msgsToday}/{n.effectiveLimit}</div><div className="text-xs text-muted-foreground">Today</div></div>
                    <div className="text-center"><div className="text-sm font-semibold">{n.msgsTotal}</div><div className="text-xs text-muted-foreground">Total</div></div>
                    <div className="text-center"><div className="text-sm font-semibold text-blue-500">{n.replies}</div><div className="text-xs text-muted-foreground">Replies</div></div>
                    <div className="text-center"><div className="text-sm font-semibold text-purple-500">{n.replyRate}</div><div className="text-xs text-muted-foreground">Reply Rate</div></div>
                  </div>
                  <Progress value={(n.msgsToday / n.effectiveLimit) * 100} indicatorColor={n.warmupStatus === "warmup" ? "bg-yellow-500" : ""} />
                </CardContent></Card>
              ))}
            </div>
          </div>
        )}

        {tab === "campaigns" && (
          <div className="space-y-6 animate-fade-in">
            <div><h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1><p className="text-sm text-muted-foreground mt-1">Create and manage messaging campaigns</p></div>
            <Card><CardHeader><CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">New Campaign</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div><Label>Campaign Name</Label><Input className="mt-1.5" placeholder="e.g. Lesson 1 - Introduction" value={campaignName} onChange={e => setCampaignName(e.target.value)} /></div>
                <div><Label>Message Template</Label><Textarea className="mt-1.5 font-mono" rows={3} placeholder="{Hi|Hello|Salam} {name}, your Lesson 1 is ready! Reply 1 to confirm." value={msgTemplate} onChange={e => setMsgTemplate(e.target.value)} /><p className="text-xs text-muted-foreground mt-1">Use {`{Hi|Hello|Salam}`} for spintax and {`{name}`} for personalization.</p></div>
                <div><Label>CSV File (phone,name)</Label><div className="flex items-center gap-3 mt-1.5"><Input type="file" accept=".csv" onChange={e => setFile(e.target.files?.[0] || null)} className="text-sm" /><Button onClick={uploadCampaign} disabled={!file || !campaignName || !msgTemplate || uploading}><Upload className="w-4 h-4" />{uploading ? "Creating..." : "Create"}</Button></div></div>
              </CardContent>
            </Card>
            {activeCampaign && (
              <Card><CardHeader><div className="flex items-center justify-between"><CardTitle>{activeCampaign.name}</CardTitle><Badge variant={activeCampaign.status === "sending" ? "default" : "secondary"}>{activeCampaign.status}</Badge></div></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-4 mb-4">
                    <div><div className="text-xl font-semibold">{activeCampaign.total_recipients || activeCampaign.total || 0}</div><div className="text-xs text-muted-foreground">Total</div></div>
                    <div><div className="text-xl font-semibold text-primary">{activeCampaign.sent_count || activeCampaign.sent || 0}</div><div className="text-xs text-muted-foreground">Sent</div></div>
                    <div><div className="text-xl font-semibold text-blue-500">{activeCampaign.reply_count || activeCampaign.replies || 0}</div><div className="text-xs text-muted-foreground">Replies</div></div>
                    <div><div className="text-xl font-semibold text-purple-500">{activeCampaign.total_recipients || activeCampaign.total ? Math.round(((activeCampaign.sent_count || activeCampaign.sent || 0) / (activeCampaign.total_recipients || activeCampaign.total || 1)) * 100) : 0}%</div><div className="text-xs text-muted-foreground">Progress</div></div>
                  </div>
                  <Progress value={activeCampaign.total_recipients || activeCampaign.total ? ((activeCampaign.sent_count || activeCampaign.sent || 0) / (activeCampaign.total_recipients || activeCampaign.total || 1)) * 100 : 0} />
                  <div className="mt-4">
                    {(activeCampaign.status === "draft" || activeCampaign.status === "paused") ? <Button onClick={startCampaign} variant="default"><Play className="w-4 h-4" /> Start Campaign</Button> : activeCampaign.status === "sending" ? <Button onClick={stopCampaign} variant="destructive"><Square className="w-4 h-4" /> Stop Campaign</Button> : null}
                  </div>
                </CardContent>
              </Card>
            )}
            {campaigns.length > 0 && (
              <div><h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Recent Campaigns</h3>
                <Card><CardContent className="p-0">
                  {campaigns.map((c, i) => (<div key={c.id}><div onClick={() => setActiveCampaign(c)} className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-accent">
                    <span className="text-sm">{c.name}</span>
                    <span className="text-xs text-muted-foreground">{c.sent_count || c.sent || 0}/{c.total_recipients || c.total || 0} sent · {c.reply_count || c.replies || 0} replies</span>
                  </div>{i < campaigns.length - 1 && <Separator />}</div>))}
                </CardContent></Card>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}