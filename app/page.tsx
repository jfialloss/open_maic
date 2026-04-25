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
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { useAuth } from '@/lib/hooks/use-auth';
import { auth, db as firestoreDb } from '@/lib/firebase';
import { collection, query, orderBy, limit, getDocs, deleteDoc, doc } from 'firebase/firestore';
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
import syllabusDataRaw from '@/lib/data/syllabus.json';

const syllabusData = syllabusDataRaw as any;

const log = createLogger('Home');

const WEB_SEARCH_STORAGE_KEY = 'webSearchEnabled';
const LANGUAGE_STORAGE_KEY = 'generationLanguage';
const RECENT_OPEN_STORAGE_KEY = 'recentClassroomsOpen';

interface FormState {
  pdfFile: File | null;
  requirement: string;
  language: 'en-US' | 'es-ES';
  webSearch: boolean;
  deepInteraction: boolean;
  subject: string;
  topic?: string;
}

const initialFormState: FormState = {
  pdfFile: null,
  requirement: '',
  language: 'es-ES',
  webSearch: false,
  deepInteraction: false,
  subject: 'none',
  topic: undefined,
};

function getSublevelFromGrade(grade: string): string | null {
  if (['Inicial 1', 'Inicial 2'].includes(grade)) return 'Educación Inicial';
  if (['1º Grado de EGB'].includes(grade)) return 'Preparatoria';
  if (['2º Grado de EGB', '3º Grado de EGB', '4º Grado de EGB'].includes(grade)) return 'Básica Elemental';
  if (['5º Grado de EGB', '6º Grado de EGB', '7º Grado de EGB'].includes(grade)) return 'Básica Media';
  if (['8º Grado de EGB', '9º Grado de EGB', '10º Grado de EGB'].includes(grade)) return 'Básica Superior';
  if (['1º de Bachillerato', '2º de Bachillerato', '3º de Bachillerato'].includes(grade)) return 'Bachillerato';
  return null;
}

