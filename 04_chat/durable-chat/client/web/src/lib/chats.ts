import type { ChatSummary } from "../types"
import { daysBetween } from "./format"

/** Sidebar sections: pinned first, then by recency. Archived chats are kept apart. */
export function groupChats(chats: ChatSummary[], now = Date.now()): { groups: ChatGroup[]; archived: ChatSummary[] } {
    const visible = chats.filter(chat => !chat.archived)
    const buckets: ChatGroup[] = [
        { label: "Pinned", chats: visible.filter(chat => chat.pinned) },
        ...["Today", "Yesterday", "Previous 7 days", "Older"].map(label => ({ label, chats: [] as ChatSummary[] })),
    ]
    for (const chat of visible.filter(chat => !chat.pinned)) buckets[recencyBucket(chat.updatedAt, now)]!.chats.push(chat)
    return { groups: buckets.filter(group => group.chats.length > 0), archived: chats.filter(chat => chat.archived) }
}

function recencyBucket(timestamp: number, now: number): number {
    const days = daysBetween(timestamp, now)
    return days === 0 ? 1 : days === 1 ? 2 : days < 7 ? 3 : 4
}

export type ChatGroup = { label: string; chats: ChatSummary[] }
