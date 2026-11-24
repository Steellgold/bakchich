import type { Style, VoteResult } from "#/features/court/engine";
import type { HearingRequest } from "#/features/hearings/hearing-request";
import type { ButtonInteraction, MessageContextMenuCommandInteraction, ModalSubmitInteraction, UserSelectMenuInteraction } from "discord.js";
import { court } from "#/features/court/court";
import { AI_LAWYER, MAX_CRIME_LENGTH, normalizeCrime } from "#/features/court/engine";
import { upsertMember } from "#/features/court/members";
import { requestHearing } from "#/features/hearings/hearing-request";
import { endPreparation, forceStartAnswers, forceStartHearing, isInHearingVoice, juryAnswers, pendingHearing, readyAnswers, requestJury, setPendingLawyer, voiceChannelOf } from "#/features/hearings/hearings";
import { AGENTS_CATEGORY_IDS, COLOR, conversation, discordClient, embedOf, getCategoryId, registerGuildCommand } from "#/integrations/discord";
import { attempt } from "#/utils/attempt";
import { trigger } from "#/utils/trigger";
import { ActionRowBuilder, ApplicationCommandType, ButtonBuilder, ButtonStyle, LabelBuilder, MessageFlags, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle } from "discord.js";

const TRIAL_OVER = `Ce procès est terminé.`;
const NO_HEARING = `Aucune audience n'attend dans ce salon.`;

/** Private answer to the member who clicked: red unless it confirms something */
const notice = (text: string, color: number = COLOR.refusal) => ({
  embeds: [embedOf(text, color)],
  flags: MessageFlags.Ephemeral as const,
});

const isAccused = (channelId: string, userId: string) => pendingHearing(channelId)?.accused.some((member) => member.id === userId) === true;

