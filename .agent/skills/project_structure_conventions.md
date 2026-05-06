# Convenciones de Estructura de Proyecto y Archivos

Esta guía documenta los estándares acordados para la organización de archivos auxiliares, respaldos y temporales dentro del repositorio de OpenMAIC para mantener un entorno de desarrollo limpio y óptimo.

## 1. Archivos de Parche y Respaldos (Patches)

A medida que el proyecto evoluciona y se extraen características de otros repositorios (como OpenMAIC original), es común manejar archivos `.patch`. Para evitar el desorden en la raíz del proyecto, se deben seguir estas reglas:

### 1.1. Uso de Carpetas con Prefijo Ignorado (`_`)
*   **Regla:** Los archivos auxiliares, parches o documentos históricos que pertenezcan a la estructura del proyecto pero que no sean código ejecutable, deben ubicarse en carpetas que comiencen con un guion bajo (`_`). Por ejemplo: `_patches/`.
*   **Justificación Arquitectónica:**
    1.  **Enrutador de Next.js (App Router):** Next.js ignora por defecto cualquier carpeta que comience con un guion bajo. Esto asegura que la carpeta no genere rutas no deseadas ni interfiera con el ciclo de empaquetado del frontend.
    2.  **Ignorado por el Compilador:** Al ser archivos de texto plano (.patch) y estar en una ruta no referenciada por el código fuente, el compilador de TypeScript y herramientas como ESLint los saltarán automáticamente, evitando errores de análisis (parsing errors).
    3.  **Mantenibilidad:** Mantiene la raíz del proyecto limpia y visualmente clara, pero retiene el conocimiento y los respaldos de código para futuras referencias.
