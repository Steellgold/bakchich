import { parseClientMessage } from "./protocol";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("parseClientMessage", () => {
  it("parses every valid client message", () => {
    assert.deepEqual(parseClientMessage(`{"type":"auth","token":"abc"}`), { type: "auth", token: "abc" });
    assert.deepEqual(parseClientMessage(`{"type":"move","x":1.5,"z":-2,"rotation":3.1}`), { type: "move", x: 1.5, z: -2, rotation: 3.1 });
    assert.deepEqual(parseClientMessage(`{"type":"become-juror"}`), { type: "become-juror" });
    assert.deepEqual(parseClientMessage(`{"type":"stand-up"}`), { type: "stand-up" });
    assert.deepEqual(parseClientMessage(`{"type":"vote","guilty":true}`), { type: "vote", guilty: true });
  });

  it("returns null for anything invalid", () => {
    assert.equal(parseClientMessage("{"), null);
    assert.equal(parseClientMessage(`{"type":"move","x":"a","z":0,"rotation":0}`), null);
    assert.equal(parseClientMessage(`{"type":"move","x":"NaN","z":0,"rotation":0}`), null);
    assert.equal(parseClientMessage(`{"type":"vote","guilty":"yes"}`), null);
    assert.equal(parseClientMessage(`{"type":"teleport"}`), null);
    assert.equal(parseClientMessage("null"), null);
  });
});
