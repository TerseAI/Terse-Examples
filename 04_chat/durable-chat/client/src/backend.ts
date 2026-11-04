import { Elysia } from "elysia"

import { actors } from "../generated/index.js"
import { markdownFileName, toMarkdown } from "./markdown.js"
import { chatChanges, chatParams, forkBody, newChatBody } from "./schemas.js"

export const app = new Elysia({ prefix: "/api" })
    .onError(({ request, path, code, error }) => logError(request.method, path, code, error))
    .get("/models", () => index().models())
    .post("/index/socket", () => actors.ChatIndex.prepareWebsocket({ actorId: INDEX_ID, metadata: null }))
    .post(
        "/chats",
        async ({ body }) => {
            const id = newChatId()
            await chat(id).create(body.model)
            return { id }
        },
        { body: newChatBody },
    )
    .post("/chats/:chatId/socket", ({ params }) => actors.Chat.prepareWebsocket({ actorId: params.chatId, metadata: null }), {
        params: chatParams,
    })
    .post(
        "/chats/:chatId/stop",
        async ({ params, set }) => {
            await chat(params.chatId).stop()
            set.status = 204
        },
        { params: chatParams },
    )
    .patch(
        "/chats/:chatId",
        async ({ params, body, set }) => {
            const { title, ...flags } = body
            if (title !== undefined) await chat(params.chatId).rename(title)
            if (flags.pinned !== undefined || flags.archived !== undefined) await index().setFlags(params.chatId, flags)
            set.status = 204
        },
        { params: chatParams, body: chatChanges },
    )
    .post(
        "/chats/:chatId/fork",
        async ({ params, body }) => {
            const id = newChatId()
            await chat(params.chatId).fork(id, body.uptoMessageId)
            return { id }
        },
        { params: chatParams, body: forkBody },
    )
    .get(
        "/chats/:chatId/export",
        async ({ params, set }) => {
            const view = await chat(params.chatId).view()
            set.headers["content-type"] = "text/markdown; charset=utf-8"
            set.headers["content-disposition"] = `attachment; filename="${markdownFileName(view.title)}"`
            return toMarkdown(view)
        },
        { params: chatParams },
    )
    .delete(
        "/chats/:chatId",
        async ({ params, set }) => {
            await chat(params.chatId).destroy()
            set.status = 204
        },
        { params: chatParams },
    )

/** The single ChatIndex actor behind the sidebar. */
function index() {
    return actors.ChatIndex.get(INDEX_ID)
}

function chat(chatId: string) {
    return actors.Chat.get(chatId)
}

/** Elysia answers failures with a 500 but logs nothing, so print what failed. Actor errors carry a code and request ID. */
function logError(method: string, path: string, code: string | number, error: unknown) {
    const { code: actorCode, requestId } = (error ?? {}) as { code?: string; requestId?: string }
    const actor = actorCode ? ` actor=${actorCode}${requestId ? ` request=${requestId}` : ""}` : ""
    console.error(`[api] ${method} ${path} failed (${code})${actor}:`, error instanceof Error ? error.message : error)
}

function newChatId() {
    const suffix = Array.from(crypto.getRandomValues(new Uint8Array(10)), byte => (byte % 36).toString(36)).join("")
    return `chat_${suffix}`
}

/** Matches INDEX_ID in the actor project. */
const INDEX_ID = "main"

if (import.meta.main) {
    app.listen({ hostname: "127.0.0.1", port: Number(process.env.PORT ?? 8000) })
    console.log(`Durable Chat API: http://127.0.0.1:${app.server!.port}/api`)
}
