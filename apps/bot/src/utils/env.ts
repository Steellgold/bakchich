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

  ROOM_PORT: z.coerce.number().int().default(3001),
  WEB_INTERNAL_URL: z.url().default("http://localhost:3000"),
});

export const env = schema.parse(process.env);
