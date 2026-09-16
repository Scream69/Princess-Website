/*
 * Step 3's chat-styled question sequence for the repair booking — three
 * questions (name, phone, email), the same transcript-and-edit pattern as
 * details.ts on /order.
 *
 * A dedicated module rather than a generalisation of details.ts: that file's
 * postcode question carries the postcodes.io confirmation lookup and the
 * `country`-shaped `EnquiryContact` type, neither of which applies here — a
 * repair collects no address (rule 2.7, the customer is carrying the item
 * in). Forcing one module to cover both would have made the postcode-only
 * logic conditional throughout, for three fields' worth of duplication saved.
 */
import copy from '../data/copy.json' with { type: 'json' };
import { track } from './analytics.ts';
import type { RepairContact } from './repair-storage.ts';
import { validateEmail, validateName, validatePhone, type Validation } from './validate.ts';

const QUESTIONS = copy.repairs.step3.questions;

export type RepairFieldName = keyof RepairContact;
export const REPAIR_FIELD_ORDER: RepairFieldName[] = ['name', 'phone', 'email'];

const VALIDATORS: Record<RepairFieldName, (raw: string) => Validation> = {
  name: validateName,
  phone: validatePhone,
  email: validateEmail,
};

export function firstUnansweredRepairField(contact: RepairContact): RepairFieldName | null {
  return REPAIR_FIELD_ORDER.find((field) => !VALIDATORS[field](contact[field]).ok) ?? null;
}

export function isRepairContactComplete(contact: RepairContact): boolean {
  return firstUnansweredRepairField(contact) === null;
}

export interface RepairDetailsOptions {
  root: ParentNode;
  getContact: () => RepairContact;
  setContact: (changes: Partial<RepairContact>) => void;
  /** Called once all three questions are answered, so the caller can reveal the slot picker. */
  onComplete: () => void;
}

export function initRepairDetails(options: RepairDetailsOptions): { refresh: () => void } {
  const { root, getContact, setContact, onComplete } = options;

  const form = root.querySelector<HTMLFormElement>('[data-repair-detail-form]');
  const transcript = root.querySelector<HTMLElement>('[data-repair-transcript]');
  const questionText = root.querySelector<HTMLElement>('[data-repair-detail-question]');
  const label = root.querySelector<HTMLLabelElement>('[data-repair-detail-label]');
  const input = root.querySelector<HTMLInputElement>('[data-repair-detail-input]');
  const error = root.querySelector<HTMLElement>('[data-repair-detail-error]');

  if (!form || !input || !label || !questionText || !error) {
    return { refresh: () => {} };
  }

  let editing: RepairFieldName | null = null;

  const activeField = (): RepairFieldName | null => editing ?? firstUnansweredRepairField(getContact());

  function answeredFields(): RepairFieldName[] {
    const contact = getContact();
    const active = activeField();
    const stop = active ? REPAIR_FIELD_ORDER.indexOf(active) : REPAIR_FIELD_ORDER.length;
    return REPAIR_FIELD_ORDER.slice(0, stop).filter((field) => VALIDATORS[field](contact[field]).ok);
  }

  function renderTranscript(): void {
    if (!transcript) return;
    const fields = answeredFields();

    while (transcript.children.length > fields.length) transcript.lastElementChild?.remove();

    fields.forEach((field, index) => {
      const existing = transcript.children[index] as HTMLElement | undefined;
      const answer = getContact()[field];

      if (existing && existing.dataset.field === field) {
        const shown = existing.querySelector<HTMLElement>('[data-answer]');
        if (shown && shown.textContent !== answer) shown.textContent = answer;
        return;
      }

      const entry = existing ?? document.createElement('li');
      entry.dataset.field = field;
      entry.className = 'space-y-1';
      entry.replaceChildren(transcriptQuestion(field), transcriptAnswer(field, answer));
      if (!existing) transcript.append(entry);
    });
  }

  function transcriptQuestion(field: RepairFieldName): HTMLElement {
    const node = document.createElement('p');
    node.className = 'text-sm text-ink-muted';
    node.textContent = QUESTIONS[field].question;
    return node;
  }

  function transcriptAnswer(field: RepairFieldName, answer: string): HTMLElement {
    const row = document.createElement('div');
    row.className = 'flex items-start justify-between gap-4';

    const value = document.createElement('p');
    value.dataset.answer = '';
    value.className = 'min-w-0 flex-1 break-words rounded-sm bg-surface px-3 py-2 text-ink';
    value.textContent = answer;

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.dataset.edit = field;
    edit.className = 'min-h-touch shrink-0 px-2 text-sm text-ink-muted underline';
    edit.textContent = 'Edit';
    edit.setAttribute('aria-label', `Edit ${QUESTIONS[field].label.toLowerCase()}`);
    edit.addEventListener('click', () => {
      editing = field;
      refresh();
      // Non-null assertion, matching details.ts: the early return above
      // guarantees `input` for the life of this closure, but TS narrowing on
      // a destructured const does not reach into a function defined later in
      // the same scope.
      input!.focus();
    });

    row.append(value, edit);
    return row;
  }

  function renderQuestion(): void {
    const field = activeField();
    form!.hidden = field === null;
    if (field === null) {
      onComplete();
      return;
    }

    const question = QUESTIONS[field];
    const contact = getContact();

    questionText!.textContent = question.question;
    error!.textContent = '';
    input!.removeAttribute('aria-invalid');
    label!.textContent = question.label;
    input!.value = contact[field];
    input!.placeholder = question.placeholder;
    input!.type = field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text';
    input!.inputMode = field === 'phone' ? 'tel' : field === 'email' ? 'email' : 'text';
    input!.autocomplete = field === 'name' ? 'name' : field === 'phone' ? 'tel' : 'email';
  }

  function refresh(): void {
    renderTranscript();
    renderQuestion();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const field = activeField();
    if (!field) return;

    const result = VALIDATORS[field](input.value);
    if (!result.ok) {
      track('validation_error', { field, page: 'repairs' });
      error.textContent = result.message;
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }

    input.removeAttribute('aria-invalid');
    error.textContent = '';
    editing = null;
    setContact({ [field]: result.value } as Partial<RepairContact>);
    refresh();
    if (activeField()) input.focus();
  });

  return { refresh };
}
