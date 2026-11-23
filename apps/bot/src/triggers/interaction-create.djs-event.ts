import type { VoteResult } from "#/court/engine";
import type { ButtonInteraction, UserSelectMenuInteraction } from "discord.js";
import { court } from "#/court/court";
import { EMOJI } from "#/court/emojis";
import { AI_LAWYER } from "#/court/engine";
import { upsertMember } from "#/court/members";
import { endPreparation, forceStartAnswers, forceStartHearing, pendingHearing, readyAnswers, setPendingLawyer, voiceChannelOf } from "#/triggers/hearings";
import { trigger } from "#/utils/trigger";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from "discord.js";

const TRIAL_OVER = `${EMOJI.hourglass} Ce procès est terminé.`;
const NO_HEARING = `${EMOJI.hourglass} Aucune audience n'attend dans ce salon.`;

const isAccused = (channelId: string, userId: string) => pendingHearing(channelId)?.accused.some((member) => member.id === userId) === true;

/** An accused picks a lawyer: the member must accept before being the lawyer */
const proposeLawyer = async (interaction: UserSelectMenuInteraction) => {
  const hearing = pendingHearing(interaction.channelId);
  const chosen = interaction.users.first();
  if (hearing === undefined) {
    await interaction.reply({ content: NO_HEARING, flags: MessageFlags.Ephemeral });
    return;
  }
  if (!isAccused(interaction.channelId, interaction.user.id)) {
    await interaction.reply({ content: `${EMOJI.cross} Seuls les accusés choisissent leur avocat.`, flags: MessageFlags.Ephemeral });
    return;
  }
  if (chosen === undefined || chosen.bot || chosen.id === hearing.plaintiffId || hearing.accused.some((member) => member.id === chosen.id)) {
    await interaction.reply({ content: `${EMOJI.cross} Cet avocat n'est pas possible : ni accusé, ni plaignant, ni machine.`, flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.reply({
    content: `<@${chosen.id}>, ${interaction.user.displayName} te propose d'être son avocat. Acceptes-tu ?`,
    allowedMentions: { parse: [], users: [chosen.id] },
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`lawyer-accept:${chosen.id}`).setLabel("Accepter").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`lawyer-decline:${chosen.id}`).setLabel("Refuser").setStyle(ButtonStyle.Danger),
      ),
    ],
  });
};

/** The member picked as a lawyer answers the proposal */
const answerLawyer = async (interaction: ButtonInteraction, accepted: boolean, chosenId: string | undefined) => {
  if (interaction.user.id !== chosenId) {
    await interaction.reply({ content: `${EMOJI.cross} Cette proposition ne t'est pas adressée.`, flags: MessageFlags.Ephemeral });
    return;
  }
  if (!accepted) {
    await interaction.update({ content: `${EMOJI.cross} ${interaction.user.displayName} refuse d'être avocat.`, components: [] });
    return;
  }

  const lawyer = { id: interaction.user.id, name: interaction.user.displayName };
  const set = await setPendingLawyer(interaction.channelId, lawyer);
  await interaction.update({ content: set ? `${EMOJI.gavel} ${lawyer.name} devient l'avocat de la défense.` : NO_HEARING, components: [] });
};

trigger.discordEvent("interactionCreate", async (interaction) => {
  if (interaction.isUserSelectMenu() && interaction.customId === "hearing-lawyer") {
    await proposeLawyer(interaction);
    return;
  }
  if (!interaction.isButton()) return;

  const [action, argument, choice] = interaction.customId.split(":");
  const channelId = interaction.channelId;

  if (action === "hearing-start") {
    await interaction.reply({ content: forceStartAnswers[forceStartHearing(channelId, interaction.user.id)], flags: MessageFlags.Ephemeral });
    return;
  }
  if (action === "hearing-ready") {
    await interaction.reply({ content: readyAnswers[endPreparation(channelId, interaction.user.id)], flags: MessageFlags.Ephemeral });
    return;
  }
  if (action === "hearing-ai-lawyer") {
    if (!isAccused(channelId, interaction.user.id)) {
      await interaction.reply({ content: pendingHearing(channelId) === undefined ? NO_HEARING : `${EMOJI.cross} Seuls les accusés demandent un avocat commis d'office.`, flags: MessageFlags.Ephemeral });
      return;
    }

    await setPendingLawyer(channelId, AI_LAWYER);
    await interaction.reply({ content: `${EMOJI.gavel} Les accusés demandent un avocat commis d'office : ${AI_LAWYER.name} plaidera pour eux.` });
    return;
  }
  if (action === "lawyer-accept" || action === "lawyer-decline") {
    await answerLawyer(interaction, action === "lawyer-accept", argument);
    return;
  }
  if (action !== "vote") return;

  const trialId = argument;

  // Buttons of a finished trial, or of a trial lost in a restart:
  if (court.get(channelId)?.id !== trialId) {
    await interaction.reply({ content: TRIAL_OVER, flags: MessageFlags.Ephemeral });
    return;
  }

  // The trial is pleaded and voted in its voice channel: only the members there vote.
  const voiceChannelId = voiceChannelOf(channelId);
  if (voiceChannelId !== null && interaction.guild?.voiceStates.cache.get(interaction.user.id)?.channelId !== voiceChannelId) {
    await interaction.reply({ content: `${EMOJI.cross} Pour voter, rejoins le salon vocal <#${voiceChannelId}>.`, flags: MessageFlags.Ephemeral });
    return;
  }

  const guilty = choice === "guilty";
  const answers: Record<VoteResult, string> = {
    "ok": `${EMOJI.ballotBox} Vote enregistré : ${guilty ? "Coupable" : "Non coupable"}.`,
    "not-allowed": `${EMOJI.cross} L'accusé et le plaignant ne votent pas.`,
    "closed": TRIAL_OVER,
    "no-trial": TRIAL_OVER,
  };

  // Reply first: Discord only waits 3 seconds for an interaction answer.
  await interaction.reply({ content: answers[court.vote(channelId, interaction.user.id, guilty)], flags: MessageFlags.Ephemeral });
  await upsertMember({ id: interaction.user.id, name: interaction.user.displayName, avatarUrl: interaction.user.displayAvatarURL({ extension: "png", size: 128 }) });
});
