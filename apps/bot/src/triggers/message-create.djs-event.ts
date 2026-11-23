import type { Message } from "discord.js";
import { parseCommand } from "#/court/command";
import { court, judge } from "#/court/court";
import { EMOJI } from "#/court/emojis";
import { formatNames, MAX_ACCUSED, MAX_CRIME_LENGTH, normalizeCrime } from "#/court/engine";
import { countActiveMembers, hearingDelayMs } from "#/court/hearing";
import { saveHearing } from "#/court/hearings";
import { upsertMember } from "#/court/members";
import { fetchRecord } from "#/court/record";
import { AGENTS_CATEGORY_ID, conversation, createHearingEvent, discordClient, fetchRecentHumanMessages, findDiscordGuildMember, getCategoryId, sanitizeDiscordMessage, startDiscordTyping } from "#/integrations/discord";
import { hasPendingHearing, scheduleHearing } from "#/triggers/hearings";
import { env } from "#/utils/env";
import { logger } from "#/utils/logger";
import { trigger } from "#/utils/trigger";

const CONTEXT_MESSAGES = 10;
const LAWYER_LOOKUP_MESSAGES = 100;
const REASON_WAIT_MS = 60_000;
const CONTEXT_LENGTH = 300;

// Replies that can only ping the author, never @everyone, @here or roles:
const reply = async (message: Message, content: string) => message.reply({
  content: sanitizeDiscordMessage(content),
  allowedMentions: { parse: [], repliedUser: true },
});

const authorName = (message: Message) => message.member?.displayName ?? message.author.username;

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

/** Check the accusation, then announce the hearing: its time comes from the active members, and the Discord event announces it */
const openHearing = async (message: Message<true>, accusedIds: string[], crime: string, botId: string, context: string | null) => {
  if (court.get(message.channelId) !== undefined || hasPendingHearing(message.channelId)) {
    await reply(message, `${EMOJI.hourglass} La cour est occupée, revenez plus tard.`);
    return;
  }

  if (accusedIds.length > MAX_ACCUSED) {
    await reply(message, `${EMOJI.courthouse} La cour ne juge pas plus de ${String(MAX_ACCUSED)} individus à la fois.`);
    return;
  }

  const found = await Promise.all(accusedIds.map(async (id) => findDiscordGuildMember(message.guild, id)));
  const accused = found.filter((member) => member !== null);
  if (accused.length !== found.length) {
    await reply(message, `${EMOJI.documentSearch} ${accused.length === 0 ? "Cet individu est inconnu" : "Un de ces individus est inconnu"} du Royaume.`);
    return;
  }
  if (accused.some((member) => member.user.bot && member.id !== botId)) {
    await reply(message, `${EMOJI.courthouse} La cour ne juge pas les machines. Sauf elle-même.`);
    return;
  }

  const names = formatNames(accused.map((member) => member.displayName));
  const recent = await fetchRecentHumanMessages(message.channel, LAWYER_LOOKUP_MESSAGES);
  const screening = await judge.screen(crime, names, [...(context === null ? [] : [context]), ...recent.lines.slice(-CONTEXT_MESSAGES)]);
  if (!screening.ok) {
    await reply(message, `${EMOJI.alertShield} ${screening.reply}`);
    return;
  }

  // Without a hearings voice channel, the trial opens at once and no event is created:
  const delay = env.DISCORD_TRIAL_VOICE_CHANNEL_ID === "" ? 0 : hearingDelayMs(countActiveMembers(recent.authors, Date.now()));
  const startsAt = new Date(Date.now() + delay);
  const event = await createHearingEvent(message.guild, { name: `Procès de ${names}`, description: context === null ? crime : `${crime}\n\n${context}`, startsAt });

  const hearing = await saveHearing({
    channelId: message.channelId,
    accused: accused.map((member) => ({ id: member.id, name: member.displayName })),
    plaintiffId: message.author.id,
    plaintiffName: authorName(message),
    crime,
    context,
    startsAt,
    eventId: event?.id ?? null,
  });
  scheduleHearing(hearing);

  if (delay > 0) await reply(message, `${EMOJI.courthouse} Procès de ${names} pour « ${crime} » : l'audience s'ouvre <t:${String(Math.round(startsAt.getTime() / 1000))}:R>.${event === null ? "" : ` Rendez-vous sur l'événement : ${event.url}`}`);
};

// Channels with a request being checked: the checks take several seconds, two requests must not both pass them.
const requesting = new Set<string>();

const requestHearing = async (message: Message<true>, accusedIds: string[], crime: string, botId: string, context: string | null) => {
  if (requesting.has(message.channelId)) {
    await reply(message, `${EMOJI.hourglass} La cour est occupée, revenez plus tard.`);
    return;
  }

  requesting.add(message.channelId);
  await openHearing(message, accusedIds, crime, botId, context).finally(() => requesting.delete(message.channelId));
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
  if (getCategoryId(message.channel) !== AGENTS_CATEGORY_ID) {
    if (mentioned) await reply(message, `${EMOJI.courthouse} Le Tribunal ne siège que dans la catégorie AGENTS.`);
    return;
  }

  // Every human line of a trial channel is relayed to the courtroom:
  court.say(message.channelId, message.author.id, message.content);

  // Plain messages are pleas during a debate, and the judge intervenes from time to time:
  if (!mentioned) {
    const trial = court.get(message.channelId);
    if (trial === undefined || !court.plea(message.channelId)) return;

    const stopTyping = startDiscordTyping(message.channel, () => logger.warn("Could not send the typing indicator"));
    const recent = await fetchRecentHumanMessages(message.channel, CONTEXT_MESSAGES);
    const intervention = await judge.intervene(trial, recent.lines).finally(stopTyping);
    await message.channel.send({ content: sanitizeDiscordMessage(`${EMOJI.judge} ${intervention}`), allowedMentions: { parse: [] } });
    court.say(message.channelId, null, intervention);
    return;
  }

  const command = parseCommand(message.content, botUser.id);
  logger.info(`Command from ${message.author.username} in ${message.channelId}: ${command?.kind ?? "chat"}`);
  await upsertMember({ id: message.author.id, name: authorName(message), avatarUrl: message.author.displayAvatarURL({ extension: "png", size: 128 }) });

  if (command?.kind === "trial") {
    const stopTyping = startDiscordTyping(message.channel, () => logger.warn("Could not send the typing indicator"));
    await requestHearing(message, command.accusedIds, command.crime, botUser.id, null).finally(stopTyping);
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
    await requestHearing(message, ids, crime, botUser.id, context).finally(stopRequestTyping);
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
