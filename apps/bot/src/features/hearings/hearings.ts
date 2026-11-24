import type { Member } from "#/features/court/engine";
import type { Hearing } from "#/features/hearings/hearing-store";
import { court } from "#/features/court/court";
import { AI_LAWYER, formatNames, judgmentMode } from "#/features/court/engine";
import { upsertMember } from "#/features/court/members";
import { fetchUnfinishedHearings, setHearingJuryRequested, setHearingLawyer, setHearingPreparation, setHearingStatus } from "#/features/hearings/hearing-store";
import { listenAndTranscribe, speakInVoice } from "#/features/hearings/hearing-voice";
import { COLOR, createPreparationRoom, deleteHearingChannel, discordClient, fetchChannelGuild, fetchDiscordSendableChannel, findDiscordGuildMember, sendSafeMessage, setHearingEventStatus } from "#/integrations/discord";
import { leaveVoice, stopListening } from "#/integrations/voice";
import { trigger } from "#/utils/trigger";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

// The voice channel stays a few minutes after the verdict, so everyone hears it:
const CHANNEL_DELETE_DELAY_MS = 5 * 60_000;
const PREPARATION_MS = 5 * 60_000;
const MAX_CONTEXT_LINES = 20;
const MAX_CONTEXT_LENGTH = 500;

// Per text channel: the hearing waiting for its time with its timer, the defense being prepared, and the hearing whose trial is running.
const pending = new Map<
  string,
  {
    hearing: Hearing;
    timer: ReturnType<typeof setTimeout>;
  }
>();
const preparing = new Map<
  string,
  {
    hearing: Hearing;
    accused: Member[];
    roomId: string;
    context: string[];
    timer: ReturnType<typeof setTimeout>;
  }
>();
const running = new Map<
  string,
  Hearing & {
    defenseContext: string[];
  }
>();

export const hasPendingHearing = (channelId: string) => pending.has(channelId) || preparing.has(channelId);

export const pendingHearing = (channelId: string): Hearing | undefined => pending.get(channelId)?.hearing;

/** Give the waiting hearing of a text channel its lawyer (a member who accepted, or the AI lawyer), false when this hearing is not waiting anymore or the lawyer is one of its parties */
export const setPendingLawyer = async (channelId: string, lawyer: Member, hearingId: string): Promise<boolean> => {
  const entry = pending.get(channelId);

  if (entry?.hearing.id !== hearingId) return false;
  if (lawyer.id === entry.hearing.plaintiffId || entry.hearing.accused.some((member) => member.id === lawyer.id)) return false;

  entry.hearing = { ...entry.hearing, lawyer };
  await setHearingLawyer(entry.hearing.id, lawyer);
  return true;
};

/** Close the event and remove the voice channel of a hearing (only ever channels the bot created) */
const dismantle = async (hearing: Hearing, eventStatus: "canceled" | "completed") => {
  const guild = await fetchChannelGuild(hearing.channelId);
  if (hearing.eventId !== null) await setHearingEventStatus(guild, hearing.eventId, eventStatus);

  if (hearing.voiceChannelId !== null) {
    leaveVoice(guild.id, hearing.voiceChannelId);
    await deleteHearingChannel(guild, hearing.voiceChannelId);
  }
};

const cancelHearing = async (hearing: Hearing, text: string) => {
  await setHearingStatus(hearing.id, "cancelled");
  await dismantle(hearing, "canceled");
  await sendSafeMessage(await fetchDiscordSendableChannel(hearing.channelId), text, COLOR.refusal);
};

/** Members able to vote: in the voice channel, neither bots nor parties; null without voice channel (the vote is then open to all) */
const possibleVoters = (hearing: Hearing, accused: Member[]): number | null => {
  if (hearing.voiceChannelId === null) return null;

  const channel = discordClient.channels.cache.get(hearing.voiceChannelId);

  if (channel?.isVoiceBased() !== true) return null;

  const parties = new Set([hearing.plaintiffId, ...accused.map((member) => member.id)]);
  return channel.members.filter((member) => !member.user.bot && !parties.has(member.id)).size;
};

