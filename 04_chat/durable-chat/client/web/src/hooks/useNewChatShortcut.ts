import { useEffect } from "react"

import { navigate } from "../lib/router"

/** ⌘K / Ctrl+K opens the new-chat screen. */
export function useNewChatShortcut() {
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
                event.preventDefault()
                navigate("/")
            }
        }
        addEventListener("keydown", onKey)
        return () => removeEventListener("keydown", onKey)
    }, [])
}
