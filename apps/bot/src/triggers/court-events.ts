import type { CourtEvent, Trial, Verdict } from "#/court/engine";
import type { Message } from "discord.js";
import { court, judge } from "#/court/court";
import { EMOJI } from "#/court/emojis";
import { AI_LAWYER, DEBATE_MS, formatNames, VOTE_MS } from "#/court/engine";
import { formatVerdictLine } from "#/court/judge";
import { saveTrial } from "#/court/record";
import { COLOR, discordClient, fetchDiscordSendableChannel, sanitizeDiscordMessage, sendPanel, sendSafeMessage, startDiscordTyping } from "#/integrations/discord";
import { completeHearing, defenseContextOf, judgeSays, voiceChannelOf } from "#/triggers/hearings";
import { attempt } from "#/utils/attempt";
import { logger } from "#/utils/logger";
import { trigger } from "#/utils/trigger";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, SectionBuilder, SeparatorSpacingSize, TextDisplayBuilder, ThumbnailBuilder } from "discord.js";

/** Vote message per trial ID, to disable its buttons at the verdict */
const voteMessages = new Map<string, Message>();

// The AI lawyer's closing statement comes shortly before the end of the debate:
const CLOSING_BEFORE_END_MS = 45_000;

/** Spoken lines are only written in the text channel when the trial has no voice channel to hear them in */
const isHeardOutLoud = (trial: Trial) => voiceChannelOf(trial.channelId) !== null;

// Building blocks of the Components V2 panels (opening, vote, verdict):
const text = (content: string) => new TextDisplayBuilder().setContent(sanitizeDiscordMessage(content));
const dateLine = () => text(`-# <t:${String(Math.round(Date.now() / 1000))}:f>`);
const caseLine = (trial: Trial) => `**${formatNames(trial.accused.map((member) => member.name))}**, accusé${trial.accused.length > 1 ? "s" : ""} de « ${trial.crime} »`;

/** Title beside the first accused's avatar (the bot's own when Discord has not cached the accused) */
const header = (trial: Trial, content: string) => {
  const user = discordClient.users.cache.get(trial.accused[0]?.id ?? "") ?? discordClient.user;
  if (user === null) throw new Error("The bot is not logged in");
  return new SectionBuilder().addTextDisplayComponents(text(content)).setThumbnailAccessory(new ThumbnailBuilder().setURL(user.displayAvatarURL({ extension: "png", size: 256 })));
};

const openingPanel = (trial: Trial, speech: string | null) => {
  const voiceId = voiceChannelOf(trial.channelId);
  const panel = new ContainerBuilder()
    .setAccentColor(COLOR.court)
    .addSectionComponents(header(trial, `-# Tribunal du Royaume\n## ${EMOJI.gavel} L'audience est ouverte\n${caseLine(trial)}`))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(text(`**Accusation** : ${trial.plaintiff.name}\n**Défense** : ${trial.lawyer?.name ?? "personne, bonne chance"}\n**Débats** : ${String(Math.round(DEBATE_MS / 60_000))} minutes, puis le vote`));
  if (speech !== null) panel.addTextDisplayComponents(text(`>>> ${speech}`));
  if (voiceId !== null) panel.addTextDisplayComponents(text(`Les plaidoiries se font de vive voix dans <#${voiceId}>.`));
  return panel.addTextDisplayComponents(dateLine());
};

const votePanel = (trial: Trial, closed: boolean) => {
  const onlyVoice = voiceChannelOf(trial.channelId) === null ? "" : " Seuls les membres du salon vocal votent.";
  return new ContainerBuilder()
    .setAccentColor(COLOR.court)
    .addTextDisplayComponents(text(`## ${EMOJI.ballotBox} ${closed ? "Le vote est clos" : "Au peuple de voter"}\n${caseLine(trial)}`))
    .addTextDisplayComponents(text(closed ? "Le verdict tombe." : `Vous avez ${String(Math.round(VOTE_MS / 60_000))} minutes. Les accusés et le plaignant ne votent pas.${onlyVoice}`))
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`vote:${trial.id}:guilty`).setLabel("Coupable").setStyle(ButtonStyle.Danger).setDisabled(closed),
      new ButtonBuilder().setCustomId(`vote:${trial.id}:innocent`).setLabel("Non coupable").setStyle(ButtonStyle.Success).setDisabled(closed),
    ))
    .addTextDisplayComponents(dateLine());
};

