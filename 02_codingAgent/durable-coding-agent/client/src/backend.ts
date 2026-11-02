/** Chat API: grant permission to connect directly to an actor, and call into it. */
import { Elysia, t } from "elysia";

import { actors } from "../generated/index.js";
import { connectDatabase } from "./database";
import { SessionStore } from "./sessions";

const chatParams = t.Object({ chatId: t.String({ pattern: "^[a-zA-Z0-9_-]{1,64}$" }) });
const chatBody = t.Object({ prompt: t.String({ minLength: 1, maxLength: 10_000 }) });

export function createApp(sessions: SessionStore, agent = actors.PiAgent) {
  return new Elysia()
  .get("/api/sessions", async () => ({ sessions: await sessions.list() }))
  .delete("/api/sessions/:chatId", async ({ params, set }) => {
    if (!await sessions.archive(params.chatId)) {
      set.status = 404;
      return { error: "Session not found" };
    }
    set.status = 204;
  }, { params: chatParams })
  .post(
    "/api/chat/:chatId/socket",
    async ({ params }) => {
      const grant = await agent.prepareWebsocket({ actorId: params.chatId, metadata: null });
      await sessions.opened(params.chatId);
      return grant;
    },
    { params: chatParams },
  )
  .post(
    "/api/chat/:chatId/reset",
    async ({ params, set }) => {
      await agent.get(params.chatId).reset();
      set.status = 204;
    },
    { params: chatParams },
  )
  .post("/api/chat/:chatId/prompt",
    async ({ params, body, set }) => {
      await agent.get(params.chatId).prompt(body.prompt);
      set.status = 204;
    },
    { params: chatParams, body: chatBody },
  )
  .post("/api/chat/:chatId/crash",
    async ({ params, set }) => {
      await agent.get(params.chatId).crashTheSucker();
      set.status = 204;
    },
    { params: chatParams },
  );
}

if (import.meta.main) {
  const database = connectDatabase();
  const sessions = new SessionStore(database);
  sessions.initialize();
  const app = createApp(sessions);
  app.onStop(() => database.close());
  app.listen({ hostname: "127.0.0.1", port: Number(process.env.PORT ?? 8000) });
  console.log(`Durable Actors Chat API: http://127.0.0.1:${app.server!.port}`);
}
