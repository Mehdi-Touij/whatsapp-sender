"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft, Square, Loader2, Send, CheckCheck, MessageSquareReply, AlertTriangle,
  Clock, Activity, Play, Pause,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  type Campaign, type NumberInfo, type ReplyItem,
  getNumberHealth, healthColor, healthText,
} from "@/lib/types";

interface MonitorProps {
  campaign: Campaign | null;
  numbers: NumberInfo[];
  totalCapacity: number;
  onStop: (campaignId: string) => Promise<void>;
  onStart: (campaignId: string) => Promise<void>;
  onBack: () => void;
}

function timeAgo(iso?: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "just now";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function StatPill({ label, value, icon: Icon, accent }: {
  label: string; value: string | number; icon: React.ComponentType<{ className?: string }>; accent?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", accent ? "bg-muted" : "bg-muted")}>
        <Icon className={cn("w-4 h-4", accent)} />
      </div>
      <div>
        <div className="text-xl font-semibold tabular-nums leading-tight">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

export function CampaignMonitor({
  campaign, numbers, totalCapacity, onStop, onStart, onBack,
}: MonitorProps) {
  const [stopping, setStopping] = useState(false);
  const [starting, setStarting] = useState(false);

  const perNumberMap = useMemo(() => {
    const m: Record<string, { sent: number; replies: number; failed: number }> = {};
    if (campaign && Array.isArray((campaign as any).perNumber)) {
      for (const row of (campaign as any).perNumber) {
        m[row.instance] = { sent: row.sent || 0, replies: row.replies || 0, failed: row.failed || 0 };
      }
    }
    return m;
  }, [campaign]);

  const liveReplies: ReplyItem[] = useMemo(() => {
    if (campaign && Array.isArray((campaign as any).liveReplies)) return (campaign as any).liveReplies;
    return [];
  }, [campaign]);

  if (!campaign) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={onBack}><ArrowLeft className="w-4 h-4" /> Back to campaigns</Button>
        <Card><CardContent className="py-16 text-center">
          <Activity className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-sm text-muted-foreground">No campaign selected.</p>
        </CardContent></Card>
      </div>
    );
  }

  const total = campaign.total_recipients || campaign.total || 0;
  const sent = campaign.sent_count || campaign.sent || 0;
  const replies = campaign.reply_count || campaign.replies || 0;
  const delivered = (campaign as any).delivered_count || (campaign as any).delivered || sent;
  const failed = (campaign as any).failed_count || (campaign as any).failed || 0;
  const pct = total ? (sent / total) * 100 : 0;
  const remaining = Math.max(0, total - sent);
  const perHour = totalCapacity || 1;
  const hoursLeft = remaining / perHour;

  // numbers that participated (or can)
  const participating = numbers.filter(n => n.status !== "restricted" && n.status !== "deleted");

  const handleStop = async () => {
    setStopping(true);
    try { await onStop(campaign.id); } finally { setStopping(false); }
  };
  const handleStart = async () => {
    setStarting(true);
    try { await onStart(campaign.id); } finally { setStarting(false); }
  };

  const isSending = campaign.status === "sending";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="w-4 h-4" /></Button>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight truncate">{campaign.name}</h1>
            <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
              <Badge variant={isSending ? "default" : campaign.status === "completed" ? "success" : "secondary"}>
                {campaign.status}
              </Badge>
              <span className="text-xs">Started {timeAgo(campaign.started_at)}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isSending ? (
            <Button variant="destructive" onClick={handleStop} disabled={stopping}>
              {stopping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />} Stop
            </Button>
          ) : campaign.status === "draft" || campaign.status === "paused" ? (
            <Button onClick={handleStart} disabled={starting}>
              {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Start
            </Button>
          ) : null}
        </div>
      </div>

      {/* Live progress */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              {isSending ? <Activity className="w-4 h-4 text-primary animate-pulse" /> : <Pause className="w-4 h-4 text-muted-foreground" />}
              Live Progress
            </CardTitle>
            <span className="text-2xl font-semibold tabular-nums">{pct.toFixed(1)}%</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={pct} className="h-3" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />
              {remaining === 0 ? "Completed"
                : isSending
                  ? `ETA ~${hoursLeft < 1 ? "<1h" : `${hoursLeft.toFixed(1)}h`}`
                  : `${remaining} remaining`}
            </span>
            <span>Capacity: {perHour}/hr</span>
          </div>
        </CardContent>
      </Card>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatPill label="Sent" value={sent} icon={Send} accent="text-primary" />
        <StatPill label="Delivered" value={delivered} icon={CheckCheck} accent="text-blue-500" />
        <StatPill label="Replies" value={replies} icon={MessageSquareReply} accent="text-purple-500" />
        <StatPill label="Failed" value={failed} icon={AlertTriangle} accent="text-red-500" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Per-number table */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Per-number breakdown</CardTitle>
            <CardDescription className="text-xs">Each number's contribution and current status</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {participating.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No numbers available.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Number</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead className="text-right">Sent</TableHead>
                    <TableHead className="text-right">Replies</TableHead>
                    <TableHead className="text-right">Failed</TableHead>
                    <TableHead className="text-right">Today</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {participating.map(n => {
                    const stats = perNumberMap[n.instance] || { sent: 0, replies: 0, failed: 0 };
                    const h = getNumberHealth(n);
                    return (
                      <TableRow key={n.instance}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">{n.displayName}</span>
                            <span className="text-xs text-muted-foreground">{n.phone}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 text-xs">
                            <span className={cn("w-2 h-2 rounded-full", healthColor(h))} />
                            {healthText(h)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{stats.sent}</TableCell>
                        <TableCell className="text-right tabular-nums text-blue-500">{stats.replies}</TableCell>
                        <TableCell className="text-right tabular-nums text-red-500">{stats.failed}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs">
                          {n.msgsToday}<span className="text-muted-foreground">/{n.effectiveLimit}</span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Live reply feed */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquareReply className="w-4 h-4 text-blue-500" />
              Live Replies
            </CardTitle>
            <CardDescription className="text-xs">{liveReplies.length} received</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {liveReplies.length === 0 ? (
              <div className="text-center py-10">
                <MessageSquareReply className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                <p className="text-sm text-muted-foreground">No replies yet.</p>
              </div>
            ) : (
              <div className="space-y-1 max-h-[360px] overflow-y-auto -mx-2 px-1">
                {liveReplies.map((r, i) => (
                  <div key={i} className="flex items-start gap-3 py-2 px-2 rounded-md hover:bg-accent/40 transition-colors">
                    <div className="w-7 h-7 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                      <MessageSquareReply className="w-3.5 h-3.5 text-blue-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium truncate">{r.name || r.phone}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{timeAgo(r.receivedAt)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate font-mono">{r.phone}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Separator />

      <Button variant="ghost" onClick={onBack}><ArrowLeft className="w-4 h-4" /> Back to campaigns</Button>
    </div>
  );
}