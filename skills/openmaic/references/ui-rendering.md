# UI Rendering & Iframe Transparency Quirks

## Problema de Contraste en Simuladores (Black Background)

### El Diagnóstico
En OpenMAIC, las herramientas interactivas, como los juegos o simuladores ("Deep Interaction"), son inyectadas y renderizadas dentro de etiquetas `<iframe>` estáticas para aislar el código HTML/JS generado por la IA.
Por defecto en el desarrollo web, el `body` de un `<iframe>` es **transparente** si no se le especifica un color de fondo.

Dado que OpenMAIC opera nativamente bajo un tema oscuro (Dark Mode), ese fondo oscuro se trasluce hacia el interior del iframe. Paralelamente, cuando la IA dibuja sobre lienzos HTML (`<canvas>`), los estilos predeterminados de trazado y de texto web son de color **negro** (`ctx.fillStyle = 'black'`).

Esto provoca un problema crítico de contraste: objetos negros o textos oscuros se dibujan sobre un fondo transparente que revela el gris muy oscuro de la plataforma, volviendo el contenido invisible u hostil para la lectura.

### Soluciones Implementadas / Recomendadas

Para erradicar la dependencia de que la IA recuerde aplicar un fondo claro, la solución arquitectónica implementada se enfoca en el frontend que aloja al iframe, no en el prompt de la IA.

1. **Forzar `bg-white` en el Componente Base (Mejor Solución)**:
   Al aplicar estilos o clases en el componente envoltorio (por ejemplo, en `BaseWidgetElement.tsx` o `interactive-renderer.tsx`), se fuerza que el fondo sólido por defecto del iframe sea blanco.
   ```tsx
   <iframe
     className="w-full h-full border-0 bg-white" // <-- Forzar fondo blanco
     srcDoc={patchedHtml}
     // ...
   />
   ```
   *Efecto*: Si la IA omite declarar un `background-color` en su CSS, el canvas adoptará el color blanco provisto por el componente nativo de React, garantizando legibilidad perfecta para dibujos o textos negros.

2. **Mitigación por Prompt (Fallback)**:
   En los archivos `system.md` de generación (ej. `simulation-content`), se puede añadir una directiva menor instando a la IA a proveer explícitamente estilos base, aunque la solución #1 es invulnerable a las "alucinaciones" (olvidos) de la IA.
   ```css
   body { background-color: #ffffff; color: #000000; }
   ```

### Excepciones
El widget de Visualización 3D (`visualization3d`) maneja su propio ecosistema de luces e implementa un fondo `#0a0a1a` directamente en la directiva del prompt. Debido a la cascada de estilos web, si la IA sí especifica un fondo para el body, este **anula/sobreescribe** el `bg-white` aplicado al componente iframe, manteniendo intactos los diseños oscuros (como la simulación del espacio o el sistema solar) mientras protege el resto de widgets convencionales.
