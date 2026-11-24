# Profiles

The judge knows everybody and never forgets.

- `profile-watcher.ts` reads every message of the configured servers, except excluded channels (`/chexclude`), and `court-events.ts` adds the lines heard in hearings. Lines wait in memory only; the messages themselves are never stored.
- Every `LINES_PER_UPDATE` lines, the clerk (AI) rewrites the member's notes from the old notes and the new lines (`judge.profile`), at most `MAX_UPDATES_PER_HOUR` updates in all and one per member every `MEMBER_UPDATE_GAP_MS`: the AI quota is shared with the trials. When the AI does not answer, the old notes stay.
- The notes never contain sensitive data (health, sexuality, religion, politics, addresses).
- « Oublie-moi » erases the notes and sets `member.forgotten`: no line of that member is noted any more, until they allow it again. The court record stays.
- `knownAbout(ids)` gives the notes to the judge: chat, casier, opening, interventions and verdict.
- Members read them with `/fiche` (ephemeral, with their court record) and at the archive cabinet of the courtroom (`listFiles`, the most recently updated first).
