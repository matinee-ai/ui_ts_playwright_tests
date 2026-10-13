import { test, type Locator, type Page } from '@playwright/test';

export type FieldKind = 'email' | 'phone' | 'name' | 'message' | 'checkbox' | 'radio' | 'select' | 'text';

export interface FormField {
  index: number;
  kind: FieldKind;
  required: boolean;
  /** Human-readable description (label / placeholder / name), for error messages. */
  label: string;
}

export interface FormData {
  name: string;
  email: string;
  phone: string;
  message: string;
}

const SUBMIT_TEXT =
  /send|submit|apply|book|enrol|enroll|register|sign ?up|get|request|order|join|continue|отправ|запис|получ|заказ|оставить|зарегистр|надіслати|записатися/i;

/**
 * Drives a lead/contact form without knowing its markup in advance: fields
 * are classified from their type, name, placeholder and label text.
 */
export class FormHelper {
  private constructor(
    readonly root: Locator,
    private readonly id: string,
  ) {}

  /**
   * Finds the first visible form (or form-like block of inputs) inside `scope`
   * that has at least one text/email/tel field.
   */
  static async find(page: Page, scope?: Locator, { timeout = 15_000, newOnly = false } = {}): Promise<FormHelper> {
    const id = `f${Math.random().toString(36).slice(2, 8)}`;
    const scopeHandle = scope ? await scope.elementHandle({ timeout }) : null;
    try {
      await page.waitForFunction(markForm, { id, scope: scopeHandle, newOnly }, { timeout, polling: 500 });
    } catch {
      throw new Error(`No visible form with input fields found on ${page.url()}`);
    }
    return new FormHelper(page.locator(`[data-pw-form="${id}"]`), id);
  }

  /**
   * Remembers the forms visible right now, so `find(page, undefined, { newOnly: true })`
   * returns the one a button opens (modal, expanding section) rather than one already shown.
   */
  static async rememberVisibleForms(page: Page): Promise<void> {
    await page.evaluate(() => {
      document.querySelectorAll('form').forEach((f) => {
        const r = f.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) f.setAttribute('data-pw-seen', '');
      });
    });
  }

  async fields(): Promise<FormField[]> {
    return this.root.evaluate(describeFields, this.id);
  }

  private field(index: number): Locator {
    return this.root.locator(`[data-pw-field="${this.id}-${index}"]`);
  }

  /** Fills every visible field with data matching its kind; ticks consent checkboxes. */
  async fill(data: FormData, overrides: Partial<Record<FieldKind, string>> = {}): Promise<FormField[]> {
    return test.step('Fill the form', async () => {
      const fields = await this.fields();
      const values: Record<FieldKind, string> = {
        email: data.email,
        phone: data.phone,
        name: data.name,
        message: data.message,
        text: data.name,
        checkbox: '',
        radio: '',
        select: '',
        ...overrides,
      };
      const checkedRadioGroups = new Set<string>();
      for (const f of fields) {
        const el = this.field(f.index);
        switch (f.kind) {
          case 'checkbox':
            await tick(el);
            break;
          case 'radio': {
            const group = (await el.evaluate((e) => e.getAttribute('name') ?? e.querySelector('input')?.name)) ?? String(f.index);
            if (!checkedRadioGroups.has(group)) {
              await tick(el);
              checkedRadioGroups.add(group);
            }
            break;
          }
          case 'select': {
            const options = await el.locator('option').evaluateAll((opts) =>
              (opts as HTMLOptionElement[]).filter((o) => o.value && !o.disabled).map((o) => o.value),
            );
            if (options.length) await el.selectOption(options[0]);
            break;
          }
          default:
            await el.click();
            await el.fill('');
            // pressSequentially, not fill: input masks (phone fields) only react to key events.
            await el.pressSequentially(values[f.kind], { delay: 10 });
        }
      }
      return fields;
    });
  }

  async fieldOfKind(kind: FieldKind): Promise<Locator | null> {
    const match = (await this.fields()).find((f) => f.kind === kind);
    return match ? this.field(match.index) : null;
  }

  async submit(): Promise<void> {
    await test.step('Submit the form', async () => {
      const explicit = this.root.locator('button[type="submit"], input[type="submit"]').filter({ visible: true });
      if (await explicit.count()) return explicit.first().click();
      const named = this.root.getByRole('button', { name: SUBMIT_TEXT }).filter({ visible: true });
      if (await named.count()) return named.last().click();
      const anyButton = this.root.locator('button, [role="button"], a[class*="submit" i], a[class*="btn" i]').filter({ visible: true });
      if (await anyButton.count()) return anyButton.last().click();
      const lastInput = this.root.locator('input:visible').last();
      await lastInput.press('Enter');
    });
  }

  /**
   * Validation feedback currently shown: invalid fields (native constraint
   * validation or aria-invalid) and visible error messages.
   */
  async validationErrors(): Promise<string[]> {
    return this.root.evaluate((root) => {
      const shown = (el: Element) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
      };
      const errors: string[] = [];
      root.querySelectorAll('input, textarea, select').forEach((el) => {
        const input = el as HTMLInputElement;
        if (!shown(input) || input.type === 'hidden') return;
        if (input.getAttribute('aria-invalid') === 'true' || (input.willValidate && !input.checkValidity())) {
          errors.push(`invalid: ${input.name || input.placeholder || input.type}${input.validationMessage ? ` (${input.validationMessage})` : ''}`);
        }
      });
      root
        .querySelectorAll('[role="alert"], [aria-live="assertive"], .t-input-error, .error, .invalid-feedback, [class*="error" i], [class*="invalid" i]')
        .forEach((el) => {
          const text = (el.textContent ?? '').trim();
          if (text && shown(el) && !(el instanceof HTMLInputElement)) errors.push(text.slice(0, 120));
        });
      return [...new Set(errors)];
    });
  }
}

