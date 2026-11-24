import type { Penalty } from "./penalty-rules";
import type { Message } from "discord.js";
import { describePenalty, extensionMs, forgottenWords, formatDuration, MAX_REMAINING_MS } from "./penalty-rules";
import { extendPenalty, isExcluded, loadPenalties, penaltiesOf } from "./penalty-store";
import { channelChain, COLOR, discordClient, embedOf, GUILD_IDS } from "#/integrations/discord";
import { attempt } from "#/utils/attempt";
import { logger } from "#/utils/logger";
import { trigger } from "#/utils/trigger";

/** After a written reminder, a member only gets the sentence's emoji as a reaction for this long: no spam */
const REMINDER_GAP_MS = 5 * 60_000;

/** When each member was last reminded in writing */
const lastReminders = new Map<string, number>();

/** A forgotten sentence: more time, then a written reminder, or only the reaction when one was written recently */
const punish = async (message: Message<true>, penalty: Penalty, forgotten: number) => {
  const now = Date.now();
  const added = extensionMs(forgotten, message.content);
  const endsAt = new Date(Math.min(penalty.endsAt.getTime() + added, now + MAX_REMAINING_MS));
  await extendPenalty(penalty, endsAt);

  if (now - (lastReminders.get(message.author.id) ?? 0) < REMINDER_GAP_MS) {
    const reacted = await attempt(async () => message.react(penalty.emoji));
    if (!reacted.ok) logger.warn(`Could not react with the sentence emoji: ${reacted.error instanceof Error ? reacted.error.message : String(reacted.error)}`);
    return;
  }

  lastReminders.set(message.author.id, now);
  await message.reply({
    embeds: [
      embedOf(
        `${penalty.emoji} La cour a tout vu, ${message.member?.displayName ?? penalty.memberName}. Ta peine : ${describePenalty(penalty)}.\n+${formatDuration(added)}, fin <t:${String(Math.round(endsAt.getTime() / 1000))}:R>.`,
        COLOR.refusal,
      ),
    ],
    // The reply is enough: no ping.
    allowedMentions: {
      parse: [],
      repliedUser: false,
    },
  });
};

trigger.discordEvent("messageCreate", async (message) => {
  if (message.author.bot || !message.inGuild() || !GUILD_IDS.includes(message.guildId)) return;

  const running = penaltiesOf(message.author.id, new Date());

  if (running.length === 0 || isExcluded(channelChain(message))) return;

  // One reminder per message, for the first sentence it breaks:
  const broken = running
    .map((penalty) => ({
      penalty,
      forgotten: forgottenWords(penalty, message.content),
    }))
    .find(({ forgotten }) => forgotten > 0);
  if (broken !== undefined) await punish(message, broken.penalty, broken.forgotten);
});

discordClient.once("clientReady", trigger.safeListener("Penalties load", loadPenalties));
