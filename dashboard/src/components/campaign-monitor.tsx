"use client";

import { useMemo, useState } from "react";
import {
  Card, Title, Text, Metric, Badge, Button, ProgressBar, Grid, Col, Flex,
} from "@tremor/react";
import {
  ArrowLeftIcon, StopIcon, PaperAirplaneIcon, CheckCircleIcon,
  ChatBubbleLeftRightIcon, ExclamationTriangleIcon, ClockIcon,
  PlayIcon, PauseIcon,
} from "@heroicons/react/24/outline";
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

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <Card decoration="top" decorationColor={color as any}>
      <Flex justifyContent="between" alignItems="start">
        <div className="space-y-1">
          <Text>{label}</Text>
          <Metric>{value}</Metric>
        </div>
        <div className="w-10 h-10 rounded-tremor-default bg-tremor-background-muted flex items-center justify-center dark:bg-dark-tremor-background-muted">
          <Icon className={["w-5 h-5", colorClass(color)].join(" ")} />
        </div>
      </Flex>
    </Card>
  );
}

function colorClass(c: string): string {
  switch (c) {
    case "blue": return "text-blue-500";
    case "emerald": return "text-emerald-500";
    case "violet": return "text-violet-500";
    case "red": return "text-red-500";
    default: return "text-tremor-content dark:text-dark-tremor-content";
  }
}

