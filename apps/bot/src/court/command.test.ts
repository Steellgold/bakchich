import { parseCommand } from "./command";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("parseCommand", () => {
  it("parses a trial command", () => {
    assert.deepEqual(
      parseCommand("<@42> procès <@7> pour avoir mangé le dernier croissant", "42"),
      { kind: "trial", accusedId: "7", crime: "avoir mangé le dernier croissant" },
    );
  });

  it("accepts any case, no accent and nickname mentions", () => {
    assert.deepEqual(parseCommand("<@!42> PROCES <@!7> pour vol", "42"), { kind: "trial", accusedId: "7", crime: "vol" });
  });

  it("accepts the optional preposition with or without an accent", () => {
    const expected = { kind: "trial", accusedId: "7", crime: "pensés bizzares" };
    assert.deepEqual(parseCommand("<@42> procès à <@7> pour pensés bizzares", "42"), expected);
    assert.deepEqual(parseCommand("<@42> proces a <@7> pour pensés bizzares", "42"), expected);
  });

  it("ignores role mentions as the accused", () => {
    assert.equal(parseCommand("<@42> procès <@&99> pour vol", "42"), null);
  });

  it("requires a crime", () => {
    assert.equal(parseCommand("<@42> procès <@7>", "42"), null);
  });

  it("flags a crime longer than 200 characters", () => {
    assert.deepEqual(parseCommand(`<@42> procès <@7> pour ${"x".repeat(201)}`, "42"), { kind: "invalid-crime" });
  });

  it("parses a record command", () => {
    assert.deepEqual(parseCommand("<@42> casier <@7>", "42"), { kind: "record", targetId: "7" });
  });

  it("returns null for anything else", () => {
    assert.equal(parseCommand("<@42> salut", "42"), null);
  });
});
