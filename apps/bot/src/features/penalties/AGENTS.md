# Penalties

Sentences the bot enforces on Discord, in every text channel of the configured servers.

- At a guilty verdict, the code picks the kind (end every message with a phrase, start with a formula, a banned word, all caps) and the length (30 min to 2 h). The AI only words the phrase and picks its emoji; `validWording` keeps them only when short and clean.
- Every message of a convict is checked by `forgottenWords` (accents, case, mentions and links ignored). A forgotten message extends the sentence by the forgotten words plus a ratio of the message length, at most 30 min per message and 24 h remaining.
- No spam: one written reminder (an embed, no ping), then only the sentence emoji as a reaction for 5 minutes. Nothing at all in excluded channels or categories (`excluded_channel`, `/chexclude`, managed by members who manage channels).
- Running sentences and exclusions live in memory, loaded from the database at startup.
