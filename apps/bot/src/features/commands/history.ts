import type { Message } from "discord.js";
import { JUDGE_NAME } from "#/features/room/layout";
import { conversation } from "#/integrations/discord";
import { attempt } from "#/utils/attempt";
import { ComponentType } from "discord.js";

const HISTORY_LENGTH = 20;
const EXTENDED_HISTORY_LENGTH = 100;
const HISTORY_CHARACTERS = 12_000;
const EXTENDED_HISTORY_CHARACTERS = 40_000;
const TRUNCATED = " [message truncated]";

/** Message text for the AI: without the bot mention, other mentions written « @Name [id:123] » */
export const readableContent = (message: Message<true>, botId: string) => message.content
  .replaceAll(`<@${botId}>`, "")
  .replace(
    /<@!?(\d+)>/gu,
    (_mention, id: string) => `@${message.mentions.members.get(id)?.displayName ?? message.mentions.users.get(id)?.displayName ?? "?"} [id:${id}]`,
  )
  .trim();

/** Recent messages, oldest first, with a shared character budget and the replied message always reserved */
export const historyOf = async (message: Message<true>, botId: string, expanded = false): Promise<string[]> => {
  const line = (entry: Message<true>) => {
    const text = entry.content === "" ? (entry.embeds[0]?.description ?? entry.components.filter((component) => component.type === ComponentType.TextDisplay).map((component) => component.content).join("\n\n")) : readableContent(entry, botId);
    const name = entry.author.id === botId ? JUDGE_NAME : (entry.member?.displayName ?? entry.author.username);
    return text === "" ? "" : `${name} : ${conversation.sanitizeContent(text)}`;
  };
  const fetched = await attempt(async () => message.channel.messages.fetch({
    limit: expanded ? EXTENDED_HISTORY_LENGTH : HISTORY_LENGTH,
    before: message.id,
  }));
  const recent = fetched.ok ? [...fetched.value.values()] : [];
  const lines: string[] = [];
  let remaining = expanded ? EXTENDED_HISTORY_CHARACTERS : HISTORY_CHARACTERS;

  if (message.reference?.messageId !== undefined) {
    const referenceId = message.reference.messageId;
    const referenced = await attempt(async () => recent.find((entry) => entry.id === referenceId) ?? await message.fetchReference());
    const text = referenced.ok ? line(referenced.value) : "";
    if (text !== "") {
      const fullReference = `(message they reply to) ${text}`;
      const reference = fullReference.length > remaining ? `${fullReference.slice(0, remaining - TRUNCATED.length)}${TRUNCATED}` : fullReference;
      lines.push(reference);
      remaining -= reference.length + 1;
    }
  }

  for (const entry of recent) {
    if (entry.id === message.reference?.messageId) continue;
    const text = line(entry);
    if (text === "") continue;
    if (text.length > remaining) {
      if (remaining > TRUNCATED.length) lines.unshift(`${text.slice(0, remaining - TRUNCATED.length)}${TRUNCATED}`);
      break;
    }
    lines.unshift(text);
    remaining -= text.length + 1;
  }

  return lines;
};
