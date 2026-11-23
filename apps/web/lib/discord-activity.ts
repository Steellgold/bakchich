import type { DiscordSDK as DiscordClient } from "@discord/embedded-app-sdk";
import { z } from "zod";

const activitySessionSchema = z.object({ accessToken: z.string().min(1), token: z.string().min(1) });
let sdk: DiscordClient | undefined;

export const isDiscordActivity = (clientId: string) => window.location.hostname === `${clientId}.discordsays.com`;

export const activityRoomUrl = () => `wss://${window.location.host}/.proxy/ws`;

/** Use Discord's authorization dialog without navigating away from the Activity frame. */
export const signInActivity = async (clientId: string): Promise<string> => {
  const { DiscordSDK } = await import("@discord/embedded-app-sdk");
  sdk ??= new DiscordSDK(clientId);
  const discordSdk = sdk;
  await discordSdk.ready();

  const codeVerifier = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  const { code } = await discordSdk.commands.authorize({
    client_id: clientId,
    response_type: "code",
    state: "",
    prompt: "none",
    scope: ["identify", "email"],
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const response = await fetch("/.proxy/api/auth/sign-in/discord-activity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, codeVerifier }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("La connexion à Discord a échoué.");

  const { accessToken, token } = activitySessionSchema.parse(await response.json());
  await discordSdk.commands.authenticate({ access_token: accessToken });
  return token;
};
