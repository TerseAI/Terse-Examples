import { Bug, Cloud, GitMerge, Terminal } from "lucide-react"

import { greeting } from "../lib/format"
import type { ModelOption } from "../types"
import { Composer } from "./Composer"

export function NewChat({ models, model, onModel, notice, onStart }: Props) {
    return (
        <section className="hero">
            <img className="hero-sym" src="/symbol.svg" alt="" />
            <h1>
                {greeting()}
                <em>What should we build?</em>
            </h1>
            <Composer models={models} model={model} onModel={onModel} onSend={onStart} placeholder="Ask anything. This chat remembers." variant="hero" />
            {notice && <p className="notice">{notice}</p>}
            <div className="pills">
                {PROMPTS.map(({ icon: Icon, label, prompt }) => (
                    <button key={label} className="pill" disabled={!model} onClick={() => onStart(prompt)}>
                        <Icon size={16} className="muted" />
                        {label}
                    </button>
                ))}
            </div>
            <p className="fine">AI can make mistakes. <b>Every chat is durable</b>: it survives restarts, deploys and closed tabs.</p>
        </section>
    )
}

const PROMPTS = [
    { icon: Terminal, label: "Scaffold a chat actor", prompt: "Scaffold a chat actor with Terse Durable Actors that keeps its history across restarts." },
    { icon: GitMerge, label: "Explain @Interleave", prompt: "Explain what @Interleave does on a durable actor method, and when I'd want it." },
    { icon: Cloud, label: "Self-host on GCP", prompt: "Walk me through self-hosting the Durable Actors runtime on GCP." },
    { icon: Bug, label: "Debug a stuck actor", prompt: "My actor seems stuck and stopped answering calls. How do I debug it?" },
]

type Props = {
    models: ModelOption[] | null
    model: ModelOption | undefined
    onModel(modelId: string): void
    notice: string | null
    onStart(text: string): void
}
