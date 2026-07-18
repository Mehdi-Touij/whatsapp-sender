// Shared types for the dashboard

export interface NumberInfo {
  instance: string;
  displayName: string;
  phone: string;
  status: string; // active | restricted | deleted | connecting
  warmupStatus: string; // active | warmup
  warmupDay: number;
  warmupProgress?: string;
  msgsToday: number;
  msgsTotal: number;
  replies: number;
  replyRate: string;
  effectiveLimit: number;
  hourlyLimit?: number;
  capacityLeft: number;
  lastMessage?: string | null;
  msgsThisHour?: number;
}

export interface Campaign {
  id: string;
  name: string;
  status: string; // draft | sending | paused | completed
  total_recipients?: number;
  total?: number;
  sent_count?: number;
  sent?: number;
  reply_count?: number;
  replies?: number;
  failed_count?: number;
  failed?: number;
  delivered_count?: number;
  delivered?: number;
  started_at?: string | null;
  message_template?: string;
  replyRate?: string;
  progress?: string;
}

export interface StatusResponse {
  numbers: NumberInfo[];
  campaigns: Campaign[];
  totalCapacity: number;
  campaign?: Campaign | null;
  recentReplies?: ReplyItem[];
}

export interface ReplyItem {
  phone: string;
  name?: string;
  message: string;
  receivedAt: string;
  instance?: string;
}

// Health scoring helpers
export type HealthLevel = "green" | "yellow" | "red";

export function getNumberHealth(n: NumberInfo): HealthLevel {
  if (n.status === "restricted") return "red";
  if (n.warmupStatus === "warmup" && n.warmupDay <= 1) return "yellow";
  const rate = parseFloat(n.replyRate) || 0;
  const limitUsage = n.effectiveLimit > 0 ? n.msgsToday / n.effectiveLimit : 0;
  if (rate >= 15 && limitUsage < 0.9) return "green";
  if (rate < 5 || limitUsage >= 0.95) return "red";
  return "yellow";
}

export function isAtRisk(n: NumberInfo): boolean {
  if (n.status === "restricted") return false;
  const rate = parseFloat(n.replyRate) || 0;
  const limitUsage = n.effectiveLimit > 0 ? n.msgsToday / n.effectiveLimit : 0;
  return rate < 5 || limitUsage >= 0.9;
}

export function healthColor(h: HealthLevel): string {
  if (h === "green") return "bg-green-500";
  if (h === "yellow") return "bg-yellow-500";
  return "bg-red-500";
}

export function healthText(h: HealthLevel): string {
  if (h === "green") return "Healthy";
  if (h === "yellow") return "Watch";
  return "At Risk";
}

// Warmup daily limit progression
export function warmupLimitForDay(day: number): number {
  if (day <= 1) return 20;
  if (day === 2) return 60;
  if (day === 3) return 100;
  return 160;
}

// Spintax preview — deterministic-ish preview by trying a few random expansions
export function previewSpintax(template: string, name: string): string {
  const regex = /\{([^}]+)\}/g;
  const expanded = template.replace(regex, (_, options: string) => {
    const choices = options.split("|");
    return choices[Math.floor(Math.random() * choices.length)];
  });
  return expanded.replace(/{name}/g, name || "there").replace(/{phone}/g, "");
}