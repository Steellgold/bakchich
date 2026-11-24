import { attempt } from "#/utils/attempt";
import { env } from "#/utils/env";
import Exa from "exa-js";

const SEARCH_TIMEOUT_MS = 10_000;
const MAX_RESULTS = 4;
const MAX_EXCERPT_LENGTH = 500;

export type WebSource = {
  title: string;
  url: string;
  excerpt: string;
};

/** Whether web search is set up (EXA_API_KEY) */
export const webSearchEnabled = env.EXA_API_KEY !== "";

const exa = webSearchEnabled ? new Exa(env.EXA_API_KEY, {
  baseURL: "https://api.exa.ai",
  fetch: async (input, init) => fetch(input, {
    ...init,
    redirect: "error",
  }),
}) : null;

/** Web pages about a question, with the most relevant excerpt of each; empty when the search is off or fails (low-level, so it handles its own errors) */
export const searchWeb = async (query: string): Promise<WebSource[]> => {
  if (exa === null) return [];

  const search = await attempt(async () => exa.search(
    query,
    {
      numResults: MAX_RESULTS,
      contents: { highlights: true },
    },
    { timeout: SEARCH_TIMEOUT_MS },
  ),
  );

  if (!search.ok) return [];

  return search.value.results.flatMap((result) => {
    if (!result.url.startsWith("https://") || !URL.canParse(result.url)) return [];

    return [
      {
        title: (result.title ?? "").trim() || new URL(result.url).hostname,
        url: result.url,
        excerpt: (result.highlights[0] ?? "").replace(/\s+/gu, " ").trim().slice(0, MAX_EXCERPT_LENGTH),
      },
    ];
  });
};
