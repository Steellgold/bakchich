import type { PenaltyKind } from "./penalty-rules";
import type { Trial } from "#/features/court/engine";
import { BANNED_WORDS, describePenalty, FALLBACK_WORDING, formatDuration, PENALTY_KINDS, randomDurationMs, validWording } from "./penalty-rules";
import { savePenalty } from "./penalty-store";
import { judge } from "#/features/court/court";
import { discordClient, fetchChannelGuild } from "#/integrations/discord";

/** The JSON object of the AI wording, or nothing (low-level parser: it handles its own errors) */
const parseWording = (raw: string): {
  text?: unknown;
  emoji?: unknown;
} => {
  const block = (/\{[^{}]*\}/u).exec(raw)?.[0];

  if (block === undefined) return {};

  try {
    const json: unknown = JSON.parse(block);
    return typeof json === "object" && json !== null ? json : {};
  }
  catch {
    return {};
  }
};

const pick = <T>(list: readonly T[], rng: () => number): T => {
  const item = list[Math.floor(rng() * list.length)];

  if (item === undefined) throw new Error("Nothing to pick from");

  return item;
};

/** What the convicted will have to do: the code picks the kind and the length, the AI only words the phrase and its emoji */
const wordingFor = async (trial: Trial, kind: PenaltyKind, rng: () => number) => {
  if (kind === "banned-word") return {
    ...FALLBACK_WORDING[kind],
    text: pick(BANNED_WORDS, rng),
  };
  if (kind === "uppercase") return FALLBACK_WORDING[kind];

  const wording = parseWording(await judge.penaltyWording(trial, kind));
  return validWording(kind, wording.text, wording.emoji);
};

/** Sentence the convicted to a rule the bot enforces in every message, and return the sentence as the judge reads it */
export const sentence = async (trial: Trial, rng: () => number = Math.random): Promise<string> => {
  const kind = pick(PENALTY_KINDS, rng);
  const wording = await wordingFor(trial, kind, rng);

  const durationMs = randomDurationMs(rng);
  const guild = await fetchChannelGuild(trial.channelId);

  const endsAt = new Date(Date.now() + durationMs);

  // The court may judge itself, but cannot make itself type anything:
  const convicted = trial.accused.filter((member) => member.id !== discordClient.user?.id);
  await Promise.all(
    convicted.map(async (member) => savePenalty({
      memberId: member.id,
      memberName: member.name,
      guildId: guild.id,
      kind,
      text: wording.text,
      emoji: wording.emoji,
      endsAt,
    }),
    ),
  );

  return `Pendant ${formatDuration(durationMs)}, ${describePenalty({
    kind,
    text: wording.text,
  })} ${wording.emoji}, sur tout le serveur. Chaque oubli rallonge la peine.`;
};
