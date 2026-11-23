import type { CourtEvent, Member } from "./engine";
import { computeVerdict, Court, DEBATE_MS, normalizeCrime, pickLawyer, VOTE_MS } from "./engine";
import assert from "node:assert/strict";
import { beforeEach, describe, it, mock } from "node:test";

// Returns the queued numbers in order, then repeats the last one:
const scriptedRng = (...values: number[]) => {
  let index = 0;
  return () => {
    const value = values[Math.min(index, values.length - 1)] ?? 0;
    index += 1;
    return value;
  };
};

const kevin: Member = { id: "1", name: "Kevin" };
const paul: Member = { id: "2", name: "Paul" };
const lawyer: Member = { id: "3", name: "Maître Dave" };

const openInput = (channelId = "c1") => ({ channelId, accused: kevin, plaintiff: paul, lawyer, crime: "vol de croissant" });

describe("normalizeCrime", () => {
  it("trims and keeps valid crimes", () => {
    assert.equal(normalizeCrime("  vol de croissant  "), "vol de croissant");
    assert.equal(normalizeCrime("x".repeat(200)), "x".repeat(200));
  });

  it("rejects empty and too long crimes", () => {
    assert.equal(normalizeCrime(""), null);
    assert.equal(normalizeCrime("   "), null);
    assert.equal(normalizeCrime("x".repeat(201)), null);
  });
});

describe("pickLawyer", () => {
  const a: Member = { id: "a", name: "A" };
  const b: Member = { id: "b", name: "B" };
  const c: Member = { id: "c", name: "C" };

  it("picks by index from the rng", () => {
    assert.deepEqual(pickLawyer([a, b, c], [], () => 0.5), b);
  });

  it("excludes ids and returns null when nobody is left", () => {
    assert.deepEqual(pickLawyer([a, b], ["a"], () => 0), b);
    assert.equal(pickLawyer([a], ["a"], () => 0), null);
  });

  it("ignores duplicate candidates", () => {
    assert.deepEqual(pickLawyer([a, a, a, b], [], () => 0.6), b);
  });
});

describe("computeVerdict", () => {
  const votes = (guilty: number, innocent: number) => {
    const map = new Map<string, boolean>();
    for (let index = 0; index < guilty; index += 1) map.set(`g${String(index)}`, true);
    for (let index = 0; index < innocent; index += 1) map.set(`i${String(index)}`, false);
    return map;
  };

  it("follows the majority without reversal", () => {
    assert.deepEqual(computeVerdict(votes(3, 1), scriptedRng(0.9)), { guilty: true, reversed: false, coinFlip: false, guiltyVotes: 3, innocentVotes: 1 });
  });

  it("reverses the majority when the corrupt judge strikes", () => {
    assert.deepEqual(computeVerdict(votes(3, 1), scriptedRng(0.1)), { guilty: false, reversed: true, coinFlip: false, guiltyVotes: 3, innocentVotes: 1 });
  });

  it("flips a coin on a tie, then rolls the reversal", () => {
    assert.deepEqual(computeVerdict(votes(1, 1), scriptedRng(0.4, 0.9)), { guilty: true, reversed: false, coinFlip: true, guiltyVotes: 1, innocentVotes: 1 });
  });

  it("flips a coin without votes", () => {
    assert.deepEqual(computeVerdict(votes(0, 0), scriptedRng(0.6, 0.9)), { guilty: false, reversed: false, coinFlip: true, guiltyVotes: 0, innocentVotes: 0 });
  });
});

describe("Court", () => {
  beforeEach(() => {
    mock.timers.reset();
    mock.timers.enable({ apis: ["setTimeout"] });
  });

  const collect = (court: Court) => {
    const events: CourtEvent[] = [];
    court.on("event", (event) => events.push(event));
    return events;
  };

  it("opens a trial in debate and refuses a second one in the same channel", () => {
    const court = new Court(scriptedRng(0.9));
    const events = collect(court);

    const trial = court.open(openInput());
    assert.notEqual(trial, "busy");
    assert.equal(court.get("c1")?.phase, "debate");
    assert.equal(events[0]?.type, "opened");

    assert.equal(court.open(openInput()), "busy");
    assert.notEqual(court.open(openInput("c2")), "busy");
  });

  it("moves to vote then verdict with the timers", () => {
    const court = new Court(scriptedRng(0.9));
    const events = collect(court);
    court.open(openInput());

    mock.timers.tick(DEBATE_MS);
    assert.equal(court.get("c1")?.phase, "vote");
    assert.equal(events.at(-1)?.type, "vote-started");

    mock.timers.tick(VOTE_MS);
    const last = events.at(-1);
    assert.equal(last?.type, "verdict");
    assert.equal(court.get("c1"), undefined);
  });

  it("checks vote eligibility and phase", () => {
    const court = new Court(scriptedRng(0.9));
    const events = collect(court);
    court.open(openInput());

    assert.equal(court.vote("c1", "9", true), "closed");
    mock.timers.tick(DEBATE_MS);

    assert.equal(court.vote("c1", kevin.id, false), "not-allowed");
    assert.equal(court.vote("c1", paul.id, true), "not-allowed");
    assert.equal(court.vote("c1", "9", true), "ok");
    assert.equal(events.at(-1)?.type, "vote-cast");
    assert.equal(court.vote("c1", "9", false), "ok");
    assert.equal(court.get("c1")?.votes.size, 1);
    assert.equal(court.get("c1")?.votes.get("9"), false);
    assert.equal(court.vote("unknown", "9", true), "no-trial");
  });

  it("asks the judge to intervene on the 4th plea with a low rng", () => {
    const court = new Court(() => 0);
    court.open(openInput());
    const pleas = Array.from({ length: 8 }, () => court.plea("c1"));
    assert.deepEqual(pleas, [false, false, false, true, false, false, false, true]);
  });

  it("asks the judge to intervene on the 5th plea with a high rng", () => {
    const court = new Court(() => 0.99);
    court.open(openInput());
    const pleas = Array.from({ length: 5 }, () => court.plea("c1"));
    assert.deepEqual(pleas, [false, false, false, false, true]);
  });

  it("ignores pleas without trial or outside debate", () => {
    const court = new Court(() => 0);
    assert.equal(court.plea("c1"), false);
    court.open(openInput());
    mock.timers.tick(DEBATE_MS);
    assert.equal(court.plea("c1"), false);
  });

  it("emits speech during debate and vote, nothing without trial", () => {
    const court = new Court(scriptedRng(0.9));
    const events = collect(court);

    court.say("c1", "9", "ignored");
    assert.equal(events.length, 0);

    court.open(openInput());
    court.say("c1", "9", "il est coupable");
    assert.deepEqual(events.at(-1), { type: "speech", trial: court.get("c1"), speakerId: "9", text: "il est coupable" });

    mock.timers.tick(DEBATE_MS);
    court.say("c1", null, "Silence !");
    const last = events.at(-1);
    assert.equal(last?.type, "speech");
    assert.equal(last.speakerId, null);
  });

  it("lists open trials and drops them after the verdict", () => {
    const court = new Court(scriptedRng(0.9));
    court.open(openInput("c1"));
    court.open(openInput("c2"));
    assert.deepEqual(court.list().map((trial) => trial.channelId), ["c1", "c2"]);

    mock.timers.tick(DEBATE_MS);
    mock.timers.tick(VOTE_MS);
    assert.deepEqual(court.list(), []);
  });
});
