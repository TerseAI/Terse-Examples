import { DurablePiAgent } from "./pi/DurablePiAgent"
import { createModels } from "@earendil-works/pi-ai"
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai"
import { ConversationView, createRegistry } from "@earendil-works/pi-durable"
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { Actor, Resource, ActorSocket, Unchecked, unchecked } from "durable-actors"
import { CodingTools } from "@earendil-works/pi-durable/tools"
import { ModalSandbox } from "./modal/SandboxResource";
import { Op } from "@earendil-works/chord/delta";

export class PiAgent extends Actor<null, string, Outgoing> {
    @Resource private sandbox = new ModalSandbox(this.db)
    @Resource private readonly agent = new DurablePiAgent(this.db, {
        models,
        registry,
        env: () => this.sandbox.env(),
        agent: {
            model: { provider: "openai", modelId: "gpt-6-sol" },
            cwd: WORKSPACE,
            instructions: instructions,
        },
    }, this.alarm)

    async prompt(text: string): Promise<void> {
        await this.agent.prompt(text)
    }

    async onAlarm(): Promise<void> {
        await this.agent.onAlarm()
        // The gateway can retain sockets across a host crash, without another onConnect.
        if (await this.getConnectionCount() > 0) {
            const view = await this.watchConversation()
            this.broadcast({ type: "view", view: unchecked(view) })
        }
    }

    async reset() {
        await this.agent.root.reset(undefined, context)
        const watch = await this.agent.root.watch(context)
        this.broadcast({ type: "view", view: unchecked(watch.value) })
        await watch.stop()
    }

    async onConnect(socket: ActorSocket<null, Outgoing>) {
        const view = await this.watchConversation()
        socket.send({ type: "view", view: unchecked(view) })
        socket.send({ status: "ready", url: await this.sandbox.previewUrl() })
    }

    private async watchConversation(): Promise<ConversationView> {
        const actor = PiAgent.get(this.id)
        return this.agent.watch(async (value) => {
            // The reference can publish after onConnect has returned.
            await actor.broadcast({ type: "view", view: unchecked(value) })
        })
    }

    async crashTheSucker() {
        process.exit(1)
    }
}

// MARK: Types
type Outgoing =
| { type: "view"; view: Unchecked<ConversationView> }
| { type: "ops"; ops: Unchecked<readonly Op[]> }
| Preview

export type Preview =
| { status: "starting" }
| { status: "ready"; url: string }
| { status: "stopped" }
| { status: "error"; message: string };

export const WORKSPACE = "/workspace"

const instructions = `You are editing a Vite app in ${WORKSPACE}. Its dev server is already running and the user sees it live; edits hot-reload.
Add packages with npm install. Do not change vite.config.js or the dev script.`

const models = createModels()
models.setProvider(openaiProvider())
const registry = createRegistry()
registry.install(CodingTools)
const context = BACKGROUND_CONTEXT
