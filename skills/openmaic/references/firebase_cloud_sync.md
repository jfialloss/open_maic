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
The `global_classrooms` collection is explicitly protected to prevent unauthorized deletions and maintain data ownership.
- **Rule**: Deletion of `global_classrooms` is restricted to the original author or global administrators via an `isAdmin()` helper function.
- **Rule**: Admins must have global read access to the `users` collection to audit platform usage.

## 5. Anti-Corruption & Safe Deletion (Admin Check)
To prevent administrators from deleting courses that are currently being actively studied:
- **Root Sync**: The `components/user-profile-sync.tsx` automatically flattens and pushes the user's active course IDs into an `activeCourseIds` array at the root of their `users/{userId}` document.
- **Usage Validation**: Before an admin deletes a course from the Global Library, the system performs an `array-contains` query on the `users` collection. If the course ID is found in any student's `activeCourseIds`, the deletion is blocked.
- **Firebase Rules Syntax Trap**: To allow students to write this array to their root document while maintaining security for subcollections, the `firestore.rules` MUST use nested matching:
  ```javascript
  match /users/{userId} {
    allow read, write: ...
    match /{document=**} {
      allow read, write: ...
    }
  }
  ```
  **Do NOT** use `match /users/{userId}/{document=**}` as this matches subcollections but explicitly denies writes to the root `userId` document itself.

## 6. TTS Avatar & Gender Synchronization
To ensure the AI teacher's appearance perfectly matches their generated text-to-speech voice gender:
- **Deterministic Prompting**: LLMs have a strong bias toward generating male teachers. To enforce a 50/50 gender balance, the teacher avatar (`teacher.png` or `teacher-2.png`) is randomly chosen on the Next.js backend (`app/generation-preview/page.tsx`) and passed as the *only* option to the LLM.
- **Voice Inference**: The audio engine (`inferTeacherVoice` in `use-scene-generator.ts`) determines the TTS voice gender directly from the avatar filename assigned by the LLM (`-2.png` = female). It no longer attempts to guess the gender by running regex on the persona text, eliminating mismatches caused by ambiguous language.
