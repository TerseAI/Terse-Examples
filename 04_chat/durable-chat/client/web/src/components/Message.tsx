import { Check, Copy, FileCode, GitBranch, RefreshCw } from "lucide-react"
import { isValidElement, useState, type ReactNode } from "react"
import ReactMarkdown from "react-markdown"
import rehypeHighlight from "rehype-highlight"
import remarkGfm from "remark-gfm"

import type { ChatMessage } from "../types"

export function Message({ message, canRetry, onRetry, onFork }: Props) {
    if (message.role === "user") {
        return (
            <div className="u">
                <p>{message.content}</p>
            </div>
        )
    }
    const streaming = message.status === "streaming"
    return (
        <article className="turn">
            <div className={`a${streaming && message.content ? " streaming" : ""}`}>
                {message.content ? <Markdown text={message.content} /> : streaming && <p className="thinking"><span className="pulse" />Thinking…</p>}
            </div>
            {message.status === "stopped" && <p className="note">Stopped.</p>}
            {message.status === "interrupted" && <p className="note">Interrupted when the server restarted. Retry to finish it.</p>}
            {message.status === "failed" && <p className="note err">{message.error ?? "The model call failed."}</p>}
            {!streaming && (
                <div className="acts">
                    <CopyButton text={message.content} />
                    {canRetry && <IconButton label="Retry" onClick={onRetry}><RefreshCw size={16} /></IconButton>}
                    <IconButton label="Fork from here" onClick={onFork}><GitBranch size={16} /></IconButton>
                </div>
            )}
        </article>
    )
}

function Markdown({ text }: { text: string }) {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[[rehypeHighlight, { detect: true }]]}
            components={{ pre: ({ children }) => <CodeBlock>{children}</CodeBlock> }}
        >
            {text}
        </ReactMarkdown>
    )
}

function CodeBlock({ children }: { children?: ReactNode }) {
    const { language, code } = codeOf(children)
    return (
        <div className="code">
            <div className="bar">
                <FileCode size={14} className="muted" />
                {language || "code"}
                <CopyButton text={code} withLabel />
            </div>
            <pre>{children}</pre>
        </div>
    )
}

function codeOf(children: ReactNode): { language: string; code: string } {
    if (!isValidElement<{ className?: string; children?: ReactNode }>(children)) return { language: "", code: "" }
    const language = /language-(\S+)/.exec(children.props.className ?? "")?.[1] ?? ""
    return { language, code: textOf(children.props.children).replace(/\n$/, "") }
}

/** Plain text of highlighted code, whose children are nested token spans. */
function textOf(node: ReactNode): string {
    if (typeof node === "string" || typeof node === "number") return String(node)
    if (Array.isArray(node)) return node.map(textOf).join("")
    if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children)
    return ""
}

function CopyButton({ text, withLabel = false }: { text: string; withLabel?: boolean }) {
    const [copied, setCopied] = useState(false)
    const copy = async () => {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
    }
    const icon = copied ? <Check size={withLabel ? 14 : 16} /> : <Copy size={withLabel ? 14 : 16} />
    if (withLabel) return <button className="cp" onClick={copy}>{icon}{copied ? "Copied" : "Copy"}</button>
    return <IconButton label="Copy" onClick={copy}>{icon}</IconButton>
}

function IconButton({ label, onClick, children }: { label: string; onClick(): void; children: ReactNode }) {
    return (
        <button className="ib" onClick={onClick} title={label} aria-label={label}>
            {children}
        </button>
    )
}

type Props = {
    message: ChatMessage
    canRetry: boolean
    onRetry(): void
    onFork(): void
}
