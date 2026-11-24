import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, formCsrfMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { handleOAuthUserInfo } from "better-auth/oauth2";
import { z } from "zod";

const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().optional(),
  expires_in: z.number().positive(),
  scope: z.string(),
});

/** Exchanges an Activity authorization code without navigating outside Discord's iframe. */
export const discordActivityAuth = (credentials: { clientId: string; clientSecret: string }) => ({
  id: "discord-activity",
  endpoints: {
    signInDiscordActivity: createAuthEndpoint(
      "/sign-in/discord-activity",
      {
        method: "POST",
        use: [formCsrfMiddleware],
        body: z.object({
          code: z.string().min(1).max(4096),
          codeVerifier: z
            .string()
            .min(43)
            .max(128)
            .regex(/^[\w-]+$/u),
        }),
      },
      async (ctx) => {
        const response = await fetch("https://discord.com/api/oauth2/token", {
          method: "POST",
          body: new URLSearchParams({
            client_id: credentials.clientId,
            client_secret: credentials.clientSecret,
            grant_type: "authorization_code",
            code: ctx.body.code,
            code_verifier: ctx.body.codeVerifier,
          }),
          signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) throw new APIError("UNAUTHORIZED", { message: "Autorisation Discord refusée. Réessaie de te connecter." });

        const tokens = tokenSchema.safeParse(await response.json());

        if (!tokens.success) throw new APIError("BAD_GATEWAY", { message: "Réponse Discord invalide. Réessaie plus tard." });

        const provider = ctx.context.socialProviders.find((candidate) => candidate.id === "discord");

        if (provider === undefined) throw new Error("Discord provider is not configured");

        const { access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn, scope } = tokens.data;
        const profile = await provider.getUserInfo({ accessToken });

        const identity = z.object({ id: z.string().min(1) }).safeParse(profile?.data);

        if (profile?.user.email === undefined || profile.user.email === null || !identity.success) {
          throw new APIError("UNAUTHORIZED", { message: "Impossible de récupérer ton compte Discord. Autorise l’accès à ton adresse e-mail." });
        }

        const result = await handleOAuthUserInfo(ctx, {
          userInfo: {
            ...profile.user,
            id: identity.data.id,
            name: profile.user.name ?? "",
            email: profile.user.email,
            emailVerified: profile.user.emailVerified,
          },
          account: {
            providerId: "discord",
            accountId: identity.data.id,
            accessToken,
            refreshToken,
            accessTokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
            scope: scope.split(" ").join(","),
          },
          requireExactAccountBinding: true,
        });

        if (result.data === null) throw new APIError("UNAUTHORIZED", { message: "Impossible d’ouvrir ta session Discord. Réessaie plus tard." });

        await setSessionCookie(ctx, result.data);
        return ctx.json({
          accessToken,
          token: result.data.session.token,
        });
      },
    ),
  },
}) satisfies BetterAuthPlugin;
