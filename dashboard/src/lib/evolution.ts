// Evolution API client — sends messages, checks status, manages instances

const EVOLUTION_URL = process.env.EVOLUTION_URL || "http://localhost:8080";
const API_KEY = process.env.EVOLUTION_API_KEY || "";

export interface EvolutionInstance {
  instance: string;
  status: string;
  connectionStatus: string;
}

// Send a text message
export async function sendMessage(instance: string, phone: string, text: string): Promise<boolean> {
  const url = `${EVOLUTION_URL}/message/sendText/${instance}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: API_KEY,
    },
    body: JSON.stringify({
      number: phone,
      textMessage: { text },
    }),
  });
  return response.ok;
}

// Get all instances and their connection status
export async function getInstances(): Promise<EvolutionInstance[]> {
  const url = `${EVOLUTION_URL}/instance/fetchInstances`;
  const response = await fetch(url, {
    headers: { apikey: API_KEY },
  });
  if (!response.ok) return [];
  const data = await response.json();
  return data.map((item: any) => ({
    instance: item.instance?.instanceName ?? "",
    status: item.instance?.status ?? "unknown",
    connectionStatus: item.instance?.connectionStatus ?? "unknown",
  }));
}

// Check if an instance is connected
export async function isInstanceConnected(instance: string): Promise<boolean> {
  const url = `${EVOLUTION_URL}/instance/connectionState/${instance}`;
  const response = await fetch(url, {
    headers: { apikey: API_KEY },
  });
  if (!response.ok) return false;
  const data = await response.json();
  return data.state === "open";
}