/** Open the trial itself once the defense is ready: the judgment mode depends on the gravity and on who is there to vote */
const openTrial = async (hearing: Hearing, accused: Member[], context: string[]) => {
  const guild = await fetchChannelGuild(hearing.channelId);

  const trial = court.open({
    channelId: hearing.channelId,
    accused,
    plaintiff: {
      id: hearing.plaintiffId,
      name: hearing.plaintiffName,
    },
    lawyer: hearing.lawyer,
    crime: hearing.crime,
    context: hearing.context,
    style: hearing.style,
    mode: judgmentMode(hearing.gravity, possibleVoters(hearing, accused), hearing.juryRequested),
  });

  if (trial === "busy") {
    await cancelHearing(hearing, "L'audience est annulée : la cour est occupée dans ce salon.");
    return;
  }

  running.set(hearing.channelId, {
    ...hearing,
    defenseContext: context,
  });
  // The bot sits in the voice channel of the trial: it sees who speaks and how loud, and the clerk types what is said.
  const { voiceChannelId } = hearing;

  if (voiceChannelId !== null) {
    listenAndTranscribe(voiceChannelId, (userId, text) => {
      court.say(hearing.channelId, userId, text);
    });
  }

  await Promise.all([
    setHearingStatus(hearing.id, "started"),
    ...(hearing.lawyer === null || hearing.lawyer.id === AI_LAWYER.id ? [] : [
      upsertMember({
        ...hearing.lawyer,
        avatarUrl: null,
      }),
    ]),
  ]);

  if (hearing.eventId !== null) await setHearingEventStatus(guild, hearing.eventId, "active");
};

const readyButton = () => [
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("hearing-ready").setLabel("C'est bon, ouvrir le procès").setStyle(ButtonStyle.Primary),
  ),
];

const finishPreparation = trigger.safeListener("Hearing preparation end", async (channelId: string) => {
  const entry = preparing.get(channelId);

  if (entry === undefined) return;

  preparing.delete(channelId);
  clearTimeout(entry.timer);
  const guild = await fetchChannelGuild(channelId);
  stopListening(guild.id, entry.roomId);
  leaveVoice(guild.id, entry.roomId);
  await deleteHearingChannel(guild, entry.roomId);
  await setHearingPreparation(entry.hearing.id, null);
  await openTrial(entry.hearing, entry.accused, entry.context);
});

export type ReadyResult = "ended" | "none" | "not-allowed";

export const readyAnswers: Record<ReadyResult, string> = {
  "ended": "La préparation est terminée, le procès s'ouvre.",
  "none": "Aucune préparation en cours dans ce salon.",
  "not-allowed": "Seuls les accusés et leur avocat peuvent terminer la préparation.",
};

/** End the preparation of the defense right now, for the accused and their lawyer only */
export const endPreparation = (channelId: string, requesterId: string): ReadyResult => {
  const entry = preparing.get(channelId);

  if (entry === undefined) return "none";
  if (![...entry.accused.map((member) => member.id), entry.hearing.lawyer?.id].includes(requesterId)) return "not-allowed";

  finishPreparation(channelId);
  return "ended";
};

/** While the AI lawyer is being briefed, the accused write it the context of the case in the text channel */
export const collectContext = (channelId: string, authorId: string, text: string): void => {
  const entry = preparing.get(channelId);

  if (entry?.hearing.lawyer?.id !== AI_LAWYER.id || !entry.accused.some((member) => member.id === authorId)) return;

  if (entry.context.length < MAX_CONTEXT_LINES) entry.context.push(text.slice(0, MAX_CONTEXT_LENGTH));
};

/** What the accused told the AI lawyer, for the trial running in a text channel */
export const defenseContextOf = (channelId: string): string[] => running.get(channelId)?.defenseContext ?? [];

