# Security and Token Consumption Optimization

## 1. Securing Backend Endpoints
In the OpenMAIC architecture, generation endpoints in `app/api/*` that consume expensive API keys (e.g. OpenAI, Google) **must** be strictly protected against unauthenticated abuse. The project relies on Firebase Auth tokens transmitted via HTTP headers.

**Key Rule:** Any route that performs LLM generation or sensitive actions must invoke the `authenticateRequest(req)` middleware from `@/lib/server/auth.ts`.

### Security Implementation Pattern:
```typescript
import { authenticateRequest } from '@/lib/server/auth';
import { apiError, apiSuccess } from '@/lib/server/api-response';

export async function POST(req: NextRequest) {
  try {
    // 1. Strict Authentication Check
    await authenticateRequest(req); 
    
    // ... execution logic
  } catch (error) {
    // 2. Explicitly handle Unauthorized errors
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Authorization'))) {
      return apiError('UNAUTHORIZED', 401, 'Unauthorized request');
    }
    return apiError('INTERNAL_ERROR', 500, String(error));
  }
}
```

### Frontend Token Injection:
When calling the backend from client-side React components (like `use-chat-sessions.ts` or `provider-config-panel.tsx`), always inject the Firebase ID token in the `Authorization` header:

```typescript
import { auth } from '@/lib/firebase';

const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';

const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${idToken}`
  },
  body: JSON.stringify({...}),
});
```

---

## 2. Token Consumption: Sliding Window Truncation
Interactive chats (where AI avatars respond iteratively to the user) are prone to **quadratic token consumption** if the entire message history is sent back to the LLM on every turn.

To prevent this, OpenMAIC implements a **Sliding Window Truncation** algorithm in `lib/orchestration/prompt-builder.ts` (`convertMessagesToOpenAI`).

### How it works:
1. The history is sliced to the last `maxMessages` (e.g., 15) turns.
2. If truncation occurs, a silent `[System]` note is injected at the beginning of the prompt: `[Earlier conversation history has been truncated for length. Continue the lesson naturally based on the current context.]`.
3. **Context Preservation:** Since the physical classroom state (Whiteboard contents, Slide elements) is passed independently via `storeState`, the LLM loses memory of exact verbal interactions from 20 turns ago, but *retains full awareness* of the current pedagogical context.

This algorithm keeps token consumption **flat** instead of scaling exponentially during long study sessions.
