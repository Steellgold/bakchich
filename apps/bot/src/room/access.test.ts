import { authorizeConnection, NOT_A_MEMBER, NOT_LOGGED_IN } from "./access";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const member = { name: "Kevin", avatarUrl: null, canViewAgents: true };

describe("authorizeConnection", () => {
  it("rejects a missing session or a session without Discord account", async () => {
    assert.deepEqual(await authorizeConnection({ getSession: async () => Promise.resolve(null), checkMember: async () => Promise.resolve(member) }), { ok: false, reason: NOT_LOGGED_IN });
    assert.deepEqual(await authorizeConnection({ getSession: async () => Promise.resolve({ discordId: null }), checkMember: async () => Promise.resolve(member) }), { ok: false, reason: NOT_LOGGED_IN });
  });

  it("rejects non-members and members who cannot view AGENTS", async () => {
    const getSession = async () => Promise.resolve({ discordId: "1" });
    assert.deepEqual(await authorizeConnection({ getSession, checkMember: async () => Promise.resolve(null) }), { ok: false, reason: NOT_A_MEMBER });
    assert.deepEqual(await authorizeConnection({ getSession, checkMember: async () => Promise.resolve({ ...member, canViewAgents: false }) }), { ok: false, reason: NOT_A_MEMBER });
  });

  it("accepts members who can view AGENTS", async () => {
    const result = await authorizeConnection({ getSession: async () => Promise.resolve({ discordId: "1" }), checkMember: async () => Promise.resolve(member) });
    assert.deepEqual(result, { ok: true, member: { id: "1", name: "Kevin", avatarUrl: null } });
  });

  it("states the expected French reasons", () => {
    assert.equal(NOT_LOGGED_IN, "Connecte-toi avec Discord.");
    assert.equal(NOT_A_MEMBER, "Réservé aux membres du Royaume.");
  });
});
