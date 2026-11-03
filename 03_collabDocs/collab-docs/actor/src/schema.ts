import { customType, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

/** A BLOB read back as a plain Uint8Array, without relying on Node's Buffer. */
const bytes = customType<{ data: Uint8Array; driverData: Uint8Array | ArrayBuffer }>({
    dataType: () => "blob",
    fromDriver: value => (value instanceof Uint8Array ? value : new Uint8Array(value)),
})

/** DocIndex: one row per document, for the home page. */
export const docs = sqliteTable("docs", {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    preview: text("preview").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
})

/** Document: the Yjs update log, compacted into one row once it grows. */
export const updates = sqliteTable("updates", {
    seq: integer("seq").primaryKey({ autoIncrement: true }),
    data: bytes("data").notNull(),
})
