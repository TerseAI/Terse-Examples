import { api } from "./api"

/** A browser WebSocket straight to one actor. Every (re)connect fetches a fresh grant from the backend. */
export class ActorSocket<Incoming, Outgoing> {
    #socket?: WebSocket
    #stopped = false
    #attempt = 0
    #timer?: ReturnType<typeof setTimeout>
    readonly #options: Options<Outgoing>

    constructor(options: Options<Outgoing>) {
        this.#options = options
    }

    start() {
        void this.#connect()
    }

    send(message: Incoming): boolean {
        if (this.#socket?.readyState !== WebSocket.OPEN) return false
        this.#socket.send(JSON.stringify(message))
        return true
    }

    stop() {
        this.#stopped = true
        clearTimeout(this.#timer)
        this.#socket?.close()
    }

    async #connect() {
        if (this.#stopped) return
        this.#options.onStatus(this.#attempt ? "reconnecting" : "connecting")
        try {
            const { websocketUrl } = await api.grant(this.#options.grantPath)
            if (!this.#stopped) this.#open(websocketUrl)
        } catch {
            this.#retry()
        }
    }

    #open(url: string) {
        const socket = new WebSocket(url)
        this.#socket = socket
        socket.onopen = () => {
            this.#attempt = 0
            this.#options.onStatus("open")
        }
        socket.onmessage = ({ data }) => this.#options.onMessage(JSON.parse(String(data)) as Outgoing)
        socket.onclose = ({ code }) => {
            if (this.#socket === socket) this.#closed(code)
        }
    }

    #closed(code: number) {
        if (this.#stopped) return
        if (this.#options.isFinal?.(code)) {
            this.#stopped = true
            this.#options.onStatus("closed")
            return
        }
        this.#retry()
    }

    #retry() {
        if (this.#stopped) return
        this.#options.onStatus("reconnecting")
        const delay = Math.min(10_000, 500 * 2 ** this.#attempt++)
        this.#timer = setTimeout(() => void this.#connect(), delay)
    }
}

export type SocketStatus = "connecting" | "open" | "reconnecting" | "closed"

type Options<Outgoing> = {
    /** Backend route that returns a WebSocket grant for one actor. */
    grantPath: string
    onMessage(message: Outgoing): void
    onStatus(status: SocketStatus): void
    /** Return true to stop reconnecting after this close code. */
    isFinal?(code: number): boolean
}
