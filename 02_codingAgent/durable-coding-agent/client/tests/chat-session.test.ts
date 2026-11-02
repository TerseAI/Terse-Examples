import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import { ChatSession } from "../web/src/chatSession";

class TestSocket {
  static opened: TestSocket[] = [];
  onmessage?: (event: { data: string }) => void;
  onclose?: () => void;

  constructor(readonly url: string) { TestSocket.opened.push(this); }
  close() { this.onclose?.(); }
  view(running = false) {
    this.onmessage?.({ data: JSON.stringify({
      type: "view",
      view: { entries: [], docs: { "pi.live": { run: running ? { id: "running-turn" } : null } } },
    }) });
  }
}

const originalFetch = globalThis.fetch;
const originalSocket = globalThis.WebSocket;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
let requests = new Map<string, ReturnType<typeof Promise.withResolvers<Response>>>();
let errors: ReturnType<typeof spyOn>;

beforeEach(() => {
  requests = new Map();
  TestSocket.opened = [];
  Object.defineProperty(globalThis, "window", { configurable: true, value: new EventTarget() });
  globalThis.WebSocket = TestSocket as unknown as typeof WebSocket;
  globalThis.fetch = (async (input: string) => {
    const chatId = input.split("/")[3]!;
    if (input.endsWith("/socket")) return Response.json({ websocketUrl: `ws://test/${chatId}` });
    const request = Promise.withResolvers<Response>();
    requests.set(chatId, request);
    return request.promise;
  }) as typeof fetch;
  errors = spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.WebSocket = originalSocket;
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
  errors.mockRestore();
});

async function open(session: ChatSession, id: string, running = false) {
  session.open(id);
  await Bun.sleep(0); // Let the mocked grant and response body settle.
  const socket = TestSocket.opened.at(-1)!;
  socket.view(running);
  return socket;
}

describe("switching chats during background work", () => {
  test("a completed request in A cannot clear B's busy state", async () => {
    const session = new ChatSession("a");
    await open(session, "a");
    const first = session.prompt("Work in A");
    expect(session.getSnapshot().busy).toBe(true);

    await open(session, "b");
    expect(session.getSnapshot().busy).toBe(false);
    const second = session.prompt("Work in B");
    requests.get("a")!.resolve(new Response(null, { status: 204 }));
    expect(await first).toBe(true);
    expect(session.getSnapshot()).toMatchObject({ chatId: "b", busy: true });

    requests.get("b")!.resolve(new Response(null, { status: 204 }));
    expect(await second).toBe(true);
    expect(session.getSnapshot().busy).toBe(false);
    session.close();
  });

  test("returning to a pending chat retains its busy state without cancelling the request", async () => {
    const session = new ChatSession("a");
    await open(session, "a");
    const pending = session.prompt("Keep working");
    await open(session, "b");
    await open(session, "a");
    expect(session.getSnapshot().busy).toBe(true);
    expect(await session.prompt("Duplicate submission")).toBe(false);
    expect(requests.size).toBe(1);

    requests.get("a")!.resolve(new Response(null, { status: 204 }));
    expect(await pending).toBe(true);
    expect(session.getSnapshot().busy).toBe(false);
    session.close();
  });

  test("server live state reports work started outside this pane", async () => {
    const session = new ChatSession("a");
    const socket = await open(session, "a", true);
    expect(session.getSnapshot().busy).toBe(true);
    expect(await session.prompt("Duplicate submission")).toBe(false);
    expect(requests.size).toBe(0);
    socket.view(false);
    expect(session.getSnapshot().busy).toBe(false);
    session.close();
  });

  test("a failed background request restores its own draft without overwriting another chat", async () => {
    const session = new ChatSession("a");
    await open(session, "a");
    const pending = session.prompt("Retry this in A");
    await open(session, "b");
    session.setDraft("Unsent work in B");
    requests.get("a")!.reject(new Error("Request failed"));
    expect(await pending).toBe(false);
    expect(session.getSnapshot()).toMatchObject({ chatId: "b", draft: "Unsent work in B", busy: false });

    await open(session, "a");
    expect(session.getSnapshot().draft).toBe("Retry this in A");
    await open(session, "b");
    expect(session.getSnapshot().draft).toBe("Unsent work in B");
    session.close();
  });
});
