/**
 * Dialect Sanitizer
 * 
 * Replaces Peninsular Spanish specific vocabulary/conjugations (vosotros, vereis, etc)
 * with their Latin American Spanish equivalents using strict Regex.
 * This ensures no regionalisms leak into the final UI text or TTS engine.
 */

const REPLACEMENTS = [
  { regex: /\b(vosotros|vosotras)\b/gi, replacement: 'ustedes' },
  { regex: /\b(vuestro|vuestra|vuestros|vuestras)\b/gi, replacement: 'su' },
  { regex: /\bvereis\b/gi, replacement: 'verán' },
  { regex: /\bveréis\b/gi, replacement: 'verán' },
  { regex: /\bos\s+aguarda\b/gi, replacement: 'les aguarda' },
  { regex: /\bfijaos\b/gi, replacement: 'fíjense' },
  { regex: /\bos\s+gusta\b/gi, replacement: 'les gusta' },
  { regex: /\bos\s+gustaría\b/gi, replacement: 'les gustaría' },
  { regex: /\bpreparaos\b/gi, replacement: 'prepárense' },
  { regex: /\bimaginaos\b/gi, replacement: 'imagínense' },
  { regex: /\bhabeis\b/gi, replacement: 'han' },
  { regex: /\bhabéis\b/gi, replacement: 'han' },
  { regex: /\bsois\b/gi, replacement: 'son' },
  { regex: /\bestais\b/gi, replacement: 'están' },
  { regex: /\bestáis\b/gi, replacement: 'están' },
  { regex: /\bteneis\b/gi, replacement: 'tienen' },
  { regex: /\btenéis\b/gi, replacement: 'tienen' },
  { regex: /\bpodeis\b/gi, replacement: 'pueden' },
  { regex: /\bpodéis\b/gi, replacement: 'pueden' },
  { regex: /\bquereis\b/gi, replacement: 'quieren' },
  { regex: /\bqueréis\b/gi, replacement: 'quieren' },
  { regex: /\bhaceis\b/gi, replacement: 'hacen' },
  { regex: /\bhacéis\b/gi, replacement: 'hacen' },
  { regex: /\bdebeis\b/gi, replacement: 'deben' },
  { regex: /\bdebéis\b/gi, replacement: 'deben' },
  { regex: /\bsabeis\b/gi, replacement: 'saben' },
  { regex: /\bsabéis\b/gi, replacement: 'saben' },
  { regex: /\b(recordad)\b/gi, replacement: 'recuerden' },
  { regex: /\b(mirad)\b/gi, replacement: 'miren' },
  { regex: /\b(pensad)\b/gi, replacement: 'piensen' },
  { regex: /\b(haced)\b/gi, replacement: 'hagan' },
  { regex: /\b(venid)\b/gi, replacement: 'vengan' },
  { regex: /\b(decid)\b/gi, replacement: 'digan' },
  { regex: /\bos\s+invito\b/gi, replacement: 'les invito' },
  { regex: /\bos\s+parece\b/gi, replacement: 'les parece' },
];

/**
 * Parses the text and sanitizes any Peninsular Spanish expressions
 * into neutral Latin American Spanish.
 * Safe to use with any text (English will naturally pass through unaffected).
 */
export function sanitizeDialect(text: string): string {
  if (!text) return text;
  
  let sanitized = text;
  for (const { regex, replacement } of REPLACEMENTS) {
    // We use a replacer function to preserve the original casing if possible
    // Note: This is a basic casing preservation (capitalizing the first letter if the original was capitalized)
    sanitized = sanitized.replace(regex, (match) => {
      const isCapitalized = match.charAt(0) === match.charAt(0).toUpperCase();
      if (isCapitalized) {
        return replacement.charAt(0).toUpperCase() + replacement.slice(1);
      }
      return replacement;
    });
  }
  return sanitized;
}
