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
import { logTokenUsage } from '@/lib/server/token-logger';
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

    // Fail-safe: If generating a quiz, dynamically enrich its description and keyPoints
    // using allOutlines as a context source to ensure the LLM never generates generic trivia.
    if (outline.type === 'quiz' && allOutlines && allOutlines.length > 1) {
      // Find preceding scenes that are NOT quizzes
      const precedingScenes = allOutlines.filter(
        (o) => o.id !== outline.id && o.type !== 'quiz' && (o.order < outline.order || !outline.order)
      );

      if (precedingScenes.length > 0) {
        log.info(`Enriching quiz "${outline.title}" content request with syllabus from ${precedingScenes.length} preceding scenes.`);

        const syllabus = precedingScenes
          .map((s, idx) => `${idx + 1}. ${s.title}: ${s.description || ''}`)
          .join('\n');

        const isEnglish =
          stageInfo?.language === 'en' ||
          stageInfo?.language === 'en-US' ||
          outline.languageDirective?.toLowerCase().includes('english') ||
          false;

        // Check if the current description is generic, short, or missing
        const isDescGeneric =
          !outline.description ||
          outline.description.length < 15 ||
          /comprobar los conocimientos|check acquired knowledge|evaluación final|final evaluation/i.test(outline.description);

        if (isDescGeneric) {
          outline.description = isEnglish
            ? `Final assessment evaluating the student's mastery of the following course syllabus:\n${syllabus}`
            : `Evaluación final para calificar el dominio del estudiante sobre el siguiente temario del curso:\n${syllabus}`;
        } else if (!outline.description.includes(syllabus.substring(0, Math.min(15, syllabus.length)))) {
          // Append syllabus if not already present
          outline.description =
            outline.description +
            (isEnglish
              ? `\n\nCourse syllabus evaluated in this quiz:\n${syllabus}`
              : `\n\nTemario del curso evaluado en esta prueba:\n${syllabus}`);
        }

        // Prepend course title if available to anchor the theme explicitly
        if (stageInfo?.name) {
          const prefix = isEnglish ? `Course: ${stageInfo.name}\n` : `Curso: ${stageInfo.name}\n`;
          if (!outline.description.startsWith(prefix)) {
            outline.description = prefix + outline.description;
          }
        }

        // Check if the current keyPoints are generic or missing
        const isKpGeneric =
          !outline.keyPoints ||
          outline.keyPoints.length === 0 ||
          outline.keyPoints.some((kp) =>
            /verificar comprensión|comprobar conocimientos|reforzar conceptos|verify understanding|reinforce key concepts/i.test(kp)
          );

        if (isKpGeneric) {
          const allKeyPoints = precedingScenes
            .flatMap((s) => s.keyPoints || [])
            .filter(Boolean)
            .map((kp) => kp.trim());

          if (allKeyPoints.length > 0) {
            outline.keyPoints = allKeyPoints.slice(0, 8);
          } else {
            outline.keyPoints = precedingScenes.map((s) =>
              isEnglish ? `Comprehension of: ${s.title}` : `Comprensión de: ${s.title}`
            );
          }
        }
      }
    }

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

    const aiCall = async (
      systemPrompt: string,
      userPrompt: string,
      images?: Array<{ id: string; src: string }>,
    ): Promise<string> => {
      let result;
      if (images?.length && hasVision) {
        result = await callLLM(
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
      } else {
        result = await callLLM(
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
      }

      try {
        logTokenUsage({
          uid: authUser.uid,
          email: authUser.email || undefined,
          modelString,
          promptTokens: result.usage?.inputTokens ?? (result.usage as any)?.promptTokens ?? 0,
          completionTokens: result.usage?.outputTokens ?? (result.usage as any)?.completionTokens ?? 0,
          stageId,
          source: 'content',
        });
      } catch (e) {
        log.error('Failed to log content token usage', e);
      }

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
        courseTitle: stageInfo?.name,
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
