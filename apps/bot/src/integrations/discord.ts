import type { Channel, ContainerBuilder, Guild, GuildMember, Message, MessageCreateOptions, SendableChannels } from "discord.js";
import { env } from "#/utils/env";
import { logger } from "#/utils/logger";
import { ActivityType, ApplicationCommandType, ChannelType, Client, DiscordAPIError, EmbedBuilder, GatewayIntentBits, GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel, GuildScheduledEventStatus, MessageFlags, Partials, RESTJSONErrorCodes } from "discord.js";

export const DISCORD_MAX_MESSAGE_LENGTH = 2000;

/** Discord categories where the bot may act freely (see AGENTS.md rules), the Royaume one unless configured otherwise */
export const AGENTS_CATEGORY_IDS = env.DISCORD_AGENTS_CATEGORY_ID;

/** The guilds allowed in the courtroom: « Le Royaume » unless configured otherwise */
export const GUILD_IDS = env.DISCORD_GUILD_ID;

/** The configured audio category that belongs to this guild, null when it has none */
const voiceCategoryOf = (guild: Guild): string | null => env.DISCORD_VOICE_CATEGORY_ID.find((id) => guild.channels.cache.has(id)) ?? null;

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
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
  partials: [
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
export const findDiscordGuildMember = async (guild: Guild, userId: string, options: { force?: boolean } = {}): Promise<GuildMember | null> => {
  try {
    return await guild.members.fetch({ user: userId, force: options.force === true });
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

/** Side colors of the bot messages, from the website palette: gold for the court, red for refusals and convictions, green for acquittals */
export const COLOR = { court: 0xDC9E28, refusal: 0xCF3934, acquittal: 0x45A02A } as const;

/** A plain bot message: an embed with only a description, the date and a color */
export const embedOf = (text: string, color: number = COLOR.court) => new EmbedBuilder().setDescription(sanitizeDiscordMessage(text)).setColor(color).setTimestamp();

/** Send a plain bot message, which never pings anyone */
export const sendSafeMessage = async (channel: SendableChannels, text: string, color?: number, components?: MessageCreateOptions["components"]): Promise<Message> => channel.send({
  embeds: [embedOf(text, color)],
  allowedMentions: { parse: [] },
  components,
});

/** Send a rich message laid out with Components V2 (such a message has no text content and no embed), which never pings anyone */
export const sendPanel = async (channel: SendableChannels, panel: ContainerBuilder): Promise<Message> => channel.send({
  components: [panel],
  flags: MessageFlags.IsComponentsV2,
  allowedMentions: { parse: [] },
});

/** Scheduled event of a hearing in its voice channel, null when Discord refuses (the hearing then goes on without an event) */
const createHearingEvent = async (guild: Guild, channelId: string, input: { name: string; description: string; startsAt: Date }): Promise<{ id: string; url: string } | null> => {
  try {
    const event = await guild.scheduledEvents.create({
      name: sanitizeDiscordMessage(input.name).slice(0, 100),
      description: sanitizeDiscordMessage(input.description).slice(0, 1000),
      scheduledStartTime: input.startsAt,
      privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
      entityType: GuildScheduledEventEntityType.Voice,
      channel: channelId,
    });
    return { id: event.id, url: event.url };
  }
  catch (error) {
    logger.warn(`Could not create the hearing event: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
};

/** Voice channel and event of a hearing, created in the guild's audio category. Null when the guild has no category or the channel cannot be created: the hearing then opens at once without them. */
export const createHearingRoom = async (guild: Guild, input: { name: string; description: string; startsAt: Date }): Promise<{ channelId: string; eventId: string | null; eventUrl: string | null } | null> => {
  const parent = voiceCategoryOf(guild);
  if (parent === null) return null;

  try {
    const channel = await guild.channels.create({
      name: sanitizeDiscordMessage(input.name).slice(0, 100),
      type: ChannelType.GuildVoice,
      parent,
      reason: "Tribunal hearing",
    });
    const event = await createHearingEvent(guild, channel.id, input);
    return { channelId: channel.id, eventId: event?.id ?? null, eventUrl: event?.url ?? null };
  }
  catch (error) {
    logger.warn(`Could not create the hearing voice channel: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
};

/** Private-style voice room where the accused prepare their defense, limited to them and their lawyer. Null without audio category or when Discord refuses. */
export const createPreparationRoom = async (guild: Guild, input: { name: string; places: number }): Promise<string | null> => {
  const parent = voiceCategoryOf(guild);
  if (parent === null) return null;

  try {
    const channel = await guild.channels.create({
      name: sanitizeDiscordMessage(input.name).slice(0, 100),
      type: ChannelType.GuildVoice,
      parent,
      userLimit: input.places,
      reason: "Tribunal defense preparation",
    });
    return channel.id;
  }
  catch (error) {
    logger.warn(`Could not create the preparation room: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
};

/** Register a message command (right click on a message, Applications) in each allowed guild; creating it again with the same name updates it. Best effort, logged. */
export const registerMessageCommand = async (name: string): Promise<void> => {
  for (const guildId of GUILD_IDS) {
    try {
      const guild = await discordClient.guilds.fetch(guildId);
      await guild.commands.create({ name, type: ApplicationCommandType.Message });
    }
    catch (error) {
      logger.warn(`Could not register the "${name}" command in guild ${guildId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
};

/** Best effort: only called with channels the bot created for a hearing */
export const deleteHearingChannel = async (guild: Guild, channelId: string): Promise<void> => {
  try {
    await guild.channels.delete(channelId, "Tribunal hearing over");
  }
  catch (error) {
    logger.warn(`Could not delete the hearing channel ${channelId}: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/** Best effort: a failure is logged and never blocks the trial */
export const setHearingEventStatus = async (guild: Guild, eventId: string, status: "active" | "completed" | "canceled"): Promise<void> => {
  try {
    if (status === "active") await guild.scheduledEvents.edit(eventId, { status: GuildScheduledEventStatus.Active });
    else if (status === "completed") await guild.scheduledEvents.edit(eventId, { status: GuildScheduledEventStatus.Completed });
    else await guild.scheduledEvents.edit(eventId, { status: GuildScheduledEventStatus.Canceled });
  }
  catch (error) {
    logger.warn(`Could not set the hearing event ${eventId} to ${status}: ${error instanceof Error ? error.message : String(error)}`);
  }
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
