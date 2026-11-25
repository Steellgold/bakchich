// WebSocket messages between the courtroom client and the bot (relative imports only, shared with apps/web).
import type { Floor, Member, Mode, Phase, Style, VoteResult } from "../court/engine";
import type { Challenge, GameView, Officer, RoomGame } from "./chaos";
import type { TomatoImpact, Vec3 } from "./tomato";
import type { PlayerState } from "./world";
import { z } from "zod";

const vec3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

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
    /** Shift held: the member runs */
    running: z.boolean().optional(),
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
    /** Where the tomato leaves the hand, and the aimed direction (any length) */
    origin: vec3Schema,
    direction: vec3Schema,
    /** Charge of the throw from 0 to 1 */
    power: z.number().min(0).max(1),
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
  z.object({
    type: z.literal("game-hover"),
    column: z.number().int().min(0).max(6),
  }),
  z.object({ type: z.literal("quit-game") }),
  z.object({ type: z.literal("toggle-sleep") }),
  z.object({ type: z.literal("shout-objection") }),
  z.object({ type: z.literal("jump") }),
  z.object({ type: z.literal("open-archives") }),
  /** Space held (true) or released while diving and falling out of the portal: held at the landing means a superhero landing */
  z.object({
    type: z.literal("hold-landing"),
    held: z.boolean(),
  }),
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

export type ArchiveFile = {
  id: string;
  name: string;
  avatarUrl: string | null;
  profile: string;
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
  games: RoomGame[];
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
  kind: "whisper";
  fromId: string;
  toId: string;
} | {
  type: "effect";
  kind: "tomato";
  fromId: string;
  origin: Vec3;
  velocity: Vec3;
  /** Seconds of flight until the impact */
  duration: number;
  impact: TomatoImpact | null;
} | {
  type: "effect";
  kind: "objection" | "jump";
  fromId: string;
} | {
  /** A diving member broke the window of this side wall (-1 left, 1 right) at this section centre */
  type: "window-break";
  side: -1 | 1;
  z: number;
} | {
  /** The ceiling portal over `id`'s landing spot opens, closes 1.5 s later */
  type: "portal-open";
  id: string;
  x: number;
  z: number;
} | {
  type: "portal-close";
  id: string;
} | {
  /** Screen shake for everyone */
  type: "shake";
} | {
  type: "landing";
  id: string;
  kind: "flop" | "hero";
  x: number;
  z: number;
} | {
  type: "archives";
  /** The clerk's files, read at the archive cabinet */
  files: ArchiveFile[];
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
