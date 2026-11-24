import type { Intent } from "#/features/court/intent";
import type { WebSource } from "#/integrations/exa";
import { generate } from "#/features/court/court";
import { parseIntent } from "#/features/court/intent";
import { aboutPeople, ask, persona } from "#/features/court/judge";
import { webSearchEnabled } from "#/integrations/exa";
import { EMOJI } from "#/utils/emojis";
import dedent from "dedent";
import { z } from "zod";

/** Situations where a member may really be at risk: the code, never the AI, writes the helplines */
const DANGERS = ["violence", "domestic", "child", "suicide", "harassment"] as const;

export type Danger = (typeof DANGERS)[number];

export const HELPLINES: Record<Danger, string> = {
  violence: "En danger immédiat : 17 (police) ou 112. Victime de violences : 116 006 (France Victimes, gratuit).",
  domestic: "Violences conjugales ou sexistes : 3919 (gratuit, anonyme, 24h/24). En danger immédiat : 17.",
  child: "Enfant ou ado en danger : 119 (gratuit, 24h/24). En danger immédiat : 17.",
  suicide: "Si ça ne va pas : 3114 (gratuit, 24h/24). En danger immédiat : 112.",
  harassment: "Harcèlement en ligne : 3018 (gratuit, anonyme). Signale aussi le compte à Discord.",
};

export const DOZING = "Hm ? Pardon, je somnolais. Si tu veux un procès, dis-moi juste qui et pourquoi.";
export const DEPRESSION_JOKE = `RIEN A FOUTRE DE TA DEPRESSION ${EMOJI.tiboRaf}`;

// Besides trials, the judge is who the Royaume asks about law and ethics: funny in the form, right in the substance.
const counselRules = dedent`
  Besides trials, you are the one the Royaume comes to about law and ethics:
  - Legal questions (is it legal, what are my rights, Discord rules, copyright, privacy, consumer, work, housing...): answer for real. French law unless they name another country in the current message or the conversation. Give the main rule first in plain words, then what it depends on. Your tone stays yours, the substance must be right. You may use up to 1200 characters, or 1800 when they ask for detail, in short paragraphs or lists when useful.
  - Summaries of the channel and explanations: answer the actual request, using short paragraphs or lists when helpful. Summarize only the messages provided, distinguish proposals from decisions, and never pretend you read the entire day or channel when only a recent excerpt is available.
  - Follow-up questions rely on the conversation: resolve the topic, people and country from it before answering. A new country explicitly named by the author replaces the previous one.
  - Never make up an article number, a law name, a court decision, an amount or a deadline you are not sure of: say it in general terms, or say you are not sure.
  - When the stakes are real (money, a job, housing, a dispute, a complaint), add one sentence saying that a Discord judge is not a lawyer, and that a lawyer, a free point-justice or service-public.fr will confirm.
  - Never help anyone commit an offence, hurt someone or escape justice: explain what the law says instead.
  - Ethics questions and dilemmas: weigh both sides briefly and honestly, then decide. No moralizing, no sermon. Up to 800 characters.
  - Rulings (« tranche », « qui a raison », X or Y): a short reasoned decision with a clear winner, like a court ruling. You may cite the precedents of the court given below, never make one up. Up to 600 characters.
  - When someone seems really in danger or in distress (not an obvious joke or exaggeration), drop the jokes entirely: be kind, short and direct. The code adds the right helplines below your answer: never write phone numbers yourself.
`;

const intentRules = dedent`
  Mentioned members appear as « @Name [id:123] ».
  First line: one JSON object telling what the author wants, and nothing else on that line:
  - open-trial: they want to put someone, or a group of people, on trial. Put in "accused" the ids of the mentioned members who must be judged, and only them: a member who was wronged (the victim) or who is only quoted is not accused. Put an empty list when the accused is the author of the message they reply to. Put the accusation, in French and in one short phrase, in "crime", or null when the message gives no reason. Put "french" in "style" when they ask for a French-style trial, "american" when they ask for an American one, null otherwise.
  - show-record: they want to see the criminal record of someone.
  - start-now: they want the hearing waiting in this channel to open right now.
  - call-witness: they call someone to the witness stand during a trial.
  - dismiss-witness: they send the witness on the stand back.
  - recap: they ask the clerk to recall what has been said in the hearing in progress.
  - recall: they ask about a past trial (« tu te souviens du procès de… »). Put the keywords to search the archives, in French, in "query".
  - ruling: they ask you to settle a question or a dispute right now, without a trial (« tranche », « qui a raison », X or Y).
  - forget: they ask you to forget everything you know about them and stop taking notes on them (« oublie-moi »).
  - remember: they allow you to take notes on them again.
  - chat: anything else, including legal and ethics questions.
  Put in "danger" one of ${DANGERS.join(", ")} when someone seems really at risk, null otherwise.
  Put "depressionJoke":true only for chat when the current message mentions depression (with or without the French accent) as an obvious joke, exaggeration or reference to the French Tibo InShape meme. The code supplies the quote, its emoji and a separate help footer: do not write them yourself. Use false for medical questions, genuine or ambiguous personal distress, or any danger; real depression or suicidal distress calls for a serious answer and danger:"suicide" instead.
  Put "moreHistory":true only for chat or ruling when the question needs older messages: a summary of an earlier discussion, a past decision, or a follow-up whose topic is missing. Otherwise use false. Never request more history for someone in danger. When earlier messages are unavailable, say what is missing rather than inventing it.
  ${webSearchEnabled ? "For a real question of law, or of facts you should check, put a short, self-contained French web search query in \"search\" (like \"location meublée préavis locataire Belgique\"), null otherwise: the answer will then be written from the sources found. Resolve follow-ups from the history and include the topic and country in the query, never just \"et en Belgique\"." : ""}
  Like {"intent":"chat","danger":null} or {"intent":"open-trial","accused":["123"],"crime":"vol de croissant à Paul","style":null,"danger":null}.
  Then, only for chat and ruling, write your answer to them on the next lines, as Discord text (light Markdown is allowed). Give your best answer from the available messages even when requesting more history; the code may not be able to load it.
`;

