import { db as dexieDb } from './database';
import { db as firestoreDb, storage as firebaseStorage } from '../firebase';
import { doc, setDoc, getDocs, collection, query, where, orderBy, limit, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { toast } from 'sonner';
import { createLogger } from '@/lib/logger';
import { loadStageData, StageStoreData } from './stage-storage';

import { useSyncStore } from '../store/sync-store';

const log = createLogger('CloudSync');

export interface CloudClassroom extends Partial<StageStoreData> {
  createdBy: string;
  authorNickname: string;
  subject: string;
  createdAtTime: number;
  status?: 'building' | 'syncing' | 'completed';
  audioUrlMap?: Record<string, string>;
}

function encodeNestedArrays(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(item => {
      if (Array.isArray(item)) {
        return { _isNestedArray: true, data: JSON.stringify(item) };
      }
      return encodeNestedArrays(item);
    });
  } else if (obj !== null && typeof obj === 'object') {
    const newObj: any = {};
    for (const key of Object.keys(obj)) {
      newObj[key] = encodeNestedArrays(obj[key]);
    }
    return newObj;
  }
  return obj;
}

function decodeNestedArrays(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(item => decodeNestedArrays(item));
  } else if (obj !== null && typeof obj === 'object') {
    if (obj._isNestedArray === true && typeof obj.data === 'string') {
      try {
        return decodeNestedArrays(JSON.parse(obj.data));
      } catch (e) {
        return [];
      }
    }
    const newObj: any = {};
    for (const key of Object.keys(obj)) {
      newObj[key] = decodeNestedArrays(obj[key]);
    }
    return newObj;
  }
  return obj;
}

export async function publishStageToCloud(
  stageId: string,
  userUid: string,
  userNickname: string,
  subject: string,
): Promise<void> {
  const { lockSync, updateStatus } = useSyncStore.getState();
  
  try {
    const stageData = await loadStageData(stageId);
    if (!stageData) {
      throw new Error(`Cannot publish: Stage ${stageId} not found locally.`);
    }

    // Si ya hay un proceso subiendo este curso, abortamos silenciosamente
    if (!lockSync(stageId, stageData.stage.name || 'Curso')) {
      log.info(`Sync lock active for ${stageId}, aborting duplicate publish attempt.`);
      return;
    }
    // 0. Pre-create the Firestore document so Storage Rules pass
    // (Firebase storage rules check firestore.get(global_classrooms/stageId).createdBy)
    const cloudClassroom: CloudClassroom = {
      ...stageData,
      createdBy: userUid,
      authorNickname: userNickname || 'Docente Anónimo',
      subject: subject,
      createdAtTime: Date.now(),
      status: 'syncing', // Will be marked as completed at the end
      audioUrlMap: {},
    };
    const sanitizedClassroom = encodeNestedArrays(JSON.parse(JSON.stringify(cloudClassroom)));
    await setDoc(doc(firestoreDb, 'global_classrooms', stageId), sanitizedClassroom);

    // 1. Traverse and upload MediaFiles (Images/Videos)
    const mediaRecords = await dexieDb.mediaFiles.where('stageId').equals(stageId).toArray();
    const mediaUrlMap: Record<string, string> = {}; // Local elementId -> Firebase URL

    // Batch upload to prevent network choking (e.g. max 3 concurrent)
    const BATCH_SIZE = 3;
    for (let i = 0; i < mediaRecords.length; i += BATCH_SIZE) {
      const batch = mediaRecords.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (record) => {
          try {
            if (!record.blob || record.blob.size === 0) {
              log.info(`Skipping media ${record.id} because it has an empty blob (failed generation task).`);
              return;
            }

            const elementId = record.id.includes(':') ? record.id.split(':').slice(1).join(':') : record.id;
            log.info(`Uploading media ${elementId} (${record.blob.size} bytes)...`);
            
            const storageRef = ref(firebaseStorage, `courses_media/${stageId}/${elementId}`);
            
            // Timeout de 20 segundos por archivo para evitar cuelgues infinitos
            const uploadTask = uploadBytes(storageRef, record.blob);
            const timeoutTask = new Promise((_, reject) => 
              setTimeout(() => reject(new Error(`Timeout subiendo archivo ${elementId}`)), 20000)
            );
            
            await Promise.race([uploadTask, timeoutTask]);
            
            const url = await getDownloadURL(storageRef);
            mediaUrlMap[elementId] = url;
            
            // Update local record to remember OSS key
            await dexieDb.mediaFiles.update(record.id, { ossKey: url });
            log.info(`Successfully uploaded ${elementId}`);
          } catch (fileErr) {
            log.error(`Failed to upload file ${record.id}:`, fileErr);
            throw fileErr; // Propagate to fail the whole sync
          }
        })
      );
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

    // 1.5 Traverse and upload AudioFiles
    const audioIds = new Set<string>();
    for (const scene of stageData.scenes) {
      if (scene.actions) {
        for (const action of scene.actions) {
          if ('audioId' in action && typeof action.audioId === 'string') audioIds.add(action.audioId);
        }
      }
    }

    const audioUrlMap: Record<string, string> = {};
    const audioRecordsToUpload = [];

    for (const aid of audioIds) {
      const rec = await dexieDb.audioFiles.get(aid);
      if (rec && rec.blob) {
        if (rec.ossKey) {
          audioUrlMap[aid] = rec.ossKey;
        } else {
          audioRecordsToUpload.push(rec);
        }
      }
    }

    const AUDIO_BATCH = 3;
    for (let i = 0; i < audioRecordsToUpload.length; i += AUDIO_BATCH) {
      const batch = audioRecordsToUpload.slice(i, i + AUDIO_BATCH);
      await Promise.all(
        batch.map(async (record) => {
          try {
            log.info(`Uploading audio ${record.id}...`);
            const storageRef = ref(firebaseStorage, `courses_audio/${stageId}/${record.id}`);
            const uploadTask = uploadBytes(storageRef, record.blob);
            const timeoutTask = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout audio")), 20000));
            await Promise.race([uploadTask, timeoutTask]);
            const url = await getDownloadURL(storageRef);
            audioUrlMap[record.id] = url;
            await dexieDb.audioFiles.update(record.id, { ossKey: url });
          } catch (e) {
            log.error(`Failed to upload audio ${record.id}:`, e);
          }
        })
      );
    }

    // 3. Update the Firestore document with final URLs and completed status
    // Re-encode because stageData.scenes was mutated with new Firebase URLs
    const finalSanitizedClassroom = encodeNestedArrays(JSON.parse(JSON.stringify(cloudClassroom)));

    await setDoc(doc(firestoreDb, 'global_classrooms', stageId), {
      ...finalSanitizedClassroom,
      status: 'completed',
      audioUrlMap,
    }, { merge: true });
    
    // Mark locally as published to avoid redundant syncs
    await dexieDb.stages.update(stageId, { isPublishedToCloud: true });
    
    log.info(`Classroom ${stageId} published globally successfully.`);
    updateStatus(stageId, 'done');

  } catch (err) {
    log.error('Error publishing stage to cloud:', err);
    updateStatus(stageId, 'error');
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
        language: 'es-419',
        style: 'professional',
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    };
    await setDoc(doc(firestoreDb, 'global_classrooms', stageId), stub, { merge: true });
    log.info(`Classroom ${stageId} (Building Stub) published globally successfully.`);
    toast.success('🌐 Conectando a la nube de NEWMAN');
  } catch (err) {
    log.error('Error publishing building stage to cloud:', err);
    // Non-blocking, so we just log
  }
}

