// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WIP_ERROR, createWipForm, limitFromText, type WipForm } from './wip-form';

let wip: WipForm;
let onSave: ReturnType<typeof vi.fn<(text: string) => string | null>>;
let onClear: ReturnType<typeof vi.fn<() => void>>;
let onClosed: ReturnType<typeof vi.fn<() => void>>;

const q = <T extends Element>(selector: string) => document.querySelector(selector) as T;
const input = () => q<HTMLInputElement>('input');
const error = () => q<HTMLElement>('.wip-error');
const key = (target: Element, k: string) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

beforeEach(() => {
  onSave = vi.fn<(text: string) => string | null>(() => null);
  onClear = vi.fn<() => void>();
  onClosed = vi.fn<() => void>();
  wip = createWipForm('Doing', { onSave, onClear, onClosed });
  document.body.append(wip.element);
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('limitFromText', () => {
  it('accepts whole numbers written in digits', () => {
    expect(limitFromText('3')).toBe(3);
    expect(limitFromText(' 12 ')).toBe(12);
  });

  it('gives NaN for anything else, so the model refuses it', () => {
    for (const text of ['', '  ', '0x10', '1e1', '2.5', '-2', '+2', 'abc', '99999999999999999999']) {
      expect(limitFromText(text)).toBeNaN();
    }
  });
});

describe('createWipForm', () => {
  it('is hidden until opened, is a text field and not a number box', () => {
    expect(wip.isOpen).toBe(false);
    expect(wip.element.hidden).toBe(true);
    expect(input().type).toBe('text');
    expect(wip.element.getAttribute('aria-label')).toBe('WIP limit for Doing');
  });

  it('opens with the current limit selected and focused', () => {
    wip.open(4);
    expect(wip.isOpen).toBe(true);
    expect(input().value).toBe('4');
    expect(document.activeElement).toBe(input());
    wip.open(null);
    expect(input().value).toBe('');
  });

  it('saves on submit, then closes and reports it', () => {
    wip.open(null);
    input().value = '3';
    wip.element.requestSubmit();
    expect(onSave).toHaveBeenCalledExactlyOnceWith('3');
    expect(wip.isOpen).toBe(false);
    expect(onClosed).toHaveBeenCalledOnce();
  });

  it('shows the returned message and stays open when the limit is refused', () => {
    onSave.mockReturnValue(WIP_ERROR);
    wip.open(null);
    input().value = '0';
    wip.element.requestSubmit();
    expect(wip.isOpen).toBe(true);
    expect(error().hidden).toBe(false);
    expect(error().textContent).toBe(WIP_ERROR);
    expect(input().getAttribute('aria-invalid')).toBe('true');
    expect(input().getAttribute('aria-describedby')).toBe(error().id);
    expect(onClosed).not.toHaveBeenCalled();
    input().dispatchEvent(new Event('input', { bubbles: true }));
    expect(error().hidden).toBe(true);
    expect(input().hasAttribute('aria-invalid')).toBe(false);
  });

  it('clears the limit with Clear limit and closes', () => {
    wip.open(2);
    q<HTMLButtonElement>('[data-clear]').click();
    expect(onClear).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
    expect(wip.isOpen).toBe(false);
    expect(onClosed).toHaveBeenCalledOnce();
  });

  it('cancels on Escape and on Cancel without saving', () => {
    wip.open(2);
    input().value = '9';
    key(input(), 'Escape');
    expect(wip.isOpen).toBe(false);
    wip.open(2);
    q<HTMLButtonElement>('[data-cancel]').click();
    expect(wip.isOpen).toBe(false);
    expect(onSave).not.toHaveBeenCalled();
    expect(onClear).not.toHaveBeenCalled();
    expect(onClosed).toHaveBeenCalledTimes(2);
  });
});
