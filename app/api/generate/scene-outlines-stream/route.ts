/**
 * Scene Outlines Streaming API (SSE)
 *
 * Streams outline generation via Server-Sent Events.
 * Emits individual outline objects as they're parsed from the LLM response,
 * so the frontend can display them incrementally.
 *
 * SSE events:
 *   { type: 'outline', data: SceneOutline, index: number }
 *   { type: 'done', outlines: SceneOutline[] }
 *   { type: 'error', error: string }
 */

import { NextRequest } from 'next/server';
import { streamLLM } from '@/lib/ai/llm';
import { buildPrompt, PROMPT_IDS } from '@/lib/generation/prompts';
import {
  formatImageDescription,
  formatImagePlaceholder,
  buildVisionUserContent,
  uniquifyMediaElementIds,
  formatTeacherPersonaForPrompt,
} from '@/lib/generation/generation-pipeline';
import type { AgentInfo } from '@/lib/generation/generation-pipeline';
import { MAX_PDF_CONTENT_CHARS, MAX_VISION_IMAGES } from '@/lib/constants/generation';
import { nanoid } from 'nanoid';
import type {
  UserRequirements,
  PdfImage,
  SceneOutline,
  ImageMapping,
} from '@/lib/types/generation';
import { apiError } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import { logTokenUsage } from '@/lib/server/token-logger';
import { resolveModelFromHeaders, getThinkingConfigFromBody } from '@/lib/server/resolve-model';
import { validatePromptSafety } from '@/lib/server/safety-guard';
import { authenticateRequest } from '@/lib/server/auth';
import { logUserPrompt } from '@/lib/server/prompt-logger';

const log = createLogger('Outlines Stream');

export const maxDuration = 300;

/**
 * Incremental JSON array parser.
 * Extracts complete top-level objects from a partially-streamed JSON array.
 * Returns newly found objects (skipping `alreadyParsed` count).
 */
