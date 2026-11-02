import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { actors } from "../generated/index.js";
import { createApp } from "./backend";
import { connectDatabase } from "./database";
import { SessionStore } from "./sessions";

// Every run owns a temporary database; existing sessions are never touched.
const directory = mkdtempSync(join(tmpdir(), "mini-lovable-sessions-"));
const filename = join(directory, "sessions.sqlite");
const database = connectDatabase(filename);
let tick = Date.now();
const store = new SessionStore(database, () => new Date(tick++));
const grant = { websocketUrl: "ws://localhost:7111/test", homeRegion: "local", connectByMs: Date.now() + 60_000 };
const app = createApp(store, { ...actors.PiAgent, prepareWebsocket: async () => grant });
const request = (path: string, method = "GET") => app.handle(new Request(`http://localhost${path}`, { method }));

beforeAll(() => {
  store.initialize();
  store.initialize();
});
beforeEach(() => { database.exec("DELETE FROM chat_sessions"); });
afterAll(() => {
  database.close();
  rmSync(directory, { recursive: true });
});

describe("SQLite session registry", () => {
  test("starts empty", async () => {
    expect(await (await request("/api/sessions")).json()).toEqual({ sessions: [] });
  });

  test("successful grants register a session; concurrent opens do not duplicate it", async () => {
    const replies = await Promise.all(Array.from({ length: 5 }, () => request("/api/chat/shared-room/socket", "POST")));
    expect(replies.every(response => response.status === 200)).toBe(true);
    expect(await replies[0]!.json()).toEqual(grant);
    const sessions = await store.list();
    expect(sessions.map(row => row.id)).toEqual(["shared-room"]);
    expect(Number.isNaN(Date.parse(sessions[0]!.createdAt))).toBe(false);
  });

  test("failed grants do not register phantom sessions", async () => {
    const unavailable = createApp(store, { ...actors.PiAgent, prepareWebsocket: async () => { throw new Error("Actor unavailable"); } });
    const response = await unavailable.handle(new Request("http://localhost/api/chat/failed/socket", { method: "POST" }));
    expect(response.status).toBe(500);
    expect(await store.list()).toEqual([]);
  });

  test("new sessions appear first and reopening keeps existing sessions in place", async () => {
    await store.opened("first");
    const createdAt = (await store.list())[0]!.createdAt;
    await store.opened("second");
    expect((await store.list()).map(row => row.id)).toEqual(["second", "first"]);
    const previousOpenedAt = (await store.list()).find(row => row.id === "first")!.lastOpenedAt;
    await request("/api/chat/first/socket", "POST");
    const sessions = await store.list();
    expect(sessions.map(row => row.id)).toEqual(["second", "first"]);
    expect(sessions[1]!.createdAt).toEqual(createdAt);
    expect(sessions[1]!.lastOpenedAt > previousOpenedAt).toBe(true);
    const reopened = connectDatabase(filename);
    try {
      expect(new SessionStore(reopened).list().map(row => row.id)).toEqual(["second", "first"]);
    } finally {
      reopened.close();
    }
    await store.opened("third");
    expect(store.list().map(row => row.id)).toEqual(["third", "second", "first"]);
  });

  test("archive hides a session and reopening restores it", async () => {
    await store.opened("archived");
    const createdAt = (await store.list())[0]!.createdAt;
    expect((await request("/api/sessions/archived", "DELETE")).status).toBe(204);
    expect(await store.list()).toEqual([]);
    expect((await request("/api/sessions/missing", "DELETE")).status).toBe(404);
    await request("/api/chat/archived/socket", "POST");
    expect((await store.list())[0]!.createdAt).toEqual(createdAt);
  });

  test("sessions survive closing and reopening the database connection", async () => {
    const connection = connectDatabase(filename);
    await new SessionStore(connection).opened("durable");
    connection.close();
    expect((await store.list()).map(row => row.id)).toEqual(["durable"]);
  });

  test("rejects invalid session IDs", async () => {
    expect((await request("/api/chat/bad.id/socket", "POST")).status).toBe(422);
    expect((await request("/api/sessions/bad.id", "DELETE")).status).toBe(422);
    expect(await store.list()).toEqual([]);
  });

  test("backfill is idempotent and preserves archived sessions", () => {
    expect(store.import(["old", "archived"])).toBe(2);
    const original = store.list().find(row => row.id === "old");
    store.archive("archived");
    expect(store.import(["old", "archived", "new"])).toBe(1);
    expect(store.list().find(row => row.id === "old")).toEqual(original);
    expect(store.list().some(row => row.id === "archived")).toBe(false);
  });
});
