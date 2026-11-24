import type { Style } from "#/features/court/engine";
import type { HearingRequest } from "#/features/hearings/hearing-request";
import type { Message, MessageReplyOptions } from "discord.js";
import { CLERK, fetchDossier, fetchTranscript, formatCaseFile, formatDossier, formatTranscript, searchArchives } from "#/features/clerk/clerk";
import { parseCommand } from "#/features/court/command";
import { court, judge } from "#/features/court/court";
import { MAX_CRIME_LENGTH, normalizeCrime, sideOf } from "#/features/court/engine";
import { upsertMember } from "#/features/court/members";
import { fetchRecord } from "#/features/court/record";
import { requestHearing } from "#/features/hearings/hearing-request";
import { collectContext, forceStartAnswers, forceStartHearing } from "#/features/hearings/hearings";
import { AGENTS_CATEGORY_IDS, COLOR, conversation, discordClient, embedOf, findDiscordGuildMember, getCategoryId, sanitizeDiscordMessage, startDiscordTyping } from "#/integrations/discord";
import { logger } from "#/utils/logger";
import { trigger } from "#/utils/trigger";

const REASON_WAIT_MS = 60_000;
const CONTEXT_LENGTH = 300;
/** A member waits this long between two requests that need the AI: the free quota is shared by the whole server */
const AI_COOLDOWN_MS = 20_000;

/** When each member last asked something that needed the AI */
const lastAiRequest = new Map<string, number>();

// Game notices: an embed that can only ping the author, never @everyone, @here or roles.
const reply = async (message: Message, text: string, color?: number, components?: MessageReplyOptions["components"]) => message.reply({
  embeds: [embedOf(text, color)],
  allowedMentions: {
    parse: [],
    repliedUser: true,
  },
  components,
});

// The judge or the clerk talking: plain text, same mention rules.
const talk = async (message: Message, text: string) => message.reply({
  content: sanitizeDiscordMessage(text),
  allowedMentions: {
    parse: [],
    repliedUser: true,
  },
});

const authorName = (message: Message) => message.member?.displayName ?? message.author.username;

/** A hearing requested by mentioning the bot: answered by replies to the message */
const requestOf = (message: Message<true>, style: Style): HearingRequest => ({
  channel: message.channel,
  guild: message.guild,
  plaintiff: {
    id: message.author.id,
    name: authorName(message),
  },
  style,
  reply: async (text, color, components) => reply(message, text, color, components),
});

/** Message text for the AI: without the bot mention, other mentions written « @Name [id:123] » so it knows who is who */
const readableContent = (message: Message<true>, botId: string) => message.content
  .replaceAll(`<@${botId}>`, "")
  .replace(
    /<@!?(\d+)>/gu,
    (_mention, id: string) => `@${message.mentions.members.get(id)?.displayName ?? message.mentions.users.get(id)?.displayName ?? "?"} [id:${id}]`,
  )
  .trim();

/** Members a natural request is about: the mentioned members, plus the author of the message replied to, and that message as context */
const resolveAccused = async (message: Message<true>, botId: string): Promise<{
  ids: string[];
  repliedId: string | null;
  context: string | null;
}> => {
  const ids = new Set([...message.mentions.users.values()].filter((user) => user.id !== botId && user.id !== message.author.id).map((user) => user.id));

  if (message.reference?.messageId === undefined) return {
    ids: [...ids],
    repliedId: null,
    context: null,
  };

  const referenced = await message.fetchReference();

  const repliedId = referenced.author.id !== botId && referenced.author.id !== message.author.id ? referenced.author.id : null;
  if (repliedId !== null) ids.add(repliedId);
  const line = `${referenced.member?.displayName ?? referenced.author.username} : ${conversation.sanitizeContent(referenced.content)}`;
  return {
    ids: [...ids],
    repliedId,
    context: line.slice(0, CONTEXT_LENGTH),
  };
};

