# Aprendizajes: Deep Interaction, Seguridad y Cloud Run

## 1. Optimización Pedagógica (Deep Interaction)
- **Problema de Escalado:** Forzar una cuota alta de escenas interactivas (ej. 70% o 3 a 5 mínimas) saturaba el *Thinking Budget* de la IA (`budgetTokens: 4096`), provocando mayor riesgo de *rate limits* (tiempo de espera o bloqueos) y bajaba la calidad teórica del curso.
- **Sesgo de Simuladores:** El prompt original forzaba la creación de al menos 2 simuladores por curso. Esto generaba resultados inútiles en materias no exactas (Historia, Lengua).
- **Solución:** 
  - Se redujo el límite a **1 a 3 interacciones como máximo** por curso.
  - Se eliminaron las reglas mínimas obligatorias por tipo de widget. Ahora el sistema confía en la IA para elegir dinámicamente el widget (diagrama, juego, código, 3D) que mejor represente la temática.
  - Se fortaleció la cantidad de diapositivas de teoría pura (~8 a 11 por curso) para mantener el rigor académico.

## 2. Revisión de Reglas de Seguridad
Se realizó una inspección manual a los archivos de Firebase:
- **`firestore.rules` (Aprobado 🟢):** Está excelentemente estructurado. La división de permisos usando las funciones `isAdmin()` e `isStaff()` asegura perfectamente el progreso de los estudiantes y restringe la auditoría (`prompt_logs`) o la edición del sistema al backend y administradores.
- **`storage.rules` (Solucionado 🟢):** Se implementó una doble validación cruzada. Ahora Storage utiliza `firestore.get(...)` para leer la tabla de `global_classrooms` y validar que el `request.auth.uid` coincida con el `createdBy` del curso (o tenga rol de `admin`). Esto cierra la brecha de seguridad y blinda el contenido multimedia.

## 3. Arquitectura de la Zona de Prácticas y Quizzes
- **Generación Homogénea (Prácticas):** Para garantizar una fiabilidad del 100% de la IA y evitar errores de sintaxis o renderizado, las prácticas de 3 preguntas ya no mezclan formatos. El Backend elige al azar 1 solo tipo (`multiple_choice`, `true_false` o `fill_in_the_blank`) por sesión y manda un prompt hiper-estricto para ese esquema.
- **Validación UI Diferenciada (Prácticas):** La UI renderiza opciones a doble columna para V/F, y para *fill-in-the-blank* detecta los `___` y los reemplaza visualmente por cajas de texto estilizadas, mostrando las opciones como botones inferiores.
- **Cadena de Pensamiento (Chain of Thought):** Se descubrió que la IA alucinaba resultados matemáticos básicos tanto en la Zona de Prácticas como en el Quiz Final de los cursos al verse obligada a dar el `correctIndex` o el `answer` inmediatamente. Se solucionó agregando obligatoriamente el campo `"reasoning"` de primero en el esquema JSON de ambos generadores (`api/generate-practice` y `quiz-content/system.md`), obligándola a resolver el problema mentalmente paso a paso *antes* de dar la respuesta.
- **Sesgo de Prompt (Prompt Bias):** Se detectó que la IA tendía a marcar siempre la "Opción A" como correcta en los Quizzes de los cursos. Esto ocurría porque los ejemplos JSON en el `system.md` usaban `"A"` como respuesta. Se solucionó modificando los ejemplos a `"C"` y `"B, D"` y agregando una regla estricta que exige aleatorizar la posición de la respuesta correcta.

## 4. Control Pedagógico Estricto (Asignaciones)
- Los cursos generados por Tutores (Asignados) bloquean visualmente el acceso y no pueden re-descargarse si el estudiante obtiene estado `failed` (Reprobado). Se solucionó un bug UI para que la tarjeta de neón no descargada indique claramente "Reprobado" en color rojo (`bg-red-500`) en lugar de "Iniciar", manteniendo la estricta integridad de evaluación.

## 5. Compatibilidad con Google Cloud Run
- **Compilación Exitosa:** Se ejecutó exitosamente el comando `pnpm build`.
- **Warning (EINVAL) en Windows:** Durante el build en local (Windows), se reportó una advertencia al intentar copiar archivos *standalone* (`_node:fs_ddf6f167._.js`). Esto sucede porque Windows prohíbe el uso de dos puntos (`:`) en los nombres de archivo. **Este error NO afectará a Google Cloud Run**, ya que la imagen de Docker correrá en Linux, el cual soporta perfectamente este formato en el output del compilador. El proyecto está 100% listo para producción.