/** Checks a checkbox/radio; `el` is the input, or its label when the input itself is hidden. */
async function tick(el: Locator): Promise<void> {
  if (await el.evaluate((e) => e.tagName === 'LABEL')) {
    const checked = await el.evaluate((e) => !!e.querySelector<HTMLInputElement>('input:checked'));
    if (!checked) await el.click();
    return;
  }
  await el.check();
}

// ---------------------------------------------------------------------------
// Browser-side functions (self-contained).
// ---------------------------------------------------------------------------

function markForm({ id, scope, newOnly }: { id: string; scope: Element | null; newOnly: boolean }): boolean {
  if (document.querySelector(`[data-pw-form="${id}"]`)) return true;
  const root = scope ?? document;
  const shown = (el: Element) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const fillable = (el: Element) =>
    [...el.querySelectorAll('input, textarea')].some((i) => {
      const type = (i.getAttribute('type') ?? 'text').toLowerCase();
      return ['text', 'email', 'tel'].includes(type) && shown(i);
    }) || [...el.querySelectorAll('textarea')].some(shown);

  let form: Element | undefined = [...root.querySelectorAll('form')].find(
    (f) => shown(f) && fillable(f) && !(newOnly && f.hasAttribute('data-pw-seen')),
  );
  if (!form && scope && fillable(scope)) form = scope;
  if (!form && !newOnly) {
    // Form-like block without a <form> element: nearest ancestor of the first input that also has a button.
    const input = [...root.querySelectorAll('input[type="email"], input[type="tel"], input[type="text"], textarea')].find(shown);
    let el = input?.parentElement ?? null;
    while (el && !el.querySelector('button, [type="submit"], [role="button"]')) el = el.parentElement;
    if (el) form = el;
  }
  if (!form) return false;
  form.setAttribute('data-pw-form', id);
  return true;
}

function describeFields(root: Element, id: string): FormField[] {
  // Anti-spam trap fields: humans never see them, and filling one gets the submission discarded.
  const isHoneypot = (el: HTMLElement) => {
    if (el.tabIndex === -1 || el.closest('[aria-hidden="true"]')) return true;
    const r = el.getBoundingClientRect();
    if (r.right < 0 || r.bottom < 0 || r.left > window.innerWidth + 2000) return true;
    const name = `${el.getAttribute('name') ?? ''} ${el.id}`.toLowerCase();
    return /\b(website|url|homepage|honeypot|hp|fax|nickname_confirm)\b/.test(name) && !el.hasAttribute('required');
  };
  const shown = (el: Element) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const labelOf = (el: HTMLElement) => {
    const parts = [
      el.getAttribute('aria-label'),
      el.getAttribute('placeholder'),
      el.getAttribute('name'),
      el.id,
      el.getAttribute('autocomplete'),
      el.getAttribute('data-tilda-rule'),
      ...((el as HTMLInputElement).labels ? [...(el as HTMLInputElement).labels!].map((l) => l.textContent) : []),
      el.closest('label')?.textContent,
      el.closest('[class*="input-group" i], [class*="field" i]')?.querySelector('[class*="title" i], [class*="label" i]')?.textContent,
    ];
    return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  };

  const fields: FormField[] = [];
  root.querySelectorAll('input, textarea, select').forEach((node) => {
    const el = node as HTMLInputElement;
    const type = (el.getAttribute('type') ?? (el.tagName === 'TEXTAREA' ? 'textarea' : 'text')).toLowerCase();
    if (['hidden', 'submit', 'button', 'reset', 'image', 'file', 'search', 'password'].includes(type)) return;
    if (isHoneypot(el)) return;
    // Custom checkboxes often hide the real input; still tick it if its label is visible.
    const target = shown(el) ? el : type === 'checkbox' || type === 'radio' ? el.closest('label') ?? null : null;
    if (!target || !shown(target)) return;

    const label = labelOf(el);
    const hint = `${type} ${label}`.toLowerCase();
    let kind: FieldKind;
    if (el.tagName === 'SELECT') kind = 'select';
    else if (type === 'checkbox') kind = 'checkbox';
    else if (type === 'radio') kind = 'radio';
    else if (type === 'email' || /e-?mail|почт/.test(hint)) kind = 'email';
    else if (type === 'tel' || /phone|tel\b|телефон|номер|whatsapp|mobile/.test(hint)) kind = 'phone';
    else if (el.tagName === 'TEXTAREA' || /message|comment|question|сообщ|вопрос|коммент|повідом/.test(hint)) kind = 'message';
    else if (/name|имя|фио|ім.я|прізвище|фамил/.test(hint)) kind = 'name';
    else kind = 'text';

    const index = fields.length;
    target.setAttribute('data-pw-field', `${id}-${index}`);
    fields.push({ index, kind, required: el.required || el.getAttribute('aria-required') === 'true', label: label || type });
  });
  return fields;
}
