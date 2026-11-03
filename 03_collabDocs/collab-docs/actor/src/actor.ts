import * as Y from "yjs"
import { asc, desc, eq } from "drizzle-orm"
import { Actor, Emittable, Ephemeral, Persisted, type ActorContext, type ActorSocket } from "terse-sdk/actor"
import { drizzle, migrate } from "terse-sdk/drizzle"
import migrations from "./migrations/migrations.js"
import { docs, updates } from "./schema.js"

/** The single DocIndex actor that lists every document. */
export const INDEX_ID = "main"
export const UNTITLED = "Untitled document"

/** How long after an edit the document reports its title and preview to the index. */
const INDEX_DELAY_MS = 1500
/** Merge stored Yjs updates into one row once there are more than this many. */
const COMPACT_AFTER = 200

export type DocSummary = {
    id: string
    title: string
    preview: string
    createdAt: number
    updatedAt: number
}

/**
 * Connection metadata. The backend sets who is connecting; the actor records the
 * browser's Yjs awareness (cursor) state so it can replay it to people who join later.
 */
export type Member = {
    userId: string
    name: string
    color: string
    clientId?: number
    awareness?: string
}

export type Collaborator = { userId: string; name: string; color: string }

/** Browser -> Document. Binary Yjs updates travel as base64. */
export type DocIncoming =
    | { type: "update"; update: string }
    | { type: "awareness"; clientId: number; update: string }
    | { type: "title"; title: string }

/** Document -> browser. */
export type DocOutgoing =
    | { type: "sync"; update: string }
    | { type: "update"; update: string }
    | { type: "ack" }
    | { type: "awareness"; update: string }
    | { type: "leave"; clientIds: number[] }
    | { type: "presence"; users: Collaborator[] }
    | { type: "deleted" }

/** Lists documents for the home page. Only the backend talks to it. */
export class DocIndex extends Actor<null, null, null> {
    @Ephemeral #orm = drizzle(this.db)

    constructor(context: ActorContext) {
        super(context)
        migrate(this.db, migrations)
    }

    async create(id: string): Promise<DocSummary> {
        const now = Date.now()
        await this.#orm
            .insert(docs)
            .values({ id, title: UNTITLED, preview: "", createdAt: now, updatedAt: now })
            .onConflictDoNothing()
        return (await this.#orm.select().from(docs).where(eq(docs.id, id)).get())!
    }

    async list(): Promise<DocSummary[]> {
        return this.#orm.select().from(docs).orderBy(desc(docs.updatedAt))
    }

    /** Called by a Document shortly after it changes. */
    async upsert(doc: { id: string; title: string; preview: string; updatedAt: number }): Promise<void> {
        await this.#orm
            .insert(docs)
            .values({ ...doc, createdAt: doc.updatedAt })
            .onConflictDoUpdate({
                target: docs.id,
                set: { title: doc.title, preview: doc.preview, updatedAt: doc.updatedAt },
            })
    }

    async remove(id: string): Promise<void> {
        await this.#orm.delete(docs).where(eq(docs.id, id))
    }

    async onConnect(socket: ActorSocket<null, null>): Promise<void> {
        socket.reject(4003, "DocIndex does not accept sockets")
    }
}

/**
 * One collaborative document. Browsers connect directly over WebSocket and exchange
 * Yjs updates; the actor stores every update in SQLite and relays it to everyone else.
 */
export class Document extends Actor<Member, DocIncoming, DocOutgoing> {
    @Persisted @Emittable title = UNTITLED
    @Persisted @Emittable updatedAt = 0
    @Persisted deleted = false
    @Ephemeral #orm = drizzle(this.db)

    constructor(context: ActorContext) {
        super(context)
        migrate(this.db, migrations)
    }

