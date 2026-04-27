import { generateObject, type LanguageModel } from 'ai';
import { z } from 'zod';
import { createLogger } from '@/lib/logger';

const log = createLogger('SafetyGuard');

export interface SafetyCheckResult {
  isSafe: boolean;
  reason?: string;
}

/**
 * Validates the safety of a user prompt before processing it for generation.
 * Uses a fast LLM call to detect sexually explicit content, abuse, violence,
 * while allowing legitimate educational queries about biology and natural sciences.
 *
 * @param prompt The user's input prompt/requirement
 * @param model The LLM instance to use for evaluation
 */
export async function validatePromptSafety(
  prompt: string,
  model: LanguageModel,
): Promise<SafetyCheckResult> {
  try {
    const result = await generateObject({
      model,
      schema: z.object({
        isSafe: z.boolean().describe('True if the prompt is safe for minors and educational use, False if inappropriate.'),
        reason: z.string().optional().describe('Reason for rejection if isSafe is false.'),
      }),
      system: `You are a strict content moderation assistant for an educational platform used by minors.
Your task is to evaluate the user's prompt for safety.

RULES FOR REJECTION:
- Flag as UNSAFE (isSafe: false) if it contains sexually explicit content, pornography, abuse, violence, hate speech, or non-educational inappropriate requests.

RULES FOR ALLOWING (WHITELIST):
- If the request is a legitimate educational query about natural sciences, biology, or human anatomy (e.g. reproductive system in a biological context, physiology), you MUST mark it as SAFE (isSafe: true).
- If you are unsure but it sounds educational, default to SAFE.`,
      prompt: `Evaluate this user prompt:\n\n"${prompt}"`,
    });

    if (!result.object.isSafe) {
      log.warn(`Safety Guard blocked prompt. Reason: ${result.object.reason}`);
    }

    return result.object;
  } catch (error) {
    log.error('Error during safety validation, defaulting to safe to prevent blocking legitimate requests on error', error);
    // On error (e.g., API timeout), fail open to avoid breaking the app,
    // relying on the provider's default safetySettings as a fallback.
    return { isSafe: true };
  }
}
