import { type NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { callLLM } from '@/lib/ai/llm';
import { resolveModel } from '@/lib/server/resolve-model';
import { createLogger } from '@/lib/logger';
import { authenticateRequest } from '@/lib/server/auth';

const log = createLogger('PracticeAPI');

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const authUser = await authenticateRequest(req);
    if (!authUser) {
      return apiError('UNAUTHORIZED', 401, 'No autorizado.');
    }

    const body = await req.json();
    const { subject, grade, englishLevel, topic, providerId, modelId, apiKey, baseUrl } = body;

    if (!subject || !grade || !topic) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Faltan parámetros requeridos: subject, grade, topic');
    }

    const { model } = resolveModel({
      modelString: providerId && modelId ? `${providerId}:${modelId}` : 'google:gemini-2.5-pro',
      providerType: providerId,
      apiKey: apiKey,
      baseUrl: baseUrl,
    });

    const isEnglish = subject === 'Inglés';
    const levelOrGrade = isEnglish ? `nivel de inglés ${englishLevel || 'A1'}` : `estudiante de "${grade}"`;
    
    const languageInstruction = isEnglish
      ? '\nIMPORTANTE: Toda la práctica, las preguntas y las opciones de respuesta DEBEN generarse ESTRICTAMENTE en INGLÉS.'
      : '';

    const practiceTypes = ['multiple_choice', 'true_false', 'fill_in_the_blank'];
    const practiceType = practiceTypes[Math.floor(Math.random() * practiceTypes.length)];

    let typeInstructions = '';
    
    if (practiceType === 'multiple_choice') {
      typeInstructions = `
Tu tarea es generar un cuestionario de práctica (Quiz) rápido de 3 preguntas de opción múltiple.
REGLAS ESTRICTAS:
1. Genera exactamente 3 preguntas.
2. Cada pregunta debe tener exactamente 4 opciones de respuesta.`;
    } else if (practiceType === 'true_false') {
      typeInstructions = `
Tu tarea es generar un cuestionario rápido de 3 preguntas de Verdadero o Falso.
REGLAS ESTRICTAS:
1. Genera exactamente 3 afirmaciones categóricas.
2. Cada pregunta debe tener EXACTAMENTE 2 opciones de respuesta. En español deben ser ["Verdadero", "Falso"]. En inglés deben ser ["True", "False"].`;
    } else if (practiceType === 'fill_in_the_blank') {
      typeInstructions = `
Tu tarea es generar un cuestionario rápido de 3 preguntas de "Completar el Espacio" (Fill-in-the-blank).
REGLAS ESTRICTAS:
1. Genera exactamente 3 oraciones. Cada oración DEBE contener exactamente un espacio en blanco representado por tres guiones bajos ("___").
2. Cada pregunta debe tener exactamente 4 opciones de respuesta de una sola palabra o frase corta que encaje en el espacio. Solo una opción es la correcta.`;
    }

    const systemPrompt = `
Eres un profesor experto del sistema educativo ecuatoriano.
${typeInstructions}
Materia: ${subject}
Tema: ${topic}
${languageInstruction}

MÁS REGLAS:
3. El vocabulario y la dificultad deben ser adecuados para un ${levelOrGrade}.
4. Si la materia es "Matemática", incluye operaciones o problemas prácticos reales para resolver. **EXIGENCIA MÁXIMA:** Inventa problemas completamente NUEVOS y variados, cambia siempre los números, usa escenarios creativos diferentes (ej. comprar en la tienda, medir terrenos, contar animales) y NUNCA repitas el mismo estilo de problema dos veces.
5. DEBES responder ÚNICAMENTE con un arreglo JSON válido en este formato exacto, sin texto markdown ni formato adicional. 
6. CRÍTICO: Para asegurar precisión (especialmente en Matemáticas), DEBES incluir un campo "reasoning" donde explicas y resuelves paso a paso el problema ANTES de dar el correctIndex.

[
  {
    "reasoning": "Aquí resuelvo mentalmente el problema paso a paso. Ej: 500k + 123456 + 376544 = 1000000. La afirmación decía 900k, por lo que es Falsa.",
    "question": "Texto de la pregunta 1",
    "options": ["Opcion A", "Opcion B", "Opcion C", "Opcion D"],
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
        prompt: `Generación de Práctica Única [ID: ${randomSeed}]\nPor favor, genera un cuestionario de práctica para la materia de ${subject} sobre el tema "${topic}" adaptado a un ${levelOrGrade}.${languageInstruction} Sigue estrictamente las reglas definidas y asegúrate de crear contenido original y NUNCA antes visto. Responde ÚNICAMENTE con el arreglo JSON solicitado.`,
        temperature: 0.85,
      },
      'generate-practice',
    );

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
