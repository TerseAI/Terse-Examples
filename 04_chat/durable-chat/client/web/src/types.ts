import type { actors } from "../../generated/index.js"

export type ChatView = actors.Chat.Methods["view"]["Result"]
export type ChatMessage = ChatView["messages"][number]
export type ChatIncoming = actors.Chat.Incoming
export type ChatOutgoing = actors.Chat.Outgoing
export type ChatSummary = actors.ChatIndex.State["chats"][number]
export type ModelOption = actors.ChatIndex.Methods["models"]["Result"][number]

/** `@Emittable` state the ChatIndex actor pushes to every sidebar socket. */
export type IndexMessage =
    | { type: "state"; state: actors.ChatIndex.State }
    | { type: "state_update"; changes: Partial<actors.ChatIndex.State>; removed: string[] }
