/**
 * User Profile Store
 * Persists avatar, nickname & bio to localStorage
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import syllabusData from '@/lib/data/syllabus.json';

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
  englishLevel: string;
  masteredTopics: string[];
  passedCourses: string[];
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
  assignedCourses: Record<string, {
    stageId: string;
    name: string;
    subject: string;
    assignedAt: number;
    status: 'pending' | 'passed';
  }>;
  courseAttempts: Record<string, number>;
  setAvatar: (avatar: string) => void;
  setNickname: (nickname: string) => void;
  setBio: (bio: string) => void;
  setGrade: (grade: string) => void;
  setEnglishLevel: (level: string) => void;
  addMasteredTopic: (topic: string) => void;
  addPassedCourse: (stageId: string) => void;
  incrementCourseAttempt: (stageId: string) => void;
  updateActiveCourse: (stageId: string, data: any) => void;
  removeActiveCourse: (stageId: string) => void;
  setAssignedCourses: (courses: Record<string, any>) => void;
  updateAssignedCourseStatus: (stageId: string, status: 'pending' | 'passed' | 'failed') => void;
}

export const useUserProfileStore = create<UserProfileState>()(
  persist(
    (set) => ({
      avatar: '',
      nickname: '',
      bio: '',
      grade: '5º Grado de EGB',
      englishLevel: 'A1',
      masteredTopics: [],
      passedCourses: [],
      activeCourses: {},
      assignedCourses: {},
      courseAttempts: {},
      setAvatar: (avatar) => set({ avatar }),
      setNickname: (nickname) => set({ nickname }),
      setBio: (bio) => set({ bio }),
      setGrade: (grade) => set({ grade }),
      setEnglishLevel: (englishLevel) => set({ englishLevel }),
      incrementCourseAttempt: (stageId) => set((state) => ({
        courseAttempts: {
          ...state.courseAttempts,
          [stageId]: (state.courseAttempts[stageId] || 0) + 1
        }
      })),
      addPassedCourse: (stageId) => set((state) => {
        const newPassed = state.passedCourses?.includes(stageId) 
          ? state.passedCourses 
          : [...(state.passedCourses || []), stageId];
          
        let newAssigned = { ...state.assignedCourses };
        if (newAssigned[stageId]) {
          newAssigned[stageId] = { ...newAssigned[stageId], status: 'passed' };
        }

        return { passedCourses: newPassed, assignedCourses: newAssigned };
      }),
      addMasteredTopic: (topic) => set((state) => {
        if (state.masteredTopics.includes(topic)) return state;
        const newMastered = [...state.masteredTopics, topic];

        let newEnglishLevel = state.englishLevel;
        const ENGLISH_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

        while (true) {
          const currentLevelIndex = ENGLISH_LEVELS.indexOf(newEnglishLevel);
          if (currentLevelIndex < 0 || currentLevelIndex >= ENGLISH_LEVELS.length - 1) break;

          const currentLevelData = (syllabusData as any)['Inglés']?.[newEnglishLevel];
          if (!currentLevelData) break;

          let allMastered = true;
          for (const unit of Object.values(currentLevelData)) {
            for (const t of (unit as any).temas) {
              if (!newMastered.includes(t)) {
                allMastered = false;
                break;
              }
            }
            if (!allMastered) break;
          }

          if (allMastered) {
            newEnglishLevel = ENGLISH_LEVELS[currentLevelIndex + 1];
          } else {
            break;
          }
        }

        return { 
          masteredTopics: newMastered,
          englishLevel: newEnglishLevel
        };
      }),
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
      setAssignedCourses: (courses) => set({ assignedCourses: courses }),
      updateAssignedCourseStatus: (stageId, status) => set((state) => {
        if (!state.assignedCourses || !state.assignedCourses[stageId]) return state;
        return {
          assignedCourses: {
            ...state.assignedCourses,
            [stageId]: {
              ...state.assignedCourses[stageId],
              status
            }
          }
        };
      }),
    }),
    {
      name: 'user-profile-storage',
    },
  ),
);
