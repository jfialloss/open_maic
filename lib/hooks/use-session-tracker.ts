import { useEffect, useRef } from 'react';
import { useAuth } from './use-auth';
import { useUserProfileStore } from '../store/user-profile';
import { db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { nanoid } from 'nanoid';

export function useSessionTracker() {
  const { user } = useAuth();
  const nickname = useUserProfileStore((s) => s.nickname);
  
  // Keep refs to avoid closure stale state in event listeners
  const sessionDataRef = useRef<{
    sessionId: string | null;
    startedAt: number;
    lastActiveAt: number;
    accumulatedSeconds: number;
    lastVisibilityChange: number;
  }>({
    sessionId: null,
    startedAt: 0,
    lastActiveAt: 0,
    accumulatedSeconds: 0,
    lastVisibilityChange: 0,
  });

  const userRef = useRef({ 
    uid: user?.uid, 
    email: user?.email, 
    nickname, 
    displayName: user?.displayName 
  });
  
  useEffect(() => {
    userRef.current = { 
      uid: user?.uid, 
      email: user?.email, 
      nickname, 
      displayName: user?.displayName 
    };
  }, [user, nickname]);

  useEffect(() => {
    if (!user) {
      sessionDataRef.current.sessionId = null;
      return;
    }

    // Initialize session if it doesn't exist
    if (!sessionDataRef.current.sessionId) {
      sessionDataRef.current = {
        sessionId: nanoid(),
        startedAt: Date.now(),
        lastActiveAt: Date.now(),
        accumulatedSeconds: 0,
        lastVisibilityChange: Date.now(),
      };
    }

    const flushSessionToFirestore = () => {
      const { sessionId, startedAt, accumulatedSeconds, lastVisibilityChange } = sessionDataRef.current;
      const { uid, email, nickname, displayName } = userRef.current;
      
      if (!uid || !sessionId) return;

      // Calculate any pending active time if we were visible
      let finalAccumulated = accumulatedSeconds;
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        const diffSeconds = Math.floor((now - lastVisibilityChange) / 1000);
        finalAccumulated += diffSeconds;
        // Don't update the ref variables here if it's called from beforeunload,
        // but it's safe to update anyway.
        sessionDataRef.current.accumulatedSeconds = finalAccumulated;
        sessionDataRef.current.lastVisibilityChange = now;
      }

      // If less than 5 seconds spent, don't bother saving to save writes
      if (finalAccumulated < 5) return;

      // Fire and forget update
      try {
        const docRef = doc(db, 'user_sessions', sessionId);
        // Using setDoc with merge instead of updateDoc to handle creation automatically
        setDoc(docRef, {
          uid,
          email: email || '',
          nickname: nickname || displayName || '',
          startedAt,
          lastActiveAt: Date.now(),
          duration: finalAccumulated,
        }, { merge: true }).catch((err) => {
          console.warn('Session tracker sync failed', err);
        });
      } catch (e) {
        // Ignore synchronous errors
      }
    };

    const handleVisibilityChange = () => {
      const now = Date.now();
      
      if (document.visibilityState === 'hidden') {
        // Transitioning to hidden -> calculate time since last visible
        const diffSeconds = Math.floor((now - sessionDataRef.current.lastVisibilityChange) / 1000);
        if (diffSeconds > 0) {
          sessionDataRef.current.accumulatedSeconds += diffSeconds;
        }
        sessionDataRef.current.lastVisibilityChange = now;
        
        // Flush to firestore since we are hiding
        flushSessionToFirestore();
      } else {
        // Transitioning to visible -> start counting from now
        sessionDataRef.current.lastVisibilityChange = now;
      }
    };

    const handleBeforeUnload = () => {
      flushSessionToFirestore();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      // If component unmounts (e.g. auth state changes), flush
      flushSessionToFirestore();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [user]); // Re-run if user logs in/out

}
