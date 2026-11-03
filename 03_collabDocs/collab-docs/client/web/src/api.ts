/** Calls to the Elysia backend. The browser never calls actor methods itself. */
import type { actors, SocketGrant } from "../../generated/index.js";
import type { User } from "./user";

export type DocSummary = actors.DocIndex.Methods["list"]["Result"][number];

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (!response.ok) throw new Error(`${init?.method ?? "GET"} ${path} failed: ${response.status}`);
  return (response.status === 204 ? undefined : await response.json()) as T;
}

export const listDocs = () => request<DocSummary[]>("/docs");
export const createDoc = () => request<DocSummary>("/docs", { method: "POST" });
export const deleteDoc = (id: string) => request<void>(`/docs/${encodeURIComponent(id)}`, { method: "DELETE" });
export const requestSocket = (id: string, user: User) =>
  request<SocketGrant>(`/docs/${encodeURIComponent(id)}/socket`, { method: "POST", body: JSON.stringify(user) });
