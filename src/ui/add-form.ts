import { Plus } from 'lucide';
import { MAX_NOTE_LENGTH, MAX_TITLE_LENGTH, type Card } from '../model';
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

interface CardFormHandlers {
  /** True when the values were accepted. */
  onSubmit: (values: NewCardValues) => boolean;
  onCancel: () => void;
}

/**
 * The title / note / due form shared by "Add card" and "Edit". Enter in the title saves,
 * Escape cancels, an empty title is never submitted. Hidden until the caller shows it.
 */
function buildCardForm(label: string, { onSubmit, onCancel }: CardFormHandlers) {
  const form = document.createElement('form');
  form.className = 'add-form';
  form.hidden = true;
  form.noValidate = true;
  form.setAttribute('aria-label', label);
  // Static markup only: no user text is ever inserted here.
  form.innerHTML = `
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
    </div>`;

  const title = form.elements.namedItem('title') as HTMLInputElement;
  const note = form.elements.namedItem('note') as HTMLTextAreaElement;
  const due = form.elements.namedItem('due') as HTMLInputElement;

  function submit() {
    if (title.value.trim() === '') {
      title.setAttribute('aria-invalid', 'true');
      title.focus();
      return;
    }
    onSubmit({ title: title.value, note: note.value.trim(), due: due.value });
  }

  form.querySelector('[data-cancel]')?.addEventListener('click', onCancel);
  title.addEventListener('input', () => title.removeAttribute('aria-invalid'));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit();
  });
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if (e.key === 'Enter' && e.target === title && !e.isComposing) {
      e.preventDefault();
      submit();
    }
  });

  return { form, title, note, due };
}

export interface EditForm {
  /** A list item holding the form, to be shown in place of the card. */
  element: HTMLLIElement;
  focus(): void;
}

/**
 * The same form, prefilled with `card`, in place of the card. `onSubmit` returns true when the
 * change was accepted; the caller removes the form then (a refused change leaves it open).
 * `onCancel` runs on Escape or Cancel; nothing is changed.
 */
export function createEditForm(
  card: Pick<Card, 'title' | 'note' | 'due'>,
  onSubmit: (values: NewCardValues) => boolean,
  onCancel: () => void,
): EditForm {
  const { form, title, note, due } = buildCardForm(`Edit card: ${card.title}`, { onSubmit, onCancel });
  title.value = card.title;
  note.value = card.note;
  due.value = card.due ?? '';
  form.hidden = false;
  const element = document.createElement('li');
  element.className = 'card-editing';
  element.append(form);
  return { element, focus: () => title.focus() };
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
    </button>`;

  const addButton = element.querySelector('[data-add-card]') as HTMLButtonElement;
  (element.querySelector('[data-plus]') as HTMLElement).append(icon(Plus, 16));
  addButton.setAttribute('aria-label', `Add card to ${columnName}`);

  const { form, title } = buildCardForm(`New card in ${columnName}`, {
    onSubmit: (values) => {
      const accepted = onSubmit(values);
      if (accepted) close();
      return accepted;
    },
    onCancel: () => close(),
  });
  element.append(form);

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

  addButton.addEventListener('click', open);

  return {
    element,
    open,
    close,
    get isOpen() {
      return !form.hidden;
    },
  };
}
