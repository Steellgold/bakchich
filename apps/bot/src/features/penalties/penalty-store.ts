import type { Penalty } from "./penalty-rules";
import { tableExcludedChannel } from "#/tables/excluded-channel";
import { tablePenalty } from "#/tables/penalty";
import { postgres } from "#/utils/postgres";
import { eq, gt } from "drizzle-orm";

/** Sentences still running, per member: every message of the server is checked against them, so they live in memory */
const active = new Map<string, Penalty[]>();
const excluded = new Set<string>();

export const loadPenalties = async (): Promise<void> => {
  const rows = await postgres.select().from(tablePenalty).where(gt(tablePenalty.endsAt, new Date()));
  active.clear();

  for (const row of rows) active.set(row.memberId, [...(active.get(row.memberId) ?? []), row]);

  excluded.clear();

  for (const row of await postgres.select().from(tableExcludedChannel)) excluded.add(row.channelId);
};

/** Running sentences of a member (the ones over are dropped on the way) */
export const penaltiesOf = (memberId: string, now: Date): Penalty[] => {
  const running = (active.get(memberId) ?? []).filter((penalty) => penalty.endsAt > now);
  if (running.length === 0) active.delete(memberId);
  else active.set(memberId, running);
  return running;
};

export const savePenalty = async (input: Omit<Penalty, "id">): Promise<Penalty> => {
  const [saved] = await postgres.insert(tablePenalty).values(input).returning();

  if (saved === undefined) throw new Error("The penalty was not saved");

  active.set(saved.memberId, [...(active.get(saved.memberId) ?? []), saved]);
  return saved;
};

export const extendPenalty = async (penalty: Penalty, endsAt: Date): Promise<void> => {
  penalty.endsAt = endsAt;
  await postgres.update(tablePenalty).set({ endsAt }).where(eq(tablePenalty.id, penalty.id));
};

/** Whether any of these channels (the channel, its parent, its category) is excluded from sentences */
export const isExcluded = (channelIds: (string | null)[]): boolean => channelIds.some((id) => id !== null && excluded.has(id));

/** Exclude a channel or category, or include it again: true when it is now excluded */
export const toggleExclusion = async (channelId: string): Promise<boolean> => {
  if (excluded.delete(channelId)) {
    await postgres.delete(tableExcludedChannel).where(eq(tableExcludedChannel.channelId, channelId));
    return false;
  }

  excluded.add(channelId);
  await postgres.insert(tableExcludedChannel).values({ channelId }).onConflictDoNothing();
  return true;
};
