'use client';

import { useEffect, useRef } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useSettingsStore } from '@/lib/store/settings';
import { useAuth } from '@/lib/hooks/use-auth';

// Keys that represent user-specific preferences and should NOT be pushed globally.
const LOCAL_KEYS = [
  'ttsMuted', 
  'ttsVolume', 
  'sidebarCollapsed', 
  'chatAreaCollapsed', 
  'chatAreaWidth', 
  'autoConfigApplied'
];

export function GlobalSettingsSync() {
  const { user, role, loading } = useAuth();
  const isUpdatingFromFirebase = useRef(false);

  // 1. Subscribe to Firebase changes (For ALL logged-in users)
  useEffect(() => {
    if (loading || !user) return;
    
    const unsubscribe = onSnapshot(doc(db, 'system', 'settings'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        isUpdatingFromFirebase.current = true;
        // Force the app to adopt global configuration instead of its own LocalStorage cache
        useSettingsStore.setState(data);
        
        // Let Zustand finish the batched synchronous update before releasing the lock
        setTimeout(() => {
          isUpdatingFromFirebase.current = false;
        }, 100);
      }
    });

    return () => unsubscribe();
  }, [user, loading]);

  // 2. Upload to Firebase when Admin changes local state
  useEffect(() => {
    if (loading || role !== 'admin') return;

    // We only attach the mutation listener if the user is verified to be an Admin
    const unsubStore = useSettingsStore.subscribe((state, prevState) => {
      // Prevent infinite loop: do not upload if the state change literally came from Firebase!
      if (isUpdatingFromFirebase.current) return;

      // Only perform a deep network push if non-local configurations actually changed
      const changed = Object.keys(state).some(key => {
         if (LOCAL_KEYS.includes(key)) return false;
         // Compare values. Zustand works immutably so nested object refs change when modified.
         return state[key as keyof typeof state] !== prevState[key as keyof typeof prevState];
      });

      if (changed) {
         const payload = { ...state };
         
         // Delete local keys to prevent messing up other users' interfaces
         LOCAL_KEYS.forEach(k => delete payload[k as keyof typeof payload]);
         
         // Serialize and Parse to cleanly strip out any Zustand dispatcher functions
         const cleanPayload = JSON.parse(JSON.stringify(payload));
         
         // Save to global Firestore config
         setDoc(doc(db, 'system', 'settings'), cleanPayload, { merge: true }).catch(err => {
           console.error('Failed to sync global settings to Firestore:', err);
         });
      }
    });

    return () => unsubStore();
  }, [role, loading]);

  // Invisible logical component
  return null;
}
