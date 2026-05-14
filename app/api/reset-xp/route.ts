import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (error) {
    console.error('Firebase admin initialization error', error);
  }
}

const db = admin.firestore();

export async function GET() {
  try {
    const usersSnapshot = await db.collection('users').where('role', '==', 'student').get();
    let updatedCount = 0;

    for (const userDoc of usersSnapshot.docs) {
      const profileRef = db.collection('users').doc(userDoc.id).collection('data').doc('profile');
      const profileSnap = await profileRef.get();
      
      if (profileSnap.exists) {
        const data = profileSnap.data();
        if (data && data.xpByCourse && Object.keys(data.xpByCourse).length > 0) {
          // Reset XP
          await profileRef.update({
            xpByCourse: {},
            xpHistory: []
          });
          updatedCount++;
        }
      }
    }

    return NextResponse.json({ success: true, updatedCount, message: `Reset XP for ${updatedCount} students` });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
