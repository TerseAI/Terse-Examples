/**
 * Docs API. Lists, creates and deletes documents over actor RPC, and grants browsers
 * permission to connect directly to a Document actor over WebSocket.
 */
import { Elysia, t } from "elysia";

import { actors } from "../generated/index.js";

/** The single DocIndex actor that lists every document (matches INDEX_ID in the actor project). */
const INDEX_ID = "main";
const index = () => actors.DocIndex.get(INDEX_ID);

const docParams = t.Object({ docId: t.String({ pattern: "^[a-zA-Z0-9_-]{1,64}$" }) });
const memberBody = t.Object({
  userId: t.String({ pattern: "^[a-zA-Z0-9_-]{1,64}$" }),
  name: t.String({ minLength: 1, maxLength: 40 }),
  color: t.String({ pattern: "^#[0-9a-fA-F]{6}$" }),
});

function newDocId() {
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(12)), byte => (byte % 36).toString(36)).join("");
  return `doc_${suffix}`;
}

export const app = new Elysia({ prefix: "/api" })
  .get("/docs", () => index().list())
  .post("/docs", () => index().create(newDocId()))
  .get("/docs/:docId", ({ params }) => actors.Document.get(params.docId).snapshot(), { params: docParams })
  .delete(
    "/docs/:docId",
    async ({ params, set }) => {
      // Destroy first so a pending index sync can't re-add the document.
      await actors.Document.get(params.docId).destroy();
      await index().remove(params.docId);
      set.status = 204;
    },
    { params: docParams },
  )
  .post(
    "/docs/:docId/socket",
    // No auth in this demo: anyone with the link can edit. Check access here before granting.
    ({ params, body }) => actors.Document.prepareWebsocket({ actorId: params.docId, metadata: body }),
    { params: docParams, body: memberBody },
  );

if (import.meta.main) {
  app.listen({ hostname: "127.0.0.1", port: Number(process.env.PORT ?? 8000) });
  console.log(`Docs API: http://127.0.0.1:${app.server!.port}/api`);
}
