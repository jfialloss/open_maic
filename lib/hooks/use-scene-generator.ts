'use client';

import { useCallback, useRef } from 'react';
import { useStageStore } from '@/lib/store/stage';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import { useSettingsStore } from '@/lib/store/settings';
import { db } from '@/lib/utils/database';
import type { SceneOutline, PdfImage, ImageMapping } from '@/lib/types/generation';
import type { AgentInfo } from '@/lib/generation/generation-pipeline';
import type { Scene } from '@/lib/types/stage';
import type { Action, SpeechAction } from '@/lib/types/action';
import type { TTSProviderId } from '@/lib/audio/types';
import { generateMediaForOutlines } from '@/lib/media/media-orchestrator';
import { createLogger } from '@/lib/logger';
import { TTS_PROVIDERS } from '@/lib/audio/constants';

const log = createLogger('SceneGenerator');
const TTS_MAX_TEXT_LENGTH: Partial<Record<TTSProviderId, number>> = {
  'glm-tts': 1024,
};

interface SceneContentResult {
  success: boolean;
  content?: unknown;
  effectiveOutline?: SceneOutline;
  error?: string;
}

interface SceneActionsResult {
  success: boolean;
  scene?: Scene;
  previousSpeeches?: string[];
  error?: string;
}

export function splitLongSpeechText(text: string, maxLength: number): string[] {
  const normalized = text.trim();
  if (!normalized || normalized.length <= maxLength) return [normalized];

  const units = normalized
    .split(/(?<=[。！？!?；;：:\n])/u)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  const pushChunk = (value: string) => {
    const trimmed = value.trim();
    if (trimmed) chunks.push(trimmed);
  };

  const appendUnit = (unit: string) => {
    if (!current) {
      current = unit;
      return;
    }
    if ((current + unit).length <= maxLength) {
      current += unit;
      return;
    }
    pushChunk(current);
    current = unit;
  };

  const hardSplitUnit = (unit: string) => {
    const parts = unit.split(/(?<=[，,、])/u).filter(Boolean);
    if (parts.length > 1) {
      for (const part of parts) {
        if (part.length <= maxLength) appendUnit(part);
        else hardSplitUnit(part);
      }
      return;
    }

    let start = 0;
    while (start < unit.length) {
      appendUnit(unit.slice(start, start + maxLength));
      start += maxLength;
    }
  };

  for (const unit of units.length > 0 ? units : [normalized]) {
    if (unit.length <= maxLength) appendUnit(unit);
    else hardSplitUnit(unit);
  }

  pushChunk(current);
  return chunks;
}

function splitLongSpeechActions(actions: Action[], providerId: TTSProviderId): Action[] {
  const maxLength = TTS_MAX_TEXT_LENGTH[providerId];
  if (!maxLength) return actions;

  let didSplit = false;
  const nextActions: Action[] = actions.flatMap((action) => {
    if (action.type !== 'speech' || !action.text || action.text.length <= maxLength)
      return [action];

    const chunks = splitLongSpeechText(action.text, maxLength);
    if (chunks.length <= 1) return [action];
    didSplit = true;
    const { audioId: _audioId, ...baseAction } = action;

    log.info(
      `Split speech for ${providerId}: action=${action.id}, len=${action.text.length}, chunks=${chunks.length}`,
    );
    return chunks.map((chunk, i) => ({
      ...baseAction,
      id: `${action.id}_tts_${i + 1}`,
      text: chunk,
    }));
  });
  return didSplit ? nextActions : actions;
}

