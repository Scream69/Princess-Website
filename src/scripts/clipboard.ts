/*
 * Clipboard handling for step 2.
 *
 * READ THIS BEFORE CHANGING ANYTHING HERE.
 *
 * Browsers deliberately prevent silent clipboard reading. `readText()` needs a
 * user gesture and a permission, and iOS Safari shows its own native paste
 * confirmation every single time regardless of what we do. There is no
 * workaround, none is attempted here, and nothing in the UI copy describes any
 * of this as automatic (CLAUDE.md 8.1).
 *
 * Three layers, in order of reliability:
 *
 *   1. A `paste` listener on the document. Needs no permission at all, works
 *      when the field is not focused, and is the path most people will hit
 *      because they press Cmd/Ctrl+V or long-press out of habit.
 *   2. A Paste button surfaced when the customer comes back from the
 *      manufacturer's tab. One tap, then whatever confirmation the OS insists
 *      on. This is the main *guided* path, but it is the fallible one.
 *   3. The text input, always visible, never hidden behind either of the above.
 */

export interface ClipboardOptions {
  input: HTMLInputElement;
  /** Revealed only after a return to the tab, and only when the field is empty. */
  button: HTMLElement;
  /** Called whenever text lands in the field by any route. */
  onText: (text: string) => void;
}

/** Typing into another field should never be hijacked. */
function isEditable(node: EventTarget | null): boolean {
  const element = node as HTMLElement | null;
  if (!element || !element.tagName) return false;
  return (
    element.tagName === 'INPUT' ||
    element.tagName === 'TEXTAREA' ||
    element.tagName === 'SELECT' ||
    element.isContentEditable
  );
}

export function initClipboard({ input, button, onText }: ClipboardOptions): () => void {
  let leftThePage = false;

  const accept = (text: string): void => {
    const value = text.trim();
    if (value === '') return;
    input.value = value;
    hideButton();
    onText(value);
  };

  function showButton(): void {
    // Never offer to overwrite something they have already typed.
    if (input.value.trim() !== '') return;
    button.hidden = false;
  }

  function hideButton(): void {
    button.hidden = true;
  }

  // --- layer 1: the free one -------------------------------------------------
  const onPaste = (event: ClipboardEvent): void => {
    const text = event.clipboardData?.getData('text');
    if (!text) return;

    if (event.target === input) {
      // Let the browser do its own paste, then read the result — this way the
      // caret and any partial selection behave exactly as the customer expects.
      queueMicrotask(() => onText(input.value.trim()));
      hideButton();
      return;
    }

    if (isEditable(event.target)) return;

    event.preventDefault();
    accept(text);
    input.focus();
  };

  // --- layer 2: the return-detection button ----------------------------------
  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') {
      leftThePage = true;
      return;
    }
    if (leftThePage) showButton();
  };

  const onFocus = (): void => {
    if (leftThePage) showButton();
  };

  const onButtonClick = async (): Promise<void> => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim() === '') {
        input.focus();
        return;
      }
      accept(text);
      input.focus();
    } catch {
      // Permission refused, or the API is missing entirely. Fall through to
      // layer 3 rather than pretending: hide the button and hand them the field.
      hideButton();
      input.focus();
    }
  };

  // --- layer 3 needs no wiring: the input is always in the DOM ---------------
  const onInput = (): void => {
    if (input.value.trim() !== '') hideButton();
    onText(input.value.trim());
  };

  document.addEventListener('paste', onPaste);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', onFocus);
  button.addEventListener('click', onButtonClick);
  input.addEventListener('input', onInput);

  return () => {
    document.removeEventListener('paste', onPaste);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('focus', onFocus);
    button.removeEventListener('click', onButtonClick);
    input.removeEventListener('input', onInput);
  };
}
