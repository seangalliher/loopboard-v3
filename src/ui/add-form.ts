import { Plus } from 'lucide';
import { MAX_NOTE_LENGTH, MAX_TITLE_LENGTH } from '../model';
import { icon } from './icon';

export interface NewCardValues {
  title: string;
  note: string;
  /** `YYYY-MM-DD`, or '' for no due date. */
  due: string;
}

export interface AddForm {
  /** The "Add card" button and the form, to be placed at the foot of a column. */
  element: HTMLElement;
  open(): void;
  /** Hides the form and clears it. Focus goes back to "Add card" when it was inside the form. */
  close(): void;
  readonly isOpen: boolean;
}

/**
 * The ghost "Add card" button and the compact form it opens. `onSubmit` returns true when the
 * card was accepted (the form then closes) and false when it was refused (the form stays open).
 * Enter in the title saves, Escape cancels, an empty title is never submitted.
 */
export function createAddForm(columnName: string, onSubmit: (values: NewCardValues) => boolean): AddForm {
  const element = document.createElement('div');
  element.className = 'composer';
  // Static markup only: no user text is ever inserted here.
  element.innerHTML = `
    <button type="button" class="add-card" data-add-card>
      <span data-plus></span>Add card
    </button>
    <form class="add-form" hidden novalidate>
      <input class="field" type="text" name="title" placeholder="Card title" aria-label="Title"
        maxlength="${MAX_TITLE_LENGTH}" autocomplete="off" />
      <textarea class="field" name="note" rows="2" placeholder="Note (optional)" aria-label="Note"
        maxlength="${MAX_NOTE_LENGTH}"></textarea>
      <label class="field-row">
        <span>Due</span>
        <input class="field" type="date" name="due" />
      </label>
      <div class="add-form-actions">
        <button type="button" class="btn" data-cancel>Cancel</button>
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </form>`;

  const addButton = element.querySelector('[data-add-card]') as HTMLButtonElement;
  const form = element.querySelector('form') as HTMLFormElement;
  const title = form.elements.namedItem('title') as HTMLInputElement;
  const note = form.elements.namedItem('note') as HTMLTextAreaElement;
  const due = form.elements.namedItem('due') as HTMLInputElement;

  (element.querySelector('[data-plus]') as HTMLElement).append(icon(Plus, 16));
  addButton.setAttribute('aria-label', `Add card to ${columnName}`);
  form.setAttribute('aria-label', `New card in ${columnName}`);

  function open() {
    form.hidden = false;
    addButton.hidden = true;
    title.focus();
  }

  function close() {
    const hadFocus = form.contains(document.activeElement);
    form.reset();
    title.removeAttribute('aria-invalid');
    form.hidden = true;
    addButton.hidden = false;
    if (hadFocus) addButton.focus();
  }

  function submit() {
    if (title.value.trim() === '') {
      title.setAttribute('aria-invalid', 'true');
      title.focus();
      return;
    }
    if (onSubmit({ title: title.value, note: note.value.trim(), due: due.value })) close();
  }

  addButton.addEventListener('click', open);
  element.querySelector('[data-cancel]')?.addEventListener('click', close);
  title.addEventListener('input', () => title.removeAttribute('aria-invalid'));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit();
  });
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Enter' && e.target === title && !e.isComposing) {
      e.preventDefault();
      submit();
    }
  });

  return {
    element,
    open,
    close,
    get isOpen() {
      return !form.hidden;
    },
  };
}
