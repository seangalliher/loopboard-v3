import './styles.css';
import { ChevronDown, Download, Monitor, Moon, Repeat, Sun, Upload } from 'lucide';
import { APP_NAME } from './app-name';
import { applyTheme, nextTheme, readTheme, saveTheme, type ThemeChoice } from './theme';
import { icon } from './ui/icon';
import { createMenu } from './ui/menu';

const THEME_ICONS = { system: Monitor, light: Sun, dark: Moon } as const;
const THEME_NAMES: Record<ThemeChoice, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

function buildHeader(): HTMLElement {
  const header = document.createElement('header');
  header.className = 'app-header';
  header.innerHTML = `
    <div class="mx-auto flex h-14 max-w-6xl     items-center justify-between gap-1 px-3 min-[360px]:gap-2 sm:gap-3 sm:px-6">
          <div class="flex min-w-0 items-center gap-2.5">
        <span class="logo-mark" data-logo></span>
            <h1 class="truncate text-base font-semibold tracking-tight">${APP_NAME}</h1>
      </div>
          <div class="flex shrink-0 items-center gap-1">
        <div class="menu-anchor">
          <button type="button" class="btn" data-data-menu>
            Import / Export
            <span class="inline-flex max-[359px]:hidden" data-chevron></span>
          </button>
        </div>
        <button type="button" class="btn btn-icon" data-theme-toggle></button>
      </div>
    </div>`;

  header.querySelector('[data-logo]')?.append(icon(Repeat, 16));
  header.querySelector('[data-chevron]')?.append(icon(ChevronDown, 16));

  // Placeholder items: the real import and export are wired in a later issue.
  const dataButton = header.querySelector<HTMLButtonElement>('[data-data-menu]');
  if (dataButton) {
    createMenu(dataButton, [
      { label: 'Import board…', icon: Upload, onSelect: () => {} },
      { label: 'Export board', icon: Download, onSelect: () => {} },
    ]);
  }

  const toggle = header.querySelector<HTMLButtonElement>('[data-theme-toggle]');
  if (toggle) {
    const systemDark = matchMedia('(prefers-color-scheme: dark)');
    let choice = readTheme(localStorage);

    const render = () => {
      applyTheme(document.documentElement, choice, systemDark.matches);
      const label = `Theme: ${THEME_NAMES[choice]}`;
      toggle.setAttribute('aria-label', label);
      toggle.title = `${label} (click to change)`;
      toggle.replaceChildren(icon(THEME_ICONS[choice]));
    };

    toggle.addEventListener('click', () => {
      choice = nextTheme(choice);
      saveTheme(localStorage, choice);
      render();
    });
    systemDark.addEventListener('change', render);
    render();
  }

  return header;
}

const app = document.querySelector<HTMLDivElement>('#app');
if (app) {
  const board = document.createElement('main');
  board.className = 'mx-auto max-w-6xl px-4 py-6 sm:px-6';
  board.setAttribute('aria-label', 'Board');
  app.append(buildHeader(), board);
}
