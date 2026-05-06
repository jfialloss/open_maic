import { defaultLocale } from './types';
import type { Locale } from './types';
export { type Locale, defaultLocale } from './types';
import { commonZhCN, commonEnUS, commonEsES } from './common';
import { stageZhCN, stageEnUS, stageEsES } from './stage';
import { chatZhCN, chatEnUS, chatEsES } from './chat';
import { generationZhCN, generationEnUS, generationEsES } from './generation';
import { settingsZhCN, settingsEnUS, settingsEsES } from './settings';
import { peaasZhCN, peaasEnUS, peaasEsES } from './peaas';

export const translations = {
  'zh-CN': {
    ...commonZhCN,
    ...stageZhCN,
    ...chatZhCN,
    ...generationZhCN,
    ...settingsZhCN,
    ...peaasZhCN,
  },
  'en-US': {
    ...commonEnUS,
    ...stageEnUS,
    ...chatEnUS,
    ...generationEnUS,
    ...settingsEnUS,
    ...peaasEnUS,
  },
  'es-ES': {
    ...commonEsES,
    ...stageEsES,
    ...chatEsES,
    ...generationEsES,
    ...settingsEsES,
    ...peaasEsES,
  },
} as const;

export type TranslationKey = keyof (typeof translations)[typeof defaultLocale];

/**
 * Fallback translation function for non-React contexts (e.g. engine.ts).
 * Reads the current locale from localStorage.
 */
export function getClientTranslation(key: string): string {
  if (typeof window === 'undefined') return key;

  let locale: Locale = defaultLocale;
  try {
    const stored = localStorage.getItem('locale') as Locale;
    if (stored && (stored === 'zh-CN' || stored === 'en-US' || stored === 'es-ES')) {
      locale = stored;
    }
  } catch {
    // Ignore
  }

  const keys = key.split('.');
  let value: unknown = translations[locale];
  for (const k of keys) {
    value = (value as Record<string, unknown>)?.[k];
  }
  return (typeof value === 'string' ? value : undefined) ?? key;
}
