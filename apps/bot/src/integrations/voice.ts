import type { Guild } from "discord.js";
import { AudioPlayerStatus, createAudioPlayer, createAudioResource, entersState, getVoiceConnection, joinVoiceChannel, StreamType, VoiceConnectionStatus } from "@discordjs/voice";
import { Readable } from "node:stream";

const OUTPUT_RATE = 48_000;
const JOIN_TIMEOUT_MS = 10_000;
const START_TIMEOUT_MS = 5_000;
const MAX_SPEECH_MS = 120_000;

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
export const playInVoice = async (guild: Guild, channelId: string, wav: Buffer): Promise<void> => {
  const connection = joinVoiceChannel({ channelId, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator, selfDeaf: false });
  await entersState(connection, VoiceConnectionStatus.Ready, JOIN_TIMEOUT_MS);

  const player = createAudioPlayer();
  connection.subscribe(player);
  player.play(createAudioResource(Readable.from(toDiscordPcm(wav)), { inputType: StreamType.Raw }));

  // A new player starts idle: wait for it to play, then to end.
  await entersState(player, AudioPlayerStatus.Playing, START_TIMEOUT_MS);
  await entersState(player, AudioPlayerStatus.Idle, MAX_SPEECH_MS);
};

export const leaveVoice = (guildId: string): void => {
  getVoiceConnection(guildId)?.destroy();
};
