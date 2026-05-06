# Whiteboard Architecture & Interactive Navigation

Esta guía documenta los estándares arquitectónicos y patrones de diseño utilizados en la modernización de la Pizarra Interactiva (Whiteboard) de OpenMAIC.

## 1. Navegación del Lienzo (Pan, Zoom y Auto-fit)

Para ofrecer una experiencia inmersiva en un lienzo "infinito", se ha sustituido el Canvas estático por un Canvas Interactivo soportado por eventos de puntero y matemáticas de transformación.

### 1.1. Gestión de Eventos y Transformaciones
*   **Puntero (Pointer Events):** Utilizamos `onPointerDown`, `onPointerMove`, `onPointerUp` en lugar de eventos de Mouse clásicos para asegurar compatibilidad universal con pantallas táctiles, stylus y ratones.
*   **Transformaciones CSS:** La cámara/vista se maneja aplicando `transform: translate(x, y) scale(z)` a un contenedor interno, evitando re-renderizados costosos de cada elemento individual.
*   **Framer Motion:** Se utiliza para la orquestación de animaciones de entrada, salida (`isClearing`), y restablecimiento de la vista (`resetView`), lo cual provee interpolaciones fluidas sin escribir CSS complejo.

### 1.2. Algoritmo de Auto-Fit
El sistema calcula la *Bounding Box* (caja delimitadora) de todos los elementos dibujados por el Agente. Si el contenido desborda los límites estándares (1000x562.5), el sistema calcula automáticamente el `scale` y `translate` óptimos para alejar la vista y enmarcar la obra de arte generada sin recortarla.

---

## 2. Historial de Pizarra y Almacenamiento Efímero

### 2.1. Almacenamiento In-Memory (Zustand)
A diferencia de otros datos que se persisten en IndexedDB, **el historial de la pizarra es estrictamente efímero (In-Memory)** durante la sesión del usuario.
*   **Razón:** Guardar instantáneas completas del árbol de objetos JSON repetidas veces saturaría IndexedDB y ralentizaría la aplicación de forma crítica debido al costo de I/O de disco.
*   **Seguridad:** Mantiene la información volátil; al salir de la clase, el historial se borra purificando la memoria y evitando contaminación entre sesiones (`useWhiteboardHistoryStore.getState().clearHistory()`).

### 2.2. Huella Digital (Fingerprinting)
Para evitar saturar el historial con el mismo estado (por ejemplo, después de esperar 2 segundos varias veces), se utiliza el algoritmo `elementFingerprint` en `lib/utils/element-fingerprint.ts`.
*   Extrae un resumen semántico de cada elemento (combinando `id`, geometría, e información semántica como `src` o `content`).
*   Esto asegura que un *Restore* no-op no genere loops infinitos y garantiza que el auto-guardado sea extremadamente preciso en su detección de cambios reales.

### 2.3. Respaldo Automático
Es obligatorio inyectar un *snapshot* en el historial **justo antes** de despachar cualquier evento de limpieza o sobrescritura profunda (`wb_clear`).
*   Esto ocurre tanto en las acciones de interfaz gráfica de usuario (botón Borrar en `index.tsx`) como a través de comandos generados por la Inteligencia Artificial (dentro del `ActionEngine`).

---

## 3. Internacionalización (i18n) fuera de React

El sistema de traducciones estándar usa el Hook de React `useI18n`. Sin embargo, los servicios subyacentes como `ActionEngine` necesitan invocar traducciones imperativamente para etiquetas como los nombres de las instantáneas del historial.
*   Para lograr esto, se expone `getClientTranslation` desde `lib/i18n/index.ts`.
*   Esta función lee explícitamente `localStorage.getItem('locale')` haciendo el sistema inmune a errores de contexto en áreas puramente de TypeScript.
