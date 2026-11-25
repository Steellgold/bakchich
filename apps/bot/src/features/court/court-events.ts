import type { CourtEvent, Member, Phase, Trial, Verdict } from "#/features/court/engine";
import type { Message } from "discord.js";
import { CLERK, fetchTranscript, forgetTestTranscript, formatTranscript, JUDGE, recordLine } from "#/features/clerk/clerk";
import { court, judge } from "#/features/court/court";
import { AI_LAWYER, debateMs, formatNames, isTest, sideOf, voteMs } from "#/features/court/engine";
import { formatVerdictLine, verdictDetails } from "#/features/court/judge";
import { saveTrial } from "#/features/court/record";
import { TEST_SENTENCE } from "#/features/court/test-config";
import { completeHearing, defenseContextOf, judgeSays, voiceChannelOf } from "#/features/hearings/hearings";
import { sentence as sentenceTrial } from "#/features/penalties/sentencing";
import { knownAbout, noteLine } from "#/features/profiles/profiles";
import { COLOR, discordClient, fetchDiscordSendableChannel, sanitizeDiscordMessage, sendPanel, sendSafeMessage, startDiscordTyping } from "#/integrations/discord";
import { attempt } from "#/utils/attempt";
import { EMOJI } from "#/utils/emojis";
import { env } from "#/utils/env";
import { logger } from "#/utils/logger";
import { trigger } from "#/utils/trigger";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, SectionBuilder, SeparatorSpacingSize, TextDisplayBuilder, ThumbnailBuilder } from "discord.js";

/** Vote message per trial ID, to disable its buttons at the verdict */
const voteMessages = new Map<string, Message>();

// The judge reacts to what is said out loud, but sparingly: the AI quota is shared by the whole server.
const INTERVENE_EVERY_LINES = 6;
const INTERVENE_MIN_GAP_MS = 90_000;
const RECENT_LINES = 8;
const OBJECTION_PATTERN = /\bobjection\b/iu;

/** Lines heard per trial since the judge last intervened, and when */
const heardLines = new Map<
  string,
  {
    lines: string[];
    lastAt: number;
  }
>();

/** Spoken lines are only written in the text channel when the trial has no voice channel to hear them in */
const isHeardOutLoud = (trial: Trial) => voiceChannelOf(trial.channelId) !== null;

const accusedNames = (trial: Trial) => formatNames(trial.accused.map((member) => member.name));

const defenseName = (trial: Trial) => trial.lawyer?.name ?? accusedNames(trial);

/** "2 minutes" or "30 secondes" (a test trial votes in seconds) */
const durationLabel = (ms: number) => ms >= 60_000 ? `${String(Math.round(ms / 60_000))} minutes` : `${String(Math.round(ms / 1000))} secondes`;

const seconds = (trial: Trial) => String(Math.round((trial.phaseEndsAt - Date.now()) / 1000));

/** Members of the trial the judge may know: the accused, the plaintiff, the lawyer and the witnesses */
const partyIds = (trial: Trial) => [...trial.accused, trial.plaintiff, ...(trial.lawyer === null ? [] : [trial.lawyer]), ...trial.witnessesCalled].map((member) => member.id);

/** Name of whoever speaks in a trial: the judge, the clerk, the AI lawyer, a party, or a member of the audience */
const speakerOf = (trial: Trial, speakerId: string | null): Member => {
  if (speakerId === null) return JUDGE;
  if (speakerId === CLERK.id) return CLERK;
  if (speakerId === AI_LAWYER.id) return AI_LAWYER;

  const party = [...trial.accused, trial.plaintiff, ...(trial.lawyer === null ? [] : [trial.lawyer]), ...trial.witnessesCalled].find(
    (member) => member.id === speakerId,
  );
  return (
    party ?? {
      id: speakerId,
      name: discordClient.users.cache.get(speakerId)?.displayName ?? "Quelqu'un",
    }
  );
};

// Building blocks of the Components V2 panels (opening, vote, verdict):
const text = (content: string) => new TextDisplayBuilder().setContent(sanitizeDiscordMessage(content));

const dateLine = () => text(`-# <t:${String(Math.round(Date.now() / 1000))}:f>`);

const caseLine = (trial: Trial) => `**${accusedNames(trial)}**, accusé${trial.accused.length > 1 ? "s" : ""} de « ${trial.crime} »`;

const MODE_LABEL: Record<Trial["mode"], string> = {
  jury: "jury populaire",
  bench: "juge seul",
  assizes: "assises (la voix du juge compte triple)",
};
const STYLE_LABEL: Record<Trial["style"], string> = {
  american: "à l'américaine",
  french: "à la française",
};

/** Avatars shown in the mosaic: four, or three and « +N » */
const MOSAIC_AVATARS = 4;

