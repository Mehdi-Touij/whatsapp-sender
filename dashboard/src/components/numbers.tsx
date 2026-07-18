"use client";

import { useState, useEffect, useRef } from "react";
import {
  Card, Title, Text, Badge, Button, ProgressBar, Grid, Col, Flex,
  Dialog, DialogPanel, TextInput,
} from "@tremor/react";
import {
  PlusIcon, TrashIcon, QrCodeIcon, PhoneIcon, ChatBubbleLeftIcon,
  ClockIcon, ArrowTrendingUpIcon, BoltIcon, ShieldCheckIcon,
  ExclamationTriangleIcon, CheckCircleIcon, XCircleIcon, ArrowPathIcon,
} from "@heroicons/react/24/outline";
import {
  type NumberInfo, getNumberHealth, healthColor, healthText, isAtRisk, warmupLimitForDay,
} from "@/lib/types";

interface NumbersProps {
  numbers: NumberInfo[];
  onAddNumber: (displayName: string) => Promise<{ instance: string } | null>;
  onDeleteNumber: (instance: string) => Promise<void>;
  showToast: (kind: "error" | "info", msg: string) => void;
}

type QrStatus = "waiting" | "scanning" | "connected" | "error";

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "just now";
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function statusBadge(n: NumberInfo) {
  if (n.status === "restricted") return <Badge color="red">Banned</Badge>;
  if (n.warmupStatus === "warmup") return <Badge color="amber">Warmup D{n.warmupDay}/3</Badge>;
  if (n.status === "connecting") return <Badge color="slate">Connecting</Badge>;
  return <Badge color="emerald">Active</Badge>;
}

