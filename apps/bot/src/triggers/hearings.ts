import type { Hearing } from "#/court/hearings";
import { court } from "#/court/court";
import { pickLawyer } from "#/court/engine";
import { fetchUnfinishedHearings, setHearingStatus } from "#/court/hearings";
import { upsertMember } from "#/court/members";
import { deleteHearingChannel, discordClient, fetchDiscordSendableChannel, fetchRecentHumanMessages, findDiscordGuildMember, ROYAUME_GUILD_ID, sendSafeMessage, setHearingEventStatus } from "#/integrations/discord";
import { trigger } from "#/utils/trigger";

const LAWYER_LOOKUP_MESSAGES = 100;
const LAWYER_WINDOW_MS = 30 * 60_000;
// The voice channel stays a few minutes after the verdict, so everyone hears it:
const CHANNEL_DELETE_DELAY_MS = 5 * 60_000;

// Per text channel: the hearing waiting for its time with its timer, and the hearing whose trial is running.
const pending = new Map<string, { hearing: Hearing; timer: ReturnType<typeof setTimeout> }>();
const running = new Map<string, Hearing>();

export const hasPendingHearing = (channelId: string) => pending.has(channelId);

const fetchGuild = async () => discordClient.guilds.fetch(ROYAUME_GUILD_ID);

/** Close the event and remove the voice channel of a hearing (only ever channels the bot created) */
const dismantle = async (hearing: Hearing, eventStatus: "canceled" | "completed") => {
  const guild = await fetchGuild();
  if (hearing.eventId !== null) await setHearingEventStatus(guild, hearing.eventId, eventStatus);
  if (hearing.voiceChannelId !== null) await deleteHearingChannel(guild, hearing.voiceChannelId);
};

const cancelHearing = async (hearing: Hearing, text: string) => {
  await setHearingStatus(hearing.id, "cancelled");
  await dismantle(hearing, "canceled");
  await sendSafeMessage(await fetchDiscordSendableChannel(hearing.channelId), text, []);
};

const startHearing = async (hearing: Hearing) => {
  pending.delete(hearing.channelId);

  const guild = await fetchGuild();
  const found = await Promise.all(hearing.accused.map(async (accused) => ({ accused, member: await findDiscordGuildMember(guild, accused.id, { force: true }) })));
  const present = found.flatMap(({ member }) => (member === null ? [] : [member]));

  if (present.length === 0) {
    await cancelHearing(hearing, "⚖️ L'audience est annulée : les accusés ont quitté le Royaume.");
    return;
  }

  const channel = await fetchDiscordSendableChannel(hearing.channelId);
  const left = found.filter(({ member }) => member === null).map(({ accused }) => accused.name);
  if (left.length > 0) await sendSafeMessage(channel, `⚖️ Ont quitté le Royaume avant l'audience : ${left.join(", ")}.`, []);

  const recent = await fetchRecentHumanMessages(channel, LAWYER_LOOKUP_MESSAGES);
  const candidates = recent.authors.filter((author) => author.createdTimestamp > Date.now() - LAWYER_WINDOW_MS);
  const lawyer = pickLawyer(candidates, [...hearing.accused.map((accused) => accused.id), hearing.plaintiffId, discordClient.user?.id ?? ""], Math.random);

  const trial = court.open({
    channelId: hearing.channelId,
    accused: present.map((member) => ({ id: member.id, name: member.displayName })),
    plaintiff: { id: hearing.plaintiffId, name: hearing.plaintiffName },
    lawyer,
    crime: hearing.crime,
  });
  if (trial === "busy") {
    await cancelHearing(hearing, "⏳ L'audience est annulée : la cour est occupée dans ce salon.");
    return;
  }

  running.set(hearing.channelId, hearing);
  await Promise.all([
    setHearingStatus(hearing.id, "started"),
    ...present.map(async (member) => upsertMember({ id: member.id, name: member.displayName, avatarUrl: member.displayAvatarURL({ extension: "png", size: 128 }) })),
    ...(lawyer === null ? [] : [upsertMember({ ...lawyer, avatarUrl: null })]),
  ]);

  if (hearing.eventId !== null) await setHearingEventStatus(guild, hearing.eventId, "active");
};

const start = trigger.safeListener("Hearing start", startHearing);

/** Arm the timer of a hearing: it opens the trial at its time, at once when that time has passed */
export const scheduleHearing = (hearing: Hearing): void => {
  pending.set(hearing.channelId, {
    hearing,
    timer: setTimeout(() => {
      start(hearing);
    }, Math.max(0, hearing.startsAt.getTime() - Date.now())),
  });
};

export type ForceStartResult = "started" | "none" | "not-plaintiff";

export const forceStartAnswers: Record<ForceStartResult, string> = {
  "started": "⚖️ L'audience s'ouvre maintenant.",
  "none": "⏳ Aucune audience n'attend dans ce salon.",
  "not-plaintiff": "🚫 Seul celui qui a lancé le procès peut l'ouvrir plus tôt.",
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
  if (hearing.voiceChannelId !== null) await deleteHearingChannel(await fetchGuild(), hearing.voiceChannelId);
});

/** Once the trial of a text channel has ended: the event is completed and the voice channel goes after a delay */
export const completeHearing = async (channelId: string): Promise<void> => {
  const hearing = running.get(channelId);
  running.delete(channelId);
  if (hearing === undefined) return;

  await setHearingStatus(hearing.id, "finished");
  if (hearing.eventId !== null) await setHearingEventStatus(await fetchGuild(), hearing.eventId, "completed");
  setTimeout(() => {
    removeChannel(hearing);
  }, CHANNEL_DELETE_DELAY_MS);
};

// When Discord is ready after a restart: hearings still waiting are armed again, and the ones that were running lost their trial with the restart, so their event and channel are cleaned up.
discordClient.once("clientReady", trigger.safeListener("Hearings restore", async () => {
  for (const hearing of await fetchUnfinishedHearings()) {
    if (hearing.status === "scheduled") {
      scheduleHearing(hearing);
      continue;
    }

    await setHearingStatus(hearing.id, "finished");
    await dismantle(hearing, "completed");
  }
}));
