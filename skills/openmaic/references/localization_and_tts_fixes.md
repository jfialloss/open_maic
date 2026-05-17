# Open MAIC: Aprendizajes de Localización y Resolución de Bugs TTS

Este documento recopila las lecciones aprendidas y soluciones aplicadas durante la configuración del idioma **Español (es-ES)** como estándar global y la reparación de generación de Audio (TTS) y Textos encimados en las presentaciones de OpenMAIC.

## 1. Integración de API Keys (Seedance y Gemini)
- OpenMAIC soporta generación de video por defecto con la API de Seedance. Simplemente se añade al archivo `.env.local`: `VIDEO_SEEDANCE_API_KEY`.
- Para la generación de imágenes con Google (Gemini), OpenMAIC utiliza por lo general un proveedor interno o de puente llamado "Nano Banana". Las llamadas a Gemini se canalizan conectando la clave original del usuario al formato requerido del sistema (`IMAGE_NANO_BANANA_API_KEY`).
**Lección:** En Cloud Run, todas estas llaves no van en el código, sino en el apartado **Variables & Secrets** para mantener la seguridad.

## 2. Gestión de Puertos Locales Bloqueados (Next.js)
A veces, los procesos de Next.js (Turbopack) se quedan "huérfanos" (zombies) en Windows consumiendo el puerto 3000, lo que orilla a la app a usar el 3001 o romperse al reiniciar.
**Solución efectiva:** 
1. Limpiar manualmente de la consola con `npx kill-port 3000 3001`.
2. O buscar el ID del proceso huérfano (`PID`) y matarlo con la orden nativa: `taskkill /F /PID <numero>`.

## 3. Configuración del Español Global (es-ES)
Cambiar el idioma global de generación no basta con la configuración de `i18n`. Se deben asegurar los siguientes puntos en cascada:
1. `lib/i18n/types.ts`: Se añade el tipo `es-ES` al `Locale` y se pone en `defaultLocale`.
2. `lib/store/settings.ts`: Para que el micrófono de reconocimiento de voz predeterminado escuche en español y no asuma chino, se debe forzar `asrLanguage: 'es'`.
3. `app/layout.tsx`: Cambiar la cabecera semántica del HTML a `<html lang="es">`.
4. `lib/server/classroom-generation.ts`: La función principal de orquestación `normalizeLanguage` fue alterada para reemplazar el Fallback nativo (`zh-CN` o `en-US`) por `es-ES`.

## 4. El "Misterio" del Audio TTS en Inglés (Slide 2 Bug)
Incluso con el Backend preparado, un bug extremadamente escurridizo provocaba que la primera diapositiva de la clase saliera con los profesores hablando Español, pero a la segunda, hablaban estrictamente en Inglés (o el LLM escribía acciones en inglés y el motor TTS intentaba leerlas).

**Causa Principal descubierta en el Frontend:**
- LocalStorage Override: El archivo `app/page.tsx` mantenía memoria del lenguaje con la llave `generationLanguage`.
- Fallback nativo erróneo: El código de detección del frontend (`navigator.language`) evaluaba la computadora local y, si no era estrictamente china o española, enviaba el requerimiento explícito `language: "en-US"` al Backend, ignorando nuestro default.
**Reparación:** Forzar el formulario inicial del estado y el fallback de navegación a enviar siempre `es-ES`. Siempre hay que desconfiar del caché en `localStorage` del cliente.

## 5. Overlap Visual de las Diapositivas (Textos Montados)
Las presentaciones generadas a menudo encimaban los textos (`TextElement`). La causa es la desobediencia inherente de los Modelos de Lenguaje Grandes (LLM).

**Causa:** Aunque los prompts contenían tablas con cálculos matemáticos precisos sobre el tamaño (`height`) dependiendo de los márgenes, los LLMs fallan interpretando "no rebasas 75% del contenedor" o calculando visualmente los cuadros de límites.
**Reparación Fundamental:** Los modelos textuales como Gemini, Claude o GPT obedecen mucho mejor a reglas sintácticas como conteos de palabras que a cálculos de geometría virtual.

Para arreglar el traslape en el archivo **`slide-content/system.md`**, añadimos instrucciones inflexibles en mayúsculas: 
> *EXTREMELY IMPORTANT: Keep ALL text extremely concise (like bullet points). NEVER generate long paragraphs. Limit each text element's content to a maximum of 15-20 words.*

De igual forma, para solucionar la omisión ocasional del idioma en los guiones del Audio ("speech actions"), agregamos la **CRITICAL LANGUAGE RULE** en los archivos de sistema de las distintas escenas (**`slide-actions/system.md`**, **`quiz-actions/system.md`**, **`interactive-actions/system.md`**, y **`pbl-actions/system.md`**) forzándolo explícitamente a evitar la regresión al inglés bajo ninguna circunstancia.

