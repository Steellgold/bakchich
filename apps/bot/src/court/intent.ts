import { normalizeCrime } from "./engine";
import { z } from "zod";

export type Intent
  = | { kind: "open-trial"; crime: string | null }
    | { kind: "show-record" }
    | { kind: "chat" };

const schema = z.object({
  intent: z.enum(["open-trial", "show-record", "chat"]),
  crime: z.string().nullish(),
});

/** Intent the AI answered as one JSON object: anything unreadable or unknown is plain chat (low-level parser, so it handles its own errors) */
export const parseIntent = (raw: string): Intent => {
  const block = (/\{[^{}]*\}/u).exec(raw)?.[0];
  if (block === undefined) return { kind: "chat" };

  let json: unknown;
  try {
    json = JSON.parse(block);
  }
  catch {
    return { kind: "chat" };
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) return { kind: "chat" };
  if (parsed.data.intent === "open-trial") return { kind: "open-trial", crime: normalizeCrime(parsed.data.crime ?? "") };
  return { kind: parsed.data.intent };
};