function extractNewOutlines(buffer: string, alreadyParsed: number): SceneOutline[] {
  const results: SceneOutline[] = [];

  // Find the start of the JSON array (skip any markdown fencing)
  const stripped = buffer.replace(/^[\s\S]*?(?=\[)/, '');
  const arrayStart = stripped.indexOf('[');
  if (arrayStart === -1) return results;

  let depth = 0;
  let objectStart = -1;
  let inString = false;
  let escaped = false;
  let objectCount = 0;

  for (let i = arrayStart + 1; i < stripped.length; i++) {
    const char = stripped[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === '{') {
      if (depth === 0) objectStart = i;
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0 && objectStart >= 0) {
        objectCount++;
        if (objectCount > alreadyParsed) {
          try {
            const obj = JSON.parse(stripped.substring(objectStart, i + 1));
            results.push(obj);
          } catch {
            // Incomplete or invalid JSON — skip
          }
        }
        objectStart = -1;
      }
    }
  }

  return results;
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await authenticateRequest(req);
    const body = await req.json();

    // Get API configuration from request headers
    const { model: languageModel, modelInfo, modelString } = resolveModelFromHeaders(req);
    let thinkingConfig = getThinkingConfigFromBody(body);

    const isInteractive = body.requirements?.interactiveMode || body.requirements?.deepInteraction;

    // Inject default thinking configuration for Gemini interactive outlines
    if (!thinkingConfig && isInteractive) {
      if (modelString.includes('gemini-2.5')) {
        thinkingConfig = { enabled: true, budgetTokens: 4096 };
        log.info(`[Thinking] Injected default thinkingBudget=4096 for Gemini 2.5 outline generation`);
      } else if (modelString.includes('gemini-3')) {
        thinkingConfig = { enabled: true };
        log.info(`[Thinking] Injected default thinkingLevel=high for Gemini 3.x outline generation`);
      }
    }

    if (!body.requirements) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Requirements are required');
    }

    const { requirements, pdfText, pdfImages, imageMapping, researchContext, agents } = body as {
      requirements: UserRequirements;
      pdfText?: string;
      pdfImages?: PdfImage[];
      imageMapping?: ImageMapping;
      researchContext?: string;
      agents?: AgentInfo[];
    };

    // Extraer solo la solicitud original del usuario para validación y auditoría
    let pureUserPrompt = requirements.requirement.split('\n\n[System Note:')[0];
    const stageId = (body as any).stageId || 'unknown';
    pureUserPrompt = pureUserPrompt.split('\n\n[CONTEXTO NORMATIVO')[0];
    pureUserPrompt = pureUserPrompt.trim();

    // --- Safety Guardrail ---
    const safetyCheck = await validatePromptSafety(pureUserPrompt, languageModel);
    
    if (authUser) {
      logUserPrompt({
        uid: authUser.uid,
        email: authUser.email,
        prompt: pureUserPrompt,
        isSafe: safetyCheck.isSafe,
        reason: safetyCheck.reason,
        modelString: modelString,
      }).catch(console.error);
    }

    if (!safetyCheck.isSafe) {
      log.warn(`Safety Guard rejected request: ${safetyCheck.reason}`);
      return apiError('CONTENT_POLICY_VIOLATION', 400, 'Tu solicitud no cumple con nuestras normas comunitarias y ha sido bloqueada. Por favor, mantén un lenguaje apropiado para un entorno educativo.');
    }
    // ------------------------

    // Detect vision capability
    const hasVision = !!modelInfo?.capabilities?.vision;

    // Build prompt (same logic as generateSceneOutlinesFromRequirements)
    let availableImagesText = 'No images available';
    let visionImages: Array<{ id: string; src: string }> | undefined;

    if (pdfImages && pdfImages.length > 0) {
      if (hasVision && imageMapping) {
        // Vision mode: split into vision images (first N) and text-only (rest)
        const allWithSrc = pdfImages.filter((img) => imageMapping[img.id]);
        const visionSlice = allWithSrc.slice(0, MAX_VISION_IMAGES);
        const textOnlySlice = allWithSrc.slice(MAX_VISION_IMAGES);
        const noSrcImages = pdfImages.filter((img) => !imageMapping[img.id]);

        const visionDescriptions = visionSlice.map((img) =>
          formatImagePlaceholder(img),
        );
        const textDescriptions = [...textOnlySlice, ...noSrcImages].map((img) =>
          formatImageDescription(img),
        );
        availableImagesText = [...visionDescriptions, ...textDescriptions].join('\n');

        visionImages = visionSlice.map((img) => ({
          id: img.id,
          src: imageMapping[img.id],
          width: img.width,
          height: img.height,
        }));
      } else {
        availableImagesText = pdfImages
          .map((img) => formatImageDescription(img))
          .join('\n');
      }
    }

    // Build media generation policy based on enabled flags
    const imageGenerationEnabled = req.headers.get('x-image-generation-enabled') === 'true';
    const videoGenerationEnabled = req.headers.get('x-video-generation-enabled') === 'true';
    let mediaGenerationPolicy = '';
    if (!imageGenerationEnabled && !videoGenerationEnabled) {
      mediaGenerationPolicy =
        '**IMPORTANT: Do NOT include any mediaGenerations in the outlines. Both image and video generation are disabled.**';
    } else if (!imageGenerationEnabled) {
      mediaGenerationPolicy =
        '**IMPORTANT: Do NOT include any image mediaGenerations (type: "image") in the outlines. Image generation is disabled. Video generation is allowed.**';
    } else if (!videoGenerationEnabled) {
      mediaGenerationPolicy =
        '**IMPORTANT: Do NOT include any video mediaGenerations (type: "video") in the outlines. Video generation is disabled. Image generation is allowed.**';
    }

    // Build teacher context from agents (if available)
    const teacherContext = formatTeacherPersonaForPrompt(agents);

    const promptId = isInteractive
      ? PROMPT_IDS.INTERACTIVE_OUTLINES
      : PROMPT_IDS.REQUIREMENTS_TO_OUTLINES;

    const prompts = buildPrompt(promptId, {
      requirement: requirements.requirement,
      pdfContent: pdfText ? pdfText.substring(0, MAX_PDF_CONTENT_CHARS) : 'None',
      availableImages: availableImagesText,
      researchContext: researchContext || 'None',
      mediaGenerationPolicy,
      imageEnabled: imageGenerationEnabled,
      videoEnabled: videoGenerationEnabled,
      mediaEnabled: imageGenerationEnabled || videoGenerationEnabled,
      teacherContext,
      explicitLanguage: requirements.subject === 'ingles' ? 'en-US' : requirements.language,
    });

    if (!prompts) {
      return apiError('INTERNAL_ERROR', 500, 'Prompt template not found');
    }

    log.info(
      `Generating outlines: "${requirements.requirement.substring(0, 50)}" [model=${modelString}]`,
    );

    // Create SSE stream with heartbeat to prevent connection timeout
    const encoder = new TextEncoder();
    const HEARTBEAT_INTERVAL_MS = 15_000;
    const stream = new ReadableStream({
      async start(controller) {
        // Heartbeat: periodically send SSE comments to keep the connection alive.
        let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
        const startHeartbeat = () => {
          stopHeartbeat();
          heartbeatTimer = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(`:heartbeat\n\n`));
            } catch {
              stopHeartbeat();
            }
          }, HEARTBEAT_INTERVAL_MS);
        };
        const stopHeartbeat = () => {
          if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
          }
        };

        const MAX_STREAM_RETRIES = 2;

        try {
          startHeartbeat();

          const streamParams = visionImages?.length
            ? {
                model: languageModel,
                system: prompts.system,
                messages: [
                  {
                    role: 'user' as const,
                    content: buildVisionUserContent(prompts.user, visionImages),
                  },
                ],
                maxOutputTokens: modelInfo?.outputWindow,
              }
            : {
                model: languageModel,
                system: prompts.system,
                prompt: prompts.user,
                maxOutputTokens: modelInfo?.outputWindow,
              };

          let parsedOutlines: SceneOutline[] = [];
          let lastError: string | undefined;

          for (let attempt = 1; attempt <= MAX_STREAM_RETRIES + 1; attempt++) {
            try {
              const result = streamLLM(streamParams, 'scene-outlines-stream', thinkingConfig);

              let fullText = '';
              parsedOutlines = [];

              for await (const chunk of result.textStream) {
                fullText += chunk;

                // Try to extract new outlines from the accumulated text
                const newOutlines = extractNewOutlines(fullText, parsedOutlines.length);
                
                // Extract language directive which appears before the outlines array
                const directiveMatch = fullText.match(/"languageDirective"\s*:\s*"([^"]+)"/);
                const languageDirective = directiveMatch ? directiveMatch[1] : 'Teach in the language that matches the user requirement.';

                for (const outline of newOutlines) {
                  // Ensure ID, order, and language directive
                  const enriched = {
                    ...outline,
                    id: outline.id || nanoid(),
                    order: parsedOutlines.length + 1,
                    languageDirective: outline.languageDirective || languageDirective,
                  };
                  parsedOutlines.push(enriched);

                  const event = JSON.stringify({
                    type: 'outline',
                    data: enriched,
                    index: parsedOutlines.length - 1,
                  });
                  controller.enqueue(encoder.encode(`data: ${event}\n\n`));
                }
              }

              // Validate: got outlines?
              if (parsedOutlines.length > 0) {
                try {
                  const usage = await result.usage;
                  logTokenUsage({
                    uid: authUser.uid,
                    email: authUser.email || undefined,
                    modelString,
                    promptTokens: (usage as any).promptTokens,
                    completionTokens: (usage as any).completionTokens,
                    stageId,
                    source: 'outline',
                  });
                } catch (e) {
                  log.error('Failed to log outline token usage', e);
                }
                break;
              }

              // If the textStream completed without yielding anything, it often means the AI SDK
              // encountered a backend HTTP error (like 403 API Key Leaked). Awaiting the full text
              // promise here forces any deferred API errors to throw, bubbling up to the user.
              try {
                await result.text;
              } catch (apiError) {
                throw apiError;
              }

              // Empty result — retry if we have attempts left
              lastError = fullText.trim()
                ? 'LLM response could not be parsed into outlines'
                : 'LLM returned empty response';

              if (attempt <= MAX_STREAM_RETRIES) {
                log.warn(
                  `Empty outlines (attempt ${attempt}/${MAX_STREAM_RETRIES + 1}), retrying...`,
                );
                // Notify client a retry is happening
                const retryEvent = JSON.stringify({
                  type: 'retry',
                  attempt,
                  maxAttempts: MAX_STREAM_RETRIES + 1,
                });
                controller.enqueue(encoder.encode(`data: ${retryEvent}\n\n`));
              }
            } catch (error) {
              lastError = error instanceof Error ? error.message : String(error);

              if (attempt <= MAX_STREAM_RETRIES) {
                log.warn(
                  `Stream error (attempt ${attempt}/${MAX_STREAM_RETRIES + 1}), retrying...`,
                  error,
                );
                const retryEvent = JSON.stringify({
                  type: 'retry',
                  attempt,
                  maxAttempts: MAX_STREAM_RETRIES + 1,
                });
                controller.enqueue(encoder.encode(`data: ${retryEvent}\n\n`));
                continue;
              }
            }
          }

          if (parsedOutlines.length > 0) {
            // Replace sequential gen_img_N/gen_vid_N with globally unique IDs
            const uniquifiedOutlines = uniquifyMediaElementIds(parsedOutlines);
            // Send done event with all outlines
            const doneEvent = JSON.stringify({
              type: 'done',
              outlines: uniquifiedOutlines,
            });
            controller.enqueue(encoder.encode(`data: ${doneEvent}\n\n`));
          } else {
            // All retries exhausted, no outlines produced
            log.error(
              `Outline generation failed after ${MAX_STREAM_RETRIES + 1} attempts: ${lastError}`,
            );
            const errorEvent = JSON.stringify({
              type: 'error',
              error: lastError || 'Failed to generate outlines',
            });
            controller.enqueue(encoder.encode(`data: ${errorEvent}\n\n`));
          }
        } catch (error) {
          const errorEvent = JSON.stringify({
            type: 'error',
            error: error instanceof Error ? error.message : String(error),
          });
          controller.enqueue(encoder.encode(`data: ${errorEvent}\n\n`));
        } finally {
          stopHeartbeat();
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Authorization'))) {
      return apiError('UNAUTHORIZED', 401, 'Unauthorized request');
    }
    log.error('Streaming error:', error);
    return apiError('INTERNAL_ERROR', 500, error instanceof Error ? error.message : String(error));
  }
}
