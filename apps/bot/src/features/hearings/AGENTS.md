# Hearings

Everything around a trial: the request, the wait, the defense preparation, the voice.

- `hearing-request.ts`: a request (mention or « Ouvrir un procès » form) is checked, screened by the AI (which also gives the gravity), then saved with its style and announced with its voice channel and Discord event. One request at a time per channel; nobody judges themselves.
- `hearings.ts`: the lifecycle. A hearing waits in the database (`hearing-store.ts`), then the preparation room opens when there is a lawyer, then the trial. Everything that must survive a restart is in the table (`preparationChannelId` included): on restart, waiting hearings are armed again, their old preparation room deleted, and interrupted trials are cleaned up with a message.
- `hearing-voice.ts`: `listenAndTranscribe` (Whisper, text only) and `speakInVoice` (Piper, one line after the other). Audio stays in memory for one utterance and is never stored.
- Only the accused may claim a jury, and only for a light case.