/** Ask the author why, and wait for their answer: null when it never comes or is not a valid accusation */
const askReason = async (message: Message<true>): Promise<string | null> => {
  await reply(message, `Pour quel motif ? Réponds ici en moins de ${String(MAX_CRIME_LENGTH)} caractères, tu as ${String(REASON_WAIT_MS / 1000)} secondes.`);
  const answers = await message.channel.awaitMessages({
    filter: (answer) => answer.author.id === message.author.id,
    max: 1,
    time: REASON_WAIT_MS,
  });

  const answer = answers.first();
  return answer === undefined ? null : normalizeCrime(answer.content);
};

/** The prosecution and the defense call a member to the witness stand during the witnesses phase, or send the witness back */
const handleWitness = async (message: Message<true>, kind: "call-witness" | "dismiss-witness", botId: string) => {
  const trial = court.get(message.channelId);

  if (trial === undefined) {
    await reply(message, "Aucun procès n'est en cours dans ce salon.", COLOR.refusal);
    return;
  }

  const side = sideOf(trial, message.author.id);

  if (side === null) {
    await reply(message, "Seuls l'accusation et la défense appellent les témoins.", COLOR.refusal);
    return;
  }

  if (kind === "dismiss-witness") {
    court.dismissWitness(message.channelId);
    return;
  }

  const [witnessId] = (await resolveAccused(message, botId)).ids;
  const parties = [trial.plaintiff.id, ...trial.accused.map((member) => member.id), ...(trial.lawyer === null ? [] : [trial.lawyer.id])];

  if (witnessId === undefined || parties.includes(witnessId)) {
    await reply(message, "Quel témoin ? Mentionne un membre qui n'est ni accusé, ni plaignant, ni avocat.", COLOR.refusal);
    return;
  }

  const witness = await findDiscordGuildMember(message.guild, witnessId);

  if (witness === null || witness.user.bot) {
    await reply(message, "Ce témoin est introuvable au Royaume.", COLOR.refusal);
    return;
  }

  // The judge announces the witness out loud and in the courtroom (court events):
  const answers = {
    "ok": null,
    "busy": "Un témoin est déjà à la barre. Patience.",
    "closed": "Ce n'est pas le moment des témoins.",
    "no-trial": "Le procès est terminé.",
  } as const;
  const answer
    = answers[
      court.callWitness(
        message.channelId,
        {
          id: witness.id,
          name: witness.displayName,
        },
        side,
      )
    ];
  if (answer !== null) await reply(message, answer, COLOR.refusal);
};

const showRecord = async (message: Message<true>, targetId: string) => {
  const target = await findDiscordGuildMember(message.guild, targetId);

  const [entries, dossier] = await Promise.all([
    fetchRecord(targetId),
    fetchDossier(targetId),
  ]);
  await talk(message, await judge.record(target?.displayName ?? "Cet individu", entries, formatDossier(dossier)));
};

/** The clerk recalls the hearing in progress, from what he typed: in the channel and as a bubble in the courtroom */
const recap = async (message: Message<true>) => {
  const trial = court.get(message.channelId);

  if (trial === undefined) {
    await reply(message, "Aucun procès n'est en cours dans ce salon. Le greffier fait sa pause.", COLOR.refusal);
    return;
  }

  const text = await judge.recap(trial, formatTranscript(await fetchTranscript(trial.id)));
  await talk(message, `**${CLERK.name}** : ${text}`);
  court.say(message.channelId, CLERK.id, text);
};

/** The clerk searches the archives (full text, and the members mentioned) and answers from the case files found */
const recall = async (message: Message<true>, query: string, botId: string, content: string) => {
  const { ids } = await resolveAccused(message, botId);

  const files = await searchArchives(query === "" ? content : query, ids);
  await talk(message, `**${CLERK.name}** : ${await judge.recall(content, files.map(formatCaseFile))}`);
};

