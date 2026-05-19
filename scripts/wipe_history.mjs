import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Cargar variables de entorno desde .env.local
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  // Match FIREBASE_SERVICE_ACCOUNT_KEY='{...}' or FIREBASE_SERVICE_ACCOUNT_KEY="{...}" or FIREBASE_SERVICE_ACCOUNT_KEY={...}
  const match = envContent.match(/FIREBASE_SERVICE_ACCOUNT_KEY=(['"]?)([\s\S]+?)\1(?:\n|$)/);
  if (match) {
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY = match[2].trim();
  }
}

// Initialize the Firebase admin app
if (!admin.apps.length) {
  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (serviceAccountKey) {
    const serviceAccount = JSON.parse(serviceAccountKey);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } else {
    admin.initializeApp();
  }
}

const db = admin.firestore();

async function wipeHistory() {
  console.log('Starting historical data wipe...');

  try {
    const usersSnapshot = await db.collection('users').get();
    let count = 0;

    for (const userDoc of usersSnapshot.docs) {
      const uid = userDoc.id;
      const profileRef = db.collection('users').doc(uid).collection('data').doc('profile');

      const profileDoc = await profileRef.get();
      if (profileDoc.exists) {
        await profileRef.update({
          masteredTopics: [],
          assignedCourses: {},
          passedCourses: [],
          activeCourses: {},
          xp: 0,
          xpByCourse: {},
          xpHistory: [],
          currentStreak: 0,
          lastPracticeDate: null,
          activityHistory: [],
          courseAttempts: {}
        });
        count++;
        console.log(`Wiped data for user: ${uid}`);
      }
    }

    console.log(`Successfully wiped historical data for ${count} users.`);
  } catch (error) {
    console.error('Error wiping data:', error);
  }
}

wipeHistory().then(() => {
  console.log('Done.');
  process.exit(0);
});
