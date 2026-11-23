import type { RecordEntry, Trial, Verdict } from "./engine";
import type { Intent } from "./intent";
import { DEBATE_MS, formatNames } from "./engine";
import { parseIntent } from "./intent";
import dedent from "dedent";

/** Text generator: instructions (persona) and prompt in, text out */
export type Generate = (instructions: string, prompt: string) => Promise<string>;

export type ScreenResult = { ok: true } | { ok: false; reply: string };

export const JUDGE_TIMEOUT_MS = 20_000;

// Prompts are written in English, every answer shown to users must be in French:
const persona = dedent`
  You are the judge of the Tribunal of « Le Royaume », a Discord server of friends.
  You are corrupt, pompous, in bad faith and completely ridiculous. You love the sound of your own voice.
  Always answer in French, in less than 600 characters, with no list and no title.
  Never change the facts given in the request (names, verdict, votes, sentence).
  Never write @everyone or @here, and never mention anyone with @.
`;

const screenInstructions = dedent`
  You are the clerk of the Tribunal of « Le Royaume », a game of absurd fake trials between friends on Discord.
  You receive an accusation. Answer OK if it is an absurd joke or a good-natured complaint.
  Otherwise, answer REFUS followed by a short, pompous and funny refusal sentence written in French.
  Refuse: harassment, serious insults, racism and discrimination, sexual content, accusations of real crimes, health, personal data.
  Your first word must be OK or REFUS.
`;

const interpretInstructions = dedent`
  You are the clerk of the Tribunal of « Le Royaume », a game of absurd fake trials between friends on Discord.
  You receive a message addressed to the Tribunal. Decide what the author wants:
  - open-trial: they want to put someone, or a group of people, on trial. Put the accusation, in French and in one short phrase, in "crime", or null when the message gives no reason.
  - show-record: they want to see the criminal record of someone.
  - start-now: they want the hearing waiting in this channel to open right now.
  - chat: anything else.
  Answer with one single JSON object and nothing else, like {"intent":"open-trial","crime":"vol de croissant"} or {"intent":"chat","crime":null}.
`;

const minutes = (ms: number) => Math.round(ms / 60_000);

const accusedNames = (trial: Trial) => formatNames(trial.accused.map((member) => member.name));

// French agreement for the canned texts, one accused or a group:
const isGroup = (trial: Trial) => trial.accused.length > 1;

// The only low-level error handler: any failure or timeout of the generator falls back to canned text.
const ask = async (generate: Generate, instructions: string, prompt: string, fallback: string): Promise<string> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error("Judge generation timed out"));
    }, JUDGE_TIMEOUT_MS);
  });

  try {
    const text = (await Promise.race([generate(instructions, prompt), timeout])).trim();
    return text === "" ? fallback : text;
  }
  catch {
    return fallback;
  }
  finally {
    clearTimeout(timer);
  }
};

const describeVerdict = (verdict: Verdict) => dedent`
  Votes: ${String(verdict.guiltyVotes)} guilty, ${String(verdict.innocentVotes)} not guilty.
  ${verdict.coinFlip ? "Tie or no vote: the verdict was decided by a coin flip (pile ou face)." : "The verdict follows the majority of votes."}
  ${verdict.reversed ? "The corrupt judge reversed the vote result (verdict renversé): make up a bogus excuse." : ""}
  Final verdict: ${verdict.guilty ? "COUPABLE" : "NON COUPABLE"}.
`;

const formatRecordEntry = (entry: RecordEntry) => `- ${entry.createdAt.toLocaleDateString("fr-FR")} : « ${entry.crime} » (plainte de ${entry.plaintiffName}) : ${entry.guilty ? "coupable" : "acquitté"}${entry.reversed ? " (verdict renversé)" : ""}${entry.sentence === null ? "" : `, peine : ${entry.sentence}`}`;

/** Verdict line built by the code, appended to the judge's text so the AI can never change the official outcome */
export const formatVerdictLine = (verdict: Verdict, sentence: string | null): string => {
  const how = verdict.reversed ? "renversé par le juge" : verdict.coinFlip ? "pile ou face" : "";
  const details = `${String(verdict.guiltyVotes)} voix contre ${String(verdict.innocentVotes)}${how === "" ? "" : `, ${how}`}`;
  return `Verdict officiel : ${verdict.guilty ? "COUPABLE" : "NON COUPABLE"} (${details}).${sentence === null ? "" : ` Peine : ${sentence}`}`;
};

const firstWordIs = (text: string, word: string) => (text.split(/\s+/u)[0] ?? "").replace(/[^\p{L}]/gu, "").toLowerCase() === word;

