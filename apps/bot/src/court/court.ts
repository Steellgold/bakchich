import type { Generate } from "./judge";
import { Court } from "./engine";
import { createJudge, JUDGE_TIMEOUT_MS } from "./judge";
import { aiModels, openRouterQuota } from "#/integrations/openrouter";
import { attempt } from "#/utils/attempt";
import { logger } from "#/utils/logger";
import { generateText } from "ai";

// Tries each free model in order, moving to the next one on any failure, until the shared timeout:
const generate: Generate = async (instructions, prompt) => {
  if (openRouterQuota.isExhausted()) throw new Error("OpenRouter quota exhausted");

  const abortSignal = AbortSignal.timeout(JUDGE_TIMEOUT_MS);

  for (const model of aiModels) {
    const result = await attempt(async () => generateText({ model, instructions, prompt, maxRetries: 0, abortSignal }));
    if (result.ok) return result.value.text;

    logger.warn(`AI model ${model.modelId} failed: ${result.error instanceof Error ? result.error.message : String(result.error)}`);
    if (abortSignal.aborted) break;
  }

  throw new Error("Every AI model failed");
};

/** The single court holding every trial in progress */
export const court = new Court();

/** The AI judge, backed by the free OpenRouter models */
export const judge = createJudge(generate);
