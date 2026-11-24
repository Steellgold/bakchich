# Activity

The site only exists inside the Discord Activity.

- `home-client.tsx` renders nothing unless the page is served from `<client id>.discordsays.com`; there it signs in with the Embedded App SDK and opens the courtroom.
- Sign-in never leaves Discord's iframe: the authorization code is exchanged by the `discord-activity` BetterAuth plugin (`lib/discord-activity-auth.ts`), and the session token is sent to the courtroom WebSocket.
