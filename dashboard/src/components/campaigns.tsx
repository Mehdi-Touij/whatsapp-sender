"use client";

import { useState, useMemo, useRef } from "react";
import {
  Card, Title, Text, Metric, Button, Badge, ProgressBar, Grid, Col, Flex, Textarea, TextInput,
} from "@tremor/react";
import {
  ArrowLeftIcon, ArrowRightIcon, ArrowUpTrayIcon, DocumentTextIcon,
  CheckCircleIcon, SparklesIcon, PaperAirplaneIcon, UsersIcon,
  ChatBubbleLeftIcon, PlayIcon, EyeIcon,
} from "@heroicons/react/24/outline";
import {
  type NumberInfo, type Campaign, previewSpintax,
} from "@/lib/types";

interface CampaignsProps {
  numbers: NumberInfo[];
  campaigns: Campaign[];
  activeCampaign: Campaign | null;
  onOpenCampaign: (c: Campaign) => void;
  onUpload: (params: { campaignName: string; messageTemplate: string; file: File }) => Promise<{ campaignId: string; count: number } | null>;
  onStartCampaign: (campaignId: string) => Promise<void>;
}

interface PreviewRecipient { phone: string; name: string }

const STEPS = [
  { id: 1, label: "Name", icon: DocumentTextIcon },
  { id: 2, label: "Recipients", icon: UsersIcon },
  { id: 3, label: "Message", icon: ChatBubbleLeftIcon },
  { id: 4, label: "Review", icon: CheckCircleIcon },
];

function parseCsvPreview(text: string): PreviewRecipient[] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  const out: PreviewRecipient[] = [];
  for (const line of lines) {
    if (line.toLowerCase().includes("phone") && line.toLowerCase().includes("name")) continue;
    const parts = line.split(",").map((p) => p.trim());
    if (parts.length >= 1 && parts[0]) {
      out.push({ phone: parts[0].replace(/\s/g, "").replace("+", ""), name: parts[1] || "" });
    }
  }
  return out;
}

