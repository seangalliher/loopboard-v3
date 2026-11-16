// @vitest-environment jsdom
import html from '../index.html?raw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyTheme,
  nextTheme,
  parseTheme,
  readTheme,
  resolveTheme,
  saveTheme,
  THEME_KEY,
} from './theme';

describe('theme choice', () => {
  it('cycles system -> light -> dark -> system', () => {
    expect(nextTheme('system')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('system');
  });

  it('treats a missing or unknown stored value as system', () => {
    expect(parseTheme(null)).toBe('system');
    expect(parseTheme('')).toBe('system');
    expect(parseTheme('purple')).toBe('system');
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('light')).toBe('light');
  });

  it('resolves system from the colour-scheme preference and fixed choices as they are', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('theme storage', () => {
  it('round-trips the choice under loopboard:theme', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    expect(readTheme(storage)).toBe('system');
    saveTheme(storage, 'dark');
    expect(store.get('loopboard:theme')).toBe('dark');
    expect(THEME_KEY).toBe('loopboard:theme');
    expect(readTheme(storage)).toBe('dark');
  });

  it('survives storage that throws', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readTheme(blocked)).toBe('system');
    expect(() => saveTheme(blocked, 'dark')).not.toThrow();
  });

  it('applyTheme sets data-theme to the resolved theme', () => {
    applyTheme(document.documentElement, 'system', true);
    expect(document.documentElement.dataset.theme).toBe('dark');
    applyTheme(document.documentElement, 'light', true);
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});

describe('pre-paint script in index.html', () => {
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];

  function run(stored: string | null, prefersDark: boolean): string | undefined {
    if (stored === null) localStorage.removeItem('loopboard:theme');
    else localStorage.setItem('loopboard:theme', stored);
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-color-scheme: dark)' ? prefersDark : !prefersDark,
    }));
    delete document.documentElement.dataset.theme;
    new Function(script as string)();
    return document.documentElement.dataset.theme;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('exists and is inline in the head', () => {
    expect(script).toBeTruthy();
    expect(html.indexOf('<script>')).toBeLessThan(html.indexOf('</head>'));
  });

  it('agrees with resolveTheme for every stored value and system preference', () => {
    for (const stored of [null, 'system', 'light', 'dark', 'junk']) {
      for (const prefersDark of [false, true]) {
        expect(run(stored, prefersDark), `${stored} / ${prefersDark}`).toBe(
          resolveTheme(parseTheme(stored), prefersDark),
        );
      }
    }
  });
});
