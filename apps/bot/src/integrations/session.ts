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

const sessionSchema = z.object({ user: z.object({ id: z.string() }) }).nullable();

/** Web session behind a cookie header, with the Discord ID of its user (null when the user has no Discord account) */
export const fetchSession = async (cookieHeader: string): Promise<{ discordId: string | null } | null> => {
  const response = await fetch(`${env.WEB_INTERNAL_URL}/api/auth/get-session`, { headers: { cookie: cookieHeader } });
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
