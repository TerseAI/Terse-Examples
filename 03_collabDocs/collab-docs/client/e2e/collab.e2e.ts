/**
 * End-to-end test against running actors (local `terse actor dev`, or TERSE_ACTOR_URL).
 *
 *   bun e2e/collab.e2e.ts              # create a doc, edit it from two clients, check sync, index, delete
 *   bun e2e/collab.e2e.ts verify <id>  # reconnect to an existing doc and check its contents survived
 *
 * Uses the real backend routes (in-process via app.handle) and real WebSockets to the Document actor,
 * with Yjs on both ends just like the browser.
 */
import * as Y from "yjs";
import { Awareness, encodeAwarenessUpdate } from "y-protocols/awareness";

import type { actors } from "../generated/index.js";
import { app } from "../src/backend";

type Outgoing = actors.Document.Outgoing | { type: "state" | "state_update"; state?: any; changes?: any };
type Incoming = actors.Document.Incoming;
type DocSummary = actors.DocIndex.Methods["list"]["Result"][number];

const ALICE = { userId: "u_alice", name: "Alice Test", color: "#1a73e8" };
const BOB = { userId: "u_bob", name: "Bob Test", color: "#d93025" };
const CAROL = { userId: "u_carol", name: "Carol Test", color: "#188038" };

let failures = 0;
function check(condition: unknown, label: string) {
  console.log(`${condition ? "  ✓" : "  ✗"} ${label}`);
  if (!condition) failures++;
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await app.handle(
    new Request(`http://local/api${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${await response.text()}`);
  return (response.status === 204 ? undefined : await response.json()) as T;
}

const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const fromBase64 = (text: string) => new Uint8Array(Buffer.from(text, "base64"));

function textOf(doc: Y.Doc) {
  return doc
    .getXmlFragment("default")
    .toArray()
    .map(block => (block instanceof Y.XmlElement ? block.toArray().map(t => (t instanceof Y.XmlText ? t.toString() : "")).join("") : ""))
    .join("\n");
}

/** A headless collaborator: a Yjs doc wired to the Document actor over WebSocket. */
class Client {
  readonly doc = new Y.Doc();
  readonly awareness = new Awareness(this.doc);
  readonly log: Outgoing[] = [];
  closed?: { code: number; reason: string };
  private socket!: WebSocket;
  private waiters: (() => void)[] = [];

  static async join(docId: string, user: typeof ALICE) {
    const client = new Client();
    const grant = await api<{ websocketUrl: string }>("POST", `/docs/${docId}/socket`, user);
    client.socket = new WebSocket(grant.websocketUrl);
    client.socket.onmessage = ({ data }) => {
      const message = JSON.parse(String(data)) as Outgoing;
      client.log.push(message);
      if (message.type === "sync" || message.type === "update") {
        Y.applyUpdate(client.doc, fromBase64(message.update), "remote");
      }
      client.wake();
    };
    client.socket.onclose = ({ code, reason }) => {
      client.closed = { code, reason };
      client.wake();
    };
    client.doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin !== "remote") client.send({ type: "update", update: toBase64(update) });
    });
    await client.waitFor(m => m.type === "sync", "initial sync");
    return client;
  }

  send(message: Incoming) {
    this.socket.send(JSON.stringify(message));
  }

  type(text: string) {
    const paragraph = new Y.XmlElement("paragraph");
    paragraph.insert(0, [new Y.XmlText(text)]);
    const fragment = this.doc.getXmlFragment("default");
    fragment.insert(fragment.length, [paragraph]);
  }

  moveCursor() {
    this.awareness.setLocalStateField("user", { name: "cursor test", color: "#000000" });
    this.send({
      type: "awareness",
      clientId: this.doc.clientID,
      update: toBase64(encodeAwarenessUpdate(this.awareness, [this.doc.clientID])),
    });
  }

  close() {
    this.awareness.destroy();
    this.socket.close();
  }

  /** Resolves with the first logged message matching `predicate`, waiting up to `timeoutMs`. */
  async waitFor(predicate: (message: Outgoing) => boolean, label: string, timeoutMs = 5000): Promise<Outgoing> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = this.log.find(predicate);
      if (found) return found;
      if (this.closed) throw new Error(`socket closed (${this.closed.code} ${this.closed.reason}) waiting for ${label}`);
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error(`timed out waiting for ${label}`);
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, remaining);
        this.waiters.push(() => (clearTimeout(timer), resolve()));
      });
    }
  }

  async waitUntil(condition: () => boolean, label: string, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (!condition()) {
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
      await Bun.sleep(25);
    }
  }

  private wake() {
    for (const waiter of this.waiters.splice(0)) waiter();
  }
}

/** Title from the initial @Emittable state snapshot the actor sends on connect. */
async function stateTitle(client: Client): Promise<string | undefined> {
  const message = (await client.waitFor(m => m.type === "state", "state snapshot")) as { state?: { title?: string } };
  return message.state?.title;
}

async function poll<T>(read: () => Promise<T>, done: (value: T) => boolean, label: string, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await Bun.sleep(250);
  }
}

