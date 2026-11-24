# Commands

Discord entry points, translating messages and interactions into court calls.

- Outside the AGENTS category the bot only answers a mention, with a short redirection.
- Mentions: the known commands are parsed by regex, anything else is read by the AI as a structured intent that the code validates. A member waits `AI_COOLDOWN_MS` between two requests that need the AI.
- Replies: game notices are embeds that can only ping the author; the judge or the clerk talking is plain text.
- The « Ouvrir un procès » message command is registered at startup in each configured guild (confirmed exception, see the root `AGENTS.md`).
