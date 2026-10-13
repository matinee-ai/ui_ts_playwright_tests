import { expect, test } from '../../../src/fixtures.ts';
import { FormHelper } from '../../../src/helpers/forms.ts';
import { QaStartingSite } from '../../../src/pages/qastarting.ts';

// Orders are intercepted by formSpy: no payment or order is ever created.
test.describe('QA Starting: checkout', { tag: '@critical' }, () => {
  let site: QaStartingSite;

  test.beforeEach(async ({ page }) => {
    site = new QaStartingSite(page);
  });

  test('an empty order costs $0 and asks to pick a course', async () => {
    await site.open('/checkout');
    await expect(site.orderPanel()).toContainText(/Nothing selected yet/i);
    expect(await site.orderTotal()).toBe(0);
  });

  test('adding courses adds them to the order and the total grows; removing takes them out', async ({ page }) => {
    await site.open('/checkout');
    await site.checkoutCourse('QA BASIC').getByRole('button', { name: /^Add$/ }).click();
    await expect(site.orderPanel()).toContainText('QA BASIC');
    const one = await site.orderTotal();
    expect(one, 'total with one course').toBeGreaterThan(0);

    await site.checkoutCourse('QA ADVANCE').getByRole('button', { name: /^Add$/ }).click();
    await expect(site.orderPanel()).toContainText('QA ADVANCE');
    expect(await site.orderTotal(), 'total with two courses').toBeGreaterThan(one);

    // The same button (or a remove control in the order) takes a course out again.
    const basic = site.checkoutCourse('QA BASIC').getByRole('button').first();
    await basic.click();
    await expect(site.orderPanel()).not.toContainText('QA BASIC');
    await site.checkoutCourse('QA ADVANCE').getByRole('button').first().click();
    await expect(site.orderPanel()).toContainText(/Nothing selected yet/i);
    expect(await site.orderTotal()).toBe(0);
    await expect(page).toHaveURL(/\/checkout/);
  });

  test('a course link preselects that course', async () => {
    await site.open('/checkout?course=qa-automation');
    await expect(site.orderPanel()).toContainText('QA AUTOMATION');
    expect(await site.orderTotal()).toBeGreaterThan(0);
  });

  test('the bundle link preselects the three core courses at the bundle price', async () => {
    await site.open('/checkout?bundle=core');
    for (const course of ['QA BASIC', 'QA ADVANCE', 'QA AUTOMATION']) await expect(site.orderPanel()).toContainText(course);
    expect(await site.orderTotal(), 'bundle total').toBe(2653);
  });

  test('the payment method changes the pay button', async ({ page }) => {
    await site.open('/checkout?course=qa-basic');
    const payButton = site.payButton();
    await expect(payButton).toHaveText(/Pay online/i);
    await page.getByRole('button', { name: /Pay with Crypto/ }).click();
    await expect(payButton, 'crypto payment').toHaveText(/crypto/i);
    await expect(page.getByRole('button', { name: /USDT TRC-20/ }), 'crypto networks offered').toBeVisible();
    await page.getByRole('button', { name: /Zelle \/ PayPal/ }).click();
    await expect(payButton, 'Zelle / PayPal').not.toHaveText(/crypto/i);
  });

  test('the order total follows the chosen plan and matches the published prices', async ({ page }) => {
    await site.open('/');
    const published = await site.pricingCards();
    const basic = published.find((c) => c.course === 'QA BASIC')!.prices;
    const advance = published.find((c) => c.course === 'QA ADVANCE')!.prices;

    await site.open('/checkout?course=qa-basic');
    for (const [plan, price] of [['Starter', basic.starter], ['Unlimited', basic.unlimited], ['Standard', basic.standard]] as const) {
      await test.step(`QA BASIC · ${plan}`, async () => {
        await site.planButton('QA BASIC', plan).click();
        await expect(site.orderPanel()).toContainText(`QA BASIC · ${plan}`);
        await expect.poll(() => site.orderTotal(), { message: `total for ${plan}` }).toBe(price);
      });
    }
    await site.checkoutCourse('QA ADVANCE').getByRole('button', { name: /^Add$/ }).click();
    await site.planButton('QA ADVANCE', 'Starter').click();
    await expect.poll(() => site.orderTotal(), { message: 'QA BASIC Standard + QA ADVANCE Starter' }).toBe(basic.standard! + advance.starter!);
    await expect(page).toHaveURL(/\/checkout/);
  });

  test('your details are required before paying', async ({ page, formSpy }) => {
    await site.open('/checkout?course=qa-basic');
    const form = await FormHelper.find(page, site.orderPanel());
    formSpy.arm();
    await form.submit();
    await formSpy.expectNoSubmission();
    expect(await form.validationErrors(), 'name and contact flagged').not.toEqual([]);
  });

  test('an order is sent with the chosen course and your contact', async ({ page, formSpy }) => {
    await site.open('/checkout?course=qa-basic');
    await page.getByRole('button', { name: /Zelle \/ PayPal/ }).click();
    const form = await FormHelper.find(page, site.orderPanel());
    await form.fill(formSpy.data, { text: formSpy.data.email });
    formSpy.arm();
    await form.submit();
    const sent = await formSpy.expectSubmission([formSpy.marker]);
    expect(sent.body.toLowerCase(), 'order mentions the course').toMatch(/qa[-_ ]?basic/);
  });
});
