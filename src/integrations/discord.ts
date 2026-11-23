import type { Channel, SendableChannels } from "discord.js";
import { env } from "#/utils/env";
import { logger } from "#/utils/logger";
import { ActivityType, Client, GatewayIntentBits, Partials } from "discord.js";

export const DISCORD_MAX_MESSAGE_LENGTH = 2000;

/** Discord category where the bot may act freely (see AGENTS.md rules) */
export const AGENTS_CATEGORY_ID = "1574094410830844105";

// Neutralizes mass-ping mentions into inert text so the bot can never ping everyone in a guild channel (low-level helper shared by the send tools):
export const sanitizeDiscordMessage = (text: string): string => text.replace(/@(everyone|here)/giu, "@{$1}").slice(0, DISCORD_MAX_MESSAGE_LENGTH);

export const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
  ],
});

/** Category ID of a guild channel (the parent channel's category for a thread), null outside guild channels */
export const getCategoryId = (channel: Channel): string | null => {
  if (channel.isDMBased()) return null;
  if (channel.isThread()) return channel.parent?.parentId ?? null;
  return channel.parentId;
};

export const startDiscordTyping = (channel: SendableChannels, onError: () => void) => {
  const sendTyping = async () => {
    try {
      await channel.sendTyping();
    }
    catch {
      onError();
    }
  };

  void sendTyping();
  const timer = setInterval(() => {
    void sendTyping();
  }, 8_000).unref();
  return () => {
    clearInterval(timer);
  };
};

export const discordClientStart = async (loadEvents: () => Promise<void>) => {
  discordClient.once("clientReady", (readyClient) => {
    readyClient.user.setPresence({
      activities: [{ name: "Custom Status", type: ActivityType.Custom, state: "⚖️ La cour est en session" }],
    });
    logger.info(`Discord bot successfully started!! Logged in as ${readyClient.user.tag}`);
  });

  await loadEvents();

  await discordClient.login(env.DISCORD_BOT_TOKEN);
};

// Conversation rendering helpers, used to present Discord messages to AIs:

// Matches lines imitating the system prefix "[Label (ID 123456789)] :". Forged prefixes found inside
// message contents are neutralized at render time with fullwidth brackets, so the exact system format
// stays unforgeable and the model can tell them apart:
const forgedPrefixPattern = /^\[[^\]\n]{0,80}\(ID[^\]\n]{0,80}\)\]\s*:?/gmu;

export const conversation = {
  /** Resolve an author display label from optional display names, down to the username fallback */
  resolveAuthorLabel: (displayName: string | null | undefined, globalName: string | null | undefined, username: string): string => displayName ?? globalName ?? username,

  /** Neutralize forged system prefixes inside message contents */
  sanitizeContent: (content: string): string => content.replace(forgedPrefixPattern, (match) => match.replaceAll("[", "［").replaceAll("]", "］")),
};
