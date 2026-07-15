"use client";

import { useState, useEffect } from "react";
import { Upload, Play, Stop, RefreshCw, Phone, Send, CheckCircle, XCircle, Clock } from "lucide-react";

interface Campaign {
  id: string;
  name: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  reply_count: number;
}

interface NumberInfo {
  instance: string;
  status: string;
  messagesToday: number;
  repliesToday: number;
}

export default function Dashboard() {
  const [campaignName, setCampaignName] = useState("");
  const [messageTemplate, setMessageTemplate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [numbers, setNumbers] = useState<NumberInfo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [starting, setStarting] = useState(false);

  const fetchStatus = async () => {
    if (!campaign) return;
    const res = await fetch(`/api/status?campaignId=${campaign.id}`);
    const data = await res.json();
    if (data.campaign) setCampaign(data.campaign);
    if (data.numbers) setNumbers(data.numbers);
  };

  useEffect(() => {
    if (campaign && campaign.status === "sending") {
      const interval = setInterval(fetchStatus, 5000);
      return () => clearInterval(interval);
    }
  }, [campaign?.status]);

  const upload = async () => {
    if (!file || !campaignName || !messageTemplate) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("campaignName", campaignName);
    formData.append("messageTemplate", messageTemplate);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();
    setCampaign({ id: data.campaignId, name: campaignName, status: "draft", total_recipients: data.count, sent_count: 0, reply_count: 0 });
    setUploading(false);
  };

  const startCampaign = async () => {
    if (!campaign) return;
    setStarting(true);
    await fetch("/api/campaign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: campaign.id, action: "start" }),
    });
    fetchStatus();
    setStarting(false);
  };

  const stopCampaign = async () => {
    if (!campaign) return;
    await fetch("/api/campaign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: campaign.id, action: "stop" }),
    });
    fetchStatus();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">WhatsApp Sender</h1>

        {/* Create Campaign */}
        <div className="bg-white rounded-lg p-6 shadow mb-6 space-y-4">
          <h2 className="font-semibold">New Campaign</h2>
          <input className="w-full px-3 py-2 border rounded text-sm" placeholder="Campaign name (e.g. Lesson 1)" value={campaignName} onChange={(e) => setCampaignName(e.target.value)} />
          <textarea className="w-full px-3 py-2 border rounded text-sm font-mono" rows={4} placeholder="Message template (use {Hi|Hello} for spintax, {name} for name)" value={messageTemplate} onChange={(e) => setMessageTemplate(e.target.value)} />
          <div className="flex items-center gap-4">
            <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm" />
            <button onClick={upload} disabled={!file || !campaignName || !messageTemplate || uploading} className="px-4 py-2 bg-blue-600 text-white rounded text-sm disabled:opacity-50">
              {uploading ? "Uploading..." : "Upload & Create"}
            </button>
          </div>
        </div>

        {/* Campaign Progress */}
        {campaign && (
          <div className="bg-white rounded-lg p-6 shadow mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">{campaign.name}</h2>
              <span className="text-sm px-3 py-1 rounded-full bg-gray-100">{campaign.status}</span>
            </div>
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div className="text-center"><div className="text-2xl font-bold">{campaign.total_recipients}</div><div className="text-xs text-gray-500">Total</div></div>
              <div className="text-center"><div className="text-2xl font-bold text-blue-600">{campaign.sent_count}</div><div className="text-xs text-gray-500">Sent</div></div>
              <div className="text-center"><div className="text-2xl font-bold text-green-600">{campaign.reply_count}</div><div className="text-xs text-gray-500">Replies</div></div>
              <div className="text-center"><div className="text-2xl font-bold">{campaign.total_recipients > 0 ? ((campaign.sent_count / campaign.total_recipients) * 100).toFixed(0) : 0}%</div><div className="text-xs text-gray-500">Progress</div></div>
            </div>
            {campaign.status === "draft" || campaign.status === "paused" ? (
              <button onClick={startCampaign} disabled={starting} className="px-4 py-2 bg-green-600 text-white rounded text-sm">
                {starting ? "Starting..." : "Start Campaign"}
              </button>
            ) : campaign.status === "sending" ? (
              <button onClick={stopCampaign} className="px-4 py-2 bg-red-600 text-white rounded text-sm">Stop Campaign</button>
            ) : null}
          </div>
        )}

        {/* Numbers */}
        <div className="bg-white rounded-lg p-6 shadow">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">WhatsApp Numbers</h2>
            <button onClick={fetchStatus} className="text-sm text-gray-500"><RefreshCw className="inline h-4 w-4" /></button>
          </div>
          {numbers.length === 0 ? (
            <p className="text-sm text-gray-400">No numbers configured yet.</p>
          ) : (
            <div className="space-y-2">
              {numbers.map((n) => (
                <div key={n.instance} className="flex items-center justify-between border-b py-2">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${n.status === "active" ? "bg-green-500" : "bg-red-500"}`} />
                    <span className="text-sm">{n.instance}</span>
                  </div>
                  <div className="text-sm text-gray-500">{n.messagesToday} msgs today</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}