export function CampaignMonitor({ campaign, numbers, totalCapacity, onStop, onStart, onBack }: MonitorProps) {
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
        <Button variant="light" icon={ArrowLeftIcon} onClick={onBack}>Back to campaigns</Button>
        <Card>
          <div className="py-16 text-center">
            <PaperAirplaneIcon className="w-10 h-10 text-tremor-content mx-auto mb-3 opacity-40 dark:text-dark-tremor-content" />
            <Text>No campaign selected.</Text>
          </div>
        </Card>
      </div>
    );
  }

  const total = (campaign.total_recipients ?? campaign.total ?? 0) as number;
  const sent = (campaign.sent_count ?? campaign.sent ?? 0) as number;
  const replies = (campaign.reply_count ?? campaign.replies ?? 0) as number;
  const delivered = ((campaign as any).delivered_count ?? (campaign as any).delivered ?? sent) as number;
  const failed = ((campaign as any).failed_count ?? (campaign as any).failed ?? 0) as number;
  const pct = total ? (sent / total) * 100 : 0;
  const remaining = Math.max(0, total - sent);
  const perHour = totalCapacity || 1;
  const hoursLeft = remaining / perHour;
  const participating = numbers.filter((n) => n.status !== "restricted" && n.status !== "deleted");
  const isSending = campaign.status === "sending";

  const handleStop = async () => {
    setStopping(true);
    try { await onStop(campaign.id); } finally { setStopping(false); }
  };
  const handleStart = async () => {
    setStarting(true);
    try { await onStart(campaign.id); } finally { setStarting(false); }
  };

  return (
    <div className="space-y-6">
      <Flex justifyContent="between" alignItems="center" className="flex-wrap gap-3">
        <Flex justifyContent="start" className="gap-3 min-w-0">
          <Button variant="light" size="sm" icon={ArrowLeftIcon} onClick={onBack}>Back</Button>
          <div className="min-w-0">
            <Title className="truncate">{campaign.name}</Title>
            <Flex justifyContent="start" className="gap-2 mt-0.5">
              <Badge color={isSending ? "blue" : campaign.status === "completed" ? "emerald" : "slate"}>{campaign.status}</Badge>
              <Text className="text-xs">Started {timeAgo(campaign.started_at)}</Text>
            </Flex>
          </div>
        </Flex>
        {isSending ? (
          <Button color="red" icon={StopIcon} onClick={handleStop} loading={stopping} loadingText="Stopping…">
            {stopping ? "Stopping…" : "Stop"}
          </Button>
        ) : campaign.status === "draft" || campaign.status === "paused" ? (
          <Button icon={PlayIcon} onClick={handleStart} loading={starting} loadingText="Starting…">
            {starting ? "Starting…" : "Start"}
          </Button>
        ) : null}
      </Flex>

      {/* Live progress */}
      <Card>
        <Flex justifyContent="between" className="mb-2">
          <div className="flex items-center gap-2">
            {isSending
              ? <PaperAirplaneIcon className="w-5 h-5 text-blue-500 animate-pulse" />
              : <PauseIcon className="w-5 h-5 text-tremor-content dark:text-dark-tremor-content" />}
            <Title className="text-lg">Live Progress</Title>
          </div>
          <Metric className="text-2xl">{pct.toFixed(1)}%</Metric>
        </Flex>
        <ProgressBar value={pct} color="blue" showAnimation className="mt-2" />
        <Flex justifyContent="between" className="mt-3">
          <Text className="text-xs flex items-center gap-1">
            <ClockIcon className="w-3.5 h-3.5" />
            {remaining === 0 ? "Completed"
              : isSending ? `ETA ~${hoursLeft < 1 ? "<1h" : `${hoursLeft.toFixed(1)}h`}`
              : `${remaining} remaining`}
          </Text>
          <Text className="text-xs">Capacity: {perHour}/hr</Text>
        </Flex>
      </Card>

      {/* Stats grid */}
      <Grid numItems={2} numItemsMd={4} className="gap-4">
        <StatCard label="Sent" value={sent} icon={PaperAirplaneIcon} color="blue" />
        <StatCard label="Delivered" value={delivered} icon={CheckCircleIcon} color="emerald" />
        <StatCard label="Replies" value={replies} icon={ChatBubbleLeftRightIcon} color="violet" />
        <StatCard label="Failed" value={failed} icon={ExclamationTriangleIcon} color="red" />
      </Grid>

      <Grid numItems={1} numItemsLg={3} className="gap-4">
        {/* Per-number table */}
        <Col numColSpanLg={2}>
          <Card className="h-full">
            <Title className="text-lg mb-1">Per-number breakdown</Title>
            <Text className="mb-3">Each number's contribution and current status</Text>
            {participating.length === 0 ? (
              <Text className="py-4">No numbers available.</Text>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-tremor-default text-tremor-content dark:text-dark-tremor-content min-w-[560px]">
                  <thead>
                    <tr className="border-b border-tremor-border dark:border-dark-tremor-border text-left">
                      <th className="whitespace-nowrap text-left font-semibold px-4 py-3 text-tremor-content-strong dark:text-dark-tremor-content-strong">Number</th>
                      <th className="whitespace-nowrap text-left font-semibold px-4 py-3 text-tremor-content-strong dark:text-dark-tremor-content-strong">Health</th>
                      <th className="whitespace-nowrap text-right font-semibold px-4 py-3 text-tremor-content-strong dark:text-dark-tremor-content-strong">Sent</th>
                      <th className="whitespace-nowrap text-right font-semibold px-4 py-3 text-tremor-content-strong dark:text-dark-tremor-content-strong">Replies</th>
                      <th className="whitespace-nowrap text-right font-semibold px-4 py-3 text-tremor-content-strong dark:text-dark-tremor-content-strong">Failed</th>
                      <th className="whitespace-nowrap text-right font-semibold px-4 py-3 text-tremor-content-strong dark:text-dark-tremor-content-strong">Today</th>
                    </tr>
                  </thead>
                  <tbody>
                    {participating.map((n) => {
                      const stats = perNumberMap[n.instance] || { sent: 0, replies: 0, failed: 0 };
                      const h = getNumberHealth(n);
                      return (
                        <tr key={n.instance} className="border-b border-tremor-border last:border-0 dark:border-dark-tremor-border">
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-tremor-content-strong dark:text-dark-tremor-content-strong">{n.displayName}</div>
                            <div className="text-xs text-tremor-content dark:text-dark-tremor-content">{n.phone}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1.5 text-xs">
                              <span className={["w-2 h-2 rounded-full", healthColor(h)].join(" ")} />
                              {healthText(h)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-medium">{stats.sent}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-blue-500">{stats.replies}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-red-500">{stats.failed}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-xs">
                            {n.msgsToday}<span className="text-tremor-content dark:text-dark-tremor-content">/{n.effectiveLimit}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </Col>

        {/* Live reply feed */}
        <Col numColSpanLg={1}>
          <Card className="h-full">
            <Flex justifyContent="between" className="mb-2">
              <div className="flex items-center gap-2">
                <ChatBubbleLeftRightIcon className="w-5 h-5 text-blue-500" />
                <Title className="text-lg">Live Replies</Title>
              </div>
              <Badge color="slate">{liveReplies.length}</Badge>
            </Flex>
            {liveReplies.length === 0 ? (
              <div className="text-center py-10">
                <ChatBubbleLeftRightIcon className="w-8 h-8 text-tremor-content mx-auto mb-2 opacity-40 dark:text-dark-tremor-content" />
                <Text>No replies yet.</Text>
              </div>
            ) : (
              <div className="space-y-1 max-h-[360px] overflow-y-auto">
                {liveReplies.map((r, i) => (
                  <Flex key={i} justifyContent="start" className="gap-3 py-2 px-2 rounded-tremor-default hover:bg-tremor-background-muted transition-colors dark:hover:bg-dark-tremor-background-muted">
                    <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center shrink-0 dark:bg-blue-500/10">
                      <ChatBubbleLeftRightIcon className="w-3.5 h-3.5 text-blue-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <Flex justifyContent="between" alignItems="baseline">
                        <Text className="text-sm font-medium truncate">{r.name || r.phone}</Text>
                        <Text className="text-xs text-tremor-content dark:text-dark-tremor-content shrink-0 ml-2">{timeAgo(r.receivedAt)}</Text>
                      </Flex>
                      <Text className="text-xs text-tremor-content truncate font-mono dark:text-dark-tremor-content">{r.phone}</Text>
                    </div>
                  </Flex>
                ))}
              </div>
            )}
          </Card>
        </Col>
      </Grid>

      <Button variant="light" icon={ArrowLeftIcon} onClick={onBack}>Back to campaigns</Button>
    </div>
  );
}