import { useEffect, useLayoutEffect, useRef } from "react"

/** Keeps a scroll container pinned to the newest content unless the reader scrolled up. */
export function useStickToBottom<T extends HTMLElement>(content: unknown) {
    const ref = useRef<T>(null)
    const atBottom = useRef(true)
    useEffect(() => {
        const element = ref.current
        if (!element) return
        const onScroll = () => {
            atBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80
        }
        element.addEventListener("scroll", onScroll)
        return () => element.removeEventListener("scroll", onScroll)
    }, [])
    useLayoutEffect(() => {
        const element = ref.current
        if (element && atBottom.current) element.scrollTop = element.scrollHeight
    }, [content])
    return ref
}
