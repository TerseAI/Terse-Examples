# Mini Lovable

## Local sessions

The backend uses Bun's built-in SQLite driver. No database server, additional
package, or setup command is needed. `bun start` runs the backend and frontend;
start the actors separately with `terse actor dev` from `../actor`.

Session metadata is stored in `.data/sessions.sqlite` (including SQLite WAL
sidecar files), which is ignored by Git. Set `SESSION_DB_PATH` to use a different
file. Conversation history and sandbox state remain in the durable actors.

Use the **Saved sessions** sidebar to list or reopen chats, start a new chat, or
archive an entry. It opens sessions in the focused chat pane. On small screens,
the **Saved sessions** button opens a drawer. Sessions are registered when the backend successfully
issues a WebSocket connection grant. Reopening a chat updates its timestamp and
restores an archived entry. New sessions appear at the top; reopening a session
keeps it in place. Closing a pane does not archive its chat.

“Active” means saved and unarchived, not currently connected or guaranteed to have
a running sandbox. A grant can precede actor startup, so a chat whose actor fails
to initialize still stays in the list for retrying. Archiving only hides the
entry; it does not delete the conversation or terminate the sandbox.

- `GET /api/sessions` returns `{ sessions: [{ id, createdAt, lastOpenedAt }] }`,
  ordered by creation time (newest first), then ID for ties. Dates are UTC ISO strings.
- `DELETE /api/sessions/:chatId` archives a known session (`204`, or `404` if absent).
- `POST /api/chat/:chatId/socket` registers or restores a session and returns its grant.

To import existing local actors without waking them, run `bun run db:import-sessions`
while the actor runtime is running. It defaults to `http://127.0.0.1:7100`, project
`local`; overrides are `DURABLE_ACTORS_CONTROL_PLANE_URL`,
`DURABLE_ACTORS_PROJECT_ID`, and optional `DURABLE_ACTORS_SECRET`. Imports preserve
existing records and archived entries. New imported entries start their timestamps
at import time because the inventory does not provide historical open times.

Run `bun test` for isolated SQLite and API integration tests, `bun run check` for
backend types, and `bun run --cwd web build` for the frontend.

The original demo notes below describe the starting template; Mini Lovable now
uses Pi and Modal rather than Mastra.

## Original demo notes

A multiplayer AI chat demo built with Elysia, Mastra, and Durable Actors.

A Vite + React app in `web/` talks to an Elysia API, which grants WebSocket access
and forwards prompts. Each chat has one durable actor
that owns its conversation history, connected clients, and Mastra agent turns.
Replies stream directly from the actor to everyone in the room.

## Run

Requires [Bun 1.4.2+](https://bun.sh) and your own OpenAI API key.

```sh
bun install --frozen-lockfile
bun install --frozen-lockfile --cwd web
cp .env.example .env
```

Set `OPENAI_API_KEY` in `.env`. Mastra uses `OPENAI_MODEL`, defaulting to
`gpt-5-mini`. Every reply calls OpenAI.

Start the actors:

```sh
bun run dev:actors
```

Wait for `Ready`, then start Elysia and the Vite app in another terminal:

```sh
bun run dev
```

Open [localhost:5173](http://localhost:5173) to start an independent chat. Open the
same chat ID in two browser tabs to see shared replies.
Reload after a reply finishes to restore the saved history.
Use the reset icon beside **Open** to clear the current chat for everyone in the room.

Press **⌘N** to split the active pane above/below, or **⌘M** to split it side by
side. The header buttons do the same thing (and work when a browser reserves a
shortcut). Click a pane to focus it; use **×** to close it. Each new pane starts
an independent chat. Enter the same chat ID in multiple panes to share a room.

Both processes read `.env`. The first actor start downloads the Durable Actors
runtime. Actor state is stored locally in `.durable-actors/` and survives restarts.
Use `PORT` to change the Elysia port; Vite proxies `/api` to it. To change the actor port, set
`DURABLE_ACTORS_PORT` and update `DURABLE_ACTORS_CONTROL_PLANE_URL` to match.

## Architecture

```text
Browser                 Elysia                  ChatHistory actor          OpenAI
   |                       |                     (one per chat ID)           |
   |-- request socket ---->|                            |                    |
   |                       |-- prepare WebSocket ------>|                    |
   |                       |<-- connection grant -------|                    |
   |<-- WebSocket URL -----|                            |                    |
   |                                                    |                    |
   |================ direct WebSocket =================>|                    |
   |<---------------- saved history --------------------|                    |
   |                                                    |                    |
   |-- POST prompt ------->|                            |                    |
   |                       |-- prompt() --------------->|                    |
   |<---------------- start event ----------------------|                    |
   |                                                    |-- Mastra stream -->|
   |                                                    |   history + prompt |
   |<---------------- text deltas ----------------------|<-- streamed text --|
   |<---------------- done event -----------------------|                    |
   |                                                    |                    |
   |                                             Persist conversation        |
   |                                             when handler returns        |
```

- [Elysia backend](src/backend.ts): validates chat IDs, returns connection grants
  from `POST /api/chat/:chatId/socket`, and forwards prompts from
  `POST /api/chat/:chatId/prompt` to the actor.
- [Chat actor](src/actors.ts): sends history on connection, processes one turn at a
  time, and broadcasts `start`, `delta`, and `done` events to the room. Its `reset()`
  method clears saved messages and broadcasts an empty history.
- [Mastra agent](src/actors.ts): streams concise, helpful responses with the saved
  messages. Durable Actors owns persistence, so no Mastra memory store is needed.
- [Chat session](web/src/chatSession.ts): connects directly to the actor, streams
  text, sends prompts, and switches rooms. Lives outside React so panes keep their
  socket when the layout changes.
- [Chat pane](web/src/ChatPane.tsx) and [pane layout](web/src/App.tsx): render a chat
  and split the active pane; handle shortcuts.

After streaming, the actor saves both the user message and reply. New connections
wait for an active turn to finish before receiving history; streams are not resumed
after a process restart.

Rooms are shared by ID and have no authentication. Add authentication and chat
ownership checks to the connection-grant route before using private conversations.

## Development

```sh
bun run generate  # Regenerate typed actor clients after changing the contract
bun run check     # TypeScript (backend)
bun run --cwd web check  # TypeScript (web app)
```

Commit `generated/` after regeneration; do not edit it by hand. Commit both
`bun.lock` files when updating dependencies. `bun run start` runs the Elysia API
without file watching; `bun run --cwd web build` builds the web app into `web/dist`.

Built with [Durable Actors](https://github.com/TerseAI/durable-actors),
[Elysia](https://elysiajs.com), and [Mastra](https://mastra.ai/docs/agents/overview).
