/*
 * The repair booking flow — a fixed four-step sequence on /repairs, the
 * repair-flow sibling of wizard.ts on /order (CLAUDE.md, architecture plan
 * 2026-09-16).
 *
 * Deterministic and hand-rolled, same as the enquiry wizard: no AI, no
 * free-text interpretation beyond echoing back what the customer typed.
 * Every step shell is already in the HTML; this only toggles visibility, so a
 * refresh, a back-button press or a dead JS bundle can never leave the
 * customer on a blank page — with JS off this degrades to a page explaining
 * what is repaired and how to reach the shop.
 *
 * There is no brand directory and no clipboard handling here: the customer
 * is not copying a link from a manufacturer's site, they are describing an
 * item they are carrying in. That is the whole reason this is a separate,
 * much smaller module rather than a mode of wizard.ts.
 */
import copy from '../data/copy.json' with { type: 'json' };
import repairsData from '../data/repairs.json' with { type: 'json' };
import siteData from '../data/site.json' with { type: 'json' };
import bankHolidays from '../data/bank-holidays.json' with { type: 'json' };
import { track, trackAbandonment } from './analytics.ts';
import { whatsappHref } from '../data/site.ts';
import { ACCESS_KEYS } from './keys.ts';
import { labelUrl } from './label.ts';
import { initRepairDetails, isRepairContactComplete } from './repair-details.ts';
import { createReference } from './reference.ts';
import {
  createEmptyRepairState,
  discard,
  flush,
  load,
  persistOnUnload,
  save,
  type RepairContact,
  type RepairState,
  type RepairStep,
} from './repair-storage.ts';
import {
  compareMonths,
  dateInMonth,
  daysInMonth,
  formatSlotDay,
  generateSlotDays,
  londonDateString,
  mondayIndexOfFirst,
  monthLabel,
  monthOf,
  shiftMonth,
  type MonthKey,
  type SlotDay,
} from './slots.ts';
import {
  buildRepairPayload,
  dropFromQueue,
  formatDropoff,
  isHoneypotTripped,
  passesTimeCheck,
  postEnquiry,
  queueSubmission,
  readSubmissionTimes,
  recordSubmission,
  repairWhatsappMessage,
  retryQueue,
  withinRateLimit,
  type RepairPayload,
  type SessionMeta,
} from './submit.ts';

/** Step 4 is a success screen and is not counted (CLAUDE.md 6, mirrored here). */
export const COUNTED_STEPS = 3;

export interface RepairStepGuard {
  step1Complete: boolean;
  step2Complete: boolean;
  submitted: boolean;
}

/*
 * A deep link or a back-button press can ask for any step. As on /order,
 * clamp to the furthest step the booking actually supports rather than
 * reject — landing one step back is recoverable, refusing to navigate is not.
 */
export function clampRepairStep(
  requested: number,
  { step1Complete, step2Complete, submitted }: RepairStepGuard,
): RepairStep {
  if (requested >= 4 && submitted) return 4;
  if (requested >= 3 && step1Complete && step2Complete) return 3;
  if (requested >= 2 && step1Complete) return 2;
  return 1;
}

export interface RepairUrlIntent {
  step: number | null;
  category: string | null;
}

export function readRepairUrl(search: string): RepairUrlIntent {
  const params = new URLSearchParams(search);
  const rawStep = Number(params.get('step'));
  return {
    step: Number.isInteger(rawStep) && rawStep >= 1 && rawStep <= 4 ? rawStep : null,
    category: params.get('category'),
  };
}

export function repairStepUrl(step: RepairStep): string {
  return step === 1 ? '/repairs' : `/repairs?step=${step}`;
}

export function isStep1Complete(state: Pick<RepairState, 'product'>): boolean {
  return state.product.trim() !== '';
}

export function isStep2Complete(state: Pick<RepairState, 'fault'>): boolean {
  return state.fault.trim() !== '';
}

// ---------------------------------------------------------------------------