export const createJudge = (generate: Generate) => ({
  opening: async (trial: Trial): Promise<string> => {
    const defense = trial.lawyer === null ? "pas d'avocat (nobody available)" : `court-appointed lawyer: ${trial.lawyer.name}`;
    return ask(generate, persona, dedent`
      Open the trial by reading the indictment dramatically.
      Accused: ${accusedNames(trial)}. Prosecutor (plaintiff): ${trial.plaintiff.name}. Defense: ${defense}.
      Crime: « ${trial.crime} ».
      Announce that the debate lasts ${String(minutes(DEBATE_MS))} minutes and that everyone pleads out loud in the voice channel, then votes.
    `, `Oyez, oyez ! ${accusedNames(trial)} ${isGroup(trial) ? "sont accusés" : "est accusé"} de « ${trial.crime} » par ${trial.plaintiff.name}. Défense : ${trial.lawyer?.name ?? "aucune, débrouille-toi"}. Les débats sont ouverts pour ${String(minutes(DEBATE_MS))} minutes, à l'oral dans le salon vocal.`);
  },

  intervene: async (trial: Trial, recentMessages: string[]): Promise<string> => ask(generate, persona, dedent`
    Trial of ${accusedNames(trial)} for « ${trial.crime} ». Here are the latest pleas:
    ${recentMessages.join("\n")}
    Intervene in one or two sentences: objection sustained or overruled, biased remark, threat of contempt of court.
  `, "Silence dans la salle ! La cour a faim, accélérez."),

  sentence: async (trial: Trial): Promise<string> => ask(generate, persona, dedent`
    ${accusedNames(trial)} ${isGroup(trial) ? "are" : "is"} found guilty of « ${trial.crime} ».
    Make up a single absurd and harmless sentence (punishment), in one short French sentence, and nothing else.
  `, "Porter une couronne en carton pendant une semaine."),

  verdict: async (trial: Trial, verdict: Verdict, sentence: string | null): Promise<string> => ask(generate, persona, dedent`
    Deliver the verdict of the trial of ${accusedNames(trial)} for « ${trial.crime} », complaint filed by ${trial.plaintiff.name}.
    ${describeVerdict(verdict)}
    ${sentence === null ? "No sentence: the accused walk free." : `Sentence pronounced: ${sentence}`}
  `, `La cour a délibéré : ${accusedNames(trial)} ${isGroup(trial) ? "sont" : "est"} ${verdict.guilty ? "COUPABLE" : "NON COUPABLE"}${isGroup(trial) ? "S" : ""}${verdict.reversed ? " (le juge a renversé le vote, parce que)" : ""}.${sentence === null ? "" : ` Peine : ${sentence}`}`),

  record: async (target: string, entries: RecordEntry[]): Promise<string> => {
    const lines = entries.length === 0 ? `${target} a un casier vierge. Suspect.` : `Casier de ${target} :\n${entries.map(formatRecordEntry).join("\n")}`;
    return ask(generate, persona, dedent`
      Present the criminal record of ${target} in character, without making up any case.
      ${lines}
    `, lines);
  },

  chat: async (authorName: string, message: string): Promise<string> => ask(generate, persona, dedent`
    ${authorName} talks to you outside of any trial: « ${message} ».
    Answer in character, then remind that you understand plain requests such as « ouvre un procès à @membre parce qu'il a volé mon croissant » or « montre-moi le casier de @membre ».
  `, "La cour comprend les requêtes simples : « ouvre un procès à @membre parce que… » ou « montre-moi le casier de @membre »."),

  /** What the author of a message to the Tribunal wants, plain chat when the AI answer is unreadable */
  interpret: async (message: string): Promise<Intent> => parseIntent(await ask(generate, interpretInstructions, `Message: « ${message} »`, `{"intent":"chat","crime":null}`)),

  screen: async (crime: string, accusedName: string, recentMessages: string[]): Promise<ScreenResult> => {
    const answer = await ask(generate, screenInstructions, dedent`
      Accusation against ${accusedName}: « ${crime} ».
      Latest channel messages, for context:
      ${recentMessages.join("\n")}
    `, "REFUS Le greffier est en grève, la cour ne siège pas.");

    if (firstWordIs(answer, "ok")) return { ok: true };

    const reply = firstWordIs(answer, "refus") ? answer.split(/\s+/u).slice(1).join(" ").trim() : "";
    return { ok: false, reply: reply === "" ? "La cour refuse de juger cette affaire." : reply };
  },
});