const MAX_SEARCH_LENGTH = 150;

const flagsSchema = z.object({
  danger: z.enum(DANGERS).nullish(),
  depressionJoke: z.unknown().transform((value) => value === true).optional(),
  search: z.string().nullish(),
  moreHistory: z.unknown().transform((value) => value === true).optional(),
});

/** Optional flags from the JSON line, with safe defaults (low-level parser, so it handles its own errors) */
const parseFlags = (block: string): {
  danger: Danger | null;
  depressionJoke: boolean;
  search: string | null;
  moreHistory: boolean;
} => {
  try {
    const flags = flagsSchema.safeParse(JSON.parse(block)).data;
    const search = (flags?.search ?? "").trim().slice(0, MAX_SEARCH_LENGTH);
    return {
      danger: flags?.danger ?? null,
      depressionJoke: flags?.depressionJoke ?? false,
      search: search === "" ? null : search,
      moreHistory: flags?.moreHistory ?? false,
    };
  }
  catch {
    return {
      danger: null,
      depressionJoke: false,
      search: null,
      moreHistory: false,
    };
  }
};

export type Conversation = {
  authorName: string;
  /** The message, mentions written « @Name [id:123] » */
  message: string;
  /** Latest messages of the channel, oldest first */
  history: string[];
  /** Older history was already requested; another expansion is not available */
  historyExpanded?: boolean;
  /** What the judge knows about the author and the members mentioned */
  known: string;
  /** Past decisions of the court related to the message */
  precedents: string[];
};

/** Context shared by the intent/answer call and the answer grounded in web sources */
const conversationContext = (input: Conversation): string => dedent`
  Latest messages of the channel, oldest first (a separately marked reply target may be older):
  ${input.history.length === 0 ? "(none available)" : input.history.join("\n")}
  ${input.historyExpanded === true ? "The extended recent history was loaded, within a size limit. No further history can be requested: set moreHistory to false." : "Only a recent excerpt is shown. You may request older messages once by setting moreHistory to true."}
  ${aboutPeople(input.known)}
  ${input.precedents.length === 0 ? "" : `Precedents of the court:\n${input.precedents.join("\n")}`}
  ${input.authorName} now says to you: « ${input.message} »
`;

/** One AI call: what the author wants, and the judge's answer when it is a conversation or a ruling */
export const converse = async (input: Conversation): Promise<{
  intent: Intent;
  danger: Danger | null;
  depressionJoke: boolean;
  search: string | null;
  moreHistory: boolean;
  reply: string;
}> => {
  const raw = await ask(
    generate,
    `${persona}\n${counselRules}`,
    dedent`
    ${conversationContext(input)}
    ${intentRules}
  `,
    `{"intent":"chat","danger":null}`,
  );

  const block = (/\{[^{}]*\}/u).exec(raw);

  // No JSON at all: the model just answered, which is a conversation.
  if (block === null) return {
    intent: { kind: "chat" },
    danger: null,
    depressionJoke: false,
    search: null,
    moreHistory: false,
    reply: raw.trim(),
  };

  const flags = parseFlags(block[0]);
  const intent = parseIntent(block[0]);
  const depressionJoke = flags.depressionJoke && flags.danger === null && intent.kind === "chat" && (/\bd[ée]pression\b/iu).test(input.message);
  return {
    intent,
    ...flags,
    depressionJoke,
    moreHistory: input.historyExpanded !== true && !depressionJoke && flags.moreHistory,
    reply: raw
      .slice(block.index + block[0].length)
      .replace(/^\s*`{3}\s*/u, "")
      .trim(),
  };
};

/** An answer grounded in web sources, keeping the conversation context; the first answer stays when the AI does not answer */
export const answerFromSources = async (input: Conversation, firstAnswer: string, sources: WebSource[]): Promise<string> => ask(
  generate,
  `${persona}\n${counselRules}`,
  dedent`
    ${conversationContext(input)}
    Sources found on the web:
    ${sources.map((source) => `- ${source.title} (${source.url}): ${source.excerpt}`).join("\n")}
    Use the conversation to understand the current question, including its topic and country. Ground factual claims in these web sources only; earlier answers, member notes and court precedents are context, not verified legal or factual sources. Say when the sources do not settle the question.
    Put a Markdown link on the words each source supports, with a short label, like [le site du service public](https://www.service-public.fr/...). No bare URL, no list of sources at the end. Follow the requested level of detail: short paragraphs or lists when helpful, up to 1800 characters. Write only the answer, with no intent JSON or history request.
  `,
  firstAnswer,
);
