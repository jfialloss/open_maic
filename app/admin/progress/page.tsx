'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, ArrowLeft, TrendingUp, Search, User, X, CheckCircle2, Clock, FileSearch } from 'lucide-react';
import { collection, query, getDocs, doc, getDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/hooks/use-auth';
import { useI18n } from '@/lib/hooks/use-i18n';
import syllabusDataRaw from '@/lib/data/syllabus.json';

const syllabusData = syllabusDataRaw as any;

const BASIC_SUBJECTS = [
  'Matemática',
  'Ciencias Naturales',
  'Ciencias Sociales',
  'Lengua y Literatura'
];

interface TopicProgress {
  tema: string;
  isMastered: boolean;
}

interface UnitProgress {
  unitName: string;
  temas: TopicProgress[];
}

interface SubjectProgress {
  total: number;
  mastered: number;
  percent: number;
  currentUnit: string;
  currentTopic: string;
  units: UnitProgress[];
}

interface StudentProfile {
  uid: string;
  email: string;
  nickname: string;
  grade: string;
  englishLevel: string;
  masteredTopics: string[];
  subjectsProgress: Record<string, SubjectProgress>;
}

function getSublevelFromGrade(grade: string): string | null {
  if (['Inicial 1', 'Inicial 2'].includes(grade)) return 'Educación Inicial';
  if (['1º Grado de EGB'].includes(grade)) return 'Preparatoria';
  if (['2º Grado de EGB', '3º Grado de EGB', '4º Grado de EGB'].includes(grade)) return 'Básica Elemental';
  if (['5º Grado de EGB', '6º Grado de EGB', '7º Grado de EGB'].includes(grade)) return 'Básica Media';
  if (['8º Grado de EGB', '9º Grado de EGB', '10º Grado de EGB'].includes(grade)) return 'Básica Superior';
  if (['1º de Bachillerato', '2º de Bachillerato', '3º de Bachillerato'].includes(grade)) return 'Bachillerato';
  return null;
}

function computeSubjectProgress(syllabusMap: any, masteredTopics: string[]): SubjectProgress {
  if (!syllabusMap) return { total: 0, mastered: 0, currentUnit: 'N/A', currentTopic: 'N/A', percent: 0, units: [] };
  
  let total = 0;
  let mastered = 0;
  let currentUnit: string | null = null;
  let currentTopic: string | null = null;
  const units: UnitProgress[] = [];

  for (const [unitName, unitData] of Object.entries(syllabusMap)) {
    const temas = (unitData as any).temas || [];
    const unitProgress: UnitProgress = { unitName, temas: [] };
    
    for (const tema of temas) {
      total++;
      const isMastered = masteredTopics.includes(tema);
      if (isMastered) mastered++;
      else if (!currentTopic) {
        currentTopic = tema;
        currentUnit = unitName;
      }
      unitProgress.temas.push({ tema, isMastered });
    }
    units.push(unitProgress);
  }
  
  return {
    total,
    mastered,
    currentUnit: currentUnit || 'Completado',
    currentTopic: currentTopic || 'Completado',
    percent: total === 0 ? 0 : Math.round((mastered / total) * 100),
    units
  };
}

export default function AdminProgressPage() {
  const { role, loading: authLoading } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<StudentProfile | null>(null);

  useEffect(() => {
    if (!authLoading && role !== 'admin') {
      router.push('/');
    }
  }, [role, authLoading, router]);

  useEffect(() => {
    const fetchProgress = async () => {
      if (role !== 'admin') return;
      try {
        setLoading(true);
        const usersQ = query(collection(db, 'users'), where('role', '==', 'student'));
        const usersSnap = await getDocs(usersQ);
        
        const loadedStudents: StudentProfile[] = [];

        for (const userDoc of usersSnap.docs) {
          const userData = userDoc.data();
          const uid = userDoc.id;
          
          const profileSnap = await getDoc(doc(db, 'users', uid, 'data', 'profile'));
          if (profileSnap.exists()) {
            const profileData = profileSnap.data();
            const masteredTopics = profileData.masteredTopics || [];
            const grade = profileData.grade || 'Sin Asignar';
            const englishLevel = profileData.englishLevel || 'A1';
            
            const sublevel = getSublevelFromGrade(grade);
            const subjectsProgress: Record<string, SubjectProgress> = {};
            
            // Basic subjects
            for (const subj of BASIC_SUBJECTS) {
              const syllabusMap = sublevel ? syllabusData[subj]?.[sublevel] : null;
              subjectsProgress[subj] = computeSubjectProgress(syllabusMap, masteredTopics);
            }
            // English
            const englishSyllabus = syllabusData['Inglés']?.[englishLevel];
            subjectsProgress['Inglés'] = computeSubjectProgress(englishSyllabus, masteredTopics);

            const email = userData.email || 'N/A';
            const fullName = userData.displayName || profileData.nickname || (email !== 'N/A' ? email.split('@')[0] : 'Anónimo');

            loadedStudents.push({
              uid,
              email: userData.email || 'N/A',
              nickname: fullName,
              grade,
              englishLevel,
              masteredTopics,
              subjectsProgress
            });
          }
        }
        
        // Sort by nickname
        loadedStudents.sort((a, b) => a.nickname.localeCompare(b.nickname));
        setStudents(loadedStudents);
      } catch (err) {
        console.error('Failed to fetch progress:', err);
      } finally {
        setLoading(false);
      }
    };
    
    if (!authLoading) {
      fetchProgress();
    }
  }, [authLoading, role]);

  if (authLoading || role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <Loader2 className="size-8 animate-spin text-sky-500" />
      </div>
    );
  }

  const filteredStudents = students.filter(s => 
    s.nickname.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <button
          onClick={() => router.push('/')}
          className="mb-6 flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="size-4" />
          {t('common.backToHome')}
        </button>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <TrendingUp className="size-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {t('adminProgress.title')}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t('adminProgress.description')}
              </p>
            </div>
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <input
              type="text"
              placeholder={t('adminProgress.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full md:w-64 pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-shadow dark:text-slate-200"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-20 flex justify-center">
            <Loader2 className="size-8 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-medium border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-6 py-4">{t('adminProgress.student')}</th>
                    <th className="px-6 py-4"></th>
                    <th className="px-6 py-4">{t('adminProgress.gradeLevel')}</th>
                    {[...BASIC_SUBJECTS, 'Inglés'].map(subj => (
                      <th key={subj} className="px-6 py-4 text-center">{subj}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                        {t('adminProgress.noStudents')}
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map(student => (
                      <tr key={student.uid} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="size-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                              <User className="size-4 text-slate-500" />
                            </div>
                            <div>
                              <div className="font-semibold text-slate-800 dark:text-slate-200">{student.nickname}</div>
                              <div className="text-xs text-slate-500">{student.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => setSelectedStudent(student)}
                            className="p-2 rounded-lg text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-900/20 border border-sky-100 dark:border-sky-900/50 transition-colors"
                            title="Ver Detalle"
                          >
                            <FileSearch className="size-4" />
                          </button>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <span className="inline-flex w-fit px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium border border-slate-200 dark:border-slate-700">
                              {student.grade}
                            </span>
                            <span className="inline-flex w-fit px-2 py-0.5 rounded-md bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 text-[10px] font-bold border border-sky-100 dark:border-sky-800/50">
                              EN: {student.englishLevel}
                            </span>
                          </div>
                        </td>
                        {[...BASIC_SUBJECTS, 'Inglés'].map(subj => {
                          const p = student.subjectsProgress[subj];
                          const hasData = p.total > 0;
                          return (
                            <td key={subj} className="px-6 py-4">
                              {hasData ? (
                                <div className="flex flex-col items-center gap-1.5 w-full min-w-[100px]">
                                  <div className="flex justify-between w-full text-[10px] font-medium text-slate-500">
                                    <span>{p.percent}%</span>
                                    <span>{p.mastered}/{p.total}</span>
                                  </div>
                                  <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                    <div 
                                      className="h-full bg-emerald-500 rounded-full transition-all duration-500" 
                                      style={{ width: `${p.percent}%` }}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400 flex justify-center w-full">{t('adminProgress.na')}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Detailed View Modal */}
      <AnimatePresence>
        {selectedStudent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-12">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedStudent(null)}
              className="absolute inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="relative w-full max-w-5xl max-h-full bg-white dark:bg-slate-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800"
            >
              <div className="shrink-0 p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/20">
                <div>
                  <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    {t('adminProgress.detailsTitle')} <span className="text-sky-600 dark:text-sky-400">{selectedStudent.nickname}</span>
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                    {selectedStudent.grade} &bull; {t('adminProgress.englishLevel')} {selectedStudent.englishLevel}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedStudent(null)}
                  className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition-colors"
                >
                  <X className="size-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-950">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {[...BASIC_SUBJECTS, 'Inglés'].map(subj => {
                    const progress = selectedStudent.subjectsProgress[subj];
                    if (!progress || progress.total === 0) return null;
                    return (
                      <div key={subj} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="font-bold text-slate-700 dark:text-slate-200">{subj}</h3>
                          <span className="text-xs font-bold px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-md">
                            {progress.percent}%
                          </span>
                        </div>
                        
                        {progress.percent < 100 && (
                          <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-lg">
                            <div className="text-[10px] font-bold text-amber-600 dark:text-amber-500 uppercase tracking-wider mb-1">
                              {t('adminProgress.currentProgress')}
                            </div>
                            <div className="text-sm font-medium text-amber-900 dark:text-amber-200">
                              {progress.currentUnit}
                            </div>
                            <div className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-0.5 flex items-start gap-1.5">
                              <ArrowLeft className="size-3 mt-0.5 shrink-0 rotate-180" />
                              <span className="leading-tight">{progress.currentTopic}</span>
                            </div>
                          </div>
                        )}

                        <div className="space-y-4">
                          {progress.units.map((unit, uIdx) => (
                            <div key={uIdx} className="space-y-2">
                              <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-1">
                                {unit.unitName}
                              </h4>
                              <div className="space-y-1.5 pl-1">
                                {unit.temas.map((tema, tIdx) => (
                                  <div key={tIdx} className="flex items-start gap-2">
                                    {tema.isMastered ? (
                                      <CheckCircle2 className="size-4 shrink-0 text-emerald-500 mt-0.5" />
                                    ) : (
                                      <Clock className="size-4 shrink-0 text-slate-300 dark:text-slate-700 mt-0.5" />
                                    )}
                                    <span className={`text-sm leading-snug ${tema.isMastered ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400 dark:text-slate-600'}`}>
                                      {tema.tema}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
