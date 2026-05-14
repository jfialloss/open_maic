'use client';

import { useEffect, useRef } from 'react';
import { doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserProfileStore } from '@/lib/store/user-profile';
import { useAuth } from '@/lib/hooks/use-auth';

// Keys that represent local UI state that shouldn't be synced (if any exist in the future)
const LOCAL_KEYS: string[] = [];

export function UserProfileSync() {
  const { user, loading } = useAuth();
  const isUpdatingFromFirebase = useRef(false);
  const hasHydratedFromCloud = useRef(false);

  // 1. Subscribe to Firebase changes (For the current user's profile)
  useEffect(() => {
    if (loading || !user) return;
    
    const unsubscribe = onSnapshot(doc(db, 'users', user.uid, 'data', 'profile'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        isUpdatingFromFirebase.current = true;
        // Merge cloud data into local Zustand state
        useUserProfileStore.setState((state) => {
          // Preparar assignedCourses:
          // Mantener las asignaciones de la nube, pero preservar el progreso local (ej. passed/failed)
          // Si el tutor borró la asignación en la nube, NO la revivimos con el estado local.
          const mergedAssignedCourses: Record<string, any> = { ...(data.assignedCourses || {}) };
          Object.keys(mergedAssignedCourses).forEach(stageId => {
            if (state.assignedCourses && state.assignedCourses[stageId]) {
              mergedAssignedCourses[stageId] = {
                ...mergedAssignedCourses[stageId],
                ...state.assignedCourses[stageId]
              };
            }
          });

          return {
            ...state,
            ...data,
            // Preserve local active courses that might be newer
            activeCourses: {
              ...(data.activeCourses || {}),
              ...state.activeCourses,
            },
            assignedCourses: mergedAssignedCourses
          };
        });
        
        setTimeout(() => {
          isUpdatingFromFirebase.current = false;
        }, 100);
      }
      
      // Mark as hydrated whether the document existed or not.
      // This unlocks the ability to upload local changes back to the cloud.
      hasHydratedFromCloud.current = true;
    });

    return () => unsubscribe();
  }, [user, loading]);

  // 2. Upload to Firebase when local profile changes
  useEffect(() => {
    if (loading || !user) return;

    const syncToFirebase = (currentState: any) => {
       const payload = { ...currentState };
       
       LOCAL_KEYS.forEach(k => delete payload[k as keyof typeof payload]);
       
       // Remove functions
       Object.keys(payload).forEach(key => {
         if (typeof payload[key as keyof typeof payload] === 'function') {
           delete payload[key as keyof typeof payload];
         }
       });
       
       const cleanPayload = JSON.parse(JSON.stringify(payload));
       
       // Save to global Firestore config
       const docRef = doc(db, 'users', user.uid, 'data', 'profile');
       
       updateDoc(docRef, cleanPayload).catch(err => {
         if (err.code === 'not-found') {
           setDoc(docRef, cleanPayload).catch(e => console.error('Failed to create user profile:', e));
         } else {
           console.error('Failed to sync user profile to Firestore:', err);
         }
       });
       
       // Guarda el arreglo plano de IDs y el grado en la raíz del usuario para consultas rápidas
       const activeCourseIds = Object.keys(cleanPayload.activeCourses || {});
       setDoc(doc(db, 'users', user.uid), { 
         activeCourseIds,
         grade: cleanPayload.grade || 'Desconocido'
       }, { merge: true }).catch(err => {
         console.error('Failed to sync activeCourseIds to root:', err);
       });
    };

    const unsubStore = useUserProfileStore.subscribe((state, prevState) => {
      // Do not upload if we are currently receiving a cloud update
      if (isUpdatingFromFirebase.current) return;
      
      // CRITICAL FIX: Do not upload anything until we have successfully downloaded the cloud state.
      // This prevents the empty local state from overwriting the cloud state on a new session/browser.
      if (!hasHydratedFromCloud.current) return;

      const changed = Object.keys(state).some(key => {
         if (LOCAL_KEYS.includes(key)) return false;
         if (typeof state[key as keyof typeof state] === 'function') return false;
         
         // Deep compare for activeCourses and assignedCourses
         if (key === 'activeCourses') {
           return JSON.stringify(state.activeCourses) !== JSON.stringify(prevState.activeCourses);
         }
         if (key === 'assignedCourses') {
           return JSON.stringify(state.assignedCourses) !== JSON.stringify(prevState.assignedCourses);
         }
         if (key === 'masteredTopics') {
           return JSON.stringify(state.masteredTopics) !== JSON.stringify(prevState.masteredTopics);
         }
         return state[key as keyof typeof state] !== prevState[key as keyof typeof prevState];
      });

      if (changed) {
         syncToFirebase(state);
      }
    });

    // We removed the forced synchronous syncToFirebase(useUserProfileStore.getState()) on mount
    // to prevent race conditions that wiped the database.

    return () => unsubStore();
  }, [user, loading]);

  // Invisible logical component
  return null;
}
