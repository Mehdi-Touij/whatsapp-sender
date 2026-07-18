"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Card, Text, Title, Button, Badge, Flex, Grid, Col, Divider, TabGroup, TabList, Tab,
} from "@tremor/react";
import {
  MoonIcon, SunIcon, Bars3Icon, XMarkIcon, ArrowPathIcon,
  Squares2X2Icon, PhoneIcon, PaperAirplaneIcon, SignalSlashIcon,
  TableCellsIcon,
} from "@heroicons/react/24/outline";
import {
  type NumberInfo, type Campaign, type ReplyItem, type StatusResponse,
} from "@/lib/types";
import { Overview } from "@/components/overview";
import { Numbers } from "@/components/numbers";
import { Campaigns } from "@/components/campaigns";
import { CampaignMonitor } from "@/components/campaign-monitor";
import { Contacts } from "@/components/contacts";

type Tab = "overview" | "numbers" | "campaigns" | "contacts";

export default function Dashboard() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [tab, setTab] = useState<Tab>("overview");
  const [numbers, setNumbers] = useState<NumberInfo[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [totalCapacity, setTotalCapacity] = useState(0);
  const [recentReplies, setRecentReplies] = useState<ReplyItem[]>([]);
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  const [monitorCampaign, setMonitorCampaign] = useState<Campaign | null>(null);
  const [toast, setToast] = useState<{ kind: "error" | "info"; msg: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (kind: "error" | "info", msg: string) => {
    setToast({ kind, msg });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    const saved = (localStorage.getItem("theme") as "light" | "dark") || "light";
    setTheme(saved);
    document.documentElement.classList.toggle("dark", saved === "dark");
  }, []);

  const toggleTheme = () => {
    const next: "light" | "dark" = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
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
        } else if (activeCampaign && activeCampaign.id === campaignId) {
          setActiveCampaign(null);
        }
      }
    } catch {
      // silent — background polling
    }
  }, [activeCampaign?.id, monitorCampaign?.id]);

  // Initial + periodic poll
  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, 5000);
    return () => clearInterval(t);
  }, [fetchStatus]);

  // Poll faster (every 2.5s) when something is actively sending
  useEffect(() => {
    const isSending = activeCampaign?.status === "sending" || monitorCampaign?.status === "sending";
    if (!isSending) return;
    const t = setInterval(fetchStatus, 2500);
    return () => clearInterval(t);
  }, [activeCampaign?.status, monitorCampaign?.status, fetchStatus]);

  // === Number management ===
  const addNumber = async (displayName: string): Promise<{ instance: string } | null> => {
    const instance = "wa-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    try {
      await fetch("/api/numbers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, instanceName: instance }),
      });
      return { instance };
    } catch (e: any) {
      showToast("error", e.message || "Failed to add number");
      return null;
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
    setSidebarOpen(false);
  };

  const manualRefresh = async () => {
    setRefreshing(true);
    await fetchStatus();
    setRefreshing(false);
  };

  const navItems: { id: Tab; label: string; icon: any }[] = [
    { id: "overview", label: "Overview", icon: Squares2X2Icon },
    { id: "numbers", label: "Numbers", icon: PhoneIcon },
    { id: "campaigns", label: "Campaigns", icon: PaperAirplaneIcon },
    { id: "contacts", label: "Contacts", icon: TableCellsIcon },
  ];

  const vpsOk = numbers.length > 0 && totalCapacity > 0;

  return (
    <div className="flex min-h-screen bg-tremor-background-muted dark:bg-dark-tremor-background">
      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between h-14 px-3 border-b border-tremor-border bg-tremor-background dark:border-dark-tremor-border dark:bg-dark-tremor-background">
        <button
          onClick={() => setSidebarOpen(true)}
          className="inline-flex items-center justify-center w-10 h-10 -ml-1 rounded-tremor-small text-tremor-content-strong hover:bg-tremor-background-muted dark:text-dark-tremor-content-strong dark:hover:bg-dark-tremor-background-muted"
          aria-label="Open menu"
        >
          <Bars3Icon className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-tremor-small bg-blue-500 flex items-center justify-center text-white font-bold text-xs">W</div>
          <span className="font-semibold text-sm text-tremor-content-strong dark:text-dark-tremor-content-strong">WhatsApp Sender</span>
        </div>
        <Button variant="light" icon={ArrowPathIcon} size="sm" onClick={manualRefresh} disabled={refreshing} aria-label="Refresh" />
      </header>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={[
          "fixed top-0 left-0 z-50 md:z-30 h-screen w-64 shrink-0",
          "border-r border-tremor-border bg-tremor-background dark:border-dark-tremor-border dark:bg-dark-tremor-background",
          "flex flex-col p-3 gap-1 transition-transform duration-200 ease-out",
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        ].join(" ")}
      >
        <div className="px-2 py-3 mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-tremor-default bg-blue-500 flex items-center justify-center text-white font-bold shrink-0">W</div>
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-sm leading-tight truncate text-tremor-content-strong dark:text-dark-tremor-content-strong">WhatsApp Sender</span>
              <span className="text-xs text-tremor-content dark:text-dark-tremor-content leading-tight">Control panel</span>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden inline-flex items-center justify-center w-9 h-9 -mr-1 rounded-tremor-small text-tremor-content hover:bg-tremor-background-muted dark:hover:bg-dark-tremor-background-muted"
            aria-label="Close menu"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex flex-col gap-1">
          {navItems.map((item) => {
            const active = tab === item.id && !(item.id === "campaigns" && monitorCampaign);
            return (
              <button
                key={item.id}
                onClick={() => { setTab(item.id); setMonitorCampaign(null); setSidebarOpen(false); }}
                className={[
                  "flex items-center gap-3 px-3 py-2.5 rounded-tremor-default text-sm font-medium transition-colors w-full text-left",
                  active
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400"
                    : "text-tremor-content hover:bg-tremor-background-muted hover:text-tremor-content-strong dark:text-dark-tremor-content dark:hover:bg-dark-tremor-background-muted dark:hover:text-dark-tremor-content-strong",
                ].join(" ")}
              >
                <item.icon className="w-5 h-5 shrink-0" /> {item.label}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-2 pt-3">
          <Divider />
          <Flex justifyContent="between" className="px-1">
            <span className="text-xs text-tremor-content flex items-center gap-1.5 dark:text-dark-tremor-content">
              <span className={["w-1.5 h-1.5 rounded-full", vpsOk ? "bg-emerald-500" : "bg-red-500"].join(" ")} />
              {numbers.length === 0 ? "No VPS" : `${totalCapacity}/day`}
            </span>
            <span className="text-xs text-tremor-content dark:text-dark-tremor-content flex items-center gap-1">
              <SignalSlashIcon className={["w-3.5 h-3.5", vpsOk ? "hidden" : ""].join(" ")} />
              VPS
            </span>
          </Flex>
          <Button
            variant="secondary"
            size="sm"
            icon={theme === "dark" ? SunIcon : MoonIcon}
            onClick={toggleTheme}
            className="w-full"
          >
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 md:ml-64 p-4 md:p-6 md:max-w-6xl overflow-x-hidden min-w-0">
        {toast && (
          <Card
            decoration="left"
            className={[
              "mb-4",
              toast.kind === "error"
                ? "border-red-500/40 bg-red-50 dark:bg-red-500/10"
                : "border-blue-500/40 bg-blue-50 dark:bg-blue-500/10",
            ].join(" ")}
          >
            <Flex justifyContent="between" alignItems="center">
              <Text className={toast.kind === "error" ? "text-red-700 dark:text-red-400" : "text-blue-700 dark:text-blue-400"}>
                {toast.msg}
              </Text>
              <button
                onClick={() => setToast(null)}
                className="text-tremor-content hover:text-tremor-content-strong dark:text-dark-tremor-content dark:hover:text-dark-tremor-content-strong shrink-0"
                aria-label="Dismiss"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </Flex>
          </Card>
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
            showToast={showToast}
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
              onOpenCampaign={openCampaign}
              onUpload={uploadCampaign}
              onStartCampaign={startCampaign}
            />
          )
        )}

        {tab === "contacts" && (
          <Contacts />
        )}
      </main>
    </div>
  );
}