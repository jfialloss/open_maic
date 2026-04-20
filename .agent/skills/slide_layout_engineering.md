# Slide Layout Engineering & Anti-Collision Guidelines

Esta guía preserva las lecciones aprendidas y reglas de arquitectura establecidas para el motor generativo de OpenMAIC, evitando regresiones (Technical Debt) en futuras actualizaciones.

## 1. Cross-Lingual Constraint Degradation (Caos de Idiomas)
**Problema:** Al enviar prompts al LLM mezclando Chino (reglas de código original), Inglés (plantillas bases) y Español (peticiones del usuario), el LLM colapsaba y omitía las reglas geométricas.
**Solución Arquitectónica:**
- El archivo `lib/generation/prompts/templates/slide-content/system.md` **SIEMPRE DEBE MANTENERSE EN INGLÉS PURO**.
- **No** dejar rastros de chino (`尺寸`, `宽高比`) en el system prompt. 
- La inyección dinámica de propiedades (ej. dimensiones de PDF) en `lib/generation/prompt-formatters.ts` debe evaluar el idioma y, por defecto, inyectar `Dimensions: XxY (aspect ratio)` en inglés, para asegurar obediencia absoluta del modelo.

## 2. Server-Side Hard Clamping (Protección Biológica de Imágenes)
Las IAs tienden a "ser creativas" y ocasionalmente intentan crear fondos de pantalla gigantes (Backposters) que arruinan la legibilidad.
- **Solución:** Independientemente de los parámetros de `width`/`height` que escupa la IA, el archivo `lib/generation/scene-generator.ts` intercepta toda ImageElement antes de ser renderizada y le aplica:
  `Math.min(width, 420)` de forma draconiana, asegurando que ninguna imagen devore la pantalla entera.

## 3. Heurística Nativa vs. Cálculo Espacial
Durante experimentos intensivos, se comprobó que introducir resolutores de colisiones 2D (AABB Bounding Box) u obligar a la IA a usar plantillas inflexibles de "Límite Absoluto 500 Y" y "Gaps de 20px" produce resultados contraproducentes en sistemas de renderizado absoluto como `.pptx`.
**Conclusión Definitiva:** El sistema más estable es proveer un marco conceptual (`The 4-Zone Modular Grid`) en el prompt del sistema y permitir que la inteligencia artificial distribuya intuitivamente los componentes. Evitar inyectarle deudas técnicas en el backend para auto-alienaciones que terminan empujando el texto fuera de la diapositiva o deformando simetrías. 

## 4. Estado Actual Purificado
La única restricción "Dura" que preservamos es el **Server-Side Hard Clamping** (sección 2) para el tamaño de las imágenes, previniendo visualizaciones monstruosas. El texto y el espaciado siguen una técnica heurística orgánica.