export function inferTeacherVoice(
  agents: AgentInfo[] | undefined,
  providerId: TTSProviderId,
  defaultVoice: string,
  language?: string,
  languageDirective?: string,
): string {
  if (!agents || agents.length === 0) return defaultVoice;

  const teacher = agents.find((a) => a.role === 'teacher');
  if (!teacher || !teacher.persona) return defaultVoice;

  const persona = teacher.persona.toLowerCase();
  const name = teacher.name.toLowerCase();
  
  // Common indicators
  const femaleRegex = /\b(female|mujer|femenina|femenino|chica|profesora|maestra|ella|she|her|hers|mrs|miss|ms|lady|dama|madam|ada|ana|maria|sofia|laura|carmen|rosa|marta|julia|sara|paula|elena|lucia|silvia|clara|emma|mia|olivia|ava|isabella|sophia|charlotte|amelia|evelyn|abigail|harper|emily|elizabeth|avery|ella|madison|scarlett|victoria|aria|grace|chloe|camila|penelope|riley|layla|lillian|nora|zoey|mila|aubrey|hannah|lily|addison|eleanor|natalie|luna|savannah|brooklyn|leah|zoe|stella|hazel|ellie|paisley|audrey|skylar|violet|claire|bella|aurora|lucy|anna|samantha|caroline|genesis|aaliyah|kennedy|kinsley|allison|maya|sarah|madalyn|adeline|alexa|ariana|gabriella|naomi|alice|sadie|hailey|eva|emilia|autumn|quinn|nevaeh|piper|ruby|serenity|willow|everly|cora|kaylee|lydia|aubree|arianna|eliana|peyton|melanie|gianna|isabelle|valentina|nova|vivian|reagan|mackenzie|madeline|brielle|delilah|isla|rylee|katherine|sophie|josephine|ivy|liliana|jade|taylor|hadley|kylie|emery|adalynn|natalia|annabelle|faith|alexandra)\b/i;
  
  const maleRegex = /\b(male|hombre|masculino|chico|profesor|maestro|él|he|him|his|mr|sir|caballero|mister|don|arthur|john|michael|david|james|robert|william|richard|joseph|thomas|charles|christopher|daniel|matthew|anthony|mark|donald|steven|paul|andrew|joshua|kenneth|kevin|brian|george|edward|ronald|timothy|jason|jeffrey|ryan|jacob|gary|nicholas|eric|jonathan|stephen|larry|justin|scott|brandon|benjamin|samuel|gregory|frank|alexander|raymond|patrick|jack|dennis|jerry|tyler|aaron|jose|adam|henry|nathan|douglas|zachary|peter|kyle|walter|ethan|jeremy|christian|keith|roger|terry|gerald|harold|sean|austin|carl|arthur|lawrence|dylan|jesse|jordan|bryan|ralph|albert|roy|alex|wayne|eugene|juan|gabriel|louis|russell|noah|logan|luis)\b/i;

  let targetGender: 'male' | 'female' | 'neutral' | null = null;
  
  // 1. Strongest signal: Avatar filename (OpenMAIC convention: -2.png is female)
  if (teacher.avatar) {
    const avatarStr = teacher.avatar.toLowerCase();
    if (avatarStr.includes('-2.png') || avatarStr.includes('-female')) {
      targetGender = 'female';
    } else if (avatarStr.includes('.png')) {
      targetGender = 'male';
    }
  }
  
  // 2. Fallback to text detection if avatar didn't give a clue
  if (!targetGender) {
    // Detect female
    if (femaleRegex.test(persona) || femaleRegex.test(name)) {
      targetGender = 'female';
    } 
    // Detect male
    else if (maleRegex.test(persona) && !persona.includes('profesora') || maleRegex.test(name)) {
      targetGender = 'male';
    }
  }

  if (!targetGender) return defaultVoice;

  const provider = TTS_PROVIDERS[providerId];
  if (!provider || !provider.voices) return defaultVoice;

  // Determine language priorities based on user input or language directive
  let targetCodes: string[] = [];
  let langPrefix = '';
  
  // Combine both signals, prioritizing the directive since it's the actual output language
  const combinedSignal = `${languageDirective || ''} ${language || ''}`.toLowerCase();
  
  if (combinedSignal) {
    if (combinedSignal.includes('español') || combinedSignal.includes('spanish') || combinedSignal.includes('es')) {
      targetCodes = ['es-us', 'es-419', 'es-mx', 'es-es', 'es'];
      langPrefix = 'es';
    } else if (combinedSignal.includes('inglés') || combinedSignal.includes('ingles') || combinedSignal.includes('english') || combinedSignal.includes('en')) {
      targetCodes = ['en-us', 'en-gb', 'en'];
      langPrefix = 'en';
    } else if (combinedSignal.includes('portugués') || combinedSignal.includes('portugues') || combinedSignal.includes('pt')) {
      targetCodes = ['pt-br', 'pt-pt', 'pt'];
      langPrefix = 'pt';
    } else if (combinedSignal.includes('chino') || combinedSignal.includes('chinese') || combinedSignal.includes('zh')) {
      targetCodes = ['zh-cn', 'zh-tw', 'zh-hk', 'zh'];
      langPrefix = 'zh';
    } else if (combinedSignal.includes('francés') || combinedSignal.includes('frances') || combinedSignal.includes('french') || combinedSignal.includes('fr')) {
      targetCodes = ['fr-fr', 'fr-ca', 'fr'];
      langPrefix = 'fr';
    } else {
      langPrefix = combinedSignal.slice(0, 2);
      targetCodes = [langPrefix];
    }
  }

  // Check if the default voice already matches BOTH gender and language
  const currentVoiceDetails = provider.voices.find(v => v.id === defaultVoice);
  if (currentVoiceDetails && currentVoiceDetails.gender === targetGender) {
    if (!langPrefix || currentVoiceDetails.language.toLowerCase().startsWith(langPrefix)) {
      return defaultVoice; // Safe to keep using the default
    }
  }

  // Filter candidates by gender
  let candidates = provider.voices.filter((v) => v.gender === targetGender);

  // If a language was specified, prioritize voices of that language and region
  if (langPrefix && candidates.length > 0) {
    // 1. Try to find the best exact regional match (e.g. es-us over es-es)
    for (const code of targetCodes) {
      const bestMatch = candidates.find(v => v.language.toLowerCase() === code || v.language.toLowerCase().startsWith(code));
      if (bestMatch) return bestMatch.id;
    }
    
    // 2. If no regional match, fallback to broad prefix match
    const langMatches = candidates.filter((v) => v.language.toLowerCase().startsWith(langPrefix));
    if (langMatches.length > 0) {
      return langMatches[0].id;
    }
  }

  // If no language specified or no language match, return the first voice of matching gender
  if (candidates.length > 0) {
    return candidates[0].id;
  }

  return defaultVoice;
}

