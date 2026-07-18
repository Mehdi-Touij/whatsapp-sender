"use client";

import { useState } from "react";
import {
  Plus, Trash2, AlertTriangle, QrCode, Loader2, Phone, MessageSquare, Clock,
  TrendingUp, Zap, Shield,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  type NumberInfo, getNumberHealth, healthColor, healthText, isAtRisk, warmupLimitForDay,
} from "@/lib/types";

interface NumbersProps {
  numbers: NumberInfo[];
  onAddNumber: (displayName: string) => Promise<void>;
  onDeleteNumber: (instance: string) => Promise<void>;
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "just now";
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function NumberCard({ n, onDelete }: { n: NumberInfo; onDelete: () => void }) {
  const health = getNumberHealth(n);
  const atRisk = isAtRisk(n);
  const dailyPct = n.effectiveLimit > 0 ? (n.msgsToday / n.effectiveLimit) * 100 : 0;
  const hourlyPct = n.hourlyLimit && n.hourlyLimit > 0
    ? ((n.msgsThisHour || 0) / n.hourlyLimit) * 100 : 0;
  const nextDayLimit = warmupLimitForDay((n.warmupDay || 0) + 1);

  return (
    <Card className={cn("relative overflow-hidden", atRisk && "border-yellow-500/40")}>
      {atRisk && (
        <div className="absolute top-0 right-0 px-2 py-0.5 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 text-xs font-medium rounded-bl-md flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> At risk
        </div>
      )}
      <CardContent className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0",
              n.status === "restricted" ? "bg-red-500/10"
              : n.warmupStatus === "warmup" ? "bg-yellow-500/10"
              : "bg-green-500/10")}>
              <Phone className={cn("w-4 h-4",
                n.status === "restricted" ? "text-red-500"
                : n.warmupStatus === "warmup" ? "text-yellow-500"
                : "text-green-500")} />
            </div>
            <div className="min-w-0">
              <div className="font-medium text-sm truncate flex items-center gap-1.5">
                {n.displayName}
                <span className={cn("w-1.5 h-1.5 rounded-full", healthColor(health))} title={healthText(health)} />
              </div>
              <div className="text-xs text-muted-foreground truncate">{n.phone || "Awaiting connection"}</div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {n.status === "restricted" ? <Badge variant="destructive">Banned</Badge>
              : n.warmupStatus === "warmup" ? <Badge variant="warning">Warmup D{n.warmupDay}/3</Badge>
              : n.status === "connecting" ? <Badge variant="secondary">Connecting</Badge>
              : <Badge variant="success">Active</Badge>}
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onDelete} aria-label="Delete number">
              <Trash2 className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>
        </div>

        {/* Daily progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Today</span>
            <span className="font-medium tabular-nums">{n.msgsToday}<span className="text-muted-foreground">/{n.effectiveLimit}</span></span>
          </div>
          <Progress
            value={Math.min(100, dailyPct)}
            className="h-1.5"
            indicatorColor={dailyPct >= 90 ? "bg-red-500" : dailyPct >= 70 ? "bg-yellow-500" : ""}
          />
        </div>

        {/* Hourly progress */}
        {n.hourlyLimit && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1"><Zap className="w-3 h-3" /> This hour</span>
              <span className="font-medium tabular-nums">{n.msgsThisHour || 0}<span className="text-muted-foreground">/{n.hourlyLimit}</span></span>
            </div>
            <Progress
              value={Math.min(100, hourlyPct)}
              className="h-1.5"
              indicatorColor={hourlyPct >= 90 ? "bg-red-500" : hourlyPct >= 70 ? "bg-yellow-500" : ""}
            />
          </div>
        )}

        <Separator />

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-sm font-semibold tabular-nums flex items-center justify-center gap-1 text-purple-500">
              <TrendingUp className="w-3 h-3" />{n.replyRate}
            </div>
            <div className="text-xs text-muted-foreground">Reply rate</div>
          </div>
          <div>
            <div className="text-sm font-semibold tabular-nums">{n.replies}</div>
            <div className="text-xs text-muted-foreground">Replies</div>
          </div>
          <div>
            <div className="text-sm font-semibold tabular-nums">{n.msgsTotal}</div>
            <div className="text-xs text-muted-foreground">Total sent</div>
          </div>
        </div>

        {/* Warmup banner */}
        {n.warmupStatus === "warmup" && (
          <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 p-2.5 text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-medium text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                <Shield className="w-3 h-3" /> Warmup Day {n.warmupDay}/3
              </span>
              <span className="text-muted-foreground">{n.warmupProgress}</span>
            </div>
            <p className="text-muted-foreground">
              Day {Math.min(n.warmupDay + 1, 3)}: limit → <span className="font-medium text-foreground">{nextDayLimit}/day</span>
              {n.warmupDay >= 3 && " · graduates to full capacity"}
            </p>
          </div>
        )}

        {/* Last message time */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-0.5">
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Last message</span>
          <span>{timeAgo(n.lastMessage)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export function Numbers({ numbers, onAddNumber, onDeleteNumber }: NumbersProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const handleAdd = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onAddNumber(name.trim());
      setName("");
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Numbers</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your WhatsApp numbers and warmup</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4" /> Add Number
        </Button>
      </div>

      {numbers.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Phone className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm text-muted-foreground">No numbers yet. Click "Add Number" to link your first WhatsApp number.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {numbers.map(n => (
            <NumberCard
              key={n.instance}
              n={n}
              onDelete={() => onDeleteNumber(n.instance)}
            />
          ))}
        </div>
      )}

      {/* Add Number dialog */}
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setName(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Plus className="w-4 h-4" /> Add a WhatsApp Number</DialogTitle>
            <DialogDescription>
              Enter a name to identify this number. You'll scan a QR code from your phone to link it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="num-name">Display name</Label>
              <Input
                id="num-name"
                className="mt-1.5"
                placeholder="e.g. SIM 2 — IAM"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && name.trim() && !busy) handleAdd(); }}
                autoFocus
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                You'll be asked to scan a QR code via WhatsApp → Linked Devices.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy} className="w-full sm:w-auto">Cancel</Button>
            <Button onClick={handleAdd} disabled={!name.trim() || busy} className="w-full sm:w-auto">
              {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</> : <><QrCode className="w-4 h-4" /> Generate QR</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}