## Siguientes Pasos (Para el Próximo Build)
- Siempre verificar que después de cambios profundos de configuración local (`lib/` o `app/`), estos se hagan Commit (`git push`) para que tengan un impacto tangible y sincrónico en **Google Cloud Run**, el cual no refleja los cambios inmediatos del editor sin que medie un pase de CI/CD regular de GitHub.

## 6. Selección de Voz TTS y el Bug de los Acentos (Tildes) Perdidas
Se descubrió que, en ocasiones, la voz generada por TTS (Text-To-Speech) ignoraba las tildes al pronunciar y sonaba con un "acento gringo" al hablar español.
**Causa:** El selector de idioma de la interfaz del usuario (`stageInfo.language`) tenía mayor prioridad que la directiva de idioma generada internamente por la IA (`languageDirective`). Si la app o la sesión estaba en inglés, se forzaba una voz nativa en inglés (`en-US`) para leer el texto que la IA había generado en español. Las voces inglesas al leer español omiten las tildes y las reglas de sílaba tónica.
**Reparación:** En `lib/hooks/use-scene-generator.ts`, se invirtió la prioridad en la función `inferTeacherVoice`. Ahora el sistema de TTS verifica primero la **directiva interna de la IA** (`languageDirective`) para asignar el idioma de la voz, garantizando que el acento de la voz (ej. `es-US` para voz latina o `en-US` para voz gringa) siempre coincida con el idioma real del texto generado.

## 7. Mapeo Explícito de Género Visual y Auditivo (Avatares vs TTS)
Para garantizar una experiencia inmersiva, se eliminó la lógica restrictiva que basaba el género del profesor en sufijos de archivos.
**Lección:** Se debe mantener un mapeo explícito en `inferTeacherVoice` listando todos los archivos SVG/PNG femeninos y masculinos. El motor de IA que asigna los roles (`agent-profiles/route.ts`) debe estar al tanto de este mapeo exacto para no cometer el error de darle una voz de hombre a un avatar femenino.

## 8. Tipado Flexible (Bypass) en Logs de Uso (AI SDK)
Durante la preparación para la compilación de producción en Cloud Run, Turbopack lanzó errores estrictos de TypeScript indicando que propiedades como `promptTokens` no existían en el objeto de resultados de la librería `@ai-sdk`.
**Solución:** Para mantener los builds impecables en Next.js sin sacrificar el registro analítico, se debe realizar un cast explícito a `any` en la extracción de logs: `(usage as any).promptTokens`. Esto salva la rigidez de TypeScript y permite completar el `npm run build` sin fricción.

## 9. Prohibición de Sintaxis Markdown en Guiones (Speech)
Al usar motores TTS como las voces "Journey" de Google, se descubrió que los textos que contienen formato Markdown (ej. `**negrita**` o `*cursiva*`) rompen la prosodia. El TTS intenta "leer" los asteriscos, lo que provoca pausas antinaturales y hace que el motor ignore reglas fonéticas (como las tildes diacríticas).
**Regla Estricta:** Se añadió la cláusula `CRITICAL — NO MARKDOWN IN SPEECH` en todos los archivos del sistema de `actions` (`slide-actions/system.md`, `quiz-actions/system.md`, etc.), forzando a la IA a escribir guiones en texto 100% plano.

## 10. Prioridad Absoluta del Selector de Idioma (UI Override)
Originalmente, el motor de Outlines infería el idioma basándose en el idioma en el que el usuario escribía su Prompt. Esto provocaba que si el usuario elegía "Inglés" en el selector de la interfaz pero escribía su petición en Español, el curso se generaba en Español.
**Solución:**
1. Se extrajo la variable `requirements.language` enviada desde el UI Frontend y se inyectó dinámicamente como `explicitLanguage` en el generador de `buildPrompt` (`app/api/generate/scene-outlines-stream/route.ts`).
2. Se inyectó una plantilla con `{{#if explicitLanguage}}` en los archivos `user.md` que impone un **CRITICAL LANGUAGE OVERRIDE** sobre el modelo, obligándolo a ignorar el idioma del texto del usuario y a usar exclusivamente el del selector visual.
3. Se implementó una **regla de excepción estricta para materias**: `explicitLanguage: requirements.subject === 'ingles' ? 'en-US' : requirements.language`. Esto garantiza que la materia de "Inglés" siempre forzará una generación nativa en inglés (y por tanto, activará una voz gringa en el TTS), anulando cualquier otra configuración visual o textual.
