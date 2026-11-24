import { fetchChannelGuild } from "#/integrations/discord";
import { speak } from "#/integrations/piper";
import { listen, playInVoice } from "#/integrations/voice";
import { transcribe } from "#/integrations/whisper";
import { attempt } from "#/utils/attempt";
import { limitEmojis } from "#/utils/emojis";
import { logger } from "#/utils/logger";
import { trigger } from "#/utils/trigger";

/** Text of an utterance, empty when the transcription fails (logged: the hearing goes on without it) */
const heard = async (wav: Buffer): Promise<string> => {
  const result = await attempt(async () => transcribe(wav));

  if (result.ok) return result.value;

  logger.warn(`Transcription failed: ${result.error instanceof Error ? result.error.message : String(result.error)}`);
  return "";
};

const onUtterance = trigger.safeListener("Transcription", async (wav: Buffer, onText: (text: string) => void) => {
  const text = await heard(wav);
  if (text !== "") onText(text);
});

/** Sit in a voice channel: the bot sees who speaks and how loud, and hands the text of each utterance to `onText` (the audio is never kept) */
export const listenAndTranscribe = trigger.safeListener("Voice listening", async (voiceChannelId: string, onText: (userId: string, text: string) => void) => {
  await listen(await fetchChannelGuild(voiceChannelId), voiceChannelId, (userId, wav) => {
    onUtterance(wav, (text) => {
      onText(userId, text);
    });
  });
});

// Speeches follow each other in the voice channel instead of talking over one another:
let speaking: Promise<void> = Promise.resolve();

const sayNow = async (voiceChannelId: string, text: string, speakerId: string) => {
  const result = await attempt(async () => playInVoice(await fetchChannelGuild(voiceChannelId), voiceChannelId, await speak(text), speakerId));
  if (!result.ok) logger.error("Judge voice error:", result.error instanceof Error ? result.error.stack : String(result.error));
};

const queueSpeech = async (previous: Promise<void>, voiceChannelId: string, text: string, speakerId: string) => {
  await previous;
  await sayNow(voiceChannelId, text, speakerId);
};

/** Speak a line out loud in a voice channel (Piper), after the lines already queued */
export const speakInVoice = (voiceChannelId: string, text: string, speakerId: string): void => {
  const spoken = limitEmojis(text, 0);
  if (spoken !== "") speaking = queueSpeech(speaking, voiceChannelId, spoken, speakerId);
};
