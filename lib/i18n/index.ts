import { defaultLocale } from './types';
export { type Locale, defaultLocale } from './types';
import { commonZhCN, commonEnUS, commonEsES } from './common';
import { stageZhCN, stageEnUS, stageEsES } from './stage';
import { chatZhCN, chatEnUS, chatEsES } from './chat';
import { generationZhCN, generationEnUS, generationEsES } from './generation';
import { settingsZhCN, settingsEnUS, settingsEsES } from './settings';

export const translations = {
  'zh-CN': {
    ...commonZhCN,
    ...stageZhCN,
    ...chatZhCN,
    ...generationZhCN,
    ...settingsZhCN,
  },
  'en-US': {
    ...commonEnUS,
    ...stageEnUS,
    ...chatEnUS,
    ...generationEnUS,
    ...settingsEnUS,
  },
  'es-ES': {
    ...commonEsES,
    ...stageEsES,
    ...chatEsES,
    ...generationEsES,
    ...settingsEsES,
  },
} as const;

export type TranslationKey = keyof (typeof translations)[typeof defaultLocale];
