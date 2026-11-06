import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { WorkspaceState } from '@/src/data/schema';

import {
  MAX_BACKUP_TEXT_BYTES,
  serializeNativeBackup,
} from './backup-engine';

function dateStamp(timestamp = Date.now()) {
  const date = new Date(timestamp);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export async function pickBackupText() {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/json', 'text/plain', 'application/octet-stream'],
    multiple: false,
    copyToCacheDirectory: true,
    base64: false,
  });

  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];

  if (asset.size != null && asset.size > MAX_BACKUP_TEXT_BYTES) {
    throw new Error('This backup is too large to import safely.');
  }

  let text: string;
  if (Platform.OS === 'web' && asset.file) {
    text = await asset.file.text();
  } else {
    text = await new File(asset.uri).text();
  }

  if (text.length > MAX_BACKUP_TEXT_BYTES) {
    throw new Error('This backup is too large to import safely.');
  }

  return {
    name: asset.name || 'MYELIN backup',
    text,
  };
}

export async function shareNativeBackup(workspace: WorkspaceState) {
  const text = serializeNativeBackup(workspace);
  const fileName = `myelin-native-backup-${dateStamp()}.json`;

  if (Platform.OS === 'web') {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return fileName;
  }

  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.write(text);

  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('File sharing is not available on this device.');
  }

  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle: 'Export MYELIN backup',
    UTI: 'public.json',
  });

  return fileName;
}
