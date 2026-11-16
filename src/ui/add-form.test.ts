// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAddForm, createEditForm, type AddForm, type EditForm, type NewCardValues } from './add-form';

let form: AddForm;
let onSubmit: ReturnType<typeof vi.fn<(values: NewCardValues) => boolean>>;

const q = <T extends Element>(selector: string) => document.querySelector(selector) as T;
const addButton = () => q<HTMLButtonElement>('[data-add-card]');
const formEl = () => q<HTMLFormElement>('form');
const title = () => q<HTMLInputElement>('input[name="title"]');
const note = () => q<HTMLTextAreaElement>('textarea[name="note"]');
const due = () => q<HTMLInputElement>('input[name="due"]');
const key = (target: Element, k: string) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

beforeEach(() => {
  onSubmit = vi.fn<(values: NewCardValues) => boolean>(() => true);
  form = createAddForm('To do', onSubmit);
  document.body.append(form.element);
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('createAddForm', () => {
  it('shows only the Add card button until it is pressed', () => {
    expect(formEl().hidden).toBe(true);
    expect(addButton().hidden).toBe(false);
    expect(addButton().getAttribute('aria-label')).toBe('Add card to To do');
    expect(form.isOpen).toBe(false);
  });

  it('opens on Add card and focuses the title', () => {
    addButton().click();
    expect(formEl().hidden).toBe(false);
    expect(addButton().hidden).toBe(true);
    expect(document.activeElement).toBe(title());
    expect(form.isOpen).toBe(true);
  });

  it('limits the title and note length and offers a date input', () => {
    expect(title().maxLength).toBe(200);
    expect(note().maxLength).toBe(2000);
    expect(due().type).toBe('date');
  });

  it('saves on Enter in the title, then closes, clears and refocuses Add card', () => {
    addButton().click();
    title().value = '  Write docs ';
    note().value = 'Mention the shortcuts';
    due().value = '2030-01-02';
    key(title(), 'Enter');
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
      title: '  Write docs ',
      note: 'Mention the shortcuts',
      due: '2030-01-02',
    });
    expect(formEl().hidden).toBe(true);
    expect(addButton().hidden).toBe(false);
    expect(document.activeElement).toBe(addButton());
    expect(title().value).toBe('');
    expect(note().value).toBe('');
    expect(due().value).toBe('');
  });

  it('does not save on Enter in the note, which is a line break', () => {
    addButton().click();
    title().value = 'x';
    key(note(), 'Enter');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(form.isOpen).toBe(true);
  });

  it('saves from the Save button', () => {
    addButton().click();
    title().value = 'Ship it';
    formEl().requestSubmit();
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(form.isOpen).toBe(false);
  });

  it('cancels on Escape without saving, clears the draft and refocuses Add card', () => {
    addButton().click();
    title().value = 'Draft';
    key(title(), 'Escape');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(formEl().hidden).toBe(true);
    expect(document.activeElement).toBe(addButton());
    addButton().click();
    expect(title().value).toBe('');
  });

  it('cancels from the Cancel button', () => {
    addButton().click();
    q<HTMLButtonElement>('[data-cancel]').click();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(form.isOpen).toBe(false);
  });

  it('refuses an empty or blank title: nothing saved, form stays open, title marked invalid', () => {
    addButton().click();
    title().value = '   ';
    key(title(), 'Enter');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(form.isOpen).toBe(true);
    expect(title().getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(title());
    title().dispatchEvent(new Event('input', { bubbles: true }));
    expect(title().hasAttribute('aria-invalid')).toBe(false);
  });

  it('stays open, keeping the draft, when the card is refused', () => {
    onSubmit.mockReturnValue(false);
    addButton().click();
    title().value = 'Refused';
    key(title(), 'Enter');
    expect(form.isOpen).toBe(true);
    expect(title().value).toBe('Refused');
  });
});

describe('createEditForm', () => {
  const card = { title: 'Write docs', note: 'Mention shortcuts', due: '2030-01-02' as string | null };
  let submit: ReturnType<typeof vi.fn<(values: NewCardValues) => boolean>>;
  let cancel: ReturnType<typeof vi.fn<() => void>>;
  let edit: EditForm;

  beforeEach(() => {
    document.body.innerHTML = '';
    submit = vi.fn<(values: NewCardValues) => boolean>(() => true);
    cancel = vi.fn<() => void>();
    edit = createEditForm(card, submit, cancel);
    document.body.append(edit.element);
  });

  it('opens prefilled with the card, labelled, and focuses the title', () => {
    expect(edit.element.tagName).toBe('LI');
    expect(formEl().hidden).toBe(false);
    expect(formEl().getAttribute('aria-label')).toBe('Edit card: Write docs');
    expect([title().value, note().value, due().value]).toEqual(['Write docs', 'Mention shortcuts', '2030-01-02']);
    edit.focus();
    expect(document.activeElement).toBe(title());
  });

  it('prefills an empty due date for a card without one', () => {
    document.body.innerHTML = '';
    document.body.append(createEditForm({ ...card, due: null }, submit, cancel).element);
    expect(due().value).toBe('');
  });

  it('saves the changed values on Enter in the title', () => {
    title().value = 'Write better docs';
    note().value = '  New note ';
    due().value = '';
    key(title(), 'Enter');
    expect(submit).toHaveBeenCalledExactlyOnceWith({ title: 'Write better docs', note: 'New note', due: '' });
    expect(cancel).not.toHaveBeenCalled();
  });

  it('cancels on Escape and on Cancel without saving', () => {
    title().value = 'Changed';
    key(title(), 'Escape');
    q<HTMLButtonElement>('[data-cancel]').click();
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(submit).not.toHaveBeenCalled();
  });

  it('refuses an empty title', () => {
    title().value = '  ';
    key(title(), 'Enter');
    expect(submit).not.toHaveBeenCalled();
    expect(title().getAttribute('aria-invalid')).toBe('true');
  });
});
