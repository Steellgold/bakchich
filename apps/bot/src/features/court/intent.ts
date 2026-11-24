import type { Style } from "./engine";
import { normalizeCrime } from "./engine";
import { z } from "zod";

export type Intent = {
  kind: "open-trial";
  accused: string[];
  crime: string | null;
  style: Style | null;
} | {
  kind: "show-record";
} | {
  kind: "start-now";
} | {
  kind: "call-witness";
} | {
  kind: "dismiss-witness";
} | {
  kind: "recap";
} | {
  kind: "recall";
  query: string;
} | {
  kind: "ruling";
} | {
  kind: "forget";
} | {
  kind: "remember";
} | {
  kind: "chat";
};

const MAX_QUERY_LENGTH = 100;

const schema = z.object({
  intent: z.enum(["open-trial", "show-record", "start-now", "call-witness", "dismiss-witness", "recap", "recall", "ruling", "forget", "remember", "chat"]),
  accused: z.array(z.string()).nullish(),
  crime: z.string().nullish(),
  style: z.string().nullish(),
  query: z.string().nullish(),
});

/** Intent the AI answered as one JSON object: anything unreadable or unknown is plain chat (low-level parser, so it handles its own errors) */
export const parseIntent = (raw: string): Intent => {
  const block = (/\{[^{}]*\}/u).exec(raw)?.[0];

  if (block === undefined) return {
    kind: "chat",
  };

  let json: unknown;

  try {
    json = JSON.parse(block);
  }
  catch {
    return {
      kind: "chat",
    };
  }

  const parsed = schema.safeParse(json);

  if (!parsed.success) return {
    kind: "chat",
  };
  if (parsed.data.intent === "open-trial") {
    // An unknown style is no style: the court picks the American one.
    const { style } = parsed.data;
    // Discord IDs only: the code still checks them against the members actually mentioned.
    const accused = (parsed.data.accused ?? []).filter((id) => (/^\d+$/u).test(id));
    return {
      kind: "open-trial",
      accused,
      crime: normalizeCrime(parsed.data.crime ?? ""),
      style: style === "american" || style === "french" ? style : null,
    };
  }
  if (parsed.data.intent === "recall") return {
    kind: "recall",
    query: (parsed.data.query ?? "").slice(0, MAX_QUERY_LENGTH),
  };

  return {
    kind: parsed.data.intent,
  };
};
