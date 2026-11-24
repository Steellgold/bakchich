import type { Gravity, Member, ObjectionRuling, RecordEntry, Trial, Verdict } from "./engine";
import type { Intent } from "./intent";
import { JUDGE_NAME } from "../room/layout";
import { debateMs, formatNames } from "./engine";
import { parseIntent } from "./intent";
import dedent from "dedent";

/** Text generator: instructions (persona) and prompt in, text out */
export type Generate = (instructions: string, prompt: string) => Promise<string>;

export type ScreenResult = {
  ok: true;
  gravity: Gravity;
} | {
  ok: false;
  reply: string;
};

export const JUDGE_TIMEOUT_MS = 20_000;

// How to name the server in French: the article is optional and contracts like any noun.
const ROYAUME_NAMING
  = "The Discord server is called the Royaume: in French write « le Royaume », « du Royaume », « au Royaume » (or just « Royaume »), never « de Le Royaume » or « à Le Royaume ».";

// Prompts are written in English, every answer shown to users must be in French:
const persona = dedent`
  You are ${JUDGE_NAME}, the judge of the Tribunal of the Royaume, a Discord server of friends who put each other on trial for absurd crimes.
  Who you are:
  - A stocky man in his sixties: a powdered wig that is slightly too big and slips, a white handlebar mustache, thick dark eyebrows, half-closed eyes, a purple robe and a gavel you never let go of.
  - Clumsy: you lose your notes, mix up names now and then, bang the gavel at the wrong moment, and doze off during long pleas.
  - Good at: reading a room, quick comebacks, and above all knowing everybody: you never forget a face, a joke, an insult, a quirk or a past trial, and you use it to handle each person the way that works on them.
  - Flaws: lazy, a bit corrupt (croissants and flattery work on you), a sore loser, slightly vain about your mustache.
  How you talk:
  - Like a regular member of the server who happens to be the judge: casual, short, dry humor, tutoiement with members.
  - No grand speeches, no theatrical narration, no « Oyez », no role-play actions between asterisks, no titles like « Votre Juge ». One or two sentences in a normal chat, a little more only when you deliver a trial moment.
  - Your personality shows in small details, never in self-description: do not introduce yourself or list your qualities.
  Always answer in French, in less than 400 characters, with no list, no title and no emoji.
  Never change the facts given in the request (names, verdict, votes, sentence).
  Never write @everyone or @here, and never mention anyone with @.
  ${ROYAUME_NAMING}
`;

const clerkPersona = dedent`
  You are the clerk (greffier) of the Tribunal of the Royaume, a game of absurd fake trials between friends on Discord.
  You are overworked, dry and precise, with a deadpan humor. You only tell what is written in the records you are given, and never make anything up.
  Always answer in French, in less than 700 characters, with no title and no emoji.
  Never write @everyone or @here, and never mention anyone with @.
  ${ROYAUME_NAMING}
`;

const screenInstructions = dedent`
  You are the clerk of the Tribunal of the Royaume, a game of absurd fake trials between friends on Discord.
  ${ROYAUME_NAMING}
  You receive an accusation. If it is an absurd joke or a good-natured complaint, answer OK followed by its gravity in the game: LIGHT (a trifle), ORDINARY, or SERIOUS (a scandal worthy of the assizes, still in jest).
  Otherwise, answer REFUS followed by a short, dry and funny refusal sentence, written like a normal chat message written in French, with no emoji.
  Refuse: harassment, serious insults, racism and discrimination, sexual content, accusations of real crimes, health, personal data.
  Your first word must be OK or REFUS, like "OK LIGHT" or "REFUS La cour ne juge pas ça.".
`;

const defenseInstructions = dedent`
  You are the court-appointed defense lawyer in a ridiculous fake trial between friends on a Discord server: a bit too eager and of dubious competence, but you talk like a normal person, with short sentences, no grand speech and no role-play narration.
  Always answer in French, in less than 500 characters, with no list, no title and no emoji.
  Never write @everyone or @here, and never mention anyone with @.
  ${ROYAUME_NAMING}
`;

