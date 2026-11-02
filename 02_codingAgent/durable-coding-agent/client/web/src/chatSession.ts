/** Owns one pane's actor socket outside React, so panes keep their connection when the layout changes. */
import { applyImmutable, type Op } from "@earendil-works/chord/delta";
import type { ConversationView, LiveState } from "@earendil-works/pi-durable";

import type { actors } from "../../generated/index.js";

type Outgoing = actors.PiAgent.Outgoing;
export type Preview = Extract<Outgoing, { status: string }>;

export type Connection = "connecting" | "connected" | "crashed";
export type ChatSnapshot = {
  chatId: string;
  connection: Connection;
  busy: boolean;
  view?: ConversationView;
  draft: string;
  /** Unset until the actor reports its sandbox. */
  preview?: Preview;
};

export const chatIdPattern = /^[a-zA-Z0-9_-]{1,64}$/;

export function newChatId() {
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(8)), byte => (byte % 36).toString(36)).join("");
  return `chat_${suffix}`;
}

const chatUrl = (chatId: string, action: string) => `/api/chat/${encodeURIComponent(chatId)}/${action}`;

export class ChatSession {
  private socket?: WebSocket;
  private generation = 0;
  private started = false;
  private listeners = new Set<() => void>();
  private pendingPrompts = new Set<string>();
  private drafts = new Map<string, string>();
  private snapshot: ChatSnapshot;

  constructor(chatId: string) {
    this.snapshot = { chatId, connection: "connecting", busy: false, draft: "" };
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getSnapshot = () => this.snapshot;

  /** Safe to call on every mount; only the first call connects. */
  start() {
    if (this.started) return;
    this.started = true;
    void this.connect();
  }

  open(chatId: string) {
    this.update({ chatId, view: undefined, draft: this.drafts.get(chatId) ?? "", preview: undefined });
    void this.connect();
  }

  setDraft(draft: string) {
    if (draft) this.drafts.set(this.snapshot.chatId, draft);
    else this.drafts.delete(this.snapshot.chatId);
    this.update({ draft });
  }

  /** Points the preview at any URL, until the actor reports its own. */
  setPreviewUrl(url: string) {
    this.update({ preview: { status: "ready", url } });
  }

  /** The actor keeps running when this pane switches to another chat. */
  async prompt(prompt: string) {
    if (this.snapshot.busy) return false;
    const chatId = this.snapshot.chatId;
    this.pendingPrompts.add(chatId);
    this.setDraft("");
    try {
      const response = await fetch(chatUrl(chatId, "prompt"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!response.ok) throw new Error(`Prompt failed: ${response.status}`);
      return true;
    } catch (error) {
      console.error(error);
      if (!this.drafts.get(chatId)) {
        this.drafts.set(chatId, prompt);
        if (this.snapshot.chatId === chatId) this.update({ draft: prompt });
      }
      return false;
    } finally {
      this.pendingPrompts.delete(chatId);
      this.update({});
    }
  }

  async reset() {
    await fetch(chatUrl(this.snapshot.chatId, "reset"), { method: "POST" });
  }

  async crashTheSucker() {
    try {
      const response = await fetch(chatUrl(this.snapshot.chatId, "crash"), { method: "POST" });
      if (!response.ok) throw new Error(`Crash request failed: ${response.status}`);
    } catch (error) {
      // The actor may exit before the request returns; the socket reports its state.
      console.error(error);
    }
  }

  close() {
    ++this.generation;
    this.socket?.close();
  }

  private update(patch: Partial<ChatSnapshot>) {
    const next = { ...this.snapshot, ...patch };
    const live = next.view?.docs["pi.live"] as LiveState | undefined;
    next.busy = this.pendingPrompts.has(next.chatId) || Boolean(live?.run);
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }

  private async connect() {
    const current = ++this.generation;
    this.socket?.close();
    this.update({ connection: "connecting" });

    try {
      const response = await fetch(chatUrl(this.snapshot.chatId, "socket"), { method: "POST" });
      if (!response.ok) throw new Error(`Socket grant failed: ${response.status}`);
      const grant: { websocketUrl: string } = await response.json();
      window.dispatchEvent(new Event("sessions-changed"));
      if (current !== this.generation) return;

      // Elysia grants access; events stream directly from the durable actor.
      const socket = new WebSocket(grant.websocketUrl);
      this.socket = socket;
      socket.onmessage = ({ data }) => {
        if (current === this.generation) this.receive(JSON.parse(data));
      };
      socket.onclose = () => {
        if (current === this.generation) this.update({ connection: "crashed" });
      };
    } catch (error) {
      console.error(error);
      if (current === this.generation) this.update({ connection: "crashed" });
    }
  }

  private receive(event: Outgoing) {
    if ("status" in event) {
      this.update({ preview: event });
    } else if (event.type === "view") {
      this.update({ connection: "connected", view: event.view as ConversationView });
    } else if (this.snapshot.view) {
      try {
        this.update({ view: applyImmutable(this.snapshot.view, event.ops as readonly Op[]) });
      } catch (error) {
        // Ops only apply to the revision they came from; a fresh view resyncs.
        console.error(error);
        void this.connect();
      }
    }
  }
}
