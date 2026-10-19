import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CSP } from '../vite.config';
import { ROOT } from './helpers';

/** The only absolute URLs allowed in the built page: plain links the user can click. */
const ALLOWED_URLS = ['https://github.com/MAcemek/subscription-finder'];

/** Browser APIs that could send data somewhere. None may appear in the bundle. */
const NETWORK_APIS = [
  'fetch(',
  'XMLHttpRequest',
  'WebSocket',
  'sendBeacon',
  'EventSource',
  'serviceWorker',
];

let outDir = '';

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

function read(path: string): string {
  return readFileSync(join(outDir, path), 'utf8');
}

describe('built site', () => {
  beforeAll(async () => {
    outDir = mkdtempSync(join(tmpdir(), 'subscription-finder-dist-'));
    await build({
      root: ROOT,
      configFile: join(ROOT, 'vite.config.ts'),
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true },
    });
  });

  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it('contains only the page, one script, one stylesheet and the icon', () => {
    const files = listFiles(outDir)
      .map((file) => relative(outDir, file).split('\\').join('/'))
      .sort();
    expect(files).toHaveLength(4);
    expect(files.filter((file) => /^assets\/index-[\w-]+\.css$/.test(file))).toHaveLength(1);
    expect(files.filter((file) => /^assets\/index-[\w-]+\.js$/.test(file))).toHaveLength(1);
    expect(files.filter((file) => !file.startsWith('assets/'))).toEqual([
      'favicon.svg',
      'index.html',
    ]);
  });

  it('has a strict Content-Security-Policy before any script or stylesheet', () => {
    const html = read('index.html');
    const meta = `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`;
    expect(html).toContain(meta);
    expect(CSP).toContain("default-src 'none'");
    expect(CSP).toContain("connect-src 'none'");
    expect(CSP).toContain("script-src 'self'");
    expect(CSP).toContain("style-src 'self'");
    expect(CSP).toContain("form-action 'none'");
    expect(CSP).not.toContain('unsafe');
    expect(html.indexOf(meta)).toBeLessThan(html.indexOf('<script'));
    expect(html.indexOf(meta)).toBeLessThan(html.indexOf('<link'));
  });

  it('has no inline scripts, styles or event handlers', () => {
    const html = read('index.html');
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toMatch(/ src="\/subscription-finder\/assets\/index-[\w-]+\.js"/);
    expect(html).toMatch(/<script\b[^>]*><\/script>/);
    expect(html).not.toMatch(/<style\b/);
    expect(html).not.toMatch(/\sstyle=/);
    expect(html).not.toMatch(/\son[a-z]+=/);
  });

  it('loads its own files from the GitHub Pages path', () => {
    const html = read('index.html');
    const refs = [...html.matchAll(/\s(?:src|href)="([^"]+)"/g)].map((m) => m[1] as string);
    for (const ref of refs) {
      const allowed =
        ref.startsWith('/subscription-finder/') ||
        ref.startsWith('#') ||
        ALLOWED_URLS.includes(ref);
      expect(allowed, ref).toBe(true);
    }
    expect(refs.filter((ref) => ref.startsWith('/subscription-finder/'))).toHaveLength(3);
  });

  it('has no URLs to other sites in its HTML, JavaScript or CSS', () => {
    const found: string[] = [];
    for (const file of listFiles(outDir)) {
      if (!/\.(html|js|css)$/.test(file)) {
        continue;
      }
      const content = readFileSync(file, 'utf8');
      for (const match of content.matchAll(
        /(?:https?:)?\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s"'`)<>]*/gi,
      )) {
        found.push(match[0]);
      }
    }
    expect(found.filter((url) => !ALLOWED_URLS.includes(url))).toEqual([]);
  });

  it('does not use network APIs', () => {
    const js = listFiles(outDir)
      .filter((file) => file.endsWith('.js'))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    for (const api of NETWORK_APIS) {
      expect(js.includes(api), api).toBe(false);
    }
  });
});
