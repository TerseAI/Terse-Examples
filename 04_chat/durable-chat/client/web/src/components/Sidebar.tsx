import { ChevronRight, Command, Pin, Plus } from "lucide-react"
import { useState } from "react"

import { SIDEBAR_WIDTH, type SidebarResize } from "../hooks/useSidebarWidth"
import type { SocketStatus } from "../lib/actorSocket"
import { groupChats } from "../lib/chats"
import type { ChatSummary } from "../types"
import { InlineRename } from "./InlineRename"

export function Sidebar({ chats, activeId, status, resize, onNew, onOpen, onRename }: Props) {
    const { groups, archived } = groupChats(chats)
    const actions: RowActions = { onOpen, onRename }
    return (
        <aside className="side">
            <div className="side-top">
                <img className="sym" src="/symbol.svg" alt="" />
                Durable Chat
            </div>
            <button className={`new${activeId ? "" : " on"}`} onClick={onNew}>
                <span className="plus"><Plus size={16} strokeWidth={2.4} /></span>
                New chat
                <span className="kbd"><Command size={11} />K</span>
            </button>
            <nav className="list">
                {groups.map(group => (
                    <section key={group.label}>
                        <h2 className="sec">{group.label}</h2>
                        {group.chats.map(chat => (
                            <ChatRow key={chat.id} chat={chat} active={chat.id === activeId} actions={actions} />
                        ))}
                    </section>
                ))}
                {chats.length === 0 && status === "open" && <p className="empty">Your chats will show up here.</p>}
                <Archived chats={archived} activeId={activeId} actions={actions} />
            </nav>
            <div
                className="resizer"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize sidebar"
                aria-valuenow={resize.width}
                aria-valuemin={SIDEBAR_WIDTH.min}
                aria-valuemax={SIDEBAR_WIDTH.max}
                tabIndex={0}
                title="Drag to resize · double-click to reset"
                {...resize.handle}
            />
        </aside>
    )
}

/** Click to open; double-click to rename in place. */
function ChatRow({ chat, active, actions }: { chat: ChatSummary; active: boolean; actions: RowActions }) {
    const [renaming, setRenaming] = useState(false)
    const icon = chat.pinned && !chat.streaming ? <Pin size={14} className="muted" /> : <span className={`dot${chat.streaming ? " live" : ""}`} />
    const rename = (title: string | null) => {
        setRenaming(false)
        if (title && title !== chat.title) actions.onRename(chat.id, title)
    }
    if (renaming) {
        return (
            <div className="ci on">
                {icon}
                <InlineRename className="ci-input" value={chat.title} onDone={rename} />
            </div>
        )
    }
    return (
        <button className={`ci${active ? " on" : ""}`} onClick={() => actions.onOpen(chat.id)} onDoubleClick={() => setRenaming(true)} title={`${chat.title} · double-click to rename`}>
            {icon}
            <span className="t">{chat.title}</span>
        </button>
    )
}

function Archived({ chats, activeId, actions }: { chats: ChatSummary[]; activeId: string | null; actions: RowActions }) {
    const [open, setOpen] = useState(false)
    if (chats.length === 0) return null
    return (
        <section>
            <button className="sec toggle" onClick={() => setOpen(!open)}>
                <ChevronRight size={12} className={open ? "turned" : ""} />
                Archived · {chats.length}
            </button>
            {open && chats.map(chat => <ChatRow key={chat.id} chat={chat} active={chat.id === activeId} actions={actions} />)}
        </section>
    )
}

type Props = {
    chats: ChatSummary[]
    activeId: string | null
    status: SocketStatus
    resize: SidebarResize
    onNew(): void
    onOpen(chatId: string): void
    onRename(chatId: string, title: string): void
}

type RowActions = Pick<Props, "onOpen" | "onRename">
