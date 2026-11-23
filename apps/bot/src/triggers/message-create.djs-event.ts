import type { HearingRequest } from "#/triggers/hearings";
import type { Message, MessageReplyOptions } from "discord.js";
import { parseCommand } from "#/court/command";
import { court, judge } from "#/court/court";
import { EMOJI } from "#/court/emojis";
import { AI_LAWYER, MAX_CRIME_LENGTH, normalizeCrime } from "#/court/engine";
import { upsertMember } from "#/court/members";
import { fetchRecord } from "#/court/record";
import { AGENTS_CATEGORY_IDS, conversation, discordClient, findDiscordGuildMember, getCategoryId, sanitizeDiscordMessage, startDiscordTyping } from "#/integrations/discord";
import { collectContext, forceStartAnswers, forceStartHearing, judgeSays, requestHearing } from "#/triggers/hearings";
import { logger } from "#/utils/logger";
import { trigger } from "#/utils/trigger";

const REASON_WAIT_MS = 60_000;
const CONTEXT_LENGTH = 300;

// Replies that can only ping the author, never @everyone, @here or roles:
const reply = async (message: Message, content: string, components?: MessageReplyOptions["components"]) => message.reply({
  content: sanitizeDiscordMessage(content),
  allowedMentions: { parse: [], repliedUser: true },
  components,
});

const authorName = (message: Message) => message.member?.displayName ?? message.author.username;

/** A hearing requested by mentioning the bot: answered by replies to the message */
const requestOf = (message: Message<true>): HearingRequest => ({
  channel: message.channel,
  guild: message.guild,
  plaintiff: { id: message.author.id, name: authorName(message) },
  reply: async (content, components) => reply(message, content, components),
});

/** Accused of a natural request: the mentioned members, plus the author of the message replied to, and that message as context */
const resolveAccused = async (message: Message<true>, botId: string): Promise<{ ids: string[]; context: string | null }> => {
  const ids = new Set([...message.mentions.users.values()].filter((user) => user.id !== botId && user.id !== message.author.id).map((user) => user.id));
  if (message.reference?.messageId === undefined) return { ids: [...ids], context: null };

  const referenced = await message.fetchReference();
  if (referenced.author.id !== botId && referenced.author.id !== message.author.id) ids.add(referenced.author.id);
  const line = `${referenced.member?.displayName ?? referenced.author.username} : ${conversation.sanitizeContent(referenced.content)}`;
  return { ids: [...ids], context: line.slice(0, CONTEXT_LENGTH) };
};

/** Ask the author why, and wait for their answer: null when it never comes or is not a valid accusation */
const askReason = async (message: Message<true>): Promise<string | null> => {
  await reply(message, `${EMOJI.documentSearch} Pour quel motif ? Réponds ici en moins de ${String(MAX_CRIME_LENGTH)} caractères, tu as ${String(REASON_WAIT_MS / 1000)} secondes.`);
  const answers = await message.channel.awaitMessages({ filter: (answer) => answer.author.id === message.author.id, max: 1, time: REASON_WAIT_MS });
  const answer = answers.first();
  return answer === undefined ? null : normalizeCrime(answer.content);
};

/** The prosecution and the defense call a member to the witness stand, or send the witness back */
const handleWitness = async (message: Message<true>, kind: "call-witness" | "dismiss-witness", botId: string) => {
  const trial = court.get(message.channelId);
  if (trial === undefined) {
    await reply(message, `${EMOJI.hourglass} Aucun procès n'est en cours dans ce salon.`);
    return;
  }

  // The accused defend themselves when they have no lawyer, or when the lawyer is the AI, who cannot call anyone:
  const counselIds = [trial.plaintiff.id, ...(trial.lawyer === null || trial.lawyer.id === AI_LAWYER.id ? trial.accused.map((member) => member.id) : [trial.lawyer.id])];
  if (!counselIds.includes(message.author.id)) {
    await reply(message, `${EMOJI.courthouse} Seuls l'accusation et la défense appellent les témoins.`);
    return;
  }

  if (kind === "dismiss-witness") {
    court.dismissWitness(message.channelId);
    await reply(message, `${EMOJI.gavel} Le témoin quitte la barre.`);
    return;
  }

  const [witnessId] = (await resolveAccused(message, botId)).ids;
  const parties = [trial.plaintiff.id, ...trial.accused.map((member) => member.id), ...(trial.lawyer === null ? [] : [trial.lawyer.id])];
  if (witnessId === undefined || parties.includes(witnessId)) {
    await reply(message, `${EMOJI.documentSearch} Quel témoin ? Mentionne un membre qui n'est ni accusé, ni plaignant, ni avocat.`);
    return;
  }

  const witness = await findDiscordGuildMember(message.guild, witnessId);
  if (witness === null || witness.user.bot) {
    await reply(message, `${EMOJI.documentSearch} Ce témoin est introuvable au Royaume.`);
    return;
  }

  const called = court.callWitness(message.channelId, { id: witness.id, name: witness.displayName });
  if (called !== "ok") {
    await reply(message, called === "closed" ? `${EMOJI.hourglass} Les débats sont clos, plus de témoin.` : `${EMOJI.hourglass} Le procès est terminé.`);
    return;
  }

  const announcement = `${witness.displayName} est appelé à la barre.`;
  await reply(message, `${EMOJI.gavel} ${announcement}`);
  judgeSays(message.channelId, announcement);
};

