/*
 * The enquiry wizard — a fixed four-step sequence (CLAUDE.md 6).
 *
 * Deterministic and hand-rolled on purpose: there is no AI here, no free-text
 * interpretation, and no framework. Every step shell is already in the HTML;
 * this only toggles visibility, so a refresh, a back-button press or a dead
 * JS bundle can never leave the customer on a blank page.
 *
 * State changes go through `update()`, which persists and re-renders. There
 * is no subscriber list: at four steps, one render function is enough.
 */
import copy from '../data/copy.json' with { type: 'json' };
import { track, trackAbandonment } from './analytics.ts';
import { whatsappHref } from '../data/site.ts';
import { initClipboard } from './clipboard.ts';
import { countryName, initDetails, isComplete } from './details.ts';
import { describe, parseInput } from './parse.ts';
import { createId, createReference } from './reference.ts';
import {
  createEmptyState,
  discard,
  flush,
  load,
  persistOnUnload,
  save,
  type EnquiryItem,
  type EnquiryState,
  type Step,
} from './storage.ts';
import {
  buildPayload,
  dropFromQueue,
  isHoneypotTripped,
  passesTimeCheck,
  postEnquiry,
  queueEnquiry,
  readSubmissionTimes,
  recordSubmission,
  retryQueue,
  whatsappMessage,
  withinRateLimit,
  type EnquiryPayload,
  type SessionMeta,
} from './submit.ts';

/** Step 4 is a success screen and is not counted in the progress bar (CLAUDE.md 6). */
export const COUNTED_STEPS = 3;

export interface StepGuard {
  itemCount: number;
  submitted: boolean;
}

/*
 * A deep link, a stale bookmark or a back-button press can ask for any step.
 * Rather than reject, clamp to the furthest step the enquiry actually
 * supports — refusing to navigate leaves the customer stuck, whereas landing
 * them one step back is recoverable and self-explanatory.
 */
export function clampStep(requested: number, { itemCount, submitted }: StepGuard): Step {
  if (requested >= 4 && submitted) return 4;
  if (requested >= 3 && itemCount > 0) return 3;
  if (requested >= 2) return 2;
  return 1;
}

export interface UrlIntent {
  step: number | null;
  brand: string | null;
}

export function readUrl(search: string): UrlIntent {
  const params = new URLSearchParams(search);
  const rawStep = Number(params.get('step'));
  return {
    step: Number.isInteger(rawStep) && rawStep >= 1 && rawStep <= 4 ? rawStep : null,
    brand: params.get('brand'),
  };
}

/** `?brand=` with no explicit `?step=` means the brand is already chosen (CLAUDE.md 7). */
export function intendedStep(intent: UrlIntent, storedStep: Step): number {
  if (intent.step !== null) return intent.step;
  if (intent.brand !== null) return 2;
  return storedStep;
}

export function stepUrl(step: Step): string {
  return step === 1 ? '/order' : `/order?step=${step}`;
}

// ---------------------------------------------------------------------------

interface Elements {
  steps: Map<Step, HTMLElement>;
  headings: Map<Step, HTMLElement>;
  progress: HTMLElement | null;
  progressFill: HTMLElement | null;
  progressLabel: HTMLElement | null;
  progressButtons: HTMLButtonElement[];
  announce: HTMLElement | null;
  tray: HTMLElement | null;
  trayList: HTMLElement | null;
  trayCount: HTMLElement | null;
  trayEmpty: HTMLElement | null;
  brandName: HTMLElement[];
  brandLink: HTMLAnchorElement | null;
  brandChosen: HTMLElement | null;
  resume: HTMLElement | null;
  resumeCount: HTMLElement | null;
  reference: HTMLElement[];
  continueToDetails: HTMLButtonElement | null;
  submitButton: HTMLButtonElement | null;
  submitNote: HTMLElement | null;
  failure: HTMLElement | null;
  failureHeading: HTMLElement | null;
  failureBody: HTMLElement | null;
  retryButton: HTMLButtonElement | null;
  whatsappFallback: HTMLAnchorElement | null;
  whatsappNote: HTMLElement | null;
  whatsappFollowup: HTMLAnchorElement | null;
  honeypot: HTMLInputElement | null;
}

