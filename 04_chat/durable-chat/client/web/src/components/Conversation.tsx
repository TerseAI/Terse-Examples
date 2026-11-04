import { Fragment, useState } from "react"

import { useChat } from "../hooks/useChat"
import { useStickToBottom } from "../hooks/useStickToBottom"
import { api } from "../lib/api"
import { pickModel } from "../lib/models"
import { chatPath, navigate } from "../lib/router"
import type { ChatSummary, ChatView, ModelOption } from "../types"
import { ChatMenu, type ChatAction } from "./ChatMenu"
import { Composer } from "./Composer"
import { InlineRename } from "./InlineRename"
import { Message } from "./Message"

export function Conversation({ chatId, summary, models, preferred, onPreferred }: Props) {
    const { chat, connection, notice, send, dismiss } = useChat(chatId)
    const [modelId, setModelId] = useState<string | null>(null)
    const [actionError, setActionError] = useState<string | null>(null)
    const [renaming, setRenaming] = useState(false)
    const thread = useStickToBottom<HTMLElement>(chat)

    const model = pickModel(models, modelId, chat?.model, preferred)
    const last = chat?.messages.at(-1)
    const streaming = last?.status === "streaming"

    const chooseModel = (id: string) => {
        setModelId(id)
        onPreferred(id)
    }
    const fork = async (uptoMessageId?: string) => navigate(chatPath((await api.forkChat(chatId, uptoMessageId)).id))
    const attempt = (work: () => Promise<unknown>) => work().catch(error => setActionError(String(error.message ?? error)))
    const onAction = (action: ChatAction) => attempt(() => runAction(action, { chatId, summary, fork, rename: () => setRenaming(true) }))
    const rename = (title: string | null) => {
        setRenaming(false)
        if (title && title !== chat?.title) attempt(() => api.updateChat(chatId, { title }))
    }

    if (connection === "deleted") return <Gone />
    return (
        <>
            <Header
                chat={chat}
                summary={summary}
                renaming={renaming}
                onRename={rename}
                onAction={onAction}
            />
            <section className="thread" ref={thread}>
                <div className="col">
                    {!chat && <p className="loading">Connecting to the chat actor…</p>}
                    {chat?.messages.map((message, index) => (
                        <Fragment key={message.id}>
                            <Message
                                message={message}
                                canRetry={message === last && !streaming}
                                onRetry={() => model && send({ type: "retry", model: model.id })}
                                onFork={() => attempt(() => fork(message.id))}
                            />
                        </Fragment>
                    ))}
                </div>
            </section>
            <footer className="dock">
                {(actionError ?? notice) && (
                    <button className="notice" onClick={() => (setActionError(null), dismiss())}>
                        {actionError ?? notice}
                    </button>
                )}
                <Composer
                    models={models}
                    model={model}
                    onModel={chooseModel}
                    onSend={text => model && send({ type: "send", text, model: model.id })}
                    onStop={() => attempt(() => api.stopChat(chatId))}
                    streaming={streaming}
                    placeholder={chat?.messages.length ? "Ask a follow-up…" : "Ask anything. This chat remembers."}
                    variant="dock"
                />
                <p className="fine">AI can make mistakes.</p>
            </footer>
        </>
    )
}

async function runAction(action: ChatAction, { chatId, summary, fork, rename }: ActionContext) {
    switch (action) {
        case "rename":
            return rename()
        case "pin":
            return api.updateChat(chatId, { pinned: !summary?.pinned })
        case "fork":
            return fork()
        case "export":
            return location.assign(api.exportUrl(chatId))
        case "archive":
            return api.updateChat(chatId, { archived: !summary?.archived })
        case "delete":
            if (!confirm("Delete this chat? This can't be undone.")) return
            await api.deleteChat(chatId)
            return navigate("/")
    }
}

function Header({ chat, summary, renaming, onRename, onAction }: HeaderProps) {
    // The sidebar index carries the live title; the chat snapshot only refreshes it on reconnect or rename.
    const title = summary?.title ?? chat?.title ?? ""
    return (
        <header className="head">
            {renaming ? (
                <InlineRename className="title-input" value={title} onDone={onRename} />
            ) : (
                <h1 className="title" onClick={() => onAction("rename")} title="Rename">{title}</h1>
            )}
            <div className="r">
                <ChatMenu
                    pinned={summary?.pinned ?? false}
                    archived={summary?.archived ?? false}
                    onAction={onAction}
                />
            </div>
        </header>
    )
}

function Gone() {
    return (
        <section className="gone">
            <p>This chat was deleted.</p>
            <button className="pill" onClick={() => navigate("/")}>Start a new chat</button>
        </section>
    )
}

type Props = {
    chatId: string
    summary: ChatSummary | undefined
    models: ModelOption[] | null
    preferred: string | null
    onPreferred(modelId: string): void
}

type ActionContext = { chatId: string; summary: ChatSummary | undefined; fork(): Promise<void>; rename(): void }

type HeaderProps = {
    chat: ChatView | null
    summary: ChatSummary | undefined
    renaming: boolean
    onRename(title: string | null): void
    onAction(action: ChatAction): void
}
