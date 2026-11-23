import type { VoteResult } from "#/court/engine";
import { court } from "#/court/court";
import { trigger } from "#/utils/trigger";
import { MessageFlags } from "discord.js";

const TRIAL_OVER = "Ce procès est terminé.";

trigger.discordEvent("interactionCreate", async (interaction) => {
  if (!interaction.isButton() || !interaction.customId.startsWith("vote:")) return;

  const [, trialId, choice] = interaction.customId.split(":");
  const channelId = interaction.channelId;

  // Buttons of a finished trial, or of a trial lost in a restart:
  if (court.get(channelId)?.id !== trialId) {
    await interaction.reply({ content: TRIAL_OVER, flags: MessageFlags.Ephemeral });
    return;
  }

  const guilty = choice === "guilty";
  const answers: Record<VoteResult, string> = {
    "ok": `Vote enregistré : ${guilty ? "Coupable" : "Non coupable"}.`,
    "not-allowed": "L'accusé et le plaignant ne votent pas.",
    "closed": TRIAL_OVER,
    "no-trial": TRIAL_OVER,
  };

  await interaction.reply({ content: answers[court.vote(channelId, interaction.user.id, guilty)], flags: MessageFlags.Ephemeral });
});
