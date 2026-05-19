import { inferTeacherVoice } from '../lib/hooks/use-scene-generator';

const agents = [
  { role: 'teacher', gender: 'female', persona: 'Female teacher', avatar: 'teacher-2.png', id: '1', name: 'Teacher' }
];

const providerId = 'google-tts';
const defaultVoice = 'es-US-Journey-F';
const language = 'en-US';
const languageDirective = 'English (MUST translate everything to English)';

console.log("TEST 1 (Normal English):", inferTeacherVoice(agents as any, providerId as any, defaultVoice, language, languageDirective));
