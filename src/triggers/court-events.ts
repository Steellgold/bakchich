import type { CourtEvent, Trial } from "#/court/engine";
import type { Message } from "discord.js";
import { court, judge } from "#/court/court";
import { VOTE_MS } from "#/court/engine";
import { saveTrial } from "#/court/record";
import { fetchDiscordSendableChannel, fetchRecentHumanMessages, sendSafeMessage, startDiscordTyping } from "#/integrations/discord";
import { logger } from "#/utils/logger";
import { trigger } from "#/utils/trigger";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

const VERDICT_CONTEXT_MESSAGES = 20;

/** Vote message per trial ID, to disable its buttons at the verdict */
const voteMessages = new Map<string, Message>();

const involvedIds = (trial: Trial) => [trial.accused.id, trial.plaintiff.id, ...(trial.lawyer === null ? [] : [trial.lawyer.id])];

const voteButtons = (trialId: string, disabled: boolean) => [
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`vote:${trialId}:guilty`).setLabel("Coupable").setStyle(ButtonStyle.Danger).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`vote:${trialId}:innocent`).setLabel("Non coupable").setStyle(ButtonStyle.Success).setDisabled(disabled),
  ),
];

const handleEvent = async (event: CourtEvent) => {
  if (event.type === "vote-cast") return;

  const { trial } = event;
  const channel = await fetchDiscordSendableChannel(trial.channelId);

  if (event.type === "opened") {
    const stopTyping = startDiscordTyping(channel, () => logger.warn("Could not send the typing indicator"));
    const text = await judge.opening(trial).finally(stopTyping);
    await sendSafeMessage(channel, text, involvedIds(trial));
    return;
  }

  if (event.type === "vote-started") {
    const content = `Les débats sont clos ! Le peuple a ${String(Math.round(VOTE_MS / 60_000))} minutes pour voter. L'accusé et le plaignant ne votent pas.`;
    voteMessages.set(trial.id, await sendSafeMessage(channel, content, [], voteButtons(trial.id, false)));
    return;
  }

  const voteMessage = voteMessages.get(trial.id);
  voteMessages.delete(trial.id);
  if (voteMessage !== undefined) await voteMessage.edit({ components: voteButtons(trial.id, true) });

  const stopTyping = startDiscordTyping(channel, () => logger.warn("Could not send the typing indicator"));
  const sentence = event.verdict.guilty ? await judge.sentence(trial) : null;
  const recent = await fetchRecentHumanMessages(channel, VERDICT_CONTEXT_MESSAGES);
  const text = await judge.verdict(trial, event.verdict, sentence, recent.lines).finally(stopTyping);

  await sendSafeMessage(channel, text, involvedIds(trial));
  await saveTrial(trial, event.verdict, sentence);
  logger.info(`Trial ${trial.id} closed: ${event.verdict.guilty ? "guilty" : "not guilty"}${event.verdict.reversed ? " (reversed)" : ""}`);
};

court.on("event", trigger.safeListener("Court event", handleEvent));
