import type { actors } from "../generated/index.js"

export function toMarkdown(chat: ChatView): string {
    const sections = chat.messages.map(message => `## ${speaker(message)}\n\n${message.content.trim() || "_(no content)_"}`)
    return [`# ${chat.title}`, ...sections].join("\n\n") + "\n"
}

export function markdownFileName(title: string): string {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60)
    return `${slug || "chat"}.md`
}

function speaker(message: ChatView["messages"][number]): string {
    if (message.role === "user") return "You"
    return message.model ? `Assistant · ${message.model}` : "Assistant"
}

type ChatView = actors.Chat.Methods["view"]["Result"]
