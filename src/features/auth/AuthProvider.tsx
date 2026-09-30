import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  inMemoryPersistence,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  User,
} from 'firebase/auth';
import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Platform } from 'react-native';

import { auth, reactNativePersistence } from '@/src/lib/firebase';

const LOCAL_MODE_KEY = 'myelin.auth.local-mode';

type AuthContextValue = {
  ready: boolean;
  user: User | null;
  localMode: boolean;
  signInEmail: (email: string, password: string, keepSignedIn: boolean) => Promise<void>;
  signUpEmail: (
    name: string,
    email: string,
    password: string,
    keepSignedIn: boolean,
  ) => Promise<void>;
  signInGoogle: (keepSignedIn?: boolean) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  refreshVerification: () => Promise<boolean>;
  signOutUser: () => Promise<void>;
  continueLocally: () => Promise<void>;
  exitLocalMode: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function choosePersistence(keepSignedIn: boolean) {
  if (Platform.OS === 'web') {
    await setPersistence(auth, keepSignedIn ? browserLocalPersistence : browserSessionPersistence);
    return;
  }

  await setPersistence(
    auth,
    keepSignedIn && reactNativePersistence ? reactNativePersistence : inMemoryPersistence,
  );
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [localMode, setLocalMode] = useState(false);
  const [, forceRefresh] = useState(0);

  useEffect(() => {
    let mounted = true;

    AsyncStorage.getItem(LOCAL_MODE_KEY)
      .then((value) => {
        if (mounted) setLocalMode(value === '1');
      })
      .finally(() => {
        if (mounted) setReady(true);
      });

    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (!mounted) return;
      setUser(nextUser);
      if (nextUser) {
        setLocalMode(false);
        await AsyncStorage.removeItem(LOCAL_MODE_KEY);
      }
      setReady(true);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      user,
      localMode,

      async signInEmail(email, password, keepSignedIn) {
        await choosePersistence(keepSignedIn);
        const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
        setUser(credential.user);
      },

      async signUpEmail(name, email, password, keepSignedIn) {
        await choosePersistence(keepSignedIn);
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        const cleanName = name.trim();
        if (cleanName) await updateProfile(credential.user, { displayName: cleanName });
        await sendEmailVerification(credential.user);
        setUser(credential.user);
      },

      async signInGoogle(keepSignedIn = false) {
        await choosePersistence(keepSignedIn);

        if (Platform.OS === 'web') {
          const provider = new GoogleAuthProvider();
          provider.setCustomParameters({ prompt: 'select_account' });
          const credential = await signInWithPopup(auth, provider);
          setUser(credential.user);
          return;
        }

        const error = new Error('Native Google setup required') as Error & { code: string };
        error.code = 'auth/native-google-setup-required';
        throw error;
      },

      async requestPasswordReset(email) {
        await sendPasswordResetEmail(auth, email.trim());
      },

      async resendVerification() {
        if (!auth.currentUser) throw new Error('No signed-in user');
        await sendEmailVerification(auth.currentUser);
      },

      async refreshVerification() {
        if (!auth.currentUser) return false;
        await reload(auth.currentUser);
        setUser(auth.currentUser);
        forceRefresh((value) => value + 1);
        return auth.currentUser.emailVerified;
      },

      async signOutUser() {
        await signOut(auth);
        setUser(null);
      },

      async continueLocally() {
        await signOut(auth);
        await AsyncStorage.setItem(LOCAL_MODE_KEY, '1');
        setUser(null);
        setLocalMode(true);
      },

      async exitLocalMode() {
        await AsyncStorage.removeItem(LOCAL_MODE_KEY);
        setLocalMode(false);
      },
    }),
    [localMode, ready, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
