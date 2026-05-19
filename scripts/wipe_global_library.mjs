import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Cargar variables de entorno desde .env.local
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
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

async function wipeGlobalLibrary() {
  console.log('Starting deletion of global_classrooms...');

  try {
    const snapshot = await db.collection('global_classrooms').get();
    if (snapshot.empty) {
      console.log('No documents found in global_classrooms.');
      return;
    }

    let count = 0;
    const batchSize = 100;
    let batch = db.batch();
    let currentBatchCount = 0;

    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
      currentBatchCount++;
      count++;

      if (currentBatchCount >= batchSize) {
        await batch.commit();
        batch = db.batch();
        currentBatchCount = 0;
        console.log(`Deleted ${count} documents so far...`);
      }
    }

    // Commit any remaining documents
    if (currentBatchCount > 0) {
      await batch.commit();
    }

    console.log(`Successfully deleted all ${count} documents from global_classrooms.`);
    console.log('NOTE: Firebase Storage files (images and audio) were intentionally LEFT INTACT to avoid breaking locally cloned courses.');
  } catch (error) {
    console.error('Error wiping global library:', error);
  }
}

wipeGlobalLibrary().then(() => {
  console.log('Done.');
  process.exit(0);
});
