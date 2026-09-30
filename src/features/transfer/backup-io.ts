import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';

import {
  MAX_BACKUP_BYTES,
  serializeNativeBackup,
} from './backup-engine';
import { WorkspaceState } from '@/src/data/schema';

function dateStamp(now = new Date()) {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

export function backupFileName(now = new Date()) {
  return `myelin-native-backup-${dateStamp(now)}.json`;
}

export async function readBackupDocument() {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/json', 'text/plain'],
    multiple: false,
    copyToCacheDirectory: true,
    base64: false,
  });

  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];

  if (typeof asset.size === 'number' && asset.size > MAX_BACKUP_BYTES) {
    throw new Error('Choose a MYELIN backup smaller than 8 MB.');
  }

  let text = '';

  if (Platform.OS === 'web' && asset.file) {
    text = await asset.file.text();
  } else {
    text = await FileSystem.readAsStringAsync(asset.uri);
  }

  return {
    name: asset.name || 'MYELIN backup',
    size: asset.size ?? null,
    text,
  };
}

export async function exportWorkspaceBackup(workspace: WorkspaceState) {
  const json = serializeNativeBackup(workspace);
  const name = backupFileName();

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return { name, method: 'download' as const };
  }

  if (!FileSystem.cacheDirectory) {
    await Share.share({
      title: 'MYELIN backup',
      message: json,
    });
    return { name, method: 'text-share' as const };
  }

  const uri = `${FileSystem.cacheDirectory}${name}`;
  await FileSystem.writeAsStringAsync(uri, json);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/json',
      dialogTitle: 'Export MYELIN backup',
      UTI: 'public.json',
    });
    return { name, method: 'file-share' as const };
  }

  await Share.share({
    title: 'MYELIN backup',
    message: json,
  });
  return { name, method: 'text-share' as const };
}
