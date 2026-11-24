import { limitEmojis } from "@tribunal/bot/emojis";
import Image from "next/image";

/** Render the same single allowed custom emoji as Discord, without exposing its markup. */
export const EmojiText = ({ children }: { children: string }) => {
  const content = limitEmojis(children);
  const match = (/<:\w+:(?<id>\d+)>/u).exec(content);
  const id = match?.groups?.id;
  if (match === null || id === undefined) return content;

  return (
    <>
      {content.slice(0, match.index)}
      <Image
        className="court-emoji"
        src={`/.proxy/api/emojis/${id}`}
        alt=""
        width={32}
        height={32}
        unoptimized
      />
      {content.slice(match.index + match[0].length)}
    </>
  );
};
