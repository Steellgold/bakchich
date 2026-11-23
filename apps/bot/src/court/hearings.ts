import type { Member } from "./engine";
import { tableHearing } from "#/tables/hearing";
import { postgres } from "#/utils/postgres";
import { eq, inArray } from "drizzle-orm";

export type Hearing = typeof tableHearing.$inferSelect;

export const saveHearing = async (input: Omit<typeof tableHearing.$inferInsert, "id" | "status" | "createdAt">): Promise<Hearing> => {
  const [saved] = await postgres.insert(tableHearing).values(input).returning();
  if (saved === undefined) throw new Error("The hearing was not saved");
  return saved;
};

/** Hearings waiting for their time, or whose trial was running when the bot stopped */
export const fetchUnfinishedHearings = async (): Promise<Hearing[]> => postgres.select().from(tableHearing).where(inArray(tableHearing.status, ["scheduled", "started"]));

export const setHearingStatus = async (id: string, status: "started" | "cancelled" | "finished"): Promise<void> => {
  await postgres.update(tableHearing).set({ status }).where(eq(tableHearing.id, id));
};

export const setHearingLawyer = async (id: string, lawyer: Member): Promise<void> => {
  await postgres.update(tableHearing).set({ lawyer }).where(eq(tableHearing.id, id));
};
