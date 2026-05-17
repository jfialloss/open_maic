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
};

function calculateCost(modelString: string, promptTokens: number, completionTokens: number): number {
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
    const promptTokens = params.promptTokens || 0;
    const completionTokens = params.completionTokens || 0;
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
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    log.info(`Token usage logged for ${params.email || params.uid}: ${promptTokens + completionTokens} tokens, $${cost.toFixed(6)}`);
  } catch (error) {
    log.error('Failed to log token usage to Firestore', error);
  }
}
