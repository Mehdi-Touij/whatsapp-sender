"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Card, Title, Text, Button, Badge, TextInput, Select, SelectItem, Flex,
  Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell,
  Dialog, DialogPanel, Textarea,
} from "@tremor/react";
import {
  PlusIcon, MagnifyingGlassIcon, ArrowDownTrayIcon, ArrowLeftIcon,
  ArrowRightIcon, ClipboardDocumentIcon, ClipboardDocumentCheckIcon,
  TrashIcon, ArrowPathIcon, LinkIcon, TableCellsIcon, XMarkIcon,
} from "@heroicons/react/24/outline";

// ----- Types -----

interface Contact {
  id: string;
  phone: string;
  name: string | null;
  source: string | null;
  status: string;
  created_at: string | null;
  notes: string | null;
}

type StatusFilter = "all" | "pending" | "sent" | "replied" | "stopped";

const WEBHOOK_URL =
  "https://evolution-api-2-production-fc73.up.railway.app/api/contacts/webhook";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "sent", label: "Sent" },
  { value: "replied", label: "Replied" },
  { value: "stopped", label: "Stopped" },
];

// ----- Helpers -----

function statusBadgeColor(status: string): "slate" | "blue" | "emerald" | "red" {
  switch (status) {
    case "sent": return "blue";
    case "replied": return "emerald";
    case "stopped": return "red";
    default: return "slate"; // pending
  }
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // +1 415 555 1234-ish — best-effort formatting for readability
  if (digits.length >= 10) {
    const tail = digits.slice(-10);
    return `+${digits.slice(0, -10)} ${tail.slice(0, 3)} ${tail.slice(3, 6)} ${tail.slice(6)}`.trim();
  }
  return phone;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function escapeCsv(value: string | null | undefined): string {
  const s = value ?? "";
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(contacts: Contact[]) {
  const header = ["Name", "Phone", "Status", "Source", "Added Date", "Notes"];
  const rows = contacts.map((c) => [
    c.name ?? "", c.phone, c.status, c.source ?? "",
    c.created_at ? new Date(c.created_at).toISOString() : "",
    c.notes ?? "",
  ]);
  const csv = [header, ...rows].map((r) => r.map(escapeCsv).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ----- Component -----

export function Contacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ phone: "", name: "", source: "", notes: "" });
  const [adding, setAdding] = useState(false);

  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [deletingPhone, setDeletingPhone] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "error" | "info"; msg: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (kind: "error" | "info", msg: string) => {
    setToast({ kind, msg });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(page * pageSize),
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (status !== "all") params.set("status", status);
      const res = await fetch(`/api/contacts?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load contacts");
      const data = await res.json();
      setContacts(Array.isArray(data.contacts) ? data.contacts : []);
      setTotal(typeof data.total === "number" ? data.total : 0);
    } catch (e: any) {
      setError(e?.message || "Failed to load contacts");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, status, page]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Reset to first page when filters change
  useEffect(() => { setPage(0); }, [debouncedSearch, status]);

  const copyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(WEBHOOK_URL);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Some browsers block clipboard on insecure origins; fallback to select
      const el = document.getElementById("webhook-url-input") as HTMLInputElement | null;
      if (el) { el.select(); document.execCommand("copy"); setCopied(true); }
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleAdd = async () => {
    if (!addForm.phone.trim()) {
      showToast("error", "Phone is required");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: addForm.phone.trim(),
          name: addForm.name.trim() || null,
          source: addForm.source.trim() || null,
          notes: addForm.notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || "Failed to add contact");
      }
      showToast("info", "Contact added.");
      setAddForm({ phone: "", name: "", source: "", notes: "" });
      setAddOpen(false);
      await fetchContacts();
    } catch (e: any) {
      showToast("error", e?.message || "Failed to add contact");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (phone: string) => {
    if (!confirm(`Delete contact ${phone}? This cannot be undone.`)) return;
    setDeletingPhone(phone);
    try {
      const res = await fetch(`/api/contacts?phone=${encodeURIComponent(phone)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete contact");
      showToast("info", "Contact deleted.");
      await fetchContacts();
    } catch (e: any) {
      showToast("error", e?.message || "Failed to delete");
    } finally {
      setDeletingPhone(null);
    }
  };

  const handleExport = async () => {
    // For the filtered view: if we have all rows loaded, export them.
    // Otherwise, fetch everything matching the current filter.
    try {
      let toExport = contacts;
      if (total > contacts.length) {
        const params = new URLSearchParams({ limit: "500", offset: "0" });
        if (debouncedSearch) params.set("search", debouncedSearch);
        if (status !== "all") params.set("status", status);
        const res = await fetch(`/api/contacts?${params.toString()}`, { cache: "no-store" });
        if (res.ok) {
          const d = await res.json();
          if (Array.isArray(d.contacts)) toExport = d.contacts;
        }
      }
      if (toExport.length === 0) {
        showToast("info", "Nothing to export.");
        return;
      }
      downloadCsv(toExport);
      showToast("info", `Exported ${toExport.length} contacts.`);
    } catch (e: any) {
      showToast("error", e?.message || "Export failed");
    }
  };

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const showingFrom = total === 0 ? 0 : page * pageSize + 1;
  const showingTo = Math.min((page + 1) * pageSize, total);

  // ----- Render -----

  return (
    <div className="space-y-6">
      <Flex justifyContent="between" alignItems="center" className="flex-wrap gap-3">
        <div>
          <Title>Contacts</Title>
          <Text>Unified address book — synced from CSV uploads and webhook</Text>
        </div>
        <Flex justifyContent="end" className="gap-2 flex-wrap">
          <Button variant="secondary" icon={ArrowDownTrayIcon} onClick={handleExport} disabled={total === 0}>
            Export CSV
          </Button>
          <Button icon={PlusIcon} onClick={() => setAddOpen(true)}>Add Contact</Button>
        </Flex>
      </Flex>

      {toast && (
        <Card
          decoration="left"
          className={[
            "py-2",
            toast.kind === "error"
              ? "border-red-500/40 bg-red-50 dark:bg-red-500/10"
              : "border-blue-500/40 bg-blue-50 dark:bg-blue-500/10",
          ].join(" ")}
        >
          <Flex justifyContent="between" alignItems="center">
            <Text className={toast.kind === "error" ? "text-red-700 dark:text-red-400" : "text-blue-700 dark:text-blue-400"}>
              {toast.msg}
            </Text>
            <button onClick={() => setToast(null)} aria-label="Dismiss" className="shrink-0 text-tremor-content hover:text-tremor-content-strong dark:text-dark-tremor-content dark:hover:text-dark-tremor-content-strong">
              <XMarkIcon className="w-4 h-4" />
            </button>
          </Flex>
        </Card>
      )}

      {/* Webhook URL display */}
      <Card className="py-3">
        <Flex justifyContent="between" alignItems="center" className="gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <Flex justifyContent="start" alignItems="center" className="gap-2 mb-1">
              <LinkIcon className="w-4 h-4 text-blue-500 shrink-0" />
              <Text className="font-medium">Webhook URL</Text>
              <Text className="text-xs text-tremor-content dark:text-dark-tremor-content">
                — POST JSON to add contacts from external tools (Clay, Zapier, n8n…)
              </Text>
            </Flex>
            <div className="flex items-center gap-2">
              <input
                id="webhook-url-input"
                readOnly
                value={WEBHOOK_URL}
                onFocus={(e) => e.target.select()}
                className="flex-1 min-w-0 font-mono text-xs px-3 py-2 rounded-tremor-default bg-tremor-background-muted text-tremor-content-strong border border-tremor-border dark:bg-dark-tremor-background-muted dark:text-dark-tremor-content-strong dark:border-dark-tremor-border"
              />
              <Button
                size="sm"
                variant="secondary"
                icon={copied ? ClipboardDocumentCheckIcon : ClipboardDocumentIcon}
                onClick={copyWebhook}
                className={copied ? "text-emerald-600" : ""}
              >
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        </Flex>
      </Card>

      {/* Filters + search */}
      <Card className="py-3">
        <Flex justifyContent="between" alignItems="center" className="gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <MagnifyingGlassIcon className="w-4 h-4 text-tremor-content absolute left-3 top-1/2 -translate-y-1/2 dark:text-dark-tremor-content" />
            <TextInput
              placeholder="Search by name or phone…"
              value={search}
              onChange={(e: any) => setSearch(e.target.value)}
              icon={undefined}
              className="pl-9"
            />
          </div>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as StatusFilter)}
            className="w-40"
          >
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </Select>
        </Flex>
      </Card>

      {/* Table / empty / loading */}
      {loading ? (
        <Card>
          <div className="py-16 text-center">
            <ArrowPathIcon className="w-6 h-6 text-tremor-content mx-auto mb-2 animate-spin dark:text-dark-tremor-content" />
            <Text>Loading contacts…</Text>
          </div>
        </Card>
      ) : error ? (
        <Card decoration="left" decorationColor="red">
          <Text className="text-red-600 dark:text-red-400">{error}</Text>
          <Button variant="light" size="sm" className="mt-2" icon={ArrowPathIcon} onClick={fetchContacts}>Retry</Button>
        </Card>
      ) : contacts.length === 0 ? (
        <Card>
          <div className="py-16 text-center">
            <div className="w-12 h-12 rounded-tremor-default bg-tremor-background-muted flex items-center justify-center mx-auto mb-3 dark:bg-dark-tremor-background-muted">
              <TableCellsIcon className="w-6 h-6 text-tremor-content dark:text-dark-tremor-content" />
            </div>
            <Title className="text-lg">No contacts yet</Title>
            <Text className="mt-1">
              Upload a CSV in Campaigns or use the webhook URL to receive contacts.
            </Text>
          </div>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          {/* Horizontal scroll wrapper for mobile */}
          <div className="overflow-x-auto">
            <Table className="w-full min-w-[760px]">
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Name</TableHeaderCell>
                  <TableHeaderCell>Phone</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Source</TableHeaderCell>
                  <TableHeaderCell>Added Date</TableHeaderCell>
                  <TableHeaderCell>Notes</TableHeaderCell>
                  <TableHeaderCell className="text-right">Actions</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {contacts.map((c, i) => (
                  <TableRow key={c.id} className={i % 2 === 1 ? "bg-tremor-background-muted/50 dark:bg-dark-tremor-background-muted/30 hover:bg-tremor-background-muted dark:hover:bg-dark-tremor-background-muted" : "hover:bg-tremor-background-muted dark:hover:bg-dark-tremor-background-muted"}>
                    <TableCell>
                      <span className="font-medium text-tremor-content-strong dark:text-dark-tremor-content-strong">
                        {c.name || <span className="text-tremor-content italic dark:text-dark-tremor-content">—</span>}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs whitespace-nowrap">{formatPhone(c.phone)}</TableCell>
                    <TableCell>
                      <Badge color={statusBadgeColor(c.status)} className="capitalize">{c.status || "pending"}</Badge>
                    </TableCell>
                    <TableCell>
                      {c.source ? (
                        <span className="text-xs text-tremor-content dark:text-dark-tremor-content">{c.source}</span>
                      ) : (
                        <span className="text-tremor-content italic dark:text-dark-tremor-content">—</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-tremor-content dark:text-dark-tremor-content">{formatDate(c.created_at)}</TableCell>
                    <TableCell>
                      {c.notes ? (
                        <span className="text-xs text-tremor-content line-clamp-2 max-w-[220px] dark:text-dark-tremor-content" title={c.notes}>
                          {c.notes}
                        </span>
                      ) : (
                        <span className="text-tremor-content italic dark:text-dark-tremor-content">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="light"
                        size="xs"
                        icon={deletingPhone === c.phone ? ArrowPathIcon : TrashIcon}
                        onClick={() => handleDelete(c.phone)}
                        disabled={deletingPhone === c.phone}
                        className="text-tremor-content hover:text-red-500 dark:text-dark-tremor-content"
                        aria-label="Delete contact"
                      >
                        {deletingPhone === c.phone ? "…" : ""}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Row count + pagination */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-tremor-border dark:border-dark-tremor-border flex-wrap">
            <Text className="text-xs text-tremor-content dark:text-dark-tremor-content">
              {total === 0
                ? "0 contacts"
                : `Showing ${showingFrom}–${showingTo} of ${total} contact${total !== 1 ? "s" : ""}`}
            </Text>
            <Flex justifyContent="end" className="gap-2">
              <Button
                variant="light"
                size="sm"
                icon={ArrowLeftIcon}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                Prev
              </Button>
              <Text className="text-xs text-tremor-content tabular-nums dark:text-dark-tremor-content">
                Page {page + 1} / {pageCount}
              </Text>
              <Button
                variant="light"
                size="sm"
                icon={ArrowRightIcon}
                iconPosition="right"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={page >= pageCount - 1}
              >
                Next
              </Button>
            </Flex>
          </div>
        </Card>
      )}

      {/* Add contact dialog */}
      <Dialog open={addOpen} onClose={(o) => setAddOpen(o)} static={false}>
        <DialogPanel className="max-w-md">
          <div className="flex items-center gap-2 mb-1">
            <PlusIcon className="w-5 h-5 text-blue-500" />
            <Title className="text-lg">Add Contact</Title>
          </div>
          <Text className="mb-4">Manually add a single contact to your address book.</Text>
          <div className="space-y-3">
            <div>
              <Text className="mb-1">Phone <span className="text-red-500">*</span></Text>
              <TextInput
                placeholder="e.g. 14155551234"
                value={addForm.phone}
                onChange={(e: any) => setAddForm((f) => ({ ...f, phone: e.target.value }))}
                autoFocus
              />
              <Text className="text-xs mt-1">Country code + number, no spaces or '+'.</Text>
            </div>
            <div>
              <Text className="mb-1">Name</Text>
              <TextInput
                placeholder="e.g. Jane Doe"
                value={addForm.name}
                onChange={(e: any) => setAddForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <Text className="mb-1">Source</Text>
              <TextInput
                placeholder="e.g. manual, Clay, Zapier"
                value={addForm.source}
                onChange={(e: any) => setAddForm((f) => ({ ...f, source: e.target.value }))}
              />
            </div>
            <div>
              <Text className="mb-1">Notes</Text>
              <Textarea
                rows={3}
                placeholder="Optional context…"
                value={addForm.notes}
                onChange={(e: any) => setAddForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <Flex justifyContent="end" className="gap-2 mt-5">
            <Button variant="secondary" onClick={() => setAddOpen(false)} disabled={adding}>Cancel</Button>
            <Button
              icon={adding ? ArrowPathIcon : PlusIcon}
              onClick={handleAdd}
              disabled={!addForm.phone.trim() || adding}
              loading={adding}
              loadingText="Saving…"
            >
              {adding ? "Saving…" : "Add contact"}
            </Button>
          </Flex>
        </DialogPanel>
      </Dialog>
    </div>
  );
}