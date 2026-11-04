import type { Message } from "@earendil-works/pi-ai"
import { Actor, Emittable, Ephemeral, Interleave, Persisted, Resource, unchecked, type ActorSocket, type Unchecked } from "terse-sdk/actor"

import { availableModels, isAvailable, type ModelOption } from "./models.js"
import { DurablePiAgent, type Answer } from "./pi/agent.js"

export class Chat extends Actor<null, ChatIncoming, ChatOutgoing> {
    @Persisted title = "New chat"
    @Persisted model = ""
    @Persisted messages: ChatMessage[] = []
    @Persisted createdAt = 0
    @Persisted updatedAt = 0
    @Persisted deleted = false
    @Ephemeral #run: Run | null = null
    // A TypeScript `private`, not `#agent`: the runtime finds resources by field name, which can't see # fields.
    @Resource private readonly agent = new DurablePiAgent(this.db, this.alarm)

    async create(model: string): Promise<void> {
        if (this.createdAt) return
        this.model = model
        this.createdAt = this.updatedAt = Date.now()
    }

    /** Starts a forked chat from another chat's messages and the matching pi history. */
    async seed(chat: { title: string; model: string; messages: ChatMessage[]; history: Unchecked<Message[]> }): Promise<void> {
        this.title = chat.title
        this.model = chat.model
        this.messages = chat.messages
        this.createdAt = this.updatedAt = Date.now()
        await this.agent.seed(chat.history as unknown as Message[])
        await this.#syncIndex()
    }

    async onConnect(socket: ActorSocket<null, ChatOutgoing>): Promise<void> {
        if (this.deleted) return socket.reject(4004, "chat deleted")
        socket.send({ type: "snapshot", chat: this.#view() })
        await this.#resumeStalled()
    }

    @Interleave
    async onMessage(socket: ActorSocket<null, ChatOutgoing>, message: ChatIncoming): Promise<void> {
        if (this.deleted) return
        switch (message.type) {
            case "send":
                return this.#send(socket, message.text, message.model)
            case "retry":
                return this.#retry(socket, message.model)
        }
    }

    /** Fires while pi has unfinished tasks. A reply a crash cut off finishes here once pi resumes its run. */
    @Interleave
    async onAlarm(): Promise<void> {
        await this.agent.onAlarm()
        const stalled = this.#stalledReply()
        if (stalled) await this.#follow(stalled)
    }

    /**
     * Stops the streaming reply. This is an RPC, not a socket message: messages from one socket are handled
     * in order, so a stop sent on the reply's own socket would wait until the reply had finished.
     */
    async stop(): Promise<void> {
        if (!this.#run) return
        this.#run.abort.abort()
        await this.agent.abort()
    }

    async rename(title: string): Promise<void> {
        this.title = title.trim().slice(0, 120) || this.title
        this.#broadcastSnapshot()
        await this.#syncIndex()
    }

    /** Copies messages up to and including `uptoMessageId` (or all of them), with their pi history, into chat `newId`. */
    async fork(newId: string, uptoMessageId?: string): Promise<void> {
        const end = this.messages.findIndex(message => message.id === uptoMessageId) + 1 || this.messages.length
        const messages = this.messages.slice(0, end).filter(message => message.status !== "streaming")
        const history = historyBefore(await this.agent.history(), userCount(messages) + 1)
        await Chat.get(newId).seed({ title: `${this.title} (fork)`, model: this.model, messages, history: unchecked(history) })
    }

    async view(): Promise<ChatView> {
        return this.#view()
    }

    async destroy(): Promise<void> {
        this.deleted = true
        await this.stop()
        this.alarm.delete()
        await ChatIndex.get(INDEX_ID).remove(this.id)
        for (const socket of await this.getConnections()) socket.close(4004, "chat deleted")
    }

    async #send(socket: ActorSocket<null, ChatOutgoing>, text: string, model: string) {
        const prompt = text.trim()
        if (!prompt || !this.#canStart(socket, model)) return
        if (this.messages.length === 0) this.title = titleFrom(prompt)
        this.#append(newMessage({ role: "user", content: prompt }))
        await this.#generate(model, prompt)
    }

    /** Asks the last question again on pi's history from before it, so the old answer leaves the model's context. */
    async #retry(socket: ActorSocket<null, ChatOutgoing>, model: string) {
        const question = [...this.messages].reverse().find(message => message.role === "user")
        if (this.messages.at(-1)?.role !== "assistant" || !question || !this.#canStart(socket, model)) return
        const history = historyBefore(await this.agent.history(), userCount(this.messages))
        this.messages = this.messages.slice(0, -1)
        this.#broadcastSnapshot()
        await this.#generate(model, question.content, history)
    }

    #canStart(socket: ActorSocket<null, ChatOutgoing>, model: string): boolean {
        const problem = this.#run || this.#stalledReply() ? "Still replying. Stop it or wait." :
            !isAvailable(model) ? `No API key is configured for ${model}.` : null
        if (problem) socket.send({ type: "error", message: problem })
        return problem === null
    }

    /** Runs one reply. `#run` is set before the first await, so only one reply streams at a time. */
    async #generate(model: string, text: string, history?: Message[]) {
        const reply = newMessage({ role: "assistant", content: "", status: "streaming", model })
        const run = this.#start(reply)
        this.model = model
        this.#append(reply)
        await this.#drive(run, show => this.agent.reply({ text, model, history }, show), "failed")
    }

    /** Finishes a reply left streaming by a crash: pi resumed its run, so wait for that run's answer. */
    async #follow(reply: ChatMessage) {
        await this.#drive(this.#start(reply), show => this.agent.follow(show), "interrupted")
    }

