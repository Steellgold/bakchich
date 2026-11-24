import type { AudioReceiveStream, VoiceConnection } from "@discordjs/voice";
import type { Guild } from "discord.js";
import { AudioPlayerStatus, createAudioPlayer, createAudioResource, EndBehaviorType, entersState, getVoiceConnection, joinVoiceChannel, StreamType, VoiceConnectionStatus } from "@discordjs/voice";
import { Readable } from "node:stream";
import OpusScript from "opusscript";

const OUTPUT_RATE = 48_000;
const TRANSCRIPTION_RATE = 16_000;
const JOIN_TIMEOUT_MS = 10_000;
const START_TIMEOUT_MS = 5_000;
const MAX_SPEECH_MS = 120_000;
/** An utterance ends after this much silence */
const SILENCE_MS = 800;
/** Shorter utterances are coughs and clicks: not transcribed */
const MIN_UTTERANCE_MS = 600;
/** Longer utterances are cut and sent as they are */
const MAX_UTTERANCE_MS = 30_000;
/** RMS of a loud voice in 16-bit samples, mapped to the level 1 */
const LOUD_RMS = 6_000;

/** Discord IDs of the members talking in the hearing voice channel, plus "judge" and the AI lawyer ID while their voice plays: the courtroom animates them */
export const speakingIds = new Set<string>();

/** Loudness of each member talking, from 0 to 1: the courtroom moves their arms with it */
export const speakingLevels = new Map<string, number>();

/** Called with one utterance of a member, as a 16 kHz mono WAV kept in memory only */
export type OnUtterance = (userId: string, wav: Buffer) => void;

const watched = new WeakSet<VoiceConnection>();
/** Per guild: the voice channel being listened to and what to do with each utterance */
const listeners = new Map<
  string,
  {
    channelId: string;
    onUtterance: OnUtterance;
  }
>();

const join = async (guild: Guild, channelId: string) => {
  const connection = joinVoiceChannel({
    channelId,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: false,
  });
  await entersState(connection, VoiceConnectionStatus.Ready, JOIN_TIMEOUT_MS);
  return connection;
};

