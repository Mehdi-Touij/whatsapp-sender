"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Moon, Sun, Activity, Phone, Send, RefreshCw, X, QrCode, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  type NumberInfo, type Campaign, type ReplyItem, type StatusResponse,
} from "@/lib/types";
import { Overview } from "@/components/overview";
import { Numbers } from "@/components/numbers";
import { Campaigns } from "@/components/campaigns";
import { CampaignMonitor } from "@/components/campaign-monitor";

type Tab = "overview" | "numbers" | "campaigns";

export default function Dashboard() {
  const [theme, setTheme] = useState("light");
  const [tab, setTab] = useState<Tab>("overview");
  const [numbers, setNumbers] = useState<NumberInfo[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [totalCapacity, setTotalCapacity] = useState(0);
  const [recentReplies, setRecentReplies] = useState<ReplyItem[]>([]);
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  const [monitorCampaign, setMonitorCampaign] = useState<Campaign | null>(null);
  const [toast, setToast] = useState<{ kind: "error" | "info"; msg: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [polling, setPolling] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // QR modal (separate from Numbers' dialog — for the QR display flow)
  const [qrModal, setQrModal] = useState<{ name: string; qrUrl: string; instance: string } | null>(null);
  const [qrStatus, setQrStatus] = useState<"waiting" | "scanning" | "connected" | "error">("waiting");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const showToast = (kind: "error" | "info", msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchStatus = useCallback(async () => {
    try {
      const campaignId = activeCampaign?.id || monitorCampaign?.id || "";
      const url = `/api/status${campaignId ? `?campaignId=${campaignId}` : ""}`;
      const res = await fetch(url, { cache: "no-store" });
      const data: StatusResponse = await res.json();
      if (data.numbers) setNumbers(data.numbers);
      if (data.campaigns) setCampaigns(data.campaigns);
      if (data.totalCapacity !== undefined) setTotalCapacity(data.totalCapacity);
      if (data.recentReplies) setRecentReplies(data.recentReplies);
      if (data.campaign !== undefined) {
        if (data.campaign) {
          setActiveCampaign(data.campaign);
          if (monitorCampaign && monitorCampaign.id === data.campaign.id) {
            setMonitorCampaign(data.campaign);
          }
        } else if (activeCampaign && !data.campaign && activeCampaign.id === campaignId) {
          // Campaign finished
          setActiveCampaign(null);
        }
      }
    } catch (e) {
      // silent — background polling
    }
  }, [activeCampaign?.id, monitorCampaign?.id]);

  // Initial + periodic poll
  useEffect(() => {
    fetchStatus();
    if (!polling) return;
    const t = setInterval(fetchStatus, 5000);
    return () => clearInterval(t);
  }, [fetchStatus, polling]);

  // Poll faster (every 2.5s) when something is actively sending
  useEffect(() => {
    const isSending = activeCampaign?.status === "sending" || monitorCampaign?.status === "sending";
    if (!isSending) return;
    setPolling(false);
    const t = setInterval(fetchStatus, 2500);
    return () => { clearInterval(t); setPolling(true); };
  }, [activeCampaign?.status, monitorCampaign?.status, fetchStatus]);

  // === Number management ===
  const addNumber = async (displayName: string) => {
    const instance = "wa-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    setQrStatus("waiting");
    setQrModal({ name: displayName, qrUrl: "", instance });
    try {
      await fetch("/api/numbers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, instanceName: instance }),
      });

      let connected = false;
      // Poll for QR code and connection status up to ~90s
      for (let i = 0; i < 45; i++) {
        await new Promise(r => setTimeout(r, 2000));
        try {
          const r = await fetch(`/api/numbers?instance=${instance}`, { cache: "no-store" });
          const d = await r.json();
          if (d.qrCode) {
            let code: string = d.qrCode;
            if (code.includes("wa.me")) code = code.split("#").pop() || code;
            if (!code.startsWith("http")) {
              code = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(code)}`;
            }
            setQrModal(m => m ? { ...m, qrUrl: code } : m);
            setQrStatus("scanning");
          }
          if (d.status === "connected" || d.status === "active") {
            setQrStatus("connected");
            connected = true;
            break;
          }
          if (d.status === "error") {
            setQrStatus("error");
            showToast("error", "VPS not responding. Try again.");
            break;
          }
        } catch {}
      }
      if (!connected && qrStatus !== "error") {
        // Timeout — leave open so user can retry but show waiting
        if (qrStatus !== "connected") setQrStatus("waiting");
      }
      fetchStatus();
    } catch (e: any) {
      setQrStatus("error");
      showToast("error", e.message || "Failed to add number");
    }
  };

  const deleteNumber = async (instance: string) => {
    if (!confirm("Delete this number? This cannot be undone.")) return;
    try {
      await fetch("/api/numbers", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instance }),
      });
      fetchStatus();
      showToast("info", "Number deleted.");
    } catch (e: any) {
      showToast("error", e.message);
    }
  };

  // === Campaign management ===
  const uploadCampaign = async (params: {
    campaignName: string; messageTemplate: string; file: File;
  }): Promise<{ campaignId: string; count: number } | null> => {
    try {
      const fd = new FormData();
      fd.append("file", params.file);
      fd.append("campaignName", params.campaignName);
      fd.append("messageTemplate", params.messageTemplate);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (data.error) {
        showToast("error", data.error);
        return null;
      }
      // Set as active campaign so we can start it from the wizard
      const created: Campaign = {
        id: data.campaignId, name: params.campaignName, status: "draft",
        total_recipients: data.count, sent_count: 0, reply_count: 0,
      };
      setActiveCampaign(created);
      fetchStatus();
      return { campaignId: data.campaignId, count: data.count };
    } catch (e: any) {
      showToast("error", e.message);
      return null;
    }
  };

  const startCampaign = async (campaignId: string) => {
    try {
      await fetch("/api/campaign", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, action: "start" }),
      });
      showToast("info", "Campaign started.");
      fetchStatus();
    } catch (e: any) {
      showToast("error", e.message);
    }
  };

  const stopCampaign = async (campaignId: string) => {
    try {
      await fetch("/api/campaign", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, action: "stop" }),
      });
      showToast("info", "Campaign paused.");
      fetchStatus();
    } catch (e: any) {
      showToast("error", e.message);
    }
  };

  const openCampaign = (c: Campaign) => {
    setMonitorCampaign(c);
    setTab("campaigns");
  };

  const manualRefresh = async () => {
    setRefreshing(true);
    await fetchStatus();
    setRefreshing(false);
  };

  const navItems: { id: Tab; label: string; icon: any }[] = [
    { id: "overview", label: "Overview", icon: Activity },
    { id: "numbers", label: "Numbers", icon: Phone },
    { id: "campaigns", label: "Campaigns", icon: Send },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      {/* Mobile top bar (visible only on small screens) */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between h-14 px-4 border-b bg-card">
        <button
          onClick={() => setSidebarOpen(true)}
          className="inline-flex items-center justify-center w-11 h-11 -ml-2 rounded-md text-foreground hover:bg-accent"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-xs">W</div>
          <span className="font-semibold text-sm">WhatsApp Sender</span>
        </div>
        <Button variant="outline" size="icon" className="h-9 w-9" onClick={manualRefresh} disabled={refreshing} aria-label="Refresh">
          <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
        </Button>
      </header>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar (off-canvas on mobile, static on md+) */}
      <aside
        className={cn(
          "fixed md:sticky top-0 left-0 z-50 md:z-auto h-screen md:h-auto w-64 border-r bg-card flex flex-col p-3 gap-1 shrink-0 transition-transform duration-200 ease-out",
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="px-3 py-4 mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">W</div>
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-sm leading-tight truncate">WhatsApp Sender</span>
              <span className="text-xs text-muted-foreground leading-tight">Control panel</span>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden inline-flex items-center justify-center w-11 h-11 -mr-2 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground shrink-0"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => { setTab(item.id); setMonitorCampaign(null); setSidebarOpen(false); }}
            className={cn(
              "flex items-center gap-3 px-3 min-h-[44px] rounded-md text-sm font-medium transition-colors w-full text-left",
              tab === item.id && !monitorCampaign
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <item.icon className="w-4 h-4 shrink-0" /> {item.label}
          </button>
        ))}

        <div className="mt-auto flex flex-col gap-2">
          <div className="px-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span className={cn("w-1.5 h-1.5 rounded-full", totalCapacity > 0 ? "bg-green-500" : "bg-red-500")} />
              {numbers.length === 0 ? "No VPS" : `${totalCapacity}/day`}
            </span>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={manualRefresh} disabled={refreshing} title="Refresh">
              <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={toggleTheme} className="gap-2 w-full min-h-[40px]">
            {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            {theme === "dark" ? "Light" : "Dark"}
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-4 md:p-6 md:max-w-6xl overflow-x-hidden min-w-0">
        {toast && (
          <div
            className={cn(
              "mb-4 px-4 py-3 rounded-md border text-sm flex items-center justify-between gap-3 animate-fade-in",
              toast.kind === "error"
                ? "bg-destructive/10 border-destructive/30 text-destructive"
                : "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400"
            )}
          >
            <span className="min-w-0">{toast.msg}</span>
            <button onClick={() => setToast(null)} className="opacity-60 hover:opacity-100 inline-flex items-center justify-center w-9 h-9 -mr-2 shrink-0" aria-label="Dismiss">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {tab === "overview" && (
          <Overview
            numbers={numbers}
            campaigns={campaigns}
            totalCapacity={totalCapacity}
            recentReplies={recentReplies}
            activeCampaign={activeCampaign}
            onOpenCampaign={openCampaign}
          />
        )}

        {tab === "numbers" && (
          <Numbers
            numbers={numbers}
            onAddNumber={addNumber}
            onDeleteNumber={deleteNumber}
          />
        )}

        {tab === "campaigns" && (
          monitorCampaign ? (
            <CampaignMonitor
              campaign={monitorCampaign}
              numbers={numbers}
              totalCapacity={totalCapacity}
              onStop={stopCampaign}
              onStart={startCampaign}
              onBack={() => setMonitorCampaign(null)}
            />
          ) : (
            <Campaigns
              numbers={numbers}
              campaigns={campaigns}
              activeCampaign={activeCampaign}
              onStartWizard={() => {}}
              onOpenCampaign={openCampaign}
              onUpload={uploadCampaign}
              onStartCampaign={startCampaign}
            />
          )
        )}
      </main>

      {/* QR modal — shown after Add Number request */}
      {qrModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setQrModal(null)}
        >
          <div
            className="bg-background border rounded-lg shadow-lg max-w-sm w-full p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold flex items-center gap-2"><QrCode className="w-4 h-4" /> Linking {qrModal.name}</h3>
                <p className="text-xs text-muted-foreground mt-1">Open WhatsApp → Settings → Linked Devices → Link a Device</p>
              </div>
              <button onClick={() => setQrModal(null)} className="text-muted-foreground hover:text-foreground inline-flex items-center justify-center w-9 h-9 -mr-2 -mt-2 shrink-0" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col items-center gap-3 py-2">
              {qrStatus === "waiting" && !qrModal.qrUrl && (
                <div className="w-[240px] h-[240px] rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-sm text-muted-foreground">
                  <RefreshCw className="w-6 h-6 animate-spin mb-2" />
                  Generating QR code…
                </div>
              )}
              {qrModal.qrUrl && qrStatus !== "connected" && (
                <>
                  <div className="p-3 bg-white rounded-lg">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrModal.qrUrl} alt="QR code" width={220} height={220} />
                  </div>
                  <Badge variant="secondary">Waiting for scan…</Badge>
                </>
              )}
              {qrStatus === "connected" && (
                <div className="text-center py-6">
                  <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-2">
                    <span className="text-green-500 text-xl">✓</span>
                  </div>
                  <p className="font-medium">Number connected!</p>
                  <p className="text-xs text-muted-foreground mt-0.5">You can close this window.</p>
                </div>
              )}
              {qrStatus === "error" && (
                <div className="text-center py-6">
                  <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-2">
                    <X className="w-6 h-6 text-red-500" />
                  </div>
                  <p className="font-medium">Connection failed</p>
                  <p className="text-xs text-muted-foreground mt-0.5">VPS may be unreachable. Try again.</p>
                </div>
              )}
            </div>

            <Button variant="outline" className="w-full" onClick={() => setQrModal(null)}>Close</Button>
          </div>
        </div>
      )}
    </div>
  );
}