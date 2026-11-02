import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context"
import { AgentChange, Conversation, Harness, type ConversationView, type ConversationWatch, type HarnessOptions, type ModelRef, type TaskGraph, type TaskGraphWatch } from "@earendil-works/pi-durable"
import type { ActorAlarm, ActorDatabase, ActorResource } from "durable-actors"

import { ActorStorage } from "./storage"

const context = BACKGROUND_CONTEXT
const RECOVERY_ALARM_MS = 5_000

export type DurablePiAgentOptions = HarnessOptions & {
    readonly agent: AgentChange & { readonly model: ModelRef }
}

export class DurablePiAgent implements ActorResource {
    private _harness?: Harness
    private _root?: Conversation
    private _watch?: ConversationWatch
    private _tasks?: TaskGraphWatch

    get harness(): Harness {
        if (!this._harness) {
            throw new Error("DurablePiAgent has not resumed")
        }
        return this._harness
    }

    get root(): Conversation {
        if (!this._root) {
            throw new Error("DurablePiAgent has not resumed")
        }
        return this._root
    }

    constructor(
        private readonly db: ActorDatabase,
        private readonly options: DurablePiAgentOptions,
        private readonly alarm: ActorAlarm,
    ) {}

    async prompt(text: string): Promise<void> {
        await this.root.submit({
            type: "input",
            content: text,
        }, context)
    }

    async watch(listener: (view: ConversationView) => Promise<void>): Promise<ConversationView> {
        if (!this._watch) {
            const watch = await this.root.watch(context)
            this._watch = watch
            watch.start(async (view) => {
                // A temporary delivery failure must not stop the conversation watch.
                try { await listener(view) } catch (error) { console.error("Pi stream delivery failed", error) }
            })
        }
        return this._watch.value
    }

    async onAlarm(): Promise<void> {
        // onResume has already restarted the scheduler; this callback must return promptly.
        const { tasks, submissions } = await this.harness.inspect(context)
        if (tasks.length > 0 || submissions.length > 0) this.alarm.set(Date.now() + RECOVERY_ALARM_MS)
        else this.alarm.delete()
    }

    private updateAlarm(graph: TaskGraph): void {
        if (Object.keys(graph.tasks).length > 0) {
            if (this.alarm.get() === null) this.alarm.set(Date.now() + RECOVERY_ALARM_MS)
        } else {
            this.alarm.delete()
        }
    }

    async onResume(): Promise<void> {
        this._harness = await Harness.open(new ActorStorage(this.db), this.options, context)
        this._root = await this.harness.root(context)
        await this.root.configure(
            this.options.agent,
            context,
        )
        this._tasks = await this.harness.watchTaskGraph(context)
        this.updateAlarm(this._tasks.value)
        this._tasks.start(async (graph) => this.updateAlarm(graph))
        this._harness.resume()
    }

    async onGracefulShutdown(): Promise<void> {
        if (!this._harness) return
        await this._watch?.stop()
        await this._tasks?.stop()
        await this._harness.close(context)
        this._watch = undefined
        this._tasks = undefined
        this._root = undefined
        this._harness = undefined
    }
}
