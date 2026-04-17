# Cloud Sync & Firestore Anti-Duplication

This document outlines the architectural rules for the Firestore-based Global Library (`global_classrooms`), the Anti-Duplication Shield, and Cloud Synchronization processes. OpenMAIC saves courses to IndexedDB natively, but synchronizes them to Firebase for public sharing.

## 1. Early Reservation (Anti-Duplicado)
To prevent multiple users or agents from generating the same expensive course simultaneously:
- A `status: 'building'` stub is pushed to Firestore immediately when generation starts (`app/generation-preview/page.tsx`).
- Before starting generation, the client checks if a course with similar text/meaning exists in `global_classrooms` under the same `subject`.
- If an existing course is found in `status: 'building'`, the user is strictly blocked via an alert. If it's `status: 'completed'`, the user is warned and prompted to decide if they want to clone it for free or force generation.

## 2. Auto-Publishing via Zustand Subscriptions
A generated course is only published as `status: 'completed'` to the cloud when all its media finishes rendering locally.
- **Critical Mechanism**: `app/classroom/[id]/page.tsx` uses standard Zustand `.subscribe` listeners on both `useStageStore` and `useMediaGenerationStore`.
- **Text-Only Courses**: A course is considered `isExportable` even if there are 0 media tasks (`Object.keys(mediaTasks).length === 0`). DO NOT require `mediaTasks.length > 0` as this permanently locks text-only courses in the `building` state.
- **Rule**: Never replace the `.subscribe` architecture in the classroom player with a single check. Media generates asynchronously and incrementally. 

## 3. Local-Only Exception
Courses generated with the subject `"none"` (or "Libre" in UI) are strictly private.
- **Rule**: Never publish `subject: 'none'` courses to `global_classrooms`. The system deliberately skips the `publishBuildingStageToCloud` and final cloud sync for these courses.

## 4. Firestore Security Setup
The `global_classrooms` collection is dynamically generated. 
- The project's raw Firestore schema does not pre-define it. It is explicitly protected by:
```javascript
  match /global_classrooms/{document=**} {
    allow read, write: if request.auth != null;
  }
```
- If you encounter `net::ERR_QUIC_PROTOCOL_ERROR.QUIC_TOO_MANY_RTOS` or `net::ERR_NETWORK_CHANGED` during `setDoc`, it means the client's socket connection temporarily died. Firestore Web SDK masks this by caching the write indefinitely (hanging). Inform the user to restart their browser.

## 5. TTS Identity Injection
The `agent-profiles` API relies on `[System Note: The TTS voice selected for the AI teacher is "<Voice_ID>"]` injected into the initial `requirement` string to assign the correct gender/persona to the teacher avatar.
- **Rule**: When modifying generation pipelines or API routes (`/api/generate/agent-profiles`), YOU MUST ALWAYS pass down the full `requirement` payload intact. Do not skip it, or the AI will assign female names/personas to male TTS voices and vice versa.
