import type { Context } from "@earendil-works/chord"
import { MemoryStorage, type CommitResult, type Seq, type StorageWrite } from "@earendil-works/pi-durable"
import type { ActorDatabase } from "terse-sdk/actor"

/**
 * pi-durable storage in the actor's own SQLite: an append-only log of commits, replayed into memory on start.
 * Each batch is written to SQLite before it is applied, so a commit pi was told is durable survives a crash.
 */
export class ActorStorage extends MemoryStorage {
    readonly #database: ActorDatabase

    constructor(database: ActorDatabase) {
        super()
        this.#database = database
        database.exec(`CREATE TABLE IF NOT EXISTS ${TABLE} (seq INTEGER PRIMARY KEY, writes TEXT NOT NULL)`)
        for (const row of database.exec<{ seq: Seq; writes: string }>(`SELECT seq, writes FROM ${TABLE} ORDER BY seq`)) {
            this.prepareCommit(JSON.parse(row.writes) as StorageWrite[], row.seq).apply()
        }
    }

    /** Same contract as `MemoryStorage.commit`: stop at the first refused batch, then send receipts for the stored ones. */
    override async commit(batches: readonly (readonly StorageWrite[])[], receive: (index: number, seq: Seq) => void, _context: Context): Promise<CommitResult> {
        const seqs: Seq[] = []
        let refused: { error: unknown } | undefined
        try {
            for (const writes of batches) {
                let prepared
                try {
                    prepared = this.prepareCommit(writes)
                } catch (error) {
                    refused = { error }
                    break
                }
                this.#database.exec(`INSERT INTO ${TABLE} (seq, writes) VALUES (?, ?)`, prepared.seq, JSON.stringify(prepared.writes))
                seqs.push(prepared.apply())
            }
        } finally {
            for (const [index, seq] of seqs.entries()) receive(index, seq)
        }
        return refused === undefined ? { stored: seqs.length } : { stored: seqs.length, refused: refused.error }
    }
}

const TABLE = "pi_commits"
