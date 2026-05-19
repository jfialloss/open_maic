'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowUp,
  Check,
  ChevronDown,
  Clock,
  Cloud,
  Copy,
  ImagePlus,
  Pencil,
  Trash2,
  Settings,
  Sun,
  Moon,
  Monitor,
  BotOff,
  ChevronUp,
  LogOut,
  Search,
  ArrowDownAZ,
  ArrowDownZA,
  Filter,
  FileText,
  Award,
  Star,
  Lock,
  ShieldAlert,
  ShieldCheck,
  BookOpen,
  ArrowRight,
  Users,
  Library,
  TrendingUp,
  Play,
  ClipboardList,
  Brain,
  Activity
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { useAuth } from '@/lib/hooks/use-auth';
import { auth, db as firestoreDb } from '@/lib/firebase';
import { collection, query, orderBy, limit, getDocs, deleteDoc, doc, startAfter, where, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { useI18n } from '@/lib/hooks/use-i18n';
import { createLogger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { Textarea as UITextarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { SettingsDialog } from '@/components/settings';
import { GenerationToolbar } from '@/components/generation/generation-toolbar';
import { AgentBar } from '@/components/agent/agent-bar';
import { useTheme } from '@/lib/hooks/use-theme';
import { nanoid } from 'nanoid';
import { storePdfBlob } from '@/lib/utils/image-storage';
import type { UserRequirements } from '@/lib/types/generation';
import { useSettingsStore } from '@/lib/store/settings';
import { useUserProfileStore, AVATAR_OPTIONS } from '@/lib/store/user-profile';
import {
  StageListItem,
  listStages,
  deleteStageData,
  getFirstSlideByStages,
} from '@/lib/utils/stage-storage';
import { ThumbnailSlide } from '@/components/slide-renderer/components/ThumbnailSlide';
import type { Slide } from '@/lib/types/slides';
import { useMediaGenerationStore } from '@/lib/store/media-generation';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDraftCache } from '@/lib/hooks/use-draft-cache';
import { SpeechButton } from '@/components/audio/speech-button';
import { XpAnalyticsModal } from '@/components/progress/xp-analytics-modal';
import { PracticeModal } from '@/components/progress/practice-modal';
import syllabusDataRaw from '@/lib/data/syllabus.json';

const syllabusData = syllabusDataRaw as any;

const log = createLogger('Home');

const WEB_SEARCH_STORAGE_KEY = 'webSearchEnabled';
const LANGUAGE_STORAGE_KEY = 'generationLanguage';
const RECENT_OPEN_STORAGE_KEY = 'recentClassroomsOpen';

interface FormState {
  pdfFile: File | null;
  requirement: string;
  language: 'en-US' | 'es-419';
  webSearch: boolean;
  deepInteraction: boolean;
  subject: string;
  topic?: string;
}

const initialFormState: FormState = {
  pdfFile: null,
  requirement: '',
  language: 'es-419',
  webSearch: true,
  deepInteraction: false,
  subject: 'none',
  topic: undefined,
};

function getMappedLevel(grade: string): string | null {
  const gradeMap: Record<string, string> = {
    '5º Grado de EGB': '5to de EGB',
    '6º Grado de EGB': '6to de EGB',
    '7º Grado de EGB': '7mo de EGB',
    '8º Grado de EGB': '8vo de EGB',
    '9º Grado de EGB': '9no de EGB',
    '10º Grado de EGB': '10mo de EGB',
    '1º de Bachillerato': '1ro de BGU',
    '2º de Bachillerato': '2do de BGU',
    '3º de Bachillerato': '3ro de BGU',
    '1º Curso de Bachillerato': '1ro de BGU',
    '2º Curso de Bachillerato': '2do de BGU',
    '3º Curso de Bachillerato': '3ro de BGU',
  };
  return gradeMap[grade] || null;
}

function getSublevelFromGrade(grade: string): string | null {
  if (['5º Grado de EGB', '6º Grado de EGB', '7º Grado de EGB'].includes(grade)) return 'Básica Media';
  if (['8º Grado de EGB', '9º Grado de EGB', '10º Grado de EGB'].includes(grade)) return 'Básica Superior';
  if (['1º de Bachillerato', '2º de Bachillerato', '3º de Bachillerato', '1º Curso de Bachillerato', '2º Curso de Bachillerato', '3º Curso de Bachillerato'].includes(grade)) return 'Bachillerato';
  return null;
}

function getAgeFromGrade(grade: string): string {
  const ageMap: Record<string, string> = {
    '5º Grado de EGB': '9 años',
    '6º Grado de EGB': '10 años',
    '7º Grado de EGB': '11 años',
    '8º Grado de EGB': '12 años',
    '9º Grado de EGB': '13 años',
    '10º Grado de EGB': '14 años',
    '1º de Bachillerato': '15 años',
    '2º de Bachillerato': '16 años',
    '3º de Bachillerato': '17 años',
    '1º Curso de Bachillerato': '15 años',
    '2º Curso de Bachillerato': '16 años',
    '3º Curso de Bachillerato': '17 años',
  };
  return ageMap[grade] || 'edad promedio para este nivel';
}

function getSyllabusContext(subject?: string, grade?: string, topic?: string, englishLevel?: string) {
  if (!subject || subject === 'none' || !topic || topic === 'LIBRE') return null;
  const mappedSubject = subject === 'matematicas' ? 'Matemática' : subject === 'ciencias' ? 'Ciencias Naturales' : subject === 'lengua' ? 'Lengua y Literatura' : subject === 'ingles' ? 'Inglés' : 'Estudios Sociales';
  
  let mappedLevel = null;
  if (mappedSubject === 'Inglés') {
    mappedLevel = englishLevel || null;
  } else {
    const gradeMap: Record<string, string> = {
      '5º Grado de EGB': '5to de EGB',
      '6º Grado de EGB': '6to de EGB',
      '7º Grado de EGB': '7mo de EGB',
      '8º Grado de EGB': '8vo de EGB',
      '9º Grado de EGB': '9no de EGB',
      '10º Grado de EGB': '10mo de EGB',
      '1º de Bachillerato': '1ro de BGU',
      '2º de Bachillerato': '2do de BGU',
      '3º de Bachillerato': '3ro de BGU',
    };
    mappedLevel = grade ? gradeMap[grade] : null;
  }
  
  if (!mappedLevel) return null;
  
  const subjectData = syllabusData[mappedSubject]?.[mappedLevel];
  if (!subjectData) return null;
  
  let unitIndex = 0;
  for (const [unitName, unitData] of Object.entries(subjectData)) {
    const uData = unitData as any;
    if (uData.temas) {
      const isNewFormat = typeof uData.temas[0] === 'object';
      const topicExists = isNewFormat 
        ? uData.temas.some((t: any) => t.titulo === topic)
        : uData.temas.includes(topic);
        
      if (topicExists) {
        let dcd = null;
        if (isNewFormat) {
           const topicObj = uData.temas.find((t: any) => t.titulo === topic);
           if (topicObj?.destrezas) {
             dcd = topicObj.destrezas.join('\n');
           } else if (topicObj?.dcd) {
             dcd = topicObj.dcd;
           }
        }
        
        if (dcd && typeof dcd === 'string' && /no se encuentr|no se encontr|no detallad|no especificad|not found/i.test(dcd)) {
          dcd = null;
        }
        const officialObjectives = uData.objetivos || subjectData["objetivos_oficiales"] || [];
        return { unitName, block: unitIndex + 1, dcd, officialObjectives };
      }
    }
    unitIndex++;
  }
  return null;
}

function HomePage() {
  const { t, locale, setLocale } = useI18n();
  const { role, user } = useAuth();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialFormState);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<
    import('@/lib/types/settings').SettingsSection | undefined
  >(undefined);
  const [xpModalOpen, setXpModalOpen] = useState(false);

  // Draft cache for requirement text
  const { cachedValue: cachedRequirement, updateCache: updateRequirementCache } =
    useDraftCache<string>({ key: 'requirementDraft' });

  // Model setup state
  const currentModelId = useSettingsStore((s) => s.modelId);
  const masteredTopics = useUserProfileStore((s) => s.masteredTopics);
  const passedCourses = useUserProfileStore((s) => s.passedCourses) || [];
  const activeCourses = useUserProfileStore((s) => s.activeCourses);
  const assignedCourses = useUserProfileStore((s) => s.assignedCourses);
  const removeActiveCourse = useUserProfileStore((s) => s.removeActiveCourse);
  const globalGrade = useUserProfileStore((s) => s.grade);
  const globalEnglishLevel = useUserProfileStore((s) => s.englishLevel);
  const xpByCourse = useUserProfileStore((s) => s.xpByCourse) || {};
  const totalXP = Object.values(xpByCourse).reduce((sum, xp) => sum + xp, 0);
  const mappedSublevel = form.subject === 'ingles' ? globalEnglishLevel : getMappedLevel(globalGrade);
  const [storeHydrated, setStoreHydrated] = useState(false);
  const [recentOpen, setRecentOpen] = useState(true);

  // Hydrate client-only state after mount (avoids SSR mismatch)
  /* eslint-disable react-hooks/set-state-in-effect -- Hydration from localStorage must happen in effect */
  useEffect(() => {
    setStoreHydrated(true);
    try {
      const saved = localStorage.getItem(RECENT_OPEN_STORAGE_KEY);
      if (saved !== null) setRecentOpen(saved !== 'false');
    } catch {
      /* localStorage unavailable */
    }
    try {
      const savedWebSearch = localStorage.getItem(WEB_SEARCH_STORAGE_KEY);
      const updates: Partial<FormState> = {};
      if (savedWebSearch !== null) {
        updates.webSearch = savedWebSearch === 'true';
      }
      
      // Siempre forzamos a español al inicio o al regresar a esta ventana
      updates.language = 'es-419';
      
      if (Object.keys(updates).length > 0) {
        setForm((prev) => ({ ...prev, ...updates }));
      }
    } catch {
      /* localStorage unavailable */
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Restore requirement draft from cache (derived state pattern — no effect needed)
  const [prevCachedRequirement, setPrevCachedRequirement] = useState(cachedRequirement);
  if (cachedRequirement !== prevCachedRequirement) {
    setPrevCachedRequirement(cachedRequirement);
    if (cachedRequirement) {
      setForm((prev) => ({ ...prev, requirement: cachedRequirement }));
    }
  }

  const needsSetup = storeHydrated && !currentModelId;
  const [languageOpen, setLanguageOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [practiceModalOpen, setPracticeModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [classrooms, setClassrooms] = useState<StageListItem[]>([]);
  const [activeTab, setActiveTab] = useState<'local' | 'progress' | 'assigned'>('local');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [localLimit, setLocalLimit] = useState(20);
  const [thumbnails, setThumbnails] = useState<Record<string, Slide>>({});
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    if (!languageOpen && !themeOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setLanguageOpen(false);
        setThemeOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [languageOpen, themeOpen]);

  // Validate pending cloud courses to ensure they still exist in the cloud
  useEffect(() => {
    if (!storeHydrated || !activeCourses || !user) return;
    
    const pendingCloud = Object.values(activeCourses).filter(
      (ac) => !classrooms.some((c) => c.id === ac.stageId) && !masteredTopics.includes(ac.topic) && !passedCourses.includes(ac.stageId)
    );
    
    if (pendingCloud.length === 0) return;

    const validateCloud = async () => {
      try {
        const { getDoc, doc } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');
        
        for (const ac of pendingCloud) {
          const docSnap = await getDoc(doc(db, 'global_classrooms', ac.stageId));
          if (!docSnap.exists()) {
            log.info(`[Cloud Validation] Course ${ac.stageId} no longer exists in cloud. Removing from pending.`);
            useUserProfileStore.getState().removeActiveCourse(ac.stageId);
          }
        }
      } catch (e: any) {
        if (e?.code === 'permission-denied') {
          // Silently ignore if auth is still synchronizing
          return;
        }
        log.error('Failed to validate pending cloud courses:', e);
      }
    };
    
    validateCloud();
  }, [storeHydrated, activeCourses, classrooms, masteredTopics, passedCourses, user]);

  const loadClassrooms = async () => {
    try {
      const list = await listStages();
      const now = Date.now();
      const TWO_HOURS = 2 * 60 * 60 * 1000;
      
      const validList: StageListItem[] = [];
      const completeList: StageListItem[] = [];

      for (const gc of list) {
        // Garbage Collection Local
        if ((!gc.sceneCount || gc.sceneCount === 0) && (now - gc.createdAt > TWO_HOURS)) {
          log.info(`[GC] Eliminando curso truncado local: ${gc.id}`);
          try {
            await deleteStageData(gc.id);
            await deleteDoc(doc(firestoreDb, 'global_classrooms', gc.id));
          } catch(e) {}
        } else {
          validList.push(gc);
          if (gc.sceneCount && gc.sceneCount > 0) {
            completeList.push(gc);
          }
        }
      }

      setClassrooms(validList);

      // Load first slide thumbnails
      if (validList.length > 0) {
        const slides = await getFirstSlideByStages(validList.map((c) => c.id));
        setThumbnails(slides);
      }

      // Passive Sync for complete courses
      setTimeout(async () => {
        try {
          const { loadStageData } = await import('@/lib/utils/stage-storage');
          const { publishStageToCloud } = await import('@/lib/utils/cloud-sync');
          const { getDoc } = await import('firebase/firestore');

          for (const gc of completeList) {
            // Optimización: Saltar Firebase si ya sabemos que está en la nube
            if (gc.isPublishedToCloud) continue;

            const { useSyncStore } = await import('@/lib/store/sync-store');
            if (useSyncStore.getState().isSyncing(gc.id)) continue;

            const docRef = doc(firestoreDb, 'global_classrooms', gc.id);
            const docSnap = await getDoc(docRef);
            
            // Si no existe o se quedó atascado en 'building'
            if (!docSnap.exists() || docSnap.data().status === 'building') {
              const fullData = await loadStageData(gc.id);
              if (fullData && fullData.stage && fullData.stage.subject) {
                 log.info(`[Passive Sync] Rescatando curso completo a la nube: ${gc.id}`);
                 try {
                   const currentUser = auth.currentUser;
                   if (currentUser) {
                     await publishStageToCloud(gc.id, currentUser.uid, currentUser.displayName || 'Docente', fullData.stage.subject);
                   }
                 } catch (e) {
                   log.error(`[Passive Sync] Error syncing ${gc.id}`, e);
                 }
              }
            } else {
              // Estaba en la nube pero no teníamos la marca local. Marcar localmente para ahorrar cuota en el futuro.
              const { db: dexieDb } = await import('@/lib/utils/database');
              await dexieDb.stages.update(gc.id, { isPublishedToCloud: true });
            }
          }
        } catch (e) {
          log.error('Error in passive sync', e);
        }
      }, 3000);

    } catch (err) {
      log.error('Failed to load classrooms:', err);
    }
  };

  useEffect(() => {
    // Clear stale media store to prevent cross-course thumbnail contamination.
    // The store may hold tasks from a previously visited classroom whose elementIds
    // (gen_img_1, etc.) collide with other courses' placeholders.
    useMediaGenerationStore.getState().revokeObjectUrls();
    useMediaGenerationStore.setState({ tasks: {} });

    // eslint-disable-next-line react-hooks/set-state-in-effect -- Store hydration on mount
    loadClassrooms();
  }, []);

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingDeleteId(id);
  };

  const confirmDelete = async (id: string) => {
    setPendingDeleteId(null);
    try {
      await deleteStageData(id);
      
      // Garbage Collection Global: Eliminar el cascarón huérfano si existe
      try {
        const { getDoc } = await import('firebase/firestore');
        const docRef = doc(firestoreDb, 'global_classrooms', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.status === 'building' && data.createdBy === auth.currentUser?.uid) {
            await deleteDoc(docRef);
          }
        }
      } catch (e) {}

      // Limpiar del estado activo para que no salga en Cursos Pendientes o Mi Progreso
      useUserProfileStore.getState().removeActiveCourse(id);

      await loadClassrooms();
    } catch (err) {
      log.error('Failed to delete classroom:', err);
      toast.error('Failed to delete classroom');
    }
  };



  const updateForm = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    try {
      if (field === 'webSearch') localStorage.setItem(WEB_SEARCH_STORAGE_KEY, String(value));
      if (field === 'language') localStorage.setItem(LANGUAGE_STORAGE_KEY, String(value));
      if (field === 'requirement') updateRequirementCache(value as string);
    } catch {
      /* ignore */
    }
  };

  const showSetupToast = (icon: React.ReactNode, title: string, desc: string) => {
    toast.custom(
      (id) => (
        <div
          className="w-[356px] rounded-xl border border-amber-200/60 dark:border-amber-800/40 bg-gradient-to-r from-amber-50 via-white to-amber-50 dark:from-amber-950/60 dark:via-slate-900 dark:to-amber-950/60 shadow-lg shadow-amber-500/8 dark:shadow-amber-900/20 p-4 flex items-start gap-3 cursor-pointer"
          onClick={() => {
            toast.dismiss(id);
            setSettingsOpen(true);
          }}
        >
          <div className="shrink-0 mt-0.5 size-9 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center ring-1 ring-amber-200/50 dark:ring-amber-800/30">
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 leading-tight">
              {title}
            </p>
            <p className="text-xs text-amber-700/80 dark:text-amber-400/70 mt-0.5 leading-relaxed">
              {desc}
            </p>
          </div>
          <div className="shrink-0 mt-1 text-[10px] font-medium text-amber-500 dark:text-amber-500/70 tracking-wide">
            <Settings className="size-3.5 animate-[spin_3s_linear_infinite]" />
          </div>
        </div>
      ),
      { duration: 4000 },
    );
  };

  const handleGenerate = async () => {
    // Validate setup before proceeding
    if (!currentModelId) {
      showSetupToast(
        <BotOff className="size-4.5 text-amber-600 dark:text-amber-400" />,
        t('settings.modelNotConfigured'),
        t('settings.setupNeeded'),
      );
      setSettingsOpen(true);
      return;
    }

    if (!form.requirement.trim()) {
      setError(t('upload.requirementRequired'));
      return;
    }

    // --- ESCUDO ANTI-DUPLICADO ---
    if (form.subject) {
      try {
        const { findSimilarGlobalClassroom } = await import('@/lib/utils/cloud-sync');
        const similarClassroom = await findSimilarGlobalClassroom(form.subject, form.requirement, form.topic || 'LIBRE');
        if (similarClassroom) {
          const isEn = locale === 'en-US';
          if (similarClassroom.status === 'building') {
            window.alert(
              isEn 
                ? `Wait! A tutor is currently building a course on this topic ("${similarClassroom.stage?.name}").\n\nPlease try again in a few minutes. The system will offer to clone it automatically.`
                : `¡Espera! Un tutor está construyendo un curso sobre este tema en este momento ("${similarClassroom.stage?.name}").\n\nPor favor, intenta nuevamente en unos minutos. El sistema te ofrecerá clonarlo automáticamente.`
            );
            return;
          }

          // Alert user of similarity and offer direct clone
          const proceedToClone = window.confirm(
            isEn 
              ? `Stop! We found that a community course already exists for this exact topic:\n\n"${similarClassroom.stage?.name}"\n\nWould you like to IMPORT (clone) this course for FREE to your local account (OK), or force the generation of a new one spending your own credits (Cancel)?`
              : `¡Alto! Hemos detectado que ya existe un curso creado previamente por la comunidad que encaja con este tema:\n\n"${similarClassroom.stage?.name}"\n\n¿Deseas IMPORTAR (clonar) este curso GRATIS a tu cuenta local (Aceptar), o prefieres forzar la generación de uno nuevo gastando tus propios créditos (Cancelar)?`
          );
          if (proceedToClone) {
            toast.loading(isEn ? 'Cloning suggested course...' : 'Clonando curso sugerido...', { id: 'clone' });
            try {
              const { processCloudDownload } = await import('@/lib/utils/cloud-sync');
              const targetStageId = similarClassroom.stage?.id;
              if (!targetStageId) throw new Error("ID de curso inválido");
              await processCloudDownload(targetStageId, similarClassroom);
              toast.success(isEn ? 'Cloning complete' : 'Clonación completa', { id: 'clone' });
              router.push(`/classroom/${targetStageId}`);
            } catch (err) {
              log.error('Failed to clone classroom:', err);
              toast.error(isEn ? 'Failed to clone course' : 'Fallo al clonar curso', { id: 'clone' });
            }
            return; // Detenemos la generacion sin importar exito/fracaso
          }
          // Si Cancelan, quieren forzar la generacion (siguen de largo)
        }
      } catch (e: any) {
        log.error('Anti-dup mechanism failed:', e?.message || e?.code || e);
        console.error('FIREBASE RAW ERROR:', e);
      }
    }
    // -----------------------------

    setError(null);

    try {
      const userProfile = useUserProfileStore.getState();
      const settings = useSettingsStore.getState();
      
      let personaHint = '';
      if (settings.ttsVoice) {
        // Enmascaramos el prefijo 'es-ES-' para no contaminar a Gemini con el dialecto de España
        const maskedVoice = settings.ttsVoice.replace(/^es-ES-/i, 'es-US-');
        personaHint = `\n\n[System Note: The TTS voice selected for the AI teacher is "${maskedVoice}". Analyze this voice ID ONLY to determine the appropriate gender (male/female).]`;
      }

      const syllabusContext = getSyllabusContext(form.subject, globalGrade, form.topic, globalEnglishLevel);
      let curriculumContext = '';

      if (syllabusContext) {
        let curriculumBody = '';
        if (syllabusContext.dcd) {
          // New optimized format!
          const objText = syllabusContext.officialObjectives.length > 0
            ? `\nObjetivos del Subnivel:\n- ${syllabusContext.officialObjectives.join('\n- ')}`
            : '';
          curriculumBody = `[DCD ESPECÍFICA A DESARROLLAR]:\n${syllabusContext.dcd}${objText}`;
        } else {
          // Inferir destreza si falta
          curriculumBody = `[DCD ESPECÍFICA A DESARROLLAR]:\n(Nota del Sistema: La Destreza oficial para este tema no está explícita en el currículo. Como IA Educativa Experta, debes DEDUCIR e INVENTAR una Destreza con Criterio de Desempeño (DCD) rigurosa y altamente pedagógica para el tema "${form.topic}", adaptada al nivel cognitivo de un estudiante de ${getAgeFromGrade(globalGrade)}.)`;
        }

        curriculumContext = `
[CONTEXTO DEL CURRÍCULO NACIONAL]
Estás preparando una clase basada en el currículo oficial del Ministerio de Educación.
Unidad / Bloque: ${syllabusContext.unitName} (Bloque ${syllabusContext.block})
Tema Seleccionado: ${form.topic}

${curriculumBody}

INSTRUCCIÓN CRÍTICA: Debes garantizar que la clase enseñe EXACTAMENTE la Destreza con Criterio de Desempeño (DCD) especificada, adaptando el lenguaje y la dificultad pedagógica exclusivamente a un estudiante de ${getAgeFromGrade(globalGrade)} (${globalGrade}). No te desvíes del tema.
`;
      }

      let deepInteractionHint = '';
      if (form.deepInteraction) {
        deepInteractionHint = `\n\n[INSTRUCCIÓN CRÍTICA DE INTERACCIÓN PROFUNDA]: Se ha habilitado la Interacción Profunda. DEBES PLANIFICAR EL CURSO DE FORMA NORMAL (Introducción, Desarrollo con variedad de formatos, Conclusión). SIN EMBARGO, OBLIGATORIAMENTE DEBES INCLUIR UNA escena central de type: "interactive" (NO de tipo "slide") para contener una simulación interactiva HTML compleja sobre el tema central. El resto del curso debe usar el tipo de escena "slide".`;
      }

      const requirements: UserRequirements = {
        requirement: form.requirement + personaHint + curriculumContext + deepInteractionHint,
        language: form.subject === 'ingles' ? 'en-US' : form.language,
        userNickname: userProfile.nickname || undefined,
        userBio: userProfile.bio || undefined,
        webSearch: form.webSearch || undefined,
        deepInteraction: form.deepInteraction || undefined,
        subject: form.subject !== 'none' ? form.subject : undefined,
        grade: globalGrade || undefined,
        topic: form.topic || 'LIBRE',
      };

      let pdfStorageKey: string | undefined;
      let pdfFileName: string | undefined;
      let pdfProviderId: string | undefined;
      let pdfProviderConfig: { apiKey?: string; baseUrl?: string } | undefined;

      if (form.pdfFile) {
        pdfStorageKey = await storePdfBlob(form.pdfFile);
        pdfFileName = form.pdfFile.name;

        pdfProviderId = settings.pdfProviderId;
        const providerCfg = settings.pdfProvidersConfig?.[settings.pdfProviderId];
        if (providerCfg) {
          pdfProviderConfig = {
            apiKey: providerCfg.apiKey,
            baseUrl: providerCfg.baseUrl,
          };
        }
      }

      const sessionState = {
        sessionId: nanoid(),
        requirements,
        pdfText: '',
        pdfImages: [],
        imageStorageIds: [],
        pdfStorageKey,
        pdfFileName,
        pdfProviderId,
        pdfProviderConfig,
        sceneOutlines: null,
        currentStep: 'generating' as const,
      };
      sessionStorage.setItem('generationSession', JSON.stringify(sessionState));

      router.push('/generation-preview');
    } catch (err) {
      log.error('Error preparing generation:', err);
      setError(err instanceof Error ? err.message : t('upload.generateFailed'));
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return t('classroom.today');
    if (diffDays === 1) return t('classroom.yesterday');
    if (diffDays < 7) return `${diffDays} ${t('classroom.daysAgo')}`;
    return date.toLocaleDateString();
  };

  const canGenerate = !!form.requirement.trim();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (canGenerate) handleGenerate();
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex flex-col items-center p-4 pt-16 md:p-8 md:pt-16 overflow-x-hidden [overflow-anchor:none]">
      {/* ═══ Top-left PEAAS Pill ═══ */}
      <div className="fixed top-4 left-4 z-50 flex items-center gap-1 bg-white/60 dark:bg-gray-800/60 backdrop-blur-md px-2 py-1.5 rounded-full border border-gray-100/50 dark:border-gray-700/50 shadow-sm">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => router.push('/peaas')}
              className="flex items-center gap-2 px-3 py-1 rounded-full text-sm font-bold text-sky-600 dark:text-sky-400 hover:bg-white dark:hover:bg-gray-700 transition-all"
            >
              <ShieldCheck className="w-5 h-5" />
              <span className="hidden sm:inline">PEAAS</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={4}>
            {t('peaas.title')}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* ═══ Top-right pill ═══ */}
      <div
        ref={toolbarRef}
        className="fixed top-4 right-4 z-50 flex items-center gap-1 bg-white/60 dark:bg-gray-800/60 backdrop-blur-md px-2 py-1.5 rounded-full border border-gray-100/50 dark:border-gray-700/50 shadow-sm"
      >
        {/* Language Selector */}
        <div className="relative">
          <button
            onClick={() => {
              setLanguageOpen(!languageOpen);
              setThemeOpen(false);
            }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold text-gray-500 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm transition-all"
          >
            {locale === 'en-US' ? 'EN' : 'ES'}
          </button>
          {languageOpen && (
            <div className="absolute top-full mt-2 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden z-50 min-w-[120px]">
              <button
                onClick={() => {
                  setLocale('en-US');
                  setLanguageOpen(false);
                }}
                className={cn(
                  'w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors',
                  locale === 'en-US' &&
                    'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
                )}
              >
                English
              </button>
              <button
                onClick={() => {
                  setLocale('es-ES');
                  setLanguageOpen(false);
                }}
                className={cn(
                  'w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors',
                  locale === 'es-ES' &&
                    'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
                )}
              >
                Español
              </button>
            </div>
          )}
        </div>

        <div className="w-[1px] h-4 bg-gray-200 dark:bg-gray-700" />

        {/* Theme Selector */}
        <div className="relative">
          <button
            onClick={() => {
              setThemeOpen(!themeOpen);
              setLanguageOpen(false);
            }}
            className="p-2 rounded-full text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm transition-all"
          >
            {theme === 'light' && <Sun className="w-4 h-4" />}
            {theme === 'dark' && <Moon className="w-4 h-4" />}
            {theme === 'system' && <Monitor className="w-4 h-4" />}
          </button>
          {themeOpen && (
            <div className="absolute top-full mt-2 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden z-50 min-w-[140px]">
              <button
                onClick={() => {
                  setTheme('light');
                  setThemeOpen(false);
                }}
                className={cn(
                  'w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2',
                  theme === 'light' &&
                    'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
                )}
              >
                <Sun className="w-4 h-4" />
                {t('settings.themeOptions.light')}
              </button>
              <button
                onClick={() => {
                  setTheme('dark');
                  setThemeOpen(false);
                }}
                className={cn(
                  'w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2',
                  theme === 'dark' &&
                    'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
                )}
              >
                <Moon className="w-4 h-4" />
                {t('settings.themeOptions.dark')}
              </button>
              <button
                onClick={() => {
                  setTheme('system');
                  setThemeOpen(false);
                }}
                className={cn(
                  'w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2',
                  theme === 'system' &&
                    'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
                )}
              >
                <Monitor className="w-4 h-4" />
                {t('settings.themeOptions.system')}
              </button>
            </div>
          )}
        </div>

        {/* Auditoria Button */}
        {(role === 'admin' || role === 'tutor') && (
          <button
            onClick={() => router.push('/admin/logs')}
            className="p-2 rounded-full text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm transition-all"
            title={t('adminToolbar.prompts')}
          >
            <ShieldAlert className="w-4 h-4" />
          </button>
        )}

        {/* Biblioteca Global Button */}
        {(role === 'admin' || role === 'tutor') && (
          <button
            onClick={() => router.push('/admin/library')}
            className="p-2 rounded-full text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm transition-all"
            title={t('adminToolbar.library')}
          >
            <Library className="w-4 h-4" />
          </button>
        )}

        {/* Sessions Button */}
        {(role === 'admin' || role === 'tutor') && (
          <button
            onClick={() => router.push('/admin/sessions')}
            className="p-2 rounded-full text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm transition-all"
            title={t('adminToolbar.sessions')}
          >
            <Clock className="w-4 h-4" />
          </button>
        )}

        {/* Progress Button */}
        {(role === 'admin' || role === 'tutor') && (
          <button
            onClick={() => router.push('/admin/progress')}
            className="p-2 rounded-full text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm transition-all"
            title={t('adminToolbar.progress')}
          >
            <TrendingUp className="w-4 h-4" />
          </button>
        )}

        {/* Gamification Button */}
        {(role === 'admin' || role === 'tutor') && (
          <button
            onClick={() => router.push('/admin/gamification')}
            className="p-2 rounded-full text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-700 hover:text-amber-500 dark:hover:text-amber-400 hover:shadow-sm transition-all"
            title="Reporte de Gamificación (XP)"
          >
            <Star className="w-4 h-4" />
          </button>
        )}

        {/* Assignments Button */}
        {(role === 'admin' || role === 'tutor') && (
          <button
            onClick={() => router.push('/admin/assignments')}
            className="p-2 rounded-full text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-700 hover:text-indigo-600 dark:hover:text-indigo-400 hover:shadow-sm transition-all"
            title="Control de Asignaciones"
          >
            <ClipboardList className="w-4 h-4" />
          </button>
        )}

        {/* Users Button */}
        {(role === 'admin' || role === 'tutor') && (
          <button
            onClick={() => router.push('/admin/users')}
            className="p-2 rounded-full text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-700 hover:text-emerald-600 dark:hover:text-emerald-400 hover:shadow-sm transition-all"
            title="Gestión de Usuarios"
          >
            <Users className="w-4 h-4" />
          </button>
        )}

        {/* Usage & Cost Button */}
        {role === 'admin' && (
          <button
            onClick={() => router.push('/admin/usage')}
            className="p-2 rounded-full text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-700 hover:text-rose-500 dark:hover:text-rose-400 hover:shadow-sm transition-all"
            title={t('adminToolbar.usage')}
          >
            <Activity className="w-4 h-4" />
          </button>
        )}

        {role === 'admin' && <div className="w-[1px] h-4 bg-gray-200 dark:bg-gray-700" />}

        {/* Settings Button */}
        {role === 'admin' && (
          <div className="relative">
            <button
              onClick={() => setSettingsOpen(true)}
              className={cn(
                'p-2 rounded-full text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm transition-all group',
                needsSetup && 'animate-setup-glow',
              )}
            >
              <Settings className="w-4 h-4 group-hover:rotate-90 transition-transform duration-500" />
            </button>
            {needsSetup && (
              <>
                <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                  <span className="animate-setup-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-sky-500" />
                </span>
                <span className="animate-setup-float absolute top-full mt-2 right-0 whitespace-nowrap text-[11px] font-medium text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/50 px-2 py-0.5 rounded-full shadow-sm pointer-events-none">
                  {t('settings.setupNeeded')}
                </span>
              </>
            )}
          </div>
        )}

        <div className="w-[1px] h-4 bg-gray-200 dark:bg-gray-700" />

        {/* Logout Button */}
        <div className="relative">
          <button
            onClick={async () => {
              try {
                await signOut(auth);
                toast.success('Sesión cerrada exitosamente');
                router.push('/login');
              } catch (error) {
                log.error('Logout error', error);
                toast.error('Ocurrió un error al cerrar sesión.');
              }
            }}
            className="p-2 rounded-full text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-700 hover:text-red-500 dark:hover:text-red-400 hover:shadow-sm transition-all"
            title="Cerrar sesión"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
        </div>
        
        {role === 'admin' && (
          <SettingsDialog
            open={settingsOpen}
            onOpenChange={(open) => {
              setSettingsOpen(open);
              if (!open) setSettingsSection(undefined);
            }}
            initialSection={settingsSection}
          />
        )}
        
        <XpAnalyticsModal 
          open={xpModalOpen}
          onClose={() => setXpModalOpen(false)}
        />

        {practiceModalOpen && (
          <PracticeModal onClose={() => setPracticeModalOpen(false)} />
        )}

      {/* ═══ Background Decor ═══ */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '4s' }}
        />
        <div
          className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '6s' }}
        />
      </div>

      {/* ═══ Hero section: title + input (centered, wider) ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className={cn(
          'relative z-20 w-full max-w-[800px] flex flex-col items-center [overflow-anchor:none]',
          'mt-[8vh] md:mt-[12vh]',
        )}
      >
        {/* ── Logo ── */}
        <motion.img
          src="/logo_cordis_ai.svg"
          alt="CORDISAI"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            delay: 0.1,
            type: 'spring',
            stiffness: 200,
            damping: 20,
          }}
          className="h-[58px] md:h-[86px] mb-2 -ml-2 md:-ml-3 dark:hidden"
        />
        <motion.img
          src="/logo_cordis_ai_dark.svg"
          alt="CORDISAI"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            delay: 0.1,
            type: 'spring',
            stiffness: 200,
            damping: 20,
          }}
          className="h-[58px] md:h-[86px] mb-2 -ml-2 md:-ml-3 hidden dark:block"
        />

        {/* ── Slogan ── */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="text-sm text-muted-foreground/60 mb-8"
        >
          {t('home.slogan')}
        </motion.p>

        {/* ── Unified input area ── */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ opacity: { delay: 0.35 }, scale: { delay: 0.35 } }}
          className="w-full"
        >
          <div className="w-full rounded-2xl border border-border/60 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-xl shadow-black/[0.03] dark:shadow-black/20 transition-shadow focus-within:shadow-2xl focus-within:shadow-sky-500/[0.06]">
            {/* ── Greeting + Profile + Agents ── */}
            <div className="relative z-20 flex items-stretch justify-between">
              <div className="flex items-stretch">
                <GreetingBar />
                {(role === 'student' || role === 'admin' || role === 'tutor') && (
                  <div className="pt-3.5 pb-1 pr-2 flex items-stretch">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setPracticeModalOpen(true)}
                          className="flex items-center justify-center cursor-pointer transition-all duration-200 group rounded-[22px] px-3.5 border border-border/50 text-muted-foreground/70 hover:text-sky-500 hover:bg-muted/60 active:scale-[0.97]"
                        >
                          <Brain className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" sideOffset={4}>
                        {t('toolbar.practiceZone')}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                )}
              </div>
              <div className="pr-3 pt-3.5 shrink-0 flex items-start">
                <AgentBar />
              </div>
            </div>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              placeholder={t('upload.requirementPlaceholder')}
              className="w-full resize-none border-0 bg-transparent px-4 pt-1 pb-2 text-[13px] leading-relaxed placeholder:text-muted-foreground/40 focus:outline-none min-h-[140px] max-h-[300px]"
              value={form.requirement}
              onChange={(e) => updateForm('requirement', e.target.value)}
              onKeyDown={handleKeyDown}
              rows={4}
            />

            {/* Toolbar row */}
            <div className="px-3 pb-3 flex items-end gap-2">
              <div className="flex-1 min-w-0">
                <GenerationToolbar
                  language={form.language}
                  onLanguageChange={(lang) => updateForm('language', lang)}
                  webSearch={form.webSearch}
                  onWebSearchChange={(v) => updateForm('webSearch', v)}
                  deepInteraction={form.deepInteraction}
                  onDeepInteractionChange={(v) => updateForm('deepInteraction', v)}
                  onSettingsOpen={(section) => {
                    setSettingsSection(section);
                    setSettingsOpen(true);
                  }}
                  pdfFile={form.pdfFile}
                  onPdfFileChange={(f) => updateForm('pdfFile', f)}
                  onPdfError={setError}
                  subject={form.subject}
                  onSubjectChange={(v) => {
                    updateForm('subject', v);
                    updateForm('requirement', '');
                    updateForm('topic', undefined);
                  }}
                />
              </div>

              {/* Voice input */}
              <SpeechButton
                size="md"
                onTranscription={(text) => {
                  setForm((prev) => {
                    const next = prev.requirement + (prev.requirement ? ' ' : '') + text;
                    updateRequirementCache(next);
                    return { ...prev, requirement: next };
                  });
                }}
              />

              {/* Send button */}
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className={cn(
                  'shrink-0 h-8 rounded-lg flex items-center justify-center gap-1.5 transition-all px-3',
                  canGenerate
                    ? 'bg-primary text-primary-foreground hover:opacity-90 shadow-sm cursor-pointer'
                    : 'bg-muted text-muted-foreground/40 cursor-not-allowed',
                )}
              >
                <span className="text-xs font-medium">{t('toolbar.enterClassroom')}</span>
                <ArrowUp className="size-3.5" />
              </button>
            </div>
            
            {/* ── Syllabus Topics ── */}
            <AnimatePresence>
              {form.subject !== 'none' && syllabusData[form.subject === 'matematicas' ? 'Matemática' : form.subject === 'ciencias' ? 'Ciencias Naturales' : form.subject === 'lengua' ? 'Lengua y Literatura' : form.subject === 'ingles' ? 'Inglés' : 'Estudios Sociales'] && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <div className="px-3 pb-3 pt-2 border-t border-border/40 mt-1 bg-muted/20 rounded-b-2xl flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <FileText className="size-3.5" /> Temario Oficial ({form.subject === 'matematicas' ? 'Matemática' : form.subject === 'ciencias' ? 'Ciencias Naturales' : form.subject === 'lengua' ? 'Lengua y Literatura' : form.subject === 'ingles' ? 'Inglés' : 'Estudios Sociales'} - {form.subject === 'ingles' ? globalEnglishLevel : globalGrade})
                  </p>
                </div>
                {mappedSublevel && syllabusData[form.subject === 'matematicas' ? 'Matemática' : form.subject === 'ciencias' ? 'Ciencias Naturales' : form.subject === 'lengua' ? 'Lengua y Literatura' : form.subject === 'ingles' ? 'Inglés' : 'Estudios Sociales']?.[mappedSublevel] && (() => {
                  const subData = syllabusData[form.subject === 'matematicas' ? 'Matemática' : form.subject === 'ciencias' ? 'Ciencias Naturales' : form.subject === 'lengua' ? 'Lengua y Literatura' : form.subject === 'ingles' ? 'Inglés' : 'Estudios Sociales'][mappedSublevel];
                  const lockedTopics = new Set<string>();
                  let firstUnmasteredFound = false;
                  Object.entries(subData).forEach(([uName, uData]: [string, any]) => {
                    if (uName === 'objetivos_oficiales') return;
                    const isNewFormat = uData.temas && typeof uData.temas[0] === 'object';
                    const topicArray = isNewFormat ? uData.temas.map((t: any) => t.titulo) : uData.temas;
                    if (!topicArray) return;
                    topicArray.forEach((t: string) => {
                      if (!masteredTopics?.includes(t)) {
                        if (firstUnmasteredFound) lockedTopics.add(t);
                        firstUnmasteredFound = true;
                      }
                    });
                  });

                  return (
                    <div className="flex flex-col gap-4 mt-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                      {Object.entries(subData).map(([unitName, unitData]: [string, any], unitIndex) => {
                        if (unitName === 'objetivos_oficiales') return null;
                        return (
                        <div key={unitName} className="flex flex-col gap-1.5 p-2.5 rounded-xl bg-white/50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800/50">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="text-[13px] font-bold text-slate-700 dark:text-slate-200 leading-tight">
                              {unitName}
                            </h4>
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 shrink-0">
                              Bloque {unitIndex + 1}
                            </span>
                          </div>
                          {unitData.objetivos && unitData.objetivos.length > 0 && (
                            <div className="text-[10.5px] text-slate-500 dark:text-slate-400 italic mb-1.5 pl-2 border-l-2 border-slate-200 dark:border-slate-700">
                              {unitData.objetivos[0]}
                            </div>
                          )}
                          <div className="flex flex-col gap-1.5 mt-0.5">
                            {(() => {
                              const isNewFormat = unitData.temas && typeof unitData.temas[0] === 'object';
                              // Normalizamos los temas para que todos sean objetos { titulo, dcd }
                              const topicsData = isNewFormat 
                                ? unitData.temas 
                                : unitData.temas.map((t: string) => ({ titulo: t, dcd: null }));

                              return topicsData.map((temaObj: any, i: number) => {
                                const topic = temaObj.titulo;
                                const rawDCD = temaObj.dcd;
                                const isMastered = masteredTopics?.includes(topic) || false;
                                const isLocked = false; // Bloqueo de temas eliminado por petición del usuario
                                const prefix = `${unitIndex + 1}.${i + 1}`;
                                const inProgressClassroom = !isMastered && !isLocked ? classrooms.find((c) => (c.topic === topic || c.name === topic) && !passedCourses.includes(c.id)) : null;
                                return (
                                  <button
                                    key={topic}
                                    disabled={isLocked}
                                    onClick={() => {
                                      if (isLocked) return;
                                      if (inProgressClassroom) {
                                        if (window.confirm(`Tienes un curso a medias sobre este tema.\n¿Deseas continuar donde te quedaste en lugar de crear uno nuevo?`)) {
                                          router.push(`/classroom/${inProgressClassroom.id}`);
                                        }
                                        return;
                                      }

                                      // Verificamos si la DCD es válida (ignorar si es null o contiene mensajes de "no encontrado" de la IA)
                                      const isNotFoundMessage = /no se encuentr|no se encontr|no detallad|no especificad|not found/i.test(rawDCD || '');
                                      const isValidDCD = rawDCD && typeof rawDCD === 'string' && !isNotFoundMessage;
                                      
                                      let humanPrompt = '';
                                      if (form.subject === 'ingles') {
                                        humanPrompt = `I want a class about the topic: "${topic}".`;
                                      } else {
                                        humanPrompt = `Quiero que me des una clase sobre el tema: "${topic}".`;
                                      }

                                      if (form.subject === 'ingles') {
                                        updateForm('language', 'en-US');
                                      }
                                      updateForm('requirement', humanPrompt);
                                      updateForm('topic', topic);
                                    }}
                                    className={cn(
                                      "w-full text-[12px] px-3 py-2 rounded-lg border transition-all flex items-start gap-2 text-left group",
                                      isLocked
                                        ? "bg-slate-50/50 text-slate-400 border-slate-100 dark:bg-slate-900/20 dark:text-slate-600 dark:border-slate-800/30 cursor-not-allowed opacity-70"
                                        : "hover:shadow-sm active:scale-[0.99]",
                                      isMastered 
                                        ? "bg-emerald-50/70 text-emerald-800 border-emerald-200/60 dark:bg-emerald-950/20 dark:text-emerald-300 dark:border-emerald-800/50" 
                                        : inProgressClassroom
                                        ? "bg-amber-50/70 text-amber-900 border-amber-200/80 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/60"
                                        : !isLocked ? "bg-white text-slate-700 border-slate-200 hover:border-sky-300 hover:bg-sky-50/50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:border-sky-700 dark:hover:bg-slate-800/80" : ""
                                    )}
                                  >
                                    {isLocked ? (
                                      <div className="shrink-0 mt-0.5 size-4 rounded-full bg-slate-200/50 dark:bg-slate-800/50 flex items-center justify-center">
                                        <Lock className="size-2.5 text-slate-400 dark:text-slate-500" />
                                      </div>
                                    ) : isMastered ? (
                                      <div className="shrink-0 mt-0.5 size-4 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
                                        <Check className="size-2.5 text-emerald-600 dark:text-emerald-400" />
                                      </div>
                                    ) : inProgressClassroom ? (
                                      <div className="shrink-0 mt-0.5 size-4 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                                        <Clock className="size-2.5 text-amber-600 dark:text-amber-400" />
                                      </div>
                                    ) : (
                                      <div className="shrink-0 mt-0.5 w-4 font-bold text-[10px] text-slate-400 dark:text-slate-500 text-center">
                                        {prefix}
                                      </div>
                                    )}
                                    
                                    <span className="flex-1 leading-snug">{topic}</span>
                                    
                                    {isLocked ? (
                                      <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-slate-400/70 dark:text-slate-500/70 mt-0.5">
                                        Bloqueado
                                      </span>
                                    ) : isMastered ? (
                                      <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-emerald-600/70 dark:text-emerald-400/70 mt-0.5 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                                        Superado
                                      </span>
                                    ) : inProgressClassroom ? (
                                      <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-amber-600/80 dark:text-amber-400/80 mt-0.5 group-hover:text-amber-700 dark:group-hover:text-amber-300 transition-colors">
                                        En Curso
                                      </span>
                                    ) : null}
                                  </button>
                                );
                              });
                            })()}
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
          </div>
        </motion.div>

        {/* ── Error ── */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 w-full p-3 bg-destructive/10 border border-destructive/20 rounded-lg"
            >
              <p className="text-sm text-destructive">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ═══ Recent classrooms — collapsible ═══ */}
      {true && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="relative z-10 mt-10 w-full max-w-6xl flex flex-col items-center"
        >
          {/* Trigger — divider-line with centered text */}
          <div
            onClick={() => {
              const next = !recentOpen;
              setRecentOpen(next);
              try {
                localStorage.setItem(RECENT_OPEN_STORAGE_KEY, String(next));
              } catch {
                /* ignore */
              }
            }}
            className="group w-full flex items-center gap-4 py-2 cursor-pointer"
          >
            <div className="flex-1 h-px bg-border/40 group-hover:bg-border/70 transition-colors" />
            <span className="shrink-0 flex items-center gap-2 text-[13px] text-muted-foreground/60 group-hover:text-foreground/70 transition-colors select-none">
              <Clock className="size-3.5" />
              <div className="flex bg-muted/60 p-0.5 rounded-md border border-border/40 gap-1 ml-1 cursor-default" onClick={e => e.stopPropagation()}>
                <button
                  className={cn("relative px-2 py-0.5 rounded-sm transition-colors cursor-pointer flex items-center gap-1 pr-3", activeTab === 'local' ? "bg-white dark:bg-slate-800 shadow-sm text-foreground" : "text-muted-foreground")}
                  onClick={() => setActiveTab('local')}
                >
                  Mis Cursos Locales
                  {Object.values(activeCourses || {}).some((ac: any) => !classrooms.some((c) => c.id === ac.stageId) && !masteredTopics.includes(ac.topic) && !passedCourses.includes(ac.stageId)) && (
                    <span className="absolute top-1 right-0.5 flex size-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full size-2 bg-amber-500"></span>
                    </span>
                  )}
                </button>
                <button
                  className={cn("relative px-2 py-0.5 rounded-sm transition-colors cursor-pointer flex items-center gap-1 pr-3", activeTab === 'assigned' ? "bg-white dark:bg-slate-800 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-muted-foreground")}
                  onClick={() => setActiveTab('assigned')}
                >
                  <Users className="size-3" />
                  Asignados
                  {Object.values(assignedCourses || {}).some((ac: any) => ac.status === 'pending') && (
                    <span className="absolute top-1 right-0.5 flex size-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full size-2 bg-amber-500"></span>
                    </span>
                  )}
                </button>
                <button
                  className={cn("px-2 py-0.5 rounded-sm transition-colors cursor-pointer flex items-center gap-1", activeTab === 'progress' ? "bg-white dark:bg-slate-800 shadow-sm text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}
                  onClick={() => setActiveTab('progress')}
                >
                  <Award className="size-3" />
                  Mi Progreso
                </button>
              </div>
              <motion.div
                animate={{ rotate: recentOpen ? 180 : 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="ml-2"
              >
                <ChevronDown className="size-3.5 cursor-pointer" />
              </motion.div>
            </span>
            <div className="flex-1 h-px bg-border/40 group-hover:bg-border/70 transition-colors" />
          </div>

          {/* Expandable content */}
          <AnimatePresence>
            {recentOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                className="w-full overflow-hidden"
              >
                <div className="pt-4 pb-2 flex flex-col sm:flex-row items-center justify-between gap-4">
                  {/* Left Side: empty to keep right side aligned */}
                  <div className="hidden sm:block" />

                  {/* Right Side: Search and Filters (Visible for both) */}
                  <div className="flex items-center gap-2 w-full sm:w-auto bg-white/60 dark:bg-gray-800/60 backdrop-blur-md px-2 py-1.5 rounded-xl border border-gray-100/50 dark:border-gray-700/50 shadow-sm">
                    <div className="relative flex-1 sm:w-48">
                      <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                        <Search className="size-3.5 text-muted-foreground" />
                      </div>
                      <input
                        type="text"
                        placeholder="Buscar cursos o autores..."
                        className="w-full bg-transparent border-none focus:ring-0 text-[13px] pl-8 pr-3 py-1 outline-none placeholder:text-muted-foreground/60 text-foreground"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                    
                    <div className="w-[1px] h-4 bg-border/40" />
                    
                    <div className="relative flex items-center gap-1.5 px-2">
                      <Filter className="size-3.5 text-muted-foreground shrink-0" />
                      <select
                        className="bg-transparent text-[13px] text-foreground border-none outline-none focus:ring-0 cursor-pointer pl-1 pr-6 py-1 appearance-none"
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                      >
                        <option value="all" className="bg-white dark:bg-slate-800 text-foreground">Todas las materias</option>
                        {(() => {
                          const subjects = new Set<string>();
                          classrooms.forEach(c => {
                            subjects.add((!c.subject || c.subject === 'none') ? 'Libre' : c.subject);
                          });
                          return Array.from(subjects).sort().map(s => (
                            <option key={s} value={s} className="bg-white dark:bg-slate-800 text-foreground">{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                          ));
                        })()}
                      </select>
                      <ChevronDown className="absolute right-2 size-3 text-muted-foreground pointer-events-none" />
                    </div>

                    <div className="w-[1px] h-4 bg-border/40" />

                    <button
                      onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                      className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
                      title={sortOrder === 'desc' ? "Más recientes primero" : "Más antiguos primero"}
                    >
                      {sortOrder === 'desc' ? <ArrowDownAZ className="size-4" /> : <ArrowDownZA className="size-4" />}
                    </button>
                  </div>
                </div>
                <div className={activeTab === 'local' ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-8 pt-8" : "w-full pt-6"}>
                  {activeTab === 'progress' ? (
                    <div className="flex flex-col gap-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="size-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                          <Award className="size-5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                          <h2 className="text-lg font-bold text-foreground leading-tight">Tu Progreso Académico</h2>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-sm text-muted-foreground">Nivel: {globalGrade} ({mappedSublevel})</p>
                            <button 
                              onClick={() => setXpModalOpen(true)}
                              className="flex items-center gap-1 text-[11px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-2.5 py-0.5 rounded-full border border-amber-200 dark:border-amber-800/50 hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors cursor-pointer"
                              title="Ver Análisis de XP"
                            >
                              <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" /> {storeHydrated ? totalXP : 0} XP
                            </button>
                          </div>
                        </div>
                      </div>

                      {mappedSublevel && ['Matemática', 'Ciencias Naturales', 'Lengua y Literatura', 'Estudios Sociales', 'Inglés'].map(subject => {
                        const levelToUse = subject === 'Inglés' ? globalEnglishLevel : getMappedLevel(globalGrade) || '';
                        const subjectData = syllabusData[subject]?.[levelToUse];
                        if (!subjectData) return null;
                        
                        let totalTopics = 0;
                        let mCount = 0;
                        const units = Object.entries(subjectData);
                        
                        const lockedTopics = new Set<string>();
                        let firstUnmasteredFound = false;

                        units.forEach(([uName, uData]: any) => {
                          if (uName === 'objetivos_oficiales') return;
                          const isNewFormat = uData.temas && typeof uData.temas[0] === 'object';
                          const topicArray = isNewFormat ? uData.temas.map((t: any) => t.titulo) : uData.temas;
                          if (!topicArray) return;
                          totalTopics += topicArray.length;
                          topicArray.forEach((t: string) => {
                            if (masteredTopics?.includes(t)) {
                              mCount++;
                            } else {
                              if (firstUnmasteredFound) lockedTopics.add(t);
                              firstUnmasteredFound = true;
                            }
                          });
                        });

                        const progress = totalTopics > 0 ? Math.round((mCount / totalTopics) * 100) : 0;

                        return (
                          <div key={subject} className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-xl border border-border/60 p-4 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                              <h3 className="font-bold text-[15px] text-slate-800 dark:text-slate-200">{subject}</h3>
                              <span className="text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/50">
                                {progress}% Completado
                              </span>
                            </div>
                            <div className="w-full bg-slate-200/60 dark:bg-slate-700/60 rounded-full h-2 mb-6 overflow-hidden">
                              <div className="bg-emerald-500 h-2 rounded-full transition-all duration-700" style={{ width: `${progress}%` }} />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                              {units.map(([uName, uData]: any, uIdx) => {
                                if (uName === 'objetivos_oficiales') return null;
                                const isNewFormat = uData.temas && typeof uData.temas[0] === 'object';
                                const topicArray = isNewFormat ? uData.temas.map((t: any) => t.titulo) : uData.temas;
                                if (!topicArray) return null;
                                return (
                                <div key={uName} className="flex flex-col gap-2">
                                  <h4 className="text-[12px] font-bold text-slate-600 dark:text-slate-300 leading-tight">
                                    Bloque {uIdx + 1}: {uName.split(': ')[1] || uName}
                                  </h4>
                                  <div className="flex flex-col gap-1.5">
                                    {topicArray.map((t: string, tIdx: number) => {
                                      const isMastered = masteredTopics?.includes(t);
                                      const isLocked = false;
                                      const inProgressClassroom = !isMastered && !isLocked ? classrooms.find((c) => (c.topic === t || c.name === t) && (c.sceneCount && c.sceneCount > 0) && !passedCourses.includes(c.id)) : null;
                                      return (
                                        <div 
                                          key={t} 
                                          onClick={() => {
                                            if (isLocked) return;
                                            if (inProgressClassroom) {
                                              router.push(`/classroom/${inProgressClassroom.id}`);
                                            }
                                          }}
                                          className={cn("text-[11px] flex items-start gap-1.5 p-1.5 rounded-md transition-colors", 
                                            isLocked ? "text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-60" :
                                            inProgressClassroom ? "cursor-pointer" : "", 
                                            isMastered ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300" : 
                                            inProgressClassroom ? "bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-300 hover:bg-amber-100/60 dark:hover:bg-amber-900/40" : 
                                            isLocked ? "" : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                          )}
                                        >
                                          {isLocked ? <Lock className="size-3.5 shrink-0 mt-[1px] text-slate-300 dark:text-slate-600" /> :
                                           isMastered ? <Check className="size-3.5 shrink-0 mt-[1px]" /> : 
                                           inProgressClassroom ? <Clock className="size-3.5 shrink-0 mt-[1px] text-amber-600 dark:text-amber-400" /> : 
                                           <div className="size-3 shrink-0 rounded-full border border-slate-300 dark:border-slate-600 mt-0.5" />}
                                          <span className="leading-snug flex-1">{t}</span>
                                          {isLocked ? <span className="shrink-0 text-[9px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-wide mt-[2px]">Bloqueado</span> :
                                           inProgressClassroom && <span className="shrink-0 text-[9px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide mt-[2px]">En Curso</span>}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : activeTab === 'local' ? (
                    (() => {
                      let filtered = classrooms.filter(c => !assignedCourses || !assignedCourses[c.id]);

                      // Búsqueda
                      if (searchQuery.trim()) {
                        const q = searchQuery.toLowerCase();
                        filtered = filtered.filter(c => {
                          const name = (c.name || 'Untitled').toLowerCase();
                          const author = 'yo'; // Los cursos locales siempre son propios, pero dejamos este string por completitud
                          return name.includes(q) || author.includes(q);
                        });
                      }

                      // Filtro de Categoría
                      if (categoryFilter !== 'all') {
                        filtered = filtered.filter(c => {
                          const subj = (!c.subject || c.subject === 'none') ? 'Libre' : c.subject;
                          return subj === categoryFilter;
                        });
                      }

                      // Ordenamiento
                      filtered.sort((a, b) => {
                        const timeA = a.createdAt || 0;
                        const timeB = b.createdAt || 0;
                        return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
                      });

                      const pendingCloud = Object.values(activeCourses || {}).filter(
                        (ac) => !classrooms.some((c) => c.id === ac.stageId) && !masteredTopics.includes(ac.topic) && !passedCourses.includes(ac.stageId)
                      );
                      
                      const assignedList = Object.values(assignedCourses || {}).sort((a, b) => b.assignedAt - a.assignedAt);

                      if (classrooms.length === 0 && pendingCloud.length === 0) {
                        return <div className="col-span-full py-8 text-center text-muted-foreground text-sm">No tienes cursos locales aún.</div>;
                      }

                      const localCourseCards = filtered.slice(0, localLimit).map((classroom, i) => (
                        <motion.div
                          key={classroom.id}
                          initial={{ opacity: 0, y: 16 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.04, duration: 0.35, ease: 'easeOut' }}
                        >
                          <ClassroomCard
                            classroom={classroom}
                            slide={thumbnails[classroom.id]}
                            formatDate={formatDate}
                            onDelete={handleDelete}
                            confirmingDelete={pendingDeleteId === classroom.id}
                            onConfirmDelete={() => confirmDelete(classroom.id)}
                            onCancelDelete={() => setPendingDeleteId(null)}
                            onClick={() => router.push(`/classroom/${classroom.id}`)}
                          />
                        </motion.div>
                      ));

                      return (
                        <div className="col-span-full w-full flex flex-col gap-8">

                          {pendingCloud.length > 0 && (
                            <div className="flex flex-col gap-4">
                              <h3 className="text-lg font-semibold text-amber-600 dark:text-amber-500 border-b border-border/40 pb-2 flex items-center gap-2">
                                <Clock className="size-5" /> Cursos Pendientes en la Nube
                              </h3>
                              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-8">
                                {pendingCloud.map((ac: any, i: number) => {
                                  // Mock a classroom object for the Global ClassroomListRow or a simplified card
                                  return (
                                    <motion.div
                                      key={ac.stageId}
                                      initial={{ opacity: 0, y: 16 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      transition={{ delay: i * 0.04, duration: 0.35, ease: 'easeOut' }}
                                      className="relative group bg-white/40 dark:bg-slate-800/40 border-2 border-dashed border-amber-300 dark:border-amber-700/50 rounded-2xl p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all min-h-[220px]"
                                      onClick={async () => {
                                        toast.loading('Descargando clase para continuar...', { id: ac.stageId });
                                        try {
                                          const { findSimilarGlobalClassroom, processCloudDownload } = await import('@/lib/utils/cloud-sync');
                                          // Find the course in global library by stageId
                                          const { getDoc, doc } = await import('firebase/firestore');
                                          const { db } = await import('@/lib/firebase');
                                          const docSnap = await getDoc(doc(db, 'global_classrooms', ac.stageId));
                                          if (docSnap.exists()) {
                                            await processCloudDownload(ac.stageId, docSnap.data() as any);
                                            toast.success('Clonación completa', { id: ac.stageId });
                                            router.push(`/classroom/${ac.stageId}`);
                                          } else {
                                            toast.error('El curso no está disponible en la biblioteca global', { id: ac.stageId });
                                          }
                                        } catch (e) {
                                          console.error(e);
                                          toast.error('Fallo al descargar curso', { id: ac.stageId });
                                        }
                                      }}
                                    >
                                      <Cloud className="size-10 text-amber-500 mb-3 opacity-80 group-hover:scale-110 transition-transform" />
                                      <h4 className="font-bold text-[15px] text-slate-800 dark:text-slate-200 line-clamp-2 leading-tight mb-2">
                                        {ac.name}
                                      </h4>
                                      <div className="flex flex-wrap items-center justify-center gap-1.5 mb-3">
                                        <span className="inline-flex items-center rounded-sm bg-indigo-100 dark:bg-indigo-900/40 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:text-indigo-400">
                                          {ac.subject}
                                        </span>
                                      </div>
                                      <p className="text-[12px] text-muted-foreground mt-auto">
                                        Dejado en diapositiva {ac.sceneIndex + 1}
                                      </p>
                                      <div className="absolute -top-2.5 -right-2.5 bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                                        Retomar
                                      </div>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          removeActiveCourse(ac.stageId);
                                          toast.success('Curso descartado');
                                        }}
                                        className="absolute top-2 left-2 p-1.5 bg-white/50 dark:bg-slate-900/50 hover:bg-red-100 dark:hover:bg-red-900/50 text-slate-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                                        title="Descartar curso"
                                      >
                                        <Trash2 className="size-4" />
                                      </button>
                                    </motion.div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          
                          {filtered.length === 0 && classrooms.length > 0 ? (
                            <div className="py-8 text-center text-muted-foreground text-sm">
                              No se encontraron cursos locales con este filtro.
                            </div>
                          ) : localCourseCards.length > 0 ? (
                            <div className="flex flex-col gap-4 mt-2">
                              {pendingCloud.length > 0 && (
                                <h3 className="text-lg font-semibold text-foreground/90 border-b border-border/40 pb-2">
                                  Cursos Locales / Descargados
                                </h3>
                              )}
                              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-8">
                                {localCourseCards}
                              </div>
                              {localLimit < filtered.length && (
                                <div className="flex justify-center mt-4">
                                  <Button variant="outline" size="sm" onClick={() => setLocalLimit(l => l + 20)}>
                                    Cargar más
                                  </Button>
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      );
                    })()
                  ) : activeTab === 'assigned' ? (
                    (() => {
                      const assignedList = Object.values(assignedCourses || {}).sort((a, b) => b.assignedAt - a.assignedAt);
                      
                      if (assignedList.length === 0) {
                        return <div className="col-span-full py-8 text-center text-muted-foreground text-sm">No tienes cursos asignados por tu tutor aún.</div>;
                      }

                      return (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-8 pt-8">
                          {assignedList.map((ac: any, i: number) => {
                            const isPassed = ac.status === 'passed';
                            const isFailed = ac.status === 'failed';
                            const downloadedClassroom = classrooms.find((c) => c.id === ac.stageId);
                            
                            // Si está descargado, mostramos la ClassroomCard normal (con un badge visual si deseamos)
                            if (downloadedClassroom) {
                              return (
                                <motion.div
                                  key={ac.stageId}
                                  initial={{ opacity: 0, y: 16 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: i * 0.04, duration: 0.35, ease: 'easeOut' }}
                                  className="relative"
                                >
                                  <ClassroomCard
                                    classroom={downloadedClassroom}
                                    slide={thumbnails[downloadedClassroom.id]}
                                    formatDate={formatDate}
                                    onClick={() => {
                                      if (isFailed) {
                                        import('sonner').then(({ toast }) => {
                                          toast.error('Has reprobado esta asignación y está bloqueada.');
                                        });
                                        return;
                                      }
                                      router.push(`/classroom/${downloadedClassroom.id}`);
                                    }}
                                  />
                                  <div className={cn(
                                    "absolute -top-2.5 -right-2.5 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm z-10 pointer-events-none",
                                    isPassed ? "bg-emerald-500 text-white" : isFailed ? "bg-red-500 text-white" : "bg-sky-500 text-white"
                                  )}>
                                    {isPassed ? "Aprobado" : isFailed ? "Reprobado" : "Asignado"}
                                  </div>
                                </motion.div>
                              );
                            }

                            // Si NO está descargado (o es fallback), mostramos la caja de neón
                            return (
                              <motion.div
                                key={ac.stageId}
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.04, duration: 0.35, ease: 'easeOut' }}
                                className={cn(
                                  "relative group border-2 rounded-2xl p-4 flex flex-col items-center justify-center text-center transition-all min-h-[220px]",
                                  isPassed 
                                    ? "bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800/50" 
                                    : isFailed
                                    ? "bg-red-50/50 dark:bg-red-900/10 border-red-200 dark:border-red-800/50"
                                    : "bg-indigo-50/40 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800/50 cursor-pointer hover:bg-indigo-100/50 dark:hover:bg-indigo-900/40 hover:shadow-sm"
                                )}
                                onClick={async () => {
                                  if (isPassed || isFailed) return;

                                  toast.loading('Descargando asignación...', { id: ac.stageId });
                                  try {
                                    const { processCloudDownload } = await import('@/lib/utils/cloud-sync');
                                    const { getDoc, doc } = await import('firebase/firestore');
                                    const { db } = await import('@/lib/firebase');
                                    const docSnap = await getDoc(doc(db, 'global_classrooms', ac.stageId));
                                    if (docSnap.exists()) {
                                      const data = docSnap.data();
                                      await processCloudDownload(ac.stageId, data as any);
                                      toast.success('Clonación completa', { id: ac.stageId });
                                      router.push(`/classroom/${ac.stageId}`);
                                    } else {
                                      toast.error('La asignación ya no está disponible en la base de datos.', { id: ac.stageId });
                                    }
                                  } catch (e) {
                                    console.error(e);
                                    toast.error('Fallo al descargar asignación', { id: ac.stageId });
                                  }
                                }}
                              >
                                {isPassed ? (
                                  <div className="size-10 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center mb-3 text-emerald-600 dark:text-emerald-400">
                                    <Check className="size-5 stroke-[3]" />
                                  </div>
                                ) : (
                                  <div className="size-10 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center mb-3 text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform">
                                    <Cloud className="size-5" />
                                  </div>
                                )}
                                <h4 className="font-bold text-[15px] text-slate-800 dark:text-slate-200 line-clamp-2 leading-tight mb-2">
                                  {ac.name}
                                </h4>
                                <div className="flex flex-wrap items-center justify-center gap-1.5 mb-3">
                                  <span className="inline-flex items-center rounded-sm bg-indigo-100 dark:bg-indigo-900/40 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:text-indigo-400 uppercase">
                                    {(!ac.subject || ac.subject === 'none') ? 'Libre' : ac.subject}
                                  </span>
                                </div>
                                <div className="text-[12px] text-muted-foreground mt-auto">
                                  {new Date(ac.assignedAt).toLocaleDateString()}
                                </div>
                                
                                <div className={cn(
                                  "absolute -top-2.5 -right-2.5 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm",
                                  isPassed ? "bg-emerald-500 text-white" : isFailed ? "bg-red-500 text-white" : "bg-indigo-500 text-white"
                                )}>
                                  {isPassed ? "Aprobado" : isFailed ? "Reprobado" : "Iniciar"}
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                      );
                    })()
                  ) : null}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Footer — flows with content, at the very end */}
      <div className="mt-auto pt-12 pb-4 text-center text-xs text-muted-foreground/40">
        {t('home.footerRights')}
      </div>
    </div>
  );
}

// ─── Greeting Bar — avatar + "Hi, Name", click to edit in-place ────
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

function isCustomAvatar(src: string) {
  return src.startsWith('data:');
}

function GreetingBar() {
  const { t } = useI18n();
  const { user, role } = useAuth();
  const avatar = useUserProfileStore((s) => s.avatar);
  const nickname = useUserProfileStore((s) => s.nickname);
  const bio = useUserProfileStore((s) => s.bio);
  const grade = useUserProfileStore((s) => s.grade);
  const gradeConfirmed = useUserProfileStore((s) => s.gradeConfirmed);
  const englishLevel = useUserProfileStore((s) => s.englishLevel);
  const setAvatar = useUserProfileStore((s) => s.setAvatar);
  const setNickname = useUserProfileStore((s) => s.setNickname);
  const setBio = useUserProfileStore((s) => s.setBio);
  const setGrade = useUserProfileStore((s) => s.setGrade);
  const setEnglishLevel = useUserProfileStore((s) => s.setEnglishLevel);
  const xpByCourse = useUserProfileStore((s) => s.xpByCourse) || {};
  const totalXP = Object.values(xpByCourse).reduce((sum, xp) => sum + xp, 0);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [open, setOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const displayName = nickname || user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || t('profile.defaultNickname');
  
  const displayAvatar = avatar 
    ? (avatar === AVATAR_OPTIONS[0] && user?.photoURL && !isCustomAvatar(avatar) ? user.photoURL : avatar)
    : (user?.photoURL || AVATAR_OPTIONS[0]);

  const pickerOptions = user?.photoURL && !AVATAR_OPTIONS.includes(user.photoURL as any)
    ? [user.photoURL, ...AVATAR_OPTIONS]
    : AVATAR_OPTIONS;

  // Click-outside to collapse
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setEditingName(false);
        setAvatarPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const startEditName = () => {
    setNameDraft(nickname);
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  };

  const commitName = () => {
    setNickname(nameDraft.trim());
    setEditingName(false);
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_AVATAR_SIZE) {
      toast.error(t('profile.fileTooLarge'));
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error(t('profile.invalidFileType'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d')!;
        const scale = Math.max(128 / img.width, 128 / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (128 - w) / 2, (128 - h) / 2, w, h);
        setAvatar(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div ref={containerRef} className="relative pl-4 pr-2 pt-3.5 pb-1 w-auto">
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarUpload}
      />

      {/* ── Collapsed pill (always in flow) ── */}
      {!open && (
        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-2.5 cursor-pointer transition-all duration-200 group rounded-full px-2.5 py-1.5 border border-border/50 text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 active:scale-[0.97]"
            onClick={() => setOpen(true)}
          >
            <div className="shrink-0 relative">
              <div className="size-8 rounded-full overflow-hidden ring-[1.5px] ring-border/30 group-hover:ring-sky-400/60 dark:group-hover:ring-sky-400/40 transition-all duration-300">
                <img src={displayAvatar} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-white dark:bg-slate-800 border border-border/40 flex items-center justify-center opacity-60 group-hover:opacity-100 transition-opacity">
                <Pencil className="size-[7px] text-muted-foreground/70" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="leading-none select-none flex items-center gap-2">
                    <span className="flex flex-col items-start justify-center">
                      <span className="text-[13px] font-semibold text-foreground/85 group-hover:text-foreground transition-colors leading-none mb-1">
                        {t('home.greeting')} {displayName}
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium text-sky-600 dark:text-sky-400 group-hover:text-sky-700 dark:group-hover:text-sky-300 transition-colors leading-none">
                        <span>{grade} • Nivel: {englishLevel}</span>
                        <span className="flex items-center gap-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-sm border border-amber-200 dark:border-amber-800/50">
                          <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" /> {mounted ? totalXP : 0} XP
                        </span>
                      </span>
                    </span>
                    <ChevronDown className="size-3 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors shrink-0" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={4}>
                  {t('profile.editTooltip')}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      )}

      {/* ── Expanded panel (absolute, floating) ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="absolute left-4 top-3.5 z-50 w-64"
          >
            <div className="rounded-2xl bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06] shadow-[0_1px_8px_-2px_rgba(0,0,0,0.06)] dark:shadow-[0_1px_8px_-2px_rgba(0,0,0,0.3)] px-2.5 py-2">
              {/* ── Row: avatar + name ── */}
              <div
                className="flex items-center gap-2.5 cursor-pointer transition-all duration-200"
                onClick={() => {
                  setOpen(false);
                  setEditingName(false);
                  setAvatarPickerOpen(false);
                }}
              >
                {/* Avatar */}
                <div
                  className="shrink-0 relative cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAvatarPickerOpen(!avatarPickerOpen);
                  }}
                >
                  <div className="size-8 rounded-full overflow-hidden ring-[1.5px] ring-sky-300/70 dark:ring-sky-500/40 transition-all duration-300">
                    <img src={displayAvatar} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
                  </div>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-white dark:bg-slate-800 border border-border/60 flex items-center justify-center"
                  >
                    <ChevronDown
                      className={cn(
                        'size-2 text-muted-foreground/70 transition-transform duration-200',
                        avatarPickerOpen && 'rotate-180',
                      )}
                    />
                  </motion.div>
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  {editingName ? (
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        ref={nameInputRef}
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitName();
                          if (e.key === 'Escape') {
                            setEditingName(false);
                          }
                        }}
                        onBlur={commitName}
                        maxLength={20}
                        placeholder={t('profile.defaultNickname')}
                        className="flex-1 min-w-0 h-6 bg-transparent border-b border-border/80 text-[13px] font-semibold text-foreground outline-none placeholder:text-muted-foreground/40"
                      />
                      <button
                        onClick={commitName}
                        className="shrink-0 size-5 rounded flex items-center justify-center text-sky-500 hover:bg-sky-100 dark:hover:bg-sky-900/30"
                      >
                        <Check className="size-3" />
                      </button>
                    </div>
                  ) : (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditName();
                      }}
                      className="group/name inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span className="text-[13px] font-semibold text-foreground/85 group-hover/name:text-foreground transition-colors">
                        {displayName}
                      </span>
                      <Pencil className="size-2.5 text-muted-foreground/30 opacity-0 group-hover/name:opacity-100 transition-opacity" />
                    </span>
                  )}
                </div>

                {/* Collapse arrow */}
                <motion.div
                  initial={{ opacity: 0, y: -2 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="shrink-0 size-6 rounded-full flex items-center justify-center hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
                >
                  <ChevronUp className="size-3.5 text-muted-foreground/50" />
                </motion.div>
              </div>

              {/* ── Expandable content ── */}
              <div className="pt-2" onClick={(e) => e.stopPropagation()}>
                {/* Avatar picker */}
                <AnimatePresence>
                  {avatarPickerOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="p-1 pb-2.5 flex items-center gap-1.5 flex-wrap">
                        {pickerOptions.map((url) => (
                          <button
                            key={url}
                            onClick={() => setAvatar(url)}
                            className={cn(
                              'size-7 rounded-full overflow-hidden bg-gray-50 dark:bg-gray-800 cursor-pointer transition-all duration-150',
                              'hover:scale-110 active:scale-95',
                              displayAvatar === url
                                ? 'ring-2 ring-sky-400 dark:ring-sky-500 ring-offset-0'
                                : 'hover:ring-1 hover:ring-muted-foreground/30',
                            )}
                          >
                            <img src={url} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
                          </button>
                        ))}
                        <label
                          className={cn(
                            'size-7 rounded-full flex items-center justify-center cursor-pointer transition-all duration-150 border border-dashed',
                            'hover:scale-110 active:scale-95',
                            isCustomAvatar(avatar)
                              ? 'ring-2 ring-sky-400 dark:ring-sky-500 ring-offset-0 border-sky-300 dark:border-sky-600 bg-sky-50 dark:bg-sky-900/30'
                              : 'border-muted-foreground/30 text-muted-foreground/50 hover:border-muted-foreground/50',
                          )}
                          onClick={() => avatarInputRef.current?.click()}
                          title={t('profile.uploadAvatar')}
                        >
                          <ImagePlus className="size-3" />
                        </label>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Bio */}
                <UITextarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder={t('profile.bioPlaceholder')}
                  maxLength={200}
                  rows={2}
                  className="resize-none border-border/40 bg-transparent min-h-[72px] !text-[13px] !leading-relaxed placeholder:!text-[11px] placeholder:!leading-relaxed focus-visible:ring-1 focus-visible:ring-border/60"
                />

                {/* Global Grade Settings */}
                <div className="pt-2 border-t border-border/40 mt-1 flex gap-2">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold text-muted-foreground block">
                        Grado Actual
                      </label>
                      {role === 'student' && gradeConfirmed && (
                        <div className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400" title="Usuario Confirmado">
                          <Lock className="w-3 h-3" />
                        </div>
                      )}
                    </div>
                    <select
                      className="w-full text-[13px] bg-slate-50 dark:bg-slate-900 border border-border/40 rounded-lg px-2 py-1.5 outline-none focus:ring-1 ring-sky-400 disabled:opacity-60 disabled:cursor-not-allowed"
                      value={grade}
                      onChange={(e) => setGrade(e.target.value)}
                      disabled={role === 'student' && gradeConfirmed}
                    >

                      <optgroup label="Básica Media">
                        <option value="5º Grado de EGB">5º Grado de EGB</option>
                        <option value="6º Grado de EGB">6º Grado de EGB</option>
                        <option value="7º Grado de EGB">7º Grado de EGB</option>
                      </optgroup>
                      <optgroup label="Básica Superior">
                        <option value="8º Grado de EGB">8º Grado de EGB</option>
                        <option value="9º Grado de EGB">9º Grado de EGB</option>
                        <option value="10º Grado de EGB">10º Grado de EGB</option>
                      </optgroup>
                      <optgroup label="Bachillerato">
                        <option value="1º de Bachillerato">1º de Bachillerato</option>
                        <option value="2º de Bachillerato">2º de Bachillerato</option>
                        <option value="3º de Bachillerato">3º de Bachillerato</option>
                      </optgroup>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                      Nivel de Inglés
                    </label>
                    <select
                      className="w-full text-[13px] bg-slate-50 dark:bg-slate-900 border border-border/40 rounded-lg px-2 py-1.5 outline-none focus:ring-1 ring-sky-400 disabled:opacity-60 disabled:cursor-not-allowed"
                      value={englishLevel}
                      onChange={(e) => setEnglishLevel(e.target.value)}
                      disabled
                      title="El nivel de inglés avanza automáticamente según tu progreso."
                    >
                      <option value="A1">A1 Beginner</option>
                      <option value="A2">A2 Elementary</option>
                      <option value="B1">B1 Intermediate</option>
                      <option value="B2">B2 Upper Interm.</option>
                      <option value="C1">C1 Advanced</option>
                      <option value="C2">C2 Mastery</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Classroom Card — clean, minimal style ──────────────────────
function ClassroomCard({
  classroom,
  slide,
  formatDate,
  onDelete,
  confirmingDelete,
  onConfirmDelete,
  onCancelDelete,
  onClick,
  isGlobal,
  isAdmin,
  globalAuthor,
  globalSubject,
  globalStatus,
}: {
  classroom: StageListItem;
  slide?: Slide;
  formatDate: (ts: number) => string;
  onDelete?: (id: string, e: React.MouseEvent) => void;
  confirmingDelete?: boolean;
  onConfirmDelete?: () => void;
  onCancelDelete?: () => void;
  onClick: () => void;
  isGlobal?: boolean;
  isAdmin?: boolean;
  globalAuthor?: string;
  globalSubject?: string;
  globalStatus?: 'building' | 'completed';
}) {
  const { t } = useI18n();
  const thumbRef = useRef<HTMLDivElement>(null);
  const [thumbWidth, setThumbWidth] = useState(0);

  useEffect(() => {
    const el = thumbRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setThumbWidth(Math.round(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="group cursor-pointer" onClick={confirmingDelete ? undefined : onClick}>
      {/* Thumbnail — large radius, no border, subtle bg */}
      <div
        ref={thumbRef}
        className="relative w-full aspect-[16/9] rounded-2xl bg-slate-100 dark:bg-slate-800/80 overflow-hidden transition-transform duration-200 group-hover:scale-[1.02]"
      >
        {isGlobal && globalStatus === 'building' && (
          <div className="absolute top-2 left-2 z-10">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100/90 dark:bg-amber-900/80 backdrop-blur-sm px-2.5 py-1 text-[10px] font-bold text-amber-800 dark:text-amber-200 uppercase tracking-widest shadow-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              Construyendo
            </span>
          </div>
        )}
        {slide && thumbWidth > 0 ? (
          <ThumbnailSlide
            slide={slide}
            size={thumbWidth}
            viewportSize={slide.viewportSize ?? 1000}
            viewportRatio={slide.viewportRatio ?? 0.5625}
          />
        ) : !slide ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="size-12 rounded-2xl bg-gradient-to-br from-sky-100 to-blue-100 dark:from-sky-900/30 dark:to-blue-900/30 flex items-center justify-center">
              <span className="text-xl opacity-50">📄</span>
            </div>
          </div>
        ) : null}

        {/* Delete — top-right, only on hover */}
        <AnimatePresence>
          {onDelete && !confirmingDelete && (!isGlobal || isAdmin) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Button
                size="icon"
                variant="ghost"
                className="absolute top-2 right-2 size-7 opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 hover:bg-destructive/80 text-white hover:text-white backdrop-blur-sm rounded-full"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(classroom.id, e);
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Inline delete confirmation overlay */}
        <AnimatePresence>
          {confirmingDelete && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/50 backdrop-blur-[6px]"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-[13px] font-medium text-white/90">
                {t('classroom.deleteConfirmTitle')}?
              </span>
              <div className="flex gap-2">
                <button
                  className="px-3.5 py-1 rounded-lg text-[12px] font-medium bg-white/15 text-white/80 hover:bg-white/25 backdrop-blur-sm transition-colors"
                  onClick={onCancelDelete}
                >
                  {t('common.cancel')}
                </button>
                <button
                  className="px-3.5 py-1 rounded-lg text-[12px] font-medium bg-red-500/90 text-white hover:bg-red-500 transition-colors"
                  onClick={onConfirmDelete}
                >
                  {t('classroom.delete')}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Info — outside the thumbnail */}
      <div className="mt-2.5 px-1 flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
          {/* Materia */}
          {isGlobal && globalSubject ? (
            <span className="shrink-0 inline-flex items-center rounded-sm bg-indigo-100 dark:bg-indigo-900/40 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:text-indigo-400">
              {globalSubject}
            </span>
          ) : (
            <span className="shrink-0 inline-flex items-center rounded-sm bg-indigo-100 dark:bg-indigo-900/40 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:text-indigo-400">
              {(!classroom.subject || classroom.subject === 'none') ? 'Libre' : classroom.subject.charAt(0).toUpperCase() + classroom.subject.slice(1)}
            </span>
          )}
          {/* Grado */}
          {classroom.grade && (
            <span className="shrink-0 inline-flex items-center rounded-sm bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-400">
              {classroom.grade}
            </span>
          )}
          {/* Bloque */}
          {(() => {
            const syllabusCtx = getSyllabusContext(classroom.subject, classroom.grade, classroom.topic);
            if (syllabusCtx) {
              return (
                <span className="shrink-0 inline-flex items-center rounded-sm bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400" title={syllabusCtx.unitName}>
                  Bloque {syllabusCtx.block}
                </span>
              );
            }
            return null;
          })()}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <p className="font-semibold text-[14px] truncate text-foreground/90 min-w-0">
              {classroom.name}
            </p>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            sideOffset={4}
            className="!max-w-[min(90vw,32rem)] break-words whitespace-normal"
          >
            <div className="flex items-center gap-1.5">
              <span className="break-all">{classroom.name}</span>
              <button
                className="shrink-0 p-0.5 rounded hover:bg-foreground/10 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(classroom.name);
                  toast.success(t('classroom.nameCopied'));
                }}
              >
                <Copy className="size-3 opacity-60" />
              </button>
            </div>
          </TooltipContent>
        </Tooltip>

        {classroom.topic && classroom.topic !== 'LIBRE' && (
          <p className="text-[11px] text-muted-foreground truncate leading-snug" title={classroom.topic}>
            {classroom.topic}
          </p>
        )}
        
        {/* Extra info for local cards */}
        {!isGlobal && (
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70 mt-0.5">
            <span>{classroom.sceneCount} {t('classroom.slides')}</span>
            <span>·</span>
            <span>{formatDate(classroom.updatedAt)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return <HomePage />;
}

// ─── Classroom List Row — for global library ──────────────────────
function ClassroomListRow({
  classroom,
  slide,
  formatDate,
  onDelete,
  confirmingDelete,
  onConfirmDelete,
  onCancelDelete,
  onClick,
  isAdmin,
  globalAuthor,
  globalStatus,
}: {
  classroom: StageListItem;
  slide?: Slide;
  formatDate: (ts: number) => string;
  onDelete: (id: string, e: React.MouseEvent) => void;
  confirmingDelete: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onClick: () => void;
  isAdmin?: boolean;
  globalAuthor?: string;
  globalStatus?: 'building' | 'completed';
}) {
  const { t } = useI18n();
  const thumbRef = useRef<HTMLDivElement>(null);
  const [thumbWidth, setThumbWidth] = useState(0);

  useEffect(() => {
    const el = thumbRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setThumbWidth(Math.round(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div 
      className="group relative flex items-center gap-4 p-3 rounded-2xl bg-white dark:bg-slate-800/60 border border-border/40 hover:border-sky-500/30 hover:bg-sky-50/50 dark:hover:bg-sky-900/10 cursor-pointer transition-all shadow-sm hover:shadow-md h-[88px]"
      onClick={confirmingDelete ? undefined : onClick}
    >
      {/* Thumbnail */}
      <div
        ref={thumbRef}
        className="relative shrink-0 w-28 h-full rounded-xl bg-slate-100 dark:bg-slate-900 overflow-hidden"
      >
        {globalStatus === 'building' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <span className="text-[9px] font-bold text-white tracking-widest uppercase">
              Construyendo
            </span>
          </div>
        )}
        {slide && thumbWidth > 0 ? (
          <ThumbnailSlide
            slide={slide}
            size={thumbWidth}
            viewportSize={slide.viewportSize ?? 1000}
            viewportRatio={slide.viewportRatio ?? 0.5625}
          />
        ) : !slide ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="size-8 rounded-lg bg-gradient-to-br from-sky-100 to-blue-100 dark:from-sky-900/30 dark:to-blue-900/30 flex items-center justify-center">
              <span className="text-sm opacity-50">📄</span>
            </div>
          </div>
        ) : null}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
        <div className="flex flex-wrap items-center gap-1.5 mb-1">
          {/* Materia */}
          <span className="shrink-0 inline-flex items-center rounded-sm bg-indigo-100 dark:bg-indigo-900/40 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:text-indigo-400">
            {(!classroom.subject || classroom.subject === 'none') ? 'Libre' : classroom.subject.charAt(0).toUpperCase() + classroom.subject.slice(1)}
          </span>
          {/* Grado */}
          {classroom.grade && (
            <span className="shrink-0 inline-flex items-center rounded-sm bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-400">
              {classroom.grade}
            </span>
          )}
          {/* Bloque */}
          {(() => {
            const syllabusCtx = getSyllabusContext(classroom.subject, classroom.grade, classroom.topic);
            if (syllabusCtx) {
              return (
                <span className="shrink-0 inline-flex items-center rounded-sm bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400" title={syllabusCtx.unitName}>
                  Bloque {syllabusCtx.block}
                </span>
              );
            }
            return null;
          })()}
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <p className="font-semibold text-[14px] truncate text-foreground/90 min-w-0">
              {classroom.name}
            </p>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            sideOffset={4}
            className="!max-w-[min(90vw,32rem)] break-words whitespace-normal"
          >
            <div className="flex items-center gap-1.5">
              <span className="break-all">{classroom.name}</span>
              <button
                className="shrink-0 p-0.5 rounded hover:bg-foreground/10 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(classroom.name);
                  toast.success(t('classroom.nameCopied'));
                }}
              >
                <Copy className="size-3 opacity-60" />
              </button>
            </div>
          </TooltipContent>
        </Tooltip>

        {classroom.topic && classroom.topic !== 'LIBRE' && (
          <p className="text-[11px] text-muted-foreground truncate leading-snug mb-0.5" title={classroom.topic}>
            {classroom.topic}
          </p>
        )}
        
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground/80">
          <span className="truncate max-w-[120px] font-medium text-sky-600 dark:text-sky-400">
            {globalAuthor}
          </span>
          <span>·</span>
          <span>{classroom.sceneCount} {t('classroom.slides')}</span>
          <span>·</span>
          <span>{formatDate(classroom.createdAt)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="shrink-0 flex items-center justify-end w-8">
        <AnimatePresence>
          {!confirmingDelete && isAdmin && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Button
                size="icon"
                variant="ghost"
                className="size-8 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-full"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(classroom.id, e);
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Inline delete confirmation overlay */}
      <AnimatePresence>
        {confirmingDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 z-20 flex items-center justify-between px-4 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-2xl border border-destructive/20"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-[13px] font-medium text-destructive">
              {t('classroom.deleteConfirmTitle')}?
            </span>
            <div className="flex gap-2">
              <button
                className="px-3.5 py-1.5 rounded-lg text-[12px] font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                onClick={onCancelDelete}
              >
                {t('common.cancel')}
              </button>
              <button
                className="px-3.5 py-1.5 rounded-lg text-[12px] font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
                onClick={onConfirmDelete}
              >
                {t('classroom.delete')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
