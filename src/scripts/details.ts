/*
 * Step 3 — the chat-styled details sequence.
 *
 * Styled as a conversation, but it is a fixed five-question form. Nothing the
 * customer types is interpreted, nothing is sent anywhere to be understood, and
 * the order never varies (CLAUDE.md 2.1). Country is asked immediately before
 * postcode because it sets that field's label (CLAUDE.md 8.6).
 */
import copy from '../data/copy.json' with { type: 'json' };
import countries from '../data/countries.json' with { type: 'json' };
import type { EnquiryContact } from './storage.ts';
import {
  validateCountry,
  validateEmail,
  validateName,
  validatePhone,
  validatePostcode,
  type Validation,
} from './validate.ts';

const QUESTIONS = copy.order.step3.questions;
const COUNTRY_CODES = countries.map((country) => country.code);

export type FieldName = keyof EnquiryContact;

export const FIELD_ORDER: FieldName[] = ['name', 'phone', 'email', 'country', 'postcode'];

const VALIDATORS: Record<FieldName, (raw: string) => Validation> = {
  name: validateName,
  phone: validatePhone,
  email: validateEmail,
  country: (raw) => validateCountry(raw, COUNTRY_CODES),
  postcode: validatePostcode,
};

/** The first question without a valid answer, or null when all five are done. */
export function firstUnanswered(contact: EnquiryContact): FieldName | null {
  return FIELD_ORDER.find((field) => !VALIDATORS[field](contact[field]).ok) ?? null;
}

export function isComplete(contact: EnquiryContact): boolean {
  return firstUnanswered(contact) === null;
}

/** Label and placeholder follow the chosen country (CLAUDE.md 8.6). */
export function postcodeLabelFor(code: string): { label: string; placeholder: string } {
  const country = countries.find((entry) => entry.code === code.toUpperCase());
  return {
    label: country?.postcodeLabel ?? QUESTIONS.postcode.label,
    placeholder: country?.postcodePlaceholder ?? '',
  };
}

export function countryName(code: string): string {
  return countries.find((entry) => entry.code === code.toUpperCase())?.name ?? code;
}

export interface DetailsOptions {
  root: ParentNode;
  getContact: () => EnquiryContact;
  getConsent: () => boolean;
  setContact: (changes: Partial<EnquiryContact>) => void;
  setConsent: (consent: boolean) => void;
  renderReview: (list: HTMLElement, count: HTMLElement) => void;
  onSubmit: () => void;
}

export function initDetails(options: DetailsOptions): { refresh: () => void } {
  const { root, getContact, getConsent, setContact, setConsent, renderReview, onSubmit } = options;

  const form = root.querySelector<HTMLFormElement>('[data-detail-form]');
  const transcript = root.querySelector<HTMLElement>('[data-transcript]');
  const questionText = root.querySelector<HTMLElement>('[data-detail-question]');
  const label = root.querySelector<HTMLLabelElement>('[data-detail-label]');
  const input = root.querySelector<HTMLInputElement>('[data-detail-input]');
  const select = root.querySelector<HTMLSelectElement>('[data-detail-select]');
  const error = root.querySelector<HTMLElement>('[data-detail-error]');
  const review = root.querySelector<HTMLElement>('[data-review]');
  const reviewList = root.querySelector<HTMLElement>('[data-review-list]');
  const reviewCount = root.querySelector<HTMLElement>('[data-review-count]');
  const consentBox = root.querySelector<HTMLInputElement>('[data-consent]');
  const submitButton = root.querySelector<HTMLButtonElement>('[data-submit-enquiry]');

  if (!form || !input || !select || !label || !questionText || !error) {
    return { refresh: () => {} };
  }

  /** Non-null while the customer is correcting an already-answered question. */
  let editing: FieldName | null = null;

  const activeField = (): FieldName | null => editing ?? firstUnanswered(getContact());

  function answeredFields(): FieldName[] {
    const contact = getContact();
    const active = activeField();
    const stop = active ? FIELD_ORDER.indexOf(active) : FIELD_ORDER.length;
    return FIELD_ORDER.slice(0, stop).filter((field) => VALIDATORS[field](contact[field]).ok);
  }

  function displayValue(field: FieldName): string {
    const value = getContact()[field];
    return field === 'country' ? countryName(value) : value;
  }

  function renderTranscript(): void {
    if (!transcript) return;
    const fields = answeredFields();

    // Trim any entries that an edit has invalidated, then append only what is
    // new — a wholesale rebuild would make the live region re-read everything.
    while (transcript.children.length > fields.length) transcript.lastElementChild?.remove();

    fields.forEach((field, index) => {
      const existing = transcript.children[index] as HTMLElement | undefined;
      const answer = displayValue(field);

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

  function transcriptQuestion(field: FieldName): HTMLElement {
    const node = document.createElement('p');
    node.className = 'text-sm text-ink-muted';
    node.textContent = QUESTIONS[field].question;
    return node;
  }

  function transcriptAnswer(field: FieldName, answer: string): HTMLElement {
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
      focusControl();
    });

    row.append(value, edit);
    return row;
  }

  function renderQuestion(): void {
    const field = activeField();

    form!.hidden = field === null;
    if (field === null) return;

    const question = QUESTIONS[field];
    const usesSelect = field === 'country';
    const contact = getContact();

    questionText!.textContent = question.question;
    error!.textContent = '';

    input!.hidden = usesSelect;
    select!.hidden = !usesSelect;
    label!.htmlFor = usesSelect ? 'detail-select' : 'detail-input';

    if (usesSelect) {
      select!.value = contact.country || COUNTRY_CODES[0];
    } else {
      const postcode = field === 'postcode' ? postcodeLabelFor(contact.country) : null;
      label!.textContent = postcode?.label ?? question.label;
      input!.value = contact[field];
      input!.placeholder = postcode?.placeholder ?? ('placeholder' in question ? question.placeholder : '');
      input!.type = field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text';
      input!.inputMode = field === 'phone' ? 'tel' : field === 'email' ? 'email' : 'text';
      input!.autocomplete =
        field === 'name'
          ? 'name'
          : field === 'phone'
            ? 'tel'
            : field === 'email'
              ? 'email'
              : 'postal-code';
      return;
    }

    label!.textContent = question.label;
  }

  function renderReviewPanel(): void {
    const complete = isComplete(getContact());
    if (review) review.hidden = !complete;
    if (!complete) return;

    if (reviewList && reviewCount) renderReview(reviewList, reviewCount);
    if (consentBox) consentBox.checked = getConsent();
    if (submitButton) submitButton.disabled = !getConsent();
  }

  function focusControl(): void {
    const field = activeField();
    if (!field) return;
    (field === 'country' ? select! : input!).focus();
  }

  function refresh(): void {
    renderTranscript();
    renderQuestion();
    renderReviewPanel();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const field = activeField();
    if (!field) return;

    const raw = field === 'country' ? select.value : input.value;
    const result = VALIDATORS[field](raw);

    if (!result.ok) {
      error.textContent = result.message;
      (field === 'country' ? select : input).setAttribute('aria-invalid', 'true');
      (field === 'country' ? select : input).focus();
      return;
    }

    (field === 'country' ? select : input).removeAttribute('aria-invalid');
    error.textContent = '';
    editing = null;
    setContact({ [field]: result.value } as Partial<EnquiryContact>);
    refresh();
    focusControl();
  });

  consentBox?.addEventListener('change', () => {
    setConsent(consentBox.checked);
    if (submitButton) submitButton.disabled = !consentBox.checked;
  });

  submitButton?.addEventListener('click', onSubmit);

  return { refresh };
}
