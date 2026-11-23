import type { Member } from "#/court/engine";
import type { Message } from "discord.js";
import { parseCommand } from "#/court/command";
import { court, judge } from "#/court/court";
import { EMOJI } from "#/court/emojis";
import { formatNames, MAX_ACCUSED, pickLawyer } from "#/court/engine";
import { upsertMember } from "#/court/members";
import { fetchRecord } from "#/court/record";
import { AGENTS_CATEGORY_ID, discordClient, fetchRecentHumanMessages, findDiscordGuildMember, getCategoryId, sanitizeDiscordMessage, startDiscordTyping } from "#/integrations/discord";
import { logger } from "#/utils/logger";
import { trigger } from "#/utils/trigger";

const CONTEXT_MESSAGES = 10;
const LAWYER_LOOKUP_MESSAGES = 100;
const LAWYER_WINDOW_MS = 30 * 60_000;

// Replies that can only ping the author, never @everyone, @here or roles:
const reply = async (message: Message, content: string) => message.reply({
  content: sanitizeDiscordMessage(content),
  allowedMentions: { parse: [], repliedUser: true },
});

const authorName = (message: Message) => message.member?.displayName ?? message.author.username;

const openTrial = async (message: Message<true>, accusedIds: string[], crime: string, botId: string) => {
  if (court.get(message.channelId) !== undefined) {
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

  const recent = await fetchRecentHumanMessages(message.channel, LAWYER_LOOKUP_MESSAGES);
  const screening = await judge.screen(crime, formatNames(accused.map((member) => member.displayName)), recent.lines.slice(-CONTEXT_MESSAGES));
  if (!screening.ok) {
    await reply(message, `${EMOJI.alertShield} ${screening.reply}`);
    return;
  }

  const plaintiff: Member = { id: message.author.id, name: authorName(message) };
  const candidates = recent.authors.filter((author) => author.createdTimestamp > Date.now() - LAWYER_WINDOW_MS);
  const lawyer = pickLawyer(candidates, [...accused.map((member) => member.id), plaintiff.id, botId], Math.random);

  const trial = court.open({ channelId: message.channelId, accused: accused.map((member) => ({ id: member.id, name: member.displayName })), plaintiff, lawyer, crime });
  if (trial === "busy") {
    await reply(message, `${EMOJI.hourglass} La cour est occupée, revenez plus tard.`);
    return;
  }

  await Promise.all(accused.map(async (member) => upsertMember({ id: member.id, name: member.displayName, avatarUrl: member.displayAvatarURL({ extension: "png", size: 128 }) })));
  if (lawyer !== null) await upsertMember({ ...lawyer, avatarUrl: null });
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
    await openTrial(message, command.accusedIds, command.crime, botUser.id).finally(stopTyping);
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

  const stopTyping = startDiscordTyping(message.channel, () => logger.warn("Could not send the typing indicator"));
  const answer = await judge.chat(authorName(message), message.content.replaceAll(`<@${botUser.id}>`, "").trim()).finally(stopTyping);
  await reply(message, answer);
});
