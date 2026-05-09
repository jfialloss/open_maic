'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useStageStore } from '@/lib/store/stage';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './dialog';
import { Check, Loader2, Users, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from './scroll-area';
import { Checkbox } from './checkbox';

const GRADES = [
  'Pre-K / Inicial',
  '1º Grado de EGB',
  '2º Grado de EGB',
  '3º Grado de EGB',
  '4º Grado de EGB',
  '5º Grado de EGB',
  '6º Grado de EGB',
  '7º Grado de EGB',
  '8º Grado de EGB',
  '9º Grado de EGB',
  '10º Grado de EGB',
  '1º Año de BGU',
  '2º Año de BGU',
  '3º Año de BGU',
  'Nivel Universitario',
];

interface AssignCourseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AssignCourseModal({ open, onOpenChange }: AssignCourseModalProps) {
  const stage = useStageStore((s) => s.stage);
  const [selectedGrade, setSelectedGrade] = useState('5º Grado de EGB');
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [students, setStudents] = useState<any[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      fetchStudents(selectedGrade);
    }
  }, [open, selectedGrade]);

  const fetchStudents = async (grade: string) => {
    setLoading(true);
    setStudents([]);
    setSelectedStudentIds(new Set());
    try {
      // Query students by role and grade from the root users collection
      const q = query(
        collection(db, 'users'),
        where('role', '==', 'student'),
        where('grade', '==', grade)
      );
      
      const querySnapshot = await getDocs(q);
      const fetchedStudents: any[] = [];
      querySnapshot.forEach((docSnap) => {
        fetchedStudents.push({ uid: docSnap.id, ...docSnap.data() });
      });
      setStudents(fetchedStudents);
    } catch (error: any) {
      console.error('Error fetching students:', error);
      toast.error('Fallo al obtener alumnos. Verifica permisos.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStudent = (uid: string) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const handleToggleAll = () => {
    if (selectedStudentIds.size === students.length) {
      setSelectedStudentIds(new Set());
    } else {
      setSelectedStudentIds(new Set(students.map((s) => s.uid)));
    }
  };

  const handleAssign = async () => {
    if (!stage || selectedStudentIds.size === 0) return;
    setAssigning(true);
    
    try {
      const courseData = {
        stageId: stage.id,
        topic: stage.topic || 'LIBRE',
        subject: stage.subject || 'Variados',
        grade: stage.grade || selectedGrade,
        name: stage.name || 'Curso Generado',
        sceneIndex: 0,
        actionIndex: 0,
        lastPlayedAt: Date.now()
      };

      // Assign sequentially or with Promise.all
      const promises = Array.from(selectedStudentIds).map(async (uid) => {
        const profileRef = doc(db, 'users', uid, 'data', 'profile');
        await setDoc(profileRef, {
          assignedCourses: {
            [stage.id]: {
              stageId: stage.id,
              name: stage.name || 'Curso Generado',
              subject: stage.subject || 'Variados',
              assignedAt: Date.now(),
              status: 'pending'
            }
          }
        }, { merge: true });
      });

      await Promise.all(promises);
      toast.success(`Curso asignado con éxito a ${selectedStudentIds.size} alumnos.`);
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error assigning course:', error);
      toast.error('Ocurrió un error al asignar el curso.');
    } finally {
      setAssigning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-500" />
            Asignar Curso a Alumnos
          </DialogTitle>
          <DialogDescription>
            Envía directamente el curso "{stage?.name || 'este curso'}" al panel de los estudiantes para que puedan empezarlo de inmediato.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Seleccionar Grado Objetivo
            </label>
            <select
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value)}
              className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              {GRADES.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-white dark:bg-gray-800">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Alumnos Encontrados ({students.length})
              </span>
              {students.length > 0 && (
                <button
                  onClick={handleToggleAll}
                  className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 transition-colors"
                >
                  {selectedStudentIds.size === students.length ? 'Deseleccionar Todos' : 'Seleccionar Todos'}
                </button>
              )}
            </div>
            
            <ScrollArea className="h-[200px]">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500 py-8">
                  <Loader2 className="w-6 h-6 animate-spin mb-2" />
                  <span className="text-sm">Buscando alumnos...</span>
                </div>
              ) : students.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500 py-8 text-center px-4">
                  <Search className="w-8 h-8 opacity-20 mb-2" />
                  <span className="text-sm">No se encontraron alumnos registrados en este grado.</span>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800/50">
                  {students.map((student) => (
                    <label
                      key={student.uid}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors",
                        selectedStudentIds.has(student.uid) && "bg-indigo-50/50 dark:bg-indigo-900/10"
                      )}
                    >
                      <Checkbox
                        checked={selectedStudentIds.has(student.uid)}
                        onCheckedChange={() => handleToggleStudent(student.uid)}
                        className="data-[state=checked]:bg-indigo-500 data-[state=checked]:border-indigo-500"
                      />
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {student.displayName || 'Alumno sin nombre'}
                        </span>
                        <span className="text-[11px] text-gray-500 truncate">
                          {student.email || 'Sin correo'}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="mt-2 sm:justify-end gap-2">
          <button
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 text-sm font-semibold rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            disabled={selectedStudentIds.size === 0 || assigning}
            onClick={handleAssign}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {assigning ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            Asignar Curso ({selectedStudentIds.size})
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
