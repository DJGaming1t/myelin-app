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
  signInWithCredential,
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

        try {
          const {
            GoogleOneTapSignIn,
            isCancelledResponse,
            isNoSavedCredentialFoundResponse,
            isSuccessResponse,
          } = await import('react-native-nitro-google-signin');

          GoogleOneTapSignIn.configure({
            webClientId: 'autoDetect',
            autoSelectOnSignIn: false,
          });

          await GoogleOneTapSignIn.checkPlayServices();

          let response = await GoogleOneTapSignIn.signIn();
          if (isNoSavedCredentialFoundResponse(response)) {
            response = await GoogleOneTapSignIn.createAccount();
          }
          if (isNoSavedCredentialFoundResponse(response)) {
            response = await GoogleOneTapSignIn.presentExplicitSignIn();
          }

          if (isCancelledResponse(response)) {
            const cancelled = new Error('Google sign-in cancelled') as Error & { code: string };
            cancelled.code = 'auth/google-cancelled';
            throw cancelled;
          }

          if (!isSuccessResponse(response) || !response.data.idToken) {
            const failed = new Error('Google sign-in did not return an ID token') as Error & {
              code: string;
            };
            failed.code = 'auth/google-failed';
            throw failed;
          }

          const firebaseCredential = GoogleAuthProvider.credential(response.data.idToken);
          const credential = await signInWithCredential(auth, firebaseCredential);
          setUser(credential.user);
        } catch (error) {
          const code = (error as { code?: string } | undefined)?.code;
          if (code === 'auth/google-cancelled' || code === 'auth/google-failed') throw error;

          const message = error instanceof Error ? error.message : '';
          if (
            message.includes('native module') ||
            message.includes('Nitro') ||
            message.includes('development build')
          ) {
            const setup = new Error('Native Google setup required') as Error & { code: string };
            setup.code = 'auth/native-google-setup-required';
            throw setup;
          }

          throw error;
        }
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
