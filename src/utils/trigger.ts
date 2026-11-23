import type { ClientEvents } from "discord.js";
import { discordClient } from "#/integrations/discord";
import { logger } from "#/utils/logger";

const discordEvent = <K extends keyof ClientEvents>(
  eventName: K,
  fn: (...args: ClientEvents[K]) => void | Promise<void>,
) => {
  discordClient.on(eventName, (...args) => {
    void (async () => {
      try {
        await fn(...args);
      }
      catch (error) {
        logger.error(
          `Discord \`${eventName}\` event error:`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    })();
  });
};

/** Wrap an async listener so one failure is logged and never crashes the process */
const safeListener = <A extends unknown[]>(label: string, fn: (...args: A) => Promise<void>) => (...args: A): void => {
  void (async () => {
    try {
      await fn(...args);
    }
    catch (error) {
      logger.error(`${label} error:`, error instanceof Error ? error.stack : String(error));
    }
  })();
};

export const trigger = { discordEvent, safeListener };
