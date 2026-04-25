/**
 * User Profile Store
 * Persists avatar, nickname & bio to localStorage
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Predefined avatar options */
export const AVATAR_OPTIONS = [
  '/avatars/user.png',
  '/avatars/teacher-2.png',
  '/avatars/assist-2.png',
  '/avatars/clown-2.png',
  '/avatars/curious-2.png',
  '/avatars/note-taker-2.png',
  '/avatars/thinker-2.png',
] as const;

export interface UserProfileState {
  /** Local avatar path or data-URL (for custom uploads) */
  avatar: string;
  nickname: string;
  bio: string;
  grade: string;
  masteredTopics: string[];
  activeCourses: Record<string, {
    stageId: string;
    topic: string;
    subject: string;
    grade: string;
    name: string;
    sceneIndex: number;
    actionIndex: number;
    lastPlayedAt: number;
  }>;
  setAvatar: (avatar: string) => void;
  setNickname: (nickname: string) => void;
  setBio: (bio: string) => void;
  setGrade: (grade: string) => void;
  addMasteredTopic: (topic: string) => void;
  updateActiveCourse: (stageId: string, data: any) => void;
  removeActiveCourse: (stageId: string) => void;
}

export const useUserProfileStore = create<UserProfileState>()(
  persist(
    (set) => ({
      avatar: AVATAR_OPTIONS[0],
      nickname: '',
      bio: '',
      grade: '5º Grado de EGB',
      masteredTopics: [],
      activeCourses: {},
      setAvatar: (avatar) => set({ avatar }),
      setNickname: (nickname) => set({ nickname }),
      setBio: (bio) => set({ bio }),
      setGrade: (grade) => set({ grade }),
      addMasteredTopic: (topic) => set((state) => ({ 
        masteredTopics: state.masteredTopics.includes(topic) 
          ? state.masteredTopics 
          : [...state.masteredTopics, topic] 
      })),
      updateActiveCourse: (stageId, data) => set((state) => ({
        activeCourses: {
          ...state.activeCourses,
          [stageId]: {
            ...(state.activeCourses[stageId] || {}),
            ...data,
            stageId,
            lastPlayedAt: Date.now()
          }
        }
      })),
      removeActiveCourse: (stageId) => set((state) => {
        const newCourses = { ...state.activeCourses };
        delete newCourses[stageId];
        return { activeCourses: newCourses };
      }),
    }),
    {
      name: 'user-profile-storage',
    },
  ),
);
