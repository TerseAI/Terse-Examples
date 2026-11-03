/**
 * One open document. Owns the Yjs doc and a WebSocket straight to its Document actor:
 * local edits and cursor moves go up as base64 Yjs updates, everyone else's come back down.
 * TipTap's CollaborationCaret uses this as its "provider" (it only needs `.awareness`).
 */
import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";

import type { actors } from "../../generated/index.js";
import { requestSocket } from "./api";
import { fromBase64, toBase64 } from "./base64";
import type { User } from "./user";

type Incoming = actors.Document.Incoming;
type Outgoing = actors.Document.Outgoing;
type State = Pick<actors.Document.State, "title" | "updatedAt">;
/** Emitted automatically for the actor's @Emittable fields. */
type StateMessage =
  | { type: "state"; state: Partial<State> }
  | { type: "state_update"; changes: Partial<State>; removed: readonly string[] };

export type Collaborator = Extract<Outgoing, { type: "presence" }>["users"][number];
export type Connection = "connecting" | "connected" | "offline" | "deleted";
export type DocSnapshot = {
  connection: Connection;
  /** True once the first full state arrived; the editor mounts after that. */
  synced: boolean;
  /** Local edits the actor hasn't acknowledged yet. */
  saving: boolean;
  title: string;
  updatedAt: number;
  users: Collaborator[];
};

type AwarenessChange = { added: number[]; updated: number[]; removed: number[] };

export class DocSession {
  readonly doc = new Y.Doc();
  readonly awareness = new Awareness(this.doc);
  private socket?: WebSocket;
  private generation = 0;
  private pending = 0;
  private retries = 0;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private listeners = new Set<() => void>();
  private snapshot: DocSnapshot = {
    connection: "connecting",
    synced: false,
    saving: false,
    title: "",
    updatedAt: 0,
    users: [],
  };

  constructor(
    readonly docId: string,
    private readonly user: User,
  ) {
    this.doc.on("update", this.onDocUpdate);
    this.awareness.on("update", this.onAwarenessUpdate);
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  start() {
    void this.connect();
  }

  destroy() {
    ++this.generation;
    clearTimeout(this.retryTimer);
    this.socket?.close();
    this.doc.off("update", this.onDocUpdate);
    this.awareness.off("update", this.onAwarenessUpdate);
    this.awareness.destroy();
    this.doc.destroy();
  }

  setTitle(title: string) {
    this.update({ title });
    this.send({ type: "title", title });
  }

  private onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this) return; // came from the actor
    // While offline, edits stay in the Y.Doc and are sent as a diff after the next sync.
    if (this.send({ type: "update", update: toBase64(update) })) this.track();
  };

  private onAwarenessUpdate = ({ added, updated, removed }: AwarenessChange, origin: unknown) => {
    if (origin !== "local") return;
    const changed = [...added, ...updated, ...removed];
    this.send({
      type: "awareness",
      clientId: this.doc.clientID,
      update: toBase64(encodeAwarenessUpdate(this.awareness, changed)),
    });
  };

  private track() {
    this.pending++;
    if (!this.snapshot.saving) this.update({ saving: true });
  }

  private send(message: Incoming): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN || !this.snapshot.synced) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  private update(patch: Partial<DocSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  private async connect() {
    const current = ++this.generation;
    this.socket?.close();
    this.update({ connection: "connecting", synced: false });

    try {
      // The backend checks who we are and grants a URL; then we talk to the actor directly.
      const grant = await requestSocket(this.docId, this.user);
      if (current !== this.generation) return;

      const socket = new WebSocket(grant.websocketUrl);
      this.socket = socket;
      socket.onmessage = ({ data }) => {
        if (current === this.generation) this.receive(JSON.parse(data));
      };
      socket.onclose = ({ code }) => {
        if (current !== this.generation) return;
        this.pending = 0;
        this.dropRemoteCursors();
        if (code === 4004) {
          this.update({ connection: "deleted", synced: false, saving: false, users: [] });
        } else {
          this.update({ connection: "offline", synced: false, saving: false });
          this.reconnectLater();
        }
      };
    } catch (error) {
      console.error(error);
      if (current !== this.generation) return;
      this.update({ connection: "offline" });
      this.reconnectLater();
    }
  }

  private reconnectLater() {
    clearTimeout(this.retryTimer);
    const delay = Math.min(10_000, 500 * 2 ** this.retries++);
    this.retryTimer = setTimeout(() => void this.connect(), delay);
  }

  private dropRemoteCursors() {
    const remote = [...this.awareness.getStates().keys()].filter(id => id !== this.doc.clientID);
    removeAwarenessStates(this.awareness, remote, this);
  }

  private receive(message: Outgoing | StateMessage) {
    switch (message.type) {
      case "sync": {
        const server = fromBase64(message.update);
        Y.applyUpdate(this.doc, server, this);
        this.retries = 0;
        this.update({ connection: "connected", synced: true });
        // Send anything the actor is missing, such as edits made while offline.
        const missing = Y.encodeStateAsUpdate(this.doc, Y.encodeStateVectorFromUpdate(server));
        if (missing.length > 2 && this.send({ type: "update", update: toBase64(missing) })) this.track();
        // Announce our cursor to people already here.
        if (this.awareness.getLocalState()) {
          this.onAwarenessUpdate({ added: [], updated: [this.doc.clientID], removed: [] }, "local");
        }
        return;
      }
      case "update":
        Y.applyUpdate(this.doc, fromBase64(message.update), this);
        return;
      case "ack":
        this.pending = Math.max(0, this.pending - 1);
        if (this.pending === 0) this.update({ saving: false });
        return;
      case "awareness":
        applyAwarenessUpdate(this.awareness, fromBase64(message.update), this);
        return;
      case "leave":
        removeAwarenessStates(this.awareness, message.clientIds, this);
        return;
      case "presence":
        this.update({ users: message.users });
        return;
      case "deleted":
        this.update({ connection: "deleted" });
        return;
      case "state":
        this.update(pickState(message.state));
        return;
      case "state_update":
        this.update(pickState(message.changes));
        return;
    }
  }
}

function pickState(state: Partial<State>): Partial<DocSnapshot> {
  const patch: Partial<DocSnapshot> = {};
  if (state.title !== undefined) patch.title = state.title;
  if (state.updatedAt !== undefined) patch.updatedAt = state.updatedAt;
  return patch;
}
