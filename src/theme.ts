export type ThemeChoice = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_KEY = 'loopboard:theme';

const ORDER: readonly ThemeChoice[] = ['system', 'light', 'dark'];

/** A stored value that is not one of the three choices counts as "system". */
export function parseTheme(raw: string | null | undefined): ThemeChoice {
  return ORDER.find((c) => c === raw) ?? 'system';
}

/** system -> light -> dark -> system. */
export function nextTheme(choice: ThemeChoice): ThemeChoice {
  return ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length];
}

export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): ResolvedTheme {
  if (choice === 'system') return prefersDark ? 'dark' : 'light';
  return choice;
}

export function readTheme(storage: Pick<Storage, 'getItem'>): ThemeChoice {
  try {
    return parseTheme(storage.getItem(THEME_KEY));
  } catch {
    return 'system';
  }
}

export function saveTheme(storage: Pick<Storage, 'setItem'>, choice: ThemeChoice): void {
  try {
    storage.setItem(THEME_KEY, choice);
  } catch {
    // Storage can be blocked; the choice then lasts for this visit only.
  }
}

export function applyTheme(root: HTMLElement, choice: ThemeChoice, prefersDark: boolean): void {
  root.dataset.theme = resolveTheme(choice, prefersDark);
}
