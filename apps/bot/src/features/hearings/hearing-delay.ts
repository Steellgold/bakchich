export const ACTIVE_WINDOW_MS = 30 * 60_000;

const MINUTE_MS = 60_000;

/** Wait before a hearing: the more members are active, the sooner it starts */
export const hearingDelayMs = (activeMembers: number): number => {
  if (activeMembers >= 6) return 10 * MINUTE_MS;
  if (activeMembers >= 3) return 20 * MINUTE_MS;

  return 30 * MINUTE_MS;
};

/** Distinct authors who spoke during the active window */
export const countActiveMembers = (
  authors: {
    id: string;
    createdTimestamp: number;
  }[],
  now: number,
): number => new Set(authors.filter((author) => author.createdTimestamp > now - ACTIVE_WINDOW_MS).map((author) => author.id)).size;
