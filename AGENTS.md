# Tribunal – Discord court game bot

A Discord bot for the « Le Royaume » community: members put each other on trial for absurd crimes, a corrupt AI judge narrates, the room debates and votes, and convictions go to a permanent record.

## Key Patterns

- **Code decides, AI talks** – the court engine owns every rule (phases, timers, votes, verdict, records). The AI only writes text from facts the code gives it, and has no tools.
- **No Discord writes besides messages** – the bot sends messages, edits its own messages, shows the typing indicator and answers button interactions. Nothing else.
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
  After any codebase update, the following commands MUST be executed and all reported errors MUST be fixed:
  - `pnpm run ts:check` — checks for TypeScript errors.
  - `pnpm run lint:fix` — automatically fixes ESLint errors when possible and reports remaining ones.
  - `pnpm run test` — runs the `node:test` suites (`src/**/*.test.ts`).

## Project Structure

Flat layout under `/src`: only folders, only `.ts` files inside them, one `main.ts` at the root.

- `src/court` — The court: Discord-free engine (trials, timers, votes, verdicts), command parsing, AI judge, trial records.
- `src/tables` — Drizzle schema, one file per table.
- `src/integrations` — One file per external system (Discord, OpenRouter): clients, SDK singletons and low-level helpers.
- `src/triggers` — Entry points (Discord events) translating Discord into court calls and court events into Discord messages.
- `src/utils` — Shared helpers, including `postgres` for the Drizzle client, migrations and reusable columns.

Dependencies flow one way: `triggers → court / tables / integrations → utils`. No file-level import cycles.

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
