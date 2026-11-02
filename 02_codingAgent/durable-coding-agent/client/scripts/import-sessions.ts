/** Backfill chats created before the backend session registry existed. */
import { connectDatabase } from "../src/database";
import { SessionStore } from "../src/sessions";

const origin = process.env.DURABLE_ACTORS_CONTROL_PLANE_URL ?? "http://127.0.0.1:7100";
const projectId = process.env.DURABLE_ACTORS_PROJECT_ID ?? "local";
const url = new URL(`/v1/projects/${encodeURIComponent(projectId)}/observe/actors`, origin);
const secret = process.env.DURABLE_ACTORS_SECRET;
const response = await fetch(url, {
  headers: secret ? { Authorization: `Bearer ${secret}` } : {},
  signal: AbortSignal.timeout(10_000),
  redirect: "error",
});
if (!response.ok) throw new Error(`Actor inventory failed (HTTP ${response.status}). Check that terse actor dev is running.`);
const inventory: { actors: { actorName: string; instances: { actorId: string }[] }[] } = await response.json();
const ids = inventory.actors
  .filter(actor => actor.actorName === "PiAgent")
  .flatMap(actor => actor.instances.map(instance => instance.actorId))
  .filter(id => /^[a-zA-Z0-9_-]{1,64}$/.test(id));
const database = connectDatabase();
try {
  const sessions = new SessionStore(database);
  sessions.initialize();
  console.log(`Imported ${sessions.import(ids)} sessions (${ids.length} actors found). Existing entries were preserved.`);
} finally {
  database.close();
}