/** 16 kHz mono 16-bit WAV from 48 kHz stereo 16-bit PCM (every third frame, channels averaged) */
const toTranscriptionWav = (pcm: Buffer): Buffer => {
  const step = OUTPUT_RATE / TRANSCRIPTION_RATE;
  const frames = Math.floor(pcm.length / 4 / step);
  const wav = Buffer.alloc(44 + frames * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + frames * 2, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(TRANSCRIPTION_RATE, 24);
  wav.writeUInt32LE(TRANSCRIPTION_RATE * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(frames * 2, 40);

  for (let index = 0; index < frames; index += 1) {
    const offset = index * step * 4;
    wav.writeInt16LE(Math.round((pcm.readInt16LE(offset) + pcm.readInt16LE(offset + 2)) / 2), 44 + index * 2);
  }

  return wav;
};

const rms = (pcm: Buffer): number => {
  let sum = 0;
  const samples = Math.floor(pcm.length / 2);

  for (let index = 0; index < samples; index += 1) sum += pcm.readInt16LE(index * 2) ** 2;

  return samples === 0 ? 0 : Math.sqrt(sum / samples);
};

/** One utterance of a member: Opus packets decoded in memory, the level updated as they come, the audio handed over at the end then dropped */
const receive = (stream: AudioReceiveStream, guildId: string, userId: string) => {
  const decoder = new OpusScript(OUTPUT_RATE, 2);
  const chunks: Buffer[] = [];
  let bytes = 0;

  stream.on("data", (packet: Buffer) => {
    // Corrupted packets happen on bad networks: skipped, never fatal.
    let pcm: Buffer;

    try {
      pcm = decoder.decode(packet);
    }
    catch {
      return;
    }

    speakingLevels.set(userId, Math.min(1, rms(pcm) / LOUD_RMS));

    if (bytes < (MAX_UTTERANCE_MS / 1000) * OUTPUT_RATE * 4) {
      chunks.push(pcm);
      bytes += pcm.length;
    }
  });
  stream.once("end", () => {
    decoder.delete();
    speakingLevels.delete(userId);
    const listener = listeners.get(guildId);

    if (listener === undefined || bytes < (MIN_UTTERANCE_MS / 1000) * OUTPUT_RATE * 4) return;

    listener.onUtterance(userId, toTranscriptionWav(Buffer.concat(chunks)));
  });
  stream.once("error", () => {
    decoder.delete();
    speakingLevels.delete(userId);
  });
};

/**
 * Join a voice channel, follow who is speaking and how loud, and hand each utterance to `onUtterance` for transcription.
 * The audio only lives in memory for the length of an utterance: nothing is ever written or kept.
 */
export const listen = async (guild: Guild, channelId: string, onUtterance: OnUtterance): Promise<void> => {
  listeners.set(guild.id, { channelId, onUtterance });
  const connection = await join(guild, channelId);

  if (watched.has(connection)) return;

  watched.add(connection);
  connection.receiver.speaking.on("start", (userId) => {
    speakingIds.add(userId);
    // One stream per utterance; a member already streaming keeps their stream.
    if (connection.receiver.subscriptions.has(userId)) return;

    receive(
      connection.receiver.subscribe(userId, {
        end: {
          behavior: EndBehaviorType.AfterSilence,
          duration: SILENCE_MS,
        },
      }),
      guild.id,
      userId,
    );
  });
  connection.receiver.speaking.on("end", (userId) => {
    speakingIds.delete(userId);
  });
};

/** Stop transcribing a channel (the bot stays connected until it leaves or moves) */
export const stopListening = (guildId: string, channelId: string): void => {
  if (listeners.get(guildId)?.channelId === channelId) listeners.delete(guildId);
};

/** 16-bit PCM WAV to the raw 48 kHz stereo 16-bit PCM that Discord voice plays (linear resampling, first channel only) */
const toDiscordPcm = (wav: Buffer): Buffer => {
  const channels = wav.readUInt16LE(22);
  const inputRate = wav.readUInt32LE(24);
  const dataStart = wav.indexOf("data") + 8;
  const frames = Math.floor((wav.length - dataStart) / (2 * channels));
  const outputFrames = Math.floor((frames * OUTPUT_RATE) / inputRate);
  const output = Buffer.alloc(outputFrames * 4);
  const sample = (frame: number) => wav.readInt16LE(dataStart + Math.min(frame, frames - 1) * channels * 2);

  for (let index = 0; index < outputFrames; index += 1) {
    const position = (index * inputRate) / OUTPUT_RATE;
    const before = Math.floor(position);
    const value = Math.round(sample(before) + (sample(before + 1) - sample(before)) * (position - before));
    output.writeInt16LE(value, index * 4);
    output.writeInt16LE(value, index * 4 + 2);
  }

  return output;
};

/** Join the voice channel and play a WAV in it, resolving when it ends */
export const playInVoice = async (guild: Guild, channelId: string, wav: Buffer, speakerId: string): Promise<void> => {
  const connection = await join(guild, channelId);

  const player = createAudioPlayer();
  connection.subscribe(player);
  player.play(createAudioResource(Readable.from(toDiscordPcm(wav)), { inputType: StreamType.Raw }));

  // A new player starts idle: wait for it to play, then to end.
  speakingIds.add(speakerId);

  try {
    await entersState(player, AudioPlayerStatus.Playing, START_TIMEOUT_MS);
    await entersState(player, AudioPlayerStatus.Idle, MAX_SPEECH_MS);
  }
  finally {
    speakingIds.delete(speakerId);
  }
};

/** Leave the voice channel of a finished hearing, unless the bot has already moved on to another hearing's channel */
export const leaveVoice = (guildId: string, channelId: string): void => {
  const connection = getVoiceConnection(guildId);

  if (connection?.joinConfig.channelId !== channelId) return;

  stopListening(guildId, channelId);
  connection.destroy();
  speakingIds.clear();
  speakingLevels.clear();
};
