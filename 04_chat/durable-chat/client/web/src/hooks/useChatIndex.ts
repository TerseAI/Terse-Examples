import { useEffect, useState } from "react"

import { ActorSocket, type SocketStatus } from "../lib/actorSocket"
import type { ChatSummary, IndexMessage } from "../types"

/** Live sidebar: the ChatIndex actor pushes its `chats` state to this socket. */
export function useChatIndex() {
    const [chats, setChats] = useState<ChatSummary[]>([])
    const [status, setStatus] = useState<SocketStatus>("connecting")

    useEffect(() => {
        const socket = new ActorSocket<never, IndexMessage>({
            grantPath: "/api/index/socket",
            onStatus: setStatus,
            onMessage: message => {
                const next = message.type === "state" ? message.state.chats : message.changes.chats
                if (next) setChats(next)
            },
        })
        socket.start()
        return () => socket.stop()
    }, [])

    return { chats, status }
}
