import { create } from 'zustand';

export type SyncStatus = 'syncing' | 'done' | 'error';

export interface SyncTask {
  stageId: string;
  stageName: string;
  status: SyncStatus;
}

interface SyncState {
  tasks: Record<string, SyncTask>;
  lockSync: (stageId: string, stageName: string) => boolean;
  updateStatus: (stageId: string, status: SyncStatus) => void;
  removeTask: (stageId: string) => void;
  isSyncing: (stageId: string) => boolean;
}

export const useSyncStore = create<SyncState>((set, get) => ({
  tasks: {},

  // Returns true if the lock was successfully acquired, false if it was already locked
  lockSync: (stageId: string, stageName: string) => {
    const { tasks } = get();
    if (tasks[stageId]) {
      return false; // Already tracking this course
    }
    set({
      tasks: {
        ...tasks,
        [stageId]: { stageId, stageName, status: 'syncing' }
      }
    });
    return true; // Successfully locked
  },

  updateStatus: (stageId: string, status: SyncStatus) => {
    const { tasks } = get();
    if (tasks[stageId]) {
      set({
        tasks: {
          ...tasks,
          [stageId]: { ...tasks[stageId], status }
        }
      });
    }
  },

  removeTask: (stageId: string) => {
    const { tasks } = get();
    if (tasks[stageId]) {
      const newTasks = { ...tasks };
      delete newTasks[stageId];
      set({ tasks: newTasks });
    }
  },

  isSyncing: (stageId: string) => {
    return !!get().tasks[stageId] && get().tasks[stageId].status === 'syncing';
  },
}));
