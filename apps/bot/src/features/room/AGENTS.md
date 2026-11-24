# Room

The 3D courtroom served to the Discord Activity.

- The server decides everything that counts: movement (distance budget, sub-steps, sliding shared with the client), zones, seats, votes and chaos. The client only predicts its own movement.
- `layout.ts`, `protocol.ts`, `world.ts` and `chaos.ts` are imported by `apps/web`: relative imports only, no Node module.
- Chaos (`chaos.ts`) is for the audience only: not for the parties, nor for jurors seated in their box. Every action has a cooldown; rumors (AI) also have a global gap. A fight freezes both members until the police comes in by the side door, throws them out and writes « trouble à l'audience » in their casier.
- The judge reacts to chaos with canned lines only, at most every `JUDGE_REBUKE_GAP_MS`.
