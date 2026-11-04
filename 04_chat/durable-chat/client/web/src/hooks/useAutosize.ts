import { useLayoutEffect, type RefObject } from "react"

/** Grows a textarea with its content, up to `maxHeight`. */
export function useAutosize(input: RefObject<HTMLTextAreaElement | null>, text: string, maxHeight = 240) {
    useLayoutEffect(() => {
        const element = input.current
        if (!element) return
        element.style.height = "auto"
        element.style.height = `${Math.min(element.scrollHeight, maxHeight)}px`
    }, [input, text, maxHeight])
}
