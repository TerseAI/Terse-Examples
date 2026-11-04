import { useEffect, type RefObject } from "react"

/** Closes a popover on outside click or Escape. Pass the `useState` setter, which React keeps stable. */
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, setOpen: (open: boolean) => void) {
    useEffect(() => {
        if (!open) return
        const onPointer = (event: PointerEvent) => {
            if (!ref.current?.contains(event.target as Node)) setOpen(false)
        }
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false)
        }
        document.addEventListener("pointerdown", onPointer)
        document.addEventListener("keydown", onKey)
        return () => {
            document.removeEventListener("pointerdown", onPointer)
            document.removeEventListener("keydown", onKey)
        }
    }, [ref, open, setOpen])
}
