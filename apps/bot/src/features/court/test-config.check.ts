import { debateMs } from "./engine";
import { isTestGuild, TEST_TIMING } from "./test-config";
import assert from "node:assert/strict";

// Test trial guild
assert.equal(isTestGuild("1388591986914885652"), true);
assert.equal(isTestGuild("1"), false);
assert.equal(isTestGuild(""), false);

// A test debate plus the vote stays around 5 minutes, and real durations are untouched
const total = debateMs("american", TEST_TIMING) + TEST_TIMING.vote;
assert.ok(total >= 4 * 60_000 && total <= 5 * 60_000, `test trial lasts ${String(total)} ms`);
assert.equal(debateMs("american"), 525_000);
assert.ok(debateMs("french", TEST_TIMING) < debateMs("french"));
