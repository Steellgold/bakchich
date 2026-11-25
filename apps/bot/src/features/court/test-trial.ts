import type { CourtEvent, Member, Phase, Trial } from "./engine";
import { court, generate, judge } from "./court";
import { AI_LAWYER, formatNames, isTest } from "./engine";
import { ask } from "./judge";
import { TEST_JURORS, TEST_PERSONAS, TEST_TIMING } from "./test-config";
import { CLERK, fetchTranscript, formatTranscript } from "#/features/clerk/clerk";
import { hasPendingHearing } from "#/features/hearings/hearings";
import { fetchDiscordSendableChannel, sendSafeMessage } from "#/integrations/discord";
import { trigger } from "#/utils/trigger";
import dedent from "dedent";

const TEST_CRIME = "avoir volé le dernier croissant du Royaume";

const personaInstructions = (speaker: Member) => dedent`
  You play ${speaker.name} in a ridiculous fake trial between friends on a Discord server, for a test of the bot.
  Always answer in French, in one or two short sentences, with no emoji, no title and no role-play narration.
  Never write @everyone or @here, and never mention anyone with @.
`;

/** A virtual party says something: written in the text channel, typed by the clerk, bubble in the courtroom. The AI writes it, a canned line covers a failure. */
const sayAs = async (trial: Trial, speaker: Member, task: string, fallback: string) => {
  const text = await ask(generate, personaInstructions(speaker), `Trial of ${formatNames(trial.accused.map((member) => member.name))}, accused by ${trial.plaintiff.name} of « ${trial.crime} ». ${task}`, fallback);

  // The trial may have ended while the AI was writing:
  if (court.get(trial.channelId) !== trial) return;

  await sendSafeMessage(await fetchDiscordSendableChannel(trial.channelId), `**${speaker.name}** : ${text}`);
  court.say(trial.channelId, speaker.id, text);
};

/** Run something later in the same phase of the same trial, never after it moved on */
const later = (trial: Trial, phase: Phase, delayMs: number, name: string, action: () => Promise<void> | void) => {
  setTimeout(
    trigger.safeListener(name, async () => {
      if (court.get(trial.channelId) === trial && trial.phase === phase) await action();
    }),
    delayMs,
  ).unref();
};

const { accused, prosecutor, witness } = TEST_PERSONAS;

const onPhase = (trial: Trial) => {
  const { phase } = trial;

  if (phase === "prosecution") {
    later(trial, phase, 4000, "Test prosecutor", async () => sayAs(trial, prosecutor, "Make your accusation.", "Votre Honneur, l'accusé a vu le croissant, puis le croissant n'était plus là."));
    // The defense objects while the prosecution has the floor: ruled at random by the code.
    later(trial, phase, 20_000, "Test objection", async () => sayAs(trial, accused, "Object to the prosecution's last claim, saying the word « objection ».", "Objection ! C'est de la pure spéculation."));
  }
  if (phase === "defense") later(trial, phase, 20_000, "Test objection", async () => sayAs(trial, prosecutor, "Object to the defense's last claim, saying the word « objection ».", "Objection ! La défense raconte n'importe quoi."));
  if (phase === "witnesses") later(trial, phase, 4000, "Test witness", () => {
    court.callWitness(trial.channelId, witness, "prosecution");
  });
  if (phase === "closing-prosecution") later(trial, phase, 4000, "Test closing", async () => sayAs(trial, prosecutor, "Give your closing statement.", "Il n'y a plus de croissant, et il y a un coupable. Faites le lien."));
  // The clerk recalls the hearing so far, from the in-memory transcript:
  if (phase === "closing-defense") later(trial, phase, 6000, "Test recap", async () => {
    const text = await judge.recap(trial, formatTranscript(await fetchTranscript(trial.id)));
    await sendSafeMessage(await fetchDiscordSendableChannel(trial.channelId), `**${CLERK.name}** : ${text}`);
    court.say(trial.channelId, CLERK.id, text);
  });
  // Virtual jurors vote: two guilty, two not guilty (the judge's vote weighs three at the assizes).
  if (phase === "vote") later(trial, phase, 5000, "Test votes", () => {
    for (const [index, id] of TEST_JURORS.entries()) court.vote(trial.channelId, id, index % 2 === 0);
  });
};

const onWitness = (trial: Trial, stage: "examination" | "cross") => {
  const { phase } = trial;
  const questioner = stage === "examination" ? prosecutor : accused;

  later(trial, phase, 2000, "Test question", async () => sayAs(trial, questioner, `You question the witness ${witness.name}, who saw the croissant disappear. Ask one question.`, "Où étiez-vous au moment des faits ?"));
  later(trial, phase, 9000, "Test answer", async () => sayAs(trial, witness, "You are on the witness stand: answer the last question, absurdly.", "J'étais là, j'ai tout vu, enfin presque. Il y avait du beurre."));
  // The prosecution objects during the defense's cross-examination:
  if (stage === "cross") later(trial, phase, 18_000, "Test objection", async () => sayAs(trial, prosecutor, "Object to the cross-examination, saying the word « objection ».", "Objection ! Il harcèle mon témoin."));
};

const handleEvent = (event: CourtEvent) => {
  if (!isTest(event.trial)) return;
  if (event.type === "phase") onPhase(event.trial);
  if (event.type === "witness" && event.witness !== null) onWitness(event.trial, event.witness.stage);
};

court.on("event", handleEvent);

/** Open a test trial in a channel: virtual parties, short phases, nothing stored. "busy" when the court is already sitting there. */
export const startTestTrial = (channelId: string): "started" | "busy" => {
  if (court.get(channelId) !== undefined || hasPendingHearing(channelId)) return "busy";

  const trial = court.open({
    channelId,
    accused: [accused],
    plaintiff: prosecutor,
    lawyer: AI_LAWYER,
    crime: TEST_CRIME,
    context: null,
    style: "american",
    mode: "assizes",
    test: TEST_TIMING,
  });

  return trial === "busy" ? "busy" : "started";
};
