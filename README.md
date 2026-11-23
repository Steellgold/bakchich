# Tribunal

Bot Discord du serveur « Le Royaume » : on traîne ses potes devant un juge corrompu (une IA) pour des crimes absurdes. La salle débat, vote, le juge rend son verdict et chaque condamnation finit au casier judiciaire.

Les procès ne se jouent que dans la catégorie AGENTS.

## Commandes

- `@Tribunal procès @membre pour <crime>` : ouvre un procès (5 min de débats, 2 min de vote).
- `@Tribunal casier @membre` : affiche le casier judiciaire.

## Lancer en local

```bash
cp .env.example .env   # puis remplir les valeurs
docker compose up -d   # Postgres
pnpm install
pnpm run dev
```

Vérifications : `pnpm run ts:check`, `pnpm run lint:fix`, `pnpm run test`.

## Crédits

Ossature reprise de [Bluzzi/discord-agent](https://github.com/Bluzzi/discord-agent).
