import type { Member } from "#/court/engine";
import type { Message } from "discord.js";
import { parseCommand } from "#/court/command";
import { court, judge } from "#/court/court";
import { pickLawyer } from "#/court/engine";
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

const openTrial = async (message: Message<true>, accusedId: string, crime: string, botId: string) => {
  if (court.get(message.channelId) !== undefined) {
    await reply(message, "La cour est occupée, revenez plus tard.");
    return;
  }

  const accused = await findDiscordGuildMember(message.guild, accusedId);
  if (accused === null) {
    await reply(message, "Cet individu est inconnu du Royaume.");
    return;
  }
  if (accused.user.bot && accused.id !== botId) {
    await reply(message, "La cour ne juge pas les machines. Sauf elle-même.");
    return;
  }

  const recent = await fetchRecentHumanMessages(message.channel, LAWYER_LOOKUP_MESSAGES);
  const screening = await judge.screen(crime, accused.displayName, recent.lines.slice(-CONTEXT_MESSAGES));
  if (!screening.ok) {
    await reply(message, screening.reply);
    return;
  }

  const plaintiff: Member = { id: message.author.id, name: authorName(message) };
  const candidates = recent.authors.filter((author) => author.createdTimestamp > Date.now() - LAWYER_WINDOW_MS);
  const lawyer = pickLawyer(candidates, [accused.id, plaintiff.id, botId], Math.random);

  const trial = court.open({ channelId: message.channelId, accused: { id: accused.id, name: accused.displayName }, plaintiff, lawyer, crime });
  if (trial === "busy") await reply(message, "La cour est occupée, revenez plus tard.");
};

const showRecord = async (message: Message<true>, targetId: string) => {
  const target = await findDiscordGuildMember(message.guild, targetId);
  const entries = await fetchRecord(targetId);
  await reply(message, await judge.record(target?.displayName ?? "Cet individu", entries));
};

trigger.discordEvent("messageCreate", async (message) => {
  if (message.author.bot || !message.inGuild()) return;

  const botUser = discordClient.user;
  if (botUser === null) return;

  const mentioned = message.mentions.has(botUser, { ignoreEveryone: true, ignoreRoles: true, ignoreRepliedUser: true });

  // Outside the AGENTS category, the bot only answers explicit mentions:
  if (getCategoryId(message.channel) !== AGENTS_CATEGORY_ID) {
    if (mentioned) await reply(message, "Le Tribunal ne siège que dans la catégorie AGENTS.");
    return;
  }

  // Plain messages are pleas during a debate, and the judge intervenes from time to time:
  if (!mentioned) {
    const trial = court.get(message.channelId);
    if (trial === undefined || !court.plea(message.channelId)) return;

    const recent = await fetchRecentHumanMessages(message.channel, CONTEXT_MESSAGES);
    await message.channel.send({ content: sanitizeDiscordMessage(await judge.intervene(trial, recent.lines)), allowedMentions: { parse: [] } });
    return;
  }

  const command = parseCommand(message.content, botUser.id);
  logger.info(`Command from ${message.author.username} in ${message.channelId}: ${command?.kind ?? "chat"}`);

  if (command?.kind === "trial") {
    const stopTyping = startDiscordTyping(message.channel, () => logger.warn("Could not send the typing indicator"));
    await openTrial(message, command.accusedId, command.crime, botUser.id).finally(stopTyping);
    return;
  }
  if (command?.kind === "record") {
    await showRecord(message, command.targetId);
    return;
  }
  if (command?.kind === "invalid-crime") {
    await reply(message, "Motif invalide : entre 1 et 200 caractères.");
    return;
  }

  await reply(message, await judge.chat(authorName(message), message.content.replaceAll(`<@${botUser.id}>`, "").trim()));
});
