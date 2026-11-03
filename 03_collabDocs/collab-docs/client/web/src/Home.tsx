import { useCallback, useEffect, useState } from "react";

import { createDoc, deleteDoc, listDocs, type DocSummary } from "./api";
import { Brand } from "./Brand";
import { Icon, icons } from "./icons";
import { docPath, navigate } from "./router";
import { UserChip } from "./UserChip";
import type { User } from "./user";

type Props = { user: User; onRename: () => void };

export function Home({ user, onRename }: Props) {
  const [docs, setDocs] = useState<DocSummary[]>();
  const [error, setError] = useState<string>();
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(() => {
    listDocs()
      .then(list => {
        setDocs(list);
        setError(undefined);
      })
      .catch(() => setError("Couldn't load documents. Is the backend running?"));
  }, []);

  useEffect(() => {
    document.title = "Docs";
    refresh();
    // Titles and previews change while you're away; refresh when the tab comes back.
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  const create = async () => {
    setCreating(true);
    try {
      const doc = await createDoc();
      navigate(docPath(doc.id));
    } catch {
      setError("Couldn't create a document.");
      setCreating(false);
    }
  };

  const remove = async (doc: DocSummary) => {
    if (!window.confirm(`Delete "${doc.title}" for everyone? This can't be undone.`)) return;
    setDocs(current => current?.filter(d => d.id !== doc.id));
    await deleteDoc(doc.id).catch(() => setError("Couldn't delete that document."));
    refresh();
  };

  return (
    <div className="home">
      <header className="home-header">
        <Brand showName />
        <UserChip user={user} onRename={onRename} />
      </header>

      <section className="start">
        <div className="start-inner">
          <h2>Start a new document</h2>
          <button className="blank-card" onClick={create} disabled={creating} aria-label="Blank document">
            <span className="blank-page">
              <Icon path={icons.plus} size={56} />
            </span>
            <span className="card-caption">{creating ? "Creating…" : "Blank document"}</span>
          </button>
        </div>
      </section>

      <main className="recent">
        <h2>Recent documents</h2>
        {error && <p className="notice error">{error}</p>}
        {docs === undefined && !error && <p className="notice">Loading…</p>}
        {docs?.length === 0 && <p className="notice">No documents yet. Start one above.</p>}
        <ul className="doc-grid">
          {docs?.map(doc => (
            <li key={doc.id} className="doc-card">
              <a
                href={docPath(doc.id)}
                onClick={event => {
                  if (event.metaKey || event.ctrlKey) return;
                  event.preventDefault();
                  navigate(docPath(doc.id));
                }}
              >
                <span className="thumb">{doc.preview || <em>Empty document</em>}</span>
                <span className="doc-meta">
                  <span className="doc-title">{doc.title}</span>
                  <span className="doc-date">{formatEdited(doc.updatedAt)}</span>
                </span>
              </a>
              <button className="icon-button delete" title="Delete" aria-label={`Delete ${doc.title}`} onClick={() => remove(doc)}>
                <Icon path={icons.trash} size={18} />
              </button>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

export function formatEdited(timestamp: number) {
  const elapsed = Date.now() - timestamp;
  if (elapsed < 60_000) return "Edited just now";
  if (elapsed < 3_600_000) return `Edited ${Math.round(elapsed / 60_000)} min ago`;
  const date = new Date(timestamp);
  if (elapsed < 86_400_000) return `Edited ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  return `Edited ${date.toLocaleDateString([], { month: "short", day: "numeric" })}`;
}
