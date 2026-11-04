import { useRef, type KeyboardEvent } from "react"

/** Edits a title in place. Enter or leaving the field saves, Escape cancels; `onDone` gets null on cancel. */
export function InlineRename({ value, className, onDone }: Props) {
    const finished = useRef(false)
    const finish = (title: string | null) => {
        if (finished.current) return
        finished.current = true
        onDone(title?.trim() || null)
    }
    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") finish(event.currentTarget.value)
        if (event.key === "Escape") finish(null)
    }

    return (
        <input
            className={className}
            defaultValue={value}
            maxLength={120}
            aria-label="Chat title"
            autoFocus
            onFocus={event => event.currentTarget.select()}
            onKeyDown={onKeyDown}
            onBlur={event => finish(event.currentTarget.value)}
        />
    )
}

type Props = { value: string; className?: string; onDone(title: string | null): void }