import { auth } from '@/lib/firebase';

async function getApiHeaders(): Promise<HeadersInit> {
  const config = getCurrentModelConfig();
  const settings = useSettingsStore.getState();
  const imageProviderConfig = settings.imageProvidersConfig?.[settings.imageProviderId];
  const videoProviderConfig = settings.videoProvidersConfig?.[settings.videoProviderId];

  let idToken = '';
  if (auth.currentUser) {
    idToken = await auth.currentUser.getIdToken();
  }

  return {
    'Authorization': `Bearer ${idToken}`,
    'Content-Type': 'application/json',
    'x-model': config.modelString || '',
    'x-api-key': config.apiKey || '',
    'x-base-url': config.baseUrl || '',
    'x-provider-type': config.providerType || '',
    'x-requires-api-key': String(config.requiresApiKey ?? false),
    // Image generation provider
    'x-image-provider': settings.imageProviderId || '',
    'x-image-model': settings.imageModelId || '',
    'x-image-api-key': imageProviderConfig?.apiKey || '',
    'x-image-base-url': imageProviderConfig?.baseUrl || '',
    // Video generation provider
    'x-video-provider': settings.videoProviderId || '',
    'x-video-model': settings.videoModelId || '',
    'x-video-api-key': videoProviderConfig?.apiKey || '',
    'x-video-base-url': videoProviderConfig?.baseUrl || '',
    // Media generation toggles
    'x-image-generation-enabled': String(settings.imageGenerationEnabled ?? false),
    'x-video-generation-enabled': String(settings.videoGenerationEnabled ?? false),
  };
}

/** Call POST /api/generate/scene-content (step 1) */
async function fetchSceneContent(
  params: {
    outline: SceneOutline;
    allOutlines: SceneOutline[];
    stageId: string;
    pdfImages?: PdfImage[];
    imageMapping?: ImageMapping;
    stageInfo: {
      name: string;
      description?: string;
      language?: string;
      style?: string;
    };
    agents?: AgentInfo[];
  },
  signal?: AbortSignal,
): Promise<SceneContentResult> {
  const response = await fetch('/api/generate/scene-content', {
    method: 'POST',
    headers: await getApiHeaders(),
    body: JSON.stringify(params),
    signal,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'Request failed' }));
    return { success: false, error: data.error || `HTTP ${response.status}` };
  }

  return response.json();
}

/** Call POST /api/generate/scene-actions (step 2) */
async function fetchSceneActions(
  params: {
    outline: SceneOutline;
    allOutlines: SceneOutline[];
    content: unknown;
    stageId: string;
    agents?: AgentInfo[];
    previousSpeeches?: string[];
    userProfile?: string;
  },
  signal?: AbortSignal,
): Promise<SceneActionsResult> {
  const response = await fetch('/api/generate/scene-actions', {
    method: 'POST',
    headers: await getApiHeaders(),
    body: JSON.stringify(params),
    signal,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'Request failed' }));
    return { success: false, error: data.error || `HTTP ${response.status}` };
  }

  return response.json();
}

