import type { ListenState } from "./listen";
import { bufferLine, MAX_BOT_REPLIES, MAX_CHARACTERS, MAX_LINES, openWindow, takeBatch, USER_COOLDOWN_MS, WINDOW_MS } from "./listen";
import assert from "node:assert/strict";

const states = new Map<string, ListenState>();
const openers = new Map<string, number>();
const c = "chan";

// Window: opens 20 s, user cooldown 10 s
assert.equal(openWindow(c, "u1", 0, states, openers), true);
assert.equal(openWindow(c, "u1", USER_COOLDOWN_MS - 1, states, openers), false);
assert.equal(openWindow(c, "u1", USER_COOLDOWN_MS, states, openers), true);
const t0 = USER_COOLDOWN_MS;

// Bot filter and closed channel
assert.equal(bufferLine(c, true, "hi", t0 + 1, states), false);
assert.equal(bufferLine("other", false, "hi", t0 + 1, states), false);

// Window end moves with the last message; closed after it
assert.equal(bufferLine(c, false, "a", t0 + 5000, states), true);
assert.equal(takeBatch(c, t0 + WINDOW_MS + 4999, states), null);
assert.equal(bufferLine(c, false, "b", t0 + WINDOW_MS + 4999, states), true);
assert.equal(bufferLine(c, false, "late", t0 + 2 * WINDOW_MS + 4999, states), false);
assert.deepEqual(takeBatch(c, t0 + 2 * WINDOW_MS + 4999, states), ["a", "b"]);

// Caps: 20 lines, 2000 characters, never throws
const big = new Map<string, ListenState>();
openWindow("big", "u2", 0, big, new Map<string, number>());
for (let i = 0; i < MAX_LINES + 5; i += 1) bufferLine("big", false, "x", 1, big);
assert.equal(big.get("big")?.lines.length, MAX_LINES);
const long = new Map<string, ListenState>();
openWindow("long", "u3", 0, long, new Map<string, number>());
assert.equal(bufferLine("long", false, "y".repeat(MAX_CHARACTERS + 500), 1, long), true);
assert.equal(long.get("long")?.characters, MAX_CHARACTERS);
assert.equal(bufferLine("long", false, "z", 1, long), false);

// Loop guard: muted after 5 replies until a new mention
const loop = new Map<string, ListenState>();
const loopOpeners = new Map<string, number>();
openWindow("loop", "u4", 0, loop, loopOpeners);
let now = 0;
for (let i = 0; i < MAX_BOT_REPLIES; i += 1) {
  assert.equal(bufferLine("loop", false, "m", now + 1, loop), true);
  now += WINDOW_MS + 1;
  assert.deepEqual(takeBatch("loop", now + 1, loop), ["m"]);
}
assert.equal(loop.has("loop"), false);
assert.equal(bufferLine("loop", false, "m", now + 2, loop), false);
assert.equal(openWindow("loop", "u4", now + 2, loop, loopOpeners), true);
assert.equal(bufferLine("loop", false, "m", now + 3, loop), true);

console.log("listen.check ok");
