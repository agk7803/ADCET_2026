// src/utils/api.ts
const API = import.meta.env.VITE_API_BASE || "http://localhost:8000";

export async function apiStart(): Promise<void> {
  await fetch(`${API}/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
}

export async function apiStop(): Promise<void> {
  await fetch(`${API}/disconnect`, { method: "POST" });
}

export async function apiReset(): Promise<void> {
  await fetch(`${API}/reset`, { method: "POST" });
}

export async function apiStatus(): Promise<any> {
  const res = await fetch(`${API}/status`);
  return res.json();
}

export async function apiData(): Promise<any> {
  const res = await fetch(`${API}/data`);
  return res.json();
}

export const plotUrl = `${API}/plot`;
export const referenceImageUrl = `${API}/reference-image`;
