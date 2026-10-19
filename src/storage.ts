import type { Decision } from './types';

/**
 * The checklist is only saved when the user turns on "Remember my checklist on this device".
 * Only finding ids (normalized merchant names) and the choices are saved, never transactions.
 */
export const STORAGE_KEY = 'subscription-finder:checklist:v1';

interface Saved {
  version: 1;
  decisions: Record<string, Decision>;
}

export function getStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The saved checklist, or null when nothing is saved or it cannot be read. */
export function loadChecklist(storage: Storage | null): Map<string, Decision> | null {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<Saved>;
    if (parsed.version !== 1 || typeof parsed.decisions !== 'object' || !parsed.decisions) {
      return null;
    }
    const decisions = new Map<string, Decision>();
    for (const [id, value] of Object.entries(parsed.decisions)) {
      if (value === 'cancel' || value === 'keep') {
        decisions.set(id, value);
      }
    }
    return decisions;
  } catch {
    return null;
  }
}

export function saveChecklist(
  storage: Storage | null,
  decisions: ReadonlyMap<string, Decision>,
): void {
  const saved: Saved = { version: 1, decisions: Object.fromEntries(decisions) };
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Storage can be full or blocked; the checklist then simply is not remembered.
  }
}

export function clearChecklist(storage: Storage | null): void {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do.
  }
}