/** Generate TTS for one speech action and store in IndexedDB */
export async function generateAndStoreTTS(
  audioId: string,
  text: string,
  signal?: AbortSignal,
  overrideVoice?: string,
): Promise<void> {
  const settings = useSettingsStore.getState();
  if (settings.ttsProviderId === 'browser-native-tts') return;

  const ttsProviderConfig = settings.ttsProvidersConfig?.[settings.ttsProviderId];
  const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
  const response = await fetch('/api/generate/tts', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify({
      text,
      audioId,
      ttsProviderId: settings.ttsProviderId,
      ttsVoice: overrideVoice || settings.ttsVoice,
      ttsSpeed: settings.ttsSpeed,
      ttsApiKey: ttsProviderConfig?.apiKey || undefined,
      ttsBaseUrl: ttsProviderConfig?.baseUrl || undefined,
    }),
    signal,
  });

  const data = await response
    .json()
    .catch(() => ({ success: false, error: response.statusText || 'Invalid TTS response' }));
  if (!response.ok || !data.success || !data.base64 || !data.format) {
    const err = new Error(
      data.details || data.error || `TTS request failed: HTTP ${response.status}`,
    );
    log.warn('TTS failed for', audioId, ':', err);
    throw err;
  }

  const binary = atob(data.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: `audio/${data.format}` });
  await db.audioFiles.put({
    id: audioId,
    blob,
    format: data.format,
    createdAt: Date.now(),
  });
}

async function generateTTSForScene(
  scene: Scene,
  agents: AgentInfo[] | undefined,
  language: string | undefined,
  languageDirective: string | undefined,
  signal?: AbortSignal,
): Promise<{ success: boolean; failedCount: number; error?: string }> {
  const providerId = useSettingsStore.getState().ttsProviderId;
  const defaultVoice = useSettingsStore.getState().ttsVoice;
  
  const dynamicVoice = inferTeacherVoice(agents, providerId, defaultVoice, language, languageDirective);

  scene.actions = splitLongSpeechActions(scene.actions || [], providerId);
  const speechActions = scene.actions.filter(
    (a): a is SpeechAction => a.type === 'speech' && !!a.text,
  );
  if (speechActions.length === 0) return { success: true, failedCount: 0 };

  let failedCount = 0;
  let lastError: string | undefined;

  for (const action of speechActions) {
    const audioId = `tts_${action.id}`;
    action.audioId = audioId;
    try {
      await generateAndStoreTTS(audioId, action.text, signal, dynamicVoice);
    } catch (error) {
      failedCount++;
      lastError = error instanceof Error ? error.message : `TTS failed for action ${action.id}`;
      log.warn('TTS generation failed:', {
        providerId,
        actionId: action.id,
        textLength: action.text.length,
        error: lastError,
      });
    }
  }

  return {
    success: failedCount === 0,
    failedCount,
    error: lastError,
  };
}

export interface UseSceneGeneratorOptions {
  onSceneGenerated?: (scene: Scene, index: number) => void;
  onSceneFailed?: (outline: SceneOutline, error: string) => void;
  onPhaseChange?: (phase: 'content' | 'actions', outline: SceneOutline) => void;
  onComplete?: () => void;
}

export interface GenerationParams {
  pdfImages?: PdfImage[];
  imageMapping?: ImageMapping;
  stageInfo: {
    name: string;
    description?: string;
    language?: string;
    style?: string;
  };
  agents?: AgentInfo[];
  userProfile?: string;
}

