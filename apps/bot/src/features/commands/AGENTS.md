# Commands

Discord entry points, translating messages and interactions into court calls.

- In the AGENTS category the bot answers a mention or a reply to one of its messages. Outside it, in the configured servers, only an explicit mention, and never with a trial (a short redirection).
- Mentions: the known commands are parsed by regex, anything else is read by the AI as a structured intent that the code validates. A member waits `AI_COOLDOWN_MS` between two requests that need the AI.
- `history.ts` starts with 20 messages and a shared 12,000-character budget, reserving the replied message. For chat or ruling the AI can request one expansion to 100 messages and 40,000 characters; missing history or a failed AI retry keeps the first answer. History is fetched only from the current channel, before the request.
- Replies: game notices are embeds that can only ping the author; the judge or the clerk talking is plain text, except answers with help text, which use Components V2 with a separate small italic footer. History also reads these text components.
- The « Ouvrir un procès » message command is registered at startup in each configured guild (confirmed exception, see the root `AGENTS.md`).
