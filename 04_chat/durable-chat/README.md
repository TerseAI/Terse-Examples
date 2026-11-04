# Durable Chat

A multi-provider LLM chat app on Durable Actors: every conversation is an actor, and every reply is a durable pi run that survives a crash mid-stream.

Elysia backend, [pi-durable](https://www.npmjs.com/package/@earendil-works/pi-durable) for the model runs, and a Vite + React frontend. Pick Anthropic, OpenAI, Gemini or Grok per message, stop or retry a reply, fork a conversation, and open the same chat in two tabs to watch a reply stream into both.

```
 Browser (client/web) ── HTTP /api/* ──► Elysia (client/src/backend.ts) ── typed RPC ──► actors
        │                                                                                │
        ├── WebSocket ──► ChatIndex("main")   @Persisted @Emittable chats → live sidebar  │
        └── WebSocket ──► Chat(<chatId>)      messages · model · reply runs ◄────────────┘
                                │  @Interleave: join mid-stream, stop, rename while a reply streams
                                │  @Resource DurablePiAgent: a pi harness in the actor's own SQLite
                                ▼
                          pi-ai → anthropic · openai · google · xai
```

## How it works

- **Browsers never call actors over RPC.** They ask Elysia for a WebSocket grant, then connect straight to the actor.
- **Each reply is a durable pi run.** `DurablePiAgent` (`actor/src/pi/agent.ts`) keeps a pi harness in the actor's SQLite through `ActorStorage` (`actor/src/pi/storage.ts`), an append-only commit log. The `Chat` actor streams pi's partial answer to every socket as deltas.
- **Crash recovery.** If the process dies mid-reply, the harness resumes the run when the actor next starts, and an alarm keeps waking the actor until pi has no unfinished tasks. The reply then finishes as if nothing happened.
- **Stop is an RPC, not a socket message.** Messages from one socket are handled in order, so a stop sent on the reply's own socket would wait for the reply to finish. The browser calls `POST /api/chats/:id/stop` instead, and `@Interleave` lets `Chat.stop()` run mid-reply.
- **Retry and fork reuse pi's own messages.** Retry rewrites pi's context to the history before the last question and asks it again. Fork copies the messages and the matching pi history into a new `Chat` actor.

## Run it

You need Bun 1.4.2+ and the Terse CLI. Add at least one provider key to `actor/.env` (copy `actor/.env.example`): `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` or `XAI_API_KEY`. The model picker only lists providers that have a key.

From this repository:

```sh
bun run example durable-chat
```

As a new project:

```sh
terse init my-chat --template durable-chat
cd my-chat/actor && terse actor dev          # terminal 1
cd my-chat/client && terse actor generate && bun start   # terminal 2
```

Open the URL Vite prints (http://localhost:5173 by default). Edit `actor/src/models.ts` to change the model list; IDs are `provider/model` strings from pi-ai's catalog.

## Layout

| Path | What it is |
|---|---|
| `actor/src/actor.ts` | `Chat` and `ChatIndex` actors |
| `actor/src/pi/` | `DurablePiAgent` resource and its SQLite storage |
| `actor/src/models.ts` | Model list and key-gated availability |
| `client/src/backend.ts` | Elysia API: create, stop, rename, pin, archive, fork, export, delete, socket grants |
| `client/web/` | Vite + React UI |
| `client/generated/` | Typed client from `terse actor generate` (don't edit) |

## Deploy

```sh
cd actor
terse secrets import .env   # provider keys for the cloud actors
terse deploy
```

Then set `TERSE_ACTOR_URL` and `TERSE_API_KEY` in `client/.env` (see `client/.env.example`) and run `terse actor generate` in `client/` against the deployed actors.

There is no web search: pi has no built-in provider search. Add one as a tool in the harness registry (`createRegistry()` in `actor/src/pi/agent.ts`) backed by the search API of your choice.
