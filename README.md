<img width="2172" height="724" alt="Juge Bakchich au tribunal royal" src="https://github.com/user-attachments/assets/b872b0d7-66c3-46e8-8b28-568825ff2d2a" />

---

Tribunal is a Discord bot for the Royaume server. Members put each other on trial for absurd crimes in front of Juge Bakchich, a lazy and slightly corrupt AI judge. The trial is pleaded out loud, the room votes, and the convicts serve a real sentence on the server.

## Features

- Open a trial with a mention or the « Ouvrir un procès » message command.
- Plead in a voice channel: the judge speaks, listens and gives the floor. Lawyers, witnesses and objections included.
- Vote as a jury, or let the judge decide alone on light cases.
- Serve real sentences: end every message with « avec ce doux fromage » for an hour, and each slip adds time.
- Read criminal records, case files and the clerk's notes on every member with `/fiche`.
- Walk into a 3D courtroom from Discord: sit, vote, throw tomatoes, start a fight.

## Architecture

The code owns every rule (phases, votes, verdicts, sentences), the AI only writes the judge's lines from the facts it is given. Each hearing is transcribed in memory by a self-hosted Whisper, and only the text is kept.

| Service | Role |
| --- | --- |
| `apps/bot` | Discord bot, trial engine, AI judge and courtroom server. |
| `apps/web` | Next.js Discord Activity with the 3D courtroom. |
| `postgres` | Records, hearings, transcripts, sentences and members. |
| `tts` / `stt` | Piper for the judge's voice, whisper.cpp for transcription. |

## Development

Use Node.js 24 and pnpm. Follow [AGENTS.md](AGENTS.md) when working with coding agents.

Enable the Message Content intent for the bot. Copy each `.env.example` to `.env` and fill it in, see [env.ts](apps/bot/src/utils/env.ts) for descriptions and defaults. Start Postgres with `docker compose -f docker-compose.dev.yml up -d`. The bot applies its migrations at startup.

| Command | Purpose |
| --- | --- |
| `pnpm install` | Install dependencies. |
| `pnpm --filter @tribunal/bot run dev` | Start the bot and restart it on changes. |
| `pnpm --filter @tribunal/web run dev` | Start the Activity. |
| `pnpm --filter @tribunal/web run db:migrate` | Create the sign-in tables. |
| `pnpm run ts:check` | Check TypeScript types. |
| `pnpm run lint:fix` | Run ESLint and apply available fixes. |

Production runs on Coolify from `docker-compose.yml`, branch `stable`.
