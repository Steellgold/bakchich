import "dotenv/config";
// env loading first
import { z } from "zod";

/** Comma-separated Discord IDs ("id1,id2"), spaces and empty entries ignored */
const idList = (fallback: string) => z
  .string()
  .default(fallback)
  .transform((value) => value
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== ""),
  );

const schema = z.object({
  POSTGRESQL_URL: z.url(),

  DISCORD_BOT_TOKEN: z.string(),
  // « Le Royaume » and its AGENTS category by default; each accepts several comma-separated IDs (other servers, test servers):
  DISCORD_GUILD_ID: idList("1095123126746099834"),
  DISCORD_AGENTS_CATEGORY_ID: idList("1574094410830844105"),

  OPENROUTER_API_KEY: z.string(),
  OPENROUTER_MODELS: z.string().default(""),

  // Audio categories where the bot creates the voice channel of each hearing (« Le Royaume » by default, comma-separated, one per server), empty to open trials at once without channel or event:
  DISCORD_VOICE_CATEGORY_ID: idList("1572558769139752960"),

  PIPER_URL: z.url().default("http://localhost:5000"),
  // Speaker of a multi-speaker Piper voice (8582 of fr_FR-mls-medium by default), empty for a single-speaker voice:
  PIPER_SPEAKER: z.string().default("8582"),

  // Self-hosted whisper.cpp server that transcribes what is said in the hearings (text only, audio never kept):
  WHISPER_URL: z.url().default("http://localhost:8080"),

  // Exa key for the web search behind the judge's legal answers, empty to answer without sources:
  EXA_API_KEY: z.string().default(""),

  // Public address of the web app: it draws the avatar mosaic of trials with several accused (empty: the first avatar only):
  WEB_PUBLIC_URL: z.string().default(""),

  ROOM_PORT: z.coerce.number().int().default(3001),
  WEB_INTERNAL_URL: z.url().default("http://localhost:3000"),
});

export const env = schema.parse(process.env);
