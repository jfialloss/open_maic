'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Brain, CheckCircle2, XCircle, ArrowRight, Star, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import syllabusData from '@/lib/data/syllabus.json';
import { useUserProfileStore } from '@/lib/store/user-profile';
import { useSettingsStore } from '@/lib/store/settings';
import { auth } from '@/lib/firebase';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';

interface PracticeModalProps {
  onClose: () => void;
}

type Question = {
  question: string;
  options: string[];
  correctIndex: number;
};

function getSublevel(grade: string) {
  if (grade.includes('Bachillerato') || grade.includes('BGU')) return 'Bachillerato';
  if (grade.includes('8º') || grade.includes('9º') || grade.includes('10º')) return 'Básica Superior';
  if (grade.includes('5º') || grade.includes('6º') || grade.includes('7º')) return 'Básica Media';
  return 'Básica Elemental';
}

export function PracticeModal({ onClose }: PracticeModalProps) {
  const { grade, awardXP, englishLevel } = useUserProfileStore();
  const sublevel = getSublevel(grade || '4º Grado de EGB');

  // Step 0: Setup, 1: Loading, 2: Playing, 3: Result
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  
  // Selection state
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);

  // Gameplay state
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);

  // Derived data for syllabus
  const syllabus = syllabusData as Record<string, Record<string, Record<string, { temas: string[] }>>>;
  const subjects = Object.keys(syllabus);

  const availableTopics = useMemo(() => {
    if (!selectedSubject) return [];
    const levelKey = selectedSubject === 'Inglés' ? (englishLevel || 'A1') : sublevel;
    const units = syllabus[selectedSubject]?.[levelKey];
    if (!units) return [];
    
    // Flatten all topics from all units
    let topics: string[] = [];
    Object.values(units).forEach((u: any) => {
      topics = [...topics, ...(u.temas || [])];
    });
    return topics;
  }, [selectedSubject, sublevel, englishLevel, syllabus]);

  const handleGenerate = async () => {
    if (!selectedSubject || !selectedTopic) return;
    try {
      setIsGenerating(true);
      setStep(1);

      const settings = useSettingsStore.getState();
      const provider = settings.providersConfig[settings.providerId];
      const token = await auth.currentUser?.getIdToken();
      
      const apiKey = provider?.apiKey?.trim() || undefined;
      const baseUrl = apiKey && provider?.baseUrl?.trim() ? provider.baseUrl.trim() : undefined;

      const res = await fetch('/api/generate-practice', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          subject: selectedSubject,
          grade: grade,
          englishLevel: englishLevel,
          topic: selectedTopic,
          providerId: settings.providerId,
          modelId: settings.modelId,
          apiKey,
          baseUrl,
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error en el servidor');
      
      if (!data || !data.questions) throw new Error('Formato inválido');

      const shuffledQuestions = data.questions.map((q: Question) => {
        const indices = [0, 1, 2, 3];
        for (let i = indices.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        return {
          ...q,
          options: indices.map(idx => q.options[idx]),
          correctIndex: indices.indexOf(q.correctIndex)
        };
      });

      setQuestions(shuffledQuestions);
      setStep(2);
      setCurrentQIndex(0);
      setScore(0);
      setSelectedAnswer(null);
      setHasAnswered(false);

    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Ocurrió un error al generar la práctica. Intenta de nuevo.');
      setStep(0);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSelectAnswer = (idx: number) => {
    if (hasAnswered) return;
    setSelectedAnswer(idx);
    setHasAnswered(true);

    const isCorrect = idx === questions[currentQIndex].correctIndex;
    if (isCorrect) {
      setScore(s => s + 1);
      confetti({
        particleCount: 40,
        spread: 60,
        origin: { y: 0.8 },
        colors: ['#38bdf8', '#fbbf24', '#34d399']
      });
    }
  };

  const handleNext = () => {
    if (currentQIndex < questions.length - 1) {
      setCurrentQIndex(prev => prev + 1);
      setSelectedAnswer(null);
      setHasAnswered(false);
    } else {
      // Finish
      setStep(3);
      if (score > 0) {
        const xpEarned = score * 5; // 5 XP per correct answer
        
        // Use a generic id with timestamp to ensure it triggers awardXP history correctly
        const courseId = `practica-${(selectedSubject || 'materia').toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
        
        awardXP(courseId, xpEarned);
        toast.success(`¡Felicidades! Has ganado ${xpEarned} XP`);
        
        confetti({
          particleCount: 150,
          spread: 100,
          origin: { y: 0.6 }
        });
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={step === 0 || step === 3 ? onClose : undefined}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
      />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-border"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border/50 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center border border-sky-200 dark:border-sky-800/50">
              <Brain className="size-5 text-sky-600 dark:text-sky-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Zona de Prácticas</h2>
              <p className="text-xs text-muted-foreground">Generador Inteligente • {grade} • Inglés {englishLevel || 'A1'}</p>
            </div>
          </div>
          {(step === 0 || step === 3) && (
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="size-5 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-6">
          <AnimatePresence mode="wait">
            
            {/* STEP 0: Selection */}
            {step === 0 && (
              <motion.div
                key="step0"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-6"
              >
                <div>
                  <label className="text-sm font-semibold text-foreground mb-3 block">1. Selecciona la Materia</label>
                  <div className="grid grid-cols-2 gap-3">
                    {subjects.map(s => (
                      <button
                        key={s}
                        onClick={() => { setSelectedSubject(s); setSelectedTopic(null); }}
                        className={cn(
                          "px-4 py-3 rounded-xl border text-left transition-all",
                          selectedSubject === s 
                            ? "bg-sky-50 border-sky-300 dark:bg-sky-500/10 dark:border-sky-500/50 ring-2 ring-sky-500/20" 
                            : "bg-white dark:bg-slate-800/50 border-border hover:border-sky-200 dark:hover:border-sky-800"
                        )}
                      >
                        <span className={cn("font-medium", selectedSubject === s ? "text-sky-700 dark:text-sky-400" : "text-slate-700 dark:text-slate-300")}>
                          {s}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {selectedSubject && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    <label className="text-sm font-semibold text-foreground mb-3 block">
                      2. Selecciona un Tema ({selectedSubject === 'Inglés' ? `Nivel ${englishLevel || 'A1'}` : sublevel})
                    </label>
                    <div className="max-h-[200px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                      {availableTopics.length === 0 ? (
                        <p className="text-sm text-muted-foreground p-4 text-center border border-dashed border-border rounded-xl">
                          No hay temas disponibles para este nivel en el currículo.
                        </p>
                      ) : (
                        availableTopics.map((t, idx) => (
                          <button
                            key={idx}
                            onClick={() => setSelectedTopic(t)}
                            className={cn(
                              "w-full px-4 py-3 rounded-xl border text-left text-sm transition-all",
                              selectedTopic === t 
                                ? "bg-amber-50 border-amber-300 dark:bg-amber-500/10 dark:border-amber-500/50 ring-2 ring-amber-500/20" 
                                : "bg-white dark:bg-slate-800/50 border-border hover:border-amber-200 dark:hover:border-amber-800/50"
                            )}
                          >
                            <span className={selectedTopic === t ? "text-amber-700 dark:text-amber-400 font-medium" : "text-slate-600 dark:text-slate-300"}>
                              {t}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}

                <div className="pt-4 flex justify-end border-t border-border mt-6">
                  <Button
                    onClick={handleGenerate}
                    disabled={!selectedSubject || !selectedTopic || isGenerating}
                    className="bg-sky-600 hover:bg-sky-700 text-white rounded-xl px-6 h-12 shadow-sm font-medium"
                  >
                    {isGenerating ? <Loader2 className="size-4 animate-spin mr-2" /> : <Sparkles className="size-4 mr-2" />}
                    Generar Práctica Rápida
                  </Button>
                </div>
              </motion.div>
            )}

            {/* STEP 1: Loading */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="py-20 flex flex-col items-center justify-center text-center space-y-4"
              >
                <div className="relative">
                  <div className="absolute inset-0 bg-sky-400 blur-xl opacity-20 rounded-full animate-pulse" />
                  <div className="size-16 rounded-2xl bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center shadow-lg relative">
                    <Loader2 className="size-8 text-white animate-spin" />
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">Creando tu desafío...</h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                    La IA está diseñando 3 preguntas perfectas sobre <span className="font-semibold">"{selectedTopic}"</span> para ti.
                  </p>
                </div>
              </motion.div>
            )}

            {/* STEP 2: Playing */}
            {step === 2 && questions.length > 0 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex justify-between items-center text-sm">
                  <span className="font-medium text-muted-foreground">Pregunta {currentQIndex + 1} de {questions.length}</span>
                  <div className="flex gap-1">
                    {questions.map((_, i) => (
                      <div key={i} className={cn("h-1.5 w-6 rounded-full", i <= currentQIndex ? "bg-sky-500" : "bg-slate-200 dark:bg-slate-800")} />
                    ))}
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/40 p-5 rounded-2xl border border-border">
                  <h3 className="text-lg font-semibold text-foreground leading-relaxed">
                    {questions[currentQIndex].question}
                  </h3>
                </div>

                <div className="space-y-3">
                  {questions[currentQIndex].options.map((opt, idx) => {
                    const isSelected = selectedAnswer === idx;
                    const isCorrect = idx === questions[currentQIndex].correctIndex;
                    
                    let btnClass = "bg-white dark:bg-slate-900 border-border hover:border-sky-300 dark:hover:border-sky-700 hover:bg-slate-50 dark:hover:bg-slate-800/50";
                    let icon = null;

                    if (hasAnswered) {
                      if (isCorrect) {
                        btnClass = "bg-emerald-50 border-emerald-500 dark:bg-emerald-500/10 dark:border-emerald-500 text-emerald-800 dark:text-emerald-300 ring-2 ring-emerald-500/20";
                        icon = <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" />;
                      } else if (isSelected) {
                        btnClass = "bg-rose-50 border-rose-500 dark:bg-rose-500/10 dark:border-rose-500 text-rose-800 dark:text-rose-300";
                        icon = <XCircle className="size-5 text-rose-600 dark:text-rose-400" />;
                      } else {
                        btnClass = "opacity-50 border-border bg-white dark:bg-slate-900"; // dim others
                      }
                    }

                    return (
                      <button
                        key={idx}
                        disabled={hasAnswered}
                        onClick={() => handleSelectAnswer(idx)}
                        className={cn(
                          "w-full flex items-center justify-between p-4 rounded-xl border text-left transition-all duration-300",
                          btnClass
                        )}
                      >
                        <span className="font-medium text-[15px]">{opt}</span>
                        {icon && <span className="ml-3 shrink-0">{icon}</span>}
                      </button>
                    );
                  })}
                </div>

                <AnimatePresence>
                  {hasAnswered && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="pt-4 flex justify-end"
                    >
                      <Button
                        onClick={handleNext}
                        className="bg-sky-600 hover:bg-sky-700 text-white rounded-xl px-8 h-12 shadow-md"
                      >
                        {currentQIndex < questions.length - 1 ? 'Siguiente Pregunta' : 'Ver Resultados'}
                        <ArrowRight className="size-4 ml-2" />
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {/* STEP 3: Results */}
            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-10 flex flex-col items-center justify-center text-center space-y-6"
              >
                <div className="relative">
                  <div className="size-24 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center border-4 border-amber-200 dark:border-amber-800/50">
                    <Star className="size-12 text-amber-500 fill-amber-500" />
                  </div>
                  <div className="absolute -bottom-2 -right-2 bg-emerald-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg border-2 border-white dark:border-slate-900">
                    +{score * 5} XP
                  </div>
                </div>
                
                <div>
                  <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100">
                    {score === 3 ? '¡Perfecto!' : score > 0 ? '¡Buen trabajo!' : '¡Sigue practicando!'}
                  </h3>
                  <p className="text-slate-500 dark:text-slate-400 mt-2">
                    Respondiste correctamente <span className="font-bold text-sky-600 dark:text-sky-400">{score}</span> de {questions.length} preguntas.
                  </p>
                </div>

                <div className="flex gap-3 pt-6 w-full max-w-sm">
                  <Button
                    variant="outline"
                    onClick={onClose}
                    className="flex-1 rounded-xl h-12"
                  >
                    Cerrar
                  </Button>
                  <Button
                    onClick={() => {
                      setStep(0);
                      setSelectedTopic(null);
                    }}
                    className="flex-1 bg-sky-600 hover:bg-sky-700 text-white rounded-xl h-12"
                  >
                    Otra Práctica
                  </Button>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