export function useSceneGenerator(options: UseSceneGeneratorOptions = {}) {
  const abortRef = useRef(false);
  const generatingRef = useRef(false);
  const mediaAbortRef = useRef<AbortController | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const lastParamsRef = useRef<GenerationParams | null>(null);
  const generateRemainingRef = useRef<((params: GenerationParams) => Promise<void>) | null>(null);

  const store = useStageStore;

  const generateRemaining = useCallback(
    async (params: GenerationParams) => {
      lastParamsRef.current = params;
      if (generatingRef.current) return;
      generatingRef.current = true;
      abortRef.current = false;
      const removeGeneratingOutline = (outlineId: string) => {
        const current = store.getState().generatingOutlines;
        if (!current.some((o) => o.id === outlineId)) return;
        store.getState().setGeneratingOutlines(current.filter((o) => o.id !== outlineId));
      };

      // Create a new AbortController for this generation run
      fetchAbortRef.current = new AbortController();
      const signal = fetchAbortRef.current.signal;

      const state = store.getState();
      const { outlines, scenes, stage } = state;
      const startEpoch = state.generationEpoch;
      if (!stage || outlines.length === 0) {
        generatingRef.current = false;
        return;
      }

      store.getState().setGenerationStatus('generating');

      // Determine pending outlines
      const completedOrders = new Set(scenes.map((s) => s.order));
      const pending = outlines
        .filter((o) => !completedOrders.has(o.order))
        .sort((a, b) => a.order - b.order);

      if (pending.length === 0) {
        store.getState().setGenerationStatus('completed');
        store.getState().setGeneratingOutlines([]);
        options.onComplete?.();
        generatingRef.current = false;
        return;
      }

      store.getState().setGeneratingOutlines(pending);

      // Launch media generation in parallel — does not block content/action generation
      mediaAbortRef.current = new AbortController();
      generateMediaForOutlines(outlines, stage.id, mediaAbortRef.current.signal).catch((err) => {
        log.warn('Media generation error:', err);
      });

      // Get previousSpeeches from last completed scene
      let previousSpeeches: string[] = [];
      const sortedScenes = [...scenes].sort((a, b) => a.order - b.order);
      if (sortedScenes.length > 0) {
        const lastScene = sortedScenes[sortedScenes.length - 1];
        previousSpeeches = (lastScene.actions || [])
          .filter((a): a is SpeechAction => a.type === 'speech')
          .map((a) => a.text);
      }

      // Serial generation loop — two-step per outline
      try {
        let pausedByFailureOrAbort = false;
        for (const outline of pending) {
          if (abortRef.current || store.getState().generationEpoch !== startEpoch) {
            store.getState().setGenerationStatus('paused');
            pausedByFailureOrAbort = true;
            break;
          }

          store.getState().setCurrentGeneratingOrder(outline.order);

          // Step 1: Generate content
          options.onPhaseChange?.('content', outline);
          const contentResult = await fetchSceneContent(
            {
              outline,
              allOutlines: outlines,
              stageId: stage.id,
              pdfImages: params.pdfImages,
              imageMapping: params.imageMapping,
              stageInfo: params.stageInfo,
              agents: params.agents,
            },
            signal,
          );

          if (!contentResult.success || !contentResult.content) {
            if (abortRef.current || store.getState().generationEpoch !== startEpoch) {
              pausedByFailureOrAbort = true;
              break;
            }
            store.getState().addFailedOutline(outline);
            options.onSceneFailed?.(outline, contentResult.error || 'Content generation failed');
            store.getState().setGenerationStatus('paused');
            pausedByFailureOrAbort = true;
            break;
          }

          if (abortRef.current || store.getState().generationEpoch !== startEpoch) {
            store.getState().setGenerationStatus('paused');
            pausedByFailureOrAbort = true;
            break;
          }

          // Step 2: Generate actions + assemble scene
          options.onPhaseChange?.('actions', outline);
          const actionsResult = await fetchSceneActions(
            {
              outline: contentResult.effectiveOutline || outline,
              allOutlines: outlines,
              content: contentResult.content,
              stageId: stage.id,
              agents: params.agents,
              previousSpeeches,
              userProfile: params.userProfile,
            },
            signal,
          );

          if (actionsResult.success && actionsResult.scene) {
            const scene = actionsResult.scene;
            const settings = useSettingsStore.getState();

            // TTS generation — failure means the whole scene fails
            if (settings.ttsEnabled && settings.ttsProviderId !== 'browser-native-tts') {
              const language = params.stageInfo.language;
              const ttsResult = await generateTTSForScene(scene, params.agents, language, outline.languageDirective, signal);
              if (!ttsResult.success) {
                if (abortRef.current || store.getState().generationEpoch !== startEpoch) {
                  pausedByFailureOrAbort = true;
                  break;
                }
                store.getState().addFailedOutline(outline);
                options.onSceneFailed?.(outline, ttsResult.error || 'TTS generation failed');
                store.getState().setGenerationStatus('paused');
                pausedByFailureOrAbort = true;
                break;
              }
            }

            // Epoch changed — stage switched, discard this scene
            if (store.getState().generationEpoch !== startEpoch) {
              pausedByFailureOrAbort = true;
              break;
            }

            removeGeneratingOutline(outline.id);
            store.getState().addScene(scene);
            options.onSceneGenerated?.(scene, outline.order);
            previousSpeeches = actionsResult.previousSpeeches || [];
          } else {
            if (abortRef.current || store.getState().generationEpoch !== startEpoch) {
              pausedByFailureOrAbort = true;
              break;
            }
            store.getState().addFailedOutline(outline);
            options.onSceneFailed?.(outline, actionsResult.error || 'Actions generation failed');
            store.getState().setGenerationStatus('paused');
            pausedByFailureOrAbort = true;
            break;
          }
        }

        if (!abortRef.current && !pausedByFailureOrAbort) {
          store.getState().setGenerationStatus('completed');
          store.getState().setGeneratingOutlines([]);
          options.onComplete?.();
        }
      } catch (err: unknown) {
        // AbortError is expected when stop() is called — don't treat as failure
        if (err instanceof DOMException && err.name === 'AbortError') {
          log.info('Generation aborted');
          store.getState().setGenerationStatus('paused');
        } else {
          throw err;
        }
      } finally {
        generatingRef.current = false;
        fetchAbortRef.current = null;
      }
    },
    [options, store],
  );

  // Keep ref in sync so retrySingleOutline can call it
  generateRemainingRef.current = generateRemaining;

  const stop = useCallback(() => {
    abortRef.current = true;
    store.getState().bumpGenerationEpoch();
    fetchAbortRef.current?.abort();
    mediaAbortRef.current?.abort();
  }, [store]);

  const isGenerating = useCallback(() => generatingRef.current, []);

  /** Retry a single failed outline from scratch (content → actions → TTS). */
  const retrySingleOutline = useCallback(
    async (outlineId: string) => {
      const state = store.getState();
      const outline = state.failedOutlines.find((o) => o.id === outlineId);
      const params = lastParamsRef.current;
      if (!outline || !state.stage || !params) return;

      const removeGeneratingOutline = () => {
        const current = store.getState().generatingOutlines;
        if (!current.some((o) => o.id === outlineId)) return;
        store.getState().setGeneratingOutlines(current.filter((o) => o.id !== outlineId));
      };

      // Remove from failed list and mark as generating
      store.getState().retryFailedOutline(outlineId);
      store.getState().setGenerationStatus('generating');
      const currentGenerating = store.getState().generatingOutlines;
      if (!currentGenerating.some((o) => o.id === outline.id)) {
        store.getState().setGeneratingOutlines([...currentGenerating, outline]);
      }

      const abortController = new AbortController();
      const signal = abortController.signal;

      try {
        // Step 1: Content
        const contentResult = await fetchSceneContent(
          {
            outline,
            allOutlines: state.outlines,
            stageId: state.stage.id,
            pdfImages: params.pdfImages,
            imageMapping: params.imageMapping,
            stageInfo: params.stageInfo,
            agents: params.agents,
          },
          signal,
        );

        if (!contentResult.success || !contentResult.content) {
          store.getState().addFailedOutline(outline);
          return;
        }

        // Step 2: Actions
        const sortedScenes = [...store.getState().scenes].sort((a, b) => a.order - b.order);
        const lastScene = sortedScenes[sortedScenes.length - 1];
        const previousSpeeches = lastScene
          ? (lastScene.actions || [])
              .filter((a): a is SpeechAction => a.type === 'speech')
              .map((a) => a.text)
          : [];

        const actionsResult = await fetchSceneActions(
          {
            outline: contentResult.effectiveOutline || outline,
            allOutlines: state.outlines,
            content: contentResult.content,
            stageId: state.stage.id,
            agents: params.agents,
            previousSpeeches,
            userProfile: params.userProfile,
          },
          signal,
        );

        if (!actionsResult.success || !actionsResult.scene) {
          store.getState().addFailedOutline(outline);
          return;
        }

        // Step 3: TTS
        const settings = useSettingsStore.getState();
        if (settings.ttsEnabled && settings.ttsProviderId !== 'browser-native-tts') {
          const language = params.stageInfo.language;
          const ttsResult = await generateTTSForScene(actionsResult.scene, params.agents, language, outline.languageDirective, signal);
          if (!ttsResult.success) {
            store.getState().addFailedOutline(outline);
            return;
          }
        }

        removeGeneratingOutline();
        store.getState().addScene(actionsResult.scene);

        // Resume remaining generation if there are pending outlines
        if (store.getState().generatingOutlines.length > 0 && lastParamsRef.current) {
          generateRemainingRef.current?.(lastParamsRef.current);
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          store.getState().addFailedOutline(outline);
        }
      }
    },
    [store],
  );

  return { generateRemaining, retrySingleOutline, stop, isGenerating };
}
