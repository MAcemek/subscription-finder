import { describe, expect, it } from 'vitest';
import { STORAGE_KEY, clearChecklist, loadChecklist, saveChecklist } from '../src/storage';
import type { Decision } from '../src/types';

class MemoryStorage implements Storage {
  private items = new Map<string, string>();
  get length(): number {
    return this.items.size;
  }
  clear(): void {
    this.items.clear();
  }
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

describe('checklist storage', () => {
  it('saves, loads and clears decisions', () => {
    const storage = new MemoryStorage();
    expect(loadChecklist(storage)).toBeNull();
    saveChecklist(storage, new Map<string, Decision>([['STREAMFLIX', 'cancel']]));
    expect(storage.getItem(STORAGE_KEY)).toBe('{"version":1,"decisions":{"STREAMFLIX":"cancel"}}');
    expect(loadChecklist(storage)).toEqual(new Map([['STREAMFLIX', 'cancel']]));
    clearChecklist(storage);
    expect(storage.length).toBe(0);
  });

  it('ignores broken or unknown data', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, 'not json');
    expect(loadChecklist(storage)).toBeNull();
    storage.setItem(STORAGE_KEY, '{"version":2,"decisions":{}}');
    expect(loadChecklist(storage)).toBeNull();
    storage.setItem(STORAGE_KEY, '{"version":1,"decisions":{"A":"keep","B":"maybe"}}');
    expect(loadChecklist(storage)).toEqual(new Map([['A', 'keep']]));
  });

  it('works without storage', () => {
    expect(loadChecklist(null)).toBeNull();
    expect(() => saveChecklist(null, new Map())).not.toThrow();
    expect(() => clearChecklist(null)).not.toThrow();
  });
});
