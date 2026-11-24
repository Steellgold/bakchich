# Courtroom

The 3D courtroom inside the Discord Activity.

- `room-client.tsx` holds the scene; `use-room-socket.ts` the connection; `hud.tsx` and `chaos/chaos-hud.tsx` the overlay; `character/` the low-poly characters (looks, parts, gestures, animation).
- Import only types from `@tribunal/bot/court/engine`; values from `@tribunal/bot/room/*` are fine.
- Characters animate from the server state: speaking and voice level (intonation), sleeping, tomato splat, fighting, typing (the clerk).
- Styles of this feature live in `courtroom.css`; tokens and UI primitives in `app/globals.css`.
