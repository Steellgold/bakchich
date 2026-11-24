import { toggleExclusion } from "./penalty-store";
import { COLOR, discordClient, embedOf, registerGuildCommand } from "#/integrations/discord";
import { trigger } from "#/utils/trigger";
import { ApplicationCommandOptionType, ApplicationCommandType, ChannelType, MessageFlags, PermissionFlagsBits } from "discord.js";

const EXCLUDE_COMMAND = "chexclude";

// Registered at startup in each allowed guild, for members who manage channels only (an exception confirmed by the server owners, see AGENTS.md):
discordClient.once(
  "clientReady",
  trigger.safeListener("Exclude command registration", async () => registerGuildCommand({
    name: EXCLUDE_COMMAND,
    description: "Exclure (ou réinclure) un salon ou une catégorie des peines du Tribunal",
    type: ApplicationCommandType.ChatInput,
    defaultMemberPermissions: PermissionFlagsBits.ManageChannels,
    options: [
      {
        type: ApplicationCommandOptionType.Channel,
        name: "salon",
        description: "Le salon ou la catégorie",
        required: true,
        channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice, ChannelType.GuildForum, ChannelType.GuildCategory],
      },
    ],
  })),
);

trigger.discordEvent("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== EXCLUDE_COMMAND) return;

  // Checked by the code too: the default permission can be changed by the server.
  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels) !== true) {
    await interaction.reply({
      embeds: [embedOf("Seuls ceux qui gèrent les salons peuvent faire ça.", COLOR.refusal)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const channel = interaction.options.getChannel("salon", true);
  const excluded = await toggleExclusion(channel.id);
  await interaction.reply({
    embeds: [
      embedOf(
        excluded ? `<#${channel.id}> est exclu : les peines n'y sont plus rappelées.` : `<#${channel.id}> n'est plus exclu : les peines y sont de nouveau rappelées.`,
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
});
