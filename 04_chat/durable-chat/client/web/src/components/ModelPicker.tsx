import { Check, ChevronDown, ChevronUp } from "lucide-react"
import { Fragment, useRef, useState } from "react"

import { useDismiss } from "../hooks/useDismiss"
import { providerLogo } from "../lib/format"
import type { ModelOption } from "../types"

/** Lists only models whose provider key is configured on the actors. */
export function ModelPicker({ models, value, onChange, direction }: Props) {
    const [open, setOpen] = useState(false)
    const root = useRef<HTMLDivElement>(null)
    const close = () => setOpen(false)
    useDismiss(root, open, setOpen)
    const Chevron = open === (direction === "down") ? ChevronUp : ChevronDown

    return (
        <div className="picker" ref={root}>
            <button type="button" className={`mp${open ? " open" : ""}`} onClick={() => setOpen(!open)} aria-expanded={open}>
                <img className="pl" src={providerLogo(value.provider)} alt="" />
                {value.label}
                <Chevron size={14} className="muted" />
            </button>
            {open && (
                <div className={`pk ${direction}`} role="listbox">
                    {models.map((model, index) => (
                        <Fragment key={model.id}>
                            {index > 0 && models[index - 1]!.provider !== model.provider && <div className="pdiv" />}
                            <button
                                type="button"
                                role="option"
                                aria-selected={model.id === value.id}
                                className={`row${model.id === value.id ? " sel" : ""}`}
                                onClick={() => {
                                    onChange(model.id)
                                    close()
                                }}
                            >
                                <img className="pl" src={providerLogo(model.provider)} alt="" />
                                <span>{model.label}</span>
                                <span className="mid">{model.id}</span>
                                {model.id === value.id ? <Check size={15} className="lime" /> : <span />}
                            </button>
                        </Fragment>
                    ))}
                </div>
            )}
        </div>
    )
}

type Props = { models: ModelOption[]; value: ModelOption; onChange(modelId: string): void; direction: "up" | "down" }
