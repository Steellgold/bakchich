import type { Style } from "#/features/court/engine";
import type { HearingRequest } from "#/features/hearings/hearing-request";
import type { Message, MessageReplyOptions } from "discord.js";
import { CLERK, fetchDossier, fetchTranscript, formatCaseFile, formatDossier, formatTranscript, searchArchives } from "#/features/clerk/clerk";
import { historyOf, readableContent } from "#/features/commands/history";
import { answerFromSources, converse, DEPRESSION_JOKE, DOZING, HELPLINES } from "#/features/counsel/counsel";
import { formatRuling, saveRuling, searchRulings } from "#/features/counsel/rulings";
import { parseCommand } from "#/features/court/command";
import { court, judge } from "#/features/court/court";
import { MAX_CRIME_LENGTH, normalizeCrime, sideOf } from "#/features/court/engine";
import { upsertMember } from "#/features/court/members";
import { fetchRecord } from "#/features/court/record";
import { requestHearing } from "#/features/hearings/hearing-request";
import { collectContext, forceStartAnswers, forceStartHearing } from "#/features/hearings/hearings";
import { forgetMember, knownAbout, rememberMember } from "#/features/profiles/profiles";
import { AGENTS_CATEGORY_IDS, COLOR, conversation, discordClient, embedOf, findDiscordGuildMember, getCategoryId, GUILD_IDS, sanitizeDiscordMessage, startDiscordTyping } from "#/integrations/discord";
import { searchWeb } from "#/integrations/exa";
import { limitEmojis } from "#/utils/emojis";
import { logger } from "#/utils/logger";
import { trigger } from "#/utils/trigger";
import { MessageFlags, MessageType, TextDisplayBuilder } from "discord.js";

const REASON_WAIT_MS = 60_000;
const CONTEXT_LENGTH = 300;
/** A member waits this long between two requests that need the AI: the free quota is shared by the whole server */
const AI_COOLDOWN_MS = 20_000;
const TRIALS_ONLY_IN_AGENTS = "Les procès se tiennent dans la catégorie AGENTS.";

/** When each member last asked something that needed the AI */
const lastAiRequest = new Map<string, number>();
/** Members the court is waiting for (the reason of a trial), per channel: their answer is not a message to the judge */
const awaitedAnswers = new Set<string>();

// Game notices: an embed that can only ping the author, never @everyone, @here or roles.
const reply = async (message: Message, text: string, color?: number, components?: MessageReplyOptions["components"]) => message.reply({
  embeds: [embedOf(text, color)],
  allowedMentions: {
    parse: [],
    repliedUser: true,
  },
  components,
});

