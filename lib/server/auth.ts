import * as admin from 'firebase-admin';
import { NextRequest } from 'next/server';

// Initialize Firebase Admin App if not already initialized
if (!admin.apps.length) {
  try {
    // Attempt to use the default service account (available in Cloud Run / App Engine)
    // or from FIREBASE_SERVICE_ACCOUNT_KEY env var
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

    if (serviceAccountKey) {
      const serviceAccount = JSON.parse(serviceAccountKey);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } else {
      admin.initializeApp();
    }
  } catch (error) {
    console.error('Firebase Admin initialization error', error);
  }
}

export interface AuthContext {
  uid: string;
  email?: string;
  role?: string;
}

/**
 * Validates the Authorization header in a NextRequest
 * Returns the decoded token if valid, throws an error if invalid
 */
export async function authenticateRequest(req: NextRequest): Promise<AuthContext> {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header');
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Optional: Extract custom claims like role if you use them
    const role = decodedToken.role || 'user';
    
    return {
      uid: decodedToken.uid,
      email: decodedToken.email,
      role: role,
    };
  } catch (error) {
    console.error('Token verification failed:', error);
    throw new Error('Unauthorized');
  }
}
