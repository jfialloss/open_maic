# English CEFR Curriculum Integration

## 🎯 Objetivo Arquitectónico
Implementar la materia de "Inglés" bajo el estándar internacional CEFR (A1 a C2) como una entidad curricular completamente independiente del Grado Escolar del usuario, forzando la generación de clases mediante Inteligencia Artificial estrictamente en idioma inglés.

---

## 🛠️ Modificaciones Clave del Sistema

### 1. Currículo Autónomo (Syllabus)
- **Ruta:** `lib/data/syllabus.json`
- **Estructura:** Se agregó `"Inglés"` como una categoría de nivel superior paralela a *Matemáticas* o *Ciencias*. Sus "subniveles" no son grados (ej. Básica Media), sino los niveles CEFR: `"A1", "A2", "B1", "B2", "C1", "C2"`.
- **Idioma Nativo:** Todo el contenido de la materia de inglés (nombres de bloques, objetivos, temas) está escrito **estrictamente en inglés**. Esto es vital para el motor de *Prompt Engineering*, garantizando que la IA reciba su contexto nativo sin interferencias del español.

### 2. Estado Global Desacoplado (Zustand)
- **Ruta:** `lib/store/user-profile.ts`
- **Propiedad `englishLevel`:** Se integró al perfil del usuario con valor por defecto `"A1"`.
- **Auto-Ascenso (Auto-Upgrade):** En la acción `addMasteredTopic`, se implementó un algoritmo de escaneo. Cuando un alumno supera un tema, el algoritmo itera los temas de su nivel de inglés actual. Si el 100% de los temas de ese nivel están marcados como superados, el usuario es ascendido automáticamente al siguiente nivel CEFR.
- **Sincronización:** El componente `UserProfileSync` captura `englishLevel` dinámicamente y lo serializa a `users/{uid}/data/profile` en Firestore.

### 3. Escudo de Prompt (Prompt Shielding)
- **Ruta:** `app/page.tsx`
- **Generación de Contexto:** Cuando se detecta que `form.subject === 'ingles'`, se descarta el `curriculumContext` en español y se inyecta un `[CRITICAL INSTRUCTION]` que **obliga a Gemini 1.5 a ignorar el idioma UI** y generar todas las instrucciones de la clase, quizzes, diálogos del profesor virtual, y simulaciones interactivas exclusivamente en inglés.
- **UI & Formularios:**
  - El selector visual cambia automáticamente la salida a `en-US`.
  - El prompt sugerido para el usuario cambia del español al inglés ("I want a class about the topic...").

### 4. Interfaz de Usuario Bloqueada (UI Guardrails)
- **Avatar & Ajustes:** El nivel de inglés se muestra permanentemente en el avatar del usuario (`7º Grado de EGB • Nivel: A1`).
- **Seguridad:** El selector manual de `englishLevel` está deshabilitado (`disabled`) con un tooltip informativo, forzando al usuario a cursar los temas progresivamente y depender del algoritmo de Auto-Upgrade del store.

---

## ⚠️ Reglas de Mantenimiento Futuro
1. **No mezclar grados y CEFR:** Si en el futuro se agregan nuevas materias de idiomas (ej. Francés), estas deben seguir la misma arquitectura de desacople y usar sus respectivos marcos comunes de referencia en lugar del grado académico.
2. **Traducciones UI:** Para la UI, los niveles (A1, A2, etc.) deben ser mostrados como cadenas literales, ya que el acrónimo es universal y no requiere paso por i18n.
3. **Cloud Sync:** El archivo `lib/utils/cloud-sync.ts` es agnóstico del subject. Evitar codificar lógicas de idioma duro ("hardcode") dentro del publicador en Firebase. La lógica del idioma siempre debe residir en el generador de prompts (`app/page.tsx` / `scene-builder.ts`).
