import type { ModelOption } from "../types"

export const api = {
    models: () => json<ModelOption[]>("GET", "/api/models"),
    createChat: (model: string) => json<{ id: string }>("POST", "/api/chats", { model }),
    updateChat: (chatId: string, changes: ChatChanges) => send("PATCH", chatPath(chatId), changes),
    forkChat: (chatId: string, uptoMessageId?: string) => json<{ id: string }>("POST", `${chatPath(chatId)}/fork`, { uptoMessageId }),
    stopChat: (chatId: string) => send("POST", `${chatPath(chatId)}/stop`),
    deleteChat: (chatId: string) => send("DELETE", chatPath(chatId)),
    exportUrl: (chatId: string) => `${chatPath(chatId)}/export`,
    grant: (path: string) => json<{ websocketUrl: string }>("POST", path),
}

const chatPath = (chatId: string) => `/api/chats/${encodeURIComponent(chatId)}`

async function json<T>(method: string, path: string, body?: unknown): Promise<T> {
    return (await request(method, path, body)).json() as Promise<T>
}

async function send(method: string, path: string, body?: unknown): Promise<void> {
    await request(method, path, body)
}

async function request(method: string, path: string, body?: unknown): Promise<Response> {
    const response = await fetch(path, {
        method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!response.ok) throw new Error(`${method} ${path} failed: ${response.status}`)
    return response
}

type ChatChanges = { title?: string; pinned?: boolean; archived?: boolean }
