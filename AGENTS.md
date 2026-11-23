# Tribunal – Discord court game bot

A Discord bot for the « Le Royaume » community: members put each other on trial for absurd crimes, a corrupt AI judge narrates, the room debates and votes, and convictions go to a permanent record.

## Key Patterns

- **Code decides, AI talks** – the court engine owns every rule (phases, timers, votes, verdict, records). The AI writes text from facts the code gives it and may return a structured intent (open a trial, show a record, chat) that the code validates before acting. It never calls Discord or the database itself.
- **Limited Discord writes** – the bot sends messages, edits its own messages, shows the typing indicator, answers button interactions and creates a voice channel and a scheduled event for each hearing in the audio category (`DISCORD_VOICE_CATEGORY_ID`) deletes the channels it created, joins the voice channel of its hearing to speak in it (text-to-speech) and to see who is speaking (never recording audio), and creates a short-lived voice room where the accused prepare their defense. Nothing else.
- **Stupid on purpose** – the tone is a ridiculous, corrupt judge. Never serious, never moralizing.

## Agent approach
- Be ultra-pragmatic: never over-engineer, never build anything that was not asked for, always prefer absolute simplicity.
- Read the existing code before implementing: rely on the content of the files and folders mentioned in the request, and search the codebase for similar examples to follow their syntax, structure and logic.
- If something extra genuinely deserves to be added (technical, security, optimization or clarity reasons) but is not part of the request and requires more code than asked: do not implement it, recommend it to the user instead and let them decide.

## Project Stack

- **Node.js v24 (LTS)** is used as the runtime.
  Node.js-specific APIs are therefore allowed and expected.

- **PNPM** is the only package manager used in this project.
  Other package managers MUST NOT be used.

- **TypeScript 7** and **ESLint** (`@bluzzi/eslint-config`) are used to enforce code quality.
  After any codebase update, the following commands MUST be executed from the repository root and all reported errors MUST be fixed:
  - `pnpm run ts:check` — checks for TypeScript errors in every app.
  - `pnpm run lint:fix` — automatically fixes ESLint errors when possible and reports remaining ones.

## Project Structure

pnpm monorepo with exactly two apps, no shared package:

### `apps/bot` — Discord bot, court engine and room server

Flat layout under `apps/bot/src`: only folders, only `.ts` files inside them, one `main.ts` at the root.

- `src/court` — The court: Discord-free engine (trials, timers, votes, verdicts), command parsing, AI judge, trial records, known members.
- `src/room` — The 3D courtroom: layout, Discord-free world simulation (positions, zones, seats) and WebSocket protocol.
- `src/tables` — Drizzle schema, one file per table.
- `src/integrations` — One file per external system (Discord, OpenRouter, web session): clients, SDK singletons and low-level helpers.
- `src/triggers` — Entry points (Discord events, room WebSocket server) translating the outside world into court and room calls.
- `src/utils` — Shared helpers, including `postgres` for the Drizzle client, migrations and reusable columns.

Dependencies flow one way: `triggers → court / room / tables / integrations → utils`. No file-level import cycles.

Files imported by `apps/web` (`src/room/layout.ts`, `src/room/protocol.ts`, `src/court/engine.ts`) MUST use relative imports only, never the `#/` alias.

### `apps/web` — website, Discord login and 3D client

Next.js App Router: `app/` (routes, `.tsx`), `components/` (React components), `lib/` (auth, database, hooks). It imports the room layout and protocol types from `@tribunal/bot`.

## Global Guidelines

- **No `try` / `catch` blocks are allowed in high-level functions.**
  Error handling is intentionally centralized in a small number of low-level functions.
  In high-level functions, errors MUST be propagated using:
  ```ts
  throw new Error("Details");
  ```

- **Naming conventions**
  - Folder and file names MUST use `kebab-case`
  - Variable names MUST use `camelCase`

- Use of `dedent` for multi-line strings, allowing clean and consistent indentation to be preserved.

- User-facing text is in French. Code, comments and commit messages are in English.

## Discord Agent Rules

- Inside the **AGENTS** category (`1574094410830844105`), you may perform any action without restriction.
- Outside the **AGENTS** category, do not intervene unless explicitly mentioned with `@` by a user.
- Never perform create, update, or delete actions via the Discord API unless:
  1. You verify that the requesting user has the required permissions for the target actions.
  2. You present a complete action plan beforehand listing the Discord API requests to execute.
  3. You receive explicit user confirmation to run that action plan.
- Enforce this workflow through real, deterministic security checks rather than relying solely on model decisions.
- Only message users in direct messages (DMs) after having an initial interaction with them.

### Confirmed exceptions

The server owners confirmed that the bot may create scheduled events and voice channels in the AGENTS category or in the audio category, as long as it does not disturb members (no spam). The AGENTS category exists so members can mute the bot in one action. The bot only deletes voice channels it created itself for a hearing. The three-step workflow above remains required for any other create, update or delete action.
