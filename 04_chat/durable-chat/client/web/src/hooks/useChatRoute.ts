import { useSyncExternalStore } from "react"

/** The open chat ID from `/c/<id>`, or null on the new-chat screen. */
export function useChatRoute(): string | null {
    const path = useSyncExternalStore(subscribe, () => location.pathname)
    return /^\/c\/([\w-]{1,64})$/.exec(path)?.[1] ?? null
}

function subscribe(onChange: () => void) {
    addEventListener("popstate", onChange)
    return () => removeEventListener("popstate", onChange)
}
