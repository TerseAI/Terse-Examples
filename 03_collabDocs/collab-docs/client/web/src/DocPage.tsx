import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import TextAlign from "@tiptap/extension-text-align";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { DocSession, type DocSnapshot } from "./docSession";
import { Brand } from "./Brand";
import { navigate } from "./router";
import { Toolbar } from "./Toolbar";
import { UserChip } from "./UserChip";
import { initials, type User } from "./user";

type Props = { docId: string; user: User; onRename: () => void };

export function DocPage({ docId, user, onRename }: Props) {
  // Created in an effect so StrictMode's double mount doesn't leave a stray socket open.
  const [session, setSession] = useState<DocSession>();
  useEffect(() => {
    const next = new DocSession(docId, user);
    next.start();
    setSession(next);
    return () => next.destroy();
  }, [docId, user]);

  return session ? <OpenDoc session={session} user={user} onRename={onRename} /> : null;
}

function OpenDoc({ session, user, onRename }: { session: DocSession; user: User; onRename: () => void }) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  // Mount the editor only after the first full sync, so a fresh client never seeds its own empty paragraph.
  const [ready, setReady] = useState(false);
  if (snapshot.synced && !ready) setReady(true);

  useEffect(() => {
    document.title = `${snapshot.title || "Untitled document"} - Docs`;
  }, [snapshot.title]);

  if (snapshot.connection === "deleted") {
    return (
      <div className="gone">
        <h1>This document was deleted</h1>
        <button className="primary" onClick={() => navigate("/")}>
          Back to Docs
        </button>
      </div>
    );
  }

  return (
    <div className="doc-page">
      <header className="doc-header">
        <Brand />
        <div className="doc-heading">
          <TitleInput session={session} title={snapshot.title} disabled={!ready} />
          <SaveStatus snapshot={snapshot} />
        </div>
        <Collaborators snapshot={snapshot} me={user} />
        <ShareButton />
        <UserChip user={user} onRename={onRename} />
      </header>
      {ready ? <Editor session={session} user={user} /> : <div className="loading">Opening document…</div>}
    </div>
  );
}

function Editor({ session, user }: { session: DocSession; user: User }) {
  const editor = useEditor(
    {
      extensions: [
        // Collaboration brings its own Yjs-aware undo/redo.
        StarterKit.configure({ undoRedo: false, link: { openOnClick: false } }),
        TextAlign.configure({ types: ["heading", "paragraph"] }),
        Placeholder.configure({ placeholder: "Start typing, or share the link and write together…" }),
        Collaboration.configure({ document: session.doc }),
        CollaborationCaret.configure({ provider: session, user: { name: user.name, color: user.color } }),
      ],
      editorProps: { attributes: { class: "page-content", "aria-label": "Document body", spellcheck: "true" } },
    },
    [session],
  );

  return (
    <>
      <Toolbar editor={editor} />
      <div
        className="canvas"
        onMouseDown={event => {
          // Clicking the gray area around the page puts the cursor at the end, like Docs.
          if (event.target === event.currentTarget) {
            event.preventDefault();
            editor?.commands.focus("end");
          }
        }}
      >
        <div className="page">
          <EditorContent editor={editor} />
        </div>
      </div>
    </>
  );
}

function TitleInput({ session, title, disabled }: { session: DocSession; title: string; disabled: boolean }) {
  const [draft, setDraft] = useState(title);
  const [editing, setEditing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Take renames from collaborators, except while you're typing your own.
  useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);

  const commit = (value: string) => {
    clearTimeout(timer.current);
    session.setTitle(value.trim() || "Untitled document");
  };

  return (
    <input
      className="title-input"
      value={draft}
      disabled={disabled}
      placeholder="Untitled document"
      aria-label="Document title"
      size={Math.max(8, draft.length + 1)}
      maxLength={200}
      onFocus={event => {
        setEditing(true);
        event.currentTarget.select();
      }}
      onChange={event => {
        const value = event.target.value;
        setDraft(value);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => commit(value), 500);
      }}
      onBlur={() => {
        setEditing(false);
        commit(draft);
      }}
      onKeyDown={event => {
        if (event.key === "Enter" || event.key === "Escape") event.currentTarget.blur();
      }}
    />
  );
}

function SaveStatus({ snapshot }: { snapshot: DocSnapshot }) {
  const { connection, saving } = snapshot;
  const label =
    connection === "offline"
      ? "Offline. Edits will sync when you reconnect"
      : connection === "connecting"
        ? "Connecting…"
        : saving
          ? "Saving…"
          : "Saved";
  return (
    <span className={`save-status ${connection}`} role="status">
      {label}
    </span>
  );
}

function Collaborators({ snapshot, me }: { snapshot: DocSnapshot; me: User }) {
  const others = snapshot.users.filter(user => user.userId !== me.userId);
  if (!others.length) return null;
  const shown = others.slice(0, 4);
  return (
    <div className="collaborators" aria-label={`${others.length} other ${others.length === 1 ? "person" : "people"} here`}>
      {shown.map(user => (
        <span key={user.userId} className="avatar" style={{ background: user.color }} title={user.name}>
          {initials(user.name)}
        </span>
      ))}
      {others.length > shown.length && <span className="avatar more">+{others.length - shown.length}</span>}
    </div>
  );
}

function ShareButton() {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link to share the document:", location.href);
    }
  };
  return (
    <button className="share" onClick={share}>
      {copied ? "Link copied" : "Share"}
    </button>
  );
}
