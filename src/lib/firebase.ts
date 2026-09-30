import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  Auth,
  getAuth,
  getReactNativePersistence,
  initializeAuth,
  Persistence,
} from 'firebase/auth';
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

export const reactNativePersistence: Persistence | null =
  Platform.OS === 'web' ? null : getReactNativePersistence(AsyncStorage);

function makeAuth(): Auth {
  if (Platform.OS === 'web') return getAuth(firebaseApp);

  try {
    return initializeAuth(firebaseApp, {
      persistence: reactNativePersistence!,
    });
  } catch (error) {
    // Fast Refresh can initialize Auth more than once in development.
    return getAuth(firebaseApp);
  }
}

export const auth = makeAuth();
