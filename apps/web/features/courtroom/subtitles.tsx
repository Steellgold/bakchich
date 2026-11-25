import type { Speech } from "./use-room-socket";
import { memberLook } from "./character/looks";
import { EmojiText } from "./emoji-text";
import { JUDGE_NAME } from "@tribunal/bot/room/layout";

const MAX_LINES = 4;
const JUDGE_COLOR = "#f2bd3c";
const CLERK_COLOR = "#3fb5a8";

/** How long a line stays up: 4 s for a short one, a little more per character, capped (the socket drops each speech after this delay) */
export const subtitleDuration = (text: string) => Math.min(10_000, Math.max(4_000, 3_000 + text.length * 50));

type Speaker = {
  id: string;
  name: string;
  color: string;
};

/** Video-game subtitles at the bottom of the screen: "Name : text", one line per speaker, each fading after a few seconds */
export const Subtitles = ({ speeches, speakers }: {
  speeches: Speech[];
  speakers: Speaker[];
}) => {
  // A new line of a speaker replaces their previous one (the socket drops expired speeches):
  const latest = new Map<string | null, Speech>();
  for (const speech of speeches) latest.set(speech.speakerId, speech);

  const lines = [...latest.values()].slice(-MAX_LINES);

  if (lines.length === 0) return null;

  return (
    <div className="subtitles" aria-live="polite">
      {lines.map((speech) => {
        const speaker = speech.speakerId === null ? { name: JUDGE_NAME, color: JUDGE_COLOR } : speech.speakerId === "clerk" ? { name: "Le Greffier", color: CLERK_COLOR } : speakers.find((entry) => entry.id === speech.speakerId) ?? { name: "Un membre", color: memberLook(speech.speakerId).accent };

        return (
          <p
            key={`${speech.speakerId ?? "judge"}-${String(speech.at)}`}
            className="subtitle"
            // The fade runs over the line's whole life, so it ends when the socket drops the speech:
            style={{ animationDuration: `${String(subtitleDuration(speech.text))}ms` }}
          >
            <span className="subtitle-name" style={{ color: speaker.color }}>
              {speaker.name}
              {" : "}
            </span>
            <EmojiText>{speech.text}</EmojiText>
          </p>
        );
      })}
    </div>
  );
};
