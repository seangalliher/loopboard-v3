import './styles.css';
import { ChevronDown, Monitor, Moon, Repeat, Sun } from 'lucide';
import { APP_NAME } from './app-name';
import { applyTheme, nextTheme, readTheme, saveTheme, type ThemeChoice } from './theme';
import { createStore, type Store } from './store';
import { mountBoard } from './ui/board';
import { createDataMenu } from './ui/data-menu';
import { icon } from './ui/icon';
import { createMenu } from './ui/menu';

const THEME_ICONS = { system: Monitor, light: Sun, dark: Moon } as const;
const THEME_NAMES: Record<ThemeChoice, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

function buildHeader(store: Store, showStatus: (message: string | null) => void): HTMLElement {
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

  const dataButton = header.querySelector<HTMLButtonElement>('[data-data-menu]');
  if (dataButton) {
    const data = createDataMenu(store, showStatus);
    createMenu(dataButton, data.items);
    dataButton.parentElement?.append(data.input);
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
  const main = document.createElement('main');
  main.className = 'mx-auto max-w-6xl px-4 pt-5 pb-4 sm:px-6 sm:pt-6';
  main.setAttribute('aria-label', 'Board');
  const store = createStore();
  const { showStatus } = mountBoard(main, store);
  app.append(buildHeader(store, showStatus), main);
}
