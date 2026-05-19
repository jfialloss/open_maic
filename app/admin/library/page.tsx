'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Search, Library, Loader2, DownloadCloud, Trash2, LayoutTemplate, Users, X } from 'lucide-react';
import { collection, query, orderBy, getDocs, getDoc, limit, startAfter, QueryDocumentSnapshot, DocumentData, doc, deleteDoc, where } from 'firebase/firestore';
import { db as firestoreDb } from '@/lib/firebase';
import { useAuth } from '@/lib/hooks/use-auth';
import { useI18n } from '@/lib/hooks/use-i18n';
import { toast } from 'sonner';

export default function AdminLibraryPage() {
  const { role, loading: authLoading, user } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'mine' | 'community'>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  
  const [inspectingCourse, setInspectingCourse] = useState<{ id: string; name: string } | null>(null);
  const [activeUsers, setActiveUsers] = useState<any[]>([]);
  const [loadingUsage, setLoadingUsage] = useState(false);

  useEffect(() => {
    if (!authLoading && role !== 'admin' && role !== 'tutor') {
      router.push('/');
    }
  }, [role, authLoading, router]);

  const fetchClassrooms = async (isNextPage = false) => {
    try {
      setLoading(true);
      let q = query(
        collection(firestoreDb, 'global_classrooms'),
        orderBy('createdAtTime', 'desc'),
        limit(20)
      );

      if (isNextPage && lastDoc) {
        q = query(q, startAfter(lastDoc));
      }

      const snap = await getDocs(q);
      const items = snap.docs.map(d => ({ _id: d.id, ...d.data() }));

      if (snap.docs.length < 20) {
        setHasMore(false);
      } else {
        setHasMore(true);
        setLastDoc(snap.docs[snap.docs.length - 1]);
      }

      if (isNextPage) {
        setClassrooms(prev => {
          const existingIds = new Set(prev.map(i => i._id));
          const newUnique = items.filter(i => !existingIds.has(i._id));
          return [...prev, ...newUnique];
        });
      } else {
        setClassrooms(items);
      }
    } catch (error) {
      console.error('Failed to fetch global classrooms:', error);
      toast.error('Error al cargar la biblioteca');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (role === 'admin' || role === 'tutor') {
      fetchClassrooms();
    }
  }, [role]);

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('adminLibrary.confirmDelete'))) return;
    try {
      setDeletingId(id);
      
      // Validación de Uso: Verificar si algún alumno tiene este curso activo
      const usersQuery = query(
        collection(firestoreDb, 'users'),
        where('activeCourseIds', 'array-contains', id),
        limit(1)
      );
      const activeUsersSnap = await getDocs(usersQuery);
      
      if (!activeUsersSnap.empty) {
        toast.error(t('adminLibrary.inUseError'));
        return;
      }

      await deleteDoc(doc(firestoreDb, 'global_classrooms', id));
      setClassrooms(prev => prev.filter(c => c._id !== id));
      toast.success(t('adminLibrary.deleteSuccess'));
    } catch (e) {
      console.error(e);
      toast.error(t('adminLibrary.deleteError'));
    } finally {
      setDeletingId(null);
    }
  };

  const handleViewUsage = async (id: string, name: string) => {
    setInspectingCourse({ id, name });
    setLoadingUsage(true);
    setActiveUsers([]);
    try {
      const usersQuery = query(
        collection(firestoreDb, 'users'),
        where('activeCourseIds', 'array-contains', id)
      );
      const snap = await getDocs(usersQuery);
      
      const userProfiles = await Promise.all(snap.docs.map(async (d) => {
        const rootData = d.data();
        const profileDoc = await getDoc(doc(firestoreDb, 'users', d.id, 'data', 'profile'));
        const profileData = profileDoc.exists() ? profileDoc.data() : {};
        
        let status = 'Desconocido';
        let statusColor = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400';

        if (profileData.assignedCourses && profileData.assignedCourses[id]) {
          const assignedStatus = profileData.assignedCourses[id].status;
          if (assignedStatus === 'passed') {
            status = 'Aprobado';
            statusColor = 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 border border-green-200 dark:border-green-800';
          } else if (assignedStatus === 'failed') {
            status = 'Reprobado';
            statusColor = 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 border border-red-200 dark:border-red-800';
          } else {
            status = 'Asignado';
            statusColor = 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400 border border-sky-200 dark:border-sky-800';
          }
        } else if (profileData.passedCourses && profileData.passedCourses.includes(id)) {
          status = 'Aprobado';
          statusColor = 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 border border-green-200 dark:border-green-800';
        } else if (profileData.activeCourses && profileData.activeCourses[id]) {
          status = 'En Curso';
          statusColor = 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800';
        } else {
          status = 'En Historial';
          statusColor = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700';
        }

        return {
          id: d.id,
          email: rootData.email || profileData.email || '',
          grade: rootData.grade || profileData.grade || '',
          nickname: profileData.nickname || rootData.nickname || rootData.displayName || '',
          avatar: profileData.avatar || rootData.avatar || '',
          status,
          statusColor
        };
      }));
      setActiveUsers(userProfiles);
    } catch (e) {
      console.error(e);
      toast.error('Error al cargar usuarios');
    } finally {
      setLoadingUsage(false);
    }
  };

  const handleDownload = async (id: string, classroomData: any) => {
    toast.loading(t('adminLibrary.downloading'), { id });
    try {
      const { processCloudDownload } = await import('@/lib/utils/cloud-sync');
      await processCloudDownload(id, classroomData);
      toast.success(t('adminLibrary.cloneSuccess'), { id });
      router.push(`/classroom/${id}`);
    } catch (e) {
      console.error(e);
      toast.error(t('adminLibrary.cloneError'), { id });
    }
  };

  if (authLoading || (role !== 'admin' && role !== 'tutor')) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <Loader2 className="size-8 animate-spin text-sky-500" />
      </div>
    );
  }

  // Client-side filtering
  let filteredClassrooms = classrooms.filter(gc => {
    if (filter === 'mine') return gc.createdBy === user?.uid;
    if (filter === 'community') return gc.createdBy !== user?.uid;
    return true;
  });

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filteredClassrooms = filteredClassrooms.filter(gc => {
      const name = (gc.stage?.name || 'Untitled').toLowerCase();
      const author = (gc.authorNickname || '').toLowerCase();
      return name.includes(q) || author.includes(q);
    });
  }

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
          <div className="size-12 rounded-2xl bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
            <Library className="size-6 text-sky-600 dark:text-sky-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {t('adminLibrary.title')}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('adminLibrary.description')}
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
                placeholder={t('adminLibrary.searchPlaceholder')}
                className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-900 border-none rounded-lg outline-none focus:ring-2 focus:ring-sky-500"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-lg">
              <button 
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${filter === 'all' ? 'bg-white dark:bg-slate-800 shadow-sm text-slate-800 dark:text-slate-200' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                {t('adminLibrary.filterAll')}
              </button>
              <button 
                onClick={() => setFilter('mine')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${filter === 'mine' ? 'bg-white dark:bg-slate-800 shadow-sm text-slate-800 dark:text-slate-200' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                {t('adminLibrary.filterMine')}
              </button>
              <button 
                onClick={() => setFilter('community')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${filter === 'community' ? 'bg-white dark:bg-slate-800 shadow-sm text-slate-800 dark:text-slate-200' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                {t('adminLibrary.filterCommunity')}
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 bg-slate-50/50 dark:bg-slate-900/50 dark:text-slate-400 uppercase">
                <tr>
                  <th className="px-6 py-4 font-medium">{t('adminLibrary.date')}</th>
                  <th className="px-6 py-4 font-medium">{t('adminLibrary.author')}</th>
                  <th className="px-6 py-4 font-medium">{t('adminLibrary.course')}</th>
                  <th className="px-6 py-4 font-medium">{t('adminLibrary.subject')}</th>
                  <th className="px-6 py-4 font-medium">Tipo</th>
                  <th className="px-6 py-4 font-medium text-right">{t('adminLibrary.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {filteredClassrooms.map((gc) => (
                  <tr key={gc._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                    <td className="px-6 py-4 whitespace-nowrap text-slate-500 dark:text-slate-400 text-xs">
                      {gc.createdAtTime ? new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(gc.createdAtTime)) : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      {gc.authorNickname || t('adminLibrary.unknown')}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-800 dark:text-slate-200 line-clamp-1" title={gc.stage?.name}>
                        {gc.stage?.name || t('adminLibrary.untitled')}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-1">
                        <LayoutTemplate className="size-3" /> {gc.scenes?.length || 0} {t('adminLibrary.slides')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center rounded-sm bg-indigo-100 dark:bg-indigo-900/40 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-400">
                        {gc.subject === 'none' || !gc.subject ? t('adminLibrary.free') : gc.subject}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {gc.stage?.interactiveMode ? (
                        <span className="inline-flex items-center rounded-sm bg-fuchsia-100 dark:bg-fuchsia-900/40 px-2 py-0.5 text-[10px] font-bold text-fuchsia-700 dark:text-fuchsia-400 tracking-wider">
                          INTERACTIVO
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-sm bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 tracking-wider">
                          NORMAL
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleViewUsage(gc._id, gc.stage?.name || t('adminLibrary.untitled'))}
                          className="p-1.5 rounded-md bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/40 transition-colors"
                          title="Ver uso del curso"
                        >
                          <Users className="size-4" />
                        </button>
                        <button
                          onClick={() => handleDownload(gc._id, gc)}
                          className="p-1.5 rounded-md bg-sky-50 text-sky-600 hover:bg-sky-100 dark:bg-sky-900/20 dark:text-sky-400 dark:hover:bg-sky-900/40 transition-colors"
                          title={t('adminLibrary.cloneTitle')}
                        >
                          <DownloadCloud className="size-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(gc._id)}
                          disabled={deletingId === gc._id}
                          className="p-1.5 rounded-md bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 transition-colors disabled:opacity-50"
                          title="Eliminar de la biblioteca global"
                        >
                          {deletingId === gc._id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                        </button>
                      </div>
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
            
            {!loading && filteredClassrooms.length === 0 && (
              <div className="w-full py-12 text-center text-slate-500 dark:text-slate-400">
                No hay cursos en la biblioteca global aún.
              </div>
            )}
            
            {!loading && hasMore && filteredClassrooms.length > 0 && !searchQuery && filter === 'all' && (
              <div className="w-full p-4 flex justify-center border-t border-slate-100 dark:border-slate-700/50">
                <button 
                  onClick={() => fetchClassrooms(true)}
                  className="px-4 py-2 text-sm font-medium text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded-lg transition-colors"
                >
                  Cargar más
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Usage Modal */}
      {inspectingCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh] border border-slate-200 dark:border-slate-700">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800 dark:text-slate-200 truncate pr-4 flex items-center gap-2">
                <Users className="size-5 text-amber-500" />
                Uso: {inspectingCourse.name}
              </h3>
              <button
                onClick={() => setInspectingCourse(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto">
              {loadingUsage ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="size-6 animate-spin text-sky-500" />
                </div>
              ) : activeUsers.length === 0 ? (
                <div className="text-center py-8 text-slate-500 dark:text-slate-400 text-sm">
                  Ningún alumno está usando este curso actualmente.
                </div>
              ) : (
                <div className="space-y-3">
                  {activeUsers.map(u => (
                    <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/50">
                      {u.avatar ? (
                        <img src={u.avatar} alt={u.nickname} className="size-10 rounded-full bg-slate-200 dark:bg-slate-800 object-cover" />
                      ) : (
                        <div className="size-10 rounded-full bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center text-sky-600 dark:text-sky-400 font-bold">
                          {(u.nickname || u.email || '?')[0].toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-slate-800 dark:text-slate-200 truncate">
                          {u.nickname || 'Sin nombre'}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {u.email || u.grade || 'Alumno'}
                        </div>
                      </div>
                      <div className={`shrink-0 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md ${u.statusColor}`}>
                        {u.status}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