function getSyllabusContext(subject?: string, grade?: string, topic?: string) {
  if (!subject || subject === 'none' || !grade || !topic || topic === 'LIBRE') return null;
  const mappedSubject = subject === 'matematicas' ? 'Matemática' : subject === 'ciencias' ? 'Ciencias Naturales' : subject === 'lengua' ? 'Lengua y Literatura' : 'Ciencias Sociales';
  const mappedSublevel = getSublevelFromGrade(grade);
  if (!mappedSublevel) return null;
  
  const subjectData = syllabusData[mappedSubject]?.[mappedSublevel];
  if (!subjectData) return null;
  
  let unitIndex = 0;
  for (const [unitName, unitData] of Object.entries(subjectData)) {
    const uData = unitData as any;
    if (uData.temas && uData.temas.includes(topic)) {
      return { unitName, block: unitIndex + 1 };
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

  // Draft cache for requirement text
  const { cachedValue: cachedRequirement, updateCache: updateRequirementCache } =
    useDraftCache<string>({ key: 'requirementDraft' });

  // Model setup state
  const currentModelId = useSettingsStore((s) => s.modelId);
  const masteredTopics = useUserProfileStore((s) => s.masteredTopics);
  const activeCourses = useUserProfileStore((s) => s.activeCourses);
  const globalGrade = useUserProfileStore((s) => s.grade);
  const mappedSublevel = getSublevelFromGrade(globalGrade);
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
      const savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      const updates: Partial<FormState> = {};
      if (savedWebSearch === 'true') updates.webSearch = true;
      if (savedLanguage === 'en-US' || savedLanguage === 'es-ES') {
        updates.language = savedLanguage;
      } else {
        const detected = navigator.language?.startsWith('en') ? 'en-US' : 'es-ES';
        updates.language = detected;
      }
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
  const [error, setError] = useState<string | null>(null);
  const [classrooms, setClassrooms] = useState<StageListItem[]>([]);
  const [globalClassrooms, setGlobalClassrooms] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'local' | 'global' | 'progress'>('local');
  const [globalFilter, setGlobalFilter] = useState<'all' | 'mine' | 'community'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [loadingGlobal, setLoadingGlobal] = useState(false);
  const [thumbnails, setThumbnails] = useState<Record<string, Slide>>({});
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingDeleteGlobalId, setPendingDeleteGlobalId] = useState<string | null>(null);
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

  useEffect(() => {
    if (activeTab === 'global' && globalClassrooms.length === 0) {
      setLoadingGlobal(true);
      const q = query(collection(firestoreDb, 'global_classrooms'), orderBy('createdAtTime', 'desc'), limit(50));
      getDocs(q).then((snap) => {
        const items = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
        setGlobalClassrooms(items);
        setLoadingGlobal(false);
      }).catch(e => {
        log.error('Failed to load global classrooms:', e);
        setLoadingGlobal(false);
      });
    }
  }, [activeTab]);

  // Validate pending cloud courses to ensure they still exist in the cloud
  useEffect(() => {
    if (!storeHydrated || !activeCourses) return;
    
    const pendingCloud = Object.values(activeCourses).filter(
      (ac) => !classrooms.some((c) => c.id === ac.stageId) && !masteredTopics.includes(ac.topic)
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
      } catch (e) {
        log.error('Failed to validate pending cloud courses:', e);
      }
    };
    
    validateCloud();
  }, [storeHydrated, activeCourses, classrooms, masteredTopics]);

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
                   await publishStageToCloud(gc.id, 'system', 'Docente NEWMAN', fullData.stage.subject);
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
        await deleteDoc(doc(firestoreDb, 'global_classrooms', id));
      } catch (e) {}

      await loadClassrooms();
    } catch (err) {
      log.error('Failed to delete classroom:', err);
      toast.error('Failed to delete classroom');
    }
  };

  const confirmDeleteGlobal = async (id: string) => {
    setPendingDeleteGlobalId(null);
    try {
      await deleteDoc(doc(firestoreDb, 'global_classrooms', id));
      setGlobalClassrooms((prev) => prev.filter((gc) => gc._id !== id));
      toast.success('Curso global eliminado');
    } catch (err) {
      log.error('Failed to delete global classroom:', err);
      toast.error('Error al eliminar curso de la nube');
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
    if (form.subject && form.subject !== 'none') {
      try {
        const { findSimilarGlobalClassroom } = await import('@/lib/utils/cloud-sync');
        const similarClassroom = await findSimilarGlobalClassroom(form.subject, form.requirement);
        if (similarClassroom) {
          if (similarClassroom.status === 'building') {
            window.alert(
              `¡Espera! Un tutor está construyendo un curso sobre este tema en este momento ("${similarClassroom.stage?.name}").\n\nPor favor, revisa la Biblioteca Global en unos minutos para clonarlo sin gastar créditos.`
            );
            return;
          }

          // Alert user of similarity
          const proceed = window.confirm(
            `¡Alto! Hemos detectado un curso creado previamente por un tutor en la Biblioteca Global que encaja con este tema:\n\n"${similarClassroom.stage?.name}"\n\n¿Cancelas esta generación para buscarlo gratis en la Biblioteca Global (Cancelar), o fuerzas crear uno nuevo gastando créditos (Aceptar)?`
          );
          if (!proceed) {
            return; // Cancel execution
          }
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
        personaHint = `\n\n[System Note: The TTS voice selected for the AI teacher is "${settings.ttsVoice}". Analyze this voice ID to determine the appropriate gender/persona, and ensure all generated scripts, introductions, and pronouns align with it (e.g., do not present as female if using a male voice).]`;
      }

      let curriculumContext = '';
      if (form.subject && form.subject !== 'none') {
        try {
          const res = await fetch(`/curriculums/${form.subject}.txt`);
          if (res.ok) {
            const rawBody = await res.text();
            curriculumContext = `\n\n[CONTEXTO NORMATIVO - CURRICULO DEL MINISTERIO DE EDUCACION]:\nLa asignatura de esta clase es "${form.subject.toUpperCase()}". A continuacion se anexa el documento del currículo oficial:\n\n${rawBody}\n\n[INSTRUCCION ESTRATEGICA]: Tienes la VENTAJA arquitectonica de poseer todo el curriculo insertado en el contexto. Debes asegurar obligatoriamente que la estructura de la clase y el contenido academico esten estrechamente alineados con las Destrezas con Criterio de Desempeno y objetivos mencionados en el curriculo adjunto.`;
          }
        } catch (e) {
          log.error('Failed to fetch curriculum context:', e);
        }
      }

      let deepInteractionHint = '';
      if (form.deepInteraction) {
        deepInteractionHint = `\n\n[INSTRUCCIÓN CRÍTICA DE INTERACCIÓN PROFUNDA]: Se ha habilitado la Interacción Profunda. DEBES PLANIFICAR EL CURSO DE FORMA NORMAL (Introducción, Desarrollo con variedad de formatos, Conclusión). SIN EMBARGO, OBLIGATORIAMENTE DEBES INCLUIR UNA escena central de type: "interactive" (NO de tipo "slide") para contener una simulación interactiva HTML compleja sobre el tema central. El resto del curso debe usar el tipo de escena "slide".`;
      }

      const requirements: UserRequirements = {
        requirement: form.requirement + personaHint + curriculumContext + deepInteractionHint,
        language: form.language,
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
      {/* ═══ Top-right pill (unchanged) ═══ */}
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
          classrooms.length === 0 ? 'justify-center min-h-[calc(100dvh-8rem)]' : 'mt-[10vh]',
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
            <div className="relative z-20 flex items-start justify-between">
              <GreetingBar />
              <div className="pr-3 pt-3.5 shrink-0">
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
              {form.subject !== 'none' && syllabusData[form.subject === 'matematicas' ? 'Matemática' : form.subject === 'ciencias' ? 'Ciencias Naturales' : form.subject === 'lengua' ? 'Lengua y Literatura' : 'Ciencias Sociales'] && (
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
                    <FileText className="size-3.5" /> Temario Oficial ({form.subject === 'matematicas' ? 'Matemática' : form.subject === 'ciencias' ? 'Ciencias Naturales' : form.subject === 'lengua' ? 'Lengua y Literatura' : 'Ciencias Sociales'} - {globalGrade})
                  </p>
                </div>
                {mappedSublevel && syllabusData[form.subject === 'matematicas' ? 'Matemática' : form.subject === 'ciencias' ? 'Ciencias Naturales' : form.subject === 'lengua' ? 'Lengua y Literatura' : 'Ciencias Sociales']?.[mappedSublevel] && (
                  <div className="flex flex-col gap-4 mt-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                    {Object.entries(syllabusData[form.subject === 'matematicas' ? 'Matemática' : form.subject === 'ciencias' ? 'Ciencias Naturales' : form.subject === 'lengua' ? 'Lengua y Literatura' : 'Ciencias Sociales'][mappedSublevel]).map(([unitName, unitData]: [string, any], unitIndex) => (
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
                          {unitData.temas.map((topic: string, i: number) => {
                            const isMastered = masteredTopics?.includes(topic) || false;
                            const prefix = `${unitIndex + 1}.${i + 1}`;
                            const inProgressClassroom = !isMastered ? classrooms.find((c) => c.topic === topic || c.name === topic) : null;
                            return (
                              <button
                                key={topic}
                                onClick={() => {
                                  if (inProgressClassroom) {
                                    if (window.confirm(`Tienes un curso a medias sobre este tema.\n¿Deseas continuar donde te quedaste en lugar de crear uno nuevo?`)) {
                                      router.push(`/classroom/${inProgressClassroom.id}`);
                                    }
                                    return;
                                  }
                                  // Injecting topic and its objective to help the AI structure the class better
                                  const humanPrompt = `Quiero que me des una clase sobre el tema: "${topic}".\nEl objetivo de aprendizaje principal debe ser: "${unitData.objetivos ? unitData.objetivos[0] : ''}".`;
                                  updateForm('requirement', humanPrompt);
                                  updateForm('topic', topic);
                                }}
                                className={cn(
                                  "w-full text-[12px] px-3 py-2 rounded-lg border transition-all flex items-start gap-2 hover:shadow-sm active:scale-[0.99] text-left group",
                                  isMastered 
                                    ? "bg-emerald-50/70 text-emerald-800 border-emerald-200/60 dark:bg-emerald-950/20 dark:text-emerald-300 dark:border-emerald-800/50" 
                                    : inProgressClassroom
                                    ? "bg-amber-50/70 text-amber-900 border-amber-200/80 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/60"
                                    : "bg-white text-slate-700 border-slate-200 hover:border-sky-300 hover:bg-sky-50/50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:border-sky-700 dark:hover:bg-slate-800/80"
                                )}
                              >
                                {isMastered ? (
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
                                
                                {isMastered ? (
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
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
          className="relative z-10 mt-6 w-full max-w-6xl flex flex-col items-center"
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
                  className={cn("px-2 py-0.5 rounded-sm transition-colors cursor-pointer", activeTab === 'local' ? "bg-white dark:bg-slate-800 shadow-sm text-foreground" : "text-muted-foreground")}
                  onClick={() => setActiveTab('local')}
                >
                  Mis Cursos Locales
                </button>
                <button
                  className={cn("px-2 py-0.5 rounded-sm transition-colors cursor-pointer flex items-center gap-1", activeTab === 'global' ? "bg-white dark:bg-slate-800 shadow-sm text-sky-600 dark:text-sky-400" : "text-muted-foreground")}
                  onClick={() => setActiveTab('global')}
                >
                  Biblioteca Global
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
                  {/* Left Side: Tabs if global, empty if local to keep right side aligned */}
                  {activeTab === 'global' ? (
                    <div className="flex bg-muted/40 p-1 rounded-lg border border-border/40 gap-1 shrink-0">
                      <button
                        className={cn("px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors cursor-pointer", globalFilter === 'all' ? "bg-white dark:bg-slate-800 shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
                        onClick={() => setGlobalFilter('all')}
                      >
                        Todos
                      </button>
                      <button
                        className={cn("px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors cursor-pointer", globalFilter === 'mine' ? "bg-white dark:bg-slate-800 shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
                        onClick={() => setGlobalFilter('mine')}
                      >
                        Míos
                      </button>
                      <button
                        className={cn("px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors cursor-pointer", globalFilter === 'community' ? "bg-white dark:bg-slate-800 shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
                        onClick={() => setGlobalFilter('community')}
                      >
                        De la Comunidad
                      </button>
                    </div>
                  ) : (
                    <div className="hidden sm:block" />
                  )}

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
                          if (activeTab === 'global') {
                            globalClassrooms.forEach(gc => {
                              subjects.add((!gc.subject || gc.subject === 'none') ? 'Libre' : gc.subject);
                            });
                          } else {
                            classrooms.forEach(c => {
                              subjects.add((!c.subject || c.subject === 'none') ? 'Libre' : c.subject);
                            });
                          }
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
                <div className={activeTab === 'local' ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-8 pt-8" : activeTab === 'progress' ? "w-full pt-6" : "flex flex-col w-full gap-8 pt-4"}>
                  {activeTab === 'progress' ? (
                    <div className="flex flex-col gap-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="size-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                          <Award className="size-5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                          <h2 className="text-lg font-bold text-foreground leading-tight">Tu Progreso Académico</h2>
                          <p className="text-sm text-muted-foreground mt-0.5">Nivel: {globalGrade} ({mappedSublevel})</p>
                        </div>
                      </div>

                      {mappedSublevel && ['Matemática', 'Ciencias Naturales', 'Lengua y Literatura', 'Ciencias Sociales'].map(subject => {
                        const subjectData = syllabusData[subject]?.[mappedSublevel];
                        if (!subjectData) return null;
                        
                        let totalTopics = 0;
                        let mCount = 0;
                        const units = Object.entries(subjectData);

                        units.forEach(([_, uData]: any) => {
                          totalTopics += uData.temas.length;
                          uData.temas.forEach((t: string) => {
                            if (masteredTopics?.includes(t)) mCount++;
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
                              {units.map(([uName, uData]: any, uIdx) => (
                                <div key={uName} className="flex flex-col gap-2">
                                  <h4 className="text-[12px] font-bold text-slate-600 dark:text-slate-300 leading-tight">
                                    Bloque {uIdx + 1}: {uName.split(': ')[1] || uName}
                                  </h4>
                                  <div className="flex flex-col gap-1.5">
                                    {uData.temas.map((t: string, tIdx: number) => {
                                      const isMastered = masteredTopics?.includes(t);
                                      const inProgressClassroom = !isMastered ? classrooms.find((c) => c.topic === t || c.name === t) : null;
                                      return (
                                        <div 
                                          key={t} 
                                          onClick={() => {
                                            if (inProgressClassroom) {
                                              router.push(`/classroom/${inProgressClassroom.id}`);
                                            }
                                          }}
                                          className={cn("text-[11px] flex items-start gap-1.5 p-1.5 rounded-md transition-colors", inProgressClassroom ? "cursor-pointer" : "", isMastered ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300" : inProgressClassroom ? "bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-300 hover:bg-amber-100/60 dark:hover:bg-amber-900/40" : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50")}
                                        >
                                          {isMastered ? <Check className="size-3.5 shrink-0 mt-[1px]" /> : inProgressClassroom ? <Clock className="size-3.5 shrink-0 mt-[1px] text-amber-600 dark:text-amber-400" /> : <div className="size-3 shrink-0 rounded-full border border-slate-300 dark:border-slate-600 mt-0.5" />}
                                          <span className="leading-snug flex-1">{t}</span>
                                          {inProgressClassroom && <span className="shrink-0 text-[9px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide mt-[2px]">En Curso</span>}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : activeTab === 'local' ? (
                    (() => {
                      let filtered = [...classrooms];

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

                      if (classrooms.length === 0) {
                        return <div className="col-span-full py-8 text-center text-muted-foreground text-sm">No tienes cursos locales aún.</div>;
                      }

                      if (filtered.length === 0) {
                        return <div className="col-span-full py-8 text-center text-muted-foreground text-sm">No se encontraron cursos con este filtro.</div>;
                      }

                      const localCourseCards = filtered.map((classroom, i) => (
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

                      const pendingCloud = Object.values(activeCourses || {}).filter(
                        (ac) => !classrooms.some((c) => c.id === ac.stageId) && !masteredTopics.includes(ac.topic)
                      );

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
                                    </motion.div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          
                          {localCourseCards.length > 0 && (
                            <div className="flex flex-col gap-4 mt-2">
                              {pendingCloud.length > 0 && (
                                <h3 className="text-lg font-semibold text-foreground/90 border-b border-border/40 pb-2">
                                  Cursos Descargados
                                </h3>
                              )}
                              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-8">
                                {localCourseCards}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()
                  ) : loadingGlobal ? (
                    <div className="col-span-full py-8 text-center text-muted-foreground text-sm">Cargando biblioteca global...</div>
                  ) : globalClassrooms.length === 0 ? (
                    <div className="col-span-full py-8 text-center text-muted-foreground text-sm">No hay cursos en la biblioteca global aún.</div>
                  ) : (() => {
                    const now = Date.now();
                    const TWO_HOURS = 2 * 60 * 60 * 1000;

                    let filtered = globalClassrooms.filter((gc) => {
                      // Ocultar cascarones a los no-administradores
                      if (gc.status === 'building' && role !== 'admin') {
                        return false;
                      }

                      // Limpieza Global (Garbage Collection Visual)
                      // Ocultar cursos "Construyendo" que lleven más de 2 horas
                      if (gc.status === 'building' && (now - (gc.createdAtTime || 0)) > TWO_HOURS) {
                        return false;
                      }

                      
                      if (globalFilter === 'mine') return gc.createdBy === user?.uid;
                      if (globalFilter === 'community') return gc.createdBy !== user?.uid;
                      return true;
                    });

                    // Búsqueda
                    if (searchQuery.trim()) {
                      const q = searchQuery.toLowerCase();
                      filtered = filtered.filter(gc => {
                        const name = (gc.stage?.name || 'Untitled').toLowerCase();
                        const author = (gc.authorNickname || '').toLowerCase();
                        return name.includes(q) || author.includes(q);
                      });
                    }

                    // Filtro de Categoría
                    if (categoryFilter !== 'all') {
                      filtered = filtered.filter(gc => {
                        const subj = (!gc.subject || gc.subject === 'none') ? 'Libre' : gc.subject;
                        return subj === categoryFilter;
                      });
                    }

                    // Ordenamiento (Global Classrooms ya vienen ordenados DESC desde Firebase, pero podemos reordenarlos)
                    filtered = [...filtered].sort((a, b) => {
                      const timeA = a.createdAtTime || 0;
                      const timeB = b.createdAtTime || 0;
                      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
                    });

                    if (filtered.length === 0) {
                      return <div className="col-span-full py-8 text-center text-muted-foreground text-sm">No se encontraron cursos con este filtro.</div>;
                    }
                    
                    // Group by subject
                    const grouped = filtered.reduce((acc, gc) => {
                      const subject = (!gc.subject || gc.subject === 'none') ? 'Libre' : gc.subject;
                      if (!acc[subject]) acc[subject] = [];
                      acc[subject].push(gc);
                      return acc;
                    }, {} as Record<string, typeof filtered>);

                    // Sort subjects alphabetically, but maybe put 'Libre' at the end
                    const subjects = Object.keys(grouped).sort((a, b) => {
                      if (a === 'Libre') return 1;
                      if (b === 'Libre') return -1;
                      return a.localeCompare(b);
                    });

                    return (
                      <div className="flex flex-col w-full gap-10">
                        {subjects.map(subject => (
                          <div key={subject} className="flex flex-col gap-4">
                            <h3 className="text-lg font-semibold text-foreground/90 border-b border-border/40 pb-2">
                              {subject.charAt(0).toUpperCase() + subject.slice(1)}
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {grouped[subject].map((gc: any, i: number) => (
                                <motion.div
                                  key={gc._id}
                                  initial={{ opacity: 0, y: 16 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: i * 0.04, duration: 0.35, ease: 'easeOut' }}
                                >
                                  <ClassroomListRow
                                    classroom={{
                                      id: gc._id,
                                      name: gc.stage?.name || 'Untitled',
                                      sceneCount: gc.scenes?.length || 0,
                                      subject: gc.subject,
                                      grade: gc.stage?.grade,
                                      topic: gc.stage?.topic,
                                      createdAt: gc.createdAtTime || 0,
                                      updatedAt: gc.createdAtTime || 0,
                                    }}
                                    slide={gc.scenes?.find((s: any) => s.content?.type === 'slide')?.content?.canvas}
                                    globalAuthor={gc.authorNickname}
                                    globalStatus={gc.status}
                                    isAdmin={role === 'admin'}
                                    formatDate={formatDate}
                                    onDelete={(id, e) => {
                                      e.stopPropagation();
                                      setPendingDeleteGlobalId(id);
                                    }}
                                    confirmingDelete={pendingDeleteGlobalId === gc._id}
                                    onConfirmDelete={() => confirmDeleteGlobal(gc._id)}
                                    onCancelDelete={() => setPendingDeleteGlobalId(null)}
                                    onClick={async () => {
                                      toast.loading('Clonando curso desde la nube...', { id: gc._id });
                                      try {
                                        const { processCloudDownload } = await import('@/lib/utils/cloud-sync');
                                        await processCloudDownload(gc._id, gc);
                                        toast.success('Clonación completa', { id: gc._id });
                                        router.push(`/classroom/${gc._id}`);
                                      } catch (e) {
                                        log.error('Fallo al clonar curso', e);
                                        toast.error('Fallo al clonar curso', { id: gc._id });
                                      }
                                    }}
                                  />
                                </motion.div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
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
  const { user } = useAuth();
  const avatar = useUserProfileStore((s) => s.avatar);
  const nickname = useUserProfileStore((s) => s.nickname);
  const bio = useUserProfileStore((s) => s.bio);
  const grade = useUserProfileStore((s) => s.grade);
  const setAvatar = useUserProfileStore((s) => s.setAvatar);
  const setNickname = useUserProfileStore((s) => s.setNickname);
  const setBio = useUserProfileStore((s) => s.setBio);
  const setGrade = useUserProfileStore((s) => s.setGrade);

  const [open, setOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const displayName = nickname || user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || t('profile.defaultNickname');
  const displayAvatar = (avatar === AVATAR_OPTIONS[0] && user?.photoURL) ? user.photoURL : avatar;

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
                <img src={displayAvatar} alt="" className="size-full object-cover" />
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
                      <span className="text-[10px] font-medium text-sky-600 dark:text-sky-400 group-hover:text-sky-700 dark:group-hover:text-sky-300 transition-colors leading-none">
                        {grade}
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
                    <img src={displayAvatar} alt="" className="size-full object-cover" />
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
                        {AVATAR_OPTIONS.map((url) => (
                          <button
                            key={url}
                            onClick={() => setAvatar(url)}
                            className={cn(
                              'size-7 rounded-full overflow-hidden bg-gray-50 dark:bg-gray-800 cursor-pointer transition-all duration-150',
                              'hover:scale-110 active:scale-95',
                              avatar === url
                                ? 'ring-2 ring-sky-400 dark:ring-sky-500 ring-offset-0'
                                : 'hover:ring-1 hover:ring-muted-foreground/30',
                            )}
                          >
                            <img src={url} alt="" className="size-full" />
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
                <div className="pt-2 border-t border-border/40 mt-1">
                  <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                    Grado Académico Actual
                  </label>
                  <select
                    className="w-full text-[13px] bg-slate-50 dark:bg-slate-900 border border-border/40 rounded-lg px-2 py-1.5 outline-none focus:ring-1 ring-sky-400"
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                  >
                    <optgroup label="Educación Inicial">
                      <option value="Inicial 1">Inicial 1</option>
                      <option value="Inicial 2">Inicial 2</option>
                    </optgroup>
                    <optgroup label="Preparatoria">
                      <option value="1º Grado de EGB">1º Grado de EGB</option>
                    </optgroup>
                    <optgroup label="Básica Elemental">
                      <option value="2º Grado de EGB">2º Grado de EGB</option>
                      <option value="3º Grado de EGB">3º Grado de EGB</option>
                      <option value="4º Grado de EGB">4º Grado de EGB</option>
                    </optgroup>
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
  onDelete: (id: string, e: React.MouseEvent) => void;
  confirmingDelete: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
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
          {!confirmingDelete && (!isGlobal || isAdmin) && (
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
