<img width="2172" height="724" alt="Juge Bakchich au tribunal royal" src="https://github.com/user-attachments/assets/b872b0d7-66c3-46e8-8b28-568825ff2d2a" />

---

A Discord bot for the « Le Royaume » server. Members drag each other in front of **Juge Bakchich**, a corrupt AI judge, for absurd crimes. The trial is pleaded out loud in a voice channel, the room votes, and every conviction ends up in a permanent criminal record. A 3D courtroom, played as a Discord Activity, shows the trial live.

Everything shown to users is in French. Trials only run inside the AGENTS category.

## How a trial goes

1. **Request**: mention the bot (`@Bakchich ouvre un procès à @membre parce qu'il a volé mon croissant`), or right-click a message, **Applications**, **Ouvrir un procès**, and explain why in the form. The AI clerk screens the accusation (absurd jokes only) and rates its gravity.
2. **Hearing**: the bot creates a voice channel « Procès de … » and a Discord event. The wait (10 to 30 minutes) depends on how many members are active. Meanwhile the accused pick a lawyer (who must accept), ask for a court-appointed AI lawyer, or claim a jury for a light case. The plaintiff can open the hearing early.
3. **Preparation**: with a lawyer, the accused get a private voice room for 5 minutes. The AI lawyer listens to them there (or reads what they write).
4. **Trial**: the code runs the phases and gives the floor; the judge announces each phase out loud.
   - American style (default): opening, prosecution, defense, witnesses (examination then cross-examination), closing statements. Counsel can shout « objection ! ».
   - French style (on request): the judge questions the accused, then the plaintiff, the witnesses, the defense and the accused's last word. No objections.
5. **Judgment**: the gravity decides the mode. Popular jury (members in the voice channel vote), judge alone (light case, or fewer than 3 possible voters), or assizes (jury and judge, the judge's vote counts three times). The corrupt judge may still reverse the vote.
6. **Verdict**: the AI writes the sentence and the clerk's case file; the trial goes to the casier.

During the hearing the bot listens: what is said is transcribed by the self-hosted Whisper service and typed by the clerk (text only, audio is never kept). The judge reacts to it now and then, objections are detected, and members' characters gesture with the loudness of their voice.

## Commands

| Command | What it does |
| --- | --- |
| `@Bakchich procès @membre pour <crime>` | Opens a trial (American style). Plain requests work too, and can ask for a French-style trial. |
| `@Bakchich casier @membre` | Shows the criminal record: convictions, trials won, testimonies, courtroom incidents, memorable lines. |
| `@Bakchich j'appelle @membre à la barre` | During the witnesses phase, the prosecution or the defense calls a witness. |
| `@Bakchich greffier, rappelle les faits` | The clerk recalls the hearing in progress from the transcript. |
| `@Bakchich tu te souviens du procès de @membre ?` | The clerk searches the archives and answers from the case files. |
| Right click a message, **Applications**, **Ouvrir un procès** | Puts the author of the message on trial, the message being the context. |

## The courtroom (Discord Activity)

Members enter the 3D courtroom from Discord. They walk around (ZQSD), sit on the benches, become jurors at the gate, and vote during the trial. The audience can also make chaos: throw a tomato (1), whisper an AI rumor (2), play rock-paper-scissors (3) or Connect 4 (4), start a fight (5: the police comes in and writes it in the casier), shout « OBJECTION ! » (O) or fall asleep (B). The site shows nothing outside of Discord.

## Architecture

| Service | What it is |
| --- | --- |
| `bot` (`apps/bot`) | Discord bot, trial engine, AI judge and the courtroom WebSocket server. |
| `web` (`apps/web`) | Next.js app of the Activity: Discord sign-in (BetterAuth) and the 3D courtroom. |
| `postgres` | Records, hearings, transcripts, members, sessions. |
| `tts` | Piper: the voice of the judge. |
| `stt` | whisper.cpp: transcription of the hearings. |

The code is organized by feature (see `AGENTS.md`). The AI runs on free OpenRouter models, with canned fallbacks when they are out of quota.

## Discord application

- **Bot**: enable the **Message Content** privileged intent. Invite it with the `bot` and `applications.commands` scopes, with Manage Channels, Manage Events, Connect and Speak on the audio category.
- **Activity**: enable Activities and set the `/` URL mapping to the web domain. This mapping also routes the sign-in API and `/ws` through Discord's proxy. Sign-in uses the Embedded App SDK, no third-party cookie is needed.

## Environment variables

Bot (`apps/bot/.env`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `DISCORD_BOT_TOKEN` | required | Bot token. |
| `OPENROUTER_API_KEY` | required | OpenRouter key; `OPENROUTER_MODELS` lists preferred free models. |
| `POSTGRESQL_URL` | required | Database. |
| `DISCORD_GUILD_ID`, `DISCORD_AGENTS_CATEGORY_ID` | « Le Royaume » | Allowed servers and their AGENTS categories, comma-separated. |
| `DISCORD_VOICE_CATEGORY_ID` | « Le Royaume » audio category | Where hearing voice channels are created, one per server. Empty opens trials at once, without voice. |
| `PIPER_URL`, `PIPER_SPEAKER` | `http://localhost:5000`, `8582` | Judge voice. Empty speaker for a single-speaker voice. |
| `WHISPER_URL` | `http://localhost:8080` | Transcription service. |
| `ROOM_PORT`, `WEB_INTERNAL_URL` | `3001`, `http://localhost:3000` | Courtroom WebSocket, and where the bot checks sessions. |

Web (`apps/web/.env`): `POSTGRESQL_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`.

## Run locally

```bash
cp apps/bot/.env.example apps/bot/.env   # then fill in the values
cp apps/web/.env.example apps/web/.env   # then fill in the values
docker compose -f docker-compose.dev.yml up -d   # Postgres
pnpm install
pnpm --filter @tribunal/web run db:migrate   # BetterAuth tables (the bot migrates its own tables at startup)
pnpm --filter @tribunal/bot run dev
pnpm --filter @tribunal/web run dev
```

The voice services are optional locally (the trial goes on without them):

```bash
docker build -f docker/piper.Dockerfile -t tribunal-tts docker && docker run -p 5000:5000 tribunal-tts
docker build -f docker/whisper.Dockerfile -t tribunal-stt docker && docker run -p 8080:8080 tribunal-stt
```

Checks: `pnpm run ts:check`, `pnpm run lint:fix`.

## Deploy

Deployed with [Coolify](https://coolify.io) from `docker-compose.yml` (branch `stable`):

1. DNS: an `A` record (and `AAAA` for IPv6) for the domain, pointing to the VPS.
2. Coolify: new resource from this repository, Docker Compose build pack.
3. Domains: `web` on port 3000, `bot` on the same domain with the `/ws` path, port 3001. Sharing the domain lets the session reach the bot.
4. Variables: Coolify asks for each required one (`SERVICE_PASSWORD_64_POSTGRES` is generated). Optional: `PIPER_VOICE` (another Piper voice), `WHISPER_MODEL` (`base` by default, `small` is more accurate but slower on a CPU). Changing either needs a rebuild of its service.
5. Deploy.

## Credits

Base structure from [Bluzzi/discord-agent](https://github.com/Bluzzi/discord-agent).
