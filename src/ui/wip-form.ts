export interface WipForm {
  /** The panel to place under a column header. Hidden until `open`. */
  element: HTMLFormElement;
  /** Shows the panel with the current limit (or nothing) in the input and focuses it. */
  open(current: number | null): void;
  close(): void;
  readonly isOpen: boolean;
}

export interface WipFormHandlers {
  /** Returns an error message when the text is not an acceptable limit, otherwise null (saved). */
  onSave: (text: string) => string | null;
  onClear: () => void;
  /** Runs after the panel has closed (saved, cleared, cancelled), so focus can be placed. */
  onClosed: () => void;
}

/** The text a model-valid limit has to be written as: digits only (no sign, point or exponent). */
export function limitFromText(text: string): number {
  return /^\d{1,9}$/.test(text.trim()) ? Number(text) : Number.NaN;
}

export const WIP_ERROR = 'Enter a whole number, 1 or more.';

/**
 * The small inline panel opened from a column's "…" menu to set or clear its WIP limit.
 * It is a text field (not a number box) with Save, Clear limit and Cancel; Enter saves and
 * Escape cancels. The panel is created once per column so a half-typed value survives redraws.
 */
export function createWipForm(columnName: string, { onSave, onClear, onClosed }: WipFormHandlers): WipForm {
  const form = document.createElement('form');
  form.className = 'wip-form';
  form.hidden = true;
  form.noValidate = true;
  form.setAttribute('aria-label', `WIP limit for ${columnName}`);
  // Static markup only: no user text is ever inserted here.
  form.innerHTML = `
    <label class="field-row">
      <span>Limit</span>
      <input class="field" type="text" name="limit" inputmode="numeric" autocomplete="off"
        placeholder="Cards allowed at once" />
    </label>
    <p class="wip-error" role="alert" hidden></p>
    <div class="add-form-actions">
      <button type="button" class="btn" data-clear>Clear limit</button>
      <button type="button" class="btn" data-cancel>Cancel</button>
      <button type="submit" class="btn btn-primary">Save</button>
    </div>`;

  const input = form.elements.namedItem('limit') as HTMLInputElement;
  const error = form.querySelector('.wip-error') as HTMLElement;
  // Unique per column: the error is linked to its own input.
  error.id = `wip-error-${columnName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  input.setAttribute('aria-describedby', error.id);

  function showError(message: string | null) {
    error.hidden = message === null;
    error.textContent = message ?? '';
    if (message === null) input.removeAttribute('aria-invalid');
    else input.setAttribute('aria-invalid', 'true');
  }

  function close() {
    form.hidden = true;
    showError(null);
  }

  function finish() {
    close();
    onClosed();
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const message = onSave(input.value);
    if (message === null) {
      finish();
    } else {
      showError(message);
      input.focus();
    }
  });
  form.querySelector('[data-clear]')?.addEventListener('click', () => {
    onClear();
    finish();
  });
  form.querySelector('[data-cancel]')?.addEventListener('click', finish);
  input.addEventListener('input', () => showError(null));
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      finish();
    }
  });

  return {
    element: form,
    open(current) {
      input.value = current === null ? '' : String(current);
      showError(null);
      form.hidden = false;
      input.focus();
      input.select();
    },
    close,
    get isOpen() {
      return !form.hidden;
    },
  };
}
