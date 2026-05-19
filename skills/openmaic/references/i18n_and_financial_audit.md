# Auditoría Financiera e Internacionalización (i18n)

## 1. Integridad Financiera y Rastreo de Consumo (Token Logger)
Se ha implementado un sistema robusto de auditoría de costos que monitorea absolutamente todas las peticiones a la API de Inteligencia Artificial.

### Endpoints Protegidos
La función `logTokenUsage` se integró en todos los endpoints que no estaban reportando costos originalmente:
- `/api/generate/image`
- `/api/generate/tts`
- `/api/generate-practice`
- `/api/quiz-grade`
- `/api/pbl/chat`

### Orquestador de Medios (El Reto de Autorización)
Al asegurar los endpoints de medios (`image`, `tts`) para que requieran autenticación (`authenticateRequest`), el componente `lib/media/media-orchestrator.ts` (que dispara las peticiones de fondo) comenzó a fallar con error `Missing or invalid Authorization header`.
**Solución:** Se inyectó dinámicamente el token de Firebase del usuario actual (`await auth.currentUser?.getIdToken()`) dentro de las cabeceras `fetch` del orquestador. Todo cliente que llame a una API protegida en OpenMAIC **debe enviar este Bearer token**.

### Reglas de Seguridad (Firestore)
- **Escritura:** El logger escribe los datos mediante `firebase-admin` (Node.js backend), por lo que **bypassea** las reglas de seguridad de Firestore. Los clientes NUNCA escriben sus propios costos.
- **Lectura:** El panel administrativo usa el SDK de cliente. La colección `/usage_logs/{document=**}` tiene la regla `allow read: if isStaff();` y `allow write: if false;`, garantizando que solo los administradores vean la información financiera y bloqueando mutaciones maliciosas desde el frontend.

---

## 2. Internacionalización (i18n) Global

### Eliminación de Textos Hardcodeados
El Dashboard de Uso de IA (`app/admin/usage/page.tsx`) fue migrado del español estático al sistema dinámico de diccionarios.
- Se implementaron las llaves dentro de `lib/i18n/common.ts` bajo la rama `adminUsage` para todos los idiomas soportados (zh-CN, en-US, es-ES).
- La lectura se hace mediante desestructuración correcta del hook: `const { t, locale } = useI18n();`. *(Importante: la variable interna que contiene la cadena del idioma se llama `locale`, no `language`)*.

### Generador de Prácticas y Calificador de Quizzes
Se eliminó la lógica restrictiva antigua (ej. validaciones binarias `isZh`) y se adaptaron los *System Prompts* para obligar a Gemini a usar el idioma activo del usuario.
- **Práctica (`/api/generate-practice`):** Se inyecta la instrucción `CRITICAL INSTRUCTION: You MUST generate ALL questions, options, and reasoning EXACTLY in this language: {locale}`.
- **Dinámica:** Tipos de preguntas como `true_false` ahora devuelven opciones localizadas automáticamente (`['True', 'False']` o `['Verdadero', 'Falso']`) para evitar que el LLM alucine cuatro opciones en vez de dos.

### Fallo de Tipado resuelto con AI SDK
El objeto de modelo retornado por `resolveModelFromHeaders(req)` (`@ai-sdk/core`) no exportaba la propiedad `.modelId` nativamente en su firma base (Type error: Property 'modelId' does not exist on type 'LanguageModel'). 
**Solución:** Extraer y utilizar `modelString` directamente desde la firma de `resolveModelFromHeaders(req)` en lugar de tratar de forzar la lectura interna del objeto `model`.

---

## 3. Curaduría del Syllabus
Se corrigió un bug en la Zona de Práctica donde aparecían 6 materias en lugar de 5. El archivo `lib/data/syllabus.json` fue depurado para eliminar el bloque duplicado e inexistente de `"Ciencias Sociales"`, manteniendo la compatibilidad estricta con las áreas aprobadas para las generaciones:
1. Ciencias Naturales
2. Matemática
3. Lengua y Literatura
4. Estudios Sociales
5. Inglés