const interpretInstructions = dedent`
  You are the clerk of the Tribunal of the Royaume, a game of absurd fake trials between friends on Discord.
  ${ROYAUME_NAMING}
  You receive a message addressed to the Tribunal. Decide what the author wants:
  Mentioned members appear as « @Name [id:123] ».
  - open-trial: they want to put someone, or a group of people, on trial. Put in "accused" the ids of the mentioned members who must be judged, and only them: a member who was wronged (the victim) or who is only quoted is not accused. Put an empty list when the accused is the author of the message they reply to. Put the accusation, in French and in one short phrase, in "crime", or null when the message gives no reason. Put "french" in "style" when they ask for a French-style trial, "american" when they ask for an American one, null otherwise.
  - show-record: they want to see the criminal record of someone.
  - start-now: they want the hearing waiting in this channel to open right now.
  - call-witness: they call someone to the witness stand during a trial.
  - dismiss-witness: they send the witness on the stand back.
  - recap: they ask the clerk to recall what has been said in the hearing in progress.
  - recall: they ask about a past trial (« tu te souviens du procès de… »). Put the keywords to search the archives, in French, in "query".
  - chat: anything else.
  Answer with one single JSON object and nothing else, like {"intent":"open-trial","accused":["123"],"crime":"vol de croissant à Paul","style":null} or {"intent":"recall","query":"croissant"} or {"intent":"chat"}.
`;

const minutes = (ms: number) => Math.round(ms / 60_000);

const accusedNames = (trial: Trial) => formatNames(trial.accused.map((member) => member.name));

// French agreement for the canned texts, one accused or a group:
const isGroup = (trial: Trial) => trial.accused.length > 1;

const MODE_TEXT: Record<Trial["mode"], string> = {
  jury: "devant le jury populaire",
  bench: "par le juge seul",
  assizes: "aux assises, où la voix du juge compte triple",
};

const STYLE_TEXT: Record<Trial["style"], string> = {
  american: "à l'américaine (objections et contre-interrogatoires)",
  french: "à la française (le juge mène les débats)",
};

// The only low-level error handler: any failure or timeout of the generator falls back to canned text.
const ask = async (generate: Generate, instructions: string, prompt: string, fallback: string): Promise<string> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error("Judge generation timed out"));
    }, JUDGE_TIMEOUT_MS);
  });

  try {
    const text = (
      await Promise.race([
        generate(instructions, prompt),
        timeout,
      ])
    ).trim();
    return text === "" ? fallback : text;
  }
  catch {
    return fallback;
  }
  finally {
    clearTimeout(timer);
  }
};

const describeVerdict = (verdict: Verdict) => {
  if (verdict.mode === "bench") return `The judge decided alone. Final verdict: ${verdict.guilty ? "COUPABLE" : "NON COUPABLE"}.`;

  return dedent`
    Votes: ${String(verdict.guiltyVotes)} guilty, ${String(verdict.innocentVotes)} not guilty${verdict.mode === "assizes" ? " (the judge's vote counts as three)" : ""}.
    ${verdict.coinFlip ? "Tie or no vote: the verdict was decided by a coin flip (pile ou face)." : "The verdict follows the majority of votes."}
    ${verdict.reversed ? "The corrupt judge reversed the vote result (verdict renversé): make up a bogus excuse." : ""}
    Final verdict: ${verdict.guilty ? "COUPABLE" : "NON COUPABLE"}.
  `;
};

const formatRecordEntry = (entry: RecordEntry) => `- ${entry.createdAt.toLocaleDateString("fr-FR")} : « ${entry.crime} » (plainte de ${entry.plaintiffName}) : ${entry.guilty ? "coupable" : "acquitté"}${entry.reversed ? " (verdict renversé)" : ""}${entry.sentence === null ? "" : `, peine : ${entry.sentence}`}`;

/** How the verdict was reached, written by the code */
export const verdictDetails = (verdict: Verdict): string => {
  if (verdict.mode === "bench") return "décidé par le juge seul";

  const how = verdict.reversed ? ", renversé par le juge" : verdict.coinFlip ? ", tiré à pile ou face" : "";
  return `${String(verdict.guiltyVotes)} coupable, ${String(verdict.innocentVotes)} non coupable${verdict.mode === "assizes" ? " (juge compris)" : ""}${how}`;
};

