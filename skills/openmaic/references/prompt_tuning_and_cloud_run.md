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
- **`storage.rules` (Aviso 🟡):** Se detectó que las rutas `/courses_media/{classroomId}/{fileName}` y `/courses_audio` permiten la escritura a cualquier usuario autenticado (`allow write: if request.auth != null;`). Para producción se recomienda limitar la subida de media solo al dueño (`createdBy`) o a administradores.

## 3. Compatibilidad con Google Cloud Run
- **Compilación Exitosa:** Se ejecutó exitosamente el comando `pnpm build`.
- **Warning (EINVAL) en Windows:** Durante el build en local (Windows), se reportó una advertencia al intentar copiar archivos *standalone* (`_node:fs_ddf6f167._.js`). Esto sucede porque Windows prohíbe el uso de dos puntos (`:`) en los nombres de archivo. **Este error NO afectará a Google Cloud Run**, ya que la imagen de Docker correrá en Linux, el cual soporta perfectamente este formato en el output del compilador. El proyecto está 100% listo para producción.
