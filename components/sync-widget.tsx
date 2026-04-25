'use client';

import React, { useEffect, useState } from 'react';
import { useSyncStore, SyncTask } from '@/lib/store/sync-store';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SyncWidget() {
  const tasks = useSyncStore((state) => state.tasks);
  const removeTask = useSyncStore((state) => state.removeTask);
  const [visibleTasks, setVisibleTasks] = useState<SyncTask[]>([]);

  // Track tasks. Automatically remove "done" or "error" tasks after a delay.
  useEffect(() => {
    const currentTasks = Object.values(tasks);
    setVisibleTasks(currentTasks);

    currentTasks.forEach((task) => {
      if (task.status === 'done' || task.status === 'error') {
        const timer = setTimeout(() => {
          removeTask(task.stageId);
        }, 5000); // Hide after 5 seconds
        return () => clearTimeout(timer);
      }
    });
  }, [tasks, removeTask]);

  if (visibleTasks.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-[300px]">
      {visibleTasks.map((task) => {
        let bgColor = 'bg-white dark:bg-gray-800';
        let borderColor = 'border-gray-200 dark:border-gray-700';
        let icon = <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
        let textColor = 'text-gray-700 dark:text-gray-200';
        let statusText = 'Sincronizando...';

        if (task.status === 'done') {
          bgColor = 'bg-green-50 dark:bg-green-900/20';
          borderColor = 'border-green-200 dark:border-green-800';
          icon = <CheckCircle className="w-4 h-4 text-green-500" />;
          textColor = 'text-green-700 dark:text-green-300';
          statusText = 'Publicado';
        } else if (task.status === 'error') {
          bgColor = 'bg-red-50 dark:bg-red-900/20';
          borderColor = 'border-red-200 dark:border-red-800';
          icon = <AlertCircle className="w-4 h-4 text-red-500" />;
          textColor = 'text-red-700 dark:text-red-300';
          statusText = 'Error';
        }

        return (
          <div
            key={task.stageId}
            className={cn(
              'flex items-center gap-3 p-3 rounded-lg border shadow-lg transition-all duration-300 ease-in-out',
              bgColor,
              borderColor
            )}
          >
            <div className="shrink-0">{icon}</div>
            <div className="flex-1 min-w-0">
              <p className={cn('text-sm font-medium truncate', textColor)}>
                {task.stageName}
              </p>
              <p className={cn('text-xs opacity-80', textColor)}>
                {statusText}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
