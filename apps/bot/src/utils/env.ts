import "dotenv/config";
// env loading first
import { z } from "zod";

const schema = z.object({
  POSTGRESQL_URL: z.url(),

  DISCORD_BOT_ID: z.string(),
  DISCORD_BOT_TOKEN: z.string(),
  DISCORD_BOT_NAME: z.string(),

  OPENROUTER_API_KEY: z.string(),
  OPENROUTER_MODELS: z.string().default(""),
});

export const env = schema.parse(process.env);
