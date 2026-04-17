# Next.js Docker / Cloud Deployment & Typescript Strictness
**Focus**: Resolving `auth/invalid-api-key` Firebase build errors in Next.js, understanding Github Secret Scanning behavior for Firebase, and fixing strict typings on cloud sync deserialization.

## 1. Firebase Client API Keys & GitHub Secret Scanning
- **The False Positive**: GitHub's automated secret scanner uses generalized Regex rules that identify any string starting with `AIzaSy...` as a "Google API Key". If committed to a repo (like inside `.env.production`), it will block pushes.
- **The Reality**: Firebase API Keys (`NEXT_PUBLIC_FIREBASE_API_KEY`) used for web clients are inherently designed to be public identifiers. They MUST go out in the HTML/JS bundle for browsers to connect to Firebase.
- **Defense Mechanism**: Protecting Firebase is conceptually decoupled from key secrecy. Protection relies strictly on Firebase Security Rules (`firestore.rules`, `storage.rules`).
- **Standard Protocol**: It is completely safe to commit `NEXT_PUBLIC_FIREBASE...` to `.env.production` files. When GitHub flags these as vulnerabilities, developers must mark them as "False Positives - Used in tests / public".

## 2. Next.js Build-Time Validation in Docker Containers
- **The Docker Build Choke Point**: Cloud Run defines Runtime variables, but Next.js **requires** `NEXT_PUBLIC` variables to be physically present at Build Time (e.g., `npm run build`), otherwise they compile to `undefined`. This effectively locks the frontend out of Cloud Run injected runtime strings.
- **The `_not-found` Prerender Trap**: During Cloud Build (Step 0) / `Dockerfile` Builder Stage, any page or component that relies on Firebase (even indirectly like `_not-found` loading a layout) will execute `initializeApp()`. If the Firebase configs are missing at build time, Next.js throws an `auth/invalid-api-key` error and aborts the entire deployment pipeline.
- **The `.dockerignore` Exception Solution**: Since Cloud Build executes within a Docker layer, placing `!.env.production` in `.dockerignore` ensures the Next.js `npm run build` process successfully locates the expected `NEXT_PUBLIC` client strings without complex substitution pipelines. 

## 3. Strict Hydration from `Partial<>` Data Sources (Firestore)
- **Undefined Risk in TypeScript**: When data is retrieved from Firestore `DocumentSnapshot`, the resulting types are cast as `Partial<StageStoreData>`. This permits properties to arrive as `undefined`.
- **Rigid Fallbacks for Storage**: When injecting this downloaded data into rigid, strictly typed client stores (like Dexie IndexedDB via `saveStageData()`), falling back properties with improper primitives triggers pipeline failures.
  - *Example 1*: `undefined` values for required `stage` blocks mandate explicit existence checks: `if (!cloudData.stage) throw new Error(...)`.
  - *Example 2*: Arrays incorrectly defaulted via `{}` (e.g., `chats: cloudData.chats || {}`) vs arrays `[]` (e.g., `chats: cloudData.chats || []`) will generate rigid type mismatches. Always match the canonical structure explicitly.