function timeAgo(iso?: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "just now";
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function Campaigns({
  numbers, campaigns, activeCampaign, onOpenCampaign, onUpload, onStartCampaign,
}: CampaignsProps) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(1);

  const [campaignName, setCampaignName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [recipients, setRecipients] = useState<PreviewRecipient[]>([]);
  const [parsing, setParsing] = useState(false);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [created, setCreated] = useState<{ campaignId: string; count: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openWizard = () => {
    setWizardOpen(true);
    setStep(1);
    setCampaignName("");
    setFile(null);
    setRecipients([]);
    setMessage("");
    setCreated(null);
  };

  const handleFile = (f: File) => {
    setFile(f);
    setParsing(true);
    f.text().then((t) => {
      setRecipients(parseCsvPreview(t));
      setParsing(false);
    });
  };

  const canNext = useMemo(() => {
    if (step === 1) return campaignName.trim().length > 0;
    if (step === 2) return recipients.length > 0;
    if (step === 3) return message.trim().length > 0;
    return true;
  }, [step, campaignName, recipients, message]);

  const usableNumbers = useMemo(
    () =>
      numbers
        .filter((n) => n.status !== "restricted" && n.status !== "deleted" && n.warmupStatus !== "warmup")
        .sort((a, b) => b.capacityLeft - a.capacityLeft),
    [numbers]
  );
  const dailyCapacity = usableNumbers.reduce((s, n) => s + n.capacityLeft, 0);
  const hourlyCapacity = usableNumbers.reduce((s, n) => s + (n.hourlyLimit || 20), 0);
  const estimatedHours = recipients.length && hourlyCapacity > 0 ? recipients.length / hourlyCapacity : 0;

  const previewSamples = useMemo(() => {
    if (!recipients.length || !message) return [];
    const shuffled = [...recipients].sort(() => Math.random() - 0.5).slice(0, 3);
    return shuffled.map((r) => ({ r, text: previewSpintax(message, r.name) }));
  }, [recipients, message]);

  const charCount = message.length;

  const insertAtCursor = (snippet: string) => {
    const el = document.getElementById("message-textarea") as HTMLTextAreaElement | null;
    if (!el) { setMessage(message + snippet); return; }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = message.slice(0, start) + snippet + message.slice(end);
    setMessage(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + snippet.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const doUpload = async () => {
    if (!file || !campaignName || !message) return;
    setUploading(true);
    try {
      const res = await onUpload({ campaignName, messageTemplate: message, file });
      if (res) setCreated(res);
    } finally {
      setUploading(false);
    }
  };

  const startIt = async () => {
    if (!created) return;
    await onStartCampaign(created.campaignId);
    setWizardOpen(false);
  };

  // ===== List view =====
  if (!wizardOpen) {
    return (
      <div className="space-y-6">
        <div>
          <Title>Campaigns</Title>
          <Text>Create and manage messaging campaigns</Text>
        </div>

        {activeCampaign && (
          <Card decoration="left" decorationColor="blue">
            <Flex justifyContent="between" className="mb-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <PaperAirplaneIcon className="w-5 h-5 text-blue-500 shrink-0" />
                  <Title className="text-lg truncate">{activeCampaign.name}</Title>
                </div>
                <Text className="text-xs mt-0.5">
                  {activeCampaign.status === "sending" ? "Live campaign in progress" : "Campaign ready"}
                </Text>
              </div>
              <Badge color={activeCampaign.status === "sending" ? "blue" : "slate"} className="shrink-0">{activeCampaign.status}</Badge>
            </Flex>
            <Grid numItems={3} className="gap-4 mb-3">
              <div><Metric className="text-xl">{activeCampaign.total_recipients ?? activeCampaign.total ?? 0}</Metric><Text>Total</Text></div>
              <div><Metric className="text-xl text-blue-500">{activeCampaign.sent_count ?? activeCampaign.sent ?? 0}</Metric><Text>Sent</Text></div>
              <div><Metric className="text-xl text-emerald-500">{activeCampaign.reply_count ?? activeCampaign.replies ?? 0}</Metric><Text>Replies</Text></div>
            </Grid>
            <Button variant="secondary" size="sm" icon={ArrowRightIcon} onClick={() => onOpenCampaign(activeCampaign)}>
              Open monitor
            </Button>
          </Card>
        )}

        <Card className="border-dashed border-2 border-tremor-border dark:border-dark-tremor-border">
          <div className="py-10 text-center">
            <div className="w-12 h-12 rounded-tremor-default bg-blue-50 flex items-center justify-center mx-auto mb-3 dark:bg-blue-500/10">
              <SparklesIcon className="w-6 h-6 text-blue-500" />
            </div>
            <Title className="text-lg">Create a new campaign</Title>
            <Text className="mb-4">4-step wizard: name, recipients, message, review.</Text>
            <Button icon={PaperAirplaneIcon} onClick={openWizard} className="mx-auto">Start wizard</Button>
          </div>
        </Card>

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
                      <div className="text-xs text-tremor-content dark:text-dark-tremor-content">{timeAgo(c.started_at)}</div>
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

  // ===== Wizard =====
  return (
    <div className="space-y-6">
      <Flex justifyContent="between" alignItems="center">
        <div className="min-w-0">
          <Title>New Campaign</Title>
          <Text>Step {step} of 4 — {STEPS[step - 1].label}</Text>
        </div>
        <Button variant="light" onClick={() => setWizardOpen(false)}>Cancel</Button>
      </Flex>

      {/* Step indicator */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {STEPS.map((s, i) => {
          const done = step > s.id;
          const active = step === s.id;
          return (
            <div key={s.id} className="flex items-center gap-2 shrink-0">
              <div className={[
                "flex items-center gap-1.5 px-3 py-1.5 rounded-tremor-full text-xs font-medium whitespace-nowrap",
                active ? "bg-blue-500 text-white"
                  : done ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400"
                  : "bg-tremor-background-muted text-tremor-content dark:bg-dark-tremor-background-muted dark:text-dark-tremor-content",
              ].join(" ")}>
                {done ? <CheckCircleIcon className="w-3.5 h-3.5" /> : <s.icon className="w-3.5 h-3.5" />}
                {s.label}
              </div>
              {i < STEPS.length - 1 && <div className={["h-px w-6", done ? "bg-blue-400" : "bg-tremor-border dark:bg-dark-tremor-border"].join(" ")} />}
            </div>
          );
        })}
      </div>

      <Card>
        <div className="p-1 min-h-[320px]">
          {/* Step 1 */}
          {step === 1 && (
            <div className="space-y-4 max-w-md">
              <div>
                <Text className="mb-1">Campaign name</Text>
                <TextInput
                  autoFocus
                  placeholder="e.g. Lesson 1 — Introduction"
                  value={campaignName}
                  onChange={(e: any) => setCampaignName(e.target.value)}
                />
                <Text className="text-xs mt-1.5">Give your campaign a recognizable name. Only you'll see this.</Text>
              </div>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <Text className="mb-1">Upload recipients CSV</Text>
                <Text className="text-xs mb-2">
                  Format: <code className="bg-tremor-background-muted px-1.5 py-0.5 rounded-tremor-small dark:bg-dark-tremor-background-muted">phone,name</code> — one per line.
                </Text>
                <div className="flex items-center gap-3 flex-wrap">
                  <input
                    ref={fileInputRef} type="file" accept=".csv"
                    className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                  />
                  <Button variant="secondary" icon={ArrowUpTrayIcon} onClick={() => fileInputRef.current?.click()} type="button">
                    {file ? "Change file" : "Choose CSV"}
                  </Button>
                  {file && (
                    <span className="text-sm text-tremor-content flex items-center gap-2 flex-wrap dark:text-dark-tremor-content">
                      <DocumentTextIcon className="w-3.5 h-3.5" /> {file.name}
                      {parsing ? <ArrowRightIcon className="w-3 h-3 animate-spin" /> :
                        <Badge color="slate">{recipients.length} recipients</Badge>}
                    </span>
                  )}
                </div>
              </div>

              {recipients.length > 0 && (
                <div className="space-y-3">
                  <Flex justifyContent="between">
                    <Text className="font-medium">Preview (first 10)</Text>
                    <Text className="text-xs">Total: <span className="font-medium text-tremor-content-strong dark:text-dark-tremor-content-strong">{recipients.length}</span></Text>
                  </Flex>
                  <div className="overflow-x-auto">
                    <table className="w-full text-tremor-default text-tremor-content dark:text-dark-tremor-content min-w-[320px]">
                      <thead>
                        <tr className="border-b border-tremor-border dark:border-dark-tremor-border text-left">
                          <th className="whitespace-nowrap text-left font-semibold px-4 py-3 text-tremor-content-strong dark:text-dark-tremor-content-strong">#</th>
                          <th className="whitespace-nowrap text-left font-semibold px-4 py-3 text-tremor-content-strong dark:text-dark-tremor-content-strong">Phone</th>
                          <th className="whitespace-nowrap text-left font-semibold px-4 py-3 text-tremor-content-strong dark:text-dark-tremor-content-strong">Name</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recipients.slice(0, 10).map((r, i) => (
                          <tr key={i} className="border-b border-tremor-border last:border-0 dark:border-dark-tremor-border">
                            <td className="px-4 py-3 text-tremor-content dark:text-dark-tremor-content">{i + 1}</td>
                            <td className="px-4 py-3 font-mono text-xs">{r.phone}</td>
                            <td className="px-4 py-3">{r.name || <span className="text-tremor-content italic dark:text-dark-tremor-content">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div>
                  <Text className="mb-1">Message template</Text>
                  <Textarea
                    id="message-textarea"
                    className="font-mono"
                    placeholder="{Hi|Hello|Salam} {name}, your Lesson 1 is ready! Reply 1 to confirm."
                    value={message}
                    onChange={(e: any) => setMessage(e.target.value)}
                    rows={6}
                  />
                  <Flex justifyContent="between" className="mt-1.5">
                    <Text className="text-xs">{charCount} characters</Text>
                    {charCount > 1024 && <Text className="text-xs text-red-500">Over 1024 chars (may split)</Text>}
                  </Flex>
                </div>

                <div>
                  <Text className="text-xs mb-1.5">Spintax helpers</Text>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" size="xs" onClick={() => insertAtCursor("{Hi|Hello|Salam}")}>{`{Hi|Hello|Salam}`}</Button>
                    <Button type="button" variant="secondary" size="xs" onClick={() => insertAtCursor("{name}")}>{`{name}`}</Button>
                    <Button type="button" variant="secondary" size="xs" onClick={() => insertAtCursor("{How are you|How's it going}")}>{`{greeting}`}</Button>
                    <Button type="button" variant="secondary" size="xs" onClick={() => insertAtCursor("\n\nReply 1 to confirm.")}>Reply prompt</Button>
                  </div>
                  <Text className="text-xs mt-2">
                    Use <code className="bg-tremor-background-muted px-1 rounded-tremor-small dark:bg-dark-tremor-background-muted">{`{A|B|C}`}</code> for spintax and <code className="bg-tremor-background-muted px-1 rounded-tremor-small dark:bg-dark-tremor-background-muted">{`{name}`}</code> for personalization.
                  </Text>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-1.5">
                  <EyeIcon className="w-3.5 h-3.5 text-tremor-content dark:text-dark-tremor-content" />
                  <Text className="font-medium">Live preview</Text>
                </div>
                <Text className="text-xs -mt-2">3 random recipients with spintax expanded.</Text>
                {previewSamples.length === 0 ? (
                  <div className="border border-tremor-border rounded-tremor-default p-6 text-center text-sm text-tremor-content dark:border-dark-tremor-border dark:text-dark-tremor-content">
                    Write a message to see preview.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {previewSamples.map((p, i) => (
                      <div key={i} className="border border-tremor-border rounded-tremor-default p-3 bg-tremor-background-muted dark:border-dark-tremor-border dark:bg-dark-tremor-background-muted">
                        <Flex justifyContent="between" alignItems="baseline" className="mb-1.5">
                          <Text className="text-xs">To: <span className="font-mono text-tremor-content-strong dark:text-dark-tremor-content-strong">{p.r.phone}</span></Text>
                          {p.r.name && <Badge color="slate" size="xs">{p.r.name}</Badge>}
                        </Flex>
                        <p className="text-sm whitespace-pre-wrap">{p.text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 4 */}
          {step === 4 && (
            <div className="space-y-5">
              {!created ? (
                <>
                  <Grid numItems={1} numItemsSm={3} className="gap-3">
                    <Card className="p-3"><Text className="text-xs">Recipients</Text><Metric className="text-2xl">{recipients.length}</Metric></Card>
                    <Card className="p-3"><Text className="text-xs">Numbers Available</Text><Metric className="text-2xl">{usableNumbers.length}</Metric></Card>
                    <Card className="p-3"><Text className="text-xs">Daily Capacity</Text><Metric className="text-2xl">{dailyCapacity}</Metric></Card>
                  </Grid>

                  <Card className="p-3 bg-blue-50 dark:bg-blue-500/10" decoration="left" decorationColor="blue">
                    <Flex justifyContent="start" className="gap-2">
                      <PaperAirplaneIcon className="w-4 h-4 text-blue-500" />
                      <Text>Estimated time: <span className="font-semibold">
                        {usableNumbers.length === 0 ? "No numbers available"
                          : estimatedHours < 1 ? "<1 hour"
                          : `${estimatedHours.toFixed(1)} hours`}
                      </span></Text>
                    </Flex>
                    <Text className="text-xs mt-1 ml-6">
                      With {usableNumbers.length} number{usableNumbers.length !== 1 ? "s" : ""} at {hourlyCapacity}/hr combined.
                      {recipients.length > dailyCapacity && (
                        <span className="text-red-500 font-medium block mt-1">
                          ⚠ Recipients exceed today's remaining capacity. Will continue tomorrow when limits reset.
                        </span>
                      )}
                    </Text>
                  </Card>

                  <div>
                    <Text className="text-xs uppercase tracking-wider font-medium">Per-number breakdown</Text>
                    <div className="overflow-x-auto mt-2">
                      <table className="w-full text-tremor-default text-tremor-content dark:text-dark-tremor-content min-w-[480px]">
                        <thead>
                          <tr className="border-b border-tremor-border dark:border-dark-tremor-border text-left">
                            <th className="whitespace-nowrap text-left font-semibold px-4 py-3 text-tremor-content-strong dark:text-dark-tremor-content-strong">Number</th>
                            <th className="whitespace-nowrap text-right font-semibold px-4 py-3 text-tremor-content-strong dark:text-dark-tremor-content-strong">Daily limit</th>
                            <th className="whitespace-nowrap text-right font-semibold px-4 py-3 text-tremor-content-strong dark:text-dark-tremor-content-strong">Hourly</th>
                            <th className="whitespace-nowrap text-right font-semibold px-4 py-3 text-tremor-content-strong dark:text-dark-tremor-content-strong">Capacity left</th>
                          </tr>
                        </thead>
                        <tbody>
                          {usableNumbers.length === 0 ? (
                            <tr><td colSpan={4} className="text-center text-sm text-tremor-content py-4 dark:text-dark-tremor-content">No active numbers. Add one in the Numbers tab.</td></tr>
                          ) : usableNumbers.map((n) => (
                            <tr key={n.instance} className="border-b border-tremor-border last:border-0 dark:border-dark-tremor-border">
                              <td className="px-4 py-3 font-medium text-tremor-content-strong dark:text-dark-tremor-content-strong">{n.displayName}</td>
                              <td className="px-4 py-3 text-right tabular-nums">{n.effectiveLimit}</td>
                              <td className="px-4 py-3 text-right tabular-nums">{n.hourlyLimit || 20}</td>
                              <td className="px-4 py-3 text-right tabular-nums">{n.capacityLeft}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <Flex justifyContent="end">
                    <Button icon={uploading ? undefined : CheckCircleIcon} onClick={doUpload} disabled={uploading || usableNumbers.length === 0} loading={uploading} loadingText="Creating…">
                      {uploading ? "Creating…" : "Create campaign"}
                    </Button>
                  </Flex>
                </>
              ) : (
                <div className="text-center py-6 space-y-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto dark:bg-emerald-500/10">
                    <CheckCircleIcon className="w-7 h-7 text-emerald-500" />
                  </div>
                  <div>
                    <Title className="text-lg">Campaign created</Title>
                    <Text className="mt-1">
                      <span className="font-medium text-tremor-content-strong dark:text-dark-tremor-content-strong">{created.count}</span> recipients loaded.
                      Ready to start sending.
                    </Text>
                  </div>
                  <Button icon={PlayIcon} size="lg" onClick={startIt} className="mx-auto">Start campaign now</Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Wizard nav */}
        {!created && (
          <Flex justifyContent="between" className="mt-6 pt-4 border-t border-tremor-border dark:border-dark-tremor-border">
            <Button variant="light" icon={ArrowLeftIcon} onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1}>
              Back
            </Button>
            {step < 4 ? (
              <Button icon={ArrowRightIcon} iconPosition="right" onClick={() => setStep(Math.min(4, step + 1))} disabled={!canNext}>
                Next
              </Button>
            ) : null}
          </Flex>
        )}
      </Card>
    </div>
  );
}