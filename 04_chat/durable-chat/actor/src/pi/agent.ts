import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context"
import { createModels, type Message } from "@earendil-works/pi-ai"
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic"
import { googleProvider } from "@earendil-works/pi-ai/providers/google"
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai"
import { xaiProvider } from "@earendil-works/pi-ai/providers/xai"
import { createRegistry, Harness, type Conversation, type TaskGraph, type TaskGraphWatch } from "@earendil-works/pi-durable"
import type { ActorAlarm, ActorDatabase, ActorResource } from "terse-sdk/actor"

import { ActorStorage } from "./storage.js"

/**
 * The chat's durable pi harness, one per actor, stored in the actor's SQLite. A run a crash cuts off is resumed by
 * the harness on the next start, and the alarm keeps waking the actor until pi has no unfinished tasks.
 */
export class DurablePiAgent implements ActorResource {
    readonly #database: ActorDatabase
    readonly #alarm: ActorAlarm
    #harness?: Harness
    #root?: Conversation
    #tasks?: TaskGraphWatch

    constructor(database: ActorDatabase, alarm: ActorAlarm) {
        this.#database = database
        this.#alarm = alarm
    }

    /** Answers `text` with `model`, after rewriting the context to `history` when given, streaming the text as it grows. */
    async reply(request: { text: string; model: string; history?: readonly Message[] }, onText: (text: string) => void): Promise<Answer> {
        const root = this.#conversation()
        if (request.history) await this.seed(request.history)
        await root.configure({ model: modelRef(request.model) }, context)
        return this.#observe(onText, async () => {
            const submission = await root.submit({ type: "input", content: request.text }, context)
            return (await submission.wait(context)).status === "done"
        })
    }

    /** Waits for a run a crash interrupted, which the harness resumed on start, and returns its answer. */
    async follow(onText: (text: string) => void): Promise<Answer> {
        return this.#observe(onText, async () => {
            await this.#conversation().waitForIdle(context)
            return true
        })
    }

    async busy(): Promise<boolean> {
        const { tasks, submissions } = await this.#open().inspect(context)
        return tasks.length > 0 || submissions.length > 0
    }

    /** The model context, without the system prompt: pi's own messages, so retry and fork can reuse them as they are. */
    async history(): Promise<Message[]> {
        return (await this.#conversation().context(context)).messages.filter(message => message.role !== "system")
    }

    /** Starts the context afresh at a marker entry, then writes `history` after it. */
    async seed(history: readonly Message[]): Promise<void> {
        const root = this.#conversation()
        await root.submit({ type: "write", entry: { kind: "chat.context", head: "self" } }, context)
        for (const message of history) await root.submit({ type: "write", entry: { kind: "chat.message", model: [message] } }, context)
    }

    async abort(): Promise<void> {
        await this.#conversation().abort(context)
    }

    /** Must return promptly: `onResume` already restarted the scheduler. */
    async onAlarm(): Promise<void> {
        if (await this.busy()) this.#alarm.set(Date.now() + RECOVERY_ALARM_MS)
        else this.#alarm.delete()
    }

    async onResume(): Promise<void> {
        this.#harness = await Harness.open(new ActorStorage(this.#database), { models, registry: createRegistry() }, context)
        this.#root = await this.#harness.root(context)
        await this.#root.configure({ instructions: INSTRUCTIONS }, context)
        this.#tasks = await this.#harness.watchTaskGraph(context)
        this.#updateAlarm(this.#tasks.value)
        this.#tasks.start(async call => {
            if (call.kind === "value") this.#updateAlarm(call.value)
        })
        this.#harness.resume()
    }

    async onGracefulShutdown(): Promise<void> {
        await this.#tasks?.stop()
        await this.#harness?.close(context)
        this.#tasks = this.#root = this.#harness = undefined
    }

    /** Streams the in-flight partial until `settle` resolves, then reads the answer from the context. */
    async #observe(onText: (text: string) => void, settle: () => Promise<boolean>): Promise<Answer> {
        const root = this.#conversation()
        const watch = await root.watch(context, { min: 1 })
        let error: string | undefined
        watch.start(async call => {
            if (call.kind !== "value") return
            const generation = (call.value.docs["pi.live"] as LiveState | undefined)?.generation
            if (generation?.message) onText(textOf(generation.message))
            if (!generation?.retry) return
            error = generation.retry.error
            if (generation.attempt >= MAX_ATTEMPTS) void root.abort(context)
        })
        try {
            const settled = await settle()
            const answer = lastAnswer((await root.context(context)).messages)
            return answer === undefined || !settled ? { answered: false, text: answer ?? "", error } : { answered: true, text: answer }
        } finally {
            await watch.stop()
        }
    }

    #updateAlarm(graph: TaskGraph) {
        if (Object.keys(graph.tasks).length === 0) return this.#alarm.delete()
        if (this.#alarm.get() === null) this.#alarm.set(Date.now() + RECOVERY_ALARM_MS)
    }

    #open(): Harness {
        if (!this.#harness) throw new Error("DurablePiAgent has not resumed")
        return this.#harness
    }

    #conversation(): Conversation {
        if (!this.#root) throw new Error("DurablePiAgent has not resumed")
        return this.#root
    }
}

/** `xai/grok-4.7` → `{ provider: "xai", modelId: "grok-4.7" }`. */
function modelRef(model: string) {
    const slash = model.indexOf("/")
    return { provider: model.slice(0, slash), modelId: model.slice(slash + 1) }
}

/** The text of the context's final answer, or undefined when it ends with something else (an unanswered question). */
function lastAnswer(messages: readonly Message[]): string | undefined {
    const last = messages.at(-1)
    return last?.role === "assistant" ? textOf(last) : undefined
}

function textOf(message: { content?: unknown }): string {
    if (typeof message.content === "string") return message.content
    if (!Array.isArray(message.content)) return ""
    return message.content.map(part => (part?.type === "text" ? String(part.text ?? "") : "")).join("")
}

const context = BACKGROUND_CONTEXT
const models = createModels()
for (const provider of [anthropicProvider(), openaiProvider(), googleProvider(), xaiProvider()]) models.setProvider(provider)

const RECOVERY_ALARM_MS = 2_000
const MAX_ATTEMPTS = 3
const INSTRUCTIONS =
    "You are a concise, helpful assistant inside Durable Chat, a demo app built on Terse Durable Actors. Answer in Markdown."

export type Answer = { answered: boolean; text: string; error?: string }

/** The parts of the `pi.live` document this agent reads. */
type LiveState = {
    run?: unknown
    generation?: { attempt: number; message?: { content?: unknown }; retry?: { at: number; error: string } }
}
