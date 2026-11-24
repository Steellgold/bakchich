import { discordClientStart } from "#/integrations/discord";
import { logger } from "#/utils/logger";
import { migratePostgres } from "#/utils/postgres";

// Uncaught exception handler:
process.on("uncaughtException", (error, origin) => {
  logger.error(`Process Exception: ${origin}`, error.stack);
  process.exit(1);
});

// Start services and related triggers:
await migratePostgres();

await discordClientStart(async () => {
  await import("#/features/commands/message-create.djs-event");
  await import("#/features/commands/interaction-create.djs-event");
  await import("#/features/court/court-events");
  await import("#/features/hearings/hearings");
  await import("#/features/room/room-server");
  await import("#/features/penalties/penalty-watcher");
  await import("#/features/penalties/exclude-command");
  await import("#/features/profiles/profile-watcher");
  await import("#/features/profiles/profile-command");
});
