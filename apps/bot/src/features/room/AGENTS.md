# Room

The 3D courtroom served to the Discord Activity.

- The server decides everything that counts: movement (distance budget, sub-steps, sliding shared with the client), zones, seats, votes and chaos. The client only predicts its own movement.
- `tomato.ts` is the ballistic flight of the free-aimed tomato: the server simulates it (`throw-tomato`), the client replays and previews the same arc; `tomato.check.ts` is its self-check (`node --import @swc-node/register/esm-register src/features/room/tomato.check.ts` from `apps/bot`). The throw origin is trusted as long as it is within 2 m of the thrower, and the client-chosen `power` (0 to 1) is not verified against the real charge time (the 6 s cooldown bounds abuse).
- `window-jump.ts` is the window jump: a running audience member (Shift) heading into a side window opening dives out (`PlayerState.air` goes dive, away, fall, then flop or hero), the server picks a free public spot, opens a ceiling portal there (`portal-open`, `shake`), lets the member fall out, and lands them as a hero when Space is held (`hold-landing`) at the landing, else as a belly flop. 20 s cooldown per member; away or airborne members are out of targets, tomatoes and chaos. `window-jump.check.ts` is its self-check (same command as `tomato.check.ts`).
- `layout.ts`, `protocol.ts`, `world.ts`, `chaos.ts`, `games.ts`, `tomato.ts` and `window-jump.ts` are imported by `apps/web`: relative imports only, no Node module.
- Chaos (`chaos.ts`) is for the audience only: not for the parties, nor for jurors seated in their box. Every action has a cooldown; rumors (AI) also have a global gap. A fight freezes both members until the police comes in by the side door, throws them out and writes « trouble à l'audience » in their casier.
- The judge reacts to chaos with canned lines only, at most every `JUDGE_REBUKE_GAP_MS`.