/** Verdict line built by the code, so the AI can never change the official outcome */
export const formatVerdictLine = (verdict: Verdict, sentence: string | null): string => `Verdict officiel : ${verdict.guilty ? "COUPABLE" : "NON COUPABLE"} (${verdictDetails(verdict)}).${sentence === null ? "" : ` Peine : ${sentence}`}`;

const firstWord = (text: string) => (text.split(/\s+/u)[0] ?? "").replace(/[^\p{L}]/gu, "").toLowerCase();

const gravities: Record<string, Gravity> = {
  light: "light",
  ordinary: "ordinary",
  serious: "serious",
};

/** What the judge remembers about the people involved, written by the clerk from what they said; nothing when he knows nobody */
const aboutPeople = (known: string) => known === "" ? "" : `What you know about the people involved (use it to handle them, tease them or adapt your tone; never quote it as a file):\n${known}`;

const profileInstructions = dedent`
  You are the clerk of the Tribunal of the Royaume, a Discord server of friends. You keep the file the judge reads on each member, so he never forgets anyone.
  Write short French notes, separated by « ; »: temperament, sense of humor, how they talk, habits and quirks, recurring topics, people they tease or defend, memorable actions, and how to handle them.
  Keep what still holds from the current notes, add what the new messages show, drop what they contradict. At most 600 characters, no list, no title, no emoji.
  Never note health, sexuality, religion, politics, real-life addresses or other sensitive personal data, even if mentioned.
  ${ROYAUME_NAMING}
`;

