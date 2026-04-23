# Canvas & HTML Widget UI Guidelines

Esta guía documenta los estándares de diseño y estética establecidos para los Canvas Interactivos (HTML Widgets) generados por el LLM en OpenMAIC.

## 1. El Problema del Diseño "Plano"
En iteraciones anteriores, el LLM generaba las simulaciones interactivas usando HTML/JS puro y estilos básicos, resultando en interfaces poco atractivas. Aunque se permitía TailwindCSS, la falta de directrices específicas causaba que el LLM usara paletas de colores discordantes, bordes rectos y ningún tipo de iconografía profesional.

## 2. Estándar "Premium" Obligatorio (Actualización 2026)
Para asegurar que los Canvas se vean como aplicaciones web modernas y profesionales, se han inyectado reglas estrictas en el prompt (`lib/generation/prompts/templates/interactive-html/system.md`):

### 2.1. Framework y Dependencias Permitidas
*   **Tailwind CSS:** Vía CDN. Es el motor principal de estilos.
*   **Lucide Icons:** Vía CDN (`lucide@latest`). Es OBLIGATORIO usar `lucide.createIcons()` en el script JS para evitar que la IA use emojis de texto o dibuje SVGs feos.
*   **No React/Vue:** Todo debe seguir siendo HTML y JavaScript nativo.

### 2.2. Reglas de Estética y UI
1.  **Diseño Flotante (Glassmorphism / Soft-UI):** Uso intenso de bordes muy redondeados (`rounded-2xl`, `rounded-3xl`) y sombras amplias (`shadow-lg`, `shadow-xl`) en paneles y controles para dar la sensación de elevación y profundidad.
2.  **Theming Semántico Dinámico (Light vs Dark):** En lugar de forzar un fondo claro (`bg-slate-50`) para todo, el LLM debe elegir semánticamente la paleta basándose en el contexto científico de la simulación:
    *   Si el tema implica oscuridad (Astronomía, Óptica, Noche): Debe usar un **Dark Theme** (`bg-slate-900`, `text-white`) para toda la página, y pintar los elementos del canvas en colores claros.
    *   Si el tema es general (Matemáticas, Biología): Debe usar un **Light Theme** (grises suaves como `bg-slate-50`) con textos oscuros.
3.  **Animaciones Fluidas:** Se prohíben los cambios de estado bruscos en la interfaz. Toda la UI (botones, hover states, fondos cambiantes) debe aprovechar clases como `transition-all duration-300` (o `500`).
4.  **Layout y Alineación Segura (El Esqueleto Estricto):** Para evitar que los botones o textos se monten sobre el canvas y lo bloqueen, se ha impuesto un **"Strict Layout Skeleton"**. El LLM tiene PROHIBIDO colocar controles sobre el canvas. Debe dividir la pantalla usando Flexbox:
    *   Una zona principal (`<main class="flex-1 relative">`) exclusiva para el `<canvas>`.
    *   Un panel lateral o inferior (`<aside class="w-full md:w-80 [BG_PANEL] shadow-2xl z-10">`) exclusivo para controles.
5.  **Visibilidad y Contraste Absoluto:** El LLM debe garantizar contraste total entre sus dibujos 2D y el fondo semántico elegido en el paso 2. Queda estrictamente prohibido el "blanco sobre blanco" o "negro sobre negro". Las estrellas siempre deben ir sobre fondos oscuros.
6.  **Estabilidad de la UI (Anti-Saltos):** 
    *   **Límites de Posicionamiento:** Si se usan elementos flotantes (`absolute`), su contenedor padre DEBE llevar `relative overflow-hidden` para que no vuelen fuera de la pantalla.
    *   **Alturas/Anchos Seguros:** Las cajas que contengan texto dinámico deben tener mínimos fijos (ej. `min-h-[60px]`) para que el layout no "salte" al cambiar su contenido.
    *   **Cambios de Estado:** En lugar de crear y destruir nodos del DOM (lo que causa "reflows" y saltos en la interfaz), se debe pre-renderizar todo y ocultar/mostrar elementos alternando clases de Tailwind como `hidden` y `block`.
7.  **Seguridad de Coordenadas en Canvas 2D (Anti-Fuera-de-Pantalla):**
    *   **Mapeo de Escala (Scaling):** Es el error más común al simular física o astronomía. El LLM tiene PROHIBIDO dibujar objetos usando sus distancias físicas reales como píxeles (ej. dibujar la luna a `x = 384400`). Siempre debe calcular un "Scaling Factor" (`canvas.width / max_distance`) para mapear el mundo físico a la pantalla.
    *   **Transformaciones Seguras:** Dentro del ciclo `requestAnimationFrame`, toda traslación (`ctx.translate`) o rotación DEBE estar envuelta siempre entre `ctx.save()` y `ctx.restore()`. De lo contrario, las transformaciones se acumularán infinitamente y el dibujo saldrá volando de la pantalla en menos de 1 segundo.

## 3. Arquitectura del Prompt
Si en el futuro se modifican o añaden nuevos templates generativos que involucren interfaces HTML para el usuario, **DEBEN** heredar estas instrucciones de UI Design. El objetivo es mantener una coherencia visual en todo el LMS, independientemente de qué LLM genere el contenido.
