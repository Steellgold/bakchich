# Court

The trial engine, the AI judge and the court events.

- `engine.ts` owns every rule: phase schedules per style (American, French), who has the floor, witnesses (examination then cross-examination), objections ruled at random, votes and the verdict. It never imports Discord, the database or the AI; the judge's own vote comes in through the injected `JudgeVote`.
- Judgment mode comes from `judgmentMode(gravity, possibleVoters, juryRequested)`: jury, judge alone (light case or fewer than `MIN_JURY` voters) or assizes (the judge's vote weighs `JUDGE_VOTE_WEIGHT`).
- `judge.ts` only writes text from the facts it is given; every call has a canned French fallback, so the trial goes on without the AI. Prompts are in English, answers in French, no emoji, and the server is « le Royaume » with a contracted article (« du Royaume »).
- `court-events.ts` turns engine events into speech (Piper), courtroom bubbles, clerk lines and messages. Phase announcements are canned (no AI call); the judge reacts to what is heard at most every `INTERVENE_MIN_GAP_MS`.
- Text channel: Components V2 panels for the opening, the vote and the verdict, plain embeds (description, date, color) for game notices, plain text when the judge or the clerk talks.
