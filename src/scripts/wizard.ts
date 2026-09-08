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

  let state: EnquiryState = load() ?? createEmptyState();

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
    for (const node of el.reference) node.textContent = state.reference;

    if (push) {
      history.pushState({ step: state.step }, '', stepUrl(state.step));
    }

    if (changed) {
      // Focus the new heading, and announce separately: a screen reader user
      // who tabs rather than reads needs the step number too (CLAUDE.md 10.1).
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

    el.trayList.replaceChildren(
      ...items.map((item) => {
        const row = document.createElement('li');
        row.className =
          'flex items-start justify-between gap-4 border-b border-line py-3 last:border-b-0';

        const text = document.createElement('div');
        text.className = 'min-w-0';

        const title = document.createElement('p');
        title.className = 'truncate text-ink';
        title.textContent = itemLabel(item);
        text.append(title);

        if (item.brandSlug && brandNames[item.brandSlug]) {
          const brand = document.createElement('p');
          brand.className = 'text-sm text-ink-muted';
          brand.textContent = brandNames[item.brandSlug];
          text.append(brand);
        }

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'min-h-touch shrink-0 px-2 text-sm text-ink-muted underline';
        remove.textContent = 'Remove';
        remove.setAttribute('aria-label', `Remove ${itemLabel(item)}`);
        remove.addEventListener('click', () => removeItem(item.id));

        row.append(text, remove);
        return row;
      }),
    );
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

  function addItem(rawInput: string): void {
    const trimmed = rawInput.trim();
    if (trimmed === '') return;

    const item: EnquiryItem = {
      id: createId(),
      brandSlug: state.draftBrandSlug,
      rawInput: trimmed,
      // Parsing is Phase 4. Until then everything is stored verbatim and
      // typed by the crudest possible test, which is honest about what we know.
      inputType: /^https?:\/\//i.test(trimmed) ? 'url' : 'model',
      parsedModel: null,
      parsedName: null,
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
    // Dropping the last item must also drop them back out of step 3, or they
    // are looking at a details form for an empty enquiry.
    update({ items, step: clampStep(state.step, { ...guard(), itemCount: items.length }) });
  }

  function itemLabel(item: EnquiryItem): string {
    return item.parsedModel ?? item.parsedName ?? item.rawInput;
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
      button.textContent = 'Copied';
    } catch {
      // Clipboard write can be refused outright. The reference is on screen
      // either way, so say so rather than failing silently.
      button.textContent = 'Select and copy above';
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
    update({ draftBrandSlug: card.dataset.slug });
    goToStep(2);
  });

  const addForm = root.querySelector<HTMLFormElement>('[data-add-item]');
  addForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = addForm.querySelector<HTMLInputElement>('input[name="product"]');
    if (!input) return;
    addItem(input.value);
    input.value = '';
    input.focus();
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

  if (resumable && el.resume) {
    el.resume.hidden = false;
    if (el.resumeCount) el.resumeCount.textContent = String(state.items.length);
  }

  flush();
}
