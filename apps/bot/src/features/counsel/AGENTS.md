# Counsel

What the judge does outside of trials: talk, answer questions of law and ethics, settle disputes.

- `counsel.ts` returns a JSON line with the intent (the code validates it in `court/intent.ts`) followed by the answer, when it is a conversation or a ruling. The judge reads the latest messages of the channel, his notes on the people involved and the related precedents. For chat or ruling, `moreHistory` may request older messages once; the commands layer loads the bounded history and asks again, keeping the first answer on failure. Ordinary chat stays short; requested summaries and explanations may use lists and up to 1800 characters.
- Law: French law by default, the main rule first, never a made-up article, decision, amount or deadline, and a pointer to a lawyer, a point-justice or service-public.fr when the stakes are real. Funny in the form, right in the substance.
- Web search (optional, `EXA_API_KEY`): for a real question of law, the JSON line carries a self-contained search query including the topic and jurisdiction resolved from the conversation; the code asks Exa (`integrations/exa.ts`) and another call answers from the pages found, with Markdown links (previews suppressed). Both calls share the conversation context. Without a key or a result, the first answer stays.
- Danger: when someone seems really at risk, the AI flags it and the code adds `HELPLINES` below the answer. The AI never writes phone numbers.
- An obvious joke mentioning depression may set `depressionJoke`: the code replies with the Tibo InShape quote and `tiboRaf`, followed by the help text. Genuine or ambiguous distress always keeps a serious answer and takes priority over the joke.
- `rulings.ts`: every ruling (« tranche : X ou Y ») is numbered and saved in `ruling`, the case law of the Royaume. The judge may cite the precedents found by full-text search, never invent one.
