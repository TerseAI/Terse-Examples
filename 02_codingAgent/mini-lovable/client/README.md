# Mini Lovable

A tiny Lovable-style app builder built with Durable Actors, Pi, and Modal.

You chat with a coding agent on the left and watch the app it builds on the right.
Each chat is one durable `PiAgent` actor that owns its conversation and a Modal sandbox.
The sandbox runs a Vite dev server that the agent edits live, and the preview pane
shows it through a Modal tunnel.

## Requirements

- [Bun 1.4.2+](https://bun.sh)
- The `terse` CLI, logged in with access to the project in `../actor/terse.config.json`
- A [Modal](https://modal.com) account, either in `~/.modal.toml` (`modal token new`) or
  as `SANDBOX_MODAL_TOKEN_ID` and `SANDBOX_MODAL_TOKEN_SECRET`
- An OpenAI API key that can use the model set in `../actor/src/actor.ts`

## Setup

From the repo root:

```sh
bun install
cd 02_codingAgent/mini-lovable/actor
bun install
cp .env.example .env    # set OPENAI_API_KEY (and Modal tokens if not using ~/.modal.toml)
cd ../client
bun install             # also installs web/
cp .env.example .env    # PORT for the Elysia API, defaults to 8000
```

## Run

From the repo root:

```sh
bun run example mini-lovable
```

This starts `terse actor dev` in `actor/`, waits for port 7100, then runs `bun run start`
here, which starts the Elysia API and the Vite app. Open [localhost:5173](http://localhost:5173).

To run the pieces yourself, use two terminals:

```sh
cd 02_codingAgent/mini-lovable/actor && terse actor dev
cd 02_codingAgent/mini-lovable/client && bun run start
```

Only one example can run at a time, because `terse actor dev` always uses port 7100.

In dev, edits to `web/src` hot-reload and edits to `src/` restart the API. Saving `.env`
restarts both, and the open page reloads itself, so its chats reconnect with the new settings.

## Deploy

The client talks to the local actor server unless `TERSE_ACTOR_URL` is set. To use
actors deployed to Terse Cloud:

1. In `../actor/.env`, uncomment and fill in `SANDBOX_MODAL_TOKEN_ID` and
   `SANDBOX_MODAL_TOKEN_SECRET`. Deployed actors can't read `~/.modal.toml`, and the
   runtime reserves the plain `MODAL_TOKEN_*` names.
2. From `../actor`, run `terse deploy`. Let it upload the secrets from `.env` when it asks
   (or run `terse secrets import .env` first).
3. Copy the `TERSE_ACTOR_URL` it prints into this folder's `.env`, and set `TERSE_API_KEY`
   to a key from the link it prints.
4. Run `bun run start` here. Don't use `bun run example`, which starts the local server.

Remove those two lines from `.env` to go back to local actors.

## Using it

Opening a new chat starts its Modal sandbox, which takes a little while the first time.
The preview pane shows **Live** once the sandbox's dev server answers. Ask the agent to
build something and its edits hot-reload in the preview.

- Open `?chat=<id>` or type an ID into the chat header to share a chat between tabs.
- **⌘N** and **⌘M** split the chat pane; the preview follows the active pane.
- The reset button clears the conversation for everyone in that chat.
- Paste any URL into the preview bar to point the preview elsewhere.

## Architecture

```text
Browser                 Elysia                  PiAgent actor               Modal sandbox
   |                       |                    (one per chat ID)            (node:22 + Vite)
   |-- request socket ---->|                            |                           |
   |                       |-- prepareWebsocket ------->|                           |
   |<-- WebSocket URL -----|                            |-- create or reattach ---->|
   |================ direct WebSocket =================>|                           |
   |<---------------- conversation view ----------------|                           |
   |<---------------- preview URL ----------------------|<-- tunnel on port 3000 ---|
   |                                                    |                           |
   |-- POST prompt ------->|-- prompt() --------------->|-- Pi agent (OpenAI) ----->|
   |<---------------- view ops (streamed) --------------|   reads, edits, runs      |
   |<---------------- final view -----------------------|                           |
```

- [Actor](../actor/src/actor.ts): the `PiAgent` actor. It sets the model, the agent
  instructions, and the coding tools, and broadcasts conversation changes to every
  connected socket.
- [Durable Pi agent](../actor/src/pi/DurablePiAgent.ts): runs the Pi harness and stores
  its state in the actor's database, so conversations survive restarts.
- [Modal sandbox](../actor/src/modal/SandboxResource.ts): creates a sandbox per actor,
  saves its ID, and reattaches to it after a restart if it is still running. Sandboxes
  time out after an hour.
- [Elysia backend](src/backend.ts): grants WebSocket access and forwards `prompt` and
  `reset` calls to the actor.
- [Chat session](web/src/chatSession.ts): one actor socket per pane, kept outside React.
- [Chat pane](web/src/ChatPane.tsx), [preview pane](web/src/PreviewPane.tsx), and
  [layout](web/src/App.tsx): the UI.

Chats are shared by ID and have no authentication. Add auth to the socket grant route
before using this for anything private.

## Development

```sh
bun run generate         # regenerate generated/ after changing the actor's methods
bun run check            # TypeScript (backend)
bun run --cwd web check  # TypeScript (web app)
```

Commit `generated/` after regenerating, and don't edit it by hand.