    async #drive(run: Run, answer: (show: (text: string) => void) => Promise<Answer>, unanswered: MessageStatus) {
        await this.#syncIndex()
        try {
            this.#settle(run, await answer(text => this.#show(run, text)), unanswered)
        } catch (error) {
            this.#finish(run, run.abort.signal.aborted ? "stopped" : unanswered, { error: errorText(error) })
        } finally {
            this.#run = null
            await this.#syncIndex()
        }
    }

    #start(reply: ChatMessage): Run {
        const run: Run = { messageId: reply.id, text: reply.content, savedAt: Date.now(), abort: new AbortController() }
        this.#run = run
        return run
    }

    #settle(run: Run, answer: Answer, unanswered: MessageStatus) {
        if (answer.text) this.#show(run, answer.text)
        if (run.abort.signal.aborted) return this.#finish(run, "stopped")
        if (answer.answered) return this.#finish(run, "done")
        this.#finish(run, unanswered, unanswered === "failed" ? { error: answer.error ?? "The model did not answer." } : {})
    }

    /** pi reports the whole partial each time: send what grew, or the whole text when a retry attempt restarted it. */
    #show(run: Run, text: string) {
        if (text === run.text) return
        if (text.startsWith(run.text)) {
            this.broadcast({ type: "delta", id: run.messageId, text: text.slice(run.text.length) })
        } else {
            const message = this.#patch(run.messageId, { content: text })
            if (message) this.broadcast({ type: "message", message })
        }
        run.text = text
        this.#savePartial(run)
    }

    /** Saves the partial reply at most once per SAVE_PARTIAL_MS, for the transcript; pi keeps its own durable copy. */
    #savePartial(run: Run) {
        if (Date.now() - run.savedAt < SAVE_PARTIAL_MS) return
        run.savedAt = Date.now()
        this.#patch(run.messageId, { content: run.text })
    }

    #finish(run: Run, status: MessageStatus, extra: { error?: string } = {}) {
        // Socket messages must be strict JSON, so only set optional fields that have values (never undefined).
        const changes: Partial<ChatMessage> = { content: run.text, status }
        if (extra.error) changes.error = extra.error
        const message = this.#patch(run.messageId, changes)
        if (message) this.broadcast({ type: "message", message })
    }

    /** If pi is still running the cut-off reply, the alarm follows it; otherwise it already settled and finishes now. */
    async #resumeStalled() {
        const stalled = this.#stalledReply()
        if (!stalled) return
        if (await this.agent.busy()) this.alarm.set(Date.now())
        else await this.#follow(stalled)
    }

    #stalledReply(): ChatMessage | undefined {
        const last = this.messages.at(-1)
        return !this.#run && last?.role === "assistant" && last.status === "streaming" ? last : undefined
    }

    #view(): ChatView {
        const run = this.#run
        const messages = run
            ? this.messages.map(message => (message.id === run.messageId ? { ...message, content: run.text } : message))
            : this.messages
        return { id: this.id, title: this.title, model: this.model, updatedAt: this.updatedAt, messages }
    }

    #append(message: ChatMessage) {
        this.messages = [...this.messages, message]
        this.updatedAt = Date.now()
        this.broadcast({ type: "message", message })
    }

    #patch(id: string, changes: Partial<ChatMessage>): ChatMessage | undefined {
        let updated: ChatMessage | undefined
        this.messages = this.messages.map(message => (message.id === id ? (updated = { ...message, ...changes }) : message))
        this.updatedAt = Date.now()
        return updated
    }

    #broadcastSnapshot() {
        this.broadcast({ type: "snapshot", chat: this.#view() })
    }

    async #syncIndex() {
        if (this.deleted || this.messages.length === 0) return
        await ChatIndex.get(INDEX_ID).sync({
            id: this.id,
            title: this.title,
            model: this.model,
            streaming: this.#run !== null,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
        })
    }
}

