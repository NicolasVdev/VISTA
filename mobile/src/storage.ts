import * as FileSystem from 'expo-file-system/legacy';
import Storage from 'expo-sqlite/kv-store';

import { VisitState } from './types';

const VISIT_KEY = 'vista.visit.demo.v1';
const MEDIA_DIRECTORY = `${FileSystem.documentDirectory}vista-media/`;

export async function loadVisit(): Promise<VisitState | null> {
  const value = await Storage.getItem(VISIT_KEY);
  return value ? (JSON.parse(value) as VisitState) : null;
}

export async function saveVisit(visit: VisitState): Promise<void> {
  await Storage.setItem(VISIT_KEY, JSON.stringify(visit));
}

async function ensureMediaDirectory(): Promise<void> {
  const info = await FileSystem.getInfoAsync(MEDIA_DIRECTORY);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(MEDIA_DIRECTORY, { intermediates: true });
  }
}

function extensionFromUri(uri: string, fallback: string): string {
  const cleanUri = uri.split('?')[0] ?? uri;
  const match = cleanUri.match(/\.([a-zA-Z0-9]{2,5})$/);
  return match?.[1]?.toLowerCase() ?? fallback;
}

export async function persistMedia(
  sourceUri: string,
  kind: 'audio' | 'photo'
): Promise<string> {
  await ensureMediaDirectory();
  const fallbackExtension = kind === 'audio' ? 'm4a' : 'jpg';
  const extension = extensionFromUri(sourceUri, fallbackExtension);
  const randomPart = Math.random().toString(36).slice(2, 9);
  const destination = `${MEDIA_DIRECTORY}${kind}-${Date.now()}-${randomPart}.${extension}`;
  await FileSystem.copyAsync({ from: sourceUri, to: destination });
  return destination;
}
