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

## 3. Master Macro-Layouts (Sustitución Sistemática de Cuadrantes)
El antiguo sistema de "4-Quadrant Grid" generaba colisiones verticales porque forzaba la IA a hacer cálculos matemáticos de altura (ej. Zone 1 Height=200px) que casi siempre se desbordaban.
**La Regla de Oro:** Se usa exclusivamente el esquema de Columnas Macizas de 420x420.
- **Layout A:** Texto (Izq) | Imagen (Der)
- **Layout B:** Imagen (Izq) | Texto (Der)
- **Layout C:** Full Screen Text (Top/Center)

## 4. Typography & Vertical Rhythm (The Gap Rule)
Para que los textos luzcan profesionales tipo estandar APA, sin apelotonarse y sin sobrepasar el lienzo:
- **Title (32px)** -> *[Gap: 15px]* -> **Subtitle (24px)** -> *[Gap: 20px]* -> **Body Text (16px máximo)**.
- **Absolute Canvas Limit:** El lienzo mide `562.5px`. Toda generación de texto tiene explícitamente prohibido que la suma de su `top + height` traspase el límite de **`500px`**. Esto fuerza a la IA a resumir en lugar de desbordar la diapositiva hacia abajo.
