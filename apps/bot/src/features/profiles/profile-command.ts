import { fileOf } from "./profiles";
import { fetchDossier, formatDossier } from "#/features/clerk/clerk";
import { COLOR, discordClient, registerGuildCommand, sanitizeDiscordMessage } from "#/integrations/discord";
import { trigger } from "#/utils/trigger";
import { ApplicationCommandOptionType, ApplicationCommandType, ContainerBuilder, MessageFlags, SectionBuilder, SeparatorSpacingSize, TextDisplayBuilder, ThumbnailBuilder } from "discord.js";

const FILE_COMMAND = "fiche";

// Registered at startup in each allowed guild (an exception confirmed by the server owners, see AGENTS.md):
discordClient.once(
  "clientReady",
  trigger.safeListener("File command registration", async () => registerGuildCommand({
    name: FILE_COMMAND,
    description: "Voir ce que le juge sait de toi, ou de quelqu'un",
    type: ApplicationCommandType.ChatInput,
    options: [
      {
        type: ApplicationCommandOptionType.User,
        name: "membre",
        description: "Le membre (toi par défaut)",
        required: false,
      },
    ],
  })),
);

const text = (content: string) => new TextDisplayBuilder().setContent(sanitizeDiscordMessage(content));

// The file is shown to the one who asked only: no spam in the channel.
trigger.discordEvent("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== FILE_COMMAND) return;

  const user = interaction.options.getUser("membre") ?? interaction.user;
  const [file, dossier] = await Promise.all([
    fileOf(user.id),
    fetchDossier(user.id),
  ]);

  const name = interaction.guild?.members.cache.get(user.id)?.displayName ?? file?.name ?? user.displayName;
  const notes = file?.profile ?? (user.bot ? "Une machine. La cour s'en méfie." : "Le juge ne le connaît pas encore. Ça ne va pas durer.");

  const panel = new ContainerBuilder()
    .setAccentColor(COLOR.court)
    .addSectionComponents(
      new SectionBuilder().addTextDisplayComponents(text(`-# Archives du Tribunal\n## Fiche de ${name}\n${notes}`)).setThumbnailAccessory(
        new ThumbnailBuilder().setURL(
          user.displayAvatarURL({
            extension: "png",
            size: 256,
          }),
        ),
      ),
    )
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(text(formatDossier(dossier)))
    .addTextDisplayComponents(
      text(
        file?.profiledAt === null || file?.profiledAt === undefined ? "-# Aucune note pour l'instant" : `-# Notes mises à jour <t:${String(Math.round(file.profiledAt.getTime() / 1000))}:R>`,
      ),
    );

  await interaction.reply({
    components: [panel],
    flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
    allowedMentions: {
      parse: [],
    },
  });
});
