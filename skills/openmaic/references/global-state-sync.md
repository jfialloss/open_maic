# Sincronización Global de Estado: Zustand y Firestore

## Problema de Estado Aislado vs. Estado Global

### El Diagnóstico
En la arquitectura de OpenMAIC, las preferencias como la selección del proveedor (`providerId`) y el modelo principal (`modelId`) se guardaban originalmente en `localStorage` a través del persist middleware de Zustand (`useSettingsStore`).

Esto provocaba un aislamiento total: el administrador podía cambiar el modelo LLM desde el componente de la interfaz gráfica (`GenerationToolbar`), pero este cambio sólo afectaba a su propio navegador. Los estudiantes que iniciaban sesión (o que usaban otro dispositivo) continuaban utilizando el modelo anclado a su propia memoria caché, desincronizando la experiencia.

### Arquitectura de Sincronización Global (`GlobalSettingsSync`)

Para solucionar la fragmentación del estado y permitir una única "fuente de la verdad", se aprovechó el componente de "fondo" `global-settings-sync.tsx` con la siguiente lógica:

1. **Exclusión Estratégica (`LOCAL_KEYS`)**:
   El sistema maneja un array de "llaves locales" que por naturaleza son puramente estéticas y personales para cada navegador (ej. `sidebarCollapsed`, `ttsVolume`).
   Para que una variable se vuelva "Global", **debe eliminarse** de este arreglo. Al remover `modelId` y `providerId` de `LOCAL_KEYS`, el sistema autoriza su subida a la nube.

2. **Detección de Mutaciones (Subida a Firebase)**:
   A través del método `useSettingsStore.subscribe`, el cliente del **administrador** (se valida mediante `role === 'admin'`) vigila cualquier cambio en el estado. Si un valor no incluido en `LOCAL_KEYS` muta, se crea una solicitud de escritura (`setDoc` con `{merge: true}`) al documento `/system/settings` en Firestore.

3. **Propagación en Tiempo Real (Bajada a Clientes)**:
   Todos los clientes conectados (incluidos los alumnos) mantienen un listener activo (`onSnapshot`) sobre `/system/settings`.
   Cuando Firebase propaga el cambio, el listener intercepta el payload y ejecuta un `useSettingsStore.setState(data)` forzando a la memoria caché local de todos los usuarios a alinearse inmediatamente con la voluntad del administrador.

### Reglas de Seguridad (Firestore Rules)
Esta sincronización global es segura porque depende de una jerarquía de acceso estricta administrada por las Reglas de Firestore:

```javascript
// Configuraciones del Sistema
match /system/{document=**} {
  allow read: if request.auth != null;  // Alumnos solo pueden escuchar/leer
  allow write: if isAdmin();            // Solo el administrador puede inyectar cambios
}
```
Debido a esta regla, no fue necesario realizar modificaciones a las reglas de seguridad al trasladar `modelId` al ámbito global. El rol del administrador ya tenía el privilegio de escritura garantizado sobre este documento maestro, y los alumnos el privilegio de lectura.