/** A mention of the bot in the AGENTS category: a command, or a plain request the AI reads */
const answerMention = async (message: Message<true>, botId: string, command: ReturnType<typeof parseCommand>, stopTyping: () => void) => {
  if (command?.kind === "trial") {
    await requestHearing(requestOf(message, "american"), command.accusedIds, command.crime, botId, null);
    return;
  }
  if (command?.kind === "record") {
    await showRecord(message, command.targetId);
    return;
  }

  // Not a known command: the AI tells what the author wants, the code checks and acts.
  const content = readableContent(message, botId);
  const intent = await judge.interpret(content);

  if (intent.kind === "open-trial") {
    const { ids, repliedId, context } = await resolveAccused(message, botId);
    // Among the members the message is about, the AI tells who is accused (not the victim); without an answer, the replied author, else everyone mentioned.
    const named = ids.filter((id) => intent.accused.includes(id));

    const accusedIds = named.length > 0 ? named : repliedId === null ? ids : [repliedId];

    if (accusedIds.length === 0) {
      await reply(message, "Qui faut-il juger ? Mentionne l'accusé ou réponds à son message.", COLOR.refusal);
      return;
    }

    // No typing indicator while the court waits for the author:
    if (intent.crime === null) stopTyping();
    const crime = intent.crime ?? (await askReason(message));

    if (crime === null) {
      await reply(message, "Audience annulée, faute de motif.", COLOR.refusal);
      return;
    }

    await requestHearing(requestOf(message, intent.style ?? "american"), accusedIds, crime, botId, context);
    return;
  }
  if (intent.kind === "start-now") {
    const result = forceStartHearing(message.channelId, message.author.id);
    if (result !== "started") await reply(message, forceStartAnswers[result], COLOR.refusal);
    return;
  }
  if (intent.kind === "call-witness" || intent.kind === "dismiss-witness") {
    await handleWitness(message, intent.kind, botId);
    return;
  }
  if (intent.kind === "recap") {
    await recap(message);
    return;
  }
  if (intent.kind === "recall") {
    await recall(message, intent.query, botId, content);
    return;
  }
  if (intent.kind === "show-record") {
    const [targetId] = (await resolveAccused(message, botId)).ids;

    if (targetId === undefined) {
      await reply(message, "Le casier de qui ? Mentionne le membre ou réponds à son message.", COLOR.refusal);
      return;
    }

    await showRecord(message, targetId);
    return;
  }

  await talk(message, await judge.chat(authorName(message), content));
};

trigger.discordEvent("messageCreate", async (message) => {
  if (message.author.bot || !message.inGuild()) return;

  const botUser = discordClient.user;

  if (botUser === null) return;

  const mentioned = message.mentions.has(botUser, {
    ignoreEveryone: true,
    ignoreRoles: true,
    ignoreRepliedUser: true,
  });

  // Outside the AGENTS category, the bot only answers explicit mentions:
  if (!AGENTS_CATEGORY_IDS.includes(getCategoryId(message.channel) ?? "")) {
    if (mentioned) await reply(message, "Le Tribunal ne siège que dans la catégorie AGENTS.", COLOR.refusal);
    return;
  }

  // Trials are pleaded out loud in the voice channel: written messages only matter when they talk to the bot.
  if (!mentioned) {
    collectContext(message.channelId, message.author.id, message.content);
    return;
  }

  const command = parseCommand(message.content, botUser.id);
  logger.info(`Command from ${message.author.username} in ${message.channelId}: ${command?.kind ?? "chat"}`);
  await upsertMember({
    id: message.author.id,
    name: authorName(message),
    avatarUrl: message.author.displayAvatarURL({
      extension: "png",
      size: 128,
    }),
  });

  if (command?.kind === "invalid-crime") {
    await reply(message, `Motif invalide : entre 1 et ${String(MAX_CRIME_LENGTH)} caractères.`, COLOR.refusal);
    return;
  }

  // Everything below asks the AI at least once:
  const now = Date.now();
  const waitMs = (lastAiRequest.get(message.author.id) ?? 0) + AI_COOLDOWN_MS - now;

  if (waitMs > 0) {
    await reply(message, `La cour est débordée. Reviens dans ${String(Math.ceil(waitMs / 1000))} secondes.`, COLOR.refusal);
    return;
  }

  lastAiRequest.set(message.author.id, now);

  const stopTyping = startDiscordTyping(message.channel, () => logger.warn("Could not send the typing indicator"));
  await answerMention(message, botUser.id, command, stopTyping).finally(stopTyping);
});