/** Picture of the accused: their avatar, or with several accused a mosaic drawn by the web app (the first avatar without it) */
const thumbnailOf = async (trial: Trial): Promise<string> => {
  const avatars = await Promise.all(
    trial.accused.map(async (member) => {
      const user = await attempt(async () => discordClient.users.fetch(member.id));
      return user.ok ? user.value.displayAvatarURL({
        extension: "png",
        size: 128,
      }) : "https://cdn.discordapp.com/embed/avatars/0.png";
    }),
  );

  const [first] = avatars;

  if (first === undefined) throw new Error("A trial without accused");
  if (avatars.length === 1 || env.WEB_PUBLIC_URL === "") return first;

  const more = avatars.length > MOSAIC_AVATARS ? avatars.length - (MOSAIC_AVATARS - 1) : 0;
  const query = new URLSearchParams([
    ...avatars.slice(0, more > 0 ? MOSAIC_AVATARS - 1 : MOSAIC_AVATARS).map((url): [string, string] => ["u", url]),
    ...(more > 0 ? [
      [
        "more",
        String(more),
      ] as [string, string],
    ] : []),
  ]);
  return `${env.WEB_PUBLIC_URL}/api/avatars?${query.toString()}`;
};

/** Title beside the picture of the accused */
const header = (thumbnail: string, content: string) => new SectionBuilder().addTextDisplayComponents(text(content)).setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnail));

const openingPanel = (trial: Trial, speech: string | null, thumbnail: string) => {
  const voiceId = voiceChannelOf(trial.channelId);
  const panel = new ContainerBuilder()
    .setAccentColor(COLOR.court)
    .addSectionComponents(header(thumbnail, `-# Tribunal du Royaume\n## ${EMOJI.gavel} L'audience est ouverte\n${caseLine(trial)}`))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(
      text(
        [
          `**Accusation** : ${trial.plaintiff.name}`,
          `**Défense** : ${trial.lawyer?.name ?? "personne, bonne chance"}`,
          `**Procès** : ${STYLE_LABEL[trial.style]}, ${MODE_LABEL[trial.mode]}`,
          `**Durée** : environ ${String(Math.round(debateMs(trial.style, trial.test) / 60_000))} minutes de débats, la cour donne la parole à tour de rôle`,
        ].join("\n"),
      ),
    );
  if (speech !== null) panel.addTextDisplayComponents(text(`>>> ${speech}`));
  if (voiceId !== null) panel.addTextDisplayComponents(
    text(`Les plaidoiries se font de vive voix dans <#${voiceId}>. Pour appeler un témoin, écrivez au juge : « j'appelle @membre à la barre ».`),
  );
  return panel.addTextDisplayComponents(dateLine());
};

const votePanel = (trial: Trial, closed: boolean) => {
  const onlyVoice = voiceChannelOf(trial.channelId) === null ? "" : " Seuls les membres du salon vocal votent.";
  const withJudge = trial.mode === "assizes" ? " Le juge vote aussi, et sa voix compte triple." : "";
  return new ContainerBuilder()
    .setAccentColor(COLOR.court)
    .addTextDisplayComponents(text(`## ${EMOJI.ballotBox} ${closed ? "Le vote est clos" : "Au peuple de voter"}\n${caseLine(trial)}`))
    .addTextDisplayComponents(
      text(
        closed ? "Le verdict tombe." : `Vous avez ${durationLabel(voteMs(trial))}. Les accusés et le plaignant ne votent pas.${onlyVoice}${withJudge}`,
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`vote:${trial.id}:guilty`).setLabel("Coupable").setStyle(ButtonStyle.Danger).setDisabled(closed),
        new ButtonBuilder().setCustomId(`vote:${trial.id}:innocent`).setLabel("Non coupable").setStyle(ButtonStyle.Success).setDisabled(closed),
      ),
    )
    .addTextDisplayComponents(dateLine());
};

const verdictPanel = (trial: Trial, verdict: Verdict, sentence: string | null, speech: string | null, thumbnail: string) => {
  const panel = new ContainerBuilder()
    .setAccentColor(verdict.guilty ? COLOR.refusal : COLOR.acquittal)
    .addSectionComponents(
      header(thumbnail, `-# Verdict officiel\n# ${verdict.guilty ? `${EMOJI.policeArrest} COUPABLE` : `${EMOJI.checkmark} NON COUPABLE`}\n${caseLine(trial)}`),
    );
  if (speech !== null) panel.addTextDisplayComponents(text(`>>> ${speech}`));
  panel.addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Large));
  if (sentence !== null) panel.addTextDisplayComponents(text(`**Peine**\n${sentence}`));
  return panel
    .addTextDisplayComponents(text(`**${verdict.mode === "bench" ? "Décision" : "Votes"}** : ${verdictDetails(verdict)}`))
    .addTextDisplayComponents(dateLine());
};

