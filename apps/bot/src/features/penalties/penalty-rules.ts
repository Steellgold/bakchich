// Enforced sentences: what a convicted member must do in every message, and how a message is checked. Discord-free.

export type PenaltyKind = "suffix" | "prefix" | "banned-word" | "uppercase";

export type Penalty = {
  id: string;
  memberId: string;
  memberName: string;
  guildId: string;
  kind: PenaltyKind;
  text: string;
  emoji: string;
  endsAt: Date;
};

export const PENALTY_KINDS: readonly PenaltyKind[] = ["suffix", "prefix", "banned-word", "uppercase"];

const MINUTE_MS = 60_000;
/** A sentence lasts between these, in steps of 10 minutes */
const MIN_DURATION_MS = 30 * MINUTE_MS;
const MAX_DURATION_MS = 120 * MINUTE_MS;
/** Extra time per forgotten word, and per word of the message it was forgotten in */
const PER_FORGOTTEN_WORD_MS = MINUTE_MS;
const PER_MESSAGE_WORD_MS = 10_000;
/** One message never adds more than this, and a sentence never lasts longer than a day */
const MAX_EXTENSION_MS = 30 * MINUTE_MS;
export const MAX_REMAINING_MS = 24 * 60 * MINUTE_MS;

/** Common words a sentence may ban: everybody uses them, so forgetting is easy */
export const BANNED_WORDS = ["je", "mdr", "quoi", "genre", "grave", "trop", "ouais", "jsp", "bah", "frère"] as const;

const MIN_LETTERS_FOR_CAPS = 3;

/** Lowercase letters and digits only, accents dropped, words separated by one space */
const normalize = (text: string) => text
  .normalize("NFD")
  .replace(/\p{M}/gu, "")
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim();

/** What a member actually wrote: without mentions, custom emojis, channels and links */
const writtenText = (content: string) => content
  .replace(/<[^>]+>/gu, " ")
  .replace(/https?:\/\/\S+/gu, " ")
  .trim();

const words = (text: string) => normalize(text)
  .split(" ")
  .filter((word) => word !== "");

export const randomDurationMs = (rng: () => number): number => MIN_DURATION_MS + Math.floor(rng() * ((MAX_DURATION_MS - MIN_DURATION_MS) / (10 * MINUTE_MS) + 1)) * 10 * MINUTE_MS;

/** How many words of the sentence the message forgot, 0 when it complies (or has nothing written to check) */
export const forgottenWords = (penalty: Pick<Penalty, "kind" | "text">, content: string): number => {
  const written = writtenText(content);
  const messageWords = words(written);

  if (messageWords.length === 0) return 0;

  if (penalty.kind === "uppercase") {
    const letters = written.match(/\p{L}/gu) ?? [];

    if (letters.length < MIN_LETTERS_FOR_CAPS) return 0;

    return written.split(/\s+/u).filter((word) => word !== word.toUpperCase()).length;
  }
  if (penalty.kind === "banned-word") {
    const banned = normalize(penalty.text);
    return messageWords.filter((word) => word === banned).length;
  }

  const required = normalize(penalty.text);
  const message = normalize(written);
  const complies = penalty.kind === "suffix" ? message.endsWith(required) : message.startsWith(required);
  return complies ? 0 : words(penalty.text).length;
};

/** Time added for a forgotten message: the forgotten words, plus a ratio of the message length */
export const extensionMs = (forgotten: number, content: string): number => Math.min(MAX_EXTENSION_MS, forgotten * PER_FORGOTTEN_WORD_MS + words(writtenText(content)).length * PER_MESSAGE_WORD_MS);

/** « 1 h 30 », « 45 min » */
export const formatDuration = (ms: number): string => {
  const minutes = Math.max(1, Math.round(ms / MINUTE_MS));
  const hours = Math.floor(minutes / 60);

  if (hours === 0) return `${String(minutes)} min`;

  return minutes % 60 === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(minutes % 60).padStart(2, "0")}`;
};

/** The rule in French, as the judge reads it */
export const describePenalty = (penalty: Pick<Penalty, "kind" | "text">): string => {
  if (penalty.kind === "suffix") return `finir chaque message par « ${penalty.text} »`;
  if (penalty.kind === "prefix") return `commencer chaque message par « ${penalty.text} »`;
  if (penalty.kind === "banned-word") return `ne plus jamais écrire « ${penalty.text} »`;

  return "écrire tous ses messages EN MAJUSCULES";
};

const SINGLE_EMOJI = /^\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*$/u;
const PHRASE = /^[\p{L}' ,!-]{2,40}$/u;
const MAX_PHRASE_WORDS = 6;

export const FALLBACK_WORDING: Record<
  PenaltyKind,
  {
    text: string;
    emoji: string;
  }
> = {
  "suffix": {
    text: "avec ce doux fromage",
    emoji: "🧀",
  },
  "prefix": {
    text: "Votre Honneur,",
    emoji: "⚖️",
  },
  "banned-word": {
    text: "quoi",
    emoji: "🚫",
  },
  "uppercase": {
    text: "",
    emoji: "📢",
  },
};

/** The phrase and emoji the AI made up, kept only when they are short and clean; the fallback otherwise */
export const validWording = (kind: "suffix" | "prefix", text: unknown, emoji: unknown): {
  text: string;
  emoji: string;
} => {
  const fallback = FALLBACK_WORDING[kind];
  const phrase = typeof text === "string" ? text.trim() : "";
  const validPhrase = PHRASE.test(phrase) && words(phrase).length > 0 && words(phrase).length <= MAX_PHRASE_WORDS;
  const validEmoji = typeof emoji === "string" && SINGLE_EMOJI.test(emoji.trim());
  return {
    text: validPhrase ? phrase : fallback.text,
    emoji: validEmoji ? emoji.trim() : fallback.emoji,
  };
};
