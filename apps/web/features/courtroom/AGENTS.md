# Courtroom

The 3D courtroom inside the Discord Activity.

- `room-client.tsx` holds the scene; `use-room-socket.ts` the connection; `hud.tsx` and `chaos/chaos-hud.tsx` the overlay; `character/` the low-poly characters (looks, parts, gestures, animation).
- `courtroom.tsx` draws the room shell (walls, floor, windows, lamps, seal, doors); `furniture.tsx` places the Blockbench props of `public/models/` on the layout boxes and seats; `toon-model.tsx` gives any glTF the toon materials and ink outlines (shared with `character/model.tsx`).
- Import only types from `@tribunal/bot/court/engine`; values from `@tribunal/bot/room/*` are fine.
- `@tribunal/bot/emojis` is the browser-safe catalog shared with the bot. `EmojiText` renders at most one catalog emoji per message in bubbles, verdicts and notices; images use `/.proxy/api/emojis/:id` because the Activity CSP does not allow direct CDN `/emojis/` requests.
- Characters animate from the server state: speaking and voice level (intonation), sleeping, tomato splat, fighting, typing (the clerk).
- Styles of this feature live in `courtroom.css`; tokens and UI primitives in `app/globals.css`.
