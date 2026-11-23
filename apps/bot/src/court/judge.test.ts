import type { Trial, Verdict } from "./engine";
import type { Generate } from "./judge";
import { createJudge, formatVerdictLine, JUDGE_TIMEOUT_MS } from "./judge";
import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

const trial: Trial = {
  id: "t1",
  channelId: "c1",
  accused: { id: "1", name: "Kevin" },
  plaintiff: { id: "2", name: "Paul" },
  lawyer: { id: "3", name: "Dave" },
  crime: "vol de croissant",
  phase: "debate",
  votes: new Map(),
  startedAt: new Date(),
  phaseEndsAt: 0,
};

const verdict: Verdict = { guilty: true, reversed: false, coinFlip: false, guiltyVotes: 3, innocentVotes: 1 };

// Fake generate recording the prompts and answering with a fixed text:
const recorder = (answer: string) => {
  const prompts: string[] = [];
  const generate: Generate = async (_instructions, prompt) => {
    prompts.push(prompt);
    return Promise.resolve(answer);
  };
  return { prompts, generate };
};

describe("judge fallbacks", () => {
  it("resolves every method to a non-empty text when generate rejects", async () => {
    const judge = createJudge(async () => Promise.reject(new Error("boom")));
    const texts = await Promise.all([
      judge.opening(trial),
      judge.intervene(trial, ["Paul : il est coupable"]),
      judge.sentence(trial),
      judge.verdict(trial, verdict, "100 pompes", []),
      judge.record("Kevin", []),
      judge.chat("Paul", "salut"),
    ]);
    for (const text of texts) assert.ok(text.trim().length > 0);
  });

  it("falls back when generate never answers", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const judge = createJudge(async () => new Promise<string>((resolve) => {
      setTimeout(resolve, JUDGE_TIMEOUT_MS * 2, "too late");
    }));
    const pending = judge.opening(trial);
    mock.timers.tick(JUDGE_TIMEOUT_MS);
    assert.ok((await pending).trim().length > 0);
    mock.timers.reset();
  });
});

describe("judge prompts carry the facts decided by the code", () => {
  it("opening names everyone and the crime", async () => {
    const { prompts, generate } = recorder("Oyez");
    await createJudge(generate).opening(trial);
    for (const fact of ["Kevin", "Paul", "Dave", "vol de croissant"]) assert.ok((prompts[0] ?? "").includes(fact), fact);

    await createJudge(generate).opening({ ...trial, lawyer: null });
    assert.ok((prompts[1] ?? "").includes("pas d'avocat"));
  });

  it("verdict states guilty, reversal, coin flip and sentence", async () => {
    const { prompts, generate } = recorder("Verdict");
    const judge = createJudge(generate);

    await judge.verdict(trial, verdict, "100 pompes", []);
    const first = prompts[0] ?? "";
    assert.ok(first.includes("COUPABLE"));
    assert.ok(!first.includes("NON COUPABLE"));
    assert.ok(first.includes("100 pompes"));

    await judge.verdict(trial, { ...verdict, guilty: false, reversed: true, coinFlip: true }, null, []);
    const second = prompts[1] ?? "";
    assert.ok(second.includes("NON COUPABLE"));
    assert.ok(second.includes("renversé"));
    assert.ok(second.includes("pile ou face"));
  });
});

describe("formatVerdictLine", () => {
  it("states the code's verdict, votes, reversal and sentence", () => {
    assert.equal(
      formatVerdictLine({ guilty: true, reversed: true, coinFlip: false, guiltyVotes: 1, innocentVotes: 3 }, "100 pompes"),
      "Verdict officiel : COUPABLE (1 voix contre 3, renversé par le juge). Peine : 100 pompes",
    );
    assert.equal(
      formatVerdictLine({ guilty: false, reversed: false, coinFlip: true, guiltyVotes: 0, innocentVotes: 0 }, null),
      "Verdict officiel : NON COUPABLE (0 voix contre 0, pile ou face).",
    );
  });
});

describe("judge.screen", () => {
  const screen = async (answer: string) => createJudge(recorder(answer).generate).screen("vol de croissant", "Kevin", []);

  it("accepts when the first word is OK", async () => {
    assert.deepEqual(await screen("OK"), { ok: true });
    assert.deepEqual(await screen("ok, c'est drôle"), { ok: true });
  });

  it("refuses with a reply otherwise", async () => {
    const refused = await screen("REFUS harcèlement caractérisé");
    assert.equal(refused.ok, false);
    assert.ok(refused.reply.trim().length > 0);

    assert.equal((await screen("Bien sûr !")).ok, false);
  });

  it("fails closed when generate rejects", async () => {
    const result = await createJudge(async () => Promise.reject(new Error("boom"))).screen("x", "Kevin", []);
    assert.equal(result.ok, false);
  });
});
