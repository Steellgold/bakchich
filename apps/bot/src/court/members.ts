import { tableMember } from "#/tables/member";
import { postgres } from "#/utils/postgres";
import { desc, sql } from "drizzle-orm";

export type KnownMember = { id: string; name: string; avatarUrl: string | null; lastSeenAt: Date };

/** Record a member interaction, keeping the previous avatar when none is given */
export const upsertMember = async (member: { id: string; name: string; avatarUrl: string | null }): Promise<void> => {
  await postgres.insert(tableMember)
    .values({ ...member, lastSeenAt: new Date() })
    .onConflictDoUpdate({
      target: tableMember.id,
      set: {
        name: member.name,
        avatarUrl: sql`coalesce(excluded.avatar_url, ${tableMember.avatarUrl})`,
        lastSeenAt: new Date(),
      },
    });
};

/** Known members, most recently seen first */
export const listKnownMembers = async (limit: number): Promise<KnownMember[]> => postgres
  .select()
  .from(tableMember)
  .orderBy(desc(tableMember.lastSeenAt))
  .limit(limit);