const verdictPanel = (trial: Trial, verdict: Verdict, sentence: string | null, speech: string | null) => {
  const how = verdict.reversed ? ", renversé par le juge" : verdict.coinFlip ? ", tiré à pile ou face" : "";
  const panel = new ContainerBuilder()
    .setAccentColor(verdict.guilty ? COLOR.refusal : COLOR.acquittal)
    .addSectionComponents(header(trial, `-# Verdict officiel\n# ${verdict.guilty ? `${EMOJI.handcuffs} COUPABLE` : `${EMOJI.checkmark} NON COUPABLE`}\n${caseLine(trial)}`));
  if (speech !== null) panel.addTextDisplayComponents(text(`>>> ${speech}`));
  panel.addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Large));
  if (sentence !== null) panel.addTextDisplayComponents(text(`**Peine**\n${sentence}`));
  return panel
    .addTextDisplayComponents(text(`**Votes** : ${String(verdict.guiltyVotes)} coupable, ${String(verdict.innocentVotes)} non coupable${how}`))
    .addTextDisplayComponents(dateLine());
};

/** The court-appointed AI lawyer pleads in the courtroom and out loud, in the text channel only without voice channel */
const aiDefends = async (trial: Trial, stage: "opening" | "closing") => {
  const speech = await judge.defense(trial, defenseContextOf(trial.channelId), stage);

  if (!isHeardOutLoud(trial)) await sendSafeMessage(await fetchDiscordSendableChannel(trial.channelId), `**${AI_LAWYER.name}** : ${speech}`);
  court.say(trial.channelId, AI_LAWYER.id, speech);
  judgeSays(trial.channelId, speech, AI_LAWYER.id);
};

const closeDefense = trigger.safeListener("AI lawyer closing", async (trial: Trial) => {
  if (court.get(trial.channelId)?.id === trial.id && trial.phase === "debate") await aiDefends(trial, "closing");
});

const handleEvent = async (event: CourtEvent) => {
  if (event.type === "vote-cast" || event.type === "speech") return;

  const { trial } = event;
  const channel = await fetchDiscordSendableChannel(trial.channelId);

  if (event.type === "opened") {
    const stopTyping = startDiscordTyping(channel, () => logger.warn("Could not send the typing indicator"));
    const speech = await judge.opening(trial).finally(stopTyping);
    await sendPanel(channel, openingPanel(trial, isHeardOutLoud(trial) ? null : speech));
    court.say(trial.channelId, null, speech);
    judgeSays(trial.channelId, speech);

    if (trial.lawyer?.id === AI_LAWYER.id) {
      // Armed first: a slow opening statement must not push the closing one into the vote.
      setTimeout(() => {
        closeDefense(trial);
      }, DEBATE_MS - CLOSING_BEFORE_END_MS).unref();
      await aiDefends(trial, "opening");
    }
    return;
  }

  if (event.type === "vote-started") {
    voteMessages.set(trial.id, await sendPanel(channel, votePanel(trial, false)));
    judgeSays(trial.channelId, `Les débats sont clos ! Le peuple a ${String(Math.round(VOTE_MS / 60_000))} minutes pour voter. Cliquez sur le bouton coupable ou non coupable.`);
    return;
  }

  // The record is the durable outcome: saved before any Discord call that could fail.
  const stopSentenceTyping = startDiscordTyping(channel, () => logger.warn("Could not send the typing indicator"));
  const sentence = event.verdict.guilty ? await judge.sentence(trial).finally(stopSentenceTyping) : null;
  stopSentenceTyping();
  await saveTrial(trial, event.verdict, sentence);

  // The vote message may have been deleted meanwhile: closing it is best effort.
  const voteMessage = voteMessages.get(trial.id);
  voteMessages.delete(trial.id);
  if (voteMessage !== undefined) await attempt(async () => voteMessage.edit({ components: [votePanel(trial, true)] }));

  const stopTyping = startDiscordTyping(channel, () => logger.warn("Could not send the typing indicator"));
  const speech = await judge.verdict(trial, event.verdict, sentence).finally(stopTyping);

  // The official verdict is always written; the judge's speech only without voice channel.
  await sendPanel(channel, verdictPanel(trial, event.verdict, sentence, isHeardOutLoud(trial) ? null : speech));
  judgeSays(trial.channelId, `${speech} ${formatVerdictLine(event.verdict, sentence)}`);
  await attempt(async () => completeHearing(trial.channelId));
  logger.info(`Trial ${trial.id} closed: ${event.verdict.guilty ? "guilty" : "not guilty"}${event.verdict.reversed ? " (reversed)" : ""}`);
};

court.on("event", trigger.safeListener("Court event", handleEvent));
