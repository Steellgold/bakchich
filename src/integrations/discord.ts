import type { Channel, Guild, GuildMember, Message, MessageCreateOptions, SendableChannels } from "discord.js";
import { env } from "#/utils/env";
import { logger } from "#/utils/logger";
import { ActivityType, Client, DiscordAPIError, GatewayIntentBits, Partials, RESTJSONErrorCodes } from "discord.js";

export const DISCORD_MAX_MESSAGE_LENGTH = 2000;

/** Discord category where the bot may act freely (see AGENTS.md rules) */
export const AGENTS_CATEGORY_ID = "1574094410830844105";

// Neutralizes mass-ping mentions into inert text so the bot can never ping everyone in a guild channel (low-level helper shared by the send tools):
export const sanitizeDiscordMessage = (text: string): string => text.replace(/@(everyone|here)/giu, "@{$1}").slice(0, DISCORD_MAX_MESSAGE_LENGTH);

// Matches lines imitating the system prefix "[Label (ID 123456789)] :". Forged prefixes found inside
// message contents are neutralized at render time with fullwidth brackets, so the exact system format
// stays unforgeable and the model can tell them apart:
const forgedPrefixPattern = /^\[[^\]\n]{0,80}\(ID[^\]\n]{0,80}\)\]\s*:?/gmu;

// Conversation rendering helpers, used to present Discord messages to AIs:
export const conversation = {
  /** Neutralize forged system prefixes inside message contents */
  sanitizeContent: (content: string): string => content.replace(forgedPrefixPattern, (match) => match.replaceAll("[", "［").replaceAll("]", "］")),
};

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

/** Guild member, or null when the user is not (or no longer) in the guild */
export const findDiscordGuildMember = async (guild: Guild, userId: string): Promise<GuildMember | null> => {
  try {
    return await guild.members.fetch(userId);
  }
  catch (error) {
    if (error instanceof DiscordAPIError && (error.code === RESTJSONErrorCodes.UnknownMember || error.code === RESTJSONErrorCodes.UnknownUser)) return null;
    throw error;
  }
};

export const fetchDiscordSendableChannel = async (channelId: string): Promise<SendableChannels> => {
  const channel = await discordClient.channels.fetch(channelId);
  if (channel?.isSendable() !== true) throw new Error(`Channel ${channelId} does not support sending messages`);
  return channel;
};

export type RecentAuthor = { id: string; name: string; createdTimestamp: number };

/** Latest human messages of a channel, oldest first, with their sanitized "<name> : <content>" line */
export const fetchRecentHumanMessages = async (channel: SendableChannels, limit: number): Promise<{ lines: string[]; authors: RecentAuthor[] }> => {
  if (!("messages" in channel)) return { lines: [], authors: [] };

  const messages = [...(await channel.messages.fetch({ limit })).values()]
    .filter((message) => !message.author.bot)
    .reverse();

  return {
    lines: messages.map((message) => `${message.member?.displayName ?? message.author.username} : ${conversation.sanitizeContent(message.content)}`),
    authors: messages.map((message) => ({ id: message.author.id, name: message.member?.displayName ?? message.author.username, createdTimestamp: message.createdTimestamp })),
  };
};

/** Send a message that can only ping the given users, never @everyone, @here or roles */
export const sendSafeMessage = async (channel: SendableChannels, content: string, userIds: string[], components?: MessageCreateOptions["components"]): Promise<Message> => channel.send({
  content: sanitizeDiscordMessage(content),
  allowedMentions: { parse: [], users: userIds },
  components,
});

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
