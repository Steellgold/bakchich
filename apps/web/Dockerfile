# Build context: repository root (see docker-compose.yml).
FROM node:24-alpine
WORKDIR /app

RUN npm install -g pnpm

# Workspace manifests first, for a cached dependency layer (the web app imports the bot sources):
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/bot/package.json apps/bot/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter "@tribunal/web..."

COPY apps/bot apps/bot
COPY apps/web apps/web

WORKDIR /app/apps/web

# Placeholders for the build only: real values come from the runtime environment.
RUN POSTGRESQL_URL=postgres://build:build@localhost:5432/build \
  DISCORD_CLIENT_ID=build DISCORD_CLIENT_SECRET=build \
  BETTER_AUTH_SECRET=build-only-secret-build-only-secret \
  BETTER_AUTH_URL=http://localhost:3000 ROOM_WS_URL=ws://localhost:3001/ws \
  pnpm run build

# Apply the BetterAuth migrations, then serve:
CMD ["sh", "-c", "pnpm run db:migrate && pnpm run start"]
