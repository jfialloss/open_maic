'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, ArrowLeft, Search, Users, ClipboardList, CheckCircle2, Clock, FileSearch, XCircle } from 'lucide-react';
import { collection, query, getDocs, doc, getDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/hooks/use-auth';
import { useI18n } from '@/lib/hooks/use-i18n';

interface AssignedCourseData {
  stageId: string;
  name: string;
  subject: string;
  assignedAt: number;
  status: 'pending' | 'passed' | 'failed';
  studentUid: string;
  studentName: string;
  studentGrade: string;
}

export default function AdminAssignmentsPage() {
  const { role, loading: authLoading } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  
  const [assignments, setAssignments] = useState<AssignedCourseData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!authLoading && role !== 'admin' && role !== 'tutor') {
      router.push('/');
    }
  }, [role, authLoading, router]);

  useEffect(() => {
    const fetchAssignments = async () => {
      if (role !== 'admin' && role !== 'tutor') return;
      try {
        setLoading(true);
        const usersQ = query(collection(db, 'users'), where('role', '==', 'student'));
        const usersSnap = await getDocs(usersQ);
        
        const allAssignments: AssignedCourseData[] = [];

        for (const userDoc of usersSnap.docs) {
          const userData = userDoc.data();
          const uid = userDoc.id;
          
          const profileSnap = await getDoc(doc(db, 'users', uid, 'data', 'profile'));
          if (profileSnap.exists()) {
            const profileData = profileSnap.data();
            const studentAssignedCourses = profileData.assignedCourses || {};
            
            Object.values(studentAssignedCourses).forEach((ac: any) => {
              allAssignments.push({
                stageId: ac.stageId,
                name: ac.name || 'Curso Generado',
                subject: ac.subject || 'Variados',
                assignedAt: ac.assignedAt || 0,
                status: ac.status || 'pending',
                studentUid: uid,
                studentName: userData.displayName || 'Alumno',
                studentGrade: profileData.grade || 'Sin Asignar'
              });
            });
          }
        }
        
        // Ordenar por fecha de asignación descendente
        allAssignments.sort((a, b) => b.assignedAt - a.assignedAt);
        setAssignments(allAssignments);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching assignments:', error);
        setLoading(false);
      }
    };

    fetchAssignments();
  }, [role]);

  if (authLoading || (role !== 'admin' && role !== 'tutor')) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="size-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const filteredAssignments = assignments.filter(ac => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return ac.studentName.toLowerCase().includes(q) || ac.name.toLowerCase().includes(q);
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B1120] font-sans selection:bg-indigo-200 dark:selection:bg-indigo-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors mb-6 group"
        >
          <ArrowLeft className="size-4 group-hover:-translate-x-1 transition-transform" />
          {t('common.backToHome')}
        </button>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
              <ClipboardList className="size-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {t('adminAssignments.title')}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t('adminAssignments.description')}
              </p>
            </div>
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <input
              type="text"
              placeholder={t('adminAssignments.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full md:w-64 pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-shadow dark:text-slate-200"
            />
          </div>
        </div>

        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center h-64"
            >
              <Loader2 className="size-8 animate-spin text-indigo-500" />
            </motion.div>
          ) : filteredAssignments.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center justify-center py-24 bg-white/40 dark:bg-slate-900/40 rounded-3xl border border-dashed border-slate-300 dark:border-slate-800"
            >
              <FileSearch className="size-16 text-slate-300 dark:text-slate-700 mb-4" />
              <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">
                {searchQuery ? t('adminAssignments.noResults') : t('adminAssignments.noAssignments')}
              </h3>
              <p className="text-sm text-slate-500 text-center max-w-sm mt-2">
                {searchQuery 
                  ? t('adminAssignments.searchHint') 
                  : t('adminAssignments.emptyHint')}
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden"
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                    <tr>
                      <th className="px-6 py-4 font-semibold">{t('adminAssignments.student')}</th>
                      <th className="px-6 py-4 font-semibold">{t('adminAssignments.course')}</th>
                      <th className="px-6 py-4 font-semibold text-center">{t('adminAssignments.date')}</th>
                      <th className="px-6 py-4 font-semibold text-center">{t('adminAssignments.status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {filteredAssignments.map((ac, idx) => (
                      <motion.tr 
                        key={`${ac.studentUid}-${ac.stageId}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="size-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
                              <Users className="size-4 text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <div>
                              <div className="font-semibold text-slate-800 dark:text-slate-200">{ac.studentName}</div>
                              <div className="text-[10px] uppercase font-bold text-slate-400 mt-0.5">{ac.studentGrade}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-slate-800 dark:text-slate-300 max-w-[250px] truncate" title={ac.name}>
                            {ac.name}
                          </div>
                          <div className="text-xs text-slate-500 mt-1 uppercase">
                            {(!ac.subject || ac.subject === 'none') ? 'Libre' : ac.subject}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="text-xs text-slate-500 font-medium">
                            {new Date(ac.assignedAt).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex justify-center">
                            {ac.status === 'passed' ? (
                              <span className="px-3 py-1 text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-full flex items-center gap-1.5 border border-emerald-200 dark:border-emerald-800/50">
                                <CheckCircle2 className="size-3.5" /> {t('adminAssignments.passed')}
                              </span>
                            ) : ac.status === 'failed' ? (
                              <span className="px-3 py-1 text-xs font-bold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-full flex items-center gap-1.5 border border-red-200 dark:border-red-800/50">
                                <XCircle className="size-3.5" /> {t('adminAssignments.failed')}
                              </span>
                            ) : (
                              <span className="px-3 py-1 text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-full flex items-center gap-1.5 border border-amber-200 dark:border-amber-800/50">
                                <Clock className="size-3.5" /> {t('adminAssignments.pending')}
                              </span>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
