"use client";

import { useState, useMemo, useRef } from "react";
import {
  ArrowLeft, ArrowRight, Upload, FileText, Check, Loader2, Sparkles,
  Send, Users, MessageSquare, Play, Eye,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  type NumberInfo, type Campaign, previewSpintax,
} from "@/lib/types";

interface CampaignsProps {
  numbers: NumberInfo[];
  campaigns: Campaign[];
  activeCampaign: Campaign | null;
  onStartWizard: () => void;
  onOpenCampaign: (c: Campaign) => void;
  onUpload: (params: { campaignName: string; messageTemplate: string; file: File }) => Promise<{ campaignId: string; count: number } | null>;
  onStartCampaign: (campaignId: string) => Promise<void>;
}

interface PreviewRecipient { phone: string; name: string }

const STEPS = [
  { id: 1, label: "Name", icon: FileText },
  { id: 2, label: "Recipients", icon: Users },
  { id: 3, label: "Message", icon: MessageSquare },
  { id: 4, label: "Review", icon: Check },
];

function parseCsvPreview(text: string): PreviewRecipient[] {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  const out: PreviewRecipient[] = [];
  for (const line of lines) {
    if (line.toLowerCase().includes("phone") && line.toLowerCase().includes("name")) continue;
    const parts = line.split(",").map(p => p.trim());
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
  numbers, campaigns, activeCampaign, onStartWizard, onOpenCampaign, onUpload, onStartCampaign,
}: CampaignsProps) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(1);

  // wizard state
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
    onStartWizard();
  };

  const handleFile = (f: File) => {
    setFile(f);
    setParsing(true);
    f.text().then(t => {
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

  // Available numbers and capacity
  const usableNumbers = useMemo(() =>
    numbers.filter(n => n.status !== "restricted" && n.status !== "deleted" && n.warmupStatus !== "warmup")
      .sort((a, b) => b.capacityLeft - a.capacityLeft),
    [numbers]);
  const dailyCapacity = usableNumbers.reduce((s, n) => s + n.capacityLeft, 0);
  const hourlyCapacity = usableNumbers.reduce((s, n) => s + (n.hourlyLimit || 20), 0);

  const estimatedHours = useMemo(() => {
    if (!recipients.length || hourlyCapacity === 0) return 0;
    return recipients.length / hourlyCapacity;
  }, [recipients.length, hourlyCapacity]);

  // Message preview — 3 random recipients
  const previewSamples = useMemo(() => {
    if (!recipients.length || !message) return [];
    const shuffled = [...recipients].sort(() => Math.random() - 0.5).slice(0, 3);
    return shuffled.map(r => ({
      r,
      text: previewSpintax(message, r.name),
    }));
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

  // ===== Render =====
  if (!wizardOpen) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Campaigns</h1>
          <p className="text-sm text-muted-foreground mt-1">Create and manage messaging campaigns</p>
        </div>

        {/* Active campaign quick view */}
        {activeCampaign && (
          <Card className="border-primary/30">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-base flex items-center gap-2 min-w-0">
                    <Send className="w-4 h-4 text-primary shrink-0" /> <span className="truncate">{activeCampaign.name}</span>
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    {activeCampaign.status === "sending" ? "Live campaign in progress" : "Campaign ready"}
                  </CardDescription>
                </div>
                <Badge variant={activeCampaign.status === "sending" ? "default" : "secondary"} className="shrink-0">{activeCampaign.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-3 gap-4 mb-3">
                <div><div className="text-lg sm:text-xl font-semibold tabular-nums">{activeCampaign.total_recipients || activeCampaign.total || 0}</div><div className="text-xs text-muted-foreground">Total</div></div>
                <div><div className="text-lg sm:text-xl font-semibold tabular-nums text-primary">{activeCampaign.sent_count || activeCampaign.sent || 0}</div><div className="text-xs text-muted-foreground">Sent</div></div>
                <div><div className="text-lg sm:text-xl font-semibold tabular-nums text-blue-500">{activeCampaign.reply_count || activeCampaign.replies || 0}</div><div className="text-xs text-muted-foreground">Replies</div></div>
              </div>
              <Button variant="outline" size="sm" onClick={() => onOpenCampaign(activeCampaign)}>Open monitor →</Button>
            </CardContent>
          </Card>
        )}

        {/* New campaign CTA */}
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-medium">Create a new campaign</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4">4-step wizard: name, recipients, message, review.</p>
            <Button onClick={openWizard} className="w-full sm:w-auto"><Send className="w-4 h-4" /> Start wizard</Button>
          </CardContent>
        </Card>

        {/* Recent campaigns */}
        {campaigns.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recent Campaigns</CardTitle>
              <CardDescription className="text-xs">{campaigns.length} total</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="divide-y">
                {campaigns.map(c => {
                  const total = c.total_recipients || c.total || 0;
                  const sent = c.sent_count || c.sent || 0;
                  const replies = c.reply_count || c.replies || 0;
                  return (
                    <div key={c.id} onClick={() => onOpenCampaign(c)} className="flex items-center justify-between gap-3 py-3 cursor-pointer hover:bg-accent/40 -mx-2 px-2 rounded-md transition-colors">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{c.name}</div>
                        <div className="text-xs text-muted-foreground">{timeAgo(c.started_at)}</div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 flex-wrap justify-end">
                        <Badge variant={c.status === "sending" ? "default" : c.status === "completed" ? "success" : "secondary"}>{c.status}</Badge>
                        <span className="text-xs text-muted-foreground tabular-nums">{sent}/{total} · {replies} replies</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // ===== Wizard =====
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">New Campaign</h1>
          <p className="text-sm text-muted-foreground mt-1">Step {step} of 4 — {STEPS[step - 1].label}</p>
        </div>
        <Button variant="ghost" onClick={() => setWizardOpen(false)}>Cancel</Button>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 overflow-x-auto -mx-1 px-1 pb-1">
        {STEPS.map((s, i) => {
          const done = step > s.id;
          const active = step === s.id;
          return (
            <div key={s.id} className="flex items-center gap-2 shrink-0">
              <div className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap",
                active ? "bg-primary text-primary-foreground"
                : done ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground"
              )}>
                {done ? <Check className="w-3.5 h-3.5" /> : <s.icon className="w-3.5 h-3.5" />}
                {s.label}
              </div>
              {i < STEPS.length - 1 && <div className={cn("h-px w-6", done ? "bg-primary/40" : "bg-border")} />}
            </div>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-4 sm:p-6 min-h-[320px]">
          {/* Step 1 */}
          {step === 1 && (
            <div className="space-y-4 max-w-md">
              <div>
                <Label htmlFor="cname">Campaign name</Label>
                <Input
                  id="cname" className="mt-1.5" autoFocus
                  placeholder="e.g. Lesson 1 — Introduction"
                  value={campaignName}
                  onChange={e => setCampaignName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1.5">Give your campaign a recognizable name. Only you'll see this.</p>
              </div>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <Label>Upload recipients CSV</Label>
                <p className="text-xs text-muted-foreground mt-0.5 mb-2">Format: <code className="bg-muted px-1.5 py-0.5 rounded">phone,name</code> — one per line.</p>
                <div className="flex items-center gap-3 flex-wrap">
                  <input
                    ref={fileInputRef} type="file" accept=".csv"
                    className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
                  />
                  <Button variant="outline" onClick={() => fileInputRef.current?.click()} type="button">
                    <Upload className="w-4 h-4" /> {file ? "Change file" : "Choose CSV"}
                  </Button>
                  {file && (
                    <span className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                      <FileText className="w-3.5 h-3.5" /> {file.name}
                      {parsing ? <Loader2 className="w-3 h-3 animate-spin" /> :
                        <Badge variant="secondary">{recipients.length} recipients</Badge>}
                    </span>
                  )}
                </div>
              </div>

              {recipients.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Preview (first 10)</Label>
                    <span className="text-xs text-muted-foreground">Total: <span className="font-medium text-foreground">{recipients.length}</span></span>
                  </div>
                  <div className="border rounded-md overflow-x-auto">
                    <Table className="min-w-[320px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">#</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Name</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recipients.slice(0, 10).map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                            <TableCell className="font-mono text-xs">{r.phone}</TableCell>
                            <TableCell>{r.name || <span className="text-muted-foreground italic">—</span>}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
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
                  <Label htmlFor="message-textarea">Message template</Label>
                  <Textarea
                    id="message-textarea"
                    className="mt-1.5 font-mono min-h-[140px]"
                    placeholder="{Hi|Hello|Salam} {name}, your Lesson 1 is ready! Reply 1 to confirm."
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                  />
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-xs text-muted-foreground">{charCount} characters</span>
                    {charCount > 1024 && <span className="text-xs text-red-500">Over 1024 chars (may split)</span>}
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Spintax helpers</Label>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    <Button type="button" variant="outline" size="sm" onClick={() => insertAtCursor("{Hi|Hello|Salam}")}>{`{Hi|Hello|Salam}`}</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => insertAtCursor("{name}")}>{`{name}`}</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => insertAtCursor("{How are you|How's it going}")}>{`{greeting}`}</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => insertAtCursor("\n\nReply 1 to confirm.")}>Reply prompt</Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Use <code className="bg-muted px-1 rounded">{`{A|B|C}`}</code> for spintax (random pick) and <code className="bg-muted px-1 rounded">{`{name}`}</code> for personalization.</p>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" /> Live preview</Label>
                <p className="text-xs text-muted-foreground -mt-1.5">3 random recipients with spintax expanded.</p>
                {previewSamples.length === 0 ? (
                  <div className="border rounded-md p-6 text-center text-sm text-muted-foreground">
                    Write a message to see preview.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {previewSamples.map((p, i) => (
                      <div key={i} className="border rounded-md p-3 bg-muted/30">
                        <div className="text-xs text-muted-foreground mb-1.5 flex items-center justify-between">
                          <span>To: <span className="font-mono text-foreground">{p.r.phone}</span></span>
                          {p.r.name && <Badge variant="secondary" className="text-xs">{p.r.name}</Badge>}
                        </div>
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
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground">Recipients</div>
                      <div className="text-2xl font-semibold mt-1 tabular-nums">{recipients.length}</div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground">Numbers available</div>
                      <div className="text-2xl font-semibold mt-1 tabular-nums">{usableNumbers.length}</div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground">Daily capacity</div>
                      <div className="text-2xl font-semibold mt-1 tabular-nums">{dailyCapacity}</div>
                    </div>
                  </div>

                  <div className="rounded-lg border p-3 bg-primary/5">
                    <div className="flex items-center gap-2 text-sm">
                      <Send className="w-4 h-4 text-primary" />
                      <span>Estimated time: <span className="font-semibold">
                        {usableNumbers.length === 0 ? "No numbers available"
                          : estimatedHours < 1 ? "<1 hour"
                          : `${estimatedHours.toFixed(1)} hours`}
                      </span></span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 ml-6">
                      With {usableNumbers.length} number{usableNumbers.length !== 1 ? "s" : ""} at {hourlyCapacity}/hr each combined.
                      {recipients.length > dailyCapacity && (
                        <span className="text-red-500 font-medium block mt-1">
                          ⚠ Recipients exceed today's remaining capacity. Will continue tomorrow when limits reset.
                        </span>
                      )}
                    </p>
                  </div>

                  <Separator />

                  <div>
                    <Label className="text-xs uppercase tracking-wider">Per-number breakdown</Label>
                    <div className="border rounded-md mt-2 overflow-x-auto">
                      <Table className="min-w-[480px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Number</TableHead>
                            <TableHead className="text-right">Daily limit</TableHead>
                            <TableHead className="text-right">Hourly</TableHead>
                            <TableHead className="text-right">Capacity left</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {usableNumbers.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-4">
                                No active numbers. Add one in the Numbers tab.
                              </TableCell>
                            </TableRow>
                          ) : usableNumbers.map(n => (
                            <TableRow key={n.instance}>
                              <TableCell className="font-medium">{n.displayName}</TableCell>
                              <TableCell className="text-right tabular-nums">{n.effectiveLimit}</TableCell>
                              <TableCell className="text-right tabular-nums">{n.hourlyLimit || 20}</TableCell>
                              <TableCell className="text-right tabular-nums">{n.capacityLeft}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button onClick={doUpload} disabled={uploading || usableNumbers.length === 0} className="w-full sm:w-auto">
                      {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : <><Check className="w-4 h-4" /> Create campaign</>}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-center py-6 space-y-4">
                  <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                    <Check className="w-6 h-6 text-green-500" />
                  </div>
                  <div>
                    <h3 className="font-medium text-lg">Campaign created</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      <span className="font-medium text-foreground">{created.count}</span> recipients loaded.
                      Ready to start sending.
                    </p>
                  </div>
                  <Button onClick={startIt} size="lg" className="w-full sm:w-auto"><Play className="w-4 h-4" /> Start campaign now</Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Wizard nav */}
      {step < 4 && (
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => step > 1 ? setStep(step - 1) : setWizardOpen(false)}>
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <Button onClick={() => setStep(step + 1)} disabled={!canNext}>
            Next <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {step === 4 && !created && (
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => setStep(step - 1)}>
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <span className="text-xs text-muted-foreground">Review the details, then create the campaign.</span>
        </div>
      )}
    </div>
  );
}