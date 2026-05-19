import * as admin from 'firebase-admin';

admin.initializeApp({ projectId: 'open-maic-dev' });
const db = admin.firestore();

async function check() {
  const q = await db.collection('usage_logs').orderBy('createdAt', 'desc').limit(5).get();
  q.forEach(doc => {
    console.log(doc.data());
  });
}

check();