const showRecord = async (message: Message<true>, targetId: string) => {
  const target = await findDiscordGuildMember(message.guild, targetId);
  const entries = await fetchRecord(targetId);
  await reply(message, `${EMOJI.sealedScroll} ${await judge.record(target?.displayName ?? "Cet individu", entries)}`);
};

trigger.discordEvent("messageCreate", async (message) => {
  if (message.author.bot || !message.inGuild()) return;

  const botUser = discordClient.user;
  if (botUser === null) return;

  const mentioned = message.mentions.has(botUser, { ignoreEveryone: true, ignoreRoles: true, ignoreRepliedUser: true });

  // Outside the AGENTS category, the bot only answers explicit mentions:
  if (!AGENTS_CATEGORY_IDS.includes(getCategoryId(message.channel) ?? "")) {
    if (mentioned) await reply(message, `${EMOJI.courthouse} Le Tribunal ne siège que dans la catégorie AGENTS.`);
    return;
  }

  // Trials are pleaded out loud in the voice channel: written messages only matter when they talk to the bot.
  if (!mentioned) {
    collectContext(message.channelId, message.author.id, message.content);
    return;
  }

  const command = parseCommand(message.content, botUser.id);
  logger.info(`Command from ${message.author.username} in ${message.channelId}: ${command?.kind ?? "chat"}`);
  await upsertMember({ id: message.author.id, name: authorName(message), avatarUrl: message.author.displayAvatarURL({ extension: "png", size: 128 }) });

  if (command?.kind === "trial") {
    const stopTyping = startDiscordTyping(message.channel, () => logger.warn("Could not send the typing indicator"));
    await requestHearing(requestOf(message), command.accusedIds, command.crime, botUser.id, null).finally(stopTyping);
    return;
  }
  if (command?.kind === "record") {
    const stopTyping = startDiscordTyping(message.channel, () => logger.warn("Could not send the typing indicator"));
    await showRecord(message, command.targetId).finally(stopTyping);
    return;
  }
  if (command?.kind === "invalid-crime") {
    await reply(message, `${EMOJI.cross} Motif invalide : entre 1 et 200 caractères.`);
    return;
  }

  // Not a known command: the AI tells whether it is a plain request to open a trial, to show a record, or just chat.
  const content = message.content.replaceAll(`<@${botUser.id}>`, "").trim();
  const stopTyping = startDiscordTyping(message.channel, () => logger.warn("Could not send the typing indicator"));
  const intent = await judge.interpret(content).finally(stopTyping);

  if (intent.kind === "open-trial") {
    const { ids, context } = await resolveAccused(message, botUser.id);
    if (ids.length === 0) {
      await reply(message, `${EMOJI.documentSearch} Qui faut-il juger ? Mentionne l'accusé ou réponds à son message.`);
      return;
    }

    const crime = intent.crime ?? await askReason(message);
    if (crime === null) {
      await reply(message, `${EMOJI.cross} Audience annulée, faute de motif.`);
      return;
    }

    const stopRequestTyping = startDiscordTyping(message.channel, () => logger.warn("Could not send the typing indicator"));
    await requestHearing(requestOf(message), ids, crime, botUser.id, context).finally(stopRequestTyping);
    return;
  }
  if (intent.kind === "start-now") {
    const result = forceStartHearing(message.channelId, message.author.id);
    if (result !== "started") await reply(message, forceStartAnswers[result]);
    return;
  }
  if (intent.kind === "call-witness" || intent.kind === "dismiss-witness") {
    await handleWitness(message, intent.kind, botUser.id);
    return;
  }
  if (intent.kind === "show-record") {
    const [targetId] = (await resolveAccused(message, botUser.id)).ids;
    if (targetId === undefined) {
      await reply(message, `${EMOJI.documentSearch} Le casier de qui ? Mentionne le membre ou réponds à son message.`);
      return;
    }

    await showRecord(message, targetId);
    return;
  }

  const chatTyping = startDiscordTyping(message.channel, () => logger.warn("Could not send the typing indicator"));
  const answer = await judge.chat(authorName(message), content).finally(chatTyping);
  await reply(message, answer);
});