/** The sidebar. Browsers connect over WebSocket and receive `chats` as live state. */
export class ChatIndex extends Actor<null, null, null> {
    @Persisted @Emittable chats: ChatSummary[] = []

    /** Models whose provider key is set in this project's environment. */
    async models(): Promise<ModelOption[]> {
        return availableModels()
    }

    async list(): Promise<ChatSummary[]> {
        return this.chats
    }

    /** Called by a Chat when its title, model or run state changes. Keeps the pin and archive flags. */
    async sync(chat: ChatSync): Promise<void> {
        const current = this.chats.find(summary => summary.id === chat.id)
        const next: ChatSummary = { ...chat, pinned: current?.pinned ?? false, archived: current?.archived ?? false }
        this.chats = byRecent([next, ...this.chats.filter(summary => summary.id !== chat.id)])
    }

    async setFlags(id: string, flags: { pinned?: boolean; archived?: boolean }): Promise<void> {
        this.chats = this.chats.map(summary => (summary.id === id ? { ...summary, ...flags } : summary))
    }

    async remove(id: string): Promise<void> {
        this.chats = this.chats.filter(summary => summary.id !== id)
    }
}

/** pi's history before its `n`th user message (all of it when there are fewer). */
function historyBefore(history: Message[], n: number): Message[] {
    let users = 0
    const end = history.findIndex(message => message.role === "user" && ++users === n)
    return end === -1 ? history : history.slice(0, end)
}

function userCount(messages: ChatMessage[]): number {
    return messages.filter(message => message.role === "user").length
}

function titleFrom(prompt: string): string {
    const line = prompt.split("\n")[0]!.replace(/\s+/g, " ").trim()
    return line.length > 60 ? `${line.slice(0, 57)}…` : line
}

function newMessage(fields: Pick<ChatMessage, "role" | "content"> & Partial<ChatMessage>): ChatMessage {
    return { id: crypto.randomUUID(), status: "done", createdAt: Date.now(), ...fields }
}

function errorText(error: unknown): string {
    return (error instanceof Error ? error.message : String(error)).slice(0, 300)
}

function byRecent(chats: ChatSummary[]): ChatSummary[] {
    return [...chats].sort((a, b) => b.updatedAt - a.updatedAt)
}

const INDEX_ID = "main"
const SAVE_PARTIAL_MS = 1_000

export type { ModelOption, Provider } from "./models.js"

export type ChatIncoming =
    | { type: "send"; text: string; model: string }
    | { type: "retry"; model: string }

export type ChatOutgoing =
    | { type: "snapshot"; chat: ChatView }
    | { type: "message"; message: ChatMessage }
    | { type: "delta"; id: string; text: string }
    | { type: "error"; message: string }

export type ChatView = Pick<ChatSummary, "id" | "title" | "model" | "updatedAt"> & {
    messages: ChatMessage[]
}

export type ChatMessage = {
    id: string
    role: "user" | "assistant"
    content: string
    status: MessageStatus
    createdAt: number
    model?: string
    error?: string
}

export type MessageStatus = "streaming" | "done" | "stopped" | "interrupted" | "failed"

export type ChatSummary = {
    id: string
    title: string
    model: string
    streaming: boolean
    pinned: boolean
    archived: boolean
    createdAt: number
    updatedAt: number
}

export type ChatSync = Omit<ChatSummary, "pinned" | "archived">

type Run = { messageId: string; text: string; savedAt: number; abort: AbortController }
