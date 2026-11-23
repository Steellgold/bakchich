# Build context: repository root (see docker-compose.yml).
FROM node:24-alpine
WORKDIR /app

RUN npm install -g pnpm

# Workspace manifests first, for a cached dependency layer:
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/bot/package.json apps/bot/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @tribunal/bot

COPY apps/bot apps/bot

WORKDIR /app/apps/bot
CMD ["pnpm", "run", "start"]
