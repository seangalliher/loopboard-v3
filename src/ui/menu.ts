import type { IconNode } from 'lucide';
import { icon } from './icon';

export interface MenuItem {
  label: string;
  icon?: IconNode;
  onSelect: () => void;
}

export interface Menu {
  open(focus?: 'first' | 'last'): void;
  close(): void;
  readonly isOpen: boolean;
}

/**
 * A popover menu opened from `button`. The menu is inserted right after the button, so the
 * button's parent should be a `.menu-anchor` (position: relative).
 * Closes on outside click, Escape (focus returns to the button), Tab and selection.
 * Keys: Arrow Up/Down (wrapping), Home, End; ArrowDown/ArrowUp on the button also open it.
 */
export function createMenu(button: HTMLButtonElement, items: MenuItem[]): Menu {
  const panel = document.createElement('div');
  panel.className = 'menu';
  panel.setAttribute('role', 'menu');
  panel.hidden = true;

  const itemButtons = items.map((item) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'menu-item';
    el.setAttribute('role', 'menuitem');
    el.tabIndex = -1;
    if (item.icon) el.append(icon(item.icon));
    el.append(item.label);
    el.addEventListener('click', () => {
      close();
      button.focus();
      item.onSelect();
    });
    return el;
  });
  panel.append(...itemButtons);

  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');
  button.after(panel);

  const isOpen = () => !panel.hidden;

  // Listens only while open, so a menu that is never opened costs nothing.
  const onOutsidePointerDown = (e: PointerEvent) => {
    const target = e.target as Node;
    if (panel.contains(target) || button.contains(target)) return;
    const hadFocus = panel.contains(document.activeElement);
    close();
    // The browser's default mouse handling runs after pointerdown and blurs the button when the
    // press landed on a non-focusable area. Once it has run, restore focus unless a control took it.
    if (hadFocus) {
      setTimeout(() => {
        if (!isOpen() && (!document.activeElement || document.activeElement === document.body)) button.focus();
      });
    }
  };

  function open(focus: 'first' | 'last' = 'first') {
    if (!isOpen()) document.addEventListener('pointerdown', onOutsidePointerDown);
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    itemButtons.at(focus === 'first' ? 0 : -1)?.focus();
  }

  function close() {
    document.removeEventListener('pointerdown', onOutsidePointerDown);
    // Focus inside the panel would be lost when it is hidden. An outside press runs this on
    // pointerdown, before the browser focuses the pressed control, so that control still wins.
    // onOutsidePointerDown re-checks after the browser's default handling.
    if (panel.contains(document.activeElement)) button.focus();
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  }

  function move(to: number | 'first' | 'last') {
    const count = itemButtons.length;
    const current = itemButtons.indexOf(document.activeElement as HTMLButtonElement);
    const next = to === 'first' ? 0 : to === 'last' ? count - 1 : (current + to + count) % count;
    itemButtons[next]?.focus();
  }

  button.addEventListener('click', () => {
    if (isOpen()) close();
    else open();
  });

  button.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      open(e.key === 'ArrowDown' ? 'first' : 'last');
    }
  });

  panel.addEventListener('keydown', (e) => {
    const keys: Record<string, () => void> = {
      ArrowDown: () => move(1),
      ArrowUp: () => move(-1),
      Home: () => move('first'),
      End: () => move('last'),
      Escape: () => {
        close();
        button.focus();
      },
      Tab: () => {
        // Focus the button first so the default Tab continues from there, not from a hidden item.
        close();
        button.focus();
      },
    };
    const run = keys[e.key];
    if (!run) return;
    // Tab keeps its default so focus continues to the next control.
    if (e.key !== 'Tab') e.preventDefault();
    run();
  });

  return {
    open,
    close,
    get isOpen() {
      return isOpen();
    },
  };
}
