# Motor Pedagógico y Sincronización Firestore (Estabilización)

## 1. Integración de Google Search Grounding V3
La versión @ai-sdk/google v3.0.43 depreció el flag useSearchGrounding: true. 
Para usar Google Search en la inferencia del modelo, se debe inyectar explícitamente como una herramienta (	ools):
- generateObject **no soporta** tools en esta versión.
- En su lugar, se usa generateText pasando 	ools: { googleSearch: (google as any).googleSearch() }.
- Luego, se le pide explícitamente a Gemini que responda en un formato JSON estricto y se procesa mediante JSON.parse. Esto garantiza que la búsqueda web en cascada (Google -> Tavily) funcione impecablemente sin romper el tipado del SDK.

## 2. Paracaídas Programático y Contextualización de la Evaluación (Quizz Obligatorio)
Para mitigar las alucinaciones de Gemini en las que ignora las reglas estrictas o genera evaluaciones genéricas de cultura general (como trivia sobre planetas o animales) o meta-educacionales, se implementó un mecanismo de salvaguarda y enriquecimiento dinámico de contexto en dos partes principales:

### A. Inyección de Tema Central y Soporte para Cursos "LIBRE"
* **Desafío**: Los cursos tradicionales tienen un tema curricular definido. Sin embargo, los de tema **LIBRE** (ej. "La Luna y las mareas en la Tierra") no cuentan con un syllabus preestablecido. Al no recibir un tema raíz del curso, el modelo de Gemini sufría de vacío de contexto y recurría a trivias genéricas no relacionadas.
* **Solución de Streaming y Outlines**:
  - En `api/generate/scene-outlines-stream/route.ts` y `lib/generation/outline-generator.ts`, se calcula dinámicamente el tema central del curso (`courseTheme`). Si `requirements.topic` es `'LIBRE'`, se deriva y limpia directamente a partir del prompt original del usuario (`pureUserPrompt`).
  - Se pre-pende de manera explícita el prefijo del curso en la descripción del quiz inyectado: `Curso: ${courseTheme}\n` (o `Course: ${courseTheme}\n` en inglés).
* **Solución en API de Contenido**:
  - En `api/generate/scene-content/route.ts`, se extrae el nombre del aula/curso (`stageInfo.name`) y se pasa como `courseTitle` en las opciones de `generateSceneContent`.
  - En el interceptor *fail-safe*, si la descripción del quiz es genérica, se reconstruye el syllabus numerado basado en las escenas previas y se antepone la etiqueta del curso (`Curso: [stageInfo.name]\n`) para anclar con total certeza el contexto.

### B. Plantillas de Prompt Robustas (`quiz-content`)
* **user.md**: Se añadió la variable de prompt `Course Theme / Overarching Subject: {{courseTitle}}` en el nivel superior de la plantilla del quiz para obligar a Gemini a saber cuál es el tema del curso completo.
* **system.md**: Se robusteció el apartado de `SUBJECT MATTER FOCUS` prohibiendo de manera categórica trivias científicas o de cultura general no relacionadas con el curso, así como preguntas abstractas sobre pedagogía o metodologías de estudio. Todo debe evaluar estrictamente la materia impartida.

## 3. Sincronización Global: Arreglos Anidados en Firestore
Al publicar cursos globalmente (global_classrooms), Firestore rechaza el documento si contiene arreglos anidados (ej. TableCell[][] generado para las tablas de las diapositivas).
- **Solución implementada:** En lib/utils/cloud-sync.ts se crearon las utilidades encodeNestedArrays y decodeNestedArrays.
- Antes de setDoc, se empaquetan dinámicamente los arreglos anidados en cadenas de texto ({ _isNestedArray: true, data: string }).
- Al clonar el curso (processCloudDownload), se restauran a su formato de arreglo nativo antes de guardarse en IndexedDB.
- Esto evita alterar el modelo de datos de la interfaz de usuario (React) y cumple con las estrictas reglas de Firebase. Las reglas de irestore.rules y storage.rules validan perfectamente este flujo sin necesitar cambios.