interface Elements {
  steps: Map<RepairStep, HTMLElement>;
  headings: Map<RepairStep, HTMLElement>;
  progress: HTMLElement | null;
  progressFill: HTMLElement | null;
  progressLabel: HTMLElement | null;
  progressButtons: HTMLButtonElement[];
  announce: HTMLElement | null;
  resume: HTMLElement | null;
  resumeCount: HTMLElement | null;
  categoryButtons: HTMLButtonElement[];
  otherNote: HTMLElement | null;
  product: HTMLTextAreaElement | null;
  step1Error: HTMLElement | null;
  step1Continue: HTMLButtonElement | null;
  fault: HTMLTextAreaElement | null;
  step2Error: HTMLElement | null;
  step2Continue: HTMLButtonElement | null;
  slotSection: HTMLElement | null;
  slotDays: HTMLElement | null;
  slotGrid: HTMLElement | null;
  slotMonthLabel: HTMLElement | null;
  slotPrevMonth: HTMLButtonElement | null;
  slotNextMonth: HTMLButtonElement | null;
  slotTimes: HTMLElement | null;
  slotNone: HTMLElement | null;
  slotChosen: HTMLElement | null;
  slotChosenText: HTMLElement | null;
  review: HTMLElement | null;
  reviewList: HTMLElement | null;
  consent: HTMLInputElement | null;
  honeypot: HTMLInputElement | null;
  submitButton: HTMLButtonElement | null;
  submitNote: HTMLElement | null;
  failure: HTMLElement | null;
  failureHeading: HTMLElement | null;
  failureBody: HTMLElement | null;
  retryButton: HTMLButtonElement | null;
  whatsappFallback: HTMLAnchorElement | null;
  whatsappNote: HTMLElement | null;
  reference: HTMLElement[];
  printLink: HTMLAnchorElement | null;
  whatsappFollowup: HTMLAnchorElement | null;
}

const STEP_TITLES: Record<RepairStep, string> = {
  1: copy.repairs.step1.heading,
  2: copy.repairs.step2.heading,
  3: copy.repairs.step3.heading,
  4: copy.repairs.step4.heading,
};

const CATEGORY_NAMES: Record<string, string> = Object.fromEntries(
  repairsData.categories.map((category) => [category.slug, category.name]),
);

/** Bank holidays plus whatever one-off closures the client has set in site.json. */
function closedDates(): Set<string> {
  return new Set([...(bankHolidays.dates as string[]), ...(siteData.closures as string[])]);
}

