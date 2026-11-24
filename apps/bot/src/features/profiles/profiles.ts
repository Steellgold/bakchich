import { judge } from "#/features/court/court";
import { tableMember } from "#/tables/member";
import { logger } from "#/utils/logger";
import { postgres } from "#/utils/postgres";
import { trigger } from "#/utils/trigger";
import { desc, inArray, isNotNull, sql } from "drizzle-orm";

/** A member's file is rewritten once this many new lines were heard or read */
const LINES_PER_UPDATE = 25;
/** Lines kept while waiting for an update (the oldest go first) */
const MAX_BUFFERED_LINES = 60;
const MAX_LINE_LENGTH = 300;
/** The AI quota is shared with the trials: few updates, never twice in a row for the same member */
const MAX_UPDATES_PER_HOUR = 6;
const MEMBER_UPDATE_GAP_MS = 2 * 60 * 60_000;
const HOUR_MS = 60 * 60_000;

/** What each member said since their file was last updated: in memory only, the messages themselves are never stored */
const buffers = new Map<
  string,
  {
    name: string;
    lines: string[];
    updatedAt: number;
  }
>();
const recentUpdates: number[] = [];

const canUpdate = (updatedAt: number, now: number) => {
  while (recentUpdates.length > 0 && (recentUpdates[0] ?? now) < now - HOUR_MS) recentUpdates.shift();

  return recentUpdates.length < MAX_UPDATES_PER_HOUR && now - updatedAt >= MEMBER_UPDATE_GAP_MS;
};

/** The clerk rewrites the file of a member from their latest lines; the old file stays when the AI does not answer */
const updateProfile = trigger.safeListener("Profile update", async (memberId: string) => {
  const buffer = buffers.get(memberId);

  if (buffer === undefined) return;

  const lines = buffer.lines;
  buffer.lines = [];
  buffer.updatedAt = Date.now();
  recentUpdates.push(buffer.updatedAt);

  const [row] = await postgres
    .select({ profile: tableMember.profile })
    .from(tableMember)
    .where(inArray(tableMember.id, [memberId]));

  const profile = await judge.profile(buffer.name, row?.profile ?? "", lines);

  if (profile === "") return;

  await postgres
    .insert(tableMember)
    .values({
      id: memberId,
      name: buffer.name,
      avatarUrl: null,
      profile,
      profiledAt: new Date(),
    })
    .onConflictDoUpdate({
      target: tableMember.id,
      set: {
        profile,
        profiledAt: new Date(),
        name: sql`excluded.name`,
      },
    });
  logger.info(`Profile of ${buffer.name} updated`);
});

/** The judge notes something a member said or wrote (messages of the server, lines heard in hearings) */
export const noteLine = (member: {
  id: string;
  name: string;
}, text: string): void => {
  const line = text.replace(/\s+/gu, " ").trim().slice(0, MAX_LINE_LENGTH);

  if (line === "") return;

  const buffer = buffers.get(member.id) ?? {
    name: member.name,
    lines: [],
    updatedAt: 0,
  };
  buffer.name = member.name;
  buffer.lines = [...buffer.lines, line].slice(-MAX_BUFFERED_LINES);
  buffers.set(member.id, buffer);

  if (buffer.lines.length >= LINES_PER_UPDATE && canUpdate(buffer.updatedAt, Date.now())) updateProfile(member.id);
};

/** What the judge knows about these members, one « name : notes » line each, empty when he knows none of them */
export const knownAbout = async (memberIds: string[]): Promise<string> => {
  if (memberIds.length === 0) return "";

  const rows = await postgres
    .select({
      name: tableMember.name,
      profile: tableMember.profile,
    })
    .from(tableMember)
    .where(inArray(tableMember.id, memberIds));
  return rows.flatMap((row) => (row.profile === null ? [] : [`${row.name} : ${row.profile}`])).join("\n");
};

export type MemberFile = {
  id: string;
  name: string;
  avatarUrl: string | null;
  profile: string | null;
  profiledAt: Date | null;
};

/** The file of one member, null when the bot has never seen them */
export const fileOf = async (memberId: string): Promise<MemberFile | null> => {
  const [row] = await postgres
    .select()
    .from(tableMember)
    .where(inArray(tableMember.id, [memberId]));
  return row ?? null;
};

const MAX_ARCHIVED_FILES = 60;

/** Every member the judge has notes on, most recently updated first: the shelves of the courtroom archives */
export const listFiles = async (): Promise<MemberFile[]> => postgres.select().from(tableMember).where(isNotNull(tableMember.profile)).orderBy(desc(tableMember.profiledAt)).limit(MAX_ARCHIVED_FILES);
