import type { Page } from '@playwright/test';
import { SITES } from '../../config/sites.ts';
import { FormHelper } from '../helpers/forms.ts';
import { SitePage } from '../helpers/site-page.ts';

export const ICONS_PATH = '/en/orthodoxy/icons';
/** An icon page that is indexed by search engines; it must stay published. */
export const KNOWN_ICON = { path: '/en/orthodoxy/icons/angel-with-golden-hair', title: 'The Angel with Golden Hair' };

const HELP_HEADING = /someone close to you need help|free 15-minute conversation|нужна помощь|бесплатн\w* 15/i;
const HELP_CTA =
  /get help|request|book|sign up|talk|contact( a)? mentor|free consultation|apply|join|записат|получить помощь|связаться|оставить заявку|консультац/i;

export class SpasSite extends SitePage {
  constructor(page: Page) {
    super(page, SITES.spas);
  }

  async openEnglish(): Promise<void> {
    await this.open('/en');
  }

  async openIcons(): Promise<void> {
    await this.openEnglish();
    await this.openSection(/^icons$|иконы/i, [ICONS_PATH]);
  }

  /**
   * The "Do you or someone close to you need help?" request form. It is either
   * inline next to that heading or opened by the section's call-to-action.
   */
  async openHelpForm(): Promise<FormHelper> {
    const heading = this.page.getByText(HELP_HEADING).filter({ visible: true }).first();
    await heading.scrollIntoViewIfNeeded();

    // Look only in the heading's own block (a few levels up), never the whole page:
    // the footer or another section may have an unrelated form.
    for (let level = 1; level <= 4; level++) {
      const block = heading.locator(`xpath=ancestor::*[${level}]`);
      if (/^(BODY|HTML|MAIN)$/.test(await block.evaluate((el) => el.tagName))) break;

      const inputs = block.locator('form, input[type="tel"], input[type="email"], input[type="text"], textarea').filter({ visible: true });
      if (await inputs.count()) return FormHelper.find(this.page, block);

      const cta = block
        .getByRole('button', { name: HELP_CTA })
        .or(block.getByRole('link', { name: HELP_CTA }))
        .filter({ visible: true })
        .first();
      if (await cta.count()) {
        await FormHelper.rememberVisibleForms(this.page);
        await cta.click();
        return FormHelper.find(this.page, undefined, { newOnly: true });
      }
    }
    throw new Error('No form or call-to-action found next to the "need help?" heading');
  }
}
