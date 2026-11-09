import AsyncStorage from '@react-native-async-storage/async-storage';

import { createWorkspaceStorageEngine } from './storageEngine';

export const workspaceStorage = createWorkspaceStorageEngine(AsyncStorage);
