'use client';

import { useEffect, useRef } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserProfileStore } from '@/lib/store/user-profile';
import { useAuth } from '@/lib/hooks/use-auth';

// Keys that represent local UI state that shouldn't be synced (if any exist in the future)
const LOCAL_KEYS: string[] = [];

export function UserProfileSync() {
  const { user, loading } = useAuth();
  const isUpdatingFromFirebase = useRef(false);

  // 1. Subscribe to Firebase changes (For the current user's profile)
  useEffect(() => {
    if (loading || !user) return;
    
    const unsubscribe = onSnapshot(doc(db, 'users', user.uid, 'data', 'profile'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        isUpdatingFromFirebase.current = true;
        // Merge cloud data into local Zustand state
        useUserProfileStore.setState((state) => ({
          ...state,
          ...data,
          // Preserve local active courses that might be newer
          activeCourses: {
            ...(data.activeCourses || {}),
            ...state.activeCourses,
          }
        }));
        
        setTimeout(() => {
          isUpdatingFromFirebase.current = false;
        }, 100);
      }
    });

    return () => unsubscribe();
  }, [user, loading]);

  // 2. Upload to Firebase when local profile changes
  useEffect(() => {
    if (loading || !user) return;

    const unsubStore = useUserProfileStore.subscribe((state, prevState) => {
      if (isUpdatingFromFirebase.current) return;

      const changed = Object.keys(state).some(key => {
         if (LOCAL_KEYS.includes(key)) return false;
         if (typeof state[key as keyof typeof state] === 'function') return false;
         
         // Deep compare for activeCourses
         if (key === 'activeCourses') {
           return JSON.stringify(state.activeCourses) !== JSON.stringify(prevState.activeCourses);
         }
         if (key === 'masteredTopics') {
           return JSON.stringify(state.masteredTopics) !== JSON.stringify(prevState.masteredTopics);
         }
         return state[key as keyof typeof state] !== prevState[key as keyof typeof prevState];
      });

      if (changed) {
         const payload = { ...state };
         
         LOCAL_KEYS.forEach(k => delete payload[k as keyof typeof payload]);
         
         // Remove functions
         Object.keys(payload).forEach(key => {
           if (typeof payload[key as keyof typeof payload] === 'function') {
             delete payload[key as keyof typeof payload];
           }
         });
         
         const cleanPayload = JSON.parse(JSON.stringify(payload));
         
         // Save to global Firestore config
         setDoc(doc(db, 'users', user.uid, 'data', 'profile'), cleanPayload).catch(err => {
           console.error('Failed to sync user profile to Firestore:', err);
         });
      }
    });

    return () => unsubStore();
  }, [user, loading]);

  // Invisible logical component
  return null;
}
