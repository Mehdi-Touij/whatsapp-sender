"use client";

import { useMemo } from "react";
import {
  Card, Title, Text, Metric, Badge, ProgressBar, Button, Grid, Col, Flex,
} from "@tremor/react";
import {
  PaperAirplaneIcon, ChatBubbleLeftRightIcon, ChartBarIcon, BoltIcon,
  ExclamationTriangleIcon, ShieldCheckIcon, ClockIcon, ArrowRightIcon,
} from "@heroicons/react/24/outline";
import {
  type NumberInfo, type Campaign, type ReplyItem,
  getNumberHealth, healthColor, healthText, isAtRisk,
} from "@/lib/types";

interface OverviewProps {
  numbers: NumberInfo[];
  campaigns: Campaign[];
  totalCapacity: number;
  recentReplies: ReplyItem[];
  activeCampaign: Campaign | null;
  onOpenCampaign: (c: Campaign) => void;
}

function timeAgo(iso: string | null | undefined): string {
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

// Map our semantic health color to a Tremor color name for ProgressBar/Badge.
function healthToColor(h: "green" | "yellow" | "red"): "emerald" | "amber" | "red" {
  return h === "green" ? "emerald" : h === "yellow" ? "amber" : "red";
}

function statusBadge(n: NumberInfo) {
  if (n.status === "restricted") return <Badge color="red">Banned</Badge>;
  if (n.warmupStatus === "warmup") return <Badge color="amber">Warmup D{n.warmupDay}/3</Badge>;
  if (n.status === "connecting") return <Badge color="slate">Connecting</Badge>;
  return <Badge color="emerald">Active</Badge>;
}

export function Overview({
  numbers, campaigns, totalCapacity, recentReplies, activeCampaign, onOpenCampaign,
}: OverviewProps) {
  const stats = useMemo(() => {
    const totalSentToday = numbers.reduce((s, n) => s + n.msgsToday, 0);
    const totalReplies = numbers.reduce((s, n) => s + n.replies, 0);
    const replyRate = totalSentToday > 0 ? (totalReplies / totalSentToday) * 100 : 0;
    return { totalSentToday, totalReplies, replyRate };
  }, [numbers]);

  const statCards = [
    { label: "Sent Today", value: String(stats.totalSentToday), icon: PaperAirplaneIcon, color: "blue" as const },
    { label: "Replies", value: String(stats.totalReplies), icon: ChatBubbleLeftRightIcon, color: "emerald" as const },
    { label: "Reply Rate", value: `${stats.replyRate.toFixed(1)}%`, icon: ChartBarIcon, color: "violet" as const },
    { label: "Capacity", value: String(totalCapacity), icon: BoltIcon, color: "amber" as const },
  ];

  const sendingCampaign = activeCampaign && ["sending", "draft", "paused"].includes(activeCampaign.status);
  const alerts = useMemo(() => {
    const list: { color: "red" | "amber" | "blue"; title: string; desc: string }[] = [];
    const banned = numbers.filter((n) => n.status === "restricted");
    if (banned.length > 0) {
      list.push({
        color: "red",
        title: `${banned.length} number${banned.length > 1 ? "s" : ""} banned`,
        desc: banned.map((n) => n.displayName).join(", ") + " — replace or pause sending to recover.",
      });
    }
    const atRisk = numbers.filter(isAtRisk);
    if (atRisk.length > 0) {
      list.push({
        color: "amber",
        title: `${atRisk.length} number${atRisk.length > 1 ? "s" : ""} at risk`,
        desc: "Low reply rate or near daily limit. Consider pausing these numbers.",
      });
    }
    if (numbers.length === 0) {
      list.push({ color: "blue", title: "No numbers connected", desc: "Add a WhatsApp number to start sending campaigns." });
    }
    return list;
  }, [numbers]);

  return (
    <div className="space-y-6">
      <div>
        <Title>Overview</Title>
        <Text>Real-time messaging stats across all numbers</Text>
      </div>

      {/* Stat cards */}
      <Grid numItems={1} numItemsSm={2} numItemsLg={4} className="gap-4">
        {statCards.map((s) => (
          <Card key={s.label} decoration="top" decorationColor={s.color}>
            <Flex justifyContent="between" alignItems="start">
              <div className="space-y-1">
                <Text className="text-tremor-content dark:text-dark-tremor-content">{s.label}</Text>
                <Metric>{s.value}</Metric>
              </div>
              <div className="w-10 h-10 rounded-tremor-default bg-tremor-background-muted flex items-center justify-center dark:bg-dark-tremor-background-muted">
                <s.icon className={["w-5 h-5", iconColorClass(s.color)].join(" ")} />
              </div>
            </Flex>
          </Card>
        ))}
      </Grid>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <Card key={i} decoration="left" decorationColor={a.color} className="py-3">
              <Flex justifyContent="between" alignItems="start">
                <div className="min-w-0">
                  <Text className="font-semibold text-tremor-content-strong dark:text-dark-tremor-content-strong">
                    {a.title}
                  </Text>
                  <Text className="text-tremor-content dark:text-dark-tremor-content">{a.desc}</Text>
                </div>
                <ExclamationTriangleIcon className="w-5 h-5 text-tremor-content shrink-0 dark:text-dark-tremor-content" />
              </Flex>
            </Card>
          ))}
        </div>
      )}

      <Grid numItems={1} numItemsLg={3} className="gap-4">
        {/* Active campaign */}
        <Col numColSpanLg={2}>
          <Card className="h-full">
            <Flex justifyContent="between" className="mb-2">
              <div className="flex items-center gap-2">
                <PaperAirplaneIcon className="w-5 h-5 text-blue-500" />
                <Title className="text-lg">Active Campaign</Title>
              </div>
              {sendingCampaign && <Badge color={activeCampaign!.status === "sending" ? "blue" : "slate"}>{activeCampaign!.status}</Badge>}
            </Flex>

            {sendingCampaign ? (() => {
              const total = (activeCampaign!.total_recipients ?? activeCampaign!.total ?? 0) as number;
              const sent = (activeCampaign!.sent_count ?? activeCampaign!.sent ?? 0) as number;
              const replied = (activeCampaign!.reply_count ?? activeCampaign!.replies ?? 0) as number;
              const pct = total ? (sent / total) * 100 : 0;
              const remaining = Math.max(0, total - sent);
              const perHour = totalCapacity || 1;
              const hoursLeft = remaining / perHour;
              return (
                <div className="space-y-4">
                  <Flex justifyContent="between">
                    <Text className="font-medium text-tremor-content-strong dark:text-dark-tremor-content-strong">
                      {activeCampaign!.name}
                    </Text>
                    <Button variant="light" size="xs" icon={ArrowRightIcon} onClick={() => onOpenCampaign(activeCampaign!)}>
                      Open
                    </Button>
                  </Flex>
                  <ProgressBar value={pct} color="blue" showAnimation />
                  <Grid numItems={2} numItemsSm={4} className="gap-3 text-center">
                    <div><Text className="text-tremor-content dark:text-dark-tremor-content">Sent</Text><Metric className="text-xl">{sent}</Metric></div>
                    <div><Text className="text-tremor-content dark:text-dark-tremor-content">Replies</Text><Metric className="text-xl text-emerald-600 dark:text-emerald-400">{replied}</Metric></div>
                    <div><Text className="text-tremor-content dark:text-dark-tremor-content">Remaining</Text><Metric className="text-xl">{remaining}</Metric></div>
                    <div><Text className="text-tremor-content dark:text-dark-tremor-content">Progress</Text><Metric className="text-xl text-violet-600 dark:text-violet-400">{pct.toFixed(0)}%</Metric></div>
                  </Grid>
                  <Flex justifyContent="between" className="text-xs text-tremor-content dark:text-dark-tremor-content">
                    <span className="flex items-center gap-1"><ClockIcon className="w-3.5 h-3.5" /> ETA ~{hoursLeft < 1 ? "<1h" : `${hoursLeft.toFixed(1)}h`}</span>
                    <span>Capacity: {perHour}/hr</span>
                  </Flex>
                </div>
              );
            })() : (
              <div className="text-center py-10">
                <BoltIcon className="w-8 h-8 text-tremor-content mx-auto mb-2 opacity-40 dark:text-dark-tremor-content" />
                <Text>No active campaign. Head to Campaigns to start one.</Text>
              </div>
            )}
          </Card>
        </Col>

        {/* Recent replies */}
        <Col numColSpanLg={1}>
          <Card className="h-full">
            <Flex justifyContent="between" className="mb-2">
              <div className="flex items-center gap-2">
                <ChatBubbleLeftRightIcon className="w-5 h-5 text-emerald-500" />
                <Title className="text-lg">Recent Replies</Title>
              </div>
              <Badge color="slate">Last {Math.min(5, recentReplies.length)}</Badge>
            </Flex>
            {recentReplies.length === 0 ? (
              <div className="text-center py-10">
                <ChatBubbleLeftRightIcon className="w-7 h-7 text-tremor-content mx-auto mb-2 opacity-40 dark:text-dark-tremor-content" />
                <Text>No replies yet.</Text>
              </div>
            ) : (
              <div className="space-y-1">
                {recentReplies.slice(0, 5).map((r, i) => (
                  <Flex key={i} justifyContent="start" className="gap-3 py-2">
                    <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center shrink-0 dark:bg-emerald-500/10">
                      <ChatBubbleLeftRightIcon className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <Flex justifyContent="between" alignItems="baseline">
                        <Text className="font-medium truncate">{r.name || r.phone}</Text>
                        <Text className="text-xs text-tremor-content dark:text-dark-tremor-content shrink-0 ml-2">{timeAgo(r.receivedAt)}</Text>
                      </Flex>
                      <Text className="text-xs text-tremor-content dark:text-dark-tremor-content truncate">{r.phone}</Text>
                    </div>
                  </Flex>
                ))}
              </div>
            )}
          </Card>
        </Col>
      </Grid>

      {/* Number health table */}
      <Card>
        <Title className="text-lg mb-1">Number Health</Title>
        <Text className="mb-3">Reply rate, send volume, and ban risk per number</Text>
        {numbers.length === 0 ? (
          <Text className="py-4">No numbers connected.</Text>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-tremor-default text-tremor-content dark:text-dark-tremor-content min-w-[640px]">
              <thead>
                <tr className="border-b border-tremor-border dark:border-dark-tremor-border text-left">
                  <th className="whitespace-nowrap text-left font-semibold px-4 py-3 text-tremor-content-strong dark:text-dark-tremor-content-strong">Number</th>
                  <th className="whitespace-nowrap text-left font-semibold px-4 py-3 text-tremor-content-strong dark:text-dark-tremor-content-strong">Status</th>
                  <th className="whitespace-nowrap text-right font-semibold px-4 py-3 text-tremor-content-strong dark:text-dark-tremor-content-strong">Sent Today</th>
                  <th className="whitespace-nowrap text-right font-semibold px-4 py-3 text-tremor-content-strong dark:text-dark-tremor-content-strong">Replies</th>
                  <th className="whitespace-nowrap text-right font-semibold px-4 py-3 text-tremor-content-strong dark:text-dark-tremor-content-strong">Reply Rate</th>
                  <th className="whitespace-nowrap text-right font-semibold px-4 py-3 text-tremor-content-strong dark:text-dark-tremor-content-strong">Health</th>
                </tr>
              </thead>
              <tbody>
                {numbers.map((n) => {
                  const h = getNumberHealth(n);
                  return (
                    <tr key={n.instance} className="border-b border-tremor-border last:border-0 dark:border-dark-tremor-border">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={["w-2 h-2 rounded-full", healthColor(h)].join(" ")} />
                          <div>
                            <div className="text-sm font-medium text-tremor-content-strong dark:text-dark-tremor-content-strong">{n.displayName}</div>
                            <div className="text-xs text-tremor-content dark:text-dark-tremor-content">{n.phone || "—"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">{statusBadge(n)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-sm">
                        {n.msgsToday}<span className="text-tremor-content dark:text-dark-tremor-content">/{n.effectiveLimit}</span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-sm">{n.replies}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-sm">{n.replyRate}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center gap-1.5 text-xs justify-end">
                          <ShieldCheckIcon className={["w-4 h-4", healthIconColor(h)].join(" ")} />
                          {healthText(h)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Recent campaigns */}
      {campaigns.length > 0 && (
        <Card>
          <Title className="text-lg mb-1">Recent Campaigns</Title>
          <Text className="mb-3">{campaigns.length} total</Text>
          <div className="divide-y divide-tremor-border dark:divide-dark-tremor-border">
            {campaigns.map((c) => {
              const total = (c.total_recipients ?? c.total ?? 0) as number;
              const sent = (c.sent_count ?? c.sent ?? 0) as number;
              const replies = (c.reply_count ?? c.replies ?? 0) as number;
              return (
                <button
                  key={c.id}
                  onClick={() => onOpenCampaign(c)}
                  className="flex items-center justify-between gap-3 w-full py-3 text-left hover:bg-tremor-background-muted rounded-tremor-default transition-colors px-2 -mx-2 dark:hover:bg-dark-tremor-background-muted"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-tremor-content-strong truncate dark:text-dark-tremor-content-strong">{c.name}</div>
                    <div className="text-xs text-tremor-content dark:text-dark-tremor-content">{timeAgo(c.started_at || null)}</div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge color={c.status === "sending" ? "blue" : c.status === "completed" ? "emerald" : "slate"}>{c.status}</Badge>
                    <span className="text-xs text-tremor-content tabular-nums dark:text-dark-tremor-content">{sent}/{total} · {replies} replies</span>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

function iconColorClass(c: "blue" | "emerald" | "violet" | "amber"): string {
  switch (c) {
    case "blue": return "text-blue-500";
    case "emerald": return "text-emerald-500";
    case "violet": return "text-violet-500";
    case "amber": return "text-amber-500";
  }
}

function healthIconColor(h: "green" | "yellow" | "red"): string {
  if (h === "green") return "text-emerald-500";
  if (h === "yellow") return "text-amber-500";
  return "text-red-500";
}