export async function processCloudDownload(stageId: string, cloudDataRaw: any): Promise<void> {
  const cloudData = decodeNestedArrays(cloudDataRaw) as CloudClassroom;
  
  // If the user clones this course, we hydrate local Dexie.
  // The scenes already contain the Firebase URLs in the JSON structure!
  // Slide renderer will natively load external HTTPS urls.
  
  // We simply put the stage data straight into Dexie via stage-storage.
  const { saveStageData } = await import('./stage-storage');
  if (!cloudData.stage) {
    throw new Error('No se pudo clonar: El curso en la nube no posee metadatos de configuración (stage).');
  }

  await saveStageData(stageId, {
    stage: cloudData.stage,
    scenes: cloudData.scenes || [],
    currentSceneId: cloudData.currentSceneId || '',
    chats: cloudData.chats || [],
    agents: cloudData.agents || [],
  });

  if (cloudData.audioUrlMap) {
     const audioStubs = Object.entries(cloudData.audioUrlMap).map(([audioId, url]) => ({
        id: audioId,
        blob: new Blob([]), // Dummy blob
        format: 'audio/mp3',
        createdAt: Date.now(),
        ossKey: url
     }));
     const { db: dexieDb } = await import('./database');
     await dexieDb.audioFiles.bulkPut(audioStubs);
  }
}

export async function findSimilarGlobalClassroom(subject: string, requirement: string, topic: string = 'LIBRE'): Promise<CloudClassroom | null> {
  // Si es un curso libre, saltamos la validación de duplicados y permitimos la generación
  if (topic === 'LIBRE' || topic === 'none') {
    return null;
  }

  // Fetch recent classrooms from this subject for Curricular matching
  const q = query(
    collection(firestoreDb, 'global_classrooms'),
    where('subject', '==', subject),
    limit(50)
  );
  const snap = await getDocs(q);

  for (const docSnap of snap.docs) {
    const data = docSnap.data() as CloudClassroom;
    
    // Curricular Approach (Enfoque guiado por bloque/tema)
    // Exigimos exactitud en el tema curricular asignado
    if (data.stage?.topic === topic) {
      return data;
    }
  }
  
  return null;
}
