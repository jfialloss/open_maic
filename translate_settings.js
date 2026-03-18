const fs = require('fs');
const content = fs.readFileSync('lib/i18n/settings.ts', 'utf-8');

// Use a simpler string replacement approach
const enUsStart = 'export const settingsEnUS = {';
const enUsStartIndex = content.indexOf(enUsStart);

// We know it ends with `} as const;` at the very end of the file
const enUsContent = content.substring(enUsStartIndex);

// Replace "EnUS" with "EsES" and roughly translate the most important parts
let esEsContent = enUsContent.replace('export const settingsEnUS = {', 'export const settingsEsES = {');

// General translations based on common knowledge
const translations = [
  ["'Settings'", "'Ajustes'"],
  ["'Configure application settings'", "'Configurar ajustes de la aplicación'"],
  ["'Language'", "'Idioma'"],
  ["'Select interface language'", "'Seleccionar el idioma de la interfaz'"],
  ["'Theme'", "'Tema'"],
  ["'Select theme mode (Light/Dark/System)'", "'Seleccionar modo de tema (Claro/Oscuro/Sistema)'"],
  ["'Light'", "'Claro'"],
  ["'Dark'", "'Oscuro'"],
  ["'System'", "'Sistema'"],
  ["'API Key'", "'Clave API'"],
  ["'Configure your API key'", "'Configura tu clave API'"],
  ["'API Endpoint URL'", "'URL del Endpoint de la API'"],
  ["'Configure your API endpoint URL'", "'Configura la URL de tu endpoint de la API'"],
  ["'API key cannot be empty'", "'La clave API no puede estar en blanco'"],
  // Add some other basic string replacements, but leave the structure intact
  ["'Model Configuration'", "'Configuración de Modelo'"],
  ["'Configure AI models'", "'Configurar modelos de IA'"],
  ["'Enter or select model name'", "'Introduce o selecciona el nombre del modelo'"],
  ["'Close'", "'Cerrar'"],
  ["'Save'", "'Guardar'"],
  ["'Reset'", "'Reiniciar'"],
  ["'Add'", "'Añadir'"],
  ["'Delete'", "'Eliminar'"],
  ["'Cancel'", "'Cancelar'"],
  ["'Yes'", "'Sí'"],
  ["'No'", "'No'"],
  ["'Error'", "'Error'"],
  ["'Success'", "'Éxito'"],
  ["'Warning'", "'Advertencia'"],
  ["'LLM'", "'LLM (Modelos)'"],
  ["'Text-to-Speech'", "'Texto a Voz'"],
  ["'Speech Recognition'", "'Reconocimiento de Voz'"],
  ["'Image Generation'", "'Generación de Imágenes'"],
  ["'Video Generation'", "'Generación de Video'"],
  ["'Web Search'", "'Búsqueda Web'"],
  ["'Advanced Settings'", "'Ajustes Avanzados'"],
  ["'General'", "'General'"],
  ["'System'", "'Sistema'"],
  ["'Models'", "'Modelos'"],
  ["'Profile'", "'Perfil'"],
  ["'Student'", "'Estudiante'"],
];

for (const [en, es] of translations) {
  esEsContent = esEsContent.replaceAll(en, es);
}

fs.appendFileSync('lib/i18n/settings.ts', '\n\n' + esEsContent);
console.log('Translated settings appended successfully');
