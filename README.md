# Tribunal

Discord bot for the « Le Royaume » server: members drag each other in front of a corrupt AI judge for absurd crimes. The room debates and votes, the judge delivers the verdict, and every conviction ends up in a permanent criminal record.

Trials only run inside the AGENTS category. Everything shown on Discord is in French.

## Commands

- `@Tribunal procès @member pour <crime>`: opens a trial (5 min of debate, 2 min of voting).
- `@Tribunal casier @member`: shows the member's criminal record.

## Run locally

```bash
cp apps/bot/.env.example apps/bot/.env   # then fill in the values
docker compose up -d   # Postgres
pnpm install
pnpm --filter @tribunal/bot run dev
```

Checks: `pnpm run ts:check`, `pnpm run lint:fix`, `pnpm run test`.

## Credits

Base structure from [Bluzzi/discord-agent](https://github.com/Bluzzi/discord-agent).