/** The accused prepare their defense with their lawyer in a limited voice room, then the trial opens */
const prepareDefense = async (hearing: Hearing, accused: Member[], lawyer: Member, roomId: string) => {
  const channel = await fetchDiscordSendableChannel(hearing.channelId);

  const minutes = String(Math.round(PREPARATION_MS / 60_000));
  const names = formatNames(accused.map((member) => member.name));
  const places = accused.length + 1;
  const ai = lawyer.id === AI_LAWYER.id;

  preparing.set(hearing.channelId, {
    hearing,
    accused,
    roomId,
    context: [],
    timer: setTimeout(() => {
      finishPreparation(hearing.channelId);
    }, PREPARATION_MS),
  });

  // Kept in the database: after a restart, the room is found again and deleted.
  await setHearingPreparation(hearing.id, roomId);

  // The court-appointed lawyer listens in the room: what the accused say there becomes its brief.
  if (ai) {
    listenAndTranscribe(roomId, (userId, text) => {
      collectContext(hearing.channelId, userId, text);
    });
  }

  const text = ai ? `Préparation de la défense de ${names} avec ${lawyer.name} : ${minutes} minutes, dans <#${roomId}> (${String(places)} places). Expliquez l'affaire à votre avocat commis d'office de vive voix dans ce salon, ou par écrit ici sans mentionner le bot. Le procès s'ouvre ensuite, ou dès que vous cliquez sur « C'est bon ».` : `Préparation de la défense : ${names} et ${lawyer.name} ont ${minutes} minutes dans <#${roomId}> (${String(places)} places). Le procès s'ouvre ensuite, ou dès que vous cliquez sur « C'est bon ».`;
  await sendSafeMessage(channel, text, COLOR.court, readyButton());
};

const startHearing = async (hearing: Hearing) => {
  pending.delete(hearing.channelId);

  const guild = await fetchChannelGuild(hearing.channelId);

  const found = await Promise.all(
    hearing.accused.map(async (accused) => ({
      accused,
      member: await findDiscordGuildMember(guild, accused.id, { force: true }),
    })),
  );
  const present = found.flatMap(({ member }) => (member === null ? [] : [member]));

  if (present.length === 0) {
    await cancelHearing(hearing, "L'audience est annulée : les accusés ont quitté le Royaume.");
    return;
  }

  const left = found.filter(({ member }) => member === null).map(({ accused }) => accused.name);
  if (left.length > 0) await sendSafeMessage(
    await fetchDiscordSendableChannel(hearing.channelId),
    `Ont quitté le Royaume avant l'audience : ${left.join(", ")}.`,
  );

  const accused = present.map((member) => ({
    id: member.id,
    name: member.displayName,
  }));
  await Promise.all(
    present.map(async (member) => upsertMember({
      id: member.id,
      name: member.displayName,
      avatarUrl: member.displayAvatarURL({
        extension: "png",
        size: 128,
      }),
    }),
    ),
  );

  if (hearing.lawyer !== null) {
    const roomId = await createPreparationRoom(guild, {
      name: `Préparation de ${formatNames(accused.map((member) => member.name))}`,
      places: accused.length + 1,
    });

    if (roomId !== null) {
      await prepareDefense(hearing, accused, hearing.lawyer, roomId);
      return;
    }
  }

  await openTrial(hearing, accused, []);
};

const start = trigger.safeListener("Hearing start", startHearing);

/** Arm the timer of a hearing: it opens the trial at its time, at once when that time has passed */
export const scheduleHearing = (hearing: Hearing): void => {
  pending.set(hearing.channelId, {
    hearing,
    timer: setTimeout(
      () => {
        // The lawyer may have been chosen since: start from the current state of the hearing.
        start(pending.get(hearing.channelId)?.hearing ?? hearing);
      },
      Math.max(0, hearing.startsAt.getTime() - Date.now()),
    ),
  });
};

export type ForceStartResult = "started" | "none" | "not-plaintiff";

export const forceStartAnswers: Record<ForceStartResult, string> = {
  "started": "L'audience s'ouvre maintenant.",
  "none": "Aucune audience n'attend dans ce salon.",
  "not-plaintiff": "Seul celui qui a lancé le procès peut l'ouvrir plus tôt.",
};

/** Open the waiting hearing of a text channel right now, for the member who requested it only */
export const forceStartHearing = (channelId: string, requesterId: string): ForceStartResult => {
  const entry = pending.get(channelId);

  if (entry === undefined) return "none";
  if (entry.hearing.plaintiffId !== requesterId) return "not-plaintiff";

  clearTimeout(entry.timer);
  start(entry.hearing);
  return "started";
};

