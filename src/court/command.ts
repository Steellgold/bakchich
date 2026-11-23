import { normalizeCrime } from "./engine";

export type Command
  = | { kind: "trial"; accusedId: string; crime: string }
    | { kind: "record"; targetId: string }
    | { kind: "invalid-crime" }
    | null;

const trialPattern = /^proc[eè]s\s+<@!?(\d+)>\s+pour\s+(.+)$/isu;
const recordPattern = /^casier\s+<@!?(\d+)>$/iu;

/** Parse a raw message starting with the bot mention into a court command */
export const parseCommand = (content: string, botId: string): Command => {
  const text = content.replace(new RegExp(`^\\s*<@!?${botId}>\\s*`, "u"), "").trim();

  const trial = trialPattern.exec(text);
  if (trial?.[1] !== undefined && trial[2] !== undefined) {
    const crime = normalizeCrime(trial[2]);
    return crime === null ? { kind: "invalid-crime" } : { kind: "trial", accusedId: trial[1], crime };
  }

  const record = recordPattern.exec(text);
  if (record?.[1] !== undefined) return { kind: "record", targetId: record[1] };

  return null;
};
