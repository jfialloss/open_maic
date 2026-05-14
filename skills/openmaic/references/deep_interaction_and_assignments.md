# Deep Interaction & Course Assignments Learnings

This document summarizes critical pedagogical and architectural learnings regarding the generation of interactive 3D content (Deep Interaction) and the strict management of tutor assignments in the OpenMAIC project.

## 1. Deep Interaction (Widgets & 3D Simulators) Stabilization

During the deployment preparation for Google Cloud Run, we encountered severe instability issues with the "Deep Interaction" scene generation:

- **Teacher Locks (Alucinaciones de Espera):** Gemini would frequently hallucinate "Teacher locks" (e.g., generating code that said "Wait for the teacher to explain before starting"). This caused interactive games and 3D scenes to freeze upon load. **Solution:** We strictly enforce JavaScript-native logic (`style.display`) for visibility toggling within iframes and updated prompts to bypass any "teacher wait" behavior, making widgets immediately playable.
- **Thinking Budget Optimization:** We experimented with injecting max `thinkingBudget: 4096` across *all* generated slides (standard + interactive). This proved counterproductive, resulting in API rate limits and context-dropping errors from Google's API. **Solution:** The architecture must adhere to an *Automatic Transmission* pattern: Standard slides use base models, while only `interactive` and `pbl` (Problem-Based Learning) scenes receive the full `thinkingConfig` object.
- **Multi-Language (i18n) Parameter Passing:** We identified that widgets were generating in random languages because the `languageDirective` parameter was silently omitted when calling `generateSceneContent`. **Solution:** Always extract and pass `languageDirective` from the request body down to the AI model context to ensure strict bilingual compliance (English/Spanish).

## 2. Strict Pedagogical Control: Assigned Courses

The platform distinguishes between self-generated student courses and **Tutor-Assigned Courses**. To prevent students from bypassing evaluations:

- **Ghost Reappearance Bug:** Students previously deleted assigned courses from their dashboard to avoid taking them, but because the course was still flagged as assigned in Firestore, the course would reappear upon the next login.
- **Admin "Unassign" Feature:** To truly remove an assignment, it must be removed from the source. We added an "Unassign" (Desasignar) feature in the Admin `Control de Asignaciones` dashboard.
- **Firestore Logic:** Unassigning a course permanently deletes the record using the `deleteField()` command via `updateDoc` directly on `users/{studentUid}/data/profile` at the key `assignedCourses.{stageId}`.

## 3. Deployment Safety (Google Cloud Run)

Before deploying to Google Cloud Run, always run `npm run build` locally. We caught two critical blocking errors that would have crashed the container:
1. **Type Definitions:** A mismatch in the `ThinkingConfig` type definition (`lib/types/provider.ts`) versus the `route.ts` API endpoint.
2. **Undeclared Variables:** An `isServerConfigured` variable was being invoked without declaration in `provider-config-panel.tsx`.

*Always verify TypeScript strictness prior to pushing commits for cloud deployments.*
