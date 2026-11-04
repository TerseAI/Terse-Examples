import { useState } from "react"
import useSWR from "swr"

import { api } from "../lib/api"
import type { ModelOption } from "../types"

/**
 * Models the actors can serve: only providers whose key is set in actor/.env. Null while loading.
 * SWR refetches on window focus, so a newly added key shows up when you return to the tab.
 */
export function useModels(): ModelOption[] | null {
    const { data, error } = useSWR("/api/models", () => api.models())
    return error ? [] : (data ?? null)
}

/** The viewer's last-picked model, remembered in this browser. */
export function usePreferredModel(): [string | null, (modelId: string) => void] {
    const [preferred, setPreferred] = useState(readStored)
    const choose = (modelId: string) => {
        setPreferred(modelId)
        try {
            localStorage.setItem(STORAGE_KEY, modelId)
        } catch {}
    }
    return [preferred, choose]
}

function readStored(): string | null {
    try {
        return localStorage.getItem(STORAGE_KEY)
    } catch {
        return null
    }
}

const STORAGE_KEY = "durable-chat:model"
