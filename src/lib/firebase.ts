import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
import type { Auth, Persistence } from 'firebase/auth';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: 'AIzaSyAwJYVxp6ErzCnBvrG6PJs8DJ3YoSnwN-o',
  authDomain: 'myelin-a0ba7.firebaseapp.com',
  projectId: 'myelin-a0ba7',
  storageBucket: 'myelin-a0ba7.firebasestorage.app',
  messagingSenderId: '14373433855',
  appId: '1:14373433855:web:a59a5e4e20a85e73ecf7ca',
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

/**
 * Firebase exposes getReactNativePersistence from its React Native bundle at runtime,
 * but some Firebase 12 TypeScript resolution paths omit it from the public declaration.
 * Keep the workaround isolated here instead of suppressing type checking across the app.
 */
type FirebaseAuthWithReactNativePersistence = typeof FirebaseAuth & {
  getReactNativePersistence: (storage: typeof AsyncStorage) => Persistence;
};

const getReactNativePersistence = (
  FirebaseAuth as FirebaseAuthWithReactNativePersistence
).getReactNativePersistence;

export const reactNativePersistence: Persistence | null =
  Platform.OS === 'web' ? null : getReactNativePersistence(AsyncStorage);

function makeAuth(): Auth {
  if (Platform.OS === 'web') return FirebaseAuth.getAuth(firebaseApp);

  try {
    return FirebaseAuth.initializeAuth(firebaseApp, {
      persistence: reactNativePersistence!,
    });
  } catch {
    // Fast Refresh can initialize Auth more than once in development.
    return FirebaseAuth.getAuth(firebaseApp);
  }
}

export const auth = makeAuth();
