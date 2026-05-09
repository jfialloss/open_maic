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
  status?: 'building' | 'completed';
  audioUrlMap?: Record<string, string>;
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

    // 2. Wrap and send to Firestore
    const cloudClassroom: CloudClassroom = {
      ...stageData,
      createdBy: userUid,
      authorNickname: userNickname || 'Docente Anónimo',
      subject: subject,
      createdAtTime: Date.now(),
      status: 'completed',
      audioUrlMap,
    };

    // Use stageId as document ID
    // Remove undefined values via JSON stringify hack because Firestore throws if a field is explicitly 'undefined'
    const sanitizedClassroom = JSON.parse(JSON.stringify(cloudClassroom));
    await setDoc(doc(firestoreDb, 'global_classrooms', stageId), sanitizedClassroom);
    
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

const STOP_WORDS = new Set([
  // Español
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'lo', 'al', 'del',
  'a', 'ante', 'bajo', 'cabe', 'con', 'contra', 'de', 'desde', 'durante', 'en', 
  'entre', 'hacia', 'hasta', 'mediante', 'para', 'por', 'segun', 'sin', 'so', 
  'sobre', 'tras', 'versus', 'via',
  'y', 'e', 'ni', 'o', 'u', 'ya', 'bien', 'sea', 'pero', 'mas', 'sino', 'aunque',
  'porque', 'pues', 'como', 'si', 'que',
  'curso', 'clase', 'tema', 'leccion', 'unidad', 'alumnos', 'niños', 'estudiantes',
  'quiero', 'necesito', 'hazme', 'crea', 'generame', 'generar', 'crear', 'hacer',
  'interactivo', 'dinamico', 'divertido', 'basico', 'avanzado', 'introduccion',
  // English
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'to', 'of', 
  'for', 'with', 'on', 'in', 'at', 'by', 'about', 'from', 'into', 'through',
  'course', 'class', 'lesson', 'unit', 'topic', 'student', 'students', 'kids', 
  'children', 'generate', 'create', 'make', 'want', 'need', 'interactive',
  'dynamic', 'fun', 'basic', 'advanced', 'introduction', 'please', 'can', 'you'
]);

function tokenizeAndFilter(text: string): string[] {
  // Remover puntuacion y acentos, pasar a minuscula
  const normalized = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s]/g, ' ');
  const tokens = normalized.split(/\s+/).filter(t => t.length > 2);
  return tokens.filter(t => !STOP_WORDS.has(t));
}

export async function findSimilarGlobalClassroom(subject: string, requirement: string, topic: string = 'LIBRE'): Promise<CloudClassroom | null> {
  // Fetch recent classrooms from this subject
  const q = query(
    collection(firestoreDb, 'global_classrooms'),
    where('subject', '==', subject),
    limit(50)
  );
  const snap = await getDocs(q);
  
  const reqTokens = new Set(tokenizeAndFilter(requirement));

  for (const docSnap of snap.docs) {
    const data = docSnap.data() as CloudClassroom;
    
    // 1. Curricular Approach (Enfoque guiado por bloque/tema)
    if (topic !== 'LIBRE' && topic !== 'none') {
       // Si tienen el mismo topic oficial del curriculo, es una coincidencia fuerte
       if (data.stage?.topic === topic) {
          return data;
       }
       // Como es un curso estructurado, no usamos flexibilidad semántica. Exigimos exactitud.
       continue;
    }

    // 2. Free Approach (Similitud de Tokens - Jaccard / Overlap) solo para cursos Libres
    const stageName = data.stage?.name || '';
    const nameTokens = tokenizeAndFilter(stageName);
    
    if (nameTokens.length === 0) continue;

    let matchCount = 0;
    for (const token of nameTokens) {
      if (reqTokens.has(token)) {
        matchCount++;
      }
    }

    // Calcular el porcentaje de las palabras clave del titulo del curso que estan en el requerimiento del usuario
    const overlapPercentage = matchCount / nameTokens.length;

    // Si al menos un 50% de las palabras clave del titulo coinciden, lo consideramos similar
    if (overlapPercentage >= 0.5) {
      return data;
    }
    
    // Backup: Primitive Overlap fallback por si el usuario escribe muy poco
    const reqLower = requirement.toLowerCase();
    const stageNameLower = stageName.toLowerCase();
    if (stageNameLower.length > 5 && reqLower.includes(stageNameLower)) {
      return data;
    }
  }
  return null;
}
