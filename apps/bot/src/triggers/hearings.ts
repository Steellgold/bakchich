import type { Hearing } from "#/court/hearings";
import { court } from "#/court/court";
import { pickLawyer } from "#/court/engine";
import { fetchScheduledHearings, setHearingStatus } from "#/court/hearings";
import { upsertMember } from "#/court/members";
import { discordClient, fetchDiscordSendableChannel, fetchRecentHumanMessages, findDiscordGuildMember, ROYAUME_GUILD_ID, sendSafeMessage, setHearingEventStatus } from "#/integrations/discord";
import { trigger } from "#/utils/trigger";

const LAWYER_LOOKUP_MESSAGES = 100;
const LAWYER_WINDOW_MS = 30 * 60_000;

// Per channel: the timer of the hearing waiting for its time, and the event of the trial running there.
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const events = new Map<string, string>();

export const hasPendingHearing = (channelId: string) => timers.has(channelId);

const cancelHearing = async (hearing: Hearing, text: string) => {
  const guild = await discordClient.guilds.fetch(ROYAUME_GUILD_ID);
  await setHearingStatus(hearing.id, "cancelled");

  if (hearing.eventId !== null) await setHearingEventStatus(guild, hearing.eventId, "canceled");

  await sendSafeMessage(await fetchDiscordSendableChannel(hearing.channelId), text, []);
};

const startHearing = async (hearing: Hearing) => {
  timers.delete(hearing.channelId);

  const guild = await discordClient.guilds.fetch(ROYAUME_GUILD_ID);
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

  await Promise.all([
    setHearingStatus(hearing.id, "started"),
    ...present.map(async (member) => upsertMember({ id: member.id, name: member.displayName, avatarUrl: member.displayAvatarURL({ extension: "png", size: 128 }) })),
    ...(lawyer === null ? [] : [upsertMember({ ...lawyer, avatarUrl: null })]),
  ]);

  if (hearing.eventId !== null) {
    events.set(hearing.channelId, hearing.eventId);
    await setHearingEventStatus(guild, hearing.eventId, "active");
  }
};

const start = trigger.safeListener("Hearing start", startHearing);

/** Arm the timer of a hearing: it opens the trial at its time, at once when that time has passed */
export const scheduleHearing = (hearing: Hearing): void => {
  timers.set(hearing.channelId, setTimeout(() => {
    start(hearing);
  }, Math.max(0, hearing.startsAt.getTime() - Date.now())));
};

/** Close the Discord event of a hearing once its trial has ended */
export const completeHearingEvent = async (channelId: string): Promise<void> => {
  const eventId = events.get(channelId);
  events.delete(channelId);
  if (eventId !== undefined) await setHearingEventStatus(await discordClient.guilds.fetch(ROYAUME_GUILD_ID), eventId, "completed");
};

// Hearings still waiting when the bot restarted are armed again once Discord is ready:
discordClient.once("clientReady", trigger.safeListener("Hearings restore", async () => {
  for (const hearing of await fetchScheduledHearings()) scheduleHearing(hearing);
}));
