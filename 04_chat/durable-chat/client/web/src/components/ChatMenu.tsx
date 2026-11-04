import { Archive, ArchiveRestore, Download, Ellipsis, GitBranch, Pencil, Pin, PinOff, Trash2 } from "lucide-react"
import { useRef, useState, type ReactNode } from "react"

import { useDismiss } from "../hooks/useDismiss"

export function ChatMenu({ pinned, archived, onAction }: Props) {
    const [open, setOpen] = useState(false)
    const root = useRef<HTMLDivElement>(null)
    const close = () => setOpen(false)
    useDismiss(root, open, setOpen)
    const run = (action: ChatAction) => {
        close()
        onAction(action)
    }

    return (
        <div className="menu-root" ref={root}>
            <button className={`ib${open ? " open" : ""}`} onClick={() => setOpen(!open)} aria-label="Chat options" aria-expanded={open}>
                <Ellipsis size={18} />
            </button>
            {open && (
                <div className="menu" role="menu">
                    <Item icon={<Pencil size={16} />} onClick={() => run("rename")}>Rename</Item>
                    <Item icon={pinned ? <PinOff size={16} /> : <Pin size={16} />} onClick={() => run("pin")}>{pinned ? "Unpin chat" : "Pin chat"}</Item>
                    <Item icon={<GitBranch size={16} />} onClick={() => run("fork")}>Fork conversation</Item>
                    <Item icon={<Download size={16} />} onClick={() => run("export")}>Export as Markdown</Item>
                    <div className="sep" />
                    <Item icon={archived ? <ArchiveRestore size={16} /> : <Archive size={16} />} onClick={() => run("archive")}>{archived ? "Unarchive" : "Archive"}</Item>
                    <Item icon={<Trash2 size={16} />} danger onClick={() => run("delete")}>Delete chat</Item>
                </div>
            )}
        </div>
    )
}

function Item({ icon, danger, onClick, children }: { icon: ReactNode; danger?: boolean; onClick(): void; children: ReactNode }) {
    return (
        <button className={`mi${danger ? " del" : ""}`} role="menuitem" onClick={onClick}>
            {icon}
            {children}
        </button>
    )
}

export type ChatAction = "rename" | "pin" | "fork" | "export" | "archive" | "delete"

type Props = {
    pinned: boolean
    archived: boolean
    onAction(action: ChatAction): void
}
