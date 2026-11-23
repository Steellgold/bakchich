import { env } from "#/utils/env";

const SPEAK_TIMEOUT_MS = 30_000;

/** Voice of the judge: the text spoken by the self-hosted Piper service, as a WAV file */
export const speak = async (text: string): Promise<Buffer> => {
  const response = await fetch(`${env.PIPER_URL}/synthesize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(SPEAK_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Piper answered ${String(response.status)}`);

  // Piper labels its WAV answer as text/html: the body is what counts.
  return Buffer.from(await response.arrayBuffer());
};