const STEP_TITLES: Record<Step, string> = {
  1: 'Choose a brand',
  2: 'Add your appliance',
  3: 'Your details',
  4: 'Enquiry sent',
};

export function initWizard() {
  const root = document.querySelector<HTMLElement>('[data-wizard]');
  if (!root) return;

  /*
   * The brand name and URL for every slug are already in the DOM on the step 1
   * cards. Reading them back is free; shipping a second copy as JSON would
   * duplicate 65 records for nothing.
   */
  const brandNames: Record<string, string> = {};
  const brandUrls: Record<string, string> = {};
  for (const card of root.querySelectorAll<HTMLAnchorElement>('[data-brand-card]')) {
    const slug = card.dataset.slug;
    if (!slug || slug in brandNames) continue;
    brandNames[slug] = card.dataset.name ?? slug;
    brandUrls[slug] = card.href;
  }

  const el: Elements = {
    steps: new Map(),
    headings: new Map(),
    progress: root.querySelector('[data-progress]'),
    progressFill: root.querySelector('[data-progress-fill]'),
    progressLabel: root.querySelector('[data-progress-label]'),
    progressButtons: Array.from(root.querySelectorAll('[data-progress-step]')),
    announce: root.querySelector('[data-announce]'),
    tray: root.querySelector('[data-tray]'),
    trayList: root.querySelector('[data-tray-list]'),
    trayCount: root.querySelector('[data-tray-count]'),
    trayEmpty: root.querySelector('[data-tray-empty]'),
    brandName: Array.from(root.querySelectorAll('[data-brand-name]')),
    brandLink: root.querySelector('[data-brand-link]'),
    brandChosen: root.querySelector('[data-brand-chosen]'),
    resume: root.querySelector('[data-resume]'),
    resumeCount: root.querySelector('[data-resume-count]'),
    reference: Array.from(root.querySelectorAll('[data-reference]')),
    continueToDetails: root.querySelector('[data-continue-details]'),
    submitButton: root.querySelector('[data-submit-enquiry]'),
    submitNote: root.querySelector('[data-submit-note]'),
    failure: root.querySelector('[data-submit-failure]'),
    failureHeading: root.querySelector('[data-failure-heading]'),
    failureBody: root.querySelector('[data-failure-body]'),
    retryButton: root.querySelector('[data-submit-retry]'),
    whatsappFallback: root.querySelector('[data-whatsapp-fallback]'),
    whatsappNote: root.querySelector('[data-whatsapp-note]'),
    whatsappFollowup: root.querySelector('[data-whatsapp-followup]'),
    honeypot: root.querySelector('[data-honeypot]'),
  };

  /*
   * `data-step-panel`, not `data-step`: the latter marks navigation targets
   * (progress buttons, the skip link, Back), and the two collided — the map
   * ended up holding a button instead of its section, so advancing a step
   * hid the button and left every panel closed.
   */
  for (const section of root.querySelectorAll<HTMLElement>('[data-step-panel]')) {
    const step = Number(section.dataset.stepPanel) as Step;
    el.steps.set(step, section);
    const heading = section.querySelector<HTMLElement>('[data-step-heading]');
    if (heading) el.headings.set(step, heading);
  }

  /*
   * Items saved before the parser existed carry no parsed fields, and a stored
   * enquiry lives for 30 days — so without this, anyone mid-enquiry when a
   * parser change ships keeps seeing raw URLs. Re-parse on load rather than
   * bumping the schema version, which would throw their enquiry away instead.
   *
   * Descriptions are left alone: the customer chose free text deliberately.
   */
  function backfillParse(items: EnquiryItem[]): { items: EnquiryItem[]; changed: boolean } {
    let changed = false;
    const parsedItems = items.map((item) => {
      if (item.inputType === 'description' || item.parsedModel || item.parsedName) return item;
      const parsed = parseInput(item.rawInput, item.brandSlug);
      if (!parsed.model && !parsed.name) return item;
      changed = true;
      return {
        ...item,
        inputType: parsed.inputType,
        parsedModel: parsed.model,
        parsedName: parsed.name,
      };
    });
    return { items: parsedItems, changed };
  }

  let state: EnquiryState = load() ?? createEmptyState();
  const backfilled = backfillParse(state.items);
  if (backfilled.changed) state = { ...state, items: backfilled.items };
  /** Tray row currently open for correction; survives re-renders. */
  let editingId: string | null = null;

  /*
   * Session metadata for the payload (CLAUDE.md 8.7 step 6). Deliberately not
   * persisted: adding it to the stored schema would mean a version bump, and a
   * version bump discards every enquiry saved by the previous build. Metadata
   * is worth having, not worth an enquiry — so a customer who refreshes sends
   * a shorter brand list and a shorter time on page.
   */
  const session: SessionMeta & { brandsClicked: string[] } = {
    entryUrl: location.href,
    brandsClicked: [],
    msOnPage: 0,
  };
  const loadedAt = Date.now();

  function update(changes: Partial<EnquiryState>, options: { push?: boolean } = {}): void {
    const previousStep = state.step;
    state = { ...state, ...changes };
    save(state);
    render(previousStep, options.push ?? false);
  }

  function render(previousStep: Step, push: boolean): void {
    const changed = state.step !== previousStep;

    for (const [step, section] of el.steps) {
      section.hidden = step !== state.step;
    }

    renderProgress();
    renderTray();
    renderBrand();
    details?.refresh();
    for (const node of el.reference) node.textContent = state.reference;

    // Step 4's WhatsApp link carries the reference, so a customer who follows
    // up with a screenshot does not have to type it out.
    if (el.whatsappFollowup && state.reference !== '') {
      const href = whatsappHref(`${copy.order.step4.whatsappPrefill} ${state.reference}.`);
      if (href) el.whatsappFollowup.href = href;
    }

    if (push) {
      history.pushState({ step: state.step }, '', stepUrl(state.step));
    }

    if (changed) {
      // Focus the new heading, and announce separately: a screen reader user
      // who tabs rather than reads needs the step number too (CLAUDE.md 10.1).
      track('step_view', { step: state.step });
      el.headings.get(state.step)?.focus();
      if (el.announce) {
        el.announce.textContent =
          state.step === 4
            ? STEP_TITLES[4]
            : `Step ${state.step} of ${COUNTED_STEPS}. ${STEP_TITLES[state.step]}`;
      }
    }
  }

  function renderProgress(): void {
    if (el.progress) el.progress.hidden = state.step === 4;
    if (state.step === 4) return;

    const current = state.step;
    if (el.progressFill) el.progressFill.style.width = `${(current / COUNTED_STEPS) * 100}%`;
    if (el.progressLabel) {
      el.progressLabel.textContent = `Step ${current} of ${COUNTED_STEPS} — ${STEP_TITLES[current]}`;
    }

    for (const button of el.progressButtons) {
      const step = Number(button.dataset.progressStep) as Step;
      const reachable = clampStep(step, guard()) === step;
      button.disabled = !reachable;
      button.setAttribute('aria-current', step === current ? 'step' : 'false');
      button.dataset.state = step < current ? 'done' : step === current ? 'current' : 'todo';
    }
  }

  function renderTray(): void {
    if (!el.trayList) return;
    const { items } = state;

    if (el.trayCount) el.trayCount.textContent = String(items.length);
    if (el.tray) el.tray.hidden = items.length === 0;
    if (el.trayEmpty) el.trayEmpty.hidden = items.length > 0;
    if (el.continueToDetails) el.continueToDetails.disabled = items.length === 0;

    el.trayList.replaceChildren(...items.map(trayRow));
  }

  function trayRow(item: EnquiryItem): HTMLLIElement {
    const row = document.createElement('li');
    row.className = 'border-b border-line py-3 last:border-b-0';

    if (editingId === item.id) {
      row.append(correctionForm(item));
      return row;
    }

    const line = document.createElement('div');
    line.className = 'flex items-start justify-between gap-4';

    const text = document.createElement('div');
    text.className = 'min-w-0';

    const title = document.createElement('p');
    title.className = 'truncate text-ink';
    title.textContent = itemLabel(item);
    text.append(title);

    const detail = [item.brandSlug ? brandNames[item.brandSlug] : null, sourceNote(item)]
      .filter(Boolean)
      .join(' · ');
    if (detail) {
      const meta = document.createElement('p');
      meta.className = 'truncate text-sm text-ink-muted';
      meta.textContent = detail;
      text.append(meta);
    }

    const actions = document.createElement('div');
    actions.className = 'flex shrink-0 items-center';

    // "Is that right?" from CLAUDE.md 8.3, as a quiet correction affordance
    // rather than a blocking confirm — parsing must never gate progress.
    const correct = document.createElement('button');
    correct.type = 'button';
    correct.className = 'min-h-touch px-2 text-sm text-ink-muted underline';
    correct.textContent = 'Not right?';
    correct.setAttribute('aria-label', `Correct ${itemLabel(item)}`);
    correct.addEventListener('click', () => {
      editingId = item.id;
      renderTray();
      el.trayList?.querySelector<HTMLInputElement>('input')?.focus();
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'min-h-touch px-2 text-sm text-ink-muted underline';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${itemLabel(item)}`);
    remove.addEventListener('click', () => removeItem(item.id));

    actions.append(correct, remove);
    line.append(text, actions);
    row.append(line);
    return row;
  }

  function correctionForm(item: EnquiryItem): HTMLFormElement {
    const form = document.createElement('form');
    form.className = 'flex flex-col gap-2 sm:flex-row sm:items-end';

    const label = document.createElement('label');
    label.className = 'flex-1 text-sm text-ink-muted';
    label.textContent = 'Model number or description';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = itemLabel(item);
    input.className =
      'mt-1 h-touch w-full rounded-sm border border-line-strong bg-surface px-3 text-ink';
    label.append(input);

    const save = document.createElement('button');
    save.type = 'submit';
    save.className = 'h-touch shrink-0 rounded-sm bg-accent px-5 text-sm font-medium text-accent-contrast';
    save.textContent = 'Save';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'min-h-touch shrink-0 px-2 text-sm text-ink-muted underline';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => {
      editingId = null;
      renderTray();
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const corrected = input.value.trim();
      editingId = null;
      if (corrected === '') {
        renderTray();
        return;
      }
      // A hand-typed correction is authoritative: keep it verbatim and drop the
      // guessed name, rather than re-parsing what the customer just fixed.
      updateItem(item.id, { parsedModel: corrected, parsedName: null });
    });

    form.append(label, save, cancel);
    return form;
  }

  /** The pasted link, shortened — reassurance that we kept what they sent. */
  function sourceNote(item: EnquiryItem): string | null {
    if (item.inputType !== 'url') return null;
    try {
      return new URL(item.rawInput).hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  }

  function renderBrand(): void {
    const slug = state.draftBrandSlug;
    const name = slug ? brandNames[slug] : undefined;

    if (el.brandChosen) el.brandChosen.hidden = !name;
    for (const node of el.brandName) node.textContent = name ?? '';
    if (el.brandLink && slug && brandUrls[slug]) {
      el.brandLink.href = brandUrls[slug];
      el.brandLink.textContent = `Open ${name} ↗`;
    }
  }

  function guard() {
    return { itemCount: state.items.length, submitted: state.submitted };
  }

  function goToStep(requested: number, push = true): void {
    update({ step: clampStep(requested, guard()) }, { push });
  }

  function addItem(rawInput: string, forceDescription = false): void {
    const trimmed = rawInput.trim();
    if (trimmed === '') return;

    /*
     * An appliance added after a sent enquiry starts a *new* enquiry. Without
     * this, `reference || createReference()` below would reuse the reference
     * the client has already received an email about, and two different
     * enquiries would arrive under one number.
     */
    if (state.submitted) {
      state = { ...createEmptyState(), step: state.step, draftBrandSlug: state.draftBrandSlug };
    }

    const parsed = forceDescription
      ? { inputType: 'description' as const, model: null, name: null }
      : parseInput(trimmed, state.draftBrandSlug);

    const item: EnquiryItem = {
      id: createId(),
      brandSlug: state.draftBrandSlug,
      rawInput: trimmed,
      inputType: parsed.inputType,
      parsedModel: parsed.model,
      parsedName: parsed.name,
      note: '',
      addedAt: Date.now(),
    };

    update({
      items: [...state.items, item],
      reference: state.reference || createReference(),
      draftBrandSlug: null,
    });
  }

  function removeItem(id: string): void {
    const items = state.items.filter((item) => item.id !== id);
    track('item_removed', { remaining: items.length });
    // Dropping the last item must also drop them back out of step 3, or they
    // are looking at a details form for an empty enquiry.
    update({ items, step: clampStep(state.step, { ...guard(), itemCount: items.length }) });
  }

  function updateItem(id: string, changes: Partial<EnquiryItem>): void {
    update({ items: state.items.map((item) => (item.id === id ? { ...item, ...changes } : item)) });
  }

  function itemLabel(item: EnquiryItem): string {
    return describe(
      { inputType: item.inputType, model: item.parsedModel, name: item.parsedName },
      item.rawInput,
    );
  }

  // --- wiring ---------------------------------------------------------------

  root.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target) return;

    switch (target.dataset.action) {
      case 'go-step':
        event.preventDefault();
        goToStep(Number(target.dataset.step));
        break;
      case 'add-another':
        event.preventDefault();
        track('add_another', { items: state.items.length });
        update({ draftBrandSlug: null }, { push: true });
        goToStep(1);
        break;
      case 'resume-continue':
        if (el.resume) el.resume.hidden = true;
        break;
      case 'resume-discard': {
        // Deliberately not routed through `update`, which would persist the
        // fresh empty state and leave a record behind for someone who just
        // asked us to forget them.
        const previousStep = state.step;
        state = { ...createEmptyState(), step: 1 };
        if (el.resume) el.resume.hidden = true;
        render(previousStep, true);
        discard();
        break;
      }
      case 'copy-reference':
        void copyReference(target);
        break;
    }
  });

  async function copyReference(button: HTMLElement): Promise<void> {
    const original = button.dataset.label ?? button.textContent ?? 'Copy';
    button.dataset.label = original;
    try {
      await navigator.clipboard.writeText(state.reference);
      button.textContent = copy.order.step4.copied;
    } catch {
      // Clipboard write can be refused outright. The reference is on screen
      // either way, so say so rather than failing silently.
      button.textContent = copy.order.step4.copyFailed;
    }
    setTimeout(() => {
      button.textContent = original;
    }, 2000);
  }

  // Step 1: record the brand, then advance. Order matters — the new tab can
  // steal focus immediately, so nothing may depend on running afterwards
  // (CLAUDE.md 8.2).
  root.addEventListener('click', (event) => {
    const card = (event.target as HTMLElement).closest<HTMLElement>('[data-brand-card]');
    if (!card?.dataset.slug) return;
    // Which brands they opened, in order, for the payload's metadata — this is
    // the funnel data that tells the client which brands drive enquiries.
    if (!session.brandsClicked.includes(card.dataset.slug)) {
      session.brandsClicked.push(card.dataset.slug);
    }
    // Which brands drive enquiries — the funnel question the client cares
    // most about (CLAUDE.md 8.10). Fired before the step advances, so it
    // survives the new tab stealing focus (8.2).
    track('brand_click', { brand: card.dataset.slug });
    update({ draftBrandSlug: card.dataset.slug });
    goToStep(2);
  });

  const addForm = root.querySelector<HTMLFormElement>('[data-add-item]');
  const productInput = addForm?.querySelector<HTMLInputElement>('input[name="product"]') ?? null;
  const echo = root.querySelector<HTMLElement>('[data-echo]');
  const pasteButton = root.querySelector<HTMLElement>('[data-paste-button]');

  /** Echoes what was understood before it is committed (CLAUDE.md 8.3). */
  function showEcho(value: string): void {
    if (!echo) return;
    const trimmed = value.trim();
    if (trimmed === '') {
      echo.textContent = '';
      return;
    }
    const parsed = parseInput(trimmed, state.draftBrandSlug);
    echo.textContent =
      parsed.model || parsed.name
        ? `Got it — ${describe(parsed, trimmed)}. Add it if that looks right.`
        : 'We will send this across as you have written it.';
  }

  addForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!productInput) return;
    // `entry` is set by clipboard.ts; absent means they typed it themselves.
    if (productInput.dataset.entry !== 'paste') track('manual_entry');
    addItem(productInput.value);
    delete productInput.dataset.entry;
    productInput.value = '';
    showEcho('');
    productInput.focus();
  });

  const describeForm = root.querySelector<HTMLFormElement>('[data-add-description]');
  describeForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const field = describeForm.querySelector<HTMLTextAreaElement>('textarea[name="description"]');
    if (!field) return;
    // Forced: "a quiet 60cm dishwasher" must never be mangled into a model.
    addItem(field.value, true);
    field.value = '';
  });

  if (productInput && pasteButton) {
    initClipboard({ input: productInput, button: pasteButton, onText: showEcho });
  }

  // --- submission (CLAUDE.md 8.7) -------------------------------------------

  /*
   * Baked in at build time from .env. An empty key means the site was deployed
   * unconfigured: `postEnquiry` reports that distinctly, the enquiry is queued
   * rather than dropped, and a later build with the key delivers it.
   */
  const ACCESS_KEY: string = import.meta.env.PUBLIC_WEB3FORMS_KEY ?? '';
  const SUBMIT_COPY = copy.order.submit;

  /** Guards against a second send while the first is still in flight. */
  let sending = false;

  function currentPayload(): EnquiryPayload {
    return buildPayload({
      state,
      session: { ...session, msOnPage: Date.now() - loadedAt },
      countryLabel: countryName(state.contact.country),
      brandNames,
    });
  }

  function setSubmitBusy(busy: boolean): void {
    if (el.submitButton) {
      el.submitButton.disabled = busy;
      el.submitButton.textContent = busy ? SUBMIT_COPY.sending : copy.order.step3.submit;
    }
    if (el.retryButton) el.retryButton.disabled = busy;
    if (el.submitNote) el.submitNote.textContent = busy ? SUBMIT_COPY.retrying : '';
  }

  type FailureKind = 'failure' | 'blocked' | 'limit';

  /*
   * The failure path must never be a dead end (rule 2.4). Whatever went wrong,
   * the customer is told the truth and handed a second route: retry, and —
   * once the client supplies a number — WhatsApp, pre-filled with the whole
   * enquiry so nothing has to be retyped.
   */
  function showFailure(kind: FailureKind, payload: EnquiryPayload): void {
    if (!el.failure) return;
    el.failure.hidden = false;

    const heading =
      kind === 'failure'
        ? SUBMIT_COPY.failureHeading
        : kind === 'blocked'
          ? SUBMIT_COPY.blockedHeading
          : SUBMIT_COPY.limitHeading;
    const body =
      kind === 'failure'
        ? SUBMIT_COPY.failureBody
        : kind === 'blocked'
          ? SUBMIT_COPY.blockedBody
          : SUBMIT_COPY.limitBody;

    if (el.failureHeading) el.failureHeading.textContent = heading;
    if (el.failureBody) el.failureBody.textContent = body;

    const href = whatsappHref(whatsappMessage(payload));
    if (el.whatsappFallback) {
      el.whatsappFallback.hidden = href === null;
      if (href) el.whatsappFallback.href = href;
    }
    if (el.whatsappNote) el.whatsappNote.hidden = href === null;

    // Focus rather than scroll: it brings the panel into view for everyone,
    // works for a screen reader, and respects prefers-reduced-motion.
    el.failureHeading?.focus();
  }

  function hideFailure(): void {
    if (el.failure) el.failure.hidden = true;
  }

  /*
   * Delivery confirmed. Only now is anything cleared, and only the reference
   * survives: the personal data has served its purpose (rule 2.7), while
   * `submitted` plus the reference are what let a refresh on step 4 still show
   * the customer their number.
   */
  function completeEnquiry(reference: string): void {
    recordSubmission();
    dropFromQueue(reference);
    update({ ...createEmptyState(), reference, submitted: true, step: 4 }, { push: true });
    flush();
  }

  async function submitEnquiry(): Promise<void> {
    if (sending) return;
    // Nothing incomplete can be sent: the button is disabled without consent,
    // and this is the belt to that braces.
    if (state.items.length === 0 || !isComplete(state.contact) || !state.consent) return;

    const payload = currentPayload();
    const now = Date.now();
    const startedAt = state.items[0]?.addedAt ?? null;

    // Spam guards, in cheapest-first order (CLAUDE.md 8.8). None of them
    // queues: a submission we refuse must not then be delivered by the queue
    // on the next page load.
    if (isHoneypotTripped(el.honeypot) || !passesTimeCheck({ now, loadedAt, startedAt })) {
      // Counted: if this ever starts firing in volume it is catching people,
      // not bots, and the guards need loosening.
      track('submit_failure', { reason: 'blocked' });
      showFailure('blocked', payload);
      return;
    }
    if (!withinRateLimit(readSubmissionTimes(now), now)) {
      track('submit_failure', { reason: 'rate_limited' });
      showFailure('limit', payload);
      return;
    }

    sending = true;
    setSubmitBusy(true);
    hideFailure();
    track('submit_attempt', { items: state.items.length, country: state.contact.country });

    const result = await postEnquiry({ accessKey: ACCESS_KEY, payload });

    sending = false;
    setSubmitBusy(false);

    if (result.ok) {
      track('submit_success', { items: state.items.length });
      completeEnquiry(payload.reference);
      return;
    }

    // Queue before telling them, so the enquiry is safe on the device even if
    // the render below throws.
    queueEnquiry(payload);
    track('submit_failure', { reason: result.reason });
    showFailure('failure', payload);
  }

  el.retryButton?.addEventListener('click', () => void submitEnquiry());

  const details = initDetails({
    root,
    getContact: () => state.contact,
    getConsent: () => state.consent,
    setContact: (changes) => update({ contact: { ...state.contact, ...changes } }),
    setConsent: (consent) => update({ consent }),
    renderReview: (list, count) => {
      count.textContent = String(state.items.length);
      list.replaceChildren(
        ...state.items.map((item) => {
          const row = document.createElement('li');
          row.className = 'border-b border-line py-2 text-ink last:border-b-0';
          row.textContent = itemLabel(item);
          if (item.brandSlug && brandNames[item.brandSlug]) {
            const brand = document.createElement('span');
            brand.className = 'text-ink-muted';
            brand.textContent = ` · ${brandNames[item.brandSlug]}`;
            row.append(brand);
          }
          return row;
        }),
      );
    },
    onSubmit: () => void submitEnquiry(),
  });

  window.addEventListener('popstate', () => {
    goToStep(readUrl(location.search).step ?? 1, false);
  });

  persistOnUnload();

  // --- first paint ----------------------------------------------------------

  const intent = readUrl(location.search);
  if (intent.brand && brandNames[intent.brand]) {
    state = { ...state, draftBrandSlug: intent.brand };
  }

  const resumable = state.items.length > 0 && intent.step === null;
  state = { ...state, step: clampStep(intendedStep(intent, state.step), guard()) };

  history.replaceState({ step: state.step }, '', stepUrl(state.step));
  // previousStep === state.step, so the first paint moves no focus.
  render(state.step, false);
  // ...and fires no step_view either, so the entry step is recorded here.
  track('step_view', { step: state.step });
  trackAbandonment(() => ({
    step: state.step,
    items: state.items.length,
    submitted: state.submitted,
  }));
  if (backfilled.changed) save(state);

  if (resumable && el.resume) {
    el.resume.hidden = false;
    if (el.resumeCount) el.resumeCount.textContent = String(state.items.length);
  }

  flush();

  /*
   * Anything that failed to send last time gets one more try, on every load
   * (CLAUDE.md 8.7 step 3). If the enquiry still on this device is the one
   * that got through, the customer has never seen a confirmation for it — so
   * finish the job and show them step 4 with their reference.
   */
  void retryQueue({
    accessKey: ACCESS_KEY,
    onSent: (entry) => {
      if (entry.reference === state.reference && !state.submitted && state.items.length > 0) {
        completeEnquiry(entry.reference);
      }
    },
  });

  /*
   * Marks that the step shells are now under this module's control. Nothing in
   * the wizard reads it: it exists so the e2e harness can tell a page whose
   * markup has parsed from one whose listeners are attached. Waiting on a fixed
   * timer instead made the suite flaky — the dev server compiles on demand, so
   * a click can land in the gap and silently do nothing.
   */
  root.dataset.ready = 'true';
}
