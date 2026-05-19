/**
 * Quiz Grading API
 *
 * POST: Receives a text question + user answer, calls LLM for scoring and feedback.
 * Used for short-answer (text) questions that cannot be graded locally.
 */

import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { authenticateRequest } from '@/lib/server/auth';
import { logTokenUsage } from '@/lib/server/token-logger';

const log = createLogger('Quiz Grade');

interface GradeRequest {
  question: string;
  userAnswer: string;
  points: number;
  commentPrompt?: string;
  language?: string;
}

interface GradeResponse {
  score: number;
  comment: string;
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await authenticateRequest(req);
    const body = (await req.json()) as GradeRequest;
    const { question, userAnswer, points, commentPrompt, language } = body;

    if (!question || !userAnswer) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'question and userAnswer are required');
    }

    // Resolve model from request headers
    const { model: languageModel, modelString } = resolveModelFromHeaders(req);

    const systemPrompt = `You are a professional educational assessor. Grade the student's answer and provide brief feedback.
You must reply in the following JSON format only (no other content):
{"score": <integer from 0 to ${points}>, "comment": "<one or two sentences of feedback>"}

CRITICAL INSTRUCTION: You MUST write the 'comment' field entirely in the following language: ${language || 'English'}.`;

    const userPrompt = `Question: ${question}
Full marks: ${points} points
${commentPrompt ? `Grading guidance: ${commentPrompt}\n` : ''}Student answer: ${userAnswer}`;

    const result = await callLLM(
      {
        model: languageModel,
        system: systemPrompt,
        prompt: userPrompt,
      },
      'quiz-grade',
    );

    try {
      logTokenUsage({
        uid: authUser.uid,
        email: authUser.email || undefined,
        modelString: modelString,
        promptTokens: (result.usage as any)?.promptTokens || 0,
        completionTokens: (result.usage as any)?.completionTokens || 0,
        source: 'quiz-grade',
      });
    } catch (e) {
      log.error('Failed to log quiz-grade token usage', e);
    }

    // Parse the LLM response as JSON
    const text = result.text.trim();
    let gradeResult: GradeResponse;

    try {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      const parsed = JSON.parse(jsonMatch[0]);
      gradeResult = {
        score: Math.max(0, Math.min(points, Math.round(Number(parsed.score)))),
        comment: String(parsed.comment || ''),
      };
    } catch {
      // Fallback: give partial credit with a generic comment
      gradeResult = {
        score: Math.round(points * 0.5),
        comment: 'Answer received. Please refer to the standard answer.',
      };
    }

    return apiSuccess({ ...gradeResult });
  } catch (error) {
    log.error('Error:', error);
    return apiError('INTERNAL_ERROR', 500, 'Failed to grade answer');
  }
}
