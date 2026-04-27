'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { ArrowLeft, Search, ShieldAlert, ShieldCheck, Loader2 } from 'lucide-react';
import { collection, query, orderBy, getDocs, limit, startAfter, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/hooks/use-auth';
import { useI18n } from '@/lib/hooks/use-i18n';


interface PromptLog {
  id: string;
  uid: string;
  email: string;
  prompt: string;
  isSafe: boolean;
  reason: string | null;
  model: string;
  createdAt: number;
}

export default function AdminLogsPage() {
  const { role, loading: authLoading } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  
  const [logs, setLogs] = useState<PromptLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'safe' | 'blocked'>('all');

  useEffect(() => {
    if (!authLoading && role !== 'admin') {
      router.push('/');
    }
  }, [role, authLoading, router]);

  const fetchLogs = async (isNextPage = false) => {
    try {
      setLoading(true);
      let q = query(
        collection(db, 'prompt_logs'),
        orderBy('createdAt', 'desc'),
        limit(20)
      );

      if (isNextPage && lastDoc) {
        q = query(q, startAfter(lastDoc));
      }

      const snapshot = await getDocs(q);
      
      const newLogs: PromptLog[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        newLogs.push({
          id: doc.id,
          uid: data.uid,
          email: data.email,
          prompt: data.prompt,
          isSafe: data.isSafe,
          reason: data.reason,
          model: data.model,
          createdAt: data.createdAt?.toMillis() || 0,
        });
      });

      if (snapshot.docs.length < 20) {
        setHasMore(false);
      } else {
        setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
      }

      if (isNextPage) {
        setLogs((prev) => [...prev, ...newLogs]);
      } else {
        setLogs(newLogs);
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (role === 'admin') {
      fetchLogs();
    }
  }, [role]);

  if (authLoading || role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <Loader2 className="size-8 animate-spin text-sky-500" />
      </div>
    );
  }

  // Client-side filtering
  const filteredLogs = logs.filter(log => {
    if (statusFilter === 'safe' && !log.isSafe) return false;
    if (statusFilter === 'blocked' && log.isSafe) return false;
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return log.email.toLowerCase().includes(q) || log.prompt.toLowerCase().includes(q);
    }
    
    return true;
  });

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
            <ShieldAlert className="size-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {t('adminLogs.title')}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('adminLogs.description')}
            </p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          {/* Controls */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="relative w-full sm:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <input 
                type="text" 
                placeholder={t('adminLogs.search')}
                className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-900 border-none rounded-lg outline-none focus:ring-2 focus:ring-sky-500"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-lg">
              <button 
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${statusFilter === 'all' ? 'bg-white dark:bg-slate-800 shadow-sm text-slate-800 dark:text-slate-200' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                {t('adminLogs.filterAll')}
              </button>
              <button 
                onClick={() => setStatusFilter('safe')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${statusFilter === 'safe' ? 'bg-white dark:bg-slate-800 shadow-sm text-emerald-600 dark:text-emerald-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                {t('adminLogs.filterSafe')}
              </button>
              <button 
                onClick={() => setStatusFilter('blocked')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${statusFilter === 'blocked' ? 'bg-white dark:bg-slate-800 shadow-sm text-red-600 dark:text-red-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                {t('adminLogs.filterBlocked')}
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 bg-slate-50/50 dark:bg-slate-900/50 dark:text-slate-400 uppercase">
                <tr>
                  <th className="px-6 py-4 font-medium">{t('adminLogs.date')}</th>
                  <th className="px-6 py-4 font-medium">{t('adminLogs.user')}</th>
                  <th className="px-6 py-4 font-medium">{t('adminLogs.prompt')}</th>
                  <th className="px-6 py-4 font-medium text-center">{t('adminLogs.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                    <td className="px-6 py-4 whitespace-nowrap text-slate-500 dark:text-slate-400 text-xs">
                      {log.createdAt ? new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(log.createdAt)) : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-700 dark:text-slate-300">
                      {log.email}
                    </td>
                    <td className="px-6 py-4">
                      <div className="max-w-md line-clamp-2 text-slate-600 dark:text-slate-400 group-hover:line-clamp-none transition-all" title={log.prompt}>
                        {log.prompt}
                      </div>
                      {!log.isSafe && log.reason && (
                        <div className="mt-1 text-xs text-red-500 font-medium">
                          {t('adminLogs.reason')}{log.reason}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {log.isSafe ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400 text-xs font-bold uppercase">
                          <ShieldCheck className="size-3" /> {t('adminLogs.safe')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 text-xs font-bold uppercase">
                          <ShieldAlert className="size-3" /> {t('adminLogs.blocked')}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {loading && (
              <div className="w-full py-8 flex justify-center">
                <Loader2 className="size-6 animate-spin text-slate-400" />
              </div>
            )}
            
            {!loading && filteredLogs.length === 0 && (
              <div className="w-full py-12 text-center text-slate-500 dark:text-slate-400">
                {t('adminLogs.noRecords')}
              </div>
            )}
            
            {!loading && hasMore && filteredLogs.length > 0 && !searchQuery && statusFilter === 'all' && (
              <div className="w-full p-4 flex justify-center border-t border-slate-100 dark:border-slate-700/50">
                <button 
                  onClick={() => fetchLogs(true)}
                  className="px-4 py-2 text-sm font-medium text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded-lg transition-colors"
                >
                  {t('adminLogs.loadMore')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
