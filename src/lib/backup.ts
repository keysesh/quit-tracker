// Backups: everything lives in this browser's localStorage, so give people a file
// they can keep (Files / iCloud / AirDrop on a phone, a download on a computer).

import type { QuitProfile } from './types';

const isTouch = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

export function backupFileName(d = new Date()) {
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `clear-backup-${ymd}.json`;
}

/** Returns 'shared' | 'downloaded' | 'cancelled'. */
export async function exportBackup(profile: QuitProfile): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const json = JSON.stringify({ app: 'clear', version: 1, exportedAt: new Date().toISOString(), profile }, null, 2);
  const name = backupFileName();
  const file = new File([json], name, { type: 'application/json' });

  // On phones the share sheet is the reliable way to save a file (Save to Files, AirDrop…).
  if (isTouch() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Clear backup' });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
      // fall through to a plain download
    }
  }

  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'downloaded';
}

/** Parses a backup file (or a bare profile). Throws with a readable message if it isn't one. */
export function parseBackup(text: string): unknown {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file isn’t a Clear backup.');
  }
  const obj = data as { profile?: unknown };
  const p = (obj && typeof obj === 'object' && 'profile' in obj ? obj.profile : data) as { quitDate?: unknown };
  if (!p || typeof p !== 'object' || typeof p.quitDate !== 'string' || isNaN(Date.parse(p.quitDate))) {
    throw new Error('That file isn’t a Clear backup.');
  }
  return p;
}

/** Ask the browser not to evict our storage under pressure (no prompt on most browsers). */
export function requestPersistentStorage() {
  try {
    navigator.storage?.persist?.().catch(() => { /* ignore */ });
  } catch { /* ignore */ }
}