// The judge or the clerk talking, with an optional help footer in Components V2 and the same mention rules.
const talk = async (message: Message, text: string, help?: string) => message.reply({
  ...(help === undefined ? {
    content: sanitizeDiscordMessage(text),
    flags: MessageFlags.SuppressEmbeds,
  } : {
    components: [
      new TextDisplayBuilder().setContent(sanitizeDiscordMessage(text)),
      new TextDisplayBuilder().setContent(`-# *${sanitizeDiscordMessage(help)}*`),
    ],
    flags: [MessageFlags.IsComponentsV2, MessageFlags.SuppressEmbeds],
  }),
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
  const key = `${message.channelId}:${message.author.id}`;
  awaitedAnswers.add(key);
  const answers = await message.channel
    .awaitMessages({
      filter: (answer) => answer.author.id === message.author.id,
      max: 1,
      time: REASON_WAIT_MS,
    })
    .finally(() => awaitedAnswers.delete(key));

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
  await talk(message, await judge.record(target?.displayName ?? "Cet individu", entries, formatDossier(dossier), await knownAbout([targetId])));
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

/** The judge answers a conversation or renders a ruling; the code adds the number of the ruling and the helplines */
const answer = async (message: Message<true>, content: string, said: string, ruling: boolean, danger: keyof typeof HELPLINES | null, depressionJoke = false) => {
  const footer: string[] = [];

  if (ruling && said !== "") {
    const id = await saveRuling({
      authorId: message.author.id,
      authorName: authorName(message),
      question: content,
      decision: said,
    });
    footer.push(`-# Décision n°${String(id)}, versée à la jurisprudence du Royaume`);
  }

  const joke = depressionJoke && danger === null;
  const help = danger === null ? (joke ? HELPLINES.suicide : undefined) : HELPLINES[danger];
  const text = joke ? DEPRESSION_JOKE : said === "" ? DOZING : said;
  await talk(message, limitEmojis([text, ...footer].join("\n\n"), danger === null ? 1 : 0), help);
};

/** A message to the bot: a command, or a plain request the AI reads; trials only in the AGENTS category */
const answerMention = async (message: Message<true>, botId: string, command: ReturnType<typeof parseCommand>, stopTyping: () => void, inAgents: boolean) => {
  if (command?.kind === "trial" && !inAgents) {
    await reply(message, TRIALS_ONLY_IN_AGENTS, COLOR.refusal);
    return;
  }
  if (command?.kind === "trial") {
    await requestHearing(requestOf(message, "american"), command.accusedIds, command.crime, botId, null);
    return;
  }
  if (command?.kind === "record") {
    await showRecord(message, command.targetId);
    return;
  }

  // The AI tells what the author wants and may request older messages once; the code checks and acts.
  const content = readableContent(message, botId);
  const [history, known, precedents] = await Promise.all([
    historyOf(message, botId),
    knownAbout([message.author.id, ...message.mentions.users.keys()]),
    searchRulings(content),
  ]);

  const asked = {
    authorName: authorName(message),
    message: content,
    history,
    historyExpanded: false,
    known,
    precedents: precedents.map(formatRuling),
  };
  let response = await converse(asked);
  if (response.moreHistory && response.danger === null && (response.intent.kind === "chat" || response.intent.kind === "ruling")) {
    const expanded = await historyOf(message, botId, true);
    if (expanded.join("\n").length > asked.history.join("\n").length) {
      asked.history = expanded;
      asked.historyExpanded = true;
      const withHistory = await converse(asked);
      if (withHistory.reply !== "" || withHistory.danger !== null) response = withHistory;
    }
  }
  const { intent, danger, depressionJoke, search, reply: said } = response;

  // Someone who may be at risk gets an answer and the helplines, whatever they asked:
  if (danger !== null || depressionJoke || intent.kind === "ruling") {
    await answer(message, content, said, intent.kind === "ruling" && danger === null, danger, depressionJoke);
    return;
  }
  // A question of law is checked on the web first, when the search is set up:
  if (intent.kind === "chat") {
    const sources = search === null ? [] : await searchWeb(search);
    await answer(message, content, sources.length === 0 ? said : await answerFromSources(asked, said, sources), false, null);
    return;
  }
  if (intent.kind === "forget") {
    await forgetMember({
      id: message.author.id,
      name: authorName(message),
    });
    await talk(
      message,
      "C'est fait : la cour a oublié tout ce qu'elle savait sur toi et ne prend plus de notes. Ton casier, lui, reste : la justice n'oublie pas les condamnations.",
    );
    return;
  }
  if (intent.kind === "remember") {
    await rememberMember(message.author.id);
    await talk(message, "Très bien, la cour rouvre ton dossier. Elle reprend ses notes.");
    return;
  }
  if (!inAgents && intent.kind !== "show-record" && intent.kind !== "recall") {
    await reply(message, TRIALS_ONLY_IN_AGENTS, COLOR.refusal);
    return;
  }
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

  // Only show-record is left:
  const [targetId] = (await resolveAccused(message, botId)).ids;

  if (targetId === undefined) {
    await reply(message, "Le casier de qui ? Mentionne le membre ou réponds à son message.", COLOR.refusal);
    return;
  }

  await showRecord(message, targetId);
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

  const inAgents = AGENTS_CATEGORY_IDS.includes(getCategoryId(message.channel) ?? "");

  // Outside the AGENTS category of the configured servers, the bot only answers explicit mentions:
  if (!inAgents && (!mentioned || !GUILD_IDS.includes(message.guildId))) return;
  // The answer the court is waiting for (the reason of a trial) is not a message to the judge:
  if (awaitedAnswers.has(`${message.channelId}:${message.author.id}`)) return;

  // In the AGENTS category, replying to one of its messages is talking to it too.
  const repliesToBot = message.type === MessageType.Reply && message.mentions.repliedUser?.id === botUser.id;

  // Trials are pleaded out loud in the voice channel: written messages only matter when they talk to the bot.
  if (!mentioned && !repliesToBot) {
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

  // A plain reply waits silently: no notice for each message of a conversation.
  if (waitMs > 0 && !mentioned) return;
  if (waitMs > 0) {
    await reply(message, `La cour est débordée. Reviens dans ${String(Math.ceil(waitMs / 1000))} secondes.`, COLOR.refusal);
    return;
  }

  lastAiRequest.set(message.author.id, now);

  const stopTyping = startDiscordTyping(message.channel, () => logger.warn("Could not send the typing indicator"));
  await answerMention(message, botUser.id, command, stopTyping, inAgents).finally(stopTyping);
});
