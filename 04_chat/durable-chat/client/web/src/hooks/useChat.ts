import { useEffect, useRef, useState } from "react"

import { ActorSocket, type SocketStatus } from "../lib/actorSocket"
import { takePrompt } from "../lib/pending"
import type { ChatIncoming, ChatMessage, ChatOutgoing, ChatView } from "../types"

/** One conversation over a direct socket to its Chat actor. Replies stream in as deltas. */
export function useChat(chatId: string) {
    const [state, setState] = useState<ChatState>({ chat: null, connection: "connecting", notice: null })
    const socket = useRef<ActorSocket<ChatIncoming, ChatOutgoing> | null>(null)

    useEffect(() => {
        const current = new ActorSocket<ChatIncoming, ChatOutgoing>({
            grantPath: `/api/chats/${encodeURIComponent(chatId)}/socket`,
            onStatus: connection => setState(s => (s.connection === "deleted" ? s : { ...s, connection })),
            onMessage: message => {
                setState(s => reduce(s, message))
                if (message.type === "snapshot") sendPendingPrompt(current, chatId)
            },
            isFinal: code => {
                if (code === CHAT_DELETED) setState(s => ({ ...s, connection: "deleted" }))
                return code === CHAT_DELETED
            },
        })
        socket.current = current
        current.start()
        return () => current.stop()
    }, [chatId])

    const send = (message: ChatIncoming) => {
        if (!socket.current?.send(message)) setState(s => ({ ...s, notice: "Not connected to the chat yet. Try again in a moment." }))
    }
    const dismiss = () => setState(s => ({ ...s, notice: null }))

    return { ...state, send, dismiss }
}

/** A chat started from the new-chat screen sends its first prompt once the actor's snapshot arrives. */
function sendPendingPrompt(socket: ActorSocket<ChatIncoming, ChatOutgoing>, chatId: string) {
    const prompt = takePrompt(chatId)
    if (prompt) socket.send({ type: "send", ...prompt })
}

function reduce(state: ChatState, message: ChatOutgoing): ChatState {
    switch (message.type) {
        case "snapshot":
            return { ...state, chat: message.chat }
        case "message":
            return state.chat ? { ...state, chat: upsert(state.chat, message.message) } : state
        case "delta":
            return state.chat ? { ...state, chat: appendDelta(state.chat, message.id, message.text) } : state
        case "error":
            return { ...state, notice: message.message }
    }
}

function upsert(chat: ChatView, message: ChatMessage): ChatView {
    const exists = chat.messages.some(m => m.id === message.id)
    const messages = exists ? chat.messages.map(m => (m.id === message.id ? message : m)) : [...chat.messages, message]
    const model = message.role === "assistant" && message.model ? message.model : chat.model
    return { ...chat, messages, model, updatedAt: Date.now() }
}

function appendDelta(chat: ChatView, id: string, text: string): ChatView {
    return { ...chat, messages: chat.messages.map(m => (m.id === id ? { ...m, content: m.content + text } : m)) }
}

const CHAT_DELETED = 4004

export type ChatConnection = SocketStatus | "deleted"

type ChatState = { chat: ChatView | null; connection: ChatConnection; notice: string | null }
