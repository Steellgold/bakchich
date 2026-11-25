import { loadForgotten, noteLine } from "./profiles";
import { court } from "#/features/court/court";
import { isTest } from "#/features/court/engine";
import { isExcluded } from "#/features/penalties/penalty-store";
import { channelChain, conversation, discordClient, GUILD_IDS } from "#/integrations/discord";
import { trigger } from "#/utils/trigger";

discordClient.once("clientReady", trigger.safeListener("Forgotten members load", loadForgotten));

// The judge reads every text channel of the server (except the excluded ones) and never forgets anyone.
trigger.discordEvent("messageCreate", (message) => {
  if (message.author.bot || !message.inGuild() || !GUILD_IDS.includes(message.guildId) || isExcluded(channelChain(message)) || isTest(court.get(message.channelId))) return;

  noteLine(
    {
      id: message.author.id,
      name: message.member?.displayName ?? message.author.username,
    },
    conversation.sanitizeContent(message.content),
  );
});
