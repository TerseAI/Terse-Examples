import { ArrowUp, Square } from "lucide-react"
import { useRef, useState, type FormEvent, type KeyboardEvent } from "react"

import { useAutosize } from "../hooks/useAutosize"
import type { ModelOption } from "../types"
import { ModelPicker } from "./ModelPicker"

export function Composer({ models, model, onModel, onSend, onStop, streaming = false, placeholder, variant }: Props) {
    const [text, setText] = useState("")
    const input = useRef<HTMLTextAreaElement>(null)
    useAutosize(input, text)
    const canSend = Boolean(model && text.trim()) && !streaming

    const submit = (event?: FormEvent) => {
        event?.preventDefault()
        if (!canSend) return
        onSend(text.trim())
        setText("")
    }
    const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) submit(event)
    }

    return (
        <form className={`comp comp-${variant}`} onSubmit={submit}>
            <textarea
                ref={input}
                rows={1}
                value={text}
                placeholder={placeholder}
                onChange={event => setText(event.target.value)}
                onKeyDown={onKeyDown}
                autoFocus
            />
            <div className="crow">
                <ModelSlot models={models} model={model} onModel={onModel} direction={variant === "hero" ? "down" : "up"} />
                {streaming ? (
                    <button type="button" className="send stop" onClick={onStop} aria-label="Stop replying">
                        <Square size={13} fill="currentColor" />
                    </button>
                ) : (
                    <button type="submit" className="send" disabled={!canSend} aria-label="Send">
                        <ArrowUp size={18} strokeWidth={2.4} />
                    </button>
                )}
            </div>
        </form>
    )
}

function ModelSlot({ models, model, onModel, direction }: Pick<Props, "models" | "model" | "onModel"> & { direction: "up" | "down" }) {
    if (models === null) return <span className="hint">Loading models…</span>
    if (!model) return <span className="hint">No models yet: add a provider key to <code>actor/.env</code></span>
    return <ModelPicker models={models} value={model} onChange={onModel} direction={direction} />
}

type Props = {
    models: ModelOption[] | null
    model: ModelOption | undefined
    onModel(modelId: string): void
    onSend(text: string): void
    onStop?(): void
    streaming?: boolean
    placeholder: string
    variant: "hero" | "dock"
}
