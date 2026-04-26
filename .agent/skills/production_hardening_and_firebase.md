# Producción, Seguridad en Firebase y Refinamientos de UI/UX

Este documento registra las lecciones aprendidas, patrones de código y correcciones estructurales aplicadas durante el hardening del proyecto OpenMAIC para su puesta en producción y su estabilización operativa.

## 1. Reglas de Seguridad en Firebase (Firestore y Storage)

Para proteger los datos de la plataforma y evitar accesos no autorizados a colecciones globales y archivos de usuarios, se deben seguir reglas estrictas:

### Firestore (`firestore.rules`)
- **Aislamiento por usuario**: Las subcolecciones como `user_classrooms`, `learning_history` y `agent_registry` deben verificar que `request.auth.uid == userId`.
- **Colección Global (`global_classrooms`)**: Cualquier usuario autenticado puede leer. Para **crear, actualizar o borrar**, la regla exige que el campo `createdBy` del documento coincida con el UID del usuario que realiza la petición (`request.auth.uid == request.resource.data.createdBy`).

### Storage (`storage.rules`)
- **Atención a las rutas reales**: La plataforma guarda los medios generados en `/courses_media/{classroomId}/{fileName}`. Las reglas de Storage deben reflejar esta ruta exacta, no aproximaciones (ej. evitar el uso erróneo de `/classrooms/`).
- **Permisos de lectura/escritura**: Se requiere `request.auth != null` para interactuar con los artefactos de un curso, permitiendo que la App lea y escriba audios/imágenes para los cursos en sesión.

---

## 2. Autenticación en Endpoints Internos (/api/generate/*)

Los endpoints de Next.js que interactúan con modelos de IA (llm) ahora están protegidos y requieren un token Bearer en las cabeceras.

**Patrón de Inyección de Tokens desde el Frontend:**
Cualquier llamada a un endpoint de generación (`scene-outlines-stream`, `scene-content`, `scene-actions`, `tts`) desde el cliente debe invocar asíncronamente las credenciales actuales:
```typescript
import { auth } from '@/lib/firebase';

const getApiHeaders = async () => {
  let token = '';
  if (auth.currentUser) {
    token = await auth.currentUser.getIdToken();
  }
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    // ...resto de cabeceras
  };
};

// Uso en fetch
fetch('/api/generate/endpoint', {
  headers: await getApiHeaders(),
});
```
*Errores Históricos*: El sistema fallaba devolviendo `401 Unauthorized` repetidamente cuando olvidaba agregar el token a operaciones encadenadas (como la generación del TTS).

---

## 3. Publicación Dinámica a la Nube (Cloud Sync)

Todas las funciones encargadas de subir cursos o metadatos a Firestore global (`publishBuildingStageToCloud`, `publishStageToCloud`) **nunca** deben usar strings quemados (hardcoded) como `"system"` o `"Docente NEWMAN"`. Hacerlo violará la regla `request.resource.data.createdBy == request.auth.uid`.

**Ubicaciones Críticas Actualizadas:**
1. Inicio de Generación: `app/generation-preview/page.tsx`
2. Finalización de Generación: `app/classroom/[id]/page.tsx`
3. Sincronizador Pasivo (Recovery): `app/page.tsx`

Siempre extraer las credenciales reales:
```typescript
const user = auth.currentUser;
if (user) {
  await publishStageToCloud(classroomId, user.uid, user.displayName, subject);
}
```

---

## 4. UI/UX: Secuenciación Académica y "Spotlight"

### Bloqueos de Progreso Pedagógico
En `app/page.tsx`, se configuró un sistema para evitar saltos en el temario. 
- Los alumnos **solo pueden acceder** a temas dominados o al **primer tema no dominado** en la secuencia.
- Los temas subsecuentes se visualizan como "Bloqueados" (icono de candado) impidiendo la selección.
- Para lograr esta lógica en el JSX de Next.js sin romper Turbopack, se recomienda agrupar la lógica de estado dentro de una función autoejecutable IIFE: `{(() => { const state = ... return <Component /> })()}`.

### Efecto Spotlight (Resaltador)
El componente visual `SpotlightOverlay.tsx` abandonó el fondo "negro brusco" (opacidad 0.7) en favor de una experiencia inmersiva:
1. **Fondo**: Menor opacidad oscura (`rgba(0,0,0,0.35)`) apoyada de mayor desenfoque CSS (`backdrop-blur-[2.5px]`).
2. **Marco Brillante (Glow)**: Se introdujo un `svg <filter>` (con `feGaussianBlur`) para crear un efecto de "láser o neón" alrededor del componente apuntado por el profesor, usando el color institucional `rgba(14, 165, 233, 0.95)` (Sky Blue).

---

## 5. Diseño de Prompts (Prompt Engineering) e Inyección de Variables

**El problema del Modo Interactivo sin Imágenes:**
Descubrimos que si el sistema usaba el prompt de "Interacción Profunda" (`interactive-outlines/system.md`), ignoraba por completo generar imágenes porque ese prompt carecía de las instrucciones de `mediaGenerations`.

**Solución aplicada:**
1. A las plantillas especializadas **se les debe copiar explícitamente** la sección completa de directivas de medios (`## AI-Generated Media`) si se desea mantener paridad de funcionalidades.
2. **Sintaxis Crítica del Loader**: El orquestador de variables (`lib/generation/prompts/loader.ts`) usa Regex para interceptar variables con llaves **dobles**. Es obligatorio escribir `{{variableName}}`. Si se utiliza una sola llave `{variableName}`, el inyector no la reconocerá y el modelo recibirá el string en crudo.

---

## 6. Access Control (Client-Side) y Race Conditions

### Bloqueo de Acceso por Dominios y Lista Blanca
Se estableció un mecanismo de **Acceso Controlado** a nivel del Frontend mediante Google OAuth (`signInWithPopup`).
- **Dónde**: En `app/login/page.tsx` (después del popup) y en el middleware global de estado `lib/hooks/use-auth.tsx` (`onAuthStateChanged`).
- **Condiciones**: El usuario debe pertenecer a uno de los dominios permitidos (`spearhead.global`, `newman.education`, `vitaprofamilia.org`), a la lista blanca de correos excepcionales (`spearhead.ec@gmail.com`), o ser el administrador configurado (`NEXT_PUBLIC_ADMIN_EMAIL`).
- **Acción**: Si no cumple, se ejecuta inmediatamente `auth.signOut()` evitando cualquier redirección a `/` y se muestra un `toast.error` utilizando colores enriquecidos (`richColors` en `sonner`).

### Prevención de "Race Conditions" de Hidratación en Firebase
Los hooks de `useEffect` que lanzan consultas contra Firestore deben verificar SIEMPRE que `user` o `auth.currentUser` exista **antes** de ejecutarse. 
- **Error Evitado**: `FirebaseError: Missing or insufficient permissions.`
- **Caso**: En `app/page.tsx`, la función `validateCloud` consultaba `global_classrooms` (donde la regla de Firestore requiere `request.auth != null`) de inmediato. Al no verificar primero si `useAuth().user` ya estaba cargado, la consulta se disparaba en los milisegundos donde Firebase aún consideraba al usuario como anónimo, provocando un error de permisos en la consola.
