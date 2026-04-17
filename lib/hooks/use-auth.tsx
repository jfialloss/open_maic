'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useRouter, usePathname } from 'next/navigation';

export type UserRole = 'admin' | 'tutor' | 'student' | null;

interface AuthContextType {
  user: User | null;
  role: UserRole;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);
  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        
        // Define Admin automatically based on environment variable
        if (adminEmail && firebaseUser.email === adminEmail) {
          setRole('admin');
          
          // Silently sync the admin to Firestore for record-keeping so they show up in the database alongside others
          try {
            await setDoc(doc(db, 'users', firebaseUser.uid), {
              role: 'admin',
              email: firebaseUser.email
            }, { merge: true });
          } catch (e) {
            console.error('Failed to sync admin to Firestore DB:', e);
          }

          if (pathname === '/login') {
            router.push('/');
          }
        } else {
          // For non-admins, read role from Firestore
          try {
            const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
            if (userDoc.exists()) {
              const data = userDoc.data();
              setRole(data.role as UserRole);
              if (pathname === '/login' || pathname === '/onboarding') {
                router.push('/');
              }
            } else {
              setRole(null);
              // If they don't have a role and are not already in onboarding, redirect
              if (pathname !== '/onboarding') {
                router.push('/onboarding');
              }
            }
          } catch (error) {
            console.error('Error fetching user role from Firestore:', error);
          }
        }
      } else {
        setUser(null);
        setRole(null);
        // Public routes allowed without auth (e.g. login itself!)
        if (pathname !== '/login' && pathname !== '/onboarding') {
           // Maybe we want to allow viewing classes without login? 
           // For now, OpenMAIC requires login.
           router.push('/login');
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [adminEmail, pathname, router]);

  return (
    <AuthContext.Provider value={{ user, role, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