    async onConnect(socket: ActorSocket<Member, DocOutgoing>): Promise<void> {
        if (this.deleted) return socket.reject(4004, "document deleted")
        socket.send({ type: "sync", update: toBase64(await this.#state()) })
        for (const other of await this.getConnections()) {
            if (other.id !== socket.id && other.metadata.awareness) {
                socket.send({ type: "awareness", update: other.metadata.awareness })
            }
        }
        await this.#broadcastPresence()
    }

    async onMessage(socket: ActorSocket<Member, DocOutgoing>, message: DocIncoming): Promise<void> {
        if (this.deleted) return
        switch (message.type) {
            case "update": {
                const update = fromBase64(message.update)
                try {
                    Y.decodeUpdate(update)
                } catch {
                    return socket.close(4400, "invalid update")
                }
                await this.#append(update)
                this.broadcast({ type: "update", update: message.update }, { except: socket })
                socket.send({ type: "ack" })
                this.#scheduleIndexSync()
                return
            }
            case "awareness": {
                socket.metadata = { ...socket.metadata, clientId: message.clientId, awareness: message.update }
                this.broadcast({ type: "awareness", update: message.update }, { except: socket })
                return
            }
            case "title": {
                const title = message.title.trim().slice(0, 200) || UNTITLED
                if (title === this.title) return
                this.title = title
                this.#scheduleIndexSync()
                return
            }
        }
    }

    async onDisconnect(socket: ActorSocket<Member, DocOutgoing>): Promise<void> {
        const { clientId } = socket.metadata
        if (clientId !== undefined) this.broadcast({ type: "leave", clientIds: [clientId] })
        await this.#broadcastPresence()
    }

    /** Debounced: report the latest title and preview to the index. */
    async onAlarm(): Promise<void> {
        if (this.deleted) return
        this.updatedAt = Date.now()
        await DocIndex.get(INDEX_ID).upsert({
            id: this.id,
            title: this.title,
            preview: textOf(await this.#state()).replace(/\s+/g, " ").trim().slice(0, 160),
            updatedAt: this.updatedAt,
        })
    }

    /** Plain-text view of the document, for the backend and tests. */
    async snapshot(): Promise<{ title: string; text: string; updatedAt: number }> {
        return { title: this.title, text: textOf(await this.#state()), updatedAt: this.updatedAt }
    }

    /** Clears the document and disconnects everyone. It cannot be reopened. */
    async destroy(): Promise<void> {
        this.deleted = true
        this.alarm.delete()
        await this.#orm.delete(updates)
        this.broadcast({ type: "deleted" })
        for (const socket of await this.getConnections()) socket.close(4004, "document deleted")
    }

    async #broadcastPresence() {
        const users = new Map<string, Collaborator>()
        for (const { metadata } of await this.getConnections()) {
            users.set(metadata.userId, { userId: metadata.userId, name: metadata.name, color: metadata.color })
        }
        this.broadcast({ type: "presence", users: [...users.values()] })
    }

    #scheduleIndexSync() {
        if (this.alarm.get() === null) this.alarm.set(Date.now() + INDEX_DELAY_MS)
    }

    /** The whole document as one Yjs update. */
    async #state(): Promise<Uint8Array> {
        const rows = await this.#orm.select({ data: updates.data }).from(updates).orderBy(asc(updates.seq))
        return rows.length ? Y.mergeUpdates(rows.map(row => row.data)) : Y.encodeStateAsUpdate(new Y.Doc())
    }

    async #append(update: Uint8Array) {
        await this.#orm.insert(updates).values({ data: update })
        if ((await this.#orm.$count(updates)) <= COMPACT_AFTER) return
        const merged = await this.#state()
        await this.#orm.transaction(async tx => {
            await tx.delete(updates)
            await tx.insert(updates).values({ data: merged })
        })
    }
}

/** Text of a TipTap document (stored in the "default" XML fragment), one line per block. */
function textOf(state: Uint8Array): string {
    const doc = new Y.Doc()
    Y.applyUpdate(doc, state)
    const text = blockText(doc.getXmlFragment("default"))
    doc.destroy()
    return text
}

function blockText(node: Y.XmlFragment | Y.XmlElement): string {
    return node
        .toArray()
        .map(child => {
            if (child instanceof Y.XmlText) {
                return (child.toDelta() as { insert: unknown }[]).map(op => (typeof op.insert === "string" ? op.insert : "")).join("")
            }
            return child instanceof Y.XmlElement ? blockText(child) : ""
        })
        .join("\n")
}

function toBase64(bytes: Uint8Array): string {
    let binary = ""
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return btoa(binary)
}

function fromBase64(text: string): Uint8Array {
    const binary = atob(text)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
}
