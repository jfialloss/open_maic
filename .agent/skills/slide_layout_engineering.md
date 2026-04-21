# Slide Layout Engineering & Anti-Collision Guidelines

Esta guía preserva las lecciones aprendidas y reglas de arquitectura establecidas para el motor generativo de OpenMAIC, evitando regresiones (Technical Debt) en el diseño de las diapositivas.

## 1. El Fracaso de las Heurísticas de Layout (La Crisis de 2026)
Durante los primeros experimentos, se le pidió al LLM que calculara libremente `x`, `y`, `width`, `height` y predijera el espacio usando "Text Height Lookup Tables". 
**Resultado:** Desastre total. El LLM es matemáticamente incompetente para predecir colisiones de fuentes HTML en pantalla. Arrojaba textos gigantes que sobrepasaban su caja delimitadora, montándose sobre imágenes.
**Corolario:** JAMÁS devolverle al LLM el control sobre la geometría `left`, `top`, `width` y `height` del contenido principal (Textos descriptivos, Títulos e Imágenes).

## 2. La Arquitectura Salvavidas: Slide Templates (El Motor de Plantillas)
Para asegurar "Cero Colisiones", OpenMAIC ahora utiliza un motor de Inyección de Plantillas estáticas en el backend (`lib/generation/slide-templates.ts`):
*   El **LLM solo elige el nombre del layout** (ej. `IMAGE_RIGHT`) y devuelve los contenidos por `slots` (`title`, `leftText`, `rightMedia`).
*   **El servidor** acopla estos slots a rectángulos duros imperturbables basados en un **4-Zone Modular Grid**. 

### 2.1 CSS Guillotine (`TextElement.tsx`)
Dado que se ordenó estrictamente **JAMÁS achicar la fuente de los textos** (AutoFit = OFF), cualquier texto largo que sobrepase su slot en el frontend será recortado y ocultado visualmente mediante el uso de altura explícita (`height: XXXpx; overflow: hidden;`). Esto asegura estética perfecta frente a una IA que hable de más.

### 2.2 Purado Inflexible de Estilos Locales
Los LLM suelen devolver Párrafos con atributos sucios: `<p style="font-size: 10px;">`. El ensamblador del servidor está programado para borrar CUALQUIER atributo `style=` inyectado por la IA, obligando a usar siempre el tamaño y color dictaminado por la Plantilla, asegurando homogeneidad en Títulos y Subtítulos inter-diapositivas.

## 3. Supplementary Floating Elements
Como única excepción a la regla de las coordenadas matemáticas libres, el LLM todavía tiene permiso para emitir elementos geométricos flotantes **puramente decorativos** (`LineElement` para flechas, `ShapeElement` para marcas) dentro del arreglo nativo `elements`, ya que estos no sufren de expansión tipográfica. Todo tipo de `Text` o `Image` que el LLM intente inyectar manualmente aquí es sistemáticamente borrado por el Agente Limpiador en `scene-generator.ts`.

## 4. Cross-Lingual Constraint Degradation (Caos de Idiomas)
**Problema:** Al enviar prompts al LLM mezclando Chino (código original), Inglés (plantillas bases) y Español (usuario), el modelo sufre de "amnesia de contexto".
**Solución Arquitectónica:**
- El archivo `system.md` **SIEMPRE DEBE MANTENERSE EN INGLÉS PURO**. Ningún rastro de chino o heurísticas rotas.
