import { env } from "#/utils/env";
import { postgres } from "#/utils/postgres";
import { and, eq } from "drizzle-orm";
import { pgTable, text } from "drizzle-orm/pg-core";
import { z } from "zod";

// Read-only view of the BetterAuth account table owned by apps/web (kept out of src/tables so the bot never migrates it).
const tableAuthAccount = pgTable("account", {
  userId: text("user_id").notNull(),
  providerId: text("provider_id").notNull(),
  accountId: text("account_id").notNull(),
});

const SESSION_TIMEOUT_MS = 5_000;

const sessionSchema = z.object({ user: z.object({ id: z.string() }) }).nullable();

/** Web session behind a browser cookie or an Activity bearer token, with its user's Discord ID */
export const fetchSession = async (credentials: { cookie: string } | { token: string }): Promise<{ discordId: string | null } | null> => {
  const headers = "cookie" in credentials ? { cookie: credentials.cookie } : { authorization: `Bearer ${credentials.token}` };
  const response = await fetch(`${env.WEB_INTERNAL_URL}/api/auth/get-session`, { headers, signal: AbortSignal.timeout(SESSION_TIMEOUT_MS) });
  if (!response.ok) return null;

  const parsed = sessionSchema.safeParse(await response.json());
  if (!parsed.success || parsed.data === null) return null;

  const [account] = await postgres
    .select({ accountId: tableAuthAccount.accountId })
    .from(tableAuthAccount)
    .where(and(eq(tableAuthAccount.userId, parsed.data.user.id), eq(tableAuthAccount.providerId, "discord")))
    .limit(1);

  return { discordId: account?.accountId ?? null };
};
