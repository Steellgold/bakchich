// WebSocket messages between the courtroom client and the bot (relative imports only, shared with apps/web).
import type { Floor, Member, Mode, Phase, Style, VoteResult } from "../court/engine";
import type { Challenge, GameView, Officer } from "./chaos";
import type { PlayerState } from "./world";
import { z } from "zod";

const clientMessageSchema = z.discriminatedUnion("type", [
  /** Explicit session token, for clients whose cookie does not reach the WebSocket (phase 3 Activity) */
  z.object({
    type: z.literal("auth"),
    token: z.string().min(1),
  }),
  z.object({
    type: z.literal("move"),
    x: z.number(),
    z: z.number(),
    rotation: z.number(),
  }),
  z.object({ type: z.literal("become-juror") }),
  z.object({ type: z.literal("sit-on-bench") }),
  z.object({ type: z.literal("sit-down") }),
  z.object({ type: z.literal("stand-up") }),
  z.object({
    type: z.literal("vote"),
    guilty: z.boolean(),
  }),
  // Chaos in the audience:
  z.object({
    type: z.literal("throw-tomato"),
    targetId: z.string(),
  }),
  z.object({
    type: z.literal("whisper"),
    targetId: z.string(),
  }),
  z.object({
    type: z.literal("fight"),
    targetId: z.string(),
  }),
  z.object({
    type: z.literal("challenge"),
    targetId: z.string(),
    game: z.enum(["rps", "connect4"]),
  }),
  z.object({
    type: z.literal("answer-challenge"),
    accept: z.boolean(),
  }),
  z.object({
    type: z.literal("rps-pick"),
    pick: z.enum(["rock", "paper", "scissors"]),
  }),
  z.object({
    type: z.literal("connect4-drop"),
    column: z.number().int().min(0).max(6),
  }),
  z.object({ type: z.literal("quit-game") }),
  z.object({ type: z.literal("toggle-sleep") }),
  z.object({ type: z.literal("shout-objection") }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type TrialView = {
  id: string;
  accused: Member[];
  plaintiff: Member;
  lawyer: Member | null;
  witness: Member | null;
  crime: string;
  style: Style;
  mode: Mode;
  phase: Phase;
  /** Who the court gives the floor to */
  floor: Floor;
  endsAt: number;
};

export type Npc = {
  id: string;
  name: string;
  avatarUrl: string | null;
  seatId: string;
};

export type ServerMessage = {
  type: "welcome";
  selfId: string;
} | {
  type: "snapshot";
  players: PlayerState[];
  npcs: Npc[];
  trial: TrialView | null;
  speaking: string[];
  /** Loudness of the members talking, from 0 to 1 */
  levels: Record<string, number>;
  sleeping: string[];
  /** Members with a tomato on the face */
  splats: string[];
  fighting: string[];
  officers: Officer[];
} | {
  type: "speech";
  speakerId: string | null;
  text: string;
} | {
  type: "verdict";
  line: string;
} | {
  type: "vote-result";
  result: VoteResult;
} | {
  type: "effect";
  kind: "tomato" | "whisper";
  fromId: string;
  toId: string;
} | {
  type: "effect";
  kind: "objection";
  fromId: string;
} | {
  type: "rumor";
  fromName: string;
  text: string;
} | {
  type: "challenged";
  challenge: Challenge;
} | {
  type: "game";
  game: GameView | null;
} | {
  type: "chaos-refused";
  reason: string;
} | {
  type: "rejected";
  reason: string;
};

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
