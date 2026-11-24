import { env } from "#/utils/env";
import { z } from "zod";

const TRANSCRIBE_TIMEOUT_MS = 30_000;

const answerSchema = z.object({ text: z.string() });

/** Whisper writes noises between brackets, parentheses or asterisks (« *rires* », « [Musique] »): not speech */
const NOISE_PATTERN = /\[[^\]]*\]|\([^)]*\)|\*[^*]*\*/gu;

/** Text of a 16 kHz mono WAV utterance, from the self-hosted whisper.cpp service; empty when nothing was said. The audio is not kept. */
export const transcribe = async (wav: Buffer): Promise<string> => {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "utterance.wav");
  form.append("response_format", "json");
  form.append("temperature", "0.0");

  const response = await fetch(`${env.WHISPER_URL}/inference`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
  });

  if (!response.ok) throw new Error(`Whisper answered ${String(response.status)}`);

  return answerSchema
    .parse(await response.json())
    .text.replace(NOISE_PATTERN, "")
    .replace(/\s+/gu, " ")
    .trim();
};