async function collaborate() {
  console.log("Create a document");
  const created = await api<DocSummary>("POST", "/docs");
  check(/^doc_/.test(created.id) && created.title === "Untitled document", `created ${created.id}`);

  console.log("Two people open it");
  const alice = await Client.join(created.id, ALICE);
  const bob = await Client.join(created.id, BOB);
  const presence = (await alice.waitFor(
    m => m.type === "presence" && m.users.length === 2,
    "presence with two users",
  )) as Extract<Outgoing, { type: "presence" }>;
  check(presence.users.map(u => u.name).sort().join(",") === "Alice Test,Bob Test", "both appear in presence");
  check((await stateTitle(alice)) === "Untitled document", "@Emittable title arrives on connect");

  console.log("Alice types; Bob sees it");
  alice.type("Hello from Alice");
  await bob.waitUntil(() => textOf(bob.doc).includes("Hello from Alice"), "Bob to receive Alice's text");
  check(true, `Bob's doc: ${JSON.stringify(textOf(bob.doc))}`);
  await alice.waitFor(m => m.type === "ack", "ack for Alice's update");
  check(true, "actor acknowledged Alice's update");

  console.log("Both type at once; the CRDT converges");
  alice.type("Alice again");
  bob.type("Bob was here");
  await alice.waitUntil(() => textOf(alice.doc).includes("Bob was here"), "Alice to receive Bob's text");
  await bob.waitUntil(() => textOf(bob.doc).includes("Alice again"), "Bob to receive Alice's second line");
  check(textOf(alice.doc) === textOf(bob.doc), `docs converge: ${JSON.stringify(textOf(alice.doc))}`);

  console.log("Rename and cursors");
  alice.send({ type: "title", title: "  E2E Meeting Notes  " });
  await bob.waitFor(m => m.type === "state_update" && m.changes?.title === "E2E Meeting Notes", "title update");
  check(true, "Bob receives the trimmed title via @Emittable state_update");
  alice.moveCursor();
  await bob.waitFor(m => m.type === "awareness", "Alice's cursor");
  check(true, "Bob receives Alice's cursor (awareness)");

  console.log("A late joiner gets everything, including live cursors");
  const carol = await Client.join(created.id, CAROL);
  check(textOf(carol.doc) === textOf(alice.doc), "Carol's initial sync matches");
  const replayed = await carol.waitFor(m => m.type === "awareness", "replayed cursor", 2000).catch(() => undefined);
  check(replayed, "Carol receives Alice's stored cursor on join");

  console.log("Alice leaves");
  alice.close();
  const leave = (await bob.waitFor(m => m.type === "leave", "leave")) as Extract<Outgoing, { type: "leave" }>;
  check(leave.clientIds.includes(alice.doc.clientID), "Bob is told to drop Alice's cursor");
  await bob.waitFor(
    m => m.type === "presence" && m.users.length === 2 && !m.users.some(u => u.userId === ALICE.userId),
    "presence without Alice",
  );
  check(true, "presence updates without Alice");

  console.log("The index picks up the title and preview (debounced via the actor alarm)");
  const listed = await poll(
    () => api<DocSummary[]>("GET", "/docs"),
    docs => docs.some(d => d.id === created.id && d.title === "E2E Meeting Notes" && d.preview.includes("Bob was here")),
    "index sync",
  );
  const entry = listed.find(d => d.id === created.id)!;
  check(true, `listed as "${entry.title}" — preview "${entry.preview}"`);

  const snapshot = await api<{ title: string; text: string }>("GET", `/docs/${created.id}`);
  check(snapshot.text === textOf(bob.doc), "backend snapshot() matches the clients");

  bob.close();
  carol.close();
  return created.id;
}

async function deletion() {
  console.log("Delete a document while someone has it open");
  const doc = await api<DocSummary>("POST", "/docs");
  const dana = await Client.join(doc.id, { userId: "u_dana", name: "Dana Test", color: "#9334e6" });
  dana.type("soon gone");
  await dana.waitFor(m => m.type === "ack", "ack");
  await api("DELETE", `/docs/${doc.id}`);
  await dana.waitUntil(() => dana.closed !== undefined, "socket close after delete");
  check(dana.closed?.code === 4004, `open editor is disconnected with 4004 (got ${dana.closed?.code})`);
  const docs = await api<DocSummary[]>("GET", "/docs");
  check(!docs.some(d => d.id === doc.id), "deleted doc is gone from the index");
  const rejoin = await Client.join(doc.id, { userId: "u_dana", name: "Dana Test", color: "#9334e6" }).catch(e => e as Error);
  check(rejoin instanceof Error, `reopening a deleted doc fails: ${rejoin instanceof Error ? rejoin.message : "it opened"}`);
}

async function verify(docId: string) {
  console.log(`Reconnect to ${docId} and check it survived`);
  const client = await Client.join(docId, CAROL);
  const text = textOf(client.doc);
  const title = await stateTitle(client);
  check(text.includes("Hello from Alice") && text.includes("Bob was here"), `content: ${JSON.stringify(text)}`);
  check(title === "E2E Meeting Notes", `title: ${title}`);
  const docs = await api<DocSummary[]>("GET", "/docs");
  check(docs.some(d => d.id === docId), "still listed in the index");
  client.close();
}

try {
  if (process.argv[2] === "verify") {
    await verify(process.argv[3] ?? "");
  } else {
    const docId = await collaborate();
    await deletion();
    console.log(`\nDoc for the restart check: ${docId}`);
  }
} catch (error) {
  console.error(`  ✗ ${error instanceof Error ? error.message : error}`);
  failures++;
}
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
