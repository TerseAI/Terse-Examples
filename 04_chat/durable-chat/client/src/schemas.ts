import { t } from "elysia"

/** Request validation for the API routes. Kept apart because routes read these while `app` is built. */
export const chatParams = t.Object({ chatId: t.String({ pattern: "^[a-zA-Z0-9_-]{1,64}$" }) })

export const newChatBody = t.Object({ model: t.String({ minLength: 1, maxLength: 120 }) })

export const chatChanges = t.Object({
    title: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
    pinned: t.Optional(t.Boolean()),
    archived: t.Optional(t.Boolean()),
})

export const forkBody = t.Object({ uptoMessageId: t.Optional(t.String({ maxLength: 64 })) })
