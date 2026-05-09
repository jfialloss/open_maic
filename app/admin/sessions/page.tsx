'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { Loader2, ArrowLeft, Clock, Users, Calendar } from 'lucide-react';
import { collection, query, orderBy, getDocs, limit, startAfter, where, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/hooks/use-auth';
import { useI18n } from '@/lib/hooks/use-i18n';

interface UserSession {
  id: string;
  uid: string;
  email: string;
  nickname: string;
  startedAt: number;
  lastActiveAt: number;
  duration: number; // in seconds
}

export default function AdminSessionsPage() {
  const { role, loading: authLoading } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // Filtros de fecha (Por defecto últimos 7 días)
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  useEffect(() => {
    if (!authLoading && role !== 'admin' && role !== 'tutor') {
      router.push('/');
    }
  }, [role, authLoading, router]);

  const fetchSessions = async (isNextPage = false) => {
    try {
      setLoading(true);
      const constraints: any[] = [];
      
      if (startDate) {
        const [y, m, d] = startDate.split('-');
        const startTimestamp = new Date(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0).getTime();
        constraints.push(where('lastActiveAt', '>=', startTimestamp));
      }
      if (endDate) {
        const [y, m, d] = endDate.split('-');
        const endTimestamp = new Date(Number(y), Number(m) - 1, Number(d), 23, 59, 59, 999).getTime();
        constraints.push(where('lastActiveAt', '<=', endTimestamp));
      }
      
      constraints.push(orderBy('lastActiveAt', 'desc'));
      constraints.push(limit(20));
      
      if (isNextPage && lastDoc) {
        constraints.push(startAfter(lastDoc));
      }

      const q = query(collection(db, 'user_sessions'), ...constraints);

      const snapshot = await getDocs(q);
      
      const newSessions: UserSession[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        newSessions.push({
          id: doc.id,
          uid: data.uid,
          email: data.email || 'N/A',
          nickname: data.nickname || 'Anónimo',
          startedAt: data.startedAt || 0,
          lastActiveAt: data.lastActiveAt || 0,
          duration: data.duration || 0,
        });
      });

      if (snapshot.docs.length < 20) {
        setHasMore(false);
      } else {
        setHasMore(true);
        setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
      }

      if (isNextPage) {
        setSessions((prev) => [...prev, ...newSessions]);
      } else {
        setSessions(newSessions);
      }
    } catch (error: any) {
      console.error('Failed to fetch sessions:', error);
      alert('Error cargando sesiones: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (role === 'admin' || role === 'tutor') {
      setLastDoc(null);
      fetchSessions(false);
    }
  }, [role, startDate, endDate]);

  if (authLoading || (role !== 'admin' && role !== 'tutor')) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <Loader2 className="size-8 animate-spin text-sky-500" />
      </div>
    );
  }

  // Aggregate stats per user
  const userStats = sessions.reduce((acc, session) => {
    if (!acc[session.uid]) {
      acc[session.uid] = {
        uid: session.uid,
        email: session.email,
        nickname: session.nickname,
        totalDuration: 0,
        lastActiveAt: 0,
        sessionCount: 0,
      };
    }
    acc[session.uid].totalDuration += session.duration;
    acc[session.uid].sessionCount += 1;
    if (session.lastActiveAt > acc[session.uid].lastActiveAt) {
      acc[session.uid].lastActiveAt = session.lastActiveAt;
    }
    return acc;
  }, {} as Record<string, { uid: string; email: string; nickname: string; totalDuration: number; lastActiveAt: number; sessionCount: number }>);

  const statsArray = Object.values(userStats).sort((a, b) => b.totalDuration - a.totalDuration);

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${Math.max(0, seconds)}s`;
    const m = Math.floor(seconds / 60);
    const h = Math.floor(m / 60);
    if (h > 0) {
      const remainingM = m % 60;
      return `${h}h ${remainingM}m`;
    }
    return `${m}m`;
  };

  const formatDate = (ms: number) => {
    if (!ms) return '-';
    const date = new Date(ms);
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <button
          onClick={() => router.push('/')}
          className="mb-6 flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="size-4" />
          {t('common.backToHome')}
        </button>

        <div className="flex items-center gap-3 mb-8">
          <div className="size-12 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
            <Clock className="size-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {t('adminSessions.title')}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('adminSessions.description')}
            </p>
          </div>
          
          <div className="ml-auto flex items-center gap-3 bg-white dark:bg-slate-900 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-500 font-medium px-2">{t('adminSessions.from')}</span>
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent text-sm font-medium outline-none px-2 text-slate-700 dark:text-slate-300 dark:[color-scheme:dark]"
              />
            </div>
            <div className="w-px h-6 bg-slate-200 dark:bg-slate-800" />
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-500 font-medium px-2">{t('adminSessions.to')}</span>
              <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent text-sm font-medium outline-none px-2 text-slate-700 dark:text-slate-300 dark:[color-scheme:dark]"
              />
            </div>
          </div>
        </div>

        {/* Aggregated Stats View */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm mb-8">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 flex justify-between items-center">
            <h2 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Users className="size-4 text-slate-400" />
              {t('adminSessions.userSummary')}
            </h2>
            <div className="text-xs text-slate-500 font-medium">
              {t('adminSessions.topUsers')}
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-medium border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-3">{t('adminSessions.user')}</th>
                  <th className="px-6 py-3">{t('adminSessions.email')}</th>
                  <th className="px-6 py-3 text-right">{t('adminSessions.totalTime')}</th>
                  <th className="px-6 py-3 text-center">{t('adminSessions.sessionsCount')}</th>
                  <th className="px-6 py-3 text-right">{t('adminSessions.lastConnection')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {statsArray.length === 0 && !loading && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                      {t('adminSessions.noRecords')}
                    </td>
                  </tr>
                )}
                {statsArray.map((stat, i) => (
                  <tr key={stat.uid} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-800 dark:text-slate-200">
                      {stat.nickname}
                    </td>
                    <td className="px-6 py-4 text-slate-500">
                      {stat.email}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300">
                        {formatDuration(stat.totalDuration)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center text-slate-500">
                      {stat.sessionCount}
                    </td>
                    <td className="px-6 py-4 text-right text-slate-500 text-xs">
                      {formatDate(stat.lastActiveAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Raw Sessions List */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
            <h2 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Calendar className="size-4 text-slate-400" />
              {t('adminSessions.history')}
            </h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-medium border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-3">{t('adminSessions.sessionId')}</th>
                  <th className="px-6 py-3">{t('adminSessions.user')}</th>
                  <th className="px-6 py-3 text-right">{t('adminSessions.duration')}</th>
                  <th className="px-6 py-3 text-right">{t('adminSessions.start')}</th>
                  <th className="px-6 py-3 text-right">{t('adminSessions.lastActivity')}</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {sessions.map((session) => (
                  <tr key={session.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-3 font-mono text-xs text-slate-400 truncate max-w-[120px]">
                      {session.id}
                    </td>
                    <td className="px-6 py-3 text-slate-700 dark:text-slate-300">
                      {session.nickname}
                    </td>
                    <td className="px-6 py-3 text-right font-medium text-slate-800 dark:text-slate-200">
                      {formatDuration(session.duration)}
                    </td>
                    <td className="px-6 py-3 text-right text-slate-500 text-xs">
                      {formatDate(session.startedAt)}
                    </td>
                    <td className="px-6 py-3 text-right text-slate-500 text-xs">
                      {formatDate(session.lastActiveAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-center bg-slate-50/30 dark:bg-slate-900/50">
              <button
                onClick={() => fetchSessions(true)}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 disabled:opacity-50 transition-colors"
              >
                {loading ? t('adminSessions.loadingMore') : t('adminSessions.loadMore')}
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
