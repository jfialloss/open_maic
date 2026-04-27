'use client';

import { useSessionTracker } from '@/lib/hooks/use-session-tracker';

/**
 * Invisible component that tracks user session time and activity.
 * Should be placed at the root level of the authenticated app.
 */
export function SessionTracker() {
  useSessionTracker();
  return null;
}
