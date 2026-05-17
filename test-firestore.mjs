import admin from 'firebase-admin';
import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf-8');
const saKeyMatch = env.match(/FIREBASE_SERVICE_ACCOUNT_KEY=(['"]?)(.*?)\1/s);
const saKey = saKeyMatch ? saKeyMatch[2] : '';

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(saKey))
});

async function run() {
  const snapshot = await admin.firestore().collection('usage_logs').orderBy('createdAt', 'desc').limit(2).get();
  console.log(JSON.stringify(snapshot.docs.map(d => d.data()), null, 2));
}

run().catch(console.error);
