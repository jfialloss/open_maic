import { type NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { callLLM } from '@/lib/ai/llm';
import { resolveModel } from '@/lib/server/resolve-model';
import { createLogger } from '@/lib/logger';
import { authenticateRequest } from '@/lib/server/auth';
import { logTokenUsage } from '@/lib/server/token-logger';

const log = createLogger('PracticeAPI');

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const authUser = await authenticateRequest(req);
    if (!authUser) {
      return apiError('UNAUTHORIZED', 401, 'No autorizado.');
    }

    const body = await req.json();
    const { subject, grade, englishLevel, topic, providerId, modelId, apiKey, baseUrl, language } = body;

    if (!subject || !grade || !topic) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Faltan parámetros requeridos: subject, grade, topic');
    }

    const modelString = providerId && modelId ? `${providerId}:${modelId}` : 'google:gemini-3-flash-preview';
    const { model } = resolveModel({
      modelString,
      providerType: providerId,
      apiKey: apiKey,
      baseUrl: baseUrl,
    });

    const isEnglishSubject = subject.toLowerCase() === 'inglés' || subject.toLowerCase() === 'english';
    const levelOrGrade = isEnglishSubject ? `English level ${englishLevel || 'A1'}` : `student of grade "${grade}"`;
    
    // Always enforce the output language
    const targetLanguage = isEnglishSubject ? 'en-US' : (language || 'es-ES');
    const languageInstruction = `\nCRITICAL INSTRUCTION: You MUST generate ALL questions, options, and reasoning EXACTLY in this language: ${targetLanguage}.`;

    const practiceTypes = ['multiple_choice', 'true_false', 'fill_in_the_blank'];
    const practiceType = practiceTypes[Math.floor(Math.random() * practiceTypes.length)];

    let typeInstructions = '';
    
    if (practiceType === 'multiple_choice') {
      typeInstructions = `
Your task is to generate a quick practice quiz of 3 multiple-choice questions.
STRICT RULES:
1. Generate exactly 3 questions.
2. Each question MUST have exactly 4 answer options.`;
    } else if (practiceType === 'true_false') {
      typeInstructions = `
Your task is to generate a quick practice quiz of 3 True/False questions.
STRICT RULES:
1. Generate exactly 3 categorical statements.
2. Each question MUST have EXACTLY 2 answer options. If the requested language is Spanish, options must be ["Verdadero", "Falso"]. If English, ["True", "False"]. If Chinese, ["正确", "错误"].`;
    } else if (practiceType === 'fill_in_the_blank') {
      typeInstructions = `
Your task is to generate a quick practice quiz of 3 Fill-in-the-blank questions.
STRICT RULES:
1. Generate exactly 3 sentences. Each sentence MUST contain exactly one blank space represented by three underscores ("___").
2. Each question MUST have exactly 4 short answer options that fit the blank. Only one option is correct.`;
    }

    const systemPrompt = `
You are an expert teacher.
${typeInstructions}
Subject: ${subject}
Topic: ${topic}
${languageInstruction}

MORE RULES:
3. The vocabulary and difficulty must be appropriate for a ${levelOrGrade}.
4. If the subject is "Mathematics" (Matemática/Math), include real practical problems to solve. **MAXIMUM REQUIREMENT:** Invent completely NEW and varied problems, always change the numbers, use different creative scenarios (e.g. buying at a store, measuring land, counting animals) and NEVER repeat the same style of problem twice.
5. You MUST reply ONLY with a valid JSON array in this exact format, with no markdown text or additional formatting.
6. CRITICAL: To ensure accuracy (especially in Math), you MUST include a "reasoning" field where you explain and solve the problem step by step BEFORE providing the correctIndex.

[
  {
    "reasoning": "Here I solve the problem step by step in my head. e.g. 500 + 300 = 800. The statement said 900, so it's False.",
    "question": "Question text for question 1",
    "options": ${practiceType === 'true_false' ? '["True", "False"]' : '["Option A", "Option B", "Option C", "Option D"]'},
    "correctIndex": 0
  },
  ...
]
    `.trim();

    const randomSeed = Math.floor(Math.random() * 1000000);
    const result = await callLLM(
      {
        model,
        system: systemPrompt,
        prompt: `Unique Practice Generation [ID: ${randomSeed}]\nPlease generate a practice quiz for the subject of ${subject} about the topic "${topic}" adapted to a ${levelOrGrade}.${languageInstruction} Strictly follow the rules and ensure original, never-before-seen content. Reply ONLY with the requested JSON array.`,
        temperature: 0.85,
      },
      'generate-practice',
    );

    try {
      logTokenUsage({
        uid: authUser.uid,
        email: authUser.email || undefined,
        modelString: modelString,
        promptTokens: (result.usage as any)?.promptTokens || 0,
        completionTokens: (result.usage as any)?.completionTokens || 0,
        source: 'practice',
      });
    } catch (e) {
      log.error('Failed to log generate-practice token usage', e);
    }

    let jsonString = result.text.trim();
    if (jsonString.startsWith('```')) {
      jsonString = jsonString.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
    }

    const questions = JSON.parse(jsonString);

    if (!Array.isArray(questions) || questions.length !== 3) {
      throw new Error('El modelo no devolvió 3 preguntas en formato array');
    }

    return apiSuccess({ practiceType, questions }, 200);
  } catch (error) {
    log.error('Failed to generate practice:', error);
    return apiError('INTERNAL_ERROR', 500, error instanceof Error ? error.message : 'No se pudo generar la práctica.');
  }
}
