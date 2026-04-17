'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/hooks/use-auth';
import { createLogger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { GraduationCap, Briefcase, Loader2, Check } from 'lucide-react';

const log = createLogger('Onboarding');

export default function OnboardingPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [selectedRole, setSelectedRole] = useState<'tutor' | 'student' | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // If unauthenticated entirely, bounce to login
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleSaveRole = async () => {
    if (!selectedRole) return;
    
    try {
      setIsSaving(true);
      await setDoc(doc(db, 'users', user.uid), {
        role: selectedRole,
        email: user.email,
        createdAt: serverTimestamp()
      });
      toast.success('¡Perfil configurado con éxito!');
      router.push('/');
    } catch (error) {
      log.error('Failed to save role', error);
      toast.error('Ocurrió un error al configurar tu perfil.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex flex-col items-center justify-center p-4 overflow-x-hidden relative">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="z-10 w-full max-w-[500px]"
      >
        <div className="w-full rounded-2xl border border-border/60 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-xl shadow-black/[0.03] p-8 text-center flex flex-col items-center">
          
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2"
          >
            Configura tu Perfil
          </motion.h1>
          
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-sm text-muted-foreground/80 mb-8"
          >
            Para personalizar tu experiencia, cuéntanos cómo usarás la plataforma.
          </motion.p>

          <div className="grid grid-cols-2 gap-4 w-full mb-8">
            <RoleCard
              icon={GraduationCap}
              title="Alumno"
              description="Aprende y participa"
              selected={selectedRole === 'student'}
              onClick={() => setSelectedRole('student')}
              delay={0.3}
            />
            <RoleCard
              icon={Briefcase}
              title="Tutor"
              description="Diseña y enseña"
              selected={selectedRole === 'tutor'}
              onClick={() => setSelectedRole('tutor')}
              delay={0.4}
            />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="w-full"
          >
            <Button
              onClick={handleSaveRole}
              disabled={!selectedRole || isSaving}
              className="w-full h-12 bg-sky-600 hover:bg-sky-700 text-white transition-all shadow-sm group font-medium"
            >
              {isSaving ? (
                <Loader2 className="size-4 animate-spin mr-2" />
              ) : null}
              {isSaving ? 'Guardando...' : 'Comenzar Aventura'}
            </Button>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

function RoleCard({ 
  icon: Icon, 
  title, 
  description, 
  selected, 
  onClick, 
  delay 
}: { 
  icon: any; 
  title: string; 
  description: string; 
  selected: boolean; 
  onClick: () => void; 
  delay: number;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      onClick={onClick}
      className={`relative flex flex-col items-center p-6 rounded-xl border-2 transition-all duration-200 text-left cursor-pointer group hover:shadow-md ${
        selected 
          ? 'border-sky-500 bg-sky-50 dark:bg-sky-500/10 shadow-sm' 
          : 'border-border/50 bg-white dark:bg-slate-800 hover:border-sky-200 dark:hover:border-sky-800/50'
      }`}
    >
      {selected && (
        <div className="absolute top-3 right-3 text-sky-500">
          <Check className="size-4 stroke-[3]" />
        </div>
      )}
      <div className={`p-3 rounded-full mb-4 transition-colors ${
        selected 
          ? 'bg-sky-100 dark:bg-sky-500/20 text-sky-600 dark:text-sky-400' 
          : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 group-hover:bg-sky-50 dark:group-hover:bg-sky-900/30 group-hover:text-sky-500/70'
      }`}>
        <Icon className="size-6" />
      </div>
      <h3 className={`font-semibold mb-1 ${selected ? 'text-sky-700 dark:text-sky-400' : 'text-slate-700 dark:text-slate-200'}`}>
        {title}
      </h3>
      <p className="text-[11px] text-muted-foreground max-w-[120px] text-center leading-tight">
        {description}
      </p>
    </motion.button>
  );
}