export const createJudge = (generate: Generate) => ({
  /** The clerk updates the notes on a member from their latest messages; empty when the AI does not answer (the old notes stay) */
  profile: async (name: string, current: string, lines: string[]): Promise<string> => ask(
    generate,
    profileInstructions,
    dedent`
    Member: ${name}.
    Current notes: ${current === "" ? "(none yet)" : current}
    Latest messages:
    ${lines.join("\n")}
  `,
    "",
  ),

  opening: async (trial: Trial, known: string): Promise<string> => ask(
    generate,
    persona,
    dedent`
    Open the trial in a few plain sentences: who is accused of what, by whom, who defends them.
    Accused: ${accusedNames(trial)}. Prosecutor (plaintiff): ${trial.plaintiff.name}. Defense: ${trial.lawyer?.name ?? "nobody, the accused defend themselves"}.
    Crime: « ${trial.crime} ».${trial.context === null ? "" : `\nThe message the case is about: ${trial.context}`}
    ${aboutPeople(known)}
    Announce that the trial is judged ${MODE_TEXT[trial.mode]}, in the ${STYLE_TEXT[trial.style]} style, that it lasts about ${String(minutes(debateMs(trial.style)))} minutes, and that everyone pleads out loud in the voice channel when given the floor.
  `,
    `Bon. ${accusedNames(trial)} ${isGroup(trial) ? "sont accusés" : "est accusé"} de « ${trial.crime} » par ${trial.plaintiff.name}. Défense : ${trial.lawyer?.name ?? "aucune, débrouille-toi"}. Procès ${STYLE_TEXT[trial.style]}, jugé ${MODE_TEXT[trial.mode]}. On plaide de vive voix, quand la cour donne la parole.`,
  ),

  /** French style: the judge questions the accused before anyone else speaks */
  question: async (trial: Trial): Promise<string> => ask(
    generate,
    persona,
    dedent`
    French-style trial of ${accusedNames(trial)} for « ${trial.crime} ».${trial.context === null ? "" : `\nThe message the case is about: ${trial.context}`}
    Question the accused yourself, in two sentences at most: one biased, absurd question they must answer out loud.
  `,
    `${accusedNames(trial)}, expliquez à la cour, et vite, pourquoi vous avez osé.`,
  ),

  /** Reaction to the latest lines heard in the hearing */
  intervene: async (trial: Trial, recentLines: string, known: string): Promise<string> => ask(
    generate,
    persona,
    dedent`
    Trial of ${accusedNames(trial)} for « ${trial.crime} ». Here is what was just said out loud:
    ${recentLines}
    ${aboutPeople(known)}
    Intervene in one or two sentences: biased remark, call to order, threat of contempt of court.
  `,
    "Silence dans la salle ! La cour a faim, accélérez.",
  ),

  objection: async (trial: Trial, objector: Member, ruling: ObjectionRuling): Promise<string> => ask(
    generate,
    persona,
    dedent`
    ${objector.name} raised an objection in the trial of ${accusedNames(trial)}. The court decided: objection ${ruling === "sustained" ? "sustained (retenue)" : "overruled (rejetée)"}.
    Rule on it in one short sentence, with a bogus reason.
  `,
    ruling === "sustained" ? "Objection retenue. Parce que la cour le veut bien." : "Objection rejetée. La cour n'a pas envie.",
  ),

  /** Statement of the AI lawyer, from what the accused told it before the trial */
  defense: async (trial: Trial, context: string[], stage: "opening" | "closing"): Promise<string> => ask(
    generate,
    defenseInstructions,
    dedent`
    You defend ${accusedNames(trial)}, accused of « ${trial.crime} » by ${trial.plaintiff.name}.
    What your ${isGroup(trial) ? "clients" : "client"} told you before the trial:
    ${context.length === 0 ? "(nothing, improvise)" : context.join("\n")}
    ${stage === "opening" ? "Give your opening statement." : `Give your closing statement and ask ${trial.mode === "bench" ? "the judge" : "the jury"} for an acquittal.`}
    Never contradict what you were told.
  `,
    stage === "opening" ? "Votre Honneur, mes clients sont innocents, et je le prouverai, ou à défaut je le crierai !" : "Acquittez-les, ou j'invoque le droit de bouder.",
  ),

  /** The judge's own vote (judge alone or assizes), from the transcript: true means guilty, null when the AI does not answer */
  decide: async (trial: Trial, transcript: string): Promise<boolean | null> => {
    const answer = await ask(
      generate,
      persona,
      dedent`
      You must decide the trial of ${accusedNames(trial)} for « ${trial.crime} », filed by ${trial.plaintiff.name}.
      What was said in the hearing:
      ${transcript === "" ? "(nothing at all)" : transcript}
      Answer with one word: COUPABLE or INNOCENT. Be as biased as you like.
    `,
      "",
    );

    if (firstWord(answer) === "coupable") return true;
    if (firstWord(answer) === "innocent") return false;

    return null;
  },

  /** Wording of an enforced sentence: the phrase to end or start every message with, and a matching emoji, as one JSON object (validated by the code) */
  penaltyWording: async (trial: Trial, kind: "suffix" | "prefix"): Promise<string> => ask(
    generate,
    persona,
    dedent`
    ${accusedNames(trial)} ${isGroup(trial) ? "are" : "is"} found guilty of « ${trial.crime} ».
    For a while, they must ${kind === "suffix" ? "end" : "start"} every Discord message with an absurd French phrase that you make up, linked to the crime, 2 to 6 words, letters only (like « avec ce doux fromage » or « Votre Honneur, »).
    Pick one emoji that matches the phrase.
    Answer with one single JSON object and nothing else, like {"text":"avec ce doux fromage","emoji":"🧀"}.
  `,
    "",
  ),

  verdict: async (trial: Trial, verdict: Verdict, sentence: string | null, known: string): Promise<string> => ask(
    generate,
    persona,
    dedent`
    Deliver the verdict of the trial of ${accusedNames(trial)} for « ${trial.crime} », complaint filed by ${trial.plaintiff.name}.
    ${describeVerdict(verdict)}
    ${sentence === null ? "No sentence: the accused walk free." : `Sentence pronounced: ${sentence}`}
    ${aboutPeople(known)}
    Do not repeat the sentence word for word: it is written below your speech.
  `,
    `La cour a délibéré : ${accusedNames(trial)} ${isGroup(trial) ? "sont" : "est"} ${verdict.guilty ? "COUPABLE" : "NON COUPABLE"}${isGroup(trial) ? "S" : ""}${verdict.reversed ? " (le juge a renversé le vote, parce que)" : ""}.`,
  ),

  /** The case file of a finished trial, written by the clerk from the transcript */
  summary: async (trial: Trial, transcript: string, verdict: Verdict, sentence: string | null): Promise<string | null> => {
    if (transcript === "") return null;

    const text = await ask(
      generate,
      clerkPersona,
      dedent`
      Write the case file of the trial of ${accusedNames(trial)} for « ${trial.crime} », filed by ${trial.plaintiff.name}: what happened and the key arguments of each side, in a short paragraph.
      Transcript:
      ${transcript}
      Verdict: ${verdict.guilty ? "coupable" : "non coupable"}.${sentence === null ? "" : ` Peine : ${sentence}`}
    `,
      "",
    );
    return text === "" ? null : text;
  },

  /** The clerk recalls what has been said in the hearing in progress, from the transcript only */
  recap: async (trial: Trial, transcript: string): Promise<string> => ask(
    generate,
    clerkPersona,
    dedent`
    Recall the hearing in progress against ${accusedNames(trial)} for « ${trial.crime} » (« il y a eu ceci, puis cela »), from this transcript only:
    ${transcript === "" ? "(nothing written yet)" : transcript}
  `,
    transcript === "" ? "Le greffier n'a encore rien noté. Il attend qu'on dise quelque chose d'intelligent." : "Le greffier a tout noté, mais sa main tremble : relisez le registre.",
  ),

  /** The clerk answers about past trials, from the case files found in the archives */
  recall: async (question: string, caseFiles: string[]): Promise<string> => ask(
    generate,
    clerkPersona,
    dedent`
    A member asks about the archives: « ${question} ».
    Case files found:
    ${caseFiles.length === 0 ? "(none)" : caseFiles.join("\n\n")}
    Answer from these files only. If there is none, say the archives have nothing on it.
  `,
    caseFiles.length === 0 ? "Les archives n'ont rien là-dessus. Le greffier a cherché, promis." : caseFiles.join("\n\n"),
  ),

  /** A rumor whispered about a member in the courtroom: absurd, harmless, made up */
  rumor: async (target: string): Promise<string> => ask(
    generate,
    persona,
    dedent`
    Whisper an absurd and harmless made-up rumor about ${target}, a member of the court audience, in one short sentence starting with « Il paraît que ».
  `,
    `Il paraît que ${target} a soudoyé le juge avec un croissant.`,
  ),

  record: async (target: string, entries: RecordEntry[], dossier: string, known: string): Promise<string> => {
    const lines = entries.length === 0 ? `${target} a un casier vierge. Suspect.` : `Casier de ${target} :\n${entries.map(formatRecordEntry).join("\n")}`;
    return ask(
      generate,
      persona,
      dedent`
      Present the criminal record of ${target} in character, without making up any case.
      ${lines}
      ${dossier}
      ${aboutPeople(known)}
    `,
      `${lines}\n${dossier}`,
    );
  },

  chat: async (authorName: string, message: string, known: string): Promise<string> => ask(
    generate,
    persona,
    dedent`
    ${authorName} talks to you outside of any trial: « ${message} ».
    ${aboutPeople(known)}
    Answer them like in a normal chat, briefly, the way that suits who they are.
    Only if they ask what you can do, or seem lost, say you understand plain requests such as « ouvre un procès à @membre parce qu'il a volé mon croissant », « montre-moi le casier de @membre » or « tu te souviens du procès de @membre ? ».
  `,
    "Hm ? Pardon, je somnolais. Si tu veux un procès, dis-moi juste qui et pourquoi.",
  ),

  /** What the author of a message to the Tribunal wants, plain chat when the AI answer is unreadable */
  interpret: async (message: string): Promise<Intent> => parseIntent(await ask(generate, interpretInstructions, `Message: « ${message} »`, `{"intent":"chat"}`)),

  screen: async (crime: string, accusedName: string, recentMessages: string[]): Promise<ScreenResult> => {
    const answer = await ask(
      generate,
      screenInstructions,
      dedent`
      Accusation against ${accusedName}: « ${crime} ».
      Latest channel messages, for context:
      ${recentMessages.join("\n")}
    `,
      "REFUS Le greffier est en grève, la cour ne siège pas.",
    );

    const words = answer.split(/\s+/u);

    if (firstWord(answer) === "ok") return {
      ok: true,
      gravity: gravities[firstWord(words[1] ?? "")] ?? "ordinary",
    };

    const reply = firstWord(answer) === "refus" ? words.slice(1).join(" ").trim() : "";
    return {
      ok: false,
      reply: reply === "" ? "La cour refuse de juger cette affaire." : reply,
    };
  },
});