/** The judge says a line: out loud in the voice channel, as a bubble in the courtroom, typed by the clerk, and written in the text channel only without voice channel */
const announce = async (trial: Trial, line: string, speakerId: string | null = null) => {
  if (!isHeardOutLoud(trial)) await sendSafeMessage(
    await fetchDiscordSendableChannel(trial.channelId),
    speakerId === AI_LAWYER.id ? `**${AI_LAWYER.name}** : ${line}` : line,
  );
  court.say(trial.channelId, speakerId, line);
  judgeSays(trial.channelId, line, speakerId ?? "judge");
};

/** The court-appointed AI lawyer pleads, from what the accused told it during the preparation */
const aiDefends = async (trial: Trial, stage: "opening" | "closing") => {
  await announce(trial, await judge.defense(trial, defenseContextOf(trial.channelId), stage), AI_LAWYER.id);
};

/** What the judge says when the court moves on: written by the code, no AI needed */
const phaseLine = (trial: Trial): string | null => {
  const lines: Partial<Record<Phase, string>>
    = trial.style === "american" ? {
      "prosecution": `La parole est à l'accusation. ${trial.plaintiff.name}, vous avez ${seconds(trial)} secondes pour convaincre la cour.`,
      "defense": `La parole est à la défense. ${defenseName(trial)}, ${seconds(trial)} secondes, pas une de plus.`,
      "witnesses": "Place aux témoins. L'accusation ou la défense peut appeler un témoin à la barre en me l'écrivant. Sans témoin, on passe vite.",
      "closing-prosecution": `Plaidoiries finales. L'accusation d'abord, ${trial.plaintiff.name}.`,
      "closing-defense": `Plaidoirie finale de la défense. ${defenseName(trial)}, sauvez ce qui peut l'être.`,
    } : {
      "prosecution": `La parole est à la partie civile. ${trial.plaintiff.name}, exposez votre préjudice.`,
      "witnesses": "Audition des témoins. Les parties peuvent faire citer un témoin en me l'écrivant. Sans témoin, on passe vite.",
      "defense": `La parole est à la défense pour sa plaidoirie. ${defenseName(trial)}, la cour vous écoute, à peu près.`,
      "last-word": `${accusedNames(trial)}, la cour vous laisse le dernier mot. Choisissez-le bien.`,
    };

  if (trial.phase === "vote") return trial.mode === "assizes" ? `Les débats sont clos ! Le jury et moi-même votons, et ma voix compte triple. Vous avez ${durationLabel(voteMs(trial))}.` : `Les débats sont clos ! Le peuple a ${durationLabel(voteMs(trial))} pour voter. Cliquez sur coupable ou non coupable.`;
  if (trial.phase === "deliberation") return `Les débats sont clos. La cour se retire pour délibérer seule. Enfin, avec son croissant. ${EMOJI.judgeThinking}`;

  return lines[trial.phase] ?? null;
};

const onPhase = async (trial: Trial) => {
  if (trial.phase === "vote") voteMessages.set(trial.id, await sendPanel(await fetchDiscordSendableChannel(trial.channelId), votePanel(trial, false)));

  // French style: the judge questions the accused himself.
  const line = trial.phase === "examination" ? await judge.question(trial) : phaseLine(trial);
  if (line !== null) await announce(trial, line);

  if (trial.lawyer?.id !== AI_LAWYER.id) return;

  if (trial.phase === "defense") await aiDefends(trial, trial.style === "american" ? "opening" : "closing");
  if (trial.phase === "closing-defense") await aiDefends(trial, "closing");
};

const onWitness = async (trial: Trial, witness: Trial["witness"]) => {
  if (witness === null) {
    await announce(trial, "Le témoin quitte la barre.");
    return;
  }

  const by = witness.calledBy === "prosecution" ? "l'accusation" : "la défense";
  const other = witness.calledBy === "prosecution" ? "la défense" : "l'accusation";
  if (witness.stage === "examination") await announce(
    trial,
    trial.style === "american" ? `${witness.member.name} est appelé à la barre par ${by}. Interrogatoire !` : `${witness.member.name} est cité à la barre. La cour l'interroge, et les parties aussi, si elles sont polies.`,
  );
  else await announce(trial, `Contre-interrogatoire ! ${other} interroge ${witness.member.name}.`);
};

