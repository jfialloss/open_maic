import * as admin from 'firebase-admin';
import { createLogger } from '@/lib/logger';

const log = createLogger('PromptLogger');

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

export interface PromptLogParams {
  uid: string;
  email?: string;
  prompt: string;
  isSafe: boolean;
  reason?: string;
  modelString?: string;
}

/**
 * Guarda el prompt del usuario en Firestore para fines de auditoría.
 */
export async function logUserPrompt(params: PromptLogParams): Promise<void> {
  try {
    const db = admin.firestore();
    const docRef = db.collection('prompt_logs').doc();
    
    await docRef.set({
      uid: params.uid,
      email: params.email || 'unknown',
      prompt: params.prompt,
      isSafe: params.isSafe,
      reason: params.reason || null,
      model: params.modelString || 'unknown',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    log.info(`Prompt logged for user ${params.uid} (Safe: ${params.isSafe})`);
  } catch (error) {
    log.error('Failed to log user prompt to Firestore', error);
  }
}
