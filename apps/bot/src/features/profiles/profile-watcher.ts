import { noteLine } from "./profiles";
import { isExcluded } from "#/features/penalties/penalty-store";
import { channelChain, conversation, GUILD_IDS } from "#/integrations/discord";
import { trigger } from "#/utils/trigger";

// The judge reads every text channel of the server (except the excluded ones) and never forgets anyone.
trigger.discordEvent("messageCreate", (message) => {
  if (message.author.bot || !message.inGuild() || !GUILD_IDS.includes(message.guildId) || isExcluded(channelChain(message))) return;

  noteLine(
    {
      id: message.author.id,
      name: message.member?.displayName ?? message.author.username,
    },
    conversation.sanitizeContent(message.content),
  );
});