/** A line said in the hearing: the clerk types it; out loud, the judge may react to it, and counsel may object */
const onSpeech = async (trial: Trial, speakerId: string | null, line: string) => {
  const speaker = speakerOf(trial, speakerId);
  const typed = await attempt(async () => recordLine(trial, speaker, line));
  if (!typed.ok) logger.warn(`The clerk could not type a line: ${typed.error instanceof Error ? typed.error.message : String(typed.error)}`);

  // Only what members say out loud below: the judge, the clerk and the AI lawyer do not trigger anything.
  if (speakerId === null || speakerId === CLERK.id || speakerId === AI_LAWYER.id) return;

  if (!isTest(trial)) noteLine(speaker, line);

  if (OBJECTION_PATTERN.test(line) && sideOf(trial, speakerId) !== null) {
    if (court.object(trial.channelId, speaker) === "not-american") await announce(
      trial,
      "Une objection ? On n'est pas dans une série américaine, ici. Asseyez-vous.",
    );
    return;
  }

  const heard = heardLines.get(trial.id) ?? {
    lines: [],
    lastAt: Date.now(),
  };
  heard.lines = [...heard.lines, `${speaker.name} : ${line}`].slice(-RECENT_LINES);
  heardLines.set(trial.id, heard);

  if (
    heard.lines.length < INTERVENE_EVERY_LINES
    || Date.now() - heard.lastAt < INTERVENE_MIN_GAP_MS
    || trial.phase === "vote"
    || trial.phase === "deliberation"
  ) return;

  heardLines.set(trial.id, {
    lines: [],
    lastAt: Date.now(),
  });
  await announce(trial, await judge.intervene(trial, heard.lines.join("\n"), await knownAbout(partyIds(trial))));
};

const onVerdict = async (trial: Trial, verdict: Verdict) => {
  heardLines.delete(trial.id);
  const channel = await fetchDiscordSendableChannel(trial.channelId);

  // The record is the durable outcome: saved before any Discord call that could fail.
  const stopSentenceTyping = startDiscordTyping(channel, () => logger.warn("Could not send the typing indicator"));
  // A test trial convicts nobody for real: no penalty, no case file, no record.
  const sentence = verdict.guilty ? await (isTest(trial) ? Promise.resolve(TEST_SENTENCE) : sentenceTrial(trial)).finally(stopSentenceTyping) : null;
  stopSentenceTyping();

  if (isTest(trial)) forgetTestTranscript(trial.id);
  else {
    const transcript = await attempt(async () => fetchTranscript(trial.id));
    const summary = await judge.summary(trial, transcript.ok ? formatTranscript(transcript.value) : "", verdict, sentence);
    await saveTrial(trial, verdict, sentence, summary);
  }
  court.sentenced(trial, verdict, sentence);

  // The vote message may have been deleted meanwhile: closing it is best effort.
  const voteMessage = voteMessages.get(trial.id);
  voteMessages.delete(trial.id);
  if (voteMessage !== undefined) await attempt(async () => voteMessage.edit({
    components: [votePanel(trial, true)],
  }),
  );

  const stopTyping = startDiscordTyping(channel, () => logger.warn("Could not send the typing indicator"));
  const speech = await judge.verdict(trial, verdict, sentence, await knownAbout(partyIds(trial))).finally(stopTyping);

  // The official verdict is always written; the judge's speech only without voice channel.
  await sendPanel(channel, verdictPanel(trial, verdict, sentence, isHeardOutLoud(trial) ? null : speech, await thumbnailOf(trial)));
  judgeSays(trial.channelId, `${speech} ${formatVerdictLine(verdict, sentence)}`);
  await attempt(async () => completeHearing(trial.channelId));
  logger.info(`Trial ${trial.id} closed: ${verdict.guilty ? "guilty" : "not guilty"} (${verdict.mode})${verdict.reversed ? " (reversed)" : ""}`);
};

const handleEvent = async (event: CourtEvent) => {
  const { trial } = event;

  if (event.type === "speech") {
    await onSpeech(trial, event.speakerId, event.text);
    return;
  }
  if (event.type === "opened") {
    const channel = await fetchDiscordSendableChannel(trial.channelId);

    const stopTyping = startDiscordTyping(channel, () => logger.warn("Could not send the typing indicator"));
    const speech = await judge.opening(trial, await knownAbout(partyIds(trial))).finally(stopTyping);
    await sendPanel(channel, openingPanel(trial, isHeardOutLoud(trial) ? null : speech, await thumbnailOf(trial)));
    court.say(trial.channelId, null, speech);
    judgeSays(trial.channelId, speech);
    return;
  }
  if (event.type === "phase") {
    await onPhase(trial);
    return;
  }
  if (event.type === "witness") {
    await onWitness(trial, event.witness);
    return;
  }
  if (event.type === "objection") {
    await announce(trial, await judge.objection(trial, event.objector, event.ruling));
    return;
  }

  if (event.type === "verdict") await onVerdict(trial, event.verdict);
};

court.on("event", trigger.safeListener("Court event", handleEvent));
