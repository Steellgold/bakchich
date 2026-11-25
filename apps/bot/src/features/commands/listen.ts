// Ambient listening: after the bot answered a mention (AGENTS category only, enforced by the caller), a channel stays open
// for a short window. Human messages written in it are buffered and answered by ONE AI call.
// Pure rules only (no Discord, no timers, no AI): the caller owns the timers. Everything lives in memory: a restart loses the buffer, on purpose.

export const WINDOW_MS = 20_000;
export const USER_COOLDOWN_MS = 10_000;
export const MAX_LINES = 20;
export const MAX_CHARACTERS = 2000;
/** Consecutive bot replies without a human mention or reply to the bot after which the channel is muted */
export const MAX_BOT_REPLIES = 5;

export type ListenState = {
  /** The window closes at this time, 20 s after the last buffered message */
  endsAt: number;
  lines: string[];
  characters: number;
  botReplies: number;
};

/** One window at most per channel */
export const listening = new Map<string, ListenState>();
/** When each member last opened a window */
const openedBy = new Map<string, number>();

/** A human mention or a reply to the bot opens (or extends) the window and resets the loop guard: false during the member's cooldown */
export const openWindow = (channelId: string, userId: string, now: number, states = listening, openers = openedBy): boolean => {
  if (now - (openers.get(userId) ?? -Infinity) < USER_COOLDOWN_MS) return false;
  openers.set(userId, now);
  const state = states.get(channelId) ?? {
    endsAt: 0,
    lines: [],
    characters: 0,
    botReplies: 0,
  };
  state.endsAt = now + WINDOW_MS;
  state.botReplies = 0;
  states.set(channelId, state);
  return true;
};

/** Buffer one line: false when it is ignored (bot author, no open window, muted channel, batch full) */
export const bufferLine = (channelId: string, authorIsBot: boolean, line: string, now: number, states = listening): boolean => {
  const state = states.get(channelId);
  if (authorIsBot || state === undefined || now >= state.endsAt || state.botReplies >= MAX_BOT_REPLIES) return false;
  const room = MAX_CHARACTERS - state.characters;
  if (state.lines.length >= MAX_LINES || room <= 0 || line === "") return false;
  const kept = line.slice(0, room);
  state.lines.push(kept);
  state.characters += kept.length;
  state.endsAt = now + WINDOW_MS;
  return true;
};

/** The batch to answer once the window is over, else null. An empty window closes; after a batch the window reopens until the loop guard mutes the channel */
export const takeBatch = (channelId: string, now: number, states = listening): string[] | null => {
  const state = states.get(channelId);
  if (state === undefined || now < state.endsAt) return null;
  if (state.lines.length === 0) {
    states.delete(channelId);
    return null;
  }
  const batch = state.lines;
  state.lines = [];
  state.characters = 0;
  state.botReplies += 1;
  if (state.botReplies >= MAX_BOT_REPLIES) states.delete(channelId);
  else state.endsAt = now + WINDOW_MS;
  return batch;
};
