import { useState, type KeyboardEvent, type PointerEvent } from "react"

/** A sidebar width the viewer drags from its right edge, remembered in this browser. */
export function useSidebarWidth() {
    const [width, setWidth] = useState(readStored)
    const resize = (next: number) => setWidth(clamp(next))
    const commit = (next: number) => {
        resize(next)
        store(clamp(next))
    }

    const handle = {
        onPointerDown: (event: PointerEvent<HTMLElement>) => {
            event.preventDefault()
            event.currentTarget.setPointerCapture(event.pointerId)
        },
        onPointerMove: (event: PointerEvent<HTMLElement>) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) resize(event.clientX)
        },
        onPointerUp: (event: PointerEvent<HTMLElement>) => commit(event.clientX),
        onDoubleClick: () => commit(SIDEBAR_WIDTH.initial),
        onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
            if (event.key === "ArrowLeft") commit(width - 16)
            if (event.key === "ArrowRight") commit(width + 16)
        },
    }
    return { width, handle }
}

function clamp(width: number): number {
    return Math.round(Math.min(SIDEBAR_WIDTH.max, Math.max(SIDEBAR_WIDTH.min, width)))
}

function readStored(): number {
    try {
        const stored = Number(localStorage.getItem(STORAGE_KEY))
        return stored ? clamp(stored) : SIDEBAR_WIDTH.initial
    } catch {
        return SIDEBAR_WIDTH.initial
    }
}

function store(width: number) {
    try {
        localStorage.setItem(STORAGE_KEY, String(width))
    } catch {}
}

export const SIDEBAR_WIDTH = { min: 200, max: 440, initial: 260 }

const STORAGE_KEY = "durable-chat:sidebar-width"

export type SidebarResize = ReturnType<typeof useSidebarWidth>
