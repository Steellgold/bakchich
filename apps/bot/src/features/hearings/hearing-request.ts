import type { Gravity, Member, Style } from "#/features/court/engine";
import type { Guild, SendableChannels } from "discord.js";
import { court, judge } from "#/features/court/court";
import { formatNames, MAX_ACCUSED } from "#/features/court/engine";
import { countActiveMembers, hearingDelayMs } from "#/features/hearings/hearing-delay";
import { saveHearing } from "#/features/hearings/hearing-store";
import { hasPendingHearing, scheduleHearing } from "#/features/hearings/hearings";
import { COLOR, createHearingRoom, fetchRecentHumanMessages, findDiscordGuildMember } from "#/integrations/discord";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder } from "discord.js";

const LAWYER_LOOKUP_MESSAGES = 100;
const SCREENING_CONTEXT_MESSAGES = 10;

// Under the announcement of a hearing: open it at once (the member who requested it), ask for the court-appointed lawyer, pick a lawyer who must accept, or claim a jury for a light case.
const hearingComponents = (gravity: Gravity) => [
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("hearing-start").setLabel("Ouvrir maintenant").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("hearing-ai-lawyer").setLabel("Avocat commis d'office").setStyle(ButtonStyle.Secondary),
    ...(gravity === "light" ? [new ButtonBuilder().setCustomId("hearing-jury").setLabel("Réclamer un jury").setStyle(ButtonStyle.Secondary)] : []),
  ),
  new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder().setCustomId("hearing-lawyer").setPlaceholder("Les accusés : choisir un avocat").setMinValues(1).setMaxValues(1),
  ),
];

/** Who asks for a hearing and where, with how to answer them: a mention of the bot, or the « Ouvrir un procès » message action */
export type HearingRequest = {
  channel: SendableChannels;
  guild: Guild;
  plaintiff: Member;
  /** Trial style asked for, American by default */
  style: Style;
  reply: (text: string, color?: number, components?: ReturnType<typeof hearingComponents>) => Promise<unknown>;
};

const STYLE_LABEL: Record<Style, string> = {
  american: "à l'américaine",
  french: "à la française",
};
const GRAVITY_LABEL: Record<Gravity, string> = {
  light: "Affaire légère : le juge tranchera seul, sauf si les accusés réclament un jury.",
  ordinary: "Affaire ordinaire : le jury populaire votera.",
  serious: "Affaire grave : direction les assises, la voix du juge comptera triple.",
};

/** Check the accusation, then announce the hearing: its time comes from the active members, and the Discord event announces it */
const openHearing = async (request: HearingRequest, accusedIds: string[], crime: string, botId: string, context: string | null) => {
  const { channel, guild } = request;

  if (court.get(channel.id) !== undefined || hasPendingHearing(channel.id)) {
    await request.reply("La cour est occupée, revenez plus tard.", COLOR.refusal);
    return;
  }

  if (accusedIds.includes(request.plaintiff.id)) {
    await request.reply("La cour ne te laisse pas te juger toi-même.", COLOR.refusal);
    return;
  }

  if (accusedIds.length > MAX_ACCUSED) {
    await request.reply(`La cour ne juge pas plus de ${String(MAX_ACCUSED)} individus à la fois.`, COLOR.refusal);
    return;
  }

  const found = await Promise.all(accusedIds.map(async (id) => findDiscordGuildMember(guild, id)));
  const accused = found.filter((member) => member !== null);

  if (accused.length !== found.length) {
    await request.reply(`${accused.length === 0 ? "Cet individu est inconnu" : "Un de ces individus est inconnu"} du Royaume.`, COLOR.refusal);
    return;
  }
  if (accused.some((member) => member.user.bot && member.id !== botId)) {
    await request.reply("La cour ne juge pas les machines. Sauf elle-même.", COLOR.refusal);
    return;
  }

  const names = formatNames(accused.map((member) => member.displayName));
  const recent = await fetchRecentHumanMessages(channel, LAWYER_LOOKUP_MESSAGES);

  const screening = await judge.screen(crime, names, [...(context === null ? [] : [context]), ...recent.lines.slice(-SCREENING_CONTEXT_MESSAGES)]);

  if (!screening.ok) {
    await request.reply(screening.reply, COLOR.refusal);
    return;
  }

  // The voice channel and its event come first: without them (no audio category, or Discord refusing), the trial opens at once.
  const now = Date.now();
  const wait = hearingDelayMs(countActiveMembers(recent.authors, now));
  const room = await createHearingRoom(guild, {
    name: `Procès de ${names}`,
    description: context === null ? crime : `${crime}\n\n${context}`,
    startsAt: new Date(now + wait),
  });

  const startsAt = new Date(room === null ? now : now + wait);

  const hearing = await saveHearing({
    channelId: channel.id,
    accused: accused.map((member) => ({
      id: member.id,
      name: member.displayName,
    })),
    plaintiffId: request.plaintiff.id,
    plaintiffName: request.plaintiff.name,
    crime,
    context,
    startsAt,
    voiceChannelId: room?.channelId ?? null,
    eventId: room?.eventId ?? null,
    style: request.style,
    gravity: screening.gravity,
  });
  scheduleHearing(hearing);

  const title = `**Procès de ${names}** pour « ${crime} »\nProcès ${STYLE_LABEL[request.style]}. ${GRAVITY_LABEL[screening.gravity]}`;

  // Without voice channel the trial opens at once and announces itself; the request still gets an answer (an interaction must be answered).
  if (room === null) {
    await request.reply(`${title}\n\nL'audience s'ouvre maintenant.`);
    return;
  }

  await request.reply(
    [
      title,
      "",
      `L'audience s'ouvre <t:${String(Math.round(startsAt.getTime() / 1000))}:R> dans <#${room.channelId}>.`,
      "Les accusés ont jusque-là pour choisir un avocat (qui doit accepter) ou demander un avocat commis d'office.",
      ...(room.eventUrl === null ? [] : [`[Voir l'événement](${room.eventUrl})`]),
    ].join("\n"),
    COLOR.court,
    hearingComponents(screening.gravity),
  );
};

// Channels with a request being checked: the checks take several seconds, two requests must not both pass them.
const requesting = new Set<string>();

/** Ask the court for a hearing, one request at a time per channel */
export const requestHearing = async (request: HearingRequest, accusedIds: string[], crime: string, botId: string, context: string | null): Promise<void> => {
  if (requesting.has(request.channel.id)) {
    await request.reply("La cour est occupée, revenez plus tard.", COLOR.refusal);
    return;
  }

  requesting.add(request.channel.id);
  await openHearing(request, accusedIds, crime, botId, context).finally(() => requesting.delete(request.channel.id));
};
