import { tableHearing } from "#/tables/hearing";
import { postgres } from "#/utils/postgres";
import { eq } from "drizzle-orm";

export type Hearing = typeof tableHearing.$inferSelect;

export const saveHearing = async (input: Omit<typeof tableHearing.$inferInsert, "id" | "status" | "createdAt">): Promise<Hearing> => {
  const [saved] = await postgres.insert(tableHearing).values(input).returning();
  if (saved === undefined) throw new Error("The hearing was not saved");
  return saved;
};

export const fetchScheduledHearings = async (): Promise<Hearing[]> => postgres.select().from(tableHearing).where(eq(tableHearing.status, "scheduled"));

export const setHearingStatus = async (id: string, status: "started" | "cancelled"): Promise<void> => {
  await postgres.update(tableHearing).set({ status }).where(eq(tableHearing.id, id));
};
