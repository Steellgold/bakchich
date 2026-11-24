import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { env } from "#/utils/env";
import { logger } from "#/utils/logger";

// ── Quota ─────────────────────────────────────────────────────────────────────────────────────────
// State fed by the AI provider fetch wrapper (real call errors): true means the bot cannot make AI calls anymore.

// Delay applied when OpenRouter returns 402: credits never refill by themselves:
const INSUFFICIENT_CREDITS_DELAY_MS = 60 * 60 * 1000;
// A 429 whose reset is further away than this is the shared daily free quota, not a per-model limit:
const DAILY_QUOTA_THRESHOLD_MS = 60 * 60 * 1000;

const quotaState = {
  /** Timestamp until which the shared daily free quota is exhausted */
  dailyQuotaUntilTimestamp: 0,
  /** Timestamp until which OpenRouter refused real AI calls with 402 (insufficient credits) */
  insufficientCreditsUntilTimestamp: 0,
};

const parseEpochTimestamp = (value: string | null): number | undefined => {
  if (value === null) return undefined;

  const timestamp = Number(value);

  return Number.isFinite(timestamp) ? timestamp : undefined;
};

const isExhausted = (): boolean => {
  const now = Date.now();

  return quotaState.dailyQuotaUntilTimestamp > now || quotaState.insufficientCreditsUntilTimestamp > now;
};

const reportFailure = (statusCode: number, rateLimitResetHeader: string | null): void => {
  const now = Date.now();

  // 402: OpenRouter refused a real AI call because no credits are left:
  if (statusCode === 402) {
    quotaState.insufficientCreditsUntilTimestamp = Math.max(quotaState.insufficientCreditsUntilTimestamp, now + INSUFFICIENT_CREDITS_DELAY_MS);

    logger.warn("OpenRouter 402 (insufficient credits)");
    return;
  }

  // 429: only a far reset (the shared daily free quota) blocks every model, shorter limits fall back to the next model:
  if (statusCode === 429) {
    const resetTimestamp = parseEpochTimestamp(rateLimitResetHeader);

    if (resetTimestamp !== undefined && resetTimestamp - now > DAILY_QUOTA_THRESHOLD_MS) {
      quotaState.dailyQuotaUntilTimestamp = Math.max(quotaState.dailyQuotaUntilTimestamp, resetTimestamp);

      logger.warn(`OpenRouter daily free quota exhausted (reset in ${String(resetTimestamp - now)} ms)`);
      return;
    }

    logger.warn("OpenRouter 429 rate limit on one model, falling back to the next one");
  }
};

export const openRouterQuota = {
  /** True when every model is blocked by the daily free quota or missing credits */
  isExhausted,
  /** Report a quota failure raised by a real AI call (429 rate limit or 402 insufficient credits) */
  reportFailure,
};

// ── Models ────────────────────────────────────────────────────────────────────────────────────────

// Wrap fetch to report quota failures (429/402) raised by real AI calls, without consuming any extra request:
const quotaAwareFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);

  if (response.status === 429 || response.status === 402) {
    openRouterQuota.reportFailure(response.status, response.headers.get("x-ratelimit-reset"));
  }

  return response;
};

const openRouterProvider = createOpenRouter({
  apiKey: env.OPENROUTER_API_KEY,
  fetch: quotaAwareFetch,
});

// Preferred free models first, then the free router (random available free model) as last resort:
const modelIds = [
  ...new Set([
    ...env.OPENROUTER_MODELS.split(",")
      .map((id) => id.trim())
      .filter((id) => id !== ""),
    "openrouter/free",
  ]),
];

/** Free models to try in order, the next one being used when the previous one fails */
export const aiModels = modelIds.map((id) => openRouterProvider(id));