const removeChannel = trigger.safeListener("Hearing channel removal", async (hearing: Hearing) => {
  if (hearing.voiceChannelId === null) return;

  const guild = await fetchChannelGuild(hearing.channelId);
  leaveVoice(guild.id, hearing.voiceChannelId);
  await deleteHearingChannel(guild, hearing.voiceChannelId);
});

/** Voice channel of the trial running in a text channel, null without trial or without voice channel */
export const voiceChannelOf = (channelId: string): string | null => running.get(channelId)?.voiceChannelId ?? null;

/** Whether a member is in the voice channel of the trial of a text channel (always true when the trial has none) */
export const isInHearingVoice = (channelId: string, userId: string): boolean => {
  const voiceChannelId = voiceChannelOf(channelId);

  if (voiceChannelId === null) return true;

  const channel = discordClient.channels.cache.get(voiceChannelId);
  return channel?.isVoiceBased() === true && channel.members.has(userId);
};

/** The judge (or the AI lawyer) speaks out loud in the voice channel of the trial of a text channel, nothing happens without one */
export const judgeSays = (channelId: string, text: string, speakerId = "judge"): void => {
  const voiceChannelId = voiceChannelOf(channelId);
  if (voiceChannelId !== null) speakInVoice(voiceChannelId, text, speakerId);
};

/** Once the trial of a text channel has ended: the event is completed and the voice channel goes after a delay */
export const completeHearing = async (channelId: string): Promise<void> => {
  const hearing = running.get(channelId);
  running.delete(channelId);

  if (hearing === undefined) return;

  await setHearingStatus(hearing.id, "finished");
  if (hearing.eventId !== null) await setHearingEventStatus(await fetchChannelGuild(hearing.channelId), hearing.eventId, "completed");
  setTimeout(() => {
    removeChannel(hearing);
  }, CHANNEL_DELETE_DELAY_MS);
};

export type JuryResult = "requested" | "none" | "not-accused" | "not-light";

export const juryAnswers: Record<JuryResult, string> = {
  "requested": "Les accusés réclament un jury : le peuple votera, s'il y a assez de monde.",
  "none": "Aucune audience n'attend dans ce salon.",
  "not-accused": "Seuls les accusés réclament un jury.",
  "not-light": "Cette affaire a déjà un jury.",
};

/** An accused claims a jury for a light case, as an American defendant may */
export const requestJury = async (channelId: string, requesterId: string): Promise<JuryResult> => {
  const entry = pending.get(channelId);

  if (entry === undefined) return "none";
  if (!entry.hearing.accused.some((member) => member.id === requesterId)) return "not-accused";
  if (entry.hearing.gravity !== "light") return "not-light";

  entry.hearing = {
    ...entry.hearing,
    juryRequested: true,
  };
  await setHearingJuryRequested(entry.hearing.id);
  return "requested";
};

// When Discord is ready after a restart: hearings still waiting are armed again (their preparation room, if any, is deleted: the preparation starts over),
// and the ones that were running lost their trial with the restart, so their event and channel are cleaned up and the channel is told.
discordClient.once(
  "clientReady",
  trigger.safeListener("Hearings restore", async () => {
    for (const hearing of await fetchUnfinishedHearings()) {
      if (hearing.status === "scheduled") {
        if (hearing.preparationChannelId !== null) {
          await deleteHearingChannel(await fetchChannelGuild(hearing.channelId), hearing.preparationChannelId);
          await setHearingPreparation(hearing.id, null);
        }

        scheduleHearing({
          ...hearing,
          preparationChannelId: null,
        });
        continue;
      }

      await setHearingStatus(hearing.id, "finished");
      await dismantle(hearing, "completed");
      await sendSafeMessage(
        await fetchDiscordSendableChannel(hearing.channelId),
        "Le procès a été interrompu : le juge s'est endormi sur son marteau. Relancez-le quand vous voulez.",
        COLOR.refusal,
      );
    }
  }),
);
