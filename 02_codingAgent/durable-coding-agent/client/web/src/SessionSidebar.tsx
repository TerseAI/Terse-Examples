import { useEffect, useState, useSyncExternalStore } from "react";

import { newChatId, type ChatSession } from "./chatSession";

type SavedSession = { id: string; createdAt: string; lastOpenedAt: string };
const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

function lastOpened(value: string) {
  const date = new Date(value);
  return date.toDateString() === new Date().toDateString()
    ? `Today, ${timeFormat.format(date)}`
    : dateFormat.format(date);
}

export function SessionSidebar({ session, onSelect, onClose }: { session: ChatSession; onSelect?: () => void; onClose?: () => void }) {
  const { chatId } = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [revision, setRevision] = useState(0);
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [archiving, setArchiving] = useState<string>();

  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener("sessions-changed", refresh);
    return () => window.removeEventListener("sessions-changed", refresh);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void fetch("/api/sessions", { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("Could not load saved sessions. Try refreshing.");
        const data: { sessions: SavedSession[] } = await response.json();
        if (!controller.signal.aborted) setSessions(data.sessions);
      })
      .catch(() => { if (!controller.signal.aborted) setError("Could not load saved sessions. Try refreshing."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);

  function open(id: string) {
    if (id !== chatId) session.open(id);
    onSelect?.();
  }

  async function archive(id: string) {
    setArchiving(id);
    setError("");
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Archive failed");
      window.dispatchEvent(new Event("sessions-changed"));
    } catch {
      setError("Could not archive this session. Try again.");
    } finally {
      setArchiving(undefined);
    }
  }

  return (
    <aside className="session-sidebar" aria-label="Saved sessions">
      <header className="session-sidebar-header">
        <h2>Saved sessions</h2>
        <button className="sidebar-icon" type="button" aria-label="Refresh sessions" title="Refresh sessions" disabled={loading} onClick={() => setRevision(value => value + 1)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8M21 3v5h-5" /></svg>
        </button>
        {onClose && <button className="sidebar-icon" type="button" aria-label="Close sessions" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>}
      </header>
      <button className="session-new" type="button" onClick={() => open(newChatId())}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        New chat
      </button>
      {error && <p className="session-error" role="alert">{error}</p>}
      {loading && <span className="sr-only" role="status">Loading sessions…</span>}
      {loading && sessions.length === 0 && <div className="session-skeleton" aria-hidden="true">{[0, 1, 2].map(index => <div key={index}><span /><span /></div>)}</div>}
      {!loading && !error && sessions.length === 0 && <div className="session-empty"><p>No saved sessions yet</p><span>Open a chat to add it here.</span></div>}
      <ul className="session-list" aria-label="Saved sessions" aria-busy={loading}>
        {sessions.map(saved => (
          <li key={saved.id} data-current={saved.id === chatId || undefined} data-archiving={archiving === saved.id || undefined}>
            <button className="session-open" type="button" title={saved.id} aria-current={saved.id === chatId ? "page" : undefined} onClick={() => open(saved.id)}>
              <span className="session-name">{saved.id}</span>
              <span className="session-meta">
                {archiving === saved.id ? "Archiving…" : saved.id === chatId ? "Current chat" : <time dateTime={saved.lastOpenedAt} title={dateFormat.format(new Date(saved.lastOpenedAt))}>{lastOpened(saved.lastOpenedAt)}</time>}
              </span>
            </button>
            <button className="session-archive" type="button" disabled={Boolean(archiving)} aria-label={`Archive ${saved.id}`} title="Hide from saved sessions. Reopen by ID to restore." onClick={() => void archive(saved.id)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8v12h16V8M3 3h18v5H3zM9 12h6" /></svg>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
