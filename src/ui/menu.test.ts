// @vitest-environment jsdom
import { Download, Upload } from 'lucide';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMenu, type Menu } from './menu';

let button: HTMLButtonElement;
let menu: Menu;
let onImport: () => void;

const panel = () => document.querySelector<HTMLElement>('[role="menu"]') as HTMLElement;
const items = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
const key = (target: Element, k: string) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

beforeEach(() => {
  document.body.innerHTML = '<div class="menu-anchor"><button id="b">Menu</button></div><p id="out">outside</p>';
  button = document.querySelector<HTMLButtonElement>('#b') as HTMLButtonElement;
  onImport = vi.fn() as () => void;
  menu = createMenu(button, [
    { label: 'Import', icon: Upload, onSelect: onImport },
    { label: 'Export', icon: Download, onSelect: () => {} },
    { label: 'Third', onSelect: () => {} },
  ]);
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('createMenu', () => {
  it('starts closed with aria-haspopup and aria-expanded=false', () => {
    expect(button.getAttribute('aria-haspopup')).toBe('menu');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(panel().hidden).toBe(true);
    expect(items().map((i) => i.textContent)).toEqual(['Import', 'Export', 'Third']);
  });

  it('opens from the button, sets aria-expanded and focuses the first item', () => {
    button.click();
    expect(panel().hidden).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(items()[0]);
  });

  it('a second button click closes it', () => {
    button.click();
    button.click();
    expect(menu.isOpen).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on Escape and returns focus to the button', () => {
    button.click();
    key(document.activeElement as Element, 'Escape');
    expect(menu.isOpen).toBe(false);
    expect(document.activeElement).toBe(button);
  });

  it('calls onOpen with the shown panel before focus moves into it, on every opening', () => {
    document.body.innerHTML = '<div class="menu-anchor"><button id="b2">Menu</button></div>';
    const second = document.querySelector<HTMLButtonElement>('#b2') as HTMLButtonElement;
    const seen: boolean[] = [];
    createMenu(second, [{ label: 'One', onSelect: () => {} }], {
      onOpen: (p) => seen.push(p.hidden === false && !p.contains(document.activeElement)),
    });
    second.click();
    second.click();
    second.click();
    expect(seen).toEqual([true, true]);
  });

  it('closes on an outside pointer press, and ignores presses inside', () => {
    button.click();
    items()[1].dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(menu.isOpen).toBe(true);
    document.querySelector('#out')?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(menu.isOpen).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('moves focus with ArrowDown/ArrowUp, wrapping, and Home/End', () => {
    button.click();
    key(items()[0], 'ArrowDown');
    expect(document.activeElement).toBe(items()[1]);
    key(items()[1], 'ArrowDown');
    key(items()[2], 'ArrowDown');
    expect(document.activeElement).toBe(items()[0]);
    key(items()[0], 'ArrowUp');
    expect(document.activeElement).toBe(items()[2]);
    key(items()[2], 'Home');
    expect(document.activeElement).toBe(items()[0]);
    key(items()[0], 'End');
    expect(document.activeElement).toBe(items()[2]);
  });

  it('ArrowDown / ArrowUp on the button open the menu on the first / last item', () => {
    key(button, 'ArrowDown');
    expect(document.activeElement).toBe(items()[0]);
    menu.close();
    key(button, 'ArrowUp');
    expect(document.activeElement).toBe(items()[2]);
  });

  it('selecting an item runs it, closes the menu and returns focus to the button', () => {
    button.click();
    items()[0].click();
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(menu.isOpen).toBe(false);
    expect(document.activeElement).toBe(button);
  });

  it('close() from the API moves focus out of the hidden panel to the button', () => {
    menu.open();
    expect(panel().contains(document.activeElement)).toBe(true);
    menu.close();
    expect(menu.isOpen).toBe(false);
    expect(document.activeElement).toBe(button);
  });

  it('close() leaves focus alone when it is not inside the panel', () => {
    const other = document.createElement('input');
    document.body.append(other);
    menu.open();
    other.focus();
    menu.close();
    expect(document.activeElement).toBe(other);
  });

  it('an outside press closes the menu and returns focus to the button', () => {
    button.click();
    document.querySelector('#out')?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(menu.isOpen).toBe(false);
    expect(document.activeElement).toBe(button);
  });

  describe('outside press followed by the browser default handling', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('restores focus to the button when the default action blurred it', () => {
      button.click();
      document.querySelector('#out')?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      (document.activeElement as HTMLElement).blur(); // what a mousedown on a non-focusable area does
      expect(document.activeElement).toBe(document.body);
      vi.runAllTimers();
      expect(document.activeElement).toBe(button);
    });

    it('does not steal focus from a control the press focused', () => {
      const other = document.createElement('input');
      document.body.append(other);
      button.click();
      other.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      other.focus(); // what a mousedown on a focusable control does
      vi.runAllTimers();
      expect(document.activeElement).toBe(other);
    });
  });

  it('Tab closes the menu without trapping focus', () => {
    button.click();
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    items()[0].dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(menu.isOpen).toBe(false);
  });
});
