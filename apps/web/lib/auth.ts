import * as schema from "./auth-schema";
import { db } from "./db";
import { requireEnv } from "./env";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

// The Discord ID is never stored on the user (users could edit it): the bot reads it from the account table.
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  socialProviders: {
    discord: {
      clientId: requireEnv("DISCORD_CLIENT_ID"),
      clientSecret: requireEnv("DISCORD_CLIENT_SECRET"),
    },
  },
});
