/**
 * Scene Content Generation API
 *
 * Generates scene content (slides/quiz/interactive/pbl) from an outline.
 * This is the first half of the two-step scene generation pipeline.
 * Does NOT generate actions — use /api/generate/scene-actions for that.
 */

import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import {
  applyOutlineFallbacks,
  generateSceneContent,
  buildVisionUserContent,
} from '@/lib/generation/generation-pipeline';
import type { AgentInfo } from '@/lib/generation/generation-pipeline';
import type { SceneOutline, PdfImage, ImageMapping } from '@/lib/types/generation';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromHeaders, getThinkingConfigFromBody } from '@/lib/server/resolve-model';
import { authenticateRequest } from '@/lib/server/auth';

const log = createLogger('Scene Content API');

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const authUser = await authenticateRequest(req);
    const body = await req.json();
    const {
      outline: rawOutline,
      allOutlines,
      pdfImages,
      imageMapping,
      stageInfo,
      stageId,
      agents,
      languageDirective,
    } = body as {
      outline: SceneOutline;
      allOutlines: SceneOutline[];
      pdfImages?: PdfImage[];
      imageMapping?: ImageMapping;
      stageInfo: {
        name: string;
        description?: string;
        language?: string;
        style?: string;
      };
      stageId: string;
      agents?: AgentInfo[];
      languageDirective?: string;
    };

    // Validate required fields
    if (!rawOutline) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'outline is required');
    }
    if (!allOutlines || allOutlines.length === 0) {
      return apiError(
        'MISSING_REQUIRED_FIELD',
        400,
        'allOutlines is required and must not be empty',
      );
    }
    if (!stageId) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'stageId is required');
    }

    // Ensure outline has language from stageInfo (fallback for older outlines)
    const outline: SceneOutline = {
      ...rawOutline,
    };

    // ── Model resolution from request headers ──
    const { model: languageModel, modelInfo, modelString, thinkingConfig: resolvedThinkingConfig } = resolveModelFromHeaders(req);
    
    // Check for thinkingConfig in body or headers
    let thinkingConfig = getThinkingConfigFromBody(body) ?? resolvedThinkingConfig;
    
    // Inject default thinking configuration for Gemini interactive scenes
    if (!thinkingConfig && outline.type === 'interactive') {
      if (modelString.includes('gemini-2.5')) {
        thinkingConfig = { enabled: true, budgetTokens: 4096 };
        log.info(`[Thinking] Injected default thinkingBudget=4096 for Gemini 2.5 interactive scene`);
      } else if (modelString.includes('gemini-3')) {
        thinkingConfig = { enabled: true };
        log.info(`[Thinking] Injected default thinkingLevel=high for Gemini 3.x interactive scene`);
      }
    }

    // Detect vision capability
    const hasVision = !!modelInfo?.capabilities?.vision;

    // Vision-aware AI call function
    const aiCall = async (
      systemPrompt: string,
      userPrompt: string,
      images?: Array<{ id: string; src: string }>,
    ): Promise<string> => {
      if (images?.length && hasVision) {
        const result = await callLLM(
          {
            model: languageModel,
            system: systemPrompt,
            messages: [
              {
                role: 'user' as const,
                content: buildVisionUserContent(userPrompt, images),
              },
            ],
            maxOutputTokens: modelInfo?.outputWindow,
          },
          'scene-content',
          undefined,
          thinkingConfig
        );
        return result.text;
      }
      const result = await callLLM(
        {
          model: languageModel,
          system: systemPrompt,
          prompt: userPrompt,
          maxOutputTokens: modelInfo?.outputWindow,
        },
        'scene-content',
        undefined,
        thinkingConfig
      );
      return result.text;
    };

    // ── Apply fallbacks ──
    const effectiveOutline = applyOutlineFallbacks(outline, !!languageModel);

    // ── Filter images assigned to this outline ──
    let assignedImages: PdfImage[] | undefined;
    if (
      pdfImages &&
      pdfImages.length > 0 &&
      effectiveOutline.suggestedImageIds &&
      effectiveOutline.suggestedImageIds.length > 0
    ) {
      const suggestedIds = new Set(effectiveOutline.suggestedImageIds);
      assignedImages = pdfImages.filter((img) => suggestedIds.has(img.id));
    }

    // ── Media generation is handled client-side in parallel (media-orchestrator.ts) ──
    // The content generator receives placeholder IDs (gen_img_1, gen_vid_1) as-is.
    // resolveImageIds() in generation-pipeline.ts will keep these placeholders in elements.
    const generatedMediaMapping: ImageMapping = {};

    // ── Generate content ──
    log.info(
      `Generating content: "${effectiveOutline.title}" (${effectiveOutline.type}) [model=${modelString}]`,
    );

    const content = await generateSceneContent(
      effectiveOutline,
      aiCall,
      {
        assignedImages,
        imageMapping,
        languageModel: effectiveOutline.type === 'pbl' ? languageModel : undefined,
        visionEnabled: hasVision,
        generatedMediaMapping,
        agents,
        languageDirective,
        thinkingConfig,
      }
    );

    if (!content) {
      log.error(`Failed to generate content for: "${effectiveOutline.title}"`);

      return apiError(
        'GENERATION_FAILED',
        500,
        `Failed to generate content: ${effectiveOutline.title}`,
      );
    }

    log.info(`Content generated successfully: "${effectiveOutline.title}"`);

    return apiSuccess({ content, effectiveOutline });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Authorization'))) {
      return apiError('UNAUTHORIZED', 401, 'Unauthorized request');
    }
    log.error('Scene content generation error:', error);
    return apiError('INTERNAL_ERROR', 500, error instanceof Error ? error.message : String(error));
  }
}
