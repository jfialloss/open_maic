'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ArrowLeft, Users, Check, Save } from 'lucide-react';
import { collection, query, orderBy, getDocs, doc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/hooks/use-auth';
import { toast } from 'sonner';

interface UserData {
  id: string;
  email: string;
  nickname: string;
  displayName: string;
  role: string;
  grade: string;
  gradeConfirmed: boolean;
}

const GRADES = [
  'Inicial 1', 'Inicial 2', '1º Grado de EGB', '2º Grado de EGB', '3º Grado de EGB',
  '4º Grado de EGB', '5º Grado de EGB', '6º Grado de EGB', '7º Grado de EGB',
  '8º Grado de EGB', '9º Grado de EGB', '10º Grado de EGB', '1º Curso de Bachillerato',
  '2º Curso de Bachillerato', '3º Curso de Bachillerato'
];

export default function AdminUsersPage() {
  const { role: currentUserRole, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Filtros
  const [roleFilter, setRoleFilter] = useState<string>('all');

  useEffect(() => {
    if (!authLoading && currentUserRole !== 'admin' && currentUserRole !== 'tutor') {
      router.push('/');
    }
  }, [currentUserRole, authLoading, router]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const q = query(collection(db, 'users'), orderBy('email', 'asc'));
      const snapshot = await getDocs(q);
      
      const newUsers: UserData[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        newUsers.push({
          id: docSnap.id,
          email: data.email || '',
          nickname: data.nickname || '',
          displayName: data.displayName || '',
          role: data.role || 'student',
          grade: data.grade || '5º Grado de EGB',
          gradeConfirmed: !!data.gradeConfirmed,
        });
      });

      setUsers(newUsers);
    } catch (error: any) {
      console.error('Failed to fetch users:', error);
      toast.error('Error cargando usuarios: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUserRole === 'admin' || currentUserRole === 'tutor') {
      fetchUsers();
    }
  }, [currentUserRole]);

  const handleUpdateUser = async (userId: string, updates: Partial<UserData>, confirmGrade: boolean = false) => {
    try {
      setSavingId(userId);
      const userDocRef = doc(db, 'users', userId);
      const profileDocRef = doc(db, 'users', userId, 'data', 'profile');

      const payload: any = { ...updates };
      if (confirmGrade) {
        payload.gradeConfirmed = true;
      }

      // 1. Update root user doc
      await updateDoc(userDocRef, payload).catch(async (e) => {
        if (e.code === 'not-found') {
          await setDoc(userDocRef, payload, { merge: true });
        } else throw e;
      });

      // 2. Update profile data doc to sync with client's Zustand store
      // We only sync grade and gradeConfirmed to profile doc. 
      // Role is not in user-profile store, it's read by useAuth from root doc.
      const profilePayload: any = {};
      if (payload.grade !== undefined) profilePayload.grade = payload.grade;
      if (payload.gradeConfirmed !== undefined) profilePayload.gradeConfirmed = payload.gradeConfirmed;

      if (Object.keys(profilePayload).length > 0) {
        await updateDoc(profileDocRef, profilePayload).catch(async (e) => {
           if (e.code === 'not-found') {
             await setDoc(profileDocRef, profilePayload, { merge: true });
           } else {
             console.error('Profile update failed (might not exist yet), ignoring', e);
           }
        });
      }

      // Optimistic update in UI
      setUsers((prev) => prev.map(u => u.id === userId ? { ...u, ...payload } : u));
      
      toast.success(confirmGrade ? 'Grado confirmado exitosamente' : 'Usuario actualizado');
    } catch (error: any) {
      console.error('Failed to update user:', error);
      toast.error('Error al actualizar usuario');
    } finally {
      setSavingId(null);
    }
  };

  if (authLoading || (currentUserRole !== 'admin' && currentUserRole !== 'tutor')) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <Loader2 className="size-8 animate-spin text-sky-500" />
      </div>
    );
  }

  const filteredUsers = users.filter(u => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
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
          Volver al Inicio
        </button>

        <div className="flex items-center gap-3 mb-8">
          <div className="size-12 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <Users className="size-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              Gestión de Usuarios
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Administra los roles y confirma el grado académico de los estudiantes.
            </p>
          </div>
          
          <div className="ml-auto flex items-center gap-3 bg-white dark:bg-slate-900 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-500 font-medium px-2">Filtro de Rol</span>
              <select 
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="bg-transparent text-sm font-medium outline-none px-2 py-0.5 text-slate-700 dark:text-slate-300 dark:[color-scheme:dark]"
              >
                <option value="all">Todos</option>
                <option value="student">Alumnos</option>
                <option value="tutor">Tutores</option>
                {currentUserRole === 'admin' && <option value="admin">Administradores</option>}
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm mb-8">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-medium border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-3">Nombre / Email</th>
                  <th className="px-6 py-3">Rol</th>
                  <th className="px-6 py-3">Grado Actual</th>
                  <th className="px-6 py-3 text-center">Estado</th>
                  <th className="px-6 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredUsers.length === 0 && !loading && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                      No se encontraron usuarios.
                    </td>
                  </tr>
                )}
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-800 dark:text-slate-200">
                        {user.displayName || user.nickname || 'Anónimo'}
                      </div>
                      <div className="text-xs text-slate-500">
                        {user.email}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        className="bg-slate-100 dark:bg-slate-800 border-none rounded px-2 py-1 outline-none text-xs text-slate-700 dark:text-slate-300"
                        value={user.role}
                        onChange={(e) => handleUpdateUser(user.id, { role: e.target.value })}
                        disabled={savingId === user.id || (user.role === 'admin' && currentUserRole !== 'admin')}
                      >
                        <option value="student">Alumno</option>
                        <option value="tutor">Tutor</option>
                        {currentUserRole === 'admin' && <option value="admin">Administrador</option>}
                      </select>
                    </td>
                    <td className="px-6 py-4">
                      {user.role === 'student' ? (
                        <select
                          className="bg-slate-100 dark:bg-slate-800 border-none rounded px-2 py-1 outline-none text-xs text-slate-700 dark:text-slate-300 w-48"
                          value={user.grade}
                          onChange={(e) => handleUpdateUser(user.id, { grade: e.target.value })}
                          disabled={savingId === user.id}
                        >
                          {GRADES.map(g => (
                            <option key={g} value={g}>{g}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-slate-400 text-xs italic">N/A</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {user.role === 'student' && user.gradeConfirmed && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                          <Check className="size-3" /> Confirmado
                        </span>
                      )}
                      {user.role === 'student' && !user.gradeConfirmed && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                          Pendiente
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {user.role === 'student' && (
                        <button
                          onClick={() => handleUpdateUser(user.id, { grade: user.grade }, true)}
                          disabled={savingId === user.id || user.gradeConfirmed}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-900/50 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {savingId === user.id ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                          Confirmar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
