import * as admin from 'firebase-admin';
import { createLogger } from '@/lib/logger';

const log = createLogger('TokenLogger');

// Ensure firebase admin is initialized
if (!admin.apps.length) {
  try {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (serviceAccountKey) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(serviceAccountKey)),
      });
    } else {
      admin.initializeApp();
    }
  } catch (error) {
    console.error('Firebase Admin initialization error', error);
  }
}

export interface TokenLogParams {
  uid: string;
  email?: string;
  modelString: string;
  promptTokens: number;
  completionTokens: number;
  stageId?: string;
  source: string; // e.g. 'outline', 'content', 'actions'
}

// Pricing per 1M tokens (USD)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gemini-1.5-flash': { input: 0.075, output: 0.30 },
  'gemini-1.5-pro': { input: 1.25, output: 5.00 },
  'gemini-2.0': { input: 0.075, output: 0.30 }, 
  'gemini-2.5-flash': { input: 0.075, output: 0.30 },
  'gemini-3.0': { input: 0.50, output: 3.00 }, // Gemini 3.0 Flash Preview
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'claude-3-5-sonnet': { input: 3.00, output: 15.00 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },
  // Image Models (cost per image)
  'imagen-3': { input: 0.03, output: 0.03 },
  'dall-e-3': { input: 0.040, output: 0.040 },
  'recraft': { input: 0.04, output: 0.04 },
  'seedream': { input: 0.03, output: 0.03 },
  'nano-banana': { input: 0.03, output: 0.03 }, // Imagen 3 native image generation
  // TTS Models (cost per 1M characters, input is the full cost because completionTokens is 0)
  'google-tts': { input: 16.00, output: 16.00 }, // $16 per 1M chars
  'azure-tts': { input: 16.00, output: 16.00 },  // $16 per 1M chars
  'elevenlabs': { input: 300.00, output: 300.00 }, // ~$300 per 1M chars
};

export function calculateCost(modelString: string, promptTokens: number, completionTokens: number): number {
  let inputCost = 0.075; // Default to Flash pricing
  let outputCost = 0.30;
  
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (modelString.toLowerCase().includes(key)) {
      inputCost = pricing.input;
      outputCost = pricing.output;
      break;
    }
  }

  const cost = (promptTokens / 1_000_000) * inputCost + (completionTokens / 1_000_000) * outputCost;
  return cost;
}

export async function logTokenUsage(params: TokenLogParams): Promise<void> {
  try {
    let promptTokens = params.promptTokens || 0;
    let completionTokens = params.completionTokens || 0;
    let isEstimated = false;
    
    // Fallback estimation if AI SDK failed to return usage
    if (promptTokens === 0 && completionTokens === 0) {
      if (params.source === 'image' || params.source === 'tts') {
        isEstimated = false; // These are flat-rate or char-based calculations, not LLM fallbacks
      } else {
        isEstimated = true;
      }

      if (params.source === 'outline') {
        promptTokens = 1500;
        completionTokens = 600;
      } else if (params.source === 'content') {
        promptTokens = 2500;
        completionTokens = 1200;
      } else if (params.source === 'actions') {
        promptTokens = 1800;
        completionTokens = 500;
      } else if (params.source === 'image') {
        promptTokens = 1000000; // Represents 1 image to trigger the fixed cost addition
        completionTokens = 0;
      } else if (params.source === 'tts') {
        // tokens represent characters
      } else {
        promptTokens = 1000;
        completionTokens = 500;
      }
    }
    const cost = calculateCost(params.modelString, promptTokens, completionTokens);

    const db = admin.firestore();
    const docRef = db.collection('usage_logs').doc();
    
    await docRef.set({
      uid: params.uid,
      email: params.email || 'unknown',
      model: params.modelString || 'unknown',
      promptTokens: promptTokens,
      completionTokens: completionTokens,
      totalTokens: promptTokens + completionTokens,
      cost: cost,
      stageId: params.stageId || null,
      source: params.source,
      isEstimated: isEstimated,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    log.info(`Token usage logged for ${params.email || params.uid}: ${promptTokens + completionTokens} tokens, $${cost.toFixed(6)} (estimated: ${isEstimated})`);
  } catch (error) {
    log.error('Failed to log token usage to Firestore', error);
  }
}
