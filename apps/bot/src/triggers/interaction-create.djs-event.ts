import type { VoteResult } from "#/court/engine";
import type { HearingRequest } from "#/triggers/hearings";
import type { ButtonInteraction, MessageContextMenuCommandInteraction, ModalSubmitInteraction, UserSelectMenuInteraction } from "discord.js";
import { court } from "#/court/court";
import { EMOJI } from "#/court/emojis";
import { AI_LAWYER, MAX_CRIME_LENGTH, normalizeCrime } from "#/court/engine";
import { upsertMember } from "#/court/members";
import { AGENTS_CATEGORY_IDS, conversation, discordClient, getCategoryId, registerMessageCommand, sanitizeDiscordMessage } from "#/integrations/discord";
import { endPreparation, forceStartAnswers, forceStartHearing, isInHearingVoice, pendingHearing, readyAnswers, requestHearing, setPendingLawyer, voiceChannelOf } from "#/triggers/hearings";
import { attempt } from "#/utils/attempt";
import { trigger } from "#/utils/trigger";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, LabelBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";

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
        new ButtonBuilder().setCustomId(`lawyer-accept:${hearing.id}:${chosen.id}`).setLabel("Accepter").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`lawyer-decline:${hearing.id}:${chosen.id}`).setLabel("Refuser").setStyle(ButtonStyle.Danger),
      ),
    ],
  });
};

/** The member picked as a lawyer answers the proposal */
const answerLawyer = async (interaction: ButtonInteraction, accepted: boolean, hearingId: string | undefined, chosenId: string | undefined) => {
  if (interaction.user.id !== chosenId) {
    await interaction.reply({ content: `${EMOJI.cross} Cette proposition ne t'est pas adressée.`, flags: MessageFlags.Ephemeral });
    return;
  }
  if (!accepted) {
    await interaction.update({ content: `${EMOJI.cross} ${interaction.user.displayName} refuse d'être avocat.`, components: [] });
    return;
  }

  const lawyer = { id: interaction.user.id, name: interaction.user.displayName };
  const set = hearingId !== undefined && await setPendingLawyer(interaction.channelId, lawyer, hearingId);
  await interaction.update({ content: set ? `${EMOJI.gavel} ${lawyer.name} devient l'avocat de la défense.` : NO_HEARING, components: [] });
};

/** Right click on a message, Applications: put its author on trial */
const OPEN_TRIAL_COMMAND = "Ouvrir un procès";
const OPEN_TRIAL_MODAL = "open-trial";
const CONTEXT_LENGTH = 300;

/** The message action opens a form asking why: only in an AGENTS category, never against oneself */
const askOpenTrial = async (interaction: MessageContextMenuCommandInteraction) => {
  const target = interaction.targetMessage;
  if (interaction.channel === null || !AGENTS_CATEGORY_IDS.includes(getCategoryId(interaction.channel) ?? "")) {
    await interaction.reply({ content: `${EMOJI.courthouse} Le Tribunal ne siège que dans la catégorie AGENTS.`, flags: MessageFlags.Ephemeral });
    return;
  }
  if (target.author.id === interaction.user.id) {
    await interaction.reply({ content: `${EMOJI.courthouse} La cour ne te laisse pas te juger toi-même.`, flags: MessageFlags.Ephemeral });
    return;
  }

  const name = target.member?.displayName ?? target.author.displayName;
  await interaction.showModal(new ModalBuilder()
    .setCustomId(`${OPEN_TRIAL_MODAL}:${target.id}`)
    .setTitle(`Procès de ${name}`.slice(0, 45))
    .addLabelComponents(new LabelBuilder()
      .setLabel("Expliquez pourquoi")
      .setTextInputComponent(new TextInputBuilder().setCustomId("crime").setStyle(TextInputStyle.Paragraph).setPlaceholder("Le crime, en quelques mots").setMinLength(1).setMaxLength(MAX_CRIME_LENGTH).setRequired(true))));
};

