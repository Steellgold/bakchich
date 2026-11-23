import "dotenv/config";
// env loading first
import { z } from "zod";

const schema = z.object({
  POSTGRESQL_URL: z.url(),

  DISCORD_BOT_TOKEN: z.string(),
  // « Le Royaume » and its AGENTS category by default, override them to run on a test server:
  DISCORD_GUILD_ID: z.string().default("1095123126746099834"),
  DISCORD_AGENTS_CATEGORY_ID: z.string().default("1574094410830844105"),

  OPENROUTER_API_KEY: z.string(),
  OPENROUTER_MODELS: z.string().default(""),

  // Voice channel of the hearing events, empty to open trials at once without any event:
  DISCORD_TRIAL_VOICE_CHANNEL_ID: z.string().default(""),

  PIPER_URL: z.url().default("http://localhost:5000"),

  ROOM_PORT: z.coerce.number().int().default(3001),
  WEB_INTERNAL_URL: z.url().default("http://localhost:3000"),
});

export const env = schema.parse(process.env);
