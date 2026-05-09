'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Search, Library, Loader2, DownloadCloud, Trash2, LayoutTemplate } from 'lucide-react';
import { collection, query, orderBy, getDocs, limit, startAfter, QueryDocumentSnapshot, DocumentData, doc, deleteDoc, where } from 'firebase/firestore';
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
    if (!window.confirm('¿Estás seguro de que deseas eliminar este curso de la biblioteca global?')) return;
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
        toast.error('No se puede borrar: Este curso está siendo utilizado por uno o más alumnos en progreso.');
        return;
      }

      await deleteDoc(doc(firestoreDb, 'global_classrooms', id));
      setClassrooms(prev => prev.filter(c => c._id !== id));
      toast.success('Curso eliminado de la biblioteca global');
    } catch (e) {
      console.error(e);
      toast.error('Error al eliminar el curso');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownload = async (id: string, classroomData: any) => {
    toast.loading('Descargando clase para continuar...', { id });
    try {
      const { processCloudDownload } = await import('@/lib/utils/cloud-sync');
      await processCloudDownload(id, classroomData);
      toast.success('Clonación completa', { id });
      router.push(`/classroom/${id}`);
    } catch (e) {
      console.error(e);
      toast.error('Fallo al descargar curso', { id });
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
              Biblioteca Global
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Explora y audita los cursos generados por la comunidad.
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
                placeholder="Buscar cursos o autores..."
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
                Todos
              </button>
              <button 
                onClick={() => setFilter('mine')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${filter === 'mine' ? 'bg-white dark:bg-slate-800 shadow-sm text-slate-800 dark:text-slate-200' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                Míos
              </button>
              <button 
                onClick={() => setFilter('community')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${filter === 'community' ? 'bg-white dark:bg-slate-800 shadow-sm text-slate-800 dark:text-slate-200' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                De la Comunidad
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 bg-slate-50/50 dark:bg-slate-900/50 dark:text-slate-400 uppercase">
                <tr>
                  <th className="px-6 py-4 font-medium">Fecha</th>
                  <th className="px-6 py-4 font-medium">Autor</th>
                  <th className="px-6 py-4 font-medium">Curso</th>
                  <th className="px-6 py-4 font-medium">Materia</th>
                  <th className="px-6 py-4 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {filteredClassrooms.map((gc) => (
                  <tr key={gc._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                    <td className="px-6 py-4 whitespace-nowrap text-slate-500 dark:text-slate-400 text-xs">
                      {gc.createdAtTime ? new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(gc.createdAtTime)) : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      {gc.authorNickname || 'Unknown'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-800 dark:text-slate-200 line-clamp-1" title={gc.stage?.name}>
                        {gc.stage?.name || 'Untitled'}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-1">
                        <LayoutTemplate className="size-3" /> {gc.scenes?.length || 0} diapositivas
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center rounded-sm bg-indigo-100 dark:bg-indigo-900/40 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-400">
                        {gc.subject === 'none' || !gc.subject ? 'Libre' : gc.subject}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleDownload(gc._id, gc)}
                          className="p-1.5 rounded-md bg-sky-50 text-sky-600 hover:bg-sky-100 dark:bg-sky-900/20 dark:text-sky-400 dark:hover:bg-sky-900/40 transition-colors"
                          title="Clonar a mis cursos"
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
    </div>
  );
}
