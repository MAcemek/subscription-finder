import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CSP } from '../vite.config';
import { ROOT } from './helpers';

const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git']);
const BINARY = /\.(png|jpg|jpeg|gif|ico|woff2?)$/i;

function repoFiles(dir = ROOT): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (SKIP_DIRS.has(entry.name)) {
      return [];
    }
    const path = join(dir, entry.name);
    return entry.isDirectory() ? repoFiles(path) : [relative(ROOT, path).split('\\').join('/')];
  });
}

const textFiles = repoFiles().filter((file) => !BINARY.test(file));

describe('repository rules', () => {
  it('keeps every text file ASCII (non-ASCII text in code uses \\u escapes)', () => {
    const offenders = textFiles.filter((file) =>
      readFileSync(join(ROOT, file)).some((byte) => byte > 0x7f),
    );
    expect(offenders).toEqual([]);
  });

  it('never builds HTML from strings or runs strings as code', () => {
    const sources = textFiles.filter((file) => file.startsWith('src/') && file.endsWith('.ts'));
    expect(sources.length).toBeGreaterThan(10);
    for (const file of sources) {
      const code = readFileSync(join(ROOT, file), 'utf8');
      for (const banned of [
        'innerHTML',
        'outerHTML',
        'insertAdjacentHTML',
        'document.write',
        'eval(',
        'new Function',
      ]) {
        expect(code.includes(banned), `${file} uses ${banned}`).toBe(false);
      }
    }
  });

  it('shows the real Content-Security-Policy in the README', () => {
    expect(readFileSync(join(ROOT, 'README.md'), 'utf8')).toContain(`\`${CSP}\``);
  });

  it('is private, MIT licensed and has no author field', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(pkg.private).toBe(true);
    expect(pkg.license).toBe('MIT');
    expect(pkg).not.toHaveProperty('author');
    expect(readFileSync(join(ROOT, 'LICENSE'), 'utf8')).toContain(
      'Copyright (c) 2026 The subscription-finder contributors',
    );
  });
});
