const admin = require('firebase-admin');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const match = envFile.match(/FIREBASE_SERVICE_ACCOUNT_KEY\s*=\s*('[\s\S]*?'|"[\s\S]*?"|[\s\S]*?(?=\n[A-Z_]+\s*=|$))/);
if (!match) {
  console.log('Could not find FIREBASE_SERVICE_ACCOUNT_KEY in .env.local');
  process.exit(1);
}

let raw = match[1].trim();
if (raw.startsWith("'") && raw.endsWith("'")) raw = raw.slice(1, -1);
if (raw.startsWith('"') && raw.endsWith('"')) raw = raw.slice(1, -1);

let serviceAccount;
try {
  serviceAccount = JSON.parse(raw);
} catch (e) {
  console.log('Failed to parse service account JSON:', e);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function run() {
  console.log('Fetching students...');
  const usersSnapshot = await db.collection('users').where('role', '==', 'student').get();

  for (const userDoc of usersSnapshot.docs) {
    const profileRef = db.collection('users').doc(userDoc.id).collection('data').doc('profile');
    const profileSnap = await profileRef.get();
    
    if (profileSnap.exists) {
      const data = profileSnap.data();
      console.log(`Student ${userDoc.id} (${data.nickname || 'Unknown'}):`);
      console.log(' - xpByCourse:', data.xpByCourse);
      console.log(' - xpHistory:', data.xpHistory ? data.xpHistory.length + ' entries' : 'undefined');
    }
  }

  process.exit(0);
}

run();
