# Tribunal – Discord court game bot

A Discord bot for the « Le Royaume » community: members put each other on trial for absurd crimes, a corrupt AI judge narrates, the room debates and votes, and convictions go to a permanent record.

## Key Patterns

- **Code decides, AI talks** – the court engine owns every rule (phases, timers, votes, verdict, records). The AI writes text from facts the code gives it and may return a structured intent (open a trial, show a record, chat) that the code validates before acting. It never calls Discord or the database itself.
- **Limited Discord writes** – the bot sends messages, edits its own messages, shows the typing indicator, answers button interactions, creates a voice channel and a scheduled event for each hearing in the audio category (`DISCORD_VOICE_CATEGORY_ID`), deletes the channels it created, creates a short-lived voice room where the accused prepare their defense, registers the « Ouvrir un procès » message command and the `/chexclude` and `/fiche` commands, and enforces sentences in every text channel (reminder replies and reactions, see the confirmed exceptions). Nothing else.
- **Listening, never recording** – the bot joins the voice channel of its hearing (and the preparation room of a court-appointed lawyer) to speak (Piper) and to listen: each utterance is decoded in memory, sent to the self-hosted Whisper service, and only the text is kept (the clerk's transcript). Audio is never written to disk, stored or sent anywhere else.
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

pnpm monorepo with exactly two apps, no shared package. Code is organized **by feature**: each feature lives in its own folder with every file it needs, and may have a short `AGENTS.md` with its own rules.

### `apps/bot` — Discord bot, court engine and courtroom server

- `src/features/court` — The trial engine (phases, floor, witnesses, objections, votes, verdicts, Discord-free), the AI judge, intents and commands, records and known members, and the court events that turn the engine into messages and speech.
- `src/features/hearings` — Hearings before and around a trial: request and screening, schedule, lawyers and preparation, jury claims, the voice of the judge and the transcription of what is said, restore after a restart.
- `src/features/clerk` — The clerk: transcript lines, case files, archive search, member dossiers and courtroom incidents.
- `src/features/room` — The 3D courtroom: layout, world simulation, chaos of the audience (games, tomatoes, fights), WebSocket protocol, access and server.
- `src/features/commands` — Discord entry points: mentions of the bot, buttons, the message command and its form.
- `src/features/penalties` — Enforced sentences: the rule each convict must follow in their messages, the watcher that checks every message and extends the sentence, and the channel exclusions (`/chexclude`).
- `src/features/profiles` — The judge's memory of every member: messages of the server and lines heard in hearings are buffered in memory, then the clerk (AI) rewrites a short profile per member, stored in `member.profile`, which the judge reads whenever he talks to or about someone.
- `src/tables` — Drizzle schema, one file per table.
- `src/integrations` — One file per external system (Discord, voice, OpenRouter, Piper, Whisper, web session): clients and low-level helpers.
- `src/utils` — Shared helpers, including `postgres` for the Drizzle client, migrations and reusable columns.

Dependencies flow one way: `features → tables / integrations → utils`. No file-level import cycles between features.

Files imported by `apps/web` (`src/features/room/layout.ts`, `protocol.ts`, `world.ts`, `chaos.ts` and `src/features/court/engine.ts`) MUST use relative imports only, never the `#/` alias. The web app only imports types from `engine.ts` (its values pull Node modules into the browser bundle).

### `apps/web` — the Discord Activity

Next.js App Router: `app/` (routes and global styles), `features/` (`activity`: Discord sign-in inside the Activity; `courtroom`: the 3D courtroom, characters, HUD and chaos), `components/` (shared UI), `lib/` (auth, database, environment). The site only renders inside the Discord Activity: anywhere else it shows nothing.

### File size

No file over about 500 lines: past that, split it by responsibility inside its feature folder.

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

The server owners confirmed that the bot may create scheduled events and voice channels in the AGENTS category or in the audio category, as long as it does not disturb members (no spam). The AGENTS category exists so members can mute the bot in one action. The bot only deletes voice channels it created itself for a hearing. The server owners also confirmed that the bot registers one message command, « Ouvrir un procès », in each configured guild at startup (registering it again updates it), and answers it with a form; it only works in an AGENTS category. The server owners also confirmed the `/chexclude` and `/fiche` commands (`/fiche` answers only to the member who asked). They also confirmed that the bot may intervene outside the AGENTS category to enforce sentences, as long as it never spams: when a convicted member breaks their sentence in a text channel, the bot replies once, then only reacts to their messages with the sentence emoji for 5 minutes, never pings, and stays silent in the excluded channels and categories (`/chexclude`, for members who manage channels). The three-step workflow above remains required for any other create, update or delete action.
