import type { ModelOption } from "../types"

/** The first candidate that is available, else the first available model. */
export function pickModel(models: ModelOption[] | null, ...candidates: (string | null | undefined)[]): ModelOption | undefined {
    for (const id of candidates) {
        const match = models?.find(model => model.id === id)
        if (match) return match
    }
    return models?.[0]
}
