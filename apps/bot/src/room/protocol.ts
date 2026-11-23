// WebSocket messages between the courtroom client and the bot (relative imports only, shared with apps/web).
import type { Member, Phase, VoteResult } from "../court/engine";
import type { PlayerState } from "./world";
import { z } from "zod";

const clientMessageSchema = z.discriminatedUnion("type", [
  /** Explicit session token, for clients whose cookie does not reach the WebSocket (phase 3 Activity) */
  z.object({ type: z.literal("auth"), token: z.string().min(1) }),
  z.object({ type: z.literal("move"), x: z.number(), z: z.number(), rotation: z.number() }),
  z.object({ type: z.literal("become-juror") }),
  z.object({ type: z.literal("sit-on-bench") }),
  z.object({ type: z.literal("sit-down") }),
  z.object({ type: z.literal("stand-up") }),
  z.object({ type: z.literal("vote"), guilty: z.boolean() }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type TrialView = { id: string; accused: Member[]; plaintiff: Member; lawyer: Member | null; witness: Member | null; crime: string; phase: Phase; endsAt: number };

export type Npc = { id: string; name: string; avatarUrl: string | null; seatId: string };

export type ServerMessage
  = | { type: "welcome"; selfId: string }
    | { type: "snapshot"; players: PlayerState[]; npcs: Npc[]; trial: TrialView | null; speaking: string[] }
  /** speakerId null is the judge */
    | { type: "speech"; speakerId: string | null; text: string }
  /** Official verdict line built by the code */
    | { type: "verdict"; line: string }
    | { type: "vote-result"; result: VoteResult }
  /** French reason, shown as is, the socket is closed right after */
    | { type: "rejected"; reason: string };

// Low-level parser: any malformed input is ignored instead of crashing the connection.
export const parseClientMessage = (raw: string): ClientMessage | null => {
  try {
    const result = clientMessageSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  }
  catch {
    return null;
  }
};
