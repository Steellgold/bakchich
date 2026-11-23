import * as schema from "./auth-schema";
import { db } from "./db";
import { discordActivityAuth } from "./discord-activity-auth";
import { requireEnv } from "./env";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";

const discordCredentials = {
  clientId: requireEnv("DISCORD_CLIENT_ID"),
  clientSecret: requireEnv("DISCORD_CLIENT_SECRET"),
};

// The Discord ID is never stored on the user (users could edit it): the bot reads it from the account table.
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  trustedOrigins: [`https://${discordCredentials.clientId}.discordsays.com`],
  plugins: [discordActivityAuth(discordCredentials), bearer()],
  socialProviders: {
    discord: discordCredentials,
  },
});
