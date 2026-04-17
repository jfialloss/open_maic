import { db as dexieDb } from './database';
import { db as firestoreDb, storage as firebaseStorage } from '../firebase';
import { doc, setDoc, getDocs, collection, query, where, orderBy, limit, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { toast } from 'sonner';
import { createLogger } from '@/lib/logger';
import { loadStageData, StageStoreData } from './stage-storage';

const log = createLogger('CloudSync');

export interface CloudClassroom extends Partial<StageStoreData> {
  createdBy: string;
  authorNickname: string;
  subject: string;
  createdAtTime: number;
  status?: 'building' | 'completed';
}

export async function publishStageToCloud(
  stageId: string,
  userUid: string,
  userNickname: string,
  subject: string,
): Promise<void> {
  try {
    const stageData = await loadStageData(stageId);
    if (!stageData) {
      throw new Error(`Cannot publish: Stage ${stageId} not found locally.`);
    }

    // 1. Traverse and upload MediaFiles (Images/Videos)
    const mediaRecords = await dexieDb.mediaFiles.where('stageId').equals(stageId).toArray();
    const mediaUrlMap: Record<string, string> = {}; // Local elementId -> Firebase URL

    for (const record of mediaRecords) {
      const elementId = record.id.includes(':') ? record.id.split(':').slice(1).join(':') : record.id;
      const storageRef = ref(firebaseStorage, `courses_media/${stageId}/${elementId}`);
      await uploadBytes(storageRef, record.blob);
      const url = await getDownloadURL(storageRef);
      mediaUrlMap[elementId] = url;
      
      // Update local record to remember OSS key
      await dexieDb.mediaFiles.update(record.id, { ossKey: url });
    }

    // Replace gen_img_* in scenes with Firebase URLs
    for (const scene of stageData.scenes) {
      if (scene.content?.type === 'slide' && scene.content.canvas) {
        for (const el of scene.content.canvas.elements) {
          if (el.type === 'image' && el.src && mediaUrlMap[el.src]) {
            el.src = mediaUrlMap[el.src];
          }
        }
      }
    }

    // 2. Wrap and send to Firestore
    const cloudClassroom: CloudClassroom = {
      ...stageData,
      createdBy: userUid,
      authorNickname: userNickname || 'Docente Anónimo',
      subject: subject,
      createdAtTime: Date.now(),
      status: 'completed',
    };

    // Use stageId as document ID
    await setDoc(doc(firestoreDb, 'global_classrooms', stageId), cloudClassroom);
    log.info(`Classroom ${stageId} published globally successfully.`);

  } catch (err) {
    log.error('Error publishing stage to cloud:', err);
    throw err;
  }
}

export async function publishBuildingStageToCloud(
  stageId: string,
  stageName: string,
  userUid: string,
  userNickname: string,
  subject: string,
): Promise<void> {
  try {
    const stub: CloudClassroom = {
      createdBy: userUid,
      authorNickname: userNickname || 'Docente Anónimo',
      subject: subject,
      createdAtTime: Date.now(),
      status: 'building',
      stage: {
        id: stageId,
        name: stageName,
        subject: subject,
        description: '',
        language: 'es-ES',
        style: 'professional',
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    };
    await setDoc(doc(firestoreDb, 'global_classrooms', stageId), stub, { merge: true });
    log.info(`Classroom ${stageId} (Building Stub) published globally successfully.`);
    toast.success(`🌐 Conectado a la Nube. (ID: ${stageId})`);
  } catch (err) {
    log.error('Error publishing building stage to cloud:', err);
    // Non-blocking, so we just log
  }
}

export async function processCloudDownload(stageId: string, cloudData: CloudClassroom): Promise<void> {
  // If the user clones this course, we hydrate local Dexie.
  // The scenes already contain the Firebase URLs in the JSON structure!
  // Slide renderer will natively load external HTTPS urls.
  
  // We simply put the stage data straight into Dexie via stage-storage.
  const { saveStageData } = await import('./stage-storage');
  await saveStageData(stageId, {
    stage: cloudData.stage,
    scenes: cloudData.scenes,
    currentSceneId: cloudData.currentSceneId,
    chats: cloudData.chats,
  });
}

export async function findSimilarGlobalClassroom(subject: string, requirement: string): Promise<CloudClassroom | null> {
  if (subject === 'none') return null;
  // Fetch recent classrooms from this subject
  const q = query(
    collection(firestoreDb, 'global_classrooms'),
    where('subject', '==', subject),
    limit(50)
  );
  const snap = await getDocs(q);
  
  const reqLower = requirement.toLowerCase();

  for (const docSnap of snap.docs) {
    const data = docSnap.data() as CloudClassroom;
    const stageNameLower = (data.stage?.name || '').toLowerCase();
    
    // Primitive String Overlap (Anti-duplication)
    // If the stage name contains key exact phrases from the requirement
    if (stageNameLower.length > 5 && reqLower.includes(stageNameLower)) {
      return data;
    }
    // O viceversa
    if (reqLower.length > 5 && stageNameLower.includes(reqLower)) {
      return data;
    }
  }
  return null;
}
