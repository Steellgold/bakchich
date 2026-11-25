import type { ClientMessage } from "@tribunal/bot/room/protocol";
import { CHAOS_REACH } from "@tribunal/bot/room/chaos";

// ZQSD (AZERTY) and WASD (QWERTY) both move:
export const KEYS = {
  forward: ["KeyW"],
  backward: ["KeyS"],
  left: ["KeyA"],
  right: ["KeyD"],
  run: ["ShiftLeft", "ShiftRight"],
};

/** Chaos keys of the audience on the member you look at (the tomato, key 1, is free-aimed: see the aim code of the player controller) */
export const TARGET_KEYS: Record<string, (targetId: string) => ClientMessage> = {
  Digit2: (targetId) => ({
    type: "whisper",
    targetId,
  }),
  Digit3: (targetId) => ({
    type: "challenge",
    targetId,
    game: "rps",
  }),
  Digit4: (targetId) => ({
    type: "challenge",
    targetId,
    game: "connect4",
  }),
  Digit5: (targetId) => ({
    type: "fight",
    targetId,
  }),
};
export const SELF_KEYS: Record<string, ClientMessage> = {
  KeyO: { type: "shout-objection" },
  KeyB: { type: "toggle-sleep" },
};
/** The chaos bar only shows up next to someone (the server still lets a tomato fly a bit further, for latency) */
export const TARGET_RANGE = CHAOS_REACH;