function NumberCard({ n, onDelete }: { n: NumberInfo; onDelete: () => void }) {
  const health = getNumberHealth(n);
  const atRisk = isAtRisk(n);
  const dailyPct = n.effectiveLimit > 0 ? (n.msgsToday / n.effectiveLimit) * 100 : 0;
  const hourlyPct = n.hourlyLimit && n.hourlyLimit > 0 ? ((n.msgsThisHour || 0) / n.hourlyLimit) * 100 : 0;
  const nextDayLimit = warmupLimitForDay((n.warmupDay || 0) + 1);
  const progColor: "emerald" | "amber" | "red" = dailyPct >= 90 ? "red" : dailyPct >= 70 ? "amber" : "emerald";
  const hourColor: "emerald" | "amber" | "red" = hourlyPct >= 90 ? "red" : hourlyPct >= 70 ? "amber" : "emerald";

  return (
    <Card decoration={atRisk ? "left" : undefined} decorationColor={atRisk ? "amber" : undefined} className="h-full">
      <div className="space-y-4">
        {/* Header */}
        <Flex justifyContent="between" alignItems="start">
          <Flex justifyContent="start" className="gap-3 min-w-0">
            <div className={[
              "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
              n.status === "restricted" ? "bg-red-50 dark:bg-red-500/10"
                : n.warmupStatus === "warmup" ? "bg-amber-50 dark:bg-amber-500/10"
                : "bg-emerald-50 dark:bg-emerald-500/10",
            ].join(" ")}>
              <PhoneIcon className={[
                "w-5 h-5",
                n.status === "restricted" ? "text-red-500"
                  : n.warmupStatus === "warmup" ? "text-amber-500"
                  : "text-emerald-500",
              ].join(" ")} />
            </div>
            <div className="min-w-0">
              <div className="font-medium text-sm truncate flex items-center gap-1.5 text-tremor-content-strong dark:text-dark-tremor-content-strong">
                {n.displayName}
                <span className={["w-1.5 h-1.5 rounded-full", healthColor(health)].join(" ")} title={healthText(health)} />
              </div>
              <div className="text-xs text-tremor-content truncate dark:text-dark-tremor-content">{n.phone || "Awaiting connection"}</div>
            </div>
          </Flex>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {statusBadge(n)}
            <Button
              variant="light"
              size="xs"
              icon={TrashIcon}
              onClick={onDelete}
              aria-label="Delete number"
              className="text-tremor-content hover:text-red-500 dark:text-dark-tremor-content"
            />
          </div>
        </Flex>

        {atRisk && (
          <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            <ExclamationTriangleIcon className="w-3.5 h-3.5" /> At risk
          </div>
        )}

        {/* Daily progress */}
        <div className="space-y-1.5">
          <Flex justifyContent="between">
            <Text className="text-xs text-tremor-content flex items-center gap-1 dark:text-dark-tremor-content">
              <ChatBubbleLeftIcon className="w-3.5 h-3.5" /> Today
            </Text>
            <Text className="text-xs font-medium tabular-nums">
              {n.msgsToday}<span className="text-tremor-content dark:text-dark-tremor-content">/{n.effectiveLimit}</span>
            </Text>
          </Flex>
          <ProgressBar value={Math.min(100, dailyPct)} color={progColor} showAnimation />
        </div>

        {/* Hourly progress */}
        {n.hourlyLimit && (
          <div className="space-y-1.5">
            <Flex justifyContent="between">
              <Text className="text-xs text-tremor-content flex items-center gap-1 dark:text-dark-tremor-content">
                <BoltIcon className="w-3.5 h-3.5" /> This hour
              </Text>
              <Text className="text-xs font-medium tabular-nums">
                {n.msgsThisHour || 0}<span className="text-tremor-content dark:text-dark-tremor-content">/{n.hourlyLimit}</span>
              </Text>
            </Flex>
            <ProgressBar value={Math.min(100, hourlyPct)} color={hourColor} showAnimation />
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 text-center pt-1 border-t border-tremor-border dark:border-dark-tremor-border">
          <div className="pt-2">
            <div className="text-sm font-semibold tabular-nums flex items-center justify-center gap-1 text-violet-500">
              <ArrowTrendingUpIcon className="w-3.5 h-3.5" />{n.replyRate}
            </div>
            <div className="text-xs text-tremor-content dark:text-dark-tremor-content">Reply rate</div>
          </div>
          <div className="pt-2">
            <div className="text-sm font-semibold tabular-nums text-tremor-content-strong dark:text-dark-tremor-content-strong">{n.replies}</div>
            <div className="text-xs text-tremor-content dark:text-dark-tremor-content">Replies</div>
          </div>
          <div className="pt-2">
            <div className="text-sm font-semibold tabular-nums text-tremor-content-strong dark:text-dark-tremor-content-strong">{n.msgsTotal}</div>
            <div className="text-xs text-tremor-content dark:text-dark-tremor-content">Total sent</div>
          </div>
        </div>

        {/* Warmup banner */}
        {n.warmupStatus === "warmup" && (
          <div className="rounded-tremor-default bg-amber-50 border border-amber-500/20 p-2.5 text-xs space-y-1 dark:bg-amber-500/10">
            <Flex justifyContent="between">
              <span className="font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1">
                <ShieldCheckIcon className="w-3.5 h-3.5" /> Warmup Day {n.warmupDay}/3
              </span>
              <span className="text-tremor-content dark:text-dark-tremor-content">{n.warmupProgress}</span>
            </Flex>
            <Text className="text-tremor-content dark:text-dark-tremor-content">
              Day {Math.min(n.warmupDay + 1, 3)}: limit → <span className="font-medium text-tremor-content-strong dark:text-dark-tremor-content-strong">{nextDayLimit}/day</span>
              {n.warmupDay >= 3 && " · graduates to full capacity"}
            </Text>
          </div>
        )}

        {/* Last message time */}
        <Flex justifyContent="between">
          <Text className="text-xs text-tremor-content flex items-center gap-1 dark:text-dark-tremor-content">
            <ClockIcon className="w-3.5 h-3.5" /> Last message
          </Text>
          <Text className="text-xs text-tremor-content dark:text-dark-tremor-content">{timeAgo(n.lastMessage)}</Text>
        </Flex>
      </div>
    </Card>
  );
}

export function Numbers({ numbers, onAddNumber, onDeleteNumber, showToast }: NumbersProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  // QR dialog state
  const [qrOpen, setQrOpen] = useState(false);
  const [qrName, setQrName] = useState("");
  const [qrInstance, setQrInstance] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [qrStatus, setQrStatus] = useState<QrStatus>("waiting");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const startPolling = (instance: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    let connected = false;
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/numbers?instance=${instance}`, { cache: "no-store" });
        const d = await r.json();
        if (d.qrCode) {
          let code: string = d.qrCode;
          if (code.includes("wa.me")) code = code.split("#").pop() || code;
          if (!code.startsWith("http")) {
            code = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(code)}`;
          }
          setQrUrl(code);
          setQrStatus("scanning");
        }
        if (d.status === "connected" || d.status === "active") {
          setQrStatus("connected");
          connected = true;
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        }
        if (d.status === "error") {
          setQrStatus("error");
          showToast("error", "VPS not responding. Try again.");
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        }
      } catch {
        // ignore transient errors
      }
    }, 2000);
    // Auto-stop after 90s
    setTimeout(() => {
      if (!connected && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        setQrStatus((s) => (s === "connected" ? s : "waiting"));
      }
    }, 90000);
  };

  const handleAdd = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const res = await onAddNumber(name.trim());
    setBusy(false);
    if (res) {
      setName("");
      setOpen(false);
      setQrName(name.trim());
      setQrInstance(res.instance);
      setQrUrl("");
      setQrStatus("waiting");
      setQrOpen(true);
      startPolling(res.instance);
    }
  };

  const closeQr = () => {
    setQrOpen(false);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  return (
    <div className="space-y-6">
      <Flex justifyContent="between" alignItems="center" className="flex-wrap gap-3">
        <div>
          <Title>Numbers</Title>
          <Text>Manage your WhatsApp numbers and warmup</Text>
        </div>
        <Button icon={PlusIcon} onClick={() => setOpen(true)}>Add Number</Button>
      </Flex>

      {numbers.length === 0 ? (
        <Card>
          <div className="py-16 text-center">
            <PhoneIcon className="w-10 h-10 text-tremor-content mx-auto mb-3 opacity-40 dark:text-dark-tremor-content" />
            <Text>No numbers yet. Click "Add Number" to link your first WhatsApp number.</Text>
          </div>
        </Card>
      ) : (
        <Grid numItems={1} numItemsMd={2} numItemsLg={3} className="gap-4">
          {numbers.map((n) => (
            <NumberCard key={n.instance} n={n} onDelete={() => onDeleteNumber(n.instance)} />
          ))}
        </Grid>
      )}

      {/* Add Number dialog */}
      <Dialog open={open} onClose={(o) => { setOpen(o); if (!o) setName(""); }} static={false}>
        <DialogPanel className="max-w-sm">
          <div className="flex items-center gap-2 mb-1">
            <PlusIcon className="w-5 h-5 text-blue-500" />
            <Title className="text-lg">Add a WhatsApp Number</Title>
          </div>
          <Text className="mb-4">Enter a name to identify this number. You'll scan a QR code from your phone to link it.</Text>
          <div className="space-y-3">
            <div>
              <Text className="mb-1">Display name</Text>
              <TextInput
                placeholder="e.g. SIM 2 — IAM"
                value={name}
                onChange={(e: any) => setName(e.target.value)}
                onKeyDown={(e: any) => { if (e.key === "Enter" && name.trim() && !busy) handleAdd(); }}
                autoFocus
              />
              <Text className="text-xs mt-1.5">You'll be asked to scan a QR code via WhatsApp → Linked Devices.</Text>
            </div>
          </div>
          <Flex justifyContent="end" className="gap-2 mt-5">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button icon={busy ? ArrowPathIcon : QrCodeIcon} onClick={handleAdd} disabled={!name.trim() || busy} loading={busy} loadingText="Generating…">
              {busy ? "Generating…" : "Generate QR"}
            </Button>
          </Flex>
        </DialogPanel>
      </Dialog>

      {/* QR display dialog */}
      <Dialog open={qrOpen} onClose={closeQr} static={false}>
        <DialogPanel className="max-w-sm">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <QrCodeIcon className="w-5 h-5 text-blue-500" />
                <Title className="text-lg truncate">Linking {qrName}</Title>
              </div>
              <Text className="text-xs mt-1">Open WhatsApp → Settings → Linked Devices → Link a Device</Text>
            </div>
            <button onClick={closeQr} className="text-tremor-content hover:text-tremor-content-strong dark:text-dark-tremor-content dark:hover:text-dark-tremor-content-strong shrink-0" aria-label="Close">
              <XCircleIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="flex flex-col items-center gap-3 py-2">
            {qrStatus === "waiting" && !qrUrl && (
              <div className="w-[240px] h-[240px] rounded-tremor-default border-2 border-dashed border-tremor-border flex flex-col items-center justify-center text-sm text-tremor-content dark:border-dark-tremor-border dark:text-dark-tremor-content">
                <ArrowPathIcon className="w-6 h-6 animate-spin mb-2 text-blue-500" />
                Generating QR code…
              </div>
            )}
            {qrUrl && qrStatus !== "connected" && (
              <>
                <div className="p-3 bg-white rounded-tremor-default">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrUrl} alt="QR code" width={220} height={220} />
                </div>
                <Badge color="amber" icon={ClockIcon}>Waiting for scan…</Badge>
              </>
            )}
            {qrStatus === "connected" && (
              <div className="text-center py-6">
                <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-2 dark:bg-emerald-500/10">
                  <CheckCircleIcon className="w-7 h-7 text-emerald-500" />
                </div>
                <Text className="font-medium">Number connected!</Text>
                <Text className="text-xs mt-0.5">You can close this window.</Text>
              </div>
            )}
            {qrStatus === "error" && (
              <div className="text-center py-6">
                <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-2 dark:bg-red-500/10">
                  <XCircleIcon className="w-6 h-6 text-red-500" />
                </div>
                <Text className="font-medium">Connection failed</Text>
                <Text className="text-xs mt-0.5">VPS may be unreachable. Try again.</Text>
              </div>
            )}
          </div>

          <Button variant="secondary" className="w-full mt-2" onClick={closeQr}>Close</Button>
        </DialogPanel>
      </Dialog>
    </div>
  );
}