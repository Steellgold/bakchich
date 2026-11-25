# Courtroom

The 3D courtroom inside the Discord Activity.

- `room-client.tsx` holds the scene; `use-room-socket.ts` the connection; `hud.tsx` and `chaos/chaos-hud.tsx` the overlay; `character/` the low-poly characters (looks, parts, gestures, animation).
- `courtroom.tsx` draws the room shell (walls, floor, windows, lamps, seal, doors); `furniture.tsx` places the Blockbench props of `public/models/` on the layout boxes and seats; `toon-model.tsx` gives any glTF the toon materials and ink outlines (shared with `character/model.tsx`).
- Import only types from `@tribunal/bot/court/engine`; values from `@tribunal/bot/room/*` are fine.
- `@tribunal/bot/emojis` is the browser-safe catalog shared with the bot. `EmojiText` renders at most one catalog emoji per message in bubbles, verdicts and notices; images use `/.proxy/api/emojis/:id` because the Activity CSP does not allow direct CDN `/emojis/` requests.
- Chaos visuals (`chaos/chaos-effects.tsx`) use the `tomato`, `tomato_splat`, `dust_cloud`, `objection_sign`, `zzz` and `whisper` models; key 1 takes a tomato in hand, right mouse aims (`player-controller.tsx`, `chaos/aim-preview.tsx`), left click throws.
- Characters animate from the server state: speaking and voice level (intonation), sleeping, tomato splat, fighting, typing (the clerk).
- Styles of this feature live in `courtroom.css`; tokens and UI primitives in `app/globals.css`.

- Window jump: `chaos/window-jump.tsx` draws the glass shards, the ceiling portal and the hero landing crack from the socket events; `chaos/tunnel.tsx` is the jumper's tunnel, built far above the room (the camera of `player-controller.tsx` goes there while `air` is `away`); `chaos/lightning.tsx` the shared bolts. The broken pane is hidden in `courtroom.tsx`. Characters play `dive`, `fall`, `flop`/`get_up` or `hero_land`/`hero_rise` from `PlayerState.air` (`character/motion.ts`); those clips own the body pose, so the model is never tilted then. Space is sent as `hold-landing` while airborne.
- First-person minigames: `chaos/board-game.tsx` and `game-hand.tsx` draw the server `snapshot.games`; `game-controller.tsx` owns the game camera and inputs, `game-hud.tsx` only status/choices. `character/game-motion.ts` joins the reaching arm to the articulated hand. The ordinary player controller and tomato aim stay inactive while playing.
