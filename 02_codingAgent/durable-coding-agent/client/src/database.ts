import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const localDatabasePath = fileURLToPath(new URL("../.data/sessions.sqlite", import.meta.url));

export function connectDatabase(filename = process.env.SESSION_DB_PATH ?? localDatabasePath) {
  if (filename !== ":memory:") mkdirSync(dirname(resolve(filename)), { recursive: true });
  const database = new Database(filename, { create: true, strict: true });
  database.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  return database;
}
