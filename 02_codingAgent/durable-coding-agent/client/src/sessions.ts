import type { Database } from "bun:sqlite";

export type SavedSession = {
  id: string;
  createdAt: string;
  lastOpenedAt: string;
};

/** Session discovery lives in SQLite; conversations and sandboxes stay in the actors. */
export class SessionStore {
  constructor(private readonly database: Database, private readonly now = () => new Date()) {}

  initialize() {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64 AND id NOT GLOB '*[^a-zA-Z0-9_-]*'),
        created_at TEXT NOT NULL,
        last_opened_at TEXT NOT NULL,
        archived_at TEXT
      ) STRICT;
      DROP INDEX IF EXISTS chat_sessions_active_recent;
      CREATE INDEX IF NOT EXISTS chat_sessions_active_created
      ON chat_sessions (created_at DESC, id)
      WHERE archived_at IS NULL;
    `);
  }

  opened(id: string): void {
    const timestamp = this.now().toISOString();
    this.database.query(`
      INSERT INTO chat_sessions (id, created_at, last_opened_at) VALUES (?, ?, ?)
      ON CONFLICT (id) DO UPDATE
      SET last_opened_at = excluded.last_opened_at, archived_at = NULL
    `).run(id, timestamp, timestamp);
  }

  /** Backfill existing actors without changing known timestamps or restoring archived entries. */
  import(ids: string[]): number {
    const timestamp = this.now().toISOString();
    const insert = this.database.query(`
      INSERT INTO chat_sessions (id, created_at, last_opened_at) VALUES (?, ?, ?)
      ON CONFLICT (id) DO NOTHING
    `);
    return this.database.transaction(() => ids.reduce((count, id) => count + insert.run(id, timestamp, timestamp).changes, 0))();
  }

  list(): SavedSession[] {
    return this.database.query<SavedSession, []>(`
      SELECT id, created_at AS "createdAt", last_opened_at AS "lastOpenedAt"
      FROM chat_sessions
      WHERE archived_at IS NULL
      ORDER BY created_at DESC, id
    `).all();
  }

  archive(id: string): boolean {
    return this.database.query(`
      UPDATE chat_sessions SET archived_at = ? WHERE id = ?
    `).run(this.now().toISOString(), id).changes > 0;
  }
}