/** An accused picks a lawyer: the member must accept before being the lawyer */
const proposeLawyer = async (interaction: UserSelectMenuInteraction) => {
  const hearing = pendingHearing(interaction.channelId);
  const chosen = interaction.users.first();

  if (hearing === undefined) {
    await interaction.reply(notice(NO_HEARING));
    return;
  }
  if (!isAccused(interaction.channelId, interaction.user.id)) {
    await interaction.reply(notice(`Seuls les accusés choisissent leur avocat.`));
    return;
  }
  if (chosen === undefined || chosen.bot || chosen.id === hearing.plaintiffId || hearing.accused.some((member) => member.id === chosen.id)) {
    await interaction.reply(notice(`Cet avocat n'est pas possible : ni accusé, ni plaignant, ni machine.`));
    return;
  }

  await interaction.reply({
    content: `<@${chosen.id}>`,
    embeds: [embedOf(`${interaction.user.displayName} te propose d'être son avocat. Acceptes-tu ?`)],
    allowedMentions: {
      parse: [],
      users: [chosen.id],
    },
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
    await interaction.reply(notice(`Cette proposition ne t'est pas adressée.`));
    return;
  }
  if (!accepted) {
    await interaction.update({
      embeds: [embedOf(`${interaction.user.displayName} refuse d'être avocat.`, COLOR.refusal)],
      components: [],
    });
    return;
  }

  const lawyer = {
    id: interaction.user.id,
    name: interaction.user.displayName,
  };
  const set = hearingId !== undefined && (await setPendingLawyer(interaction.channelId, lawyer, hearingId));
  await interaction.update({
    embeds: [set ? embedOf(`${lawyer.name} devient l'avocat de la défense.`) : embedOf(NO_HEARING, COLOR.refusal)],
    components: [],
  });
};

/** Right click on a message, Applications: put its author on trial */
const OPEN_TRIAL_COMMAND = "Ouvrir un procès";
const OPEN_TRIAL_MODAL = "open-trial";
const CONTEXT_LENGTH = 300;

/** The message action opens a form asking why: only in an AGENTS category, never against oneself */
const askOpenTrial = async (interaction: MessageContextMenuCommandInteraction) => {
  const target = interaction.targetMessage;

  if (interaction.channel === null || !AGENTS_CATEGORY_IDS.includes(getCategoryId(interaction.channel) ?? "")) {
    await interaction.reply(notice(`Le Tribunal ne siège que dans la catégorie AGENTS.`));
    return;
  }
  if (target.author.id === interaction.user.id) {
    await interaction.reply(notice(`La cour ne te laisse pas te juger toi-même.`));
    return;
  }

  const name = target.member?.displayName ?? target.author.displayName;
  await interaction.showModal(
    new ModalBuilder()
      .setCustomId(`${OPEN_TRIAL_MODAL}:${target.id}`)
      .setTitle(`Procès de ${name}`.slice(0, 45))
      .addLabelComponents(
        new LabelBuilder()
          .setLabel("Expliquez pourquoi")
          .setTextInputComponent(
            new TextInputBuilder()
              .setCustomId("crime")
              .setStyle(TextInputStyle.Paragraph)
              .setPlaceholder("Le crime, en quelques mots")
              .setMinLength(1)
              .setMaxLength(MAX_CRIME_LENGTH)
              .setRequired(true),
          ),
        new LabelBuilder().setLabel("Style du procès").setStringSelectMenuComponent(
          new StringSelectMenuBuilder().setCustomId("style").setRequired(true).addOptions(
            {
              label: "À l'américaine",
              description: "Objections, témoins, contre-interrogatoires",
              value: "american",
              default: true,
            },
            {
              label: "À la française",
              description: "Le juge mène les débats, pas d'objection",
              value: "french",
            },
          ),
        ),
      ),
  );
};

/** The form is sent: same checks and announcement as a trial requested by mentioning the bot, the message being the context */
const submitOpenTrial = async (interaction: ModalSubmitInteraction, messageId: string | undefined) => {
  const botUser = discordClient.user;
  const channel = interaction.channel;

  if (!interaction.inCachedGuild() || botUser === null || channel === null || !channel.isSendable() || messageId === undefined) {
    await interaction.reply(notice(`Ce procès ne peut pas s'ouvrir ici.`));
    return;
  }

  const crime = normalizeCrime(interaction.fields.getTextInputValue("crime"));

  if (crime === null) {
    await interaction.reply(notice(`Motif invalide : entre 1 et ${String(MAX_CRIME_LENGTH)} caractères.`));
    return;
  }

  // The checks take several seconds: Discord only waits 3 for an answer.
  await interaction.deferReply();
  const answer: HearingRequest["reply"] = async (text, color, components) => interaction.editReply({
    embeds: [embedOf(text, color)],
    allowedMentions: {
      parse: [],
    },
    components,
  });

  const fetched = await attempt(async () => channel.messages.fetch(messageId));

  if (!fetched.ok) {
    await answer("Ce message a disparu, la cour ne peut plus le juger.", COLOR.refusal);
    return;
  }

  const target = fetched.value;
  const plaintiff = {
    id: interaction.user.id,
    name: interaction.member.displayName,
  };
  await upsertMember({
    ...plaintiff,
    avatarUrl: interaction.user.displayAvatarURL({
      extension: "png",
      size: 128,
    }),
  });
  const context = `${target.member?.displayName ?? target.author.displayName} : ${conversation.sanitizeContent(target.content)}`.slice(0, CONTEXT_LENGTH);
  const style: Style = interaction.fields.getStringSelectValues("style")[0] === "french" ? "french" : "american";
  await requestHearing(
    {
      channel,
      guild: interaction.guild,
      plaintiff,
      style,
      reply: answer,
    },
    [target.author.id],
    crime,
    botUser.id,
    context,
  );
};

// Registered at startup in each allowed guild (an exception confirmed by the server owners, see AGENTS.md):
discordClient.once(
  "clientReady",
  trigger.safeListener("Open-trial command registration", async () => registerGuildCommand({
    name: OPEN_TRIAL_COMMAND,
    type: ApplicationCommandType.Message,
  })),
);

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
    const result = forceStartHearing(channelId, interaction.user.id);
    await interaction.reply(notice(forceStartAnswers[result], result === "started" ? COLOR.court : COLOR.refusal));
    return;
  }
  if (action === "hearing-jury") {
    const result = await requestJury(channelId, interaction.user.id);
    await interaction.reply(result === "requested" ? { embeds: [embedOf(juryAnswers[result])] } : notice(juryAnswers[result]));
    return;
  }
  if (action === "hearing-ready") {
    const result = endPreparation(channelId, interaction.user.id);
    await interaction.reply(notice(readyAnswers[result], result === "ended" ? COLOR.court : COLOR.refusal));
    return;
  }
  if (action === "hearing-ai-lawyer") {
    if (!isAccused(channelId, interaction.user.id)) {
      await interaction.reply(notice(pendingHearing(channelId) === undefined ? NO_HEARING : `Seuls les accusés demandent un avocat commis d'office.`));
      return;
    }

    const hearing = pendingHearing(channelId);

    if (hearing === undefined || !(await setPendingLawyer(channelId, AI_LAWYER, hearing.id))) {
      await interaction.reply(notice(NO_HEARING));
      return;
    }

    await interaction.reply({
      embeds: [embedOf(`Les accusés demandent un avocat commis d'office : ${AI_LAWYER.name} plaidera pour eux.`)],
    });
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
    await interaction.reply(notice(TRIAL_OVER));
    return;
  }

  // The trial is pleaded and voted in its voice channel: only the members there vote.
  if (!isInHearingVoice(channelId, interaction.user.id)) {
    await interaction.reply(notice(`Pour voter, rejoins le salon vocal <#${voiceChannelOf(channelId) ?? ""}>.`));
    return;
  }

  const guilty = choice === "guilty";
  const answers: Record<VoteResult, string> = {
    "ok": `Vote enregistré : ${guilty ? "Coupable" : "Non coupable"}.`,
    "not-allowed": `L'accusé et le plaignant ne votent pas.`,
    "not-in-voice": `Pour voter, rejoins le salon vocal du procès.`,
    "closed": TRIAL_OVER,
    "no-trial": TRIAL_OVER,
  };

  // Reply first: Discord only waits 3 seconds for an interaction answer.
  const result = court.vote(channelId, interaction.user.id, guilty);
  await interaction.reply(notice(answers[result], result === "ok" ? COLOR.court : COLOR.refusal));
  await upsertMember({
    id: interaction.user.id,
    name: interaction.user.displayName,
    avatarUrl: interaction.user.displayAvatarURL({
      extension: "png",
      size: 128,
    }),
  });
});
