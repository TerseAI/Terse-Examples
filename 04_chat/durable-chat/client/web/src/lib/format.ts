import type { ModelOption } from "../types"

export const providerLogo = (provider: ModelOption["provider"]) => `/providers/${provider}.svg`

export function greeting(now = new Date()): string {
    const hour = now.getHours()
    return hour < 5 ? "Up late." : hour < 12 ? "Good morning." : hour < 18 ? "Good afternoon." : "Good evening."
}

/** Calendar days between two timestamps in the viewer's timezone. */
export function daysBetween(timestamp: number, now: number): number {
    const startOfDay = (time: number) => new Date(time).setHours(0, 0, 0, 0)
    return Math.round((startOfDay(now) - startOfDay(timestamp)) / 86_400_000)
}
