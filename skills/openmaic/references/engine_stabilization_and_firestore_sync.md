# Motor Pedagógico y Sincronización Firestore (Estabilización)

## 1. Integración de Google Search Grounding V3
La versión @ai-sdk/google v3.0.43 depreció el flag useSearchGrounding: true. 
Para usar Google Search en la inferencia del modelo, se debe inyectar explícitamente como una herramienta (	ools):
- generateObject **no soporta** tools en esta versión.
- En su lugar, se usa generateText pasando 	ools: { googleSearch: (google as any).googleSearch() }.
- Luego, se le pide explícitamente a Gemini que responda en un formato JSON estricto y se procesa mediante JSON.parse. Esto garantiza que la búsqueda web en cascada (Google -> Tavily) funcione impecablemente sin romper el tipado del SDK.

## 2. Paracaídas Programático (Quizz Obligatorio)
Para mitigar las alucinaciones de Gemini en las que ignora las reglas estrictas (incluso cuando se le marca como MANDATORY), se implementó un mecanismo de salvaguarda en lib/generation/outline-generator.ts.
- Al recibir las escenas (outlines), el sistema revisa si existe un 	ype: "quiz".
- Si no existe, se inyecta programáticamente uno al final del arreglo.
- Las plantillas maestras (system.md en equirements-to-outlines e interactive-outlines) tienen difficulty: "easy" por defecto, lo que obliga al generador de la Fase 2 a adaptar las preguntas para principiantes.

## 3. Sincronización Global: Arreglos Anidados en Firestore
Al publicar cursos globalmente (global_classrooms), Firestore rechaza el documento si contiene arreglos anidados (ej. TableCell[][] generado para las tablas de las diapositivas).
- **Solución implementada:** En lib/utils/cloud-sync.ts se crearon las utilidades encodeNestedArrays y decodeNestedArrays.
- Antes de setDoc, se empaquetan dinámicamente los arreglos anidados en cadenas de texto ({ _isNestedArray: true, data: string }).
- Al clonar el curso (processCloudDownload), se restauran a su formato de arreglo nativo antes de guardarse en IndexedDB.
- Esto evita alterar el modelo de datos de la interfaz de usuario (React) y cumple con las estrictas reglas de Firebase. Las reglas de irestore.rules y storage.rules validan perfectamente este flujo sin necesitar cambios.