/** The form is sent: same checks and announcement as a trial requested by mentioning the bot, the message being the context */
const submitOpenTrial = async (interaction: ModalSubmitInteraction, messageId: string | undefined) => {
  const botUser = discordClient.user;
  const channel = interaction.channel;
  if (!interaction.inCachedGuild() || botUser === null || channel === null || !channel.isSendable() || messageId === undefined) {
    await interaction.reply({ content: `${EMOJI.cross} Ce procès ne peut pas s'ouvrir ici.`, flags: MessageFlags.Ephemeral });
    return;
  }

  const crime = normalizeCrime(interaction.fields.getTextInputValue("crime"));
  if (crime === null) {
    await interaction.reply({ content: `${EMOJI.cross} Motif invalide : entre 1 et ${String(MAX_CRIME_LENGTH)} caractères.`, flags: MessageFlags.Ephemeral });
    return;
  }

  // The checks take several seconds: Discord only waits 3 for an answer.
  await interaction.deferReply();
  const answer = async (content: string, components?: Parameters<HearingRequest["reply"]>[1]) => interaction.editReply({ content: sanitizeDiscordMessage(content), allowedMentions: { parse: [] }, components });

  const fetched = await attempt(async () => channel.messages.fetch(messageId));
  if (!fetched.ok) {
    await answer(`${EMOJI.documentSearch} Ce message a disparu, la cour ne peut plus le juger.`);
    return;
  }

  const target = fetched.value;
  const plaintiff = { id: interaction.user.id, name: interaction.member.displayName };
  await upsertMember({ ...plaintiff, avatarUrl: interaction.user.displayAvatarURL({ extension: "png", size: 128 }) });
  const context = `${target.member?.displayName ?? target.author.displayName} : ${conversation.sanitizeContent(target.content)}`.slice(0, CONTEXT_LENGTH);
  await requestHearing({ channel, guild: interaction.guild, plaintiff, reply: answer }, [target.author.id], crime, botUser.id, context);
};

// Registered at startup in each allowed guild (an exception confirmed by the server owners, see AGENTS.md):
discordClient.once("clientReady", trigger.safeListener("Open-trial command registration", async () => registerMessageCommand(OPEN_TRIAL_COMMAND)));

trigger.discordEvent("interactionCreate", async (interaction) => {
  if (interaction.isMessageContextMenuCommand() && interaction.commandName === OPEN_TRIAL_COMMAND) {
    await askOpenTrial(interaction);
    return;
  }
  if (interaction.isModalSubmit() && interaction.customId.startsWith(`${OPEN_TRIAL_MODAL}:`)) {
    await submitOpenTrial(interaction, interaction.customId.split(":")[1]);
    return;
  }
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

    const hearing = pendingHearing(channelId);
    if (hearing === undefined || !(await setPendingLawyer(channelId, AI_LAWYER, hearing.id))) {
      await interaction.reply({ content: NO_HEARING, flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply({ content: `${EMOJI.gavel} Les accusés demandent un avocat commis d'office : ${AI_LAWYER.name} plaidera pour eux.` });
    return;
  }
  if (action === "lawyer-accept" || action === "lawyer-decline") {
    await answerLawyer(interaction, action === "lawyer-accept", argument, choice);
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
  if (!isInHearingVoice(channelId, interaction.user.id)) {
    await interaction.reply({ content: `${EMOJI.cross} Pour voter, rejoins le salon vocal <#${voiceChannelOf(channelId) ?? ""}>.`, flags: MessageFlags.Ephemeral });
    return;
  }

  const guilty = choice === "guilty";
  const answers: Record<VoteResult, string> = {
    "ok": `${EMOJI.ballotBox} Vote enregistré : ${guilty ? "Coupable" : "Non coupable"}.`,
    "not-allowed": `${EMOJI.cross} L'accusé et le plaignant ne votent pas.`,
    "not-in-voice": `${EMOJI.cross} Pour voter, rejoins le salon vocal du procès.`,
    "closed": TRIAL_OVER,
    "no-trial": TRIAL_OVER,
  };

  // Reply first: Discord only waits 3 seconds for an interaction answer.
  await interaction.reply({ content: answers[court.vote(channelId, interaction.user.id, guilty)], flags: MessageFlags.Ephemeral });
  await upsertMember({ id: interaction.user.id, name: interaction.user.displayName, avatarUrl: interaction.user.displayAvatarURL({ extension: "png", size: 128 }) });
});
