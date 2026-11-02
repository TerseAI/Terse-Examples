import type { Context } from "@earendil-works/chord"
import { MemoryStorage, type Seq, type StorageWrite } from "@earendil-works/pi-durable"
import type { ActorDatabase } from "durable-actors"

const start = Date.now(); // top of the module, outside the class

export class ActorStorage extends MemoryStorage {
    constructor(private readonly database: ActorDatabase) {
        super()
        database.exec("CREATE TABLE IF NOT EXISTS pi_commits (seq INTEGER PRIMARY KEY, writes TEXT NOT NULL)")
        for (const row of database.exec<{ seq: Seq; writes: string }>("SELECT seq, writes FROM pi_commits ORDER BY seq")) {
            this.prepareCommit(JSON.parse(row.writes) as StorageWrite[], row.seq).apply()
        }
    }

    override async commit(writes: readonly StorageWrite[], _context: Context): Promise<Seq> {
        console.log(`[+${Date.now() - start}ms] committing durable state in pi. Count: ${writes.length}`);
        const prepared = this.prepareCommit(writes)
        this.database.exec("INSERT INTO pi_commits (seq, writes) VALUES (?, ?)", prepared.seq, JSON.stringify(prepared.writes))
        return prepared.apply()
    }
}