export function initRepair() {
  const root = document.querySelector<HTMLElement>('[data-repair]');
  if (!root) return;

  const el: Elements = {
    steps: new Map(),
    headings: new Map(),
    progress: root.querySelector('[data-progress]'),
    progressFill: root.querySelector('[data-progress-fill]'),
    progressLabel: root.querySelector('[data-progress-label]'),
    progressButtons: Array.from(root.querySelectorAll('[data-progress-step]')),
    announce: root.querySelector('[data-announce]'),
    resume: root.querySelector('[data-resume]'),
    resumeCount: root.querySelector('[data-resume-count]'),
    categoryButtons: Array.from(root.querySelectorAll('[data-category]')),
    otherNote: root.querySelector('[data-other-note]'),
    product: root.querySelector('[data-repair-product]'),
    step1Error: root.querySelector('[data-step1-error]'),
    step1Continue: root.querySelector('[data-step1-continue]'),
    fault: root.querySelector('[data-repair-fault]'),
    step2Error: root.querySelector('[data-step2-error]'),
    step2Continue: root.querySelector('[data-step2-continue]'),
    slotSection: root.querySelector('[data-slot-section]'),
    slotDays: root.querySelector('[data-slot-days]'),
    slotGrid: root.querySelector('[data-slot-grid]'),
    slotMonthLabel: root.querySelector('[data-slot-month]'),
    slotPrevMonth: root.querySelector('[data-slot-prev-month]'),
    slotNextMonth: root.querySelector('[data-slot-next-month]'),
    slotTimes: root.querySelector('[data-slot-times]'),
    slotNone: root.querySelector('[data-slot-none]'),
    slotChosen: root.querySelector('[data-slot-chosen]'),
    slotChosenText: root.querySelector('[data-slot-chosen-text]'),
    review: root.querySelector('[data-repair-review]'),
    reviewList: root.querySelector('[data-repair-review-list]'),
    consent: root.querySelector('[data-repair-consent]'),
    honeypot: root.querySelector('[data-repair-honeypot]'),
    submitButton: root.querySelector('[data-repair-submit]'),
    submitNote: root.querySelector('[data-repair-submit-note]'),
    failure: root.querySelector('[data-repair-failure]'),
    failureHeading: root.querySelector('[data-repair-failure-heading]'),
    failureBody: root.querySelector('[data-repair-failure-body]'),
    retryButton: root.querySelector('[data-repair-retry]'),
    whatsappFallback: root.querySelector('[data-repair-whatsapp-fallback]'),
    whatsappNote: root.querySelector('[data-repair-whatsapp-note]'),
    reference: Array.from(root.querySelectorAll('[data-repair-reference]')),
    printLink: root.querySelector('[data-repair-print]'),
    whatsappFollowup: root.querySelector('[data-repair-whatsapp-followup]'),
  };

  for (const section of root.querySelectorAll<HTMLElement>('[data-step-panel]')) {
    const step = Number(section.dataset.stepPanel) as RepairStep;
    el.steps.set(step, section);
    const heading = section.querySelector<HTMLElement>('[data-step-heading]');
    if (heading) el.headings.set(step, heading);
  }

  let state: RepairState = load() ?? createEmptyRepairState();

  const session: SessionMeta = { entryUrl: location.href, brandsClicked: [], msOnPage: 0 };
  const loadedAt = Date.now();

  const guard = (): RepairStepGuard => ({
    step1Complete: isStep1Complete(state),
    step2Complete: isStep2Complete(state),
    submitted: state.submitted,
  });

  function update(changes: Partial<RepairState>, options: { push?: boolean } = {}): void {
    const previousStep = state.step;
    state = { ...state, ...changes };
    save(state);
    render(previousStep, options.push ?? false);
  }

  function dismissResume(): void {
    if (el.resume) el.resume.hidden = true;
  }

  function render(previousStep: RepairStep, push: boolean): void {
    const changed = state.step !== previousStep;
    if (changed) dismissResume();

    for (const [step, section] of el.steps) section.hidden = step !== state.step;

    renderProgress();
    renderCategory();
    renderStep1();
    renderStep2();
    renderSlots();
    renderReview();
    details.refresh();
    for (const node of el.reference) node.textContent = state.reference;

    if (state.reference !== '' && el.whatsappFollowup) {
      const href = whatsappHref(`${copy.repairs.step4.whatsappPrefill} ${state.reference}.`);
      if (href) el.whatsappFollowup.href = href;
    }
    if (state.reference !== '' && el.printLink) {
      el.printLink.href = labelUrl(location.origin, {
        reference: state.reference,
        name: state.contact.name,
        phone: state.contact.phone,
        email: state.contact.email,
        product: state.product,
        fault: state.fault,
        dropoff: formatDropoff(state.slot, repairsData.slots),
      });
    }

    if (push) history.pushState({ step: state.step }, '', repairStepUrl(state.step));

    if (changed) {
      track('step_view', { step: state.step, page: 'repairs' });
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
      const step = Number(button.dataset.progressStep) as RepairStep;
      const reachable = clampRepairStep(step, guard()) === step;
      button.disabled = !reachable;
      button.setAttribute('aria-current', step === current ? 'step' : 'false');
      button.dataset.state = step < current ? 'done' : step === current ? 'current' : 'todo';
    }
  }

  // --- step 1: category + product ------------------------------------------

  // Tracks "Something else" as distinct from "nothing chosen yet" — both
  // leave state.category at null.
  let otherChosen = false;

  function renderCategory(): void {
    for (const button of el.categoryButtons) {
      const isOther = button.dataset.category === 'other';
      const selected = isOther ? otherChosen : button.dataset.category === state.category;
      button.setAttribute('aria-pressed', String(selected));
    }
    if (el.otherNote) el.otherNote.hidden = !otherChosen;
  }

  for (const button of el.categoryButtons) {
    button.addEventListener('click', () => {
      const slug = button.dataset.category;
      otherChosen = slug === 'other';
      track('category_click', { category: slug ?? 'unknown', page: 'repairs' });
      update({ category: otherChosen ? null : (slug ?? null) });
    });
  }

  function renderStep1(): void {
    if (el.product && el.product.value !== state.product) el.product.value = state.product;
  }

  el.product?.addEventListener('input', () => {
    state = { ...state, product: el.product!.value };
    save(state);
  });

  el.step1Continue?.addEventListener('click', () => {
    if (!isStep1Complete(state)) {
      if (el.step1Error) el.step1Error.textContent = 'Tell us what the item is before continuing.';
      track('validation_error', { field: 'product', page: 'repairs' });
      el.product?.focus();
      return;
    }
    if (el.step1Error) el.step1Error.textContent = '';
    // Generated once, on the first meaningful step — the repair-flow
    // equivalent of the enquiry wizard assigning `reference` on the first
    // item added (CLAUDE.md 5.2). Guarded by `|| state.reference`, the same
    // way wizard.ts does it, so pressing Continue twice or navigating back
    // and forward never mints a second reference for the same booking.
    if (state.reference === '') state = { ...state, reference: createReference('REP') };
    goToStep(2, true);
  });

  // --- step 2: fault ---------------------------------------------------------

  function renderStep2(): void {
    if (el.fault && el.fault.value !== state.fault) el.fault.value = state.fault;
  }

  el.fault?.addEventListener('input', () => {
    state = { ...state, fault: el.fault!.value };
    save(state);
  });

  el.step2Continue?.addEventListener('click', () => {
    if (!isStep2Complete(state)) {
      if (el.step2Error) el.step2Error.textContent = 'Tell us what is wrong before continuing.';
      track('validation_error', { field: 'fault', page: 'repairs' });
      el.fault?.focus();
      return;
    }
    if (el.step2Error) el.step2Error.textContent = '';
    goToStep(3, true);
  });

  // --- step 3: details + slot -------------------------------------------------

  const details = initRepairDetails({
    root,
    getContact: () => state.contact,
    setContact: (changes: Partial<RepairContact>) => {
      state = { ...state, contact: { ...state.contact, ...changes } };
      save(state);
      renderSlots();
      renderReview();
    },
    onComplete: () => {
      if (el.slotSection) el.slotSection.hidden = false;
    },
  });

  let openDay: string | null = null;
  const days: SlotDay[] = generateSlotDays({
    now: loadedAt,
    hours: siteData.hours,
    closedDates: closedDates(),
    config: repairsData.slots,
  });

  /*
   * A proper month-grid calendar, not a wrapped row of day chips — the
   * client asked for the familiar layout specifically. `days` above is
   * already the complete, filtered list of *available* dates for the whole
   * booking window; this section is purely calendar arithmetic (slots.ts's
   * pure, non-timezone-aware helpers) that lays every day of the viewed
   * month out as a grid and marks which cells happen to be in that list.
   *
   * Starts on the month of the earliest available date, not today's month:
   * if the window opens on the last day of a month, the calendar should not
   * open on a page that is otherwise entirely unavailable.
   */
  let viewMonth: MonthKey = days[0] ? monthOf(days[0].date) : monthOf(londonDateString(loadedAt));

  function renderCalendarGrid(): void {
    if (!el.slotGrid) return;

    const total = daysInMonth(viewMonth);
    const leadIn = mondayIndexOfFirst(viewMonth);
    const cells: HTMLElement[] = [];

    for (let i = 0; i < leadIn; i += 1) {
      const pad = document.createElement('span');
      pad.setAttribute('aria-hidden', 'true');
      cells.push(pad);
    }

    for (let day = 1; day <= total; day += 1) {
      const dateStr = dateInMonth(viewMonth, day);
      const slotDay = days.find((d) => d.date === dateStr);

      if (slotDay) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.slotDay = dateStr;
        button.setAttribute('aria-label', formatSlotDay(dateStr, slotDay.weekday));
        button.className =
          'flex h-10 w-full items-center justify-center rounded-sm border border-line-strong text-sm text-ink transition-colors hover:border-ink data-[state=selected]:border-accent data-[state=selected]:bg-accent data-[state=selected]:text-accent-contrast';
        button.dataset.state = openDay === dateStr ? 'selected' : 'todo';
        button.textContent = String(day);
        button.addEventListener('click', () => {
          openDay = dateStr;
          renderSlots();
          el.slotTimes?.querySelector('button')?.focus();
        });
        cells.push(button);
      } else {
        // Not a button: closed (a Sunday, a bank holiday), already passed, or
        // outside the booking window. Shown muted rather than left blank, so
        // the grid still reads as a calendar and not a list with gaps.
        const span = document.createElement('span');
        span.className = 'flex h-10 w-full items-center justify-center rounded-sm text-sm text-ink-subtle/50';
        span.textContent = String(day);
        cells.push(span);
      }
    }

    el.slotGrid.replaceChildren(...cells);
    if (el.slotMonthLabel) el.slotMonthLabel.textContent = monthLabel(viewMonth);

    // Navigation is bounded to the window itself — there is nothing to find
    // by paging into a month with zero available dates.
    const earliestMonth = days[0] ? monthOf(days[0].date) : viewMonth;
    const latestMonth = days.at(-1) ? monthOf(days.at(-1)!.date) : viewMonth;
    if (el.slotPrevMonth) el.slotPrevMonth.disabled = compareMonths(viewMonth, earliestMonth) <= 0;
    if (el.slotNextMonth) el.slotNextMonth.disabled = compareMonths(viewMonth, latestMonth) >= 0;
  }

  el.slotPrevMonth?.addEventListener('click', () => {
    viewMonth = shiftMonth(viewMonth, -1);
    renderCalendarGrid();
  });
  el.slotNextMonth?.addEventListener('click', () => {
    viewMonth = shiftMonth(viewMonth, 1);
    renderCalendarGrid();
  });

  function renderSlots(): void {
    if (!el.slotSection) return;
    const contactDone = isRepairContactComplete(state.contact);
    el.slotSection.hidden = !contactDone;
    if (!contactDone) return;

    if (el.slotNone) el.slotNone.hidden = days.length > 0;
    if (days.length === 0) return;

    // Once a slot is chosen, show the summary and hide the picker — "Change"
    // reopens it rather than the picker and the summary competing for space.
    const hasSlot = state.slot !== null;
    if (el.slotChosen) el.slotChosen.hidden = !hasSlot;
    if (el.slotDays) el.slotDays.hidden = hasSlot;
    if (el.slotTimes) el.slotTimes.hidden = hasSlot || openDay === null;

    if (hasSlot && el.slotChosenText && state.slot) {
      const day = days.find((d) => d.date === state.slot?.date);
      const label = day ? formatSlotDay(day.date, day.weekday) : state.slot.date;
      const partLabel =
        state.slot.part === 'morning' ? repairsData.slots.morningLabel : repairsData.slots.afternoonLabel;
      el.slotChosenText.textContent = `${label} — ${partLabel}`;
    }

    if (!hasSlot) renderCalendarGrid();

    if (!hasSlot && openDay && el.slotTimes) {
      const day = days.find((d) => d.date === openDay);
      const dayDate = openDay;
      el.slotTimes.replaceChildren(
        ...(day?.slots ?? []).map((slot) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className =
            'min-h-touch rounded-sm border border-line-strong px-4 text-sm text-ink transition-colors hover:border-ink';
          button.textContent = `${slot.label} (${slot.opens}–${slot.closes})`;
          button.addEventListener('click', () => {
            track('slot_selected', { part: slot.part, page: 'repairs' });
            update({ slot: { date: dayDate, part: slot.part } });
          });
          return button;
        }),
      );
    }
  }

  root.querySelector('[data-slot-change]')?.addEventListener('click', () => {
    openDay = null;
    update({ slot: null });
  });

  // --- review + submit --------------------------------------------------------

  function renderReview(): void {
    if (!el.review) return;
    const complete = isRepairContactComplete(state.contact) && state.slot !== null;
    el.review.hidden = !complete;
    if (!complete) return;

    if (el.reviewList) {
      const slotDay = state.slot ? days.find((d) => d.date === state.slot?.date) : undefined;
      const dropoffLabel = state.slot
        ? `${formatSlotDay(state.slot.date, slotDay?.weekday ?? '')} — ${
            state.slot.part === 'morning' ? repairsData.slots.morningLabel : repairsData.slots.afternoonLabel
          }`
        : '';
      const rows: [string, string][] = [
        ['Item', state.category ? (CATEGORY_NAMES[state.category] ?? state.category) : 'Not specified'],
        ['Description', state.product],
        ['Fault', state.fault],
        ['Drop-off', dropoffLabel],
      ];
      el.reviewList.replaceChildren(
        ...rows.map(([label, value]) => {
          const row = document.createElement('li');
          row.className = 'border-b border-line py-2 last:border-b-0';
          const dt = document.createElement('p');
          dt.className = 'text-sm text-ink-muted';
          dt.textContent = label;
          const dd = document.createElement('p');
          dd.className = 'text-ink';
          dd.textContent = value;
          row.append(dt, dd);
          return row;
        }),
      );
    }
    if (el.consent) el.consent.checked = state.consent;
    if (el.submitButton) el.submitButton.disabled = !state.consent;
  }

  el.consent?.addEventListener('change', () => {
    update({ consent: el.consent!.checked });
  });

  let sending = false;

  function currentPayload(): RepairPayload {
    return buildRepairPayload({
      state,
      session: { ...session, msOnPage: Date.now() - loadedAt },
      categoryNames: CATEGORY_NAMES,
      dropoff: formatDropoff(state.slot, repairsData.slots),
    });
  }

  function setSubmitBusy(busy: boolean): void {
    const submitCopy = copy.repairs.submit;
    if (el.submitButton) {
      el.submitButton.disabled = busy;
      el.submitButton.textContent = busy ? submitCopy.sending : copy.repairs.step3.submit;
    }
    if (el.retryButton) el.retryButton.disabled = busy;
    if (el.submitNote) el.submitNote.textContent = busy ? submitCopy.retrying : '';
  }

  type FailureKind = 'failure' | 'blocked' | 'limit';

  function showFailure(kind: FailureKind, payload: RepairPayload): void {
    if (!el.failure) return;
    el.failure.hidden = false;
    const submitCopy = copy.repairs.submit;

    const heading =
      kind === 'failure'
        ? submitCopy.failureHeading
        : kind === 'blocked'
          ? submitCopy.blockedHeading
          : submitCopy.limitHeading;
    const body =
      kind === 'failure'
        ? submitCopy.failureBody
        : kind === 'blocked'
          ? submitCopy.blockedBody
          : submitCopy.limitBody;

    if (el.failureHeading) el.failureHeading.textContent = heading;
    if (el.failureBody) el.failureBody.textContent = body;

    const href = whatsappHref(repairWhatsappMessage(payload));
    if (el.whatsappFallback) {
      el.whatsappFallback.hidden = href === null;
      if (href) el.whatsappFallback.href = href;
    }
    if (el.whatsappNote) el.whatsappNote.hidden = href === null;
    el.failureHeading?.focus();
  }

  function hideFailure(): void {
    if (el.failure) el.failure.hidden = true;
  }

  function completeRepair(reference: string): void {
    recordSubmission();
    dropFromQueue(reference);
    update({ ...createEmptyRepairState(), reference, submitted: true, step: 4 }, { push: true });
    flush();
  }

  async function submitRepair(): Promise<void> {
    if (sending) return;
    if (!isRepairContactComplete(state.contact) || state.slot === null || !state.consent) return;

    const payload = currentPayload();
    const now = Date.now();

    if (isHoneypotTripped(el.honeypot) || !passesTimeCheck({ now, loadedAt, startedAt: loadedAt })) {
      track('submit_failure', { reason: 'blocked', page: 'repairs' });
      showFailure('blocked', payload);
      return;
    }
    if (!withinRateLimit(readSubmissionTimes(now), now)) {
      track('submit_failure', { reason: 'rate_limited', page: 'repairs' });
      showFailure('limit', payload);
      return;
    }

    sending = true;
    setSubmitBusy(true);
    hideFailure();
    track('submit_attempt', { page: 'repairs' });

    const result = await postEnquiry({ accessKey: ACCESS_KEYS.repair, payload });

    sending = false;
    setSubmitBusy(false);

    if (result.ok) {
      track('submit_success', { page: 'repairs' });
      completeRepair(payload.reference);
      return;
    }

    queueSubmission('repair', payload);
    track('submit_failure', { reason: result.reason, page: 'repairs' });
    showFailure('failure', payload);
  }

  el.submitButton?.addEventListener('click', () => void submitRepair());
  el.retryButton?.addEventListener('click', () => void submitRepair());

  // --- routing ----------------------------------------------------------------

  function goToStep(requested: number, push: boolean): void {
    const clamped = clampRepairStep(requested, guard());
    update({ step: clamped }, { push });
  }

  for (const button of root.querySelectorAll<HTMLElement>('[data-action="repair-go-step"]')) {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      goToStep(Number(button.dataset.step), true);
    });
  }

  window.addEventListener('popstate', () => {
    goToStep(readRepairUrl(location.search).step ?? 1, false);
  });

  root.querySelector('[data-action="resume-continue"]')?.addEventListener('click', () => {
    dismissResume();
  });
  root.querySelector('[data-action="resume-discard"]')?.addEventListener('click', () => {
    discard();
    state = createEmptyRepairState();
    otherChosen = false;
    render(state.step, true);
  });

  persistOnUnload();

  /*
   * Anything queued from a previous visit — a repair, or a quote left over
   * from /order — gets one more try on load (CLAUDE.md 8.7 step 3).
   */
  void retryQueue({
    accessKeys: ACCESS_KEYS,
    onSent: (entry) => {
      if (entry.kind !== 'repair') return;
      const current = currentPayload();
      const unchanged = entry.payload.fault === current.fault && entry.payload.dropoff === current.dropoff;
      if (entry.reference === state.reference && !state.submitted && state.slot !== null && unchanged) {
        completeRepair(entry.reference);
      }
    },
  });

  // --- first paint --------------------------------------------------------

  const requested = readRepairUrl(location.search);
  const category =
    requested.category && Object.hasOwn(CATEGORY_NAMES, requested.category) ? requested.category : null;
  /*
   * Persisted, not just held. wizard.ts hit exactly this bug for
   * `draftBrandSlug`: a bare assignment lives only in memory, so a
   * `?category=tv` link followed by a backgrounded-tab eviction (iOS Safari
   * does this readily) came back with the category forgotten and `?category=`
   * already stripped from the URL by the `replaceState` below — no second
   * chance to recover it. `save()` here, not just the mutation.
   */
  if (category) {
    state = { ...state, category };
    save(state);
  }

  const resumable = (state.product.trim() !== '' || state.fault.trim() !== '') && requested.step === null;
  state = { ...state, step: clampRepairStep(requested.step ?? state.step, guard()) };

  history.replaceState({ step: state.step }, '', repairStepUrl(state.step));
  render(state.step, false);
  track('step_view', { step: state.step, page: 'repairs' });
  trackAbandonment(() => ({ step: state.step, items: state.slot ? 1 : 0, submitted: state.submitted }));

  if (resumable && el.resume) {
    el.resume.hidden = false;
    if (el.resumeCount) el.resumeCount.textContent = '1';
  }

  root.dataset.ready = 'true';
  flush();
}
